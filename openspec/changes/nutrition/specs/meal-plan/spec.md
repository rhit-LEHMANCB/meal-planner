## ADDED Requirements

### Requirement: Each day shows its calories

The system SHALL show on the plan, for each day of the week, the total calories of that day's planned entries, computed as the nutrition capability defines, rounded to a whole number, and marked partial when any entry on that day has incomplete nutrition. Logged entries SHALL NOT be included on the plan. A day with no entries SHALL show no total.

#### Scenario: Day total

- **WHEN** Monday holds a cook eating 1 serving of a 230 kcal-per-serving recipe and 170 g of a food with 97 kcal per 100 g
- **THEN** Monday shows 395 kcal

#### Scenario: Partial day

- **WHEN** Tuesday holds a cook of a recipe with unlinked ingredients
- **THEN** Tuesday's total is marked partial

#### Scenario: Total follows changes

- **WHEN** a user removes Monday's food entry
- **THEN** Monday's total drops to 230 kcal
