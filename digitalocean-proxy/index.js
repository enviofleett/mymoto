const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Proxy endpoint
app.post('/proxy', async (req, res) => {
  const { targetUrl, method = 'GET', headers = {}, data } = req.body;

  if (!targetUrl) {
    return res.status(400).json({ 
      error: 'Missing required field: targetUrl' 
    });
  }

  console.log(`[Proxy] ${method} request to: ${targetUrl}`);

  try {
    const response = await axios({
      url: targetUrl,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      data: data || undefined,
      timeout: 30000, // 30 second timeout
    });

    console.log(`[Proxy] Response status: ${response.status}`);

    res.status(response.status).json({
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data
    });
  } catch (error) {
    console.error(`[Proxy] Error:`, error.message);

    if (error.response) {
      // The request was made and the server responded with a status code
      res.status(error.response.status).json({
        error: 'Upstream server error',
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    } else if (error.request) {
      // The request was made but no response was received
      res.status(504).json({
        error: 'No response from upstream server',
        message: error.message
      });
    } else {
      // Something happened in setting up the request
      res.status(500).json({
        error: 'Proxy request failed',
        message: error.message
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
