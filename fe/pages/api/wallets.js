export default async function handler(req, res) {
  try {
    const response = await fetch('http://host.docker.internal:8004/wallets', {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.text();
    res.status(response.status).send(data);
  } catch (error) {
    console.error('Wallets API proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
