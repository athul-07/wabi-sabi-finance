// Auth creation and profile creation can be separate writes. Verify both before
// reporting success; remove the newly created Auth account if provisioning fails.
module.exports = async function provisionUser(db, attributes) {
  const { data, error } = await db.admin.createUser(attributes);
  if (error) throw Object.assign(new Error(error.message), { status: 400 });
  const account = data?.user;
  if (!account?.id) throw new Error('Auth did not return the created account.');
  try {
    let profile = await db.getUserById(account.id);
    if (!profile) {
      const requested = attributes.app_metadata.wabi;
      await db.insertUser({ id: account.id, email: account.email,
        username: requested.username, name: requested.name, role: requested.role,
        permissions: requested.permissions, preferences: {} });
      profile = await db.getUserById(account.id);
    }
    if (!profile || profile.username !== attributes.app_metadata.wabi.username) {
      throw new Error('Created account has no matching database profile.');
    }
    return profile;
  } catch (cause) {
    try {
      const { error: rollbackError } = await db.admin.deleteUser(account.id);
      if (rollbackError) throw rollbackError;
    } catch {
      throw new Error('Profile creation failed and Auth cleanup failed. An administrator must repair the incomplete account.');
    }
    throw new Error(`User was not created: profile could not be saved. ${cause.message}`);
  }
};
