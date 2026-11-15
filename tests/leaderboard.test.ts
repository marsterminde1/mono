import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRankedGame,
  LEADERBOARD_ACHIEVEMENTS,
  toPublicLeaderboardRecord,
  toPublicRankedLeaderboardRecord,
} from '../src/lib/leaderboard.js';

test('only a human-only match with a human winner is eligible for ranking', () => {
  const humans = [{ id: 'human-1' }, { id: 'human-2' }];
  assert.equal(isRankedGame(humans, 'human-1'), true);
  assert.equal(isRankedGame([{ id: 'human-1' }], 'human-1'), false);
  assert.equal(isRankedGame([...humans, { id: 'bot-1', isBot: true }], 'human-1'), false);
  assert.equal(isRankedGame(humans, 'unknown'), false);
});

test('public leaderboard records use anonymous names and derive achievements from ranked totals', () => {
  const record = toPublicLeaderboardRecord({
    id: 'player-123456abcdef',
    username: 'Chosen Impersonation Name',
    wins: 3,
    gamesPlayed: 5,
    updatedAt: new Date('2026-11-15T00:00:00.000Z'),
  });

  assert.equal(record.username, 'Spieler-ABCDEF');
  assert.deepEqual(record.achievements, LEADERBOARD_ACHIEVEMENTS.slice(0, 4).map(achievement => achievement.id));
  assert.equal(record.updatedAt, '2026-11-15T00:00:00.000Z');
});

test('achievement thresholds do not unlock early', () => {
  const record = toPublicLeaderboardRecord({
    id: 'player-123456abcdef',
    username: 'Ignored',
    wins: 0,
    gamesPlayed: 4,
    updatedAt: '2026-11-15T00:00:00.000Z',
  });

  assert.deepEqual(record.achievements, ['first-game']);
});

test('public rankings use only newly verified counters, not legacy totals', () => {
  const recordWithLegacyTotals = {
    id: 'player-123456abcdef',
    username: 'Ignored',
    wins: 99,
    gamesPlayed: 100,
    totalCashEarned: 1_000_000,
    rankedWins: 1,
    rankedGamesPlayed: 2,
    updatedAt: '2026-11-15T00:00:00.000Z',
  };
  const record = toPublicRankedLeaderboardRecord(recordWithLegacyTotals);

  assert.equal(record.wins, 1);
  assert.equal(record.gamesPlayed, 2);
  assert.deepEqual(record.achievements, ['first-game', 'first-win']);
});
