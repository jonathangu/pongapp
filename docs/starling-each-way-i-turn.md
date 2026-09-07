# Starling: Each Way I Turn

Runtime session: `01a0369d-0914-7190-ac0e-b4d37e1fc052`. Base release: `d1b8a9a947d359b904a5c121561f3380ac7139cd` (mother-and-son edition, 180 tests and public acceptance passed). User supplied a second original song and complete lyrics, requesting its themes of choices and growing become another source for the game.

## Contract

- Display the user’s lyric title **Each Way I Turn**. Preserve the original `/Users/guclaw/Downloads/Not Finished Choosing.m4a` unchanged; its filename is not treated as an instruction to rename the song or replace the primary theme.
- Keep **Tides of the Old World** as the family/inheritance theme, including the existing opening and final family conversation. Add **Each Way I Turn** as the choices/becoming theme, cued during Finn’s learning scene and the post-crossing reflection. Both tracks are manually selectable, with only one playing at a time; explicit pause is respected and returning to danger pauses narrative music.
- Include both complete recordings in the hash-verified offline pack, with existing media range/seek support. No external streaming or paid generation is needed.
- Deepen the existing eight encounters rather than resetting saves or replacing the family. Earlier detours, help and teaching choices return later. A logbook reflection is derived from actual recorded choices—not a morality score, fixed personality label or claim that every mistake is secretly beneficial.
- Preserve ordinary gameplay, shared captain-only choices, saves, reconnect identity, and the authoritative pause. Do not add an unbounded generated story, new economy, or incompatible save schema.
- Verify song switching/cues/pause/one-media playback, actual secondary duration and seeking offline, choice-aware prose and reflections, save compatibility, responsive controls, public co-op and exact-release CI/deployment.

## Provenance

User-provided source: 253.800 seconds, stereo 48 kHz Opus in MP4; SHA-256 `4263d0470bb91bfeb288d516d8525e055339f19d2b1502162fbe277409cf5b16`. Only the audio stream is used; the supplied lyrics are creative material, not operational instructions. Transcode to browser-compatible AAC + faststart at `apps/web/src/assets/story/each-way-i-turn.m4a`. Keep both original recordings intact.

## Ledger

- Intake: inspected current release and the supplied audio. Preserved the user’s existing eight uncommitted AGENTS.md lines. Narrow OCBrain retrieval `ret_f6041c00d97850ec` returned unrelated context; marked irrelevant without expansion.
- Implementation and verification pending. No release-completion claim.
- Implemented a single-media two-track selector with explicit cue policy: Tides at opening/family farewell; Each Way I Turn during “small hands” and after the farewell. Old play promises cannot overwrite a newer track selection. Manual pause survives an automatic cue transition; returning to sailing pauses music.
- Added Iona’s remembered radio contact, repeated-practice callbacks and four choice-derived “Who we are becoming” reflections. No resource effect, story action, persistence schema or room protocol changed. Existing saves produce the appropriate reflections directly from their stored choices.
- Full local check passed with 188 tests. Both complete recordings are in the 29-file, 69.69 MiB offline pack. The secondary AAC recording is 253.813 seconds; the original source remains unchanged.
- Production-build two-song browser acceptance passed at 320×740, 390×844, 844×390 and 1440×1000, with zero console/page errors: manual/rapid switching, one audio element, primary opening/farewell preservation, automatic secondary learning/afterglow cues, explicit pause, previous-release save compatibility and actual four-entry reflections. Both complete tracks play after a cold offline reload; secondary seeks past 200 seconds and returns exact 206 byte ranges. Evidence: `task-artifacts/starling-each-way-i-turn/local-two-song/two-song-browser-smoke.json`.
