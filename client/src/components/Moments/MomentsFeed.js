import React from 'react';
import { Box, Typography } from '@mui/material';

const MomentsFeed = () => {
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
        Moments
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Timeline/Moments functionality will be implemented here
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        • View friends' moments
      </Typography>
      <Typography variant="body2" color="text.secondary">
        • Post new moments
      </Typography>
      <Typography variant="body2" color="text.secondary">
        • Like and comment on posts
      </Typography>
    </Box>
  );
};

export default MomentsFeed;