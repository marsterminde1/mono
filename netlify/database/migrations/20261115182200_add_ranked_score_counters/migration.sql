ALTER TABLE "game_scores" ADD COLUMN "ranked_wins" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "game_scores" ADD COLUMN "ranked_games_played" integer DEFAULT 0 NOT NULL;
