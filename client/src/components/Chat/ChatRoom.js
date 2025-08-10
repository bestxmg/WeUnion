import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Avatar,
  TextField,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Send } from '@mui/icons-material';
import { useSocket } from '../../contexts/SocketContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

const ChatRoom = () => {
  const { conversationId } = useParams();
  const { socket } = useSocket();
  const { user } = useAuth();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const listRef = useRef(null);

  const myUserId = user?.id;
  const convId = useMemo(() => Number(conversationId), [conversationId]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/messages/conversations/${convId}/messages?limit=50`);
      setMessages(res.data);
      // Mark unread as read
      const unreadIds = res.data
        .filter(m => m.sender_id !== myUserId && !m.is_read)
        .map(m => m.id);
      if (socket && unreadIds.length > 0) {
        socket.emit('mark_messages_read', { conversationId: convId, messageIds: unreadIds });
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load messages');
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [convId, myUserId, socket, scrollToBottom]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!socket || !convId) return;

    const handleNewMessage = (messageData) => {
      if (messageData.conversationId !== convId) return;
      setMessages(prev => {
        const next = [
          ...prev,
          {
            id: messageData.id,
            content: messageData.content,
            message_type: messageData.messageType || 'text',
            created_at: messageData.createdAt,
            sender_id: messageData.senderId,
            sender_username: messageData.sender?.username,
            sender_name: messageData.sender?.displayName,
            sender_avatar: messageData.sender?.avatarUrl,
            is_read: messageData.senderId === myUserId,
          },
        ];
        return next;
      });
      // If it's from others, mark read immediately (since we're viewing)
      if (messageData.senderId !== myUserId) {
        socket.emit('mark_messages_read', { conversationId: convId, messageIds: [messageData.id] });
      }
      scrollToBottom();
    };

    socket.emit('join_conversation', convId);
    socket.on('new_message', handleNewMessage);

    return () => {
      socket.emit('leave_conversation', convId);
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, convId, myUserId, scrollToBottom]);

  const sendMessage = useCallback(() => {
    const content = input.trim();
    if (!content || !socket || !convId) return;

    socket.emit('send_message', {
      conversationId: convId,
      content,
      messageType: 'text',
    });

    setInput('');
  }, [input, socket, convId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderMessage = (m) => {
    const isMine = m.sender_id === myUserId;
    return (
      <Box key={m.id} display="flex" justifyContent={isMine ? 'flex-end' : 'flex-start'} my={1} px={2}>
        {!isMine && (
          <Avatar src={m.sender_avatar} sx={{ width: 28, height: 28, mr: 1 }}>
            {m.sender_name?.[0] || m.sender_username?.[0] || '?'}
          </Avatar>
        )}
        <Box
          sx={{
            maxWidth: '70%',
            bgcolor: isMine ? 'primary.main' : 'background.paper',
            color: isMine ? 'primary.contrastText' : 'text.primary',
            borderRadius: 2,
            p: 1.2,
          }}
        >
          {!isMine && (
            <Typography variant="caption" color="text.secondary">
              {m.sender_name || m.sender_username}
            </Typography>
          )}
          <Typography variant="body2" whiteSpace="pre-wrap">
            {m.message_type === 'image' ? '[Image]' : m.content}
          </Typography>
          <Typography variant="caption" color={isMine ? 'primary.contrastText' : 'text.secondary'} display="block" textAlign={isMine ? 'right' : 'left'}>
            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        </Box>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100%">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={2}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box ref={listRef} sx={{ flex: 1, overflow: 'auto', py: 1 }}>
        {messages.map(renderMessage)}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', p: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        <TextField
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message"
          fullWidth
          size="small"
          multiline
          maxRows={4}
        />
        <IconButton color="primary" onClick={sendMessage} sx={{ ml: 1 }} disabled={!input.trim()}>
          <Send />
        </IconButton>
      </Box>
    </Box>
  );
};

export default ChatRoom;