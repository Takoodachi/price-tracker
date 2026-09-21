import { migrate } from './migrate';
import { pool } from './pool';

try {
  await migrate();
  console.log('Database is up to date.');
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
