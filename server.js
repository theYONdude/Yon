const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/blackjack', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/imposter', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'imposter.html'));
});

app.get('/yon', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'yon.html'));
});

app.get('/yonopoly', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'yonopoly.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

const blackjackLobbies = new Map();
const imposterLobbies = new Map();
const yonLobbies = new Map();
const yonopolyLobbies = new Map();

const IMPOSTER_WORDS = [
  'Pizza', 'Coffee', 'Guitar', 'Ocean', 'Mountain', 'Sunset', 'Rainbow', 'Thunder',
  'Chocolate', 'Butterfly', 'Dragon', 'Castle', 'Wizard', 'Treasure', 'Diamond', 'Crown',
  'Phoenix', 'Unicorn', 'Vampire', 'Zombie', 'Robot', 'Spaceship', 'Planet', 'Galaxy',
  'Tornado', 'Volcano', 'Jungle', 'Desert', 'Iceberg', 'Waterfall', 'Forest', 'Beach',
  'Apple', 'Banana', 'Strawberry', 'Mango', 'Pineapple', 'Coconut', 'Lemon', 'Orange',
  'Tiger', 'Lion', 'Elephant', 'Giraffe', 'Penguin', 'Dolphin', 'Shark', 'Eagle',
  'Basketball', 'Football', 'Tennis', 'Hockey', 'Baseball', 'Swimming', 'Running', 'Cycling'
];

function generateLobbyCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  
  for (let i = 0; i < 6; i++) {
    for (const suit of suits) {
      for (const value of values) {
        deck.push({ suit, value });
      }
    }
  }
  
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

function getCardValue(card) {
  if (card.value === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.value)) return 10;
  return parseInt(card.value);
}

function calculateHandValue(hand) {
  let value = 0;
  let aces = 0;
  
  for (const card of hand) {
    const cardValue = getCardValue(card);
    value += cardValue;
    if (card.value === 'A') aces++;
  }
  
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  
  return value;
}

function createBlackjackLobby(hostId, hostName) {
  const code = generateLobbyCode();
  blackjackLobbies.set(code, {
    code,
    hostId,
    players: new Map([[hostId, { id: hostId, name: hostName, money: 1000, bet: 0, hand: [], status: 'waiting' }]]),
    gameState: 'lobby',
    deck: [],
    dealerHand: [],
    currentPlayerIndex: 0,
    playersOrder: [hostId]
  });
  return code;
}

const BJ_MIN_BET = 10;
const BJ_START_MONEY = 1000;

function bjPlayersPayload(lobby) {
  return Array.from(lobby.players.values()).map(p => ({
    id: p.id, name: p.name, money: p.money, bet: p.bet, status: p.status
  }));
}

function startBlackjackGame(lobbyCode) {
  const lobby = blackjackLobbies.get(lobbyCode);
  if (!lobby) return;

  clearTimeout(lobby.nextRoundTimer);
  lobby.deck = createDeck();
  lobby.dealerHand = [];
  lobby.currentPlayerIndex = 0;
  lobby.gameState = 'betting';

  for (const player of lobby.players.values()) {
    player.hand = [];
    player.bet = 0;
    player.status = 'betting';
    // Broke players get re-staked so they are never stuck unable to bet
    player.rebought = player.money < BJ_MIN_BET;
    if (player.rebought) player.money = BJ_START_MONEY;
  }

  io.to(lobbyCode).emit('gameStarted', { gameState: 'betting' });
  broadcastBlackjackGameState(lobbyCode);
}

function bjCheckAllBetsIn(lobbyCode) {
  const lobby = blackjackLobbies.get(lobbyCode);
  if (!lobby || lobby.gameState !== 'betting') return;
  const players = Array.from(lobby.players.values());
  if (players.length > 0 && players.every(p => p.status === 'ready')) {
    dealInitialCards(lobbyCode);
  } else {
    broadcastBlackjackGameState(lobbyCode);
  }
}

function dealInitialCards(lobbyCode) {
  const lobby = blackjackLobbies.get(lobbyCode);
  if (!lobby) return;

  for (const playerId of lobby.playersOrder) {
    const player = lobby.players.get(playerId);
    if (player.status !== 'ready') continue;
    player.hand = [lobby.deck.pop(), lobby.deck.pop()];
    player.status = 'playing';
    player.rebought = false;
  }

  lobby.dealerHand = [lobby.deck.pop(), lobby.deck.pop()];
  lobby.gameState = 'playing';
  lobby.currentPlayerIndex = 0;

  bjAdvanceToPlayable(lobbyCode);
}

// Moves currentPlayerIndex forward to the next player who is still playing.
// If nobody is left, the dealer plays.
function bjAdvanceToPlayable(lobbyCode) {
  const lobby = blackjackLobbies.get(lobbyCode);
  if (!lobby) return;
  while (lobby.currentPlayerIndex < lobby.playersOrder.length) {
    const p = lobby.players.get(lobby.playersOrder[lobby.currentPlayerIndex]);
    if (p && p.status === 'playing') break;
    lobby.currentPlayerIndex++;
  }
  if (lobby.currentPlayerIndex >= lobby.playersOrder.length) {
    playDealerTurn(lobbyCode);
  } else {
    broadcastBlackjackGameState(lobbyCode);
  }
}

function broadcastBlackjackGameState(lobbyCode) {
  const lobby = blackjackLobbies.get(lobbyCode);
  if (!lobby) return;

  const currentPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];

  const playerData = lobby.playersOrder.map(id => lobby.players.get(id)).filter(Boolean).map(p => ({
    id: p.id,
    name: p.name,
    money: p.money,
    bet: p.bet,
    hand: p.hand,
    handValue: calculateHandValue(p.hand),
    status: p.status,
    rebought: !!p.rebought
  }));

  let dealerHand = lobby.dealerHand;
  if (lobby.gameState === 'playing') dealerHand = [lobby.dealerHand[0], { suit: '?', value: '?' }];
  if (lobby.gameState === 'betting') dealerHand = [];

  io.to(lobbyCode).emit('gameState', {
    players: playerData,
    dealer: {
      hand: dealerHand,
      handValue: lobby.gameState === 'results' ? calculateHandValue(lobby.dealerHand) : null
    },
    currentPlayerId: lobby.gameState === 'playing' ? currentPlayerId : null,
    gameState: lobby.gameState,
    minBet: BJ_MIN_BET
  });
}

function nextBlackjackPlayer(lobbyCode) {
  const lobby = blackjackLobbies.get(lobbyCode);
  if (!lobby) return;
  lobby.currentPlayerIndex++;
  bjAdvanceToPlayable(lobbyCode);
}

function playDealerTurn(lobbyCode) {
  const lobby = blackjackLobbies.get(lobbyCode);
  if (!lobby) return;

  let dealerValue = calculateHandValue(lobby.dealerHand);
  while (dealerValue < 17) {
    lobby.dealerHand.push(lobby.deck.pop());
    dealerValue = calculateHandValue(lobby.dealerHand);
  }
  if (lobby.rigDealerBust) {
    lobby.rigDealerBust = false;
    while (dealerValue <= 21) {
      lobby.dealerHand.push({ suit: '♣', value: 'K' });
      dealerValue = calculateHandValue(lobby.dealerHand);
    }
  }

  resolveBlackjackRound(lobbyCode);
}

function resolveBlackjackRound(lobbyCode) {
  const lobby = blackjackLobbies.get(lobbyCode);
  if (!lobby) return;

  const dealerValue = calculateHandValue(lobby.dealerHand);
  const dealerBusted = dealerValue > 21;

  for (const player of lobby.players.values()) {
    // Players who joined mid-round have no hand and are not settled
    if (player.hand.length === 0 || player.bet === 0) continue;

    const playerValue = calculateHandValue(player.hand);
    if (playerValue > 21) {
      player.status = 'lost';
    } else if (dealerBusted || playerValue > dealerValue) {
      player.money += player.bet * 2;
      player.status = 'won';
    } else if (playerValue === dealerValue) {
      player.money += player.bet;
      player.status = 'push';
    } else {
      player.status = 'lost';
    }
  }

  lobby.gameState = 'results';
  broadcastBlackjackGameState(lobbyCode);

  clearTimeout(lobby.nextRoundTimer);
  lobby.nextRoundTimer = setTimeout(() => {
    if (blackjackLobbies.has(lobbyCode)) startBlackjackGame(lobbyCode);
  }, 5000);
}

function createImposterLobby(hostId, hostName) {
  const code = generateLobbyCode();
  imposterLobbies.set(code, {
    code,
    hostId,
    players: new Map([[hostId, { id: hostId, name: hostName, isImposter: false, clue: '', vote: null }]]),
    gameState: 'lobby',
    playersOrder: [hostId],
    word: '',
    imposterId: null,
    currentClueIndex: 0,
    votes: new Map(),
    revealedImposter: null
  });
  return code;
}

function startImposterGame(lobbyCode) {
  const lobby = imposterLobbies.get(lobbyCode);
  if (!lobby) {
    console.log('startImposterGame: lobby not found for code', lobbyCode);
    return;
  }
  
  console.log('Starting Imposter game for lobby:', lobbyCode);
  console.log('Players:', Array.from(lobby.players.keys()));
  
  lobby.word = IMPOSTER_WORDS[Math.floor(Math.random() * IMPOSTER_WORDS.length)];
  const randomIndex = Math.floor(Math.random() * lobby.playersOrder.length);
  lobby.imposterId = lobby.playersOrder[randomIndex];
  
  // Shuffle players order but ensure imposter is not first
  let shuffledOrder = [...lobby.playersOrder];
  for (let i = shuffledOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledOrder[i], shuffledOrder[j]] = [shuffledOrder[j], shuffledOrder[i]];
  }
  // If imposter is first, swap with a random other player
  if (shuffledOrder[0] === lobby.imposterId && shuffledOrder.length > 1) {
    const swapIndex = 1 + Math.floor(Math.random() * (shuffledOrder.length - 1));
    [shuffledOrder[0], shuffledOrder[swapIndex]] = [shuffledOrder[swapIndex], shuffledOrder[0]];
  }
  lobby.playersOrder = shuffledOrder;
  
  console.log('Selected word:', lobby.word);
  console.log('Imposter ID:', lobby.imposterId);
  
  for (const [playerId, player] of lobby.players.entries()) {
    player.isImposter = playerId === lobby.imposterId;
    player.clue = '';
    player.vote = null;
  }
  
  lobby.gameState = 'clues';
  lobby.currentClueIndex = 0;
  lobby.votes.clear();
  lobby.revealedImposter = null;
  
  for (const playerId of lobby.playersOrder) {
    const player = lobby.players.get(playerId);
    const wordToSend = player.isImposter ? null : lobby.word;
    console.log('Sending word to player', playerId, ':', player.isImposter ? 'IMPOSTER' : wordToSend);
    io.to(playerId).emit('imposterGameStarted', {
      word: wordToSend,
      isImposter: player.isImposter
    });
  }
  
  setTimeout(() => {
    broadcastImposterGameState(lobbyCode);
  }, 5000);
}

function broadcastImposterGameState(lobbyCode) {
  const lobby = imposterLobbies.get(lobbyCode);
  if (!lobby) return;
  
  const currentPlayerId = lobby.playersOrder[lobby.currentClueIndex];
  
  const playerData = Array.from(lobby.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    clue: p.clue,
    vote: p.vote
  }));
  
  io.to(lobbyCode).emit('imposterGameState', {
    players: playerData,
    currentPlayerId: lobby.gameState === 'clues' ? currentPlayerId : null,
    gameState: lobby.gameState,
    revealedImposter: lobby.revealedImposter
  });
}

function nextImposterClue(lobbyCode) {
  const lobby = imposterLobbies.get(lobbyCode);
  if (!lobby) return;
  
  lobby.currentClueIndex++;
  
  if (lobby.currentClueIndex >= lobby.playersOrder.length) {
    lobby.gameState = 'voting';
  }
  
  broadcastImposterGameState(lobbyCode);
}

function tallyImposterVotes(lobbyCode) {
  const lobby = imposterLobbies.get(lobbyCode);
  if (!lobby) return;
  
  const voteCounts = new Map();
  
  for (const player of lobby.players.values()) {
    if (player.vote) {
      voteCounts.set(player.vote, (voteCounts.get(player.vote) || 0) + 1);
    }
  }
  
  let maxVotes = 0;
  let votedOutId = null;
  
  for (const [playerId, count] of voteCounts.entries()) {
    if (count > maxVotes) {
      maxVotes = count;
      votedOutId = playerId;
    }
  }
  
  const votedOutPlayer = lobby.players.get(votedOutId);
  const imposterPlayer = lobby.players.get(lobby.imposterId);
  
  lobby.revealedImposter = {
    votedOutId,
    votedOutName: votedOutPlayer ? votedOutPlayer.name : 'Nobody',
    actualImposterId: lobby.imposterId,
    actualImposterName: imposterPlayer.name,
    word: lobby.word,
    playersGuessedCorrectly: votedOutId === lobby.imposterId
  };
  
  lobby.gameState = 'results';
  broadcastImposterGameState(lobbyCode);
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('createBlackjackLobby', (data) => {
    const code = createBlackjackLobby(socket.id, data.name);
    socket.join(code);
    socket.emit('blackjackLobbyCreated', { code, isHost: true });
    io.to(code).emit('blackjackPlayersUpdate', bjPlayersPayload(blackjackLobbies.get(code)));
  });
  
  socket.on('joinBlackjackLobby', (data) => {
    const lobby = blackjackLobbies.get(data.code);
    if (!lobby) {
      socket.emit('error', { message: 'Lobby not found' });
      return;
    }
    
    if (lobby.players.size >= 5) {
      socket.emit('error', { message: 'Lobby is full' });
      return;
    }

    // Joining during betting: bet right away. Mid-hand: sit out until next round.
    let status = 'waiting';
    if (lobby.gameState === 'betting') status = 'betting';
    else if (lobby.gameState === 'playing' || lobby.gameState === 'results') status = 'sitting';
    
    lobby.players.set(socket.id, {
      id: socket.id,
      name: data.name,
      money: BJ_START_MONEY,
      bet: 0,
      hand: [],
      status
    });
    lobby.playersOrder.push(socket.id);
    
    socket.join(data.code);
    socket.emit('blackjackLobbyJoined', { code: data.code, isHost: false });
    io.to(data.code).emit('blackjackPlayersUpdate', bjPlayersPayload(lobby));
    if (lobby.gameState !== 'lobby') broadcastBlackjackGameState(data.code);
  });
  
  socket.on('startBlackjackGame', (data) => {
    const lobby = blackjackLobbies.get(data.code);
    if (lobby && lobby.hostId === socket.id && lobby.players.size >= 1 && lobby.gameState === 'lobby') {
      startBlackjackGame(data.code);
    }
  });
  
  socket.on('placeBet', (data) => {
    const lobby = blackjackLobbies.get(data.code);
    if (!lobby || lobby.gameState !== 'betting') return;
    
    const player = lobby.players.get(socket.id);
    const amount = Math.floor(Number(data.amount));
    if (!player || player.status !== 'betting') return;
    if (!Number.isFinite(amount) || amount < BJ_MIN_BET || amount > player.money) {
      socket.emit('error', { message: `Bet must be between $${BJ_MIN_BET} and $${player.money}` });
      return;
    }
    
    player.bet = amount;
    player.money -= amount;
    player.status = 'ready';
    
    bjCheckAllBetsIn(data.code);
  });
  
  socket.on('hit', (data) => {
    const lobby = blackjackLobbies.get(data.code);
    if (!lobby || lobby.gameState !== 'playing') return;
    
    const currentPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];
    if (socket.id !== currentPlayerId) return;
    
    const player = lobby.players.get(socket.id);
    if (!player || player.status !== 'playing') return;
    player.hand.push(lobby.deck.pop());
    
    const handValue = calculateHandValue(player.hand);
    if (handValue > 21) {
      player.status = 'busted';
      nextBlackjackPlayer(data.code);
    } else {
      broadcastBlackjackGameState(data.code);
    }
  });
  
  socket.on('stand', (data) => {
    const lobby = blackjackLobbies.get(data.code);
    if (!lobby || lobby.gameState !== 'playing') return;
    
    const currentPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];
    if (socket.id !== currentPlayerId) return;
    
    const player = lobby.players.get(socket.id);
    if (!player || player.status !== 'playing') return;
    player.status = 'standing';
    nextBlackjackPlayer(data.code);
  });
  
  socket.on('double', (data) => {
    const lobby = blackjackLobbies.get(data.code);
    if (!lobby || lobby.gameState !== 'playing') return;
    
    const currentPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];
    if (socket.id !== currentPlayerId) return;
    
    const player = lobby.players.get(socket.id);
    if (!player || player.status !== 'playing') return;
    if (player.hand.length !== 2 || player.money < player.bet) {
      socket.emit('error', { message: 'Cannot double down' });
      return;
    }
    
    player.money -= player.bet;
    player.bet *= 2;
    player.hand.push(lobby.deck.pop());
    
    const handValue = calculateHandValue(player.hand);
    player.status = handValue > 21 ? 'busted' : 'standing';
    
    nextBlackjackPlayer(data.code);
  });
  
  socket.on('createImposterLobby', (data) => {
    const code = createImposterLobby(socket.id, data.name);
    socket.join(code);
    socket.emit('imposterLobbyCreated', { code, isHost: true });
    io.to(code).emit('imposterPlayersUpdate', Array.from(imposterLobbies.get(code).players.values()).map(p => ({ id: p.id, name: p.name })));
  });
  
  socket.on('joinImposterLobby', (data) => {
    const lobby = imposterLobbies.get(data.code);
    if (!lobby) {
      socket.emit('error', { message: 'Lobby not found' });
      return;
    }
    
    if (lobby.players.size >= 8) {
      socket.emit('error', { message: 'Lobby is full' });
      return;
    }
    
    lobby.players.set(socket.id, {
      id: socket.id,
      name: data.name,
      isImposter: false,
      clue: '',
      vote: null
    });
    lobby.playersOrder.push(socket.id);
    
    socket.join(data.code);
    socket.emit('imposterLobbyJoined', { code: data.code, isHost: false });
    io.to(data.code).emit('imposterPlayersUpdate', Array.from(lobby.players.values()).map(p => ({ id: p.id, name: p.name })));
  });
  
  socket.on('startImposterGame', (data) => {
    const lobby = imposterLobbies.get(data.code);
    if (lobby && lobby.hostId === socket.id && lobby.players.size >= 3) {
      startImposterGame(data.code);
    }
  });
  
  socket.on('submitClue', (data) => {
    const lobby = imposterLobbies.get(data.code);
    if (!lobby || lobby.gameState !== 'clues') return;
    
    const currentPlayerId = lobby.playersOrder[lobby.currentClueIndex];
    if (socket.id !== currentPlayerId) return;
    
    const player = lobby.players.get(socket.id);
    player.clue = data.clue;
    
    nextImposterClue(data.code);
  });
  
  socket.on('submitVote', (data) => {
    const lobby = imposterLobbies.get(data.code);
    if (!lobby || lobby.gameState !== 'voting') return;
    
    const player = lobby.players.get(socket.id);
    player.vote = data.votedPlayerId;
    
    const allVoted = Array.from(lobby.players.values()).every(p => p.vote !== null);
    
    if (allVoted) {
      tallyImposterVotes(data.code);
    } else {
      broadcastImposterGameState(data.code);
    }
  });
  
  socket.on('restartImposterGame', (data) => {
    const lobby = imposterLobbies.get(data.code);
    if (lobby && lobby.hostId === socket.id) {
      startImposterGame(data.code);
    }
  });
  
  // ==================== YON SOCKET HANDLERS ====================
  
  socket.on('createYonLobby', (data) => {
    const code = createYonLobby(socket.id, data.name);
    socket.join(code);
    socket.emit('yonLobbyCreated', { code, isHost: true });
    io.to(code).emit('yonPlayersUpdate', Array.from(yonLobbies.get(code).players.values()).map(p => ({ id: p.id, name: p.name })));
  });
  
  socket.on('joinYonLobby', (data) => {
    const lobby = yonLobbies.get(data.code);
    if (!lobby) {
      socket.emit('error', { message: 'Lobby not found' });
      return;
    }
    
    if (lobby.players.size >= 8) {
      socket.emit('error', { message: 'Lobby is full' });
      return;
    }
    
    if (lobby.gameState !== 'lobby') {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }
    
    lobby.players.set(socket.id, { id: socket.id, name: data.name, hand: [] });
    lobby.playersOrder.push(socket.id);
    
    socket.join(data.code);
    socket.emit('yonLobbyJoined', { code: data.code, isHost: false });
    io.to(data.code).emit('yonPlayersUpdate', Array.from(lobby.players.values()).map(p => ({ id: p.id, name: p.name })));
  });
  
  socket.on('startYonGame', (data) => {
    const lobby = yonLobbies.get(data.code);
    if (lobby && lobby.hostId === socket.id && lobby.players.size >= 2) {
      startYonGame(data.code);
    }
  });
  
  socket.on('yonPlayCard', (data) => {
    const lobby = yonLobbies.get(data.code);
    if (!lobby || lobby.gameState !== 'playing') return;
    
    const currentPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];
    if (socket.id !== currentPlayerId) return;
    
    const player = lobby.players.get(socket.id);
    const card = player.hand[data.cardIndex];
    if (!card) return;
    
    const topCard = lobby.discardPile[lobby.discardPile.length - 1];
    if (!canPlayYonCard(card, topCard, lobby.currentColor)) {
      socket.emit('error', { message: 'Cannot play this card' });
      return;
    }
    
    // Remove card from hand and add to discard pile
    player.hand.splice(data.cardIndex, 1);
    lobby.discardPile.push(card);
    
    // Set current color
    if (card.type === 'wild' || card.type === 'wild4') {
      lobby.currentColor = data.chosenColor || 'red';
    } else {
      lobby.currentColor = card.color;
    }
    
    // Check for winner
    const winner = checkYonWinner(data.code);
    if (winner) {
      endYonGame(data.code, winner);
      return;
    }
    
    // Handle special cards
    if (card.type === 'skip') {
      nextYonPlayer(data.code, 1); // Skip next player
    } else if (card.type === 'reverse') {
      if (lobby.playersOrder.length === 2) {
        // In 2-player game, reverse acts as skip
        nextYonPlayer(data.code, 1);
      } else {
        lobby.direction *= -1;
        nextYonPlayer(data.code, 0);
      }
    } else if (card.type === 'draw2') {
      nextYonPlayer(data.code, 0);
      const nextPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];
      drawYonCards(data.code, nextPlayerId, 2);
      nextYonPlayer(data.code, 0); // Skip their turn
    } else if (card.type === 'wild4') {
      nextYonPlayer(data.code, 0);
      const nextPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];
      drawYonCards(data.code, nextPlayerId, 4);
      nextYonPlayer(data.code, 0); // Skip their turn
    } else {
      nextYonPlayer(data.code, 0);
    }
    
    broadcastYonGameState(data.code);
  });
  
  socket.on('yonDrawCard', (data) => {
    const lobby = yonLobbies.get(data.code);
    if (!lobby || lobby.gameState !== 'playing') return;
    
    const currentPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];
    if (socket.id !== currentPlayerId) return;
    
    drawYonCards(data.code, socket.id, 1);
    nextYonPlayer(data.code, 0);
    broadcastYonGameState(data.code);
  });
  
  socket.on('restartYonGame', (data) => {
    const lobby = yonLobbies.get(data.code);
    if (lobby && lobby.hostId === socket.id) {
      lobby.gameState = 'lobby';
      startYonGame(data.code);
    }
  });

  socket.on('yonCheat', (data) => {
    const lobby = yonLobbies.get(data.code);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (!player || player.hand.length === 0) return;
    const randomIndex = Math.floor(Math.random() * player.hand.length);
    player.hand[randomIndex] = { color: null, value: 'wild4', type: 'wild4' };
    broadcastYonGameState(data.code);
  });

  // ==================== YONOPOLY SOCKET HANDLERS ====================

  socket.on('createYonopolyLobby', (data) => {
    const code = createYonopolyLobby(socket.id, data.name);
    socket.join(code);
    socket.emit('yonopolyLobbyCreated', { code, isHost: true });
    io.to(code).emit('yonopolyPlayersUpdate', Array.from(yonopolyLobbies.get(code).players.values()).map(p => ({ id: p.id, name: p.name })));
  });

  socket.on('joinYonopolyLobby', (data) => {
    const lobby = yonopolyLobbies.get(data.code);
    if (!lobby) {
      socket.emit('error', { message: 'Lobby not found' });
      return;
    }
    if (lobby.players.size >= 4) {
      socket.emit('error', { message: 'Lobby is full (max 4 players)' });
      return;
    }
    if (lobby.gameState !== 'lobby') {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }
    
    lobby.players.set(socket.id, {
      id: socket.id,
      name: data.name,
      cash: 1500,
      position: 0,
      yonHand: [],
      inJail: false,
      jailTurns: 0,
      bankrupt: false
    });
    lobby.playersOrder.push(socket.id);
    
    socket.join(data.code);
    socket.emit('yonopolyLobbyJoined', { code: data.code, isHost: false });
    io.to(data.code).emit('yonopolyPlayersUpdate', Array.from(lobby.players.values()).map(p => ({ id: p.id, name: p.name })));
  });

  socket.on('startYonopolyGame', (data) => {
    const lobby = yonopolyLobbies.get(data.code);
    if (lobby && lobby.hostId === socket.id && lobby.players.size >= 2) {
      startYonopolyGame(data.code);
    }
  });

  socket.on('yonopolyRollDice', (data) => {
    const lobby = yonopolyLobbies.get(data.code);
    if (!lobby || lobby.gameState !== 'playing') return;
    
    const currentPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];
    if (socket.id !== currentPlayerId || lobby.hasRolled) return;
    
    const player = lobby.players.get(socket.id);
    if (player.bankrupt) return;
    
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    const total = dice1 + dice2;
    
    lobby.hasRolled = true;
    
    const oldPosition = player.position;
    player.position = (player.position + total) % 40;
    
    if (player.position < oldPosition) {
      player.cash += 200;
      io.to(data.code).emit('yonopolyLog', { message: `${player.name} passed GO and collected $200!` });
    }
    
    io.to(data.code).emit('yonopolyDiceRolled', { dice1, dice2, total, playerName: player.name });
    
    const tile = YONOPOLY_BOARD[player.position];
    
    if (tile.type === 'yon') {
      const card = drawYonopolyCard(data.code, socket.id);
      if (card) {
        io.to(data.code).emit('yonopolyLog', { message: `${player.name} drew a Yon card!` });
      }
    } else if (tile.type === 'tax') {
      io.to(data.code).emit('yonopolyLog', { message: `${player.name} paid $${tile.amount} tax` });
      if (yonopolyCharge(data.code, player, tile.amount, null)) return;
    } else if (tile.type === 'gotojail') {
      player.position = 10;
      player.inJail = true;
      io.to(data.code).emit('yonopolyLog', { message: `${player.name} went to jail!` });
    } else if (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility') {
      const ownerId = lobby.properties[player.position];
      if (ownerId && ownerId !== socket.id) {
        const owner = lobby.players.get(ownerId);
        const rent = tile.rent * 2;
        io.to(data.code).emit('yonopolyLog', { message: `${player.name} paid $${rent} rent to ${owner?.name || 'owner'}` });
        if (yonopolyCharge(data.code, player, rent, owner)) return;
      }
    }
    
    broadcastYonopolyState(data.code);
  });

  socket.on('yonopolyBuyProperty', (data) => {
    const lobby = yonopolyLobbies.get(data.code);
    if (!lobby || lobby.gameState !== 'playing') return;
    
    const currentPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];
    if (socket.id !== currentPlayerId) return;
    
    const player = lobby.players.get(socket.id);
    const tile = YONOPOLY_BOARD[player.position];
    
    if ((tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility') && 
        !lobby.properties[player.position] && player.cash >= tile.price) {
      player.cash -= tile.price;
      lobby.properties[player.position] = socket.id;
      io.to(data.code).emit('yonopolyLog', { message: `${player.name} bought ${tile.name} for $${tile.price}` });
      broadcastYonopolyState(data.code);
    }
  });

  socket.on('yonopolyEndTurn', (data) => {
    const lobby = yonopolyLobbies.get(data.code);
    if (!lobby || lobby.gameState !== 'playing') return;
    
    const currentPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];
    if (socket.id !== currentPlayerId || !lobby.hasRolled) return;
    
    yonopolyNextTurn(data.code);
  });

  socket.on('yonopolyPlayCard', (data) => {
    const lobby = yonopolyLobbies.get(data.code);
    if (!lobby || lobby.gameState !== 'playing') return;
    
    const currentPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];
    if (socket.id !== currentPlayerId) return;
    
    const player = lobby.players.get(socket.id);
    const card = player.yonHand[data.cardIndex];
    if (!card) return;
    
    player.yonHand.splice(data.cardIndex, 1);
    
    if (card.type === 'number') {
      const amount = card.value * 10;
      player.cash += amount;
      io.to(data.code).emit('yonopolyLog', { message: `${player.name} played a ${card.color} ${card.value} and collected $${amount}!` });
    } else if (card.type === 'draw2') {
      const others = lobby.playersOrder.filter(id => id !== socket.id && !lobby.players.get(id).bankrupt);
      if (others.length > 0) {
        const targetId = others[Math.floor(Math.random() * others.length)];
        const target = lobby.players.get(targetId);
        const steal = Math.min(200, target.cash);
        target.cash -= steal;
        player.cash += steal;
        io.to(data.code).emit('yonopolyLog', { message: `${player.name} used +2 and stole $${steal} from ${target.name}!` });
      }
    } else if (card.type === 'wild4') {
      const others = lobby.playersOrder.filter(id => id !== socket.id && !lobby.players.get(id).bankrupt);
      if (others.length > 0) {
        const targetId = others[Math.floor(Math.random() * others.length)];
        const target = lobby.players.get(targetId);
        const steal = Math.min(400, target.cash);
        target.cash -= steal;
        player.cash += steal;
        io.to(data.code).emit('yonopolyLog', { message: `${player.name} used +4 and stole $${steal} from ${target.name}!` });
      }
    } else if (card.type === 'skip') {
      io.to(data.code).emit('yonopolyLog', { message: `${player.name} used Skip - next player loses their turn!` });
      yonopolyNextTurn(data.code);
    } else if (card.type === 'wild') {
      io.to(data.code).emit('yonopolyLog', { message: `${player.name} used Wild - collect $100 bonus!` });
      player.cash += 100;
    }
    
    broadcastYonopolyState(data.code);
  });

  socket.on('restartYonopolyGame', (data) => {
    const lobby = yonopolyLobbies.get(data.code);
    if (lobby && lobby.hostId === socket.id) {
      startYonopolyGame(data.code);
    }
  });
  
  // ==================== SECRET MENU (~) HACKS ====================
  socket.on('secretHack', (data) => {
    const reply = (message, ok = true) => socket.emit('secretResult', { ok, message });
    const { game, hack, code } = data || {};

    if (game === 'blackjack') {
      const lobby = blackjackLobbies.get(code);
      const me = lobby && lobby.players.get(socket.id);
      if (!me) return reply('Join a lobby first', false);
      switch (hack) {
        case 'money':
          me.money += 1000;
          broadcastBlackjackGameState(code);
          return reply('+$1,000 added to your balance');
        case 'peek': {
          if (lobby.gameState !== 'playing') return reply('Only works during a hand', false);
          const hole = lobby.dealerHand[1];
          const next = lobby.deck[lobby.deck.length - 1];
          return reply(`Dealer's hidden card: ${hole.value}${hole.suit}  ·  Next card in deck: ${next.value}${next.suit}`);
        }
        case 'perfect':
          if (lobby.gameState !== 'playing' || me.status !== 'playing') return reply('Wait for your turn', false);
          me.hand = [{ suit: '♠', value: 'A' }, { suit: '♠', value: 'K' }];
          broadcastBlackjackGameState(code);
          return reply('Your hand is now Blackjack (21)');
        case 'dealerbust':
          if (lobby.gameState !== 'playing' && lobby.gameState !== 'betting') return reply('Only works before the dealer plays', false);
          lobby.rigDealerBust = true;
          return reply('The dealer will bust this hand');
      }
    }

    if (game === 'imposter') {
      const lobby = imposterLobbies.get(code);
      if (!lobby || !lobby.players.has(socket.id)) return reply('Join a lobby first', false);
      if (!lobby.word || lobby.gameState === 'lobby') return reply('Start a round first', false);
      switch (hack) {
        case 'imposter': {
          const imp = lobby.players.get(lobby.imposterId);
          return reply(imp && imp.id === socket.id ? 'You are the imposter 😉' : `The imposter is ${imp ? imp.name : 'unknown'}`);
        }
        case 'word':
          return reply(`The secret word is "${lobby.word}"`);
      }
    }

    if (game === 'yon') {
      const lobby = yonLobbies.get(code);
      const me = lobby && lobby.players.get(socket.id);
      if (!me || lobby.gameState !== 'playing') return reply('Only works during a game', false);
      switch (hack) {
        case 'plus4':
          if (me.hand.length === 0) return reply('No cards to change', false);
          me.hand[Math.floor(Math.random() * me.hand.length)] = { color: null, value: 'wild4', type: 'wild4' };
          broadcastYonGameState(code);
          return reply('A random card became a +4');
        case 'wild':
          me.hand.push({ color: null, value: 'wild', type: 'wild' });
          broadcastYonGameState(code);
          return reply('Added a Wild card to your hand');
        case 'attack':
          for (const id of lobby.playersOrder) if (id !== socket.id) drawYonCards(code, id, 2);
          broadcastYonGameState(code);
          return reply('Every opponent drew 2 cards');
        case 'onecard':
          if (me.hand.length <= 1) return reply('You already have 1 card', false);
          me.hand = [{ color: null, value: 'wild', type: 'wild' }];
          broadcastYonGameState(code);
          return reply('Your hand is now a single Wild. Play it to win!');
        case 'peek': {
          const fmt = c => c.type === 'number' ? `${c.color} ${c.value}` : (c.color ? `${c.color} ${c.type}` : c.type);
          const lines = lobby.playersOrder.filter(id => id !== socket.id).map(id => {
            const p = lobby.players.get(id);
            return `${p.name}: ${p.hand.map(fmt).join(', ') || '(empty)'}`;
          });
          return reply(lines.join('\n') || 'No opponents');
        }
      }
    }

    if (game === 'yonopoly') {
      const lobby = yonopolyLobbies.get(code);
      const me = lobby && lobby.players.get(socket.id);
      if (!me || lobby.gameState !== 'playing') return reply('Only works during a game', false);
      const myTurn = lobby.playersOrder[lobby.currentPlayerIndex] === socket.id;
      switch (hack) {
        case 'money':
          me.cash += 1000;
          broadcastYonopolyState(code);
          return reply('+$1,000 cash');
        case 'plus4':
          me.yonHand.push({ color: null, value: 'wild4', type: 'wild4' });
          broadcastYonopolyState(code);
          return reply('Added a +4 card (steals $400)');
        case 'reroll':
          if (!myTurn) return reply('Wait for your turn', false);
          lobby.hasRolled = false;
          broadcastYonopolyState(code);
          return reply('You can roll again');
        case 'steal': {
          const theirs = Object.entries(lobby.properties).filter(([, owner]) => owner !== socket.id);
          if (theirs.length === 0) return reply('No one else owns property yet', false);
          const [pos, ownerId] = theirs[Math.floor(Math.random() * theirs.length)];
          lobby.properties[pos] = socket.id;
          const victim = lobby.players.get(ownerId);
          broadcastYonopolyState(code);
          return reply(`Stole ${YONOPOLY_BOARD[pos].name} from ${victim ? victim.name : 'someone'}`);
        }
      }
    }

    reply('Unknown hack', false);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    for (const [code, lobby] of blackjackLobbies.entries()) {
      if (lobby.players.has(socket.id)) {
        const removedIndex = lobby.playersOrder.indexOf(socket.id);
        lobby.players.delete(socket.id);
        lobby.playersOrder = lobby.playersOrder.filter(id => id !== socket.id);
        
        if (lobby.players.size === 0) {
          clearTimeout(lobby.nextRoundTimer);
          blackjackLobbies.delete(code);
        } else {
          if (lobby.hostId === socket.id && lobby.players.size > 0) {
            lobby.hostId = lobby.playersOrder[0];
          }
          io.to(code).emit('blackjackPlayersUpdate', bjPlayersPayload(lobby));
          if (lobby.gameState === 'betting') {
            bjCheckAllBetsIn(code);
          } else if (lobby.gameState === 'playing') {
            if (removedIndex < lobby.currentPlayerIndex) {
              lobby.currentPlayerIndex--;
              broadcastBlackjackGameState(code);
            } else if (removedIndex === lobby.currentPlayerIndex) {
              bjAdvanceToPlayable(code); // the leaver's turn passes on
            } else {
              broadcastBlackjackGameState(code);
            }
          } else if (lobby.gameState === 'results') {
            broadcastBlackjackGameState(code);
          }
        }
      }
    }
    
    for (const [code, lobby] of imposterLobbies.entries()) {
      if (lobby.players.has(socket.id)) {
        lobby.players.delete(socket.id);
        lobby.playersOrder = lobby.playersOrder.filter(id => id !== socket.id);
        
        if (lobby.players.size === 0) {
          imposterLobbies.delete(code);
        } else {
          if (lobby.hostId === socket.id && lobby.players.size > 0) {
            lobby.hostId = lobby.playersOrder[0];
          }
          io.to(code).emit('imposterPlayersUpdate', Array.from(lobby.players.values()).map(p => ({ id: p.id, name: p.name })));
        }
      }
    }
    
    for (const [code, lobby] of yonLobbies.entries()) {
      if (lobby.players.has(socket.id)) {
        lobby.players.delete(socket.id);
        lobby.playersOrder = lobby.playersOrder.filter(id => id !== socket.id);
        
        if (lobby.players.size === 0) {
          yonLobbies.delete(code);
        } else {
          if (lobby.hostId === socket.id && lobby.players.size > 0) {
            lobby.hostId = lobby.playersOrder[0];
          }
          if (lobby.gameState === 'lobby') {
            io.to(code).emit('yonPlayersUpdate', Array.from(lobby.players.values()).map(p => ({ id: p.id, name: p.name })));
          } else if (lobby.gameState === 'playing') {
            // Adjust current player index if needed
            if (lobby.currentPlayerIndex >= lobby.playersOrder.length) {
              lobby.currentPlayerIndex = 0;
            }
            broadcastYonGameState(code);
          }
        }
      }
    }
  });
});

// ==================== YON GAME FUNCTIONS ====================

const YON_COLORS = ['red', 'blue', 'green', 'yellow'];

function createYonDeck() {
  const deck = [];
  
  // Number cards (0-9) for each color
  for (const color of YON_COLORS) {
    // One 0 per color
    deck.push({ color, value: 0, type: 'number' });
    // Two of each 1-9 per color
    for (let i = 1; i <= 9; i++) {
      deck.push({ color, value: i, type: 'number' });
      deck.push({ color, value: i, type: 'number' });
    }
    // Two Skip, Reverse, Draw Two per color
    for (let i = 0; i < 2; i++) {
      deck.push({ color, value: 'skip', type: 'skip' });
      deck.push({ color, value: 'reverse', type: 'reverse' });
      deck.push({ color, value: 'draw2', type: 'draw2' });
    }
  }
  
  // Wild cards (4 of each)
  for (let i = 0; i < 4; i++) {
    deck.push({ color: null, value: 'wild', type: 'wild' });
    deck.push({ color: null, value: 'wild4', type: 'wild4' });
  }
  
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

function createYonLobby(hostId, hostName) {
  const code = generateLobbyCode();
  yonLobbies.set(code, {
    code,
    hostId,
    players: new Map([[hostId, { id: hostId, name: hostName, hand: [] }]]),
    playersOrder: [hostId],
    gameState: 'lobby',
    deck: [],
    discardPile: [],
    currentPlayerIndex: 0,
    direction: 1, // 1 = clockwise, -1 = counter-clockwise
    currentColor: null
  });
  return code;
}

function startYonGame(lobbyCode) {
  const lobby = yonLobbies.get(lobbyCode);
  if (!lobby) return;
  
  lobby.deck = createYonDeck();
  lobby.discardPile = [];
  lobby.currentPlayerIndex = 0;
  lobby.direction = 1;
  lobby.gameState = 'playing';
  
  // Deal 7 cards to each player
  for (const player of lobby.players.values()) {
    player.hand = [];
    for (let i = 0; i < 7; i++) {
      player.hand.push(lobby.deck.pop());
    }
  }
  
  // Put first card on discard pile (make sure it's not a wild card)
  let firstCard = lobby.deck.pop();
  while (firstCard.type === 'wild' || firstCard.type === 'wild4') {
    lobby.deck.unshift(firstCard);
    firstCard = lobby.deck.pop();
  }
  lobby.discardPile.push(firstCard);
  lobby.currentColor = firstCard.color;
  
  broadcastYonGameState(lobbyCode);
}

function broadcastYonGameState(lobbyCode) {
  const lobby = yonLobbies.get(lobbyCode);
  if (!lobby) return;
  
  const topCard = lobby.discardPile[lobby.discardPile.length - 1];
  const currentPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];
  
  // Send game state to each player (with their own hand)
  for (const [playerId, player] of lobby.players.entries()) {
    const playerData = Array.from(lobby.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length
    }));
    
    io.to(playerId).emit('yonGameState', {
      players: playerData,
      topCard,
      currentColor: lobby.currentColor,
      currentPlayerId,
      direction: lobby.direction,
      myHand: player.hand,
      cardsInDeck: lobby.deck.length
    });
  }
}

function canPlayYonCard(card, topCard, currentColor) {
  if (card.type === 'wild' || card.type === 'wild4') {
    return true;
  }
  if (card.color === currentColor) {
    return true;
  }
  if (card.value === topCard.value && card.type === topCard.type) {
    return true;
  }
  return false;
}

function nextYonPlayer(lobbyCode, skip = 0) {
  const lobby = yonLobbies.get(lobbyCode);
  if (!lobby) return;
  
  for (let i = 0; i <= skip; i++) {
    lobby.currentPlayerIndex += lobby.direction;
    if (lobby.currentPlayerIndex >= lobby.playersOrder.length) {
      lobby.currentPlayerIndex = 0;
    } else if (lobby.currentPlayerIndex < 0) {
      lobby.currentPlayerIndex = lobby.playersOrder.length - 1;
    }
  }
}

function drawYonCards(lobbyCode, playerId, count) {
  const lobby = yonLobbies.get(lobbyCode);
  if (!lobby) return;
  
  const player = lobby.players.get(playerId);
  if (!player) return;
  
  for (let i = 0; i < count; i++) {
    if (lobby.deck.length === 0) {
      // Reshuffle discard pile into deck
      const topCard = lobby.discardPile.pop();
      lobby.deck = lobby.discardPile;
      lobby.discardPile = [topCard];
      for (let j = lobby.deck.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [lobby.deck[j], lobby.deck[k]] = [lobby.deck[k], lobby.deck[j]];
      }
    }
    if (lobby.deck.length > 0) {
      player.hand.push(lobby.deck.pop());
    }
  }
}

function checkYonWinner(lobbyCode) {
  const lobby = yonLobbies.get(lobbyCode);
  if (!lobby) return null;
  
  for (const player of lobby.players.values()) {
    if (player.hand.length === 0) {
      return player;
    }
  }
  return null;
}

function endYonGame(lobbyCode, winner) {
  const lobby = yonLobbies.get(lobbyCode);
  if (!lobby) return;
  
  lobby.gameState = 'finished';
  
  const standings = Array.from(lobby.players.values())
    .map(p => ({ id: p.id, name: p.name, cardCount: p.hand.length }))
    .sort((a, b) => a.cardCount - b.cardCount);
  
  io.to(lobbyCode).emit('yonGameOver', { standings });
}

// ==================== YONOPOLY GAME FUNCTIONS ====================

const YONOPOLY_BOARD = [
  { name: 'GO', type: 'go' },
  { name: 'Brown St', type: 'property', color: 'brown', price: 60, rent: 4 },
  { name: 'Yon Card', type: 'yon' },
  { name: 'Brown Ave', type: 'property', color: 'brown', price: 60, rent: 4 },
  { name: 'Tax', type: 'tax', amount: 200 },
  { name: 'Railroad', type: 'railroad', price: 200, rent: 25 },
  { name: 'Light Blue', type: 'property', color: 'lightblue', price: 100, rent: 6 },
  { name: 'Yon Card', type: 'yon' },
  { name: 'Light Blue', type: 'property', color: 'lightblue', price: 100, rent: 6 },
  { name: 'Light Blue', type: 'property', color: 'lightblue', price: 120, rent: 8 },
  { name: 'Jail', type: 'jail' },
  { name: 'Pink St', type: 'property', color: 'pink', price: 140, rent: 10 },
  { name: 'Electric', type: 'utility', price: 150, rent: 20 },
  { name: 'Pink Ave', type: 'property', color: 'pink', price: 140, rent: 10 },
  { name: 'Pink Blvd', type: 'property', color: 'pink', price: 160, rent: 12 },
  { name: 'Railroad', type: 'railroad', price: 200, rent: 25 },
  { name: 'Orange St', type: 'property', color: 'orange', price: 180, rent: 14 },
  { name: 'Yon Card', type: 'yon' },
  { name: 'Orange Ave', type: 'property', color: 'orange', price: 180, rent: 14 },
  { name: 'Orange Blvd', type: 'property', color: 'orange', price: 200, rent: 16 },
  { name: 'Free Park', type: 'free' },
  { name: 'Red St', type: 'property', color: 'red', price: 220, rent: 18 },
  { name: 'Yon Card', type: 'yon' },
  { name: 'Red Ave', type: 'property', color: 'red', price: 220, rent: 18 },
  { name: 'Red Blvd', type: 'property', color: 'red', price: 240, rent: 20 },
  { name: 'Railroad', type: 'railroad', price: 200, rent: 25 },
  { name: 'Yellow St', type: 'property', color: 'yellow', price: 260, rent: 22 },
  { name: 'Yellow Ave', type: 'property', color: 'yellow', price: 260, rent: 22 },
  { name: 'Water', type: 'utility', price: 150, rent: 20 },
  { name: 'Yellow Blvd', type: 'property', color: 'yellow', price: 280, rent: 24 },
  { name: 'Go Jail', type: 'gotojail' },
  { name: 'Green St', type: 'property', color: 'green', price: 300, rent: 26 },
  { name: 'Green Ave', type: 'property', color: 'green', price: 300, rent: 26 },
  { name: 'Yon Card', type: 'yon' },
  { name: 'Green Blvd', type: 'property', color: 'green', price: 320, rent: 28 },
  { name: 'Railroad', type: 'railroad', price: 200, rent: 25 },
  { name: 'Yon Card', type: 'yon' },
  { name: 'Blue Ave', type: 'property', color: 'blue', price: 350, rent: 35 },
  { name: 'Luxury Tax', type: 'tax', amount: 100 },
  { name: 'Blue Blvd', type: 'property', color: 'blue', price: 400, rent: 50 }
];

function createYonopolyDeck() {
  const deck = [];
  const colors = ['red', 'blue', 'green', 'yellow'];
  
  for (const color of colors) {
    for (let i = 1; i <= 5; i++) {
      deck.push({ color, value: i, type: 'number' });
    }
    deck.push({ color, value: 'skip', type: 'skip' });
    deck.push({ color, value: 'draw2', type: 'draw2' });
  }
  
  for (let i = 0; i < 4; i++) {
    deck.push({ color: null, value: 'wild', type: 'wild' });
    deck.push({ color: null, value: 'wild4', type: 'wild4' });
  }
  
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

function createYonopolyLobby(hostId, hostName) {
  const code = generateLobbyCode();
  yonopolyLobbies.set(code, {
    code,
    hostId,
    players: new Map([[hostId, { 
      id: hostId, 
      name: hostName, 
      cash: 1500, 
      position: 0, 
      yonHand: [],
      inJail: false,
      jailTurns: 0,
      bankrupt: false
    }]]),
    playersOrder: [hostId],
    gameState: 'lobby',
    currentPlayerIndex: 0,
    properties: {},
    yonDeck: [],
    hasRolled: false
  });
  return code;
}

function startYonopolyGame(lobbyCode) {
  const lobby = yonopolyLobbies.get(lobbyCode);
  if (!lobby) return;
  
  lobby.gameState = 'playing';
  lobby.currentPlayerIndex = 0;
  lobby.yonDeck = createYonopolyDeck();
  lobby.properties = {};
  lobby.hasRolled = false;
  
  for (const player of lobby.players.values()) {
    player.cash = 1500;
    player.position = 0;
    player.yonHand = [];
    player.inJail = false;
    player.jailTurns = 0;
    player.bankrupt = false;
    
    for (let i = 0; i < 3; i++) {
      if (lobby.yonDeck.length > 0) {
        player.yonHand.push(lobby.yonDeck.pop());
      }
    }
  }
  
  broadcastYonopolyState(lobbyCode);
}

function broadcastYonopolyState(lobbyCode) {
  const lobby = yonopolyLobbies.get(lobbyCode);
  if (!lobby) return;
  
  const currentPlayerId = lobby.playersOrder[lobby.currentPlayerIndex];
  
  const playerData = lobby.playersOrder.map(id => {
    const p = lobby.players.get(id);
    return {
      id: p.id,
      name: p.name,
      cash: p.cash,
      position: p.position,
      inJail: p.inJail,
      bankrupt: p.bankrupt,
      yonHand: p.yonHand
    };
  });
  
  io.to(lobbyCode).emit('yonopolyGameState', {
    players: playerData,
    currentPlayerId,
    properties: lobby.properties,
    hasRolled: lobby.hasRolled,
    gameState: lobby.gameState
  });
}

function yonopolyNextTurn(lobbyCode) {
  const lobby = yonopolyLobbies.get(lobbyCode);
  if (!lobby) return;
  
  lobby.hasRolled = false;
  
  let attempts = 0;
  do {
    lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.playersOrder.length;
    attempts++;
  } while (lobby.players.get(lobby.playersOrder[lobby.currentPlayerIndex]).bankrupt && attempts < lobby.playersOrder.length);
  
  const activePlayers = Array.from(lobby.players.values()).filter(p => !p.bankrupt);
  if (activePlayers.length <= 1) {
    endYonopolyGame(lobbyCode, activePlayers[0]);
    return;
  }
  
  broadcastYonopolyState(lobbyCode);
}

// Takes money from a player (optionally paying it to another player).
// Payees only receive what the payer actually had. If the payer can't cover it
// they go bankrupt: cash is set to 0 and their properties return to the bank.
// Returns true if this ended the game (caller should stop and not broadcast).
function yonopolyCharge(lobbyCode, payer, amount, payee) {
  const lobby = yonopolyLobbies.get(lobbyCode);
  if (!lobby) return false;
  const paid = Math.min(amount, Math.max(payer.cash, 0));
  payer.cash -= amount;
  if (payee) payee.cash += paid;
  if (payer.cash >= 0) return false;

  payer.cash = 0;
  payer.bankrupt = true;
  for (const [pos, ownerId] of Object.entries(lobby.properties)) {
    if (ownerId === payer.id) delete lobby.properties[pos];
  }
  io.to(lobbyCode).emit('yonopolyLog', { message: `${payer.name} went bankrupt! Their properties return to the bank.` });

  const active = Array.from(lobby.players.values()).filter(p => !p.bankrupt);
  if (active.length <= 1) {
    endYonopolyGame(lobbyCode, active[0]);
    return true;
  }
  return false;
}

function endYonopolyGame(lobbyCode, winner) {
  const lobby = yonopolyLobbies.get(lobbyCode);
  if (!lobby) return;
  
  lobby.gameState = 'finished';
  
  const standings = Array.from(lobby.players.values())
    .filter(p => !p.bankrupt)
    .sort((a, b) => b.cash - a.cash);
  
  const bankruptPlayers = Array.from(lobby.players.values()).filter(p => p.bankrupt);
  
  io.to(lobbyCode).emit('yonopolyGameOver', {
    winnerName: winner?.name || standings[0]?.name || 'Unknown',
    standings: [...standings, ...bankruptPlayers].map(p => ({ name: p.name, cash: p.cash }))
  });
}

function drawYonopolyCard(lobbyCode, playerId) {
  const lobby = yonopolyLobbies.get(lobbyCode);
  if (!lobby) return null;
  
  if (lobby.yonDeck.length === 0) {
    lobby.yonDeck = createYonopolyDeck();
  }
  
  const card = lobby.yonDeck.pop();
  const player = lobby.players.get(playerId);
  if (player && card) {
    player.yonHand.push(card);
  }
  return card;
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});