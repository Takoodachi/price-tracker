import type { User } from '@pricetracker/shared';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';
import { HttpError } from '../errors';

const ROUNDS = 11;
// Compared against when the email doesn't exist, so response time doesn't
// reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', ROUNDS);

export async function createUser(email: string, password: string): Promise<User> {
  const hash = await bcrypt.hash(password, ROUNDS);
  try {
    const { rows } = await pool.query<User>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, hash],
    );
    return rows[0]!;
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new HttpError(409, 'An account with this email already exists.', 'email_taken');
    }
    throw err;
  }
}

export async function verifyUser(email: string, password: string): Promise<User> {
  const { rows } = await pool.query<User & { password_hash: string }>(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [email],
  );
  const user = rows[0];
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Incorrect email or password.', 'invalid_credentials');
  return { id: user.id, email: user.email };
}
