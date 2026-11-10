ALTER TABLE "planned_meals" ALTER COLUMN "recipe_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leftover_batches" ADD COLUMN "cook_meal_id" uuid;--> statement-breakpoint
ALTER TABLE "leftover_batches" ADD COLUMN "thrown_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "planned_meals" ADD COLUMN "food_id" uuid;--> statement-breakpoint
ALTER TABLE "planned_meals" ADD COLUMN "quantity" numeric(9, 3);--> statement-breakpoint
ALTER TABLE "planned_meals" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "planned_meals" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leftover_batches" ADD CONSTRAINT "leftover_batches_cook_meal_id_planned_meals_id_fk" FOREIGN KEY ("cook_meal_id") REFERENCES "public"."planned_meals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meals" ADD CONSTRAINT "planned_meals_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "foods_user_idx" ON "foods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "leftover_batches_user_idx" ON "leftover_batches" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_plans_user_week_unique" ON "meal_plans" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "planned_meals_batch_idx" ON "planned_meals" USING btree ("leftover_batch_id");--> statement-breakpoint
ALTER TABLE "leftover_batches" ADD CONSTRAINT "leftover_batches_cook_meal_id_unique" UNIQUE("cook_meal_id");