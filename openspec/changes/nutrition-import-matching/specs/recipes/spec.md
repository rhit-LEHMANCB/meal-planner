## MODIFIED Requirements

### Requirement: The recipe page shows nutrition per serving

The system SHALL show on a recipe's detail page its calories, protein, carbs and fat per serving, and, when the recipe is partial, how many ingredients have no nutrition. Each ingredient row SHALL show whether it counts toward nutrition. When any counted row's weight is an AI estimate, the page SHALL say how many weights are estimates.

#### Scenario: Per serving shown

- **WHEN** a user opens a recipe whose rows are all linked with weights
- **THEN** the page shows kcal, protein, carbs and fat per serving and no partial note

#### Scenario: Partial note

- **WHEN** a user opens a recipe where 2 of 8 rows have no nutrition
- **THEN** the page shows the per-serving numbers and says 2 of 8 ingredients have no nutrition

#### Scenario: Estimated weights noted

- **WHEN** a user opens a recipe where 2 counted rows use AI-estimated weights
- **THEN** the page says the nutrition includes 2 estimated weights

## ADDED Requirements

### Requirement: Saved recipes can be matched with AI

The edit form SHALL offer "Match with AI", which matches the form's current rows the same way an import does, filling only rows that have no food and rows that have no weight where one is needed. Rows the user linked, cleared or gave a weight SHALL NOT change. Nothing SHALL be saved until the user saves the form. It SHALL use the same daily matching cap and the 10 second spacing between AI requests.

#### Scenario: Only open rows filled

- **WHEN** a user presses "Match with AI" on a recipe with 3 unlinked rows and 2 linked rows
- **THEN** the 3 unlinked rows get foods marked "AI match" and the 2 linked rows keep their foods

#### Scenario: Cleared row stays cleared

- **WHEN** a user cleared a row's food and then presses "Match with AI"
- **THEN** that row stays without a food

#### Scenario: Not saved until save

- **WHEN** a user presses "Match with AI" and then cancels the edit
- **THEN** the recipe is unchanged

#### Scenario: Cap reached

- **WHEN** a user at the daily matching cap presses "Match with AI"
- **THEN** no row changes and the form says AI matching is unavailable until tomorrow

### Requirement: AI weight estimates are marked on the forms

The add, edit and import review forms SHALL show a row whose weight is an AI estimate as "AI estimate: N g" in its grams field. Saving SHALL keep the marker until the user edits the weight.

#### Scenario: Estimate kept through a save

- **WHEN** a user saves an imported recipe with an AI-estimated 60 g row and opens it for editing
- **THEN** the row still shows "AI estimate: 60 g"

#### Scenario: Edited weight is the user's

- **WHEN** the user types 50 into that row's grams and saves
- **THEN** the row shows 50 g with no estimate marker
