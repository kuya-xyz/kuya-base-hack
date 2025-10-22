const express = require('express');
const twilio = require('twilio');
const ethers = require('ethers');

const app = express();
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded data
app.use(express.json()); // Parse JSON data

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
console.log('Initializing Ethers provider...');
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
console.log('Initializing Ethers wallet...');
const wallet = new ethers.Wallet(privateKey, provider);
const wallets = new Map();

// Immediate and robust health check
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.status(200).send('Healthy');
});

app.post('/webhook', async (req, res) => {
  console.log('Webhook received - Headers:', req.headers);
  console.log('Webhook received - Raw Body:', req.body);
  let { From, Body } = req.body || {};
  if (typeof Body !== 'string') Body = (req.body.Body || '').toString().trim();
  if (typeof From !== 'string') From = (req.body.From || '').toString().trim();
  if (!From || !Body) {
    console.error('Invalid request - From or Body missing:', { From, Body, raw: req.body });
    return res.status(400).send('Invalid request - Missing From or Body');
  }
  console.log(`Processing message from ${From} with Body: ${Body}`);
  res.send('OK'); // Simplified response to test server
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception - Details:', error.message, error.stack);
});

app.listen(3000, () => console.log('Server on port 3000'));
