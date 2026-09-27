const { DEFAULT_STAFF_PERMS } = require('./permissions');
async function main() {
  const db = require('./db');
  const args = process.argv.slice(2);
  const owner = args[0] === '--admin';
  if (owner) args.shift();
  const [username, email, ...name] = args;
  const password = process.env.WABI_NEW_USER_PASSWORD;
  if (!username || !email || !password) throw new Error('Usage: set WABI_NEW_USER_PASSWORD, then npm run setup:admin -- <username> <email> [name] (or npm run adduser).');
  if (!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Use a lowercase username (3–40 characters) and a valid email.');
  if (password.length < 12 || password.length > 128) throw new Error('Password must be 12 to 128 characters.');
  if (owner && (await db.listUsers()).some(u => u.role === 'admin')) throw new Error('An administrator already exists. Use Users & access.');
  await require('./provision-user')(db, { email, password, email_confirm: true,
    app_metadata: { wabi: { username, name: name.join(' ') || username, role: owner ? 'admin' : 'staff', permissions: DEFAULT_STAFF_PERMS } } });
  console.log('Created Supabase Auth account and database profile for ' + username + '.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

