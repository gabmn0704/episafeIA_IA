# episafeIA_IA

Motor de IA (TypeScript) de **EpiSafe IA**, sistema de prevención y asistencia para personas con epilepsia. Es un servicio Express que escucha en `http://localhost:5000` y que consume la API (`EpisafeIa_back`) por HTTP. No tiene base de datos: recibe los datos en cada petición y responde con análisis.

> **Aviso importante.** Este servicio no es un dispositivo médico, no diagnostica y no recomienda cambios de medicación. Sus resultados son estimaciones estadísticas sobre los registros de una sola persona y deben comentarse siempre con el neurólogo.

## Qué hace

| Endpoint | Descripción |
| --- | --- |
| `POST /analyze/patterns` | Busca desencadenantes en crisis, registros diarios y medicación. |
| `POST /risk/score` | Índice de riesgo diario 0-100 con explicación por factor. Entrena un modelo personal si hay historial. |
| `POST /risk/train` | Entrena y devuelve los pesos (para que la API los guarde y los reutilice en `/risk/score`). |
| `POST /wearable/evaluate` | Evalúa una ventana de muestras del reloj: taquicardia, pulso anómalo, movimiento convulsivo y caídas. |
| `POST /explain` | Explica un resultado en español (Claude si hay `ANTHROPIC_API_KEY`, plantillas si no). |
| `GET /health` | Estado del servicio y modo de explicación (`claude` o `template`). |

Todas las entradas se validan con **zod** y aceptan `camelCase` o `snake_case` (las filas de PostgreSQL pueden enviarse tal cual, incluidos los `numeric` como texto). Los errores usan el formato común `{ "error": { "code", "message", "details" } }`.

## Puesta en marcha

```bash
npm install
cp .env.example .env       # opcional; todo tiene valores por defecto
npm run dev                # http://localhost:5000
```

Otros scripts: `npm run check` (typecheck + eslint + tests), `npm test`, `npm run build`, `npm start`.

Docker:

```bash
docker build -t episafe-ia .
docker run --rm -p 5000:5000 --env-file .env episafe-ia
```

### Variables de entorno

| Variable | Por defecto | Uso |
| --- | --- | --- |
| `PORT` | `5000` | Puerto HTTP. |
| `CORS_ORIGINS` | `http://localhost:4000,http://localhost:5173` | Orígenes permitidos (`*` solo en desarrollo). |
| `INTERNAL_API_KEY` | vacío | Si se define (mínimo 16 caracteres), toda petición salvo `/health` debe llevar el encabezado `x-api-key`. |
| `ANTHROPIC_API_KEY` | vacío | Activa `/explain` con Claude. Sin ella se usan plantillas. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Modelo usado por `/explain`. |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | `120` / `60000` | Límite de peticiones por IP. |
| `LOG_LEVEL` | `info` | Logs JSON por línea (nunca se registran cuerpos con datos de salud). |

Nunca subas `.env` al repositorio.

## Cómo funciona cada parte

### 1. Motor de patrones (`src/patterns`, `src/stats`)

Para cada día con registro se construye una observación: ¿hubo cada **factor** (menos de 5 h de sueño, estrés ≥ 8, cafeína ≥ 400 mg, alcohol ≥ 2 unidades, ánimo bajo, sin ejercicio, dosis olvidadas)? y ¿hubo **crisis** ese día (según la zona horaria del usuario)? Con eso:

1. Se arma una **tabla de contingencia 2x2** por factor (expuesto/no expuesto x crisis/no crisis).
2. Se calcula la probabilidad de crisis en cada grupo y el **lift** (riesgo relativo) con corrección de Haldane (+0,5) para que sea estable cuando una celda está vacía.
3. Se calculan **intervalos de Wilson al 95 %** para la proporción de crisis que ocurrieron en días expuestos (adecuados para muestras pequeñas) y un intervalo log para el lift.
4. Un factor solo se reporta si pasa **todos** los umbrales (`src/patterns/thresholds.ts`): al menos 14 días registrados y 3 crisis en total, al menos 3 crisis en días expuestos, al menos 5 días expuestos, lift ≥ 1,5 y límite inferior del IC del lift > 1. Si no hay datos suficientes, el servicio lo dice (`insufficient_data`) en vez de inventar nada.
5. Además: concentración **horaria** de las crisis (Wilson contra el 25 % esperado si fueran uniformes), **desencadenantes anotados** por la persona que se repiten, y **coocurrencia** de factores en días con crisis (solo entre factores que ya pasaron la prueba individual, para que el ruido no forme "patrones" por pares).
6. Los candidatos se ordenan con un **MinHeap acotado (top-k)** y se devuelven los mejores (6 por defecto, `maxInsights` hasta 20).

Ejemplo de salida: *"El 80 % de tus crisis (8 de 10) ocurrieron en días con menos de 5 horas de sueño (IC 95 %: 49 %-94 %). En esos días la frecuencia de crisis fue 12 veces la de los demás días… Es una asociación observada, no prueba que sea la causa."*

La confianza (0-1) combina el tamaño de la muestra (crisis en días expuestos) con la robustez del efecto (límite inferior del IC del lift).

### 2. Índice de riesgo diario (`src/risk`)

Es una **regresión logística escrita a mano**: `p = sigmoid(b + Σ wᵢ·xᵢ)`, y el índice es `round(100·p)`. Niveles: `low` < 25, `moderate` < 50, `high` < 75, `critical` ≥ 75.

- **Variables** (con signo: 0 es la referencia, positivo aumenta el riesgo): sueño (ref. 7,5 h), estrés (ref. 4/10), cafeína (ref. 200 mg), ejercicio (ref. 20 min), dosis olvidadas, pulso medio y variabilidad cardíaca frente a la base personal, e intensidad de movimiento. Lo que no se envía cuenta como "típico".
- **Prior clínico** (`src/risk/prior.ts`): pesos iniciales que reflejan el *orden de importancia* de precipitantes ampliamente descritos (privación de sueño, estrés, dosis olvidadas...). No son tamaños de efecto medidos.
- **Entrenamiento** (`src/risk/train.ts`): con al menos 30 días de historial, 5 días con crisis y 5 sin ella, se ajustan los pesos por **descenso de gradiente por lotes** sobre la pérdida logarítmica con **regularización L2 centrada en el prior**: con pocos datos los pesos casi no se mueven del prior, con más datos se acercan a lo que muestran los registros de esa persona. La fuerza de L2 baja al crecer el historial (`λ = 15/n`, entre 0,05 y 0,6). Si no hay datos suficientes se usa el prior y el servicio lo indica (`personalized: false`).
- **Explicación por factor**: para cada variable, `impact` es el cambio en puntos del índice atribuible a ella (`100·(p − sigmoid(z − wᵢxᵢ))`), con dirección (`increases`/`decreases`) y un texto de detalle. Se ordenan por magnitud.
- **Confianza**: 0,3 con solo el prior; sube con el historial (días y días con crisis) y baja si faltan datos de hoy.

### 3. Señales del reloj (`src/wearable`, `src/dsp`)

- **Taquicardia sostenida**: el pulso suavizado con **EWMA** (α = 0,3) se mantiene ≥ 120 lpm durante ≥ 30 s y ≥ 5 muestras. Un pico aislado no dispara nada. Con mucho movimiento a la vez (ejercicio) la confianza se reduce a la mitad.
- **Pulso anómalo**: **z-score robusto con MAD** (`(x − mediana) / (1,4826·MAD)`) del pulso reciente frente a una referencia (`baselineHr` o la primera mitad de la ventana); exige |z| ≥ 3,5 y al menos 15 lpm de diferencia.
- **Movimiento convulsivo**: con acelerómetro (ejes `ax/ay/az` o `accelMagnitude`, en g o m/s², se detecta solo) y ≥ 16 Hz de muestreo, una **DFT propia** (con ventana de Hann y sin componente continua) mide qué fracción de la energía cae en la banda **3-8 Hz**. Se exige ≥ 50 % de la energía en la banda y una amplitud RMS ≥ 0,25 g durante ≥ 3 s, para no confundir con caminar (~1-2 Hz) ni con ruido.
- **Caída**: impacto ≥ 2,5 g seguido de ≥ 2 s de quietud alrededor de 1 g.
- La ventana de entrada pasa por un **CircularBuffer** (conserva lo más reciente) y la respuesta incluye `notes` cuando un detector no pudo correr (sin acelerómetro, muestreo bajo).

### 4. `/explain` (`src/explain`)

Recibe un resultado (`{type: "risk" | "insight" | "wearable", ...}`) y devuelve `{ text, source, disclaimer, model? }`.

- Con `ANTHROPIC_API_KEY` usa el SDK `@anthropic-ai/sdk` y el modelo `claude-sonnet-5-5` con un prompt de sistema estricto: sin diagnósticos, sin recomendar medicación ni cambios de dosis, sin certezas sobre el futuro, y los datos entran como JSON que se trata solo como datos (defensa contra inyección de instrucciones).
- La respuesta pasa por un **filtro de seguridad** (cambios de dosis, diagnósticos, certezas). Si lo incumple, hay error, timeout (15 s) o respuesta vacía, se usa una **plantilla en español**.
- **Siempre** se añade el aviso de consultar al neurólogo y de no cambiar la medicación por cuenta propia.

### 5. Estructuras de datos propias (`src/structures`)

| Estructura | Uso real |
| --- | --- |
| `MinHeap` / `TopK` | Selección de los k mejores insights en O(n log k). |
| `Graph` | Grafo de coocurrencia de factores en días con crisis (aristas ponderadas, BFS, componentes). |
| `CircularBuffer` | Ventana acotada de muestras del reloj en `/wearable/evaluate`. |

## Límites del modelo (leer antes de confiar en un resultado)

- **Asociación no es causalidad.** Un patrón significa que en *los registros de esa persona* ciertas condiciones coincidieron con crisis más a menudo; no demuestra que las causen.
- **Muestras pequeñas.** Las crisis son eventos raros. Con pocas, los intervalos son anchos; por eso hay umbrales mínimos y a veces el resultado correcto es "faltan datos".
- **Comparaciones múltiples.** Se evalúan varios factores a la vez; aunque los umbrales son estrictos, un resultado aislado puede ser casualidad. La confianza y el IC deben leerse con ese sentido.
- **Sesgo del registro.** Solo se analizan los días registrados; si la persona registra más cuando le va mal, los resultados se sesgan. Los días sin dato de un factor se excluyen, no se cuentan como "no expuesto".
- **Umbrales fijos.** Los cortes (5 h de sueño, 400 mg de cafeína...) son valores razonables, no personalizados.
- **El prior no es evidencia clínica cuantitativa**, solo un punto de partida; el índice no es una probabilidad calibrada de crisis. Se evalúa con los mismos datos con los que se entrena (no hay validación externa), por lo que el modelo personal puede sobreajustar con historiales cortos (la L2 mitiga, no elimina).
- **Reloj:** los detectores son reglas heurísticas sin validación clínica; habrá falsos positivos (ejercicio, temblor voluntario, golpes) y falsos negativos (crisis sin convulsión rítmica, muestreo bajo, mala colocación). No sustituyen un dispositivo certificado ni la supervisión de una persona.
- **Modelo de lenguaje:** solo redacta lo que el sistema ya calculó; aun con el filtro puede equivocarse en el tono. Ante una emergencia, llama a los servicios de emergencia.

## Pruebas

```bash
npm test
```

Las pruebas **no llaman a APIs externas** (se bloquea `fetch` globalmente y `/explain` usa un modelo falso inyectado). Incluyen:

- **Datos sintéticos con correlación conocida** (`test/helpers/synthetic.ts`): solo el sueño < 5 h aumenta la probabilidad de crisis; el motor debe recuperarlo como principal desencadenante y no reportar cafeína, alcohol, dosis olvidadas ni ánimo (varias semillas), ni nada cuando no hay asociación.
- Entrenamiento con una verdad conocida distinta del prior (crisis causadas por estrés) que el modelo debe aprender.
- Señales sintéticas del reloj (5 Hz vs. caminar a 1,5 Hz, caídas, picos, taquicardia).
- Endpoints con supertest: validación, errores uniformes, clave de servicio, límite de peticiones y CORS.

## Estructura

```
src/
  app.ts, server.ts, config.ts   Express, arranque, entorno
  http/                          logger, errores, límite de peticiones, clave de servicio
  domain/                        esquemas zod y fechas por zona horaria
  stats/                         Wilson, contingencia, mediana/MAD, EWMA
  dsp/                           DFT, ventana de Hann, energía de banda
  structures/                    MinHeap/TopK, Graph, CircularBuffer
  patterns/                      motor de patrones
  risk/                          regresión logística, prior, entrenamiento, índice
  wearable/                      evaluación de señales del reloj
  explain/                       Claude, plantillas, filtro de seguridad
test/                            vitest (+ supertest)
```
