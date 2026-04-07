import { Knex } from 'knex';

/**
 * Add deterministic hash column for session_nonce lookups while encrypting
 * the actual nonce value at rest. The hash enables exact-match queries
 * without exposing the raw nonce in the database.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_sessions', (table) => {
    table.string('session_nonce_hash').nullable();
  });

  // Backfill hash for existing rows using PostgreSQL's digest function
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  await knex.raw(`
    UPDATE user_sessions
    SET session_nonce_hash = encode(digest(session_nonce, 'sha256'), 'hex')
    WHERE session_nonce_hash IS NULL
  `);

  // Drop old unique on session_nonce (will be encrypted, not queryable)
  await knex.raw('ALTER TABLE "user_sessions" DROP CONSTRAINT IF EXISTS "user_sessions_session_nonce_unique"');

  // Add unique index on hash for lookups
  await knex.schema.alterTable('user_sessions', (table) => {
    table.unique(['session_nonce_hash']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE "user_sessions" DROP CONSTRAINT IF EXISTS "user_sessions_session_nonce_hash_unique"');
  await knex.schema.alterTable('user_sessions', (table) => {
    table.dropColumn('session_nonce_hash');
  });
  await knex.raw(`
    ALTER TABLE "user_sessions"
    ADD CONSTRAINT "user_sessions_session_nonce_unique" UNIQUE ("session_nonce")
  `);
}
