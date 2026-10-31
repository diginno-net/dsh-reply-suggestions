import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccept, compactContext, CONTEXT_LIMITS, descriptor, installAcceptance, normalizeSuggestion, recommendationContext, selectReply, validateInput } from '../src/common.mjs';
import { createRecommender } from '../src/engine.mjs';

const input = { sessionId: 'session-a', replyId: 'answer-1', provider: 'provider', model: 'model', user: '帮我写插件', assistant: '可以先实现一个工具插件。' };
const ready = () => ({ suggestion: '先实现一个工具插件，并解释如何加载。', running: false, removed: false, editable: true,
  input: { phase: 'plain', draft: '', attachmentIds: [], occurrences: [], queue: [] } });
class Editor {
  listeners = new Map();
  addEventListener(name, fn) { const set = this.listeners.get(name) ?? new Set(); set.add(fn); this.listeners.set(name, set); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  emit(name, props = {}) {
    const event = { key: 'Enter', prevented: false, stopped: false, preventDefault() { this.prevented = true; },
      stopImmediatePropagation() { this.stopped = true; }, ...props };
    for (const fn of this.listeners.get(name) ?? []) { fn(event); if (event.stopped) break; }
    return event;
  }
}

test('Enter accepts once without reaching the native submit handler', () => {
  const editor = new Editor(); const state = ready(); let accepted = 0; let sent = 0;
  installAcceptance(editor, () => state, () => { accepted++; state.input.draft = state.suggestion; }, () => {});
  editor.addEventListener('keydown', () => { sent++; });
  assert.equal(editor.emit('keydown').prevented, true);
  assert.equal(accepted, 1); assert.equal(sent, 0);
  assert.equal(editor.emit('keydown', { repeat: true }).prevented, true); assert.equal(sent, 0);
  editor.emit('keyup');
  assert.equal(editor.emit('keydown').prevented, false); assert.equal(sent, 1);
});

test('IME confirmation and the compositionend race preserve native behavior', () => {
  const editor = new Editor(); let accepted = 0; let time = 100;
  installAcceptance(editor, ready, () => accepted++, () => {}, () => time);
  assert.equal(editor.emit('keydown', { isComposing: true }).prevented, false);
  assert.equal(editor.emit('keydown', { keyCode: 229 }).prevented, false);
  editor.emit('compositionstart'); assert.equal(editor.emit('keydown').prevented, false);
  editor.emit('compositionend'); assert.equal(editor.emit('keydown').prevented, false);
  time += 51; editor.emit('keydown'); assert.equal(accepted, 1);
});

test('Modified Enter, existing drafts, attachments and queued work are preserved', () => {
  const editor = new Editor(); let state = ready(); let accepted = 0;
  installAcceptance(editor, () => state, () => accepted++, () => {});
  for (const modifier of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey']) assert.equal(editor.emit('keydown', { [modifier]: true }).prevented, false);
  for (const patch of [{ draft: '用户文字' }, { draft: ' ' }, { attachmentIds: ['image'] }, { occurrences: [{}] }, { queue: [{}] }, { phase: 'claimed' }]) {
    state = ready(); Object.assign(state.input, patch); assert.equal(editor.emit('keydown').prevented, false);
  }
  assert.equal(accepted, 0);
});

test('Running, disabled and removed sessions have no accepting suggestion', () => {
  for (const patch of [{ running: true }, { removed: true }, { editable: false }, { suggestion: '' }]) assert.equal(canAccept({ ...ready(), ...patch }), false);
});

test('Escape dismisses and unload removes every key and composition listener', () => {
  const editor = new Editor(); let dismissed = 0;
  const dispose = installAcceptance(editor, ready, () => {}, () => dismissed++);
  assert.equal(editor.emit('keydown', { key: 'Escape' }).prevented, true); assert.equal(dismissed, 1);
  dispose(); assert.equal(editor.emit('keydown').prevented, false);
  assert.equal([...editor.listeners.values()].every(set => set.size === 0), true);
});

test('Reply selection reads final text and preceding user prompt, excluding reasoning', () => {
  const nodes = [{ kind: 'user', content: [{ type: 'text', text: input.user }] },
    { kind: 'assistant', seq: 5, blocks: [{ kind: 'reasoning', text: 'private' }, { kind: 'text', text: input.assistant }], requestConfig: { provider: input.provider, model: input.model } }];
  const selected = selectReply(nodes, input.sessionId);
  assert.equal(selected.assistant, input.assistant); assert.equal(selected.user, input.user);
  assert.equal(selected.sessionId, input.sessionId);
  assert.equal(selectReply([...nodes, { kind: 'user' }], input.sessionId), null);
  assert.equal(selectReply([{ ...nodes[1], interrupted: true }], input.sessionId), null);
  assert.equal(selectReply([{ ...nodes[1], blocks: [{ kind: 'tool-call' }] }], input.sessionId), null);
});

test('Malformed or oversized RPC context is rejected before model use', () => {
  assert.deepEqual(validateInput(input), input);
  assert.throws(() => validateInput({ ...input, secret: 'unexpected' }));
  assert.throws(() => validateInput({ ...input, provider: '' }));
  assert.throws(() => validateInput({ ...input, assistant: 'x'.repeat(12001) }));
  assert.throws(() => descriptor().result.create().parse({ suggestion: 'wrong type' }));
});

test('rc.2 assistant records without provider metadata use the session model projection', () => {
  const nodes = [{ kind: 'assistant', seq: 9, blocks: [{ kind: 'text', text: '这是 rc.2 的回答。' }] }];
  assert.equal(selectReply(nodes, 'a'), null);
  const selected = selectReply(nodes, 'a', { provider: 'deepseek-account', model: 'deepseek-flash' });
  assert.equal(selected.provider, 'deepseek-account'); assert.equal(selected.model, 'deepseek-flash');
});

test('The descriptor agrees on host method, ordered argument and cancellation', () => {
  const value = descriptor(); assert.equal(value.namespace, 'replySuggestions'); assert.equal(value.method, 'recommend');
  assert.deepEqual(value.parameters.map(parameter => parameter.name), ['input']); assert.equal(value.cancellation.parameter, 'signal');
  assert.deepEqual(value.parameters[0].codec.create().parse(input), input);
});

test('Suggestions reject multiline responses, oversized replies and slash commands', () => {
  assert.equal(normalizeSuggestion('“请给我一个示例。”'), '请给我一个示例。');
  for (const text of ['第一条\n第二条', 'x'.repeat(101), '/delete', '{bad json}']) assert.equal(normalizeSuggestion(text), '');
  assert.equal(normalizeSuggestion('{"suggestion":"请继续解释。"}'), '请继续解释。');
});

test('A short tool-free auxiliary request reuses the model and caches a completed result', async () => {
  let calls = 0; let options;
  const recommend = createRecommender({ async *stream(value) { calls++; options = value; yield { type: 'text-delta', index: 0, text: '给我一个' }; yield { type: 'text-delta', index: 0, text: '具体示例。' }; } });
  assert.equal(await recommend(input), '给我一个具体示例。');
  assert.equal(await recommend(input), '给我一个具体示例。'); assert.equal(calls, 1);
  assert.equal(options.model, input.model); assert.equal(options.provider, input.provider);
  assert.deepEqual(options.tools, []); assert.equal(options.maxTokens, 96);
  assert.equal(options.messages[0].role, 'user'); assert.equal(options.sessionId, undefined);
});

test('block-end replaces its own deltas, avoiding duplicated recommendation text', async () => {
  const recommend = createRecommender({ async *stream() {
    yield { type: 'text-delta', index: 0, text: '请继续。' };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: '请继续。' } };
  } });
  assert.equal(await recommend(input), '请继续。');
});

test('Different sessions and model overrides do not reuse the wrong cached result', async () => {
  let calls = 0;
  const recommend = createRecommender({ async *stream(options) { calls++; assert.equal(options.model, 'fast-model'); yield { type: 'text-delta', index: 0, text: '请展开说明。' }; } }, { model: 'fast-model' });
  await recommend(input); await recommend({ ...input, sessionId: 'session-b' }); assert.equal(calls, 2);
});

test('Failed requests do not poison the cache, and cancellation reaches the model', async () => {
  let calls = 0;
  const recommend = createRecommender({ async *stream() { calls++; if (calls === 1) throw new Error('temporary failure'); yield { type: 'text-delta', index: 0, text: '请继续。' }; } });
  await assert.rejects(recommend(input), /temporary failure/); assert.equal(await recommend(input), '请继续。');
  const controller = new AbortController(); controller.abort(new Error('cancelled'));
  await assert.rejects(recommend({ ...input, replyId: 'new-answer' }, controller.signal), /cancelled/);
  assert.equal(calls, 2);
});

for (const kind of ['error', 'aborted']) test(`rc.5 ${kind} finish rejects partial output without caching it`, async () => {
  let calls = 0;
  const records = [];
  const recommend = createRecommender({ async *stream() {
    calls++;
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 } };
    yield { type: 'text-delta', index: 0, text: 'Incomplete suggestion' };
    if (calls === 1) yield { type: 'finish', reason: { kind, failure: { code: 'FIXTURE_FAILURE', message: 'Model did not finish' } } };
  } }, {}, { record: async record => { records.push(record); } });
  await assert.rejects(recommend(input), error => error.code === 'FIXTURE_FAILURE');
  assert.equal(records[0].status, kind === 'aborted' ? 'cancelled' : 'failed');
  assert.equal(records[0].usage.totalTokens, 12);
  assert.equal(await recommend(input), 'Incomplete suggestion');
  assert.equal(calls, 2);
});

test('Disabled generation never calls the model', async () => {
  const recommend = createRecommender({ stream() { throw new Error('must not be called'); } }, { enabled: false });
  assert.equal(await recommend(input), '');
});

test('DeepSeek recommendations disable reasoning so the short budget produces visible text', async () => {
  const recommend = createRecommender({ async *stream(options) {
    assert.equal(options.reasoningEffort, 'off'); yield { type: 'text-delta', index: 0, text: '请举一个简单例子。' };
  } });
  assert.equal(await recommend({ ...input, provider: 'deepseek-account' }), '请举一个简单例子。');
});

test('Long context preserves the opening topic and final next step within a fixed budget', () => {
  const context = recommendationContext({ user: '问题开头' + '问'.repeat(2000) + '问题结尾',
    assistant: '回答主题' + '中'.repeat(12000) + '下一步请举例' });
  assert.equal(Array.from(context.user).length, CONTEXT_LIMITS.user);
  assert.equal(Array.from(context.assistant).length, CONTEXT_LIMITS.assistant);
  assert.ok(context.user.startsWith('问题开头')); assert.ok(context.user.endsWith('问题结尾'));
  assert.ok(context.assistant.startsWith('回答主题')); assert.ok(context.assistant.endsWith('下一步请举例'));
  assert.ok(context.assistant.includes('[中间略]'));
  assert.deepEqual(recommendationContext(context), context);
});

test('Fenced code is omitted locally while surrounding prose and inline code remain', () => {
  const text = '使用 `input`。\n```js\n' + 'console.log(1);\n'.repeat(1000) + '```\n下一步测试回车。\n~~~~python\nsecret code\n~~~~';
  assert.equal(compactContext(text, 1200), '使用 `input`。\n[代码略]\n下一步测试回车。\n[代码略]');
  assert.equal(compactContext('开头\n```js\n未闭合代码', 1200), '开头\n[代码略]');
  assert.equal(compactContext('```js\n~~~\n仍为代码\n```\n结尾', 1200), '[代码略]\n结尾');
});

test('Unicode compression preserves whole emoji and a short reply stays intact', () => {
  const text = compactContext('😀'.repeat(3000), 400);
  assert.equal(Array.from(text).length, 400);
  assert.equal(text.includes('\uFFFD'), false);
  assert.equal(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(text), false);
  assert.equal(compactContext(input.assistant, 1200), input.assistant);
});

test('Host re-bounds legacy input and enforces the smaller actual model payload', async () => {
  let options;
  const recommend = createRecommender({ async *stream(value) {
    options = value; yield { type: 'text-delta', index: 0, text: '请演示下一步。' };
  } });
  await recommend({ ...input, user: '问'.repeat(2000), assistant: '答'.repeat(12000) });
  const context = JSON.parse(options.messages[0].content[0].text);
  assert.equal(Array.from(context.问题).length, 400); assert.equal(Array.from(context.回答).length, 1200);
  assert.ok(options.system.length < 150); assert.equal(options.maxTokens, 96);
  assert.ok(options.messages[0].content[0].text.length + options.system.length < 1800);
});
