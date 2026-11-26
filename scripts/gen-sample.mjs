// Gera public/samples/fachada.obj — fachada simples de teste (metros, Y para cima).
// Uso: node scripts/gen-sample.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const lines = ["# Fachada de exemplo — Mapping Planner", "# unidades: metros, Y para cima", ""];
let v = 0;

/** caixa de (x0,y0,z0) a (x1,y1,z1) como objeto OBJ */
function box(name, [x0, y0, z0], [x1, y1, z1]) {
  lines.push(`o ${name}`);
  const p = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  for (const [x, y, z] of p) lines.push(`v ${x} ${y} ${z}`);
  const f = (a, b, c, d) => lines.push(`f ${v + a} ${v + b} ${v + c} ${v + d}`);
  f(1, 4, 3, 2); // trás (z0)
  f(5, 6, 7, 8); // frente (z1)
  f(1, 5, 8, 4); // esquerda
  f(2, 3, 7, 6); // direita
  f(4, 8, 7, 3); // topo
  f(1, 2, 6, 5); // base
  v += 8;
  lines.push("");
}

const W = 16, H = 9, D = 0.6;
box("Chao", [-15, -0.05, -10], [15, 0, 14]);
box("Parede", [-W / 2, 0, -D], [W / 2, H, 0]);
box("Platibanda", [-W / 2 - 0.2, H, -D - 0.1], [W / 2 + 0.2, H + 0.6, 0.15]);
box("Coluna_Esquerda", [-W / 2, 0, 0], [-W / 2 + 0.8, H, 0.35]);
box("Coluna_Direita", [W / 2 - 0.8, 0, 0], [W / 2, H, 0.35]);
box("Portal", [-2, 0, 0], [2, 4.2, 0.25]);
box("Marquise", [-3, 4.2, 0], [3, 4.45, 1.8]);
let n = 1;
for (const y of [5.2, 7.2]) {
  for (const x of [-5.5, -2.5, 0.5, 3.5]) {
    box(`Janela_${n++}`, [x, y, 0], [x + 2, y + 1.3, 0.12]);
  }
}

mkdirSync("public/samples", { recursive: true });
writeFileSync("public/samples/fachada.obj", lines.join("\n"));
console.log(`ok: ${v} vértices`);
