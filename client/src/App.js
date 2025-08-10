import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import MainApp from './components/MainApp/MainApp';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import api from './services/api';

const AppContent = () => {
  const { 
    user, 
    login, 
    logout, 
    isLoading, 
    isInitialized, 
    initializingRef, 
    setInitialized,
    setError 
  } = useAuth();
  
  const lastAuthCheck = useRef(0);
  const authCheckInProgress = useRef(false);

  useEffect(() => {
    // Prevent multiple simultaneous auth checks with more aggressive timing
    if (initializingRef.current || isInitialized || authCheckInProgress.current) {
      return;
    }

    // Rate limit auth checks to once every 5 seconds minimum
    const now = Date.now();
    if (now - lastAuthCheck.current < 5000) {
      setInitialized();
      return;
    }

    const checkAuth = async () => {
      authCheckInProgress.current = true;
      initializingRef.current = true;
      lastAuthCheck.current = Date.now();
      
      const token = localStorage.getItem('token');
      if (token) {
        try {
          console.log('🔍 Checking authentication...');
          const response = await api.get('/auth/verify');
          if (response.data.valid) {
            console.log('✅ Auth verification successful');
            login(response.data.user, token);
          } else {
            console.log('❌ Auth verification failed - invalid response');
            localStorage.removeItem('token');
            logout();
          }
        } catch (error) {
          console.error('❌ Auth verification failed:', error);
          localStorage.removeItem('token');
          logout();
          
          // Only show error for non-401 errors (network issues, etc.)
          if (error.response?.status !== 401) {
            setError('Authentication failed. Please try again.');
          }
        }
      } else {
        console.log('🔍 No token found, skipping auth check');
      }
      
      setInitialized();
      initializingRef.current = false;
      authCheckInProgress.current = false;
    };

    // Add a small delay to prevent rapid fire auth checks
    const timeoutId = setTimeout(checkAuth, 100);
    
    return () => {
      clearTimeout(timeoutId);
      authCheckInProgress.current = false;
    };
  }, [login, logout, isInitialized, initializingRef, setInitialized, setError]);

  // Show loading while checking authentication
  if (!isInitialized || isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="100vh"
        bgcolor="background.default"
      >
        <CircularProgress color="primary" size={40} />
      </Box>
    );
  }

  return (
    <Routes>
      <Route 
        path="/login" 
        element={user ? <Navigate to="/" replace /> : <Login />} 
      />
      <Route 
        path="/register" 
        element={user ? <Navigate to="/" replace /> : <Register />} 
      />
      <Route 
        path="/*" 
        element={
          user ? (
            <SocketProvider>
              <MainApp />
            </SocketProvider>
          ) : (
            <Navigate to="/login" replace />
          )
        } 
      />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;