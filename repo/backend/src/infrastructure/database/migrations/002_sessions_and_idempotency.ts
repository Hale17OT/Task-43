import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('session_nonce').notNullable().unique();
    table.string('token_jti').notNullable();
    table.string('ip_address').nullable();
    table.string('workstation_id').nullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['user_id']);
  });

  await knex.schema.createTable('idempotency_registry', (table) => {
    table.string('key').primary();
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('method').notNullable();
    table.string('path').notNullable();
    table.integer('status_code').notNullable();
    table.jsonb('response_body').notNullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: true }).notNullable();

    table.index(['expires_at']);
  });

  await knex.schema.createTable('rate_limit_buckets', (table) => {
    table.string('id').primary();
    table.float('tokens').notNullable();
    table.float('max_tokens').notNullable();
    table.float('refill_rate').notNullable();
    table.timestamp('last_refill_at', { useTz: true }).defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('rate_limit_buckets');
  await knex.schema.dropTableIfExists('idempotency_registry');
  await knex.schema.dropTableIfExists('user_sessions');
}
