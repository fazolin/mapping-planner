/**
 * Orientação do projetor (funções puras, sem Three.js).
 *
 * Convenção (igual à câmera do Three.js, Y para cima):
 *   - O projetor olha para −Z no seu próprio referencial; +X = direita, +Y = cima.
 *   - giro (yaw)       → em torno do Y do mundo; 0 = olhando para −Z; positivo = vira para a esquerda.
 *   - inclinação (pitch) → em torno do X local; positivo = aponta para cima.
 *   - rotação (roll)   → em torno do eixo da lente; 90° = retrato.
 *   - Ordem: R = Ry(yaw) · Rx(pitch) · Rz(roll)  (Euler "YXZ" do Three.js).
 * Ângulos em radianos.
 */

import { imageRect, type Resolution, type Shift } from "./optics";

export type Vec3 = [number, number, number];

export interface Orientation {
  yaw: number;
  pitch: number;
  roll: number;
}

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l === 0) throw new RangeError("vetor nulo");
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Aplica a orientação a um vetor do referencial do projetor. */
export function rotate(o: Orientation, v: Vec3): Vec3 {
  const [x0, y0, z0] = v;
  // Rz(roll)
  const cr = Math.cos(o.roll), sr = Math.sin(o.roll);
  const x1 = cr * x0 - sr * y0, y1 = sr * x0 + cr * y0, z1 = z0;
  // Rx(pitch)
  const cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
  const x2 = x1, y2 = cp * y1 - sp * z1, z2 = sp * y1 + cp * z1;
  // Ry(yaw)
  const cy = Math.cos(o.yaw), sy = Math.sin(o.yaw);
  return [cy * x2 + sy * z2, y2, -sy * x2 + cy * z2];
}

/** Direção do eixo da lente no mundo. */
export const axisDirection = (o: Orientation): Vec3 => rotate(o, [0, 0, -1]);

/** Giro e inclinação que fazem o eixo apontar para a direção dada. */
export function yawPitchFromDirection(dir: Vec3): { yaw: number; pitch: number } {
  const d = normalize(dir);
  return { yaw: Math.atan2(-d[0], -d[2]), pitch: Math.asin(Math.max(-1, Math.min(1, d[1]))) };
}

/** Direção, no referencial do projetor, do raio que passa pelo CENTRO da imagem (considera o shift). */
export function centerRayLocal(throwRatio: number, res: Resolution, shift: Shift): Vec3 {
  const r = imageRect(1, throwRatio, res, shift);
  return normalize([(r.left + r.right) / 2, (r.bottom + r.top) / 2, -1]);
}

/** Direção do raio central da imagem no mundo. */
export function centerRayDirection(o: Orientation, throwRatio: number, res: Resolution, shift: Shift): Vec3 {
  return rotate(o, centerRayLocal(throwRatio, res, shift));
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Ajusta giro e inclinação (mantendo a rotação) para que o CENTRO da imagem
 * caia no ponto `target`. Resolve por iteração; com shift zero é exato no 1º passo.
 */
export function aimCenterAt(
  position: Vec3,
  target: Vec3,
  roll: number,
  throwRatio: number,
  res: Resolution,
  shift: Shift,
): Orientation {
  const want = yawPitchFromDirection([target[0] - position[0], target[1] - position[1], target[2] - position[2]]);
  const o: Orientation = { yaw: want.yaw, pitch: want.pitch, roll };
  for (let i = 0; i < 30; i++) {
    const got = yawPitchFromDirection(centerRayDirection(o, throwRatio, res, shift));
    const dy = wrap(want.yaw - got.yaw);
    const dp = want.pitch - got.pitch;
    o.yaw = wrap(o.yaw + dy);
    o.pitch = Math.max(-Math.PI / 2 + 1e-6, Math.min(Math.PI / 2 - 1e-6, o.pitch + dp));
    if (Math.abs(dy) < 1e-10 && Math.abs(dp) < 1e-10) break;
  }
  return o;
}
