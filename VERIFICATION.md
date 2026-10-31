# Verification — 2026-10-31

Target: installed Mac Desktop DSH `0.2.1-rc.5`. Maintenance plugin release `0.1.17-diginno.1`, based on upstream `0.1.17`. Deployment hostnames, profile configuration, credentials and history are excluded from this repository.

## Local checks

- Unchanged upstream suite: 66 tests passed.
- New installed-CLI acceptance failed before the peer change: the actual app skipped the bundle as incompatible. It passed after pinning peers to rc.5, without a version exemption.
- New terminal finish-error and finish-aborted tests both failed before the engine fix (missing rejection). Both passed after rejecting failed partial output, preserving usage status and allowing a fresh request for the same key.
- `npm run build` followed by `DSH_TEST_ELECTRON='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' npm test`: 69 passed, 0 failed, 0 skipped. Isolated named-profile test verifies actual YAML admission, host service, descriptor registration, fake generation, caching, unload and remount. No production credentials or models.
- `npm pack --pack-destination ... --json`: versioned release contains 16 files including maintenance instructions, no dependency install/build scripts.
- Independent read-only review found no P0/P1 issues in the compatibility change. Exact installed rc.5 APIs, not the older DSH source checkout, were used as authority.

## Live deployment

The running plugin manager reported `applied` for removal of the incompatible 0.1.16 and installation of the custom tarball. HMR applied both operations; no Desktop restart, application-core edits, session edits or compatibility exemption. Bundle inventory reports custom version, enabled, no compatibility error. Read-only usage RPC works and retained the existing historical records. HTTP/bootstrap/client asset, WebSocket and hostile-Origin refusal smoke passed.

Private backups and rollback tarball are under `~/.config/dsh-macbook-deploy/reply-suggestions/`; management results and browser test helpers remain there, not in the release. See [maintenance](MAINTENANCE.md) before rollback or upgrade.

## Browser evidence and limits

Headless Chromium loaded the actual installed Desktop's client resources using an authenticated loopback relay for the public hostname. The recommendation endpoint was intercepted with fixed Vietnamese text; no real model inference. Existing native session navigation produced a visible ghost suggestion; first Enter inserted that text into the native editable draft and made no additional submit request. The fixture draft was cleared. Mobile viewport 390 × 844 had no document horizontal overflow and displayed the composer. No page exceptions were observed.

The protective browser fixture intentionally blocked automatic new-session creation attempts; its resulting restoration warnings are test interception evidence, not a production diagnosis. It also observed an archive-manager readiness warning during startup, outside this plugin. Initial browser attempts required corrections to session navigation, response envelope and zero-size ghost-wrapper selectors before the workflow passed. No production fixes were made to accommodate those test mistakes.

Public Cloudflare Access login, physical mobile keyboard behavior and real-provider suggestion quality were not verified. Browser evidence proves client mount/insertion using a fixed response, not real inference. Opening an ordinary idle conversation after activation may make the plugin's normal auxiliary model request. Existing usage pricing can be unknown for non-DeepSeek providers; this release does not change pricing.
