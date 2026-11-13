## ADDED Requirements

### Requirement: Ingredient rows can be linked to a food

The system SHALL let a user link each ingredient row on the recipe add and edit forms to a food they can see (shared or their own), change the link or clear it, by searching foods by name. The link SHALL be saved with the recipe and kept through edits that do not change it, like the row's other details.

#### Scenario: Link a row

- **WHEN** a user searches "chicken breast" on a row, picks a shared chicken breast food and saves
- **THEN** the row is linked to that food and the edit form shows it on the next visit

#### Scenario: Clear a link

- **WHEN** a user clears a row's linked food and saves
- **THEN** the row has no food and no longer counts toward the recipe's nutrition

#### Scenario: Another user's custom food

- **WHEN** a save names another user's custom food on a row
- **THEN** nothing is saved and the row shows that the food was not found

### Requirement: Unlinked rows get a suggested food

When the add or edit form shows a row with a name and no linked food, the system SHALL suggest the best match from a food search on that name, marked as a suggestion. The user SHALL accept, change or dismiss it. A suggestion SHALL NOT be saved unless accepted, and rows the user has linked or cleared SHALL NOT get suggestions.

#### Scenario: Accept a suggestion

- **WHEN** the edit form suggests "Onions, raw" for the row "1 yellow onion" and the user accepts it and saves
- **THEN** the row is linked to "Onions, raw"

#### Scenario: Ignored suggestion is not saved

- **WHEN** the form suggests a food for a row and the user saves without accepting it
- **THEN** the row is saved with no food

#### Scenario: No suggestion found

- **WHEN** no food matches a row's name
- **THEN** the row shows no suggestion and offers a food search

### Requirement: Rows can carry a weight in grams

When a linked row's amount cannot be converted to grams from a weight unit or the food's units, the system SHALL ask for the row's weight in grams on the form. The weight SHALL be a number above 0 and at most 100,000, is optional, and SHALL be saved with the row.

#### Scenario: Weight asked for

- **WHEN** a row "1 bunch cilantro" is linked to a food with no bunch unit
- **THEN** the row shows a grams field and says it adds no nutrition until a weight is entered

#### Scenario: Weight not asked when the unit converts

- **WHEN** a row "200 g rice" is linked to a rice food
- **THEN** no grams field is shown

#### Scenario: Invalid weight

- **WHEN** a user enters -5 as a row's weight in grams
- **THEN** nothing is saved and the row shows that the weight must be more than 0

### Requirement: The recipe page shows nutrition per serving

The system SHALL show on a recipe's detail page its calories, protein, carbs and fat per serving, and, when the recipe is partial, how many ingredients have no nutrition. Each ingredient row SHALL show whether it counts toward nutrition. The import review form SHALL NOT show nutrition or food links.

#### Scenario: Per serving shown

- **WHEN** a user opens a recipe whose rows are all linked with weights
- **THEN** the page shows kcal, protein, carbs and fat per serving and no partial note

#### Scenario: Partial note

- **WHEN** a user opens a recipe where 2 of 8 rows have no nutrition
- **THEN** the page shows the per-serving numbers and says 2 of 8 ingredients have no nutrition

#### Scenario: Import review unchanged

- **WHEN** a user reviews an imported recipe before saving it
- **THEN** the review form shows no calories, macros, food links or suggestions
