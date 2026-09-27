const { createClient } = require('@supabase/supabase-js');

module.exports = function createDatabase(client) {
  if (!client) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) throw new Error('Supabase requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) in .env.');
    if (!key) throw new Error('Supabase requires SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env. The publishable key cannot be used for server database access.');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  const run = async (query) => {
    const { data, error } = await query;
    if (error) throw new Error(`Supabase database: ${error.message}`);
    return data;
  };
  return {
    admin: client.auth.admin,
    engine: 'supabase',
    getKV: async k => (await run(client.from('wabi_kv').select('v').eq('k', k).maybeSingle()))?.v ?? null,
    setKV: (k, v) => run(client.from('wabi_kv').upsert({ k, v }, { onConflict: 'k' })),
    compareAndSetKV: async (k, v, version) => {
      const rows = await run(client.from('wabi_kv').update({ v }).eq('k', k).eq('v->>version', String(version)).select('k'));
      return rows.length === 1;
    },
    getUser: username => run(client.from('wabi_profiles').select('*').eq('username', username).maybeSingle()),
    getUserById: id => run(client.from('wabi_profiles').select('*').eq('id', id).maybeSingle()),
    listUsers: () => run(client.from('wabi_profiles').select('*').order('username')),
    insertUser: user => run(client.from('wabi_profiles').insert(user).select().single()),
    updateUser: (id, values) => run(client.from('wabi_profiles').update(values).eq('id', id).select().single()),
    isSessionActive: (id, userId) => run(client.rpc('wabi_session_active', { session_id: id, account_id: userId })),
    revokeUserSessions: id => run(client.rpc('wabi_revoke_sessions', { account_id: id })),
  };
};
