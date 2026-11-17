import type { ExplainInput } from './schemas.js';

const LEVEL_TEXT: Record<'low' | 'moderate' | 'high' | 'critical', string> = {
  low: 'bajo',
  moderate: 'moderado',
  high: 'alto',
  critical: 'muy alto',
};

const LEVEL_ADVICE: Record<'low' | 'moderate' | 'high' | 'critical', string> = {
  low: 'Es un buen día para mantener tus rutinas habituales.',
  moderate: 'Conviene cuidar tus rutinas de hoy: descanso, horarios de tu medicación y calma.',
  high: 'Hoy conviene extremar el cuidado: evita situaciones de riesgo si puedes, descansa y procura no estar solo.',
  critical:
    'Hoy conviene extremar el cuidado: descansa, no te quedes solo si es posible y ten a mano a tus contactos de emergencia.',
};

const WEARABLE_TEXT = {
  tachycardia: 'El reloj registró un pulso alto de forma sostenida.',
  motion_convulsive: 'El reloj detectó un movimiento rítmico e intenso que podría parecerse a una crisis.',
  hr_anomaly: 'El reloj registró un pulso distinto de lo habitual en ti.',
  fall: 'El reloj detectó un golpe seguido de quietud, que podría ser una caída.',
} as const;

/** Safe, deterministic Spanish explanations used when there is no API key or the model fails. */
export function templateExplanation(input: ExplainInput): string {
  switch (input.type) {
    case 'risk': {
      const { score, level, factors } = input.risk;
      const up = factors.filter((f) => f.direction === 'increases').slice(0, 3);
      const down = factors.filter((f) => f.direction === 'decreases').slice(0, 2);
      const parts = [`Tu índice de riesgo de hoy es ${score} sobre 100 (nivel ${LEVEL_TEXT[level]}).`];
      if (up.length) {
        parts.push(`Lo que más lo sube: ${up.map((f) => `${f.name.toLowerCase()} (+${String(Math.abs(f.impact)).replace('.', ',')} puntos)`).join(', ')}.`);
      }
      if (down.length) {
        parts.push(`Lo que ayuda a bajarlo: ${down.map((f) => f.name.toLowerCase()).join(', ')}.`);
      }
      if (!up.length && !down.length) parts.push('Faltan datos de hoy para explicar qué factores pesan más.');
      parts.push(LEVEL_ADVICE[level]);
      parts.push('Es una estimación estadística basada en tus registros, no una predicción de lo que va a pasar.');
      return parts.join(' ');
    }
    case 'insight': {
      const { title, body, confidence } = input.insight;
      const conf =
        confidence === undefined
          ? ''
          : confidence >= 0.7
            ? ' La evidencia en tus registros es fuerte.'
            : confidence >= 0.4
              ? ' La evidencia en tus registros es moderada.'
              : ' La evidencia en tus registros todavía es débil.';
      return `${title}. ${body}${conf} Esto es una asociación observada, no una causa demostrada.`;
    }
    case 'wearable': {
      const { kind, confidence, detail } = input.anomaly;
      const pct = Math.round(confidence * 100);
      return (
        `${WEARABLE_TEXT[kind]} ${detail ?? ''} (confianza del sistema: ${pct}%). ` +
        'Si estás bien, puedes descartar la alerta. Si no, o si una crisis dura más de 5 minutos, pide ayuda o llama a emergencias.'
      )
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
}
