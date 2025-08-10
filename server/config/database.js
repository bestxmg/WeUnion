const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'wechat_db',
  user: process.env.DB_USER || 'wechat_user',
  password: process.env.DB_PASSWORD || 'wechat_password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Track connection logging to avoid spam
let connectionLogged = false;

// Test the connection
pool.on('connect', () => {
  if (!connectionLogged) {
    console.log('✅ Connected to PostgreSQL database');
    connectionLogged = true;
  }
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
  connectionLogged = false; // Reset so we log next successful connection
});

// Helper function to execute queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Only log slow queries or auth-related queries to reduce noise
    const isAuthQuery = text.includes('user_sessions') || text.includes('password_hash');
    const isSlowQuery = duration > 100;
    
    if (isAuthQuery || isSlowQuery || process.env.NODE_ENV === 'development') {
      console.log('📊 Query executed', { 
        text: text.substring(0, 50), 
        duration, 
        rows: res.rowCount,
        type: isAuthQuery ? 'auth' : isSlowQuery ? 'slow' : 'normal'
      });
    }
    
    return res;
  } catch (error) {
    console.error('❌ Query error:', error);
    throw error;
  }
};

// Helper function to get a client for transactions
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

module.exports = {
  query,
  getClient,
  pool
};