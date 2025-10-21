app.post('/webhook', async (req, res) => {
  console.log('Webhook received:', req.body);
  try {
    const { From, Body } = req.body;
    if (!From || !Body) {
      console.error('Invalid request:', req.body);
      return res.status(400).send('Invalid request');
    }
    if (Body.toLowerCase().startsWith('send $')) {
      const amount = parseFloat(Body.split('$')[1]);
      if (isNaN(amount)) {
        console.error('Invalid amount:', Body);
        return res.status(400).send('Invalid amount');
      }
      console.log(`Processing send $${amount} for ${From}`);
      await client.messages.create({
        from: 'whatsapp:+15551234567',
        to: From,
        body: `Sent $${amount}! Recipient texts "CLAIM" to get it in GCash.`
      });
      res.send('OK');
    } else if (Body.toLowerCase() === 'claim') {
      console.log(`Processing claim for ${From}`);
      await client.messages.create({
        from: 'whatsapp:+15551234567',
        to: From,
        body: `You received pesos in GCash! Check your app.`
      });
      res.send('OK');
    } else {
      res.send('OK');
    }
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(500).send('Server error');
  }
});
