const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config'); // Go up one folder to find config

// This is the middleware function
function auth(req, res, next) {
  // 1. Get the token from the request header
  const token = req.header('x-auth-token');

  // 2. Check if there is no token
  if (!token) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  // 3. Verify the token
  try {
    const decoded = jwt.verify(token, jwtSecret);

    // 4. If valid, add the user's ID to the request object
    req.user = decoded.user;

    // 5. Call 'next()' to pass control to the actual API endpoint
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
}

module.exports = auth;