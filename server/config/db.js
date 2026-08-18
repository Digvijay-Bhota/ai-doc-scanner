const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'ai_doc_scanner',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 20,                  // max connections in pool
    idleTimeoutMillis: 30000, // close idle connections after 30s
    connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
    if (process.env.NODE_ENV !== 'test') {
        console.log('✅ PostgreSQL connected');
    }
});

pool.on('error', (err) => {
    console.error('❌ Unexpected idle PostgreSQL client error:', err.message);
});

/**
 * Execute a parameterized query
 * @param {string} text - SQL query string
 * @param {Array}  params - Query parameters
 */
const query = (text, params) => pool.query(text, params);

/**
 * Get a client from the pool (for transactions)
 */
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
