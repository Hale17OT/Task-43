import { Knex } from 'knex';
import { encrypt, decrypt } from '../../encryption/index.js';

/**
 * Encrypt any remaining plaintext values for usernames, session nonces,
 * token JTIs, IP addresses, and workstation IDs. After this migration,
 * all sensitive identifiers are encrypted at rest and the application
 * no longer needs legacy plaintext fallback paths.
 */

function isPlaintext(value: string): boolean {
  try {
    decrypt(value);
    return false; // decrypted successfully → already encrypted
  } catch {
    return true; // decrypt failed → still plaintext
  }
}

export async function up(knex: Knex): Promise<void> {
  // Encrypt plaintext usernames
  const users = await knex('users').select('id', 'username');
  for (const user of users) {
    if (user.username && isPlaintext(user.username)) {
      await knex('users').where({ id: user.id }).update({
        username: encrypt(user.username),
      });
    }
  }

  // Encrypt plaintext session fields
  const sessions = await knex('user_sessions').select(
    'id', 'session_nonce', 'token_jti', 'ip_address', 'workstation_id',
  );
  for (const session of sessions) {
    const updates: Record<string, string> = {};
    if (session.session_nonce && isPlaintext(session.session_nonce)) {
      updates.session_nonce = encrypt(session.session_nonce);
    }
    if (session.token_jti && isPlaintext(session.token_jti)) {
      updates.token_jti = encrypt(session.token_jti);
    }
    if (session.ip_address && isPlaintext(session.ip_address)) {
      updates.ip_address = encrypt(session.ip_address);
    }
    if (session.workstation_id && isPlaintext(session.workstation_id)) {
      updates.workstation_id = encrypt(session.workstation_id);
    }
    if (Object.keys(updates).length > 0) {
      await knex('user_sessions').where({ id: session.id }).update(updates);
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // One-way data migration — plaintext values are not recoverable
  // after encryption. Rolling back requires a database restore.
}
