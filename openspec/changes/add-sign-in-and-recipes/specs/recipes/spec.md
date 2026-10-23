# Spec Delta

## Purpose

Lets a signed-in user keep their own collection of recipes, with ingredients and steps, as the base for meal planning and grocery lists.

## ADDED Requirements

### Requirement: Users can create a recipe

The system SHALL let a signed-in user create a recipe with a title, a number of servings, an optional total time in minutes, an optional source link, ingredient lines and instruction steps. Title and servings SHALL be required.

#### Scenario: Create a complete recipe

- **WHEN** a user submits a title, 6 servings, 3 ingredient lines and 2 steps
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

### Requirement: Ingredients and steps keep their order

The system SHALL store ingredients as one text line each and steps as one text each, and SHALL display and edit them in the order the user entered. Blank lines SHALL be dropped on save.

#### Scenario: Order is preserved

- **WHEN** a user saves ingredients "flour", "eggs", "milk" in that order and reopens the recipe
- **THEN** they appear as flour, eggs, milk

#### Scenario: Blank lines dropped

- **WHEN** a user saves an ingredient list containing empty lines
- **THEN** the empty lines are not saved

#### Scenario: Recipe with no ingredients

- **WHEN** a user saves a recipe with no ingredient lines
- **THEN** the recipe is saved and its detail page shows that it has no ingredients yet

### Requirement: Users can list and search their recipes

The system SHALL list the signed-in user's recipes, newest first, and SHALL let them filter by words in the title, ignoring letter case.

#### Scenario: List shows only own recipes

- **WHEN** two users each have recipes and one of them opens the recipe list
- **THEN** only that user's recipes appear

#### Scenario: Search by title

- **WHEN** a user searches for "chili" and has recipes "Turkey Chili" and "Lemon Pasta"
- **THEN** only "Turkey Chili" is listed

#### Scenario: Nothing found

- **WHEN** a search matches no recipes
- **THEN** the list says no recipes match and offers to clear the search

#### Scenario: No recipes yet

- **WHEN** a user with no recipes opens the list
- **THEN** the page invites them to add their first recipe

### Requirement: Users can view a recipe

The system SHALL show a recipe's title, servings, total time, source link, ingredients and steps to its owner.

#### Scenario: View detail

- **WHEN** a user opens one of their recipes
- **THEN** they see all its fields, and the source link opens in a new tab

### Requirement: Users can edit a recipe

The system SHALL let the owner change any field of a recipe, including adding, removing and reordering ingredient lines and steps, under the same validation as creation.

#### Scenario: Edit title and steps

- **WHEN** a user changes the title and removes the second step and saves
- **THEN** the detail page shows the new title and the remaining steps in order

#### Scenario: Edit fails validation

- **WHEN** a user clears the title on the edit form and saves
- **THEN** nothing changes and the form shows that the title is required

### Requirement: Users can delete a recipe

The system SHALL let the owner delete a recipe after an explicit confirmation. Deleting SHALL remove the recipe and its ingredient lines.

#### Scenario: Confirm delete

- **WHEN** a user chooses Delete and confirms
- **THEN** the recipe no longer appears in the list or at its address

#### Scenario: Cancel delete

- **WHEN** a user chooses Delete and cancels
- **THEN** the recipe is unchanged

### Requirement: Recipes are private to their owner

The system SHALL allow only a recipe's owner to read, change or delete it. A request for another user's recipe SHALL behave exactly like a request for a recipe that does not exist.

#### Scenario: Another user's recipe address

- **WHEN** a user opens the address of a recipe owned by someone else
- **THEN** they see the same not-found page as for a missing recipe

#### Scenario: Edit or delete another user's recipe

- **WHEN** a user submits an edit or delete for a recipe owned by someone else
- **THEN** the recipe is unchanged and the response is not-found

#### Scenario: Signed-out access

- **WHEN** a visitor without a session requests any recipe page
- **THEN** they are redirected to the sign-in page
