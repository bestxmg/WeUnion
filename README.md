# WeUnion 💬

> A real-time chat application inspired by WeChat, built with React, Node.js, and PostgreSQL. Features modern UI, real-time messaging, and comprehensive user management.

## 📋 Table of Contents

- [✨ Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [🌍 Public Deployment](#-public-deployment)
- [🔧 Environment Setup](#-environment-setup)
- [📋 Database Setup](#-database-setup)
- [🧪 Development Tips](#-development-tips)
- [🔧 Troubleshooting](#-troubleshooting)
- [🛠 Tech Stack](#-tech-stack)
- [📁 Project Structure](#-project-structure)
- [🤝 Contributing](#-contributing)
- [📝 License](#-license)

## ✨ Features

- **💬 Real-time Messaging**: Instant messaging with Socket.IO
- **🔐 User Authentication**: Secure JWT-based authentication
- **👥 Contact Management**: Search users, send friend requests
- **👨‍👩‍👧‍👦 Group Chats**: Create and manage group conversations
- **📱 Direct Messages**: Private one-on-one conversations
- **📁 File Sharing**: Share images and documents
- **📸 Moments/Timeline**: Social media-style posts and updates
- **👤 User Profiles**: Customizable profiles with avatars
- **🔍 User Search**: Find and connect with other users
- **📱 Responsive Design**: Works on desktop and mobile devices

## 🚀 Quick Start (Local Development)

### Prerequisites
- **Node.js**: 16+ with npm
- **PostgreSQL**: 12+ running on port 5432
- **Git**: For cloning the repository

### Setup Steps

1. **Clone & Enter Repository**
   ```bash
   git clone <your-repo>
   cd wechat-app
   ```

2. **Setup Environment**
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

3. **Install Dependencies**
   ```bash
   npm install && cd client && npm install && cd ..
   ```

4. **Start Database** (ensure PostgreSQL is running on port 5432)
   ```bash
   # Optional: Use Docker for PostgreSQL
   docker-compose up -d postgres
   ```

5. **Run Application**
   ```bash
   npm run dev  # Server:5000 + Client:3000
   ```

### Access Points
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Database**: localhost:5432

## 🌍 Public Deployment (Internet Access)

You can expose the app to the internet in several ways:

### Option A: ngrok (Fastest Method)

1) **Start Backend** (bind to 0.0.0.0 for remote access):
   ```bash
   NODE_ENV=production ALLOW_ALL_ORIGINS=true npm start
   # or for development: npm run server
   ```

2) **Configure Frontend** (point to public API):
   - Set `client/.env`:
     ```env
     REACT_APP_API_URL=https://<your-ngrok-subdomain>.ngrok-free.app
     ```
   - Start frontend:
     ```bash
     cd client
     npm start
     ```

3) **Expose Backend with ngrok**:
   ```bash
   ngrok http 5000
   # Copy the HTTPS URL, e.g., https://abcd-12-34-56-78.ngrok-free.app
   ```

**Notes:**
- Backend CORS/Socket.IO allows all origins when `ALLOW_ALL_ORIGINS=true`
- For tighter security, set `ALLOWED_ORIGINS=https://<your-ngrok>.ngrok-free.app`

### Option B: Docker (Single Host)

```bash
docker-compose up -d
# App available at http://<host-ip>:3000, API at http://<host-ip>:5000
# docker-compose sets ALLOW_ALL_ORIGINS=true for public/demo access
```

### Option C: Static Hosting (Frontend Only)

If you want to host only the frontend and point to a remote API:
```bash
# Build client
cd client && npm run build

# Serve client/build via any static host
# Set REACT_APP_API_URL during build if needed
```

## 🔧 Environment Setup

### Server Environment Variables

Create a `.env` file in the root directory (see `.env.example`):

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wechat_db
DB_USER=wechat_user
DB_PASSWORD=change_me_secure_password

# JWT Configuration
JWT_SECRET=change_me_to_very_secure_random_string
JWT_EXPIRES_IN=7d

# CORS Configuration
ALLOW_ALL_ORIGINS=false
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
```

### Client Environment Variables

Create a `client/.env` file (see `client/.env.example`):

```env
# API Configuration
REACT_APP_API_URL=http://localhost:5000

# Feature Flags
REACT_APP_ENABLE_DEBUG=true
REACT_APP_MAX_FILE_SIZE=10485760

# External Services (optional)
REACT_APP_GOOGLE_ANALYTICS_ID=GA_MEASUREMENT_ID
```

## 📋 Database Setup

### PostgreSQL Installation

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Windows:**
Download and install from [PostgreSQL official website](https://www.postgresql.org/download/windows/)

### Database Initialization

1. **Create Database and User**:
   ```bash
   sudo -u postgres psql
   
   CREATE DATABASE wechat_db;
   CREATE USER wechat_user WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE wechat_db TO wechat_user;
   \q
   ```

2. **Initialize Schema**:
   ```bash
   psql -d wechat_db -U wechat_user -f database/init.sql
   ```

3. **Verify Connection**:
   ```bash
   psql -d wechat_db -U wechat_user -h localhost
   ```

## 🧪 Development Tips

### Local Development
- **LAN Access**: Start client with `HOST=0.0.0.0 npm start` for network access
- **Auto-detection**: App automatically detects backend URL unless `REACT_APP_API_URL` is set
- **Hot Reload**: Both frontend and backend support hot reloading
- **Debug Mode**: Enable debug logging with `DEBUG=* npm run dev`

### Performance Optimization
- **Socket Reconnection**: Optimized for development with automatic reconnection
- **Rate Limiting**: Built-in rate limiting for API endpoints
- **Caching**: Redis caching for frequently accessed data (optional)
- **Compression**: Gzip compression for static assets

### Testing
```bash
# Run backend tests
npm test

# Run frontend tests
cd client && npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

## 🔧 Troubleshooting

### Common Issues

1. **CORS Issues**
   - **Symptom**: Browser console shows CORS errors
   - **Solution**: Set `ALLOW_ALL_ORIGINS=true` temporarily or configure `ALLOWED_ORIGINS`
   - **Prevention**: Use proper CORS configuration for production

2. **Socket Connection Loops**
   - **Symptom**: Continuous connection attempts in console
   - **Solution**: Check server logs for connection errors
   - **Prevention**: Implement proper error handling and reconnection logic

3. **Authentication Errors (401)**
   - **Symptom**: API calls return 401 Unauthorized
   - **Solution**: Token may have expired; re-login required
   - **Prevention**: Implement token refresh mechanism

4. **Database Connection Issues**
   - **Symptom**: Server fails to start with database errors
   - **Solution**: Verify PostgreSQL is running and credentials are correct
   - **Prevention**: Use connection pooling and proper error handling

### Debug Mode

Enable detailed logging for troubleshooting:
```bash
# Backend debug
DEBUG=* npm run dev

# Frontend debug
cd client && REACT_APP_DEBUG=true npm start

# Database debug
psql -d wechat_db -U wechat_user -c "SELECT version();"
```

## 🛠 Tech Stack

### Frontend
- **React 18+**: Modern React with hooks and functional components
- **Material-UI**: Professional UI components and theming
- **Socket.IO Client**: Real-time communication
- **React Router**: Client-side routing
- **Axios**: HTTP client for API calls

### Backend
- **Node.js**: JavaScript runtime environment
- **Express.js**: Web application framework
- **Socket.IO**: Real-time bidirectional communication
- **JWT**: JSON Web Token authentication
- **bcrypt**: Password hashing and verification

### Database
- **PostgreSQL**: Primary database
- **Redis**: Caching and session storage (optional)
- **Sequelize**: Object-Relational Mapping (ORM)

### Development & Deployment
- **Docker**: Containerization
- **Docker Compose**: Multi-container orchestration
- **ngrok**: Local development tunneling
- **ESLint**: Code quality and consistency
- **Prettier**: Code formatting

## 📁 Project Structure

```
wechat-app/
├── client/                 # React frontend application
│   ├── public/            # Static assets
│   ├── src/               # Source code
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Application pages
│   │   ├── services/      # API and external services
│   │   ├── utils/         # Utility functions
│   │   └── App.js         # Main application component
│   ├── package.json       # Frontend dependencies
│   └── .env.example       # Frontend environment template
├── server/                 # Node.js backend application
│   ├── config/            # Configuration files
│   ├── middleware/        # Express middleware
│   ├── routes/            # API route handlers
│   ├── socket/            # Socket.IO event handlers
│   ├── index.js           # Server entry point
│   └── package.json       # Backend dependencies
├── database/               # Database schema and migrations
│   └── init.sql           # Initial database setup
├── uploads/                # File upload storage
├── scripts/                # Utility and deployment scripts
├── setup.sh                # Environment setup script
├── deploy.sh               # Docker deployment script
├── docker-compose.yml      # Docker services configuration
├── Dockerfile              # Backend container definition
└── README.md               # Project documentation
```

## 🤝 Contributing

We welcome contributions from the community! Here's how to get started:

### 1. **Fork the Repository**
- Click the "Fork" button on GitHub
- Clone your forked repository locally

### 2. **Setup Development Environment**
```bash
git clone https://github.com/yourusername/wechat-app.git
cd wechat-app
npm install && cd client && npm install && cd ..
```

### 3. **Create Feature Branch**
```bash
git checkout -b feature/amazing-feature
```

### 4. **Make Changes**
- Follow the existing code style
- Add tests for new functionality
- Update documentation as needed

### 5. **Submit Pull Request**
- Push your branch: `git push origin feature/amazing-feature`
- Create a pull request with detailed description
- Ensure all tests pass

### Development Guidelines
- **Code Style**: Follow ESLint and Prettier configuration
- **Testing**: Maintain test coverage above 80%
- **Documentation**: Update README and inline comments
- **Commits**: Use conventional commit messages

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Happy chatting! 💬✨**