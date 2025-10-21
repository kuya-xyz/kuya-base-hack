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

console.log('Initializing Twilio client with SID:', accountSid.substring(0, 5) + '...');
const client = new twilio(accountSid, authToken);
console.log('Initializing Ethers provider and wallet...');
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const wallet = new ethers.Wallet(privateKey, provider);
const wallets = new Map();

app.get('/health', (req, res) => res.status(200).send('Healthy'));

app.post('/webhook', async (req, res) => {
  console.log('Webhook received - Raw Body:', JSON.stringify(req.body));
  try {
    const { From, Body } = req.body;
    if (!From || !Body) {
      console.error('Invalid request - Missing From or Body:', JSON.stringify(req.body));
      return res.status(400).send('Invalid request');
    }
    console.log(`Processing message from ${From} with Body: ${Body}`);
    if (Body.toLowerCase().startsWith('send $')) {
      const amount = parseFloat(Body.split('$')[1]);
      if (isNaN(amount) || amount <= 0) {
        console.error('Invalid amount parsed from:', Body);
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
      console.log(`Response sent for ${amount} to ${recipientNumber}`);
      res.send('OK');
    } else if (Body.toLowerCase() === 'claim') {
      console.log(`Processing claim for ${From}`);
      await client.messages.create({
        from: 'whatsapp:+15551234567',
        to: From,
        body: `You received pesos in GCash! Check your app.`
      });
      console.log(`Claim processed for ${From}`);
      res.send('OK');
    } else {
      console.log(`Unknown command: ${Body}, sending OK`);
      res.send('OK');
    }
  } catch (error) {
    console.error('Webhook error - Details:', error.message, error.stack);
    res.status(500).send('Server error');
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception - Details:', error.message, error.stack);
});

app.listen(3000, () => console.log('Server on port 3000'));
