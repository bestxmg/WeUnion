const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get user's contacts
router.get('/', authMiddleware, async (req, res) => {
  try {
    const contacts = await db.query(`
      SELECT 
        CASE 
          WHEN c.user_id = $1 THEN c.contact_id
          ELSE c.user_id
        END as user_id,
        CASE 
          WHEN c.user_id = $1 THEN u2.username
          ELSE u1.username
        END as username,
        CASE 
          WHEN c.user_id = $1 THEN u2.display_name
          ELSE u1.display_name
        END as display_name,
        CASE 
          WHEN c.user_id = $1 THEN u2.avatar_url
          ELSE u1.avatar_url
        END as avatar_url,
        CASE 
          WHEN c.user_id = $1 THEN u2.status
          ELSE u1.status
        END as status,
        c.status as contact_status,
        c.created_at
      FROM contacts c
      JOIN users u1 ON c.user_id = u1.id
      JOIN users u2 ON c.contact_id = u2.id
      WHERE (c.user_id = $1 OR c.contact_id = $1) AND c.status = 'accepted'
      ORDER BY 
        CASE 
          WHEN c.user_id = $1 THEN u2.display_name
          ELSE u1.display_name
        END
    `, [req.user.id]);

    res.json(contacts.rows);
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Get pending friend requests (received)
router.get('/requests/received', authMiddleware, async (req, res) => {
  try {
    const requests = await db.query(`
      SELECT 
        c.id,
        u.id as user_id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.status,
        c.created_at
      FROM contacts c
      JOIN users u ON c.user_id = u.id
      WHERE c.contact_id = $1 AND c.status = 'pending'
      ORDER BY c.created_at DESC
    `, [req.user.id]);

    res.json(requests.rows);
  } catch (error) {
    console.error('Get received requests error:', error);
    res.status(500).json({ error: 'Failed to fetch friend requests' });
  }
});

// Get pending friend requests (sent)
router.get('/requests/sent', authMiddleware, async (req, res) => {
  try {
    const requests = await db.query(`
      SELECT 
        c.id,
        u.id as user_id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.status,
        c.created_at
      FROM contacts c
      JOIN users u ON c.contact_id = u.id
      WHERE c.user_id = $1 AND c.status = 'pending'
      ORDER BY c.created_at DESC
    `, [req.user.id]);

    res.json(requests.rows);
  } catch (error) {
    console.error('Get sent requests error:', error);
    res.status(500).json({ error: 'Failed to fetch sent requests' });
  }
});

// Send friend request
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { contactId } = req.body;

    if (!contactId) {
      return res.status(400).json({ error: 'Contact ID is required' });
    }

    if (contactId === req.user.id) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    // Check if user exists
    const userExists = await db.query('SELECT id FROM users WHERE id = $1', [contactId]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if relationship already exists
    const existingContact = await db.query(`
      SELECT id, status FROM contacts 
      WHERE (user_id = $1 AND contact_id = $2) OR (user_id = $2 AND contact_id = $1)
    `, [req.user.id, contactId]);

    if (existingContact.rows.length > 0) {
      const status = existingContact.rows[0].status;
      if (status === 'accepted') {
        return res.status(400).json({ error: 'Users are already contacts' });
      } else if (status === 'pending') {
        return res.status(400).json({ error: 'Friend request already sent or received' });
      } else if (status === 'blocked') {
        return res.status(400).json({ error: 'Cannot send friend request to blocked user' });
      }
    }

    // Create friend request
    const result = await db.query(
      'INSERT INTO contacts (user_id, contact_id, status) VALUES ($1, $2, $3) RETURNING id, created_at',
      [req.user.id, contactId, 'pending']
    );

    res.status(201).json({
      message: 'Friend request sent successfully',
      requestId: result.rows[0].id,
      createdAt: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Accept friend request
router.post('/request/:requestId/accept', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;

    // Verify the request exists and is for this user
    const request = await db.query(
      'SELECT * FROM contacts WHERE id = $1 AND contact_id = $2 AND status = $3',
      [requestId, req.user.id, 'pending']
    );

    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    // Accept the request
    await db.query(
      'UPDATE contacts SET status = $1 WHERE id = $2',
      ['accepted', requestId]
    );

    res.json({ message: 'Friend request accepted successfully' });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Decline friend request
router.post('/request/:requestId/decline', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;

    // Verify the request exists and is for this user
    const request = await db.query(
      'SELECT * FROM contacts WHERE id = $1 AND contact_id = $2 AND status = $3',
      [requestId, req.user.id, 'pending']
    );

    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    // Delete the request
    await db.query('DELETE FROM contacts WHERE id = $1', [requestId]);

    res.json({ message: 'Friend request declined successfully' });
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

// Cancel sent friend request
router.delete('/request/:requestId', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;

    // Verify the request exists and was sent by this user
    const request = await db.query(
      'SELECT * FROM contacts WHERE id = $1 AND user_id = $2 AND status = $3',
      [requestId, req.user.id, 'pending']
    );

    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    // Delete the request
    await db.query('DELETE FROM contacts WHERE id = $1', [requestId]);

    res.json({ message: 'Friend request cancelled successfully' });
  } catch (error) {
    console.error('Cancel friend request error:', error);
    res.status(500).json({ error: 'Failed to cancel friend request' });
  }
});

// Remove contact
router.delete('/:contactId', authMiddleware, async (req, res) => {
  try {
    const { contactId } = req.params;

    // Delete the contact relationship
    const result = await db.query(`
      DELETE FROM contacts 
      WHERE (user_id = $1 AND contact_id = $2) OR (user_id = $2 AND contact_id = $1)
    `, [req.user.id, contactId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Contact relationship not found' });
    }

    res.json({ message: 'Contact removed successfully' });
  } catch (error) {
    console.error('Remove contact error:', error);
    res.status(500).json({ error: 'Failed to remove contact' });
  }
});

// Block user
router.post('/:contactId/block', authMiddleware, async (req, res) => {
  try {
    const { contactId } = req.params;

    if (contactId === req.user.id) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    // Check if user exists
    const userExists = await db.query('SELECT id FROM users WHERE id = $1', [contactId]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check existing relationship
    const existing = await db.query(`
      SELECT id FROM contacts 
      WHERE (user_id = $1 AND contact_id = $2) OR (user_id = $2 AND contact_id = $1)
    `, [req.user.id, contactId]);

    if (existing.rows.length > 0) {
      // Update existing relationship
      await db.query(
        'UPDATE contacts SET status = $1 WHERE id = $2',
        ['blocked', existing.rows[0].id]
      );
    } else {
      // Create new blocked relationship
      await db.query(
        'INSERT INTO contacts (user_id, contact_id, status) VALUES ($1, $2, $3)',
        [req.user.id, contactId, 'blocked']
      );
    }

    res.json({ message: 'User blocked successfully' });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// Unblock user
router.post('/:contactId/unblock', authMiddleware, async (req, res) => {
  try {
    const { contactId } = req.params;

    // Remove blocked relationship
    const result = await db.query(`
      DELETE FROM contacts 
      WHERE user_id = $1 AND contact_id = $2 AND status = 'blocked'
    `, [req.user.id, contactId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Blocked relationship not found' });
    }

    res.json({ message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// Get blocked users
router.get('/blocked', authMiddleware, async (req, res) => {
  try {
    const blocked = await db.query(`
      SELECT 
        u.id,
        u.username,
        u.display_name,
        u.avatar_url,
        c.created_at as blocked_at
      FROM contacts c
      JOIN users u ON c.contact_id = u.id
      WHERE c.user_id = $1 AND c.status = 'blocked'
      ORDER BY c.created_at DESC
    `, [req.user.id]);

    res.json(blocked.rows);
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ error: 'Failed to fetch blocked users' });
  }
});

module.exports = router;