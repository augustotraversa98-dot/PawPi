-- 0001_auth.sql
-- Auth.js (NextAuth-style) adapter tables, reconstructed from anything/apps/web/src/auth.js.
-- The adapter uses camelCase identifiers ("userId", "sessionToken", "providerAccountId",
-- "emailVerified") which MUST be quoted to preserve case in Postgres.
-- Structure-only; no RLS, no data.

create extension if not exists pgcrypto;  -- provides gen_random_uuid()

-- Parent of all identity. id is DB-generated (never inserted by the adapter).
-- Type chosen as uuid per Auth.js convention (see SCHEMA_NOTES.md — unproven from code).
create table if not exists auth_users (
  id              uuid primary key default gen_random_uuid(),
  name            text,
  email           text not null unique,
  "emailVerified" timestamptz,
  image           text
);

-- OAuth/credentials accounts. "password" is a NON-STANDARD column added by this app
-- (stores an argon2 hash for the credentials provider).
create table if not exists auth_accounts (
  id                  uuid primary key default gen_random_uuid(),
  "userId"            uuid not null references auth_users(id) on delete cascade,
  type                text not null,
  provider            text not null,
  "providerAccountId" text not null,
  refresh_token       text,
  access_token        text,
  expires_at          bigint,          -- Unix epoch seconds (Auth.js convention), NOT a timestamp
  token_type          text,
  scope               text,
  id_token            text,
  session_state       text,
  password            text,            -- non-standard: argon2 hash
  unique (provider, "providerAccountId")
);

create table if not exists auth_sessions (
  id             uuid primary key default gen_random_uuid(),
  "sessionToken" text not null unique,
  "userId"       uuid not null references auth_users(id) on delete cascade,
  expires        timestamptz not null
);

create table if not exists auth_verification_token (
  identifier text not null,
  token      text not null,
  expires    timestamptz not null,
  primary key (identifier, token)
);
