# Starling: Godot browser refresh

Authorized 2026-09-06 in runtime `01a0369d-0914-7190-ac0e-b4d37e1fc052`.

The user explicitly chose Godot, browser delivery and direct replacement of the live game. Subsequent clarifications require simpler movement **inside** the ship, tap-to-use stations, automatic aim/shooting, better art/feel and no backward-compatibility requirement. These choices supersede the research-only/native-optional gate and the previous tight-camera/control presentation.

## Acceptance

- Main browser entry runs a real Godot 4 WebAssembly export with GDScript scenes, input/camera, animation/shaders and effects. No preview route or hidden opt-in. Old Three.js gameplay renderer is not the main game.
- Wide playable view: phone hull occupies about one-fifth of screen width, with nearby objectives/obstacles visible; optional map view, always-readable crew controls.
- Tap a station: human crew follows the existing verified interior navigation controller and enters automatically. No required jump/climb/enter sequence. Occupancy cannot steal a human's seat.
- Occupied weapons select valid targets and fire automatically, with visible target feedback. Shield and galley have useful automatic actions; helm is direct steering with braking, no separate thrust button.
- Reuse the tested framework-neutral simulation, authoritative Cloudflare room and transport instead of rebuilding networking. Godot connects through its documented JavaScriptBridge. This is deliberately a Godot browser client plus reusable TypeScript authoritative game module, not a claim that every server rule is GDScript.
- Fresh art direction and focused interface; coherent licensed/generated assets with a provenance record. No broad purchases, account changes or credentials in client.
- Complete solo and invited co-op loop, rescue/guardian/extraction, docks/regions/upgrades, loss/retry, audio and lifecycle; no live API in combat. Old save compatibility is not a blocker; do not delete users' stored data.
- Verify browser startup, interactive movement/station routing/auto-combat, two independent clients, reconnect, responsive phone/landscape/desktop, console/network cleanliness, and exact-SHA deployment. Physical Android/iPhone testing remains a disclosed human validation gap, not a fabricated claim.

## Reuse decisions

Godot 4.7.2 official standard editor + single-threaded Compatibility web export (MIT); alternative Bevy deferred after broad research and explicit user choice. Official release archives are SHA-256 verified. Godot replaces custom scene/input/render plumbing; existing engine-neutral game systems and authoritative rooms remain adapters. Reuse existing source-verified crew navigation and combat utilities; do not invent a second pathfinder. Art packs require exact pack license, not a blanket site assumption. JS bridge docs: https://docs.godotengine.org/en/stable/classes/class_javascriptbridge.html . Web constraints: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html .

## Ledger

- Intake: current release/code/research checked; user AGENTS.md edits preserved. Scope-bound OCBrain retrieval `ret_89291438053d8859` irrelevant; feedback recorded, no expansion.
- Toolchain: downloaded official 4.7.2 macOS editor and export templates to external cache; SHA-256 matched release metadata, editor reports `4.7.2.stable.official.ed1daf0bf`.
- Implementation and release checks pending. This intake record is not implementation completion.
