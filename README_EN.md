# Reply Suggestions

[简体中文](./README.md) · **English**

Suggest your next question from the conversation. Press Enter to fill it in, then edit and send.

A composer suggestion plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). After the assistant finishes, a gray suggestion appears in an empty composer. Accept it as an editable draft; it is never sent automatically.

| Item | Current version |
| --- | --- |
| Plugin | `0.1.4` |
| Verified official desktop version | `0.2.0-rc.2` |
| License | [MIT](./LICENSE) |

## Features

- Generate a relevant follow-up using the latest user question and assistant answer.
- Press **Enter** once to insert the suggestion into the draft. Edit it, then send using Harness's normal behavior.
- Press **Escape** to dismiss the current suggestion.
- Preserve IME confirmation and Shift/Ctrl/Command/Alt+Enter behavior.
- Defer generation while the composer has a draft, attachments, references, or queued work. Hide suggestions while a task is running.
- Reuse the model and credentials already configured in Harness. No additional API key is required.

## Installation

### Install from GitHub

1. Open **Plugins** in DSH and check whether `dsh-reply-suggestions` is already installed. If it is, use the update action rather than adding it again.
2. Confirm that the official desktop version is `0.2.0-rc.2`.
3. Select **Add plugin** and enter this repository address:

   ```text
   https://github.com/jabingu/dsh-reply-suggestions
   ```

4. Follow the app's prompts to load and enable the plugin, then restart DSH.
5. Complete a regular conversation turn, leave the composer empty, and wait for a gray suggestion.

The repository includes prebuilt `lib/` files, so a manual build is unnecessary. The DSH peer version is pinned to `0.2.0-rc.2`; check the interfaces before using another version.

### Install from a local directory

Download and extract the repository ZIP, or clone the repository. After checking that the plugin is not installed, enter the absolute path of the directory containing `package.json` in the same Add plugin dialog. Enable it and restart DSH.

The official desktop profile is app-managed; use the desktop Plugins page. If you actually use `dsh web`, run these commands from the plugin directory:

```powershell
dsh plugin --profile web list --depth=0
# Add only after confirming it is not installed:
dsh plugin --profile web add .
```

To update a local linked installation, update its files and restart DSH. There is no need to install it again.

## Example

Send:

> Explain what a plugin is in two or three sentences, with an everyday analogy. Do not use tools or create files.

After the answer, a gray suggestion might say, "Can you show me the simplest plugin example?" Press Enter once to insert it, edit it, and send. The model generates the suggestion, so its exact wording varies with the conversation.

## Models and token usage

Generating a suggestion makes an additional model request. That request consumes usage even if you do not accept it. By default, the plugin uses the provider/model recorded with the assistant answer. When rc.2 records lack that metadata, it falls back to the session's current model projection.

The plugin limits overhead as follows:

- Send only the latest turn's text, excluding the full history, reasoning blocks, and attachment contents.
- Limit the user question to **400 characters** and the assistant answer to **1,200 characters**, on both client and Host.
- Keep roughly the first third and last two thirds of long text, marking the omitted middle. Omit Markdown fenced code locally while keeping surrounding prose and inline code.
- Use a short instruction prompt and an output cap of **96 tokens**. This cap does not include input tokens.
- Disable reasoning for DeepSeek suggestion requests without changing the main conversation's reasoning setting.
- Wait **800 milliseconds** while the composer is available and idle before requesting. Typing during that delay cancels the timer.
- If typing starts after dispatch, hide the suggestion temporarily and reuse the result when the draft is cleared, avoiding cancel-and-retry requests. Switching sessions, starting a new turn, or unloading still cancels the old request.
- Cache up to 64 completed results on the Host and allow at most two concurrent generations.

Compared with the old version, the context cap drops from 14,000 to 1,600 characters, a reduction of about 88.6%. This is not the actual token savings on every request. Compression may omit relevant details from the middle of an answer or its code. No extra model call is used to summarize the context.

## Optional configuration

Defaults usually suffice. To use another model already configured in Harness, override the entry in the active profile's `cordis.patch.yml`:

```yaml
- id: reply-suggestions
  config:
    enabled: true
    timeoutMs: 20000
    provider: your-configured-provider
    model: your-configured-model
```

| Option | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | Enable suggestion generation |
| `timeoutMs` | `20000` | Timeout in milliseconds, from 1,000 to 60,000 |
| `provider` | Follow conversation | Optional; must be a configured provider |
| `model` | Follow conversation | Optional; must be available from that provider |

Failures, timeouts, and invalid output leave normal composer behavior available. Look for `[reply-suggestions]` diagnostics in the client console.

## Development

Build and test directly with Node.js 22 or later. No build dependencies need to be installed:

```powershell
node scripts/build.mjs
node --test tests/*.test.mjs
```

```text
src/common.mjs       RPC contract, context compression, keyboard safeguards
src/engine.mjs       Model requests, budget, cache, and timeout
src/index.mjs        Host service registration
src/client.cjs       Gray suggestion, scheduling, draft insertion
lib/                 Prebuilt Host and client files
locale/              Plugin title and Chinese/English descriptions
scripts/build.mjs    Build script with no extra build dependencies
tests/               Behavior and client lifecycle tests
```

The implementation uses official Typert/Gateway RPC, `llm.stream`, the `conversation.input.overlay` slot, session snapshots, and draft actions. Layout positioning depends on rc.2 composer DOM markers and needs review when those change.

## Validation scope

- 24 automated tests pass, covering Enter acceptance, IME composition events, held-key safeguards, session isolation, context budgets, deferred generation, cache, and cancellation.
- Actual plugin fiber mounting, RPC, and disposal were verified using Cordis, Typert, and Host/Client Gateway from the official rc.2 installation, with a stub model.
- Version `0.1.2` was tested in the real rc.2 desktop app for generation, display, first-Enter insertion, editing, Shift+Enter line breaks, sending, Escape, and session switching.
- The `0.1.3` usage optimization and `0.1.4` display metadata update passed automated and resource checks. Real-model quality and desktop visual acceptance were not repeated for those updates.

Other Harness versions, third-party desktop shells, and real IME candidate selection require additional testing. Suggestions can always be edited or ignored.

## License

[MIT](./LICENSE)
