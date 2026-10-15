const socket = io();

let currentLobbyCode = null;
let myPlayerId = null;
let isHost = false;
let gameState = null;
let isMyTurn = false;

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#27ae60', '#9b59b6'];
const PLAYER_ICONS = ['🔴', '🔵', '🟢', '🟣'];

const BOARD_TILES = [
  { name: 'GO', type: 'go' },
  { name: 'Brown St', type: 'property', color: 'brown', price: 60, rent: 4 },
  { name: 'Yon Card', type: 'yon' },
  { name: 'Brown Ave', type: 'property', color: 'brown', price: 60, rent: 4 },
  { name: 'Tax', type: 'tax', amount: 200 },
  { name: 'Railroad', type: 'railroad', price: 200 },
  { name: 'Light Blue', type: 'property', color: 'lightblue', price: 100, rent: 6 },
  { name: 'Yon Card', type: 'yon' },
  { name: 'Light Blue', type: 'property', color: 'lightblue', price: 100, rent: 6 },
  { name: 'Light Blue', type: 'property', color: 'lightblue', price: 120, rent: 8 },
  { name: 'Jail', type: 'jail' },
  { name: 'Pink St', type: 'property', color: 'pink', price: 140, rent: 10 },
  { name: 'Electric', type: 'utility', price: 150 },
  { name: 'Pink Ave', type: 'property', color: 'pink', price: 140, rent: 10 },
  { name: 'Pink Blvd', type: 'property', color: 'pink', price: 160, rent: 12 },
  { name: 'Railroad', type: 'railroad', price: 200 },
  { name: 'Orange St', type: 'property', color: 'orange', price: 180, rent: 14 },
  { name: 'Yon Card', type: 'yon' },
  { name: 'Orange Ave', type: 'property', color: 'orange', price: 180, rent: 14 },
  { name: 'Orange Blvd', type: 'property', color: 'orange', price: 200, rent: 16 },
  { name: 'Free Park', type: 'free' },
  { name: 'Red St', type: 'property', color: 'red', price: 220, rent: 18 },
  { name: 'Yon Card', type: 'yon' },
  { name: 'Red Ave', type: 'property', color: 'red', price: 220, rent: 18 },
  { name: 'Red Blvd', type: 'property', color: 'red', price: 240, rent: 20 },
  { name: 'Railroad', type: 'railroad', price: 200 },
  { name: 'Yellow St', type: 'property', color: 'yellow', price: 260, rent: 22 },
  { name: 'Yellow Ave', type: 'property', color: 'yellow', price: 260, rent: 22 },
  { name: 'Water', type: 'utility', price: 150 },
  { name: 'Yellow Blvd', type: 'property', color: 'yellow', price: 280, rent: 24 },
  { name: 'Go Jail', type: 'gotojail' },
  { name: 'Green St', type: 'property', color: 'green', price: 300, rent: 26 },
  { name: 'Green Ave', type: 'property', color: 'green', price: 300, rent: 26 },
  { name: 'Yon Card', type: 'yon' },
  { name: 'Green Blvd', type: 'property', color: 'green', price: 320, rent: 28 },
  { name: 'Railroad', type: 'railroad', price: 200 },
  { name: 'Yon Card', type: 'yon' },
  { name: 'Blue Ave', type: 'property', color: 'blue', price: 350, rent: 35 },
  { name: 'Luxury Tax', type: 'tax', amount: 100 },
  { name: 'Blue Blvd', type: 'property', color: 'blue', price: 400, rent: 50 }
];

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
  if (!name) { alert('Please enter your name'); return; }
  socket.emit('createYonopolyLobby', { name });
});

document.getElementById('join-lobby-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  const code = document.getElementById('lobby-code-input').value.trim().toUpperCase();
  if (!name || !code) { alert('Please enter your name and lobby code'); return; }
  socket.emit('joinYonopolyLobby', { name, code });
});

document.getElementById('start-game-btn').addEventListener('click', () => {
  socket.emit('startYonopolyGame', { code: currentLobbyCode });
});

document.getElementById('roll-dice-btn').addEventListener('click', () => {
  socket.emit('yonopolyRollDice', { code: currentLobbyCode });
});

document.getElementById('buy-property-btn').addEventListener('click', () => {
  socket.emit('yonopolyBuyProperty', { code: currentLobbyCode });
});

document.getElementById('end-turn-btn').addEventListener('click', () => {
  socket.emit('yonopolyEndTurn', { code: currentLobbyCode });
});

document.getElementById('play-again-btn').addEventListener('click', () => {
  socket.emit('restartYonopolyGame', { code: currentLobbyCode });
});

socket.on('yonopolyLobbyCreated', (data) => {
  currentLobbyCode = data.code;
  myPlayerId = socket.id;
  isHost = true;
  document.getElementById('display-lobby-code').textContent = data.code;
  document.getElementById('start-game-btn').classList.remove('hidden');
  document.querySelector('.waiting-text').classList.add('hidden');
  showScreen('waiting');
});

socket.on('yonopolyLobbyJoined', (data) => {
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

socket.on('yonopolyPlayersUpdate', (players) => {
  const playersList = document.getElementById('players-list');
  playersList.innerHTML = '';
  players.forEach((player, i) => {
    const div = document.createElement('div');
    div.className = 'player-item';
    div.innerHTML = `<span>${PLAYER_ICONS[i]} ${player.name} ${player.id === myPlayerId ? '(You)' : ''}</span>`;
    playersList.appendChild(div);
  });

  const startBtn = document.getElementById('start-game-btn');
  if (isHost) {
    startBtn.disabled = players.length < 2;
    document.getElementById('players-needed-msg').textContent = 
      players.length < 2 ? `Need at least 2 players (currently ${players.length})` : 'Ready to start!';
  }
});

socket.on('yonopolyGameState', (data) => {
  gameState = data;
  showScreen('game');
  
  const me = data.players.find(p => p.id === myPlayerId);
  isMyTurn = data.currentPlayerId === myPlayerId;
  
  document.getElementById('my-cash').textContent = me ? me.cash : 0;
  document.getElementById('current-turn').textContent = isMyTurn ? "🎲 Your Turn!" : `Waiting for ${data.players.find(p => p.id === data.currentPlayerId)?.name || 'player'}...`;
  
  renderBoard(data);
  renderPlayersStatus(data);
  renderYonHand(me?.yonHand || []);
  updateActionButtons(data, me);
});

socket.on('yonopolyDiceRolled', (data) => {
  document.getElementById('dice-result').textContent = `🎲 ${data.dice1} + ${data.dice2} = ${data.total}`;
  addLog(`${data.playerName} rolled ${data.dice1} + ${data.dice2} = ${data.total}`);
});

socket.on('yonopolyLog', (data) => {
  addLog(data.message);
});

socket.on('yonopolyGameOver', (data) => {
  showScreen('results');
  document.getElementById('winner-announcement').textContent = `🎉 ${data.winnerName} Wins! 🎉`;
  
  const standingsEl = document.getElementById('final-standings');
  standingsEl.innerHTML = '';
  data.standings.forEach((player, index) => {
    const item = document.createElement('div');
    item.className = 'standing-item' + (index === 0 ? ' winner' : '');
    item.innerHTML = `
      <span>#${index + 1} ${player.name}</span>
      <span>$${player.cash}</span>
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

socket.on('error', (data) => {
  alert(data.message);
});

function renderBoard(data) {
  const board = document.getElementById('game-board');
  board.innerHTML = '';
  
  const positions = [];
  for (let i = 0; i < 11; i++) positions.push([0, 10 - i]);
  for (let i = 1; i < 11; i++) positions.push([i, 0]);
  for (let i = 1; i < 11; i++) positions.push([10, i]);
  for (let i = 9; i >= 0; i--) positions.push([i, 10]);

  for (let row = 0; row < 11; row++) {
    for (let col = 0; col < 11; col++) {
      const tile = document.createElement('div');
      
      const tileIndex = positions.findIndex(p => p[0] === col && p[1] === row);
      
      if (tileIndex !== -1) {
        const tileData = BOARD_TILES[tileIndex];
        const ownership = data.properties[tileIndex];
        
        tile.className = 'tile' + (tileData.type === 'go' || tileData.type === 'jail' || tileData.type === 'free' || tileData.type === 'gotojail' ? ' corner' : '');
        
        let colorBar = '';
        if (tileData.color) {
          colorBar = `<div class="tile-color color-${tileData.color}"></div>`;
        }
        
        let ownerMarker = '';
        if (ownership) {
          const ownerIndex = data.players.findIndex(p => p.id === ownership);
          if (ownerIndex !== -1) {
            ownerMarker = `<div class="owned-marker" style="background:${PLAYER_COLORS[ownerIndex]}"></div>`;
          }
        }
        
        const playersHere = data.players.filter(p => p.position === tileIndex && !p.bankrupt);
        let playerTokens = '';
        if (playersHere.length > 0) {
          playerTokens = '<div class="players-on-tile">' + 
            playersHere.map((p, i) => {
              const idx = data.players.findIndex(pl => pl.id === p.id);
              return `<div class="player-token" style="background:${PLAYER_COLORS[idx]}">${p.name[0]}</div>`;
            }).join('') + '</div>';
        }
        
        let icon = '';
        if (tileData.type === 'go') icon = '➡️GO';
        else if (tileData.type === 'jail') icon = '🔒';
        else if (tileData.type === 'free') icon = '🅿️';
        else if (tileData.type === 'gotojail') icon = '👮';
        else if (tileData.type === 'yon') icon = '🃏';
        else if (tileData.type === 'tax') icon = '💸';
        else if (tileData.type === 'railroad') icon = '🚂';
        else if (tileData.type === 'utility') icon = '💡';
        
        tile.innerHTML = `
          ${colorBar}
          <div class="tile-name">${icon || tileData.name}</div>
          ${tileData.price ? `<div class="tile-price">$${tileData.price}</div>` : ''}
          ${ownerMarker}
          ${playerTokens}
        `;
        
        tile.addEventListener('click', () => showTileInfo(tileIndex, tileData, ownership, data));
      } else {
        tile.className = 'tile';
        tile.style.background = 'transparent';
      }
      
      board.appendChild(tile);
    }
  }
}

function renderPlayersStatus(data) {
  const container = document.getElementById('players-status');
  container.innerHTML = '';
  
  data.players.forEach((player, index) => {
    const div = document.createElement('div');
    div.className = 'player-status' + (player.id === data.currentPlayerId ? ' current-turn' : '') + (player.bankrupt ? ' bankrupt' : '');
    div.innerHTML = `
      <div class="player-name-token">
        <div class="player-token" style="background:${PLAYER_COLORS[index]}">${player.name[0]}</div>
        <span>${player.name}${player.id === myPlayerId ? ' (You)' : ''}</span>
      </div>
      <span>$${player.cash}</span>
    `;
    container.appendChild(div);
  });
}

function renderYonHand(hand) {
  const container = document.getElementById('yon-hand');
  container.innerHTML = '';
  
  hand.forEach((card, index) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'yon-card ' + (card.color || 'wild');
    cardEl.textContent = getCardDisplay(card);
    cardEl.title = getCardDescription(card);
    cardEl.addEventListener('click', () => {
      if (isMyTurn) {
        socket.emit('yonopolyPlayCard', { code: currentLobbyCode, cardIndex: index });
      }
    });
    container.appendChild(cardEl);
  });
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

function getCardDescription(card) {
  switch(card.type) {
    case 'skip': return 'Skip: Next player loses their turn';
    case 'reverse': return 'Reverse: Reverse turn order';
    case 'draw2': return '+2: Steal $200 from any player';
    case 'wild': return 'Wild: Collect a $100 bonus';
    case 'wild4': return '+4: Steal $400 from any player!';
    default: return `${card.color} ${card.value}: Collect $${card.value * 10} from bank`;
  }
}

function updateActionButtons(data, me) {
  const rollBtn = document.getElementById('roll-dice-btn');
  const buyBtn = document.getElementById('buy-property-btn');
  const endBtn = document.getElementById('end-turn-btn');
  
  rollBtn.classList.toggle('hidden', !isMyTurn || data.hasRolled);
  endBtn.classList.toggle('hidden', !isMyTurn || !data.hasRolled);
  
  if (isMyTurn && data.hasRolled && me) {
    const tile = BOARD_TILES[me.position];
    const canBuy = tile && (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility') 
                   && !data.properties[me.position] && me.cash >= tile.price;
    buyBtn.classList.toggle('hidden', !canBuy);
  } else {
    buyBtn.classList.add('hidden');
  }
}

function showTileInfo(index, tile, ownerId, data) {
  const popup = document.getElementById('property-popup');
  const title = document.getElementById('popup-title');
  const desc = document.getElementById('popup-desc');
  const actions = document.getElementById('popup-actions');
  
  title.textContent = tile.name;
  
  let info = '';
  if (tile.type === 'property') {
    info = `Price: $${tile.price} | Rent: $${tile.rent * 2}`;
    if (ownerId) {
      const owner = data.players.find(p => p.id === ownerId);
      info += ` | Owner: ${owner?.name || 'Unknown'}`;
    }
  } else if (tile.type === 'yon') {
    info = 'Draw a Yon card for special powers!';
  } else if (tile.type === 'tax') {
    info = `Pay $${tile.amount} tax`;
  }
  
  desc.textContent = info;
  actions.innerHTML = '<button class="btn" onclick="closePopup()">Close</button>';
  popup.classList.remove('hidden');
}

function closePopup() {
  document.getElementById('property-popup').classList.add('hidden');
}

function addLog(message) {
  const log = document.getElementById('game-log');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = message;
  log.insertBefore(entry, log.firstChild);
  if (log.children.length > 20) log.removeChild(log.lastChild);
}
