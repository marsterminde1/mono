import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSkipUnchangedPoll } from '../netlify/functions/_shared/polling.mjs';

const idlePoll = {
  revision: 4,
  clientRevision: 4,
  phase: 'ROLL',
  activePlayerIsBot: false,
  turnSeconds: 25,
  turnDeadline: 20_000,
  turnClockReady: true,
  hasPendingTrades: false,
  auctionEndsAt: null,
  nextAuctionBotActionAt: null,
};

test('unchanged poll can be skipped while a human turn is still active', () => {
  assert.equal(canSkipUnchangedPoll(idlePoll, 10_000), true);
});

test('poll is still processed when a bot, deadline, or pending trade needs a step', () => {
  assert.equal(canSkipUnchangedPoll({ ...idlePoll, activePlayerIsBot: true }, 10_000), false);
  assert.equal(canSkipUnchangedPoll({ ...idlePoll, turnDeadline: 10_000 }, 10_000), false);
  assert.equal(canSkipUnchangedPoll({ ...idlePoll, hasPendingTrades: true }, 10_000), false);
  assert.equal(canSkipUnchangedPoll({ ...idlePoll, turnDeadline: null }, 10_000), false);
  assert.equal(canSkipUnchangedPoll({ ...idlePoll, turnClockReady: false }, 10_000), false);
});

test('poll is not skipped for a stale client revision', () => {
  assert.equal(canSkipUnchangedPoll({ ...idlePoll, clientRevision: 3 }, 10_000), false);
});

test('active auctions only skip polls while no result or bot action is due', () => {
  const auctionPoll = { ...idlePoll, phase: 'AUCTION', auctionEndsAt: 20_000, nextAuctionBotActionAt: 15_000 };
  assert.equal(canSkipUnchangedPoll(auctionPoll, 10_000), true);
  assert.equal(canSkipUnchangedPoll(auctionPoll, 15_000), false);
  assert.equal(canSkipUnchangedPoll({ ...auctionPoll, auctionEndsAt: 10_000 }, 10_000), false);
});
