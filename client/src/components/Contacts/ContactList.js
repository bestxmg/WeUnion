import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  IconButton,
  TextField,
  InputAdornment,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  Search,
  PersonAdd,
  Check,
  Close,
  Person,
  PersonRemove
} from '@mui/icons-material';
import api from '../../services/api';

const ContactList = () => {
  const [tabValue, setTabValue] = useState(0);
  const [contacts, setContacts] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null, user: null });

  useEffect(() => {
    loadContacts();
    loadReceivedRequests();
    loadSentRequests();
  }, []);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/contacts');
      setContacts(response.data);
    } catch (error) {
      setError('Failed to load contacts');
      console.error('Load contacts error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReceivedRequests = async () => {
    try {
      const response = await api.get('/contacts/requests/received');
      setReceivedRequests(response.data);
    } catch (error) {
      console.error('Load received requests error:', error);
    }
  };

  const loadSentRequests = async () => {
    try {
      const response = await api.get('/contacts/requests/sent');
      setSentRequests(response.data);
    } catch (error) {
      console.error('Load sent requests error:', error);
    }
  };

  const searchUsers = async (query) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setSearchLoading(true);
      const response = await api.get(`/users/search?query=${encodeURIComponent(query)}&limit=10`);
      setSearchResults(response.data);
    } catch (error) {
      console.error('Search users error:', error);
      setError('Failed to search users');
    } finally {
      setSearchLoading(false);
    }
  };

  const sendFriendRequest = async (userId) => {
    try {
      await api.post('/contacts/request', { contactId: userId });
      setError('');
      // Refresh data
      await searchUsers(searchQuery);
      await loadSentRequests();
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to send friend request');
    }
  };

  const acceptFriendRequest = async (requestId) => {
    try {
      await api.post(`/contacts/request/${requestId}/accept`);
      setError('');
      // Refresh data
      await loadContacts();
      await loadReceivedRequests();
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to accept friend request');
    }
  };

  const declineFriendRequest = async (requestId) => {
    try {
      await api.post(`/contacts/request/${requestId}/decline`);
      setError('');
      // Refresh data
      await loadReceivedRequests();
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to decline friend request');
    }
  };

  const cancelFriendRequest = async (requestId) => {
    try {
      await api.delete(`/contacts/request/${requestId}`);
      setError('');
      // Refresh data
      await loadSentRequests();
      await searchUsers(searchQuery);
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to cancel friend request');
    }
  };

  const removeContact = async (contactId) => {
    try {
      await api.delete(`/contacts/${contactId}`);
      setError('');
      // Refresh data
      await loadContacts();
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to remove contact');
    }
  };

  const handleConfirmAction = () => {
    const { action, user } = confirmDialog;
    setConfirmDialog({ open: false, action: null, user: null });
    
    if (action === 'remove') {
      removeContact(user.user_id);
    }
  };

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    searchUsers(query);
  };

  const getStatusChip = (contactStatus) => {
    switch (contactStatus) {
      case 'accepted':
        return <Chip label="Friend" color="success" size="small" />;
      case 'pending':
        return <Chip label="Pending" color="warning" size="small" />;
      case 'blocked':
        return <Chip label="Blocked" color="error" size="small" />;
      default:
        return null;
    }
  };

  const renderContactsList = () => (
    <List>
      {contacts.map((contact) => (
        <ListItem key={contact.user_id} 
          secondaryAction={
            <IconButton 
              edge="end" 
              color="error"
              onClick={() => setConfirmDialog({ 
                open: true, 
                action: 'remove', 
                user: contact 
              })}
            >
              <PersonRemove />
            </IconButton>
          }
        >
          <ListItemAvatar>
            <Avatar src={contact.avatar_url}>
              {contact.display_name?.[0] || contact.username?.[0]}
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={contact.display_name || contact.username}
            secondary={`@${contact.username} • ${contact.status}`}
          />
        </ListItem>
      ))}
      {contacts.length === 0 && !loading && (
        <Box textAlign="center" py={4}>
          <Typography color="text.secondary">
            No contacts yet. Search for users to add friends!
          </Typography>
        </Box>
      )}
    </List>
  );

  const renderReceivedRequests = () => (
    <List>
      {receivedRequests.map((request) => (
        <ListItem key={request.id} 
          secondaryAction={
            <Box>
              <IconButton 
                color="success" 
                onClick={() => acceptFriendRequest(request.id)}
                sx={{ mr: 1 }}
              >
                <Check />
              </IconButton>
              <IconButton 
                color="error"
                onClick={() => declineFriendRequest(request.id)}
              >
                <Close />
              </IconButton>
            </Box>
          }
        >
          <ListItemAvatar>
            <Avatar src={request.avatar_url}>
              {request.display_name?.[0] || request.username?.[0]}
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={request.display_name || request.username}
            secondary={`@${request.username} wants to be your friend`}
          />
        </ListItem>
      ))}
      {receivedRequests.length === 0 && (
        <Box textAlign="center" py={4}>
          <Typography color="text.secondary">
            No pending friend requests
          </Typography>
        </Box>
      )}
    </List>
  );

  const renderSentRequests = () => (
    <List>
      {sentRequests.map((request) => (
        <ListItem key={request.id} 
          secondaryAction={
            <IconButton 
              color="error"
              onClick={() => cancelFriendRequest(request.id)}
            >
              <Close />
            </IconButton>
          }
        >
          <ListItemAvatar>
            <Avatar src={request.avatar_url}>
              {request.display_name?.[0] || request.username?.[0]}
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={request.display_name || request.username}
            secondary={`@${request.username} • Request sent`}
          />
        </ListItem>
      ))}
      {sentRequests.length === 0 && (
        <Box textAlign="center" py={4}>
          <Typography color="text.secondary">
            No pending outgoing requests
          </Typography>
        </Box>
      )}
    </List>
  );

  const renderSearchResults = () => (
    <List>
      {searchResults.map((user) => (
        <ListItem key={user.id} 
          secondaryAction={
            <Box display="flex" alignItems="center" gap={1}>
              {getStatusChip(user.contact_status)}
              {!user.contact_status && (
                <IconButton 
                  color="primary"
                  onClick={() => sendFriendRequest(user.id)}
                >
                  <PersonAdd />
                </IconButton>
              )}
            </Box>
          }
        >
          <ListItemAvatar>
            <Avatar src={user.avatar_url}>
              {user.display_name?.[0] || user.username?.[0]}
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={user.display_name || user.username}
            secondary={`@${user.username} • ${user.status}`}
          />
        </ListItem>
      ))}
      {searchQuery.length >= 2 && searchResults.length === 0 && !searchLoading && (
        <Box textAlign="center" py={4}>
          <Typography color="text.secondary">
            No users found for "{searchQuery}"
          </Typography>
        </Box>
      )}
    </List>
  );

  return (
    <Box height="100%" display="flex" flexDirection="column">
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Contacts" />
        <Tab label="Add Friends" />
        <Tab label={`Requests (${receivedRequests.length})`} />
        <Tab label="Sent" />
      </Tabs>

      <Box flex={1} overflow="auto">
        {tabValue === 0 && (
          <>
            {loading ? (
              <Box display="flex" justifyContent="center" p={4}>
                <CircularProgress />
              </Box>
            ) : (
              renderContactsList()
            )}
          </>
        )}

        {tabValue === 1 && (
          <>
            <Box p={2}>
              <TextField
                fullWidth
                placeholder="Search users by username or display name..."
                value={searchQuery}
                onChange={handleSearchChange}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                  endAdornment: searchLoading && (
                    <InputAdornment position="end">
                      <CircularProgress size={20} />
                    </InputAdornment>
                  )
                }}
              />
            </Box>
            {renderSearchResults()}
          </>
        )}

        {tabValue === 2 && renderReceivedRequests()}
        {tabValue === 3 && renderSentRequests()}
      </Box>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ open: false, action: null, user: null })}>
        <DialogTitle>Confirm Action</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove {confirmDialog.user?.display_name || confirmDialog.user?.username} from your contacts?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ open: false, action: null, user: null })}>
            Cancel
          </Button>
          <Button onClick={handleConfirmAction} color="error" variant="contained">
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ContactList;