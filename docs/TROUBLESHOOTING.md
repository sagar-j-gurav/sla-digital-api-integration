# Troubleshooting Guide - Database Migrations

## Migration Error Fix

If you encounter the error `relation "operators" does not exist` when running migrations, this has been fixed in the latest version.

### Solution

1. **Pull the latest changes:**
```bash
git pull origin main
```

2. **Option 1: Reset the database (recommended for development)**
```bash
npm run migrate:reset
```
This will:
- Drop all existing tables
- Re-run all migrations fresh
- Create all tables properly

3. **Option 2: Fix manually if you have existing data**
```bash
# Connect to PostgreSQL
psql -U postgres -d sla_digital

# Check if any tables exist
\dt

# If partial tables exist, drop them
DROP TABLE IF EXISTS migrations CASCADE;
DROP TABLE IF EXISTS operators CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;
DROP TABLE IF EXISTS operation_audit CASCADE;

# Exit psql
\q

# Now run migrations
npm run migrate
```

## Common Issues and Solutions

### 1. Database Connection Failed

**Error:** `ECONNREFUSED ::1:5432`

**Solution:**
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# If not running, start it:
docker run --name sla-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=sla_digital \
  -p 5432:5432 \
  -d postgres:14

# Or if using local PostgreSQL:
sudo systemctl start postgresql
```

### 2. Authentication Failed

**Error:** `password authentication failed for user "postgres"`

**Solution:**
Update your `.env` file with correct credentials:
```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/sla_digital
```

### 3. Database Does Not Exist

**Error:** `database "sla_digital" does not exist`

**Solution:**
```bash
# Create the database
psql -U postgres -c "CREATE DATABASE sla_digital;"

# Or using createdb
createdb -U postgres sla_digital
```

### 4. Permission Denied

**Error:** `permission denied for schema public`

**Solution:**
```sql
-- Grant permissions
psql -U postgres -d sla_digital

GRANT ALL PRIVILEGES ON DATABASE sla_digital TO postgres;
GRANT ALL ON SCHEMA public TO postgres;
\q
```

### 5. Migration Already Executed

**Error:** `duplicate key value violates unique constraint`

**Solution:**
```bash
# Check migration status
psql -U postgres -d sla_digital -c "SELECT * FROM migrations;"

# If you need to re-run, reset:
npm run migrate:reset
```

## Migration Commands

```bash
# Run all pending migrations
npm run migrate

# Rollback last migration
npm run migrate:rollback

# Reset database (drops all tables and re-runs migrations)
npm run migrate:reset
```

## Database Health Check

```bash
# Test database connection
psql -U postgres -d sla_digital -c "SELECT NOW();"

# Check all tables
psql -U postgres -d sla_digital -c "\dt"

# Check migration status
psql -U postgres -d sla_digital -c "SELECT * FROM migrations;"

# Count records
psql -U postgres -d sla_digital -c "
  SELECT 
    'operators' as table_name, COUNT(*) as count FROM operators
  UNION ALL
    SELECT 'transactions', COUNT(*) FROM transactions
  UNION ALL
    SELECT 'subscriptions', COUNT(*) FROM subscriptions
  UNION ALL
    SELECT 'webhook_events', COUNT(*) FROM webhook_events;
"
```

## Clean Start Instructions

For a completely clean start:

```bash
# 1. Stop any running servers
# Press Ctrl+C if server is running

# 2. Reset database
npm run migrate:reset

# 3. Start fresh
npm start

# 4. Test health
curl http://localhost:3000/health
```

## Docker PostgreSQL Management

```bash
# Stop container
docker stop sla-postgres

# Remove container
docker rm sla-postgres

# Start fresh container
docker run --name sla-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=sla_digital \
  -p 5432:5432 \
  -d postgres:14

# View logs
docker logs sla-postgres

# Execute psql inside container
docker exec -it sla-postgres psql -U postgres -d sla_digital
```

## Environment Variables Check

Ensure your `.env` file has correct database configuration:

```env
# Required database variables
DATABASE_URL=postgresql://postgres:password@localhost:5432/sla_digital

# Or individual variables
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=password
PGDATABASE=sla_digital
```

## Still Having Issues?

1. **Check logs:**
```bash
tail -f logs/sla-digital.log
```

2. **Enable debug mode:**
```env
# In .env file
ENABLE_DEBUG_LOGGING=true
LOG_LEVEL=debug
```

3. **Create an issue:**
https://github.com/sagar-j-gurav/sla-digital-api-integration/issues

---

*Last updated: September 18, 2025*