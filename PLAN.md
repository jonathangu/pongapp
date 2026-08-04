# Pal Duel v3 product contract

PongApp is one strong game, not a mode browser: a portrait 1v1 air-hockey
duel where direct mallet skill and a persistent squad of tiny heroes fight for
the same puck.

## Match

- The local player is always shown at the bottom on their own device.
- The competitive surface is 9:16 and physically 33% longer than it is wide.
- Each player controls a circular mallet in both axes. The whole arena is open
  except the opponent's protected goal pocket.
- The puck rebounds from side and end rails and scores through a physical goal
  mouth. First to 5 wins; the clock is 2:30.
- A tied clock starts **Final Volley**: both players receive full energy and
  the next goal wins.
- Match routes are AI, private invite, and same-phone. There is no public queue.

## Energy and Pals

- Each player starts with 2 of 6 energy.
- Earn 1 energy every 5 active seconds, after every 3 clean strikes, and as a
  comeback grant after conceding. Energy survives goals; active Pals do not.
- **Bumper · 2 · 4 hearts** — guards its own end, steals from enemy carriers,
  briefly carries the puck, and clears it.
- **Hook · 3 · 3 hearts** — chases into range, lassos the puck, reels it in,
  and slings it at goal. A rival can cut the tether by striking the puck or Pal.
- **Captain · 6 · 5 hearts** — invades enemy ice, grabs the puck, and fires a
  hard shot. A powered Captain leaves three Hatchlings when knocked out.
- Pals persist, move, collide, take damage, become stunned, carry the puck, and
  recover. One active Pal of each main role may fight for each player.
- Tapping an active Pal card issues that role's signature command at no energy
  cost. The AI uses the same energy, cards, commands, and physics.

## Power Star

- A large Power Star appears on the arena roughly every 15 seconds and expires
  if nobody reaches it.
- Pals actively contest the Star. It upgrades that Pal's next role-specific
  play: a protected Bumper steal, a stronger Hook sling, or a Captain power shot.
- The Star is temporary match drama, never permanent progression power.

## Product boundaries

- Guest-first and playable within seconds; authentication stays optional.
- The private room server is authoritative for 2D movement, puck physics,
  scores, energy, Pals, possession, tethers, Stars, and results.
- Protocol v3 intentionally rejects old clients and old persisted room data.
- Cosmetics and mastery never change gameplay power.
- No public matchmaking, text chat, hosted accounts, RackeTapp backend work, or
  RackeTapp navigation link in this standalone release.
