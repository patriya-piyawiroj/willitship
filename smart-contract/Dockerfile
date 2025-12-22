FROM python:3.12-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy API files
COPY api ./api

EXPOSE 8004

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8004"]
