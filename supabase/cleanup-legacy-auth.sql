-- Run after recreating the owner and staff in Supabase Auth and verifying login.
-- Removes obsolete custom password hashes; does not touch Auth accounts/shop data.
drop table if exists public.wabi_users;
