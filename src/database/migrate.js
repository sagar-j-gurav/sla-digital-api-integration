/**
 * Database Migration Runner
 * Executes SQL migrations for PostgreSQL
 */

const fs = require('fs').promises;
const path = require('path');
const { getDB } = require('./connection');

/**
 * Create migrations table if not exists
 */
async function createMigrationsTable() {
  const db = await getDB();
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Check if migration has been executed
 */
async function isMigrationExecuted(filename) {
  const db = await getDB();
  const result = await db.query(
    'SELECT * FROM migrations WHERE filename = $1',
    [filename]
  );
  return result.rows.length > 0;
}

/**
 * Mark migration as executed
 */
async function markMigrationExecuted(filename) {
  const db = await getDB();
  await db.query(
    'INSERT INTO migrations (filename) VALUES ($1)',
    [filename]
  );
}

/**
 * Run all pending migrations
 */
async function runMigrations() {
  console.log('Running database migrations...');
  
  try {
    const db = await getDB();
    
    // Create migrations table
    await createMigrationsTable();
    
    // Get all migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
    
    for (const file of sqlFiles) {
      // Check if already executed
      const executed = await isMigrationExecuted(file);
      if (executed) {
        console.log(`Skipping ${file} (already executed)`);
        continue;
      }
      
      console.log(`Executing ${file}...`);
      
      // Read and execute migration
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, 'utf8');
      
      // Split by semicolons and execute each statement
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      for (const statement of statements) {
        if (statement.length > 0) {
          await db.query(statement);
        }
      }
      
      // Mark as executed
      await markMigrationExecuted(file);
      console.log(`Completed ${file}`);
    }
    
    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

/**
 * Rollback last migration
 */
async function rollbackLastMigration() {
  console.log('Rolling back last migration...');
  
  try {
    const db = await getDB();
    
    // Get last executed migration
    const result = await db.query(
      'SELECT * FROM migrations ORDER BY executed_at DESC LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      console.log('No migrations to rollback');
      return;
    }
    
    const migration = result.rows[0];
    console.log(`Rolling back ${migration.filename}...`);
    
    // Look for corresponding rollback file
    const rollbackFile = migration.filename.replace('.sql', '.rollback.sql');
    const rollbackPath = path.join(__dirname, 'migrations', rollbackFile);
    
    try {
      const sql = await fs.readFile(rollbackPath, 'utf8');
      await db.query(sql);
      
      // Remove from migrations table
      await db.query('DELETE FROM migrations WHERE id = $1', [migration.id]);
      
      console.log(`Rollback completed for ${migration.filename}`);
    } catch (error) {
      console.error(`No rollback file found: ${rollbackFile}`);
      console.error('Manual rollback may be required');
    }
  } catch (error) {
    console.error('Rollback error:', error);
    throw error;
  }
}

// Run migrations if called directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'rollback') {
    rollbackLastMigration()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    runMigrations()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}

module.exports = { runMigrations, rollbackLastMigration };