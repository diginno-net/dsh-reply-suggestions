window.__ModuleLoader__.load({id:'dsh-reply-suggestions',factory:function(require){
'use strict';
var module={exports:{}};var exports=module.exports;
const PACKAGE = 'dsh-reply-suggestions';
const SERVICE = 'replySuggestions';
const CONTEXT_LIMITS = { user: 400, assistant: 1200 };

// Keep the topic and the closing next step; omit code locally, without a summary model call.
function compactContext(text, limit) {
  const lines = text.split(/\r?\n/);
  const kept = [];
  let fence = null;
  for (const line of lines) {
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (marker) { fence = marker[1]; kept.push('[代码略]'); }
    else kept.push(line);
  }
  const characters = Array.from(kept.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim());
  if (characters.length <= limit) return characters.join('');
  const separator = '\n[中间略]\n';
  const available = limit - separator.length;
  const head = Math.floor(available / 3);
  return characters.slice(0, head).join('') + separator + characters.slice(-(available - head)).join('');
}

function recommendationContext(input) {
  return { user: compactContext(input.user, CONTEXT_LIMITS.user),
    assistant: compactContext(input.assistant, CONTEXT_LIMITS.assistant) };
}

function validateInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid recommendation input');
  const allowed = new Set(['sessionId', 'replyId', 'provider', 'model', 'user', 'assistant']);
  if (Object.keys(value).some(key => !allowed.has(key))) throw new TypeError('Unknown recommendation field');
  for (const key of allowed) {
    if (typeof value[key] !== 'string') throw new TypeError(`Missing ${key}`);
  }
  for (const key of ['sessionId', 'replyId', 'provider', 'model']) {
    if (!value[key].trim() || value[key].length > 512) throw new TypeError(`Invalid ${key}`);
  }
  if (!value.assistant.trim() || value.assistant.length > 12000 || value.user.length > 2000) throw new TypeError('Invalid context size');
  return { ...value };
}

function normalizeSuggestion(value) {
  if (typeof value !== 'string') return '';
  let text = value.trim();
  if (text.startsWith('{')) {
    try { text = JSON.parse(text).suggestion ?? ''; } catch { return ''; }
  }
  if (typeof text !== 'string') return '';
  text = text.replace(/^```(?:json|text)?\s*|\s*```$/g, '').replace(/^["“]|["”]$/g, '').trim();
  if (!text || /[\r\n]/.test(text) || text.length > 100 || text.startsWith('/')) return '';
  return text;
}

function descriptor() {
  return {
    id: `${PACKAGE}#recommend`, service: SERVICE, namespace: SERVICE, method: 'recommend',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'input', wire: 'input', source: 'json', codec: {
      mode: 'strict', typeSymbol: `${PACKAGE}#Input`, create: () => ({ parse: validateInput }),
    } }],
    cancellation: { parameter: 'signal' },
    result: { mode: 'strict', typeSymbol: `${PACKAGE}#Suggestion`, create: () => ({
      parse: value => { if (typeof value !== 'string' || value.length > 100) throw new TypeError('Invalid suggestion'); return value; },
    }) },
  };
}

function selectReply(nodes, sessionId, selectedModel) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node.kind === 'user' || node.kind === 'steering') return null;
    if (node.kind !== 'assistant') continue;
    if (node.interrupted || node.blocks.some(block => block.kind === 'tool-call')) return null;
    const assistant = node.blocks.filter(block => block.kind === 'text').map(block => block.text).join('\n').trim();
    const model = node.requestConfig ?? node.providerMetadata ?? selectedModel;
    if (!assistant || !model?.provider || !model?.model) return null;
    let user = '';
    for (let j = i - 1; j >= 0; j--) {
      if (nodes[j].kind === 'user' || nodes[j].kind === 'steering') {
        user = nodes[j].content.filter(block => block.type === 'text').map(block => block.text).join('\n');
        break;
      }
    }
    return { sessionId, replyId: String(node.messageId ?? node.seq), provider: model.provider, model: model.model,
      ...recommendationContext({ assistant, user }) };
  }
  return null;
}

function canAccept(state) {
  return Boolean(state?.suggestion && !state.running && !state.removed && state.editable
    && state.input?.phase === 'plain' && state.input.draft === ''
    && state.input.attachmentIds.length === 0 && state.input.occurrences.length === 0
    && state.input.queue.length === 0);
}

function installAcceptance(editor, read, accept, dismiss, now = () => Date.now()) {
  let composing = false;
  let imeUntil = 0;
  let acceptedUntilKeyUp = false;
  const swallow = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const down = event => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    if (event.isComposing || composing || event.keyCode === 229 || now() < imeUntil) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Enter' && acceptedUntilKeyUp && event.repeat) { swallow(event); return; }
    if (!canAccept(read())) return;
    if (event.key === 'Escape') { swallow(event); dismiss(); return; }
    if (event.repeat) return;
    // Consume before changing the draft: the native submit handler must never see this Enter.
    swallow(event);
    acceptedUntilKeyUp = true;
    accept();
  };
  const up = event => { if (event.key === 'Enter') acceptedUntilKeyUp = false; };
  const start = () => { composing = true; };
  const end = () => { composing = false; imeUntil = now() + 50; };
  editor.addEventListener('keydown', down, true);
  editor.addEventListener('keyup', up, true);
  editor.addEventListener('compositionstart', start, true);
  editor.addEventListener('compositionend', end, true);
  return () => {
    editor.removeEventListener('keydown', down, true);
    editor.removeEventListener('keyup', up, true);
    editor.removeEventListener('compositionstart', start, true);
    editor.removeEventListener('compositionend', end, true);
  };
}

const { createElement: h, useEffect, useLayoutEffect, useRef, useState } = require('react');

function GhostReply({ sessionId, useInput, useSession, useConversation, useProjection, inputActions, generate }) {
  const input = useInput(value => value);
  const running = useSession(value => value.running);
  const removed = useSession(value => value.removed);
  const selectedModel = useProjection('modelSelection', value => value?.next ?? value?.lastUsed);
  const candidate = useConversation(value => selectReply(value.views.get('chat')?.legacy.nodes ?? [], sessionId, selectedModel),
    (a, b) => a?.replyId === b?.replyId && a?.assistant === b?.assistant && a?.user === b?.user && a?.provider === b?.provider && a?.model === b?.model);
  const [suggestion, setSuggestion] = useState('');
  const [dismissed, setDismissed] = useState(null);
  const [geometry, setGeometry] = useState(null);
  const anchor = useRef(null);
  const live = useRef(null);
  const request = useRef(null);
  const replyKey = candidate ? JSON.stringify([sessionId, candidate.replyId, candidate.provider, candidate.model]) : null;
  const [resultKey, setResultKey] = useState(null);
  const available = canAccept({ suggestion: 'ready', input, running, removed, editable: geometry?.editable });
  const visible = resultKey === replyKey && dismissed !== replyKey && canAccept({
    suggestion, input, running, removed, editable: geometry?.editable,
  });
  live.current = { suggestion: visible ? suggestion : '', input, running, removed,
    editable: geometry?.editable, inputActions, replyKey };

  useEffect(() => {
    setSuggestion(''); setResultKey(null);
    if (!candidate || running || removed) return;
    const controller = new AbortController();
    const job = { controller, candidate, replyKey, started: false };
    request.current = job;
    return () => { controller.abort(); if (request.current === job) request.current = null; };
  }, [sessionId, replyKey, candidate?.assistant, candidate?.user, running, removed, generate]);

  useEffect(() => {
    const job = request.current;
    if (!available || dismissed === replyKey || !job || job.started) return;
    // Wait for a usable empty composer. Typing cancels only the timer, never a paid request
    // already in flight; that result can still be used if the draft is cleared later.
    const timer = setTimeout(() => {
      if (request.current !== job || job.started || job.controller.signal.aborted) return;
      job.started = true;
      generate(job.candidate, job.controller.signal).then(text => {
        if (!job.controller.signal.aborted && request.current === job) { setSuggestion(normalizeSuggestion(text)); setResultKey(job.replyKey); }
      }).catch(error => {
        if (!job.controller.signal.aborted) console.warn('[reply-suggestions] Recommendation unavailable:', error?.message ?? 'unknown error');
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [sessionId, replyKey, candidate?.assistant, candidate?.user, running, removed, generate, available, dismissed]);

  useLayoutEffect(() => {
    const card = anchor.current?.closest('[data-composer-card]');
    // Lexical sets contenteditable after child layout effects; the render-time marker exists earlier.
    const editor = card?.querySelector('[data-composer-input], [contenteditable]');
    const overlay = anchor.current?.closest('[data-composer-overlay]') ?? card;
    if (!card || !editor || !overlay) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const rect = editor.getBoundingClientRect();
      const origin = overlay.getBoundingClientRect();
      const css = getComputedStyle(editor);
      const next = { left: rect.left - origin.left + parseFloat(css.paddingLeft || '0'),
        top: rect.top - origin.top + parseFloat(css.paddingTop || '0'),
        width: Math.max(0, rect.width - parseFloat(css.paddingLeft || '0') - parseFloat(css.paddingRight || '0')),
        font: css.font, lineHeight: css.lineHeight,
        editable: editor.getAttribute('contenteditable') === 'true' && editor.getAttribute('aria-disabled') !== 'true' };
      setGeometry(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
    };
    measure();
    const resize = new ResizeObserver(measure); resize.observe(editor); resize.observe(card);
    const mutation = new MutationObserver(measure); mutation.observe(editor, { attributes: true });
    const uninstall = installAcceptance(editor, () => ({ ...live.current,
      editable: editor.getAttribute('contenteditable') === 'true' && editor.getAttribute('aria-disabled') !== 'true',
    }), () => {
      const state = live.current;
      // Revision-guarded insertion preserves undo and refuses a concurrent draft edit.
      const span = state.inputActions.captureInsertion();
      if (span.start !== 0 || span.end !== 0 || span.draftRev !== state.input.draftRev) return;
      if (state.inputActions.insertText(state.suggestion, span)) {
        setDismissed(state.replyKey);
      }
    }, () => setDismissed(live.current.replyKey));
    return () => { disposed = true; resize.disconnect(); mutation.disconnect(); uninstall(); };
  }, [sessionId]);

  useLayoutEffect(() => {
    const card = anchor.current?.closest('[data-composer-card]');
    if (!card || !visible) return;
    card.setAttribute('data-reply-suggestion-active', '');
    return () => { card.removeAttribute('data-reply-suggestion-active'); };
  }, [visible, sessionId]);

  return h('span', { ref: anchor, 'data-reply-suggestion-plugin': '' },
    visible && h('span', {
      className: 'dsh-reply-suggestion-ghost', 'aria-hidden': true,
      style: { position: 'absolute', pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        left: geometry.left, top: geometry.top, width: geometry.width, font: geometry.font, lineHeight: geometry.lineHeight,
        color: 'var(--dsw-alias-label-secondary, #999)', opacity: 0.55 },
    }, suggestion),
    h('span', { className: 'dsh-reply-suggestion-sr', role: 'status', 'aria-live': 'polite' },
      visible ? `推荐回复：${suggestion} 按 Enter 填入，按 Escape 隐藏。` : ''));
}

exports.inject = ['slots', 'remote', 'uiConversation'];
exports.apply = async function apply(ctx) {
  await ctx.remote.$mount({ package: PACKAGE, descriptors: [descriptor()] });
  ctx.effect(() => {
    const style = document.createElement('style');
    style.textContent = `[data-reply-suggestion-active] [data-composer-placeholder]{visibility:hidden}
      .dsh-reply-suggestion-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`;
    document.head.appendChild(style);
    return () => style.remove();
  });
  ctx.inject(['remote.replySuggestions'], scope => {
    const remote = scope.get('remote.replySuggestions');
    const generate = async (input, signal) => {
      const result = await remote.recommend(input, signal);
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    };
    scope.slots.inject('conversation.input.overlay', () => scope.slots.register({
      name: 'conversation.input.overlay', id: PACKAGE,
      inject: () => ({ generate }),
    }, GhostReply));
  });
};

return module.exports;
}});
