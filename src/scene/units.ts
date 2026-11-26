/**
 * Conversões de importação: unidade, eixo vertical e origem.
 * Internamente a cena usa METROS e eixo Y para cima (padrão do Three.js).
 * Funções puras, sem dependência do Three.js, para poder testar.
 */

export type Unit = "m" | "cm" | "mm" | "in" | "ft";
export type UpAxis = "Y" | "Z";
export type OriginMode = "original" | "centro-chao" | "centro";

export const UNIT_SCALE: Record<Unit, number> = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  in: 0.0254,
  ft: 0.3048,
};

export const UNIT_LABEL: Record<Unit, string> = {
  m: "metros",
  cm: "centímetros",
  mm: "milímetros",
  in: "polegadas",
  ft: "pés",
};

export type V3 = [number, number, number];

export interface Box3 {
  min: V3;
  max: V3;
}

/** Converte um ponto do arquivo para a cena (sem origem). Z-up → Y-up: (x, y, z) → (x, z, −y). */
export function toScene(p: V3, unit: Unit, up: UpAxis): V3 {
  const s = UNIT_SCALE[unit];
  const [x, y, z] = p;
  return up === "Y" ? [x * s, y * s, z * s] : [x * s, z * s, -y * s];
}

/** Caixa delimitadora após unidade e eixo. */
export function transformBox(box: Box3, unit: Unit, up: UpAxis): Box3 {
  const corners: V3[] = [];
  for (const x of [box.min[0], box.max[0]])
    for (const y of [box.min[1], box.max[1]])
      for (const z of [box.min[2], box.max[2]]) corners.push(toScene([x, y, z], unit, up));
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const c of corners)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, c[i]!);
      max[i] = Math.max(max[i]!, c[i]!);
    }
  return { min, max };
}

/** Deslocamento a somar (em metros, já na cena) para aplicar o modo de origem. */
export function originOffset(box: Box3, mode: OriginMode): V3 {
  if (mode === "original") return [0, 0, 0];
  const cx = (box.min[0] + box.max[0]) / 2;
  const cy = (box.min[1] + box.max[1]) / 2;
  const cz = (box.min[2] + box.max[2]) / 2;
  return mode === "centro" ? [-cx, -cy, -cz] : [-cx, -box.min[1], -cz];
}

export function boxSize(box: Box3): V3 {
  return [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
}

/**
 * Sugere a unidade provável do arquivo pelo tamanho bruto (maior dimensão),
 * assumindo um objeto/local de mapping entre ~0,3 m e ~500 m.
 * É só um palpite para pré-selecionar; o usuário confirma.
 */
export function guessUnit(rawBox: Box3): Unit {
  const largest = Math.max(...boxSize(rawBox));
  if (largest > 5000) return "mm";
  if (largest > 500) return "cm";
  return "m";
}
