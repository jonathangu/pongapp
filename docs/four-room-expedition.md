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

Status: locally verified; release pending. `pnpm check` passes107 tests plus lint/typecheck/build. Eight Chrome/WebKit phone/landscape/desktop station/audio/layout/GPU-fallback journeys pass. Real local Durable Objects co-op/versus and stale-protocol9 rejection pass. Real browser direct+relay crew travel, stale input, 3D aiming, exact sea return, reconnect/rematch and invitation UI pass. Five-world4×CPU tests pass with no freezes; final balance probe idle0/20 versus coordinated14/20 wins. Final Blender renders inspected and phone crew/art reviewed. Evidence: `/Users/guclaw/.openclaw/workspace/task-artifacts/four-room-expedition/PROGRESS.md`.

## Paid-generation authorization

Principal explicitly authorized paid generation capped at$100 in response to the monthly-cap question. Interpret as a dedicated PongApp $100/month ceiling. Use fast low-cost models for routine recipes and a stronger fast model for occasional high-value designs; no model call on the simulation path. Enforce independent provider-key and atomic server-side monthly caps, price/output/time limits, finite semantic cache, validated recipes and seeded local fallback. Verify an actual paid-generation -> cache-hit -> gameplay consumption journey before claiming paid AI enabled. No sharing of a homepage-only key or account allowance.

Implemented architecture: Qwen3.8 Flash for routine packs, Claude Haiku4.5 for one in eight special variants, latency-prioritized provider routing with reasoning disabled. Current availability/prices checked against the OpenRouter model catalog on2026-09-06. Exactly40 semantic keys (5 inspirations×8 variants), four different families per pack. Names, palette, ornaments, geometry scale/segments and combat traits are validated finite data. No arbitrary user prompts or model-generated code. Game starts from a built-in catalog, optionally replaced with a selected generated pack before launch; both online peers receive the host's authoritative pack.

Public paid requests require an explicit discovery click; GET/page visits and cache hits never generate. Trusted edge IP limits3/day, global generation attempts20/day, global uncached request cap5000/day and one paid attempt per semantic key perUTCday bound abuse. There is no claim of human-proof authentication. Durable SQLite reservations of$0.03 are atomic, persist across restarts, never refunded on failure, and stop at a hard$100 monthly ceiling. Input≤6000UTF-8bytes, output≤1200tokens and provider price ceilings bound worst-case request cost below reservation. Each miss independently checks the dedicated provider key's≤$100 monthly limit. Timeouts8s routine/12s special, no automatic retries, cached packs persist. Unknown cap/credentials, malformed output, price mismatch, timeout or quota returns existing gameplay safely.

Activation remains OFF until dedicated key provision/limit check and actual live generation/cache/play tests. The precise local key path was requested securely; browser is signed out. Never commit the key.
