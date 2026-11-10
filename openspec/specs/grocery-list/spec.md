# grocery-list Specification

## Purpose
Turns a plan week into a shopping list: everything the week's cooks and planned foods need, merged by name, grouped by aisle and tickable in the shop, without ever adding leftovers.

## Requirements

### Requirement: The grocery list shows one plan week

The system SHALL show the grocery list for one Mon–Sun plan week at `/grocery?week=<Monday>`, with previous week, next week and "This week" controls. Without a valid Monday it SHALL redirect to the Monday of the given date's week, or of this week when the date is missing or invalid, the same way `/plan` does. Only signed-in users SHALL reach the page.

#### Scenario: Week from the address

- **WHEN** a user opens `/grocery?week=2026-11-09`
- **THEN** the page shows the list for Nov 9 – 15

#### Scenario: Not a Monday

- **WHEN** a user opens `/grocery?week=2026-11-11`
- **THEN** they are redirected to `/grocery?week=2026-11-09`

#### Scenario: Signed out

- **WHEN** a signed-out visitor opens `/grocery`
- **THEN** they are sent to sign in

### Requirement: Cooks add their ingredients for the servings cooked

The system SHALL add every ingredient of every cook in the week to the list, scaled by the cook's servings cooked divided by the recipe's servings. Ingredients saved before structured rows existed SHALL be read with the ingredient line parser. When an amount cannot be scaled (no amount, or a recipe with no servings), the ingredient SHALL show as "as needed".

#### Scenario: Scaled to servings cooked

- **WHEN** Turkey chili (serves 4, "2 onion") is cooked for 6 servings on Monday, 2 eaten at the meal
- **THEN** the list shows "Onion" with amount 3, for "Turkey chili"

#### Scenario: No amount

- **WHEN** a cooked recipe has the ingredient "salt to taste"
- **THEN** the list shows "salt" as "as needed"

### Requirement: Leftovers never add to the list

The system SHALL NOT add anything to the grocery list for leftover entries, whatever their batch or week.

#### Scenario: Leftover in the week

- **WHEN** a week has a Turkey chili cook and three Turkey chili leftovers
- **THEN** the chili's ingredients are on the list once, scaled to the cook's servings cooked, and the leftovers change nothing

#### Scenario: Leftover from last week's cook

- **WHEN** this week holds only a leftover drawn from a batch cooked last week
- **THEN** this week's list has no items from that recipe

### Requirement: Food entries add their planned amount

The system SHALL add each food entry in the week as an item named after the food, in the amount and unit planned. Its meal SHALL be named after its slot (Breakfast, Lunch, Dinner or Snack).

#### Scenario: Snack foods

- **WHEN** "Apple, 1 each" is planned as a snack on five days
- **THEN** the list shows "Apple" with "5 each", for "Snack"

### Requirement: Items merge by name, amounts by unit

The system SHALL merge items whose names are equal after ignoring letter case and extra spaces. Within an item, amounts in the same normalized unit SHALL add up, and amounts in different units SHALL be listed side by side. An item with both amounts and "as needed" uses SHALL show its amounts. Each item SHALL list the meals it is for, each once.

#### Scenario: Same and different units

- **WHEN** Pancakes needs "1 cup Flour" and Veggie pizza needs "1 cup flour" and "200 g flour", both cooked for their recipe servings
- **THEN** the list shows one "Flour" item, "2 cup + 200 g", for "Pancakes, Veggie pizza"

#### Scenario: Unit spellings match

- **WHEN** one recipe needs "1 Tablespoons soy sauce" and another "2 tbsp soy sauce"
- **THEN** the list shows "Soy sauce", "3 tbsp"

#### Scenario: Different names stay apart

- **WHEN** one recipe needs "onion" and another "onions"
- **THEN** the list shows two items

### Requirement: Count amounts round up

The system SHALL round amounts in count units (no unit, each, can, jar, clove, bunch, head, piece, slice, stick, sprig, package) up to a whole number. Other units SHALL show as recipe amounts do (formatAmount: "1 1/2", "1/3", otherwise up to three decimals).

#### Scenario: Count rounds up

- **WHEN** a recipe serving 4 needs "1 lemon" and is cooked for 6 servings
- **THEN** the list shows "Lemon" with amount 2

#### Scenario: Weight keeps decimals

- **WHEN** a recipe serving 4 needs "1 lb ground turkey" and is cooked for 6 servings
- **THEN** the list shows "Ground turkey", "1 1/2 lb"

### Requirement: Items are grouped by aisle

The system SHALL group items under aisles in this order: Produce, Meat and fish, Dairy and eggs, Bakery, Pantry, Spices and oils, Frozen, Other, with items sorted by name within an aisle and empty aisles hidden. An item's aisle SHALL be, in order: the user's remembered choice for its name, the aisle of its food when it comes from a food with an aisle, a guess from keywords in its name, or Other.

#### Scenario: Guessed aisle

- **WHEN** the list has "Onion" and "Ground turkey"
- **THEN** "Onion" is under Produce and "Ground turkey" under Meat and fish

#### Scenario: Unknown name

- **WHEN** the list has "Gochujang" and no choice is remembered for it
- **THEN** it is under Other

### Requirement: Users can move an item to another aisle

The system SHALL let a user move an item to another aisle from the item's menu. The choice SHALL be remembered for that normalized name for that user, and SHALL apply to every week's list and to their extra items with that name.

#### Scenario: Remembered on other weeks

- **WHEN** a user moves "Gochujang" to Pantry on this week's list, then opens a later week that also needs gochujang
- **THEN** "Gochujang" is under Pantry on both weeks

#### Scenario: Unknown aisle refused

- **WHEN** a request asks to move an item to an aisle that is not in the list of aisles
- **THEN** nothing is saved and the page shows an error

### Requirement: Users can tick items off

The system SHALL let a user tick and untick each item. Ticks SHALL be saved per user and week, and ticking SHALL set the state given, not toggle it, so a repeated request changes nothing. The page SHALL show how many items are ticked out of the total. Ticking SHALL work without JavaScript.

#### Scenario: Tick and reload

- **WHEN** a user ticks "Onion" and reloads the page
- **THEN** "Onion" is still ticked and the progress counts it

#### Scenario: Repeated tick

- **WHEN** the same "tick Onion" request is sent twice
- **THEN** "Onion" is ticked once and the count goes up by one

### Requirement: More needed after ticking shows the item again

The system SHALL remember the amounts an item had when it was ticked. When the item later needs more in any unit, or a unit it did not have, it SHALL show as unticked with "More needed since you ticked it". Ticking it again SHALL save the new amounts. When an item needs the same or less, it SHALL stay ticked.

#### Scenario: Servings raised

- **WHEN** a user ticks "Onion" at amount 3, then changes the chili cook from 6 to 8 servings
- **THEN** "Onion" shows 4, unticked, with "More needed since you ticked it"

#### Scenario: Servings lowered

- **WHEN** a user ticks "Onion" at amount 3, then changes the chili cook from 6 to 4 servings
- **THEN** "Onion" shows 2 and stays ticked

### Requirement: Users can add their own items to a week

The system SHALL let a user add an item to a week's list from free text (1 to 200 characters), with an optional leading amount and unit read by the ingredient line parser, up to 100 extra items per week. Extra items SHALL show "Added by you", SHALL get an aisle like any item, SHALL NOT merge with other items, and SHALL be tickable and deletable. Adding to a week with nothing planned SHALL work.

#### Scenario: Add an extra item

- **WHEN** a user adds "2 paper towels" to this week
- **THEN** "paper towels" appears with amount 2, "Added by you", under Other

#### Scenario: Blank text

- **WHEN** a user submits the add field empty
- **THEN** nothing is added and the field says to enter an item

#### Scenario: Delete an extra item

- **WHEN** a user deletes "paper towels" from the item menu
- **THEN** it is gone from the list after reload

### Requirement: The list explains what it covers

The system SHALL show how many cooks and food entries the list covers. When the week has no cooks, no food entries and no extra items, it SHALL show "Nothing to buy yet" with a link to plan that week.

#### Scenario: Empty week

- **WHEN** a user opens a week with nothing planned and no extra items
- **THEN** the page says "Nothing to buy yet" and links to `/plan?week=<that Monday>`

### Requirement: Each user's list is private

The system SHALL build a user's list only from that user's own plan, and SHALL keep ticks, extra items and aisle choices per user. A request that names another user's extra item SHALL behave as if the item did not exist.

#### Scenario: Other user's week

- **WHEN** user B opens the same week that user A has planned and ticked
- **THEN** user B sees only their own list, with none of A's items, ticks, extra items or aisle choices

#### Scenario: Other user's extra item

- **WHEN** user B sends a delete request with the id of user A's extra item
- **THEN** nothing is deleted and B gets a not-found error
