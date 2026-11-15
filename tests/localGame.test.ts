import { test } from 'node:test';
import assert from 'node:assert/strict';
import handleLocalGame from '../netlify/functions/_shared/localGame.mts';

async function post(event: string, data: Record<string, unknown> = {}, cookie = '') {
  return handleLocalGame(new Request('http://localhost:8889/.netlify/functions/game', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ event, data }),
  }));
}

async function newSession(name: string) {
  const response = await post('session');
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const session = await response.json() as { playerId: string };
  return { cookie, playerId: session.playerId, name };
}

test('local in-memory server creates a room, starts a bot game, and serves the saved room to polls', async () => {
  const sessionResponse = await post('session');
  const sessionCookie = sessionResponse.headers.get('set-cookie')!.split(';')[0];
  const session = await sessionResponse.json() as { playerId: string };
  const createResponse = await post('lobby:create', { playerName: 'Local Player' }, sessionCookie);
  const created = await createResponse.json() as { success: boolean; roomId: string; revision: number; lobby: { players: unknown[] } };
  assert.equal(created.success, true);
  assert.equal(created.lobby.players.length, 1);
  const idlePollResponse = await post('room:poll', { roomId: created.roomId, revision: created.revision }, sessionCookie);
  const idlePoll = await idlePollResponse.json() as { success: boolean; unchanged: boolean; gameState?: unknown };
  assert.equal(idlePoll.success, true);
  assert.equal(idlePoll.unchanged, true);
  assert.equal('gameState' in idlePoll, false);

  const roomData = { roomId: created.roomId };
  const botResponse = await post('lobby:add_bot', roomData, sessionCookie);
  assert.equal((await botResponse.json() as { success: boolean }).success, true);
  const startResponse = await post('game:start', roomData, sessionCookie);
  const started = await startResponse.json() as { success: boolean; gameState: { phase: string; players: Array<{ id: string; isBot?: boolean }> } };
  assert.equal(started.success, true);
  assert.equal(started.gameState.players.length, 2);
  assert.ok(started.gameState.players.some(player => player.id === session.playerId));
  assert.ok(started.gameState.players.some(player => player.isBot));

  const pollResponse = await post('room:poll', roomData, sessionCookie);
  const polled = await pollResponse.json() as { success: boolean; gameState: { phase: string } };
  assert.equal(polled.success, true);
  assert.equal(polled.gameState.phase, started.gameState.phase);
});

test('host handoff assigns exactly one ready host when the current host leaves', async () => {
  const host = await newSession('Host');
  const guest = await newSession('Guest');
  const created = await (await post('lobby:create', { playerName: host.name }, host.cookie)).json() as { roomId: string };
  await post('lobby:join', { roomId: created.roomId, playerName: guest.name }, guest.cookie);

  const response = await post('lobby:leave', { roomId: created.roomId }, host.cookie);
  const result = await response.json() as {
    success: boolean;
    lobby: { hostId: string; players: Array<{ id: string; isHost: boolean; isReady: boolean }> };
  };
  assert.equal(result.success, true);
  assert.equal(result.lobby.hostId, guest.playerId);
  assert.deepEqual(result.lobby.players.map(player => [player.id, player.isHost, player.isReady]), [[guest.playerId, true, true]]);
});

test('a returning host regains control of an orphaned bot lobby', async () => {
  const host = await newSession('Returning host');
  const created = await (await post('lobby:create', { playerName: host.name }, host.cookie)).json() as { roomId: string };
  await post('lobby:add_bot', { roomId: created.roomId }, host.cookie);
  await post('lobby:leave', { roomId: created.roomId }, host.cookie);

  const response = await post('lobby:join', { roomId: created.roomId, playerName: host.name }, host.cookie);
  const result = await response.json() as {
    success: boolean;
    lobby: { hostId: string; players: Array<{ id: string; isHost: boolean; isReady: boolean }> };
  };
  assert.equal(result.success, true);
  const returningPlayer = result.lobby.players.find(player => player.id === host.playerId);
  assert.equal(result.lobby.hostId, host.playerId);
  assert.equal(returningPlayer?.isHost, true);
  assert.equal(returningPlayer?.isReady, true);
});

test('simultaneous join requests cannot exceed the configured room capacity', async () => {
  const host = await newSession('Host');
  const firstGuest = await newSession('First guest');
  const secondGuest = await newSession('Second guest');
  const created = await (await post('lobby:create', { playerName: host.name }, host.cookie)).json() as { roomId: string };
  await post('lobby:settings', { roomId: created.roomId, maxPlayers: 2, turnSeconds: 25, boardSize: 40 }, host.cookie);

  const responses = await Promise.all([
    post('lobby:join', { roomId: created.roomId, playerName: firstGuest.name }, firstGuest.cookie),
    post('lobby:join', { roomId: created.roomId, playerName: secondGuest.name }, secondGuest.cookie),
  ]);
  const results = await Promise.all(responses.map(response => response.json())) as Array<{
    success: boolean;
    error?: string;
    lobby?: { players: unknown[] };
  }>;
  assert.equal(results.filter(result => result.success).length, 1);
  assert.equal(results.find(result => !result.success)?.error, 'Room is full');
  const poll = await (await post('room:poll', { roomId: created.roomId }, host.cookie)).json() as {
    lobby: { players: unknown[] };
  };
  assert.equal(poll.lobby.players.length, 2);
});

test('host-selected bot difficulty is validated and persisted into the server game', async () => {
  const host = await newSession('Host');
  const created = await (await post('lobby:create', { playerName: host.name }, host.cookie)).json() as { roomId: string };
  const roomData = { roomId: created.roomId };
  const settings = { maxPlayers: 4, turnSeconds: 25, boardSize: 40, propertyBuildMode: 'classic', botDifficulty: 'strategic' };
  const saved = await post('lobby:settings', { ...roomData, ...settings }, host.cookie);
  assert.equal((await saved.json() as { success: boolean }).success, true);
  const invalid = await post('lobby:settings', { ...roomData, ...settings, botDifficulty: 'impossible' }, host.cookie);
  assert.equal((await invalid.json() as { success: boolean }).success, false);

  await post('lobby:add_bot', roomData, host.cookie);
  const started = await (await post('game:start', roomData, host.cookie)).json() as {
    success: boolean;
    gameState: { players: Array<{ isBot?: boolean; botDifficulty?: string }> };
  };
  assert.equal(started.success, true);
  assert.equal(started.gameState.players.find(player => player.isBot)?.botDifficulty, 'strategic');
});
