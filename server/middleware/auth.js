const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Cache for token validations to reduce database queries
const tokenCache = new Map();
const CACHE_DURATION = 60000; // 1 minute

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    // Check cache first
    const cacheKey = token;
    const cached = tokenCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      req.user = cached.user;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists and session is valid
    const userResult = await db.query(
      'SELECT u.*, s.expires_at FROM users u LEFT JOIN user_sessions s ON u.id = s.user_id WHERE u.id = $1 AND s.token_hash = $2',
      [decoded.userId, token]
    );

    if (userResult.rows.length === 0) {
      tokenCache.delete(cacheKey); // Remove from cache
      return res.status(401).json({ error: 'Invalid token.' });
    }

    const user = userResult.rows[0];
    
    // Check if session has expired
    if (user.expires_at && new Date() > new Date(user.expires_at)) {
      // Clean up expired session
      await db.query('DELETE FROM user_sessions WHERE user_id = $1 AND token_hash = $2', [user.id, token]);
      tokenCache.delete(cacheKey); // Remove from cache
      return res.status(401).json({ error: 'Session expired.' });
    }

    const userInfo = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      status: user.status
    };

    // Cache the result
    tokenCache.set(cacheKey, {
      user: userInfo,
      timestamp: Date.now()
    });

    req.user = userInfo;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Invalid token.' });
  }
};

// Optional auth middleware (doesn't block if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      // Use cached result if available
      const cacheKey = token;
      const cached = tokenCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        req.user = cached.user;
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const userResult = await db.query(
        'SELECT u.* FROM users u LEFT JOIN user_sessions s ON u.id = s.user_id WHERE u.id = $1 AND s.token_hash = $2 AND s.expires_at > NOW()',
        [decoded.userId, token]
      );

      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        const userInfo = {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
          status: user.status
        };

        // Cache the result
        tokenCache.set(cacheKey, {
          user: userInfo,
          timestamp: Date.now()
        });

        req.user = userInfo;
      }
    }

    next();
  } catch (error) {
    // Don't block if optional auth fails
    next();
  }
};

// Clean up expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of tokenCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      tokenCache.delete(key);
    }
  }
}, CACHE_DURATION);

module.exports = { authMiddleware, optionalAuth };