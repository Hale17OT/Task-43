import { Knex } from 'knex';

/**
 * Change audit_log.entity_id from uuid to text to support encrypted ciphertext.
 * The entity_id is now encrypted at the application layer before insert.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('audit_log', (table) => {
    table.text('entity_id_enc').nullable();
  });

  // Copy existing uuid values as text
  await knex.raw('UPDATE audit_log SET entity_id_enc = entity_id::text WHERE entity_id IS NOT NULL');

  // Drop old uuid column and rename
  await knex.schema.alterTable('audit_log', (table) => {
    table.dropColumn('entity_id');
  });
  await knex.raw('ALTER TABLE audit_log RENAME COLUMN entity_id_enc TO entity_id');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('audit_log', (table) => {
    table.uuid('entity_id_old').nullable();
  });
  // Best-effort: copy back values that are valid UUIDs
  await knex.raw(`
    UPDATE audit_log SET entity_id_old = entity_id::uuid
    WHERE entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  `);
  await knex.schema.alterTable('audit_log', (table) => {
    table.dropColumn('entity_id');
  });
  await knex.raw('ALTER TABLE audit_log RENAME COLUMN entity_id_old TO entity_id');
}
