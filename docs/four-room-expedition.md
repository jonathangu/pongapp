# Four-room expedition redesign

Runtime session `01a0369d-0914-7190-ac0e-b4d37e1fc052`. Baseline `734a5a61955b89c7e65efcd7f532bab21c1d27bd`.

## Principal request

Replace the small vehicle with a cool large ship containing two visible people who run between four rooms: left, right, shoot and recover. Operation must wait until a character reaches the station. Use the cooperation/physical station-switching idea from Lovers in a Dangerous Spacetime as a reference, with original art. Generate stunning AI concept art, then build actual Blender models, much better monsters/animation/visuals and good music. Reuse the cheap-LLM idea from the animal-farm game for creative variety. Slow combat down: fewer, larger, more dangerous enemies that follow the ship and create deliberate decisions.

## Design contract

- Four physically distinct roofless rooms around a shared corridor; two animated, color-identifiable crew members. Persistent station assignment is the primary interaction: tap a room/button, run there, then operate. One character cannot operate several rooms at once. Station travel is authoritative simulation, not a cosmetic delay. Hold/release legacy simultaneous operation is superseded by this request.
- Clear route and arrival feedback; readable station occupants and partner destination. Auto-aim remains when the cannon is occupied. Solo Scout fills a useful station without overriding the human, with the same travel rules.
- A large original expedition ark occupies enough screen space to read the deck. Keep the living cylinder sky and rare temporary altitude; all craft/station/crew visuals rise together and return to sea level.
- Fewer threats (small bounded active cap), slower traversal and heavier attacks. Creatures pursue rather than immediately scrolling away. Distinct silhouettes and attack phases: stalk, telegraph, commit, recover. Enemy tells must leave time to cross the ship and react. Avoid simply multiplying HP or spawn volume.
- Original creature families with different silhouettes, articulated parts and behavior recipes; names/modifiers/encounter combinations derive from a validated bounded catalog. Investigate the existing cheap-model/cache architecture read-only. No synchronous model calls during simulation, executable model code, exposed secrets, unbounded spending, or implicit reuse of a homepage-only API key. Paid activation requires verified scoped credentials/budget; ship deterministic curated variety regardless.
- Original adaptive music and readable spatial sound cues; gesture-safe audio start, mute/volume control, no music from the reference game. Verify the actual audio graph/output as well as code.
- AI-generated concept sheets saved in `art/concepts/` with prompts. Build original optimized Blender GLB/source assets informed by selected concepts; inspect rendered art and in-game views. Preserve instant fallback and mobile performance.
- Bump ruleset/protocol, preserve versus, validate station travel/co-op prediction/reconnect/rematch, danger/pursuit/telegraph fairness, seed/cap invariants and audio lifecycle. Full local tests, Blender asset QA, browser phone/landscape/desktop journeys, actual local+production Durable Objects, exact-SHA CI, backend-first deployment, public artifact/browser verification.

Reference: https://www.asteroidbase.com/dangerous-spacetime/ (station-switching cooperation, not asset copying).

Scope: standalone PongApp. Animal-farm/Clearing code is read-only reference. Preserve preexisting AGENTS.md modification. No subagents, recurring automation, new account economy or unrelated deployment.

Status: intake/requirements. Evidence: `task-artifacts/four-room-expedition/PROGRESS.md`.
