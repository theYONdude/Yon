const socket = io();

let currentLobbyCode = null;
let myPlayerId = null;
let isHost = false;
let myWord = null;
let isImposter = false;

const screens = {
  lobby: document.getElementById('lobby-screen'),
  waiting: document.getElementById('waiting-screen'),
  word: document.getElementById('word-screen'),
  clue: document.getElementById('clue-screen'),
  voting: document.getElementById('voting-screen'),
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
  socket.emit('createImposterLobby', { name });
});

document.getElementById('join-lobby-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  const code = document.getElementById('lobby-code-input').value.trim().toUpperCase();
  if (!name || !code) {
    alert('Please enter your name and lobby code');
    return;
  }
  socket.emit('joinImposterLobby', { name, code });
});

document.getElementById('start-game-btn').addEventListener('click', () => {
  socket.emit('startImposterGame', { code: currentLobbyCode });
});

document.getElementById('submit-clue-btn').addEventListener('click', () => {
  const clue = document.getElementById('clue-input').value.trim();
  if (!clue) {
    alert('Please enter a clue');
    return;
  }
  socket.emit('submitClue', { code: currentLobbyCode, clue });
  document.getElementById('clue-input').disabled = true;
  document.getElementById('submit-clue-btn').disabled = true;
});

document.getElementById('play-again-btn').addEventListener('click', () => {
  socket.emit('restartImposterGame', { code: currentLobbyCode });
});

socket.on('imposterLobbyCreated', (data) => {
  currentLobbyCode = data.code;
  myPlayerId = socket.id;
  isHost = data.isHost;
  document.getElementById('display-lobby-code').textContent = data.code;
  document.getElementById('start-game-btn').classList.remove('hidden');
  document.querySelector('.waiting-text').classList.add('hidden');
  showScreen('waiting');
});

socket.on('imposterLobbyJoined', (data) => {
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

socket.on('imposterPlayersUpdate', (players) => {
  const playersList = document.getElementById('players-list');
  playersList.innerHTML = '';
  
  players.forEach(player => {
    const div = document.createElement('div');
    div.className = 'player-item';
    div.innerHTML = `
      <span>${player.name} ${player.id === myPlayerId ? '(You)' : ''}</span>
    `;
    playersList.appendChild(div);
  });
  
  const playersNeededMsg = document.getElementById('players-needed-msg');
  if (isHost && players.length < 3) {
    document.getElementById('start-game-btn').disabled = true;
    if (playersNeededMsg) {
      playersNeededMsg.textContent = `Need at least 3 players to start (currently ${players.length})`;
      playersNeededMsg.classList.remove('hidden');
    }
  } else if (isHost) {
    document.getElementById('start-game-btn').disabled = false;
    if (playersNeededMsg) {
      playersNeededMsg.classList.add('hidden');
    }
  }
});

let wordScreenShown = false;
let wordScreenTimeout = null;

socket.on('imposterGameStarted', (data) => {
  myWord = data.word;
  isImposter = data.isImposter;
  wordScreenShown = true;
  
  const wordDisplay = document.getElementById('word-display');
  const roleDisplay = document.getElementById('role-display');
  
  if (data.isImposter) {
    wordDisplay.textContent = '???';
    wordDisplay.classList.add('imposter');
    roleDisplay.textContent = 'You are the IMPOSTER!';
    roleDisplay.className = 'role-display imposter-role';
  } else {
    wordDisplay.textContent = data.word;
    wordDisplay.classList.remove('imposter');
    roleDisplay.textContent = 'You are a Regular Player';
    roleDisplay.className = 'role-display regular-role';
  }
  
  showScreen('word');
  
  if (wordScreenTimeout) clearTimeout(wordScreenTimeout);
  wordScreenTimeout = setTimeout(() => {
    wordScreenShown = false;
  }, 5000);
});

socket.on('imposterGameState', (data) => {
  if (wordScreenShown && data.gameState === 'clues') {
    return;
  }
  
  if (data.gameState === 'clues') {
    renderCluesScreen(data);
  } else if (data.gameState === 'voting') {
    renderVotingScreen(data);
  } else if (data.gameState === 'results') {
    renderResultsScreen(data);
  }
});

function renderCluesScreen(data) {
  showScreen('clue');
  
  const cluesList = document.getElementById('clues-list');
  cluesList.innerHTML = '';
  
  if (data.players.length === 0 || !data.players[0].clue) {
    cluesList.innerHTML = '<p style="text-align: center; opacity: 0.7;">No clues yet...</p>';
  } else {
    data.players.forEach(player => {
      if (player.clue) {
        const clueItem = document.createElement('div');
        clueItem.className = 'clue-item';
        clueItem.innerHTML = `
          <div class="clue-player">${player.name}</div>
          <div class="clue-text">"${player.clue}"</div>
        `;
        cluesList.appendChild(clueItem);
      }
    });
  }
  
  const isMyTurn = data.currentPlayerId === myPlayerId;
  const clueInputPanel = document.getElementById('clue-input-panel');
  const waitingClue = document.getElementById('waiting-clue');
  
  if (isMyTurn) {
    clueInputPanel.classList.remove('hidden');
    waitingClue.classList.add('hidden');
    document.getElementById('clue-input').disabled = false;
    document.getElementById('submit-clue-btn').disabled = false;
    document.getElementById('clue-input').value = '';
    document.getElementById('clue-input').focus();
  } else {
    clueInputPanel.classList.add('hidden');
    waitingClue.classList.remove('hidden');
    
    const currentPlayer = data.players.find(p => p.id === data.currentPlayerId);
    document.getElementById('current-player-name').textContent = currentPlayer ? currentPlayer.name : 'someone';
  }
}

function renderVotingScreen(data) {
  showScreen('voting');
  
  const allClues = document.getElementById('all-clues');
  allClues.innerHTML = '<h3>All Clues</h3>';
  
  data.players.forEach(player => {
    if (player.clue) {
      const clueItem = document.createElement('div');
      clueItem.className = 'clue-item';
      clueItem.innerHTML = `
        <div class="clue-player">${player.name}</div>
        <div class="clue-text">"${player.clue}"</div>
      `;
      allClues.appendChild(clueItem);
    }
  });
  
  const voteButtons = document.getElementById('vote-buttons');
  voteButtons.innerHTML = '';
  
  data.players.forEach(player => {
    const btn = document.createElement('button');
    btn.className = 'vote-btn';
    btn.textContent = player.name;
    btn.onclick = () => {
      document.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      socket.emit('submitVote', { code: currentLobbyCode, votedPlayerId: player.id });
      document.getElementById('vote-panel').classList.add('hidden');
      document.getElementById('waiting-votes').classList.remove('hidden');
    };
    voteButtons.appendChild(btn);
  });
  
  const allVoted = data.players.every(p => p.vote !== null);
  if (allVoted) {
    document.getElementById('vote-panel').classList.add('hidden');
    document.getElementById('waiting-votes').classList.remove('hidden');
  }
}

function renderResultsScreen(data) {
  showScreen('results');
  
  const reveal = data.revealedImposter;
  const resultsContent = document.getElementById('results-content');
  
  const playersGuessed = reveal.playersGuessedCorrectly;
  
  const resultsTitle = document.getElementById('results-title');
  if (playersGuessed) {
    resultsTitle.textContent = '🎉 Players Win! 🎉';
    resultsTitle.className = 'success';
  } else {
    resultsTitle.textContent = '😈 Imposter Wins! 😈';
    resultsTitle.className = 'failure';
  }
  
  resultsContent.innerHTML = `
    <div class="result-box">
      <h3>The Vote</h3>
      <p>Players voted out: <strong>${reveal.votedOutName}</strong></p>
      <p>The real Imposter was: <strong class="${playersGuessed ? 'success' : 'failure'}">${reveal.actualImposterName}</strong></p>
    </div>
    <div class="result-box">
      <h3>The Word Was</h3>
      <p class="reveal">"${reveal.word}"</p>
    </div>
  `;
  
  if (isHost) {
    document.getElementById('play-again-btn').classList.remove('hidden');
    document.getElementById('waiting-host-text').classList.add('hidden');
  } else {
    document.getElementById('play-again-btn').classList.add('hidden');
    document.getElementById('waiting-host-text').classList.remove('hidden');
  }
}

socket.on('error', (data) => {
  alert(data.message);
});