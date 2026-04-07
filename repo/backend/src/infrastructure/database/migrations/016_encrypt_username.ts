import { Knex } from 'knex';

/**
 * Add deterministic hash column for username lookups while supporting
 * encryption of the actual username value at rest.
 *
 * The username_hash column enables exact-match login queries without
 * exposing the raw username in the database. The unique constraint
 * moves from username to username_hash.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await knex.schema.alterTable('users', (table) => {
    table.string('username_hash').nullable();
  });

  // Backfill hash for existing rows
  await knex.raw(`
    UPDATE users
    SET username_hash = encode(digest(username, 'sha256'), 'hex')
    WHERE username_hash IS NULL
  `);

  // Move unique constraint from username to username_hash
  await knex.raw('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_unique"');
  await knex.raw('ALTER TABLE "users" ADD CONSTRAINT "users_username_hash_unique" UNIQUE ("username_hash")');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_hash_unique"');
  await knex.raw('ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE ("username")');
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('username_hash');
  });
}
