import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  TextField,
  InputAdornment,
  Button,
  CircularProgress,
  Alert,
  Box,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import api from '../../services/api';

const StartChatDialog = ({ open, onClose, onStarted }) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await api.get('/contacts');
        if (!cancelled) setContacts(res.data.filter(c => c.contact_status === 'accepted'));
      } catch (e) {
        if (!cancelled) setError('Failed to load contacts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return contacts;
    const q = query.toLowerCase();
    return contacts.filter(c =>
      c.display_name?.toLowerCase().includes(q) ||
      c.username?.toLowerCase().includes(q)
    );
  }, [contacts, query]);

  const startChat = async (contactId) => {
    try {
      setCreating(true);
      setError('');
      const res = await api.post('/messages/conversations/individual', { contactId });
      const conversationId = res.data.conversationId;
      if (onStarted && conversationId) onStarted(conversationId);
      if (onClose) onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to start chat');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Start a chat</DialogTitle>
      <DialogContent dividers>
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search contacts"
          fullWidth
          size="small"
          margin="dense"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            )
          }}
        />

        {error && (
          <Box mt={1}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}

        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <List sx={{ maxHeight: 360, overflow: 'auto' }}>
            {filtered.map((c) => (
              <ListItem
                key={c.user_id}
                button
                disabled={creating}
                onClick={() => startChat(c.user_id)}
              >
                <ListItemAvatar>
                  <Avatar src={c.avatar_url}>
                    {c.display_name?.[0] || c.username?.[0] || '?'}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={c.display_name || c.username}
                  secondary={c.status}
                />
              </ListItem>
            ))}
            {!loading && filtered.length === 0 && (
              <Box textAlign="center" color="text.secondary" py={4}>
                No contacts found
              </Box>
            )}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={creating}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default StartChatDialog;