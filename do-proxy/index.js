// Digital Ocean Proxy Server
// Deploy this to Digital Ocean App Platform or Droplet
// Run: npm install express axios cors && node index.js

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/proxy', async (req, res) => {
  try {
    const { targetUrl, method = 'GET', headers = {}, data } = req.body;

    if (!targetUrl) {
      return res.status(400).json({ error: 'targetUrl is required' });
    }

    console.log(`Proxying ${method} request to: ${targetUrl}`);

    const response = await axios({
      url: targetUrl,
      method: method.toUpperCase(),
      headers,
      data,
      timeout: 30000,
    });

    res.status(response.status).json({
      status: response.status,
      data: response.data,
      headers: response.headers,
    });
  } catch (error) {
    console.error('Proxy error:', error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: error.message,
        status: error.response.status,
        data: error.response.data,
      });
    } else {
      res.status(500).json({
        error: error.message,
        code: error.code,
      });
    }
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
