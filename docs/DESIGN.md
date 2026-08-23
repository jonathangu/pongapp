# Pal Duel visual and interaction contract

Read this before editing `PixiCourt.ts`, game styles, or the shared palette.

## The hierarchy

The puck is always the brightest fast-moving object. The local round mallet is
always at the bottom on that player's phone. Pals are expressive secondary
actors, while the forest air-hockey table remains quiet furniture. Effects may
celebrate contact but must never conceal the puck or resemble unexplained lines.

The phone layout is an immersive 9:16 arena with a thin score strip above and
the three-card Pal tray below. Play a Friend is the dominant menu action; AI,
same-phone, and room-code entry remain visible as secondary choices.

## One palette, distinct silhouettes

`packages/game-core/src/palette.ts` is the source of renderer colours.
`tokens.css` mirrors it, and `tokens.test.ts` fails if they drift. Players are
round mallets distinguished by both colour and face marks.

Pals communicate role before decoration:

- Bumper is broad, cyan, shielded, and happiest near its goal.
- Hook is small, orange, and carries a visible rope coil; an active tether is a
  curved warm rope from Hook to puck.
- Captain is large, lime, crowned, caped, and allowed across midfield.
- Hatchlings are tiny pale scrappers with pointed ears.

Every Pal has a generated high-resolution character skin over a procedural
owner-colour base, plus health pips, a spawn ring, stun stars, a command pulse,
and a gold Star aura when powered. Command, Hook wind-up, and possession draw a
short intent trail toward the puck or target goal. Possession, damage, stun,
tether, knockout, and power use must read without text.

## Simulation truth

The fixed 60Hz game core owns 2D movement, circular collisions, goals, rails,
energy, Pal health and state, possession, ropes, Star collection, hitstop, and
every command. The renderer consumes events; it never invents gameplay.

Static court geometry is rebuilt only on resize. Moving actors and short-lived
particles update each frame. Puck heat drives only a short local trail, glow,
and impact energy. A serve or goal teleport clears the trail immediately; Pixi
arcs must explicitly begin their paths so they never draw accidental diagonals.
Reduced motion suppresses camera punch and dense particles but cannot change
authoritative hitstop.

## Online smoothness

The client can flush changed 2D targets at 60Hz, sends no idle target traffic,
and previews its own mallet immediately. Remote mallets and Pals use an adaptive
25–67ms snapshot buffer: stable edge connections use the shortest buffer and
noisier connections trade a little delay for continuity. The puck
continues between snapshots, blends small corrections, and snaps after a large
error, possession change, serve, or score. Connection quality uses rolling
median, p95, jitter, and snapshot-gap p95 rather than one noisy ping.

Never add a second independent predictor inside the renderer. Prediction has
one owner: `RoomClient` online and the local match loop offline.

## Competitive balance and telemetry

The goal mouth must leave a visible open post around a centred mallet. Computer
opponents and attacking Pals predict the defender's short movement, choose the
post with more space, and may use a real one-rail bank against a goalie sitting
in the mouth. They do not teleport the puck or bypass ordinary collision rules.

Online rooms emit structured `pongapp.balance.goal.v1` and
`pongapp.balance.match.v1` server logs so goal width, camping, rally length, and
Pal shot selection can be tuned from aggregate outcomes. These records contain
only top/bottom sides and gameplay counters—never room codes, names, player or
guest IDs, reconnect tokens, or input coordinates. Offline matches remain
device-local and emit no balance telemetry.

Room support uses indexed `pongapp.room.lifecycle.v2` events correlated by
random room, match, connection, and page-session IDs. The UI exposes only a
short opaque support trace. Lifecycle events follow the same privacy boundary
and additionally reject all free-form client telemetry.

## Input and explanation

- Pointer/touch maps both axes through the same 180° view transform as drawing.
- A touch target leads 48–80px toward centre court and draws a finger-to-target
  tether, so the local mallet is never hidden underneath the player's thumb.
- Arrow keys or WASD move in two axes; number keys 1/2/3 use the Pal cards.
- Same-phone play owns a pointer independently per half and rotates the top tray.
- Tapping an inactive card summons; tapping its lit active card commands.
- The progressive coach explains free movement, persistence, commands, enemy
  possession, rope cutting, and Power Stars exactly when each becomes relevant.

The canvas mirrors scores and important moments into accessible DOM. Touch
controls remain at least 44px. Reduced-motion preference is honored in CSS and
Pixi effects.

## Asset policy

Competitive hitboxes, owner identity, state indicators, and fallback actors
remain code-drawn. Generated 512×512 transparent Pal skins are a visual layer
only; they cannot change radii or gameplay power. The four optimized PNGs total
under 750KB, load once through Pixi's asset cache, and retain the procedural
fallback if loading fails.
