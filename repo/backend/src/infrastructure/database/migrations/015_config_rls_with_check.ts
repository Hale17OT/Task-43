import { Knex } from 'knex';

/**
 * Add WITH CHECK policies to config_dictionaries and workflow_steps.
 *
 * The existing USING policy allows org-scoped admins to READ global rows
 * (org_id IS NULL) which is correct for config inheritance. But it also
 * allows them to UPDATE/INSERT global rows. The WITH CHECK clause
 * restricts mutations: org-scoped users can only write to their own org.
 * Only super_admin (empty org_id context) or bypass can write globals.
 */
export async function up(knex: Knex): Promise<void> {
  // Replace config_dictionaries policy with one that has WITH CHECK
  await knex.raw('DROP POLICY IF EXISTS "config_dictionaries_isolation" ON "config_dictionaries"');
  await knex.raw(`
    CREATE POLICY "config_dictionaries_isolation" ON "config_dictionaries"
    USING (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR org_id IS NULL
      OR current_setting('app.current_org_id', true) = org_id::text
    )
    WITH CHECK (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR (org_id IS NOT NULL AND current_setting('app.current_org_id', true) = org_id::text)
    )
  `);

  // Same for workflow_steps
  await knex.raw('DROP POLICY IF EXISTS "workflow_steps_isolation" ON "workflow_steps"');
  await knex.raw(`
    CREATE POLICY "workflow_steps_isolation" ON "workflow_steps"
    USING (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR org_id IS NULL
      OR current_setting('app.current_org_id', true) = org_id::text
    )
    WITH CHECK (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR (org_id IS NOT NULL AND current_setting('app.current_org_id', true) = org_id::text)
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Revert to USING-only policies
  await knex.raw('DROP POLICY IF EXISTS "config_dictionaries_isolation" ON "config_dictionaries"');
  await knex.raw(`
    CREATE POLICY "config_dictionaries_isolation" ON "config_dictionaries"
    USING (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR org_id IS NULL
      OR current_setting('app.current_org_id', true) = org_id::text
    )
  `);

  await knex.raw('DROP POLICY IF EXISTS "workflow_steps_isolation" ON "workflow_steps"');
  await knex.raw(`
    CREATE POLICY "workflow_steps_isolation" ON "workflow_steps"
    USING (
      current_setting('app.bypass_rls', true) = 'true'
      OR current_setting('app.current_org_id', true) = ''
      OR org_id IS NULL
      OR current_setting('app.current_org_id', true) = org_id::text
    )
  `);
}
