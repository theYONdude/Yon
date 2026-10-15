const socket = io();

let currentLobbyCode = null;
let myPlayerId = null;
let isHost = false;
let myBalance = 0;
let minBet = 10;

const screens = {
  lobby: document.getElementById('lobby-screen'),
  waiting: document.getElementById('waiting-screen'),
  game: document.getElementById('game-screen')
};

function showScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const money = n => '$' + Number(n).toLocaleString();

// ---------- Lobby ----------
document.getElementById('create-lobby-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) {
    alert('Please enter your name');
    return;
  }
  socket.emit('createBlackjackLobby', { name });
});

document.getElementById('join-lobby-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  const code = document.getElementById('lobby-code-input').value.trim().toUpperCase();
  if (!name || !code) {
    alert('Please enter your name and lobby code');
    return;
  }
  socket.emit('joinBlackjackLobby', { name, code });
});

document.getElementById('start-game-btn').addEventListener('click', () => {
  socket.emit('startBlackjackGame', { code: currentLobbyCode });
});

// ---------- Betting (dealer bubble) ----------
const betInput = document.getElementById('bet-input');

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const current = parseInt(betInput.value) || 0;
    const amt = chip.dataset.amt === 'max' ? myBalance : Math.min(myBalance, current + parseInt(chip.dataset.amt));
    betInput.value = amt;
  });
});

document.getElementById('clear-bet-btn').addEventListener('click', () => {
  betInput.value = '';
  betInput.focus();
});

function placeBet() {
  const amount = parseInt(betInput.value);
  if (!amount || amount < minBet) {
    alert(`Minimum bet is ${money(minBet)}`);
    return;
  }
  if (amount > myBalance) {
    alert(`You only have ${money(myBalance)}`);
    return;
  }
  socket.emit('placeBet', { code: currentLobbyCode, amount });
}

document.getElementById('place-bet-btn').addEventListener('click', placeBet);
betInput.addEventListener('keydown', e => { if (e.key === 'Enter') placeBet(); });

// ---------- Actions ----------
document.getElementById('hit-btn').addEventListener('click', () => {
  socket.emit('hit', { code: currentLobbyCode });
});

document.getElementById('stand-btn').addEventListener('click', () => {
  socket.emit('stand', { code: currentLobbyCode });
});

document.getElementById('double-btn').addEventListener('click', () => {
  socket.emit('double', { code: currentLobbyCode });
});

// ---------- Socket events ----------
socket.on('blackjackLobbyCreated', (data) => {
  currentLobbyCode = data.code;
  myPlayerId = socket.id;
  isHost = data.isHost;
  document.getElementById('display-lobby-code').textContent = data.code;
  document.getElementById('start-game-btn').classList.remove('hidden');
  document.querySelector('.waiting-text').classList.add('hidden');
  showScreen('waiting');
});

socket.on('blackjackLobbyJoined', (data) => {
  currentLobbyCode = data.code;
  myPlayerId = socket.id;
  isHost = data.isHost;
  document.getElementById('display-lobby-code').textContent = data.code;
  if (isHost) {
    document.getElementById('start-game-btn').classList.remove('hidden');
    document.querySelector('.waiting-text').classList.add('hidden');
  }
  showScreen('waiting');
});

socket.on('blackjackPlayersUpdate', (players) => {
  const playersList = document.getElementById('players-list');
  playersList.innerHTML = '';

  players.forEach(player => {
    const div = document.createElement('div');
    div.className = 'player-item';
    div.innerHTML = `
      <span>${escapeHtml(player.name)} ${player.id === myPlayerId ? '(You)' : ''}</span>
      <span>${money(player.money)}</span>
    `;
    playersList.appendChild(div);
  });

  const me = players.find(p => p.id === myPlayerId);
  if (me) myBalance = me.money;

  const playersNeededMsg = document.getElementById('players-needed-msg');
  if (isHost) {
    document.getElementById('start-game-btn').disabled = false;
    if (playersNeededMsg) {
      if (players.length < 2) {
        playersNeededMsg.textContent = 'Solo mode available - or invite friends with the code above!';
        playersNeededMsg.classList.remove('hidden');
      } else {
        playersNeededMsg.classList.add('hidden');
      }
    }
  }
});

let lastGameState = null;

socket.on('gameState', (data) => {
  const me = data.players.find(p => p.id === myPlayerId);
  if (!me) return;

  minBet = data.minBet || minBet;
  myBalance = me.money;
  document.getElementById('bet-balance').textContent = me.money.toLocaleString();

  // New betting round: clear the bet box
  if (data.gameState === 'betting' && lastGameState !== 'betting') {
    betInput.value = '';
  }
  lastGameState = data.gameState;

  showScreen('game');
  renderDealer(data);
  renderDealerSpeech(data, me);
  renderPlayers(data);
  renderActions(data, me);
});

// ---------- Rendering ----------
function renderDealerSpeech(data, me) {
  const says = document.getElementById('dealer-says');
  const betControls = document.getElementById('bet-controls');
  const bubble = document.getElementById('dealer-bubble');
  let line = '';
  let showBet = false;
  bubble.className = 'dealer-bubble';

  if (data.gameState === 'betting') {
    if (me.status === 'betting') {
      showBet = true;
      line = me.rebought
        ? `Looks like you ran dry, so the house spotted you <b>${money(me.money)}</b>. How much are you betting?`
        : `Place your bets! You've got <b>${money(me.money)}</b>. How much are you putting down?`;
    } else {
      const waitingOn = data.players.filter(p => p.status === 'betting').map(p => escapeHtml(p.name));
      line = `<b>${money(me.bet)}</b> on the table. Good luck! ` +
        (waitingOn.length ? `Waiting on ${waitingOn.join(', ')}…` : 'Dealing…');
    }
  } else if (data.gameState === 'playing') {
    const current = data.players.find(p => p.id === data.currentPlayerId);
    if (me.status === 'sitting') {
      line = "Grab a seat. You'll be dealt in next hand.";
    } else if (current && current.id === myPlayerId) {
      line = `You've got <b>${me.handValue}</b>. Hit or stand?`;
    } else if (me.status === 'busted') {
      line = `Bust with ${me.handValue}. Tough luck.`;
    } else if (current) {
      line = `${escapeHtml(current.name)}'s turn…`;
    }
  } else if (data.gameState === 'results') {
    const d = data.dealer.handValue;
    const dealerText = d > 21 ? `I bust with ${d}.` : `I've got ${d}.`;
    if (me.status === 'won') {
      line = `${dealerText} You win <b>${money(me.bet * 2)}</b>! 🎉`;
      bubble.classList.add('win');
    } else if (me.status === 'push') {
      line = `${dealerText} Push, so your ${money(me.bet)} comes back.`;
    } else if (me.status === 'lost') {
      line = `${dealerText} House takes your ${money(me.bet)}.`;
      bubble.classList.add('lose');
    } else {
      line = `${dealerText} You're in next hand.`;
    }
    line += ' <span class="muted">Next hand in a few seconds…</span>';
  }

  says.innerHTML = line;
  betControls.classList.toggle('hidden', !showBet);

  if (showBet) {
    document.querySelectorAll('.chip').forEach(chip => {
      const amt = chip.dataset.amt === 'max' ? 1 : parseInt(chip.dataset.amt);
      chip.disabled = amt > me.money;
    });
  }
}

function renderDealer(data) {
  const dealerHandEl = document.getElementById('dealer-hand');
  const dealerValueEl = document.getElementById('dealer-value');

  dealerHandEl.innerHTML = '';
  if (data.dealer.hand.length === 0) {
    dealerHandEl.innerHTML = '<div class="card-slot"></div><div class="card-slot"></div>';
  } else {
    data.dealer.hand.forEach(card => dealerHandEl.appendChild(createCardElement(card)));
  }

  dealerValueEl.textContent = data.dealer.handValue !== null ? `Value: ${data.dealer.handValue}` : '';
}

function renderPlayers(data) {
  const playersSection = document.getElementById('players-section');
  playersSection.innerHTML = '';

  data.players.forEach(player => {
    const playerBox = document.createElement('div');
    playerBox.className = 'player-box';

    if (player.id === data.currentPlayerId && player.status === 'playing') playerBox.classList.add('active');
    if (data.gameState === 'results' && ['won', 'lost', 'push'].includes(player.status)) playerBox.classList.add(player.status);

    const statusText = {
      betting: 'Choosing a bet…',
      ready: 'Bet placed ✓',
      busted: 'BUSTED!',
      standing: 'Standing',
      sitting: 'Joins next hand',
      won: 'WON! 🎉',
      lost: 'Lost',
      push: 'Push'
    }[player.status] || (player.status === 'playing'
      ? (player.id === data.currentPlayerId ? 'Their turn' : 'Waiting…')
      : '');

    const handHtml = player.hand.length
      ? player.hand.map(card => createCardElement(card).outerHTML).join('')
      : '<div class="card-slot small"></div><div class="card-slot small"></div>';

    playerBox.innerHTML = `
      <div class="player-info">
        <span class="player-name">${escapeHtml(player.name)}${player.id === myPlayerId ? ' (You)' : ''}</span>
        <span class="player-money">${money(player.money)}</span>
      </div>
      ${player.bet ? `<div class="player-bet">Bet: ${money(player.bet)}</div>` : ''}
      <div class="hand">${handHtml}</div>
      ${player.hand.length ? `<div class="hand-value">Value: ${player.handValue}</div>` : ''}
      <div class="player-status">${statusText}</div>
    `;

    playersSection.appendChild(playerBox);
  });
}

function renderActions(data, me) {
  const actionsPanel = document.getElementById('actions-panel');
  const isMyTurn = data.gameState === 'playing' && data.currentPlayerId === myPlayerId && me.status === 'playing';

  actionsPanel.classList.toggle('hidden', !isMyTurn);
  if (isMyTurn) {
    document.getElementById('double-btn').disabled = me.hand.length !== 2 || me.money < me.bet;
  }
}

function createCardElement(card) {
  if (card.suit === '?') {
    const cardBack = document.createElement('div');
    cardBack.className = 'card-back';
    cardBack.textContent = '?';
    return cardBack;
  }

  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  if (card.suit === '♥' || card.suit === '♦') {
    cardEl.classList.add('red');
  }

  cardEl.innerHTML = `
    <div>${card.value}</div>
    <div class="card-suit">${card.suit}</div>
  `;

  return cardEl;
}

socket.on('error', (data) => {
  alert(data.message);
});
