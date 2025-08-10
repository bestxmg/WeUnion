const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Multer configuration for moment image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/moments/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'moment-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit per file
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get moments feed (user's contacts' moments)
router.get('/feed', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const moments = await db.query(`
      SELECT 
        m.id,
        m.content,
        m.images,
        m.location,
        m.privacy,
        m.created_at,
        u.id as user_id,
        u.username,
        u.display_name,
        u.avatar_url,
        (
          SELECT COUNT(*) FROM moment_likes ml WHERE ml.moment_id = m.id
        ) as like_count,
        (
          SELECT COUNT(*) FROM moment_comments mc WHERE mc.moment_id = m.id
        ) as comment_count,
        (
          SELECT CASE WHEN COUNT(*) > 0 THEN true ELSE false END 
          FROM moment_likes ml WHERE ml.moment_id = m.id AND ml.user_id = $1
        ) as is_liked_by_user
      FROM moments m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN contacts c ON (
        (c.user_id = $1 AND c.contact_id = u.id) OR
        (c.user_id = u.id AND c.contact_id = $1)
      )
      WHERE (
        -- User's own moments
        m.user_id = $1
        OR
        -- Contact's moments (if they are friends and privacy allows)
        (c.status = 'accepted' AND m.privacy IN ('public', 'friends'))
        OR
        -- Public moments from anyone
        (m.privacy = 'public' AND c.id IS NULL)
      )
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

    // Get recent comments for each moment separately
    const momentsWithComments = await Promise.all(
      moments.rows.map(async (moment) => {
        const commentsResult = await db.query(`
          SELECT 
            mc.id,
            mc.content,
            mc.created_at,
            cu.id as user_id,
            cu.username,
            cu.display_name,
            cu.avatar_url
          FROM moment_comments mc
          JOIN users cu ON mc.user_id = cu.id
          WHERE mc.moment_id = $1
          ORDER BY mc.created_at ASC
          LIMIT 3
        `, [moment.id]);

        return {
          ...moment,
          recent_comments: commentsResult.rows.map(comment => ({
            id: comment.id,
            content: comment.content,
            created_at: comment.created_at,
            user: {
              id: comment.user_id,
              username: comment.username,
              display_name: comment.display_name,
              avatar_url: comment.avatar_url
            }
          }))
        };
      })
    );

    res.json(momentsWithComments);
  } catch (error) {
    console.error('Get moments feed error:', error);
    res.status(500).json({ error: 'Failed to fetch moments feed' });
  }
});

// Get user's moments
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Check if requesting user can see this user's moments
    let privacyFilter = "m.privacy = 'public'";
    
    if (parseInt(userId) === req.user.id) {
      // User viewing their own moments - show all
      privacyFilter = "true";
    } else {
      // Check if users are contacts
      const contactCheck = await db.query(`
        SELECT status FROM contacts 
        WHERE ((user_id = $1 AND contact_id = $2) OR (user_id = $2 AND contact_id = $1))
        AND status = 'accepted'
      `, [req.user.id, userId]);

      if (contactCheck.rows.length > 0) {
        // They are contacts - can see friends and public moments
        privacyFilter = "m.privacy IN ('public', 'friends')";
      }
    }

    const moments = await db.query(`
      SELECT 
        m.id,
        m.content,
        m.images,
        m.location,
        m.privacy,
        m.created_at,
        u.id as user_id,
        u.username,
        u.display_name,
        u.avatar_url,
        (
          SELECT COUNT(*) FROM moment_likes ml WHERE ml.moment_id = m.id
        ) as like_count,
        (
          SELECT COUNT(*) FROM moment_comments mc WHERE mc.moment_id = m.id
        ) as comment_count,
        (
          SELECT CASE WHEN COUNT(*) > 0 THEN true ELSE false END 
          FROM moment_likes ml WHERE ml.moment_id = m.id AND ml.user_id = $2
        ) as is_liked_by_user
      FROM moments m
      JOIN users u ON m.user_id = u.id
      WHERE m.user_id = $1 AND ${privacyFilter}
      ORDER BY m.created_at DESC
      LIMIT $3 OFFSET $4
    `, [userId, req.user.id, limit, offset]);

    res.json(moments.rows);
  } catch (error) {
    console.error('Get user moments error:', error);
    res.status(500).json({ error: 'Failed to fetch user moments' });
  }
});

// Create new moment
router.post('/', authMiddleware, upload.array('images', 9), async (req, res) => {
  try {
    const { content, location, privacy = 'friends' } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required' });
    }

    if (content.length > 2000) {
      return res.status(400).json({ error: 'Content must be less than 2000 characters' });
    }

    if (!['public', 'friends', 'private'].includes(privacy)) {
      return res.status(400).json({ error: 'Invalid privacy setting' });
    }

    // Process uploaded images
    const imageUrls = req.files ? req.files.map(file => `/uploads/moments/${file.filename}`) : [];

    const result = await db.query(`
      INSERT INTO moments (user_id, content, images, location, privacy)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, content, images, location, privacy, created_at
    `, [req.user.id, content.trim(), imageUrls, location || null, privacy]);

    const moment = result.rows[0];

    // Get user info to return complete moment data
    const userResult = await db.query(
      'SELECT username, display_name, avatar_url FROM users WHERE id = $1',
      [req.user.id]
    );

    res.status(201).json({
      ...moment,
      user_id: req.user.id,
      username: userResult.rows[0].username,
      display_name: userResult.rows[0].display_name,
      avatar_url: userResult.rows[0].avatar_url,
      like_count: 0,
      comment_count: 0,
      is_liked_by_user: false,
      recent_comments: []
    });
  } catch (error) {
    console.error('Create moment error:', error);
    res.status(500).json({ error: 'Failed to create moment' });
  }
});

// Get moment details with all comments
router.get('/:momentId', authMiddleware, async (req, res) => {
  try {
    const { momentId } = req.params;

    const momentResult = await db.query(`
      SELECT 
        m.id,
        m.content,
        m.images,
        m.location,
        m.privacy,
        m.created_at,
        u.id as user_id,
        u.username,
        u.display_name,
        u.avatar_url,
        (
          SELECT COUNT(*) FROM moment_likes ml WHERE ml.moment_id = m.id
        ) as like_count,
        (
          SELECT CASE WHEN COUNT(*) > 0 THEN true ELSE false END 
          FROM moment_likes ml WHERE ml.moment_id = m.id AND ml.user_id = $2
        ) as is_liked_by_user
      FROM moments m
      JOIN users u ON m.user_id = u.id
      WHERE m.id = $1
    `, [momentId, req.user.id]);

    if (momentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Moment not found' });
    }

    const moment = momentResult.rows[0];

    // Check privacy access
    if (moment.user_id !== req.user.id) {
      if (moment.privacy === 'private') {
        return res.status(403).json({ error: 'Access denied to private moment' });
      }
      
      if (moment.privacy === 'friends') {
        const contactCheck = await db.query(`
          SELECT id FROM contacts 
          WHERE ((user_id = $1 AND contact_id = $2) OR (user_id = $2 AND contact_id = $1))
          AND status = 'accepted'
        `, [req.user.id, moment.user_id]);

        if (contactCheck.rows.length === 0) {
          return res.status(403).json({ error: 'Access denied to friends-only moment' });
        }
      }
    }

    // Get all comments
    const commentsResult = await db.query(`
      SELECT 
        mc.id,
        mc.content,
        mc.created_at,
        u.id as user_id,
        u.username,
        u.display_name,
        u.avatar_url
      FROM moment_comments mc
      JOIN users u ON mc.user_id = u.id
      WHERE mc.moment_id = $1
      ORDER BY mc.created_at ASC
    `, [momentId]);

    // Get likes
    const likesResult = await db.query(`
      SELECT 
        u.id,
        u.username,
        u.display_name,
        u.avatar_url
      FROM moment_likes ml
      JOIN users u ON ml.user_id = u.id
      WHERE ml.moment_id = $1
      ORDER BY ml.created_at DESC
    `, [momentId]);

    res.json({
      ...moment,
      comments: commentsResult.rows,
      likes: likesResult.rows,
      comment_count: commentsResult.rows.length
    });
  } catch (error) {
    console.error('Get moment details error:', error);
    res.status(500).json({ error: 'Failed to fetch moment details' });
  }
});

// Like/unlike moment
router.post('/:momentId/like', authMiddleware, async (req, res) => {
  try {
    const { momentId } = req.params;

    // Check if moment exists and is accessible
    const momentCheck = await db.query(`
      SELECT m.user_id, m.privacy 
      FROM moments m 
      WHERE m.id = $1
    `, [momentId]);

    if (momentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Moment not found' });
    }

    const moment = momentCheck.rows[0];

    // Check privacy access
    if (moment.user_id !== req.user.id && moment.privacy !== 'public') {
      if (moment.privacy === 'friends') {
        const contactCheck = await db.query(`
          SELECT id FROM contacts 
          WHERE ((user_id = $1 AND contact_id = $2) OR (user_id = $2 AND contact_id = $1))
          AND status = 'accepted'
        `, [req.user.id, moment.user_id]);

        if (contactCheck.rows.length === 0) {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Check if already liked
    const existingLike = await db.query(
      'SELECT id FROM moment_likes WHERE moment_id = $1 AND user_id = $2',
      [momentId, req.user.id]
    );

    if (existingLike.rows.length > 0) {
      // Unlike
      await db.query(
        'DELETE FROM moment_likes WHERE moment_id = $1 AND user_id = $2',
        [momentId, req.user.id]
      );
      res.json({ liked: false, message: 'Moment unliked' });
    } else {
      // Like
      await db.query(
        'INSERT INTO moment_likes (moment_id, user_id) VALUES ($1, $2)',
        [momentId, req.user.id]
      );
      res.json({ liked: true, message: 'Moment liked' });
    }
  } catch (error) {
    console.error('Toggle moment like error:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// Comment on moment
router.post('/:momentId/comments', authMiddleware, async (req, res) => {
  try {
    const { momentId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    if (content.length > 500) {
      return res.status(400).json({ error: 'Comment must be less than 500 characters' });
    }

    // Check if moment exists and is accessible
    const momentCheck = await db.query(`
      SELECT m.user_id, m.privacy 
      FROM moments m 
      WHERE m.id = $1
    `, [momentId]);

    if (momentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Moment not found' });
    }

    const moment = momentCheck.rows[0];

    // Check privacy access
    if (moment.user_id !== req.user.id && moment.privacy !== 'public') {
      if (moment.privacy === 'friends') {
        const contactCheck = await db.query(`
          SELECT id FROM contacts 
          WHERE ((user_id = $1 AND contact_id = $2) OR (user_id = $2 AND contact_id = $1))
          AND status = 'accepted'
        `, [req.user.id, moment.user_id]);

        if (contactCheck.rows.length === 0) {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Create comment
    const result = await db.query(`
      INSERT INTO moment_comments (moment_id, user_id, content)
      VALUES ($1, $2, $3)
      RETURNING id, content, created_at
    `, [momentId, req.user.id, content.trim()]);

    const comment = result.rows[0];

    // Get user info
    const userResult = await db.query(
      'SELECT username, display_name, avatar_url FROM users WHERE id = $1',
      [req.user.id]
    );

    res.status(201).json({
      ...comment,
      user: {
        id: req.user.id,
        username: userResult.rows[0].username,
        display_name: userResult.rows[0].display_name,
        avatar_url: userResult.rows[0].avatar_url
      }
    });
  } catch (error) {
    console.error('Create moment comment error:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// Delete comment
router.delete('/:momentId/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const { momentId, commentId } = req.params;

    // Check if comment exists and user can delete it
    const commentCheck = await db.query(`
      SELECT mc.user_id, m.user_id as moment_owner_id
      FROM moment_comments mc
      JOIN moments m ON mc.moment_id = m.id
      WHERE mc.id = $1 AND mc.moment_id = $2
    `, [commentId, momentId]);

    if (commentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const comment = commentCheck.rows[0];

    // User can delete their own comment or moment owner can delete any comment
    if (comment.user_id !== req.user.id && comment.moment_owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete comment
    await db.query('DELETE FROM moment_comments WHERE id = $1', [commentId]);

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Delete moment comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Delete moment
router.delete('/:momentId', authMiddleware, async (req, res) => {
  try {
    const { momentId } = req.params;

    // Check if moment exists and belongs to user
    const momentCheck = await db.query(
      'SELECT user_id FROM moments WHERE id = $1',
      [momentId]
    );

    if (momentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Moment not found' });
    }

    if (momentCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete moment (cascade will handle comments and likes)
    await db.query('DELETE FROM moments WHERE id = $1', [momentId]);

    res.json({ message: 'Moment deleted successfully' });
  } catch (error) {
    console.error('Delete moment error:', error);
    res.status(500).json({ error: 'Failed to delete moment' });
  }
});

module.exports = router;