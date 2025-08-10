const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Multer configuration for avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/avatars/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userResult = await db.query(
      'SELECT id, username, display_name, avatar_url, status, bio, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(userResult.rows[0]);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { displayName, bio, status } = req.body;
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (displayName !== undefined) {
      if (displayName.length < 1 || displayName.length > 100) {
        return res.status(400).json({ error: 'Display name must be between 1 and 100 characters' });
      }
      updateFields.push(`display_name = $${paramCount++}`);
      values.push(displayName);
    }

    if (bio !== undefined) {
      if (bio.length > 500) {
        return res.status(400).json({ error: 'Bio must be less than 500 characters' });
      }
      updateFields.push(`bio = $${paramCount++}`);
      values.push(bio);
    }

    if (status !== undefined) {
      if (!['online', 'offline', 'away', 'busy'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updateFields.push(`status = $${paramCount++}`);
      values.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.user.id);

    const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING id, username, display_name, avatar_url, status, bio`;

    const result = await db.query(query, values);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Upload avatar
router.post('/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    const result = await db.query(
      'UPDATE users SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING avatar_url',
      [avatarUrl, req.user.id]
    );

    res.json({ avatarUrl: result.rows[0].avatar_url });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Search users
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    if (query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const users = await db.query(`
      SELECT 
        u.id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.status,
        CASE 
          WHEN c.id IS NOT NULL THEN c.status
          ELSE null
        END as contact_status
      FROM users u
      LEFT JOIN contacts c ON (
        (c.user_id = $2 AND c.contact_id = u.id) OR
        (c.user_id = u.id AND c.contact_id = $2)
      )
      WHERE u.id != $2 
      AND (u.username ILIKE $1 OR u.display_name ILIKE $1)
      ORDER BY 
        CASE WHEN c.status = 'accepted' THEN 1 ELSE 2 END,
        u.display_name
      LIMIT $3
    `, [`%${query}%`, req.user.id, limit]);

    res.json(users.rows);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get user by ID (for contact details)
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const userResult = await db.query(`
      SELECT 
        u.id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.status,
        u.bio,
        u.created_at,
        CASE 
          WHEN c.id IS NOT NULL THEN c.status
          ELSE null
        END as contact_status
      FROM users u
      LEFT JOIN contacts c ON (
        (c.user_id = $2 AND c.contact_id = u.id) OR
        (c.user_id = u.id AND c.contact_id = $2)
      )
      WHERE u.id = $1
    `, [userId, req.user.id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Don't show full profile if not a contact (privacy)
    if (user.contact_status !== 'accepted' && user.id !== req.user.id) {
      res.json({
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        status: user.status,
        contact_status: user.contact_status
      });
    } else {
      res.json(user);
    }
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Get online status of multiple users
router.post('/status', authMiddleware, async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required' });
    }

    // Only allow checking status of contacts
    const statusResult = await db.query(`
      SELECT DISTINCT u.id, u.status
      FROM users u
      JOIN contacts c ON (
        (c.user_id = $1 AND c.contact_id = u.id) OR
        (c.user_id = u.id AND c.contact_id = $1)
      )
      WHERE u.id = ANY($2) AND c.status = 'accepted'
    `, [req.user.id, userIds]);

    res.json(statusResult.rows);
  } catch (error) {
    console.error('Get user status error:', error);
    res.status(500).json({ error: 'Failed to fetch user status' });
  }
});

module.exports = router;