# Starling — solo-first editorial pass

Runtime session: `01a0369d-0914-7190-ac0e-b4d37e1fc052`.

## Acceptance

Jonathan requests genuinely enjoyable single-player play and authorizes cutting and streamlining features. Preserve the released family story, co-op, installation/offline contract, soundtrack, and existing saves. Awards are an aspiration, not an acceptance claim.

## Design hypothesis

The solo player should make navigation, timing, and story decisions, not repeatedly abandon the wheel to manage stations. Keep one tactile verb (steer) and one expressive intervention (Together: a short-range rescue/defense pulse). Finn handles cannons; the companion handles meals. Teach those real actions. Co-op retains complementary stations. Move solo deck micromanagement out of the main experience; keep harbors optional and avoid expanding currencies or upgrade systems.

The existing code pins story-Finn to lookout, requires a human cannon seat and a human galley seat to finish practice, and exposes five station shortcuts plus deck controls during solo. These are verified code findings, not user-playtest results.

## Ledger

| Stage | Evidence |
| --- | --- |
| Intake / inspection | Current release `df288f26b819ebb767b6acc8446c3d0f324cfc57`; user-owned AGENTS.md edits preserved. Narrow retrieval `ret_fc60faf96d65329f` contained unrelated context; marked irrelevant. |
| Implementation | Pending. |
| Local verification | Pending: simulation regressions, full check, visible solo browser journey and co-op regression. |
| Release | Pending: exact-SHA CI, Worker if shared core changes, public asset and journey verification. |

No physical-device testing or external human enjoyment study is implied by automated checks.
