// node tools/test-engine.js — rule checks + many random full games with 2–10 players
import { Game, deckMix, buildDeck, isTrue, oddsNext, bulletsFor, HAND, MAX_PLAYERS } from '../js/engine.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('✗ ' + msg); } };

// deck mix
for (let n = 2; n <= 10; n++) {
  const m = deckMix(n);
  const total = m.K + m.Q + m.A + m.J + m.D;
  ok(total === HAND * n, `deck size for ${n} = ${total}`);
  ok(Math.max(m.K, m.Q, m.A) - Math.min(m.K, m.Q, m.A) <= 1, `ranks even for ${n}`);
  const md = deckMix(n, true);
  ok(md.D === 1 && md.K + md.Q + md.A + md.J + md.D === HAND * n, `devil deck for ${n}`);
  ok(buildDeck(n).length === HAND * n, `buildDeck ${n}`);
}
ok(isTrue({ r: 'J' }, 'K') && isTrue({ r: 'K' }, 'K') && !isTrue({ r: 'Q' }, 'K') && isTrue({ r: 'D' }, 'A'), 'isTrue');
ok(oddsNext(1) === 1 / 6 && oddsNext(2) === 2 / 6, 'odds');
ok(bulletsFor({ bullets: 'auto' }, 7) === 2 && bulletsFor({ bullets: 'auto' }, 6) === 1 && bulletsFor({ bullets: 2 }, 3) === 2, 'bullets');

// fixed odds: with 2 bullets every pull fires about 2 times in 6
{
  let dead = 0, N = 30000;
  for (let k = 0; k < N; k++) {
    const g = Game.create('T', { id: 'a', name: 'A' });
    g.addPlayer({ id: 'b', name: 'B' });
    g.start(0);
    const a = g.p('a'); a.bullets = 2; a.pulls = 4;
    g.s.phase = 'gun'; g.s.gun = { shooters: ['a'], done: {}, until: 1e12 };
    g.handle('a', { type: 'fire' }, 0);
    if (!a.alive) dead++;
  }
  ok(Math.abs(dead / N - 1 / 3) < 0.015, 'fixed odds 2/6 got ' + (dead / N).toFixed(3));
}

// bullet streaks: caught 3 times = +1 bullet, honest when called 3 times = -1 bullet
{
  const g = Game.create('T', { id: 'a', name: 'A' });
  g.addPlayer({ id: 'b', name: 'B' }); g.addPlayer({ id: 'c', name: 'C' });
  g.s.settings.timer = 0; g.s.settings.bets = false; g.s.settings.bullets = 2; g.start(0);
  const s = g.s, a = g.p('a');
  const call = (lie) => {
    s.phase = 'play'; s.turn = 'a'; s.forced = false;
    a.hand = [{ id: 7000 + Math.floor(Math.random() * 999), r: lie ? (s.table === 'K' ? 'Q' : 'K') : s.table }];
    g.handle('a', { type: 'play', cards: [a.hand[0].id] }, 0);
    g.handle(s.turn, { type: 'liar' }, 0);
    let t = 0; while (s.phase === 'reveal') { t += 100; g.tick(t); }
    s.phase = 'play'; s.gun = null;
  };
  call(true); call(true); ok(a.bullets === 2, 'two lies: no change');
  call(true); ok(a.bullets === 3 && a.caught === 0, 'third lie: +1 bullet');
  call(false); call(false); call(false); ok(a.bullets === 2 && a.honest === 0, 'three truths: -1 bullet');
}

// seats arranged on the virtual table set the turn order (clockwise)
{
  const g = Game.create('T', { id: 'a', name: 'A' });
  for (const id of ['b', 'c', 'd']) g.addPlayer({ id, name: id });
  g.handle('a', { type: 'arrange', seats: { a: [0.5, 0.95], b: [0.05, 0.5], c: [0.95, 0.5], d: [0.5, 0.05] } });
  ok(g.s.players.map((q) => q.id).join('') === 'dcab' || g.s.players.map((q) => q.id).join('') === 'cabd' || g.s.players.map((q) => q.id).join(''), 'arranged');
  const order = g.s.players.map((q) => q.id).join('');
  ok(['abdc', 'bdca', 'dcab', 'cabd'].includes(order), 'clockwise from the seats: ' + order);
}

// scripted round: a lie gets caught
{
  const g = Game.create('T', { id: 'a', name: 'A' });
  g.addPlayer({ id: 'b', name: 'B' }); g.addPlayer({ id: 'c', name: 'C' });
  g.s.settings.timer = 0;
  g.start(0);
  const s = g.s;
  s.turn = 'a';
  const a = g.p('a');
  a.hand = [{ id: 901, r: s.table === 'K' ? 'Q' : 'K' }, { id: 902, r: 'J' }];
  ok(g.handle('a', { type: 'play', cards: [901, 902] }, 0).ok, 'a plays');
  ok(s.turn === 'b' && s.pile === 2, 'turn to b');
  ok(!g.handle('a', { type: 'liar' }, 0).ok, 'a cannot call own play');
  ok(g.handle('b', { type: 'liar' }, 0).ok, 'b calls');
  ok(s.phase === 'reveal' && s.reveal.lie === true, 'lie detected');
  ok(g.viewFor('c').reveal.cards === null, 'cards hidden during bets');
  ok(g.handle('c', { type: 'bet', pick: 'lie' }, 10).ok, 'c bets');
  ok(!g.handle('b', { type: 'bet', pick: 'lie' }, 10).ok, 'caller cannot bet');
  let t = 0;
  while (s.phase === 'reveal' && t < 60000) { t += 100; g.tick(t); }
  ok(s.phase === 'gun' && s.gun.shooters[0] === 'a', 'liar shoots');
  ok(g.p('c').reads === 1, 'bet scored');
  ok(g.viewFor('a').me.live === g.liveFor('a'), 'live flag to shooter');
  ok(g.viewFor('b').me.live === null, 'no live flag for others');
  ok(g.handle('a', { type: 'fire' }, t).ok && g.p('a').pulls === 1, 'fire');
  ok(!g.handle('a', { type: 'fire' }, t).ok, 'no double fire');
}

// devil: everyone else shoots
{
  const g = Game.create('T', { id: 'a', name: 'A' });
  for (const id of ['b', 'c', 'd']) g.addPlayer({ id, name: id });
  g.s.settings.devil = true; g.s.settings.bets = false; g.s.settings.timer = 0;
  g.start(0);
  const s = g.s; s.turn = 'a';
  g.p('a').hand = [{ id: 990, r: 'D' }, { id: 991, r: 'K' }];
  ok(!g.handle('a', { type: 'play', cards: [990, 991] }, 0).ok, 'devil must be alone');
  ok(g.handle('a', { type: 'play', cards: [990] }, 0).ok, 'devil alone ok');
  g.handle(s.turn, { type: 'liar' }, 0);
  let t = 0; while (s.phase === 'reveal') { t += 100; g.tick(t); }
  ok(s.gun.shooters.length === 3 && !s.gun.shooters.includes('a'), 'devil: 3 others shoot');
}

// forced call when everyone else is empty
{
  const g = Game.create('T', { id: 'a', name: 'A' });
  g.addPlayer({ id: 'b', name: 'B' }); g.addPlayer({ id: 'c', name: 'C' });
  g.s.settings.timer = 0; g.start(0);
  const s = g.s; s.turn = 'a';
  g.p('b').hand = []; g.p('c').hand = [];
  g.handle('a', { type: 'play', cards: [g.p('a').hand[0].id] }, 0);
  ok(s.turn === 'b' && s.forced, 'b forced to call');
  ok(!g.handle('b', { type: 'play', cards: [1] }, 0).ok, 'forced cannot play');
  ok(g.handle('b', { type: 'liar' }, 0).ok, 'forced call ok');
}

// twists: counter-clockwise turns, open calls, no jokers
{
  const g = Game.create('T', { id: 'a', name: 'A' });
  for (const id of ['b', 'c', 'd']) g.addPlayer({ id, name: id });
  g.s.settings.timer = 0; g.start(0);
  const s = g.s;
  s.dir = -1; s.twist = 'reverse'; s.turn = 'a';
  g.handle('a', { type: 'play', cards: [g.p('a').hand[0].id] }, 0);
  ok(s.turn === 'd', 'reverse: a → d');
  s.twist = 'open';
  ok(g.canCall('c') && !g.canCall('a'), 'open: anyone but the player can call');
  ok(g.handle('c', { type: 'liar' }, 0).ok && s.reveal.caller === 'c', 'open: c calls out of turn');
  const m = deckMix(6, false, true);
  ok(m.J === 0 && m.K + m.Q + m.A === 30, 'no-joker deck');
}

// random full games
let games = 0, rounds = 0, maxRounds = 0;
const stats = {};
for (let n = 2; n <= MAX_PLAYERS; n++) {
  for (let k = 0; k < 60; k++) {
    const g = Game.create('T', { id: 'p0', name: 'P0' });
    for (let i = 1; i < n; i++) ok(g.addPlayer({ id: 'p' + i, name: 'P' + i }).ok, 'add');
    g.s.settings.timer = k % 3 ? 0 : 20;
    g.s.settings.devil = k % 4 === 0;
    g.s.settings.bets = k % 2 === 0;
    g.s.settings.twists = k % 5 !== 0;
    ok(g.start(0).ok, 'start');
    const s = g.s;
    let t = 0, steps = 0;
    while (s.phase !== 'over' && steps < 20000) {
      steps++; t += 250;
      if (s.phase === 'play') {
        const me = g.p(s.turn);
        ok(me && me.alive, 'turn player alive');
        if (Math.random() < 0.1 && k % 3 === 0) { g.tick(t + 60000); continue; } // let the timer play
        const caller = s.twist === 'open' && Math.random() < 0.15 ? s.players.find((q) => g.canCall(q.id) && q.id !== me.id) : null;
        if (caller) { ok(g.handle(caller.id, { type: 'liar' }, t).ok, 'open call'); continue; }
        const canCall = s.lastPlay && s.lastPlay.by !== me.id;
        if (s.forced || (canCall && Math.random() < 0.35)) ok(g.handle(me.id, { type: 'liar' }, t).ok, 'liar');
        else {
          const devil = me.hand.find((c) => c.r === 'D');
          const cnt = devil ? 1 : 1 + Math.floor(Math.random() * Math.min(3, me.hand.length));
          const cards = devil ? [devil.id] : me.hand.slice(0, cnt).map((c) => c.id);
          ok(g.handle(me.id, { type: 'play', cards }, t).ok, 'play ' + JSON.stringify(cards));
        }
      } else if (s.phase === 'reveal') {
        if (s.reveal.stage === 'bet') for (const q of g.bettors()) if (Math.random() < 0.5) g.handle(q.id, { type: 'bet', pick: Math.random() < 0.5 ? 'lie' : 'truth' }, t);
        g.tick(t);
      } else if (s.phase === 'gun') {
        for (const id of s.gun.shooters) if (Math.random() < 0.5) g.handle(id, { type: 'fire' }, t);
        g.tick(t);
      }
      const total = s.players.reduce((a, q) => a + q.hand.length, 0) + s.pile;
      if (s.phase === 'play') ok(total === HAND * g.alive().length, `cards conserved ${total}`);
      for (const q of s.players) ok(q.bullets >= 1 && q.bullets <= 5, 'bullets in range');
    }
    ok(s.phase === 'over' && s.winner && g.alive().length === 1, `game ends (n=${n})`);
    ok(s.deaths.length === n - 1, 'deaths recorded');
    games++; rounds += s.round; maxRounds = Math.max(maxRounds, s.round);
    stats[n] = (stats[n] || 0) + s.round;
  }
}
console.log(`${games} random games, avg ${(rounds / games).toFixed(1)} rounds, max ${maxRounds}`);
console.log('avg rounds by players:', Object.entries(stats).map(([n, r]) => `${n}p=${(r / 60).toFixed(1)}`).join(' '));
if (fails) { console.error(`${fails} checks failed`); process.exit(1); }
console.log('all checks passed ✓');
