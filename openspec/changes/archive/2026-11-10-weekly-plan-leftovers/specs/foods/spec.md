# Spec Delta

## Purpose

Gives each user a set of foods to plan and later track: shared reference foods visible to everyone plus custom foods a user creates for themselves, each with nutrition per 100 g and the units it can be measured in.

## ADDED Requirements

### Requirement: Users can search foods

The system SHALL let a signed-in user search foods by words in the name, ignoring letter case, across shared foods and the user's own custom foods. It SHALL return at most 20 results, the user's own foods first, then by name.

#### Scenario: Search finds a custom food

- **WHEN** a user who created "Greek yogurt" searches "yog"
- **THEN** "Greek yogurt" is listed

#### Scenario: No match

- **WHEN** a user searches "greek yogurt" and no food matches
- **THEN** the Food tab says no foods match and offers to create "Greek yogurt"

### Requirement: Users can create a custom food

The system SHALL let a user create a custom food from the Food tab with a name (1 to 120 characters) and kcal, protein, carbs and fat per 100 g. Each number SHALL be 0 or more, with kcal at most 900 and each macro at most 100. In the same step, the food SHALL be added to the slot with the amount and unit given.

#### Scenario: Create and add

- **WHEN** a user creates "Greek yogurt" with 97 kcal, 9 g protein, 4 g carbs and 5 g fat per 100 g, amount 170 g, for Monday breakfast
- **THEN** the food is saved as theirs, Monday breakfast shows "Greek yogurt 170 g", and a later search for "greek" finds it

#### Scenario: Invalid numbers

- **WHEN** a user submits a custom food with a negative protein value
- **THEN** nothing is saved and the dialog shows an error next to that field

### Requirement: A food's units are grams plus its own units

The system SHALL offer grams for every food, plus each unit defined for that food (for example "each" or "cup"). The default unit SHALL be grams.

#### Scenario: Food with an extra unit

- **WHEN** a user picks a food that has an "each" unit
- **THEN** the unit choices are g and each

#### Scenario: Custom food

- **WHEN** a user picks a custom food they created
- **THEN** the only unit choice is g

### Requirement: Custom foods are private to their owner

The system SHALL show and accept a custom food only for the user who created it. Shared foods SHALL be visible to every signed-in user and SHALL NOT be changeable by users. A request naming another user's custom food SHALL behave exactly like one for a food that does not exist.

#### Scenario: Another user's custom food in search

- **WHEN** one user created "Grandma's granola" and a second user searches "granola"
- **THEN** the second user does not see it

#### Scenario: Another user's custom food by id

- **WHEN** a request adds a food entry naming another user's custom food
- **THEN** nothing is saved and the response is the same as for a food that does not exist
