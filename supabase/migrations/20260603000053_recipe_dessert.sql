-- Slice 53: desserts.
--
-- The recipe meal-type check has allowed BREAKFAST / LUNCH / DINNER /
-- POST-WORKOUT / SNACK since the table was created. The library filter groups
-- those into Breakfast, Mains and Snacks, and desserts had nowhere to go - a
-- category clients look for by name, so it earns its own tag rather than being
-- filed under snacks.
--
-- Idempotent: the constraint is dropped by name and recreated.

do $$
begin
  if to_regclass('public.recipes') is null then
    raise notice 'skipped - table public.recipes does not exist';
    return;
  end if;

  -- The constraint is unnamed in the original migration, so find whichever
  -- check currently governs the tag column rather than guessing its name.
  declare
    conname_found text;
  begin
    select c.conname into conname_found
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'recipes' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%tag%'
    limit 1;

    if conname_found is not null then
      execute format('alter table public.recipes drop constraint %I', conname_found);
    end if;
  end;

  alter table public.recipes
    add constraint recipes_tag_check
    check (tag in ('BREAKFAST','LUNCH','DINNER','POST-WORKOUT','SNACK','DESSERT'));
end $$;
