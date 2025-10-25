const express = require('express');
const twilio = require('twilio');
const ethers = require('ethers');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Load credentials from environment variables
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const privateKey = process.env.PRIVATE_KEY; // Mainnet wallet
const badgePrivateKey = process.env.BADGE_PRIVATE_KEY; // Sepolia badge wallet

if (!accountSid || !authToken || !privateKey || !badgePrivateKey) {
  console.error('Missing environment variables: TWILIO_SID, TWILIO_AUTH_TOKEN, PRIVATE_KEY, or BADGE_PRIVATE_KEY');
  process.exit(1);
}

console.log('Initializing Twilio client with SID:', accountSid.substring(0, 5) + '...');
const client = new twilio(accountSid, authToken);

// Mainnet for remittance and referral flow
console.log('Initializing Ethers provider (mainnet)...');
const mainnetProvider = new ethers.JsonRpcProvider('https://mainnet.base.org', {
  name: 'base-mainnet',
  chainId: 8453
});
const mainnetWallet = new ethers.Wallet(privateKey, mainnetProvider);
const usdcAddress = '0x846849310a0fE0524a3E0eaB545789C616eAB39B';
const usdcAbi = ["function mint(address to, uint256 amount) public"];
const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, mainnetWallet);
const rateContractAddress = '0x827E15376f3B32949C0124F05fD7D708eA7AeEC2';
const rateAbi = ["function getRate() view returns (uint256)"];
const rateContract = new ethers.Contract(rateContractAddress, rateAbi, mainnetProvider);

// Sepolia for $100 badge reward
console.log('Initializing Ethers provider (Sepolia)...');
const sepoliaProvider = new ethers.JsonRpcProvider('https://sepolia.base.org', {
  name: 'base-sepolia',
  chainId: 84532
});
const sepoliaWallet = new ethers.Wallet(badgePrivateKey, sepoliaProvider);

const wallets = new Map();
const referrals = new Map(); // Track referrer -> referee phone numbers
const ETH_PRICE_USD = 2600;

// Health check
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.status(200).send('Healthy');
});

app.post('/webhook', async (req, res) => {
  console.log('Webhook hit - Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Webhook hit - Raw Body:', JSON.stringify(req.body, null, 2));
  let { From, Body } = req.body || {};
  if (typeof Body !== 'string') Body = (req.body.Body || '').toString().trim();
  if (typeof From !== 'string') From = (req.body.From || '').toString().trim();
  if (!From || !Body) {
    console.error('Invalid request - From or Body missing:', { From, Body, raw: req.body });
    return res.status(400).send('Invalid request - Missing From or Body');
  }
  console.log(`Processing message from ${From} with Body: "${Body}"`);
  try {
    if (Body.toLowerCase().startsWith('send $')) {
      const match = Body.match(/send \$(\d+(?:\.\d+)?)\s+to\s+(.+?)(?:\s|$)/i);
      if (!match) {
        console.log(`Invalid send format: ${Body}`);
        return res.status(400).send('Invalid format - try Send $5 to [name]');
      }
      const dollarAmount = parseFloat(match[1]);
      const recipientName = match[2].trim();
      if (isNaN(dollarAmount) || dollarAmount <= 0 || dollarAmount > 100) {
        console.error('Invalid or excessive amount:', Body);
        return res.status(400).send('Invalid amount (max $100)');
      }
      const recipientNumber = From;
      if (!wallets.has(recipientNumber)) {
        const newWallet = ethers.Wallet.createRandom();
        wallets.set(recipientNumber, newWallet.address);
      }
      const recipientAddress = wallets.get(recipientNumber);
      let badgeMessage = '';
      let txHash = '';

      if (dollarAmount === 100) {
        // Award badge on Sepolia for $100 transfers
        console.log(`Minting Kuya High-Value Badge to ${recipientAddress} on Sepolia`);
        const badgeTx = await sepoliaWallet.sendTransaction({
          to: recipientAddress,
          value: ethers.parseEther('0'),
          gasLimit: 21000
        });
        console.log(`Waiting for badge transaction ${badgeTx.hash}`);
        await badgeTx.wait();
        const badgeReceipt = await sepoliaProvider.getTransactionReceipt(badgeTx.hash);
        const badgeGasUsed = Number(badgeReceipt.gasUsed);
        const badgeFeeData = await sepoliaProvider.getFeeData();
        const badgeGasPrice = badgeFeeData.gasPrice ? Number(badgeFeeData.gasPrice) : 1500000000;
        const badgeGasCostEth = badgeGasUsed * badgeGasPrice / 1e18;
        const badgeGasCostUsd = badgeGasCostEth * ETH_PRICE_USD;
        console.log(`Badge transaction confirmed: ${badgeTx.hash}`);
        badgeMessage = `\nYou've earned a Kuya High-Value Badge on Base Sepolia! Transaction Fee < $0.01, Base Ref# ${badgeTx.hash.substring(0, 10)}...`;
        txHash = badgeTx.hash;
      }

      // Perform remittance on mainnet
      const amountInMicroUSDC = Math.floor(dollarAmount * 1000000);
      console.log(`Converting $${dollarAmount} to ${amountInMicroUSDC} micro-USDC`);
      const rate = await rateContract.getRate();
      const pesoAmount = Number(BigInt(dollarAmount) * rate);
      console.log(`Conversion rate: $1 = ₱${rate}, Total: ₱${pesoAmount}`);
      console.log(`Minting ${amountInMicroUSDC} micro-USDC to ${recipientAddress} on mainnet`);
      const tx = await usdcContract.mint(recipientAddress, amountInMicroUSDC, {
        gasLimit: 200000
      });
      console.log(`Waiting for transaction ${tx.hash}`);
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
        body: `Just sent $${dollarAmount} ≈ ₱${pesoAmount.toFixed(2)} to ${recipientName}! Recipient texts CLAIM to receive in GCash. Transaction Fee ${gasCostUsd < 0.01 ? '< $0.01' : 'only $' + gasCostUsd.toFixed(2)}\nBase Ref# ${tx.hash.substring(0, 10)}...${badgeMessage}\n***DEMO ONLY 🤍 Kuya***`
      });
      console.log(`Response sent for $${dollarAmount} to ${recipientNumber}`);
      res.send('OK');
    } else if (Body.toLowerCase().startsWith('refer ')) {
      const match = Body.match(/refer\s+(.+)/i);
      if (!match) {
        console.log(`Invalid refer format: ${Body}`);
        return res.status(400).send('Invalid format - try refer [phone]');
      }
      const refereeNumber = match[1].trim();
      if (!refereeNumber.startsWith('whatsapp:+')) {
        console.log(`Invalid phone format: ${refereeNumber}`);
        return res.status(400).send('Invalid phone number - use whatsapp:+[number]');
      }
      const referrerNumber = From;
      if (!wallets.has(referrerNumber)) {
        console.log(`Referrer ${referrerNumber} not registered`);
        return res.status(400).send('You must send money first to refer others');
      }
      referrals.set(refereeNumber, referrerNumber);
      console.log(`Referral recorded: ${referrerNumber} referred ${refereeNumber}`);
      // Simulate $5 USDC bonus for month 12
      const referrerAddress = wallets.get(referrerNumber);
      const bonusAmount = 5000000; // $5 in micro-USDC
      console.log(`Minting $5 USDC referral bonus to ${referrerAddress} on mainnet`);
      const tx = await usdcContract.mint(referrerAddress, bonusAmount, {
        gasLimit: 200000
      });
      console.log(`Waiting for referral transaction ${tx.hash}`);
      await tx.wait();
      const receipt = await mainnetProvider.getTransactionReceipt(tx.hash);
      const gasUsed = Number(receipt.gasUsed);
      const feeData = await mainnetProvider.getFeeData();
      const gasPrice = feeData.gasPrice ? Number(feeData.gasPrice) : 1500000000;
      const gasCostEth = gasUsed * gasPrice / 1e18;
      const gasCostUsd = gasCostEth * ETH_PRICE_USD;
      console.log(`Referral gas used: ${gasUsed}, Cost: $${gasCostUsd.toFixed(2)}`);
      await client.messages.create({
        from: 'whatsapp:+14155238886',
        to: referrerNumber,
        body: `Thanks for referring ${refereeNumber}! You've earned a $5 USDC bonus. Transaction Fee ${gasCostUsd < 0.01 ? '< $0.01' : 'only $' + gasCostUsd.toFixed(2)}\nBase Ref# ${tx.hash.substring(0, 10)}...\n***DEMO ONLY 🤍 Kuya***`
      });
      await client.messages.create({
        from: 'whatsapp:+14155238886',
        to: refereeNumber,
        body: `You've been referred to Kuya by a friend! Text "Send $5 to [name]" to try it. ***DEMO ONLY 🤍 Kuya***`
      });
      console.log(`Referral response sent to ${referrerNumber} and ${refereeNumber}`);
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
      console.log(`Unknown command: "${Body}"`);
      res.send('OK');
    }
  } catch (error) {
    console.error('Webhook error:', error.message, error.stack);
    res.status(500).send('Server error');
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message, error.stack);
});

app.listen(3000, () => console.log('Server on port 3000'));
