import { Knex } from 'knex';

/**
 * Ensure username uniqueness is GLOBAL regardless of migration history.
 *
 * Migration 011 originally changed the constraint from global unique to
 * composite (org_id, username). This was reverted because login has no org
 * context, making per-org usernames ambiguous. However, databases that
 * already ran the old version of 011 still have the composite constraint.
 *
 * This migration normalises both paths to the same final state:
 *   - DROP the composite constraint if it exists (from old 011)
 *   - ADD the global constraint if it doesn't exist
 */
export async function up(knex: Knex): Promise<void> {
  // Drop the per-org composite constraint if it was applied by old migration 011
  await knex.raw('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_org_username_unique"');

  // Ensure the global unique constraint exists
  // (may already exist on fresh installs where 011 never changed it)
  const result = await knex.raw(`
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_username_unique' AND conrelid = 'users'::regclass
  `);
  if (result.rows.length === 0) {
    await knex.raw('ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE ("username")');
  }
}

export async function down(knex: Knex): Promise<void> {
  // Down is a no-op — global uniqueness is the canonical state
}
