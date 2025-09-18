/**
 * PostgreSQL Database Connection Manager
 * Handles connection pooling and database operations
 */

const { Pool } = require('pg');
require('dotenv').config();

let pool;

/**
 * Create PostgreSQL connection pool
 */
function createPool() {
  const config = {
    connectionString: process.env.DATABASE_URL,
    max: parseInt(process.env.DB_POOL_MAX || 10),
    min: parseInt(process.env.DB_POOL_MIN || 2),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || 60000),
    idleTimeoutMillis: 30000,
  };

  // If DATABASE_URL is not set, use individual PG* variables
  if (!config.connectionString) {
    config.host = process.env.PGHOST || 'localhost';
    config.port = parseInt(process.env.PGPORT || 5432);
    config.user = process.env.PGUSER || 'postgres';
    config.password = process.env.PGPASSWORD;
    config.database = process.env.PGDATABASE || 'sla_digital';
    delete config.connectionString;
  }

  return new Pool(config);
}

/**
 * Connect to PostgreSQL database
 */
async function connectDB() {
  try {
    if (!pool) {
      pool = createPool();
      
      // Test the connection
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      console.log('PostgreSQL connected successfully');
      
      // Handle pool errors
      pool.on('error', (err, client) => {
        console.error('Unexpected database error:', err);
      });
    }
    return pool;
  } catch (error) {
    console.error('PostgreSQL connection error:', error);
    throw error;
  }
}

/**
 * Get database connection pool
 */
async function getDB() {
  if (!pool) {
    await connectDB();
  }
  return pool;
}

/**
 * Close database connections
 */
async function closeDB() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('PostgreSQL connections closed');
  }
}

/**
 * Execute a query with automatic connection management
 */
async function query(text, params) {
  const db = await getDB();
  return db.query(text, params);
}

/**
 * Execute a transaction
 */
async function transaction(callback) {
  const db = await getDB();
  const client = await db.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  connectDB,
  getDB,
  closeDB,
  query,
  transaction
};