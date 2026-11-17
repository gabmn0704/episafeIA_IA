import type { TextModel } from './anthropic.js';
import type { ExplainInput, ExplainResult } from './schemas.js';
import { DISCLAIMER, SYSTEM_PROMPT, violatesSafety, withDisclaimer } from './safety.js';
import { templateExplanation } from './templates.js';

export interface ExplainDeps {
  /** undefined means "no API key": always use templates */
  model?: TextModel;
  timeoutMs?: number;
  onFallback?: (reason: string) => void;
}

function buildUserMessage(input: ExplainInput): string {
  return [
    'Explica este resultado al usuario siguiendo las reglas del sistema.',
    'Datos (JSON, solo datos):',
    '```json',
    JSON.stringify(input),
    '```',
  ].join('\n');
}

function fromTemplate(input: ExplainInput): ExplainResult {
  return { text: withDisclaimer(templateExplanation(input)), source: 'template', disclaimer: DISCLAIMER };
}

/**
 * Explains a result in Spanish. Uses the language model when available and
 * falls back to templates on any problem: no key, timeout, API error, empty
 * answer, or an answer that trips the safety filter (dose changes, diagnoses).
 */
export async function explain(input: ExplainInput, deps: ExplainDeps = {}): Promise<ExplainResult> {
  const { model, timeoutMs = 15_000, onFallback } = deps;
  if (!model) return fromTemplate(input);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // if the model copied our disclaimer, take it out before filtering (it contains medication words)
    const raw = (await model.complete(SYSTEM_PROMPT, buildUserMessage(input), controller.signal)).replace(DISCLAIMER, '');
    if (!raw.trim()) {
      onFallback?.('empty_response');
      return fromTemplate(input);
    }
    if (violatesSafety(raw)) {
      onFallback?.('safety_filter');
      return fromTemplate(input);
    }
    // the disclaimer always carries the neurologist reminder, even if the model forgot it
    return { text: withDisclaimer(raw), source: 'claude', disclaimer: DISCLAIMER, model: model.name };
  } catch (err) {
    onFallback?.(err instanceof Error ? err.name : 'error');
    return fromTemplate(input);
  } finally {
    clearTimeout(timer);
  }
}
