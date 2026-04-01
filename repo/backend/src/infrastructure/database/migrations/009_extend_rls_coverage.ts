import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // credit_score_history: user-scoped (user_id column)
  await knex.raw('ALTER TABLE "credit_score_history" ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE "credit_score_history" FORCE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY "credit_score_history_isolation" ON "credit_score_history"
    USING (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR user_id IN (
        SELECT id FROM users WHERE org_id::text = current_setting('app.current_org_id', true)
      )
      OR current_setting('app.current_user_id', true) = user_id::text
    )
  `);

  // report_subscriptions: user-scoped (user_id column)
  await knex.raw('ALTER TABLE "report_subscriptions" ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE "report_subscriptions" FORCE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY "report_subscriptions_isolation" ON "report_subscriptions"
    USING (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR current_setting('app.current_user_id', true) = user_id::text
      OR current_setting('app.current_role', true) IN ('admin', 'super_admin')
    )
  `);

  // idempotency_registry: user-scoped (user_id column)
  await knex.raw('ALTER TABLE "idempotency_registry" ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE "idempotency_registry" FORCE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY "idempotency_registry_isolation" ON "idempotency_registry"
    USING (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR current_setting('app.current_user_id', true) = user_id::text
    )
  `);

  // rate_limit_buckets: system table, admin/bypass only
  await knex.raw('ALTER TABLE "rate_limit_buckets" ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE "rate_limit_buckets" FORCE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY "rate_limit_buckets_isolation" ON "rate_limit_buckets"
    USING (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR id LIKE 'user:' || current_setting('app.current_user_id', true) || '%'
      OR id LIKE 'org:' || current_setting('app.current_org_id', true) || '%'
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  const tables = ['credit_score_history', 'report_subscriptions', 'idempotency_registry', 'rate_limit_buckets'];
  for (const table of tables) {
    await knex.raw(`DROP POLICY IF EXISTS "${table}_isolation" ON "${table}"`);
    await knex.raw(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
  }
}
