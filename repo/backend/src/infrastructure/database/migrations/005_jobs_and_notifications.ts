import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('type').notNullable();
    table.jsonb('payload').notNullable().defaultTo('{}');
    table.integer('priority').notNullable().defaultTo(0);
    table.enu('status', ['queued', 'running', 'completed', 'failed', 'dead']).notNullable().defaultTo('queued');
    table.integer('attempts').notNullable().defaultTo(0);
    table.integer('max_attempts').notNullable().defaultTo(5);
    table.timestamp('next_retry_at', { useTz: true }).nullable();
    table.text('last_error').nullable();
    table.integer('shard_key').nullable();
    table.string('idempotency_key').nullable();
    table.string('locked_by').nullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('completed_at', { useTz: true }).nullable();

    table.index(['status', 'priority', 'next_retry_at']);
    table.index(['type']);
    table.index(['idempotency_key']);
  });

  await knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('title').notNullable();
    table.text('body').nullable();
    table.string('type').nullable();
    table.uuid('reference_id').nullable();
    table.boolean('is_read').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['user_id', 'is_read']);
    table.index(['created_at']);
  });

  await knex.schema.createTable('report_subscriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('report_type').notNullable();
    table.jsonb('filters').notNullable().defaultTo('{}');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['is_active']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('report_subscriptions');
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('jobs');
}
