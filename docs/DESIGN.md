# Pal Duel visual and interaction contract

Read this before editing `PixiCourt.ts`, game styles, or the shared palette.

## The hierarchy

The ball is always the brightest moving object. The local paddle is always at
the bottom. Pals are expressive secondary actors, and the forest court is quiet
furniture. Effects can celebrate contact; they must never conceal trajectory.

The phone layout is an immersive 9:16 court with a thin score strip above and
the three-card Pal tray below. Primary menu actions use a compact two-column
grid so Quick Duel and Invite Friend remain visible without scrolling.

## One palette, accessible identities

`packages/game-core/src/palette.ts` is the source of renderer colours.
`tokens.css` mirrors it, and `tokens.test.ts` fails if they drift. Players are
also distinguished by paddle marks, not colour alone: lime is plain and ember
has notched ends.

Pals use silhouette before decoration:

- Guard is broad and grounded.
- Striker is narrow, forward-leaning, and quick.
- Captain is broad, crowned, and visually confident.
- Hatchlings are tiny and paired.

Faces, feet, arming rings, owner colour, and one-hit death bursts make their
state readable without labels inside the court.

## Simulation truth

The fixed 60Hz game core owns motion, collision, energy, arming, expiry,
hitstop, and every summon. The renderer consumes events; it does not invent a
save or freeze. Local and online matches therefore show the same outcome.

Static court geometry is rebuilt only on resize. Moving actors and short-lived
particles are updated each frame. Rally heat drives ball trail, rim, bloom, and
stretch together. Reduced motion suppresses camera punch and dense particles,
but cannot change authoritative hitstop.

## Online smoothness

The client sends targets at 60Hz and previews its own paddle immediately.
Remote paddles and Pals play through a roughly 50ms snapshot buffer. The ball
continues between snapshots, blends small corrections over 80ms, and snaps only
after a large error, serve, or score. Connection quality uses rolling median,
p95, jitter, and snapshot-gap p95 rather than one noisy ping.

Never add a second independent predictor inside the renderer. Prediction has
one owner: `RoomClient` online and the local match loop offline.

## Input and explanation

- Pointer/touch position maps through the same portrait transform as drawing.
- Keyboard uses arrows or A/D; cards use 1/2/3.
- Same-phone play gives each half its own pointer and rotated card tray.
- A summoned Pal is an edge-triggered command; movement is continuous.
- The progressive coach explains energy, cost, arming, one-hit death, and the
  Captain split at the moment each concept becomes relevant.

The canvas mirrors scores and important moments into accessible DOM. Controls
remain at least 44px; rally cards are at least 56px. Reduced-motion preference
is honored in both CSS and Pixi effects.

## Asset policy

Live competitive symbols stay code-drawn so hitboxes, states, colours, and
performance are deterministic. Raster generation is appropriate for social
cards and promotional art, not gameplay actors. A new runtime or asset tool is
adopted only when it materially improves the shipped game at phone frame rates.
