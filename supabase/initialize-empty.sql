-- Use only for a new empty shop. Existing shop data is never replaced.
insert into public.wabi_shop_meta (singleton, settings, version, updated_at, updated_by)
values (true, '{"lateFeePerDay":1000,"shopName":"Wabi Sabi"}'::jsonb, 1, now(), 'setup')
on conflict (singleton) do nothing;
