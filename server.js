const express = require('express');
const twilio = require('twilio');
const ethers = require('ethers');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const privateKey = process.env.PRIVATE_KEY;

if (!accountSid || !authToken || !privateKey) {
  console.error('Missing env vars:', { accountSid, authToken, privateKey });
  process.exit(1);
}

console.log('Twilio init with SID:', accountSid.substring(0, 5) + '...');
const client = new twilio(accountSid, authToken);
console.log('Ethers provider init');
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
console.log('Ethers wallet init');
const wallet = new ethers.Wallet(privateKey, provider);
const wallets = new Map();

app.get('/health', (req, res) => {
  console.log('Health check hit');
  res.status(200).send('Healthy');
});

app.post('/webhook', async (req, res) => {
  console.log('Webhook received - Headers:', req.headers);
  console.log('Webhook received - Raw Body:', req.body);
  let { From, Body } = req.body || {};
  if (typeof Body !== 'string') Body = (req.body.Body || '').toString().trim();
  if (typeof From !== 'string') From = (req.body.From || '').toString().trim();
  if (!From || !Body) {
    console.error('Invalid request - From or Body missing:', { From, Body });
    return res.status(400).send('Invalid request');
  }
  console.log(`Processing message from ${From} with Body: ${Body}`);
  res.send('OK');
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message, error.stack);
});

app.listen(3000, () => console.log('Server on port 3000'));
