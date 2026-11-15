import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { database } from '../../db/index.js';
import { accountSessions, accounts, scores, subscriptions } from '../../db/schema.js';
import { effectivePlan } from '../../src/lib/plans.js';
import { verifyGoogleIdToken } from './_shared/googleOAuth.mjs';

const SESSION_DAYS = 30;
const SESSION_COOKIE = 'arena_session';
const GUEST_COOKIE = 'monopoly_session';
const GUEST_LINK_COOKIE = 'arena_guest_link';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const readCookie = (request: Request, name: string) => request.headers.get('cookie')?.match(new RegExp(`(?:^|; )${name}=([a-f0-9]{64})(?:;|$)`))?.[1] || null;
const secureCookie = (request: Request) => new URL(request.url).protocol === 'https:' ? '; Secure' : '';
const cookie = (request: Request, name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookie(request)}`;
const clearCookie = (request: Request, name: string) => cookie(request, name, '', 0);

function getPublicBaseUrl(request: Request): URL | null {
  const configured = process.env.PUBLIC_SITE_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname)) return url;
    } catch { return null; }
    return null;
  }
  const requestUrl = new URL(request.url);
  return ['localhost', '127.0.0.1'].includes(requestUrl.hostname) ? new URL(requestUrl.origin) : null;
}

function json(body: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(body, { status, headers: responseHeaders });
}

async function loadAccount(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const db = database();
  const [session] = await db.select().from(accountSessions).where(eq(accountSessions.tokenHash, hash(token))).limit(1);
  if (!session || session.expiresAt <= new Date()) return null;
  const [account] = await db.select().from(accounts).where(eq(accounts.id, session.accountId)).limit(1);
  if (!account) return null;
  const planRows = await db.select({
    plan: subscriptions.plan,
    status: subscriptions.status,
    currentPeriodEnd: subscriptions.currentPeriodEnd,
  }).from(subscriptions).where(eq(subscriptions.accountId, account.id));
  return { account, plan: effectivePlan(planRows) };
}

function redirect(request: Request, destination: URL, cookies: string[] = []) {
  const headers = new Headers({ Location: destination.toString(), 'Cache-Control': 'no-store' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}

async function startGoogleLogin(request: Request, baseUrl: URL) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return json({ success: false, error: 'Google-Anmeldung ist noch nicht konfiguriert.' }, 503);
  const guestCookie = readCookie(request, GUEST_COOKIE);
  if (!guestCookie) return json({ success: false, error: 'Die Gast-Sitzung fehlt. Bitte lade die Seite neu und versuche es erneut.' }, 400);

  const state = randomBytes(32).toString('hex');
  const nonce = randomBytes(32).toString('hex');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const callback = new URL('/.netlify/functions/auth?flow=google-callback', baseUrl);
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback.toString(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return redirect(request, authorization, [
    cookie(request, 'arena_oauth', `${state}.${nonce}.${verifier}`, 600),
    cookie(request, GUEST_LINK_COOKIE, hash(guestCookie), 600),
  ]);
}

async function finishGoogleLogin(request: Request, baseUrl: URL) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callback = new URL('/.netlify/functions/auth?flow=google-callback', baseUrl);
  const requestUrl = new URL(request.url);
  const stateCookie = request.headers.get('cookie')?.match(/(?:^|; )arena_oauth=([a-f0-9]{64}\.[a-f0-9]{64}\.[A-Za-z0-9_-]+)(?:;|$)/)?.[1];
  const [savedState, nonce, verifier] = stateCookie?.split('.') || [];
  const clearOAuthCookie = clearCookie(request, 'arena_oauth');
  const clearGuestLinkCookie = clearCookie(request, GUEST_LINK_COOKIE);
  const fail = (status: number, message: string) => {
    const headers = new Headers();
    headers.append('Set-Cookie', clearOAuthCookie);
    headers.append('Set-Cookie', clearGuestLinkCookie);
    return json({ success: false, error: message }, status, headers);
  };

  if (!clientId || !clientSecret) return fail(503, 'Google-Anmeldung ist noch nicht konfiguriert.');
  if (requestUrl.searchParams.has('error')) return fail(400, 'Die Google-Anmeldung wurde abgebrochen.');
  const code = requestUrl.searchParams.get('code');
  if (!code || !savedState || requestUrl.searchParams.get('state') !== savedState) return fail(400, 'Die Anmeldung ist abgelaufen. Bitte erneut versuchen.');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callback.toString(),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  if (!tokenResponse.ok) return fail(401, 'Google konnte die Anmeldung nicht bestätigen.');
  const tokenData = await tokenResponse.json() as { id_token?: string };
  if (!tokenData.id_token) return fail(401, 'Google hat kein gültiges Anmeldetoken zurückgegeben.');
  const identity = await verifyGoogleIdToken(tokenData.id_token, clientId, nonce);

  const guestPlayerId = request.headers.get('cookie')?.match(/(?:^|; )arena_guest_link=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!guestPlayerId) return fail(400, 'Die Gast-Verknüpfung ist abgelaufen. Bitte erneut anmelden.');
  const db = database();
  let [account] = await db.select().from(accounts).where(eq(accounts.googleSub, identity.subject)).limit(1);
  if (!account) {
    const newAccount = {
      id: randomUUID(),
      googleSub: identity.subject,
      email: identity.email,
      displayName: identity.displayName,
      playerId: guestPlayerId,
    };
    await db.insert(accounts).values(newAccount).onConflictDoNothing();
    [account] = await db.select().from(accounts).where(eq(accounts.googleSub, identity.subject)).limit(1);
    if (!account) return fail(500, 'Das Konto konnte nicht erstellt werden.');
  } else {
    await db.update(accounts).set({
      email: identity.email,
      displayName: identity.displayName,
      updatedAt: new Date(),
    }).where(eq(accounts.id, account.id));
  }

  const sessionToken = randomBytes(32).toString('hex');
  await db.insert(accountSessions).values({
    tokenHash: hash(sessionToken),
    accountId: account.id,
    playerId: account.playerId,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
  });
  const destination = new URL('/', baseUrl);
  destination.searchParams.set('account', 'connected');
  return redirect(request, destination, [
    clearOAuthCookie,
    clearGuestLinkCookie,
    cookie(request, SESSION_COOKIE, sessionToken, SESSION_DAYS * 24 * 60 * 60),
  ]);
}

export default async (request: Request) => {
  const url = new URL(request.url);
  const flow = url.searchParams.get('flow');

  try {
    if (request.method === 'GET' && ['google-start', 'google-callback'].includes(flow || '')) {
      const baseUrl = getPublicBaseUrl(request);
      if (!baseUrl) return json({ success: false, error: 'PUBLIC_SITE_URL muss auf eine HTTPS-Adresse gesetzt sein.' }, 503);
      return flow === 'google-start'
        ? await startGoogleLogin(request, baseUrl)
        : await finishGoogleLogin(request, baseUrl);
    }
    if (request.method === 'GET' && flow === 'profile') {
      const result = await loadAccount(request);
      if (!result) return json({ authenticated: false });
      return json({
        authenticated: true,
        account: {
          email: result.account.email,
          displayName: result.account.displayName,
          ageStatus: result.account.ageStatus,
          plan: result.plan,
        },
      });
    }
    if (request.method === 'GET' && flow === 'export') {
      const result = await loadAccount(request);
      if (!result) return json({ success: false, error: 'Bitte melde dich zuerst an.' }, 401);
      const [scoreRows, subscriptionRows] = await Promise.all([
        database().select().from(scores).where(eq(scores.id, result.account.playerId)),
        database().select({
          provider: subscriptions.provider,
          plan: subscriptions.plan,
          status: subscriptions.status,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
        }).from(subscriptions).where(eq(subscriptions.accountId, result.account.id)),
      ]);
      return json({
        exportedAt: new Date().toISOString(),
        account: {
          email: result.account.email,
          displayName: result.account.displayName,
          ageStatus: result.account.ageStatus,
          createdAt: result.account.createdAt,
        },
        scores: scoreRows,
        subscriptions: subscriptionRows,
        note: 'Spielraum-Daten sind nicht Teil dieses Exports. Alte Räume werden erst bei einer späteren Spielanfrage gemäß Inaktivitätsregel aufgeräumt.',
      });
    }

    if (request.method !== 'POST') return json({ success: false, error: 'Methode nicht erlaubt.' }, 405);
    const origin = request.headers.get('origin');
    if (!origin || origin !== url.origin) return json({ success: false, error: 'Ungültige Herkunft der Anfrage.' }, 403);
    if (Number(request.headers.get('content-length')) > 2048) return json({ success: false, error: 'Anfrage ist zu groß.' }, 413);
    const body = await request.json() as { action?: string; ageStatus?: string };
    const result = await loadAccount(request);
    if (!result) return json({ success: false, error: 'Bitte melde dich zuerst an.' }, 401);
    const db = database();

    if (body.action === 'age-status') {
      if (!['unknown', 'minor', 'adult'].includes(body.ageStatus || '')) return json({ success: false, error: 'Ungültige Altersangabe.' }, 400);
      await db.update(accounts).set({ ageStatus: body.ageStatus!, updatedAt: new Date() }).where(eq(accounts.id, result.account.id));
      return json({ success: true });
    }
    if (body.action === 'logout') {
      const token = readCookie(request, SESSION_COOKIE);
      if (token) await db.delete(accountSessions).where(eq(accountSessions.tokenHash, hash(token)));
      return json({ success: true }, 200, { 'Set-Cookie': clearCookie(request, SESSION_COOKIE) });
    }
    if (body.action === 'delete-account') {
      const activeSubscriptions = await db.select({ id: subscriptions.id }).from(subscriptions).where(and(
        eq(subscriptions.accountId, result.account.id),
        inArray(subscriptions.status, ['active', 'trialing']),
        or(isNull(subscriptions.currentPeriodEnd), gt(subscriptions.currentPeriodEnd, new Date())),
      ));
      if (activeSubscriptions.length) return json({ success: false, error: 'Kündige zuerst dein aktives Abo. Danach kannst du das Konto löschen.' }, 409);
      await db.transaction(async tx => {
        await tx.delete(scores).where(eq(scores.id, result.account.playerId));
        await tx.delete(accounts).where(eq(accounts.id, result.account.id));
      });
      return json({
        success: true,
        note: 'Konto, Anmeldung und Ranglistenwert wurden gelöscht. Spielraum-Daten können bis zu einer späteren Spielanfrage mit Bereinigung bestehen bleiben.',
      }, 200, { 'Set-Cookie': clearCookie(request, SESSION_COOKIE) });
    }
    return json({ success: false, error: 'Unbekannte Aktion.' }, 400);
  } catch (error) {
    console.error('Account function failed', error instanceof Error ? error.name : 'Unknown error');
    return json({ success: false, error: 'Die Kontoanfrage ist fehlgeschlagen. Bitte versuche es erneut.' }, 500);
  }
};
