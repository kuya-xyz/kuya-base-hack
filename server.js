const express = require('express');
const twilio = require('twilio');
const ethers = require('ethers');

const app = express();
app.use(express.urlencoded({ extended: true }));
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

// Mainnet for remittance flow
console.log('Initializing Ethers provider (mainnet)...');
const mainnetProvider = new ethers.JsonRpcProvider('https://mainnet.base.org', {
  name: 'base-mainnet',
  chainId: 8453
});
const mainnetWallet = new ethers.Wallet(privateKey, mainnetProvider);
const usdcAddress = '0x846849310a0fE0524a3E0eaB545789C616eAB39B'; // Mainnet Mock USDC
const usdcAbi = ["function mint(address to, uint256 amount) public"];
const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, mainnetWallet);
const rateContractAddress = '0x827E15376f3B32949C0124F05fD7D708eA7AeEC2'; // Mainnet RateContract
const rateAbi = ["function getRate() view returns (uint256)"];
const rateContract = new ethers.Contract(rateContractAddress, rateAbi, mainnetProvider);

// Sepolia for badge reward
console.log('Initializing Ethers provider (Sepolia)...');
const sepoliaProvider = new ethers.JsonRpcProvider('https://sepolia.base.org', {
  name: 'base-sepolia',
  chainId: 84532
});
const sepoliaWallet = new ethers.Wallet(privateKey, sepoliaProvider);

const wallets = new Map();
const ETH_PRICE_USD = 2600; // Example price

// Health check
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
    if (Body.toLowerCase() === 'join today-made') {
      // Handle sign-up and mint a welcome badge on Sepolia
      const recipientNumber = From;
      if (!wallets.has(recipientNumber)) {
        const newWallet = ethers.Wallet.createRandom();
        wallets.set(recipientNumber, newWallet.address);
      }
      const recipientAddress = wallets.get(recipientNumber);
      console.log(`Minting Kuya Welcome Badge to ${recipientAddress} on Sepolia`);
      const tx = await sepoliaWallet.sendTransaction({
        to: recipientAddress,
        value: ethers.parseEther('0'), // Mock badge (0 ETH)
        gasLimit: 21000
      });
      await tx.wait();
      const receipt = await sepoliaProvider.getTransactionReceipt(tx.hash);
      const gasUsed = Number(receipt.gasUsed);
      const feeData = await sepoliaProvider.getFeeData();
      const gasPrice = feeData.gasPrice ? Number(feeData.gasPrice) : 1500000000;
      const gasCostEth = gasUsed * gasPrice / 1e18;
      const gasCostUsd = gasCostEth * ETH_PRICE_USD;
      console.log(`Badge transaction hash: ${tx.hash}`);
      await client.messages.create({
        from: 'whatsapp:+14155238886',
        to: recipientNumber,
        body: `Welcome to Kuya! You've earned a Kuya Welcome Badge on Base Sepolia. Transaction Fee < $0.01, Base Ref# ${tx.hash.substring(0, 10)}...\nText "send $5 to [name]" to send money! ***DEMO ONLY 🤍 Kuya***`
      });
      console.log(`Badge response sent to ${recipientNumber}`);
      res.send('OK');
    } else if (Body.toLowerCase().startsWith('send $')) {
      const match = Body.match(/send \$(\d+(?:\.\d+)?)\s+to\s+(.+?)(?:\s|$)/i);
      if (!match) {
        return res.status(400).send('Invalid format - try Send $5 to [name]');
      }
      const dollarAmount = parseFloat(match[1]);
      const recipientName = match[2].trim();
      if (isNaN(dollarAmount) || dollarAmount <= 0 || dollarAmount > 100) {
        console.error('Invalid or excessive amount parsed from:', Body);
        return res.status(400).send('Invalid amount (max $100)');
      }
      const amountInMicroUSDC = Math.floor(dollarAmount * 1000000);
      console.log(`Converting $${dollarAmount} to ${amountInMicroUSDC} micro-USDC`);
      const rate = await rateContract.getRate();
      const pesoAmount = Number(BigInt(dollarAmount) * rate);
      console.log(`Conversion rate from contract: $1 = ₱${rate}, Total: ₱${pesoAmount}`);
      const recipientNumber = From;
      if (!wallets.has(recipientNumber)) {
        const newWallet = ethers.Wallet.createRandom();
        wallets.set(recipientNumber, newWallet.address);
      }
      const recipientAddress = wallets.get(recipientNumber);
      console.log(`Minting ${amountInMicroUSDC} micro-USDC to ${recipientAddress}`);
      const tx = await usdcContract.mint(recipientAddress, amountInMicroUSDC, {
        gasLimit: 200000
      });
      await tx.wait();
      const receipt = await mainnetProvider.getTransactionReceipt(tx.hash);
      const gasUsed = Number(receipt.gasUsed);
      const feeData = await mainnetProvider.getFeeData();
      const gasPrice = feeData.gasPrice ? Number(feeData.gasPrice) : 1500000000;
      const gasCostEth = gasUsed * gasPrice / 1e18;
      const gasCostUsd = gasCostEth * ETH_PRICE_USD;
      console.log(`Gas used: ${gasUsed}, Cost: $${gasCostUsd.toFixed(2)}`);
      await client.messages.create({
        from: 'whatsapp:+14155238886',
        to: recipientNumber,
        body: `Just sent $${dollarAmount} ≈ ₱${pesoAmount.toFixed(2)} to ${recipientName}! Recipient texts CLAIM to receive in GCash. Transaction Fee ${gasCostUsd < 0.01 ? '< $0.01' : 'only $' + gasCostUsd.toFixed(2)}\nBase Ref# ${tx.hash.substring(0, 10)}...\n***DEMO ONLY 🤍 Kuya***`
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
