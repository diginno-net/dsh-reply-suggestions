# Diginno maintenance — Reply Suggestions

## Supported installation

This checkout tracks jabingu/dsh-reply-suggestions upstream 0.1.17 (MIT). The local release is `0.1.17-diginno.1`, pinned to DSH `0.2.1-rc.5`. Other DSH versions require their own compatibility test before changing peers. Do not grant blanket version exemptions.

The maintenance repository is [diginno-net/dsh-reply-suggestions](https://github.com/diginno-net/dsh-reply-suggestions), a public standalone repository retaining the upstream Git history and MIT license. Its canonical branch is `main`. Upstream remains [jabingu/dsh-reply-suggestions](https://github.com/jabingu/dsh-reply-suggestions), based at commit `1b6494b0d3de9d81f364a3a70642e352ec60387a`. Git remotes use `origin` for Diginno and `upstream` for jabingu. Do not push local patches to upstream without approval.

The production installation uses a versioned tarball, not a live source link. Editing or pushing this checkout does not update the running app. Keep upstream attribution and compare upstream changes before incorporating them. Repository access does not grant access to production credentials or profiles.

## Behavior and limits

The plugin inserts one editable suggestion after an assistant answer, never sends it. Suggestions use a separate model request (latest user text up to 400 characters, assistant text up to 1,200, output up to 96 tokens). The model and credentials follow the reply/session unless configured explicitly. Normal activation may make auxiliary model requests when an idle conversation is opened.

The local engine rejects DSH terminal `error` and `aborted` finish chunks, does not cache their partial text, and records failed/cancelled usage. Successful behavior and keyboard handling remain upstream behavior. Existing usage data stays under `DSH_HOME/storages/dsh-reply-suggestions`; no session migration is needed.

## Build and verification

```sh
npm run build
npm test
DSH_TEST_ELECTRON='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' npm test
npm pack --dry-run
```

The installed-app test boots a fresh named profile with separate HOME and DSH_HOME, an actual YAML bundle and a fake LLM. It checks admission without exemptions, generated output, caching, descriptor registration, unload and remount. It neither reads production credentials/history nor starts another application on the live home. Ordinary client tests exercise the built browser bundle. A passing test does not establish live provider quality or public Cloudflare login.

## Installing the maintenance build

Clone the public Diginno repository, run the build and verification commands above, then run `npm pack --ignore-scripts`. Use the DSH Plugins page to install the resulting versioned `.tgz` by its absolute path. If the same package is already installed, follow the replacement procedure below rather than adding a duplicate. Do not use the upstream GitHub installation address from the historical README for this build. Keep the installed artifact unchanged; publish a new maintenance version for later runtime changes.

## Release and rollback

Build and test before packing. Save the profile manifest, lock, patch, compatibility file and workspace package-manager config in a private timestamped backup before any plugin-manager mutation. Record the old package spec and copy the installed plugin to a rollback tarball. Use the running profile's plugin manager: remove the old package before installing another package with the same name when HMR is enabled. Stop if the manager reports unknown outcome, failure or restart-required; inspect before retrying. Do not restart while agents are running.

Only inspect the plugin's own rows and read-only RPCs for deployment verification. Browser tests must keep live history private, must not send native chat messages, and should route recommendation requests to a fixed local fixture for keyboard tests. A real recommendation smoke is an additional model request and must be reported separately.

Rollback through the same plugin manager by removing the custom bundle and reinstalling the saved tarball/spec. The original 0.1.16 was incompatible on rc.5, so restoring it restores the missing-suggestions state, not a working previous version. Do not overwrite the whole live profile backup after other changes have occurred.

## Upgrade policy

Fetch upstream, review the diff and rerun both ordinary tests and exact installed-app acceptance. Keep changes surgical; submit generally useful fixes upstream when approved. Pin each released artifact; no automatic pull/install on app start. A DSH upgrade needs revalidation of client slots/hooks, Typert descriptors and LLM terminal outcomes before publishing a matching local release.
