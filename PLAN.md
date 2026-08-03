# Pal Duel v2 product contract

PongApp is one strong game, not a mode browser: a portrait 1v1 Pong duel where
energy turns good defense into temporary Paddle Pal allies.

## Match

- Local player is always shown at the bottom; the opponent is at the top.
- The competitive surface is 9:16 and physically 33% longer than it is wide.
- First to 5 wins. The clock is 2:30.
- A tied clock starts **Final Volley**: both players receive full energy and
  the next goal wins.
- Every goal is worth exactly one point.
- Match routes are AI, private invite, and same-phone. There is no public queue.

## Energy and Paddle Pals

- Each player starts with 2 of 6 energy.
- Earn 1 energy every 3.5 active-rally seconds, on a perfect return, and as a
  comeback grant after conceding. Energy survives goals; active Pals do not.
- **Guard · 2** — a wide one-hit defender near the goal for up to 7 seconds.
- **Striker · 3** — a narrow, fast one-hit hunter at midcourt for 5 seconds.
- **Captain · 6** — tracks the ball, takes one hit, then splits into two
  one-hit Hatchlings.
- Every Pal visibly arms before it can touch the ball. Every save destroys that
  Pal. At most four allies may be active, with room reserved for the Captain's
  Hatchlings.
- The AI spends the same energy on the same cards. It receives no hidden Pal
  or physics advantage.

## Product boundaries

- Guest-first and playable within seconds; authentication stays optional.
- Private room server is authoritative for movement, scores, energy, Pals, and
  results. Protocol v2 intentionally rejects legacy clients and room data.
- Cosmetics and mastery never change gameplay power.
- No public matchmaking, text chat, hosted accounts, RackeTapp backend work, or
  RackeTapp navigation link in this standalone release.
