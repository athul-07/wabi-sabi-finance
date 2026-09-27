-- Run in Supabase SQL Editor. Also upgrades the previous custom-auth schema.
begin;
-- Keep the old password-hash table for reference, then use wabi_users for
-- Supabase Auth-backed application accounts.
do $$
begin
  if to_regclass('public.wabi_users') is not null
      and exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'wabi_users' and column_name = 'hash') then
    if to_regclass('public.wabi_legacy_users') is not null then
      raise exception 'Both legacy user tables exist; rename one before applying this schema.';
    end if;
    alter table public.wabi_users rename to wabi_legacy_users;
  end if;
  if to_regclass('public.wabi_profiles') is not null then
    if to_regclass('public.wabi_users') is not null then
      raise exception 'Both wabi_profiles and wabi_users exist; refusing to overwrite either table.';
    end if;
    alter table public.wabi_profiles rename to wabi_users;
  end if;
end;
$$;

create table if not exists public.wabi_users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9][a-z0-9_.-]{2,39}$'),
  email text unique not null,
  name text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  permissions jsonb not null default '{"Dashboard":"none","Sales":"write","Rentals":"write","Inventory":"none","Customers":"none","Transactions":"none","Settings":"none"}',
  preferences jsonb not null default '{}'
);
create table if not exists public.wabi_inventory (
  id text primary key,
  position integer not null default 0,
  name text not null,
  category text,
  status text not null default 'Available',
  stock_qty integer not null default 1,
  sale_price numeric not null default 0,
  discount numeric not null default 0,
  rental_price numeric not null default 0,
  purchase_cost numeric not null default 0,
  deposit numeric not null default 0,
  cleaning numeric not null default 0,
  repair numeric not null default 0,
  purchase_date text not null default '',
  item jsonb not null,
  is_active boolean not null default true
);
create table if not exists public.wabi_customers (
  id text primary key,
  position integer not null default 0,
  phone text,
  name text,
  email text,
  address text,
  notes text,
  customer jsonb not null,
  is_active boolean not null default true
);
alter table public.wabi_inventory add column if not exists position integer not null default 0;
alter table public.wabi_inventory add column if not exists discount numeric not null default 0;
alter table public.wabi_customers add column if not exists position integer not null default 0;
create table if not exists public.wabi_sales (
  id text primary key,
  position integer not null default 0,
  date text not null default '',
  phone text not null default '',
  customer text not null default '',
  item_id text not null default '',
  qty integer not null default 1,
  unit_price numeric not null default 0,
  discount numeric not null default 0,
  mode text not null default 'Cash',
  received numeric not null default 0,
  notes text not null default '',
  is_active boolean not null default true
);
create table if not exists public.wabi_rentals (
  id text primary key,
  position integer not null default 0,
  booking_date text not null default '',
  phone text not null default '',
  customer text not null default '',
  item_id text not null default '',
  event_date text not null default '',
  pickup text not null default '',
  return_due text not null default '',
  actual_return text not null default '',
  rental_fee numeric not null default 0,
  deposit numeric not null default 0,
  damage numeric not null default 0,
  mode text not null default 'Cash',
  received numeric not null default 0,
  deposit_refunded numeric not null default 0,
  notes text not null default '',
  is_active boolean not null default true
);
create table if not exists public.wabi_transactions (
  id text primary key,
  position integer not null default 0,
  date text not null default '',
  type text not null default 'Expense',
  category text not null default '',
  description text not null default '',
  party text not null default '',
  item_id text not null default '',
  mode text not null default '',
  account text not null default '',
  amount numeric not null default 0,
  notes text not null default '',
  is_active boolean not null default true
);
create table if not exists public.wabi_shop_meta (
  singleton boolean primary key default true check (singleton),
  shop_name text not null default 'Wabi Sabi',
  late_fee_per_day numeric not null default 1000,
  version integer not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'setup'
);
alter table public.wabi_users enable row level security;
alter table public.wabi_inventory enable row level security;
alter table public.wabi_customers enable row level security;
alter table public.wabi_sales enable row level security;
alter table public.wabi_rentals enable row level security;
alter table public.wabi_transactions enable row level security;
alter table public.wabi_shop_meta enable row level security;
revoke all on public.wabi_users, public.wabi_inventory, public.wabi_customers,
  public.wabi_sales, public.wabi_rentals, public.wabi_transactions, public.wabi_shop_meta
  from anon, authenticated;
grant all on public.wabi_users, public.wabi_inventory, public.wabi_customers,
  public.wabi_sales, public.wabi_rentals, public.wabi_transactions, public.wabi_shop_meta
  to service_role;

-- Backfill older payload/settings JSON into explicit columns before removing it.
alter table public.wabi_sales add column if not exists date text not null default '';
alter table public.wabi_sales add column if not exists phone text not null default '';
alter table public.wabi_sales add column if not exists customer text not null default '';
alter table public.wabi_sales add column if not exists item_id text not null default '';
alter table public.wabi_sales add column if not exists qty integer not null default 1;
alter table public.wabi_sales add column if not exists unit_price numeric not null default 0;
alter table public.wabi_sales add column if not exists discount numeric not null default 0;
alter table public.wabi_sales add column if not exists mode text not null default 'Cash';
alter table public.wabi_sales add column if not exists received numeric not null default 0;
alter table public.wabi_sales add column if not exists notes text not null default '';
alter table public.wabi_rentals add column if not exists booking_date text not null default '';
alter table public.wabi_rentals add column if not exists phone text not null default '';
alter table public.wabi_rentals add column if not exists customer text not null default '';
alter table public.wabi_rentals add column if not exists item_id text not null default '';
alter table public.wabi_rentals add column if not exists event_date text not null default '';
alter table public.wabi_rentals add column if not exists pickup text not null default '';
alter table public.wabi_rentals add column if not exists return_due text not null default '';
alter table public.wabi_rentals add column if not exists actual_return text not null default '';
alter table public.wabi_rentals add column if not exists rental_fee numeric not null default 0;
alter table public.wabi_rentals add column if not exists deposit numeric not null default 0;
alter table public.wabi_rentals add column if not exists damage numeric not null default 0;
alter table public.wabi_rentals add column if not exists mode text not null default 'Cash';
alter table public.wabi_rentals add column if not exists received numeric not null default 0;
alter table public.wabi_rentals add column if not exists deposit_refunded numeric not null default 0;
alter table public.wabi_rentals add column if not exists notes text not null default '';
alter table public.wabi_transactions add column if not exists date text not null default '';
alter table public.wabi_transactions add column if not exists type text not null default 'Expense';
alter table public.wabi_transactions add column if not exists category text not null default '';
alter table public.wabi_transactions add column if not exists description text not null default '';
alter table public.wabi_transactions add column if not exists party text not null default '';
alter table public.wabi_transactions add column if not exists item_id text not null default '';
alter table public.wabi_transactions add column if not exists mode text not null default '';
alter table public.wabi_transactions add column if not exists account text not null default '';
alter table public.wabi_transactions add column if not exists amount numeric not null default 0;
alter table public.wabi_transactions add column if not exists notes text not null default '';
alter table public.wabi_shop_meta add column if not exists shop_name text not null default 'Wabi Sabi';
alter table public.wabi_shop_meta add column if not exists late_fee_per_day numeric not null default 1000;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wabi_sales' and column_name = 'payload') then
    if exists (select 1 from public.wabi_sales where jsonb_typeof(payload) is distinct from 'object'
      or exists (select 1 from jsonb_object_keys(payload) as keys(key) where key not in ('id','date','phone','customer','itemId','qty','unitPrice','discount','mode','received','notes'))) then
      raise exception 'wabi_sales has unrecognized payload data; preserving JSON and aborting column migration.';
    end if;
    update public.wabi_sales set date = coalesce(payload->>'date', date), phone = coalesce(payload->>'phone', phone),
      customer = coalesce(payload->>'customer', customer), item_id = coalesce(payload->>'itemId', item_id),
      qty = coalesce(nullif(payload->>'qty', '')::integer, qty), unit_price = coalesce(nullif(payload->>'unitPrice', '')::numeric, unit_price),
      discount = coalesce(nullif(payload->>'discount', '')::numeric, discount), mode = coalesce(payload->>'mode', mode),
      received = coalesce(nullif(payload->>'received', '')::numeric, received), notes = coalesce(payload->>'notes', notes);
    alter table public.wabi_sales drop column payload;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wabi_rentals' and column_name = 'payload') then
    if exists (select 1 from public.wabi_rentals where jsonb_typeof(payload) is distinct from 'object'
      or exists (select 1 from jsonb_object_keys(payload) as keys(key) where key not in ('id','bookingDate','phone','customer','itemId','eventDate','pickup','returnDue','actualReturn','rentalFee','deposit','damage','mode','received','depositRefunded','notes'))) then
      raise exception 'wabi_rentals has unrecognized payload data; preserving JSON and aborting column migration.';
    end if;
    update public.wabi_rentals set booking_date = coalesce(payload->>'bookingDate', booking_date), phone = coalesce(payload->>'phone', phone),
      customer = coalesce(payload->>'customer', customer), item_id = coalesce(payload->>'itemId', item_id),
      event_date = coalesce(payload->>'eventDate', event_date), pickup = coalesce(payload->>'pickup', pickup),
      return_due = coalesce(payload->>'returnDue', return_due), actual_return = coalesce(payload->>'actualReturn', actual_return),
      rental_fee = coalesce(nullif(payload->>'rentalFee', '')::numeric, rental_fee), deposit = coalesce(nullif(payload->>'deposit', '')::numeric, deposit),
      damage = coalesce(nullif(payload->>'damage', '')::numeric, damage), mode = coalesce(payload->>'mode', mode),
      received = coalesce(nullif(payload->>'received', '')::numeric, received),
      deposit_refunded = coalesce(nullif(payload->>'depositRefunded', '')::numeric, deposit_refunded), notes = coalesce(payload->>'notes', notes);
    alter table public.wabi_rentals drop column payload;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wabi_transactions' and column_name = 'payload') then
    if exists (select 1 from public.wabi_transactions where jsonb_typeof(payload) is distinct from 'object'
      or exists (select 1 from jsonb_object_keys(payload) as keys(key) where key not in ('id','date','type','category','desc','party','itemId','mode','account','amount','notes'))) then
      raise exception 'wabi_transactions has unrecognized payload data; preserving JSON and aborting column migration.';
    end if;
    update public.wabi_transactions set date = coalesce(payload->>'date', date), type = coalesce(payload->>'type', type),
      category = coalesce(payload->>'category', category), description = coalesce(payload->>'desc', description),
      party = coalesce(payload->>'party', party), item_id = coalesce(payload->>'itemId', item_id),
      mode = coalesce(payload->>'mode', mode), account = coalesce(payload->>'account', account),
      amount = coalesce(nullif(payload->>'amount', '')::numeric, amount), notes = coalesce(payload->>'notes', notes);
    alter table public.wabi_transactions drop column payload;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wabi_shop_meta' and column_name = 'settings') then
    if exists (select 1 from public.wabi_shop_meta where jsonb_typeof(settings) is distinct from 'object'
      or exists (select 1 from jsonb_object_keys(settings) as keys(key) where key not in ('shopName','lateFeePerDay'))) then
      raise exception 'wabi_shop_meta has unrecognized settings; preserving JSON and aborting column migration.';
    end if;
    update public.wabi_shop_meta set shop_name = coalesce(settings->>'shopName', shop_name),
      late_fee_per_day = coalesce(nullif(settings->>'lateFeePerDay', '')::numeric, late_fee_per_day);
    alter table public.wabi_shop_meta drop column settings;
  end if;
end;
$$;


-- Move all shop data out of the old snapshot before removing its table.
do $$
declare shop jsonb;
begin
  if to_regclass('public.wabi_kv') is not null then
    if exists (select 1 from public.wabi_kv where k <> 'shop') then
      raise exception 'wabi_kv contains non-shop records; refusing to remove data.';
    end if;
    select v into shop from public.wabi_kv where k = 'shop';
    if shop is not null then
      if jsonb_typeof(shop->'data') is distinct from 'object' then
        raise exception 'wabi_kv shop data is malformed; refusing to remove it.';
      end if;
      if exists (
        select 1 from jsonb_array_elements(coalesce(shop #> '{data,inventory}', '[]')) as records(value)
        where jsonb_typeof(value) is distinct from 'object' or nullif(value->>'id', '') is null
        union all
        select 1 from jsonb_array_elements(coalesce(shop #> '{data,customers}', '[]')) as records(value)
        where jsonb_typeof(value) is distinct from 'object' or nullif(value->>'id', '') is null
        union all
        select 1 from jsonb_array_elements(coalesce(shop #> '{data,sales}', '[]')) as records(value)
        where jsonb_typeof(value) is distinct from 'object' or nullif(value->>'id', '') is null
        union all
        select 1 from jsonb_array_elements(coalesce(shop #> '{data,rentals}', '[]')) as records(value)
        where jsonb_typeof(value) is distinct from 'object' or nullif(value->>'id', '') is null
        union all
        select 1 from jsonb_array_elements(coalesce(shop #> '{data,transactions}', '[]')) as records(value)
        where jsonb_typeof(value) is distinct from 'object' or nullif(value->>'id', '') is null
      ) then
        raise exception 'wabi_kv contains a shop record without an ID; refusing to remove it.';
      end if;
      if exists (
        select 1 from jsonb_object_keys(coalesce(shop #> '{data,settings}', '{}')) as keys(key)
        where key not in ('shopName','lateFeePerDay')
        union all
        select 1 from jsonb_array_elements(coalesce(shop #> '{data,sales}', '[]')) as records(value),
          lateral jsonb_object_keys(value) as keys(key)
        where key not in ('id','date','phone','customer','itemId','qty','unitPrice','discount','mode','received','notes')
        union all
        select 1 from jsonb_array_elements(coalesce(shop #> '{data,rentals}', '[]')) as records(value),
          lateral jsonb_object_keys(value) as keys(key)
        where key not in ('id','bookingDate','phone','customer','itemId','eventDate','pickup','returnDue','actualReturn','rentalFee','deposit','damage','mode','received','depositRefunded','notes')
        union all
        select 1 from jsonb_array_elements(coalesce(shop #> '{data,transactions}', '[]')) as records(value),
          lateral jsonb_object_keys(value) as keys(key)
        where key not in ('id','date','type','category','desc','party','itemId','mode','account','amount','notes')
      ) then
        raise exception 'wabi_kv contains unrecognized shop fields; refusing to remove data.';
      end if;

      insert into public.wabi_shop_meta (singleton, shop_name, late_fee_per_day, version, updated_at, updated_by)
      values (true, coalesce(shop #>> '{data,settings,shopName}', 'Wabi Sabi'),
        coalesce(nullif(shop #>> '{data,settings,lateFeePerDay}', '')::numeric, 1000),
        coalesce((shop->>'version')::integer, 1),
        coalesce(nullif(shop->>'updatedAt', '')::timestamptz, now()),
        coalesce(shop->>'updatedBy', 'migration'))
      on conflict (singleton) do nothing;

      insert into public.wabi_inventory
        (id, position, name, category, status, stock_qty, sale_price, discount, rental_price,
          purchase_cost, deposit, cleaning, repair, purchase_date, item, is_active)
      select item->>'id', ordinality::integer - 1, coalesce(item->>'name', ''), item->>'category',
        coalesce(item->>'status', 'Available'), coalesce(nullif(item->>'stockQty', '')::integer, 1),
        coalesce(nullif(item->>'salePrice', '')::numeric, 0), coalesce(nullif(item->>'discount', '')::numeric, 0),
        coalesce(nullif(item->>'rentalPrice', '')::numeric, 0),
        coalesce(nullif(item->>'purchaseCost', '')::numeric, 0), coalesce(nullif(item->>'deposit', '')::numeric, 0),
        coalesce(nullif(item->>'cleaning', '')::numeric, 0), coalesce(nullif(item->>'repair', '')::numeric, 0),
        coalesce(item->>'purchaseDate', ''), item, true
      from jsonb_array_elements(coalesce(shop #> '{data,inventory}', '[]')) with ordinality as rows(item, ordinality)
      where nullif(item->>'id', '') is not null
      on conflict (id) do update set position = excluded.position, name = excluded.name,
        category = excluded.category, status = excluded.status, stock_qty = excluded.stock_qty,
        sale_price = excluded.sale_price, discount = excluded.discount, rental_price = excluded.rental_price,
        purchase_cost = excluded.purchase_cost, deposit = excluded.deposit, cleaning = excluded.cleaning,
        repair = excluded.repair, purchase_date = excluded.purchase_date, item = excluded.item, is_active = true;

      insert into public.wabi_customers (id, position, phone, name, email, address, notes, customer, is_active)
      select customer->>'id', ordinality::integer - 1, customer->>'phone', customer->>'name',
        customer->>'email', customer->>'address', customer->>'notes', customer, true
      from jsonb_array_elements(coalesce(shop #> '{data,customers}', '[]')) with ordinality as rows(customer, ordinality)
      where nullif(customer->>'id', '') is not null
      on conflict (id) do update set position = excluded.position, phone = excluded.phone,
        name = excluded.name, email = excluded.email, address = excluded.address,
        notes = excluded.notes, customer = excluded.customer, is_active = true;

      insert into public.wabi_sales
        (id, position, date, phone, customer, item_id, qty, unit_price, discount, mode, received, notes, is_active)
      select sale->>'id', ordinality::integer - 1, coalesce(sale->>'date', ''), coalesce(sale->>'phone', ''),
        coalesce(sale->>'customer', ''), coalesce(sale->>'itemId', ''), coalesce(nullif(sale->>'qty', '')::integer, 1),
        coalesce(nullif(sale->>'unitPrice', '')::numeric, 0), coalesce(nullif(sale->>'discount', '')::numeric, 0),
        coalesce(sale->>'mode', 'Cash'), coalesce(nullif(sale->>'received', '')::numeric, 0), coalesce(sale->>'notes', ''), true
      from jsonb_array_elements(coalesce(shop #> '{data,sales}', '[]')) with ordinality as rows(sale, ordinality)
      where nullif(sale->>'id', '') is not null
      on conflict (id) do update set position = excluded.position, date = excluded.date, phone = excluded.phone,
        customer = excluded.customer, item_id = excluded.item_id, qty = excluded.qty, unit_price = excluded.unit_price,
        discount = excluded.discount, mode = excluded.mode, received = excluded.received, notes = excluded.notes, is_active = true;

      insert into public.wabi_rentals
        (id, position, booking_date, phone, customer, item_id, event_date, pickup, return_due, actual_return,
          rental_fee, deposit, damage, mode, received, deposit_refunded, notes, is_active)
      select rental->>'id', ordinality::integer - 1, coalesce(rental->>'bookingDate', ''), coalesce(rental->>'phone', ''),
        coalesce(rental->>'customer', ''), coalesce(rental->>'itemId', ''), coalesce(rental->>'eventDate', ''),
        coalesce(rental->>'pickup', ''), coalesce(rental->>'returnDue', ''), coalesce(rental->>'actualReturn', ''),
        coalesce(nullif(rental->>'rentalFee', '')::numeric, 0), coalesce(nullif(rental->>'deposit', '')::numeric, 0),
        coalesce(nullif(rental->>'damage', '')::numeric, 0), coalesce(rental->>'mode', 'Cash'),
        coalesce(nullif(rental->>'received', '')::numeric, 0), coalesce(nullif(rental->>'depositRefunded', '')::numeric, 0),
        coalesce(rental->>'notes', ''), true
      from jsonb_array_elements(coalesce(shop #> '{data,rentals}', '[]')) with ordinality as rows(rental, ordinality)
      where nullif(rental->>'id', '') is not null
      on conflict (id) do update set position = excluded.position, booking_date = excluded.booking_date,
        phone = excluded.phone, customer = excluded.customer, item_id = excluded.item_id, event_date = excluded.event_date,
        pickup = excluded.pickup, return_due = excluded.return_due, actual_return = excluded.actual_return,
        rental_fee = excluded.rental_fee, deposit = excluded.deposit, damage = excluded.damage, mode = excluded.mode,
        received = excluded.received, deposit_refunded = excluded.deposit_refunded, notes = excluded.notes, is_active = true;

      insert into public.wabi_transactions
        (id, position, date, type, category, description, party, item_id, mode, account, amount, notes, is_active)
      select transaction->>'id', ordinality::integer - 1, coalesce(transaction->>'date', ''),
        coalesce(transaction->>'type', 'Expense'), coalesce(transaction->>'category', ''), coalesce(transaction->>'desc', ''),
        coalesce(transaction->>'party', ''), coalesce(transaction->>'itemId', ''), coalesce(transaction->>'mode', ''),
        coalesce(transaction->>'account', ''), coalesce(nullif(transaction->>'amount', '')::numeric, 0),
        coalesce(transaction->>'notes', ''), true
      from jsonb_array_elements(coalesce(shop #> '{data,transactions}', '[]')) with ordinality as rows(transaction, ordinality)
      where nullif(transaction->>'id', '') is not null
      on conflict (id) do update set position = excluded.position, date = excluded.date, type = excluded.type,
        category = excluded.category, description = excluded.description, party = excluded.party,
        item_id = excluded.item_id, mode = excluded.mode, account = excluded.account,
        amount = excluded.amount, notes = excluded.notes, is_active = true;
    end if;
    drop table public.wabi_kv;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.wabi_legacy_users') is not null then
    alter table public.wabi_legacy_users enable row level security;
    revoke all on public.wabi_legacy_users from anon, authenticated;
    grant all on public.wabi_legacy_users to service_role;
    if not exists (select 1 from public.wabi_legacy_users limit 1) then
      drop table public.wabi_legacy_users;
    end if;
  end if;
end;
$$;

-- Only trusted Auth admin calls can set app_metadata. Public signups receive
-- no workspace profile and therefore cannot access this application.
create or replace function public.wabi_create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p jsonb := new.raw_app_meta_data->'wabi';
begin
  if p is not null then
    insert into public.wabi_users (id, username, email, name, role, permissions)
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
  update public.wabi_users set email = lower(new.email) where id = new.id;
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
    if not exists(select 1 from public.wabi_users where role = 'admin' and id <> old.id) then
      raise exception 'The workspace must keep at least one administrator.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.wabi_keep_admin() from public, anon, authenticated;
drop trigger if exists wabi_last_admin on public.wabi_users;
create trigger wabi_last_admin before update of role or delete on public.wabi_users
for each row execute function public.wabi_keep_admin();

-- A single version-checked write keeps the JSON API and relational rows in sync.
create or replace function public.wabi_get_shop()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'version', meta.version, 'updatedAt', meta.updated_at, 'updatedBy', meta.updated_by,
    'data', jsonb_build_object(
      'settings', jsonb_build_object('shopName', meta.shop_name, 'lateFeePerDay', meta.late_fee_per_day),
      'inventory', coalesce((select jsonb_agg(item order by position, id) from public.wabi_inventory where is_active), '[]'::jsonb),
      'customers', coalesce((select jsonb_agg(customer order by position, id) from public.wabi_customers where is_active), '[]'::jsonb),
      'sales', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'date', date, 'phone', phone,
        'customer', customer, 'itemId', item_id, 'qty', qty, 'unitPrice', unit_price,
        'discount', discount, 'mode', mode, 'received', received, 'notes', notes) order by position, id)
        from public.wabi_sales where is_active), '[]'::jsonb),
      'rentals', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'bookingDate', booking_date, 'phone', phone,
        'customer', customer, 'itemId', item_id, 'eventDate', event_date, 'pickup', pickup,
        'returnDue', return_due, 'actualReturn', actual_return, 'rentalFee', rental_fee,
        'deposit', deposit, 'damage', damage, 'mode', mode, 'received', received,
        'depositRefunded', deposit_refunded, 'notes', notes) order by position, id)
        from public.wabi_rentals where is_active), '[]'::jsonb),
      'transactions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'date', date, 'type', type,
        'category', category, 'desc', description, 'party', party, 'itemId', item_id,
        'mode', mode, 'account', account, 'amount', amount, 'notes', notes) order by position, id)
        from public.wabi_transactions where is_active), '[]'::jsonb)
    )
  ) from public.wabi_shop_meta meta where meta.singleton
$$;
revoke all on function public.wabi_get_shop() from public, anon, authenticated;
grant execute on function public.wabi_get_shop() to service_role;

create or replace function public.wabi_save_shop(shop_record jsonb, expected_version integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.wabi_shop_meta set shop_name = coalesce(shop_record #>> '{data,settings,shopName}', 'Wabi Sabi'),
      late_fee_per_day = coalesce(nullif(shop_record #>> '{data,settings,lateFeePerDay}', '')::numeric, 1000),
      version = (shop_record->>'version')::integer,
      updated_at = coalesce(nullif(shop_record->>'updatedAt', '')::timestamptz, now()),
      updated_by = coalesce(shop_record->>'updatedBy', 'user')
    where singleton and version = expected_version;
  if not found then return false; end if;

  update public.wabi_inventory set is_active = false where is_active;
  insert into public.wabi_inventory
    (id, position, name, category, status, stock_qty, sale_price, discount, rental_price, purchase_cost,
      deposit, cleaning, repair, purchase_date, item, is_active)
  select item->>'id', ordinality::integer - 1, coalesce(item->>'name', ''), item->>'category', coalesce(item->>'status', 'Available'),
      coalesce(nullif(item->>'stockQty', '')::integer, 1), coalesce(nullif(item->>'salePrice', '')::numeric, 0),
      coalesce(nullif(item->>'discount', '')::numeric, 0), coalesce(nullif(item->>'rentalPrice', '')::numeric, 0),
      coalesce(nullif(item->>'purchaseCost', '')::numeric, 0),
      coalesce(nullif(item->>'deposit', '')::numeric, 0), coalesce(nullif(item->>'cleaning', '')::numeric, 0),
      coalesce(nullif(item->>'repair', '')::numeric, 0), coalesce(item->>'purchaseDate', ''), item, true
    from jsonb_array_elements(coalesce(shop_record #> '{data,inventory}', '[]'::jsonb)) with ordinality as rows(item, ordinality)
    where nullif(item->>'id', '') is not null
  on conflict (id) do update set name = excluded.name, category = excluded.category,
      position = excluded.position, status = excluded.status, stock_qty = excluded.stock_qty, sale_price = excluded.sale_price,
      discount = excluded.discount,
      rental_price = excluded.rental_price, purchase_cost = excluded.purchase_cost, deposit = excluded.deposit,
      cleaning = excluded.cleaning, repair = excluded.repair, purchase_date = excluded.purchase_date,
      item = excluded.item, is_active = true;

  update public.wabi_customers set is_active = false where is_active;
  insert into public.wabi_customers (id, position, phone, name, email, address, notes, customer, is_active)
  select customer->>'id', ordinality::integer - 1, customer->>'phone', customer->>'name', customer->>'email',
      customer->>'address', customer->>'notes', customer, true
    from jsonb_array_elements(coalesce(shop_record #> '{data,customers}', '[]'::jsonb)) with ordinality as rows(customer, ordinality)
    where nullif(customer->>'id', '') is not null
  on conflict (id) do update set position = excluded.position, phone = excluded.phone, name = excluded.name, email = excluded.email,
      address = excluded.address, notes = excluded.notes, customer = excluded.customer, is_active = true;

  update public.wabi_sales set is_active = false where is_active;
  insert into public.wabi_sales
    (id, position, date, phone, customer, item_id, qty, unit_price, discount, mode, received, notes, is_active)
  select sale->>'id', ordinality::integer - 1, coalesce(sale->>'date', ''), coalesce(sale->>'phone', ''),
      coalesce(sale->>'customer', ''), coalesce(sale->>'itemId', ''), coalesce(nullif(sale->>'qty', '')::integer, 1),
      coalesce(nullif(sale->>'unitPrice', '')::numeric, 0), coalesce(nullif(sale->>'discount', '')::numeric, 0),
      coalesce(sale->>'mode', 'Cash'), coalesce(nullif(sale->>'received', '')::numeric, 0), coalesce(sale->>'notes', ''), true
    from jsonb_array_elements(coalesce(shop_record #> '{data,sales}', '[]'::jsonb)) with ordinality as rows(sale, ordinality)
    where nullif(sale->>'id', '') is not null
  on conflict (id) do update set position = excluded.position, date = excluded.date, phone = excluded.phone,
      customer = excluded.customer, item_id = excluded.item_id, qty = excluded.qty, unit_price = excluded.unit_price,
      discount = excluded.discount, mode = excluded.mode, received = excluded.received, notes = excluded.notes, is_active = true;

  update public.wabi_rentals set is_active = false where is_active;
  insert into public.wabi_rentals
    (id, position, booking_date, phone, customer, item_id, event_date, pickup, return_due, actual_return,
      rental_fee, deposit, damage, mode, received, deposit_refunded, notes, is_active)
  select rental->>'id', ordinality::integer - 1, coalesce(rental->>'bookingDate', ''), coalesce(rental->>'phone', ''),
      coalesce(rental->>'customer', ''), coalesce(rental->>'itemId', ''), coalesce(rental->>'eventDate', ''),
      coalesce(rental->>'pickup', ''), coalesce(rental->>'returnDue', ''), coalesce(rental->>'actualReturn', ''),
      coalesce(nullif(rental->>'rentalFee', '')::numeric, 0), coalesce(nullif(rental->>'deposit', '')::numeric, 0),
      coalesce(nullif(rental->>'damage', '')::numeric, 0), coalesce(rental->>'mode', 'Cash'),
      coalesce(nullif(rental->>'received', '')::numeric, 0), coalesce(nullif(rental->>'depositRefunded', '')::numeric, 0),
      coalesce(rental->>'notes', ''), true
    from jsonb_array_elements(coalesce(shop_record #> '{data,rentals}', '[]'::jsonb)) with ordinality as rows(rental, ordinality)
    where nullif(rental->>'id', '') is not null
  on conflict (id) do update set position = excluded.position, booking_date = excluded.booking_date, phone = excluded.phone,
      customer = excluded.customer, item_id = excluded.item_id, event_date = excluded.event_date, pickup = excluded.pickup,
      return_due = excluded.return_due, actual_return = excluded.actual_return, rental_fee = excluded.rental_fee,
      deposit = excluded.deposit, damage = excluded.damage, mode = excluded.mode, received = excluded.received,
      deposit_refunded = excluded.deposit_refunded, notes = excluded.notes, is_active = true;

  update public.wabi_transactions set is_active = false where is_active;
  insert into public.wabi_transactions
    (id, position, date, type, category, description, party, item_id, mode, account, amount, notes, is_active)
  select transaction->>'id', ordinality::integer - 1, coalesce(transaction->>'date', ''),
      coalesce(transaction->>'type', 'Expense'), coalesce(transaction->>'category', ''), coalesce(transaction->>'desc', ''),
      coalesce(transaction->>'party', ''), coalesce(transaction->>'itemId', ''), coalesce(transaction->>'mode', ''),
      coalesce(transaction->>'account', ''), coalesce(nullif(transaction->>'amount', '')::numeric, 0),
      coalesce(transaction->>'notes', ''), true
    from jsonb_array_elements(coalesce(shop_record #> '{data,transactions}', '[]'::jsonb)) with ordinality as rows(transaction, ordinality)
    where nullif(transaction->>'id', '') is not null
  on conflict (id) do update set position = excluded.position, date = excluded.date, type = excluded.type,
      category = excluded.category, description = excluded.description, party = excluded.party, item_id = excluded.item_id,
      mode = excluded.mode, account = excluded.account, amount = excluded.amount, notes = excluded.notes, is_active = true;
  return true;
end;
$$;
revoke all on function public.wabi_save_shop(jsonb, integer) from public, anon, authenticated;
grant execute on function public.wabi_save_shop(jsonb, integer) to service_role;
commit;
