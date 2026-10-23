import {
	type AnyPgColumn,
	boolean,
	date,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

// `user_id` columns hold the Firebase Auth uid. Every query on user data must filter by it.

export const mealSlot = pgEnum('meal_slot', ['breakfast', 'lunch', 'dinner', 'snack']);

/** Nutrition reference data. `user_id` null = shared (USDA / Open Food Facts import). */
export const foods = pgTable(
	'foods',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id'),
		name: text('name').notNull(),
		source: text('source').notNull().default('custom'), // 'usda' | 'off' | 'custom'
		sourceId: text('source_id'),
		kcalPer100g: numeric('kcal_per_100g', { precision: 7, scale: 2 }).notNull(),
		proteinPer100g: numeric('protein_per_100g', { precision: 7, scale: 2 }).notNull(),
		carbsPer100g: numeric('carbs_per_100g', { precision: 7, scale: 2 }).notNull(),
		fatPer100g: numeric('fat_per_100g', { precision: 7, scale: 2 }).notNull(),
		aisle: text('aisle')
	},
	(t) => [index('foods_name_idx').on(t.name), index('foods_user_idx').on(t.userId)]
);

/** Unit conversions per food: 1 cup of flour = 120 g, 1 each onion = 110 g. */
export const foodUnits = pgTable('food_units', {
	id: uuid('id').primaryKey().defaultRandom(),
	foodId: uuid('food_id')
		.notNull()
		.references(() => foods.id, { onDelete: 'cascade' }),
	unit: text('unit').notNull(),
	grams: numeric('grams', { precision: 9, scale: 2 }).notNull()
});

export const recipes = pgTable(
	'recipes',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id').notNull(),
		title: text('title').notNull(),
		servings: integer('servings').notNull(),
		totalMinutes: integer('total_minutes'),
		sourceUrl: text('source_url'),
		instructions: text('instructions').array().notNull().default([]),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [index('recipes_user_idx').on(t.userId)]
);

export const recipeIngredients = pgTable('recipe_ingredients', {
	id: uuid('id').primaryKey().defaultRandom(),
	recipeId: uuid('recipe_id')
		.notNull()
		.references(() => recipes.id, { onDelete: 'cascade' }),
	foodId: uuid('food_id').references(() => foods.id),
	rawText: text('raw_text').notNull(),
	/** Display order within the recipe, starting at 0. */
	position: integer('position').notNull().default(0),
	quantity: numeric('quantity', { precision: 9, scale: 3 }),
	unit: text('unit'),
	/** Plain ingredient name without amount or prep notes. Null on rows saved before structured rows. */
	name: text('name'),
	note: text('note'),
	/**
	 * 'parsed' | 'check' | 'skipped': drives the row chip. 'unparsed' marks rows saved as plain
	 * text before structured rows existed; the edit form pre-fills them with the line parser.
	 */
	matchStatus: text('match_status').notNull().default('check')
});

/** One row per user: the AI import count for `day` (UTC) and the time of their last import. */
export const importUsage = pgTable('import_usage', {
	userId: text('user_id').primaryKey(),
	day: date('day').notNull(),
	aiCount: integer('ai_count').notNull().default(0),
	lastImportAt: timestamp('last_import_at', { withTimezone: true }).notNull()
});

export const mealPlans = pgTable(
	'meal_plans',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id').notNull(),
		weekStart: date('week_start').notNull()
	},
	(t) => [
		index('meal_plans_user_week_idx').on(t.userId, t.weekStart),
		uniqueIndex('meal_plans_user_week_unique').on(t.userId, t.weekStart)
	]
);

/** A cooked batch that later meals can draw leftovers from. */
export const leftoverBatches = pgTable(
	'leftover_batches',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id').notNull(),
		recipeId: uuid('recipe_id')
			.notNull()
			.references(() => recipes.id),
		cookedOn: date('cooked_on').notNull(),
		servingsCooked: integer('servings_cooked').notNull(),
		/**
		 * Free servings: spare (cooked minus eaten at the cook) minus servings drawn by planned
		 * leftovers. Only ever changed by conditional single-statement updates, so it never goes below 0.
		 */
		servingsRemaining: integer('servings_remaining').notNull(),
		eatBy: date('eat_by'),
		/** The planned cook that made this batch. */
		cookMealId: uuid('cook_meal_id')
			.unique()
			.references((): AnyPgColumn => plannedMeals.id, { onDelete: 'set null' }),
		thrownOutAt: timestamp('thrown_out_at', { withTimezone: true })
	},
	(t) => [index('leftover_batches_user_idx').on(t.userId)]
);

export const plannedMeals = pgTable(
	'planned_meals',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		planId: uuid('plan_id')
			.notNull()
			.references(() => mealPlans.id, { onDelete: 'cascade' }),
		date: date('date').notNull(),
		slot: mealSlot('slot').notNull(),
		/** Set for cooks and leftovers (a leftover carries its batch's recipe). Null for foods. */
		recipeId: uuid('recipe_id').references(() => recipes.id),
		/** Cook: servings eaten at this meal. Leftover: servings drawn from the batch. */
		servings: integer('servings').notNull().default(1),
		/** Leftover meals draw from a batch and add nothing to the grocery list. */
		isLeftover: boolean('is_leftover').notNull().default(false),
		leftoverBatchId: uuid('leftover_batch_id').references(() => leftoverBatches.id),
		/** Food entries: the food and its amount in `unit` ('g' or one of the food's units). */
		foodId: uuid('food_id').references(() => foods.id),
		quantity: numeric('quantity', { precision: 9, scale: 3 }),
		unit: text('unit'),
		/** Order within the slot, in the order entries were added. */
		position: integer('position').notNull().default(0)
	},
	(t) => [
		index('planned_meals_plan_idx').on(t.planId),
		index('planned_meals_batch_idx').on(t.leftoverBatchId)
	]
);

export const groceryLists = pgTable('grocery_lists', {
	id: uuid('id').primaryKey().defaultRandom(),
	planId: uuid('plan_id')
		.notNull()
		.references(() => mealPlans.id, { onDelete: 'cascade' })
});

export const groceryItems = pgTable('grocery_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	listId: uuid('list_id')
		.notNull()
		.references(() => groceryLists.id, { onDelete: 'cascade' }),
	foodId: uuid('food_id').references(() => foods.id),
	name: text('name').notNull(),
	quantity: numeric('quantity', { precision: 9, scale: 3 }),
	unit: text('unit'),
	aisle: text('aisle'),
	checked: boolean('checked').notNull().default(false),
	/** Meals that need this item, shown as "Turkey chili, Fish tacos". */
	forMeals: text('for_meals').array().notNull().default([])
});

export const pantryItems = pgTable('pantry_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id').notNull(),
	foodId: uuid('food_id')
		.notNull()
		.references(() => foods.id),
	/** Staples (oil, salt) never go on the grocery list. */
	isStaple: boolean('is_staple').notNull().default(false)
});

/** Macros are copied at log time so editing a recipe later does not rewrite history. */
export const foodLog = pgTable(
	'food_log',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id').notNull(),
		date: date('date').notNull(),
		slot: mealSlot('slot'),
		label: text('label').notNull(),
		recipeId: uuid('recipe_id').references(() => recipes.id),
		foodId: uuid('food_id').references(() => foods.id),
		servings: numeric('servings', { precision: 6, scale: 2 }).notNull().default('1'),
		kcal: numeric('kcal', { precision: 8, scale: 2 }).notNull(),
		proteinG: numeric('protein_g', { precision: 8, scale: 2 }).notNull(),
		carbsG: numeric('carbs_g', { precision: 8, scale: 2 }).notNull(),
		fatG: numeric('fat_g', { precision: 8, scale: 2 }).notNull()
	},
	(t) => [index('food_log_user_date_idx').on(t.userId, t.date)]
);

export const nutritionGoals = pgTable('nutrition_goals', {
	userId: text('user_id').primaryKey(),
	kcal: integer('kcal').notNull().default(2000),
	proteinG: integer('protein_g').notNull().default(140),
	carbsG: integer('carbs_g').notNull().default(230),
	fatG: integer('fat_g').notNull().default(70)
});
