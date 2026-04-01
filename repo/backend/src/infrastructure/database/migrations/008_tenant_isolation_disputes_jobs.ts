import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add org_id to disputes for tenant isolation
  await knex.schema.alterTable('disputes', (table) => {
    table.uuid('org_id').nullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.index(['org_id']);
  });

  // Backfill org_id from appellant's org
  await knex.raw(`
    UPDATE disputes
    SET org_id = u.org_id
    FROM users u
    WHERE disputes.appellant_id = u.id
      AND disputes.org_id IS NULL
  `);

  // Now make it non-nullable
  await knex.schema.alterTable('disputes', (table) => {
    table.uuid('org_id').notNullable().alter();
  });

  // Add org_id to jobs for tenant isolation
  await knex.schema.alterTable('jobs', (table) => {
    table.uuid('org_id').nullable().references('id').inTable('organizations').onDelete('SET NULL');
    table.index(['org_id']);
  });

  // Enable RLS on disputes
  await knex.raw('ALTER TABLE "disputes" ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE "disputes" FORCE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY "disputes_isolation" ON "disputes"
    USING (
      current_setting('app.current_org_id', true) = ''
      OR current_setting('app.current_org_id', true) = org_id::text
      OR current_setting('app.bypass_rls', true) = 'true'
    )
  `);

  // Enable RLS on jobs
  await knex.raw('ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE "jobs" FORCE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY "jobs_isolation" ON "jobs"
    USING (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR (org_id IS NOT NULL AND current_setting('app.current_org_id', true) = org_id::text)
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP POLICY IF EXISTS "jobs_isolation" ON "jobs"');
  await knex.raw('ALTER TABLE "jobs" DISABLE ROW LEVEL SECURITY');

  await knex.raw('DROP POLICY IF EXISTS "disputes_isolation" ON "disputes"');
  await knex.raw('ALTER TABLE "disputes" DISABLE ROW LEVEL SECURITY');

  await knex.schema.alterTable('jobs', (table) => {
    table.dropColumn('org_id');
  });

  await knex.schema.alterTable('disputes', (table) => {
    table.dropColumn('org_id');
  });
}
