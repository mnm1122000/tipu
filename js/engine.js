// TIPU! — game engine. Pure logic, runs on the host phone (and in node for tests).
// Every phone holds a hand. Each round has a "table card" (King, Queen or Ace). On your turn you
// put 1–3 cards face down and claim they are all the table card. The next player either plays on
// or shouts TIPU! (liar). The loser of a call takes their own revolver and pulls the trigger.
//
// Scaled for up to 10 players:
//  - the deck grows with the table: 5 cards per living player, same mix (30% each rank, 10% jokers)
//  - guns hold 2 bullets on big tables (7+ players at the start) so the night doesn't last forever
//  - everybody who isn't in the call (alive or dead) bets LIE / TRUTH before the reveal — ghosts too
//  - optional Devil card: caught on a call, everyone else at the table pulls their trigger
//  - optional turn timer so ten people don't wait on one slow thinker

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const HAND = 5;
export const CHAMBERS = 6;
export const RANKS = ['K', 'Q', 'A'];
export const RANK_NAME = { K: 'King', Q: 'Queen', A: 'Ace', J: 'Joker', D: 'Devil' };
export const RANK_PLURAL = { K: 'Kings', Q: 'Queens', A: 'Aces' };
export const TIMERS = [0, 20, 30, 45];
export const BET_MS = 5500;      // betting window after a TIPU! call
export const FLIP_MS = 750;      // per revealed card
export const VERDICT_MS = 2600;  // verdict stamp before the gun comes out
export const GUN_MS = 75000;     // a shooter who stalls this long fires automatically
export const AFTER_SHOT_MS = 3800;

const rnd = (n) => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n;
  }
  return Math.floor(Math.random() * n);
};
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// deck for n living players: 5n cards, ~10% jokers, the rest split evenly between K / Q / A
export function deckMix(n, devil = false) {
  const total = HAND * n;
  const jokers = Math.max(1, Math.round(total / 10)) - (devil ? 1 : 0);
  const rest = total - jokers - (devil ? 1 : 0);
  const base = Math.floor(rest / 3);
  const mix = { K: base, Q: base, A: base, J: Math.max(0, jokers), D: devil ? 1 : 0 };
  const extra = shuffle(['K', 'Q', 'A']).slice(0, rest - base * 3);
  for (const r of extra) mix[r]++;
  return mix;
}
export function buildDeck(n, devil = false) {
  const mix = deckMix(n, devil);
  const deck = [];
  let id = 1;
  for (const r of ['K', 'Q', 'A', 'J', 'D']) for (let i = 0; i < mix[r]; i++) deck.push({ id: id++, r });
  return shuffle(deck);
}
// a card is "true" for the claim if it is the table card, a Joker, or the Devil
export const isTrue = (c, table) => c.r === table || c.r === 'J' || c.r === 'D';

export function bulletsFor(settings, startCount) {
  if (settings.bullets === 'auto') return startCount >= 7 ? 2 : 1;
  return Math.max(1, Math.min(3, Number(settings.bullets) || 1));
}
// chance the next pull fires, given pulls so far and bullets loaded
export function oddsNext(pulls, bullets) {
  const left = CHAMBERS - pulls;
  return left <= 0 ? 1 : Math.min(1, bullets / left);
}

export class Game {
  constructor(state) { this.s = state; this.events = []; }

  static create(code, host) {
    return new Game({
      code, hostId: host.id, phase: 'lobby', round: 0,
      settings: { bullets: 'auto', timer: 30, devil: false, bets: true },
      players: [Game.newPlayer(host)],
      table: null, turn: null, forced: false, lastPlay: null, pile: 0, deadline: 0,
      reveal: null, gun: null, starter: null, winner: null, deaths: [], log: [], bulletsEach: 1,
      startCount: 0, seq: 0,
    });
  }
  static newPlayer({ id, name, emoji, bot }) {
    return { id, name: String(name || 'Player').slice(0, 16), emoji: emoji || '🙂', bot: !!bot, alive: true, hand: [], pulls: 0, chambers: [], reads: 0, bets: 0 };
  }

  p(id) { return this.s.players.find((x) => x.id === id); }
  alive() { return this.s.players.filter((x) => x.alive); }
  idx(id) { return this.s.players.findIndex((x) => x.id === id); }
  emit(e) { this.events.push(e); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  log(text) { this.s.log.push({ text, at: Date.now() }); if (this.s.log.length > 30) this.s.log.shift(); }

  // next living player after `id` (seat order) matching `pred`
  nextAlive(id, pred = () => true) {
    const ps = this.s.players, n = ps.length;
    const i = this.idx(id);
    for (let k = 1; k <= n; k++) {
      const q = ps[(i + k + n) % n];
      if (q.alive && pred(q)) return q;
    }
    return null;
  }

  addPlayer(info) {
    const s = this.s;
    const ex = this.p(info.id);
    if (ex) { if (info.name) ex.name = String(info.name).slice(0, 16); if (info.emoji) ex.emoji = info.emoji; return { ok: true, rejoin: true }; }
    if (s.phase !== 'lobby') return { ok: false, error: 'This game has already started.' };
    if (s.players.length >= MAX_PLAYERS) return { ok: false, error: 'The table is full (10 players).' };
    s.players.push(Game.newPlayer(info));
    this.log(`${info.name} sat down`);
    return { ok: true };
  }

  // ---------------------------------------------------------------- actions
  handle(pid, a, now = Date.now()) {
    const s = this.s;
    const me = this.p(pid);
    const host = pid === s.hostId;
    if (!me) return { ok: false, error: 'You are not at this table.' };
    switch (a.type) {
      case 'settings': {
        if (!host || s.phase !== 'lobby') return { ok: false };
        const p = a.patch || {};
        if ('bullets' in p && ['auto', 1, 2].includes(p.bullets)) s.settings.bullets = p.bullets;
        if ('timer' in p && TIMERS.includes(p.timer)) s.settings.timer = p.timer;
        if ('devil' in p) s.settings.devil = !!p.devil;
        if ('bets' in p) s.settings.bets = !!p.bets;
        return { ok: true };
      }
      case 'move': {
        if (!host || s.phase !== 'lobby') return { ok: false };
        const i = this.idx(a.target), j = i + (a.dir < 0 ? -1 : 1);
        if (i < 0 || j < 0 || j >= s.players.length) return { ok: false };
        [s.players[i], s.players[j]] = [s.players[j], s.players[i]];
        return { ok: true };
      }
      case 'kick': {
        if (!host || a.target === s.hostId) return { ok: false };
        if (s.phase !== 'lobby') return { ok: false, error: 'Kick players from the lobby.' };
        s.players = s.players.filter((x) => x.id !== a.target);
        return { ok: true };
      }
      case 'leave': {
        if (s.phase !== 'lobby' || pid === s.hostId) return { ok: false };
        s.players = s.players.filter((x) => x.id !== pid);
        return { ok: true };
      }
      case 'start': return host ? this.start(now) : { ok: false };
      case 'lobby': {
        if (!host || s.phase !== 'over') return { ok: false };
        this.toLobby();
        return { ok: true };
      }
      case 'end': {
        if (!host || s.phase === 'lobby') return { ok: false };
        this.finish(null, now);
        return { ok: true };
      }
      case 'play': return this.play(pid, a.cards, now);
      case 'liar': return this.callLiar(pid, now);
      case 'bet': {
        const r = s.reveal;
        if (!r || r.stage !== 'bet' || !['lie', 'truth'].includes(a.pick)) return { ok: false };
        if (pid === r.caller || pid === r.target || r.bets[pid]) return { ok: false };
        r.bets[pid] = a.pick;
        this.emit({ type: 'bet', pid });
        if (this.bettors().every((q) => r.bets[q.id])) r.until = Math.min(r.until, now + 400);
        return { ok: true };
      }
      case 'fire': return this.fire(pid, now);
      case 'skipTurn': {
        // host unsticks a disconnected player: their turn plays itself
        if (!host) return { ok: false };
        if (s.phase === 'play' && s.turn) { this.autoTurn(now); return { ok: true }; }
        if (s.phase === 'gun') { for (const id of s.gun.shooters) if (!(id in s.gun.done)) this.fire(id, now, true); return { ok: true }; }
        return { ok: false };
      }
    }
    return { ok: false };
  }

  start(now) {
    const s = this.s;
    if (!['lobby', 'over'].includes(s.phase)) return { ok: false };
    if (s.players.length < MIN_PLAYERS) return { ok: false, error: `Need at least ${MIN_PLAYERS} players.` };
    s.startCount = s.players.length;
    s.bulletsEach = bulletsFor(s.settings, s.startCount);
    for (const p of s.players) {
      p.alive = true; p.hand = []; p.pulls = 0; p.reads = 0; p.bets = 0;
      p.chambers = shuffle([0, 1, 2, 3, 4, 5]).slice(0, s.bulletsEach).sort();
    }
    s.round = 0; s.deaths = []; s.winner = null; s.log = [];
    s.starter = s.players[rnd(s.players.length)].id;
    this.emit({ type: 'start', bullets: s.bulletsEach });
    this.newRound(now);
    return { ok: true };
  }

  newRound(now) {
    const s = this.s;
    const alive = this.alive();
    s.round++;
    s.table = RANKS[rnd(3)];
    const deck = buildDeck(alive.length, s.settings.devil);
    for (const p of s.players) p.hand = [];
    alive.forEach((p, i) => { p.hand = deck.slice(i * HAND, i * HAND + HAND); });
    s.phase = 'play';
    s.pile = 0; s.lastPlay = null; s.reveal = null; s.gun = null; s.forced = false;
    let st = this.p(s.starter);
    if (!st || !st.alive) st = this.nextAlive(s.starter) || alive[0];
    s.turn = st.id;
    this.armTimer(now);
    this.log(`Round ${s.round}: ${RANK_NAME[s.table]}'s table`);
    this.emit({ type: 'deal', round: s.round, table: s.table, to: alive.map((p) => p.id), first: s.turn });
  }

  armTimer(now) { const t = this.s.settings.timer; this.s.deadline = t ? now + t * 1000 + 2500 : 0; }

  play(pid, ids, now) {
    const s = this.s;
    if (s.phase !== 'play' || s.turn !== pid) return { ok: false, error: 'Not your turn.' };
    if (s.forced) return { ok: false, error: 'Everyone else is out of cards. You must call TIPU!' };
    const me = this.p(pid);
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3) return { ok: false, error: 'Play 1 to 3 cards.' };
    const uniq = [...new Set(ids.map(Number))];
    const cards = uniq.map((id) => me.hand.find((c) => c.id === id));
    if (cards.length !== ids.length || cards.some((c) => !c)) return { ok: false, error: 'You do not have those cards.' };
    if (cards.some((c) => c.r === 'D') && cards.length > 1) return { ok: false, error: 'The Devil card must be played alone.' };
    me.hand = me.hand.filter((c) => !uniq.includes(c.id));
    s.pile += cards.length;
    s.lastPlay = { by: pid, cards, n: cards.length };
    this.log(`${me.name}: "${cards.length} ${cards.length > 1 ? RANK_PLURAL[s.table] : RANK_NAME[s.table]}"`);
    this.emit({ type: 'play', by: pid, n: cards.length, table: s.table, left: me.hand.length });
    // next living player who still has cards; if nobody else does, the next living player must call
    const nx = this.nextAlive(pid, (q) => q.hand.length > 0 && q.id !== pid);
    if (nx) { s.turn = nx.id; s.forced = false; }
    else { s.turn = this.nextAlive(pid).id; s.forced = true; }
    this.armTimer(now);
    return { ok: true };
  }

  bettors() {
    const r = this.s.reveal;
    if (!r || !this.s.settings.bets) return [];
    return this.s.players.filter((q) => q.id !== r.caller && q.id !== r.target);
  }

  callLiar(pid, now) {
    const s = this.s;
    if (s.phase !== 'play' || s.turn !== pid) return { ok: false, error: 'Not your turn.' };
    const lp = s.lastPlay;
    if (!lp || lp.by === pid) return { ok: false, error: 'Nothing to call yet.' };
    const lie = lp.cards.some((c) => !isTrue(c, s.table));
    const devil = lp.cards.some((c) => c.r === 'D');
    s.phase = 'reveal';
    s.reveal = { caller: pid, target: lp.by, cards: lp.cards, n: lp.n, lie, devil, bets: {}, stage: 'bet', until: now };
    const bet = this.bettors().length > 0;
    s.reveal.stage = bet ? 'bet' : 'flip';
    s.reveal.until = now + (bet ? BET_MS : 0);
    if (!bet) s.reveal.until = now + 900 + lp.n * FLIP_MS;
    this.log(`${this.p(pid).name} shouts TIPU! at ${this.p(lp.by).name}`);
    this.emit({ type: 'liar', by: pid, target: lp.by, n: lp.n, bet });
    if (!bet) this.emit({ type: 'flip', cards: lp.cards, lie, devil, target: lp.by, caller: pid, bets: {} });
    return { ok: true };
  }

  fire(pid, now, auto = false) {
    const s = this.s;
    const g = s.gun;
    if (s.phase !== 'gun' || !g || !g.shooters.includes(pid) || pid in g.done) return { ok: false };
    const me = this.p(pid);
    const dead = me.chambers.includes(me.pulls);
    me.pulls++;
    g.done[pid] = dead;
    if (dead) {
      me.alive = false;
      me.hand = [];
      s.deaths.push(pid);
      this.log(`💥 ${me.name} is dead`);
    } else this.log(`*click* ${me.name} lives (${me.pulls}/${CHAMBERS})`);
    this.emit({ type: 'shot', pid, dead, pull: me.pulls, auto });
    if (g.shooters.every((id) => id in g.done)) g.until = now + AFTER_SHOT_MS;
    return { ok: true };
  }

  autoTurn(now) {
    const s = this.s;
    const me = this.p(s.turn);
    if (!me) return;
    if (s.forced || !me.hand.length) { this.callLiar(me.id, now); return; }
    this.play(me.id, [me.hand[rnd(me.hand.length)].id], now);
  }

  // live view for the shooter: will their next pull fire? (sent only to them, so the bang is instant)
  liveFor(pid) { const me = this.p(pid); return !!me && me.chambers.includes(me.pulls); }

  // ---------------------------------------------------------------- timers
  tick(now) {
    const s = this.s;
    if (s.phase === 'play' && s.deadline && now > s.deadline) { this.autoTurn(now); return true; }
    if (s.phase === 'reveal' && now >= s.reveal.until) {
      const r = s.reveal;
      if (r.stage === 'bet') {
        r.stage = 'flip';
        r.until = now + 900 + r.n * FLIP_MS;
        // score the bets now that the cards are about to turn
        const right = r.lie ? 'lie' : 'truth';
        for (const [id, pick] of Object.entries(r.bets)) { const q = this.p(id); if (q) { q.bets++; if (pick === right) q.reads++; } }
        this.emit({ type: 'flip', cards: r.cards, lie: r.lie, devil: r.devil, target: r.target, caller: r.caller, bets: r.bets });
        return true;
      }
      if (r.stage === 'flip') {
        r.stage = 'verdict';
        r.until = now + VERDICT_MS;
        let shooters;
        if (r.devil) shooters = this.alive().filter((q) => q.id !== r.target).map((q) => q.id);
        else shooters = [r.lie ? r.target : r.caller];
        r.shooters = shooters;
        this.log(r.devil ? `😈 The Devil card! Everyone else takes the gun` : r.lie ? `${this.p(r.target).name} lied` : `${this.p(r.target).name} told the truth`);
        this.emit({ type: 'verdict', lie: r.lie, devil: r.devil, shooters, target: r.target, caller: r.caller });
        return true;
      }
      if (r.stage === 'verdict') {
        s.phase = 'gun';
        s.gun = { shooters: r.shooters, done: {}, until: now + GUN_MS, devil: r.devil };
        this.emit({ type: 'gun', shooters: r.shooters });
        return true;
      }
    }
    if (s.phase === 'gun' && now >= s.gun.until) {
      const g = s.gun;
      const pending = g.shooters.filter((id) => !(id in g.done));
      if (pending.length) { for (const id of pending) this.fire(id, now, true); return true; }
      // everybody fired: who starts the next round?
      const alive = this.alive();
      if (alive.length <= 1) { this.finish(alive[0] ? alive[0].id : null, now); return true; }
      const first = g.shooters.find((id) => this.p(id).alive);
      s.starter = first || (this.nextAlive(g.shooters[0]) || alive[0]).id;
      this.newRound(now);
      return true;
    }
    return false;
  }

  finish(winner, now) {
    const s = this.s;
    s.phase = 'over';
    s.winner = winner;
    s.turn = null; s.reveal = null; s.gun = null;
    if (winner) this.log(`🏆 ${this.p(winner).name} is the last one standing`);
    this.emit({ type: 'win', winner });
  }

  toLobby() {
    const s = this.s;
    s.phase = 'lobby';
    for (const p of s.players) { p.alive = true; p.hand = []; p.pulls = 0; }
    s.round = 0; s.reveal = null; s.gun = null; s.lastPlay = null; s.turn = null; s.winner = null;
  }

  // ---------------------------------------------------------------- views
  viewFor(pid) {
    const s = this.s;
    const me = this.p(pid);
    if (!me) return null;
    const r = s.reveal;
    const showCards = r && r.stage !== 'bet';
    return {
      code: s.code, hostId: s.hostId, phase: s.phase, round: s.round, settings: s.settings,
      minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS, bulletsEach: s.bulletsEach,
      table: s.table, turn: s.turn, forced: s.forced, pile: s.pile,
      deadline: s.deadline ? s.deadline - Date.now() : 0,
      lastPlay: s.lastPlay ? { by: s.lastPlay.by, n: s.lastPlay.n } : null,
      reveal: r ? {
        caller: r.caller, target: r.target, n: r.n, stage: r.stage, left: Math.max(0, r.until - Date.now()),
        cards: showCards ? r.cards : null, lie: showCards ? r.lie : null, devil: showCards ? r.devil : null,
        shooters: r.shooters || null, myBet: r.bets[pid] || null, betCount: Object.keys(r.bets).length,
        canBet: !!s.settings.bets && pid !== r.caller && pid !== r.target,
      } : null,
      gun: s.gun ? { shooters: s.gun.shooters, done: s.gun.done, devil: s.gun.devil, left: Math.max(0, s.gun.until - Date.now()) } : null,
      winner: s.winner, deaths: s.deaths,
      players: s.players.map((q) => ({
        id: q.id, name: q.name, emoji: q.emoji, bot: q.bot, alive: q.alive, count: q.hand.length,
        pulls: q.pulls, reads: q.reads, bets: q.bets,
      })),
      me: {
        hand: me.hand,
        live: s.phase === 'gun' && s.gun.shooters.includes(pid) && !(pid in s.gun.done) ? this.liveFor(pid) : null,
      },
      log: s.log.slice(-6),
    };
  }
}
