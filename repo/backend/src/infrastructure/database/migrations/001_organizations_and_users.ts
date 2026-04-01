import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  await knex.schema.createTable('organizations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name').notNullable().unique();
    table.jsonb('settings').defaultTo('{}');
    table.timestamps(true, true);
  });

  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('username').notNullable().unique();
    table.string('password_hash').notNullable();
    table.enu('role', ['client', 'lawyer', 'admin', 'super_admin']).notNullable();
    table.integer('credit_score').notNullable().defaultTo(50);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.boolean('is_session_exempt').notNullable().defaultTo(false);
    table.integer('failed_login_attempts').notNullable().defaultTo(0);
    table.timestamp('locked_until', { useTz: true }).nullable();
    table.integer('daily_capacity').nullable();
    table.timestamps(true, true);

    table.check('?? >= 0 AND ?? <= 100', ['credit_score', 'credit_score']);
  });

  await knex.schema.createTable('system_config', (table) => {
    table.string('key').primary();
    table.jsonb('value').notNullable().defaultTo('{}');
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex('system_config').insert({
    key: 'encryption_key_backup_confirmed',
    value: JSON.stringify({ confirmed: false, confirmed_by: null, confirmed_at: null }),
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('system_config');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('organizations');
}
