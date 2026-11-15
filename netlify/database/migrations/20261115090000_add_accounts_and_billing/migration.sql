CREATE TABLE "accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "google_sub" text NOT NULL UNIQUE,
  "email" text NOT NULL,
  "display_name" text NOT NULL,
  "player_id" text NOT NULL UNIQUE,
  "age_status" text DEFAULT 'unknown' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_sessions" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "player_id" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_sessions_account_id_idx" ON "account_sessions" ("account_id");
--> statement-breakpoint
CREATE TABLE "subscriptions" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "provider_subscription_id" text NOT NULL UNIQUE,
  "plan" text NOT NULL,
  "status" text NOT NULL,
  "current_period_end" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "subscriptions_account_id_idx" ON "subscriptions" ("account_id");
--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
  "provider" text NOT NULL,
  "event_id" text NOT NULL,
  "processed_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("provider", "event_id")
);
