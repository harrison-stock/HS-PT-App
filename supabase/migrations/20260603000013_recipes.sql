-- Slice 12: coach recipe builder — recipes, ingredients, steps
--
-- Macros are stored PER SERVING. Ingredient quantities are stored for the
-- recipe's base_servings (e.g. "serves 4"); the client app scales them
-- proportionally when a different serving count is selected.

-- ── recipes ──────────────────────────────────────────────────────────────────
create table if not exists public.recipes (
  id            uuid primary key default gen_random_uuid(),
  trainer_id    uuid not null references public.profiles(id) on delete cascade,
  title         text not null default '',
  tag           text not null default 'LUNCH'
                check (tag in ('BREAKFAST','LUNCH','DINNER','POST-WORKOUT','SNACK')),
  time_mins     int  not null default 0,
  img_url       text not null default '',
  base_servings int  not null default 4 check (base_servings >= 1),
  -- per-serving macros
  kcal          numeric(6,1) not null default 0,
  protein_g     numeric(6,1) not null default 0,
  carbs_g       numeric(6,1) not null default 0,
  fats_g        numeric(6,1) not null default 0,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);
alter table public.recipes enable row level security;

-- Trainer owns and manages their recipes
drop policy if exists "recipes: trainer all" on public.recipes;
create policy "recipes: trainer all" on public.recipes for all
  using  (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

-- Clients can read their own trainer's recipes
drop policy if exists "recipes: client read" on public.recipes;
create policy "recipes: client read" on public.recipes for select
  using (trainer_id = (select trainer_id from public.profiles where id = auth.uid()));

-- ── recipe_ingredients (quantities for base_servings) ────────────────────────
create table if not exists public.recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  sort_order int  not null default 0,
  qty        numeric(8,2),            -- null = "to taste"
  unit       text not null default '',
  name       text not null default ''
);
alter table public.recipe_ingredients enable row level security;

drop policy if exists "recipe_ingredients: trainer all" on public.recipe_ingredients;
create policy "recipe_ingredients: trainer all" on public.recipe_ingredients for all
  using (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.trainer_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.trainer_id = auth.uid()
  ));

drop policy if exists "recipe_ingredients: client read" on public.recipe_ingredients;
create policy "recipe_ingredients: client read" on public.recipe_ingredients for select
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id
      and r.trainer_id = (select trainer_id from public.profiles where id = auth.uid())
  ));

-- ── recipe_steps ─────────────────────────────────────────────────────────────
create table if not exists public.recipe_steps (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  sort_order int  not null default 0,
  body       text not null default ''
);
alter table public.recipe_steps enable row level security;

drop policy if exists "recipe_steps: trainer all" on public.recipe_steps;
create policy "recipe_steps: trainer all" on public.recipe_steps for all
  using (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.trainer_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.trainer_id = auth.uid()
  ));

drop policy if exists "recipe_steps: client read" on public.recipe_steps;
create policy "recipe_steps: client read" on public.recipe_steps for select
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id
      and r.trainer_id = (select trainer_id from public.profiles where id = auth.uid())
  ));
