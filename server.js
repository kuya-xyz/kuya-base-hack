const express = require('express');
const twilio = require('twilio');
const ethers = require('ethers');

const app = express();
app.use(express.json());

// Load credentials from environment variables
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const privateKey = process.env.PRIVATE_KEY;

if (!accountSid || !authToken || !privateKey) {
  console.error('Missing environment variables: TWILIO_SID, TWILIO_AUTH_TOKEN, or PRIVATE_KEY');
  process.exit(1);
}

const client = new twilio(accountSid, authToken);
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const wallet = new ethers.Wallet(privateKey, provider);
const wallets = new Map();

// Immediate health check response
app.get('/health', (req, res) => res.status(200).send('Healthy'));

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
      const recipientNumber = From;
      if (!wallets.has(recipientNumber)) {
        const newWallet = ethers.Wallet.createRandom();
        wallets.set(recipientNumber, newWallet.privateKey);
      }
      console.log(`Minting ${amount} USDC to ${recipientNumber}`);
      await client.messages.create({
        from: 'whatsapp:+15551234567',
        to: recipientNumber,
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

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
});

app.listen(3000, () => console.log('Server on port 3000'));
