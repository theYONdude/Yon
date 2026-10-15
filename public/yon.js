const socket = io();

let currentLobbyCode = null;
let myPlayerId = null;
let isHost = false;
let myHand = [];
let currentColor = null;
let isMyTurn = false;
let pendingWildCard = null;

const screens = {
  lobby: document.getElementById('lobby-screen'),
  waiting: document.getElementById('waiting-screen'),
  game: document.getElementById('game-screen'),
  results: document.getElementById('results-screen')
};

function showScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

document.getElementById('create-lobby-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) {
    alert('Please enter your name');
    return;
  }
  socket.emit('createYonLobby', { name });
});

document.getElementById('join-lobby-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  const code = document.getElementById('lobby-code-input').value.trim().toUpperCase();
  if (!name || !code) {
    alert('Please enter your name and lobby code');
    return;
  }
  socket.emit('joinYonLobby', { name, code });
});

document.getElementById('start-game-btn').addEventListener('click', () => {
  socket.emit('startYonGame', { code: currentLobbyCode });
});

document.getElementById('draw-pile').addEventListener('click', () => {
  if (isMyTurn) {
    socket.emit('yonDrawCard', { code: currentLobbyCode });
  }
});

document.getElementById('play-again-btn').addEventListener('click', () => {
  socket.emit('restartYonGame', { code: currentLobbyCode });
});

document.getElementById('secret-btn').addEventListener('click', () => {
  if (myHand.length > 0 && currentLobbyCode) {
    socket.emit('yonCheat', { code: currentLobbyCode });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'y' || e.key === 'Y') {
    if (myHand.length > 0 && currentLobbyCode) {
      socket.emit('yonCheat', { code: currentLobbyCode });
    }
  }
});


socket.on('yonLobbyCreated', (data) => {
  currentLobbyCode = data.code;
  myPlayerId = socket.id;
  isHost = data.isHost;
  document.getElementById('display-lobby-code').textContent = data.code;
  document.getElementById('start-game-btn').classList.remove('hidden');
  document.querySelector('.waiting-text').classList.add('hidden');
  showScreen('waiting');
});

socket.on('yonLobbyJoined', (data) => {
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

socket.on('yonPlayersUpdate', (players) => {
  const playersList = document.getElementById('players-list');
  playersList.innerHTML = '';
  
  players.forEach(player => {
    const div = document.createElement('div');
    div.className = 'player-item';
    div.innerHTML = `<span>${player.name} ${player.id === myPlayerId ? '(You)' : ''}</span>`;
    playersList.appendChild(div);
  });
  
  const playersNeededMsg = document.getElementById('players-needed-msg');
  if (isHost && players.length < 2) {
    document.getElementById('start-game-btn').disabled = true;
    if (playersNeededMsg) {
      playersNeededMsg.textContent = `Need at least 2 players to start (currently ${players.length})`;
      playersNeededMsg.classList.remove('hidden');
    }
  } else if (isHost) {
    document.getElementById('start-game-btn').disabled = false;
    if (playersNeededMsg) {
      playersNeededMsg.classList.add('hidden');
    }
  }
});

socket.on('yonGameState', (data) => {
  showScreen('game');
  
  myHand = data.myHand;
  currentColor = data.currentColor;
  isMyTurn = data.currentPlayerId === myPlayerId;
  
  renderOpponents(data.players, data.currentPlayerId);
  renderTopCard(data.topCard);
  renderCurrentColor(data.currentColor);
  renderMyHand(data.myHand, data.topCard, data.currentColor, isMyTurn);
  renderGameMessage(data, isMyTurn);
});

socket.on('yonGameOver', (data) => {
  showScreen('results');
  
  const winnerAnnouncement = document.getElementById('winner-announcement');
  const winner = data.standings[0];
  winnerAnnouncement.textContent = `🎉 ${winner.name} Wins! 🎉`;
  
  const standingsEl = document.getElementById('final-standings');
  standingsEl.innerHTML = '';
  
  data.standings.forEach((player, index) => {
    const item = document.createElement('div');
    item.className = 'standing-item' + (index === 0 ? ' winner' : '');
    item.innerHTML = `
      <span class="standing-rank">#${index + 1}</span>
      <span class="standing-name">${player.name}${player.id === myPlayerId ? ' (You)' : ''}</span>
      <span class="standing-cards">${player.cardCount} cards left</span>
    `;
    standingsEl.appendChild(item);
  });
  
  if (isHost) {
    document.getElementById('play-again-btn').classList.remove('hidden');
    document.getElementById('waiting-host-text').classList.add('hidden');
  } else {
    document.getElementById('play-again-btn').classList.add('hidden');
    document.getElementById('waiting-host-text').classList.remove('hidden');
  }
});

function renderOpponents(players, currentPlayerId) {
  const opponentsArea = document.getElementById('opponents-area');
  opponentsArea.innerHTML = '';
  
  players.filter(p => p.id !== myPlayerId).forEach(player => {
    const opponent = document.createElement('div');
    opponent.className = 'opponent' + (player.id === currentPlayerId ? ' active' : '');
    
    const miniCards = Array(Math.min(player.cardCount, 7)).fill('<div class="mini-card"></div>').join('');
    
    opponent.innerHTML = `
      <div class="opponent-name">${player.name}</div>
      <div class="opponent-cards">${miniCards}</div>
      <div class="card-count">${player.cardCount} cards</div>
    `;
    opponentsArea.appendChild(opponent);
  });
}

function renderTopCard(topCard) {
  const topCardEl = document.getElementById('top-card');
  topCardEl.className = 'card ' + (topCard.color || 'wild');
  topCardEl.innerHTML = `
    <span class="card-symbol">${getCardSymbol(topCard)}</span>
    <span class="card-value">${getCardDisplay(topCard)}</span>
    <span class="card-symbol-bottom">${getCardSymbol(topCard)}</span>
  `;
}

function renderCurrentColor(color) {
  const colorEl = document.getElementById('current-color');
  colorEl.className = 'current-color ' + color;
  colorEl.textContent = 'Current: ' + color.toUpperCase();
}

function renderMyHand(hand, topCard, currentColor, isMyTurn) {
  const handEl = document.getElementById('my-hand');
  handEl.innerHTML = '';
  
  hand.forEach((card, index) => {
    const cardEl = document.createElement('div');
    const isPlayable = isMyTurn && canPlayCard(card, topCard, currentColor);
    cardEl.className = 'card ' + (card.color || 'wild') + (isPlayable ? ' playable' : ' not-playable');
    cardEl.innerHTML = `
      <span class="card-symbol">${getCardSymbol(card)}</span>
      <span class="card-value">${getCardDisplay(card)}</span>
      <span class="card-symbol-bottom">${getCardSymbol(card)}</span>
    `;
    
    if (isPlayable) {
      cardEl.addEventListener('click', () => playCard(index, card));
    }
    
    handEl.appendChild(cardEl);
  });
}

function renderGameMessage(data, isMyTurn) {
  const messageEl = document.getElementById('game-message');
  
  if (isMyTurn) {
    messageEl.textContent = "Your Turn! Play a card or draw from the deck.";
    messageEl.style.color = '#feca57';
  } else {
    const currentPlayer = data.players.find(p => p.id === data.currentPlayerId);
    messageEl.textContent = `Waiting for ${currentPlayer ? currentPlayer.name : 'player'}...`;
    messageEl.style.color = 'white';
  }
  
  if (data.direction === 1) {
    messageEl.textContent += ' ➡️';
  } else {
    messageEl.textContent += ' ⬅️';
  }
}

function canPlayCard(card, topCard, currentColor) {
  if (card.type === 'wild' || card.type === 'wild4') {
    return true;
  }
  if (card.color === currentColor) {
    return true;
  }
  if (card.value === topCard.value) {
    return true;
  }
  return false;
}

function playCard(index, card) {
  if (card.type === 'wild' || card.type === 'wild4') {
    const colors = ['red', 'blue', 'green', 'yellow'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    socket.emit('yonPlayCard', { code: currentLobbyCode, cardIndex: index, chosenColor: randomColor });
  } else {
    socket.emit('yonPlayCard', { code: currentLobbyCode, cardIndex: index });
  }
}

function getCardDisplay(card) {
  switch(card.type) {
    case 'skip': return '⊘';
    case 'reverse': return '⟲';
    case 'draw2': return '+2';
    case 'wild': return 'W';
    case 'wild4': return '+4';
    default: return card.value;
  }
}

function getCardSymbol(card) {
  if (card.type === 'wild' || card.type === 'wild4') {
    return '✦';
  }
  return getCardDisplay(card);
}

socket.on('error', (data) => {
  alert(data.message);
});
