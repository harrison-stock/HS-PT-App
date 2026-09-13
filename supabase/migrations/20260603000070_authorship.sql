-- Who wrote a note, and who may change it.
--
-- Comments and injury notes were governed by a single policy each, `for all`,
-- granting every operation to anyone who could reach the parent record:
--
--   create policy "exercise_comments: access" on public.exercise_comments for all
--     using (client_id = auth.uid() or <their coach>) with check (same);
--
-- Reading is right that way - both sides of a coaching relationship should see
-- the whole thread. Writing is not. As it stood a client could edit or delete
-- their coach's notes on their own injury, and could insert a comment with
-- author_id set to the coach, because author_id was never checked against who
-- was actually writing. An injury record that can be rewritten by its subject
-- is not a record.
--
-- Split by operation: everyone with access reads, everyone with access writes
-- as themselves, and only the author may change or remove what they wrote.
-- Nobody's account of a session can be edited by the other party.

-- ── exercise_comments ────────────────────────────────────────────────────────
drop policy if exists "exercise_comments: access"      on public.exercise_comments;
drop policy if exists "exercise_comments: read"        on public.exercise_comments;
drop policy if exists "exercise_comments: write own"   on public.exercise_comments;
drop policy if exists "exercise_comments: edit own"    on public.exercise_comments;
drop policy if exists "exercise_comments: delete own"  on public.exercise_comments;

create policy "exercise_comments: read" on public.exercise_comments for select
  using (
    client_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = client_id and p.trainer_id = auth.uid())
    or exists (select 1 from public.managed_clients mc where mc.id = client_id and mc.trainer_id = auth.uid())
  );

create policy "exercise_comments: write own" on public.exercise_comments for insert
  with check (
    author_id = auth.uid()
    and (
      client_id = auth.uid()
      or exists (select 1 from public.profiles p where p.id = client_id and p.trainer_id = auth.uid())
      or exists (select 1 from public.managed_clients mc where mc.id = client_id and mc.trainer_id = auth.uid())
    )
  );

create policy "exercise_comments: edit own" on public.exercise_comments for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy "exercise_comments: delete own" on public.exercise_comments for delete
  using (author_id = auth.uid());

-- ── client_injury_notes ──────────────────────────────────────────────────────
drop policy if exists "client_injury_notes: access"     on public.client_injury_notes;
drop policy if exists "client_injury_notes: read"       on public.client_injury_notes;
drop policy if exists "client_injury_notes: write own"  on public.client_injury_notes;
drop policy if exists "client_injury_notes: edit own"   on public.client_injury_notes;
drop policy if exists "client_injury_notes: delete own" on public.client_injury_notes;

create policy "client_injury_notes: read" on public.client_injury_notes for select
  using (exists (
    select 1 from public.client_injuries ci
    where ci.id = injury_id and (
      ci.client_id = auth.uid()
      or ci.trainer_id = auth.uid()
      or exists (select 1 from public.profiles p where p.id = ci.client_id and p.trainer_id = auth.uid())
    )
  ));

create policy "client_injury_notes: write own" on public.client_injury_notes for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.client_injuries ci
      where ci.id = injury_id and (
        ci.client_id = auth.uid()
        or ci.trainer_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = ci.client_id and p.trainer_id = auth.uid())
      )
    )
  );

create policy "client_injury_notes: edit own" on public.client_injury_notes for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy "client_injury_notes: delete own" on public.client_injury_notes for delete
  using (author_id = auth.uid());

-- ── form_responses ───────────────────────────────────────────────────────────
-- A check-in is a statement about how someone felt on a day. `for all` let the
-- client rewrite last month's answers, or delete them, long after the coach had
-- read and acted on them - and a health record that changes under you is worse
-- than no record. They may submit, and read their own back. Changing an answer
-- means submitting again, which leaves both.
drop policy if exists "form_responses: client own"    on public.form_responses;
drop policy if exists "form_responses: client read"   on public.form_responses;
drop policy if exists "form_responses: client submit" on public.form_responses;

create policy "form_responses: client read" on public.form_responses for select
  using (client_id = auth.uid());

create policy "form_responses: client submit" on public.form_responses for insert
  with check (client_id = auth.uid());
