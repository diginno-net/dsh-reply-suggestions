import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// Installed CLI acceptance is opt-in; the ordinary suite remains portable and keyless.
const electron = process.env.DSH_TEST_ELECTRON;
if (electron) test('installed rc.5 boots the actual bundle, generates with a fake LLM and withdraws every contribution', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-reply-rc5-'));
  let child;
  try {
    const home = join(root, 'home'), dshHome = join(root, 'dsh');
    const profile = join(dshHome, 'profiles/reply-acceptance');
    const plugin = join(profile, 'node_modules/dsh-reply-suggestions');
    await mkdir(plugin, { recursive: true });
    await mkdir(home);
    const source = new URL('../', import.meta.url);
    for (const file of ['package.json', 'cordis.patch.yml', 'lib', 'locale']) {
      await cp(new URL(file, source), join(plugin, file), { recursive: true });
    }
    await writeFile(join(profile, 'package.json'), JSON.stringify({
      name: 'dsh-profile-reply-acceptance', private: true, type: 'module',
      dependencies: { 'dsh-reply-suggestions': 'file:node_modules/dsh-reply-suggestions' },
      dsh: { profile: { bundles: ['dsh-reply-suggestions'] } },
    }));
    await writeFile(join(profile, 'fake-llm.mjs'), `
import { Service } from '@deepseek-ai/cordis';
export default class FakeLlm extends Service {
  constructor(ctx) { super(ctx, 'llm'); }
  async *stream(request) {
    if (request.tools.length !== 0 || request.maxTokens !== 96) throw Error('unexpected model request');
    yield { type: 'text-delta', index: 0, text: 'Cho tôi một ví dụ cụ thể.' };
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 } };
  }
}
`);
    await writeFile(join(profile, 'probe.mjs'), `
import assert from 'node:assert/strict';
export const name = 'reply-acceptance-probe';
export const inject = ['appReady', 'appExit', 'loader', 'typert', 'llm'];
export function apply(ctx) {
  const exit = ctx.get('appExit');
  const cancel = ctx.get('appReady').onReady(() => {
    void (async () => {
      const first = ctx.get('replySuggestions');
      assert.ok(first, 'bundle must not be skipped by compatibility admission');
      const endpoint = 'replySuggestions/recommend';
      const descriptor = ctx.typert.local.get(endpoint);
      assert.ok(descriptor);
      const parsed = descriptor.parameters[0].codec.create().parse({sessionId:'fixture',replyId:'reply',provider:'fixture',model:'fixture',user:'Giải thích plugin.',assistant:'Plugin bổ sung tính năng.'});
      assert.equal(await first.recommend(parsed), 'Cho tôi một ví dụ cụ thể.');
      assert.equal((await first.usage()).lifetime.requests, 1);
      assert.equal(await first.recommend(parsed), 'Cho tôi một ví dụ cụ thể.');
      assert.equal((await first.usage()).lifetime.requests, 1);
      const entry = [...ctx.loader.entries()].find(e => e.options.id === 'reply-suggestions');
      assert.ok(entry?.fiber);
      await entry.fiber.dispose();
      assert.equal(ctx.get('replySuggestions'), undefined);
      assert.equal(ctx.typert.local.get(endpoint), undefined);
      await entry.update({disabled:false});
      await ctx.loader.await();
      assert.ok(ctx.get('replySuggestions'));
      assert.notEqual(ctx.get('replySuggestions'), first);
      assert.ok(ctx.typert.local.get(endpoint));
      console.log('REPLY_RC5_OK fakeModel=true cached=true unloaded=true remounted=true');
      exit(0);
    })().catch(error => { console.error(error); exit(1); });
  });
  ctx.effect(() => cancel);
}
`);
    await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify([
      { id: 'reply-suggestions', config: { enabled: true, autoUpdatePrices: false, timeoutMs: 1000 } },
      { insert: [
        { id: 'fixture-typert', name: '@deepseek-ai/dsh-typert-registry' },
        { id: 'fixture-llm', name: './fake-llm.mjs' },
        { id: 'fixture-probe', name: './probe.mjs' },
      ] },
    ]));
    const cli = join(dirname(electron), '../Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js');
    const result = await new Promise((resolve, reject) => {
      child = spawn(electron, ['--expose-internals', cli, '--profile', 'reply-acceptance'], {
        cwd: root, env: { PATH: '/usr/bin:/bin', HOME: home, DSH_HOME: dshHome,
          DSH_AGENTS_HOME: join(root, 'agents'), TMPDIR: root,
          ELECTRON_RUN_AS_NODE: '1', DSH_TELEMETRY_DISABLED: '1' },
        stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
      });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout += data; });
      child.stderr.on('data', data => { stderr += data; });
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
    });
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /REPLY_RC5_OK/);
    assert.equal(await readFile(join(profile, 'compatibility.json'), 'utf8').catch(() => 'absent'), 'absent');
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise(resolve => child.once('close', resolve));
    }
    const target = await realpath(root), parent = await realpath(tmpdir());
    assert.equal(dirname(target), parent);
    assert.ok(target.startsWith(join(parent, 'dsh-reply-rc5-')));
    await rm(target, { recursive: true });
  }
});
