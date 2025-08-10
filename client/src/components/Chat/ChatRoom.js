import React from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography } from '@mui/material';

const ChatRoom = () => {
  const { conversationId } = useParams();

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
        Chat Room
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Conversation ID: {conversationId}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Real-time messaging functionality will be implemented here
      </Typography>
    </Box>
  );
};

export default ChatRoom;