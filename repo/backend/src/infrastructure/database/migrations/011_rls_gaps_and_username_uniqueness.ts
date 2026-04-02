import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Fix username uniqueness: global unique → composite (org_id, username)
  //    This allows the same username in different organizations.
  await knex.raw('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_unique"');
  await knex.raw('ALTER TABLE "users" ADD CONSTRAINT "users_org_username_unique" UNIQUE ("org_id", "username")');

  // 2. Add RLS to config_dictionaries (org-scoped)
  await knex.raw('ALTER TABLE "config_dictionaries" ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE "config_dictionaries" FORCE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY "config_dictionaries_isolation" ON "config_dictionaries"
    USING (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR org_id IS NULL
      OR current_setting('app.current_org_id', true) = org_id::text
    )
  `);

  // 3. Add RLS to workflow_steps (org-scoped)
  await knex.raw('ALTER TABLE "workflow_steps" ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE "workflow_steps" FORCE ROW LEVEL SECURITY');
  await knex.raw(`
    CREATE POLICY "workflow_steps_isolation" ON "workflow_steps"
    USING (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR org_id IS NULL
      OR current_setting('app.current_org_id', true) = org_id::text
    )
  `);

  // 4. Fix rate_limit_buckets RLS — replace unsafe LIKE with column-based checks.
  //    Add user_id and org_id columns for safe RLS, backfill from id prefix.
  await knex.schema.alterTable('rate_limit_buckets', (table) => {
    table.string('owner_user_id').nullable();
    table.string('owner_org_id').nullable();
  });

  // Backfill from id prefix pattern (user:<id>:... or org:<id>:...)
  await knex.raw(`
    UPDATE rate_limit_buckets
    SET owner_user_id = CASE
      WHEN id LIKE 'user:%' THEN split_part(id, ':', 2)
      ELSE NULL
    END,
    owner_org_id = CASE
      WHEN id LIKE 'org:%' THEN split_part(id, ':', 2)
      ELSE NULL
    END
  `);

  // Drop the old unsafe LIKE-based policy and create a safe one
  await knex.raw('DROP POLICY IF EXISTS "rate_limit_buckets_isolation" ON "rate_limit_buckets"');
  await knex.raw(`
    CREATE POLICY "rate_limit_buckets_isolation" ON "rate_limit_buckets"
    USING (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR owner_user_id = current_setting('app.current_user_id', true)
      OR owner_org_id = current_setting('app.current_org_id', true)
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Revert rate_limit_buckets policy
  await knex.raw('DROP POLICY IF EXISTS "rate_limit_buckets_isolation" ON "rate_limit_buckets"');
  await knex.raw(`
    CREATE POLICY "rate_limit_buckets_isolation" ON "rate_limit_buckets"
    USING (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR id LIKE 'user:' || current_setting('app.current_user_id', true) || '%'
      OR id LIKE 'org:' || current_setting('app.current_org_id', true) || '%'
    )
  `);
  await knex.schema.alterTable('rate_limit_buckets', (table) => {
    table.dropColumn('owner_user_id');
    table.dropColumn('owner_org_id');
  });

  // Revert workflow_steps RLS
  await knex.raw('DROP POLICY IF EXISTS "workflow_steps_isolation" ON "workflow_steps"');
  await knex.raw('ALTER TABLE "workflow_steps" DISABLE ROW LEVEL SECURITY');

  // Revert config_dictionaries RLS
  await knex.raw('DROP POLICY IF EXISTS "config_dictionaries_isolation" ON "config_dictionaries"');
  await knex.raw('ALTER TABLE "config_dictionaries" DISABLE ROW LEVEL SECURITY');

  // Revert username uniqueness
  await knex.raw('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_org_username_unique"');
  await knex.raw('ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE ("username")');
}
