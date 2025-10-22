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

// NEW NOTE: Use Base mainnet RPC with explicit chain ID for minting
console.log('Initializing Ethers provider...');
const provider = new ethers.JsonRpcProvider('https://mainnet.base.org', {
  name: 'base-mainnet',
  chainId: 8453 // Explicitly set Base mainnet chain ID
});
console.log('Initializing Ethers wallet...');
const wallet = new ethers.Wallet(privateKey, provider);
const wallets = new Map();

// NEW: Add Mock USDC contract setup here (updated with verified Base mainnet address)
const usdcAddress = '0x846849310a0fE0524a3E0eaB545789C616eAB39B'; // Verified MockUSDC address on Base mainnet
const usdcAbi = ["function mint(address to, uint256 amount) public"];
const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, wallet);
// NEW NOTE: Define a simple contract for conversion rate (deployed on Base mainnet)
const rateContractAddress = '0x51456c155B55AB3B01F6CaF3c1aa3aDD0C587697'; // Your deployed RateContract address on Base Mainnet
const rateAbi = ["function getRate() view returns (uint256)"];
const rateContract = new ethers.Contract(rateContractAddress, rateAbi, provider); // Read-only, no wallet needed

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
      const dollarAmount = parseFloat(Body.split('$')[1]);
      if (isNaN(dollarAmount) || dollarAmount <= 0 || dollarAmount > 100) { // Increased limit from 10 to 100
        console.error('Invalid or excessive amount parsed from:', Body);
        return res.status(400).send('Invalid amount (max $100)');
      }
      // NEW NOTE: Convert dollar amount to micro-USDC (6 decimals); e.g., $5 = 5,000,000 micro-USDC
      const amountInMicroUSDC = Math.floor(dollarAmount * 1000000); // Precise conversion
      console.log(`Converting $${dollarAmount} to ${amountInMicroUSDC} micro-USDC`);

      // NEW NOTE: Read conversion rate from Base mainnet contract, fixed BigInt issue
      // NEW NOTE: Static rate of 57 is used (e.g., $1 = ₱57); consider future upgrade to real-time oracle (e.g., Chainlink) for dynamic rates
      const rate = await rateContract.getRate(); // Fetch rate as BigInt
      const pesoAmount = Number(BigInt(dollarAmount) * rate); // Convert and multiply
      console.log(`Conversion rate from contract: $1 = ₱${rate}, Total: ₱${pesoAmount}`);

      const recipientNumber = From;
      if (!wallets.has(recipientNumber)) {
        const newWallet = ethers.Wallet.createRandom();
        wallets.set(recipientNumber, newWallet.address);
      }
      const recipientAddress = wallets.get(recipientNumber);
      console.log(`Minting ${amountInMicroUSDC} micro-USDC to ${recipientAddress}`);

      // Minting injection point (enabled for Base mainnet with verified contract)
      const tx = await usdcContract.mint(recipientAddress, amountInMicroUSDC, {
        gasLimit: 200000 // Reasonable limit for mint on Base
      });
      await tx.wait();
      console.log(`Minted ${amountInMicroUSDC} micro-USDC, Tx: ${tx.hash}`);

      await client.messages.create({
        from: 'whatsapp:+14155238886',
        to: recipientNumber,
        body: `Sent $${dollarAmount} ≈ ₱${pesoAmount.toFixed(2)} to 8886! Recipient texts CLAIM to receive in GCash. BASE Tx: ${tx.hash.substring(0, 10)} ***DEMO ONLY***` // Updated message
      });
      console.log(`Response sent for $${dollarAmount} ≈ ₱${pesoAmount.toFixed(2)} to ${recipientNumber}`);
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
