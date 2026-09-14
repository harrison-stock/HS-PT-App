-- A check-in should still mean what it meant when it was answered.
--
-- form_responses stores answers keyed by field id and reads the questions from
-- the live form. So editing a question rewrites history: change "How is your
-- sleep? (1-5)" to "How is your energy? (1-5)" and every answer a client has
-- ever given to the first one is now displayed against the second. Nothing is
-- corrupted, and every number is wrong.
--
-- Worse, form_responses.form_id cascaded on delete. Retiring a form a coach no
-- longer uses destroyed every answer anyone had given it - months of weekly
-- check-ins, gone, as a side effect of tidying up.
--
-- So a response now carries the questions it was actually asked, and deleting
-- the form no longer deletes the record of what people said.

alter table public.form_responses
  add column if not exists fields     jsonb,
  add column if not exists form_title text;

-- Retiring, not destroying. The builder archives instead of deleting now, and
-- archived forms stay out of the picker while their history stays readable.
alter table public.forms
  add column if not exists archived boolean not null default false;

-- The existing answers have no snapshot and there is only one honest thing to
-- put there: the questions as the form stands today. That is what the app was
-- already showing them against, so nothing changes on screen - but from here on
-- the pairing is fixed rather than following the form around.
update public.form_responses r
   set fields     = coalesce(r.fields, f.fields),
       form_title = coalesce(r.form_title, f.title)
  from public.forms f
 where f.id = r.form_id
   and (r.fields is null or r.form_title is null);

-- Answers outlive the form they answered.
alter table public.form_responses
  drop constraint if exists form_responses_form_id_fkey;
alter table public.form_responses
  add constraint form_responses_form_id_fkey
  foreign key (form_id) references public.forms(id) on delete set null;

-- The trainer read policy joins through forms, so a response whose form has
-- gone would become invisible to the only person who can read it. Ownership is
-- recorded on the response itself instead.
alter table public.form_responses
  add column if not exists trainer_id uuid references public.profiles(id) on delete set null;

update public.form_responses r
   set trainer_id = f.trainer_id
  from public.forms f
 where f.id = r.form_id and r.trainer_id is null;

-- Anything already orphaned falls back to the client's own coach.
update public.form_responses r
   set trainer_id = p.trainer_id
  from public.profiles p
 where p.id = r.client_id and r.trainer_id is null;

drop policy if exists "form_responses: trainer read" on public.form_responses;
create policy "form_responses: trainer read" on public.form_responses for select
  using (
    trainer_id = auth.uid()
    or exists (select 1 from public.forms f where f.id = form_id and f.trainer_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = client_id and p.trainer_id = auth.uid())
  );

create index if not exists form_responses_trainer_idx on public.form_responses (trainer_id);
