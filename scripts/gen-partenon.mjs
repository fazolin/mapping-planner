// Gera public/samples/partenon.obj — Partenon simplificado (metros, Y para cima).
// Medidas aproximadas do original: estilobata 30,9 × 69,5 m, 8 × 17 colunas
// dóricas de 10,4 m, entablamento e frontão. Fachada principal voltada para +Z.
// Uso: node scripts/gen-partenon.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const out = ["# Partenon simplificado — Mapping Planner", "# unidades: metros, Y para cima, fachada para +Z", ""];
let v = 0;
const vert = (x, y, z) => {
  out.push(`v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}`);
  return ++v;
};
const face = (...ids) => out.push(`f ${ids.join(" ")}`);
const object = (name) => out.push("", `o ${name}`);

function box([x0, y0, z0], [x1, y1, z1]) {
  const a = vert(x0, y0, z0), b = vert(x1, y0, z0), c = vert(x1, y1, z0), d = vert(x0, y1, z0);
  const e = vert(x0, y0, z1), f = vert(x1, y0, z1), g = vert(x1, y1, z1), h = vert(x0, y1, z1);
  face(a, d, c, b); face(e, f, g, h); face(a, e, h, d); face(b, c, g, f); face(d, h, g, c); face(a, b, f, e);
}

/** Fuste de coluna (16 lados) com afinamento para o topo. */
function column(x, z, y0, y1, r0, r1, sides = 16) {
  const bot = [], top = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    bot.push(vert(x + r0 * Math.cos(t), y0, z + r0 * Math.sin(t)));
    top.push(vert(x + r1 * Math.cos(t), y1, z + r1 * Math.sin(t)));
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    face(bot[i], top[i], top[j], bot[j]);
  }
  face(...top);
  face(...[...bot].reverse());
}

/** Prisma triangular ao longo de Z (telhado + frontões nas pontas). */
function roof(halfW, yBase, yRidge, z0, z1) {
  const a0 = vert(-halfW, yBase, z0), b0 = vert(halfW, yBase, z0), c0 = vert(0, yRidge, z0);
  const a1 = vert(-halfW, yBase, z1), b1 = vert(halfW, yBase, z1), c1 = vert(0, yRidge, z1);
  face(a0, c0, b0); // frontão de trás
  face(a1, b1, c1); // frontão da frente
  face(a0, a1, c1, c0); // água esquerda
  face(b0, c0, c1, b1); // água direita
  face(a0, b0, b1, a1); // base
}

// --- medidas ---------------------------------------------------------------
const SX = 30.88 / 2; // meia largura do estilobata
const SZ = 69.5 / 2; // meio comprimento
const STEP = 0.5;
const Y_STYLO = 3 * STEP; // topo do estilobata
const COL_H = 10.43;
const Y_CAP = Y_STYLO + COL_H;
const R0 = 0.95, R1 = 0.75;
const FRONT_X = Array.from({ length: 8 }, (_, i) => -14 + i * 4);
const SIDE_Z = Array.from({ length: 17 }, (_, i) => -32 + i * 4);

// Terreno ao redor
object("Terreno");
box([-35, -0.1, -60], [35, 0, 60]);

// Crepidoma (3 degraus)
object("Degraus");
for (let i = 0; i < 3; i++) {
  const g = (2 - i) * STEP;
  box([-SX - g, i * STEP, -SZ - g], [SX + g, (i + 1) * STEP, SZ + g]);
}

// Colunas, agrupadas por lado
const capital = (x, z) => box([x - 1.05, Y_CAP - 0.45, z - 1.05], [x + 1.05, Y_CAP, z + 1.05]);
const colGroup = (name, list) => {
  object(name);
  for (const [x, z] of list) {
    column(x, z, Y_STYLO, Y_CAP - 0.45, R0, R1);
    capital(x, z);
  }
};
colGroup("Colunas_Frente", FRONT_X.map((x) => [x, 32]));
colGroup("Colunas_Fundo", FRONT_X.map((x) => [x, -32]));
colGroup("Colunas_Lado_Esq", SIDE_Z.slice(1, -1).map((z) => [-14, z]));
colGroup("Colunas_Lado_Dir", SIDE_Z.slice(1, -1).map((z) => [14, z]));

// Naos (cela) — paredes internas
object("Naos");
box([-10.5, Y_STYLO, -24], [10.5, Y_CAP, 24]);

// Entablamento: arquitrave, friso e cornija
const EW = SX - 0.25, EZ = SZ - 0.25;
object("Arquitrave");
box([-EW, Y_CAP, -EZ], [EW, Y_CAP + 1.35, EZ]);
object("Friso");
box([-EW, Y_CAP + 1.35, -EZ], [EW, Y_CAP + 2.7, EZ]);
object("Cornija");
box([-EW - 0.35, Y_CAP + 2.7, -EZ - 0.35], [EW + 0.35, Y_CAP + 3.3, EZ + 0.35]);

// Telhado com frontões
object("Telhado_Frontoes");
roof(EW + 0.35, Y_CAP + 3.3, Y_CAP + 3.3 + 3.45, -EZ - 0.35, EZ + 0.35);

mkdirSync("public/samples", { recursive: true });
writeFileSync("public/samples/partenon.obj", out.join("\n") + "\n");
console.log(`ok: ${v} vértices`);
