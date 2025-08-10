const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Track recent login attempts to detect loops
const recentLogins = new Map();
const LOGIN_COOLDOWN = 2000; // 2 seconds

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;

    // Validation
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: 'Username, password, and display name are required' });
    }

    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'Username must be between 3 and 50 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    if (displayName.length < 1 || displayName.length > 100) {
      return res.status(400).json({ error: 'Display name must be between 1 and 100 characters' });
    }

    // Check if username already exists
    const existingUser = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const userResult = await db.query(
      'INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, username, display_name, created_at',
      [username, passwordHash, displayName]
    );

    const user = userResult.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Store session
    await db.query(
      'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: null,
        status: 'online'
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    console.log(`🔐 Login attempt for user: ${username} from IP: ${clientIP}`);

    // Check for recent login attempts from this IP/user combination to detect loops
    const loginKey = `${username}_${clientIP}`;
    const lastLogin = recentLogins.get(loginKey);
    const now = Date.now();
    
    if (lastLogin && (now - lastLogin) < LOGIN_COOLDOWN) {
      console.log(`⚠️ Rate limiting login attempt for ${username} (too soon: ${now - lastLogin}ms)`);
      return res.status(429).json({ error: 'Too many login attempts. Please wait before trying again.' });
    }
    
    recentLogins.set(loginKey, now);

    // Validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user and check password
    const userResult = await db.query(
      'SELECT id, username, password_hash, display_name, avatar_url, status FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Clean up old sessions for this user to prevent session buildup
    await db.query('DELETE FROM user_sessions WHERE user_id = $1 AND expires_at < NOW()', [user.id]);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Store session
    await db.query(
      'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );

    // Update user status to online
    await db.query('UPDATE users SET status = $1 WHERE id = $2', ['online', user.id]);

    console.log(`✅ Login successful for user: ${username}`);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        status: 'online'
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clean up old login attempts periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentLogins.entries()) {
    if (now - timestamp > LOGIN_COOLDOWN * 5) {
      recentLogins.delete(key);
    }
  }
}, LOGIN_COOLDOWN * 2);

// Logout user
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    // Remove session
    await db.query('DELETE FROM user_sessions WHERE user_id = $1 AND token_hash = $2', [req.user.id, token]);
    
    // Update user status to offline
    await db.query('UPDATE users SET status = $1 WHERE id = $2', ['offline', req.user.id]);

    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userResult = await db.query(
      'SELECT id, username, display_name, avatar_url, status, bio, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      status: user.status,
      bio: user.bio,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token
router.get('/verify', authMiddleware, (req, res) => {
  res.json({ 
    valid: true, 
    user: req.user 
  });
});

module.exports = router;