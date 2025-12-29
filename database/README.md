# Local PostgreSQL Database

This directory contains a local PostgreSQL setup for the WillItShip application.

## Quick Start

```bash
# Start the database (from project root)
./cmd/run-database.sh

# Check status
docker-compose ps db

# Verify schemas were created
docker-compose exec db psql -U postgres -d willitship -c "\dt"
```

## Services

- **PostgreSQL**: Main database on port 5432
- **pgAdmin**: Web interface on port 5050 (admin@willitship.com / admin123)

## Connection Details

- **Host**: localhost
- **Port**: 5432
- **Database**: willitship
- **User**: postgres
- **Password**: postgres123

## Connection String

```
postgresql://postgres:postgres123@localhost:5432/willitship
```

## Management

```bash
# Stop database (from project root)
./cmd/stop-database.sh

# View logs
docker-compose logs -f db

# Manual control (from project root)
docker-compose up -d db     # Start
docker-compose down db     # Stop
```

## Optional: pgAdmin Web Interface

For database administration, you can start pgAdmin separately:

```bash
# Start pgAdmin only
cd database && docker-compose up -d pgadmin

# Access at: http://localhost:5050
# Email: admin@willitship.com
# Password: admin123
```

## Schema Management

Database schemas are automatically created when the database starts for the first time using `init.sql`:

- **`bill_of_ladings`** - Stores bill of lading information and state
- **`offers`** - Stores funding offers from investors

Both tables include:
- Proper indexes for performance
- Automatic `updated_at` timestamp triggers
- All constraints and defaults matching the SQLAlchemy models

## Data Persistence

Database data is persisted in a Docker volume (`postgres_data`) and will survive container restarts.
