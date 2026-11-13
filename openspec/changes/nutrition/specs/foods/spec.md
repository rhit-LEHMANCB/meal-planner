## MODIFIED Requirements

### Requirement: Users can search foods

The system SHALL let a signed-in user search foods by words in the name, ignoring letter case, across shared foods and the user's own custom foods. A word SHALL also match its singular or plural form ending in "s" or "es". It SHALL return at most 20 results: the user's own foods first, then foods whose name starts with the first word, then shorter names first, then by name.

#### Scenario: Search finds a custom food

- **WHEN** a user who created "Greek yogurt" searches "yog"
- **THEN** "Greek yogurt" is listed

#### Scenario: No match

- **WHEN** a user searches "greek yogurt" and no food matches
- **THEN** the Food tab says no foods match and offers to create "Greek yogurt"

#### Scenario: Plural matches singular

- **WHEN** a user searches "eggs" and the shared food "Egg, whole, raw, fresh" exists
- **THEN** that food is listed

#### Scenario: Name starting with the word ranks first

- **WHEN** a user searches "rice" and shared foods "Rice, white, long-grain, cooked" and "Crackers, rice" exist
- **THEN** "Rice, white, long-grain, cooked" is listed before "Crackers, rice"

## ADDED Requirements

### Requirement: Shared foods come from USDA SR Legacy

The system SHALL provide the foods of the USDA FoodData Central SR Legacy dataset as shared foods, each with its kcal, protein, carbohydrate and fat per 100 g as published, and SHALL offer each food's household portions as its units with their published gram weights. A food without an "each" portion SHALL get one from its medium, large or small portion when it has one.

#### Scenario: Shared food is searchable

- **WHEN** any signed-in user searches "broccoli raw"
- **THEN** the shared USDA food "Broccoli, raw" is listed with its published per-100 g values

#### Scenario: Portions become units

- **WHEN** a user picks a shared food whose USDA portions include "1 cup, chopped" weighing 91 g
- **THEN** the unit choices include cup, and 1 cup counts as 91 g

#### Scenario: Each from a medium portion

- **WHEN** a shared food has a "medium" portion of 182 g and no each portion
- **THEN** its units include each at 182 g
