-- Slice 51: indexes.
--
-- Postgres creates an index for a primary key and for a unique constraint, but
-- NOT for a foreign key. Every lookup in this app is "give me the children of
-- this parent" - the sets for an exercise, the workouts for a client - so
-- without these each one is a sequential scan of the whole table. That is
-- invisible on a handful of rows and gets steadily worse as real content and
-- logged history accumulate.
--
-- Every index below is skipped unless its table AND all of its columns already
-- exist. Earlier migrations in this repo are optional in practice - a project
-- that never turned on health integration has no health_daily table - and an
-- index migration has no business failing the whole run over a feature that was
-- never installed. Anything skipped is reported as a NOTICE, and re-running
-- this file after applying the missing migration will pick it up.
--
-- Deliberately omitted: programme_days(phase_id). The table already has a
-- unique constraint on (phase_id, week_index, day_of_week), and Postgres can
-- use that index for a phase_id-only lookup because phase_id leads it.

do $$
declare
  spec   record;
  col    text;
  missing text;
  made   int := 0;
  gone   int := 0;
begin
  for spec in
    select * from (values
      -- Programme structure
      ('programme_phases',      'idx_programme_phases_programme',   'programme_id',                array['programme_id']),
      ('workout_sections',      'idx_workout_sections_day',         'day_id',                      array['day_id']),
      ('section_exercises',     'idx_section_exercises_section',    'section_id',                  array['section_id']),
      ('exercise_sets',         'idx_exercise_sets_exercise',       'exercise_id',                 array['exercise_id']),
      ('programmes',            'idx_programmes_trainer',           'trainer_id',                  array['trainer_id']),

      -- Scheduling and logging. The client calendar and week strip both filter
      -- by client and date range, so the composite serves them in one index.
      ('client_workouts',       'idx_client_workouts_client_date',  'client_id, scheduled_date',   array['client_id','scheduled_date']),
      ('client_workouts',       'idx_client_workouts_day',          'day_id',                      array['day_id']),
      ('client_workouts',       'idx_client_workouts_trainer',      'trainer_id',                  array['trainer_id']),
      ('workout_sessions',      'idx_workout_sessions_client',      'client_id, completed_at desc',array['client_id','completed_at']),
      ('workout_sessions',      'idx_workout_sessions_day',         'day_id',                      array['day_id']),

      -- The single biggest table over time - every set of every session.
      ('logged_sets',           'idx_logged_sets_session',          'session_id',                  array['session_id']),
      ('logged_sets',           'idx_logged_sets_exercise',         'exercise_id',                 array['exercise_id']),
      -- Prior-progress and the lift charts match history by name.
      ('logged_sets',           'idx_logged_sets_name',             'exercise_name',               array['exercise_name']),

      -- Client records
      ('profiles',              'idx_profiles_trainer',             'trainer_id',                  array['trainer_id']),
      ('managed_clients',       'idx_managed_clients_trainer',      'trainer_id',                  array['trainer_id']),
      ('client_tasks',          'idx_client_tasks_client',          'client_id',                   array['client_id']),
      ('client_tasks',          'idx_client_tasks_trainer',         'trainer_id',                  array['trainer_id']),
      ('client_goals',          'idx_client_goals_client',          'client_id',                   array['client_id']),
      ('client_documents',      'idx_client_documents_client',      'client_id',                   array['client_id']),
      ('client_injuries',       'idx_client_injuries_client',       'client_id',                   array['client_id']),
      ('client_injury_notes',   'idx_client_injury_notes_injury',   'injury_id',                   array['injury_id']),
      ('body_metrics',          'idx_body_metrics_client',          'client_id, recorded_at desc', array['client_id','recorded_at']),
      ('progress_photos',       'idx_progress_photos_client',       'client_id, taken_on desc',    array['client_id','taken_on']),
      ('health_daily',          'idx_health_daily_client',          'client_id, day desc',         array['client_id','day']),
      ('client_custom_metrics', 'idx_client_custom_metrics_client', 'client_id',                   array['client_id']),
      ('custom_metric_entries', 'idx_custom_metric_entries_metric', 'metric_id, recorded_at desc', array['metric_id','recorded_at']),
      ('wearable_connections',  'idx_wearable_connections_client',  'client_id',                   array['client_id']),

      -- Library and content
      ('exercises',             'idx_exercises_trainer',            'trainer_id',                  array['trainer_id']),
      ('recipes',               'idx_recipes_trainer',              'trainer_id',                  array['trainer_id']),
      ('recipe_ingredients',    'idx_recipe_ingredients_recipe',    'recipe_id, sort_order',       array['recipe_id','sort_order']),
      ('recipe_steps',          'idx_recipe_steps_recipe',          'recipe_id, sort_order',       array['recipe_id','sort_order']),
      ('guides',                'idx_guides_trainer',               'trainer_id',                  array['trainer_id']),
      ('forms',                 'idx_forms_trainer',                'trainer_id',                  array['trainer_id']),
      ('task_templates',        'idx_task_templates_trainer',       'trainer_id',                  array['trainer_id']),
      ('favourites',            'idx_favourites_user',              'user_id, item_type',          array['user_id','item_type']),

      -- Messaging and misc. The bell badge counts unread per recipient.
      ('notifications',         'idx_notifications_recipient',      'recipient_id, created_at desc',array['recipient_id','created_at']),
      ('form_responses',        'idx_form_responses_form',          'form_id',                     array['form_id']),
      ('form_responses',        'idx_form_responses_client',        'client_id',                   array['client_id']),
      ('exercise_comments',     'idx_exercise_comments_client',     'client_id, exercise_id',      array['client_id','exercise_id']),
      ('invites',               'idx_invites_trainer',              'trainer_id',                  array['trainer_id']),
      ('invites',               'idx_invites_code',                 'code',                        array['code'])
    ) as t(tbl, idx, cols, needed)
  loop
    -- Table present?
    if to_regclass('public.' || spec.tbl) is null then
      raise notice 'skipped % - table public.% does not exist', spec.idx, spec.tbl;
      gone := gone + 1;
      continue;
    end if;

    -- Every column present? A table can exist while a later migration that
    -- added one of these columns has not been run.
    missing := null;
    foreach col in array spec.needed loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = spec.tbl and column_name = col
      ) then
        missing := col;
        exit;
      end if;
    end loop;

    if missing is not null then
      raise notice 'skipped % - public.%.% does not exist', spec.idx, spec.tbl, missing;
      gone := gone + 1;
      continue;
    end if;

    execute format('create index if not exists %I on public.%I (%s)', spec.idx, spec.tbl, spec.cols);
    made := made + 1;
  end loop;

  raise notice 'indexes: % created or already present, % skipped', made, gone;
end $$;
