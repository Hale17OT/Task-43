import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reviews', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('booking_id').notNullable().references('id').inTable('bookings').onDelete('CASCADE');
    table.uuid('reviewer_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('reviewee_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('timeliness').notNullable();
    table.integer('professionalism').notNullable();
    table.integer('communication').notNullable();
    table.string('comment', 1000).nullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check('?? >= 1 AND ?? <= 5', ['timeliness', 'timeliness']);
    table.check('?? >= 1 AND ?? <= 5', ['professionalism', 'professionalism']);
    table.check('?? >= 1 AND ?? <= 5', ['communication', 'communication']);
    table.unique(['booking_id', 'reviewer_id']);
    table.index(['reviewee_id']);
  });

  await knex.schema.createTable('disputes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('review_id').notNullable().references('id').inTable('reviews').onDelete('CASCADE');
    table.uuid('appellant_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('reason').notNullable();
    table.enu('status', ['pending', 'under_review', 'resolved', 'dismissed']).notNullable().defaultTo('pending');
    table.text('resolution_notes').nullable();
    table.uuid('admin_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.jsonb('penalty_escrowed').nullable();
    table.timestamp('filed_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deadline_at', { useTz: true }).notNullable();
    table.timestamp('resolved_at', { useTz: true }).nullable();

    table.index(['status']);
  });

  await knex.schema.createTable('credit_score_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('previous_score').notNullable();
    table.integer('change_amount').notNullable();
    table.integer('new_score').notNullable();
    table.string('rule_code').notNullable();
    table.text('reason').notNullable();
    table.boolean('is_escrowed').notNullable().defaultTo(false);
    table.uuid('dispute_id').nullable().references('id').inTable('disputes').onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['user_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('credit_score_history');
  await knex.schema.dropTableIfExists('disputes');
  await knex.schema.dropTableIfExists('reviews');
}
