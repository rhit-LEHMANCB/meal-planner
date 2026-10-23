CREATE TYPE "public"."meal_slot" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TABLE "food_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"slot" "meal_slot",
	"label" text NOT NULL,
	"recipe_id" uuid,
	"food_id" uuid,
	"servings" numeric(6, 2) DEFAULT '1' NOT NULL,
	"kcal" numeric(8, 2) NOT NULL,
	"protein_g" numeric(8, 2) NOT NULL,
	"carbs_g" numeric(8, 2) NOT NULL,
	"fat_g" numeric(8, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"grams" numeric(9, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"source" text DEFAULT 'custom' NOT NULL,
	"source_id" text,
	"kcal_per_100g" numeric(7, 2) NOT NULL,
	"protein_per_100g" numeric(7, 2) NOT NULL,
	"carbs_per_100g" numeric(7, 2) NOT NULL,
	"fat_per_100g" numeric(7, 2) NOT NULL,
	"aisle" text
);
--> statement-breakpoint
CREATE TABLE "grocery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"food_id" uuid,
	"name" text NOT NULL,
	"quantity" numeric(9, 3),
	"unit" text,
	"aisle" text,
	"checked" boolean DEFAULT false NOT NULL,
	"for_meals" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grocery_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leftover_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"recipe_id" uuid NOT NULL,
	"cooked_on" date NOT NULL,
	"servings_cooked" integer NOT NULL,
	"servings_remaining" integer NOT NULL,
	"eat_by" date
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"week_start" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_goals" (
	"user_id" text PRIMARY KEY NOT NULL,
	"kcal" integer DEFAULT 2000 NOT NULL,
	"protein_g" integer DEFAULT 140 NOT NULL,
	"carbs_g" integer DEFAULT 230 NOT NULL,
	"fat_g" integer DEFAULT 70 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pantry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"food_id" uuid NOT NULL,
	"is_staple" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planned_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"date" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"recipe_id" uuid NOT NULL,
	"servings" integer DEFAULT 1 NOT NULL,
	"is_leftover" boolean DEFAULT false NOT NULL,
	"leftover_batch_id" uuid
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"food_id" uuid,
	"raw_text" text NOT NULL,
	"quantity" numeric(9, 3),
	"unit" text,
	"note" text,
	"match_status" text DEFAULT 'check' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"servings" integer NOT NULL,
	"total_minutes" integer,
	"source_url" text,
	"instructions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_log" ADD CONSTRAINT "food_log_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_log" ADD CONSTRAINT "food_log_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_units" ADD CONSTRAINT "food_units_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_items" ADD CONSTRAINT "grocery_items_list_id_grocery_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."grocery_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_items" ADD CONSTRAINT "grocery_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_lists" ADD CONSTRAINT "grocery_lists_plan_id_meal_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leftover_batches" ADD CONSTRAINT "leftover_batches_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meals" ADD CONSTRAINT "planned_meals_plan_id_meal_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meals" ADD CONSTRAINT "planned_meals_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_meals" ADD CONSTRAINT "planned_meals_leftover_batch_id_leftover_batches_id_fk" FOREIGN KEY ("leftover_batch_id") REFERENCES "public"."leftover_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_log_user_date_idx" ON "food_log" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "foods_name_idx" ON "foods" USING btree ("name");--> statement-breakpoint
CREATE INDEX "meal_plans_user_week_idx" ON "meal_plans" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "planned_meals_plan_idx" ON "planned_meals" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "recipes_user_idx" ON "recipes" USING btree ("user_id");