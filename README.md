# WeChat-like Chat Application

A real-time chat application inspired by WeChat, built with React, Node.js, and PostgreSQL.

## ✨ Features

- Real-time messaging with Socket.IO
- User authentication with JWT
- Contact management (search users, friend requests)
- Group chats and direct messages
- File/image sharing
- Moments/Timeline feature
- User profiles with avatars

## 🚀 Quick Start (Local Dev)

```bash
# 1) Clone & enter
git clone <your-repo>
cd wechat-app

# 2) Setup (creates client/.env)
chmod +x setup.sh
./setup.sh

# 3) Install deps
npm install && cd client && npm install && cd ..

# 4) Start DB (ensure PostgreSQL on 5432)
# docker-compose up -d postgres  # optional

# 5) Run
npm run dev  # server:5000 + client:3000
```

## 🌍 Public Deployment (Internet users)

You can expose the app to the internet in two simple ways.

### Option A: ngrok (fastest)

1) Start backend (bind to 0.0.0.0 if remote):
```bash
NODE_ENV=production ALLOW_ALL_ORIGINS=true npm start
# or for dev: npm run server
```

2) Start frontend (point to public API):
- Set `client/.env`:
```
REACT_APP_API_URL=https://<your-ngrok-subdomain>.ngrok-free.app
```
- Then run:
```bash
cd client
npm start
```

3) Expose your backend with ngrok:
```bash
ngrok http 5000
# copy the HTTPS URL, e.g. https://abcd-12-34-56-78.ngrok-free.app
```

Notes:
- Backend CORS/Socket.IO will allow all origins when `ALLOW_ALL_ORIGINS=true`.
- For a tighter config, set `ALLOWED_ORIGINS=https://<your-ngrok>.ngrok-free.app` on the server.

### Option B: Docker (single host)

```bash
docker-compose up -d
# App will be at http://<host-ip>:3000, API at http://<host-ip>:5000
# docker-compose sets ALLOW_ALL_ORIGINS=true for public/demo access
```

If you want to host the frontend only (static hosting) and point it to a remote API:
- Build client: `cd client && npm run build`
- Serve `client/build` via any static host, and set `REACT_APP_API_URL` during build if needed

## 🔧 Environment

Server `.env` (see `.env.example`):
```
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wechat_db
DB_USER=wechat_user
DB_PASSWORD=wechat_password
JWT_SECRET=change_me
# CORS
ALLOW_ALL_ORIGINS=false
ALLOWED_ORIGINS=
```

Client `.env` (see `client/.env.example`):
```
REACT_APP_API_URL=http://<server-host>:5000
```

## 📋 Database Setup

- Ensure PostgreSQL is running (local or Docker)
- Initialize schema if needed: `psql -d wechat_db -f database/init.sql`

## 🧪 Development Tips

- If exposing over LAN, start client with: `HOST=0.0.0.0 npm start`
- The app auto-detects backend URL unless `REACT_APP_API_URL` is set
- Socket reconnection and rate limits are tuned for dev

## 🔧 Troubleshooting

- CORS issues: set `ALLOW_ALL_ORIGINS=true` temporarily (demo only) or configure `ALLOWED_ORIGINS`
- Socket connection loops: handled by server; check logs
- 401s: token may have expired; re-login

## 🛠 Tech Stack

- Frontend: React, Material-UI, Socket.IO Client
- Backend: Node.js, Express, Socket.IO
- Database: PostgreSQL
- Auth: JWT with bcrypt
- Deployment: Docker, Docker Compose, ngrok

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