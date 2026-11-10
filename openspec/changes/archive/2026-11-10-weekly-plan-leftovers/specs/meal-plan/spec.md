# Spec Delta

## Purpose

Lets a signed-in user plan a week of meals: recipes they cook, leftovers they eat from earlier cooks, and single foods, placed on breakfast, lunch, dinner and snack slots for each day.

## ADDED Requirements

### Requirement: Users see one week of their plan

The system SHALL show the signed-in user's plan for one Monday-to-Sunday week, with four slots per day in the order breakfast, lunch, dinner, snack. The week SHALL be part of the page address so it can be bookmarked. Signed-out visitors SHALL be redirected to the sign-in page.

#### Scenario: Open the plan

- **WHEN** a signed-in user opens the plan page without a week
- **THEN** the current week is shown with seven days and four slots per day, and today is highlighted

#### Scenario: Week in the address

- **WHEN** a user opens the plan with a week date that is not a Monday
- **THEN** they are sent to the week that contains that date

#### Scenario: Invalid week

- **WHEN** a user opens the plan with a week value that is not a date
- **THEN** the current week is shown

#### Scenario: Signed-out visitor

- **WHEN** a visitor without a session opens the plan page
- **THEN** they are redirected to the sign-in page

### Requirement: Users can move between weeks

The system SHALL let a user go to the previous week, the next week, and back to the current week. Past and future weeks SHALL be viewable and editable the same way.

#### Scenario: Next week

- **WHEN** a user viewing Oct 19 – 25 chooses Next week
- **THEN** the plan for Oct 26 – Nov 1 is shown and the address names that week

#### Scenario: Back to this week

- **WHEN** a user viewing another week chooses This week
- **THEN** the week containing today is shown

### Requirement: A slot holds several entries

The system SHALL let a slot hold any number of entries, shown in the order they were added. Each entry SHALL show its kind (cook, leftover or food), its name and its amount, and SHALL have its own Remove control. An empty slot SHALL show only an Add control.

#### Scenario: Two entries in one slot

- **WHEN** a user adds a cook of Lemon pasta and a food Mixed greens 80 g to Wednesday dinner
- **THEN** Wednesday dinner shows both entries, each with its own Remove control

### Requirement: Users can add a cook of a recipe

The system SHALL let a user add a recipe to a slot as a cook, giving servings cooked and servings eaten at that meal, both whole numbers with 1 ≤ eaten ≤ cooked ≤ 99. Cooked SHALL default to the recipe's servings. The entry SHALL show "cook N · eat M". Only the user's own recipes SHALL be offered or accepted.

#### Scenario: Add a cook

- **WHEN** a user adds Turkey chili to Monday dinner with cook 6 and eat 2
- **THEN** Monday dinner shows "Turkey chili" with "cook 6 · eat 2"

#### Scenario: Eaten more than cooked

- **WHEN** a user submits cook 2 and eat 3
- **THEN** the entry is not saved and the dialog shows an error next to the eaten field

#### Scenario: Someone else's recipe

- **WHEN** a request adds a cook naming a recipe the user does not own
- **THEN** nothing is saved and the response is the same as for a recipe that does not exist

### Requirement: Users can add a food

The system SHALL let a user add a food to a slot with a positive amount and a unit. The unit SHALL be grams or one of the units defined for that food. The entry SHALL show the food's name and the amount with its unit.

#### Scenario: Add a food in grams

- **WHEN** a user adds Greek yogurt with amount 170 and unit g to Monday breakfast
- **THEN** Monday breakfast shows "Greek yogurt" with "170 g"

#### Scenario: Unit the food does not have

- **WHEN** a request adds a food with a unit that is neither g nor one of that food's units
- **THEN** nothing is saved and an error is shown

### Requirement: Adding happens in a dialog opened from a slot

The system SHALL open an Add dialog when the user chooses Add in a slot. The dialog SHALL name the slot (for example "Add to Tue dinner") and SHALL offer three tabs: Recipe (add a cook), Leftover (draw from a batch) and Food (add or create a food). It SHALL be usable with the keyboard alone and SHALL close without saving on Cancel or Escape.

#### Scenario: Open the dialog

- **WHEN** a user chooses Add in Tuesday dinner
- **THEN** a dialog titled "Add to Tue dinner" opens with Recipe, Leftover and Food tabs

#### Scenario: Cancel

- **WHEN** a user opens the dialog, fills in fields and presses Escape
- **THEN** the dialog closes and the plan is unchanged

### Requirement: Recipes can be dragged onto a slot on wide screens

On screens at least tablet width, the system SHALL show a recipe shelf of the user's recipes. Dropping one onto a slot SHALL open the Add dialog for that slot on the Recipe tab with that recipe selected. The drop alone SHALL save nothing.

#### Scenario: Drag a recipe to a slot

- **WHEN** a user drags Roast chicken from the shelf onto Sunday lunch
- **THEN** the dialog "Add to Sun lunch" opens on the Recipe tab with Roast chicken selected, and nothing is saved until they confirm

### Requirement: Users can edit an entry

The system SHALL let a user reopen an entry to change its amounts: cooked and eaten servings for a cook, servings for a leftover, and amount and unit for a food. Changes SHALL follow the same rules as adding, and a cook's spare servings SHALL NOT drop below the servings already drawn from its batch.

#### Scenario: Cook fewer servings than are drawn

- **WHEN** Turkey chili was cooked 6, eaten 2, and 4 servings are drawn as leftovers, and the user changes the cook to 5
- **THEN** the change is refused with a message that 4 servings are already planned as leftovers

#### Scenario: Change a food amount

- **WHEN** a user changes Greek yogurt from 170 g to 200 g
- **THEN** the entry shows "200 g"

### Requirement: Users can remove an entry

The system SHALL let a user remove any entry. Removing a leftover SHALL free its servings back to the batch. Removing a cook whose batch has planned leftovers SHALL first ask for confirmation listing those leftovers. Confirming SHALL remove the cook, its batch and those leftovers.

#### Scenario: Remove a leftover

- **WHEN** a user removes the Tuesday lunch leftover of Turkey chili (1 serving)
- **THEN** the entry disappears and the batch has one more free serving

#### Scenario: Remove a cook with planned leftovers

- **WHEN** a user removes Monday dinner's Turkey chili cook while Tuesday and Wednesday lunch draw from it
- **THEN** a confirmation lists Tue lunch and Wed lunch, and confirming removes the cook, the batch and both leftovers

#### Scenario: Remove a cook with no planned leftovers

- **WHEN** a user removes a cook whose batch has no planned leftovers
- **THEN** the cook and its batch are removed without a further question

### Requirement: The plan works on a phone

Below tablet width the system SHALL show the week as a list of days, each with its slots stacked, instead of a seven-column grid. Every action (add, edit, remove, move between weeks) SHALL be available without drag-and-drop.

#### Scenario: Phone layout

- **WHEN** a user opens the plan on a 390 px wide screen
- **THEN** days are listed one below another with no sideways scrolling, and each slot has an Add control

### Requirement: Plans are private to their owner

The system SHALL allow only a plan's owner to read, add to, change or remove its entries. A request naming another user's entry, batch, recipe or custom food SHALL behave exactly like one that does not exist.

#### Scenario: Another user's week

- **WHEN** a second user opens the same week address as the first user
- **THEN** they see their own plan for that week and none of the first user's entries

#### Scenario: Another user's entry

- **WHEN** a user submits an edit or remove for an entry in another user's plan
- **THEN** nothing changes and the response is the same as for an entry that does not exist
