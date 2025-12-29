#!/bin/bash

echo "🚀 Starting local PostgreSQL database..."

# Check if port 5432 is already in use and stop any existing database containers
echo "🔍 Checking for existing database containers..."

# Stop containers from main docker-compose.yml (try regardless, ignore errors)
echo "🛑 Stopping database from main docker-compose.yml (if running)..."
docker-compose stop db 2>/dev/null || true
docker-compose rm -f db 2>/dev/null || true

# Stop containers from database/docker-compose.yml (try regardless, ignore errors)
echo "🛑 Stopping database from database/docker-compose.yml (if running)..."
docker-compose -f database/docker-compose.yml down 2>/dev/null || true

# Also check for any containers using port 5432 and stop them
PORT_CONTAINERS=$(docker ps -a --filter "publish=5432" --format "{{.ID}} {{.Names}}" 2>/dev/null || true)
if [ ! -z "$PORT_CONTAINERS" ]; then
    echo "🛑 Stopping containers using port 5432..."
    echo "$PORT_CONTAINERS" | while read id name; do
        if [ ! -z "$id" ] && [ "$id" != "CONTAINER" ]; then
            echo "  Stopping $name ($id)..."
            docker stop "$id" 2>/dev/null || true
            docker rm "$id" 2>/dev/null || true
        fi
    done
fi

echo "✅ Cleanup complete"
sleep 1

# Start the database service from the main docker-compose.yml
docker-compose up -d db

# Follow logs to show initialization
echo "📋 Database initialization logs:"
docker-compose logs -f db &
LOG_PID=$!

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10

# Check if database is accessible
if docker-compose exec -T db pg_isready -U postgres -d willitship >/dev/null 2>&1; then
    # Stop following logs
    kill $LOG_PID 2>/dev/null || true

    echo ""
    echo "✅ PostgreSQL is running!"
    echo ""
    echo "📊 Connection Details:"
    echo "  Host: localhost"
    echo "  Port: 5432"
    echo "  Database: willitship"
    echo "  User: postgres"
    echo "  Password: postgres123"
    echo ""
    echo "🗄️  Tables created:"
    docker-compose exec -T db psql -U postgres -d willitship -c "\dt"
else
    echo "❌ PostgreSQL failed to start properly"
    docker-compose logs db
    exit 1
fi
