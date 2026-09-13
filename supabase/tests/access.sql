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

-- ── Summary ─────────────────────────────────────────────────────────────────
\pset tuples_only on
\pset format unaligned
select case when pass then '  PASS  ' else '  FAIL  ' end || label ||
       case when not pass and detail <> '' then '   [' || detail || ']' else '' end
from public._t order by n;
select '';
-- A check that never recorded a result is a failure, not an absence: an
-- assertion silently lost to a permissions error is exactly how a test suite
-- reports success it hasn't earned. 38 is the number of t() calls in this file.
select case
  when count(*) <> 38 then 'HARNESS BROKEN - expected 38 checks, recorded ' || count(*)::text
  when count(*) filter (where pass is not true) > 0
    then count(*) filter (where pass is not true)::text || ' OF ' || count(*)::text || ' FAILED'
  else 'ALL ' || count(*)::text || ' CHECKS PASSED' end
from public._t;
