# PONG! design system

The rules a change to how the game looks has to satisfy. Read this before
touching `apps/web/src/styles`, `apps/web/src/game/PixiCourt.ts`, or
`packages/game-core/src/palette.ts`.

Colour direction is unchanged and not up for revision: forest court, lime
accent, paper ball, ember/cyan/violet for the other seats. Everything here is
about how those colours are *organised* and what the court does with them.

---

## 1. One palette, two representations, one gate

The renderer needs colours as `0xdfff68`. CSS needs `#dfff68`. That is two
representations of one decision, and there is no way around it.

There *was* a way around having five. Seat colours used to be authored in
`factory.ts`, `PixiCourt.ts`, `OnlineRoom.tsx`, the inline logo SVG, and
`tokens.css` independently. They had already diverged: the lobby coloured a
player by their index in the participant list while the court coloured them by
their seat, so a lobby containing a spectator handed the next player a colour
their paddle was never drawn in.

`packages/game-core/src/palette.ts` is now the source. `tokens.css` mirrors it,
and `apps/web/tests/tokens.test.ts` fails the build if the mirror drifts —
printing both sides of every comparison, and asserting it parsed a plausible
number of declarations first, so a reformat that silently stopped the regex
matching cannot turn the whole suite into a no-op.

**Adding a colour:** add it to `palette.ts`, mirror it in `tokens.css`, run
`pnpm test`. Never the other order.

## 2. Identity is never colour alone

`PLAN.md` lists "accessible player patterns" as a launch requirement. Colour was
carrying that on its own, and seats 2 and 3 — `#67d4ff` and `#b59cff` — are a
cyan/violet pair that converge under deuteranopia and in any greyscale
screenshot.

Every seat now carries a `pattern` that the renderer cuts into the paddle face
in court ink, and that the DOM repeats as a chip in the scoreboard and lobby:

| Seat | Colour | Mark |
| --- | --- | --- |
| 0 | Lime `#dfff68` | unmarked |
| 1 | Ember `#f36f44` | notched ends |
| 2 | Cyan `#67d4ff` | centre bar |
| 3 | Violet `#b59cff` | three dots |

The marks encode **presence and count**, never fine shape. A paddle is about
8px thick on a phone; an outline at that size is a smudge, but "two marks or
three" survives.

## 3. The court is furniture; only movers cost a frame

Static geometry — floor, lines, lane ticks, bezel, backdrop glow — is rebuilt
only when the canvas changes size. Anything drawn every frame has to justify
itself as something that moved.

The bloom pass is the only **persistent** filter in the renderer, and it is the
first thing to go: at `low` effect density it is not attached at all, rather
than attached and weak. An attached filter still costs a render texture and a
full-screen pass whatever its strength. RGB split and shader shockwave are
event punctuation: they attach to the bounded court for 230–440ms around a
perfect return, goal, major power-up or victory, then `filters` returns to
`null` so Pixi can release the temporary surfaces.

## 4. Frames belong to the display; ticks belong to the simulation

The simulation is a fixed 60Hz. Displays are 60, 90 or 120Hz. For local play,
the renderer tracks how far it is past the last state it was handed and
extrapolates the ball and paddles along their own velocity, **capped at one
tick**. Online play disables that renderer step because `RoomClient` already
predicts from its slower network snapshots; two predictors would overshoot.

One tick of overshoot at `BALL_SPEED_CAP` is 0.019 of the court — a little over
one ball radius, and invisible. Two ticks is a ball travelling through a paddle.
If online play needs to be smoother than this, the fix is snapshot buffering and
playback at a fixed delay inside `RoomClient`, not a longer extrapolation here.

## 5. One feeling, many channels

`heat` is the rally's speed normalised between `BALL_START_SPEED` and
`BALL_SPEED_CAP`. It drives the rim brightness and weight, the bloom radius, the
trail length, the ball's stretch and the particle count *together*.

This is deliberate: a player who turns effects down, or who cannot perceive one
of those channels, still gets the escalation from the others. A single channel
carrying a single meaning is a feature nobody notices.

## 6. Feedback goes where the eyes already are

Mid-rally, the player is looking at the ball and at their own paddle. Anything
they need in that moment is drawn there:

- **Ability readiness** is a bar on the paddle's outward face, filling *toward*
  ready, not a number in a button below the court.
- **Paddle travel limits** (0.08 and 0.92 — the clamp `updatePlayers` actually
  applies) are ticked into the floor.
- **Power-up and gate hitboxes** are drawn at their real capture radii, `0.028`
  and `0.035`. A ring drawn at any other size teaches the wrong hitbox.
- **The conceding wall** flashes in the scorer's colour.

Conversely, anything *not* needed mid-rally goes outside the play surface. The
scoreboard is above the court, not floating on it: in Arena and Crosscourt a
floated pill sat exactly over the top wall and hid that player's paddle, and a
translucent chip over a surface ranging from near-black to full-bright lime
loses contrast precisely when a rally is most intense.

## 7. Impact effects must not lie about the simulation

A camera punch, a shockwave and a spark cone aimed along the ball's outgoing
velocity all say "that connected" while the world keeps running underneath.

A **hitstop** — freezing everything for 50–80ms on a perfect return — would say
it better, and it is the largest single upgrade still available. It is not in
the renderer because the renderer does not own the clock: `LocalMatch` does
locally and the room worker does online. Faking a freeze in the renderer would
drift from a simulation that did not freeze. Implement it in the tick loop or
not at all.

Screen shake uses **trauma², decaying linearly**, sampled from summed sines. Per
frame white noise is a buzz; sine is a camera being knocked. Amplitude falling
off as the square means a routine bump settles instantly while a goal keeps its
weight.

## 8. Motion is tokenised

`--pg-duration-*` and `--pg-ease-*` in `tokens.css`. `--pg-ease-out` for
anything entering or responding to a press. `--pg-ease-spring` overshoots and is
for celebratory beats only — an overshooting control reads as broken, not
lively.

`prefers-reduced-motion` collapses the duration tokens at the CSS level *and*
seeds `AppSettings.reducedMotion`, so a player who flips the OS switch
mid-session is respected without a reload.

## 9. Input

- **The local paddle is always at the bottom.** The simulation keeps one shared
  world orientation, but each renderer rotates around court centre so its local
  player's wall becomes the bottom wall. Pointer, keyboard and gamepad axes are
  mapped back through that same rotation.
- **Movement is level-triggered, actions are edge-triggered.** Holding a
  direction key travels at `PADDLE_SPEED` — the same constant the simulation
  clamps to, so the keyboard can neither out-run nor under-run the sim. Pressing
  an ability key fires once.
- **`blur` clears held keys.** A window that loses focus mid-press never
  delivers the keyup.
- **Touch grabs, or jumps.** Pressing on the paddle drags it relatively;
  pressing away from it jumps. A phone paddle is under the thumb and therefore
  invisible, so relative drag is the default and the jump is the escape hatch.
- **Shared-screen Duel has two independent touch lanes.** The bottom half owns
  Player One and the top half owns Player Two; pointer IDs are tracked in a map
  so two fingers can move both paddles simultaneously.
- **Pointer coordinates are mapped through the same letterbox the renderer
  uses.** The court is drawn square and centred; reading the raw wrapper rect
  puts the paddle a few percent off on any non-square wrapper.

## 10. Accessibility is not a pass at the end

- The canvas cannot be read. The score is mirrored into an `aria-live="polite"`
  region so it is announced, not merely drawn.
- Every seat is identifiable without colour (§2).
- Targets a thumb hits during a rally are `--pg-touch-target-lg` (56px);
  everything else is 44px.
- Muted text is `#93a398`, which is 7.0:1 on `--pg-ink-900`. Do not darken it
  without re-measuring.
- Label colour is set per surface rather than with `opacity`, so the same class
  on a lime card and on a dark card are both measurable.
- No power-up is identified by a letter. `id[0]` gave **G** for both Grow and
  Gravity, and set in a webfont it was a different glyph before the font loaded.
  They are vector marks.

---

## Known gaps

Tracked rather than fixed, with the reason:

1. **True hitstop** — needs a hook in the tick loop (§7).
2. **Online snapshot interpolation** — `RoomClient.getRenderState()` already
   predicts ball motion for at most 75ms and the local paddle toward its latest
   target. Online `GameCourt` therefore disables the renderer's one-tick local
   extrapolation so prediction has one owner. Fixed-delay buffered playback may
   still look smoother on unstable connections, and belongs in `RoomClient`.

## Super visual upgrade

The August 2026 pass extends rally heat into a full game language:

- Duel, Arena and Crosscourt select Forest Core, Neon Midnight and Championship
  court materials while retaining the same seat palette and geometry.
- Perfect returns cut a three-channel impact slice across the contact point.
- Dash, Bend, Guard and Pulse each have a distinct, explained vector cue. Dash
  uses paddle afterimages plus one along-wall arrow—never radial rings or rays
  into the court—because it is movement, not a weapon.
- Goals paint the conceded wall, wash the court in the scorer's colour, fire a
  directional edge spray and announce the moment in the DOM HUD.
- Audio is procedural and event-layered, so local and online matches share the
  same zero-download cues without delaying first interaction.
- `arena-keyart.jpg` is generated promotional atmosphere only. Competitive
  symbols remain code-drawn vectors.

The former delivery gaps are closed: the social card is now a 1200×630 JPEG,
Manrope and DM Sans are self-hosted as Latin variable fonts, and the PWA ships
separate regular and safe-zone maskable PNG icons.

Phone 1v1 is a first-class quick start: it creates a Duel with zero AI slots,
auto-readies both link participants, exposes the native share sheet when
available, and begins as soon as the second phone opens the invite.

## Toolchain decisions

- **Shipped: `pixi-filters` 6.1.5.** It officially targets PixiJS 8. PongApp
  imports only `rgb-split` and `shockwave`, bounds their filter area to the
  court, disables them at low density/reduced motion, and never leaves them on
  between events.
- **Keep using built-in image generation for presentation assets.** The arena
  key art and social card benefit from raster atmosphere; live gameplay symbols
  stay deterministic vectors.
- **Profile before `ParticleContainer`.** Pixi's v8 particle API is built for
  extremely large lightweight batches. PongApp currently draws a small effect
  budget into one `Graphics`, so a migration would add lifecycle complexity
  before it buys measurable frame time.
- **Defer Rive.** Its canvas-lite runtime is approximately 222KB compressed;
  that is too much for decorative menu motion in a game whose application JS is
  currently about 132KB gzip.
- **Defer EmberGen and TexturePacker until there is a flipbook library.** They
  are the right authoring/atlas pipeline for smoke, electricity and animated
  skin assets, but one-off procedural impacts are sharper and cheaper today.
