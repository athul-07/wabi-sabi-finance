-- Run in Supabase SQL Editor. Also upgrades the previous custom-auth schema.
begin;
create table if not exists public.wabi_kv (
  k text primary key,
  v jsonb not null
);
create table if not exists public.wabi_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9][a-z0-9_.-]{2,39}$'),
  email text unique not null,
  name text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  permissions jsonb not null default '{"Dashboard":"none","Sales":"write","Rentals":"write","Inventory":"none","Customers":"none","Transactions":"none","Settings":"none"}',
  preferences jsonb not null default '{}'
);
alter table public.wabi_kv enable row level security;
alter table public.wabi_profiles enable row level security;
revoke all on public.wabi_kv, public.wabi_profiles from anon, authenticated;
grant all on public.wabi_kv, public.wabi_profiles to service_role;

-- Only trusted Auth admin calls can set app_metadata. Public signups receive
-- no workspace profile and therefore cannot access this application.
create or replace function public.wabi_create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p jsonb := new.raw_app_meta_data->'wabi';
begin
  if p is not null then
    insert into public.wabi_profiles (id, username, email, name, role, permissions)
    values (new.id, lower(p->>'username'), lower(new.email),
      coalesce(p->>'name', p->>'username'), coalesce(p->>'role', 'staff'),
      coalesce(p->'permissions', '{"Dashboard":"none","Sales":"write","Rentals":"write","Inventory":"none","Customers":"none","Transactions":"none","Settings":"none"}'::jsonb));
  end if;
  return new;
end;
$$;
revoke all on function public.wabi_create_profile() from public, anon, authenticated;
drop trigger if exists wabi_auth_profile on auth.users;
create trigger wabi_auth_profile after insert on auth.users
for each row execute function public.wabi_create_profile();

create or replace function public.wabi_sync_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.wabi_profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;
revoke all on function public.wabi_sync_email() from public, anon, authenticated;
drop trigger if exists wabi_auth_email on auth.users;
create trigger wabi_auth_email after update of email on auth.users
for each row execute function public.wabi_sync_email();

-- A revoked session must fail even while its signed access token is unexpired.
create or replace function public.wabi_session_active(session_id uuid, account_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  select exists(select 1 from auth.sessions s where s.id = session_id and s.user_id = account_id
    and (s.not_after is null or s.not_after > now()));
$$;
revoke all on function public.wabi_session_active(uuid, uuid) from public, anon, authenticated;
grant execute on function public.wabi_session_active(uuid, uuid) to service_role;

create or replace function public.wabi_revoke_sessions(account_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = account_id;
$$;
revoke all on function public.wabi_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.wabi_revoke_sessions(uuid) to service_role;

create or replace function public.wabi_keep_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    perform pg_advisory_xact_lock(947310);
    if not exists(select 1 from public.wabi_profiles where role = 'admin' and id <> old.id) then
      raise exception 'The workspace must keep at least one administrator.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.wabi_keep_admin() from public, anon, authenticated;
drop trigger if exists wabi_last_admin on public.wabi_profiles;
create trigger wabi_last_admin before update of role or delete on public.wabi_profiles
for each row execute function public.wabi_keep_admin();

-- Previous password hashes are not used by Supabase Auth. Recreate accounts
-- through setup:admin / Users & access before running cleanup-legacy-auth.sql.
commit;
