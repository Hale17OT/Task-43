import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable RLS on tenant-scoped tables
  const tables = ['users', 'bookings', 'availability', 'reviews', 'notifications', 'webhook_configs'];

  for (const table of tables) {
    await knex.raw(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);

    // Policy: allow access when org_id matches session variable, or when session variable is empty (super_admin bypass)
    if (table === 'notifications') {
      // Notifications are user-scoped, not org-scoped
      await knex.raw(`
        CREATE POLICY "${table}_isolation" ON "${table}"
        USING (
          current_setting('app.current_user_id', true) = user_id::text
          OR current_setting('app.current_role', true) IN ('admin', 'super_admin')
          OR current_setting('app.bypass_rls', true) = 'true'
        )
      `);
    } else if (table === 'users') {
      await knex.raw(`
        CREATE POLICY "${table}_isolation" ON "${table}"
        USING (
          current_setting('app.current_org_id', true) = ''
          OR current_setting('app.current_org_id', true) = org_id::text
          OR current_setting('app.bypass_rls', true) = 'true'
        )
      `);
    } else if (table === 'availability') {
      await knex.raw(`
        CREATE POLICY "${table}_isolation" ON "${table}"
        USING (
          current_setting('app.bypass_rls', true) = 'true'
          OR lawyer_id IN (
            SELECT id FROM users WHERE org_id::text = current_setting('app.current_org_id', true)
          )
          OR current_setting('app.current_org_id', true) = ''
        )
      `);
    } else if (table === 'reviews') {
      await knex.raw(`
        CREATE POLICY "${table}_isolation" ON "${table}"
        USING (
          current_setting('app.bypass_rls', true) = 'true'
          OR reviewer_id IN (
            SELECT id FROM users WHERE org_id::text = current_setting('app.current_org_id', true)
          )
          OR reviewee_id IN (
            SELECT id FROM users WHERE org_id::text = current_setting('app.current_org_id', true)
          )
          OR current_setting('app.current_org_id', true) = ''
        )
      `);
    } else {
      await knex.raw(`
        CREATE POLICY "${table}_isolation" ON "${table}"
        USING (
          current_setting('app.current_org_id', true) = ''
          OR current_setting('app.current_org_id', true) = org_id::text
          OR current_setting('app.bypass_rls', true) = 'true'
        )
      `);
    }
  }

  // Audit log: super_admin only
  await knex.raw(`ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY`);
  await knex.raw(`ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY`);
  await knex.raw(`
    CREATE POLICY "audit_log_super_admin" ON "audit_log"
    USING (
      current_setting('app.current_role', true) = 'super_admin'
      OR current_setting('app.bypass_rls', true) = 'true'
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  const tables = ['users', 'bookings', 'availability', 'reviews', 'notifications', 'webhook_configs', 'audit_log'];

  for (const table of tables) {
    await knex.raw(`DROP POLICY IF EXISTS "${table}_isolation" ON "${table}"`);
    await knex.raw(`DROP POLICY IF EXISTS "${table}_super_admin" ON "${table}"`);
    await knex.raw(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
  }
}
