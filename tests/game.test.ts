import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, MAX_GAME_LOGS } from '../src/game/GameEngine';
import { getBoardTiles, propertyGroup } from '../src/data/boardVariants';
import type { BotDifficulty, Player } from '../src/types/game';
const player = (id: string, bot = false, botDifficulty: BotDifficulty = 'balanced'): Player => ({ id, name: id, token: '🎩', color: '#fff', money: 1500, position: 0, inJail: false, jailTurns: 0, getOutOfJailCards: 0, bankrupt: false, isHost: id === 'a', isReady: true, connected: true, isBot: bot, botDifficulty: bot ? botDifficulty : undefined });
const game = () => new GameEngine('TEST', [player('a'), player('b')]);
const stepBotOrAuction = (engine: GameEngine) => {
  if (engine.getState().phase !== 'AUCTION') return engine.botStep();
  const auction = engine.getState().auction!;
  return engine.auctionStep(auction.nextBotActionAt ?? auction.endsAt);
};
test('saving and restoring preserves ownership, players, turn and card decks', () => {
  const engine = game();
  engine.getState().properties[1].ownerId = 'a';
  engine.rollDice('a');
  const snapshot = JSON.parse(JSON.stringify(engine.snapshot()));
  const restored = GameEngine.restore(snapshot);
  assert.deepEqual(restored.snapshot(), snapshot);
  assert.equal(restored.rollDice('b').success, false);
});
test('game logs are trimmed to a bounded size', () => {
  const engine = game();
  for (let i = 0; i < MAX_GAME_LOGS * 3; i++) {
    engine.addLog(`log ${i}`, 'system');
  }
  assert.equal(engine.getState().logs.length, MAX_GAME_LOGS);
  assert.match(engine.getState().logs.at(-1)!.message, /log \d+/);
});

test('quick build mode allows early growth on a 3-property color group', () => {
  const engine = new GameEngine('TEST', [player('a'), player('b')], { propertyBuildMode: 'quick' });
  const state = engine.getState();
  state.properties[6].ownerId = 'a';
  state.properties[8].ownerId = 'a';
  state.players[0].money = 1500;
  const result = engine.buildHouse('a', 6);
  assert.equal(result.success, true);
  assert.equal(state.properties[6].houses, 1);
});

test('classic build mode still requires a full color set', () => {
  const engine = new GameEngine('TEST', [player('a'), player('b')], { propertyBuildMode: 'classic' });
  const state = engine.getState();
  state.properties[6].ownerId = 'a';
  state.properties[8].ownerId = 'a';
  state.players[0].money = 1500;
  const result = engine.buildHouse('a', 6);
  assert.equal(result.success, false);
  assert.equal(state.properties[6].houses, 0);
});

test('a player cannot skip rolling or leave unresolved debt behind', () => {
  const engine = game();
  assert.equal(engine.endTurn('a').success, false);
  assert.equal(engine.declineProperty('a').success, false);
  engine.getState().phase = 'END_TURN';
  engine.getState().players[0].money = -50;
  assert.equal(engine.endTurn('a').success, false);
});

test('declining an unowned property starts an auction with validated bids', () => {
  const engine = game();
  const state = engine.getState();
  state.players[0].position = 1;
  state.phase = 'ACTION';

  assert.equal(engine.declineProperty('a').success, true);
  assert.equal(state.phase, 'AUCTION');
  assert.equal(state.auction?.minimumBid, 10);
  assert.equal(state.auction?.increment, 10);
  assert.equal(engine.bidOnAuction('a', 9).success, false);
  assert.equal(engine.bidOnAuction('a', 10.5).success, false);
  assert.equal(engine.bidOnAuction('a', 1501).success, false);
  assert.equal(engine.bidOnAuction('a', 10).success, true);
});

test('first accepted competing bid stays ahead; winner pays only when auction ends', () => {
  const engine = game();
  const state = engine.getState();
  state.players[0].position = 1;
  state.phase = 'ACTION';
  engine.declineProperty('a');

  assert.equal(engine.bidOnAuction('a', 10).success, true);
  assert.equal(engine.bidOnAuction('b', 10).success, false);
  assert.equal(state.auction?.highestBidderId, 'a');
  assert.equal(engine.bidOnAuction('b', 20).success, true);
  const endsAt = state.auction!.endsAt;
  assert.equal(engine.auctionStep(endsAt), true);
  assert.equal(state.phase, 'END_TURN');
  assert.equal(state.properties[1].ownerId, 'b');
  assert.equal(state.players[1].money, 1480);
});

test('auction expiry without bids leaves the property with the bank', () => {
  const engine = game();
  const state = engine.getState();
  state.players[0].position = 1;
  state.phase = 'ACTION';
  engine.declineProperty('a');

  assert.equal(engine.auctionStep(state.auction!.endsAt), true);
  assert.equal(state.phase, 'END_TURN');
  assert.equal(state.properties[1].ownerId, null);
});

test('bots do not bid beyond their available strategy limit', () => {
  const engine = new GameEngine('BOT_AUCTION', [player('human'), player('bot', true, 'balanced')]);
  const state = engine.getState();
  state.players[0].position = 1;
  state.phase = 'ACTION';
  engine.declineProperty('human');
  assert.equal(engine.bidOnAuction('human', 60).success, true);

  assert.equal(engine.auctionStep(state.auction!.nextBotActionAt!), true);
  assert.equal(state.auction?.currentBid, 60);
  assert.equal(state.auction?.highestBidderId, 'human');
  assert.ok(state.auction?.passedBotIds.includes('bot'));
});

test('auction leaders cannot spend committed cash and bankruptcy reopens bidding', () => {
  const engine = new GameEngine('AUCTION_CASH', [player('a'), player('b'), player('c')]);
  const state = engine.getState();
  state.players[0].position = 1;
  state.players[0].money = 40;
  state.phase = 'ACTION';
  state.properties[3].ownerId = 'a';
  state.properties[3].mortgaged = true;
  engine.declineProperty('a');
  assert.equal(engine.bidOnAuction('a', 10).success, true);

  assert.equal(engine.unmortgageProperty('a', 3).success, false);
  assert.equal(engine.proposeTrade({
    fromPlayerId: 'a', toPlayerId: 'b', offeredMoney: 31, requestedMoney: 0, offeredProperties: [], requestedProperties: [],
  }).success, false);
  assert.equal(engine.proposeTrade({
    fromPlayerId: 'b', toPlayerId: 'a', offeredMoney: 0, requestedMoney: 31, offeredProperties: [], requestedProperties: [],
  }).success, true);
  const trade = engine.pendingTrades()[0];
  assert.equal(engine.respondTrade(trade.id, 'a', true).success, false);
  assert.equal(state.players[0].money, 40);

  assert.equal(engine.declareBankruptcy('a').success, true);
  assert.equal(state.phase, 'AUCTION');
  assert.equal(state.auction?.currentBid, 0);
  assert.equal(state.auction?.highestBidderId, null);
  assert.equal(engine.bidOnAuction('b', 10).success, true);
  assert.equal(engine.auctionStep(state.auction!.endsAt), true);
  assert.equal(state.properties[1].ownerId, 'b');
  assert.equal(state.phase, 'ROLL');
  assert.equal(engine.getActivePlayer()?.id, 'b');
});

test('negative trades and changed ownership cannot transfer cash or assets', () => {
  const engine = game();
  const offer = { fromPlayerId: 'a', toPlayerId: 'b', offeredMoney: -100, requestedMoney: 0, offeredProperties: [1], requestedProperties: [] };
  engine.getState().properties[1].ownerId = 'a';
  assert.equal(engine.proposeTrade(offer).success, false);
  assert.equal(engine.proposeTrade({ ...offer, offeredMoney: 10 }).success, true);
  const trade = engine.getState().activeTrade!;
  engine.getState().properties[1].ownerId = null;
  assert.equal(engine.respondTrade(trade.id, 'b', true).success, false);
  assert.equal(engine.getState().players[0].money, 1500);
});
test('insolvent bots mortgage property and then go bankrupt instead of looping', () => {
  const engine = new GameEngine('TEST', [player('a', true), player('b')]);
  engine.getState().players[0].money = -1000;
  engine.getState().properties[1].ownerId = 'a';
  engine.getState().phase = 'END_TURN';
  assert.equal(stepBotOrAuction(engine), true);
  assert.equal(engine.getState().properties[1].mortgaged, true);
  assert.equal(stepBotOrAuction(engine), true);
  assert.equal(engine.getState().phase, 'GAME_OVER');
  assert.equal(engine.getState().winnerId, 'b');
});
test('easy bots spend more freely while strategic bots protect a cash reserve', () => {
  const tile = getBoardTiles(40)[1];
  const easy = new GameEngine('EASY', [player('bot', true, 'easy'), player('human')]);
  const strategic = new GameEngine('STRATEGIC', [player('bot', true, 'strategic'), player('human')]);
  for (const engine of [easy, strategic]) {
    engine.getState().players[0].position = tile.id;
    engine.getState().players[0].money = (tile.price || 0) + 150;
    engine.getState().phase = 'ACTION';
  }

  easy.botStep();
  strategic.botStep();
  assert.equal(easy.getState().properties[tile.id].ownerId, 'bot');
  assert.equal(strategic.getState().properties[tile.id].ownerId, null);
  assert.ok(strategic.getState().logs.some(entry => entry.message.includes('Reserve')));
});

test('strategic bots buy a property that unlocks building and choose one high-return upgrade', () => {
  const engine = new GameEngine('STRATEGIC', [player('bot', true, 'strategic'), player('human')], { propertyBuildMode: 'quick' });
  const state = engine.getState();
  const tile = getBoardTiles(40)[1];
  const group = propertyGroup(tile.color!, tile.id);
  for (const id of group.filter(id => id !== tile.id)) state.properties[id].ownerId = 'bot';
  state.players[0].position = tile.id;
  state.players[0].money = (tile.price || 0) + 150;
  state.phase = 'ACTION';
  engine.botStep();
  assert.equal(state.properties[tile.id].ownerId, 'bot');
  assert.ok(state.logs.some(entry => entry.message.includes('Hausbau in der Farbgruppe')));

  state.phase = 'END_TURN';
  state.players[0].money = 3000;
  engine.botStep();
  assert.equal(Object.values(state.properties).reduce((sum, property) => sum + property.houses, 0), 1);
  assert.ok(state.logs.some(entry => entry.message.includes('möglicher Mehrertrag')));
});

test('strategic bots mortgage outside a buildable color group first', () => {
  const engine = new GameEngine('STRATEGIC', [player('bot', true, 'strategic'), player('human')]);
  const state = engine.getState();
  const group = propertyGroup(getBoardTiles(40)[1].color!, 1);
  for (const id of group) state.properties[id].ownerId = 'bot';
  state.properties[5].ownerId = 'bot';
  state.players[0].money = -100;
  state.phase = 'END_TURN';

  engine.botStep();
  assert.equal(state.properties[5].mortgaged, true);
  assert.equal(group.some(id => state.properties[id].mortgaged), false);
});

test('strategic bots evaluate and explain incoming trades', () => {
  const engine = new GameEngine('TRADE', [player('bot', true, 'strategic'), player('human')]);
  const state = engine.getState();
  state.properties[1].ownerId = 'bot';
  state.properties[3].ownerId = 'human';
  const badOffer = engine.proposeTrade({
    fromPlayerId: 'human', toPlayerId: 'bot', offeredMoney: 1, offeredProperties: [],
    requestedMoney: 0, requestedProperties: [1],
  });
  assert.equal(badOffer.success, true);
  assert.equal(engine.botTradeStep(engine.pendingTrades()[0].id), true);
  assert.equal(state.properties[1].ownerId, 'bot');

  const goodOffer = engine.proposeTrade({
    fromPlayerId: 'human', toPlayerId: 'bot', offeredMoney: 0, offeredProperties: [3],
    requestedMoney: 0, requestedProperties: [],
  });
  assert.equal(goodOffer.success, true);
  assert.equal(engine.botTradeStep(engine.pendingTrades()[0].id), true);
  assert.equal(state.properties[3].ownerId, 'bot');
  assert.ok(state.logs.some(entry => entry.message.includes('Vorteil ca.')));
});
test('bankruptcy clears the eliminated player’s doubles and pending card', () => {
  const engine = new GameEngine('TEST', [player('a'), player('b'), player('c')]);
  engine.getState().doublesCount = 2;
  engine.getState().hasRolled = true;
  engine.declareBankruptcy('a');
  assert.equal(engine.getActivePlayer()?.id, 'b');
  assert.equal(engine.getState().doublesCount, 0);
  assert.equal(engine.getState().hasRolled, false);
});
test('bots can complete repeated turns across restored server requests', (context) => {
  let seed = 42;
  context.mock.method(Math, 'random', () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; });
  let sawPurchase = false;
  let engine = new GameEngine('TEST', [player('a', true), player('b', true)]);
  for (let i = 0; i < 300 && engine.getState().phase !== 'GAME_OVER'; i++) {
    assert.equal(stepBotOrAuction(engine), true);
    sawPurchase ||= engine.getState().logs.some(entry => entry.type === 'purchase');
    engine = GameEngine.restore(JSON.parse(JSON.stringify(engine.snapshot())));
  }
  assert.ok(sawPurchase);
});

test('bot difficulty policies remain valid across all board sizes', context => {
  let seed = 127;
  context.mock.method(Math, 'random', () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; });
  for (const boardSize of [40, 80, 120]) {
    for (const difficulty of ['easy', 'balanced', 'strategic'] as const) {
      const engine = new GameEngine(`BOT-${boardSize}-${difficulty}`, [
        player('bot-a', true, difficulty), player('bot-b', true, difficulty),
      ], { boardSize });
      for (let action = 0; action < 200 && engine.getState().phase !== 'GAME_OVER'; action += 1) {
        assert.equal(stepBotOrAuction(engine), true);
        const state = engine.getState();
        assert.ok(state.players.every(candidate => Number.isFinite(candidate.money)));
        assert.ok(state.players.every(candidate => candidate.position >= 0 && candidate.position < boardSize));
        assert.ok(Object.values(state.properties).every(property => property.houses >= 0 && property.houses <= 5));
      }
    }
  }
});

test('human deadline survives restore and rolls exactly once after 25 seconds', context => {
  context.mock.method(Math, 'random', () => 0.3);
  const engine = game();
  const deadline = engine.getState().turnDeadline!;
  const restored = GameEngine.restore(JSON.parse(JSON.stringify(engine.snapshot())));
  assert.equal(restored.timeoutStep(deadline - 1), false);
  assert.equal(restored.getState().hasRolled, false);
  assert.equal(restored.timeoutStep(deadline), true);
  assert.equal(restored.getState().hasRolled, true);
  const rollCount = restored.getState().logs.filter(log => log.type === 'roll').length;
  assert.equal(restored.timeoutStep(deadline + 1), false);
  assert.equal(restored.getState().logs.filter(log => log.type === 'roll').length, rollCount);
  assert.equal(restored.getState().turnDeadline, deadline + 25_000);
});

test('expired purchase starts an auction without spending money or advancing the turn', () => {
  const engine = game();
  const state = engine.getState();
  state.players[0].position = 1;
  state.phase = 'ACTION';
  engine.syncTurnClock(1000);
  engine.timeoutStep(26_000);
  assert.equal(state.properties[1].ownerId, null);
  assert.equal(state.players[0].money, 1500);
  assert.equal(state.phase, 'AUCTION');
  assert.equal(engine.getActivePlayer()?.id, 'a');
  assert.equal(state.turnDeadline, undefined);
});

test('manual phase changes get a fresh clock but repeated polls and chats do not', () => {
  const engine = game();
  const initial = engine.getState().turnDeadline!;
  engine.addLog('Hello', 'chat');
  assert.equal(engine.syncTurnClock(initial - 500), false);
  engine.getState().phase = 'END_TURN';
  assert.equal(engine.syncTurnClock(initial - 500), true);
  assert.equal(engine.getState().turnDeadline, initial + 24_500);
  engine.timeoutStep(initial + 24_500);
  assert.equal(engine.getActivePlayer()?.id, 'b');
});

test('expired debt liquidates legal assets and cannot stall the next player', () => {
  const engine = game();
  engine.getState().phase = 'END_TURN';
  engine.getState().players[0].money = -5000;
  engine.getState().properties[1].ownerId = 'a';
  engine.syncTurnClock(1000);
  engine.timeoutStep(26_000);
  assert.equal(engine.getState().players[0].bankrupt, true);
  assert.equal(engine.getState().phase, 'GAME_OVER');
  assert.equal(engine.getState().turnDeadline, undefined);
});

test('expired doubles keep the extra roll and start a fresh countdown', () => {
  const engine = game();
  const state = engine.getState();
  state.phase = 'END_TURN';
  state.hasRolled = true;
  state.dice = [3, 3];
  state.doublesCount = 1;
  engine.syncTurnClock(1000);
  engine.timeoutStep(26_000);
  assert.equal(engine.getActivePlayer()?.id, 'a');
  assert.equal(state.phase, 'ROLL');
  assert.equal(state.turnDeadline, 51_000);
});
