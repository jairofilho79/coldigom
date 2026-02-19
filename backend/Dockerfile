FROM python:3.11-slim

WORKDIR /app

# Build argument for environment (dev/prod)
ARG ENVIRONMENT=prod
ENV ENVIRONMENT=${ENVIRONMENT}

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run migrations and start server
# Dev: with --reload for hot-reload
# Prod: without --reload for production
CMD ["sh", "-c", "alembic upgrade head && if [ \"$ENVIRONMENT\" = \"dev\" ]; then uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload; else uvicorn app.main:app --host 0.0.0.0 --port 8000; fi"]






