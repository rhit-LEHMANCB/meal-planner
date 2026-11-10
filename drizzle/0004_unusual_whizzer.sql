CREATE TABLE "grocery_aisle_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name_key" text NOT NULL,
	"aisle" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grocery_items" ADD COLUMN "item_key" text;--> statement-breakpoint
ALTER TABLE "grocery_items" ADD COLUMN "is_extra" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "grocery_items" ADD COLUMN "ticked_amount" text;--> statement-breakpoint
CREATE UNIQUE INDEX "grocery_aisle_choices_user_name_unique" ON "grocery_aisle_choices" USING btree ("user_id","name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "grocery_items_list_key_unique" ON "grocery_items" USING btree ("list_id","item_key");--> statement-breakpoint
CREATE UNIQUE INDEX "grocery_lists_plan_unique" ON "grocery_lists" USING btree ("plan_id");