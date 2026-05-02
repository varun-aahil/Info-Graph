FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (required for psycopg and pgvector if building from source, though binaries are usually fine)
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    tesseract-ocr \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copy application code
# We copy the entire backend into /app/backend so it matches the package structure.
COPY . /app/backend

# Set pythonpath so backend.app.main can be imported
ENV PYTHONPATH=/app

# Expose port
EXPOSE 8000

# Start command
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
