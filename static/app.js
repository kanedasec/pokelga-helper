/* ── Pokemon LGA Helper — Single-file Frontend App ─────────────────────────── */

const COLOR_HEX = {
  red: '#e53935', green: '#43a047', blue: '#1e88e5',
  brown: '#8d6e63', purple: '#8e24aa', pink: '#e91e8c',
};

const BADGE_ABBR = {
  boulder: 'BO', cascade: 'CA', thunder: 'TH', rainbow: 'RA',
  soul: 'SO', marsh: 'MA', volcano: 'VO', earth: 'EA',
};

const DECK_COLOR_CSS = { green: '#43a047', blue: '#1e88e5', red: '#e53935', mega: '#8e24aa', legendary: '#f9a825' };

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeCardName(name) {
  // Special cases for Nidoran genders
  if (name === 'Nidoran♀') return 'Nidoran_F';
  if (name === 'Nidoran♂') return 'Nidoran_M';
  // Use Unicode-aware regex to match Python's re.sub(r'[^\w\-]', '_', name)
  // which keeps accented letters like é (Unicode word chars)
  return name.replace(/[^\p{L}\p{N}_\-]/gu, '_').replace(/^_+|_+$/g, '');
}
function cardImgUrl(deck, name) {
  return `/card-images/${deck}/${safeCardName(name)}.png`;
}

/* ── API layer ─────────────────────────────────────────────────────────────── */
const API = {
  base: '/api',

  _token() { return localStorage.getItem('lga_token'); },

  async _fetch(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const token = this._token();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(this.base + path, { ...opts, headers });
    if (res.status === 401) { App.logout(); return null; }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
    return data;
  },

  get: (path) => API._fetch(path),
  post: (path, body) => API._fetch(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => API._fetch(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => API._fetch(path, { method: 'DELETE' }),

  // Auth
  login: (u, p) => API.post('/auth/login', { username: u, password: p }),
  register: (u, p, c) => API.post('/auth/register', { username: u, password: p, color: c }),
  availableColors: () => API.get('/auth/available-colors'),

  // Dashboard
  allPlayers: () => API.get('/players'),
  myData: () => API.get('/players/me'),

  // State
  updateState: (body) => API.patch('/me/state', body),

  // Pokemon
  addPokemon: (body) => API.post('/me/pokemon', body),
  updatePokemon: (id, body) => API.patch(`/me/pokemon/${id}`, body),
  deletePokemon: (id) => API.delete(`/me/pokemon/${id}`),
  setActive: (id) => API.patch('/me/pokemon/active', { pokemon_id: id }),

  // Badges
  toggleBadge: (name, earned) => API.patch(`/me/badges/${name}`, { earned }),

  // Items
  addItem: (body) => API.post('/me/items', body),
  deleteItem: (id) => API.delete(`/me/items/${id}`),

  // Events
  addEvent: (body) => API.post('/me/events', body),
  deleteEvent: (id) => API.delete(`/me/events/${id}`),

  // Game Meta
  gameMeta: () => API.get('/game'),
  updateGame: (body) => API.patch('/game', body),

  // VP
  allVP: () => API.get('/vp'),

  // Admin — player editing
  adminGetPlayer:    (uid)          => API.get(`/admin/players/${uid}`),
  adminDeletePlayer: (uid)          => API.delete(`/admin/players/${uid}`),
  adminUpdateState:  (uid, body)    => API.patch(`/admin/players/${uid}/state`, body),
  adminAddPokemon:   (uid, body)    => API.post(`/admin/players/${uid}/pokemon`, body),
  adminUpdatePokemon:(uid, pid, b)  => API.patch(`/admin/players/${uid}/pokemon/${pid}`, b),
  adminDeletePokemon:(uid, pid)     => API.delete(`/admin/players/${uid}/pokemon/${pid}`),
  adminSetActive:    (uid, pid)     => API.patch(`/admin/players/${uid}/pokemon/active`, { pokemon_id: pid }),
  adminToggleBadge:  (uid, name, e) => API.patch(`/admin/players/${uid}/badges/${name}`, { earned: e }),
  adminAddItem:      (uid, body)    => API.post(`/admin/players/${uid}/items`, body),
  adminDeleteItem:   (uid, iid)     => API.delete(`/admin/players/${uid}/items/${iid}`),
  adminAddEvent:     (uid, body)    => API.post(`/admin/players/${uid}/events`, body),
  adminDeleteEvent:  (uid, eid)     => API.delete(`/admin/players/${uid}/events/${eid}`),
  // Admin — game management
  adminGameStatus:   ()             => API.get('/admin/game/status'),
  adminNewGame:      ()             => API.post('/admin/game/new', {}),
  adminStartGame:    ()             => API.post('/admin/game/start', {}),
  adminEndGame:      ()             => API.post('/admin/game/end', {}),
  adminRestartGame:  ()             => API.post('/admin/game/restart', {}),
  adminGameResults:  ()             => API.get('/admin/game/results'),
  adminCreatePlayer: (body)         => API.post('/admin/players/create', body),
};

/* ── Card Data (loaded from cards.json) ────────────────────────────────────── */
let CARD_DATA = { item: [], event: [], pokemon: { green: [], blue: [], red: [], mega: [] }, title: [] };

async function loadCardData() {
  try {
    const r = await fetch('/cards.json');
    CARD_DATA = await r.json();
  } catch (_) {}
}

/* ── App State ─────────────────────────────────────────────────────────────── */
let state = {
  token: null,
  myColor: null,
  myUsername: null,
  myUserId: null,
  isAdmin: false,
  players: [],
  myData: null,
  gameMeta: null,
  currentView: 'dashboard',
  panelTab: 'general',
  panelTargetId: null,   // null = editing self; userId = admin editing another player
  pollTimer: null,
};

/* ── App Controller ────────────────────────────────────────────────────────── */
const App = {

  /* ── Boot ─────────────────────────────────────────────────────────────── */
  async init() {
    await loadCardData();
    const token = localStorage.getItem('lga_token');
    if (token) {
      state.token = token;
      state.myColor    = localStorage.getItem('lga_color');
      state.myUsername = localStorage.getItem('lga_username');
      state.myUserId   = parseInt(localStorage.getItem('lga_uid') || '0');
      state.isAdmin    = localStorage.getItem('lga_admin') === 'true';
      await this.enterApp();
    }
    // Pre-load available colors for register
    this.loadAvailableColors();
  },

  async loadAvailableColors() {
    try {
      const data = await API.availableColors();
      if (data) this._applyColorAvailability(data.colors);
    } catch (_) {}
  },

  _applyColorAvailability(colors) {
    colors.forEach(({ color, taken }) => {
      const el = document.querySelector(`.color-option[data-color="${color}"]`);
      if (el) el.classList.toggle('taken', taken);
    });
  },

  /* ── Auth ─────────────────────────────────────────────────────────────── */
  showAuthTab(tab) {
    document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
    document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('auth-error').classList.add('hidden');
    if (tab === 'register') this.loadAvailableColors();
  },

  selectedColor: null,

  selectColor(color) {
    const opt = document.querySelector(`.color-option[data-color="${color}"]`);
    if (opt?.classList.contains('taken')) return;
    document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
    opt?.classList.add('selected');
    this.selectedColor = color;
  },

  _showError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  },

  async login() {
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;
    if (!u || !p) return this._showError('Please fill in all fields');
    try {
      const data = await API.login(u, p);
      this._storeAuth(data);
      await this.enterApp();
    } catch (e) { this._showError(e.message); }
  },

  async register() {
    const u = document.getElementById('reg-username').value.trim();
    const p = document.getElementById('reg-password').value;
    if (!u || !p) return this._showError('Please fill in all fields');
    if (!this.selectedColor) return this._showError('Please select a colour');
    try {
      const data = await API.register(u, p, this.selectedColor);
      this._storeAuth(data);
      await this.enterApp();
    } catch (e) { this._showError(e.message); }
  },

  _storeAuth(data) {
    localStorage.setItem('lga_token',    data.access_token);
    localStorage.setItem('lga_color',    data.color);
    localStorage.setItem('lga_username', data.username);
    localStorage.setItem('lga_uid',      String(data.user_id));
    localStorage.setItem('lga_admin',    String(!!data.is_admin));
    state.token      = data.access_token;
    state.myColor    = data.color;
    state.myUsername = data.username;
    state.myUserId   = data.user_id;
    state.isAdmin    = !!data.is_admin;
  },

  logout() {
    localStorage.removeItem('lga_token');
    localStorage.removeItem('lga_color');
    localStorage.removeItem('lga_username');
    localStorage.removeItem('lga_uid');
    localStorage.removeItem('lga_admin');
    if (state.pollTimer) clearInterval(state.pollTimer);
    state = { ...state, token: null, myColor: null, myUsername: null, players: [], gameMeta: null };
    document.getElementById('view-auth').classList.remove('hidden');
    document.getElementById('view-app').classList.add('hidden');
    this.loadAvailableColors();
  },

  /* ── App Entry ────────────────────────────────────────────────────────── */
  async enterApp() {
    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('view-app').classList.remove('hidden');

    // Header
    const badge = document.getElementById('header-badge');
    badge.style.background = COLOR_HEX[state.myColor] || '#888';
    document.getElementById('header-username').textContent =
      state.myUsername + (state.isAdmin ? ' 👑' : '');
    // Show "Manage Game" button only for admin
    document.getElementById('nav-manage')?.classList.toggle('hidden', !state.isAdmin);

    await this.refresh();
    state.pollTimer = setInterval(() => this.refresh(), 15000);
  },

  async refresh() {
    try {
      const [players, gameMeta] = await Promise.all([API.allPlayers(), API.gameMeta()]);
      state.players = players || [];
      state.gameMeta = gameMeta;

      if (state.currentView === 'dashboard') this.renderDashboard();
      if (state.currentView === 'board') Board.render();
      if (state.currentView === 'vp') await this.renderVP();
      this.renderGameBanner();
      const ri = document.getElementById('refresh-indicator');
      if (ri) ri.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
    } catch (e) { console.warn('Refresh error', e); }
  },

  /* ── Views ─────────────────────────────────────────────────────────────── */
  showView(v) {
    state.currentView = v;
    const views = ['dashboard', 'board', 'cards', 'vp'];
    const mainViews = ['dashboard', 'vp']; // inside <main>
    views.forEach(id => {
      document.getElementById(`view-${id}`)?.classList.toggle('hidden', v !== id);
      document.getElementById(`nav-${id}`)?.classList.toggle('active', v === id);
    });
    // Show/hide the <main> element (only needed for dashboard & vp views)
    const mainEl = document.querySelector('#view-app main');
    if (mainEl) mainEl.classList.toggle('hidden', !mainViews.includes(v));
    if (v === 'dashboard') this.renderDashboard();
    if (v === 'board') Board.render();
    if (v === 'cards') Cards.init();
    if (v === 'vp') this.renderVP();
  },

  /* ── Game Banner ──────────────────────────────────────────────────────── */
  renderGameBanner() {
    const m = state.gameMeta;
    if (!m) return;
    const banner = document.getElementById('game-banner');
    banner.innerHTML = `
      <span class="bold" style="font-size:12px">Game Status:</span>
      ${m.game_ended
        ? `<span class="gym-badge ended">🏆 Game Over — Champion: ${escapeHtml(m.winner_color) || '?'}</span>`
        : '<span class="gym-badge open">⚔️ In Progress</span>'}
      <span class="gym-badge ${m.saffron_gym_unlocked ? 'open' : 'closed'}">
        Saffron Gym: ${m.saffron_gym_unlocked ? 'Open' : 'Locked'}
      </span>
      <span class="gym-badge ${m.viridian_gym_unlocked ? 'open' : 'closed'}">
        Viridian Gym: ${m.viridian_gym_unlocked ? 'Open' : 'Locked'}
      </span>
      <span class="gym-badge ${m.victory_road_unlocked ? 'open' : 'closed'}">
        Victory Road: ${m.victory_road_unlocked ? 'Open' : 'Locked'}
      </span>
    `;
  },

  /* ── Dashboard ────────────────────────────────────────────────────────── */
  renderDashboard() {
    const grid = document.getElementById('player-grid');
    grid.innerHTML = '';
    state.players.forEach(p => grid.appendChild(this._buildPlayerCard(p)));
  },

  _buildPlayerCard(p) {
    const isOwner = p.registered && p.user_id === state.myUserId;
    const card = document.createElement('div');
    card.className = 'player-card' + (isOwner ? ' is-owner' : '') + (!p.registered ? ' empty' : '');

    if (!p.registered) {
      card.innerHTML = `
        <div class="card-header">
          <div class="player-name-row">
            <span class="color-dot" style="background:${COLOR_HEX[p.color]}"></span>
            <h3 style="color:${COLOR_HEX[p.color]}">${p.color.charAt(0).toUpperCase()+p.color.slice(1)}</h3>
          </div>
          <span class="position-tag muted">Empty slot</span>
        </div>
      `;
      return card;
    }

    card.classList.add('registered-card');
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return; // don't open modal when clicking Edit
      App.openPlayerModal(p.user_id);
    });

    const s = p.state || {};
    const pp = s.pp ?? 0;
    const ppPct = (pp / 6 * 100).toFixed(0);
    const teamPkmn = (p.pokemon || []).filter(pk => !pk.in_storage).sort((a,b) => a.slot_order - b.slot_order);
    const storagePkmn = (p.pokemon || []).filter(pk => pk.in_storage);
    const badges = p.badges || [];
    const events = p.events || [];

    card.innerHTML = `
      <div class="card-header">
        <div class="player-name-row">
          <span class="color-dot" style="background:${COLOR_HEX[p.color]}"></span>
          <h3>${escapeHtml(p.username)}</h3>
          ${isOwner ? '<span style="font-size:10px;color:var(--accent)">(you)</span>' : ''}
        </div>
      </div>
      <div class="card-body">
        <!-- PP -->
        <div class="pp-row">
          <span class="pp-label">PP</span>
          <div class="pp-bar"><div class="pp-fill" style="width:${ppPct}%"></div></div>
          <span class="pp-num">${pp}/6</span>
        </div>

        <!-- Stats row -->
        <div class="stats-row">
          <div class="stat-chip"><span class="icon">💀</span>${s.ko_tokens ?? 0}/4 KO</div>
          <div class="stat-chip"><span class="icon">🌲</span>${s.tree_tokens ?? 0}</div>
          <div class="stat-chip"><span class="icon">🪨</span>${s.boulder_tokens ?? 0}</div>
          ${p.item_card_count !== undefined
            ? `<div class="stat-chip"><span class="icon">🎒</span>${p.item_card_count} items</div>`
            : ''}
          ${s.title_card_name ? `<div class="stat-chip" title="${escapeHtml(s.title_card_name)}">🏅 Title</div>` : ''}
        </div>

        <!-- Badges -->
        <div class="badges-row">
          ${badges.map(b => `
            <div class="badge-icon ${b.earned ? 'earned' : ''}" title="${escapeHtml(b.display_name)} — ${escapeHtml(b.gym_leader)}, ${escapeHtml(b.city)}">
              ${BADGE_ABBR[b.badge_name] || b.badge_name.slice(0,2).toUpperCase()}
            </div>
          `).join('')}
        </div>

        <!-- Pokemon team -->
        <div class="pokemon-section">
          <div class="section-label">Team (${teamPkmn.length}/6)</div>
          <div class="pokemon-list">
            ${teamPkmn.length === 0 ? '<div class="muted small">No Pokemon on team</div>' : ''}
            ${teamPkmn.map(pk => `
              <div class="pkmn-row ${pk.is_ko ? 'ko' : ''} ${pk.is_active ? 'active-pkmn' : ''}">
                <span class="deck-dot ${pk.deck_color}"></span>
                <span class="pkmn-name">${escapeHtml(pk.name)}</span>
                <div class="luc-badges">
                  ${[1,2,3,4,5].map(i => `<div class="luc-pip ${i <= pk.level_up_counters ? 'filled' : ''}"></div>`).join('')}
                </div>
                <span style="font-size:10px;color:var(--text-muted)">${pk.printed_atk_pwr > 0 ? pk.printed_atk_pwr + ' atk' : ''}</span>
                ${pk.is_ko ? '<span class="ko-tag">KO</span>' : ''}
                ${pk.is_active ? '<span style="font-size:10px;color:var(--accent)">★</span>' : ''}
              </div>
            `).join('')}
          </div>
          ${storagePkmn.length > 0 ? `
            <div class="section-label" style="margin-top:8px">Storage (${storagePkmn.length})</div>
            <div class="pokemon-list">
              ${storagePkmn.map(pk => `
                <div class="pkmn-row">
                  <span class="deck-dot ${pk.deck_color}"></span>
                  <span class="pkmn-name">${escapeHtml(pk.name)}</span>
                  <span class="storage-tag">PC</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Events -->
        ${events.length > 0 ? `
          <div class="events-row">
            ${events.map(e => `<span class="event-chip" title="${escapeHtml(e.effect_text || '')}">${escapeHtml(e.name)}</span>`).join('')}
          </div>
        ` : ''}

        <!-- Notes -->
        ${s.notes ? `<div class="notes-display">"${escapeHtml(s.notes)}"</div>` : ''}

        ${isOwner
          ? '<button class="btn-edit" onclick="App.openPanel()">✏️ Edit My Board</button>'
          : state.isAdmin
            ? `<button class="btn-edit admin-edit" onclick="event.stopPropagation();App.openPanel(${p.user_id})">✏️ Edit (Admin)</button>`
            : ''}
        ${state.isAdmin && !isOwner
          ? `<button class="btn-delete-player" onclick="event.stopPropagation();App.deletePlayer(${p.user_id},'${escapeHtml(p.username)}')">🗑 Delete</button>`
          : ''}
      </div>
    `;
    return card;
  },

  /* ── VP View ──────────────────────────────────────────────────────────── */
  async renderVP() {
    try {
      const vpData = await API.allVP();
      if (!vpData) return;
      const sorted = [...vpData].sort((a,b) => b.breakdown.total_vp - a.breakdown.total_vp);
      const tbody = document.getElementById('vp-tbody');
      tbody.innerHTML = sorted.map((p, i) => {
        const b = p.breakdown;
        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        return `
          <tr>
            <td><span class="rank-badge ${rankClass}">${i+1}</span></td>
            <td>
              <span class="color-pill" style="background:${COLOR_HEX[p.color]}"></span>
              <strong>${escapeHtml(p.username)}</strong>
              <span class="muted">(${p.color})</span>
            </td>
            <td>${b.team_atk_pwr_vp}</td>
            <td>${b.level_up_counter_vp}</td>
            <td>${b.storage_vp}</td>
            <td>${b.evolution_vp}</td>
            <td>${b.badge_vp}</td>
            <td>${b.title_card_vp}</td>
            <td>${b.cards_in_hand_vp}</td>
            <td>${b.tree_boulder_vp}</td>
            <td class="vp-total">${b.total_vp}</td>
          </tr>
        `;
      }).join('');
    } catch (e) { console.warn('VP error', e); }
  },

  /* ── My Panel ─────────────────────────────────────────────────────────── */
  async openPanel(targetUserId) {
    // Admin opening their own panel → game management (not player tabs)
    const isAdminSelf = state.isAdmin && (!targetUserId || targetUserId === state.myUserId);
    state.panelTargetId = (!isAdminSelf && targetUserId && targetUserId !== state.myUserId) ? targetUserId : null;
    const header = document.querySelector('#my-panel .panel-header h2');
    if (header) {
      if (state.panelTargetId) {
        const p = state.players.find(pl => pl.user_id === state.panelTargetId);
        header.textContent = `Editing: ${p?.username || '?'} 👑`;
      } else if (isAdminSelf) {
        header.textContent = 'Game Management 👑';
      } else {
        header.textContent = 'My Board';
      }
    }

    // Render tabs
    const tabsEl = document.getElementById('panel-tabs');
    if (isAdminSelf) {
      tabsEl.innerHTML = `<button id="ptab-game" class="active" onclick="App.panelTab('game')">Game</button>`;
      state.panelTab = 'game';
    } else {
      tabsEl.innerHTML = `
        <button id="ptab-general" class="active" onclick="App.panelTab('general')">General</button>
        <button id="ptab-pokemon" onclick="App.panelTab('pokemon')">Pokemon</button>
        <button id="ptab-badges" onclick="App.panelTab('badges')">Badges</button>
        <button id="ptab-items" onclick="App.panelTab('items')">Items</button>
        <button id="ptab-events" onclick="App.panelTab('events')">Events</button>
      `;
      state.panelTab = 'general';
    }

    document.getElementById('panel-overlay').classList.remove('hidden');
    document.getElementById('my-panel').classList.remove('hidden');
    if (!isAdminSelf) await this._loadMyData();
    this._renderPanelTab();
  },

  closePanel() {
    document.getElementById('panel-overlay').classList.add('hidden');
    document.getElementById('my-panel').classList.add('hidden');
    state.panelTargetId = null;
    this.refresh();
  },

  async _loadMyData() {
    if (state.panelTargetId) {
      state.myData = await API.adminGetPlayer(state.panelTargetId);
    } else if (!state.isAdmin) {
      state.myData = await API.myData();
    }
  },

  _tid() { return state.panelTargetId; }, // shorthand

  panelTab(tab) {
    state.panelTab = tab;
    document.querySelectorAll('.panel-tabs button').forEach(b => b.classList.remove('active'));
    document.getElementById(`ptab-${tab}`)?.classList.add('active');
    this._renderPanelTab();
  },

  _renderPanelTab() {
    const body = document.getElementById('panel-body');
    switch (state.panelTab) {
      case 'game':     this._renderPanelGame(); break;
      case 'general':  body.innerHTML = this._renderPanelGeneral(); break;
      case 'pokemon':  body.innerHTML = this._renderPanelPokemon(); break;
      case 'badges':   body.innerHTML = this._renderPanelBadges(); break;
      case 'items':    body.innerHTML = this._renderPanelItems(); this._onItemSelect(); break;
      case 'events':   body.innerHTML = this._renderPanelEvents(); break;
    }
  },

  /* ── Panel: Game Management (admin only) ─────────────────────────────── */
  async _renderPanelGame() {
    const body = document.getElementById('panel-body');
    body.innerHTML = '<div class="muted small" style="padding:16px">Loading...</div>';
    const [status, results] = await Promise.all([
      API.adminGameStatus().catch(() => null),
      API.adminGameResults().catch(() => []),
    ]);
    if (!status) { body.innerHTML = '<div class="muted small">Error loading game status</div>'; return; }

    const colors = await API.availableColors().catch(() => ({ colors: [] }));
    const availableColors = colors.colors.filter(c => !c.taken);
    const STATUS_LABEL = { setup: 'Setup', active: 'Active', ended: 'Ended' };
    const STATUS_COLOR = { setup: '#f9a825', active: '#43a047', ended: '#e53935' };
    const st = status.game_status;

    body.innerHTML = `
      <div class="panel-section">
        <h3>Game #${status.game_number}
          <span style="font-size:12px;font-weight:600;padding:2px 8px;border-radius:10px;background:${STATUS_COLOR[st]}22;color:${STATUS_COLOR[st]}">${STATUS_LABEL[st]}</span>
        </h3>
        <div class="muted small">${status.player_count} / 6 players registered</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${st === 'setup' ? `<button class="btn-primary" onclick="App.gameStart()">▶ Start Game</button>` : ''}
          ${st === 'active' ? `<button class="btn-primary" onclick="App.gameEnd()">⏹ End Game</button>` : ''}
          ${st !== 'ended' ? `<button class="btn-secondary" onclick="App.gameRestart()">↺ Restart</button>` : ''}
          <button class="btn-danger" onclick="App.gameNew()">＋ New Game</button>
        </div>
      </div>

      ${st !== 'ended' ? `
      <div class="panel-section">
        <h3>Add Player</h3>
        <div class="add-form">
          <div class="row" style="margin-bottom:6px">
            <input id="new-player-username" type="text" placeholder="Username" style="flex:2">
            <input id="new-player-password" type="password" placeholder="Password" style="flex:2">
          </div>
          <div class="row">
            <select id="new-player-color" style="flex:2">
              ${availableColors.length === 0
                ? `<option disabled>All slots taken</option>`
                : availableColors.map(c => `<option value="${c.color}">${c.color.charAt(0).toUpperCase()+c.color.slice(1)}</option>`).join('')}
            </select>
            <button class="btn-add" onclick="App.createPlayer()" ${availableColors.length === 0 ? 'disabled' : ''}>Add</button>
          </div>
        </div>
      </div>
      ` : ''}

      <div class="panel-section">
        <h3>Past Games</h3>
        ${results.length === 0 ? '<div class="muted small">No completed games yet</div>' : results.map(r => `
          <div style="margin-bottom:12px">
            <div style="font-weight:700;margin-bottom:4px">Game #${r.game_number} — ${new Date(r.ended_at).toLocaleDateString()}</div>
            ${r.players.map((p, i) => `
              <div style="display:flex;gap:8px;align-items:center;padding:3px 0;font-size:12px">
                <span style="width:18px;text-align:right;color:var(--text-muted)">${i+1}.</span>
                <span class="deck-dot" style="width:9px;height:9px;border-radius:50%;background:${COLOR_HEX[p.color]||'#888'};flex-shrink:0"></span>
                <span style="flex:1;font-weight:600">${escapeHtml(p.username)}</span>
                <span style="color:var(--accent);font-weight:700">${p.total_vp} VP</span>
                <span class="muted">${p.badges} badges</span>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;
  },

  async gameNew() {
    if (!confirm('Start a NEW game? The current game will be archived and all players deleted.')) return;
    try { await API.adminNewGame(); await this.refresh(); this._renderPanelTab(); }
    catch (e) { alert(e.message); }
  },
  async gameStart() {
    try { await API.adminStartGame(); this._renderPanelTab(); }
    catch (e) { alert(e.message); }
  },
  async gameEnd() {
    if (!confirm('End the game and save results?')) return;
    try { await API.adminEndGame(); await this.refresh(); this._renderPanelTab(); }
    catch (e) { alert(e.message); }
  },
  async gameRestart() {
    if (!confirm('Restart? Results will be saved, then all player data reset (accounts kept).')) return;
    try { await API.adminRestartGame(); await this.refresh(); this._renderPanelTab(); }
    catch (e) { alert(e.message); }
  },
  async createPlayer() {
    const username = document.getElementById('new-player-username')?.value?.trim();
    const password = document.getElementById('new-player-password')?.value;
    const color = document.getElementById('new-player-color')?.value;
    if (!username || !password || !color) return alert('Fill in all fields');
    try {
      await API.adminCreatePlayer({ username, password, color });
      await this.refresh();
      this._renderPanelTab();
    } catch (e) { alert(e.message); }
  },

  /* ── Panel: General ───────────────────────────────────────────────────── */
  _renderPanelGeneral() {
    const s = state.myData?.state || {};

    return `
      <div class="panel-section">
        <h3>Power Points</h3>
        <div class="stepper">
          <button onclick="App.adjPP(-1)">−</button>
          <span class="stepper-val" id="pp-val">${s.pp ?? 1}</span>
          <button onclick="App.adjPP(1)">+</button>
          <span class="stepper-label">/ 6 PP</span>
        </div>
      </div>

      <div class="panel-section">
        <h3>Board Position</h3>
        <div class="muted small">Drag your token on the <strong>Board</strong> tab to move.</div>
      </div>

      <div class="panel-section">
        <h3>KO Tokens</h3>
        <div class="stepper">
          <button onclick="App.adjKO(-1)">−</button>
          <span class="stepper-val" id="ko-val">${s.ko_tokens ?? 0}</span>
          <button onclick="App.adjKO(1)">+</button>
          <span class="stepper-label">/ 4 (4 = Miracle Moment!)</span>
        </div>
      </div>

      <div class="panel-section">
        <h3>Tree &amp; Boulder Tokens</h3>
        <div style="display:flex;gap:24px;flex-wrap:wrap">
          <div>
            <div class="stepper" style="margin-bottom:4px">
              <button onclick="App.adjTokens('tree',-1)">−</button>
              <span class="stepper-val" id="tree-val">${s.tree_tokens ?? 0}</span>
              <button onclick="App.adjTokens('tree',1)">+</button>
            </div>
            <div class="stepper-label">🌲 Tree tokens</div>
          </div>
          <div>
            <div class="stepper" style="margin-bottom:4px">
              <button onclick="App.adjTokens('boulder',-1)">−</button>
              <span class="stepper-val" id="boulder-val">${s.boulder_tokens ?? 0}</span>
              <button onclick="App.adjTokens('boulder',1)">+</button>
            </div>
            <div class="stepper-label">🪨 Boulder tokens</div>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <h3>Title Card</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <div class="form-group" style="margin:0;flex:1;min-width:140px">
            <select id="title-name">
              <option value="">— None —</option>
              ${CARD_DATA.title.map(t => `<option value="${t}" ${s.title_card_name === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0;width:64px">
            <input id="title-vp" type="number" min="0" placeholder="VP" value="${s.title_card_vp || 0}">
          </div>
          <button class="btn-add" onclick="App.saveTitle()">Save</button>
        </div>
      </div>

      <div class="panel-section">
        <h3>Notes</h3>
        <div class="form-group" style="margin:0">
          <textarea id="notes-area" rows="3" placeholder="Any notes…">${s.notes || ''}</textarea>
        </div>
        <button class="btn-add" style="margin-top:6px" onclick="App.saveNotes()">Save Notes</button>
      </div>

      <div class="panel-section">
        <h3>Game Meta (Global)</h3>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="meta-saffron" ${state.gameMeta?.saffron_gym_unlocked ? 'checked' : ''}
              onchange="App.updateMeta('saffron_gym_unlocked', this.checked)">
            Saffron City Gym unlocked (Koga defeated)
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="meta-viridian" ${state.gameMeta?.viridian_gym_unlocked ? 'checked' : ''}
              onchange="App.updateMeta('viridian_gym_unlocked', this.checked)">
            Viridian City Gym unlocked (Blaine defeated)
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="meta-vroad" ${state.gameMeta?.victory_road_unlocked ? 'checked' : ''}
              onchange="App.updateMeta('victory_road_unlocked', this.checked)">
            Victory Road unlocked (Giovanni defeated)
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="meta-ended" ${state.gameMeta?.game_ended ? 'checked' : ''}
              onchange="App.updateMeta('game_ended', this.checked)">
            Game Ended
          </label>
        </div>
      </div>
    `;
  },

  /* ── Panel: Pokemon ───────────────────────────────────────────────────── */
  _renderPanelPokemon() {
    const pokemon = state.myData?.pokemon || [];
    const team = pokemon.filter(p => !p.in_storage).sort((a,b) => a.slot_order - b.slot_order);
    const storage = pokemon.filter(p => p.in_storage);

    const renderPkmnRow = (pk) => `
      <div class="pkmn-edit-row" id="prow-${pk.id}">
        <div class="row1">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="deck-dot ${pk.deck_color}" style="width:10px;height:10px;border-radius:50%;background:${DECK_COLOR_CSS[pk.deck_color]}"></span>
            <span class="name">${escapeHtml(pk.name)}</span>
            <span class="muted">(${pk.printed_atk_pwr} atk)</span>
          </div>
          <button class="btn-delete" onclick="App.deletePokemon(${pk.id})">🗑</button>
        </div>
        <div class="pkmn-edit-controls">
          <!-- LUC -->
          <div class="mini-luc">
            <button class="stepper" style="all:unset;cursor:pointer;padding:2px 6px;border:1px solid var(--border);border-radius:4px;color:var(--text-muted)" onclick="App.adjLUC(${pk.id},-1)">−</button>
            <span style="font-size:13px;font-weight:700;min-width:16px;text-align:center">${pk.level_up_counters}</span>
            <button class="stepper" style="all:unset;cursor:pointer;padding:2px 6px;border:1px solid var(--border);border-radius:4px;color:var(--text-muted)" onclick="App.adjLUC(${pk.id},1)">+</button>
            <span class="muted"> LUC</span>
          </div>
          <!-- Active -->
          <button class="toggle-btn ${pk.is_active && !pk.is_ko ? 'on' : ''}"
            onclick="App.setActive(${pk.id})" ${pk.is_ko ? 'disabled style="opacity:.4"' : ''}>
            ★ Active
          </button>
          <!-- KO -->
          <button class="toggle-btn ${pk.is_ko ? 'ko-on' : ''}"
            onclick="App.toggleKO(${pk.id}, ${!pk.is_ko})">
            💀 KO
          </button>
          <!-- Storage -->
          <button class="toggle-btn ${pk.in_storage ? 'storage-on' : ''}"
            onclick="App.toggleStorage(${pk.id}, ${!pk.in_storage})">
            💾 ${pk.in_storage ? 'In PC' : 'On Team'}
          </button>
        </div>
      </div>
    `;

    return `
      <div class="panel-section">
        <h3>Team (${team.length}/6)</h3>
        ${team.map(renderPkmnRow).join('') || '<div class="muted small">No Pokemon on team</div>'}
      </div>
      ${storage.length > 0 ? `
        <div class="panel-section">
          <h3>PC Storage (${storage.length})</h3>
          ${storage.map(renderPkmnRow).join('')}
        </div>
      ` : ''}
      <div class="panel-section">
        <h3>Add Pokemon</h3>
        <div class="add-form">
          <div class="row" style="margin-bottom:8px">
            <select id="new-pkmn-deck" onchange="App._updatePokemonSelect()" style="flex:1">
              <option value="green">Green deck</option>
              <option value="blue">Blue deck</option>
              <option value="red">Red deck</option>
              <option value="mega">Mega deck</option>
            </select>
            <select id="new-pkmn-name" style="flex:2">
              ${(CARD_DATA.pokemon?.green || []).map(n => `<option value="${n}">${n}</option>`).join('')}
            </select>
          </div>
          <div class="row">
            <input id="new-pkmn-atk" type="number" min="0" placeholder="Printed AtkPwr" style="flex:1">
            <select id="new-pkmn-loc">
              <option value="team">On Team</option>
              <option value="storage">In Storage</option>
            </select>
            <button class="btn-add" onclick="App.addPokemon()">Add</button>
          </div>
        </div>
      </div>
    `;
  },

  /* ── Panel: Badges ────────────────────────────────────────────────────── */
  _renderPanelBadges() {
    const badges = state.myData?.badges || [];
    return `
      <div class="panel-section">
        <h3>Kanto Gym Badges</h3>
        <div class="badge-toggle-grid">
          ${badges.map(b => `
            <label class="badge-toggle ${b.earned ? 'earned' : ''}" id="btgl-${b.badge_name}">
              <input type="checkbox" ${b.earned ? 'checked' : ''}
                onchange="App.toggleBadge('${b.badge_name}', this.checked)">
              <div class="badge-info">
                <div class="bname">${b.display_name}</div>
                <div class="bleader">${b.gym_leader} · ${b.city}</div>
              </div>
            </label>
          `).join('')}
        </div>
        <div class="muted small" style="margin-top:10px">
          Earning Koga's Soul Badge unlocks Saffron City.<br>
          Earning Blaine's Volcano Badge unlocks Viridian City.<br>
          Earning Giovanni's Earth Badge unlocks Victory Road.
        </div>
      </div>
    `;
  },

  /* ── Panel: Items (private) ───────────────────────────────────────────── */
  _renderPanelItems() {
    const items = state.myData?.items || [];
    const total = items.reduce((s, i) => s + i.value, 0);
    return `
      <div class="panel-section">
        <h3>Item Cards (Private 🔒)</h3>
        <div class="muted small" style="margin-bottom:8px">
          Only you can see your items. Other players only see the count.
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span class="muted small">${items.length} items · Total value: ₽${total.toLocaleString()}</span>
          ${items.length > 4 ? '<span class="muted small" style="color:#ef9a9a">⚠ Hand limit is 4!</span>' : ''}
        </div>
        ${items.map(i => `
          <div class="item-row">
            <span class="item-name">${escapeHtml(i.name)}</span>
            <span class="item-type ${i.card_type}">${i.card_type.replace('_',' ')}</span>
            <span class="item-val">₽${i.value.toLocaleString()}</span>
            <button class="btn-delete" onclick="App.deleteItem(${i.id})">🗑</button>
          </div>
        `).join('') || '<div class="muted small">No items in hand</div>'}
      </div>
      <div class="panel-section">
        <h3>Add Item Card</h3>
        <div class="add-form">
          <div class="row" style="margin-bottom:8px">
            <select id="new-item-name" onchange="App._onItemSelect()" style="flex:2">
              ${CARD_DATA.item.map(i => `<option value="${i.name}" data-type="${i.type}" data-val="${i.value}">${i.name}</option>`).join('')}
            </select>
            <select id="new-item-type" style="flex:1">
              <option value="field">Field</option>
              <option value="battle">Battle</option>
              <option value="poke_ball">Poke Ball</option>
            </select>
          </div>
          <div class="row">
            <input id="new-item-val" type="number" min="0" placeholder="₽ value" style="flex:1">
            <button class="btn-add" onclick="App.addItem()">Add</button>
          </div>
        </div>
      </div>
    `;
  },

  _onItemSelect() {
    const sel = document.getElementById('new-item-name');
    const opt = sel?.selectedOptions[0];
    if (!opt) return;
    const typeEl = document.getElementById('new-item-type');
    const valEl  = document.getElementById('new-item-val');
    if (typeEl) typeEl.value = opt.dataset.type || 'field';
    if (valEl)  valEl.value  = opt.dataset.val  || 0;
  },

  /* ── Panel: Events ────────────────────────────────────────────────────── */
  _renderPanelEvents() {
    const events = state.myData?.events || [];
    return `
      <div class="panel-section">
        <h3>Keep Event Cards</h3>
        <div class="muted small" style="margin-bottom:8px">
          Only "Keep" type Event cards are logged here. Discard events are resolved immediately.
          Each Keep Event in hand is worth 1 VP at game end.
        </div>
        ${events.map(e => `
          <div class="event-row">
            <span class="event-name">${escapeHtml(e.name)}</span>
            ${e.effect_text ? `<span class="muted small" style="flex:1">${escapeHtml(e.effect_text)}</span>` : ''}
            <button class="btn-delete" onclick="App.deleteEvent(${e.id})">🗑</button>
          </div>
        `).join('') || '<div class="muted small">No Keep Event cards</div>'}
      </div>
      <div class="panel-section">
        <h3>Add Keep Event Card</h3>
        <div class="add-form">
          <div class="row">
            <select id="new-event-name" style="flex:2">
              ${CARD_DATA.event.map(e => `<option value="${e}">${e}</option>`).join('')}
            </select>
            <button class="btn-add" onclick="App.addEvent()">Add</button>
          </div>
        </div>
      </div>
    `;
  },

  /* ── Actions: General ─────────────────────────────────────────────────── */
  _ppVal: null,
  _koVal: null,
  _treeVal: null,
  _boulderVal: null,

  async _patchState(body) {
    try {
      const tid = this._tid();
      const updated = tid
        ? await API.adminUpdateState(tid, body)
        : await API.updateState(body);
      if (updated && state.myData) state.myData.state = updated;
    } catch (e) { console.error(e); }
  },

  adjPP(delta) {
    const el = document.getElementById('pp-val');
    if (!el) return;
    const cur = parseInt(el.textContent) || 0;
    const next = Math.max(0, Math.min(6, cur + delta));
    el.textContent = next;
    this._patchState({ pp: next });
  },

  adjKO(delta) {
    const el = document.getElementById('ko-val');
    if (!el) return;
    const cur = parseInt(el.textContent) || 0;
    const next = Math.max(0, Math.min(4, cur + delta));
    el.textContent = next;
    this._patchState({ ko_tokens: next });
  },

  adjTokens(type, delta) {
    const id = type === 'tree' ? 'tree-val' : 'boulder-val';
    const el = document.getElementById(id);
    if (!el) return;
    const cur = parseInt(el.textContent) || 0;
    const next = Math.max(0, cur + delta);
    el.textContent = next;
    const body = type === 'tree' ? { tree_tokens: next } : { boulder_tokens: next };
    this._patchState(body);
  },

  async updatePosition(pos) {
    await this._patchState({ board_position: pos });
  },

  async saveTitle() {
    const name = document.getElementById('title-name')?.value.trim() || '';
    const vp = parseInt(document.getElementById('title-vp')?.value) || 0;
    await this._patchState({ title_card_name: name || null, title_card_vp: vp });
  },

  async saveNotes() {
    const notes = document.getElementById('notes-area')?.value || '';
    await this._patchState({ notes });
  },

  async updateMeta(field, value) {
    try {
      state.gameMeta = await API.updateGame({ [field]: value });
      this.renderGameBanner();
    } catch (e) { console.error(e); }
  },

  /* ── Actions: Pokemon ─────────────────────────────────────────────────── */
  _updatePokemonSelect() {
    const deck = document.getElementById('new-pkmn-deck')?.value || 'green';
    const sel = document.getElementById('new-pkmn-name');
    if (!sel) return;
    const list = CARD_DATA.pokemon?.[deck] || [];
    sel.innerHTML = list.map(n => `<option value="${n}">${n}</option>`).join('');
  },

  async addPokemon() {
    const name = document.getElementById('new-pkmn-name')?.value;
    if (!name) return alert('Please select a Pokemon');
    const deck_color = document.getElementById('new-pkmn-deck')?.value || 'green';
    const printed_atk_pwr = parseInt(document.getElementById('new-pkmn-atk')?.value) || 0;
    const in_storage = document.getElementById('new-pkmn-loc')?.value === 'storage';
    const tid = this._tid();
    try {
      tid
        ? await API.adminAddPokemon(tid, { name, deck_color, printed_atk_pwr, in_storage })
        : await API.addPokemon({ name, deck_color, printed_atk_pwr, in_storage });
      await this._loadMyData();
      this._renderPanelTab();
    } catch (e) { alert(e.message); }
  },

  async deletePokemon(id) {
    if (!confirm('Remove this Pokemon?')) return;
    const tid = this._tid();
    try {
      tid ? await API.adminDeletePokemon(tid, id) : await API.deletePokemon(id);
      await this._loadMyData();
      this._renderPanelTab();
    } catch (e) { alert(e.message); }
  },

  async adjLUC(id, delta) {
    const pk = state.myData?.pokemon?.find(p => p.id === id);
    if (!pk) return;
    const next = Math.max(0, Math.min(5, pk.level_up_counters + delta));
    const tid = this._tid();
    try {
      tid
        ? await API.adminUpdatePokemon(tid, id, { level_up_counters: next })
        : await API.updatePokemon(id, { level_up_counters: next });
      await this._loadMyData();
      this._renderPanelTab();
    } catch (e) { alert(e.message); }
  },

  async setActive(id) {
    const tid = this._tid();
    try {
      tid ? await API.adminSetActive(tid, id) : await API.setActive(id);
      await this._loadMyData();
      this._renderPanelTab();
    } catch (e) { alert(e.message); }
  },

  async toggleKO(id, isKO) {
    const tid = this._tid();
    try {
      tid
        ? await API.adminUpdatePokemon(tid, id, { is_ko: isKO })
        : await API.updatePokemon(id, { is_ko: isKO });
      await this._loadMyData();
      this._renderPanelTab();
    } catch (e) { alert(e.message); }
  },

  async toggleStorage(id, inStorage) {
    const tid = this._tid();
    try {
      tid
        ? await API.adminUpdatePokemon(tid, id, { in_storage: inStorage })
        : await API.updatePokemon(id, { in_storage: inStorage });
      await this._loadMyData();
      this._renderPanelTab();
    } catch (e) { alert(e.message); }
  },

  /* ── Actions: Badges ──────────────────────────────────────────────────── */
  async toggleBadge(name, earned) {
    const tid = this._tid();
    try {
      tid
        ? await API.adminToggleBadge(tid, name, earned)
        : await API.toggleBadge(name, earned);
      await this._loadMyData();
      const meta = await API.gameMeta();
      state.gameMeta = meta;
      this.renderGameBanner();
    } catch (e) { alert(e.message); }
  },

  /* ── Actions: Items ───────────────────────────────────────────────────── */
  async addItem() {
    const name = document.getElementById('new-item-name')?.value;
    if (!name) return alert('Please select an item');
    const card_type = document.getElementById('new-item-type')?.value || 'field';
    const value = parseInt(document.getElementById('new-item-val')?.value) || 0;
    const tid = this._tid();
    try {
      tid
        ? await API.adminAddItem(tid, { name, card_type, value })
        : await API.addItem({ name, card_type, value });
      await this._loadMyData();
      this._renderPanelTab();
    } catch (e) { alert(e.message); }
  },

  async deleteItem(id) {
    const tid = this._tid();
    try {
      tid ? await API.adminDeleteItem(tid, id) : await API.deleteItem(id);
      await this._loadMyData();
      this._renderPanelTab();
    } catch (e) { alert(e.message); }
  },

  /* ── Actions: Events ──────────────────────────────────────────────────── */
  async addEvent() {
    const name = document.getElementById('new-event-name')?.value;
    if (!name) return alert('Please select an event card');
    const tid = this._tid();
    try {
      tid
        ? await API.adminAddEvent(tid, { name, effect_text: null })
        : await API.addEvent({ name, effect_text: null });
      await this._loadMyData();
      this._renderPanelTab();
    } catch (e) { alert(e.message); }
  },

  async deleteEvent(id) {
    const tid = this._tid();
    try {
      tid ? await API.adminDeleteEvent(tid, id) : await API.deleteEvent(id);
      await this._loadMyData();
      this._renderPanelTab();
    } catch (e) { alert(e.message); }
  },

  async deletePlayer(userId, username) {
    if (!confirm(`Delete player "${username}" and all their data? This cannot be undone.`)) return;
    try {
      await API.adminDeletePlayer(userId);
      await this.refresh();
    } catch (e) { alert(e.message); }
  },

  /* ── Player Detail Modal ──────────────────────────────────────────────── */
  async openPlayerModal(userId) {
    const p = state.players.find(pl => pl.registered && pl.user_id === userId);
    if (!p) return;
    const isMe = userId === state.myUserId;

    // Header
    const dot = document.getElementById('pm-dot');
    dot.style.background = COLOR_HEX[p.color] || '#888';
    document.getElementById('pm-name').textContent = p.username + (isMe ? ' (you)' : '');
    document.getElementById('pm-pos').textContent = '';
    document.getElementById('player-modal-overlay').classList.remove('hidden');
    document.getElementById('player-modal').classList.remove('hidden');
    document.getElementById('pm-body').innerHTML = '<div class="muted small" style="padding:16px">Loading…</div>';

    // Fetch fresh data so items/events always reflect the current state
    let freshData = null;
    try {
      if (isMe) {
        freshData = await API.myData();
      } else if (state.isAdmin) {
        freshData = await API.adminGetPlayer(userId);
      }
    } catch (_) {}

    // Body — merge fresh data over public snapshot
    const s = (freshData?.state ?? p.state) || {};
    const pp = s.pp ?? 0;
    const pkSource = freshData?.pokemon ?? p.pokemon ?? [];
    const teamPkmn    = pkSource.filter(pk => !pk.in_storage).sort((a,b) => a.slot_order - b.slot_order);
    const storagePkmn = pkSource.filter(pk => pk.in_storage);
    const badges = freshData?.badges ?? p.badges ?? [];
    const events = freshData?.events ?? p.events ?? [];
    const items  = isMe ? (freshData?.items || []) : (state.isAdmin ? (freshData?.items || []) : null);

    const renderPkmnCard = (pk) => `
      <div class="pm-pkmn-card ${pk.is_active && !pk.is_ko ? 'active-card' : ''} ${pk.is_ko ? 'ko-card' : ''} ${pk.in_storage ? 'storage-card' : ''}">
        <img class="pm-card-img" src="${cardImgUrl(pk.deck_color, pk.name)}" alt="${escapeHtml(pk.name)}"
             onerror="this.style.display='none'">
        <div class="pm-pkmn-top">
          <span class="deck-dot ${pk.deck_color}" style="width:9px;height:9px;border-radius:50%;background:${DECK_COLOR_CSS[pk.deck_color]};flex-shrink:0"></span>
          <span class="pm-pkmn-name">${escapeHtml(pk.name)}</span>
          ${pk.printed_atk_pwr > 0 ? `<span class="pm-pkmn-atk">${pk.printed_atk_pwr} atk</span>` : ''}
        </div>
        <div class="pm-luc-row">
          ${[1,2,3,4,5].map(i => `<div class="pm-luc-pip ${i <= pk.level_up_counters ? 'filled' : ''}"></div>`).join('')}
          <span class="muted" style="font-size:10px;margin-left:4px">LUC</span>
        </div>
        <div class="pm-pkmn-tags">
          ${pk.is_active && !pk.is_ko ? '<span class="pm-tag active">★ Active</span>' : ''}
          ${pk.is_ko ? '<span class="pm-tag ko">KO</span>' : ''}
          ${pk.in_storage ? '<span class="pm-tag storage">PC</span>' : ''}
        </div>
      </div>
    `;

    const body = document.getElementById('pm-body');
    body.innerHTML = `
      <!-- Stats -->
      <div class="pm-section">
        <h3>Stats</h3>
        <div class="pm-stats-row">
          <div class="pm-stat"><span>⚡</span>${pp}/6 PP</div>
          <div class="pm-stat"><span>💀</span>${s.ko_tokens ?? 0}/4 KO</div>
          <div class="pm-stat"><span>🌲</span>${s.tree_tokens ?? 0} Tree</div>
          <div class="pm-stat"><span>🪨</span>${s.boulder_tokens ?? 0} Boulder</div>
          <div class="pm-stat"><span>🎒</span>${freshData?.item_card_count ?? p.item_card_count ?? 0} Item${(freshData?.item_card_count ?? p.item_card_count ?? 0) !== 1 ? 's' : ''}</div>
          ${s.title_card_name ? `<div class="pm-stat"><span>🏅</span>${escapeHtml(s.title_card_name)} (+${s.title_card_vp ?? 0} VP)</div>` : ''}
        </div>
        ${s.notes ? `<div class="notes-display">"${escapeHtml(s.notes)}"</div>` : ''}
      </div>

      <!-- Badges -->
      <div class="pm-section">
        <h3>Badges (${badges.filter(b=>b.earned).length}/${badges.length})</h3>
        <div class="pm-badges-grid">
          ${badges.map(b => `
            <div class="pm-badge ${b.earned ? 'earned' : ''}" title="${escapeHtml(b.display_name)} — ${escapeHtml(b.gym_leader)}, ${escapeHtml(b.city)}">
              ${BADGE_ABBR[b.badge_name] || b.badge_name.slice(0,2).toUpperCase()}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Pokemon Team -->
      <div class="pm-section">
        <h3>Team (${teamPkmn.length}/6)</h3>
        ${teamPkmn.length > 0
          ? `<div class="pm-pkmn-grid">${teamPkmn.map(renderPkmnCard).join('')}</div>`
          : '<div class="muted small">No Pokemon on team</div>'}
        ${storagePkmn.length > 0 ? `
          <h3 style="margin-top:8px">PC Storage (${storagePkmn.length})</h3>
          <div class="pm-pkmn-grid">${storagePkmn.map(renderPkmnCard).join('')}</div>
        ` : ''}
      </div>

      <!-- Events -->
      ${events.length > 0 ? `
        <div class="pm-section">
          <h3>Keep Events (${events.length})</h3>
          <div class="pm-card-img-grid">
            ${events.map(e => `
              <div class="pm-card-img-wrap">
                <img class="pm-card-img-full" src="${cardImgUrl('event', e.name)}" alt="${escapeHtml(e.name)}"
                     onerror="this.parentElement.textContent='${escapeHtml(e.name).replace(/'/g, '&#39;')}'">
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Items (self + admin) -->
      ${items !== null ? `
        <div class="pm-section">
          <h3>${isMe ? 'Your Items 🔒' : 'Items'} (${items.length})</h3>
          ${items.length > 0 ? `
            <div class="pm-card-img-grid">
              ${items.map(i => `
                <div class="pm-card-img-wrap">
                  <img class="pm-card-img-full" src="${cardImgUrl('item', i.name)}" alt="${escapeHtml(i.name)}"
                       onerror="this.parentElement.textContent='${escapeHtml(i.name).replace(/'/g, '&#39;')}'">
                </div>
              `).join('')}
            </div>
          ` : '<div class="muted small">No items in hand</div>'}
        </div>
      ` : ''}
    `;

  },

  closePlayerModal() {
    document.getElementById('player-modal-overlay').classList.add('hidden');
    document.getElementById('player-modal').classList.add('hidden');
  },
};

/* ── Board positions: [x%, y%] as % of image dimensions ───────────────────── */
const BOARD_POS = {
  'Pallet Town':                [52.1, 84.2],
  'Route 1':                    [52.1, 77.0],
  'Viridian City':              [47.2, 70.8],
  'Route 2 (South)':            [44.0, 63.5],
  'Viridian Forest':            [39.5, 57.0],
  'Route 2 (North)':            [37.0, 50.0],
  'Pewter City':                [33.2, 44.0],
  'Route 3':                    [38.5, 39.5],
  'Mt. Moon (West)':            [44.5, 36.0],
  'Mt. Moon (East)':            [51.0, 32.5],
  'Route 4':                    [56.0, 29.5],
  'Cerulean City':              [61.5, 24.5],
  'Route 25 (Nugget Bridge)':   [69.0, 18.5],
  'Route 5':                    [64.5, 32.5],
  'Route 6':                    [64.5, 40.5],
  'Vermilion City':             [68.0, 47.5],
  'Route 11':                   [73.5, 43.0],
  'Route 12':                   [77.5, 49.5],
  'Route 13':                   [80.5, 57.0],
  'Route 14':                   [77.0, 62.0],
  'Route 15':                   [71.0, 65.0],
  'Fuchsia City':               [64.5, 65.5],
  'Route 19 (Water)':           [62.0, 72.0],
  'Route 20 (Water)':           [57.5, 78.0],
  'Cinnabar Island':            [49.5, 82.0],
  'Route 21 (Water)':           [52.5, 74.5],
  'Route 8':                    [71.0, 34.5],
  'Route 7':                    [61.0, 44.0],
  'Celadon City':               [55.5, 47.5],
  'Route 16':                   [49.0, 55.0],
  'Route 17 (Cycling Road)':    [51.0, 62.0],
  'Route 18':                   [57.0, 65.5],
  'Saffron City':               [63.5, 38.5],
  'Route 9':                    [69.0, 28.0],
  'Rock Tunnel':                [74.0, 33.5],
  'Route 10':                   [72.0, 38.5],
  'Lavender Town':              [77.5, 37.0],
  'Viridian City (Gym Open)':   [46.0, 72.5],
  'Victory Road':               [29.0, 40.5],
  'Indigo Plateau':             [24.5, 35.5],
};

/* ── Board position helpers ────────────────────────────────────────────────── */
// board_position is stored as "x,y" (free coords) or a legacy named key
function parseBoardCoords(posStr) {
  if (!posStr) return BOARD_POS['Pallet Town'];
  if (BOARD_POS[posStr]) return BOARD_POS[posStr];           // legacy named pos
  const parts = posStr.split(',');
  if (parts.length === 2) {
    const x = parseFloat(parts[0]), y = parseFloat(parts[1]);
    if (!isNaN(x) && !isNaN(y)) return [x, y];
  }
  return BOARD_POS['Pallet Town'];
}

function posDisplayLabel(posStr) {
  if (!posStr) return 'Pallet Town';
  if (BOARD_POS[posStr]) return posStr;                      // named — show as-is
  const parts = posStr.split(',');
  if (parts.length === 2) {
    const x = parseFloat(parts[0]), y = parseFloat(parts[1]);
    if (!isNaN(x) && !isNaN(y)) return Board._nearestPos(x, y); // show nearest name
  }
  return posStr;
}

/* ── Board Module ──────────────────────────────────────────────────────────── */
const Board = {
  _scale: 1,
  _isPanning: false,
  _panStart: null,
  _scrollStart: null,
  _tokenDragging: false,
  _draggingToken: null,
  _snapLabel: null,

  render() {
    this._renderTokens();
    this._renderLegend();
    this._initInteraction();
  },

  _renderTokens() {
    const overlay = document.getElementById('board-overlay');
    if (!overlay) return;
    overlay.innerHTML = '';

    const registered = state.players.filter(p => p.registered);
    registered.forEach((p, idx) => {
      const posStr = p.state?.board_position || 'Pallet Town';
      let [bx, by] = parseBoardCoords(posStr);
      // Slightly offset players at identical coordinates
      const others = registered.slice(0, idx).filter(o =>
        (o.state?.board_position || 'Pallet Town') === posStr
      );
      if (others.length > 0) {
        const angle = (idx / registered.length) * 2 * Math.PI;
        bx += Math.cos(angle) * 3;
        by += Math.sin(angle) * 3;
      }

      const isMe = p.registered && p.user_id === state.myUserId;
      const token = document.createElement('div');
      token.className = 'player-token' + (isMe ? ' my-token' : '');
      token.dataset.userId = p.user_id;
      token.style.cssText = `left:${bx}%;top:${by}%;background:${COLOR_HEX[p.color] || '#888'}`;
      const initials = (p.username || p.color).slice(0, 2).toUpperCase();
      token.innerHTML = `
        <span class="token-initials">${escapeHtml(initials)}</span>
        <div class="token-tooltip">${escapeHtml(p.username)}</div>
      `;
      if (isMe) {
        token.addEventListener('mousedown', e => this._startTokenDrag(e, token, p.user_id));
      } else {
        token.addEventListener('click', () => App.openPlayerModal(p.user_id));
      }
      overlay.appendChild(token);
    });
  },

  _renderLegend() {
    const el = document.getElementById('board-legend');
    if (!el) return;
    const registered = state.players.filter(p => p.registered);
    el.innerHTML = registered.map(p => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${COLOR_HEX[p.color] || '#888'}"></div>
        <span>${escapeHtml(p.username)}</span>
      </div>
    `).join('');
  },

  /* ── Token drag ─────────────────────────────────────────────────────── */
  _startTokenDrag(e, token, userId) {
    e.stopPropagation();
    e.preventDefault();
    this._tokenDragging = true;
    this._draggingToken = token;
    this._draggingUserId = userId;
    this._dragOrigin = { x: e.clientX, y: e.clientY };
    this._hasMoved = false;
  },

  _onTokenMove(e) {
    if (!this._tokenDragging || !this._draggingToken) return;
    // Check if moved enough to count as a drag
    if (!this._hasMoved) {
      const dx = e.clientX - this._dragOrigin.x;
      const dy = e.clientY - this._dragOrigin.y;
      if (Math.hypot(dx, dy) < 5) return; // dead zone
      this._hasMoved = true;
      this._draggingToken.classList.add('dragging');
    }
    const inner = document.getElementById('board-inner');
    if (!inner) return;
    const rect = inner.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
    const y = Math.max(0, Math.min(100, (e.clientY - rect.top)  / rect.height * 100));
    this._draggingToken.style.left = `${x}%`;
    this._draggingToken.style.top  = `${y}%`;
  },

  async _endTokenDrag(e) {
    if (!this._tokenDragging || !this._draggingToken) return;
    this._tokenDragging = false;
    const token = this._draggingToken;
    const userId = this._draggingUserId;
    this._draggingToken = null;
    this._draggingUserId = null;
    token.classList.remove('dragging');

    // Short click (no real movement) → open modal instead
    if (!this._hasMoved) {
      App.openPlayerModal(userId);
      return;
    }

    const inner = document.getElementById('board-inner');
    if (!inner) return;
    const rect = inner.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
    const y = Math.max(0, Math.min(100, (e.clientY - rect.top)  / rect.height * 100));

    // Keep token exactly where dropped
    token.style.left = `${x}%`;
    token.style.top  = `${y}%`;

    // Update tooltip to just show the player name
    const tip = token.querySelector('.token-tooltip');
    if (tip) tip.textContent = state.myUsername;

    // Store as "x,y" free coords
    const posStr = `${x.toFixed(2)},${y.toFixed(2)}`;
    await App.updatePosition(posStr);

    this._renderLegend();
  },

  _nearestPos(x, y) {
    let best = 'Pallet Town', bestDist = Infinity;
    for (const [name, [px, py]] of Object.entries(BOARD_POS)) {
      const d = Math.hypot(x - px, y - py);
      if (d < bestDist) { bestDist = d; best = name; }
    }
    return best;
  },

  /* ── Zoom / Pan ─────────────────────────────────────────────────────── */
  zoom(delta) {
    const inner = document.getElementById('board-inner');
    if (!inner) return;
    this._scale = Math.max(0.3, Math.min(5, this._scale + delta));
    inner.style.transform = `scale(${this._scale})`;
    inner.style.transformOrigin = 'top left';
  },

  resetZoom() {
    const inner = document.getElementById('board-inner');
    if (!inner) return;
    this._scale = 1;
    inner.style.transform = 'scale(1)';
    const scroll = document.getElementById('board-scroll');
    if (scroll) { scroll.scrollLeft = 0; scroll.scrollTop = 0; }
  },

  _initInteraction() {
    const scroll = document.getElementById('board-scroll');
    if (!scroll || scroll._boardInited) return;
    scroll._boardInited = true;

    // Pan (only when not dragging a token)
    scroll.addEventListener('mousedown', e => {
      if (this._tokenDragging) return;
      this._isPanning = true;
      this._panStart = { x: e.clientX, y: e.clientY };
      this._scrollStart = { left: scroll.scrollLeft, top: scroll.scrollTop };
    });
    window.addEventListener('mousemove', e => {
      if (this._tokenDragging) { this._onTokenMove(e); return; }
      if (!this._isPanning) return;
      scroll.scrollLeft = this._scrollStart.left - (e.clientX - this._panStart.x);
      scroll.scrollTop  = this._scrollStart.top  - (e.clientY - this._panStart.y);
    });
    window.addEventListener('mouseup', async e => {
      if (this._tokenDragging) { await this._endTokenDrag(e); return; }
      this._isPanning = false;
    });

    // Ctrl+wheel to zoom
    scroll.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      this.zoom(e.deltaY < 0 ? 0.15 : -0.15);
    }, { passive: false });
  },
};

/* ── Cards Module ──────────────────────────────────────────────────────────── */
const CARD_DECKS = [
  { label: 'Item Deck',       file: 'Item Deck.pdf',           base: '/cards' },
  { label: 'Event Deck',      file: 'Event Deck.pdf',          base: '/cards' },
  { label: 'Green Deck',      file: 'Green Deck.pdf',          base: '/cards' },
  { label: 'Blue Deck',       file: 'Blue Deck.pdf',           base: '/cards' },
  { label: 'Red Deck',        file: 'Red Deck.pdf',            base: '/cards' },
  { label: 'Mega Deck',       file: 'Mega Deck.pdf',           base: '/cards' },
  { label: 'Title Deck',      file: 'Title Deck.pdf',          base: '/cards' },
  { label: 'Gym Leaders',     file: 'Gym Leaders.pdf',         base: '/cards' },
  { label: 'Elite 4',         file: 'Elite 4.pdf',             base: '/cards' },
  { label: 'Legendary',       file: 'Legendary Pokemon.pdf',   base: '/cards' },
];

const RULEBOOK_DOCS = [
  { label: 'Rulebook v3.3',    file: 'Pok\u00e9mon Let\'s Go Adventure - Rulebook v3.3.pdf', base: '/utils' },
  { label: 'Reminder Cards',   file: 'Player Reminder Cards.pdf',                             base: '/utils' },
];

const Cards = {
  _active: null,

  init() {
    const tabs = document.getElementById('cards-tabs');
    if (!tabs) return;
    if (tabs.children.length === 0) {
      tabs.innerHTML =
        `<span class="cards-tab-group-label">Decks</span>` +
        CARD_DECKS.map(d => `
          <button class="card-tab-btn" onclick="Cards.show('${d.base}', '${d.file}', this)">${d.label}</button>
        `).join('') +
        `<span class="cards-tab-group-label">Rulebook</span>` +
        RULEBOOK_DOCS.map(d => `
          <button class="card-tab-btn" onclick="Cards.show('${d.base}', '${d.file}', this)">${d.label}</button>
        `).join('');
    }
  },

  show(base, file, btn) {
    this._active = file;
    document.querySelectorAll('.card-tab-btn').forEach(b => b.classList.remove('active'));
    btn?.classList.add('active');
    const viewer = document.getElementById('cards-viewer');
    if (!viewer) return;
    const url = encodeURI(`${base}/${file}`);
    viewer.innerHTML = `<embed src="${url}" type="application/pdf">`;
  },
};

/* ── Boot ──────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => App.init());
