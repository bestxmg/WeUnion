const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get user's conversations
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    // First get the conversations
    const conversations = await db.query(`
      SELECT DISTINCT
        c.id,
        c.type,
        c.created_at,
        c.updated_at,
        CASE 
          WHEN c.type = 'group' THEN g.name
          ELSE (
            SELECT u2.display_name 
            FROM conversation_participants cp2 
            JOIN users u2 ON cp2.user_id = u2.id 
            WHERE cp2.conversation_id = c.id AND cp2.user_id != $1
            LIMIT 1
          )
        END as name,
        CASE 
          WHEN c.type = 'group' THEN g.avatar_url
          ELSE (
            SELECT u2.avatar_url 
            FROM conversation_participants cp2 
            JOIN users u2 ON cp2.user_id = u2.id 
            WHERE cp2.conversation_id = c.id AND cp2.user_id != $1
            LIMIT 1
          )
        END as avatar_url,
        (
          SELECT COUNT(*)
          FROM messages m
          LEFT JOIN message_reads mr ON m.id = mr.message_id AND mr.user_id = $1
          WHERE m.conversation_id = c.id AND m.sender_id != $1 AND mr.id IS NULL
        ) as unread_count
      FROM conversations c
      LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
      LEFT JOIN group_members gm ON c.group_id = gm.group_id
      LEFT JOIN groups g ON c.group_id = g.id
      WHERE cp.user_id = $1 OR gm.user_id = $1
      ORDER BY c.updated_at DESC
    `, [req.user.id]);

    // Then get the last message for each conversation separately
    const conversationsWithMessages = await Promise.all(
      conversations.rows.map(async (conv) => {
        const lastMessageResult = await db.query(`
          SELECT 
            m.id,
            m.content,
            m.message_type,
            m.created_at,
            u.display_name as sender_name
          FROM messages m
          JOIN users u ON m.sender_id = u.id
          WHERE m.conversation_id = $1
          ORDER BY m.created_at DESC
          LIMIT 1
        `, [conv.id]);

        return {
          ...conv,
          last_message: lastMessageResult.rows[0] || null
        };
      })
    );

    // Sort by last message time or conversation update time
    conversationsWithMessages.sort((a, b) => {
      const timeA = a.last_message?.created_at || a.updated_at;
      const timeB = b.last_message?.created_at || b.updated_at;
      return new Date(timeB) - new Date(timeA);
    });

    res.json(conversationsWithMessages);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get messages for a conversation
router.get('/conversations/:conversationId/messages', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Verify user has access to this conversation
    const accessCheck = await db.query(`
      SELECT c.id 
      FROM conversations c
      LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
      LEFT JOIN group_members gm ON c.group_id = gm.group_id
      WHERE c.id = $1 AND (cp.user_id = $2 OR gm.user_id = $2)
    `, [conversationId, req.user.id]);

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const messages = await db.query(`
      SELECT 
        m.id,
        m.content,
        m.message_type,
        m.file_url,
        m.file_name,
        m.file_size,
        m.reply_to,
        m.created_at,
        u.id as sender_id,
        u.username as sender_username,
        u.display_name as sender_name,
        u.avatar_url as sender_avatar,
        CASE WHEN mr.id IS NOT NULL THEN true ELSE false END as is_read
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN message_reads mr ON m.id = mr.message_id AND mr.user_id = $2
      WHERE m.conversation_id = $1
      ORDER BY m.created_at DESC
      LIMIT $3 OFFSET $4
    `, [conversationId, req.user.id, limit, offset]);

    // Add reply message data separately if needed
    const messagesWithReplies = await Promise.all(
      messages.rows.map(async (message) => {
        if (message.reply_to) {
          const replyResult = await db.query(`
            SELECT 
              rm.id,
              rm.content,
              ru.display_name as sender_name
            FROM messages rm
            JOIN users ru ON rm.sender_id = ru.id
            WHERE rm.id = $1
          `, [message.reply_to]);
          
          return {
            ...message,
            reply_message: replyResult.rows[0] || null
          };
        }
        return {
          ...message,
          reply_message: null
        };
      })
    );

    res.json(messagesWithReplies.reverse()); // Reverse to show oldest first
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Create or get individual conversation
router.post('/conversations/individual', authMiddleware, async (req, res) => {
  try {
    const { contactId } = req.body;

    if (!contactId) {
      return res.status(400).json({ error: 'Contact ID is required' });
    }

    if (contactId === req.user.id) {
      return res.status(400).json({ error: 'Cannot create conversation with yourself' });
    }

    // Check if users are contacts
    const contactCheck = await db.query(`
      SELECT id FROM contacts 
      WHERE ((user_id = $1 AND contact_id = $2) OR (user_id = $2 AND contact_id = $1))
      AND status = 'accepted'
    `, [req.user.id, contactId]);

    if (contactCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Users must be contacts to start a conversation' });
    }

    // Check if conversation already exists
    const existingConv = await db.query(`
      SELECT c.id
      FROM conversations c
      JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
      JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
      WHERE c.type = 'individual' 
      AND cp1.user_id = $1 
      AND cp2.user_id = $2
      AND (
        SELECT COUNT(*) FROM conversation_participants 
        WHERE conversation_id = c.id
      ) = 2
    `, [req.user.id, contactId]);

    if (existingConv.rows.length > 0) {
      return res.json({ conversationId: existingConv.rows[0].id });
    }

    // Create new conversation
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      const convResult = await client.query(
        'INSERT INTO conversations (type) VALUES ($1) RETURNING id',
        ['individual']
      );

      const conversationId = convResult.rows[0].id;

      // Add both users as participants
      await client.query(
        'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
        [conversationId, req.user.id, contactId]
      );

      await client.query('COMMIT');

      res.status(201).json({ conversationId });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create individual conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Search messages
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { query, conversationId } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    let searchQuery = `
      SELECT 
        m.id,
        m.content,
        m.message_type,
        m.created_at,
        u.display_name as sender_name,
        c.id as conversation_id,
        CASE 
          WHEN c.type = 'group' THEN g.name
          ELSE (
            SELECT u2.display_name 
            FROM conversation_participants cp2 
            JOIN users u2 ON cp2.user_id = u2.id 
            WHERE cp2.conversation_id = c.id AND cp2.user_id != $2
            LIMIT 1
          )
        END as conversation_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      JOIN conversations c ON m.conversation_id = c.id
      LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
      LEFT JOIN group_members gm ON c.group_id = gm.group_id
      LEFT JOIN groups g ON c.group_id = g.id
      WHERE (cp.user_id = $2 OR gm.user_id = $2)
      AND m.content ILIKE $1
    `;

    const params = [`%${query}%`, req.user.id];

    if (conversationId) {
      searchQuery += ' AND c.id = $3';
      params.push(conversationId);
    }

    searchQuery += ' ORDER BY m.created_at DESC LIMIT 100';

    const results = await db.query(searchQuery, params);

    res.json(results.rows);
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

module.exports = router;