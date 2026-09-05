# Tiny worlds — visual upgrade ledger

Runtime session: `01a0369d-0914-7190-ac0e-b4d37e1fc052`.

## Contract

Replace the expedition's flat drawing with original Blender-authored 3D dioramas inspired by the generated concept. Preserve the successful local simulation, direct WebRTC transport, game rules, shared hearts, invitations, solo and versus. Target 60 fps during play; verify measured performance rather than promise every phone can sustain it. Keep a usable Canvas fallback when WebGL is unavailable.

## Art direction

Hand-painted ivory/teal/brass adventure vehicles with two visible helmeted crew; sculpted, readable predators; richly layered scenery outside a clear gameplay corridor. Five distinct palettes: emerald jungle, sunset canyon, alpine snow, rainbow floating gardens, luminous cosmic islands. Forward remains predominantly up-screen. No downloaded model packs or external texture services.

## Evidence ledger

- Initial checkout: `716df1b`, previous app release `79ba204`. User-owned `AGENTS.md` modification preserved.
- Blender CLI verified: 5.2.1 LTS. No existing Blender tool exposed in this session. Use a purpose-limited project MCP bridge invoking installed Blender in a fresh background process; do not change a user's open scene.
- Built-in image generation produced `concepts/tiny-worlds-target.png` and `concepts/painted-material-source.png`. Runtime material reduced to 512px JPEG at `apps/web/public/art/painted-material.jpg`.
- OCBrain retrieval `ret_01e3afd08a11bedd` returned unrelated project facts; marked irrelevant and not used as authority.

## Final prompt set (built-in imagegen; no API-key fallback)

Concept: Original mobile co-op art-direction board, five portrait panels: turquoise jungle river and mossy temple; terracotta canyon and orange monster truck; alpine pass and snowy firs; rainbow skies, floating gardens and ivory teal airship; midnight violet space, luminous crystals and ivory teal spaceship. Tactile painted wooden toys, beveled chunky sculpted low-poly forms, warm highlights and contact shadows. Two helmeted passengers in teal/orange, twin brass auto-turrets, dangerous charming crocodile/dragon creatures, stars and crystals. Elevated three-quarter orthographic camera, vehicle at lower center facing forward toward top, clear central corridor and detailed sides, distant vistas. Cohesive teal/coral/ivory accents. Original, no text/UI/watermarks, achievable mobile geometry rather than photorealism.

Material: Seamless square diffuse albedo of nearly white hand-painted matte ceramic/wooden toy surface, subtle warm-gray brush mottling and tiny grain. Low contrast 85–100% brightness, uniform illumination, no shadows/highlights/objects/seams/text/watermarks, seamless on four edges, suitable for multiplying with colored meshes.

## Pipeline

`scripts/art/build_worlds.py` is the editable source of every sculpted model. Generated GLB is checked in so CI and browsers do not need Blender. `scripts/art/blender_mcp.py` exposes only inspect/build operations for this project, not arbitrary remote Python execution. The running game uses Three.js GLTFLoader and one shared generated surface texture, instancing scenery to bound draw calls. Visual QA, performance and final release receipts follow below.

## Iteration receipts

- Pass 1: real 3D models worked, but the corridor was too wide and scenery clipped. Widened framing, brought plants inward, enlarged the vehicle, and improved lighting/color separation.
- Pass 2: corrected overly uniform island spacing, added layered outer terrain, distant temples, visible rainbow/airships and ringed planets. Added a 1024px shadow atlas updated every fourth rendered frame; limited casters after a 215,278-triangle pass exceeded the 180,000-triangle test budget. Kept contact shadows and automatic resolution/shadow reduction for slower rendering.
- Passed five-biome local performance run at `/var/folders/nl/zvqhkx6x13n56g_wq93srs7m0000gn/T/tiny-worlds-qa-qR14go/results.json`: each 5-second 4× CPU-throttled sample sustained 301 frames, p95 16.7–16.8ms, no >250ms stalls, 17–24 sampled draw calls, at most 163,972 triangles including shadow passes. This is headless Chrome on this Mac, not a guarantee for every physical phone or GPU.
- Actual STDIO MCP handshake, tool discovery, inspection and model build passed via `scripts/art/test_blender_mcp.py --build`; receipt `blender-mcp-verification.json`. Registered as `pongapp-blender` in local Codex configuration. Native tool discovery in a fresh/reloaded Codex session is separate from this verified SDK client connection.
- Added automatic Canvas fallback and verified intentional WebGL context loss. Split Three.js/renderer into an asynchronously loaded chunk so invite/game controls and the fallback are usable while assets download.
- Added portrait and landscape visual QA; landscape phone cockpit moved to the side after screenshot review showed that a bottom cockpit consumed too much world height.
- `pnpm check`: 88 tests passed, plus lint, type checks and all builds. Core simulation, network protocol and Worker source unchanged.
- Final local visual suite: `qa/local/visual-results.json` and six checked-in screenshots. Five 5-second 4× CPU samples all returned 301 frames, p95 16.7–16.8ms, zero stalls, at most 159,754 sampled triangles including shadows. Both forced GPU loss (with continuing steering) and a blocked GLB download retained the playable Canvas fallback.
- Final full local direct-peer suite: `qa/local/peer-results.json`. Co-op local input response 10.5ms, versus 26.7ms with outbound gameplay deliberately blocked to verify prediction. Direct path, relay fallback, rematch epoch isolation, background resume, signaling reconnect, exact invitation URLs, multi-touch and shared damage/engineer repair all passed.
- Production-build preview passed the enhanced release smoke, including exact hashes for the GLB and generated texture and availability of the separately loaded renderer chunk.

## Reproduce

```sh
uv run --with mcp==1.26.0 python scripts/art/test_blender_mcp.py --build
pnpm check
node scripts/tiny-worlds-browser-smoke.mjs
node scripts/peer-browser-smoke.mjs
```

The browser scripts expect Vite at 5173 and the local room Worker at 8787. For production UI checks set `UI_URL`; for peer UI set `QA_UI_ONLY=1` and the live `ROOM_SERVER_URL`. Never use production rooms belonging to real players for fixtures.

Reference documentation: [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). The community Blender connector was reviewed as a workflow reference, but not installed; this project uses its own narrow, local, reproducible bridge instead.

## Verified public release

- Application commit: `69a57311cec5669da74d56bc2cf56055d396f7df`.
- [GitHub Actions run 33949680038](https://github.com/jonathangu/pongapp/actions/runs/33949680038): build, deployment, asset-hash verification, production co-op and production versus smoke all passed.
- Live site: https://www.jonathangu.com/pongapp/ . Entry `index-xLzehElA.js`; lazy renderer `TinyWorldScene-BUE-_7dS.js`.
- Served GLB SHA256 `98b0bb7c56f7fc730b798b57c20adce9a43eeb534004a05bf0fe1afa810fb7c8`; served painted texture SHA256 `43fadceb09f6a1f7a4fc3e882294ab2516aa9863ecb6340e0ac16acd32c4f728`. Both match repository bytes. GLB served as `model/gltf-binary`.
- `qa/production/visual-results.json`: all five worlds, device DPR 3 with renderer capped to 1.5, 4× CPU slowdown, 5 seconds per biome. 301–302 frames per sample; p95 16.7–16.8ms; zero >250ms stalls; at most 166,478 sampled triangles including shadows. Tested portrait widths 320/375/390 and 844×390 landscape. Forced context loss retained steering; blocked model downloads fell back cleanly; zero uncaught browser exceptions.
- `qa/production/peer-results.json`: fresh production co-op and versus invitations established direct local connections; both clients displayed damage and actual engineer repair, including 320/375/390px guest HUDs. Multi-touch passed. This verifies the website on this Mac's Chrome, not physical-phone GPU performance or every Wi-Fi/hotspot configuration.
- Confirming: the live solo/co-op expedition now uses original Blender-authored 3D models and the generated material. Versus rules/renderer and the successful direct WebRTC/local simulation are unchanged. No Worker restart or protocol migration was necessary.
- Concept, runtime assets, editable `.blend`, generator, MCP bridge and verification receipts are all checked in. Current-session tool discovery was not hot-reloaded; restart/reload Codex to expose the newly registered native MCP tool list. The bridge itself was independently exercised successfully over MCP.
