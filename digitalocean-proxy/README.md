# Digital Ocean Proxy Server

A simple Express proxy server to forward requests to GPS APIs.

## Deployment to Digital Ocean

1. Create a new App on Digital Ocean App Platform
2. Connect your GitHub repository
3. Set the source directory to `digitalocean-proxy`
4. Set the run command to `npm start`
5. Deploy

## Local Development

```bash
cd digitalocean-proxy
npm install
npm start
```

## API Usage

### POST /proxy

Forward a request to a target URL.

**Request Body:**
```json
{
  "targetUrl": "https://api.example.com/endpoint",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer token"
  },
  "data": {
    "key": "value"
  }
}
```

**Response:**
```json
{
  "status": 200,
  "statusText": "OK",
  "headers": {},
  "data": {}
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```
