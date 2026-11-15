import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { verifyGoogleIdToken } from '../netlify/functions/_shared/googleOAuth.mts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const now = Date.now();

function token(overrides: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com',
    aud: 'client-id',
    sub: 'google-subject',
    email: 'player@example.test',
    email_verified: true,
    name: 'Arena Player',
    nonce: 'expected-nonce',
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 600,
    ...overrides,
  })).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(privateKey).toString('base64url')}`;
}

const fetchKeys: typeof fetch = async () => Response.json({ keys: [jwk] }, { headers: { 'Cache-Control': 'max-age=300' } });

test('Google ID token verification returns only verified identity claims', async () => {
  assert.deepEqual(await verifyGoogleIdToken(token(), 'client-id', 'expected-nonce', fetchKeys, now), {
    subject: 'google-subject',
    email: 'player@example.test',
    displayName: 'Arena Player',
  });
});

test('Google ID token verification rejects a mismatched audience, nonce, expiry, or unverified email', async () => {
  await assert.rejects(verifyGoogleIdToken(token({ aud: 'other-client' }), 'client-id', 'expected-nonce', fetchKeys, now), /audience/);
  await assert.rejects(verifyGoogleIdToken(token({ nonce: 'wrong' }), 'client-id', 'expected-nonce', fetchKeys, now), /nonce/);
  await assert.rejects(verifyGoogleIdToken(token({ exp: Math.floor(now / 1000) - 1 }), 'client-id', 'expected-nonce', fetchKeys, now), /expired/);
  await assert.rejects(verifyGoogleIdToken(token({ email_verified: false }), 'client-id', 'expected-nonce', fetchKeys, now), /unverified/);
});

test('Google ID token verification rejects invalid signatures and issuers', async () => {
  const [header, claims, signature] = token().split('.');
  const changedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  const invalidSignature = `${header}.${claims}.${changedSignature}`;
  await assert.rejects(verifyGoogleIdToken(invalidSignature, 'client-id', 'expected-nonce', fetchKeys, now), /signature/);
  await assert.rejects(verifyGoogleIdToken(token({ iss: 'https://attacker.example' }), 'client-id', 'expected-nonce', fetchKeys, now), /issuer/);
});
