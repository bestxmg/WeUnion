import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Typography,
  Badge,
  Divider,
  CircularProgress,
  Alert,
} from '@mui/material';
import { formatDistanceToNow } from 'date-fns';
import api from '../../services/api';
import { useSocket } from '../../contexts/SocketContext';

const ChatList = () => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { socket } = useSocket();

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('new_message', handleNewMessage);
      socket.on('messages_read', handleMessagesRead);

      return () => {
        socket.off('new_message', handleNewMessage);
        socket.off('messages_read', handleMessagesRead);
      };
    }
  }, [socket]);

  const fetchConversations = async () => {
    try {
      const response = await api.get('/messages/conversations');
      const data = Array.isArray(response.data) ? response.data : [];
      setConversations(data);
      if (!Array.isArray(response.data)) {
        setError('Unexpected response when loading conversations');
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to load conversations');
      console.error('Failed to fetch conversations:', error);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewMessage = (messageData) => {
    setConversations(prev => {
      const updated = prev.map(conv => {
        if (conv.id === messageData.conversationId) {
          return {
            ...conv,
            last_message: {
              content: messageData.content,
              sender_name: messageData.sender.displayName,
              created_at: messageData.createdAt,
            },
            unread_count: conv.unread_count + 1,
            updated_at: messageData.createdAt,
          };
        }
        return conv;
      });

      // Sort by updated_at
      return updated.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    });
  };

  const handleMessagesRead = ({ conversationId }) => {
    setConversations(prev =>
      prev.map(conv =>
        conv.id === conversationId
          ? { ...conv, unread_count: 0 }
          : conv
      )
    );
  };

  const handleConversationClick = (conversationId) => {
    navigate(`/chat/${conversationId}`);
  };

  const formatLastMessage = (message) => {
    if (!message) return 'No messages yet';
    
    const prefix = message.message_type === 'image' ? '[Image]' : '';
    return prefix + message.content;
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } else {
      return formatDistanceToNow(date, { addSuffix: true });
    }
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

  if (!Array.isArray(conversations) || conversations.length === 0) {
    return (
      <Box 
        display="flex" 
        flexDirection="column" 
        alignItems="center" 
        justifyContent="center" 
        height="100%" 
        p={3}
        textAlign="center"
      >
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No conversations yet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Start chatting with your contacts to see conversations here
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <List sx={{ p: 0 }}>
        {conversations.map((conversation, index) => (
          <React.Fragment key={conversation.id}>
            <ListItem
              button
              onClick={() => handleConversationClick(conversation.id)}
              sx={{
                py: 2,
                px: 3,
                '&:hover': {
                  bgcolor: 'action.hover',
                },
              }}
            >
              <ListItemAvatar>
                <Badge 
                  badgeContent={conversation.unread_count || 0} 
                  color="error"
                  max={99}
                >
                  <Avatar 
                    src={conversation.avatar_url}
                    sx={{ width: 50, height: 50 }}
                  >
                    {conversation.name?.charAt(0) || '?'}
                  </Avatar>
                </Badge>
              </ListItemAvatar>
              
              <ListItemText
                primary={
                  <Typography variant="body1" fontWeight="medium">
                    {conversation.name || 'Unknown'}
                  </Typography>
                }
                secondary={
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '200px',
                    }}
                  >
                    {formatLastMessage(conversation.last_message)}
                  </Typography>
                }
                sx={{ mr: 1 }}
              />
              
              <Box textAlign="right">
                <Typography variant="caption" color="text.secondary">
                  {formatTime(conversation.last_message?.created_at)}
                </Typography>
              </Box>
            </ListItem>
            
            {index < conversations.length - 1 && (
              <Divider variant="inset" component="li" sx={{ ml: 9 }} />
            )}
          </React.Fragment>
        ))}
      </List>
    </Box>
  );
};

export default ChatList;