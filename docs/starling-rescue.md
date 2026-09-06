# Starling Rescue implementation contract

Principal authorization 2026-09-06: implement the entire ambitious redesign to a verified finished product, with stunning original visuals, music/sounds, play, available appropriate APIs, and a phone-installable downloadable game pack. This supersedes the earlier instruction to wait before Phase1.

Runtime session `01a0369d-0914-7190-ac0e-b4d37e1fc052`. Baseline `fb5c5fafea086b7d37c40e4b73fd8edd8545df7e`. Detailed approved design: `/Users/guclaw/.openclaw/workspace/task-artifacts/neon-rescue-redesign-plan/DESIGN-PLAN.md`.

## Mandatory outcome

- Preserve standalone `/pongapp/`, instant guest play, working legacy modes and existing user AGENTS.md edits. No RackeTapp/Supabase changes, recurring work, subagents or new accounts.
- Main playable camera is majorly zoomed into the cylinder: only small horizon hints at the top-left and top-right corners. Large upright circular cutaway ship and readable crew dominate the view. Portrait/landscape have intentional framing; avoid unseen damage when zoomed.
- Separate macro 2D ship physics and ship-local kinematic crew physics, fixed-step updates, no hull rotation. Crew run/jump/climb/drop, physically enter/exit seats, carry/throw gems. Ship translation is composed once at render, never added to local crew physics.
- Eight stations:360° engine,360° shield,4quadrant turrets, charged360° Starburst superweapon, map/fog. Interior seats stay fixed while exterior equipment moves on rails. Exclusive occupancy and sequenced inputs are authoritative.
- Complete five-cage rescue mission, bounded seeded connected maps, portal/extraction, health/damage/loss/retry, meaningful enemies/bosses, three visually distinct biomes, original animated art and responsive effects.
- Physical Power/Beam/Metal gem pickup/carry/socket, visibly distinct weapons (burst, piercing beam, bounded tethered flail), meaningful non-turret upgrades. Run-local powers, no monetized power.
- Solo pet navigates walk/jump/climb/drop graph through the same controller with A*, sticky orders and intelligent station behavior. Solo command slow-time scales all gameplay together, co-op never freezes the partner.
- New-mode server authority for crew/seat/gem/ship/combat/objectives, versioned protocol, client prediction/reconciliation, fresh invited peer, reconnect and rematch. Reuse existing room infrastructure without rewriting legacy peer modes. Validate scheduling/bandwidth.
- Original music and sound with actual audible output, adaptive intensity/rescue/danger, separate volume controls, audio lifecycle cleanup, reduced motion/flashes and clean browser console.
- Use ImageGen for original concepts/assets and appropriate local Blender/rendering tooling. Do not treat concept art, static screenshots or passing tests as proof of enjoyable gameplay. Review actual playable phone/desktop renders.
- Installable PWA and explicit downloadable offline solo-content pack. Atomic complete versioned caches, integrity verification, quota/error/cancel handling, safe updates and cache eviction recovery. Co-op and new AI generation need internet. Do not call it a native APK/IPA or claim physical-phone installation without evidence.
- Retain existing server-only model API/budget guardrails ($100/month PongApp ceiling); no live LLM in physics or navigation. No unrelated key/account changes. Generation is optional verified bounded recipe variety, not a substitute for authored game mechanics.

## Milestones and gates

1. Movement+camera: ship-local invariant/rail/collision tests, direct touch+desktop controls, actual tight-camera render, two-browser server spike.
2. Stations+combat: all8seats, projectile/shield/aim/charge semantics, authored rescue encounter, fair enemy tells.
3. Companion: all seat routes, interrupted routes/carrying, no teleport/seat theft/stuck state, useful solo operation/commands.
4. Mission+gems: seeded reachability validation, five rescues+portal, physical upgrades, full solo/two-player mission/rematch/reconnect.
5. Production visuals/audio/content: original assets, three biomes, bosses, readable crew, animation/VFX/music/sound, complete onboarding/settings.
6. Release: `pnpm check`, diagnostic play/balance/perf, mobile/desktop browser and actual room tests, offline/download/update tests, exact-SHA CI and deployment, public assets/fullgame/peer verification, receipt.

Targets are measured, not presumed:60Hzsimulation,60fps typical/30fpslow-effects, readable18–24CSSpxcrew, ≤5MBcriticalcompressedtransfer wherefeasible,10minaction/20minlifecyclesoak,150msRTT+loss,reconnect, clean replay/old-epoch handling. Physical phone and human-user playtest gaps must be labeled; automated browser/bot checks are not human fun ratings.

Ledger/evidence: `/Users/guclaw/.openclaw/workspace/task-artifacts/starling-rescue-release/PROGRESS.md`. Status: requirements recorded; implementation starts next. Planning alone is0%implementation.
