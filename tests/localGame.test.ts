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

test('local in-memory server creates a room, starts a bot game, and serves the saved room to polls', async () => {
  const sessionResponse = await post('session');
  const sessionCookie = sessionResponse.headers.get('set-cookie')!.split(';')[0];
  const session = await sessionResponse.json() as { playerId: string };
  const createResponse = await post('lobby:create', { playerName: 'Local Player' }, sessionCookie);
  const created = await createResponse.json() as { success: boolean; roomId: string; lobby: { players: unknown[] } };
  assert.equal(created.success, true);
  assert.equal(created.lobby.players.length, 1);

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
