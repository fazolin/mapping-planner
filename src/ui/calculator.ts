import {
  applyLensLimits,
  distanceForWidth,
  distanceRange,
  fieldOfView,
  illuminance,
  imageRect,
  imageSize,
  imageWidthRange,
  luminance,
  pixelSize,
  toDegrees,
  type LensSpec,
  type Rect,
  type Resolution,
} from "../core/optics";
import { RESOLUTIONS } from "../core/presets";

type Mode = "distancia" | "largura";

interface State {
  res: Resolution;
  lumens: number;
  mode: Mode;
  distance: number;
  targetWidth: number;
  trMin: number;
  trMax: number;
  tr: number;
  /** % da imagem (convenção interna × 100) */
  shiftH: number;
  shiftV: number;
  shiftHMax: number;
  shiftVMax: number;
  reflectance: number;
}

const state: State = {
  res: RESOLUTIONS["WUXGA 1920×1200"]!,
  lumens: 10000,
  mode: "distancia",
  distance: 8,
  targetWidth: 5,
  trMin: 1.2,
  trMax: 2.0,
  tr: 1.5,
  shiftH: 0,
  shiftV: 0,
  shiftHMax: 10,
  shiftVMax: 50,
  reflectance: 80,
};

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const nf = (digits: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const f0 = nf(0), f1 = nf(1), f2 = nf(2);
const m = (v: number) => `${f2.format(v)} m`;
const signedM = (v: number) => `${v >= 0 ? "+" : "−"}${f2.format(Math.abs(v))} m`;

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

function compute(s: State) {
  const lens: LensSpec = {
    throwRatio: { min: Math.min(s.trMin, s.trMax), max: Math.max(s.trMin, s.trMax) },
    shiftH: { min: -s.shiftHMax / 100, max: s.shiftHMax / 100 },
    shiftV: { min: -s.shiftVMax / 100, max: s.shiftVMax / 100 },
  };
  const check = applyLensLimits(lens, s.tr, { h: s.shiftH / 100, v: s.shiftV / 100 });
  const tr = check.throwRatio;
  const shift = check.shift;
  const warnings = [...check.warnings];

  const distance = s.mode === "distancia" ? s.distance : distanceForWidth(s.targetWidth, tr);
  const dr = s.mode === "largura" ? distanceRange(s.targetWidth, lens) : null;

  const size = imageSize(distance, tr, s.res);
  const rect = imageRect(distance, tr, s.res, shift);
  const fov = fieldOfView(tr, s.res, shift);
  const px = pixelSize(size.width, s.res);
  const lux = illuminance(s.lumens, size);
  const nits = luminance(lux, s.reflectance / 100);
  const wr = imageWidthRange(distance, lens);

  return { lens, tr, shift, distance, size, rect, fov, px, lux, nits, wr, dr, warnings };
}

// ---------------------------------------------------------------------------
// Diagramas (vista lateral e de topo)
// ---------------------------------------------------------------------------

const VB_W = 420, VB_H = 240, PAD = 34;

function diagram(distance: number, lo: number, hi: number, loLabel: string, hiLabel: string, flip: boolean): string {
  // Mundo: x = distância ao longo do eixo; y = deslocamento (lateral ou vertical).
  const bodyLen = Math.max(distance * 0.08, 0.2);
  const bodyHalf = bodyLen * 0.35;
  const xMin = -bodyLen, xMax = distance;
  const yMin = Math.min(lo, -bodyHalf), yMax = Math.max(hi, bodyHalf);
  const scale = Math.min((VB_W - PAD * 2 - 60) / (xMax - xMin), (VB_H - PAD * 2) / (yMax - yMin));
  const ox = PAD - xMin * scale;
  const oy = VB_H / 2 + (flip ? -1 : 1) * ((yMax + yMin) / 2) * scale;
  const X = (x: number) => ox + x * scale;
  // flip=false: +y para cima (vista lateral); flip=true: +y para baixo (vista de topo)
  const Y = (y: number) => (flip ? oy + y * scale : oy - y * scale);

  const lens = { x: X(0), y: Y(0) };
  const a = { x: X(distance), y: Y(lo) };
  const b = { x: X(distance), y: Y(hi) };
  const dimY = Math.max(a.y, b.y, lens.y + bodyHalf * scale) + 18;

  return `
  <svg viewBox="0 0 ${VB_W} ${VB_H}" role="img">
    <line class="axis" x1="${X(xMin)}" y1="${lens.y}" x2="${X(xMax) + 40}" y2="${lens.y}" />
    <polygon class="cone" points="${lens.x},${lens.y} ${a.x},${a.y} ${b.x},${b.y}" />
    <line class="ray" x1="${lens.x}" y1="${lens.y}" x2="${a.x}" y2="${a.y}" />
    <line class="ray" x1="${lens.x}" y1="${lens.y}" x2="${b.x}" y2="${b.y}" />
    <rect class="body" x="${X(-bodyLen)}" y="${lens.y - bodyHalf * scale}"
          width="${bodyLen * scale}" height="${2 * bodyHalf * scale}" rx="3" />
    <line class="image" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />
    <text x="${b.x + 8}" y="${b.y + 4}">${hiLabel}</text>
    <text x="${a.x + 8}" y="${a.y + 4}">${loLabel}</text>
    <line class="dim" x1="${lens.x}" y1="${Math.min(dimY, VB_H - 14)}" x2="${a.x}" y2="${Math.min(dimY, VB_H - 14)}" />
    <text x="${(lens.x + a.x) / 2}" y="${Math.min(dimY, VB_H - 14) + 13}" text-anchor="middle">${m(distance)}</text>
  </svg>`;
}

function diagrams(distance: number, r: Rect): string {
  return `
    <figure>
      <figcaption>Vista lateral — bordas em relação ao eixo da lente</figcaption>
      ${diagram(distance, r.bottom, r.top, `base ${signedM(r.bottom)}`, `topo ${signedM(r.top)}`, false)}
    </figure>
    <figure>
      <figcaption>Vista de topo — bordas em relação ao eixo da lente</figcaption>
      ${diagram(distance, r.left, r.right, `esq. ${signedM(r.left)}`, `dir. ${signedM(r.right)}`, true)}
    </figure>`;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

function numField(key: keyof State, label: string, step: number, hint = ""): string {
  return `
    <div class="field">
      <label for="${key}">${label}${hint ? `<small>${hint}</small>` : ""}</label>
      <input id="${key}" type="number" step="${step}" value="${state[key] as number}" />
    </div>`;
}

export function mountCalculator(root: HTMLElement): void {
  const resOptions = Object.keys(RESOLUTIONS)
    .map((k) => `<option>${k}</option>`)
    .join("");

  root.innerHTML = `
    <aside>
      <section class="panel">
        <h2>Projetor</h2>
        <div class="field">
          <label for="res">Resolução</label>
          <select id="res">${resOptions}</select>
        </div>
        ${numField("lumens", "Lumens", 500, "ISO/ANSI")}
      </section>

      <section class="panel">
        <h2>Lente</h2>
        ${numField("trMin", "Throw ratio mín.", 0.01)}
        ${numField("trMax", "Throw ratio máx.", 0.01, "igual ao mín. = lente fixa")}
        <div class="field">
          <label for="tr">Throw ratio usado</label>
          <input id="tr" type="number" step="0.01" value="${state.tr}" />
          <input id="trRange" type="range" step="0.01" />
        </div>
        ${numField("shiftHMax", "Shift H máx. (±%)", 1, "% da largura")}
        ${numField("shiftVMax", "Shift V máx. (±%)", 1, "% da altura")}
        ${numField("shiftH", "Shift H usado (%)", 1, "+ = direita")}
        ${numField("shiftV", "Shift V usado (%)", 1, "+ = para cima")}
      </section>

      <section class="panel">
        <h2>Local</h2>
        <div class="seg" id="mode">
          <button data-mode="distancia">Tenho a distância</button>
          <button data-mode="largura">Quero a largura</button>
        </div>
        <div id="modeFields"></div>
        ${numField("reflectance", "Refletância (%)", 5, "branco ≈ 80, concreto ≈ 30")}
      </section>
    </aside>

    <section>
      <div class="panel">
        <h2>Resultado</h2>
        <div class="results" id="results"></div>
        <div class="warnings" id="warnings"></div>
      </div>
      <div class="panel">
        <h2>Geometria</h2>
        <div class="diagrams" id="diagrams"></div>
        <p class="note">
          Estimativas no plano perpendicular ao eixo da lente, sem distorção. O brilho não considera perdas
          da lente, modo de imagem, desgaste nem luz ambiente. Shift: deslocamento do centro da imagem em %
          do tamanho dela (50% = borda sobre o eixo).
        </p>
      </div>
    </section>`;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const resSel = $<HTMLSelectElement>("#res");
  const trInput = $<HTMLInputElement>("#tr");
  const trRange = $<HTMLInputElement>("#trRange");

  function renderModeFields() {
    $("#modeFields").innerHTML =
      state.mode === "distancia"
        ? numField("distance", "Distância (m)", 0.1, "da lente até a superfície")
        : numField("targetWidth", "Largura desejada (m)", 0.1);
    root.querySelectorAll<HTMLButtonElement>("#mode button").forEach((b) =>
      b.classList.toggle("on", b.dataset.mode === state.mode),
    );
  }

  function render() {
    const lo = Math.min(state.trMin, state.trMax);
    const hi = Math.max(state.trMin, state.trMax);
    trRange.min = String(lo);
    trRange.max = String(hi);
    trRange.disabled = lo === hi;
    trRange.value = String(state.tr);

    let r: ReturnType<typeof compute>;
    try {
      r = compute(state);
    } catch (e) {
      $("#results").innerHTML = "";
      $("#warnings").innerHTML = `<p>${(e as Error).message}</p>`;
      $("#diagrams").innerHTML = "";
      return;
    }

    const diag = Math.hypot(r.size.width, r.size.height);
    const stats: [string, string, string][] = [
      ["Imagem", `${f2.format(r.size.width)} × ${f2.format(r.size.height)} m`, `diagonal ${f2.format(diag)} m · ${f0.format(diag / 0.0254)}″`],
      [state.mode === "distancia" ? "Distância" : "Distância necessária", m(r.distance), `throw ratio ${f2.format(r.tr)}`],
      r.dr
        ? ["Faixa de distância", `${f2.format(r.dr.min)} – ${f2.format(r.dr.max)} m`, "para esta largura, com o zoom da lente"]
        : ["Zoom nesta distância", `${f2.format(r.wr.min)} – ${f2.format(r.wr.max)} m`, "faixa de largura da lente"],
      ["Pixel", `${f2.format(r.px * 1000)} mm`, `${f0.format(1 / r.px)} px/m`],
      ["Iluminância", `${f0.format(r.lux)} lx`, `${f0.format(state.lumens)} lm em ${f1.format(r.size.width * r.size.height)} m²`],
      ["Brilho estimado", `${f0.format(r.nits)} nits`, `refletância ${f0.format(state.reflectance)}%`],
      ["Abertura", `${f1.format(toDegrees(r.fov.horizontal))}° × ${f1.format(toDegrees(r.fov.vertical))}°`, "horizontal × vertical"],
    ];
    $("#results").innerHTML = stats
      .map(([k, v, s]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`)
      .join("");
    $("#warnings").innerHTML = r.warnings.map((w) => `<p>${w}</p>`).join("");
    $("#diagrams").innerHTML = diagrams(r.distance, r.rect);
  }

  root.addEventListener("input", (ev) => {
    const el = ev.target as HTMLInputElement | HTMLSelectElement;
    if (el.id === "res") {
      state.res = RESOLUTIONS[el.value]!;
    } else if (el.id === "trRange") {
      state.tr = Number(el.value);
      trInput.value = el.value;
    } else if (el.id in state) {
      const v = Number(el.value);
      if (!Number.isFinite(v)) return;
      (state as unknown as Record<string, number>)[el.id] = v;
    }
    render();
  });

  $("#mode").addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest("button");
    if (!btn?.dataset.mode) return;
    state.mode = btn.dataset.mode as Mode;
    renderModeFields();
    render();
  });

  resSel.value = "WUXGA 1920×1200";
  renderModeFields();
  render();
}
