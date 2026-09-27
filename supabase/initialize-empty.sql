-- Use only for a new empty shop. Existing shop data is never replaced.
insert into public.wabi_kv (k, v) values ('shop', jsonb_build_object(
  'version', 1, 'updatedAt', now(), 'updatedBy', 'setup',
  'data', '{"customers":[],"inventory":[],"sales":[],"rentals":[],"transactions":[],"settings":{"lateFeePerDay":1000,"shopName":"Wabi Sabi"}}'::jsonb
)) on conflict (k) do nothing;
