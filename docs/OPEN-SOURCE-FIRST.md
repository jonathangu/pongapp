# Mobile ARPG: open-source-first operating policy

Principal request, 2026-09-06. Runtime `01a0369d-0914-7190-ac0e-b4d37e1fc052`.

Mobile feel and readability are the product constraint. Installed apps are explicitly acceptable, but easy link-based first play remains valuable; the future ARPG is not required to be browser-only. Both Android and iPhone testing are relevant. Godot is the research lead for a same-project native/web comparison, pending physical-device evidence; the released browser game remains untouched. Spend original engineering effort on ricochet/physics-driven ARPG combat, builds, loot and world identity. Treat mature open-source software and permissive assets as infrastructure; investigate small focused repositories as well as engines and whole games.

Before implementing or substantially replacing any major subsystem:

1. Research existing candidates and at least one credible alternative. Inspect primary repository/license documentation and relevant source or examples; do not decide from stars or a marketing summary.
2. Record the problem, exact source/version, license and commercial-use conditions, language/engine, activity and quality evidence, decision (integrate/adapt/study/defer/reject), and work avoided. Record integration and maintenance cost too.
3. Keep code, data, artwork, audio, fonts and trademarks separate in provenance. A language port or adaptation is not automatically exempt from the source license. Unlicensed code and noncommercial assets are not approved for shipment.
4. Prefer adapters, upstream-compatible extensions and structured content over a permanent engine fork or monolithic bespoke classes. Do not add multiple engines/ECS/physics/network stacks without a measured need.
5. Verify candidate combinations on actual target phones before architectural commitment: touch feel, legibility, input latency, sustained frame time, memory, thermal behavior, suspend/resume and packaging. Desktop viewport emulation is not physical-device proof.
6. Require a small, bounded comparison spike, provenance entry and acceptance evidence before adopting a subsystem. Unknown license or asset provenance is a blocking gate for copying/shipping, not an invitation to guess.

Research scope includes ARPG foundations, world/RPG systems, engines, physics, navigation/behavior, procedural generation, multiplayer/backend, profiling/debug UI, permissive assets, shaders/VFX/audio, and editors/data pipelines. Originality is mandatory: reuse infrastructure and general patterns, not another game's identity, protected assets, exact content or proprietary data.

This request authorizes research and recording recommendations. It does not authorize replacing the released Starling game, migrating saves, changing production infrastructure, purchasing assets, or selecting an engine without comparison evidence.

Current deliverables and sources: see [mobile ARPG research](research/mobile-arpg-parts-bin/README.md), including 60 candidate records, pinned evidence and a proposed native-phone acceptance experiment. Research is complete; implementation and engine selection remain future gates.
