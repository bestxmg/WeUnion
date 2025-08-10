#!/bin/bash

# WeChat-like App Local Development Setup Script
set -e

echo "🚀 Setting up WeChat-like App for Local Development..."

# Get the local IP address
get_local_ip() {
    if command -v ip &> /dev/null; then
        # Linux
        ip route get 1 | sed -n 's/.*src \([0-9.]*\).*/\1/p'
    elif command -v ifconfig &> /dev/null; then
        # macOS/BSD
        ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}'
    elif command -v ipconfig &> /dev/null; then
        # Windows (if running in Git Bash or similar)
        ipconfig | grep -E "IPv4.*192\.168\.|IPv4.*10\.|IPv4.*172\." | head -1 | awk '{print $NF}'
    else
        echo "localhost"
    fi
}

LOCAL_IP=$(get_local_ip)
echo "📍 Detected local IP: $LOCAL_IP"

# Ask user for deployment type
echo ""
echo "Choose deployment option:"
echo "1) Localhost only (recommended for single computer)"
echo "2) Network access (access from other devices on your network)"
echo "3) Custom IP address"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        API_URL="http://localhost:5000"
        ACCESS_URL="http://localhost:3000"
        ;;
    2)
        API_URL="http://$LOCAL_IP:5000"
        ACCESS_URL="http://$LOCAL_IP:3000"
        ;;
    3)
        read -p "Enter your IP address: " CUSTOM_IP
        API_URL="http://$CUSTOM_IP:5000"
        ACCESS_URL="http://$CUSTOM_IP:3000"
        ;;
    *)
        echo "Invalid choice. Using localhost..."
        API_URL="http://localhost:5000"
        ACCESS_URL="http://localhost:3000"
        ;;
esac

echo "🔧 Configuring environment..."

# Create client .env file
cat > client/.env << EOF
# API Configuration
REACT_APP_API_URL=$API_URL
EOF

echo "✅ Created client/.env with API_URL: $API_URL"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "📦 Installing dependencies..."

# Install server dependencies
echo "Installing server dependencies..."
cd server
npm install
cd ..

# Install client dependencies
echo "Installing client dependencies..."
cd client
npm install
cd ..

echo "✅ Dependencies installed successfully!"

# Check if PostgreSQL is needed
if [[ ! -f "docker-compose.yml" ]] || ! command -v docker &> /dev/null; then
    echo ""
    echo "⚠️  Database Setup Required"
    echo "Make sure PostgreSQL is installed and running, then:"
    echo "  createdb wechat_db"
    echo "  psql -d wechat_db -f database/init.sql"
    echo ""
fi

echo "🎉 Setup complete!"
echo ""
echo "🚀 To start the application:"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd server"
echo "  npm run dev"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd client"
if [[ "$choice" == "2" ]] || [[ "$choice" == "3" ]]; then
    echo "  HOST=0.0.0.0 npm start"
else
    echo "  npm start"
fi
echo ""
echo "🌐 Access the application:"
echo "  Frontend: $ACCESS_URL"
echo "  Backend API: $API_URL"
echo ""
echo "📝 Default login credentials:"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
echo "ℹ️  For troubleshooting, see TROUBLESHOOTING.md"