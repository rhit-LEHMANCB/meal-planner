# Spec Delta

## MODIFIED Requirements

### Requirement: Users can delete a recipe

The system SHALL let the owner delete a recipe after an explicit confirmation. Deleting SHALL remove the recipe and its ingredient lines. When the recipe is on the plan, the confirmation SHALL say how many planned meals use it, and deleting SHALL also remove those planned meals (cooks and leftovers) and the recipe's leftover batches.

#### Scenario: Confirm delete

- **WHEN** a user chooses Delete and confirms
- **THEN** the recipe no longer appears in the list or at its address

#### Scenario: Cancel delete

- **WHEN** a user chooses Delete and cancels
- **THEN** the recipe is unchanged

#### Scenario: Delete a recipe that is on the plan

- **WHEN** a recipe is used by 3 planned meals and the user chooses Delete
- **THEN** the confirmation says it is on 3 planned meals, and confirming removes the recipe, those 3 meals and its leftover batches from the plan and the leftovers page
