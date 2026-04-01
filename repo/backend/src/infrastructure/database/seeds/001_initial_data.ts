import { Knex } from 'knex';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export async function seed(knex: Knex): Promise<void> {
  // Bypass RLS for seeding
  await knex.raw("SET LOCAL app.bypass_rls = 'true'");

  // Clear existing data (order matters for FK constraints)
  await knex('notifications').del();
  await knex('report_subscriptions').del();
  await knex('jobs').del();
  await knex('credit_score_history').del();
  await knex('disputes').del();
  await knex('reviews').del();
  await knex('bookings').del();
  await knex('availability').del();
  await knex('user_sessions').del();
  await knex('idempotency_registry').del();
  await knex('rate_limit_buckets').del();
  await knex('config_dictionaries').del();
  await knex('webhook_configs').del();
  await knex('workflow_steps').del();
  await knex('users').del();
  await knex('organizations').del();

  // Password: "SecurePass1!" — meets all rules (12+ chars, 1 number, 1 symbol)
  const passwordHash = await bcrypt.hash('SecurePass1!', SALT_ROUNDS);

  // Organizations
  const [org1] = await knex('organizations').insert({
    name: 'Justice Partners LLP',
    settings: JSON.stringify({ timezone: 'America/New_York' }),
  }).returning('id');

  const [org2] = await knex('organizations').insert({
    name: 'Metro Legal Aid',
    settings: JSON.stringify({ timezone: 'America/Chicago' }),
  }).returning('id');

  // Users
  const [superAdmin] = await knex('users').insert({
    org_id: org1.id,
    username: 'superadmin',
    password_hash: passwordHash,
    role: 'super_admin',
    is_session_exempt: true,
    credit_score: 100,
  }).returning('id');

  const [admin1] = await knex('users').insert({
    org_id: org1.id,
    username: 'admin1',
    password_hash: passwordHash,
    role: 'admin',
    credit_score: 100,
  }).returning('id');

  const [lawyer1] = await knex('users').insert({
    org_id: org1.id,
    username: 'lawyer1',
    password_hash: passwordHash,
    role: 'lawyer',
    daily_capacity: 10,
    credit_score: 80,
  }).returning('id');

  const [lawyer2] = await knex('users').insert({
    org_id: org1.id,
    username: 'lawyer2',
    password_hash: passwordHash,
    role: 'lawyer',
    daily_capacity: 8,
    credit_score: 75,
  }).returning('id');

  const [client1] = await knex('users').insert({
    org_id: org1.id,
    username: 'client1',
    password_hash: passwordHash,
    role: 'client',
    credit_score: 50,
  }).returning('id');

  const [client2] = await knex('users').insert({
    org_id: org1.id,
    username: 'client2',
    password_hash: passwordHash,
    role: 'client',
    credit_score: 45,
  }).returning('id');

  // Org 2 users
  await knex('users').insert({
    org_id: org2.id,
    username: 'admin2',
    password_hash: passwordHash,
    role: 'admin',
    credit_score: 100,
  });

  await knex('users').insert({
    org_id: org2.id,
    username: 'lawyer3',
    password_hash: passwordHash,
    role: 'lawyer',
    daily_capacity: 12,
    credit_score: 90,
  });

  await knex('users').insert({
    org_id: org2.id,
    username: 'client3',
    password_hash: passwordHash,
    role: 'client',
    credit_score: 60,
  });

  // Availability for lawyers (Mon-Fri, 9AM-5PM)
  for (let day = 1; day <= 5; day++) {
    await knex('availability').insert([
      {
        lawyer_id: lawyer1.id,
        day_of_week: day,
        start_time: '09:00',
        end_time: '12:00',
        slot_duration_min: 60,
      },
      {
        lawyer_id: lawyer1.id,
        day_of_week: day,
        start_time: '13:00',
        end_time: '17:00',
        slot_duration_min: 60,
      },
      {
        lawyer_id: lawyer2.id,
        day_of_week: day,
        start_time: '10:00',
        end_time: '16:00',
        slot_duration_min: 60,
      },
    ]);
  }

  // Default credit rules in config_dictionaries
  await knex('config_dictionaries').insert([
    {
      org_id: null,
      category: 'credit_rules',
      key: 'LATE_DELIVERY',
      value: JSON.stringify({ changeAmount: -5, description: 'Late delivery penalty' }),
    },
    {
      org_id: null,
      category: 'credit_rules',
      key: 'NO_SHOW',
      value: JSON.stringify({ changeAmount: -10, description: 'No-show penalty' }),
    },
    {
      org_id: null,
      category: 'credit_rules',
      key: 'STREAK_BONUS',
      value: JSON.stringify({ changeAmount: 2, description: 'Five consecutive on-time completions' }),
    },
    {
      org_id: null,
      category: 'credit_rules',
      key: 'CANCELLATION_PENALTY',
      value: JSON.stringify({ changeAmount: -5, description: 'Late cancellation within 2 hours' }),
    },
  ]);
}
