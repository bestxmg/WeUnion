#!/bin/bash

# WeChat-like App Deployment Script
set -e

echo "🚀 Starting WeChat-like App Deployment..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Function to use correct docker compose command
docker_compose() {
    if command -v docker-compose &> /dev/null; then
        docker-compose "$@"
    else
        docker compose "$@"
    fi
}

echo "📦 Building and starting containers..."

# Stop existing containers if running
docker_compose down

# Build and start containers
docker_compose up --build -d

echo "⏳ Waiting for services to start..."
sleep 10

# Check if services are running
if docker_compose ps | grep -q "Up"; then
    echo "✅ Services are running!"
    echo ""
    echo "🌐 Application URLs:"
    echo "   Frontend: http://localhost:3000"
    echo "   Backend API: http://localhost:5000"
    echo ""
    echo "📝 Default login credentials:"
    echo "   Username: admin"
    echo "   Password: admin123"
    echo ""
    echo "🔧 Useful commands:"
    echo "   View logs: docker-compose logs -f"
    echo "   Stop services: docker-compose down"
    echo "   Restart services: docker-compose restart"
    echo ""
else
    echo "❌ Some services failed to start. Check logs with: docker-compose logs"
    exit 1
fi

echo "🎉 Deployment completed successfully!"