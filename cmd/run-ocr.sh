#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "🚀 Starting OCR service..."

cd ocr
docker compose up --build -d

echo "✅ OCR service started on http://localhost:8002"
echo ""
echo "To view logs: cd ocr && docker compose logs -f"
echo "To stop: cd ocr && docker compose down"
