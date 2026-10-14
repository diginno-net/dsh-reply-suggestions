import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function mountClient(initialInput = {}) {
  let cursor = 0; let dirty = false; let component; let props; let tree;
  const hooks = []; let effects = []; const timers = new Map(); let timerId = 0;
  const pending = []; const attributes = new Map(); const listeners = new Map();
  const rect = { top: 100, left: 100, width: 500 };
  const editor = {
    getBoundingClientRect: () => rect,
    getAttribute: name => name === 'contenteditable' ? 'true' : null,
    addEventListener(name, fn) { const values = listeners.get(name) ?? new Set(); values.add(fn); listeners.set(name, values); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
  };
  const overlay = { getBoundingClientRect: () => ({ top: 92, left: 100 }) };
  const card = { querySelector: selector => selector.includes('data-composer-input') ? editor : null, getBoundingClientRect: () => rect,
    setAttribute: (name, value) => attributes.set(name, value), removeAttribute: name => attributes.delete(name) };
  const anchor = { closest: name => name === '[data-composer-card]' ? card : null };
  const React = {
    createElement(type, values, ...children) { if (values?.ref) values.ref.current = anchor; return { type, props: values, children }; },
    useRef(value) { const i = cursor++; return hooks[i] ??= { current: value }; },
    useState(initial) {
      const i = cursor++; if (!hooks[i]) hooks[i] = { value: initial };
      return [hooks[i].value, value => { const next = typeof value === 'function' ? value(hooks[i].value) : value;
        if (!Object.is(next, hooks[i].value)) { hooks[i].value = next; dirty = true; } }];
    },
    useEffect: effectHook,
    useLayoutEffect: effectHook,
  };
  function effectHook(fn, deps) {
    const i = cursor++; const previous = hooks[i];
    if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
      hooks[i] = { deps, cleanup: previous?.cleanup };
      effects.push(() => { hooks[i].cleanup?.(); hooks[i].cleanup = fn(); });
    }
  }
  let exports;
  const document = { head: { appendChild() {} }, createElement: () => ({ remove() {} }) };
  const sandbox = {
    window: { __ModuleLoader__: { load({ factory }) { exports = factory(name => { assert.equal(name, 'react'); return React; }); } } },
    document, AbortController, console,
    getComputedStyle: () => ({ paddingLeft: '14px', paddingRight: '14px', paddingTop: '0px', font: '14px Arial', lineHeight: '24px' }),
    ResizeObserver: class { observe() {} disconnect() {} }, MutationObserver: class { observe() {} disconnect() {} },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), sandbox);
  const ctx = {
    remote: { async $mount(value) { assert.equal(value.descriptors[0].method, 'recommend'); },
      replySuggestions: { recommend(input, signal) { return new Promise(resolve => pending.push({ input, signal, resolve })); } } },
    effect(fn) { return fn(); },
    inject(names, fn) { assert.deepEqual(Array.from(names), ['remote.replySuggestions']); return fn(ctx); },
    get(name) { assert.equal(name, 'remote.replySuggestions'); return ctx.remote.replySuggestions; },
    slots: { inject(name, fn) { assert.equal(name, 'conversation.input.overlay'); return fn(); },
      register(options, value) { component = value; props = options.inject(); } },
  };
  await exports.apply(ctx);
  const state = { sessionId: 'a', running: false, removed: false, input: { phase: 'plain', draft: '', draftRev: 0, attachmentIds: [], occurrences: [], queue: [], ...initialInput },
    nodes: [{ kind: 'assistant', seq: 1, messageId: 'answer-a', blocks: [{ kind: 'text', text: '这是一条完整回答。' }] }],
    modelSelection: { next: { provider: 'p', model: 'm' } } };
  let inserted = 0;
  function flush() {
    let count = 0;
    do {
      if (++count > 20) throw new Error('render did not settle');
      dirty = false; cursor = 0; effects = [];
      tree = component({ ...props, sessionId: state.sessionId,
        useInput: fn => fn(state.input), useSession: fn => fn(state),
        useProjection: (key, fn) => { assert.equal(key, 'modelSelection'); return fn(state.modelSelection); },
        useConversation: fn => fn({ views: { get: () => ({ legacy: { nodes: state.nodes } }) } }),
        inputActions: { captureInsertion: () => ({ start: 0, end: 0, draftRev: state.input.draftRev }),
          insertText(text) { inserted++; state.input = { ...state.input, draft: text, draftRev: state.input.draftRev + 1 }; dirty = true; return true; },
        },
      });
      for (const effect of effects) effect();
    } while (dirty);
  }
  function fireTimers() { const values = [...timers.values()]; timers.clear(); values.forEach(fn => fn()); }
  function key(props = {}) {
    const event = { key: 'Enter', prevented: false, stopImmediatePropagation() {}, preventDefault() { this.prevented = true; }, ...props };
    for (const fn of listeners.get('keydown') ?? []) fn(event);
    return event;
  }
  flush();
  return { state, pending, flush, fireTimers, key, attributes, hooks,
    get tree() { return tree; }, get inserted() { return inserted; },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); }, listeners };
}

test('Actual client bundle mounts a ghost, fills through draft actions, then restores the placeholder', async () => {
  const ui = await mountClient(); ui.fireTimers(); assert.equal(ui.pending.length, 1);
  ui.pending[0].resolve({ ok: true, value: '请给我一个具体示例。' });
  await new Promise(resolve => setImmediate(resolve)); ui.flush();
  assert.equal(ui.attributes.has('data-reply-suggestion-active'), true);
  assert.equal(ui.tree.children[0].children[0], '请给我一个具体示例。');
  assert.equal(ui.key().prevented, true); ui.flush();
  assert.equal(ui.state.input.draft, '请给我一个具体示例。'); assert.equal(ui.inserted, 1);
  assert.equal(ui.attributes.has('data-reply-suggestion-active'), false);
  ui.unmount(); assert.equal([...ui.listeners.values()].every(value => value.size === 0), true);
});

test('A late model response after a session switch never appears in the other session', async () => {
  const ui = await mountClient(); ui.fireTimers();
  ui.state.sessionId = 'b'; ui.state.nodes = [{ ...ui.state.nodes[0], messageId: 'answer-b', seq: 2 }]; ui.flush();
  assert.equal(ui.pending[0].signal.aborted, true); ui.fireTimers();
  ui.pending[0].resolve({ ok: true, value: '旧会话的推荐。' });
  await new Promise(resolve => setImmediate(resolve)); ui.flush();
  assert.equal(ui.attributes.has('data-reply-suggestion-active'), false);
  ui.pending[1].resolve({ ok: true, value: '新会话的推荐。' });
  await new Promise(resolve => setImmediate(resolve)); ui.flush();
  assert.equal(ui.tree.children[0].children[0], '新会话的推荐。'); ui.unmount();
});

test('Drafts, attachments, references and queues defer the model request until the composer is empty', async () => {
  for (const input of [{ draft: '我已经在写问题' }, { attachmentIds: ['image'] }, { occurrences: [{}] }, { queue: [{}] }, { phase: 'claimed' }]) {
    const ui = await mountClient(input); ui.fireTimers(); assert.equal(ui.pending.length, 0);
    Object.assign(ui.state.input, { draft: '', attachmentIds: [], occurrences: [], queue: [], phase: 'plain' });
    ui.flush(); ui.fireTimers(); assert.equal(ui.pending.length, 1); ui.unmount();
  }
});

test('Typing during the debounce avoids a call; typing after dispatch reuses the result without a second call', async () => {
  const ui = await mountClient();
  ui.state.input.draft = '自己的问题'; ui.flush(); ui.fireTimers(); assert.equal(ui.pending.length, 0);
  ui.state.input.draft = ''; ui.flush(); ui.fireTimers(); assert.equal(ui.pending.length, 1);
  ui.state.input.draft = '继续编辑'; ui.flush(); assert.equal(ui.pending[0].signal.aborted, false);
  ui.pending[0].resolve({ ok: true, value: '请给我一个实例。' });
  await new Promise(resolve => setImmediate(resolve)); ui.flush();
  assert.equal(ui.attributes.has('data-reply-suggestion-active'), false);
  ui.state.input.draft = ''; ui.flush(); ui.fireTimers(); assert.equal(ui.pending.length, 1);
  assert.equal(ui.tree.children[0].children[0], '请给我一个实例。');
  assert.equal(ui.key({ key: 'Escape' }).prevented, true); ui.flush(); ui.fireTimers();
  assert.equal(ui.attributes.has('data-reply-suggestion-active'), false); assert.equal(ui.pending.length, 1); ui.unmount();
});
