# Two Oars: two-person crew combat proposal

Date: 2026-09-04
Runtime session: 01a0369d-0914-7190-ac0e-b4d37e1fc052
Status: originally a design-only proposal; subsequently approved for implementation.
Current implementation and release evidence are tracked in `CREW-RELEASE.md`.

## Scope and intent

Respond to the current request to discuss and plan difficulty, camera, orientation,
predators, power-ups, crew responsibilities, visuals, and player-two health visibility.
Keep separate phones, link invitations, local simulation, and direct WebRTC.
The attached screenshot is player one; missing player-two hearts is a user-reported
defect, not a reproduced diagnosis. Do not mistake completion of this plan for a fix.

## Source-inspected findings

- `apps/web/src/game/ExpeditionCanvas.tsx`: world forward (decreasing Y) projects
  up-right, but the boat/ship nose is drawn with a fixed rotation that points
  up-left. Vehicle types also have different local drawing axes. Derive render
  orientation from projected forward velocity with an explicit asset-axis offset.
- `packages/game-core/src/coop.ts`: predators share the scenery's forward scroll
  speed and only track laterally over part of their approach. There is no separate
  forward pursuit or accelerated lunge despite the comment describing a lunge.
- Holding both controls charges a three-second hazard-smashing rush in about
  1.45 seconds. Repeated holding therefore offers roughly two-thirds rush uptime
  even before gate bonuses. This undermines risk.
- Predator spawn and flare cooldown are both seven seconds. The flare removes
  predators across a broad vertical range without a horizontal distance check.
- The two-minute clock ends the expedition successfully if any hearts remain;
  rescue/relic/gate targets are not victory requirements.
- `apps/web/src/game/CoopRiver.tsx` renders the same three heart spans regardless
  of player role. A guest-only visibility condition is not present.
- `apps/web/src/online/PeerSession.ts` copies host snapshots then advances the
  complete guest simulation, including health. That can cause speculative health
  differences; it does not establish why hearts disappeared on the reported phone.

## Recommended game loop

Make a fast, readable crew-survival expedition: two people, three jobs, one shared
vehicle. Borrow the competing-station idea, not an interior platforming interface.
On phones, switching jobs should be one tap, with large contextual controls.

| Station | Controls | What happens unattended |
| --- | --- | --- |
| Pilot | Left, right, short boost | Vehicle coasts forward on its current course |
| Gunner | Auto-aim; hold overcharge; tap a priority target | Weak auto-turrets keep shooting |
| Engineer | Timed shield; hold repair using collected scrap | No active shielding or repair |

Only one player occupies a station at a time. Both can switch; nobody is assigned
permanently to driving or repairing. Display partner occupancy clearly. Moving to
an empty station is immediate locally with host reconciliation; occupied-station
handoffs need a simple agreed swap and deterministic conflict resolution.
Introduce pilot/gunner first; introduce the engineer after players understand them.
Do not require players to navigate a tiny character between rooms on a phone.

Auto-turrets are a safety net, not the main solution to every wave. Manual gunner
operation improves firing power and priority targeting but produces heat. Engineer
defense and repair compete for attention; neither is a mandatory repetitive chore.
Do not allow infinite repair loops. Repairs consume earned scrap.

Desired moment: one player steers around a rock arch while the other overcharges
against a chasing predator; a telegraphed attack prompts a quick engineer switch
and shield; both recover, collect scrap, and choose an upgrade in a quiet interval.

## Movement, enemies, and difficulty

- Begin testing around 1.5x current normal forward speed, then tune using visible
  time-to-impact, not a blanket multiplier for every moving object.
- Give enemies independent movement and readable states: stalk, warn, commit,
  recover. A lunge may overtake the vehicle; it cannot continually home mid-lunge.
- Prototype two archetypes: a rear chaser and a side ambusher. Add ranged attackers
  only once those are readable. Telegraph off-screen threats before they can hit.
- Start with roughly 0.7–1.0 seconds of clear attack warning; validate on phones.
- Replace automatic repeated invincibility with earned, player-triggered boosts
  or limited shield charges. Speed and immunity should not always be bundled.
- Build tension in waves followed by brief recovery, not uninterrupted clutter.
- Victory requires completing a visible objective and escaping or defeating a
  miniboss, rather than merely reaching the timer. Avoid grind or opaque quotas.

All numeric values above are tuning hypotheses, not tested balance claims.

## Power-ups with decisions

- Chain lightning: clears clustered small enemies; weaker against an isolated boss.
- Frost rounds: trade damage for slowing a dangerous pursuer.
- Twin-shot: wider coverage versus concentrated single-target damage.
- Bubble battery: one emergency shield charge, not continuous immunity.
- Salvage magnet: collect repair scrap safely, competing with a combat upgrade slot.

Start with three upgrades and two equipment slots. Offer a short shared choice
between waves. Earn upgrades during the run; no purchased or permanent power gaps.

## Camera and visual direction

Use a forward-scrolling three-quarter view with travel mostly toward the top of the
portrait screen. Retain isometric depth in terrain, not a rigid diagonal corridor.
Keep the vehicle near the lower third, with most of the view reserved for threats.
No automatic camera rotation. Match nose, wake, exhaust, aiming, and motion.

Increase the vehicle and enemy silhouettes, add convincing turning/banking,
recoil, contact shadows, damage feedback, and world-specific trails. Reduce tall
repeated box pedestals and decorative HUD obstruction. Landmarks should make each
world recognizable: sunset canyon arches, mountain passes, rainbow cloud islands,
airship fleets, star fields and illuminated planet horizons. Keep effects away
from attack warnings and pool/cap particles to protect phone frame time.

Eventually vary mechanics too: truck jumps and rockfall, airship crosswinds and
sky predators, spacecraft asteroid cover and space creatures. First prove one
90-second encounter; do not expand five weak versions of an unproven loop.

## Priority zero: shared health correctness

Reproduce on host and guest at phone widths, inspecting authoritative state,
predicted state, subscribed HUD values, element bounds, fonts, and cached versions.
Show an explicit `TEAM HULL 3/3` beside vector hearts on both phones. Treat confirmed
health as shared host-authoritative HUD state; preserve immediate local movement
prediction and immediate hit feedback without presenting speculative loss as final.

Regression scenarios: initial join, controlled hit, repair, lethal hit, rematch,
background/resume, reconnect, direct-to-relay fallback, and stale/out-of-order frames.
Assert numeric health and visible icons on BOTH roles, not only canvas rendering.
Capture the actual guest phone if desktop emulation cannot reproduce the report.

## Delivery order and acceptance gates

1. Correctness: facing/camera prototype and reproduce/fix guest hearts. Capture
   host and guest evidence; do not claim the physical-phone defect fixed from code
   inspection alone.
2. Fun prototype: one 90-second world, three stations, two enemy archetypes, three
   upgrades. A no-input/hold-one-button baseline must not routinely win. New players
   should understand the first useful action without a long tutorial.
3. Two-phone playtest: both people have consequential decisions, switching feels
   clear, attacks are avoidable, recovery is possible, and failures feel earned.
   Retain invite/rematch flow and direct local play. Measure input-to-local-render
   and frame time separately from network RTT on Wi-Fi and hotspot combinations.
4. Visual/world expansion only after the encounter works. Preserve solo with an
   AI crewmate. Keep versus available and evaluate its adaptation separately.

Implementation verification still requires repository checks, deterministic core
tests, station-claim/action-sequence tests, reconnect tests, and two-client UI tests.
No implementation checks or phone gameplay tests were run for this planning task.

## Primary references

- Lovers in a Dangerous Spacetime official features: competing weapons, shield,
  engine stations, simple controls, and combinable upgrades.
  https://www.loversinadangerousspacetime.com/
- Ship of Fools publisher page: cooperative cannon combat, ship defense/repair,
  and combinations of item effects.
  https://www.team17.com/games/ship-of-fools

These are design inspirations, not claims that their networking or controls can
be copied directly. Their lessons are adapted here to separate phone screens.
