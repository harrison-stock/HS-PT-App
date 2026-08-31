-- Which session a comment was about.
--
-- Comments are stored against the client's own copy of an exercise, which
-- identifies the movement inside one workout - but not which occurrence of that
-- workout. A day scheduled twice shares one copy, and the thread was in any case
-- read back by exercise name, so every comment about bench press across every
-- week arrived as one undated conversation. "Elbows drifting on set 3" is not
-- useful feedback when you cannot tell which session it was watching.
--
-- Nullable on purpose. Comments written before this have no session to point at
-- and are shown by the date they were posted instead; inventing one for them
-- would be worse than admitting it isn't known.
alter table public.exercise_comments
  add column if not exists scheduled_date date;

-- The thread for one exercise, newest last - the order it is read in.
create index if not exists exercise_comments_exercise_idx
  on public.exercise_comments (exercise_id, created_at);
