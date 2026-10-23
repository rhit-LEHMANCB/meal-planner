# Spec Delta

## MODIFIED Requirements

### Requirement: Users can create a recipe

The system SHALL let a signed-in user create a recipe with a title, a number of servings, an optional total time in minutes, an optional source link, ingredient rows and instruction steps. Each ingredient row SHALL have an optional amount, unit and note and a name. Title and servings SHALL be required.

#### Scenario: Create a complete recipe

- **WHEN** a user submits a title, 6 servings, 3 ingredient rows and 2 steps
- **THEN** the recipe is saved and the user sees its detail page with the ingredients and steps in the order entered

#### Scenario: Missing title

- **WHEN** a user submits the form with an empty title
- **THEN** nothing is saved and the form shows that the title is required

#### Scenario: Invalid servings

- **WHEN** a user enters 0, a negative number, a fraction or text for servings
- **THEN** nothing is saved and the form shows that servings must be a whole number of at least 1

#### Scenario: Invalid source link

- **WHEN** a user enters a source link that is not an http or https address
- **THEN** nothing is saved and the form shows that the link is not valid

#### Scenario: Invalid amount

- **WHEN** a user enters "a handful" or a negative number as an ingredient row's amount
- **THEN** nothing is saved and the form shows that the amount must be a number or a fraction such as 1/2, next to that row

#### Scenario: Row without a name

- **WHEN** a user fills in an amount and unit on a row but leaves its name empty
- **THEN** nothing is saved and the form shows that the row needs a name

### Requirement: Ingredients and steps keep their order

The system SHALL store ingredients as one row each with its amount, unit, name and note, and steps as one text each, and SHALL display and edit them in the order the user entered. Empty ingredient rows and blank step lines SHALL be dropped on save.

#### Scenario: Order is preserved

- **WHEN** a user saves ingredient rows named "flour", "eggs", "milk" in that order and reopens the recipe
- **THEN** they appear as flour, eggs, milk

#### Scenario: Blank lines dropped

- **WHEN** a user saves a recipe with an ingredient row whose fields are all empty, or a step list containing empty lines
- **THEN** the empty row and the empty lines are not saved

#### Scenario: Recipe with no ingredients

- **WHEN** a user saves a recipe with no ingredient rows
- **THEN** the recipe is saved and its detail page shows that it has no ingredients yet

### Requirement: Users can edit a recipe

The system SHALL let the owner change any field of a recipe, including adding, removing and reordering ingredient rows and steps and changing a row's amount, unit, name and note, under the same validation as creation.

#### Scenario: Edit title and steps

- **WHEN** a user changes the title and removes the second step and saves
- **THEN** the detail page shows the new title and the remaining steps in order

#### Scenario: Edit fails validation

- **WHEN** a user clears the title on the edit form and saves
- **THEN** nothing changes and the form shows that the title is required

#### Scenario: Reorder ingredients

- **WHEN** a user moves the third ingredient row to the top and saves
- **THEN** the recipe lists that ingredient first and the others in their previous order

## ADDED Requirements

### Requirement: Editing keeps ingredient details

The system SHALL keep each ingredient row's amount, unit, name and note through an edit unless the user changes them. Changing other fields, reordering rows, or adding and removing other rows SHALL NOT alter a row's stored details.

#### Scenario: Edit the title of an imported recipe

- **WHEN** a user opens an imported recipe whose rows have amounts, units and notes, changes only the title and saves
- **THEN** every ingredient row still has the same amount, unit, name and note

#### Scenario: Change one row

- **WHEN** a user changes one row's amount from 1 to 2 and saves
- **THEN** that row has amount 2 and its line on the detail page shows 2, and every other row is unchanged

#### Scenario: Reorder keeps details

- **WHEN** a user moves a row with amount 2, unit "tbsp" and note "divided" to another position and saves
- **THEN** the row has the same amount, unit, name and note in its new position

### Requirement: Ingredient rows show their status

The system SHALL show a status chip on every ingredient row in the add and edit forms: "Parsed" when amount and unit are understood, "Check" when an amount or unit is missing or not recognized, and "No amount" for rows such as "salt to taste". The status SHALL follow the row's current fields.

#### Scenario: Chip follows edits

- **WHEN** a user changes a row's unit from "cup" to "scoop"
- **THEN** the row's chip changes from "Parsed" to "Check" after saving

### Requirement: Several ingredient lines can be added at once

The system SHALL let a user paste several ingredient lines into the add and edit forms and turn them into rows, one per non-blank line, split into amount, unit, name and note by the built-in line parser without using AI.

#### Scenario: Paste lines

- **WHEN** a user pastes "1 lb ground turkey", "2 tbsp chili powder" and "Salt to taste" and chooses to add them
- **THEN** three rows are added after the existing rows, with amount 1 and unit lb, amount 2 and unit tbsp, and no amount with a "No amount" chip

### Requirement: Older plain-text ingredients are pre-filled when edited

The system SHALL show ingredients that were saved as plain lines, before rows existed, as rows pre-filled by the built-in line parser when the recipe is opened for editing. The stored recipe SHALL NOT change until the user saves.

#### Scenario: Edit an older recipe

- **WHEN** a user opens the edit form of a recipe whose ingredient lines were saved as plain text, such as "1 cup rice"
- **THEN** the row shows amount 1, unit cup and name "rice", and the recipe is unchanged until they save

#### Scenario: Cancel editing an older recipe

- **WHEN** a user opens the edit form of such a recipe and cancels
- **THEN** its ingredients are stored exactly as before
