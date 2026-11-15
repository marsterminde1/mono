import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectivePlan } from '../src/lib/plans';

const now = new Date('2026-01-01T00:00:00.000Z');

test('only active, unexpired membership records grant paid plans, with Pro taking precedence', () => {
  assert.equal(effectivePlan([], now), 'free');
  assert.equal(effectivePlan([{ plan: 'plus', status: 'active', currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z') }], now), 'plus');
  assert.equal(effectivePlan([
    { plan: 'plus', status: 'active', currentPeriodEnd: null },
    { plan: 'pro', status: 'trialing', currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z') },
  ], now), 'pro');
  assert.equal(effectivePlan([{ plan: 'pro', status: 'canceled', currentPeriodEnd: null }], now), 'free');
  assert.equal(effectivePlan([{ plan: 'plus', status: 'active', currentPeriodEnd: now }], now), 'free');
});
