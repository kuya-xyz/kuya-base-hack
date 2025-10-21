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
  process.exit(1); // Exit if credentials are missing
}

const client = new twilio(accountSid, authToken);

// Use Base Sepolia testnet for demo
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const wallet = new ethers.Wallet(privateKey, provider);
const wallets = new Map();

app.post('/webhook', async (req, res) => {
  const { From, Body } = req.body;
  if (Body.toLowerCase().startsWith('send $')) {
    const amount = parseFloat(Body.split('$')[1]);
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
  } else if (Body.toLowerCase() === 'claim') {
    console.log(`Ramping to GCash for ${From}`);
    await client.messages.create({
      from: 'whatsapp:+15551234567',
      to: From,
      body: `You received pesos in GCash! Check your app.`
    });
  }
  res.send('OK');
});

app.listen(3000, () => console.log('Server on port 3000'));
