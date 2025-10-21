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

// NEW: Add Mock USDC contract setup here
const usdcAddress = '0x846849310a0fe0524a3e0eab545789c616eab39b'; // Your deployed contract address
const usdcAbi = ["function mint(address to, uint256 amount) public"];
const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, wallet);

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
  try {
    if (Body.toLowerCase().startsWith('send $')) {
      // NEW: Replace the old minting log with this minting logic
      const amount = parseFloat(Body.split('$')[1]) * 10**6; // 6 decimals for USDC
      if (isNaN(amount) || amount <= 0) {
        console.error('Invalid amount parsed from:', Body);
        return res.status(400).send('Invalid amount');
      }
      const recipientNumber = From;
      if (!wallets.has(recipientNumber)) {
        const newWallet = ethers.Wallet.createRandom();
        wallets.set(recipientNumber, newWallet.address); // Store address, not private key
      }
      const recipientAddress = wallets.get(recipientNumber);
      console.log(`Minting ${amount} USDC to ${recipientAddress}`);
      const tx = await usdcContract.mint(recipientAddress, amount);
      await tx.wait();
      console.log(`Minted ${amount} USDC, Tx: ${tx.hash}`);
      await client.messages.create({
        from: 'whatsapp:+14155238886',
        to: recipientNumber,
        body: `Sent $${amount/10**6}! Recipient texts "CLAIM". Tx: ${tx.hash.substring(0, 10)}...`
      });
      console.log(`Response sent for ${amount/10**6} to ${recipientNumber}`);
      res.send('OK');
    } else if (Body.toLowerCase() === 'claim') {
      console.log(`Processing claim for ${From}`);
      await client.messages.create({
        from: 'whatsapp:+14155238886',
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
