# Heritage spparow Backend - Industry Standard E-commerce API

A comprehensive, production-ready ecommerce backend built with Node.js, Express, and MongoDB. Features include authentication, product management, shopping cart, order processing, and more.

## 🚀 Features

### Core Features
- **Authentication & Authorization**: JWT-based auth with role-based access control
- **Product Management**: CRUD operations with search, filtering, and pagination
- **Shopping Cart**: Persistent cart with session management
- **Order Management**: Complete order lifecycle from creation to fulfillment
- **User Reviews**: Product review and rating system
- **File Upload**: Image upload with Cloudinary integration
- **Payment Integration**: Stripe payment processing

### Performance & Security
- **Clustering**: Multi-core CPU utilization
- **Rate Limiting**: API request throttling
- **Security**: Helmet, XSS protection, NoSQL injection prevention
- **Compression**: Gzip compression for responses
- **Caching**: Redis integration for session and data caching
- **Logging**: Structured logging with daily rotation

### Production Ready
- **Health Checks**: Application monitoring endpoints
- **Environment Configuration**: Comprehensive env variable setup
- **Database Seeding**: Sample data for development
- **Error Handling**: Centralized error management
- **Process Management**: PM2 ready for production

## 📋 Prerequisites

- Node.js 16+ 
- MongoDB 4.4+ (local installation or MongoDB Atlas)
- Redis (optional, for caching)

## 🛠️ Installation

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Heritage spparow/server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start MongoDB** (if not using Docker)
   ```bash
   # Using MongoDB locally or MongoDB Atlas
   # Update MONGO_URI in .env file
   ```

5. **Seed the database** (optional)
   ```bash
   npm run seed
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

### Production Deployment

1. **Install PM2** (Process Manager)
   ```bash
   npm install -g pm2
   ```

2. **Start production server**
   ```bash
   NODE_ENV=production pm2 start server.js --name Heritage spparow-backend
   ```

3. **Monitor processes**
   ```bash
   pm2 status
   pm2 logs Heritage spparow-backend
   ```

## 🔧 Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
MONGO_URI=mongodb://localhost:27017/Heritage spparow
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your_super_secure_jwt_secret_key
JWT_EXPIRE=7d

# CORS Configuration
CLIENT_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Email Configuration (Optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Payment Configuration (Optional)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key

# File Upload Configuration (Optional)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

## 📚 API Documentation

### Base URL
```
Development: http://localhost:3000/api
Production: https://your-domain.com/api
```

### Authentication Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| POST | `/auth/register` | Register new user | Public |
| POST | `/auth/login` | User login | Public |
| GET | `/auth/me` | Get current user | Private |
| PUT | `/auth/profile` | Update user profile | Private |
| PUT | `/auth/password` | Change password | Private |

### Product Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/products` | Get all products | Public |
| GET | `/products/:id` | Get single product | Public |
| POST | `/products` | Create product | Admin |
| PUT | `/products/:id` | Update product | Admin |
| DELETE | `/products/:id` | Delete product | Admin |
| POST | `/products/:id/reviews` | Add review | Private |
| GET | `/products/featured` | Get featured products | Public |
| GET | `/products/top/rated` | Get top rated products | Public |
| GET | `/products/categories` | Get all categories | Public |

### Cart Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/cart` | Get user cart | Private |
| POST | `/cart/add` | Add item to cart | Private |
| PUT | `/cart/item/:itemId` | Update cart item | Private |
| DELETE | `/cart/item/:itemId` | Remove cart item | Private |
| DELETE | `/cart/clear` | Clear entire cart | Private |
| GET | `/cart/count` | Get cart item count | Private |

### Order Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| POST | `/orders` | Create new order | Private |
| GET | `/orders/my` | Get user orders | Private |
| GET | `/orders/:id` | Get single order | Private |
| PUT | `/orders/:id/pay` | Update order to paid | Private |
| PUT | `/orders/:id/cancel` | Cancel order | Private |
| GET | `/orders` | Get all orders | Admin |
| PUT | `/orders/:id/status` | Update order status | Admin |

## 🔍 Query Parameters

### Products
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 12)
- `category`: Filter by category
- `brand`: Filter by brand
- `minPrice` & `maxPrice`: Price range filter
- `rating`: Minimum rating filter
- `search`: Search in name, description, tags
- `sortBy`: Sort options (price-asc, price-desc, rating, newest, oldest)
- `featured`: Filter featured products
- `inStock`: Filter in-stock products only

### Example Requests

```bash
# Get products with filters
GET /api/products?category=Electronics&minPrice=50&maxPrice=200&sortBy=price-asc

# Search products
GET /api/products?search=headphones&rating=4

# Get paginated results
GET /api/products?page=2&limit=20
```

## 🚦 Getting Started

### 1. Register a new user
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### 3. Use the token for protected routes
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🧪 Sample Data

Run the seeding script to populate your database with sample data:

```bash
npm run seed
```

This creates:
- 3 sample users (including 1 admin)
- 5 sample products with various categories
- Admin credentials: `admin@Heritage spparow.com` / `admin123456`

## 📊 Monitoring & Logging

### Health Check
```bash
GET /health
```

### Logs
Logs are stored in the `logs/` directory:
- `error.log`: Error logs only
- `combined-YYYY-MM-DD.log`: All logs with daily rotation

### Monitoring Endpoints
- `/health`: Application health status
- `/api`: API documentation and status

## 🔒 Security Features

- **JWT Authentication**: Stateless authentication
- **Rate Limiting**: Prevents abuse and DDoS attacks
- **Input Validation**: Request validation using express-validator
- **SQL Injection Protection**: MongoDB sanitization
- **XSS Protection**: Input sanitization
- **CORS Configuration**: Controlled cross-origin requests
- **Helmet**: Security headers
- **Parameter Pollution**: HPP protection

## 🚀 Production Deployment

### PM2 Process Manager (Recommended)
```bash
# Install PM2 globally
npm install -g pm2

# Start application
NODE_ENV=production pm2 start server.js --name Heritage spparow-backend

# Auto-restart on system reboot
pm2 startup
pm2 save

# Monitor and manage
pm2 status
pm2 logs Heritage spparow-backend
pm2 restart Heritage spparow-backend
```

## 🌍 Deployment Options

### Cloud Platforms
- **Heroku**: Git-based deployment with Procfile
- **AWS**: EC2 instances with PM2
- **Google Cloud**: Compute Engine or App Engine
- **Digital Ocean**: Droplets with PM2
- **Railway**: Direct GitHub deployment
- **Render**: Auto-deploy from Git

### VPS/Self-Hosted Deployment
```bash
# 1. Clone repository on your server
git clone <your-repo-url>
cd Heritage spparow/server

# 2. Install dependencies
npm install --production

# 3. Set up environment
cp .env.example .env
# Edit .env with your production values

# 4. Install PM2
npm install -g pm2

# 5. Start application
NODE_ENV=production pm2 start server.js --name Heritage spparow-backend

# 6. Set up auto-restart
pm2 startup
pm2 save

# 7. Optional: Set up Nginx reverse proxy
# Configure Nginx to proxy requests to localhost:3000
```

### Environment-specific configurations
- Development: `NODE_ENV=development`
- Staging: `NODE_ENV=staging`
- Production: `NODE_ENV=production`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the API documentation at `/api`
- Review the logs in the `logs/` directory

## 🔄 Version History

- **v1.0.0**: Initial release with core ecommerce features
- **v1.1.0**: Added payment integration and enhanced security
- **v1.2.0**: PM2 support and production optimizations
