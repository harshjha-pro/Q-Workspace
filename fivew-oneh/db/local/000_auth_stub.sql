-- Minimal stand-in for Supabase's auth schema, for plain Postgres / PGlite.
-- Do NOT apply this on Supabase (auth already exists there).
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
