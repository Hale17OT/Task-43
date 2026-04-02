import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // user_sessions: queries filter on (user_id, session_nonce) and expires_at
  await knex.schema.alterTable('user_sessions', (table) => {
    table.index(['user_id', 'expires_at'], 'idx_user_sessions_user_expires');
  });

  // reviews: findReviewsByUserId queries on reviewer_id
  await knex.schema.alterTable('reviews', (table) => {
    table.index('reviewer_id', 'idx_reviews_reviewer_id');
  });

  // disputes: queries filter on appellant_id and status
  await knex.schema.alterTable('disputes', (table) => {
    table.index(['appellant_id', 'status'], 'idx_disputes_appellant_status');
  });

  // credit_score_history: getHistory queries on user_id + created_at ordering
  await knex.schema.alterTable('credit_score_history', (table) => {
    table.index(['user_id', 'created_at'], 'idx_credit_history_user_created');
  });

  // notifications: findByUserId queries on user_id + is_read + created_at
  await knex.schema.alterTable('notifications', (table) => {
    table.index(['user_id', 'is_read', 'created_at'], 'idx_notifications_user_read_created');
  });

  // jobs: claimJobs queries on status + attempts + next_retry_at + shard_key
  await knex.schema.alterTable('jobs', (table) => {
    table.index(['status', 'shard_key', 'priority', 'created_at'], 'idx_jobs_claim_queue');
  });

  // bookings: common filters on org_id + status + created_at
  await knex.schema.alterTable('bookings', (table) => {
    table.index(['org_id', 'status', 'created_at'], 'idx_bookings_org_status_created');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('bookings', (table) => {
    table.dropIndex([], 'idx_bookings_org_status_created');
  });
  await knex.schema.alterTable('jobs', (table) => {
    table.dropIndex([], 'idx_jobs_claim_queue');
  });
  await knex.schema.alterTable('notifications', (table) => {
    table.dropIndex([], 'idx_notifications_user_read_created');
  });
  await knex.schema.alterTable('credit_score_history', (table) => {
    table.dropIndex([], 'idx_credit_history_user_created');
  });
  await knex.schema.alterTable('disputes', (table) => {
    table.dropIndex([], 'idx_disputes_appellant_status');
  });
  await knex.schema.alterTable('reviews', (table) => {
    table.dropIndex([], 'idx_reviews_reviewer_id');
  });
  await knex.schema.alterTable('user_sessions', (table) => {
    table.dropIndex([], 'idx_user_sessions_user_expires');
  });
}
