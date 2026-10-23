import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Transform } from 'node:stream';
import { q, pool, migrate, enc, storage, IG, setting } from './lib.js';
import { canPublish, getEffectivePlan } from './policy.js';
import { tick } from './worker.js';
const e = process.env, prod = e.NODE_ENV === 'production';
const instagramConfigured = !!(e.META_APP_ID && e.META_APP_SECRET && e.META_REDIRECT_URI);
const missing = ['DATABASE_URL', 'SESSION_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'].filter(k => !String(e[k] || '').trim());
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
  process.exit(1);
}
if (!instagramConfigured) console.warn('! Instagram Login is not configured: set META_APP_ID, META_APP_SECRET, and META_REDIRECT_URI.');
if (storage.mode === 'local') console.warn('! R2 not configured: using local ./tmp-uploads (Instagram cannot fetch these unless APP_URL is public).');
function hash(p, s = crypto.randomBytes(16)) { return new Promise((ok, no) => crypto.scrypt(p, s, 64, (er, k) => er ? no(er) : ok(s.toString('hex') + ':' + k.toString('hex')))); }
try { await migrate(); } catch (x) { console.error('Database/migration error:', x.message); process.exit(1); }
const adminEmail = String(e.ADMIN_EMAIL).trim().toLowerCase();
const adminPassword = String(e.ADMIN_PASSWORD).trim();
const [bootstrapUser] = await q('select * from users where email=$1', [adminEmail]);
if (!bootstrapUser) {
  await q("insert into users(email,name,pass_hash,role,plan_id,pay_status) values($1,'Admin',$2,'ADMIN',(select id from plans where name='Paid'),'PAID')", [adminEmail, await hash(adminPassword)]);
  console.log('Admin user created');
} else if (bootstrapUser.role !== 'ADMIN') {
  throw new Error(`Bootstrap admin email '${adminEmail}' is already in use by a non-admin account. Update the account role manually or change ADMIN_EMAIL.`);
}
const verify = async (p, st) => { const h = await hash(p, Buffer.from(st.split(':')[0], 'hex')); return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(st)); };
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const app = express(); app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }), cookieParser());
const h = f => (req, res, next) => f(req, res, next).catch(next);
const bad = (res, m, c = 400) => res.status(c).json({ error: m });
app.get('/healthz', (_, res) => res.json({ ok: true }));
app.post('/internal/tick', h(async (req, res) => { if (!e.TICK_SECRET || req.get('x-tick-secret') !== e.TICK_SECRET) return bad(res, 'Forbidden', 403); res.json(await tick()); }));
app.use('/api', (req, res, n) => req.method !== 'GET' && !req.get('x-requested-with') ? bad(res, 'CSRF check failed', 403) : n()); // + SameSite=Lax cookies
const authLimit = rateLimit({ windowMs: 15 * 60e3, limit: 30 });
async function startSession(res, uid) {
  const t = crypto.randomBytes(32).toString('hex');
  await q("insert into sessions values($1,$2,now()+interval '14 days')", [sha(t), uid]);
  await q('update users set last_login=now() where id=$1', [uid]);
  res.cookie('sid', t, { httpOnly: true, sameSite: 'lax', secure: prod, maxAge: 14 * 864e5 });
}
const pub = u => { const { pass_hash, ...r } = u; return r; };
app.get('/api/public/plans', h(async (_, res) => {
  const plans = await q(`select id,name,description,price_inr,max_accounts,monthly_posts,max_mb,storage_limit,monthly_upload_quota,horizon_days,retention_days,publish_ok,display_order,features
    from plans where active=true and public_visible=true order by display_order,id`);
  res.json(plans.map(p => ({ ...p, features: Array.isArray(p.features) ? p.features : [] })));
}));
app.post('/api/auth/signup', authLimit, h(async (req, res) => {
  const { email, password, name, username, phone, planId, plan_id } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedName = String(name || username || '').trim().slice(0, 80);
  const normalizedUsername = String(username || normalizedName || normalizedEmail.split('@')[0]).trim().slice(0, 50);
  const normalizedPhone = String(phone || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return bad(res, 'Enter a valid email');
  if (!normalizedUsername || normalizedUsername.length < 3) return bad(res, 'Username is required and must be at least 3 characters');
  if (normalizedPhone && !/^\+?[0-9()\-\s]{7,}$/.test(normalizedPhone)) return bad(res, 'Enter a valid contact number');
  if ((password || '').length < 8) return bad(res, 'Password must be at least 8 characters');
  const existsEmail = await q('select 1 from users where email=$1', [normalizedEmail]);
  const existsUsername = await q('select 1 from users where username=$1', [normalizedUsername.toLowerCase()]);
  if (existsEmail.length) return bad(res, 'That email is already registered', 409);
  if (existsUsername.length) return bad(res, 'That username is already taken', 409);
  const plan = Number(planId ?? plan_id ?? null);
  const [selectedPlan] = plan ? await q('select * from plans where id=$1 and active=true and public_visible=true', [plan]) : await q("select * from plans where name='Free' and active=true and public_visible=true");
  if (!selectedPlan) return bad(res, 'Selected plan is not available');
  try {
    const [u] = await q(`insert into users(email,name,username,phone,pass_hash,plan_id,pay_status,publish_enabled) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [normalizedEmail, normalizedName, normalizedUsername.toLowerCase(), normalizedPhone || null, await hash(password), selectedPlan.id, selectedPlan.price_inr > 0 ? 'PAYMENT_PENDING' : 'PAID', Boolean(selectedPlan.publish_ok)]);
    if (selectedPlan.price_inr > 0) {
      await q('insert into payments(user_id,plan_id,amount,currency,status,reference,note,created_at) values($1,$2,$3,$4,$5,$6,$7,now())', [u.id, selectedPlan.id, Number(selectedPlan.price_inr || 0), 'INR', 'PENDING', `signup-${u.id.slice(0, 8)}`, 'Pending manual payment',]);
    }
    await startSession(res, u.id); res.json({ ok: true, plan: selectedPlan });
  } catch (x) { if (x.code === '23505') return bad(res, 'That email or username is already registered', 409); throw x; }
}));
app.post('/api/auth/login', authLimit, h(async (req, res) => {
  const [u] = await q('select * from users where email=$1', [String(req.body?.email || '').toLowerCase()]);
  if (!u || !(await verify(String(req.body?.password || ''), u.pass_hash))) return bad(res, 'Invalid email or password', 401);
  if (!u.active) return bad(res, 'This account has been disabled', 403);
  await startSession(res, u.id); res.json({ ok: true });
}));
app.post('/api/auth/logout', h(async (req, res) => { if (req.cookies.sid) await q('delete from sessions where token_hash=$1', [sha(req.cookies.sid)]); res.clearCookie('sid'); res.json({ ok: true }); }));
app.get('/api/media/:key', h(async (req, res) => { // unguessable key; used by Instagram in local mode
  const [v] = await q("select content_type from videos where key=$1 and status<>'DELETED'", [req.params.key]);
  if (!v || storage.mode !== 'local') return bad(res, 'Not found', 404);
  res.type(v.content_type);
  res.sendFile(storage.local(req.params.key), { root: process.cwd() });
}));
const auth = async (req, res, next) => {
  try {
    const t = req.cookies.sid;
    const [u] = t ? await q('select u.* from sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now()', [sha(t)]) : [];
    if (!u) return bad(res, 'Please log in', 401);
    if (!u.active) return bad(res, 'This account has been disabled', 403);
    req.user = u; next();
  } catch (x) { next(x); }
};
const userOverridesOf = async (user) => {
  if (!user?.id) return {};
  try {
    const [override] = await q('select * from user_plan_overrides where user_id=$1', [user.id]);
    return override || {};
  } catch {
    return {};
  }
};
const effectivePlanOf = async (user) => {
  const plan = await planOf(user);
  if (!plan) return null;
  return getEffectivePlan(user, plan, await userOverridesOf(user));
};
app.get('/api/auth/me', async (req, res) => {
  const t = req.cookies.sid;
  if (!t) return bad(res, 'Please log in', 401);
  const [u] = await q('select u.* from sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now()', [sha(t)]);
  if (!u) return bad(res, 'Please log in', 401);
  const plan = await effectivePlanOf(u);
  res.json({ user: pub(u), plan, storageMode: storage.mode, metaConfigured: instagramConfigured });
});
app.patch('/api/auth/me', auth, h(async (req, res) => {
  const { username, phone } = req.body || {};
  const nextUsername = typeof username === 'string' ? username.trim() : null;
  const nextPhone = typeof phone === 'string' ? phone.trim() : null;
  if (nextUsername && nextUsername.length < 3) return bad(res, 'Username must be at least 3 characters');
  if (nextPhone && !/^\+?[0-9()\-\s]{7,}$/.test(nextPhone)) return bad(res, 'Enter a valid contact number');
  if (nextUsername) {
    const [dupe] = await q('select id from users where lower(username)=$1 and id<>$2', [nextUsername.toLowerCase(), req.user.id]);
    if (dupe) return bad(res, 'That username is already taken', 409);
  }
  await q('update users set username=$2, phone=$3 where id=$1', [req.user.id, nextUsername || req.user.username, nextPhone || req.user.phone]);
  res.json({ ok: true });
}));
const admin = (req, res, next) => req.user.role === 'ADMIN' ? next() : bad(res, 'Admins only', 403);
const planOf = async u => (await q('select * from plans where id=$1', [u.plan_id]))[0];
app.get('/api/me', auth, h(async (req, res) => {
  const plan = await effectivePlanOf(req.user), why = canPublish(req.user, plan, (await setting('paused')) === 'true');
  res.json({ user: pub(req.user), plan, publishBlockedReason: why, storageMode: storage.mode, metaConfigured: instagramConfigured });
}));
app.get('/api/dashboard', auth, h(async (req, res) => {
  const id = req.user.id;
  const [c] = await q(`select (select count(*) from ig_accounts where user_id=$1 and status<>'DISCONNECTED') accounts,(select count(*) from ig_accounts where user_id=$1 and enabled) enabled,
    (select count(*) from videos where user_id=$1 and status<>'DELETED') videos,(select coalesce(sum(size),0) from videos where user_id=$1 and status='READY') bytes,
    (select count(*) from posts where user_id=$1 and status='SCHEDULED') scheduled,(select count(*) from posts where user_id=$1 and status='PUBLISHED') published,
    (select count(*) from posts where user_id=$1 and status in('FAILED','BLOCKED')) failed`, [id]);
  res.json(c);
}));
// ---- Instagram accounts
app.get('/api/accounts', auth, h(async (req, res) => res.json(await q('select id,ig_user_id,username,picture,status,enabled,token_expires,last_error,(select count(*) from posts p where p.account_id=a.id and p.status=\'SCHEDULED\')::int scheduled from ig_accounts a where user_id=$1 order by created_at', [req.user.id]))));
app.get('/api/ig/connect', auth, h(async (req, res) => {
  if (!instagramConfigured) return res.redirect('/?error=' + encodeURIComponent('Instagram Login is not configured'));
  const s = crypto.randomBytes(16).toString('hex');
  await q('delete from instagram_oauth_states where expires_at <= now()');
  await q('insert into instagram_oauth_states(state_hash,user_id,expires_at) values($1,$2,now()+interval \'10 minutes\')', [sha(s), req.user.id]);
  res.redirect(IG.authUrl(s));
}));
app.get('/api/ig/callback', h(async (req, res) => {
  const fail = m => res.redirect('/?error=' + encodeURIComponent(m));
  if (typeof req.query.state !== 'string' || !/^[a-f0-9]{32}$/.test(req.query.state)) return fail('Invalid OAuth state');
  const [consumedState] = await q('delete from instagram_oauth_states where state_hash=$1 and expires_at>now() returning user_id', [sha(req.query.state)]);
  if (!consumedState) return fail('Invalid OAuth state');
  if (req.query.error) {
    console.warn('Instagram OAuth authorization was denied:', String(req.query.error).slice(0, 100));
    return fail('Instagram authorization was cancelled or denied.');
  }
  if (typeof req.query.code !== 'string' || !req.query.code) return fail('Instagram did not return an authorization code.');
  try {
    const [user] = await q('select * from users where id=$1 and active=true', [consumedState.user_id]);
    if (!user) return fail('Your account is unavailable. Please log in and try again.');
    const a = await IG.connect(req.query.code, { userId: user.id, stage: 'oauth' }), plan = await effectivePlanOf(user);
    const [ex] = await q('select 1 from ig_accounts where user_id=$1 and ig_user_id=$2', [user.id, a.id]);
    const [{ n }] = await q("select count(*)::int n from ig_accounts where user_id=$1 and status<>'DISCONNECTED'", [user.id]);
    if (!ex && n >= plan.max_accounts) return fail(`Your plan allows ${plan.max_accounts} connected account(s)`);
    await q(`insert into ig_accounts(user_id,ig_user_id,username,picture,token_enc,token_expires) values($1,$2,$3,$4,$5,$6)
      on conflict(user_id,ig_user_id) do update set username=$3,picture=$4,token_enc=$5,token_expires=$6,status='CONNECTED',last_error=null`, [user.id, a.id, a.username, a.picture, enc(a.token), a.expires]);
    res.redirect('/?connected=1');
  } catch (x) {
    console.error(`Instagram OAuth callback failed (${x.stage || 'callback'}):`, x.message);
    fail('Could not complete Instagram authorization. Please try again.');
  }
}));
app.post('/api/accounts/:id/enabled', auth, h(async (req, res) => { const r = await q('update ig_accounts set enabled=$3 where id=$1 and user_id=$2 returning id', [req.params.id, req.user.id, !!req.body.enabled]); r.length ? res.json({ ok: true }) : bad(res, 'Not found', 404); }));
app.delete('/api/accounts/:id', auth, h(async (req, res) => { // disconnect: drop token, cancel pending jobs, keep history
  const r = await q("update ig_accounts set status='DISCONNECTED',token_enc=null where id=$1 and user_id=$2 returning id", [req.params.id, req.user.id]);
  if (!r.length) return bad(res, 'Not found', 404);
  await q("update posts set status='CANCELLED',error='Account disconnected',updated_at=now() where account_id=$1 and status='SCHEDULED'", [req.params.id]); res.json({ ok: true });
}));
// ---- Videos
app.get('/api/videos', auth, h(async (req, res) => res.json(await q("select id,filename,size,status,media_type,content_type,created_at from videos where user_id=$1 and status<>'DELETED' order by created_at desc limit 100", [req.user.id]))));
app.post('/api/videos', auth, h(async (req, res) => {
  const { filename, size } = req.body || {}, plan = await effectivePlanOf(req.user);
  const extension = String(filename || '').toLowerCase().match(/\.(mp4|mov|jpe?g)$/)?.[1];
  if (!extension) return bad(res, 'Choose an MP4 or MOV video, or a JPEG image');
  if (!(size > 0) || size > plan.max_mb * 1048576) return bad(res, `File must be under ${plan.max_mb} MB on your plan`);
  const image = extension === 'jpg' || extension === 'jpeg';
  const mediaType = image ? 'IMAGE' : 'VIDEO';
  const contentType = image ? 'image/jpeg' : extension === 'mov' ? 'video/quicktime' : 'video/mp4';
  const key = `${req.user.id}/${crypto.randomBytes(16).toString('hex')}.${extension}`;
  const [v] = await q('insert into videos(user_id,key,filename,size,media_type,content_type) values($1,$2,$3,$4,$5,$6) returning id', [req.user.id, key, String(filename).slice(0, 200), size, mediaType, contentType]);
  res.json({ id: v.id, url: `/api/videos/${v.id}/upload`, contentType });
}));
app.put('/api/videos/:id/upload', auth, h(async (req, res) => {
  const [v] = await q('select * from videos where id=$1 and user_id=$2', [req.params.id, req.user.id]);
  if (!v || v.status !== 'UPLOADING') return bad(res, 'Video upload not found or already completed', 404);
  const plan = await effectivePlanOf(req.user), expectedSize = Number(v.size);
  if (!plan || plan.max_mb <= 0) return bad(res, 'Your plan does not allow video uploads', 403);
  if (expectedSize > plan.max_mb * 1048576) return bad(res, `File must be under ${plan.max_mb} MB on your plan`, 413);
  let received = 0;
  const body = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > expectedSize) {
        const error = new Error('Uploaded file is larger than the selected file.');
        error.code = 'UPLOAD_SIZE_MISMATCH';
        callback(error);
      } else callback(null, chunk);
    },
    flush(callback) {
      if (received !== expectedSize) {
        const error = new Error('Uploaded file size does not match the selected file.');
        error.code = 'UPLOAD_SIZE_MISMATCH';
        callback(error);
      } else callback();
    }
  });
  try {
    await storage.upload(v.key, req.pipe(body), expectedSize, v.content_type);
  } catch (error) {
    try { await storage.del(v.key); }
    catch (cleanupError) { console.error('Failed to clean up incomplete video upload:', cleanupError.message); }
    if (error.code === 'UPLOAD_SIZE_MISMATCH') return bad(res, error.message, 400);
    console.error('Video storage upload failed:', error.message);
    return bad(res, 'Could not save video to storage. Please retry.', 502);
  }
  res.json({ ok: true });
}));
app.post('/api/videos/:id/complete', auth, h(async (req, res) => {
  const [v] = await q('select * from videos where id=$1 and user_id=$2', [req.params.id, req.user.id]), plan = await effectivePlanOf(req.user);
  if (!v) return bad(res, 'Not found', 404);
  let size; try { size = Number(await storage.size(v.key)); } catch { return bad(res, 'Upload not found in storage'); }
  if (size > plan.max_mb * 1048576) { await storage.del(v.key); await q("update videos set status='REJECTED' where id=$1", [v.id]); return bad(res, 'File exceeds plan limit'); }
  await q("update videos set status='READY',size=$2 where id=$1", [v.id, size]); res.json({ ok: true });
}));
app.delete('/api/videos/:id', auth, h(async (req, res) => {
  const [v] = await q('select * from videos where id=$1 and user_id=$2', [req.params.id, req.user.id]);
  if (!v) return bad(res, 'Not found', 404);
  if ((await q("select 1 from posts p where (p.video_id=$1 or exists(select 1 from post_media pm where pm.post_id=p.id and pm.media_id=$1)) and p.status in('SCHEDULED','PROCESSING')", [v.id])).length) return bad(res, 'This media has pending posts. Cancel them first.', 409);
  await storage.del(v.key); await q("update videos set status='DELETED' where id=$1", [v.id]); res.json({ ok: true });
}));
// ---- Posts
app.get('/api/posts', auth, h(async (req, res) => res.json(await q(`select p.id,p.run_at,p.status,p.error,p.attempts,p.caption,p.post_type,a.username,
  coalesce(v.filename,(select string_agg(vm.filename, ', ' order by pm.position) from post_media pm join videos vm on vm.id=pm.media_id where pm.post_id=p.id)) filename
  from posts p join ig_accounts a on a.id=p.account_id left join videos v on v.id=p.video_id where p.user_id=$1 order by p.run_at desc limit 200`, [req.user.id]))));
app.post('/api/posts', auth, h(async (req, res) => {
  const { videoId, mediaIds, postType = 'REEL', accountIds, times, caption } = req.body || {}, plan = await effectivePlanOf(req.user);
  const why = canPublish(req.user, plan, (await setting('paused')) === 'true'); if (why) return bad(res, why, 403);
  if (!Array.isArray(accountIds) || !accountIds.length || !Array.isArray(times) || !times.length) return bad(res, 'Choose media, at least one account and one time');
  if (!['REEL', 'IMAGE', 'CAROUSEL'].includes(postType)) return bad(res, 'Choose a supported post type');
  const selectedMediaIds = Array.isArray(mediaIds) ? mediaIds : videoId ? [videoId] : [];
  if (!selectedMediaIds.length || new Set(selectedMediaIds).size !== selectedMediaIds.length) return bad(res, 'Choose media for your post');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (selectedMediaIds.some(id => typeof id !== 'string' || !uuid.test(id)) || accountIds.some(id => typeof id !== 'string' || !uuid.test(id))) return bad(res, 'Some selected media or accounts are invalid');
  if ((postType === 'CAROUSEL' && (selectedMediaIds.length < 2 || selectedMediaIds.length > 10)) ||
    (postType !== 'CAROUSEL' && selectedMediaIds.length !== 1)) return bad(res, 'Carousel posts need 2–10 items; Reels and image posts need one item');
  if (accountIds.length * times.length > 200) return bad(res, 'Too many jobs in one request (max 200)');
  const selectedMedia = await q("select * from videos where id=any($1::uuid[]) and user_id=$2 and status='READY'", [selectedMediaIds, req.user.id]);
  const mediaById = new Map(selectedMedia.map(media => [media.id, media]));
  if (selectedMedia.length !== selectedMediaIds.length) return bad(res, 'Some selected media is unavailable or not yours');
  const orderedMedia = selectedMediaIds.map(id => mediaById.get(id));
  if (postType === 'REEL' && orderedMedia[0].media_type !== 'VIDEO') return bad(res, 'Reels require a video');
  if (postType === 'IMAGE' && orderedMedia[0].media_type !== 'IMAGE') return bad(res, 'Image posts require a JPEG image');
  const accs = await q("select id from ig_accounts where id=any($1::uuid[]) and user_id=$2 and enabled and status='CONNECTED'", [accountIds, req.user.id]);
  if (accs.length !== new Set(accountIds).size) return bad(res, 'Some accounts are disabled, disconnected, or not yours');
  const when = times.map(t => (t === 'now' ? new Date() : new Date(t))); const max = Date.now() + plan.horizon_days * 864e5;
  if (when.some(d => isNaN(d) || d > max || d < new Date(Date.now() - 60e3))) return bad(res, `Times must be in the future and within ${plan.horizon_days} days`);
  const [{ n }] = await q("select count(*)::int n from posts where user_id=$1 and status<>'CANCELLED' and created_at>=date_trunc('month',now())", [req.user.id]);
  if (n + accs.length * when.length > plan.monthly_posts) return bad(res, `This would exceed your monthly allowance of ${plan.monthly_posts} posts (${n} used)`, 403);
  const fingerprint = crypto.createHash('sha256').update(selectedMediaIds.join(':')).digest('hex');
  const client = await pool.connect();
  let made = 0;
  try {
    await client.query('begin');
    for (const a of accs) for (const d of when) {
      const created = await client.query(`insert into posts(user_id,video_id,account_id,caption,run_at,post_type,media_fingerprint)
        values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning id`,
      [req.user.id, postType === 'CAROUSEL' ? null : orderedMedia[0].id, a.id, String(caption || '').slice(0, 2200), d, postType, fingerprint]);
      if (!created.rows.length) continue;
      for (const [position, media] of orderedMedia.entries()) {
        await client.query('insert into post_media(post_id,media_id,position) values($1,$2,$3)', [created.rows[0].id, media.id, position]);
      }
      made += 1;
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  res.json({ created: made, duplicatesSkipped: accs.length * when.length - made });
  if (when.some(d => d <= new Date())) tick().catch(console.error);
}));
app.post('/api/posts/:id/cancel', auth, h(async (req, res) => { const r = await q("update posts set status='CANCELLED',updated_at=now() where id=$1 and user_id=$2 and status in('SCHEDULED','BLOCKED','FAILED') returning id", [req.params.id, req.user.id]); r.length ? res.json({ ok: true }) : bad(res, 'Cannot cancel this post', 409); }));
app.post('/api/posts/:id/retry', auth, h(async (req, res) => { const r = await q("update posts set status='SCHEDULED',attempts=0,next_try=null,error=null,updated_at=now() where id=$1 and user_id=$2 and status in('FAILED','BLOCKED') returning id", [req.params.id, req.user.id]); r.length ? res.json({ ok: true }) : bad(res, 'Cannot retry this post', 409); }));
// ---- Admin
const adm = [auth, admin], audit = (req, action, detail) => q('insert into audit(admin_id,action,detail) values($1,$2,$3)', [req.user.id, action, detail]);
app.get('/api/admin/users', ...adm, h(async (req, res) => res.json(await q(`select u.id,u.email,u.name,u.role,u.active,u.plan_id,u.pay_status,u.pay_expires,u.publish_enabled,u.created_at,
  (select count(*) from ig_accounts a where a.user_id=u.id and a.status<>'DISCONNECTED')::int accounts,(select count(*) from posts p where p.user_id=u.id and p.status='SCHEDULED')::int scheduled
  from users u where $1='' or u.email ilike '%'||$1||'%' order by u.created_at desc limit 100`, [String(req.query.search || '')]))));
app.get('/api/admin/users/:id/config', ...adm, h(async (req, res) => {
  const [user] = await q(`select u.id,u.email,u.plan_id,p.name as plan_name,p.max_accounts as plan_max_accounts,p.monthly_posts as plan_monthly_posts,p.max_mb as plan_max_mb,p.horizon_days as plan_horizon_days,p.publish_ok as plan_publish_ok,
    o.max_accounts as override_max_accounts,o.monthly_posts as override_monthly_posts,o.max_mb as override_max_mb,o.horizon_days as override_horizon_days,o.publish as override_publish
    from users u
    left join plans p on p.id=u.plan_id
    left join user_plan_overrides o on o.user_id=u.id
    where u.id=$1`, [req.params.id]);
  if (!user) return bad(res, 'Not found', 404);
  const planDefaults = {
    max_accounts: Number(user.plan_max_accounts || 0),
    monthly_posts: Number(user.plan_monthly_posts || 0),
    max_mb: Number(user.plan_max_mb || 0),
    horizon_days: Number(user.plan_horizon_days || 0),
    publish: Boolean(user.plan_publish_ok ?? false),
  };
  const config = {
    max_accounts: Number(user.override_max_accounts ?? user.plan_max_accounts ?? 0),
    monthly_posts: Number(user.override_monthly_posts ?? user.plan_monthly_posts ?? 0),
    max_mb: Number(user.override_max_mb ?? user.plan_max_mb ?? 0),
    horizon_days: Number(user.override_horizon_days ?? user.plan_horizon_days ?? 0),
    publish: user.override_publish ?? user.plan_publish_ok ?? false,
  };
  res.json({ userId: user.id, planId: user.plan_id, planName: user.plan_name, planDefaults, config });
}));
app.patch('/api/admin/users/:id', ...adm, h(async (req, res) => {
  const ok = { active: 'boolean', publish_enabled: 'boolean', pay_status: 'string', plan_id: 'number', pay_expires: 'string' }, sets = [], vals = [req.params.id];
  for (const [k, t] of Object.entries(ok)) if (k in req.body && (typeof req.body[k] === t || req.body[k] === null)) { vals.push(req.body[k]); sets.push(`${k}=$${vals.length}`); }
  const overrideFields = { max_accounts: 'number', monthly_posts: 'number', max_mb: 'number', horizon_days: 'number', publish: 'boolean', storage_limit: 'number', monthly_upload_quota: 'number', retention_days: 'number' };
  const overrideEntries = Object.entries(overrideFields).filter(([k]) => k in req.body && (typeof req.body[k] === 'number' || typeof req.body[k] === 'boolean' || req.body[k] === null));
  if (!sets.length && !overrideEntries.length) return bad(res, 'Nothing to update');
  if (req.params.id === req.user.id && req.body.active === false) return bad(res, 'You cannot disable yourself');
  try { if (sets.length) { const r = await q(`update users set ${sets.join(',')} where id=$1 returning id`, vals); if (!r.length) return bad(res, 'Not found', 404); } } catch (x) { return bad(res, 'Invalid value'); }
  if (overrideEntries.length) {
    const overrideCols = [];
    const overrideVals = [req.params.id];
    for (const [k, t] of overrideEntries) {
      if (typeof req.body[k] === t || req.body[k] === null) {
        overrideCols.push(k);
        overrideVals.push(req.body[k]);
      }
    }
    if (overrideCols.length) {
      const columnList = overrideCols.join(',');
      const updateList = overrideCols.map((key, idx) => `${key}=$${idx + 2}`).join(',');
      await q(`insert into user_plan_overrides(user_id, ${columnList}) values($1, ${overrideCols.map((_, idx) => `$${idx + 2}`).join(',')})
        on conflict(user_id) do update set ${updateList}, updated_at=now()`, overrideVals);
    }
  }
  if (req.body.active === false) await q('delete from sessions where user_id=$1', [req.params.id]);
  await audit(req, 'user.update', { target: req.params.id, ...req.body }); res.json({ ok: true });
}));
app.get('/api/admin/plans', ...adm, h(async (_, res) => res.json(await q('select * from plans order by id'))));
app.put('/api/admin/plans/:id', ...adm, h(async (req, res) => {
  const b = req.body, n = k => Number.isInteger(b[k]) && b[k] >= 0;
  if (!['max_accounts', 'monthly_posts', 'max_mb', 'horizon_days'].every(n)) return bad(res, 'Limits must be non-negative integers');
  await q('update plans set max_accounts=$2,monthly_posts=$3,max_mb=$4,horizon_days=$5,publish_ok=$6 where id=$1', [req.params.id, b.max_accounts, b.monthly_posts, b.max_mb, b.horizon_days, !!b.publish_ok]);
  await audit(req, 'plan.update', { id: req.params.id, ...b }); res.json({ ok: true });
}));
app.get('/api/admin/settings', ...adm, h(async (_, res) => res.json(Object.fromEntries((await q('select * from settings')).map(r => [r.key, r.value])))));
app.post('/api/admin/settings', ...adm, h(async (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) if (['paused', 'retention_days'].includes(k)) await q('insert into settings values($1,$2) on conflict(key) do update set value=$2', [k, String(v)]);
  await audit(req, 'settings.update', req.body); res.json({ ok: true });
}));
app.get('/api/admin/overview', ...adm, h(async (_, res) => res.json({
  stats: (await q(`select (select count(*) from users)::int users,(select count(*) from ig_accounts where status='CONNECTED')::int accounts,(select count(*) from ig_accounts where status='REAUTH_REQUIRED')::int reauth,
    (select coalesce(sum(size),0) from videos where status='READY')::bigint bytes,(select count(*) from posts where status='SCHEDULED')::int scheduled,(select count(*) from posts where status='PUBLISHED')::int published`))[0],
  failed: await q("select p.id,p.error,p.run_at,u.email from posts p join users u on u.id=p.user_id where p.status='FAILED' order by p.updated_at desc limit 20"),
  audit: await q(`select a.action,a.detail,a.at,u.email as user_email,ig.username as account_username
    from audit a left join users u on u.id::text=a.detail->>'userId'
    left join ig_accounts ig on ig.id::text=a.detail->>'accountId'
    order by a.id desc limit 50`) })));
app.use('/api', (req, res) => bad(res, 'Not found', 404));
app.use((err, req, res, _n) => {
  console.error(err.message);
  bad(res, 'Server error', 500);
});
if (fs.existsSync('client/dist')) { app.use(express.static('client/dist')); app.get('*', (_, res) => res.sendFile('index.html', { root: 'client/dist' })); }
const port = e.PORT || 3001, srv = app.listen(port, () => console.log(`API on :${port}  (open ${prod ? e.APP_URL : 'http://localhost:5173'})`));
const timer = setInterval(() => tick().catch(x => console.error('tick', x.message)), (Number(e.WORKER_INTERVAL_SECONDS) || 15) * 1000);
const stop = () => { clearInterval(timer); srv.close(() => pool.end().then(() => process.exit(0))); }; process.on('SIGTERM', stop); process.on('SIGINT', stop);
