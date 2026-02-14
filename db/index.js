const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const testConnection = async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('[DB] ✓ Connected successfully at', res.rows[0].now);
  } catch (error) {
    console.error('[DB] ✗ Connection failed:', error);
    process.exit(1);
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  testConnection,
};
