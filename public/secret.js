// Secret hack menu: press ~ (or `) on any game page.
// Relies on the page's global `socket` and `currentLobbyCode`.
(function () {
  const game = location.pathname.replace(/^\/|\.html$/g, '').replace('index', 'blackjack') || 'blackjack';

  const HACKS = {
    blackjack: [
      { id: 'money', icon: '💰', name: '+$1,000', desc: 'Add money to your balance' },
      { id: 'peek', icon: '👁️', name: 'X-ray', desc: "See the dealer's hidden card and the next card" },
      { id: 'perfect', icon: '🂡', name: 'Instant Blackjack', desc: 'Turn your hand into A + K (your turn)' },
      { id: 'dealerbust', icon: '💥', name: 'Rig the dealer', desc: 'Dealer busts this hand' }
    ],
    imposter: [
      { id: 'imposter', icon: '🕵️', name: 'Unmask', desc: 'Find out who the imposter is' },
      { id: 'word', icon: '📜', name: 'Read the word', desc: 'See the secret word' }
    ],
    yon: [
      { id: 'plus4', icon: '➕', name: 'Make a +4', desc: 'Turn a random card into a +4' },
      { id: 'wild', icon: '🌈', name: 'Free Wild', desc: 'Add a Wild card to your hand' },
      { id: 'attack', icon: '🎯', name: 'Everyone draws 2', desc: 'All opponents draw 2 cards' },
      { id: 'peek', icon: '👁️', name: 'Peek', desc: "See every opponent's hand" },
      { id: 'onecard', icon: '🏁', name: 'Last card', desc: 'Your hand becomes a single Wild' }
    ],
    yonopoly: [
      { id: 'money', icon: '💰', name: '+$1,000', desc: 'Add cash' },
      { id: 'plus4', icon: '➕', name: 'Free +4 card', desc: 'Steal $400 when you play it' },
      { id: 'reroll', icon: '🎲', name: 'Roll again', desc: 'Get another roll this turn' },
      { id: 'steal', icon: '🏠', name: 'Steal property', desc: 'Take a random property from an opponent' }
    ]
  };

  const hacks = HACKS[game];
  if (!hacks || typeof socket === 'undefined') return;

  const css = document.createElement('style');
  css.textContent = `
    .sm-overlay { position: fixed; inset: 0; z-index: 5000; display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.6); backdrop-filter: blur(6px); animation: smFade .15s ease-out; }
    .sm-overlay.sm-hidden { display: none; }
    .sm-panel { width: min(440px, 92vw); max-height: 86vh; overflow-y: auto; padding: 22px; text-align: left;
      background: #0d0d12; border: 1px solid rgba(34,197,94,.35); border-radius: 16px;
      box-shadow: 0 0 0 1px rgba(34,197,94,.1), 0 20px 60px rgba(0,0,0,.6), 0 0 40px rgba(34,197,94,.12);
      font-family: var(--font, system-ui); color: #f4f4f6; animation: smRise .2s ease-out; }
    .sm-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .sm-title { font-family: var(--mono, monospace); font-size: 13px; letter-spacing: .15em; color: #4ade80; text-transform: uppercase; }
    .sm-close { background: none; border: none; color: #9a9aab; font-size: 20px; cursor: pointer; line-height: 1; }
    .sm-close:hover { color: #fff; }
    .sm-sub { font-size: 13px; color: #9a9aab; margin-bottom: 16px; }
    .sm-list { display: flex; flex-direction: column; gap: 8px; }
    .sm-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; text-align: left;
      font: inherit; color: inherit; background: #15151c; border: 1px solid rgba(255,255,255,.08); border-radius: 10px;
      cursor: pointer; transition: border-color .15s, background .15s, transform .1s; }
    .sm-item:hover { border-color: rgba(74,222,128,.5); background: #18201b; }
    .sm-item:active { transform: scale(.99); }
    .sm-icon { width: 36px; height: 36px; flex: none; display: grid; place-items: center; font-size: 18px;
      background: rgba(74,222,128,.08); border: 1px solid rgba(74,222,128,.2); border-radius: 8px; }
    .sm-name { font-weight: 600; font-size: 15px; }
    .sm-desc { font-size: 12.5px; color: #9a9aab; }
    .sm-out { margin-top: 14px; padding: 12px 14px; min-height: 20px; font-family: var(--mono, monospace); font-size: 12.5px;
      white-space: pre-wrap; color: #4ade80; background: #050507; border: 1px solid rgba(255,255,255,.06); border-radius: 10px; }
    .sm-out.err { color: #f87171; }
    .sm-out:empty { display: none; }
    .sm-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 5001; max-width: 90vw;
      padding: 10px 16px; font-family: var(--mono, monospace); font-size: 13px; white-space: pre-wrap; color: #4ade80;
      background: #0d0d12; border: 1px solid rgba(74,222,128,.35); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.5);
      animation: smRise .2s ease-out; }
    .sm-toast.err { color: #f87171; border-color: rgba(248,113,113,.35); }
    @keyframes smFade { from { opacity: 0 } }
    @keyframes smRise { from { opacity: 0; transform: translate(var(--tx, 0), 8px); } }
    .sm-toast { --tx: -50%; }
  `;
  document.head.appendChild(css);

  const overlay = document.createElement('div');
  overlay.className = 'sm-overlay sm-hidden';
  overlay.innerHTML = `
    <div class="sm-panel" role="dialog" aria-label="Secret menu">
      <div class="sm-head">
        <span class="sm-title">// secret menu · ${game}</span>
        <button class="sm-close" aria-label="Close">×</button>
      </div>
      <p class="sm-sub">Shh. Press ~ or Esc to close.</p>
      <div class="sm-list">
        ${hacks.map(h => `
          <button class="sm-item" data-hack="${h.id}">
            <span class="sm-icon">${h.icon}</span>
            <span><div class="sm-name">${h.name}</div><div class="sm-desc">${h.desc}</div></span>
          </button>`).join('')}
      </div>
      <div class="sm-out"></div>
    </div>`;
  document.body.appendChild(overlay);

  const out = overlay.querySelector('.sm-out');
  const open = () => { out.textContent = ''; overlay.classList.remove('sm-hidden'); };
  const close = () => overlay.classList.add('sm-hidden');
  const isOpen = () => !overlay.classList.contains('sm-hidden');

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName);
    if (e.key === '~' || (e.key === '`' && !typing)) {
      e.preventDefault();
      isOpen() ? close() : open();
    } else if (e.key === 'Escape' && isOpen()) {
      close();
    }
  });

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.sm-close').addEventListener('click', close);

  overlay.querySelectorAll('.sm-item').forEach(btn => {
    btn.addEventListener('click', () => {
      // eslint-disable-next-line no-undef
      const code = typeof currentLobbyCode !== 'undefined' ? currentLobbyCode : null;
      if (!code) {
        out.className = 'sm-out err';
        out.textContent = 'Join or create a lobby first.';
        return;
      }
      socket.emit('secretHack', { game, hack: btn.dataset.hack, code });
    });
  });

  let toastTimer;
  socket.on('secretResult', ({ ok, message }) => {
    if (isOpen()) {
      out.className = 'sm-out' + (ok ? '' : ' err');
      out.textContent = '> ' + message;
    } else {
      document.querySelector('.sm-toast')?.remove();
      const t = document.createElement('div');
      t.className = 'sm-toast' + (ok ? '' : ' err');
      t.textContent = message;
      document.body.appendChild(t);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.remove(), 4000);
    }
  });
})();
