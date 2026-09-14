\set ON_ERROR_STOP off
\set QUIET on
\pset pager off
set client_min_messages to warning;

create table if not exists public._t (n serial, label text, pass boolean, detail text);
truncate public._t;

create or replace function public.t(label text, cond boolean, detail text default '')
returns void language sql as $$ insert into public._t(label, pass, detail) values (label, cond, detail); $$;

-- Act as a signed-in app user.
create or replace function public.be(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'harrison@harrisonstock.co.uk', '{"name":"Harrison"}');
update public.profiles set role = 'trainer' where id = '11111111-1111-1111-1111-111111111111';

-- A managed client the coach has been keeping records for, not yet signed up.
insert into public.managed_clients (id, trainer_id, name, email, credits, client_status, medical_notes)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        'Victim Vic', 'vic@example.com', 7, 'online', 'Historic ACL reconstruction, left knee');
insert into public.client_injuries (id, client_id, trainer_id, muscle_group, note)
values ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', 'quads', 'Sore after squats');

-- The invite the coach sent Vic.
select public.be('11111111-1111-1111-1111-111111111111');
select public.create_invite('Victim Vic', 'vic@example.com', '22222222-2222-2222-2222-222222222222') as tok
\gset
select public.be(null);

-- An ordinary signed-up client: the attacker.
insert into auth.users (id, email, raw_user_meta_data) values
  ('33333333-3333-3333-3333-333333333333', 'mallory@example.com', '{"name":"Mallory"}');

-- ════════════════════════════════════════════════════════════════════════════
--  S2 — can a signed-in user take someone else's records?
-- ════════════════════════════════════════════════════════════════════════════
select public.be('33333333-3333-3333-3333-333333333333');
set role authenticated;

select public.t('067 invites are not a directory',
  (select count(*) from public.invites) = 0,
  'rows visible to a client: ' || (select count(*) from public.invites)::text);

reset role;
select public.be(null);

-- The original attack: sign up naming someone else's managed client.
insert into auth.users (id, email, raw_user_meta_data) values
  ('55555555-5555-5555-5555-555555555555', 'thief@example.com',
   '{"name":"Thief","managed_client_id":"22222222-2222-2222-2222-222222222222","trainer_id":"11111111-1111-1111-1111-111111111111","role":"trainer"}');

select public.t('S2 forged managed_client_id does not link',
  (select linked_profile_id from public.managed_clients where id = '22222222-2222-2222-2222-222222222222') is null);
select public.t('S2 victim''s injury record did not move',
  (select client_id from public.client_injuries where id = '44444444-4444-4444-4444-444444444444')
    = '22222222-2222-2222-2222-222222222222');
select public.t('S2 thief got no medical notes',
  coalesce((select medical_notes from public.profiles where id = '55555555-5555-5555-5555-555555555555'), '') = '');
select public.t('S2 thief got no credits',
  coalesce((select credits from public.profiles where id = '55555555-5555-5555-5555-555555555555'), 0) = 0);
select public.t('068 role cannot be claimed at sign-up',
  (select role from public.profiles where id = '55555555-5555-5555-5555-555555555555') = 'client');

-- ════════════════════════════════════════════════════════════════════════════
--  069 — does a real invite still work?
-- ════════════════════════════════════════════════════════════════════════════
insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-6666-6666-6666-666666666666', 'vic@example.com',
   jsonb_build_object('name','Vic','invite_token', :'tok'));

select public.t('069 the real invitee links to their record',
  (select linked_profile_id from public.managed_clients where id = '22222222-2222-2222-2222-222222222222')
    = '66666666-6666-6666-6666-666666666666');
select public.t('069 their history follows them',
  (select client_id from public.client_injuries where id = '44444444-4444-4444-4444-444444444444')
    = '66666666-6666-6666-6666-666666666666');
select public.t('069 their notes and credits follow them',
  (select medical_notes from public.profiles where id = '66666666-6666-6666-6666-666666666666')
    = 'Historic ACL reconstruction, left knee'
  and (select credits from public.profiles where id = '66666666-6666-6666-6666-666666666666') = 7);
select public.t('069 the invite is stamped claimed',
  (select claimed_by from public.invites where client_email = 'vic@example.com')
    = '66666666-6666-6666-6666-666666666666');
select public.t('069 the plaintext token is not stored',
  (select count(*) from public.invites where code is not null and code = :'tok') = 0);

-- Replay: the same token, a second time.
insert into auth.users (id, email, raw_user_meta_data) values
  ('77777777-7777-7777-7777-777777777777', 'vic@example.com',
   jsonb_build_object('name','Replay','invite_token', :'tok'));
select public.t('069 a used token cannot be replayed',
  (select linked_profile_id from public.managed_clients where id = '22222222-2222-2222-2222-222222222222')
    = '66666666-6666-6666-6666-666666666666');

-- A forged token.
insert into auth.users (id, email, raw_user_meta_data) values
  ('88888888-8888-8888-8888-888888888888', 'guess@example.com',
   '{"name":"Guess","invite_token":"deadbeefdeadbeefdeadbeefdeadbeef"}');
select public.t('069 a forged token yields an ordinary account',
  (select role from public.profiles where id = '88888888-8888-8888-8888-888888888888') = 'client'
  and (select trainer_id from public.profiles where id = '88888888-8888-8888-8888-888888888888')
      = '11111111-1111-1111-1111-111111111111');

-- Email mismatch, and expiry.
select public.be('11111111-1111-1111-1111-111111111111');
select public.create_invite('Someone Else', 'someone@example.com', null) as tok2 \gset
select public.create_invite('No Email', '', null) as tok3 \gset
select public.create_invite('Will Expire', 'late@example.com', null) as tok4 \gset
select public.be(null);
update public.invites set expires_at = now() - interval '1 day' where client_email = 'late@example.com';

insert into auth.users (id, email, raw_user_meta_data) values
  ('99999999-9999-9999-9999-999999999999', 'wrong@example.com',
   jsonb_build_object('name','Wrong','invite_token', :'tok2'));
select public.t('069 a token used from the wrong email does not claim',
  (select claimed_by from public.invites where client_email = 'someone@example.com') is null);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'anyone@example.com',
   jsonb_build_object('name','Anyone','invite_token', :'tok3'));
select public.t('069 an invite with no email claims on the token alone',
  (select claimed_by from public.invites where client_name = 'No Email')
    = 'aaaaaaaa-0000-0000-0000-000000000001');

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'late@example.com',
   jsonb_build_object('name','Late','invite_token', :'tok4'));
select public.t('069 an expired token does not claim',
  (select claimed_by from public.invites where client_email = 'late@example.com') is null);

-- create_invite's own guards.
select public.be('33333333-3333-3333-3333-333333333333');
set role authenticated;
do $$ begin
  perform public.create_invite('X','x@example.com', null);
  perform public.t('069 a client cannot create an invite', false, 'it succeeded');
exception when others then
  perform public.t('069 a client cannot create an invite', true, sqlerrm);
end $$;
reset role;

select public.be('11111111-1111-1111-1111-111111111111');
insert into public.profiles (id, role, name, email) values ('bbbbbbbb-0000-0000-0000-000000000001','trainer','Other Coach','other@x.com');
insert into public.managed_clients (id, trainer_id, name) values
  ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','Their Client');
do $$ begin
  perform public.create_invite('Steal','s@example.com','cccccccc-0000-0000-0000-000000000001');
  perform public.t('069 a coach cannot invite into another coach''s client', false, 'it succeeded');
exception when others then
  perform public.t('069 a coach cannot invite into another coach''s client', true, sqlerrm);
end $$;
select public.be(null);

-- ════════════════════════════════════════════════════════════════════════════
--  068 — the profile column guard
-- ════════════════════════════════════════════════════════════════════════════
-- Mallory, an ordinary client, editing her own row.
select public.be('33333333-3333-3333-3333-333333333333');
set role authenticated;

update public.profiles set role = 'trainer' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set credits = 999 where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set billing_status = 'active', billing_period_end = now() + interval '1 year'
  where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set trainer_id = '33333333-3333-3333-3333-333333333333' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set archived = false, client_status = 'in_person', coach_notes = 'I am great'
  where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set name = 'Mallory Renamed', timezone = 'Europe/Paris'
  where id = '33333333-3333-3333-3333-333333333333';

reset role;
select public.t('068 client cannot promote themselves',
  (select role from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'client');
select public.t('068 client cannot award themselves credits',
  coalesce((select credits from public.profiles where id='33333333-3333-3333-3333-333333333333'),0) = 0);
select public.t('068 client cannot mark themselves paid',
  coalesce((select billing_status from public.profiles where id='33333333-3333-3333-3333-333333333333'),'') <> 'active');
select public.t('068 client cannot reassign their coach',
  (select trainer_id from public.profiles where id='33333333-3333-3333-3333-333333333333')
    = '11111111-1111-1111-1111-111111111111');
select public.t('068 client cannot write coach notes about themselves',
  coalesce((select coach_notes from public.profiles where id='33333333-3333-3333-3333-333333333333'),'') = '');
select public.t('068 client CAN still edit their name and timezone',
  (select name from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'Mallory Renamed'
  and (select timezone from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'Europe/Paris');

-- The coach, editing their client. Everything the app actually saves must work.
select public.be('11111111-1111-1111-1111-111111111111');
set role authenticated;
update public.profiles set
  name = 'Mallory Edited', email = 'm2@example.com', date_of_birth = '1985-04-02',
  credits = 5, client_status = 'in_person', subscription_due = '2026-12-01',
  timezone = 'Europe/London', billing_url = 'https://buy.stripe.com/x',
  daily_step_goal = 9000, coach_notes = 'Works nights', medical_notes = 'Asthma', archived = true
where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set role = 'trainer', billing_status = 'active'
where id = '33333333-3333-3333-3333-333333333333';
reset role;

select public.t('068 coach CAN save every field the app edits',
  (select name from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'Mallory Edited'
  and (select credits from public.profiles where id='33333333-3333-3333-3333-333333333333') = 5
  and (select client_status from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'in_person'
  and (select daily_step_goal from public.profiles where id='33333333-3333-3333-3333-333333333333') = 9000
  and (select coach_notes from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'Works nights'
  and (select medical_notes from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'Asthma'
  and (select date_of_birth from public.profiles where id='33333333-3333-3333-3333-333333333333') = '1985-04-02'
  and (select archived from public.profiles where id='33333333-3333-3333-3333-333333333333') = true);
select public.t('068 coach cannot promote a client either',
  (select role from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'client');
select public.t('068 coach cannot mark a client paid by hand',
  coalesce((select billing_status from public.profiles where id='33333333-3333-3333-3333-333333333333'),'') <> 'active');

-- The coach editing their own row (the portal link lives there).
set role authenticated;
update public.profiles set stripe_portal_url = 'https://billing.stripe.com/p/login/z', name = 'Harrison S'
  where id = '11111111-1111-1111-1111-111111111111';
reset role;
select public.t('068 coach CAN save their own portal link',
  (select stripe_portal_url from public.profiles where id='11111111-1111-1111-1111-111111111111')
    = 'https://billing.stripe.com/p/login/z');

-- A stranger reaching for someone else's row.
select public.be('88888888-8888-8888-8888-888888888888');
set role authenticated;
update public.profiles set credits = 50, name = 'hacked' where id = '33333333-3333-3333-3333-333333333333';
reset role;
select public.t('068 another client cannot touch the row at all',
  (select name from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'Mallory Edited');

-- The Stripe webhook runs as the service role: no JWT subject, RLS bypassed.
select public.be(null);
set role service_role;
update public.profiles set billing_status = 'active', billing_period_end = now() + interval '30 days',
  billing_amount = 12000, billing_currency = 'gbp', stripe_customer_id = 'cus_123', billing_synced_at = now()
where id = '33333333-3333-3333-3333-333333333333';
reset role;
select public.t('068 the Stripe webhook can still write billing',
  (select billing_status from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'active'
  and (select billing_amount from public.profiles where id='33333333-3333-3333-3333-333333333333') = 12000
  and (select stripe_customer_id from public.profiles where id='33333333-3333-3333-3333-333333333333') = 'cus_123');

-- ════════════════════════════════════════════════════════════════════════════
--  070 — authorship
-- ════════════════════════════════════════════════════════════════════════════
select public.be(null);
insert into public.client_injuries (id, client_id, trainer_id, muscle_group, note)
values ('dddddddd-1111-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111', 'knee', 'Coach assessment');

-- The coach writes a note on their client's injury.
select public.be('11111111-1111-1111-1111-111111111111');
set role authenticated;
insert into public.client_injury_notes (id, injury_id, author_id, body)
values ('eeeeeeee-1111-0000-0000-000000000001', 'dddddddd-1111-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Loading looked off on the left');
reset role;
select public.t('070 the coach can write a note on their client',
  (select count(*) from public.client_injury_notes where id = 'eeeeeeee-1111-0000-0000-000000000001') = 1);

-- The client tries to rewrite it, delete it, and forge one in the coach's name.
select public.be('33333333-3333-3333-3333-333333333333');
set role authenticated;
update public.client_injury_notes set body = 'Everything is fine'
  where id = 'eeeeeeee-1111-0000-0000-000000000001';
delete from public.client_injury_notes where id = 'eeeeeeee-1111-0000-0000-000000000001';
insert into public.client_injury_notes (injury_id, author_id, body)
  values ('dddddddd-1111-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Signed by the coach');
reset role;

select public.t('070 a client cannot rewrite their coach''s note',
  (select body from public.client_injury_notes where id = 'eeeeeeee-1111-0000-0000-000000000001')
    = 'Loading looked off on the left');
select public.t('070 a client cannot delete their coach''s note',
  (select count(*) from public.client_injury_notes where id = 'eeeeeeee-1111-0000-0000-000000000001') = 1);
select public.t('070 a client cannot post as their coach',
  (select count(*) from public.client_injury_notes where body = 'Signed by the coach') = 0);

-- But they can still take part.
select public.be('33333333-3333-3333-3333-333333333333');
set role authenticated;
insert into public.client_injury_notes (injury_id, author_id, body)
  values ('dddddddd-1111-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Still aches on stairs');
reset role;
select public.t('070 a client CAN add their own note',
  (select count(*) from public.client_injury_notes where body = 'Still aches on stairs') = 1);

-- Check-ins are a record, not a draft.
select public.be(null);
insert into public.forms (id, trainer_id, title) values ('ffffffff-1111-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Weekly');
insert into public.form_responses (id, form_id, client_id, answers)
values ('ffffffff-2222-0000-0000-000000000001','ffffffff-1111-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','{"sleep":"poor"}');
select public.be('33333333-3333-3333-3333-333333333333');
set role authenticated;
update public.form_responses set answers = '{"sleep":"great"}' where id = 'ffffffff-2222-0000-0000-000000000001';
delete from public.form_responses where id = 'ffffffff-2222-0000-0000-000000000001';
insert into public.form_responses (form_id, client_id, answers)
  values ('ffffffff-1111-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','{"sleep":"ok"}');
reset role;
select public.t('070 a submitted check-in cannot be rewritten later',
  (select answers->>'sleep' from public.form_responses where id = 'ffffffff-2222-0000-0000-000000000001') = 'poor');
select public.t('070 a submitted check-in cannot be deleted',
  (select count(*) from public.form_responses where id = 'ffffffff-2222-0000-0000-000000000001') = 1);
select public.t('070 a client CAN still submit a new one',
  (select count(*) from public.form_responses where answers->>'sleep' = 'ok') = 1);

-- ════════════════════════════════════════════════════════════════════════════
--  071 — a client completing a recurring task keeps the series alive
-- ════════════════════════════════════════════════════════════════════════════
select public.be(null);
insert into public.client_tasks (id, client_id, trainer_id, title, kind, due_date, recurrence)
values ('aaaa0000-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111','Weekly check-in','check', current_date, 'weekly');

-- The client ticks it off. Before this migration the update landed, the insert
-- of the next occurrence was refused by RLS, and the series ended there.
select public.be('33333333-3333-3333-3333-333333333333');
set role authenticated;
select public.complete_task('aaaa0000-0000-0000-0000-000000000001', true);
reset role;

select public.t('071 the task is marked done',
  (select completed_at from public.client_tasks where id='aaaa0000-0000-0000-0000-000000000001') is not null);
select public.t('071 the series continues after the CLIENT completes it',
  (select count(*) from public.client_tasks
    where client_id='33333333-3333-3333-3333-333333333333' and title='Weekly check-in'
      and completed_at is null) = 1);
select public.t('071 the next one is a week later, and still the coach''s row',
  (select due_date from public.client_tasks where title='Weekly check-in' and completed_at is null)
    = current_date + 7
  and (select trainer_id from public.client_tasks where title='Weekly check-in' and completed_at is null)
    = '11111111-1111-1111-1111-111111111111');

-- Ticking it twice must not produce two.
select public.be('33333333-3333-3333-3333-333333333333');
set role authenticated;
select public.complete_task('aaaa0000-0000-0000-0000-000000000001', true);
reset role;
select public.t('071 completing twice does not spawn twice',
  (select count(*) from public.client_tasks where title='Weekly check-in') = 2);

-- Month-end: 31 January monthly must land on 28/29 February, not in March.
select public.be(null);
insert into public.client_tasks (id, client_id, trainer_id, title, kind, due_date, recurrence)
values ('aaaa0000-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111','Monthly photos','photo', date '2027-01-31', 'monthly');
select public.be('33333333-3333-3333-3333-333333333333');
set role authenticated;
select public.complete_task('aaaa0000-0000-0000-0000-000000000002', true);
reset role;
select public.t('071 monthly from the 31st lands at month end, not in the month after',
  (select due_date from public.client_tasks where title='Monthly photos' and completed_at is null)
    = date '2027-02-28',
  'got ' || coalesce((select due_date from public.client_tasks where title='Monthly photos' and completed_at is null)::text,'none'));

-- The RPC exists because the client genuinely cannot do this themselves, and
-- that is still true - the fix is a narrow privileged path, not a wider policy.
select public.be('33333333-3333-3333-3333-333333333333');
set role authenticated;
insert into public.client_tasks (client_id, trainer_id, title, kind, due_date)
  values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','Self-assigned','check', current_date);
reset role;
select public.t('071 a client still cannot create tasks directly',
  (select count(*) from public.client_tasks where title='Self-assigned') = 0);

-- Somebody else's task is nobody else's business.
select public.be('88888888-8888-8888-8888-888888888888');
set role authenticated;
do $$ begin
  perform public.complete_task('aaaa0000-0000-0000-0000-000000000001', false);
  perform public.t('071 a stranger cannot complete someone else''s task', false, 'it succeeded');
exception when others then
  perform public.t('071 a stranger cannot complete someone else''s task', true, sqlerrm);
end $$;
reset role;
select public.be(null);

-- ════════════════════════════════════════════════════════════════════════════
--  072 — the set types the builder offers are the set types the column takes
-- ════════════════════════════════════════════════════════════════════════════
-- Worth pinning. The two drifted apart once already, and because saving a day
-- deletes its sections before rebuilding them, the mismatch didn't reject a
-- button - it emptied a workout the coach had just written.
select public.be(null);
insert into public.programmes (id, trainer_id, name)
  values ('cccc0000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','P');
insert into public.programme_phases (id, programme_id, name)
  values ('cccc0000-0000-0000-0000-0000000000b1','cccc0000-0000-0000-0000-0000000000a1','Ph');
insert into public.programme_days (id, phase_id, week_index, day_of_week)
  values ('cccc0000-0000-0000-0000-0000000000c1','cccc0000-0000-0000-0000-0000000000b1',0,0);
insert into public.workout_sections (id, day_id, kind, title, sort_order)
  values ('cccc0000-0000-0000-0000-0000000000d1','cccc0000-0000-0000-0000-0000000000c1','MAIN','Workout',0);
insert into public.section_exercises (id, section_id, name, sort_order)
  values ('cccc0000-0000-0000-0000-0000000000e1','cccc0000-0000-0000-0000-0000000000d1','Back Squat',0);

do $$
declare k text; ok int := 0; i int := 0;
begin
  foreach k in array array['WARMUP','WORK','DROPSET','FAILURE','PARTIAL'] loop
    i := i + 1;
    begin
      insert into public.exercise_sets (exercise_id, set_index, kind, reps, reps_text, weight_kg)
      values ('cccc0000-0000-0000-0000-0000000000e1', i, k, 8, '8', 60);
      ok := ok + 1;
    exception when others then null;
    end;
  end loop;
  perform public.t('072 every set type the builder offers is storable', ok = 5, ok::text || ' of 5');
end $$;

select public.t('072 nothing is left on the old DROP spelling',
  (select count(*) from public.exercise_sets where kind = 'DROP') = 0);

do $$
begin
  insert into public.exercise_sets (exercise_id, set_index, kind, reps, reps_text, weight_kg)
  values ('cccc0000-0000-0000-0000-0000000000e1', 99, 'NONSENSE', 8, '8', 60);
  perform public.t('072 an invalid set type is still refused', false, 'it was accepted');
exception when check_violation then
  perform public.t('072 an invalid set type is still refused', true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════
--  073 — a scheduled occurrence is its own thing
-- ════════════════════════════════════════════════════════════════════════════
-- One day copy on the calendar twice, which is what assigning a workout to two
-- dates produces. Before this, finishing either marked both done and opening
-- either showed the newer one's results.
select public.be(null);
insert into public.programme_days (id, phase_id, owner_client_id, week_index, day_of_week, title)
  values ('bbbb0000-0000-0000-0000-0000000000c1', null, '33333333-3333-3333-3333-333333333333', 0, 1, 'Push A');
insert into public.client_workouts (id, client_id, trainer_id, day_id, scheduled_date, status) values
  ('bbbb0000-0000-0000-0000-0000000000f1','33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','bbbb0000-0000-0000-0000-0000000000c1', current_date - 7, 'scheduled'),
  ('bbbb0000-0000-0000-0000-0000000000f2','33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','bbbb0000-0000-0000-0000-0000000000c1', current_date, 'scheduled');

-- Finish only last week's, the way the app now does it.
insert into public.workout_sessions (id, client_id, day_id, client_workout_id, started_at, completed_at)
  values ('bbbb0000-0000-0000-0000-00000000a001','33333333-3333-3333-3333-333333333333','bbbb0000-0000-0000-0000-0000000000c1','bbbb0000-0000-0000-0000-0000000000f1', now() - interval '7 days', now() - interval '7 days' + interval '1 hour');
update public.client_workouts set status='completed' where id='bbbb0000-0000-0000-0000-0000000000f1';

select public.t('073 finishing one occurrence does not finish the other',
  (select status from public.client_workouts where id='bbbb0000-0000-0000-0000-0000000000f1') = 'completed'
  and (select status from public.client_workouts where id='bbbb0000-0000-0000-0000-0000000000f2') = 'scheduled');

select public.t('073 today has no results of its own yet',
  (select count(*) from public.workout_sessions
    where client_workout_id='bbbb0000-0000-0000-0000-0000000000f2' and completed_at is not null) = 0);

select public.t('073 last week''s results stay attached to last week',
  (select count(*) from public.workout_sessions
    where client_workout_id='bbbb0000-0000-0000-0000-0000000000f1' and completed_at is not null) = 1);

-- And the backfill can tell two sessions of one repeated day apart.
insert into public.workout_sessions (id, client_id, day_id, started_at, completed_at)
  values ('bbbb0000-0000-0000-0000-00000000a002','33333333-3333-3333-3333-333333333333','bbbb0000-0000-0000-0000-0000000000c1', now() - interval '1 hour', now());
select public.t('073 a session logged without an occurrence is still findable by day',
  (select count(*) from public.workout_sessions
    where day_id='bbbb0000-0000-0000-0000-0000000000c1' and client_workout_id is null) = 1);

-- ════════════════════════════════════════════════════════════════════════════
--  074 — saving a workout is all-or-nothing
-- ════════════════════════════════════════════════════════════════════════════
select public.be(null);
insert into public.workout_sections (id, day_id, kind, title, sort_order)
  values ('7777aaaa-0000-0000-0000-0000000000d1','bbbb0000-0000-0000-0000-0000000000c1','MAIN','Workout',0);
insert into public.section_exercises (id, section_id, name, sort_order)
  values ('7777aaaa-0000-0000-0000-0000000000e1','7777aaaa-0000-0000-0000-0000000000d1','Bench Press',0);

-- A first save, by the client, through the function.
select public.be('33333333-3333-3333-3333-333333333333');
set role authenticated;
select public.save_workout_session(
  '33333333-3333-3333-3333-333333333333','bbbb0000-0000-0000-0000-0000000000c1',
  'bbbb0000-0000-0000-0000-0000000000f2', now() - interval '1 hour', now(), null,
  '[{"exercise_id":"7777aaaa-0000-0000-0000-0000000000e1","exercise_name":"Bench Press","set_index":0,"actual_reps":8,"actual_weight_kg":60},
    {"exercise_id":"7777aaaa-0000-0000-0000-0000000000e1","exercise_name":"Bench Press","set_index":1,"actual_reps":8,"actual_weight_kg":60}]'::jsonb
) as sid \gset
reset role;

select public.t('074 a client can save their own session through the function',
  (select count(*) from public.logged_sets where session_id = :'sid') = 2);
select public.t('074 it marks that occurrence complete',
  (select status from public.client_workouts where id='bbbb0000-0000-0000-0000-0000000000f2') = 'completed');
select public.t('074 and leaves the other occurrence alone',
  (select status from public.client_workouts where id='bbbb0000-0000-0000-0000-0000000000f1') = 'completed');

-- Amending: two better sets replace the two that were there.
select public.be('33333333-3333-3333-3333-333333333333');
set role authenticated;
select public.save_workout_session(
  '33333333-3333-3333-3333-333333333333','bbbb0000-0000-0000-0000-0000000000c1',
  'bbbb0000-0000-0000-0000-0000000000f2', now() - interval '1 hour', now(), :'sid',
  '[{"exercise_id":"7777aaaa-0000-0000-0000-0000000000e1","exercise_name":"Bench Press","set_index":0,"actual_reps":8,"actual_weight_kg":75}]'::jsonb
);
reset role;
select public.t('074 an amend replaces rather than accumulates',
  (select count(*) from public.logged_sets where session_id = :'sid') = 1
  and (select actual_weight_kg from public.logged_sets where session_id = :'sid') = 75);

-- The point of the whole thing: a set that cannot be stored rolls the rest back.
-- A non-existent exercise_id violates the foreign key part-way through.
select public.be('33333333-3333-3333-3333-333333333333');
set role authenticated;
do $$ begin
  perform public.save_workout_session(
    '33333333-3333-3333-3333-333333333333','bbbb0000-0000-0000-0000-0000000000c1',
    'bbbb0000-0000-0000-0000-0000000000f2', now() - interval '1 hour', now(),
    (select id from public.workout_sessions where client_workout_id='bbbb0000-0000-0000-0000-0000000000f2' limit 1),
    '[{"exercise_id":"7777aaaa-0000-0000-0000-0000000000e1","exercise_name":"Bench","set_index":0,"actual_reps":5,"actual_weight_kg":100},
      {"exercise_id":"00000000-0000-0000-0000-0000000000ff","exercise_name":"Ghost","set_index":1,"actual_reps":5,"actual_weight_kg":100}]'::jsonb);
  perform public.t('074 a failed save changes nothing at all', false, 'it reported success');
exception when others then
  perform public.t('074 a failed save changes nothing at all', true, sqlerrm);
end $$;
reset role;

select public.t('074 the previous results survived that failure untouched',
  (select count(*) from public.logged_sets where session_id = :'sid') = 1
  and (select actual_weight_kg from public.logged_sets where session_id = :'sid') = 75,
  (select count(*)::text from public.logged_sets where session_id = :'sid') || ' rows');

-- And it grants nothing: one client still cannot write another's session.
select public.be('88888888-8888-8888-8888-888888888888');
set role authenticated;
do $$ begin
  perform public.save_workout_session(
    '33333333-3333-3333-3333-333333333333','bbbb0000-0000-0000-0000-0000000000c1',
    null, now(), now(), null, '[]'::jsonb);
  perform public.t('074 it grants nobody rights over someone else''s session', false, 'it succeeded');
exception when others then
  perform public.t('074 it grants nobody rights over someone else''s session', true, sqlerrm);
end $$;
reset role;
select public.be(null);

-- ════════════════════════════════════════════════════════════════════════════
--  075 — a check-in still means what it meant when it was answered
-- ════════════════════════════════════════════════════════════════════════════
select public.be(null);
insert into public.forms (id, trainer_id, title, fields) values
  ('5555aaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Weekly check-in',
   '[{"id":"q1","type":"scale","label":"How is your sleep?"}]'::jsonb);

-- A client answers it, carrying the question with the answer.
insert into public.form_responses (id, form_id, client_id, trainer_id, answers, fields, form_title) values
  ('5555aaaa-0000-0000-0000-000000000002','5555aaaa-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111',
   '{"q1":"2"}'::jsonb, '[{"id":"q1","type":"scale","label":"How is your sleep?"}]'::jsonb, 'Weekly check-in');

-- The coach reworks the question, keeping the field id.
update public.forms
   set fields = '[{"id":"q1","type":"scale","label":"How is your energy?"}]'::jsonb
 where id = '5555aaaa-0000-0000-0000-000000000001';

select public.t('075 an edited question does not rewrite the answer it was given to',
  (select fields->0->>'label' from public.form_responses where id='5555aaaa-0000-0000-0000-000000000002')
    = 'How is your sleep?');

-- Retiring the form must not take the answers with it.
delete from public.forms where id = '5555aaaa-0000-0000-0000-000000000001';
select public.t('075 deleting a form no longer destroys the answers people gave it',
  (select count(*) from public.form_responses where id='5555aaaa-0000-0000-0000-000000000002') = 1);
select public.t('075 an orphaned response still knows what it was and what it asked',
  (select form_title from public.form_responses where id='5555aaaa-0000-0000-0000-000000000002') = 'Weekly check-in'
  and (select fields->0->>'label' from public.form_responses where id='5555aaaa-0000-0000-0000-000000000002') = 'How is your sleep?');

-- And the coach can still read it, now the form it joined through is gone.
select public.be('11111111-1111-1111-1111-111111111111');
set role authenticated;
select public.t('075 the coach can still read a response whose form has gone',
  (select count(*) from public.form_responses where id='5555aaaa-0000-0000-0000-000000000002') = 1);
reset role;

-- A different coach cannot.
select public.be('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select public.t('075 another coach still cannot read it',
  (select count(*) from public.form_responses where id='5555aaaa-0000-0000-0000-000000000002') = 0);
reset role;
select public.be(null);

-- ════════════════════════════════════════════════════════════════════════════
--  076 — a managed client owns their own copy, like everyone else
-- ════════════════════════════════════════════════════════════════════════════
select public.be(null);
-- A managed client - the coach's record for someone with no account, so not in
-- profiles at all. The old foreign key made this impossible.
insert into public.managed_clients (id, trainer_id, name)
  values ('6666aaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Managed Mo');
insert into public.programme_days (id, phase_id, week_index, day_of_week, title)
  values ('6666aaaa-0000-0000-0000-000000000002','cccc0000-0000-0000-0000-0000000000b1',0,3,'Template Pull');
insert into public.workout_sections (id, day_id, kind, title, sort_order)
  values ('6666aaaa-0000-0000-0000-000000000003','6666aaaa-0000-0000-0000-000000000002','MAIN','Workout',0);
insert into public.section_exercises (id, section_id, name, sort_order)
  values ('6666aaaa-0000-0000-0000-000000000004','6666aaaa-0000-0000-0000-000000000003','Barbell Row',0);

do $$ begin
  insert into public.programme_days (id, phase_id, week_index, day_of_week, owner_client_id, origin_day_id)
  values ('6666aaaa-0000-0000-0000-000000000005', null, 0, 3,
          '6666aaaa-0000-0000-0000-000000000001','6666aaaa-0000-0000-0000-000000000002');
  perform public.t('076 a managed client can own a day copy', true);
exception when others then
  perform public.t('076 a managed client can own a day copy', false, sqlerrm);
end $$;

-- The isolation the whole model exists for: one client's copy, edited, must
-- leave the template and everybody else exactly as they were.
insert into public.workout_sections (id, day_id, kind, title, sort_order)
  values ('6666aaaa-0000-0000-0000-000000000006','6666aaaa-0000-0000-0000-000000000005','MAIN','Workout',0);
insert into public.section_exercises (id, section_id, name, sort_order)
  values ('6666aaaa-0000-0000-0000-000000000007','6666aaaa-0000-0000-0000-000000000006','Barbell Row',0);
update public.section_exercises set name = 'Chest-Supported Row'
  where id = '6666aaaa-0000-0000-0000-000000000007';

select public.t('076 editing their copy does not touch the template',
  (select name from public.section_exercises where id='6666aaaa-0000-0000-0000-000000000004') = 'Barbell Row');
select public.t('076 and their copy holds the change',
  (select name from public.section_exercises where id='6666aaaa-0000-0000-0000-000000000007') = 'Chest-Supported Row');

-- The cascade the foreign key used to provide, now a trigger - and covering the
-- kind of client it never covered.
delete from public.managed_clients where id = '6666aaaa-0000-0000-0000-000000000001';
select public.t('076 deleting a managed client takes their owned days with them',
  (select count(*) from public.programme_days where id='6666aaaa-0000-0000-0000-000000000005') = 0);
select public.t('076 without taking the template',
  (select count(*) from public.programme_days where id='6666aaaa-0000-0000-0000-000000000002') = 1);

-- ════════════════════════════════════════════════════════════════════════════
--  077 — archive, retain, erase
-- ════════════════════════════════════════════════════════════════════════════
select public.be(null);
insert into auth.users (id, email, raw_user_meta_data)
  values ('7777bbbb-0000-0000-0000-000000000001','leaving@example.com','{"name":"Leaving Len"}');
update public.profiles set trainer_id = '11111111-1111-1111-1111-111111111111'
  where id = '7777bbbb-0000-0000-0000-000000000001';

-- Give them something in every corner of the schema.
insert into public.programme_days (id, phase_id, owner_client_id, week_index, day_of_week, title)
  values ('7777bbbb-0000-0000-0000-00000000000a', null, '7777bbbb-0000-0000-0000-000000000001', 0, 1, 'Their Push');
insert into public.workout_sections (id, day_id, kind, title, sort_order)
  values ('7777bbbb-0000-0000-0000-00000000000b','7777bbbb-0000-0000-0000-00000000000a','MAIN','W',0);
insert into public.section_exercises (id, section_id, name, sort_order)
  values ('7777bbbb-0000-0000-0000-00000000000c','7777bbbb-0000-0000-0000-00000000000b','Bench',0);
insert into public.exercise_sets (exercise_id, set_index, kind, reps, reps_text, weight_kg)
  values ('7777bbbb-0000-0000-0000-00000000000c',0,'WORK',8,'8',60);
insert into public.client_workouts (id, client_id, trainer_id, day_id, scheduled_date)
  values ('7777bbbb-0000-0000-0000-00000000000d','7777bbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','7777bbbb-0000-0000-0000-00000000000a', current_date);
insert into public.workout_sessions (id, client_id, day_id, started_at, completed_at)
  values ('7777bbbb-0000-0000-0000-00000000000e','7777bbbb-0000-0000-0000-000000000001','7777bbbb-0000-0000-0000-00000000000a', now(), now());
insert into public.logged_sets (session_id, exercise_id, set_index, actual_reps, actual_weight_kg)
  values ('7777bbbb-0000-0000-0000-00000000000e','7777bbbb-0000-0000-0000-00000000000c',0,8,60);
insert into public.client_injuries (id, client_id, trainer_id, muscle_group, note)
  values ('7777bbbb-0000-0000-0000-00000000000f','7777bbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','knee','ACL');
insert into public.client_injury_notes (injury_id, author_id, body)
  values ('7777bbbb-0000-0000-0000-00000000000f','11111111-1111-1111-1111-111111111111','Still sore');
insert into public.body_metrics (client_id, recorded_at, weight_kg) values ('7777bbbb-0000-0000-0000-000000000001', current_date, 82);
insert into public.client_goals (client_id, title) values ('7777bbbb-0000-0000-0000-000000000001','Bench 100');
insert into public.client_tasks (client_id, trainer_id, title, kind) values ('7777bbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Weigh in','check');
insert into public.progress_photos (client_id, taken_on, pose, path) values ('7777bbbb-0000-0000-0000-000000000001', current_date, 'front', 'len/front.jpg');
insert into public.client_documents (client_id, trainer_id, name, path) values ('7777bbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','PARQ','len/parq.pdf');
insert into public.health_daily (client_id, day, source, steps) values ('7777bbbb-0000-0000-0000-000000000001', current_date, 'manual', 9000);
insert into public.client_custom_metrics (id, client_id, name) values ('7777bbbb-0000-0000-0000-000000000010','7777bbbb-0000-0000-0000-000000000001','Grip');
insert into public.custom_metric_entries (metric_id, recorded_at, value) values ('7777bbbb-0000-0000-0000-000000000010', current_date, 50);
insert into public.exercise_comments (client_id, author_id, exercise_id, body)
  values ('7777bbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','7777bbbb-0000-0000-0000-00000000000c','Good work');

-- Archiving keeps everything, and starts the clock.
select public.be('11111111-1111-1111-1111-111111111111');
set role authenticated;
update public.profiles set archived = true, archived_at = now()
  where id = '7777bbbb-0000-0000-0000-000000000001';
reset role;
select public.t('077 archiving keeps their records',
  (select count(*) from public.workout_sessions where client_id='7777bbbb-0000-0000-0000-000000000001') = 1
  and (select count(*) from public.client_injuries where client_id='7777bbbb-0000-0000-0000-000000000001') = 1);
select public.t('077 and starts the retention clock',
  (select archived_at from public.profiles where id='7777bbbb-0000-0000-0000-000000000001') is not null);
select public.t('077 someone archived today is not yet due erasure',
  (select count(*) from public.clients_due_erasure where client_id='7777bbbb-0000-0000-0000-000000000001') = 0);

-- Seven years on.
update public.profiles set archived_at = now() - interval '7 years 1 day'
  where id = '7777bbbb-0000-0000-0000-000000000001';
select public.t('077 seven years on, they are due',
  (select count(*) from public.clients_due_erasure where client_id='7777bbbb-0000-0000-0000-000000000001') = 1);

-- Another coach cannot erase them.
select public.be('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
do $$ begin
  perform public.erase_client('7777bbbb-0000-0000-0000-000000000001');
  perform public.t('077 another coach cannot erase someone else''s client', false, 'it succeeded');
exception when others then
  perform public.t('077 another coach cannot erase someone else''s client', true, sqlerrm);
end $$;
reset role;

-- Their own coach can, and it names the files it could not reach.
select public.be('11111111-1111-1111-1111-111111111111');
set role authenticated;
select public.erase_client('7777bbbb-0000-0000-0000-000000000001') as res \gset
reset role;
select public.be(null);

select public.t('077 the storage paths come back so the files can go too',
  (:'res'::jsonb -> 'storage' -> 'photos')::text like '%len/front.jpg%'
  and (:'res'::jsonb -> 'storage' -> 'documents')::text like '%len/parq.pdf%');
select public.t('077 it reports that a login still has to be removed',
  (:'res'::jsonb ->> 'auth_user_remains') = 'true');

-- The check that matters, and it asks the schema rather than a list I wrote.
-- Hand-listing the tables is precisely how an erasure comes to miss one: the
-- list is written once and the schema keeps growing. This walks every table
-- that has a client_id and fails naming any that still holds a row - so a table
-- added next year is covered without anyone remembering to come back here.
do $$
declare
  t       record;
  n       int;
  left_in text := '';
begin
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'client_id'
  loop
    execute format('select count(*) from public.%I where client_id = $1', t.table_name)
      into n using '7777bbbb-0000-0000-0000-000000000001'::uuid;
    if n > 0 then left_in := left_in || t.table_name || '(' || n || ') '; end if;
  end loop;
  perform public.t('077 erasure leaves nothing in any table keyed to that client',
    left_in = '', coalesce(nullif(left_in, ''), 'all clear'));
end $$;

-- And the children that are only reachable through a parent, which are the ones
-- a delete on the parent table alone would orphan rather than remove.
select public.t('077 their logged sets went with their sessions',
  (select count(*) from public.logged_sets ls
     left join public.workout_sessions ws on ws.id = ls.session_id
    where ws.id is null) = 0);
select public.t('077 their injury notes went with their injuries',
  (select count(*) from public.client_injury_notes n
     left join public.client_injuries i on i.id = n.injury_id
    where i.id is null) = 0);
select public.t('077 their custom metric readings went with the metric',
  (select count(*) from public.custom_metric_entries e
     left join public.client_custom_metrics m on m.id = e.metric_id
    where m.id is null) = 0);
select public.t('077 the workouts they owned are gone, with their sections and sets',
  (select count(*) from public.programme_days where owner_client_id='7777bbbb-0000-0000-0000-000000000001') = 0
  and (select count(*) from public.workout_sections where day_id='7777bbbb-0000-0000-0000-00000000000a') = 0
  and (select count(*) from public.exercise_sets where exercise_id='7777bbbb-0000-0000-0000-00000000000c') = 0);
select public.t('077 the profile row itself is gone',
  (select count(*) from public.profiles where id='7777bbbb-0000-0000-0000-000000000001') = 0);

-- Nobody else was touched.
select public.t('077 another client''s records are untouched',
  (select count(*) from public.profiles where id='33333333-3333-3333-3333-333333333333') = 1);

-- ── Summary ─────────────────────────────────────────────────────────────────
\pset tuples_only on
\pset format unaligned
select case when pass then '  PASS  ' else '  FAIL  ' end || label ||
       case when not pass and detail <> '' then '   [' || detail || ']' else '' end
from public._t order by n;
select '';
-- A check that never recorded a result is a failure, not an absence: an
-- assertion silently lost to a permissions error is exactly how a test suite
-- reports success it hasn't earned.
--
-- 83 is the number that should run, which is not the number of t() calls in the
-- file: each `do ... exception` block holds two, a pass and a fail, and exactly
-- one of them fires. Grepping gives 91. Raise this by hand when adding checks -
-- being made to state the number is the point.
select case
  when count(*) <> 83 then 'HARNESS BROKEN - expected 83 checks, recorded ' || count(*)::text
  when count(*) filter (where pass is not true) > 0
    then count(*) filter (where pass is not true)::text || ' OF ' || count(*)::text || ' FAILED'
  else 'ALL ' || count(*)::text || ' CHECKS PASSED' end
from public._t;
