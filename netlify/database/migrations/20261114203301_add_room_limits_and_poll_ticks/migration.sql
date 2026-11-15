CREATE TABLE "game_rate_limits" (
	"key" text PRIMARY KEY,
	"window_started_at" timestamp NOT NULL,
	"request_count" integer NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_rooms" ADD COLUMN "last_tick_at" timestamp;