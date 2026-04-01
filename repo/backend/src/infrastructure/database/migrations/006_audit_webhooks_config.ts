import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_log', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('user_id').nullable();
    table.string('action').notNullable();
    table.string('entity_type').notNullable();
    table.uuid('entity_id').nullable();
    table.jsonb('old_state').nullable();
    table.jsonb('new_state').nullable();
    table.string('ip_address').nullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['entity_type', 'entity_id']);
    table.index(['user_id']);
    table.index(['created_at']);
  });

  // Make audit_log immutable — revoke UPDATE and DELETE
  await knex.raw(`
    CREATE OR REPLACE FUNCTION prevent_audit_modification()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Audit log entries cannot be modified or deleted';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER audit_log_immutable_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

    CREATE TRIGGER audit_log_immutable_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
  `);

  await knex.schema.createTable('webhook_configs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('url').notNullable();
    table.jsonb('events').notNullable().defaultTo('[]');
    table.string('secret').notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['org_id']);
  });

  await knex.schema.createTable('config_dictionaries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('org_id').nullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('category').notNullable();
    table.string('key').notNullable();
    table.jsonb('value').notNullable().defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.unique(['org_id', 'category', 'key']);
  });

  await knex.schema.createTable('workflow_steps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('org_id').nullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('workflow_type').notNullable();
    table.integer('step_order').notNullable();
    table.string('name').notNullable();
    table.jsonb('config').notNullable().defaultTo('{}');

    table.index(['org_id', 'workflow_type']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER IF EXISTS audit_log_immutable_delete ON audit_log');
  await knex.raw('DROP TRIGGER IF EXISTS audit_log_immutable_update ON audit_log');
  await knex.raw('DROP FUNCTION IF EXISTS prevent_audit_modification()');
  await knex.schema.dropTableIfExists('workflow_steps');
  await knex.schema.dropTableIfExists('config_dictionaries');
  await knex.schema.dropTableIfExists('webhook_configs');
  await knex.schema.dropTableIfExists('audit_log');
}
