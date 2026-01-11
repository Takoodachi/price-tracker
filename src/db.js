const { Pool } = require('pg');

// A "Pool" is the recommended way to manage connections for a web server
// It reuses connections, which is much more efficient.
const pool = new Pool({
  user: 'postgres', // The default postgres user
  host: 'localhost',
  database: 'price_app',
  password: process.env.PGPASSWORD, // The password you set when installing Postgres
  port: 5432, // The default postgres port
});

// We export a single query function that all our API endpoints can use
module.exports = {
  query: (text, params) => pool.query(text, params),
};