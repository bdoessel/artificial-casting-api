export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, apiKey } = req.body;

  if (!prompt || !apiKey) {
    return res.status(400).json({ error: 'Missing prompt or apiKey' });
  }

  try {
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait'
      },
      body: JSON.stringify({
        version: "black-forest-labs/flux-1.1-pro",
        input: {
          prompt: prompt,
          aspect_ratio: "1:1",
          output_format: "png",
          output_quality: 100
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json(errorData);
    }

    const prediction = await response.json();
    
    // Poll for completion
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max
    
    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      result = await pollResponse.json();
    }

    if (result.status === 'failed') {
      return res.status(500).json({ error: 'Generation failed', details: result.error });
    }

    if (result.status !== 'succeeded') {
      return res.status(500).json({ error: 'Generation timed out' });
    }

    // FLUX returns output as array of URLs or single URL
    let imageUrl = null;
    if (Array.isArray(result.output)) {
      imageUrl = result.output[0];
    } else if (typeof result.output === 'string') {
      imageUrl = result.output;
    }

    if (!imageUrl) {
      return res.status(500).json({ error: 'No image URL in response', debug: result });
    }

    // Return the image URL
    return res.status(200).json({
      image: imageUrl,
      request_id: result.id
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
