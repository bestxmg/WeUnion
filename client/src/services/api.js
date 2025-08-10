import axios from 'axios';

// Auto-detect the backend URL based on the current hostname
const getApiUrl = () => {
  const customUrl = process.env.REACT_APP_API_URL;
  if (customUrl) {
    return customUrl;
  }
  
  // If no custom URL is set, use the same hostname as the frontend
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}:5000`;
};

const API_URL = getApiUrl();

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - just remove token, don't redirect
      // Let the auth context handle the redirect properly
      localStorage.removeItem('token');
    }
    return Promise.reject(error);
  }
);

export default api;