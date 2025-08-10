const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const contactRoutes = require('./routes/contacts');
const groupRoutes = require('./routes/groups');
const momentRoutes = require('./routes/moments');
const socketHandler = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: function (origin, callback) {
      // Allow requests with no origin
      if (!origin) return callback(null, true);
      
      if (process.env.NODE_ENV === 'production') {
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
        return callback(null, allowedOrigins.indexOf(origin) !== -1);
      } else {
        // In development, allow localhost and local network IPs
        const allowedPatterns = [
          /^http:\/\/localhost:\d+$/,
          /^http:\/\/127\.0\.0\.1:\d+$/,
          /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
          /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
          /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+:\d+$/
        ];
        
        const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));
        return callback(null, isAllowed);
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Security middleware
app.use(helmet());

// Rate limiting - more lenient in development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // More requests allowed in development
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for development environments from local IPs
    if (process.env.NODE_ENV !== 'production') {
      const ip = req.ip || req.connection.remoteAddress;
      const localIPs = ['127.0.0.1', '::1', 'localhost'];
      const isLocalNetwork = ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.');
      return localIPs.includes(ip) || isLocalNetwork;
    }
    return false;
  }
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (process.env.NODE_ENV === 'production') {
      // In production, only allow specific origins
      const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      } else {
        return callback(new Error('Not allowed by CORS'));
      }
    } else {
      // In development, allow localhost and local network IPs
      const allowedPatterns = [
        /^http:\/\/localhost:\d+$/,
        /^http:\/\/127\.0\.0\.1:\d+$/,
        /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
        /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
        /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+:\d+$/
      ];
      
      const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));
      if (isAllowed) {
        return callback(null, true);
      } else {
        return callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/moments', momentRoutes);

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Socket.IO handling
socketHandler(io);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`💾 Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
});