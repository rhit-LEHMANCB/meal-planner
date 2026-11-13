## Purpose

Shows a signed-in user what their planned and logged meals add up to in calories and macros, per day and per week, against daily goals they set, with every number taken from the foods data.

## ADDED Requirements

### Requirement: Numbers come only from foods

The system SHALL compute every calorie and macro value from the per-100 g values of foods and the gram weights of amounts. It SHALL NOT use values produced by the AI model, and SHALL NOT estimate values for ingredients or entries that have no food or no gram weight.

#### Scenario: Unlinked ingredient adds nothing

- **WHEN** a recipe has a row "1 pinch saffron" that is not linked to a food
- **THEN** that row adds no calories or macros, and the recipe is shown as partial

### Requirement: An amount's weight in grams

The system SHALL convert an amount to grams with, in order: the weight units g, kg, oz and lb; a unit defined for the linked food (an amount with no unit uses the food's "each" unit); or, for an ingredient row, the weight in grams entered on that row. An amount none of these covers SHALL have no weight.

#### Scenario: Weight unit

- **WHEN** a row is "1 lb ground turkey" linked to a turkey food
- **THEN** its weight is 453.6 g

#### Scenario: Food unit

- **WHEN** a row is "2 cup rice" linked to a food whose cup unit is 185 g
- **THEN** its weight is 370 g

#### Scenario: Count with an each unit

- **WHEN** a row is "2 onions" with no unit, linked to a food whose each unit is 110 g
- **THEN** its weight is 220 g

#### Scenario: Grams entered on the row

- **WHEN** a row is "1 bunch cilantro" linked to a food with no bunch unit and the row's weight is 60 g
- **THEN** its weight is 60 g

### Requirement: Recipe nutrition per serving

The system SHALL compute a recipe's nutrition per serving as the sum of its rows that have a linked food and a weight, divided by the recipe's servings. A recipe SHALL be partial when any row with a name lacks a food or a weight, and SHALL report how many rows count out of how many.

#### Scenario: Full recipe

- **WHEN** a 2-serving recipe has 200 g of a food with 165 kcal per 100 g and 100 g of a food with 130 kcal per 100 g, both linked
- **THEN** one serving is 230 kcal and the recipe is not partial

#### Scenario: Partial recipe

- **WHEN** a recipe has 9 rows and 3 of them have no food or no weight
- **THEN** its nutrition counts the other 6 rows and it says 3 of 9 ingredients have no nutrition

#### Scenario: Nothing linked

- **WHEN** a recipe has no rows linked to a food
- **THEN** it says it has no nutrition yet and counts as 0 kcal, partial

### Requirement: Planned meals count toward their day

The system SHALL count each planned entry toward its date: a cook as servings eaten times the recipe's nutrition per serving, a leftover as servings drawn times its batch recipe's nutrition per serving, and a food entry as its weight times the food's per-100 g values. Planned values SHALL be computed from current recipe and food data each time. A day SHALL be partial when any of its entries is partial or has no weight.

#### Scenario: Day with a cook, a leftover and a food

- **WHEN** Monday has a cook eating 1 serving of a 230 kcal-per-serving recipe, a leftover drawing 2 servings of a 400 kcal-per-serving recipe, and 170 g of a food with 97 kcal per 100 g
- **THEN** Monday's total is 230 + 800 + 165 = 1,195 kcal

#### Scenario: Recipe edited after planning

- **WHEN** a recipe on next Tuesday's plan gains a linked ingredient
- **THEN** Tuesday's total includes the new ingredient the next time the page loads

### Requirement: Users see a week of nutrition

The system SHALL show the signed-in user a Nutrition page for one Monday-to-Sunday week given in the address, with previous, next and current-week controls. It SHALL show each day's calories split into planned cooks and foods, leftovers, and logged entries, against the daily calorie goal, and the week's average calories, protein, carbs and fat per day over the days that have any entry. Signed-out visitors SHALL be redirected to sign-in.

#### Scenario: Week chart

- **WHEN** a user opens the Nutrition page for a week with planned meals on Monday and Tuesday and a logged entry on Tuesday
- **THEN** Monday and Tuesday show their totals, Tuesday's includes the logged entry as its own part, and the other days show 0

#### Scenario: Average skips empty days

- **WHEN** only Monday (1,800 kcal) and Tuesday (2,200 kcal) have entries
- **THEN** the weekly average is 2,000 kcal

#### Scenario: Empty week

- **WHEN** a user opens a week with nothing planned or logged
- **THEN** the page shows 0 for every day and invites them to plan meals or log food

#### Scenario: Partial day marked

- **WHEN** a day includes a partial recipe
- **THEN** that day is marked partial on the page

### Requirement: Today against goals

When the shown week contains today, the system SHALL show today's calories with the goal and how many are left (or over), and today's protein, carbs and fat each against its goal.

#### Scenario: Calories left

- **WHEN** today totals 1,540 kcal and the calorie goal is 2,000
- **THEN** the page shows 1,540 of 2,000 kcal and 460 kcal left

#### Scenario: Over goal

- **WHEN** today totals 2,300 kcal and the goal is 2,000
- **THEN** the page shows 300 kcal over

### Requirement: Users can set daily goals

The system SHALL let a user save daily goals for calories (500 to 10,000 kcal) and protein, carbs and fat (0 to 1,000 g each), as whole numbers. A user who never saved goals SHALL see the defaults 2,000 kcal, 140 g protein, 230 g carbs and 70 g fat.

#### Scenario: Save goals

- **WHEN** a user saves 1,800 kcal, 150 g protein, 180 g carbs and 60 g fat
- **THEN** the today card, macro bars and the chart's goal line use them, and they are kept on the next visit

#### Scenario: Invalid goal

- **WHEN** a user saves 100 kcal
- **THEN** nothing is saved and the form shows the allowed range next to the field

### Requirement: Users can log food off the plan

The system SHALL let a user log a food with a positive amount and a unit (grams or one of the food's units), or one of their recipes with a positive number of servings, to any day of the shown week with an optional meal slot. The entry's calories and macros SHALL be fixed when it is logged. A food whose amount has no weight SHALL NOT be logged.

#### Scenario: Log a food

- **WHEN** a user logs 1 each of an apple food (each = 182 g, 52 kcal per 100 g) on Tuesday
- **THEN** Tuesday's logged part rises by 95 kcal and the entry is listed under Tuesday

#### Scenario: Log a recipe

- **WHEN** a user logs 1.5 servings of a 400 kcal-per-serving recipe on Wednesday
- **THEN** Wednesday's logged part rises by 600 kcal

#### Scenario: Snapshot at log time

- **WHEN** a user logs a recipe and later adds an ingredient to that recipe
- **THEN** the log entry keeps the calories it had when logged

#### Scenario: Invalid amount

- **WHEN** a user logs 0 g of a food
- **THEN** nothing is saved and the form shows that the amount must be more than 0

### Requirement: Users can delete a log entry

The system SHALL let a user delete one of their log entries from the Nutrition page; the day's totals SHALL drop by that entry.

#### Scenario: Delete

- **WHEN** a user deletes Tuesday's apple entry
- **THEN** it is no longer listed and Tuesday's total no longer includes it

### Requirement: Nutrition data is private

The system SHALL show and change log entries and goals only for the user who owns them, and SHALL accept only the user's own recipes and the foods they can see when logging. A request naming another user's log entry, recipe or custom food SHALL behave exactly like one naming something that does not exist.

#### Scenario: Another user's log entry

- **WHEN** a user submits a delete naming another user's log entry
- **THEN** the entry is unchanged and the response is the same as for a missing entry

#### Scenario: Another user's recipe

- **WHEN** a user logs a recipe id owned by someone else
- **THEN** nothing is saved and the response is the same as for a missing recipe

#### Scenario: Weeks are per user

- **WHEN** two users have plans and logs for the same week
- **THEN** each user's Nutrition page shows only their own

### Requirement: Data source is credited

The Nutrition page SHALL credit USDA FoodData Central as the source of the shared food data.

#### Scenario: Credit shown

- **WHEN** a user opens the Nutrition page
- **THEN** it names USDA FoodData Central as the source of shared food data
