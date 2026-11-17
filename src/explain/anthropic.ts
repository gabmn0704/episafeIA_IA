import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** Minimal seam so tests never touch the network. */
export interface TextModel {
  readonly name: string;
  complete(system: string, user: string, signal?: AbortSignal): Promise<string>;
}

export function createAnthropicModel(apiKey: string, model = DEFAULT_MODEL): TextModel {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 15_000 });
  return {
    name: model,
    async complete(system, user, signal) {
      const res = await client.messages.create(
        {
          model,
          max_tokens: 400,
          system,
          messages: [{ role: 'user', content: user }],
        },
        { signal },
      );
      return res.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim();
    },
  };
}
