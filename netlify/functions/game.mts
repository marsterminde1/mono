import { BOARD_SIZE_OPTIONS, getBoardTiles } from '../../src/data/boardVariants.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq, desc, sql } from 'drizzle-orm';
import { database } from '../../db/index.js';
import { accountSessions, rooms, scores } from '../../db/schema.js';
import { GameEngine } from '../../src/game/GameEngine.js';
import { AVAILABLE_TOKENS, PLAYER_COLORS, MAX_PLAYERS, TURN_LIMIT_OPTIONS } from '../../src/data/monopolyBoard.js';
import { MAX_GAME_LOGS } from '../../src/game/GameEngine.js';
import { isBotDifficulty, type BotDifficulty, type Player, type LobbyRoom } from '../../src/types/game.js';
import handleLocalGame from './_shared/localGame.mjs';
import { canSkipUnchangedPoll } from './_shared/polling.mjs';
import { reconcileLobbyHost } from './_shared/roomLifecycle.mjs';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const MAX_TRACKED_REQUEST_BUCKETS = 10_000;
const MAX_ACTIVE_ROOMS = 200;
const ROOM_INACTIVITY_MS = 24 * 60 * 60 * 1000;
const ROOM_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
let lastRoomCleanupAt = 0;
let roomCleanupTask: Promise<void> | null = null;
let lastRequestBucketCleanupAt = 0;

const clampLogs = <T extends { logs?: Array<{ message: string }> }>(state: T | null | undefined): T | null | undefined => {
  if (!state || !Array.isArray(state.logs)) return state;
  state.logs = state.logs.slice(-MAX_GAME_LOGS) as T['logs'];
  return state;
};

const cleanupRooms = async (db: ReturnType<typeof database>) => {
  const now = Date.now();
  if (now - lastRoomCleanupAt < ROOM_CLEANUP_INTERVAL_MS) return;
  if (roomCleanupTask) return roomCleanupTask;
  roomCleanupTask = (async () => {
    const rows = await db.select({ id: rooms.id, lobby: rooms.lobby, updatedAt: rooms.updatedAt }).from(rooms);
    const staleIds = rows.filter((row) => {
      const lobby = row.lobby as Partial<LobbyRoom> | undefined;
      const lastUpdated = row.updatedAt?.getTime?.() ?? now;
      const lastActivity = Date.now() - lastUpdated;
      const createdAt = lobby?.createdAt ?? lastUpdated;
      const roomAge = Date.now() - createdAt;
      return lastActivity > ROOM_INACTIVITY_MS || roomAge > ROOM_INACTIVITY_MS;
    }).map((row) => row.id);
    for (const id of staleIds) {
      await db.delete(rooms).where(eq(rooms.id, id));
    }
    lastRoomCleanupAt = Date.now();
  })();
  try {
    await roomCleanupTask;
  } finally {
    roomCleanupTask = null;
  }
};

const getRateLimitKey = (req: Request) => {
  const forwarded = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip');
  return forwarded || 'unknown';
};

const enforceRateLimit = (req: Request) => {
  const key = `${req.method}:${getRateLimitKey(req)}`;
  const now = Date.now();
  if (now - lastRequestBucketCleanupAt >= RATE_LIMIT_WINDOW_MS) {
    for (const [bucketKey, bucket] of requestBuckets) {
      if (bucket.resetAt <= now) requestBuckets.delete(bucketKey);
    }
    lastRequestBucketCleanupAt = now;
  }
  const current = requestBuckets.get(key);
  if (!current || current.resetAt <= now) {
    if (!current && requestBuckets.size >= MAX_TRACKED_REQUEST_BUCKETS) {
      for (const [bucketKey, bucket] of requestBuckets) {
        if (bucket.resetAt <= now) requestBuckets.delete(bucketKey);
      }
      if (requestBuckets.size >= MAX_TRACKED_REQUEST_BUCKETS) throw new Error('Too many requests');
    }
    requestBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    throw new Error('Too many requests');
  }
  current.count += 1;
};

export default async (req: Request) => {
  if (process.env.NETLIFY_LOCAL === 'true' && !process.env.NETLIFY_DATABASE_URL && !process.env.DATABASE_URL) {
    return handleLocalGame(req);
  }
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  let session = req.headers.get('cookie')?.match(/(?:^|; )monopoly_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!session) {
    session = randomBytes(32).toString('hex');
    headers.set('Set-Cookie', `monopoly_session=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`);
  }
  const guestPlayerId = createHash('sha256').update(session).digest('hex');
  const accountToken = req.headers.get('cookie')?.match(/(?:^|; )arena_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  let playerId = guestPlayerId;
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers });
  try {
    if (req.method === 'GET') {
      return respond(await database().select().from(scores).orderBy(desc(scores.wins), desc(scores.totalCashEarned)).limit(10));
    }
    if (req.method !== 'POST') return respond({ success: false, error: 'Method not allowed' }, 405);
    if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return respond({ success: false, error: 'Invalid origin' }, 403);
    if (Number(req.headers.get('content-length')) > 16000) return respond({ success: false, error: 'Request too large' }, 413);
    try {
      enforceRateLimit(req);
    } catch {
      return respond({ success: false, error: 'Too many requests' }, 429);
    }
    const { event, data = {} } = await req.json();
    if (event === 'session' && !accountToken) return respond({ success: true, playerId });
    const db = database();
    if (accountToken) {
      const [accountSession] = await db.select().from(accountSessions).where(eq(
        accountSessions.tokenHash,
        createHash('sha256').update(accountToken).digest('hex'),
      )).limit(1);
      if (accountSession && accountSession.expiresAt > new Date()) playerId = accountSession.playerId;
      else headers.append('Set-Cookie', `arena_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`);
    }
    if (event === 'session') return respond({ success: true, playerId });
    await cleanupRooms(db);
    const makePlayer = (lobbyPlayers: Player[], bot = false): Player => ({
      id: bot ? `bot_${randomUUID()}` : playerId,
      name: bot ? `Bot ${lobbyPlayers.filter(p => p.isBot).length + 1}` : String(data.playerName || data.name || 'Tycoon').trim().slice(0, 16) || 'Tycoon',
      token: AVAILABLE_TOKENS.find(t => t === data.token && !lobbyPlayers.some(p => p.token === t)) || AVAILABLE_TOKENS.find(t => !lobbyPlayers.some(p => p.token === t))!,
      color: PLAYER_COLORS.find(c => c === data.color && !lobbyPlayers.some(p => p.color === c)) || PLAYER_COLORS.find(c => !lobbyPlayers.some(p => p.color === c))!,
      money: 1500, position: 0, inJail: false, jailTurns: 0, getOutOfJailCards: 0, bankrupt: false,
      isHost: !lobbyPlayers.length, isReady: bot || !lobbyPlayers.length, isBot: bot, connected: true,
    });
    if (event === 'lobby:create') {
      const createdRoom = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(731904281)`);
        const roomCountRows = await tx.select({ count: sql<number>`count(*)::int` }).from(rooms);
        const roomCount = Number(roomCountRows[0]?.count ?? 0);
        if (roomCount >= MAX_ACTIVE_ROOMS) return null;
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let roomId = '';
        for (const byte of randomBytes(4)) roomId += alphabet[byte % alphabet.length];
        const player = makePlayer([]);
        const lobby: LobbyRoom = { roomId, hostId: playerId, players: [player], status: 'WAITING', createdAt: Date.now(), settings: { maxPlayers: MAX_PLAYERS, turnSeconds: 25, boardSize: 40, propertyBuildMode: 'classic', botDifficulty: 'balanced' } };
        await tx.insert(rooms).values({ id: roomId, lobby });
        return { roomId, player, lobby };
      });
      if (!createdRoom) {
        return respond({ success: false, error: 'Room limit reached' }, 429);
      }
      return respond({ success: true, ...createdRoom, revision: 0 });
    }
    const roomId = String(data.roomId || '').trim().toUpperCase();
    if (event === 'room:poll') {
      const [pollRoom] = await db.select({
        id: rooms.id,
        lobby: rooms.lobby,
        revision: rooms.revision,
        phase: sql<string | null>`${rooms.engine} #>> '{state,phase}'`,
        activePlayerIsBot: sql<string | null>`${rooms.engine} #>> ARRAY['state', 'players', COALESCE(${rooms.engine} #>> '{state,activePlayerIndex}', '-1'), 'isBot']`,
        turnSeconds: sql<string | null>`${rooms.engine} #>> '{state,turnSeconds}'`,
        turnDeadline: sql<string | null>`${rooms.engine} #>> '{state,turnDeadline}'`,
        turnClockKey: sql<string | null>`${rooms.engine} #>> '{state,turnClockKey}'`,
        activePlayerId: sql<string | null>`${rooms.engine} #>> ARRAY['state', 'players', COALESCE(${rooms.engine} #>> '{state,activePlayerIndex}', '-1'), 'id']`,
        doublesCount: sql<string | null>`${rooms.engine} #>> '{state,doublesCount}'`,
        hasRolled: sql<string | null>`${rooms.engine} #>> '{state,hasRolled}'`,
        rollsTaken: sql<string | null>`${rooms.engine} #>> '{state,rollsTaken}'`,
        bonusRoll: sql<string | null>`${rooms.engine} #>> '{state,bonusRoll}'`,
        pendingTrades: sql<unknown>`${rooms.engine} #> '{state,pendingTrades}'`,
        activeTrade: sql<unknown>`${rooms.engine} #> '{state,activeTrade}'`,
      }).from(rooms).where(eq(rooms.id, roomId)).limit(1);
      const hasPendingTrades = (Array.isArray(pollRoom?.pendingTrades) && pollRoom.pendingTrades.length > 0)
        || (pollRoom?.activeTrade !== null && pollRoom?.activeTrade !== undefined);
      const expectedClockKey = pollRoom?.activePlayerId && pollRoom.phase && pollRoom.doublesCount !== null && pollRoom.hasRolled !== null
        ? `${pollRoom.activePlayerId}:${pollRoom.phase}:${Number(pollRoom.doublesCount)}:${pollRoom.hasRolled === 'true'}:${Number(pollRoom.rollsTaken || 0)}:${pollRoom.bonusRoll === 'true'}`
        : null;
      if (pollRoom?.lobby.players.some(p => p.id === playerId)
        && canSkipUnchangedPoll({
          revision: pollRoom.revision,
          clientRevision: data.revision,
          phase: pollRoom.phase,
          activePlayerIsBot: pollRoom.activePlayerIsBot === 'true',
          turnSeconds: pollRoom.turnSeconds === null ? null : Number(pollRoom.turnSeconds),
          turnDeadline: pollRoom.turnDeadline === null ? null : Number(pollRoom.turnDeadline),
          turnClockReady: expectedClockKey !== null && pollRoom.turnClockKey === expectedClockKey,
          hasPendingTrades,
        })) {
        return respond({ success: true, roomId, revision: pollRoom.revision, unchanged: true });
      }
    }
    const result = await db.transaction(async tx => {
      const [row] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).for('update');
      if (!row) throw new Error('Room not found');
      const lobby = row.lobby;
      lobby.settings = { maxPlayers: MAX_PLAYERS, turnSeconds: 25, boardSize: 40, propertyBuildMode: 'classic', botDifficulty: 'balanced', ...lobby.settings };
      const capacity = Math.min(MAX_PLAYERS, Math.max(2, lobby.settings.maxPlayers));
      let engine = row.engine ? GameEngine.restore(row.engine) : null;
      let me = lobby.players.find(p => p.id === playerId);
      let changed = event !== 'room:poll';
      const requireHost = () => { if (lobby.hostId !== playerId) throw new Error('Only the host can do this'); };
      const requireLobby = () => { if (engine) throw new Error('Game already started'); };
      if (event === 'lobby:join') {
        const isNewPlayer = !me;
        if (!me) {
          requireLobby();
          if (lobby.players.length >= capacity) throw new Error('Room is full');
          me = makePlayer(lobby.players);
          lobby.players.push(me);
        }
        if (isNewPlayer && me.id === lobby.hostId) me.isReady = true;
        reconcileLobbyHost(lobby);
      } else if (!me) throw new Error('You are no longer in this room');
      if (event === 'lobby:ready') { requireLobby(); me!.isReady = Boolean(data.ready); }
      else if (event === 'lobby:update_player') {
        requireLobby();
        const profile = makePlayer(lobby.players.filter(p => p.id !== playerId));
        Object.assign(me!, { name: profile.name, color: profile.color, token: profile.token });
      } else if (event === 'lobby:add_bot') {
        requireHost(); requireLobby();
        if (lobby.players.length >= capacity) throw new Error('Room is full');
        lobby.players.push(makePlayer(lobby.players, true));
      } else if (event === 'lobby:settings') {
        requireHost(); requireLobby();
        const maxPlayers = Math.round(Number(data.maxPlayers));
        const turnSeconds = Number(data.turnSeconds);
        if (!Number.isFinite(maxPlayers) || maxPlayers < Math.max(2, lobby.players.length) || maxPlayers > MAX_PLAYERS) throw new Error('Invalid player limit');
        if (!(TURN_LIMIT_OPTIONS as readonly number[]).includes(turnSeconds)) throw new Error('Invalid turn limit');
        const boardSize = Number(data.boardSize ?? lobby.settings.boardSize ?? 40);
        if (!(BOARD_SIZE_OPTIONS as readonly number[]).includes(boardSize)) throw new Error('Invalid board size');
        const propertyBuildMode = (data.propertyBuildMode ?? lobby.settings.propertyBuildMode ?? 'classic') === 'quick' ? 'quick' : 'classic';
        const botDifficulty = data.botDifficulty ?? lobby.settings.botDifficulty ?? 'balanced';
        if (!isBotDifficulty(botDifficulty)) throw new Error('Invalid bot difficulty');
        lobby.settings = { maxPlayers, turnSeconds, boardSize, propertyBuildMode, botDifficulty };
      } else if (event === 'lobby:remove_player') {
        requireHost(); requireLobby();
        if (data.targetPlayerId === playerId) throw new Error('Use leave to exit the room');
        lobby.players = lobby.players.filter(p => p.id !== data.targetPlayerId);
      } else if (event === 'lobby:leave') {
        if (engine && !engine.getState().players.find(p => p.id === playerId)?.bankrupt && engine.getState().phase !== 'GAME_OVER') engine.declareBankruptcy(playerId);
        lobby.players = lobby.players.filter(p => p.id !== playerId);
        if (lobby.hostId === playerId) {
          reconcileLobbyHost(lobby);
        }
      } else if (event === 'game:start') {
        requireHost(); requireLobby();
        if (lobby.players.length < 2 || lobby.players.some(p => !p.isReady)) throw new Error('At least two players must be ready');
        engine = new GameEngine(roomId, lobby.players.map(p => p.isBot ? { ...p, botDifficulty: lobby.settings?.botDifficulty ?? 'balanced' } : p), {
          turnSeconds: lobby.settings.turnSeconds,
          boardSize: lobby.settings.boardSize,
          propertyBuildMode: lobby.settings.propertyBuildMode,
        });
        lobby.status = 'PLAYING';
      } else if (event.startsWith('game:')) {
        if (!engine || engine.getState().phase === 'GAME_OVER') throw new Error('Game is not active');
        const player = engine.getState().players.find(p => p.id === playerId);
        if (!player || player.bankrupt) throw new Error('Player is eliminated');
        const actions: Record<string, () => { success: boolean; message?: string } | void> = {
          'game:roll': () => engine!.rollDice(playerId),
          'game:buy': () => engine!.buyProperty(playerId, data.tileId),
          'game:decline': () => engine!.declineProperty(playerId),
          'game:pay_jail': () => engine!.payJailFine(playerId),
          'game:use_jail_card': () => engine!.useJailCard(playerId),
          'game:resolve_card': () => engine!.resolveCard(playerId),
          'game:build_house': () => engine!.buildHouse(playerId, data.tileId),
          'game:sell_house': () => engine!.sellHouse(playerId, data.tileId),
          'game:mortgage': () => engine!.mortgageProperty(playerId, data.tileId),
          'game:unmortgage': () => engine!.unmortgageProperty(playerId, data.tileId),
          'game:end_turn': () => engine!.endTurn(playerId),
          'game:bankrupt': () => engine!.declareBankruptcy(playerId),
          'game:trade_propose': () => engine!.proposeTrade({ ...data.tradeOffer, fromPlayerId: playerId }),
          'game:trade_respond': () => engine!.respondTrade(data.tradeId, playerId, Boolean(data.accept)),
          'game:trade_cancel': () => engine!.cancelTrade(playerId, data.tradeId),
          'game:chat': () => { const message = String(data.message || '').trim().slice(0, 150); if (message) engine!.addLog(message, 'chat', player); },
        };
        if (!actions[event]) throw new Error('Unknown action');
        const logCountBeforeAction = engine.getState().logs.length;
        const action = actions[event]();
        if (action && !action.success) {
          // A failed acceptance can intentionally cancel an invalid offer. Commit
          // that terminal event so both traders see it rather than rolling it back.
          const terminal = engine.getState().logs.at(-1);
          const cancelled = engine.getState().logs.length > logCountBeforeAction && event === 'game:trade_respond' && terminal?.tradeId === data.tradeId && terminal?.tradeStatus === 'CANCELLED';
          if (!cancelled) throw new Error(action.message || 'Action is unavailable');
        }
      } else if (!['room:poll', 'lobby:join', 'lobby:ready'].includes(event)) throw new Error('Unknown action');
      // One step per poll keeps bots progressing without a background server or timers.
      if (engine && engine.getState().phase !== 'GAME_OVER') {
        if (engine.timeoutStep()) changed = true;
        if (engine.botStep()) changed = true;
        if (engine.syncTurnClock()) changed = true;
        for (const trade of engine.pendingTrades()) {
          if (engine.getState().players.find(p => p.id === trade.toPlayerId)?.isBot) {
            if (engine.botTradeStep(trade.id)) changed = true;
          }
        }
      }
      const gameState = engine?.getState();
      if (gameState) {
        gameState.logs = gameState.logs.slice(-MAX_GAME_LOGS);
      }
      if (changed) {
        if (engine?.getState().phase === 'GAME_OVER' && row.engine?.state.phase !== 'GAME_OVER') {
          const state = engine.getState();
          for (const p of state.players.filter(p => !p.isBot)) {
            const won = p.id === state.winnerId;
            const worth = p.money + Object.values(state.properties).filter(prop => prop.ownerId === p.id).reduce((sum, prop) => sum + (getBoardTiles(state.boardSize)[prop.tileId]?.price || 0) + prop.houses * (getBoardTiles(state.boardSize)[prop.tileId]?.houseCost || 0), 0);
            await tx.insert(scores).values({ id: p.id, username: p.name, wins: won ? 1 : 0, gamesPlayed: 1, totalCashEarned: won ? Math.max(0, worth) : 0 }).onConflictDoUpdate({ target: scores.id, set: {
              username: p.name, wins: sql`${scores.wins} + ${won ? 1 : 0}`, gamesPlayed: sql`${scores.gamesPlayed} + 1`, totalCashEarned: sql`${scores.totalCashEarned} + ${won ? Math.max(0, worth) : 0}`, updatedAt: new Date(),
            } });
          }
        }
        await tx.update(rooms).set({ lobby, engine: engine?.snapshot() || null, revision: row.revision + 1, updatedAt: new Date() }).where(eq(rooms.id, roomId));
      }
      return { success: true, roomId, lobby, player: me, gameState: gameState || null, revision: row.revision + (changed ? 1 : 0) };
    });
    return respond(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    // Database errors can contain connection details; only expose known game errors.
    const safe = /^(Room |Room limit reached|Only the host|Game |You are |Use leave|At least |Player |Unknown action|Invalid |Insufficient |Properties |Trade |Not |Cannot |Must |You |No |It's |Action |Too many requests)/.test(message);
    return respond({ success: false, error: safe ? message : 'The request failed. Please try again.' }, 400);
  }
};
