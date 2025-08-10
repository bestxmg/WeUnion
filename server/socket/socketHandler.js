const jwt = require('jsonwebtoken');
const db = require('../config/database');

const socketHandler = (io) => {
  const connectedUsers = new Map(); // userId -> socketId mapping
  const userSockets = new Map(); // socketId -> user info mapping
  
  // Track connection attempts to prevent loops - more aggressive tracking
  const connectionAttempts = new Map(); // userId -> { count, lastAttempt, blocked }
  const MAX_ATTEMPTS = 3;
  const BLOCK_DURATION = 10000; // 10 seconds
  const ATTEMPT_WINDOW = 5000; // 5 seconds

  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;
      
      // Check for rapid reconnection attempts (prevent loops)
      const now = Date.now();
      const attempts = connectionAttempts.get(userId) || { count: 0, lastAttempt: 0, blocked: false };
      
      // If user is blocked, check if block period has expired
      if (attempts.blocked && (now - attempts.lastAttempt) < BLOCK_DURATION) {
        return next(new Error('Too many connection attempts. Please wait before reconnecting.'));
      }
      
      // Reset block if block period has expired
      if (attempts.blocked && (now - attempts.lastAttempt) >= BLOCK_DURATION) {
        attempts.blocked = false;
        attempts.count = 0;
      }
      
      // If within the attempt window, increment count
      if ((now - attempts.lastAttempt) < ATTEMPT_WINDOW) {
        attempts.count++;
        if (attempts.count > MAX_ATTEMPTS) {
          attempts.blocked = true;
          attempts.lastAttempt = now;
          connectionAttempts.set(userId, attempts);
          return next(new Error('Too many connection attempts. Please wait before reconnecting.'));
        }
      } else {
        // Reset count if outside attempt window
        attempts.count = 1;
      }
      
      attempts.lastAttempt = now;
      connectionAttempts.set(userId, attempts);
      
      // Check if user is already connected - disconnect old connection
      const existingSocketId = connectedUsers.get(userId);
      if (existingSocketId && existingSocketId !== socket.id) {
        const existingSocket = io.sockets.sockets.get(existingSocketId);
        if (existingSocket) {
          console.log(`Disconnecting old socket for user ${decoded.username}: ${existingSocketId}`);
          existingSocket.disconnect(true);
        }
        connectedUsers.delete(userId);
        userSockets.delete(existingSocketId);
      }
      
      // Verify user exists and session is valid
      const userResult = await db.query(
        'SELECT u.*, s.expires_at FROM users u LEFT JOIN user_sessions s ON u.id = s.user_id WHERE u.id = $1 AND (s.token_hash = $2 OR s.token_hash IS NULL) AND (s.expires_at > NOW() OR s.expires_at IS NULL)',
        [userId, token]
      );

      if (userResult.rows.length === 0) {
        return next(new Error('Invalid or expired token'));
      }

      socket.userId = userId;
      socket.username = decoded.username;
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    try {
      // Reset connection attempts for successful connection
      const attempts = connectionAttempts.get(socket.userId);
      if (attempts) {
        attempts.count = 0;
        attempts.blocked = false;
        connectionAttempts.set(socket.userId, attempts);
      }

      console.log(`✅ User ${socket.username} connected (${socket.id})`);

      // Store user connection
      connectedUsers.set(socket.userId, socket.id);
      userSockets.set(socket.id, {
        userId: socket.userId,
        username: socket.username
      });

      // Update user status to online (only if not already online)
      await db.query('UPDATE users SET status = $1 WHERE id = $2 AND status != $1', ['online', socket.userId]);

      // Broadcast user online status to their contacts
      broadcastUserStatus(socket.userId, 'online');

      // Join user to their personal room
      socket.join(`user_${socket.userId}`);

      // Join user to their conversation rooms (with error handling)
      try {
        await joinUserConversations(socket);
      } catch (error) {
        console.error('Error joining conversations:', error);
      }

      // Handle new message
      socket.on('send_message', async (data) => {
        try {
          await handleSendMessage(socket, data);
        } catch (error) {
          console.error('Send message error:', error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      // Handle typing indicators
      socket.on('typing_start', (data) => {
        socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
          userId: socket.userId,
          username: socket.username,
          conversationId: data.conversationId
        });
      });

      socket.on('typing_stop', (data) => {
        socket.to(`conversation_${data.conversationId}`).emit('user_stop_typing', {
          userId: socket.userId,
          conversationId: data.conversationId
        });
      });

      // Handle message read status
      socket.on('mark_messages_read', async (data) => {
        try {
          await handleMarkMessagesRead(socket, data);
        } catch (error) {
          console.error('Mark messages read error:', error);
        }
      });

      // Handle joining conversation
      socket.on('join_conversation', (conversationId) => {
        socket.join(`conversation_${conversationId}`);
      });

      // Handle leaving conversation
      socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation_${conversationId}`);
      });

      // Handle disconnect
      socket.on('disconnect', async (reason) => {
        try {
          console.log(`❌ User ${socket.username} disconnected (${socket.id}) - Reason: ${reason}`);

          // Remove from maps
          connectedUsers.delete(socket.userId);
          userSockets.delete(socket.id);

          // Only update status if no other connections exist for this user
          const hasOtherConnections = Array.from(connectedUsers.values()).includes(socket.userId);
          if (!hasOtherConnections) {
            // Update user status to offline (only if not already offline)
            await db.query('UPDATE users SET status = $1 WHERE id = $2 AND status != $1', ['offline', socket.userId]);
            // Broadcast user offline status
            broadcastUserStatus(socket.userId, 'offline');
          }
        } catch (error) {
          console.error('Disconnect handling error:', error);
        }
      });

    } catch (error) {
      console.error('Socket connection setup error:', error);
      socket.disconnect(true);
    }
  });

  // Helper function to join user to their conversation rooms
  async function joinUserConversations(socket) {
    try {
      const conversations = await db.query(`
        SELECT DISTINCT c.id 
        FROM conversations c
        LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
        LEFT JOIN group_members gm ON c.group_id = gm.group_id
        WHERE cp.user_id = $1 OR gm.user_id = $1
      `, [socket.userId]);

      conversations.rows.forEach(conversation => {
        socket.join(`conversation_${conversation.id}`);
      });
    } catch (error) {
      console.error('Error in joinUserConversations:', error);
      throw error;
    }
  }

  // Helper function to handle sending messages
  async function handleSendMessage(socket, data) {
    const { conversationId, content, messageType = 'text', replyTo } = data;

    if (!conversationId || !content) {
      socket.emit('error', { message: 'Conversation ID and content are required' });
      return;
    }

    // Verify user has access to this conversation
    const accessCheck = await db.query(`
      SELECT c.id 
      FROM conversations c
      LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
      LEFT JOIN group_members gm ON c.group_id = gm.group_id
      WHERE c.id = $1 AND (cp.user_id = $2 OR gm.user_id = $2)
    `, [conversationId, socket.userId]);

    if (accessCheck.rows.length === 0) {
      socket.emit('error', { message: 'Access denied to this conversation' });
      return;
    }

    // Insert message
    const messageResult = await db.query(`
      INSERT INTO messages (conversation_id, sender_id, content, message_type, reply_to)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, created_at
    `, [conversationId, socket.userId, content, messageType, replyTo]);

    const message = messageResult.rows[0];

    // Get sender info
    const senderResult = await db.query(
      'SELECT username, display_name, avatar_url FROM users WHERE id = $1',
      [socket.userId]
    );
    const sender = senderResult.rows[0];

    // Prepare message data
    const messageData = {
      id: message.id,
      conversationId,
      senderId: socket.userId,
      sender: {
        username: sender.username,
        displayName: sender.display_name,
        avatarUrl: sender.avatar_url
      },
      content,
      messageType,
      replyTo,
      createdAt: message.created_at
    };

    // Broadcast message to conversation room
    io.to(`conversation_${conversationId}`).emit('new_message', messageData);

    // Update conversation timestamp
    await db.query(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [conversationId]
    );
  }

  // Helper function to handle marking messages as read
  async function handleMarkMessagesRead(socket, data) {
    const { conversationId, messageIds } = data;

    if (!conversationId || !messageIds || !Array.isArray(messageIds)) {
      return;
    }

    // Mark messages as read
    for (const messageId of messageIds) {
      await db.query(`
        INSERT INTO message_reads (message_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (message_id, user_id) DO NOTHING
      `, [messageId, socket.userId]);
    }

    // Broadcast read status to conversation
    socket.to(`conversation_${conversationId}`).emit('messages_read', {
      userId: socket.userId,
      messageIds,
      conversationId
    });
  }

  // Helper function to broadcast user status
  async function broadcastUserStatus(userId, status) {
    try {
      // Get user's contacts to notify them of status change
      const contacts = await db.query(`
        SELECT DISTINCT 
          CASE 
            WHEN c.user_id = $1 THEN c.contact_id
            ELSE c.user_id
          END as contact_id
        FROM contacts c
        WHERE (c.user_id = $1 OR c.contact_id = $1) AND c.status = 'accepted'
      `, [userId]);

      // Notify each contact's socket if they're online
      contacts.rows.forEach(contact => {
        const contactSocketId = connectedUsers.get(contact.contact_id);
        if (contactSocketId) {
          io.to(contactSocketId).emit('user_status_change', {
            userId: userId,
            status: status
          });
        }
      });
    } catch (error) {
      console.error('Error broadcasting user status:', error);
    }
  }

  // Clean up connection attempts periodically
  setInterval(() => {
    const now = Date.now();
    for (const [userId, attempts] of connectionAttempts.entries()) {
      if (now - attempts.lastAttempt > BLOCK_DURATION * 2) {
        connectionAttempts.delete(userId);
      }
    }
  }, BLOCK_DURATION);

  return io;
};

module.exports = socketHandler;