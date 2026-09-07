# Starling — solo-first editorial pass

Runtime session: `01a0369d-0914-7190-ac0e-b4d37e1fc052`.

## Acceptance

Jonathan requests genuinely enjoyable single-player play and authorizes cutting and streamlining features. Preserve the released family story, co-op, installation/offline contract, soundtrack, and existing saves. Awards are an aspiration, not an acceptance claim.

## Design hypothesis

The solo player should make navigation, timing, and story decisions, not repeatedly abandon the wheel to manage stations. Keep one tactile verb (steer) and one expressive intervention (Together: a short-range rescue/defense pulse). Finn handles cannons; the companion handles meals. Teach those real actions. Co-op retains complementary stations. Move solo deck micromanagement out of the main experience; keep harbors optional and avoid expanding currencies or upgrade systems.

The existing code pins story-Finn to lookout, requires a human cannon seat and a human galley seat to finish practice, and exposes five station shortcuts plus deck controls during solo. These are verified code findings, not user-playtest results.

The phone playtest also showed two large roaming ally/trader boats crowding the family ship and rescue signals. Cut this ambient traffic in solo; retain the raider, the four functional harbors, rescue-driven crew growth, and all existing co-op traffic. Do not expand the economy. The solo crew still becomes stronger as rescued people help in return.

## Ledger

| Stage | Evidence |
| --- | --- |
| Intake / inspection | Current release `df288f26b819ebb767b6acc8446c3d0f324cfc57`; user-owned AGENTS.md edits preserved. Narrow retrieval `ret_fc60faf96d65329f` contained unrelated context; marked irrelevant. |
| Implementation | Explicit offline captain mode; captain begins at helm, Finn at a cannon, Pip at galley. Short-range Together pulse clears hostile bullets, opens cages, damages nearby enemies and grants 1.25 seconds of protection. Saved eight-second base cooldown, no hold-to-repeat. Solo station bar removed; solo promoted on departure screen. Existing co-op and classic controls remain. |
| Local verification | Node 22 `pnpm check` passed 221 tests, Godot import/runtime/export and full build. Log: `/Users/guclaw/.openclaw/workspace/task-artifacts/starling-solo-final-check.log`. Three seeded ordinary-input simulations completed all eight sea and five second-act scenes without the captain leaving the helm. |
| Visible browser checkpoint | 390×844 CUA browser, real native pointer drags plus Together button: 5-step practice finished, first rescue collected, captain stayed at helm, Finn fired, Pip cooked, health 12. First cage now waits for the pulse demonstration. Pack update correctly blocked launch until all 36 files were verified. Standalone mode is emulated; this is not a hardware-phone claim. |
| Keyboard / lifecycle | Space tested with actual Godot canvas focus; pulse fired while captain stayed at helm. Later-harbor and departed-companion save regression preserves automatic meal support. Final solo world has only the raider vessel; regular co-op still starts with all three. |
| Local room verification | Real Durable Object imported a solo save, disabled captain mode even with one online player, and let a second human take Finn. Existing shared-choice authority and legacy room smoke passed. Receipts: `/Users/guclaw/.openclaw/workspace/task-artifacts/starling-solo/local-room/solo-room-smoke.json` and `local-authority/story-room-smoke.json`. |
| Release | Pending: exact-SHA CI, Worker if shared core changes, public asset and journey verification. |

No physical-device testing or external human enjoyment study is implied by automated checks.
