ALTER TABLE "import_usage" ADD COLUMN "match_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "import_usage" ADD COLUMN "match_day" date;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "grams_source" text;