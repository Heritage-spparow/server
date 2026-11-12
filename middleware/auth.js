const jwt = require('jsonwebtoken');
const User = require('../Models/User');

// Protect routes
exports.protect = async (req, res, next) => {
  let token;
 
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    // Set token from Bearer token in header
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.token) {
    // Set token from cookie
    token = req.cookies.token;
  }

  // Make sure token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Guest tokens only work on cart / checkout routes (see protectWithGuest)
    if (decoded.scope === 'guest') {
      return res.status(401).json({
        success: false,
        code: 'LOGIN_REQUIRED',
        message: 'Please login or sign up to access this route'
      });
    }

    // Find user by ID
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

// Allows a full login token OR a guest checkout token.
// Use only on cart / checkout routes.
// Order of preference: Authorization header, `token` cookie, `guest_token` cookie.
exports.protectWithGuest = async (req, res, next) => {
  const candidates = [];

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    candidates.push(req.headers.authorization.split(' ')[1]);
  }
  if (req.cookies.token) candidates.push(req.cookies.token);
  if (req.cookies.guest_token) candidates.push(req.cookies.guest_token);

  for (const token of candidates) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user || user.accountStatus !== 'active') continue;

      req.user = user;
      req.isGuestSession = decoded.scope === 'guest';
      return next();
    } catch (error) {
      // try next token
    }
  }

  return res.status(401).json({
    success: false,
    code: 'GUEST_OR_LOGIN_REQUIRED',
    message: 'Please login or continue as guest with your email / phone'
  });
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

// Optional auth - doesn't require token but sets user if present
exports.optionalAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.token) {
    token = req.cookies.token;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = decoded.scope === 'guest' ? null : await User.findById(decoded.id);
      if (user) {
        req.user = user;
      }
    } catch (error) {
      // Token is invalid, but we continue without user
    }
  }

  next();
};
