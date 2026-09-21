// Creates .env from .env.example with a freshly generated JWT secret.
// Safe to re-run: it never overwrites an existing .env.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, '.env');

if (existsSync(target)) {
  console.log('.env already exists, leaving it alone.');
  process.exit(0);
}

const example = readFileSync(resolve(root, '.env.example'), 'utf8');
const secret = randomBytes(48).toString('base64url');
writeFileSync(target, example.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`));
console.log('Created .env with a new JWT_SECRET. Add your API keys to it next.');
