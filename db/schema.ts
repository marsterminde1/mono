import { pgTable, text, jsonb, integer, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';
import type { LobbyRoom } from '../src/types/game';
import type { GameEngine } from '../src/game/GameEngine';
export const rooms = pgTable('game_rooms', {
  id: text().primaryKey(),
  lobby: jsonb().$type<LobbyRoom>().notNull(),
  engine: jsonb().$type<ReturnType<GameEngine['snapshot']>>(),
  revision: integer().notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
export const scores = pgTable('game_scores', {
  id: text().primaryKey(),
  username: text().notNull(),
  wins: integer().notNull().default(0),
  gamesPlayed: integer('games_played').notNull().default(0),
  totalCashEarned: integer('total_cash_earned').notNull().default(0),
  rankedWins: integer('ranked_wins').notNull().default(0),
  rankedGamesPlayed: integer('ranked_games_played').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const accounts = pgTable('accounts', {
  id: text().primaryKey(),
  googleSub: text('google_sub').notNull().unique(),
  email: text().notNull(),
  displayName: text('display_name').notNull(),
  playerId: text('player_id').notNull().unique(),
  ageStatus: text('age_status').notNull().default('unknown'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const accountSessions = pgTable('account_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, table => [index('account_sessions_account_id_idx').on(table.accountId)]);

export const subscriptions = pgTable('subscriptions', {
  id: text().primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  provider: text().notNull(),
  providerSubscriptionId: text('provider_subscription_id').notNull().unique(),
  plan: text().notNull(),
  status: text().notNull(),
  currentPeriodEnd: timestamp('current_period_end'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, table => [index('subscriptions_account_id_idx').on(table.accountId)]);

export const billingWebhookEvents = pgTable('billing_webhook_events', {
  provider: text().notNull(),
  eventId: text('event_id').notNull(),
  processedAt: timestamp('processed_at').notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.provider, table.eventId] })]);
