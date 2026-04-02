import { Knex } from 'knex';

/**
 * Execute a callback inside a transaction with RLS bypass enabled.
 *
 * Background workers (Scheduler, JobWorker) run outside the Fastify
 * request lifecycle, so the per-request org-isolation / jwt-auth hooks
 * never fire.  Without explicit context the RLS policies on every
 * tenant-scoped table will filter out all rows.
 *
 * This helper opens a short-lived transaction, sets the session
 * variables that the RLS policies check, and hands the transaction
 * handle to the caller.  On success it commits; on error it rolls back.
 */
export async function withSystemContext<T>(
  db: Knex,
  fn: (trx: Knex.Transaction) => Promise<T>,
): Promise<T> {
  const trx = await db.transaction();
  try {
    await trx.raw("SET LOCAL app.bypass_rls = 'true'");
    const result = await fn(trx);
    await trx.commit();
    return result;
  } catch (err) {
    await trx.rollback();
    throw err;
  }
}
