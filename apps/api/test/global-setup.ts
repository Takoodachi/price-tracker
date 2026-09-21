import pg from 'pg';

/** Creates the test database if needed. Integration tests skip themselves if Postgres is down. */
export default async function setup() {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? 'postgres://pricetracker:pricetracker@localhost:5433/pricetracker_test',
  );
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';
  const client = new pg.Client({ connectionString: url.toString() });
  try {
    await client.connect();
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
    process.env.PT_TEST_DB_READY = '1';
  } catch {
    console.warn('\nPostgres not reachable: integration tests will be skipped. Run `npm run services:up`.\n');
  } finally {
    await client.end().catch(() => {});
  }
}
