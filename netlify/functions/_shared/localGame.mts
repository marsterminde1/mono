import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BOARD_SIZE_OPTIONS, getBoardTiles } from '../../../src/data/boardVariants.js';
import { AVAILABLE_TOKENS, PLAYER_COLORS, MAX_PLAYERS, TURN_LIMIT_OPTIONS } from '../../../src/data/monopolyBoard.js';
import { GameEngine, MAX_GAME_LOGS } from '../../../src/game/GameEngine.js';
import { isBotDifficulty, type BotDifficulty, type LobbyRoom, type Player } from '../../../src/types/game.js';
import { canSkipUnchangedPoll } from './polling.mjs';
import { reconcileLobbyHost } from './roomLifecycle.mjs';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const MAX_ACTIVE_ROOMS = 200;
const ROOM_INACTIVITY_MS = 24 * 60 * 60 * 1000;

interface LocalRoom {
  lobby: LobbyRoom;
  engine: GameEngine | null;
  revision: number;
  updatedAt: number;
  scoreSaved: boolean;
}

interface LocalScore {
  id: string;
  username: string;
  wins: number;
  gamesPlayed: number;
  totalCashEarned: number;
  updatedAt: string;
}

interface PersistedRoom extends Omit<LocalRoom, 'engine'> {
  engine: ReturnType<GameEngine['snapshot']> | null;
}

interface LocalStore {
  rooms: Array<[string, PersistedRoom]>;
  scores: LocalScore[];
}

const rooms = new Map<string, LocalRoom>();
const scores = new Map<string, LocalScore>();
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
const localDirectory = join(process.cwd(), '.netlify');
const localStatePath = join(localDirectory, 'local-game.json');
const localLockPath = join(localDirectory, 'local-game.lock');

async function loadLocalState() {
  let contents: string;
  try {
    contents = await readFile(localStatePath, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      rooms.clear();
      scores.clear();
      return;
    }
    throw error;
  }
  const saved = JSON.parse(contents) as LocalStore;
  rooms.clear();
  for (const [id, room] of saved.rooms || []) {
    rooms.set(id, { ...room, engine: room.engine ? GameEngine.restore(room.engine) : null });
  }
  scores.clear();
  for (const score of saved.scores || []) scores.set(score.id, score);
}

async function saveLocalState() {
  if (process.env.NETLIFY_LOCAL !== 'true') return;
  const saved: LocalStore = {
    rooms: [...rooms.entries()].map(([id, room]) => [id, { ...room, engine: room.engine?.snapshot() || null }]),
    scores: [...scores.values()],
  };
  const tempPath = `${localStatePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, JSON.stringify(saved), 'utf8');
  await rename(tempPath, localStatePath);
}

async function withLocalLock<T>(action: () => Promise<T>): Promise<T> {
  await mkdir(localDirectory, { recursive: true });
  let lockHandle;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      lockHandle = await open(localLockPath, 'wx');
      break;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      try {
        const lockInfo = await stat(localLockPath);
        if (Date.now() - lockInfo.mtimeMs > 30_000) await unlink(localLockPath);
      } catch (statError) {
        if (!(statError instanceof Error) || !('code' in statError) || statError.code !== 'ENOENT') throw statError;
      }
      if (attempt === 199) throw new Error('Timed out waiting for the local game state');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  if (!lockHandle) throw new Error('Unable to lock the local game state');
  try {
    await loadLocalState();
    return await action();
  } finally {
    await lockHandle.close();
    await unlink(localLockPath);
  }
}

const clampLogs = (engine: GameEngine | null) => {
  if (!engine) return;
  const state = engine.getState();
  state.logs = state.logs.slice(-MAX_GAME_LOGS);
};

const cleanupRooms = () => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.updatedAt > ROOM_INACTIVITY_MS || now - room.lobby.createdAt > ROOM_INACTIVITY_MS) rooms.delete(id);
  }
};

const getRateLimitKey = (request: Request) =>
  request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'local';

const enforceRateLimit = (request: Request) => {
  const key = `${request.method}:${getRateLimitKey(request)}`;
  const now = Date.now();
  const current = requestBuckets.get(key);
  if (!current || current.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) throw new Error('Too many requests');
  current.count += 1;
};

function createRoomId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let roomId = '';
  do {
    roomId = '';
    for (const byte of randomBytes(4)) roomId += alphabet[byte % alphabet.length];
  } while (rooms.has(roomId));
  return roomId;
}

function makePlayer(playerId: string, lobbyPlayers: Player[], data: Record<string, unknown>, bot = false): Player {
  return {
    id: bot ? `bot_${randomUUID()}` : playerId,
    name: bot ? `Bot ${lobbyPlayers.filter(player => player.isBot).length + 1}` : String(data.playerName || data.name || 'Tycoon').trim().slice(0, 16) || 'Tycoon',
    token: AVAILABLE_TOKENS.find(token => token === data.token && !lobbyPlayers.some(player => player.token === token))
      || AVAILABLE_TOKENS.find(token => !lobbyPlayers.some(player => player.token === token))!,
    color: PLAYER_COLORS.find(color => color === data.color && !lobbyPlayers.some(player => player.color === color))
      || PLAYER_COLORS.find(color => !lobbyPlayers.some(player => player.color === color))!,
    money: 1500,
    position: 0,
    inJail: false,
    jailTurns: 0,
    getOutOfJailCards: 0,
    bankrupt: false,
    isHost: !lobbyPlayers.length,
    isReady: bot || !lobbyPlayers.length,
    isBot: bot,
    connected: true,
  };
}

const getAccountPlayerId = (request: Request, guestPlayerId: string) => {
  const guestCookie = request.headers.get('cookie')?.match(/(?:^|; )monopoly_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  return guestCookie ? createHash('sha256').update(guestCookie).digest('hex') : guestPlayerId;
};

async function runLocalGame(request: Request) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  let guestSession = request.headers.get('cookie')?.match(/(?:^|; )monopoly_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!guestSession) {
    guestSession = randomBytes(32).toString('hex');
    headers.set('Set-Cookie', `monopoly_session=${guestSession}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`);
  }
  const guestPlayerId = createHash('sha256').update(guestSession).digest('hex');
  const playerId = getAccountPlayerId(request, guestPlayerId);
  const respond = async (body: unknown, status = 200, persist = true) => {
    if (persist) await saveLocalState();
    return Response.json(body, { status, headers });
  };

  try {
    if (request.method === 'GET') {
      return respond([...scores.values()].sort((a, b) => b.wins - a.wins || b.totalCashEarned - a.totalCashEarned).slice(0, 10));
    }
    if (request.method !== 'POST') return respond({ success: false, error: 'Method not allowed' }, 405);
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) {
      return respond({ success: false, error: 'Invalid origin' }, 403);
    }
    if (Number(request.headers.get('content-length')) > 16_000) return respond({ success: false, error: 'Request too large' }, 413);
    try {
      enforceRateLimit(request);
    } catch {
      return respond({ success: false, error: 'Too many requests' }, 429);
    }

    const body = await request.json() as { event?: string; data?: Record<string, unknown> };
    const event = body.event;
    const data = body.data || {};
    if (event === 'session') return respond({ success: true, playerId });
    cleanupRooms();

    if (event === 'lobby:create') {
      if (rooms.size >= MAX_ACTIVE_ROOMS) return respond({ success: false, error: 'Room limit reached' }, 429);
      const roomId = createRoomId();
      const player = makePlayer(playerId, [], data);
      const lobby: LobbyRoom = {
        roomId,
        hostId: playerId,
        players: [player],
        status: 'WAITING',
        createdAt: Date.now(),
        settings: { maxPlayers: MAX_PLAYERS, turnSeconds: 25, boardSize: 40, propertyBuildMode: 'classic', propertyUpgradeMode: 'standard', botDifficulty: 'balanced' },
      };
      rooms.set(roomId, { lobby, engine: null, revision: 1, updatedAt: Date.now(), scoreSaved: false });
      return respond({ success: true, roomId, player, lobby, revision: 1 });
    }

    const roomId = String(data.roomId || '').trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) return respond({ success: false, error: 'Room not found' }, 404);
    const { lobby } = room;
    lobby.settings = { maxPlayers: MAX_PLAYERS, turnSeconds: 25, boardSize: 40, propertyBuildMode: 'classic', propertyUpgradeMode: 'standard', botDifficulty: 'balanced', ...lobby.settings };
    const capacity = Math.min(MAX_PLAYERS, Math.max(2, lobby.settings.maxPlayers));
    const engine = room.engine;
    let player = lobby.players.find(candidate => candidate.id === playerId);
    let changed = event !== 'room:poll';
    const state = engine?.getState();
    const expectedClockKey = state && state.players[state.activePlayerIndex]
      ? `${state.players[state.activePlayerIndex].id}:${state.phase}:${state.doublesCount}:${state.hasRolled}:${state.rollsTaken ?? 0}:${state.bonusRoll ?? false}`
      : null;
    if (event === 'room:poll' && canSkipUnchangedPoll({
      revision: room.revision,
      clientRevision: data.revision,
      phase: state?.phase || null,
      activePlayerIsBot: state?.players[state.activePlayerIndex]?.isBot === true,
      turnSeconds: state?.turnSeconds ?? null,
      turnDeadline: state?.turnDeadline ?? null,
      turnClockReady: expectedClockKey !== null && state?.turnClockKey === expectedClockKey,
      hasPendingTrades: Boolean(engine?.pendingTrades().length),
      auctionEndsAt: state?.auction?.endsAt ?? null,
      nextAuctionBotActionAt: state?.auction?.nextBotActionAt ?? null,
    })) {
      if (!player) return respond({ success: false, error: 'You are no longer in this room' }, 400);
      return respond({ success: true, roomId, revision: room.revision, unchanged: true }, 200, false);
    }
    const requireHost = () => { if (lobby.hostId !== playerId) throw new Error('Only the host can do this'); };
    const requireLobby = () => { if (engine) throw new Error('Game already started'); };

    if (event === 'lobby:join') {
      const isNewPlayer = !player;
      if (!player) {
        requireLobby();
        if (lobby.players.length >= capacity) throw new Error('Room is full');
        player = makePlayer(playerId, lobby.players, data);
        lobby.players.push(player);
      }
      if (isNewPlayer && player.id === lobby.hostId) player.isReady = true;
      reconcileLobbyHost(lobby);
    } else if (!player) {
      throw new Error('You are no longer in this room');
    }

    if (event === 'lobby:ready') {
      requireLobby();
      player!.isReady = Boolean(data.ready);
    } else if (event === 'lobby:update_player') {
      requireLobby();
      const updated = makePlayer(playerId, lobby.players.filter(candidate => candidate.id !== playerId), data);
      Object.assign(player!, { name: updated.name, color: updated.color, token: updated.token });
    } else if (event === 'lobby:add_bot') {
      requireHost();
      requireLobby();
      if (lobby.players.length >= capacity) throw new Error('Room is full');
      lobby.players.push(makePlayer(playerId, lobby.players, data, true));
    } else if (event === 'lobby:settings') {
      requireHost();
      requireLobby();
      const maxPlayers = Math.round(Number(data.maxPlayers));
      const turnSeconds = Number(data.turnSeconds);
      if (!Number.isFinite(maxPlayers) || maxPlayers < Math.max(2, lobby.players.length) || maxPlayers > MAX_PLAYERS) throw new Error('Invalid player limit');
      if (!(TURN_LIMIT_OPTIONS as readonly number[]).includes(turnSeconds)) throw new Error('Invalid turn limit');
      const boardSize = Number(data.boardSize ?? lobby.settings.boardSize ?? 40);
      if (!(BOARD_SIZE_OPTIONS as readonly number[]).includes(boardSize)) throw new Error('Invalid board size');
      const propertyBuildMode = (data.propertyBuildMode ?? lobby.settings.propertyBuildMode ?? 'classic') === 'quick' ? 'quick' : 'classic';
      const propertyUpgradeMode = data.propertyUpgradeMode ?? lobby.settings.propertyUpgradeMode ?? 'standard';
      if (propertyUpgradeMode !== 'standard' && propertyUpgradeMode !== 'landmark') throw new Error('Invalid property upgrade mode');
      const botDifficulty = data.botDifficulty ?? lobby.settings.botDifficulty ?? 'balanced';
      if (!isBotDifficulty(botDifficulty)) throw new Error('Invalid bot difficulty');
      lobby.settings = { maxPlayers, turnSeconds, boardSize, propertyBuildMode, propertyUpgradeMode, botDifficulty };
    } else if (event === 'lobby:remove_player') {
      requireHost();
      requireLobby();
      if (data.targetPlayerId === playerId) throw new Error('Use leave to exit the room');
      lobby.players = lobby.players.filter(candidate => candidate.id !== data.targetPlayerId);
    } else if (event === 'lobby:leave') {
      if (engine && !engine.getState().players.find(candidate => candidate.id === playerId)?.bankrupt && engine.getState().phase !== 'GAME_OVER') {
        engine.declareBankruptcy(playerId);
      }
      lobby.players = lobby.players.filter(candidate => candidate.id !== playerId);
      if (lobby.hostId === playerId) {
        reconcileLobbyHost(lobby);
      }

    } else if (event === 'game:start') {
      requireHost();
      requireLobby();
      if (lobby.players.length < 2 || lobby.players.some(candidate => !candidate.isReady)) throw new Error('At least two players must be ready');
      room.engine = new GameEngine(roomId, lobby.players.map(candidate => candidate.isBot ? { ...candidate, botDifficulty: lobby.settings?.botDifficulty ?? 'balanced' } : candidate), {
        turnSeconds: lobby.settings.turnSeconds,
        boardSize: lobby.settings.boardSize,
        propertyBuildMode: lobby.settings.propertyBuildMode,
        propertyUpgradeMode: lobby.settings.propertyUpgradeMode,
      });
      lobby.status = 'PLAYING';
    } else if (typeof event === 'string' && event.startsWith('game:')) {
      if (!engine || engine.getState().phase === 'GAME_OVER') throw new Error('Game is not active');
      const activePlayer = engine.getState().players.find(candidate => candidate.id === playerId);
      if (!activePlayer || activePlayer.bankrupt) throw new Error('Player is eliminated');
      const actions: Record<string, () => { success: boolean; message?: string } | void> = {
        'game:roll': () => engine.rollDice(playerId),
        'game:buy': () => engine.buyProperty(playerId, data.tileId as number),
        'game:decline': () => engine.declineProperty(playerId),
        'game:auction_bid': () => engine.bidOnAuction(playerId, Number(data.bid)),
        'game:city_event_vote': () => engine.voteForCityEvent(playerId, data.eventId as Parameters<GameEngine['voteForCityEvent']>[1]),
        'game:pay_jail': () => engine.payJailFine(playerId),
        'game:use_jail_card': () => engine.useJailCard(playerId),
        'game:resolve_card': () => engine.resolveCard(playerId),
        'game:build_house': () => engine.buildHouse(playerId, data.tileId as number),
        'game:build_landmark': () => engine.buildLandmark(playerId, data.tileId as number),
        'game:sell_house': () => engine.sellHouse(playerId, data.tileId as number),
        'game:mortgage': () => engine.mortgageProperty(playerId, data.tileId as number),
        'game:unmortgage': () => engine.unmortgageProperty(playerId, data.tileId as number),
        'game:end_turn': () => engine.endTurn(playerId),
        'game:bankrupt': () => engine.declareBankruptcy(playerId),
        'game:trade_propose': () => engine.proposeTrade({ ...(data.tradeOffer as Parameters<GameEngine['proposeTrade']>[0]), fromPlayerId: playerId }),
        'game:trade_respond': () => engine.respondTrade(String(data.tradeId || ''), playerId, Boolean(data.accept)),
        'game:trade_cancel': () => engine.cancelTrade(playerId, String(data.tradeId || '')),
        'game:chat': () => {
          const message = String(data.message || '').trim().slice(0, 150);
          if (message) engine.addLog(message, 'chat', activePlayer);
        },
      };
      if (!actions[event]) throw new Error('Unknown action');
      const logsBefore = engine.getState().logs.length;
      const action = actions[event]();
      if (action && !action.success) {
        const terminal = engine.getState().logs.at(-1);
        const cancelled = engine.getState().logs.length > logsBefore
          && event === 'game:trade_respond'
          && terminal?.tradeId === data.tradeId
          && terminal?.tradeStatus === 'CANCELLED';
        if (!cancelled) throw new Error(action.message || 'Action is unavailable');
      }
    } else if (!['room:poll', 'lobby:join', 'lobby:ready'].includes(event || '')) {
      throw new Error('Unknown action');
    }

    const currentEngine = room.engine;
    if (currentEngine && currentEngine.getState().phase !== 'GAME_OVER') {
      if (currentEngine.timeoutStep()) changed = true;
      if (currentEngine.auctionStep()) changed = true;
      if (currentEngine.botStep()) changed = true;
      if (currentEngine.syncTurnClock()) changed = true;
      for (const trade of currentEngine.pendingTrades()) {
        if (currentEngine.getState().players.find(candidate => candidate.id === trade.toPlayerId)?.isBot) {
          if (currentEngine.botTradeStep(trade.id)) changed = true;
        }
      }

    }
    clampLogs(currentEngine);
    const gameState = currentEngine?.getState() || null;

    if (gameState?.phase === 'GAME_OVER' && !room.scoreSaved) {
      for (const finishedPlayer of gameState.players.filter(candidate => !candidate.isBot)) {
        const old = scores.get(finishedPlayer.id);
        const won = finishedPlayer.id === gameState.winnerId;
        const worth = finishedPlayer.money + Object.values(gameState.properties)
          .filter(property => property.ownerId === finishedPlayer.id)
          .reduce((sum, property) => {
            const tile = getBoardTiles(gameState.boardSize)[property.tileId];
            return sum + (tile?.price || 0)
              + property.houses * (tile?.houseCost || 0)
              + (property.landmark ? 3 * (tile?.houseCost || 0) : 0);
          }, 0);
        scores.set(finishedPlayer.id, {
          id: finishedPlayer.id,
          username: finishedPlayer.name,
          wins: (old?.wins || 0) + (won ? 1 : 0),
          gamesPlayed: (old?.gamesPlayed || 0) + 1,
          totalCashEarned: (old?.totalCashEarned || 0) + (won ? Math.max(0, worth) : 0),
          updatedAt: new Date().toISOString(),
        });
      }
      room.scoreSaved = true;
    }

    if (changed) {
      room.revision += 1;
      room.updatedAt = Date.now();
    }
    return respond({
      success: true,
      roomId,
      lobby,
      player,
      gameState,
      revision: room.revision,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const safe = /^(Room |Room limit reached|Only the host|Game |You are |Use leave|At least |Player |Unknown action|Invalid |Insufficient |Properties |Trade |Not |Cannot |Must |You |No |It's |Action |Too many requests)/.test(message);
    return respond({ success: false, error: safe ? message : 'The local game request failed. Please try again.' }, 400);
  }
}

export default async function handleLocalGame(request: Request) {
  if (process.env.NETLIFY_LOCAL === 'true') return withLocalLock(() => runLocalGame(request));
  return runLocalGame(request);
}
