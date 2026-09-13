create extension if not exists pgcrypto;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text,
  raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon'); $$;
create table storage.buckets (id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text,
  owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/'); $$;
create publication supabase_realtime;
do $$ begin create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;
grant usage on schema public, storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
