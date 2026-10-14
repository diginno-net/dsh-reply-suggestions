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
