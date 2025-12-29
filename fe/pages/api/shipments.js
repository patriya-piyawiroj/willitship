export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const searchParams = url.searchParams;
    const queryString = searchParams.toString();
    const apiUrl = `http://host.docker.internal:8004/shipments${queryString ? '?' + queryString : ''}`;

    const response = await fetch(apiUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.text();
    res.status(response.status).send(data);
  } catch (error) {
    console.error('Shipments API proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
