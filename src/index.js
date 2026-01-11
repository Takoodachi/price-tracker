require('dotenv').config();

const auth = require('./middleware/auth');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const db = require('./db');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('./config.js');

const app = express();
const PORT = 5000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- API Routes ---
app.get('/api/test', (req, res) => {
  res.json({ message: "Hello from your backend server!" });
});

// --- User Registration Endpoint ---
app.post('/api/users/register', async (req, res) => {
  try {
    // Get email and password from the request body
    const { email, password } = req.body;

    // --- Simple Validation ---
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    // --- Check if user already exists ---
    const userExists = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: "Email already in use." });
    }

    // --- Hash the password ---
    const saltRounds = 10;
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPassword = await bcrypt.hash(password, salt);

    // --- Insert the new user into the database ---
    const newUser = await db.query(
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
      [email, hashedPassword]
    );

    // Send a success response
    res.status(201).json(newUser.rows[0]);

  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// --- User Login Endpoint ---
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    // 2. Check if user exists
    const user = await db.query("SELECT * FROM users WHERE email = $1", [email]);

    if (user.rows.length === 0) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    // 3. Check if password is correct
    const foundUser = user.rows[0];
    const isPasswordCorrect = await bcrypt.compare(password, foundUser.password);

    if (!isPasswordCorrect) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    // 4. Create and send a JWT (the "access pass")
    const payload = {
      user: {
        id: foundUser.id
      }
    };

    // Sign the token
    const token = jwt.sign(
      payload,
      jwtSecret,
      { expiresIn: '1h' }
    );

    // 5. Send the token back to the user
    res.status(200).json({ token });

  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// --- 'Get Wishlist' Endpoint ---
app.get('/api/wishlist', auth, async (req, res) => {
  try {
    // 1. Get the user's ID from the auth middleware
    const userId = req.user.id;

    // 2. Query the database for all items matching this user
    const wishlist = await db.query(
      "SELECT * FROM wishlist_items WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );

    // 3. Send the real list of items back
    res.status(200).json(wishlist.rows);

  } catch (err) { 
    console.error(err.message); 
    res.status(500).send("Server error"); 
  } 
});

// --- Protected Search Endpoint ---
app.get('/api/search', auth, async (req, res) => {
  // 1. Get the search query from our frontend
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Search query "q" is required.' });
  }

  // 2. Prepare the data for the 'x-www-form-urlencoded' POST request
  // We use URLSearchParams to format the data string correctly (e.g., "term=iphone+15")
  const searchParams = new URLSearchParams();
  
  searchParams.append('source', 'amazon');
  searchParams.append('country', 'us');
    searchParams.append('values', q);

  // 3. Set up the options for the external API call
  const options = {
    method: 'POST', // <-- 1. Method is POST
    url: `https://${process.env.RAPIDAPI_HOST}/search-by-term`,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': process.env.RAPIDAPI_HOST
    },
    data: searchParams // <-- 4. Data is sent in the body
  };

  // 4. Make the request to RapidAPI using axios
  try {
    const response = await axios.request(options);
    
    // 5. Send the results from RapidAPI back to our React app
    res.json(response.data); 
    
  } catch (error) {
    console.error('RapidAPI error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to fetch search results.' });
  }
});

// --- Polling Endpoint ---
app.get('/api/search-results/:jobId', auth, async (req, res) => {

  // 1. Get the jobId from the URL (e.g., /api/search-results/abc-123)
  const { jobId } = req.params;

  // 2. Set up the options for the RapidAPI poll endpoint
  const options = {
    method: 'GET',
    url: `https://price-analytics.p.rapidapi.com/poll-job/${jobId}`,
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': process.env.RAPIDAPI_HOST
    }
  };

  // 3. Make the request to RapidAPI
  try {
    const response = await axios.request(options);

    // 4. Send whatever RapidAPI says (e.g., "pending" or the final results) back to our React app.
    res.json(response.data);

  } catch (error) {
    console.error('RapidAPI poll error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to fetch job results.' });
  }
});

// --- Save an Item to Wishlist ---
app.post('/api/wishlist', auth, async (req, res) => {
  const userId = req.user.id;

  // 1. Get the new 'target_price' from the body
  const { asin, name, price, image, target_price } = req.body;

  if (!asin || !name) {
    return res.status(400).json({ error: 'Missing item details.' });
  }

  try {
    const existingItem = await db.query(
      "SELECT * FROM wishlist_items WHERE user_id = $1 AND product_asin = $2",
      [userId, asin]
    );

    if (existingItem.rows.length > 0) {
      return res.status(400).json({ error: 'Item is already in your wishlist.' });
    }

    // 2. Add 'target_price' to the INSERT query
    const newItem = await db.query(
      "INSERT INTO wishlist_items (user_id, product_asin, name, price, image_url, target_price) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [userId, asin, name, price, image, target_price]
    );

    res.status(201).json(newItem.rows[0]);

  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// --- Remove an Item from Wishlist ---
app.delete('/api/wishlist/:asin', auth, async (req, res) => {
  // 1. Get the user's ID from our auth middleware
  const userId = req.user.id;

  // 2. Get the product ASIN from the URL parameter
  const { asin } = req.params;

  try {
    // 3. Run the DELETE query
    const deleteOperation = await db.query(
      "DELETE FROM wishlist_items WHERE user_id = $1 AND product_asin = $2 RETURNING *",
      [userId, asin]
    );

    // 4. Check if anything was actually deleted
    if (deleteOperation.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found in your wishlist.' });
    }

    // 5. Send a success message
    res.status(200).json({ message: 'Item removed successfully.' });

  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// --- Start the Server ---
app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});