-- Slice 51: indexes.
--
-- Postgres creates an index for a primary key and for a unique constraint, but
-- NOT for a foreign key. Every lookup in this app is "give me the children of
-- this parent" - the sets for an exercise, the workouts for a client - so
-- without these each one is a sequential scan of the whole table. That is
-- invisible on a handful of rows and gets steadily worse as real content and
-- logged history accumulate.
--
-- All idempotent, so this is safe to re-run.
--
-- Deliberately omitted: programme_days(phase_id). The table already has a
-- unique constraint on (phase_id, week_index, day_of_week), and Postgres can
-- use that index for a phase_id-only lookup because phase_id leads it.

-- ── Programme structure ──────────────────────────────────────────────────────
create index if not exists idx_programme_phases_programme  on public.programme_phases (programme_id);
create index if not exists idx_workout_sections_day        on public.workout_sections (day_id);
create index if not exists idx_section_exercises_section   on public.section_exercises (section_id);
create index if not exists idx_exercise_sets_exercise      on public.exercise_sets (exercise_id);
create index if not exists idx_programmes_trainer          on public.programmes (trainer_id);

-- ── Scheduling and logging ───────────────────────────────────────────────────
-- The client calendar and week strip both filter by client and date range, so
-- the composite serves them in one index (and client-only lookups too).
create index if not exists idx_client_workouts_client_date on public.client_workouts (client_id, scheduled_date);
create index if not exists idx_client_workouts_day         on public.client_workouts (day_id);
create index if not exists idx_client_workouts_trainer     on public.client_workouts (trainer_id);

-- Session history is always read newest-first for one client.
create index if not exists idx_workout_sessions_client     on public.workout_sessions (client_id, completed_at desc);
create index if not exists idx_workout_sessions_day        on public.workout_sessions (day_id);

-- The single biggest table over time - every set of every session.
create index if not exists idx_logged_sets_session         on public.logged_sets (session_id);
create index if not exists idx_logged_sets_exercise        on public.logged_sets (exercise_id);

-- ── Client records ───────────────────────────────────────────────────────────
create index if not exists idx_profiles_trainer            on public.profiles (trainer_id);
create index if not exists idx_managed_clients_trainer     on public.managed_clients (trainer_id);
create index if not exists idx_client_tasks_client         on public.client_tasks (client_id);
create index if not exists idx_client_tasks_trainer        on public.client_tasks (trainer_id);
create index if not exists idx_client_goals_client         on public.client_goals (client_id);
create index if not exists idx_client_documents_client     on public.client_documents (client_id);
create index if not exists idx_client_injuries_client      on public.client_injuries (client_id);
create index if not exists idx_client_injury_notes_injury  on public.client_injury_notes (injury_id);
create index if not exists idx_body_metrics_client         on public.body_metrics (client_id, recorded_at desc);
create index if not exists idx_progress_photos_client      on public.progress_photos (client_id, taken_on desc);
create index if not exists idx_health_daily_client         on public.health_daily (client_id, day desc);
create index if not exists idx_client_custom_metrics_client on public.client_custom_metrics (client_id);
create index if not exists idx_custom_metric_entries_metric on public.custom_metric_entries (metric_id, recorded_at desc);
create index if not exists idx_wearable_connections_client on public.wearable_connections (client_id);

-- ── Library and content ──────────────────────────────────────────────────────
create index if not exists idx_exercises_trainer           on public.exercises (trainer_id);
create index if not exists idx_recipes_trainer             on public.recipes (trainer_id);
create index if not exists idx_recipe_ingredients_recipe   on public.recipe_ingredients (recipe_id, sort_order);
create index if not exists idx_recipe_steps_recipe         on public.recipe_steps (recipe_id, sort_order);
create index if not exists idx_guides_trainer              on public.guides (trainer_id);
create index if not exists idx_forms_trainer               on public.forms (trainer_id);
create index if not exists idx_task_templates_trainer      on public.task_templates (trainer_id);
create index if not exists idx_favourites_user             on public.favourites (user_id, item_type);

-- ── Messaging and misc ───────────────────────────────────────────────────────
-- The bell badge counts unread per recipient, newest first.
create index if not exists idx_notifications_recipient     on public.notifications (recipient_id, created_at desc);
create index if not exists idx_form_responses_form         on public.form_responses (form_id);
create index if not exists idx_form_responses_client       on public.form_responses (client_id);
create index if not exists idx_exercise_comments_client    on public.exercise_comments (client_id, exercise_id);
create index if not exists idx_invites_trainer             on public.invites (trainer_id);
create index if not exists idx_invites_code                on public.invites (code);
