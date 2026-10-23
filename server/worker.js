import { q, dec, IG, storage, setting } from './lib.js';
import { canPublish, getEffectivePlan } from './policy.js';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let running = false;
async function waitForContainer(id, token, context) {
  for (let i = 0; ; i++) {
    const status = (await IG.get(id, token, { fields: 'status_code' }, context)).status_code;
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') {
      const error = new Error(`Instagram could not process the media (${status})`);
      error.permanent = true;
      throw error;
    }
    if (i >= 30) throw new Error('Instagram is still processing the media');
    await sleep(5000);
  }
}
async function publish(p) {
  const [a] = await q('select * from ig_accounts where id=$1', [p.account_id]);
  const media = await q(`select v.* from post_media pm join videos v on v.id=pm.media_id where pm.post_id=$1 order by pm.position`, [p.id]);
  if (!media.length && p.video_id) media.push(...await q('select * from videos where id=$1', [p.video_id]));
  if (!media.length) throw new Error('Post has no media attached');
  const tok = dec(a.token_enc), context = { userId: p.user_id, accountId: a.id, postId: p.id };
  let items = p.container_items || [];
  if (p.post_type === 'CAROUSEL' && items.length < media.length) {
    for (const asset of media.slice(items.length)) {
      const body = asset.media_type === 'IMAGE'
        ? { image_url: await storage.url(asset.key), is_carousel_item: 'true' }
        : { media_type: 'VIDEO', video_url: await storage.url(asset.key), is_carousel_item: 'true' };
      const child = await IG.post(`${a.ig_user_id}/media`, tok, body, { ...context, stage: 'carousel_item_create' });
      if (!child.id) throw new Error('Instagram did not return a carousel item ID');
      items.push(child.id);
      await q('update posts set container_items=$1 where id=$2', [items, p.id]);
    }
  }
  if (p.post_type === 'CAROUSEL') {
    for (const [index, asset] of media.entries()) {
      if (asset.media_type === 'VIDEO') await waitForContainer(items[index], tok, { ...context, stage: 'carousel_item_status' });
    }
  }
  let c = p.container;
  if (!c) { // Persist the container id so retries do not create a second parent container.
    let body;
    if (p.post_type === 'CAROUSEL') {
      body = { media_type: 'CAROUSEL', children: items.join(','), caption: p.caption || '' };
    } else if (p.post_type === 'IMAGE') {
      body = { image_url: await storage.url(media[0].key), caption: p.caption || '' };
    } else {
      body = { media_type: 'REELS', video_url: await storage.url(media[0].key), caption: p.caption || '' };
    }
    c = (await IG.post(`${a.ig_user_id}/media`, tok, body, { ...context, stage: 'media_container_create' })).id;
    if (!c) throw new Error('Instagram did not return a media container ID');
    await q('update posts set container=$1 where id=$2', [c, p.id]);
  }
  if (p.post_type === 'REEL') await waitForContainer(c, tok, { ...context, stage: 'media_container_status' });
  const published = await IG.post(`${a.ig_user_id}/media_publish`, tok, { creation_id: c }, { ...context, stage: 'media_publish' });
  if (!published.id) throw new Error('Instagram did not return a published media ID');
  return published.id;
}
async function run(p) {
  try {
    const [u] = await q('select * from users where id=$1', [p.user_id]);
    const [plan] = await q('select * from plans where id=$1', [u.plan_id]);
    const [overrides] = await q('select * from user_plan_overrides where user_id=$1', [u.id]);
    const [a] = await q('select * from ig_accounts where id=$1', [p.account_id]);
    const why = canPublish(u, getEffectivePlan(u, plan, overrides || {}), (await setting('paused')) === 'true') || (!a.enabled && 'Instagram account is disabled') || (a.status !== 'CONNECTED' && 'Instagram account needs reconnecting');
    if (why) return q("update posts set status='BLOCKED',error=$2,updated_at=now() where id=$1", [p.id, why]);
    const mediaId = await publish(p);
    await q("update posts set status='PUBLISHED',media_id=$2,error=null,updated_at=now() where id=$1", [p.id, mediaId]);
  } catch (x) {
    if (x.auth) await q("update ig_accounts set status='REAUTH_REQUIRED',last_error=$2 where id=$1", [p.account_id, x.message]);
    const final = x.permanent || p.attempts >= 3;
    await q('update posts set status=$2,error=$3,next_try=now()+($4||\' minutes\')::interval,updated_at=now() where id=$1', [p.id, final ? 'FAILED' : 'SCHEDULED', x.message, String(p.attempts * 5)]);
  }
}
export async function tick() {
  if (running) return { skipped: true }; running = true;
  try {
    await q("update posts set status='SCHEDULED',updated_at=now() where status='PROCESSING' and updated_at<now()-interval '10 minutes'"); // restart recovery
    const jobs = await q(`update posts set status='PROCESSING',attempts=attempts+1,updated_at=now() where id in (
      select id from posts where status='SCHEDULED' and run_at<=now() and (next_try is null or next_try<=now()) order by run_at limit 3 for update skip locked) returning *`);
    await Promise.all(jobs.map(run));
    const days = Number(await setting('retention_days')) || 1;
    const old = await q(`select v.* from videos v where v.status<>'DELETED'
      and not exists(select 1 from posts p where (p.video_id=v.id or exists(select 1 from post_media pm where pm.post_id=p.id and pm.media_id=v.id)) and p.status in('SCHEDULED','PROCESSING'))
      and greatest(v.created_at,(select coalesce(max(p.updated_at),'epoch') from posts p where p.video_id=v.id or exists(select 1 from post_media pm where pm.post_id=p.id and pm.media_id=v.id)))<now()-($1||' days')::interval limit 20`, [String(days)]);
    for (const v of old) try { await storage.del(v.key); await q("update videos set status='DELETED' where id=$1", [v.id]); } catch (x) { console.error('cleanup failed', v.id, x.message); }
    return { processed: jobs.length, cleaned: old.length };
  } finally { running = false; }
}
