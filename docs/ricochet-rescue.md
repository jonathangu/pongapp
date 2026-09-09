# Ricochet Rescue — isolated play-test prototype

Runtime session: `01a0369d-0914-7190-ac0e-b4d37e1fc052`.

## Contract and hypothesis

Jonathan approved implementation of the September 9 plan: no matching, no reflex timing, literal satisfying combinations, and two people making complementary decisions. Keep the released Starling default and all its saves intact. Publish only the additive `#/ricochet` prototype. A real iPhone + Android couple play-test is required before replacing the old game or choosing a larger engine architecture. Automated browser evidence is not evidence that people find it fun.

One person aims and chooses the orb (Bounce, Burst, Pierce); the other moves and turns the reflector and chooses Mirror, Split, or Focus. The reflector player confirms Ready; the launcher launches. Either setup edit clears Ready. Jobs can be swapped between shots. Solo arranges both jobs. There are no timers, shot limits, lives, currencies, or competitive power upgrades.

Three structured coves teach a direct rescue then a rebound; Burst then Split; Focus then Pierce. Burst + Split makes three explosions, Burst + Focus one bigger explosion, Pierce + Split three piercing rays, and Pierce + Focus one wide beam. Rescue bubbles release little creatures that fly aboard Mara, Finn, and Luma’s boat. Dotted previews show the start and first reflection without solving the whole shot. Optional setup hints are available.

## Boundaries and reuse

- Static collision queries use exact-pinned Planck 1.5.0 behind a 41-line adapter; no engine world, live tick, or renderer migration. Source comparison and MIT notices are in `research/mobile-arpg-parts-bin/PROVENANCE.md` and `apps/web/public/third-party-ricochet.txt`.
- Original family SVG and Jonathan’s existing Tide Rope recording are reused. New cove/effect visuals are original SVG; sound effects are synthesized. Music streams only when enabled and is outside the small offline pack.
- The prototype is lazy-loaded. Save key `starling.ricochet.v1` and per-room credentials are separate from `starling.puzzle.v1` and older voyages.
- New protocol subpath and RicochetRoom Durable Object are additive. Server owns roles, revisions, readiness, shot simulation, and results. A saved timed event sequence permits mid-shot reconnect. Two seats, no chat or matchmaking; idle room data expires after seven days without sockets.

## Evidence ledger

| Stage | Evidence |
| --- | --- |
| Intake | Approved implementation; scoped retrieval `ret_d7704370cb36f3d5` returned unrelated OCBrain/Bountiful context and was marked irrelevant. |
| Implementation | Checkpoint `9693191`; independent core, protocol, authoritative room, touch/keyboard UI, offline pack and license handling. |
| Local core/contract checks | Initial `pnpm check`: 261 passing tests (including 18 ricochet cases and 600 bounded shot stress samples), complete typecheck/build, zero lint errors and seven existing warnings. Final rerun recorded in the external release ledger. |
| Local room | `scripts/ricochet-room-smoke.mjs`: 16 real local Durable Object checks covering ownership, readiness reset, concurrent different-job edits, authenticated snapshots, stale/duplicate commands, shared combo, reconnect and role swap. |
| Browser | Chromium and WebKit full journeys: all three coves via visible controls, real pointer/keyboard edits, combination effects, save/reload, 320/375/390/430/1024 widths without horizontal overflow, separate-context co-op, mid-flight reload, role swap, third-seat denial, isolated solo saves. 14 checks per engine. |
| Offline/settings | `scripts/ricochet-offline-smoke.mjs`: Chromium first-visit pack, offline reload and actual shot, offline license, optional music, reduced motion, sound mute, original default route. WebKit covers pack/settings but not offline reload: Playwright officially supports service-worker automation only on Chromium; its WebKit emulated offline navigation failed internally. Native Safari/iPhone offline remains in the human test gate. |
| Release | Exact-SHA CI, Worker deployment, public pack byte hashes and public browser journeys pending. |

Evidence root: `/Users/guclaw/.openclaw/workspace/task-artifacts/ricochet-rescue/`. Browser receipts explicitly set `physicalPhone: false`. The Mac desktop was locked, so no native CUA/physical hardware play-test is claimed. No RackeTapp, Supabase, account, or legal-flow changes.

## Human play-test gate

Use one iPhone and one Android in portrait, in both jobs. Without explaining the solution, ask the pair to finish three coves. Check whether each can describe their own job and all four combinations, whether arranging the rebound is comfortable, whether both contribute to each shot, and whether a big rescue earns a spontaneous reaction or replay. Record confusing controls, dead time, framing, sound interruptions, and the point of boredom. Do not replace the current game until that evidence supports the direction.
