import test from 'node:test';
import assert from 'node:assert/strict';

process.env.META_APP_ID = 'test-app-id';
process.env.META_APP_SECRET = 'test-app-secret';
process.env.META_REDIRECT_URI = 'https://example.com/api/ig/callback';
process.env.META_GRAPH_API_VERSION = 'v21.0';

const { IG, sanitizeMetaResponse } = await import('../server/lib.js');
const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
});

test('Instagram Login uses configured callback and resolves a long-lived token', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (requests.length === 1) return jsonResponse({ data: [{ access_token: 'short-token', expires_in: 3600, user_id: '123' }] });
    if (requests.length === 2) return jsonResponse({ access_token: 'long-token', expires_in: 5184000 });
    return jsonResponse({ user_id: '123', username: 'creator' });
  };

  try {
    const authorization = new URL(IG.authUrl('state-value'));
    assert.equal(authorization.origin, 'https://www.instagram.com');
    assert.equal(authorization.searchParams.get('redirect_uri'), 'https://example.com/api/ig/callback');
    assert.equal(authorization.searchParams.get('client_id'), 'test-app-id');
    assert.equal(authorization.searchParams.get('scope'), 'instagram_business_basic,instagram_business_content_publish');

    const account = await IG.connect('authorization-code#_');
    assert.equal(account.token, 'long-token');
    assert.equal(account.id, '123');
    assert.equal(account.username, 'creator');
    assert.equal(account.picture, undefined);
    assert.ok(account.expires instanceof Date);

    const tokenRequest = new URLSearchParams(requests[0].options.body);
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(new URL(requests[0].url).href, 'https://api.instagram.com/oauth/access_token');
    assert.equal(tokenRequest.get('grant_type'), 'authorization_code');
    assert.equal(tokenRequest.get('redirect_uri'), 'https://example.com/api/ig/callback');
    assert.equal(tokenRequest.get('code'), 'authorization-code');
    assert.equal(new URL(requests[1].url).origin, 'https://graph.instagram.com');
    assert.equal(new URL(requests[1].url).pathname, '/access_token');
    assert.deepEqual(requests[1].options, {});
    assert.equal(new Request(requests[1].url, requests[1].options).method, 'GET');
    assert.equal(new URL(requests[1].url).searchParams.get('grant_type'), 'ig_exchange_token');
    assert.equal(new URL(requests[1].url).searchParams.get('client_secret'), 'test-app-secret');
    assert.equal(new URL(requests[2].url).origin, 'https://graph.instagram.com');
    assert.equal(new URL(requests[2].url).pathname, '/v21.0/me');
    assert.equal(new URL(requests[2].url).searchParams.get('fields'), 'user_id,username');
    assert.deepEqual(requests[2].options, {});
    assert.equal(new Request(requests[2].url, requests[2].options).method, 'GET');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Instagram Login can continue with a short-lived token if exchange fails', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    if (requestCount === 1) return jsonResponse({ access_token: 'short-token', expires_in: 3600, user_id: '456' });
    if (requestCount === 2) return jsonResponse({ error: { message: 'Temporary failure' } }, 400);
    return jsonResponse({ user_id: '456', username: 'creator' });
  };
  console.warn = () => {};

  try {
    const account = await IG.connect('authorization-code');
    assert.equal(account.token, 'short-token');
    assert.equal(account.id, '456');
    assert.equal(requestCount, 3);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test('Instagram audit responses redact credentials and retain useful error codes', () => {
  assert.deepEqual(sanitizeMetaResponse({
    access_token: 'private-token',
    client_secret: 'private-secret',
    error: { code: 190, message: 'Invalid access_token=private-token' },
    id: 'media-123'
  }), {
    access_token: '[redacted]',
    client_secret: '[redacted]',
    error: { code: 190, message: 'Invalid access_token=[redacted]' },
    id: 'media-123'
  });
});
