import React, { createContext, useContext, useReducer, useRef, useEffect } from 'react';

const AuthContext = createContext();

const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, isLoading: true, error: null };
    case 'LOGIN_SUCCESS':
      return { 
        ...state, 
        isLoading: false, 
        user: action.payload.user, 
        token: action.payload.token, 
        error: null,
        isAuthenticated: true
      };
    case 'LOGIN_FAILURE':
      return { ...state, isLoading: false, error: action.payload, isAuthenticated: false };
    case 'LOGOUT':
      return { ...state, user: null, token: null, error: null, isAuthenticated: false };
    case 'UPDATE_USER':
      return { ...state, user: { ...state.user, ...action.payload } };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: true };
    default:
      return state;
  }
};

const initialState = {
  user: null,
  token: localStorage.getItem('token'),
  isLoading: false,
  error: null,
  isAuthenticated: false,
  isInitialized: false,
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const initializingRef = useRef(false);

  const login = (user, token) => {
    localStorage.setItem('token', token);
    dispatch({ type: 'LOGIN_SUCCESS', payload: { user, token } });
  };

  const logout = () => {
    localStorage.removeItem('token');
    dispatch({ type: 'LOGOUT' });
  };

  const updateUser = (userData) => {
    dispatch({ type: 'UPDATE_USER', payload: userData });
  };

  const setLoading = (isLoading) => {
    if (isLoading) {
      dispatch({ type: 'LOGIN_START' });
    }
  };

  const setError = (error) => {
    dispatch({ type: 'LOGIN_FAILURE', payload: error });
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const setInitialized = () => {
    dispatch({ type: 'SET_INITIALIZED' });
  };

  // Listen for localStorage changes (token removal from API interceptor)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'token' && e.newValue === null && state.isAuthenticated) {
        // Token was removed, logout user
        dispatch({ type: 'LOGOUT' });
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [state.isAuthenticated]);

  const value = {
    user: state.user,
    token: state.token,
    isLoading: state.isLoading,
    error: state.error,
    isAuthenticated: state.isAuthenticated,
    isInitialized: state.isInitialized,
    initializingRef,
    login,
    logout,
    updateUser,
    setLoading,
    setError,
    clearError,
    setInitialized,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};