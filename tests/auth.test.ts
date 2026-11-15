import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import handler from '../netlify/functions/auth.mts';

const guestCookie = 'a'.repeat(64);
const originalSiteUrl = process.env.PUBLIC_SITE_URL;
const originalClientId = process.env.GOOGLE_CLIENT_ID;
const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

test('unauthenticated profile checks do not require OAuth or database configuration', async () => {
  const response = await handler(new Request('https://arena.example/.netlify/functions/auth?flow=profile'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test('account mutations reject cross-origin requests before requiring an account session', async () => {
  const response = await handler(new Request('https://arena.example/.netlify/functions/auth', {
    method: 'POST',
    headers: { origin: 'https://other.example', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'logout' }),
  }));
  assert.equal(response.status, 403);
});

test('Google OAuth start carries only a short-lived hashed guest link through the cross-site callback', async () => {
  process.env.PUBLIC_SITE_URL = 'https://arena.example';
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  try {
    const response = await handler(new Request('https://arena.example/.netlify/functions/auth?flow=google-start', {
      headers: { cookie: `monopoly_session=${guestCookie}` },
    }));
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.origin, 'https://accounts.google.com');
    assert.equal(location.searchParams.get('redirect_uri'), 'https://arena.example/.netlify/functions/auth?flow=google-callback');
    const cookies = response.headers.get('set-cookie') || '';
    assert.match(cookies, /arena_oauth=.*SameSite=Lax; Max-Age=600; Secure/);
    assert.ok(cookies.includes(`arena_guest_link=${createHash('sha256').update(guestCookie).digest('hex')}`));
  } finally {
    if (originalSiteUrl === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = originalSiteUrl;
    if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});

test('Google OAuth callback rejects mismatched state and clears one-time cookies', async () => {
  process.env.PUBLIC_SITE_URL = 'https://arena.example';
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  try {
    const response = await handler(new Request('https://arena.example/.netlify/functions/auth?flow=google-callback&code=unused&state=wrong', {
      headers: { cookie: `arena_oauth=${'b'.repeat(64)}.${'c'.repeat(64)}.verifier; arena_guest_link=${'d'.repeat(64)}` },
    }));
    assert.equal(response.status, 400);
    const cookies = response.headers.get('set-cookie') || '';
    assert.ok(cookies.includes('arena_oauth='));
    assert.ok(cookies.includes('arena_guest_link='));
    assert.ok(cookies.includes('Max-Age=0'));
  } finally {
    if (originalSiteUrl === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = originalSiteUrl;
    if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});
