# Build stage for React client
FROM node:18-alpine as client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Production stage for Node.js server
FROM node:18-alpine
WORKDIR /app

# Copy server package files
COPY package*.json ./
RUN npm install --only=production

# Copy server code
COPY server/ ./server/
COPY .env* ./

# Copy built client from previous stage
COPY --from=client-build /app/client/build ./client/build

# Create uploads directory
RUN mkdir -p uploads

# Expose ports
EXPOSE 3000 5000

# Start the server
CMD ["npm", "start"]