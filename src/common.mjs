export const PACKAGE = 'dsh-reply-suggestions';
export const SERVICE = 'replySuggestions';
export const CONTEXT_LIMITS = { user: 400, assistant: 1200 };

// Keep the topic and the closing next step; omit code locally, without a summary model call.
export function compactContext(text, limit) {
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

export function recommendationContext(input) {
  return { user: compactContext(input.user, CONTEXT_LIMITS.user),
    assistant: compactContext(input.assistant, CONTEXT_LIMITS.assistant) };
}

export function validateInput(value) {
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

export function normalizeSuggestion(value) {
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

export function descriptor() {
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

export function selectReply(nodes, sessionId, selectedModel) {
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

export function canAccept(state) {
  return Boolean(state?.suggestion && !state.running && !state.removed && state.editable
    && state.input?.phase === 'plain' && state.input.draft === ''
    && state.input.attachmentIds.length === 0 && state.input.occurrences.length === 0
    && state.input.queue.length === 0);
}

export function installAcceptance(editor, read, accept, dismiss, now = () => Date.now()) {
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
