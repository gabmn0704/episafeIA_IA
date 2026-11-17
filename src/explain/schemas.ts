import { z } from 'zod';

const level = z.enum(['low', 'moderate', 'high', 'critical']);

const riskPayload = z.object({
  type: z.literal('risk'),
  risk: z.object({
    score: z.number().min(0).max(100),
    level,
    factors: z
      .array(
        z.object({
          name: z.string().max(80),
          impact: z.number(),
          direction: z.enum(['increases', 'decreases']),
          detail: z.string().max(300).optional(),
        }),
      )
      .max(12)
      .default([]),
  }),
});

const insightPayload = z.object({
  type: z.literal('insight'),
  insight: z.object({
    kind: z.string().max(60),
    title: z.string().max(200),
    body: z.string().max(1200),
    confidence: z.number().min(0).max(1).optional(),
  }),
});

const wearablePayload = z.object({
  type: z.literal('wearable'),
  anomaly: z.object({
    kind: z.enum(['tachycardia', 'motion_convulsive', 'hr_anomaly', 'fall']),
    confidence: z.number().min(0).max(1),
    detail: z.string().max(400).optional(),
  }),
});

export const explainSchema = z.discriminatedUnion('type', [riskPayload, insightPayload, wearablePayload]);

export type ExplainInput = z.infer<typeof explainSchema>;

export interface ExplainResult {
  text: string;
  source: 'claude' | 'template';
  disclaimer: string;
  model?: string;
}
