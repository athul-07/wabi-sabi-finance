require('./env');
const { createApp } = require('./app');
const authClient = require('./auth-client');
async function main() {
  const db = require('./db');
  if (!(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) throw new Error('SUPABASE_PUBLISHABLE_KEY is required.');
  if (!await db.getKV('shop')) throw new Error('Shop data is missing in Supabase. Import your data there, or run supabase/initialize-empty.sql for a new empty shop.');
  await db.listUsers();
  const app = createApp({ db, authClient });
  const server = app.listen(process.env.PORT || 4000, () => {
    console.log('Wabi Sabi finance running: http://localhost:' + server.address().port);
    console.log('Storage and authentication: Supabase');
  });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
