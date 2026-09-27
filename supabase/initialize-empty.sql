-- Use only for a new empty shop. Existing shop data is never replaced.
insert into public.wabi_shop_meta (singleton, shop_name, late_fee_per_day, version, updated_at, updated_by)
values (true, 'Wabi Sabi', 1000, 1, now(), 'setup')
on conflict (singleton) do nothing;
