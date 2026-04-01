import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('availability', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('lawyer_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('day_of_week').notNullable();
    table.time('start_time').notNullable();
    table.time('end_time').notNullable();
    table.integer('slot_duration_min').notNullable().defaultTo(60);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check('?? >= 0 AND ?? <= 6', ['day_of_week', 'day_of_week']);
    table.index(['lawyer_id', 'day_of_week']);
  });

  await knex.schema.createTable('bookings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('client_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('lawyer_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.enu('type', ['consultation', 'milestone']).notNullable();
    table.enu('status', [
      'pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'declined', 'rescheduled',
    ]).notNullable().defaultTo('pending');
    table.timestamp('scheduled_at', { useTz: true }).nullable();
    table.timestamp('deadline_at', { useTz: true }).nullable();
    table.integer('weight').notNullable().defaultTo(1);
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.binary('cancellation_reason_enc').nullable();
    table.string('idempotency_key').nullable();
    table.timestamps(true, true);

    table.index(['client_id']);
    table.index(['lawyer_id']);
    table.index(['org_id']);
    table.index(['status']);
    table.index(['scheduled_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bookings');
  await knex.schema.dropTableIfExists('availability');
}
