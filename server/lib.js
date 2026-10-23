import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
const e = process.env;
export const pool = new pg.Pool({ connectionString: e.DATABASE_URL, max: 5 });
export const q = (s, p) => pool.query(s, p).then(r => r.rows);
export async function migrate() {
  await pool.query('create table if not exists _migrations(name text primary key)');
  for (const f of fs.readdirSync('database').filter(f => f.endsWith('.sql')).sort()) {
    if ((await q('select 1 from _migrations where name=$1', [f])).length) continue;
    const c = await pool.connect();
    try { await c.query('begin'); await c.query(fs.readFileSync(path.join('database', f), 'utf8')); await c.query('insert into _migrations values($1)', [f]); await c.query('commit'); console.log('applied', f); }
    catch (x) { await c.query('rollback'); throw x; } finally { c.release(); }
  }
}
const key = crypto.createHash('sha256').update(e.SESSION_SECRET || '').digest();
export const enc = t => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); const d = Buffer.concat([c.update(t, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), d]).toString('base64'); };
export const dec = s => { const b = Buffer.from(s, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); };
export const setting = async k => (await q('select value from settings where key=$1', [k]))[0]?.value;

const r2 = e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET_NAME;
const s3 = r2 && new S3Client({ region: 'auto', endpoint: e.R2_ENDPOINT || `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY } });
const B = e.R2_BUCKET_NAME, local = k => path.join('tmp-uploads', k.replace(/[^\w.-]/g, '_'));
export const storage = {
  mode: r2 ? 'r2' : 'local', local,
  upload: async (k, body, size, contentType) => {
    if (r2) return s3.send(new PutObjectCommand({ Bucket: B, Key: k, Body: body, ContentLength: size, ContentType: contentType }));
    fs.mkdirSync('tmp-uploads', { recursive: true });
    return pipeline(body, fs.createWriteStream(local(k)));
  },
  size: async k => r2 ? (await s3.send(new HeadObjectCommand({ Bucket: B, Key: k }))).ContentLength : fs.statSync(local(k)).size,
  url: async k => r2 ? getSignedUrl(s3, new GetObjectCommand({ Bucket: B, Key: k }), { expiresIn: 3600 }) : `${e.APP_URL}/api/media/${encodeURIComponent(k)}`,
  del: async k => { if (r2) await s3.send(new DeleteObjectCommand({ Bucket: B, Key: k })); else fs.rmSync(local(k), { force: true }); }
};

const V = e.META_GRAPH_API_VERSION || 'v26.0', GH = 'https://graph.instagram.com';
const redactMetaError = message => String(message)
  .replace(/(access_token|client_secret|code)=([^&\s"]+)/gi, '$1=[redacted]')
  .replace(/\b(IG|EA)[A-Za-z0-9]{40,}\b/g, '[redacted]')
  .replace(e.META_APP_SECRET ? new RegExp(e.META_APP_SECRET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : /$^/, '[redacted]');
export const sanitizeMetaResponse = value => {
  if (Array.isArray(value)) return value.map(sanitizeMetaResponse);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /token|secret|authorization.?code/i.test(key) ? '[redacted]' : sanitizeMetaResponse(item)
  ]));
  return typeof value === 'string' ? redactMetaError(value) : value;
};
export async function auditInstagram({ userId, accountId = null, postId = null, stage, status = null, response }) {
  const safeResponse = sanitizeMetaResponse(response);
  try {
    await q('insert into audit(admin_id,action,detail) values(null,$1,$2)', [
      `instagram.api.${stage}`,
      { userId, accountId, postId, status, response: safeResponse }
    ]);
  } catch (error) {
    error.auditFailure = true;
    throw error;
  }
}
async function oauthRequest(url, options, stage, context) {
  let response;
  try { response = await fetch(url, options); }
  catch (error) {
    if (context?.userId) await auditInstagram({ ...context, stage, response: { networkError: redactMetaError(error.message) } });
    const failure = new Error(`Network error during ${stage}: ${redactMetaError(error.message)}`);
    failure.stage = stage;
    throw failure;
  }
  const data = await response.json().catch(() => ({}));
  if (context?.userId) await auditInstagram({ ...context, stage, status: response.status, response: data });
  if (!response.ok || data.error || data.error_message) {
    const failure = new Error(redactMetaError(data.error?.message || data.error_message || `Instagram API error ${response.status}`));
    failure.stage = stage;
    failure.metaCode = data.error?.code;
    throw failure;
  }
  return data;
}
async function j(r, context) {
  const d = await r.json().catch(() => ({}));
  if (context?.userId) await auditInstagram({ ...context, status: r.status, response: d });
  if (!r.ok || d.error || d.error_message) {
    const er = new Error(redactMetaError(d.error?.message || d.error_message || `Instagram API error ${r.status}`));
    er.auth = d.error?.code === 190; er.permanent = er.auth || [10, 200, 100].includes(d.error?.code);
    throw er;
  }
  return d;
}
async function instagramRequest(request, context) {
  try {
    return await j(await request, context);
  } catch (error) {
    if (context?.userId && !error.auditFailure && !error.auth && error.name === 'TypeError') {
      await auditInstagram({ ...context, response: { networkError: redactMetaError(error.message) } });
    }
    throw error;
  }
}
export const IG = {
  authUrl: s => 'https://www.instagram.com/oauth/authorize?' + new URLSearchParams({ client_id: e.META_APP_ID, redirect_uri: e.META_REDIRECT_URI, response_type: 'code', scope: e.META_SCOPES || 'instagram_business_basic,instagram_business_content_publish', state: s }),
  async connect(code, context) {
    const firstResponse = await oauthRequest('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: e.META_APP_ID, client_secret: e.META_APP_SECRET, grant_type: 'authorization_code', redirect_uri: e.META_REDIRECT_URI, code: code.replace(/#_$/, '') })
    }, 'token_exchange', context);
    const first = Array.isArray(firstResponse.data) ? firstResponse.data[0] : firstResponse;
    if (!first?.access_token) {
      const error = new Error('Instagram did not return an access token.');
      error.stage = 'token_exchange';
      throw error;
    }

    let token = first.access_token;
    let expiresIn = first.expires_in;
    try {
      const longLived = await oauthRequest(`${GH}/access_token?` + new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: e.META_APP_SECRET, access_token: token }), { method: 'GET' }, 'long_lived_exchange', context);
      if (longLived.access_token) {
        token = longLived.access_token;
        expiresIn = longLived.expires_in ?? expiresIn;
      }
    } catch (error) {
      if (error.auditFailure) throw error;
      console.warn(`Instagram long-lived token exchange failed (${error.stage}): ${error.message}. Continuing with the short-lived token.`);
    }

    const meResponse = await oauthRequest(`${GH}/${V}/me?` + new URLSearchParams({ fields: 'user_id,username,profile_picture_url', access_token: token }), { method: 'GET' }, 'account_lookup', context);
    const me = Array.isArray(meResponse.data) ? meResponse.data[0] : meResponse;
    const id = me?.user_id || first.user_id;
    if (!id) {
      const error = new Error('Instagram account lookup did not return a user ID.');
      error.stage = 'account_lookup';
      throw error;
    }
    return { token, expires: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null, id: String(id), username: me?.username, picture: me?.profile_picture_url };
  },
  post: async (p, tok, body, context) => instagramRequest(fetch(`${GH}/${V}/${p}`, { method: 'POST', body: new URLSearchParams({ ...body, access_token: tok }) }), { ...context, stage: context?.stage || 'publish' }),
  get: async (p, tok, qs, context) => instagramRequest(fetch(`${GH}/${V}/${p}?` + new URLSearchParams({ ...qs, access_token: tok })), { ...context, stage: context?.stage || 'status' })
};
