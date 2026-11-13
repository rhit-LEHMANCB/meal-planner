# USDA shared foods seed

The shared foods (`foods.user_id` null, `source = 'usda'`) come from USDA FoodData Central **SR Legacy**, release `FoodData_Central_sr_legacy_food_csv_2018-04` (public domain). They reach each database through the migration `drizzle/*_usda_sr_legacy.sql`, which this script generates.

- kcal, protein, carbohydrate and fat per 100 g are FDC nutrients 1008, 1003, 1005 and 1004 (missing → 0).
- Household portions become `food_units` (grams per one unit). Weight portions (oz, lb, g) and servings are skipped; `each` comes from a medium (then piece, unit, item, whole, fruit, large, small) portion when a food has none. The mapping is in `src/lib/domain/usda-seed.ts` with its spec.
- Food ids are derived from the FDC id, and every insert is `ON CONFLICT DO NOTHING`, so the file is deterministic and safe to re-run.

## Regenerate

1. Download and unzip <https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip> outside the repo (the CSVs are not committed).
2. `npx tsx scripts/usda/build-seed.ts <unzipped-dir>/FoodData_Central_sr_legacy_food_csv_2018-04`

Never edit an applied migration: a newer USDA release needs a new migration (`npx drizzle-kit generate --custom --name usda_...` and pass its path as the second argument).
