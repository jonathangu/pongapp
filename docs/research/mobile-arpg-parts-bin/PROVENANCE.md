# Reuse, provenance and adoption gates

Research recommendations are not shipping approvals. No third-party game code or asset was imported in this pass. This checklist is an engineering license screen, not legal advice; unfamiliar/copyleft combinations or store-distribution conflicts require a qualified review before adoption.

## Three distinct kinds of reuse

1. **Integrate:** use an upstream library/plugin with its notices, pinned version and dependency tree. Keep game-specific semantics behind an adapter.
2. **Adapt/port:** copy or translate implementation into our code. Preserve provenance and applicable obligations; changing language does not erase copyright/license conditions.
3. **Study:** document general architecture lessons and independently design our system. Do not reproduce distinctive content, protected assets, exact tables, dialogue, names or large source passages. Do not label this automatically “clean room”; that requires a real process.

Commercial use is not the same as proprietary redistribution. GPL permits commercial distribution under its conditions. MPL can require source for covered files. CC-BY-SA has share-alike obligations and is not a simple replacement for a software license. MIT/BSD/Apache/Zlib still have conditions. No-license and noncommercial-restricted sources are not approved implementation donors. CC0 does not grant unrelated trademarks or guarantee every uploader's chain of rights.

## Per-adoption record

Before adding code, a plugin or an asset, record these fields in the implementation change:

| Field | Required evidence |
| --- | --- |
| Identity | Internal ID, upstream project, original author/source URL |
| Exact source | Release/version AND commit or immutable artifact URL; file/pack SHA-256 |
| Scope | Exact copied files/assets; code, art, audio, font, data and tool categorized separately |
| Grant | SPDX expression where possible; original license file and its checksum; exception/third-party terms |
| Obligations | Attribution text/location; license/NOTICE inclusion; modification notices; source-offer/source-distribution requirements |
| Changes | Patch/transform list, adapter boundary and upstream update strategy |
| Verification | Test command and result, device/platform evidence, measured startup/runtime cost |
| Ownership | Maintainer inside our project, replacement/removal path and known risks |
| Approval | Proposed vs approved-for-prototype vs approved-for-shipping; unresolved conditions explicitly listed |

An example record for a future Kenney pack would include the exact pack page, downloaded archive hash, included CC0 license and transformed asset list—not just “Kenney is CC0.” An example GLoot record would pin the actual release/commit and the compatible Godot version; add our adapter and save migration tests. Neither example is an actual import approval.

Use dependency lockfiles and an SBOM appropriate to the selected engine; maintain a human-readable third-party notice file. Include runtime decoders, native binaries and asset tools where redistribution requires it. Build output should be checked against the manifest so an unlisted texture/font/audio file cannot slip into a release. Never store signing credentials in these records.

## Adoption sequence

1. Define the smallest missing capability and inspect the existing engine/project solution first.
2. Compare the closest reusable candidate with one credible alternative. Inspect relevant source, license, target support and a real example. Activity is evidence, not a popularity contest.
3. Pin a source; inspect dependencies/build steps before executing upstream tooling. Resolve code and asset grants separately.
4. Build a disposable, bounded spike. Measure behavior and integration cost on the actual target; avoid a permanent fork as the default.
5. Write the acceptance fixtures, adapter and provenance record. Include failure/upgrade tests for persistent data and networking boundaries.
6. Approve only the tested scope. Import minimum files/features; keep updates reproducible. Revisit the decision if maintenance cost exceeds the work saved.

Tiny inactive repositories are allowed candidates. Require an understandable isolated component, a clear license, deterministic fixtures, an owner and an inexpensive replacement path. Never confuse a compact abandoned demo with a maintained subsystem. Conversely, a mature math library's old release date alone is not a rejection reason.

## Research evidence limitations

`repository-evidence.json` is a point-in-time GitHub API snapshot, not an authority for legal classification. It records raw SPDX detection even when it says `NOASSERTION`. `catalog-data.mjs` contains manual, source-informed judgments; `CATALOG.md` joins them to immutable license and commit links. Actual license files, not repository labels, control.

`source-evidence.json` records hashed README and selected source/document files at those same commits. Sources were screened for the relevant capability; this was not a complete line-by-line audit or a successful build of each project. Asset-library policy pages were inspected separately; no specific pack has been selected or verified for shipment. Readme badges and upstream “production ready” claims were not counted as our test results.

Reproduce the repository lookup with `node collect-evidence.mjs`, source lookup with `node inspect-sources.mjs`, render with `node render-catalog.mjs`, and verify with `node verify-research.mjs`, from this folder. Lookup scripts require authenticated GitHub CLI access and read public repository data; they do not install or run candidate code. Re-running collection updates the snapshot intentionally—review the diff before accepting new facts. Rendering/verification use the saved snapshot without network access.
