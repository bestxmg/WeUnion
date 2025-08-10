import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const { token, user, isAuthenticated, isInitialized } = useAuth();
  const socketRef = useRef(null);
  const connectionAttemptRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Only connect if fully authenticated and initialized
    if (isAuthenticated && isInitialized && token && user && !connectionAttemptRef.current) {
      connectionAttemptRef.current = true;
      
      // Clean up any existing connection first
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setConnected(false);
      }

      // Auto-detect the backend URL
      const getSocketUrl = () => {
        const customUrl = process.env.REACT_APP_API_URL;
        if (customUrl) {
          return customUrl;
        }
        
        // If no custom URL is set, use the same hostname as the frontend
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        return `${protocol}//${hostname}:5000`;
      };

      const newSocket = io(getSocketUrl(), {
        auth: {
          token: token
        },
        // Prevent rapid reconnections
        reconnectionDelay: 2000,
        reconnectionDelayMax: 5000,
        maxReconnectionAttempts: 5,
        timeout: 10000,
        // Only reconnect if manually disconnected
        autoConnect: true,
        forceNew: true // Force new connection to prevent conflicts
      });

      newSocket.on('connect', () => {
        if (mountedRef.current) {
          console.log('Connected to server');
          setConnected(true);
          connectionAttemptRef.current = false;
        }
      });

      newSocket.on('disconnect', (reason) => {
        if (mountedRef.current) {
          console.log('Disconnected from server:', reason);
          setConnected(false);
          connectionAttemptRef.current = false;
        }
      });

      newSocket.on('connect_error', (error) => {
        if (mountedRef.current) {
          console.error('Socket connection error:', error);
          setConnected(false);
          connectionAttemptRef.current = false;
        }
      });

      socketRef.current = newSocket;
      setSocket(newSocket);

      return () => {
        connectionAttemptRef.current = false;
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        if (mountedRef.current) {
          setSocket(null);
          setConnected(false);
        }
      };
    } else if (!isAuthenticated || !token || !user) {
      // Clean up when not authenticated
      connectionAttemptRef.current = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (mountedRef.current) {
        setSocket(null);
        setConnected(false);
      }
    }
  }, [token, user, isAuthenticated, isInitialized]);

  const value = {
    socket,
    connected,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};