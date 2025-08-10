# Troubleshooting Guide

## CORS Issues

### Problem: "Access to XMLHttpRequest has been blocked by CORS policy"

This happens when the frontend and backend are running on different origins (different IP addresses, ports, or protocols).

#### Quick Solutions:

1. **Update Environment Variables** (Recommended):
   ```bash
   # In client/.env, update the API URL to match your setup:
   REACT_APP_API_URL=http://YOUR_IP_ADDRESS:5000
   ```

2. **Use Localhost for Both**:
   - Access frontend via `http://localhost:3000` instead of your IP address
   - Make sure backend is running on `http://localhost:5000`

3. **Update CORS Configuration** (Already fixed in latest version):
   The server now automatically allows local network IPs in development mode.

#### Detailed Solutions:

### Option 1: Environment Variable Configuration

1. **Find your IP address**:
   ```bash
   # On Windows:
   ipconfig
   
   # On macOS/Linux:
   ifconfig
   # or
   ip addr show
   ```

2. **Update client/.env**:
   ```env
   REACT_APP_API_URL=http://192.168.2.143:5000
   ```

3. **Restart the React development server**:
   ```bash
   cd client
   npm start
   ```

### Option 2: Access via Localhost

1. **Start both servers**:
   ```bash
   # Terminal 1 - Backend
   cd server
   npm run dev
   
   # Terminal 2 - Frontend  
   cd client
   npm start
   ```

2. **Access the application**:
   - Use `http://localhost:3000` in your browser
   - NOT `http://192.168.x.x:3000`

### Option 3: Network Access Setup

If you need to access the app from other devices on your network:

1. **Update client/.env**:
   ```env
   REACT_APP_API_URL=http://YOUR_COMPUTER_IP:5000
   ```

2. **Start backend with network binding**:
   ```bash
   # Add to server package.json scripts:
   "dev:network": "HOST=0.0.0.0 nodemon index.js"
   ```

3. **Start frontend with network binding**:
   ```bash
   # Add to client package.json scripts:
   "start:network": "HOST=0.0.0.0 react-scripts start"
   ```

## Database Connection Issues

### Problem: "Connection refused" or "Database not found"

1. **Check PostgreSQL is running**:
   ```bash
   # If using Docker:
   docker-compose ps
   
   # If using local PostgreSQL:
   sudo service postgresql status
   ```

2. **Verify database credentials**:
   Check `.env` file for correct database settings:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=wechat_db
   DB_USER=wechat_user
   DB_PASSWORD=wechat_password
   ```

3. **Initialize database**:
   ```bash
   # Connect to PostgreSQL and run:
   psql -U wechat_user -d wechat_db -f database/init.sql
   ```

## Socket.IO Connection Issues

### Problem: Socket connection fails or constantly reconnects

1. **Check Socket.IO URL**:
   The frontend should connect to the same URL as the API.

2. **Verify CORS settings**:
   Socket.IO also needs proper CORS configuration (already fixed).

3. **Check browser console**:
   Look for Socket.IO connection errors and ensure the token is valid.

## Port Already in Use

### Problem: "EADDRINUSE: address already in use"

1. **Find process using the port**:
   ```bash
   # On Windows:
   netstat -ano | findstr :5000
   
   # On macOS/Linux:
   lsof -i :5000
   ```

2. **Kill the process**:
   ```bash
   # On Windows:
   taskkill /PID <PID> /F
   
   # On macOS/Linux:
   kill -9 <PID>
   ```

3. **Use different ports**:
   Update `.env` files to use different ports if needed.

## File Upload Issues

### Problem: File uploads fail

1. **Check upload directories exist**:
   ```bash
   mkdir -p uploads/avatars uploads/groups uploads/moments
   ```

2. **Verify file size limits**:
   Check `MAX_FILE_SIZE` in `.env` (default: 10MB)

3. **Check file permissions**:
   ```bash
   chmod 755 uploads/
   chmod 755 uploads/*/
   ```

## Development vs Production

### Development Mode:
- CORS allows all local network IPs
- Detailed error messages
- Hot reloading enabled

### Production Mode:
- Strict CORS policy (configure `ALLOWED_ORIGINS`)
- Minified code
- Error messages are generic

## Common Commands

### Reset Everything:
```bash
# Stop all containers
docker-compose down

# Remove containers and volumes
docker-compose down -v

# Rebuild and start
docker-compose up --build
```

### View Logs:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f wechat_app
docker-compose logs -f postgres
```

### Database Reset:
```bash
# Connect to database
docker-compose exec postgres psql -U wechat_user -d wechat_db

# Drop and recreate tables
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
\i /docker-entrypoint-initdb.d/init.sql
```

## Need More Help?

1. Check browser developer console for errors
2. Check server logs for backend errors
3. Verify all environment variables are set correctly
4. Ensure all required services are running
5. Test API endpoints directly with curl or Postman

### Example API Test:
```bash
# Test if backend is accessible
curl http://localhost:5000/api/auth/verify

# Test with your IP
curl http://192.168.2.143:5000/api/auth/verify
```