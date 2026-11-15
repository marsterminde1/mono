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
  engine.getState().matchMissions!.a.completed.push('buy_property');
  engine.rollDice('a');
  const snapshot = JSON.parse(JSON.stringify(engine.snapshot()));
  const restored = GameEngine.restore(snapshot);
  assert.deepEqual(restored.snapshot(), snapshot);
  assert.deepEqual(restored.getState().matchMissions?.a?.completed, ['buy_property']);
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

test('buying a property completes one match mission and pays the bonus only once', () => {
  const engine = game();
  const state = engine.getState();
  const tile = getBoardTiles(40)[1];
  state.players[0].position = tile.id;
  state.phase = 'ACTION';

  assert.equal(engine.buyProperty('a', tile.id).success, true);
  assert.equal(state.players[0].money, 1500 - tile.price! + 50);
  assert.deepEqual(state.matchMissions?.a?.completed, ['buy_property']);

  const secondTile = getBoardTiles(40)[3];
  state.players[0].position = secondTile.id;
  state.phase = 'ACTION';
  const beforeSecondPurchase = state.players[0].money;
  assert.equal(engine.buyProperty('a', secondTile.id).success, true);
  assert.equal(state.players[0].money, beforeSecondPurchase - secondTile.price!);
  assert.deepEqual(state.matchMissions?.a?.completed, ['buy_property']);
});

test('winning an auction can complete the property mission', () => {
  const engine = game();
  const state = engine.getState();
  state.players[0].position = 1;
  state.phase = 'ACTION';
  assert.equal(engine.declineProperty('a').success, true);
  assert.equal(engine.bidOnAuction('a', 10).success, true);
  const endsAt = state.auction!.endsAt;

  assert.equal(engine.auctionStep(endsAt), true);
  assert.equal(state.properties[1].ownerId, 'a');
  assert.equal(state.players[0].money, 1500 - 10 + 50);
  assert.deepEqual(state.matchMissions?.a?.completed, ['buy_property']);
});

test('building earns the mission bonus once and passing GO completes its mission', () => {
  const engine = new GameEngine('MISSIONS', [player('a'), player('b')], { propertyBuildMode: 'quick' });
  const state = engine.getState();
  const tile = getBoardTiles(40)[1];
  const group = propertyGroup(tile.color!, tile.id);
  group.forEach(id => { state.properties[id].ownerId = 'a'; });
  state.players[0].money = 1000;

  assert.equal(engine.buildHouse('a', group[0]).success, true);
  assert.equal(engine.buildHouse('a', group[1]).success, true);
  assert.equal(state.players[0].money, 1000 - 2 * tile.houseCost! + 50);
  assert.deepEqual(state.matchMissions?.a?.completed, ['build_house']);

  state.players[0].position = 39;
  state.phase = 'ROLL';
  assert.equal(engine.rollDice('a').success, true);
  assert.ok(state.matchMissions?.a?.completed.includes('pass_go'));
  assert.ok(state.logs.some(entry => entry.message.includes('Mission „Runde drehen“')));
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

test('landmark upgrades need the full unmortgaged set and add half the hotel rent', () => {
  const engine = new GameEngine('LANDMARK', [player('a'), player('b')], {
    propertyBuildMode: 'quick',
    propertyUpgradeMode: 'landmark',
  });
  const state = engine.getState();
  const tile = getBoardTiles(40)[1];
  const group = propertyGroup(tile.color!, tile.id);
  const houseCost = tile.houseCost!;
  const upgradeCost = houseCost * 3;
  for (const id of group) {
    state.properties[id].ownerId = 'a';
    state.properties[id].houses = 5;
  }
  state.properties[group[1]].mortgaged = true;
  state.players[0].money = upgradeCost * 2;

  assert.equal(engine.buildLandmark('a', tile.id).success, false);
  assert.equal(state.properties[tile.id].landmark, undefined);
  state.properties[group[1]].mortgaged = false;
  state.players[0].money = upgradeCost - 1;
  assert.equal(engine.buildLandmark('a', tile.id).success, false);
  assert.equal(state.properties[tile.id].landmark, undefined);
  state.players[0].money = upgradeCost;
  assert.equal(engine.buildLandmark('a', tile.id).success, true);
  assert.equal(state.players[0].money, 0);
  assert.equal(state.properties[tile.id].landmark, true);
  assert.equal(engine.calculateRent(tile, state.properties[tile.id], state.players[0]), Math.round(tile.rent![5] * 1.5));
});

test('landmark sale refunds half the upgrade cost and leaves the hotel intact', () => {
  const engine = new GameEngine('LANDMARK_SELL', [player('a'), player('b')], { propertyUpgradeMode: 'landmark' });
  const state = engine.getState();
  const tile = getBoardTiles(40)[1];
  const group = propertyGroup(tile.color!, tile.id);
  for (const id of group) {
    state.properties[id].ownerId = 'a';
    state.properties[id].houses = 5;
  }
  state.properties[tile.id].landmark = true;
  state.players[0].money = 0;

  assert.equal(engine.sellHouse('a', tile.id).success, true);
  assert.equal(state.players[0].money, Math.floor(tile.houseCost! * 3 / 2));
  assert.equal(state.properties[tile.id].landmark, false);
  assert.equal(state.properties[tile.id].houses, 5);
  assert.equal(engine.calculateRent(tile, state.properties[tile.id], state.players[0]), tile.rent![5]);
});

test('landmark upgrades are disabled by default and always require the full color group', () => {
  const engine = new GameEngine('LANDMARK_RULES', [player('a'), player('b')], {
    propertyBuildMode: 'quick',
    propertyUpgradeMode: 'landmark',
  });
  const state = engine.getState();
  const tile = getBoardTiles(40)[1];
  const group = propertyGroup(tile.color!, tile.id);
  state.players[0].money = 10000;
  state.properties[tile.id].ownerId = 'a';
  state.properties[tile.id].houses = 5;

  assert.equal(engine.buildLandmark('a', tile.id).success, false);
  assert.equal(state.properties[tile.id].landmark, undefined);

  const standard = new GameEngine('LANDMARK_DISABLED', [player('a'), player('b')]);
  const standardTile = getBoardTiles(40)[1];
  for (const id of propertyGroup(standardTile.color!, standardTile.id)) {
    standard.getState().properties[id].ownerId = 'a';
    standard.getState().properties[id].houses = 5;
  }
  assert.equal(standard.buildLandmark('a', standardTile.id).success, false);
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
  assert.equal(state.players[1].money, 1530);
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

test('city event votes stay open during play and can be changed until the round ends', () => {
  const engine = new GameEngine('CITY_EVENTS', [player('human'), player('bot', true)]);
  const state = engine.getState();
  assert.equal(state.roundNumber, 1);
  assert.equal(state.cityEventVote?.forRound, 2);
  assert.equal(state.cityEventVote?.votes.bot, 'city_dividend');

  assert.equal(engine.voteForCityEvent('human', 'building_discount').success, true);
  assert.equal(state.phase, 'ROLL');
  assert.equal(state.cityEventVote?.votes.human, 'building_discount');
  assert.equal(engine.voteForCityEvent('human', 'city_dividend').success, true);
  assert.equal(state.cityEventVote?.votes.human, 'city_dividend');
  state.players[0].bankrupt = true;
  assert.equal(engine.voteForCityEvent('human', 'city_dividend').success, false);
});

test('winning city event applies at the round boundary and opens the next vote', () => {
  const engine = new GameEngine('CITY_EVENT_DIVIDEND', [player('a'), player('b'), player('c')]);
  const state = engine.getState();
  state.players.forEach(candidate => { candidate.money = 1000; });
  for (const candidate of state.players) engine.voteForCityEvent(candidate.id, 'city_dividend');
  state.activePlayerIndex = 2;
  state.phase = 'END_TURN';

  assert.equal(engine.endTurn('c').success, true);
  assert.equal(state.roundNumber, 2);
  assert.equal(state.activePlayerIndex, 0);
  assert.deepEqual(state.players.map(candidate => candidate.money), [1025, 1025, 1025]);
  assert.equal(state.activeCityEvent?.id, 'city_dividend');
  assert.equal(state.activeCityEvent?.round, 2);
  assert.equal(state.cityEventVote?.forRound, 3);
});

test('bankrupt round starters are skipped without triggering a premature event', () => {
  const engine = new GameEngine('CITY_EVENT_BANKRUPTCY', [player('a'), player('b'), player('c')]);
  const state = engine.getState();
  assert.equal(engine.declareBankruptcy('a').success, true);
  assert.equal(state.roundNumber, 1);
  assert.equal(state.roundStartPlayerId, 'b');
  engine.voteForCityEvent('b', 'building_discount');
  engine.voteForCityEvent('c', 'building_discount');
  state.activePlayerIndex = 2;
  state.phase = 'END_TURN';

  assert.equal(engine.endTurn('c').success, true);
  assert.equal(state.roundNumber, 2);
  assert.equal(state.roundStartPlayerId, 'b');
  assert.equal(state.activePlayerIndex, 1);
  assert.equal(state.cityEventBuildDiscounts?.b, 1);
  assert.equal(state.cityEventBuildDiscounts?.c, 1);
});

test('building subsidy discounts only the first house built in that round', () => {
  const engine = new GameEngine('CITY_EVENT_BUILD', [player('a'), player('b'), player('c')]);
  const state = engine.getState();
  for (const candidate of state.players) engine.voteForCityEvent(candidate.id, 'building_discount');
  state.activePlayerIndex = 2;
  state.phase = 'END_TURN';
  assert.equal(engine.endTurn('c').success, true);

  const group = propertyGroup(getBoardTiles(40)[1].color!, 1);
  for (const tileId of group) state.properties[tileId].ownerId = 'a';
  state.players[0].money = 1000;
  const houseCost = getBoardTiles(40)[group[0]].houseCost!;
  assert.equal(engine.buildHouse('a', group[0]).success, true);
  assert.equal(state.players[0].money, 1000 - houseCost + 25 + 50);
  assert.equal(state.cityEventBuildDiscounts?.a, 0);
  assert.equal(engine.buildHouse('a', group[1]).success, true);
  assert.equal(state.players[0].money, 1000 - houseCost * 2 + 25 + 50);
});

test('legacy snapshots receive a safe city event vote state', () => {
  const snapshot = game().snapshot();
  delete snapshot.state.roundNumber;
  delete snapshot.state.roundStartPlayerId;
  delete snapshot.state.cityEventVote;
  delete snapshot.state.activeCityEvent;
  delete snapshot.state.cityEventBuildDiscounts;
  delete snapshot.state.propertyUpgradeMode;
  delete snapshot.state.matchMissions;
  const restored = GameEngine.restore(snapshot);
  assert.equal(restored.getState().roundNumber, 1);
  assert.equal(restored.getState().roundStartPlayerId, 'a');
  assert.equal(restored.getState().cityEventVote?.forRound, 2);
  assert.equal(restored.getState().propertyUpgradeMode, 'standard');
  assert.deepEqual(restored.getState().matchMissions?.a?.completed, []);
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

test('bots can build a landmark when no regular hotel upgrade remains', () => {
  const engine = new GameEngine('BOT_LANDMARK', [player('bot', true, 'strategic'), player('human')], {
    propertyUpgradeMode: 'landmark',
  });
  const state = engine.getState();
  const tile = getBoardTiles(40)[1];
  const group = propertyGroup(tile.color!, tile.id);
  for (const id of group) {
    state.properties[id].ownerId = 'bot';
    state.properties[id].houses = 5;
  }
  state.players[0].money = 10000;
  state.phase = 'END_TURN';

  assert.equal(engine.botStep(), true);
  assert.ok(group.some(id => state.properties[id].landmark));
  assert.ok(state.logs.some(entry => entry.message.includes('Wahrzeichen')));
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
