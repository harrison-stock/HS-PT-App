-- A short intro / personal note shown before the method on a recipe.
alter table if exists recipes
  add column if not exists intro text;
