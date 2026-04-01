import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Change idempotency_registry from single-column PK on `key`
  // to a surrogate PK with composite unique index on (key, user_id, method, path).
  // This prevents cross-user key collisions while preserving scoped lookup semantics.

  await knex.schema.alterTable('idempotency_registry', (table) => {
    table.dropPrimary();
  });

  await knex.schema.alterTable('idempotency_registry', (table) => {
    // Add surrogate PK
    table.uuid('id').defaultTo(knex.raw('uuid_generate_v4()'));
  });

  // Set id as primary key
  await knex.schema.alterTable('idempotency_registry', (table) => {
    table.primary(['id']);
  });

  // Add composite unique constraint for scoped idempotency
  await knex.schema.alterTable('idempotency_registry', (table) => {
    table.unique(['key', 'user_id', 'method', 'path']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('idempotency_registry', (table) => {
    table.dropUnique(['key', 'user_id', 'method', 'path']);
    table.dropPrimary();
    table.dropColumn('id');
  });

  await knex.schema.alterTable('idempotency_registry', (table) => {
    table.primary(['key']);
  });
}
