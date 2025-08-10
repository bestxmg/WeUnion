import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  BottomNavigation,
  BottomNavigationAction,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Avatar,
  Badge,
} from '@mui/material';
import {
  Chat,
  ContactPhone,
  PhotoCamera,
  MoreHoriz,
  Search,
  Add,
  Logout,
  Settings,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import ChatList from '../Chat/ChatList';
import ChatRoom from '../Chat/ChatRoom';
import ContactList from '../Contacts/ContactList';
import MomentsFeed from '../Moments/MomentsFeed';
import StartChatDialog from '../Chat/StartChatDialog';

const MainApp = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [currentTab, setCurrentTab] = useState(() => {
    const path = location.pathname;
    if (path.startsWith('/chat')) return 0;
    if (path.startsWith('/contacts')) return 1;
    if (path.startsWith('/moments')) return 2;
    return 0;
  });
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [startChatOpen, setStartChatOpen] = useState(false);

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
    switch (newValue) {
      case 0:
        navigate('/');
        break;
      case 1:
        navigate('/contacts');
        break;
      case 2:
        navigate('/moments');
        break;
      default:
        break;
    }
  };

  const handleMenuOpen = (event) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleLogout = () => {
    logout();
    handleMenuClose();
  };

  const getTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/chat/')) return 'Chat';
    switch (currentTab) {
      case 0:
        return 'WeChat';
      case 1:
        return 'Contacts';
      case 2:
        return 'Moments';
      default:
        return 'WeChat';
    }
  };

  const showBackButton = location.pathname.startsWith('/chat/');

  const handleStartChat = (conversationId) => {
    setStartChatOpen(false);
    if (conversationId) {
      navigate(`/chat/${conversationId}`);
    }
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* App Bar */}
      <AppBar position="static" elevation={1}>
        <Toolbar>
          {showBackButton ? (
            <IconButton
              edge="start"
              color="inherit"
              onClick={() => navigate('/')}
              sx={{ mr: 2 }}
            >
              ←
            </IconButton>
          ) : null}
          
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {getTitle()}
          </Typography>

          {!showBackButton && (
            <>
              <IconButton color="inherit" sx={{ mr: 1 }}>
                <Search />
              </IconButton>
              
              <IconButton color="inherit" sx={{ mr: 1 }} onClick={() => setStartChatOpen(true)}>
                <Add />
              </IconButton>
            </>
          )}

          <IconButton color="inherit" onClick={handleMenuOpen}>
            <Avatar
              src={user?.avatarUrl}
              sx={{ width: 32, height: 32 }}
            >
              {user?.displayName?.charAt(0) || user?.username?.charAt(0)}
            </Avatar>
          </IconButton>

          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={handleMenuClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            <MenuItem onClick={handleMenuClose}>
              <Settings sx={{ mr: 1 }} />
              Settings
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <Logout sx={{ mr: 1 }} />
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Routes>
          <Route path="/" element={<ChatList />} />
          <Route path="/chat/:conversationId" element={<ChatRoom />} />
          <Route path="/contacts/*" element={<ContactList />} />
          <Route path="/moments/*" element={<MomentsFeed />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>

      <StartChatDialog
        open={startChatOpen}
        onClose={() => setStartChatOpen(false)}
        onStarted={handleStartChat}
      />

      {/* Bottom Navigation */}
      {!showBackButton && (
        <BottomNavigation
          value={currentTab}
          onChange={handleTabChange}
          sx={{
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <BottomNavigationAction
            label="Chats"
            icon={
              <Badge badgeContent={0} color="error">
                <Chat />
              </Badge>
            }
          />
          <BottomNavigationAction
            label="Contacts"
            icon={<ContactPhone />}
          />
          <BottomNavigationAction
            label="Moments"
            icon={<PhotoCamera />}
          />
        </BottomNavigation>
      )}
    </Box>
  );
};

export default MainApp;