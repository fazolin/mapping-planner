import { RESOLUTIONS } from "../core/presets";
import type { ProjectorData, ProjectorSystem } from "../scene/projectors";

const nf = (d: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const f0 = nf(0), f1 = nf(1), f2 = nf(2);

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type NumKey = {
  [K in keyof ProjectorData]: ProjectorData[K] extends number ? K : never;
}[keyof ProjectorData];

interface NumDef {
  key: NumKey | "x" | "y" | "z";
  label: string;
  step: number;
  hint?: string;
}

const POSE: NumDef[] = [
  { key: "x", label: "X (m)", step: 0.1 },
  { key: "y", label: "Y — altura (m)", step: 0.1 },
  { key: "z", label: "Z (m)", step: 0.1 },
  { key: "yaw", label: "Giro (°)", step: 1, hint: "+ vira à esquerda" },
  { key: "pitch", label: "Inclinação (°)", step: 0.5, hint: "+ para cima" },
  { key: "roll", label: "Rotação (°)", step: 1, hint: "90 = retrato" },
];
const LENS: NumDef[] = [
  { key: "lumens", label: "Lumens", step: 500 },
  { key: "trMin", label: "Throw ratio mín.", step: 0.01 },
  { key: "trMax", label: "Throw ratio máx.", step: 0.01 },
  { key: "tr", label: "Throw ratio usado", step: 0.01 },
  { key: "shiftHMax", label: "Shift H máx. (±%)", step: 1 },
  { key: "shiftVMax", label: "Shift V máx. (±%)", step: 1 },
  { key: "shiftH", label: "Shift H (%)", step: 1, hint: "+ direita" },
  { key: "shiftV", label: "Shift V (%)", step: 1, hint: "+ cima" },
];

function field(def: NumDef): string {
  return `
    <div class="field">
      <label for="pj-${def.key}">${def.label}${def.hint ? `<small>${def.hint}</small>` : ""}</label>
      <input id="pj-${def.key}" data-k="${def.key}" type="number" step="${def.step}" />
    </div>`;
}

/**
 * Painel lateral dos projetores: lista, propriedades do selecionado e números.
 * `onAim` liga o modo "clicar no modelo para apontar".
 */
export class ProjectorPanel {
  private readonly el: HTMLElement;

  constructor(
    host: HTMLElement,
    private readonly sys: ProjectorSystem,
    private readonly onAim: () => void,
  ) {
    this.el = host;
    host.innerHTML = `
      <section class="panel">
        <div class="panel-head">
          <h2>Projetores</h2>
          <button class="btn small" id="pjAdd">+ Adicionar</button>
        </div>
        <ul class="proj-list" id="pjList"></ul>
        <p class="hint" id="pjEmpty">Nenhum projetor. Clique em “Adicionar”.</p>
      </section>

      <section class="panel" id="pjEditor" hidden>
        <div class="panel-head">
          <input class="name-input" id="pj-name" data-k="name" aria-label="Nome do projetor" />
        </div>
        <div class="stats-mini" id="pjStats"></div>
        <div class="warnings" id="pjWarn"></div>

        <h3>Posição e direção</h3>
        <div class="btn-row wrap">
          <button class="btn" id="pjAim">Apontar…</button>
          <label class="check"><input type="checkbox" id="pjPortrait" /> Retrato</label>
        </div>
        <p class="hint">Apontar: clique no modelo onde o centro da imagem deve cair. Arraste as setas na cena para mover.</p>
        ${POSE.map(field).join("")}

        <h3>Projetor e lente</h3>
        <div class="field">
          <label for="pj-res">Resolução</label>
          <select id="pj-res" data-k="resKey">${Object.keys(RESOLUTIONS)
            .map((k) => `<option>${k}</option>`)
            .join("")}</select>
        </div>
        ${LENS.map(field).join("")}
        <input id="pjTrRange" type="range" step="0.01" aria-label="Throw ratio" />

        <div class="btn-row">
          <button class="btn" id="pjDup">Duplicar</button>
          <button class="btn danger" id="pjDel">Remover</button>
        </div>
      </section>`;

    this.bind();
    sys.onChange = () => this.render();
    this.render();
  }

  private $<T extends HTMLElement>(sel: string): T {
    return this.el.querySelector<T>(sel)!;
  }

  private bind(): void {
    this.$("#pjAdd").addEventListener("click", () => this.sys.add());
    this.$("#pjAim").addEventListener("click", () => this.onAim());
    this.$("#pjDup").addEventListener("click", () => this.sel && this.sys.duplicate(this.sel.id));
    this.$("#pjDel").addEventListener("click", () => {
      if (this.sel && confirm(`Remover “${this.sel.name}”?`)) this.sys.remove(this.sel.id);
    });

    this.$("#pjList").addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const eye = t.closest<HTMLElement>("[data-eye]");
      if (eye) {
        const id = Number(eye.dataset.eye);
        const d = this.sys.get(id);
        if (d) this.sys.update(id, { visible: !d.visible });
        return;
      }
      const li = t.closest<HTMLElement>("[data-id]");
      if (li) this.sys.select(Number(li.dataset.id));
    });

    const editor = this.$("#pjEditor");
    editor.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement | HTMLSelectElement;
      const d = this.sel;
      if (!d) return;
      if (t.id === "pjTrRange") return this.sys.update(d.id, { tr: Number(t.value) });
      if (t.id === "pjPortrait") return this.sys.update(d.id, { roll: (t as HTMLInputElement).checked ? 90 : 0 });
      const k = t.dataset.k;
      if (!k) return;
      if (k === "name" || k === "resKey") return this.sys.update(d.id, { [k]: t.value });
      const v = Number(t.value);
      if (!Number.isFinite(v) || t.value === "") return;
      if (k === "x" || k === "y" || k === "z") {
        const p = [...d.position] as ProjectorData["position"];
        p["xyz".indexOf(k)] = v;
        return this.sys.update(d.id, { position: p });
      }
      this.sys.update(d.id, { [k]: v } as Partial<ProjectorData>);
    });
  }

  private get sel(): ProjectorData | undefined {
    return this.sys.selectedId == null ? undefined : this.sys.get(this.sys.selectedId);
  }

  setAiming(on: boolean): void {
    const b = this.$("#pjAim");
    b.classList.toggle("on", on);
    b.textContent = on ? "Clique no modelo… (Esc cancela)" : "Apontar…";
  }

  render(): void {
    const list = this.sys.list;
    this.$("#pjEmpty").hidden = list.length > 0;
    this.$("#pjList").innerHTML = list
      .map(
        (d) => `
        <li data-id="${d.id}" class="${d.id === this.sys.selectedId ? "on" : ""}">
          <span class="dot" style="background:${d.color}"></span>
          <span class="name">${esc(d.name)}</span>
          <small>${f0.format(d.lumens)} lm</small>
          <button class="eye ${d.visible ? "" : "off"}" data-eye="${d.id}" aria-label="ligar/desligar">👁</button>
        </li>`,
      )
      .join("");

    const d = this.sel;
    this.$("#pjEditor").hidden = !d;
    if (!d) return;

    // Atualiza campos sem atrapalhar o que está sendo digitado.
    const active = document.activeElement;
    const setVal = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
      if (el !== active) el.value = v;
    };
    setVal(this.$<HTMLInputElement>("#pj-name"), d.name);
    setVal(this.$<HTMLSelectElement>("#pj-res"), d.resKey);
    const vals: Record<string, number> = { x: d.position[0], y: d.position[1], z: d.position[2] };
    for (const def of [...POSE, ...LENS]) {
      const v = def.key in vals ? vals[def.key]! : (d[def.key as NumKey] as number);
      setVal(this.$<HTMLInputElement>(`#pj-${def.key}`), String(Math.round(v * 1000) / 1000));
    }
    const range = this.$<HTMLInputElement>("#pjTrRange");
    range.min = String(Math.min(d.trMin, d.trMax));
    range.max = String(Math.max(d.trMin, d.trMax));
    range.disabled = d.trMin === d.trMax;
    setVal(range, String(d.tr));
    this.$<HTMLInputElement>("#pjPortrait").checked = Math.abs(d.roll - 90) < 0.01;

    const s = this.sys.stats(d.id);
    if (!s) return;
    this.$("#pjStats").innerHTML = s.hit
      ? `
        <div><span>Distância</span><strong>${f2.format(s.throwDistance)} m</strong></div>
        <div><span>Imagem</span><strong>${f2.format(s.image.width)} × ${f2.format(s.image.height)} m</strong></div>
        <div><span>Pixel</span><strong>${f1.format(s.pixelMm)} mm</strong><em>${f1.format(s.surfacePixelMm)} na superfície</em></div>
        <div><span>Iluminância</span><strong>${f0.format(s.lux)} lx</strong><em>${f0.format(s.surfaceLux)} na superfície</em></div>
        <div><span>Incidência</span><strong>${f0.format(s.incidenceDeg)}°</strong></div>
        <div><span>Throw ratio</span><strong>${f2.format(s.tr)}</strong></div>`
      : `<p class="hint">O centro da imagem não atinge o modelo.</p>`;
    this.$("#pjWarn").innerHTML = s.warnings.filter((w) => !w.startsWith("O centro")).map((w) => `<p>${esc(w)}</p>`).join("");
  }
}
