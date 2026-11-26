/**
 * Núcleo óptico do Mapping Planner.
 *
 * Unidades: metros, radianos, lumens, lux. Pixels em px.
 *
 * Modelo: pinhole (sem distorção). A "imagem" é o retângulo projetado num
 * plano perpendicular ao eixo da lente, à distância `distance` da lente.
 *
 * Convenção de lens shift (interna):
 *   shift.h / shift.v = deslocamento do CENTRO da imagem em relação ao eixo da
 *   lente, como fração da largura (h) ou altura (v) da imagem.
 *   0     → imagem centrada no eixo
 *   +0.5  → borda inferior (v) / esquerda (h) da imagem sobre o eixo
 *   Positivo = para cima (v) e para a direita (h), olhando na direção da projeção.
 * Use os conversores `shiftFrom*` para valores publicados pelos fabricantes.
 */

export interface Resolution {
  /** pixels na horizontal */
  width: number;
  /** pixels na vertical */
  height: number;
}

export interface Shift {
  h: number;
  v: number;
}

export interface Range {
  min: number;
  max: number;
}

export interface LensSpec {
  /** throw ratio mínimo (lente fixa: min = max) */
  throwRatio: Range;
  /** faixa de shift horizontal, na convenção interna */
  shiftH: Range;
  /** faixa de shift vertical, na convenção interna */
  shiftV: Range;
}

export interface Size2 {
  width: number;
  height: number;
}

/** Retângulo no plano da imagem, relativo ao eixo da lente (0,0). */
export interface Rect {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

export const NO_SHIFT: Readonly<Shift> = Object.freeze({ h: 0, v: 0 });

const DEG = 180 / Math.PI;
export const toDegrees = (rad: number): number => rad * DEG;
export const toRadians = (deg: number): number => deg / DEG;

function assertPositive(name: string, value: number): void {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new RangeError(`${name} deve ser um número positivo (recebido: ${value})`);
  }
}

// ---------------------------------------------------------------------------
// Throw ratio, distância e tamanho da imagem
// ---------------------------------------------------------------------------

/** Altura / largura da imagem (ex.: 1920×1080 → 0.5625). */
export function aspectRatio(res: Resolution): number {
  assertPositive("resolução.width", res.width);
  assertPositive("resolução.height", res.height);
  return res.height / res.width;
}

/** throw ratio = distância / largura da imagem */
export function throwRatioFor(distance: number, imageWidth: number): number {
  assertPositive("distância", distance);
  assertPositive("largura da imagem", imageWidth);
  return distance / imageWidth;
}

/** Distância necessária para uma largura de imagem. */
export function distanceForWidth(imageWidth: number, throwRatio: number): number {
  assertPositive("largura da imagem", imageWidth);
  assertPositive("throw ratio", throwRatio);
  return imageWidth * throwRatio;
}

/** Distância necessária para uma altura de imagem. */
export function distanceForHeight(imageHeight: number, throwRatio: number, res: Resolution): number {
  assertPositive("altura da imagem", imageHeight);
  return distanceForWidth(imageHeight / aspectRatio(res), throwRatio);
}

/** Tamanho da imagem num plano perpendicular ao eixo, à distância dada. */
export function imageSize(distance: number, throwRatio: number, res: Resolution): Size2 {
  assertPositive("distância", distance);
  assertPositive("throw ratio", throwRatio);
  const width = distance / throwRatio;
  return { width, height: width * aspectRatio(res) };
}

/** Faixa de largura de imagem que uma lente zoom alcança a uma distância. */
export function imageWidthRange(distance: number, lens: LensSpec): Range {
  return {
    min: distance / lens.throwRatio.max,
    max: distance / lens.throwRatio.min,
  };
}

/** Faixa de distância para obter uma largura de imagem com uma lente zoom. */
export function distanceRange(imageWidth: number, lens: LensSpec): Range {
  return {
    min: distanceForWidth(imageWidth, lens.throwRatio.min),
    max: distanceForWidth(imageWidth, lens.throwRatio.max),
  };
}

// ---------------------------------------------------------------------------
// Lens shift e frustum
// ---------------------------------------------------------------------------

/** Retângulo da imagem no plano à `distance`, considerando o shift. */
export function imageRect(
  distance: number,
  throwRatio: number,
  res: Resolution,
  shift: Shift = NO_SHIFT,
): Rect {
  const { width, height } = imageSize(distance, throwRatio, res);
  const cx = shift.h * width;
  const cy = shift.v * height;
  return {
    left: cx - width / 2,
    right: cx + width / 2,
    bottom: cy - height / 2,
    top: cy + height / 2,
  };
}

/**
 * Extensões do frustum no plano near (para câmera off-axis, ex.: Three.js
 * `camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far)`).
 */
export function frustumAtNear(
  near: number,
  throwRatio: number,
  res: Resolution,
  shift: Shift = NO_SHIFT,
): Rect {
  return imageRect(near, throwRatio, res, shift);
}

export interface FieldOfView {
  /** ângulos das bordas em relação ao eixo da lente (rad, com sinal) */
  left: number;
  right: number;
  bottom: number;
  top: number;
  /** abertura total (rad) */
  horizontal: number;
  vertical: number;
}

/** Ângulos de abertura da projeção. Independem da distância. */
export function fieldOfView(throwRatio: number, res: Resolution, shift: Shift = NO_SHIFT): FieldOfView {
  const r = imageRect(1, throwRatio, res, shift);
  const left = Math.atan(r.left);
  const right = Math.atan(r.right);
  const bottom = Math.atan(r.bottom);
  const top = Math.atan(r.top);
  return { left, right, bottom, top, horizontal: right - left, vertical: top - bottom };
}

/** Throw ratio equivalente a uma abertura horizontal simétrica (sem shift). */
export function throwRatioFromHorizontalFov(fov: number): number {
  if (!(fov > 0 && fov < Math.PI)) throw new RangeError(`FOV fora de (0, π): ${fov}`);
  return 1 / (2 * Math.tan(fov / 2));
}

// Conversores de shift publicados pelos fabricantes → convenção interna.

/** "±X% da imagem" (deslocamento do centro em % da altura/largura). */
export const shiftFromPercentOfImage = (percent: number): number => percent / 100;

/**
 * "±X% da meia-imagem" / "offset X%" — quando 100% significa que a borda da
 * imagem chega ao eixo da lente (equivale a 0.5 na convenção interna).
 */
export const shiftFromPercentOfHalfImage = (percent: number): number => percent / 200;

// ---------------------------------------------------------------------------
// Pixel, brilho e incidência
// ---------------------------------------------------------------------------

/** Tamanho de um pixel no plano perpendicular (m). Pixels quadrados assumidos. */
export function pixelSize(imageWidth: number, res: Resolution): number {
  assertPositive("largura da imagem", imageWidth);
  assertPositive("resolução.width", res.width);
  return imageWidth / res.width;
}

/** Pixels por metro no plano perpendicular. */
export function pixelDensity(imageWidth: number, res: Resolution): number {
  return 1 / pixelSize(imageWidth, res);
}

/**
 * Iluminância média (lux) sobre o plano perpendicular.
 * Estimativa: ignora perdas de lente, modo de imagem, uniformidade e
 * envelhecimento. Ver ESPECIFICACAO.md §4.4.
 */
export function illuminance(lumens: number, image: Size2): number {
  assertPositive("lumens", lumens);
  return lumens / (image.width * image.height);
}

/**
 * Luminância estimada (cd/m², "nits") de uma superfície difusa (Lambertiana):
 * L = E · ρ / π, com ρ = refletância (0–1) e ganho opcional da tela.
 */
export function luminance(lux: number, reflectance = 1, gain = 1): number {
  return (lux * reflectance * gain) / Math.PI;
}

export type Vec3 = readonly [number, number, number];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.sqrt(dot(a, a));

/**
 * Ângulo de incidência (rad) entre o raio de projeção e a normal da
 * superfície. 0 = frontal. Independe do sentido dos vetores.
 */
export function incidenceAngle(rayDirection: Vec3, surfaceNormal: Vec3): number {
  const l = len(rayDirection) * len(surfaceNormal);
  if (l === 0) throw new RangeError("vetor nulo");
  const c = Math.min(1, Math.abs(dot(rayDirection, surfaceNormal)) / l);
  return Math.acos(c);
}

export interface SurfacePoint {
  /** iluminância na superfície inclinada (lux) */
  lux: number;
  /** maior dimensão do pixel na superfície (m), esticado pela inclinação */
  pixelSizeMax: number;
  /** fator de estiramento (1 / cos θ) */
  stretch: number;
}

/**
 * Corrige iluminância e pixel para um ponto de superfície inclinada, a partir
 * dos valores no plano perpendicular à MESMA distância do raio.
 *   lux · cos θ     (o mesmo fluxo espalha numa área maior)
 *   pixel / cos θ   (na direção da inclinação)
 * Para θ ≥ ~89,9° o resultado é tratado como rasante.
 */
export function onSurface(perpendicularLux: number, perpendicularPixel: number, incidence: number): SurfacePoint {
  const c = Math.cos(incidence);
  if (c <= 1e-3) return { lux: 0, pixelSizeMax: Infinity, stretch: Infinity };
  return { lux: perpendicularLux * c, pixelSizeMax: perpendicularPixel / c, stretch: 1 / c };
}

// ---------------------------------------------------------------------------
// Limites da lente
// ---------------------------------------------------------------------------

export interface LensCheck {
  throwRatio: number;
  shift: Shift;
  /** true se algum valor pedido precisou ser limitado */
  clamped: boolean;
  warnings: string[];
}

const clamp = (v: number, r: Range) => Math.min(r.max, Math.max(r.min, v));

/**
 * Limita throw ratio e shift à faixa da lente e informa o que foi ajustado.
 * v1: faixa de shift retangular (H e V independentes). Lentes com área de
 * shift em losango/elipse ficam para uma versão futura.
 */
export function applyLensLimits(lens: LensSpec, throwRatio: number, shift: Shift = NO_SHIFT): LensCheck {
  const warnings: string[] = [];
  const tr = clamp(throwRatio, lens.throwRatio);
  if (tr !== throwRatio) {
    warnings.push(
      `Throw ratio ${throwRatio.toFixed(2)} fora da lente (${lens.throwRatio.min}–${lens.throwRatio.max}); usando ${tr.toFixed(2)}.`,
    );
  }
  const h = clamp(shift.h, lens.shiftH);
  const v = clamp(shift.v, lens.shiftV);
  if (h !== shift.h) warnings.push(`Shift H ${shift.h} fora da faixa (${lens.shiftH.min} a ${lens.shiftH.max}); usando ${h}.`);
  if (v !== shift.v) warnings.push(`Shift V ${shift.v} fora da faixa (${lens.shiftV.min} a ${lens.shiftV.max}); usando ${v}.`);
  return { throwRatio: tr, shift: { h, v }, clamped: warnings.length > 0, warnings };
}
