# Reply Suggestions — Diginno

[Tiếng Việt](./README.md) · **English** · [简体中文](./README_ZH.md)

A follow-up question plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). After the assistant replies, a gray suggestion appears in the empty composer. Press **Enter** to insert it as an editable draft, then edit and send — **it never sends automatically**.

Diginno independently maintains this version based on [jabingu/dsh-reply-suggestions](https://github.com/jabingu/dsh-reply-suggestions), retaining upstream Git history and the MIT license. This is not an official DeepSeek plugin.

| Item | Version / status |
| --- | --- |
| Plugin | `0.1.17-diginno.1` |
| Supported DSH | **`0.2.1-rc.5`** |
| Runtime verification platform | DSH Desktop on macOS |
| Node.js for build/test | 22 or later; CI tests Node 22/24 on Windows/Linux |
| License | [MIT](./LICENSE) |

> Only the DSH version above is supported. Upstream `0.1.17` for rc.2 is not this maintenance build. Do not bypass compatibility checks to install on another DSH version.

## Features

- Suggest one follow-up based on the latest user question and assistant answer.
- The first **Enter** only fills the draft; **Escape** dismisses it. Preserve DSH's IME and Shift/Ctrl/Command/Alt+Enter handling.
- Defer generation when drafts, attachments, references or queued work exist; hide suggestions while a task runs.
- Reuse the provider/model configured in DSH without another API key.
- View tokens, request counts, failures/cancellations and cost estimates on the plugin detail page.
- The Diginno build handles model `error`/`aborted` finishes: never cache partial output, while retaining reported usage.

## Demo

![Gray suggestion and first-Enter draft insertion](./assets/reply-suggestions-demo-0.1.16.png)

An upstream `0.1.16` client fixture placed in a simulated conversation page; **not rc.5 acceptance evidence**, with no real conversation or model call.

## Installation

### 1. Pack the Diginno repository

Requires Git and Node.js 22 or later. Build/tests use Node built-ins; no `npm install` is needed.

```sh
git clone https://github.com/diginno-net/dsh-reply-suggestions.git
cd dsh-reply-suggestions
npm run build
npm test
npm pack --ignore-scripts
```

This creates `dsh-reply-suggestions-0.1.17-diginno.1.tgz`. Prebuilt files are committed; the commands verify them before packing. Code on `main` can change, so retain the exact verified `.tgz` for each deployment.

### 2. Install in DSH

1. Confirm DSH is **`0.2.1-rc.5`** and has a working model configured.
2. Open **Plugins** and check for an existing `dsh-reply-suggestions`. Back up before replacing an old version and follow the [replacement/rollback instructions](./MAINTENANCE.md); do not install a duplicate package name.
3. Select **Add plugin**, enter the absolute path to the generated `.tgz`, and enable it.
4. Follow the plugin manager's result. Restart only if required, after active tasks finish.
5. Complete a conversation turn, leave the composer empty, and wait. Press Enter once to fill the draft, then edit and send normally.

The verified installation uses a fixed tarball. Editing source or running `git pull` **does not update the running plugin**. Direct GitHub-URL installation has not been verified for this maintenance build.

## Models, tokens and privacy

**Each generation makes an additional model request**, potentially consuming tokens/quota even if you ignore the suggestion. Opening an idle conversation can also trigger it. Provider/model defaults follow the answer, falling back to the session's current model when metadata is absent; configuration can override them.

- Use only the latest turn: at most **400 characters** of user text and **1,200 characters** of assistant text; no full history, reasoning or attachment contents.
- Compress long text in the middle and omit fenced code locally; important details may be lost.
- Cap output at **96 tokens** (excluding input tokens); DeepSeek suggestion requests disable reasoning without changing the main conversation settings.
- Wait **800 ms** while the composer is available and idle; cache up to 64 completed results and run at most two distinct generations concurrently.
- Selected text is still sent to the configured provider. Local usage records contain no conversation text, attachments or credentials.

## Usage and costs

Open **Plugins → Reply Suggestions**: the left card selects today, yesterday, 7 days or 30 days; the right card shows lifetime totals since tracking began. Calendar boundaries use the DSH Host's time zone. Plugin-cache reuse is not a new request. Missing usage remains unknown rather than zero; failed/cancelled requests retain provider-reported tokens. Viewing or refreshing statistics does not call a model.

Costs are **CNY estimates using public DeepSeek API prices**, not bills or actual quota deductions. Providers/models without matching rates are marked unknown or partially priced. Each request retains its price snapshot; price updates do not reprice history.

**更新价格** (Update prices) reads the [official pricing page](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) without sending API keys or conversations. Checks default to every 7 days; the menu supports daily, every 3/7/30 days or manual only. Automatic failures retry after 24 hours; network/parsing failures retain old rates and report an error. Saved UI preferences override initial configuration.

Data lives in `storages/dsh-reply-suggestions/` under `DSH_HOME` (default `~/.dsh`): `usage.jsonl` stores usage, `prices.jsonl` stores rates and schedules. Profiles sharing `DSH_HOME` share plugin data. Never commit these files or profile backups to GitHub.

## Optional configuration

Override the entry in the active profile's `cordis.patch.yml`:

```yaml
- id: reply-suggestions
  config:
    enabled: true
    timeoutMs: 20000
    autoUpdatePrices: true
    priceUpdateDays: 7
    # provider: your-configured-provider
    # model: your-configured-model
```

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Generate suggestions |
| `timeoutMs` | `20000` | Timeout, from 1,000 to 60,000 ms |
| `provider` / `model` | Follow conversation | Provider/model already configured in DSH |
| `autoUpdatePrices` | `true` | Automatic checks; `false` still permits manual updates |
| `priceUpdateDays` | `7` | Interval of 1–30 days before a UI preference is saved |

## Testing and troubleshooting

```sh
npm run build
npm test
# Optional on macOS with the exact DSH rc.5 installed:
DSH_TEST_ELECTRON='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' npm test
```

Installed-app acceptance uses a separate temporary profile, HOME and DSH_HOME with a fake model; it does not read production credentials/history. Verification on 2026-10-31 passed **69/69 tests** with this test enabled. Portable CI does not run the installed-app test. See the [CI workflow](https://github.com/diginno-net/dsh-reply-suggestions/actions/workflows/test.yml), [verification evidence and limits](./VERIFICATION.md), and [maintenance/rollback runbook](./MAINTENANCE.md) (English).

If suggestions are missing: check the DSH version and plugin status, ensure the task has finished and the composer is empty, then inspect provider errors or `[reply-suggestions]` logs. Failures, timeouts and invalid output leave normal input available. Automated tests do not guarantee suggestion quality across models, physical mobile keyboards or real IME behavior.

Report bugs in [Diginno Issues](https://github.com/diginno-net/dsh-reply-suggestions/issues), including DSH/plugin versions, OS and reproduction steps. Remove tokens, credentials and private conversations first. Three README languages do not imply that the plugin UI has Vietnamese localization.

## Credits and license

Upstream author: [jabingu](https://github.com/jabingu/dsh-reply-suggestions). Diginno maintains a separate compatibility build based on upstream `0.1.17` at commit `1b6494b0d3de9d81f364a3a70642e352ec60387a`. The [MIT license](./LICENSE) is retained; future DSH versions are not automatically supported.
