-- Slice 54: give the seeded exercise library its split loads.
--
-- Migration 52 added load_split with a default of 1, and migration 35's library
-- seed pre-dates it - so all 800-odd seeded movements sit at 1, including every
-- dumbbell and kettlebell one. The exercise builder guesses from the name when
-- a coach types one in, and the CSV import guesses when the column is absent,
-- but nothing ever went back over the rows that were already there. The upshot
-- is that the per-hand display never fires for a movement picked out of the
-- library, which is where they all come from.
--
-- Same rule the app uses (lib/loadSplit.js): a name mentioning db / kb /
-- dumbbell / dumbell / kettlebell as a whole word is held one per hand.
--
-- Guarded so re-running is harmless. Once any exercise carries a split above 1,
-- the coach has started making their own calls and this stays out of the way -
-- it will never overwrite a movement they deliberately set back to 1.
do $$
declare v_touched int;
begin
  if exists (select 1 from public.exercises where load_split > 1) then
    raise notice 'Split loads already in use - seed skipped.';
    return;
  end if;

  update public.exercises
     set load_split = 2, updated_at = now()
   where load_split = 1
     and name ~* '(^|[^a-z])(db|kb|dumbbell|dumbell|kettlebell)([^a-z]|$)';

  get diagnostics v_touched = row_count;
  raise notice 'Marked % exercises as two-handed.', v_touched;
end $$;
