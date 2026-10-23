CREATE TABLE "import_usage" (
	"user_id" text PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"ai_count" integer DEFAULT 0 NOT NULL,
	"last_import_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "name" text;