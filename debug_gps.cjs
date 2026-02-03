const https = require('https');

const data = JSON.stringify({
  action: "debug_raw",
  body_payload: {
    device_name: "Bab"
  }
});

const options = {
  hostname: 'cmvpnsqiefbsqkwnraka.supabase.co',
  path: '/functions/v1/gps-data',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    try {
        console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch (e) {
        console.log('Body:', body);
    }
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(data);
req.end();
