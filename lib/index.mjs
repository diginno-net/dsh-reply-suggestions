import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { PACKAGE, SERVICE, descriptor } from './common.mjs';
import { createRecommender } from './engine.mjs';

export const name = PACKAGE;
export const inject = ['llm', 'typert'];

class ReplySuggestions extends TypertRemoteService {
  constructor(ctx, config) {
    super(ctx, SERVICE);
    this.generate = createRecommender(ctx.llm, config);
  }
  async recommend(input, signal) { return this.generate(input, signal); }
}

export function apply(ctx, config = {}) {
  if (config.timeoutMs !== undefined && (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 60000)) {
    throw new TypeError('timeoutMs must be an integer between 1000 and 60000');
  }
  for (const field of ['provider', 'model']) {
    if (config[field] !== undefined && (typeof config[field] !== 'string' || !config[field].trim())) throw new TypeError(`${field} must be a nonempty string`);
  }
  ctx.plugin(ReplySuggestions, { ...config });
  ctx.typert.register({ package: PACKAGE, face: 'host', schemas: [],
    model: { services: [], events: [], objects: [] }, invocations: [descriptor()] });
}
