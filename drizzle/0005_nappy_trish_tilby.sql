ALTER TABLE "recipe_ingredients" ADD COLUMN "grams" numeric(9, 2);--> statement-breakpoint
CREATE UNIQUE INDEX "foods_source_source_id_unique" ON "foods" USING btree ("source","source_id");