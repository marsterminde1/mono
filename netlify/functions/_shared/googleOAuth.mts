import { createPublicKey, verify as verifySignature, type JsonWebKey as CryptoJsonWebKey } from 'node:crypto';

interface GoogleClaims {
  iss?: string;
  aud?: string | string[];
  azp?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  exp?: number;
  iat?: number;
  nonce?: string;
}

interface GoogleJwk extends CryptoJsonWebKey {
  kid: string;
  alg?: string;
  use?: string;
}

interface GoogleJwkSet {
  keys: GoogleJwk[];
}

export interface GoogleIdentity {
  subject: string;
  email: string;
  displayName: string;
}

let cachedKeys: { expiresAt: number; keys: GoogleJwk[] } | null = null;

const decodeJson = <T,>(segment: string): T => JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;

async function getSigningKey(kid: string, fetcher: typeof fetch, now: number): Promise<GoogleJwk> {
  if (!cachedKeys || cachedKeys.expiresAt <= now || !cachedKeys.keys.some(key => key.kid === kid)) {
    const response = await fetcher('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Unable to fetch Google signing keys');
    const keySet = await response.json() as GoogleJwkSet;
    if (!Array.isArray(keySet.keys)) throw new Error('Invalid Google signing key response');
    const maxAge = response.headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1];
    cachedKeys = { keys: keySet.keys, expiresAt: now + Math.min(Number(maxAge || 3600), 3600) * 1000 };
  }
  const key = cachedKeys.keys.find(candidate => candidate.kid === kid && candidate.alg === 'RS256' && candidate.use === 'sig');
  if (!key) throw new Error('Google signing key not found');
  return key;
}

export async function verifyGoogleIdToken(
  token: string,
  audience: string,
  expectedNonce: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<GoogleIdentity> {
  if (token.length > 12_000) throw new Error('Google ID token is too large');
  const segments = token.split('.');
  if (segments.length !== 3) throw new Error('Malformed Google ID token');

  const header = decodeJson<{ alg?: string; kid?: string }>(segments[0]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Unsupported Google ID token signature');
  const key = await getSigningKey(header.kid, fetcher, now);
  const signedContent = Buffer.from(`${segments[0]}.${segments[1]}`);
  const signature = Buffer.from(segments[2], 'base64url');
  if (!verifySignature('RSA-SHA256', signedContent, createPublicKey({ key, format: 'jwk' }), signature)) {
    throw new Error('Invalid Google ID token signature');
  }

  const claims = decodeJson<GoogleClaims>(segments[1]);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(audience) || (claims.azp !== undefined && claims.azp !== audience) || (audiences.length > 1 && claims.azp !== audience)) {
    throw new Error('Invalid Google ID token audience');
  }
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss || '')) throw new Error('Invalid Google ID token issuer');
  if (typeof claims.exp !== 'number' || claims.exp <= now / 1000) throw new Error('Google ID token has expired');
  if (typeof claims.iat !== 'number' || claims.iat > now / 1000 + 300 || claims.iat < now / 1000 - 3600) {
    throw new Error('Invalid Google ID token issue time');
  }
  if (claims.nonce !== expectedNonce) throw new Error('Invalid Google ID token nonce');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new Error('Invalid Google account identifier');
  if (typeof claims.email !== 'string' || !claims.email || claims.email.length > 320 || claims.email_verified !== true) {
    throw new Error('Google email is missing or unverified');
  }

  return {
    subject: claims.sub,
    email: claims.email,
    displayName: typeof claims.name === 'string' ? claims.name.slice(0, 100) : claims.email,
  };
}
