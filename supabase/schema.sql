-- Brass Tacks remembered callers — Ava "remember me" feature
-- Run this once in the Supabase SQL editor (supabase.com > your project > SQL).
-- Access is service_role key only (server-side). RLS is enabled with no public
-- policies, so only the service_role key can read/write this table.

create table if not exists remembered_callers (
  phone_number text primary key,   -- E.164, e.g. +13038183433 (the number they call FROM)
  name text not null,
  callback_number text,            -- only if they gave a different callback number
  opted_in boolean not null default true,
  last_topic text,                 -- one-line summary of the last call/chat
  notes text,                      -- e.g. owner demo greeting
  call_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table remembered_callers enable row level security;
-- No policies created on purpose: only the service_role key (server-side) bypasses RLS.
