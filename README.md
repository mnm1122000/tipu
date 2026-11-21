# TIPU!

> Lie with a straight face. Get caught, pull the trigger.

A bluffing card game for 2–10 players in the same room. Each player uses their own phone. One person hosts a table, everyone else scans the QR code or types the 5-letter code.

**Play:** https://mnm1122000.github.io/tipu/
**Test bench:** https://mnm1122000.github.io/tipu/tools/bench.html

## How a round runs

1. **Deal.** Every living player gets 5 cards. The phone picks the **table card** for the round: King, Queen or Ace.
2. **Play.** On your turn, select 1–3 cards and swipe them up (or tap *Play*). They go face down, and you're claiming they're all the table card. **Jokers** count as the table card. You can lie.
3. **TIPU!** Instead of playing, you can shout **TIPU!** (liar) at the player before you. If you have no cards you're skipped. If everyone else is out of cards, the next player has to call.
4. **Bets.** Before the cards are turned, everyone not in the call (dead players too 👻) has 5 seconds to bet **LIE** or **TRUTH**. The best reader gets an award at the end.
5. **Reveal.** If any card isn't the table card or a Joker, the liar takes the gun. If all of them were true, the **caller** takes the gun.
6. **The gun.** The shooter's phone becomes a full-screen revolver:
   - the cylinder swings out: **flick the bullets** to spin it (ratchet clicks, motion blur, haptics)
   - **swipe down** (or tap *Snap it shut*) and the cylinder slams into the frame. The gun stands up and fills the screen.
   - optional: **drag the hammer back** to cock it (lighter trigger)
   - **press the trigger and pull it down** until it breaks → **BANG** (muzzle flash, recoil, smoke, cracked screen, red out) or ***click*** (heartbeat, sigh of relief)

   Everyone else watches a live mirror of the same gun: the spin, the hammer and the trigger move as the shooter moves them.

   Spinning is **for show only**. Each gun has its bullet(s) in fixed chambers from the start, and every pull moves to the next chamber, so the odds are 1 in 6, then 1 in 5, then 1 in 4… no matter how you spin.
7. A new round starts with fresh cards. **Last player alive wins.**

## Made for 10 players

- **The deck grows with the table:** 5 cards per living player, always about 30% each rank and 10% Jokers (10 players = 15 Kings, 15 Queens, 15 Aces, 5 Jokers).
- **2 bullets on big tables:** *Bullets per gun* on *Auto* loads 2 bullets when 7+ players start, so a 10-player night lasts about 20 rounds, not 35. You can force 1 or 2.
- **Ghost bets:** nobody just waits. Everyone outside the call, alive or dead, bets on every TIPU!.
- **Turn timer** (20 / 30 / 45 s / off): if it runs out, a random card is played for you.
- **😈 Devil card** (optional): one Devil card in the deck. It counts as true and must be played alone. Call TIPU! on it and **everyone else** at the table pulls their trigger at once.
- Seats in a ring that matches where people really sit (host orders them with ▲▼), dots under each player showing how many times they've pulled, and a red % badge when someone's next pull is 50% or worse.

## How it works

- No server. Phones talk through public MQTT relay brokers (emqx, hivemq, mosquitto), same as SATU!.
- The host phone runs the game engine (`js/engine.js`). Each hand travels **end-to-end encrypted** (ECDH P-256 + AES-GCM) only to its owner. Played cards stay on the host until someone calls TIPU!.
- The shooter's phone is told whether its next pull is live when the gun comes out, so the bang lands the instant the hammer falls. The live gun stream (`rv/<player>`) carries only spin/hammer/trigger positions.
- Sounds are synthesised live with Web Audio (`js/sfx.js`): gunshot with room reverb, dry click, hammer cock, cylinder ratchet, cylinder open/close, heartbeat, cards, TIPU! stab, verdict stings. Vibration on Android, Taptic ticks on iPhone (iOS 18+).
- The revolver is drawn in SVG (`js/gun.js`).
- Limitation: the host phone holds every hand and the bullet positions in memory. Pick a host who won't open the devtools.
- *Try the gun* on the home screen opens a practice revolver (1 in 6, nothing at stake).

## Development

```
node tools/serve.cjs 5192     # http://localhost:5192  (add ?dev=1 for "Add bot" players)
node tools/test-engine.js     # rule tests + 540 random full games (2–10 players)
```

**Test bench:** `tools/bench.html`. You're the host on the big phone. Pick 1–9 players and they join by themselves when your table opens, play their own turns, bet, and pull their own triggers (both switchable so you can drive their phones yourself). `tools/icons.html` renders the PNG icons from `assets/img/logo.svg`.

TIPU! is an original game in the bluffing-card family (Cheat / I Doubt It) with a revolver twist. It isn't affiliated with any commercial game.
