<div style="font-family:Arial, sans-serif; padding:30px; max-width:600px; margin:auto; background:transparent; color:#000; text-align:center;">
  <input id="from" placeholder="Manila, Cebu, Davao..." style="width:100%; padding:10px; margin:10px 0; font-size:16px; border:1px solid #ddd; border-radius:4px;" aria-label="Home city">
  <input id="to" placeholder="Dubai, Toronto, Singapore..." style="width:100%; padding:10px; margin:10px 0; font-size:16px; border:1px solid #ddd; border-radius:4px;" aria-label="Destination city">
  <button id="searchBtn" style="width:100%; background:#28a745; color:white; padding:12px; border:none; border-radius:4px; font-size:16px; cursor:pointer;" aria-label="Search for Filipinos">Search</button>
  <div id="message" style="margin-top:20px; font-size:18px; text-align:center; display:none;" role="status">You are not alone.</div>
  <div id="count" style="margin-top:10px; font-size:16px; text-align:center; display:none;" role="status" aria-live="polite"></div>
  <div id="cta" style="margin-top:10px; text-align:center; display:none;">
    <button id="boardBtn" style="background:#28a745; color:white; padding:10px 20px; margin:10px; border:none; border-radius:4px; font-size:16px; cursor:pointer;" aria-label="View message board">Message Board</button>
    <button id="connectWalletBtn" style="background:#28a745; color:white; padding:10px 20px; margin:10px; border:none; border-radius:4px; font-size:16px; cursor:pointer;" aria-label="Connect wallet">Connect Wallet</button>
    <button id="sendBtn" style="background:#28a745; color:white; padding:10px 20px; margin:10px; border:none; border-radius:4px; font-size:16px; cursor:pointer;" aria-label="Send money">Send Money</button>
  </div>
  <div id="status" style="margin-top:10px; text-align:center; display:none;"></div>
  <div id="board" style="margin-top:20px; display:none;">
    <h3 style="font-size:16px; text-align:left;" aria-label="Community message board">Local City Board</h3>
    <input id="postMsg" placeholder="Need SIM, roommate, etc." style="width:100%; padding:10px; margin:10px 0; font-size:16px; border:1px solid #ddd; border-radius:4px;" aria-label="Post a message">
    <div id="error" style="color:#ff4444; font-size:14px; margin-bottom:10px; display:none;">
      <span id="errorText"></span>
      <button id="dismissErrorBtn" style="background:transparent; border:none; color:#ff4444; text-decoration:underline; cursor:pointer;" aria-label="Dismiss error">Dismiss</button>
    </div>
    <button id="postBtn" style="width:100%; background:#28a745; color:white; padding:12px; border:none; border-radius:4px; font-size:16px; cursor:pointer;" aria-label="Post message">Post</button>
    <div id="wall" style="font-size:14px; color:#333; height:300px; overflow:auto;" aria-live="polite"></div>
  </div>
</div>
<script src="https://unpkg.com/viem@2.x/dist/index.umd.js"></script>
<script src="https://unpkg.com/@walletconnect/web3-provider@1.8.0/dist/umd/index.min.js"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {
  const cityStats = {
    'dubai': { total: 1500000, fromManila: 14000 },
    'toronto': { total: 250000, fromManila: 5000 },
    'singapore': { total: 203243, fromManila: 3000 },
    'riyadh': { total: 725893, fromManila: 8000 },
    'vancouver': { total: 250000, fromManila: 4000 },
    'cruise (norwegian star)': { total: 400000, fromManila: 5000 },
    'london': { total: 164000, fromManila: 2000 },
    'los angeles': { total: 800000, fromManila: 10000 },
    'hong kong': { total: 186869, fromManila: 3000 }
  };
  const mockPosts = {
    'dubai': [
      '2025-10-19: Need SIM near Burj, text 09xx',
      '2025-10-18: Roommate wanted, 5K AED/month',
      '2025-10-17: Anyone from Manila here?'
    ],
    'toronto': [
      '2025-10-19: Looking for winter coat deals',
      '2025-10-18: Nurse job openings, DM me',
      '2025-10-17: Pinoy potluck this weekend?'
    ]
  };
  let localPosts = {};
  const DOM = {
    get: id => {
      const element = document.getElementById(id);
      if (!element) console.error(`Element with ID '${id}' not found`);
      return element;
    },
    show: id => {
      const element = DOM.get(id);
      if (element) element.style.display = 'block';
    },
    hide: id => {
      const element = DOM.get(id);
      if (element) element.style.display = 'none';
    },
    setText: (id, text) => {
      const element = DOM.get(id);
      if (element) element.textContent = text;
    },
    setHTML: (id, html) => {
      const element = DOM.get(id);
      if (element) element.innerHTML = html;
    }
  };
  async function search() {
    try {
      let from = DOM.get('from')?.value.trim().toLowerCase() || 'your home';
      let to = DOM.get('to')?.value.trim().toLowerCase() || 'there';
      if (!DOM.get('count') || !DOM.get('message') || !DOM.get('cta')) {
        console.error('Required DOM elements (count, message, or cta) are missing');
        showError('An error occurred. Please try again.');
        return;
      }
      if (to in cityStats) {
        DOM.setHTML('count', `${cityStats[to].total.toLocaleString()} Filipinos are currently in ${to.charAt(0).toUpperCase() + to.slice(1)}.<br>${cityStats[to].fromManila.toLocaleString()} are from your hometown of ${from.charAt(0).toUpperCase() + from.slice(1)}.`);
        DOM.show('message');
        DOM.show('count');
        DOM.show('cta');
      } else {
        const closest = getClosestCity(to);
        DOM.setHTML('count', closest
          ? `Sorry, no data for ${to.charAt(0).toUpperCase() + to.slice(1)}. Did you mean ${closest.charAt(0).toUpperCase() + closest.slice(1)}?`
          : `Sorry, no data for ${to.charAt(0).toUpperCase() + to.slice(1)} yet. Try Dubai or Toronto.`);
        DOM.hide('message');
        DOM.show('count');
        DOM.hide('cta');
      }
    } catch (error) {
      console.error('Search error:', error);
      showError('An error occurred while searching. Please try again.');
    }
  }
  function showBoard() {
    try {
      let to = DOM.get('to')?.value.trim().toLowerCase();
      if (!to) {
        showError('Please enter a destination city.');
        return;
      }
      DOM.show('board');
      loadPosts(to);
      DOM.get('postMsg')?.focus();
    } catch (error) {
      console.error('showBoard error:', error);
      showError('An error occurred while opening the message board.');
    }
  }
  function postMessage() {
    try {
      let msg = DOM.get('postMsg')?.value.trim();
      let to = DOM.get('to')?.value.trim().toLowerCase();
      if (!msg || !to) {
        showError('Please enter a message and destination city.');
        return;
      }
      if (!localPosts[to]) localPosts[to] = [];
      localPosts[to].unshift(`${new Date().toISOString().slice(0, 10)}: ${msg}`);
      DOM.get('postMsg').value = '';
      loadPosts(to);
    } catch (error) {
      console.error('postMessage error:', error);
      showError('An error occurred while posting the message.');
    }
  }
  function loadPosts(city) {
    try {
      const wall = DOM.get('wall');
      if (!wall) return;
      DOM.setHTML('wall', '');
      const posts = [...(localPosts[city] || []), ...(mockPosts[city] || [])];
      posts.forEach(post => {
        const div = document.createElement('div');
        div.style.background = '#f0f0f0';
        div.style.padding = '10px';
        div.style.margin = '10px 0';
        div.style.borderRadius = '5px';
        div.textContent = post;
        wall.appendChild(div);
      });
    } catch (error) {
      console.error('loadPosts error:', error);
      showError('An error occurred while loading posts.');
    }
  }
  function sendMoney() {
    try {
      alert('Kuya is the safest most affordable way to send money back home. Just text "join today-made" to 1-415-523-8886 to sign up. Then text "Send $5 to (name)" to try it!');
    } catch (error) {
      console.error('sendMoney error:', error);
      showError('An error occurred while accessing send money.');
    }
  }
  // Fixed wallet connection using Viem and WalletConnect for Base mainnet
  const statusDiv = document.getElementById("status");
  let userAddress = null;
  function showStatus(message, type = 'success') {
    statusDiv.innerHTML = `<span style="color: ${type === 'success' ? 'green' : 'red'}">${message}</span>`;
    statusDiv.style.display = 'block';
  }
  // Connect to Base mainnet using Viem
  document.getElementById("connectWalletBtn").onclick = async () => {
    try {
      showStatus("Connecting to Base...", 'success');
      if (typeof window.ethereum !== 'undefined') {
        // Viem client for Base mainnet
        const { createWalletClient, custom } = await import('viem');
        const { base } = await import('viem/chains');
        const walletClient = createWalletClient({
          chain: base,
          transport: custom(window.ethereum),
        });
        const [address] = await walletClient.requestAddresses();
        userAddress = address;
        showStatus(`Connected! Address: ${address.slice(0, 6)}...${address.slice(-4)}`, 'success');
        console.log('Connected to Base:', address);
      } else {
        showStatus('MetaMask not found. Install MetaMask and try again.', 'error');
      }
    } catch (error) {
      console.error('Wallet connection error:', error);
      showStatus(`Connection failed: ${error.message}`, 'error');
    }
  };
  function showError(message) {
    DOM.setText('errorText', message);
    DOM.show('error');
    setTimeout(() => DOM.hide('error'), 5000);
  }
  function dismissError() {
    DOM.hide('error');
  }
  function getClosestCity(input) {
    try {
      const cities = Object.keys(cityStats);
      let minDistance = Infinity;
      let closestCity = null;
      cities.forEach(city => {
        const distance = levenshteinDistance(input, city);
        if (distance < minDistance) {
          minDistance = distance;
          closestCity = city;
        }
      });
      return minDistance <= 3 ? closestCity : null;
    } catch (error) {
      console.error('getClosestCity error:', error);
      return null;
    }
  }
  function levenshteinDistance(a, b) {
    try {
      const matrix = Array(b.length + 1).fill().map(() => Array(a.length + 1).fill(0));
      for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
      for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
          matrix[j][i] = Math.min(
            matrix[j][i - 1] + 1,
            matrix[j - 1][i] + 1,
            matrix[j - 1][i - 1] + indicator
          );
        }
      }
      return matrix[b.length][a.length];
    } catch (error) {
      console.error('levenshteinDistance error:', error);
      return Infinity;
    }
  }
  // Attach event listeners
  const searchBtn = DOM.get('searchBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', search);
    searchBtn.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        search();
      }
    });
  } else {
    console.error('Search button not found');
  }
  const boardBtn = DOM.get('boardBtn');
  if (boardBtn) {
    boardBtn.addEventListener('click', showBoard);
    boardBtn.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        showBoard();
      }
    });
  } else {
    console.error('Message Board button not found');
  }
  const sendBtn = DOM.get('sendBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', sendMoney);
    sendBtn.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendMoney();
      }
    });
  } else {
    console.error('Send Money button not found');
  }
  const fromInput = DOM.get('from');
  if (fromInput) {
    fromInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        search();
      }
    });
  }
  const toInput = DOM.get('to');
  if (toInput) {
    toInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        search();
      }
    });
  }
  const postMsgInput = DOM.get('postMsg');
  if (postMsgInput) {
    postMsgInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        postMessage();
      }
    });
  }
  const postBtn = DOM.get('postBtn');
  if (postBtn) {
    postBtn.addEventListener('click', postMessage);
    postBtn.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        postMessage();
      }
    });
  } else {
    console.error('Post button not found');
  }
  const dismissErrorBtn = DOM.get('dismissErrorBtn');
  if (dismissErrorBtn) {
    dismissErrorBtn.addEventListener('click', dismissError);
  } else {
    console.error('Dismiss error button not found');
  }
});
</script>
