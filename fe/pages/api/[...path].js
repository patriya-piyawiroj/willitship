export default async function handler(req, res) {
  const { path } = req.query;
  const apiUrl = `http://host.docker.internal:8004/${path.join('/')}`;

  try {
    // Forward the request to the backend
    const response = await fetch(apiUrl, {
      method: req.method,
      headers: {
        ...req.headers,
        // Remove host header to avoid conflicts
        host: 'host.docker.internal',
        // Remove headers that shouldn't be forwarded
        'content-length': undefined,
        'transfer-encoding': undefined,
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    // Forward the response
    const data = await response.text();
    res.status(response.status).send(data);
  } catch (error) {
    console.error('API proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
