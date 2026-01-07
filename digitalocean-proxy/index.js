const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Health Check
app.get('/', (req, res) => res.status(200).send('GPS Walker Proxy Active 🟢'));

app.post('/proxy', async (req, res) => {
  const { targetUrl, method, headers, data } = req.body;

  if (!targetUrl) return res.status(400).json({ error: 'Target URL is required' });

  console.log(`[Proxy] ${method || 'POST'} -> ${targetUrl}`);

  try {
    const response = await axios({
      url: targetUrl,
      method: method || 'POST', // GPS51 API uses POST for everything
      headers: headers || { 'Content-Type': 'application/json' },
      data: data || {},
      timeout: 60000, // 60s Timeout (Critical for GPS sync commands)
      validateStatus: () => true // Prevent crashing on 4xx/5xx errors
    });

    // Pass the exact response back
    res.status(response.status).json(response.data);

  } catch (error) {
    console.error('[Proxy Error]', error.message);
    const status = error.response ? error.response.status : 500;
    res.status(status).json({ error: 'Proxy traversal failed', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Walker running on port ${PORT}`);
});
