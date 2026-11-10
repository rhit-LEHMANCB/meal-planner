# Spec Delta

## Purpose

Tracks the leftover batches that planned cooks produce, so later meals can draw servings from them without ever planning more than was cooked, and shows what is in the fridge.

## ADDED Requirements

### Requirement: A cook makes a leftover batch

The system SHALL create a leftover batch for every cook entry, holding the cook's spare servings (cooked minus eaten). The cooked date is the cook's date and the eat-by date is 4 days later. Changing the cook's servings SHALL change the batch's spare servings to match.

#### Scenario: Batch from a cook

- **WHEN** a user adds Turkey chili to Monday Oct 19 dinner with cook 6 and eat 2
- **THEN** a Turkey chili batch exists, cooked Oct 19, eat by Oct 23, with 4 spare and 4 free servings

#### Scenario: Cook with nothing spare

- **WHEN** a user adds a cook with cook 2 and eat 2
- **THEN** its batch has 0 free servings and is not offered on the Leftover tab

### Requirement: Free servings never go below zero

The system SHALL track a batch's free servings as spare servings minus the servings drawn by leftover entries. It SHALL refuse any draw or change that would make free servings negative, even when two requests arrive at the same time.

#### Scenario: Draw more than is free

- **WHEN** a batch has 1 free serving and a user tries to draw 2
- **THEN** nothing is saved and the dialog says only 1 serving is free

#### Scenario: Two draws at once

- **WHEN** a batch has 1 free serving and two requests each draw 1 at the same moment
- **THEN** exactly one leftover is saved and the batch has 0 free servings

### Requirement: Users can add a leftover from a batch

The system SHALL let a user add a leftover entry to a slot by choosing a batch with free servings and a whole number of servings, at least 1. The entry SHALL show "Leftover", the recipe title and the servings. The Leftover tab SHALL list only the user's batches that were cooked before the slot and have free servings.

#### Scenario: Add a leftover

- **WHEN** a user adds 1 serving of the Turkey chili batch to Tuesday lunch
- **THEN** Tuesday lunch shows a Leftover entry "Turkey chili · 1 serving" and the batch has 3 free servings

### Requirement: Leftovers come after the cook

The system SHALL accept a leftover only in a slot after its batch's cook: a later date, or the same date in a later slot in the order breakfast, lunch, dinner, snack.

#### Scenario: Same day, earlier slot

- **WHEN** a request draws from Monday dinner's batch into Monday lunch
- **THEN** nothing is saved and an error says leftovers must come after the cook

#### Scenario: Same day, later slot

- **WHEN** a user draws from Monday dinner's batch into Monday snack
- **THEN** the leftover is saved

### Requirement: Leftovers past eat-by are allowed with a warning

The system SHALL allow a leftover in a slot dated after the batch's eat-by date. It SHALL mark that entry "Past eat-by" with the eat-by day on the plan, in the dialog's batch list, and on the leftovers page.

#### Scenario: Plan past eat-by

- **WHEN** a user adds a leftover of the Turkey chili batch (eat by Fri Oct 23) to Saturday lunch
- **THEN** the leftover is saved and shows "Past eat-by (Fri)"

### Requirement: The plan shows what is in the fridge

The system SHALL show, next to the week grid on wide screens, the user's batches that are still in the fridge, with cooked day, eat-by day, free servings and planned servings, and a link to the leftovers page.

#### Scenario: Fridge panel

- **WHEN** a user has a Lemon pasta batch with 1 free serving and nothing planned
- **THEN** the panel lists Lemon pasta with "1 free" and "0 planned"

### Requirement: Users see their batches on the leftovers page

The system SHALL list on the leftovers page every batch of the user's that is in the fridge, oldest cook first. It SHALL show recipe title, cooked date and slot, eat-by date, cooked and eaten counts, spare and free servings, and each planned leftover as a day, slot and servings chip. Batches past eat-by with free servings SHALL be marked "Past eat-by". With no batches, the page SHALL say so and link to the plan.

#### Scenario: Batch with planned leftovers

- **WHEN** the Turkey chili batch has leftovers planned for Tue lunch and Wed lunch, 1 serving each
- **THEN** its card shows chips "Tue lunch · 1" and "Wed lunch · 1"

#### Scenario: No batches

- **WHEN** a user with no batches opens the leftovers page
- **THEN** the page says there are no leftovers yet and links to the weekly plan

### Requirement: A batch is in the fridge until finished or thrown out

The system SHALL consider a batch in the fridge unless it was thrown out, or it has no free servings and no planned leftovers dated today or later. Batches that left the fridge in the last 14 days SHALL be listed under "Finished or thrown out", noting which.

#### Scenario: Finished batch

- **WHEN** all of a batch's spare servings were drawn by leftovers dated before today
- **THEN** it appears under "Finished or thrown out" as finished, not in the fridge

### Requirement: Users can throw out a batch

The system SHALL let a user throw out a batch from the leftovers page after an explicit confirmation. A thrown-out batch SHALL have no free servings and SHALL no longer be offered for new leftovers. Its already planned leftovers SHALL stay on the plan, marked as gone.

#### Scenario: Throw out

- **WHEN** a user chooses Throw out on the Lemon pasta batch and confirms
- **THEN** it moves to "Finished or thrown out" as thrown out, and it is no longer offered on the Leftover tab

#### Scenario: Planned leftovers of a thrown-out batch

- **WHEN** a batch with a leftover planned for Friday is thrown out
- **THEN** the Friday leftover stays on the plan and is marked as gone

#### Scenario: Cancel throw out

- **WHEN** a user chooses Throw out and then Keep
- **THEN** the batch is unchanged

### Requirement: Batches are private to their owner

The system SHALL allow only a batch's owner to see it, draw from it or throw it out. A request naming another user's batch SHALL behave exactly like one for a batch that does not exist.

#### Scenario: Draw from another user's batch

- **WHEN** a request adds a leftover naming a batch owned by someone else
- **THEN** nothing is saved and the response is the same as for a batch that does not exist

#### Scenario: Throw out another user's batch

- **WHEN** a request throws out a batch owned by someone else
- **THEN** nothing changes and the response is the same as for a batch that does not exist
