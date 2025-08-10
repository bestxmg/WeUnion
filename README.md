# WeChat-like Chat Application

A real-time chat application inspired by WeChat, built with React, Node.js, and PostgreSQL.

## ✨ Features

- **Real-time messaging** with Socket.IO
- **User authentication** with JWT
- **Contact management** (search users, friend requests)
- **Group chats** and direct messages
- **File/image sharing**
- **Moments/Timeline** feature
- **User profiles** with avatars

## 🚀 Quick Start

```bash
# 1. Clone and setup
git clone <your-repo> && cd wechat-app

# 2. Setup environment (interactive script)
./setup.sh

# 3. Install dependencies
npm install && cd client && npm install && cd ..

# 4. Start PostgreSQL (ensure running on port 5432)

# 5. Start development servers
npm run dev        # Starts both backend and frontend
```

## 📋 Setup & Run

### 1. **Environment Setup**
Run the interactive setup script:
```bash
chmod +x setup.sh
./setup.sh
```

### 2. **Database Setup**
- Ensure PostgreSQL is running (local or Docker)
- Update `.env` with your database credentials:
```bash
DB_HOST=localhost          # or your Docker machine IP
DB_PORT=5432
DB_NAME=wechat_db
DB_USER=wechat_user
DB_PASSWORD=wechat_password
```

### 3. **Install Dependencies**
```bash
npm install
cd client && npm install && cd ..
```

### 4. **Start Development**
```bash
npm run dev    # Starts both backend (port 5000) and frontend (port 3000)
```

### 5. **Production Deployment**
```bash
chmod +x deploy.sh
./deploy.sh    # Docker deployment
```

## 🔧 Troubleshooting

### **Connection Loop Issues** ✅ **FIXED**
- **Problem**: Rapid Socket.IO connect/disconnect cycles
- **Solution**: Improved connection management with cooldowns and better cleanup
- **Signs**: Excessive "User connected/disconnected" logs

### **CORS Errors** ✅ **FIXED**
- **Problem**: `Access to XMLHttpRequest blocked by CORS policy`
- **Solution**: Auto-detection of local network IPs in development
- **Config**: Frontend auto-detects backend URL or uses `REACT_APP_API_URL`

### **Rate Limiting (429 errors)** ✅ **FIXED**
- **Problem**: `Too Many Requests` errors
- **Solution**: Relaxed rate limits for development and local IPs
- **Limits**: 1000 requests/15min in development, 100 in production

### **Add Contact Feature Not Working** ✅ **FIXED**
- **Problem**: Missing user search and friend request functionality
- **Solution**: Complete contacts management system implemented
- **Features**: Search users, send/accept/decline friend requests, manage contacts

### **PostgreSQL JSON Query Error** ✅ **FIXED**
- **Error**: `could not identify an equality operator for type json`
- **Solution**: Refactored queries to avoid JSON comparisons in ORDER BY clauses
- **Affected**: Conversations, messages, groups, moments queries

### **Missing manifest.json** ✅ **FIXED**
- **Problem**: `404 Not Found` for manifest.json
- **Solution**: Created proper web app manifest file

### **Remote PostgreSQL Setup**
If using PostgreSQL on another machine:
1. Update `DB_HOST` in `.env` to your PostgreSQL machine IP
2. Ensure PostgreSQL allows external connections:
   ```bash
   # postgresql.conf
   listen_addresses = '*'
   
   # pg_hba.conf
   host all all YOUR_APP_IP/32 md5
   ```
3. Ensure port 5432 is open in firewall

### **Network Access Issues**
- Frontend accessible at: `http://YOUR_IP:3000`
- Backend API at: `http://YOUR_IP:5000`
- Use `./setup.sh` to auto-configure network settings

## 🛠 Tech Stack

- **Frontend**: React, Material-UI, Socket.IO Client
- **Backend**: Node.js, Express, Socket.IO
- **Database**: PostgreSQL
- **Auth**: JWT with bcrypt
- **Deployment**: Docker, Docker Compose

## 📁 Project Structure

```
wechat-app/
├── client/           # React frontend
├── server/           # Node.js backend
├── database/         # SQL schema
├── uploads/          # File uploads
├── setup.sh          # Environment setup
├── deploy.sh         # Docker deployment
└── README.md
```

## 🔒 Security Features

- JWT authentication with session management
- Password hashing with bcrypt
- CORS protection
- Rate limiting
- Input validation and sanitization
- File upload restrictions

---

**Need help?** Check the troubleshooting section above or review the setup logs.