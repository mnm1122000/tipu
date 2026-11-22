# TIPU!

> Lie with a straight face. Get caught, pull the trigger.

A bluffing card game for 2–10 players in the same room. Each player uses their own phone. One person hosts a table, everyone else scans the QR code or types the 5-letter code.

**Play:** https://mnm1122000.github.io/tipu/
**Test bench:** https://mnm1122000.github.io/tipu/tools/bench.html

## Game modes (host picks in the lobby)

- **🎩 Classic:** as simple as it gets. Only the next player can call TIPU!. No twists, no bets, no Devil, bullets never change.
- **🎉 Party:** Classic plus round twists, bets with bullet stakes, and bullets that move with your record. Devil card optional.
- **🔥 Chaos:** Party, but **anyone** at the table can shout TIPU! on any play, at any time.

## Wardrobe

On the home screen (and in the lobby) everyone opens the **👔 Wardrobe** and picks:
- one of **15 outfits** in a 1920s noir cartoon style (10 men's, 5 women's: Pinstripe Boss, Suspenders, Waistcoat, Trench Coat, Brown Suit, Fur Coat Don, Green Overcoat, The Dandy, The Driver, Baju Melayu, The Flapper, Lady in Red, Blue Pantsuit, Noir Hijab, Emerald Diva)
- one of **5 revolvers**: Classic (blued, walnut), Nickel (chrome, black grip), Gold (ivory grip), Snub (short barrel), Pearl (black, mother-of-pearl).

Your profile photo becomes the character's whole head.

## How a round runs

1. **Seats.** In the lobby the host drags everyone around a virtual table (round or long) to **where they really sit**. Turns go clockwise from those seats, and each phone turns the table so its own seat is at the bottom.
2. **Round intro.** Every round opens with a full-screen card: the **table card** (King, Queen or Ace) and exactly **how many Kings, Queens, Aces, Jokers (and the Devil)** are in the deck, counting up with animation. A small bar at the top of the table keeps the counts, the direction, the twist and your own gun (tap it to replay the intro).
3. **Play.** On your turn, select 1–3 cards and swipe them up (or tap *Play*). They go face down, and you're claiming they're all the table card. **Jokers** count as the table card. You can lie.
4. **TIPU!** Instead of playing, shout **TIPU!** (liar) at the last play. Out of cards? You're skipped. If everyone else is empty, the next player has to call.
5. **Bets.** Before the cards turn, everyone not in the call bets **LIE**, **TRUTH** or **PASS** (the tap locks instantly). Alive players have real stakes: a **wrong read loads +1 bullet**, every **2 right reads remove 1**, PASS is safe. Ghosts 👻 bet for glory. The best reader gets an award at the end.
6. **Reveal.** If any card isn't the table card or a Joker, the liar takes the gun. If they were all true, the **caller** takes the gun.
7. **The gun.** The shooter's phone becomes a revolver:
   - the cylinder swings out and shows **how many bullets are loaded out of 6**. Drag bullets to other chambers if you like.
   - **swipe down** (or *Load the gun*): the cylinder slams in, the gun stands up and fills the screen
   - **swipe across the cylinder on the gun** to spin it (ratchet clicks, motion blur, haptics)
   - optional: **drag the hammer back** to cock it (lighter trigger)
   - **press the trigger and pull it down** until it breaks → **BANG** (muzzle flash, recoil, smoke, cracked screen, red out) or ***click*** (heartbeat, relief)

   The gun only appears on the shooter's phone. Everyone else watches the shooter as a **character in a spotlight with their profile picture as the face**, standing in the outfit they picked in the wardrobe, holding the revolver they picked, raising the revolver to the temple, sweating and shaking harder as the real trigger tightens, then **BANG** (flash, splatter, the body slumps, a ghost rises) or ***click*** (relief).

   **Odds:** every pull is a fresh spin, so the chance is simply **your bullets in 6**, every time (2 bullets = 2/6). Moving bullets and spinning are for show only.
8. **Bullets move.** Called a liar while telling the truth **3 times** → **−1 bullet** (never below 1). Caught lying **3 times** → **+1 bullet** (up to 5).
9. A new round starts with fresh cards. **Last player alive wins.**

## Made for 10 players

- **The deck grows with the table:** 5 cards per living player, about 30% each rank and 10% Jokers (10 players = 15 Kings, 15 Queens, 15 Aces, 5 Jokers).
- **2 bullets on big tables:** *Bullets per gun* on *Auto* gives everyone 2 bullets when 7+ players start. You can force 1 or 2.
- **🌀 Round twists** (from round 2, about 4 rounds in 10): **↺ Counter-clockwise** (turns go the other way), **📢 Anyone can call** (anyone at the table can shout TIPU! on the last play), **🚫 No Jokers**.
- **Ghost bets:** everyone outside the call, alive or dead, bets on every TIPU!.
- **👻 The back room:** dead players shoot bottles on the bar shelves while they wait (30 s rounds, 6 shots then swipe down to reload, gold bottle +3, skull bottle −3). Best scores show on their seat. It closes by itself when there's a bet to make.
- **Turn timer** (20 / 30 / 45 s / off): if it runs out, a random card is played for you.
- **😈 Devil card** (optional): counts as true and must be played alone. Call TIPU! on it and **everyone else** pulls their trigger.

## How it works

- No server. Phones talk through public MQTT relay brokers (emqx, hivemq, mosquitto), same as SATU!.
- The host phone runs the game engine (`js/engine.js`). Each hand travels **end-to-end encrypted** (ECDH P-256 + AES-GCM) only to its owner. Played cards stay on the host until someone calls TIPU!.
- The host decides each shot when the gun comes out and tells only the shooter's phone, so the bang lands the instant the hammer falls. The live gun stream (`rv/<player>`) carries only spin/hammer/trigger positions.
- Sounds are synthesised live with Web Audio (`js/sfx.js`): gunshot with room reverb, dry click, hammer cock, cylinder ratchet, cylinder open/close, heartbeat, cards, TIPU! stab, verdict stings. Vibration on Android, Taptic ticks on iPhone (iOS 18+).
- The revolver is drawn in SVG (`js/gun.js`).
- Limitation: the host phone holds every hand and the bullet positions in memory. Pick a host who won't open the devtools.
- *Try the gun* on the home screen opens a practice revolver (1 in 6, nothing at stake).
- `js/idle.js` is the back-room bottle gallery.

## Development

```
node tools/serve.cjs 5192     # http://localhost:5192  (add ?dev=1 for "Add bot" players)
node tools/test-engine.js     # rule tests + 540 random full games (2–10 players)
```

**Test bench:** `tools/bench.html`. You're the host on the big phone. Pick 1–9 players and they join by themselves when your table opens, play their own turns, bet, and pull their own triggers (both switchable so you can drive their phones yourself). `tools/outfits.html` shows all 15 outfits side by side. `tools/icons.html` renders the PNG icons from `assets/img/logo.svg`.

TIPU! is an original game in the bluffing-card family (Cheat / I Doubt It) with a revolver twist. It isn't affiliated with any commercial game.
