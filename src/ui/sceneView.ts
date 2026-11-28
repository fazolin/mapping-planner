import { ImportedModel, parseObj, type ImportOptions } from "../scene/objImport";
import { fmtM, MeasureTool, type Measurement } from "../scene/measure";
import { ProjectorSystem } from "../scene/projectors";
import { ProjectorPanel } from "./projectorPanel";
import { boxSize, guessUnit, UNIT_LABEL, type OriginMode, type Unit, type UpAxis } from "../scene/units";
import { Viewer, type ViewPreset } from "../scene/viewer";

const SAMPLES: Record<string, { label: string; file: string }> = {
  fachada: { label: "Fachada simples", file: "fachada.obj" },
  partenon: { label: "Partenon", file: "partenon.obj" },
};
const nf = new Intl.NumberFormat("pt-BR");
const MEASURE_HINT = "Clique em dois pontos do modelo; o clique gruda nos cantos (Option/Alt solta). Esc limpa.";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function mountSceneView(root: HTMLElement): void {
  root.innerHTML = `
    <aside class="sidebar">
      <section class="panel">
        <h2>Modelo</h2>
        <div class="btn-row">
          <label class="btn primary">Abrir OBJ…<input id="file" type="file" accept=".obj" hidden /></label>
        </div>
        <p class="hint">Ou arraste um arquivo .obj para a área 3D.</p>
        <div class="samples" id="samples">
          <span class="hint">Exemplos:</span>
          ${Object.entries(SAMPLES)
            .map(([k, s]) => `<button class="link" data-sample="${k}">${s.label}</button>`)
            .join(" · ")}
        </div>
        <div id="modelInfo" hidden>
          <p class="file-name" id="fileName"></p>
          <div class="field">
            <label for="unit">Unidade do arquivo</label>
            <select id="unit">
              ${(Object.keys(UNIT_LABEL) as Unit[]).map((u) => `<option value="${u}">${UNIT_LABEL[u]}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="up">Eixo para cima<small>Blender/SketchUp: Z</small></label>
            <select id="up"><option value="Y">Y</option><option value="Z">Z</option></select>
          </div>
          <div class="field">
            <label for="origin">Origem</label>
            <select id="origin">
              <option value="centro-chao">centro no chão</option>
              <option value="centro">centro</option>
              <option value="original">do arquivo</option>
            </select>
          </div>
          <div class="dims" id="dims"></div>
        </div>
      </section>

      <div id="projectors"></div>

      <section class="panel">
        <h2>Medir</h2>
        <button class="btn" id="measure" aria-pressed="false">Medir distância</button>
        <div id="measureOut" class="measure-out"><p class="hint">${MEASURE_HINT}</p></div>
      </section>

      <section class="panel" id="surfacesPanel" hidden>
        <h2>Superfícies</h2>
        <p class="hint">Marque as que recebem projeção. O olho mostra ou esconde.</p>
        <div class="surface-actions">
          <button class="link" data-all="on">todas</button> ·
          <button class="link" data-all="off">nenhuma</button>
        </div>
        <ul class="surfaces" id="surfaces"></ul>
      </section>
    </aside>

    <section class="viewport" id="viewport">
      <div class="view-buttons">
        <button data-view="perspectiva">Perspectiva</button>
        <button data-view="frente">Frente</button>
        <button data-view="topo">Topo</button>
        <button data-view="lado">Lado</button>
      </div>
      <div class="grid-note" id="gridNote"></div>
      <div class="drop-hint" id="dropHint">Solte o arquivo .obj aqui</div>
      <div class="empty" id="empty">
        <p>Nenhum modelo carregado.</p>
        <p class="hint">Abra um .obj ou carregue o exemplo.</p>
      </div>
    </section>`;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const viewport = $("#viewport");
  const viewer = new Viewer(viewport);
  const measure = new MeasureTool(viewer);
  let model: ImportedModel | null = null;

  // --- projetores --------------------------------------------------------------
  const projectors = new ProjectorSystem(viewer);
  let aiming = false;
  const panel = new ProjectorPanel($("#projectors"), projectors, () => setAiming(!aiming));
  const baseOnChange = projectors.onChange;
  projectors.onChange = () => {
    baseOnChange();
    syncGizmo();
  };

  function syncGizmo() {
    const obj = projectors.selectedId != null && !measure.active ? projectors.object(projectors.selectedId) : undefined;
    if (obj && obj.visible) {
      if (viewer.transform.object !== obj) viewer.transform.attach(obj);
    } else viewer.transform.detach();
    viewer.invalidate();
  }

  function setAiming(on: boolean) {
    aiming = on && projectors.selectedId != null;
    if (aiming && measure.active) toggleMeasure(false);
    panel.setAiming(aiming);
    viewer.canvas.style.cursor = aiming ? "crosshair" : "";
  }

  // gizmo: ao arrastar, grava a posição nos dados do projetor
  viewer.transform.addEventListener("objectChange", () => {
    const id = projectors.selectedId;
    const obj = viewer.transform.object;
    if (id == null || !obj) return;
    const p = obj.position;
    const r = (v: number) => Math.round(v * 100) / 100;
    projectors.update(id, { position: [r(p.x), r(p.y), r(p.z)] });
  });

  // clique na cena: apontar, ou selecionar projetor
  let down: { x: number; y: number; onGizmo: boolean } | null = null;
  viewer.canvas.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, onGizmo: viewer.transform.axis !== null };
  });
  viewer.canvas.addEventListener("pointerup", (e) => {
    if (!down || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4;
    const onGizmo = down.onGizmo;
    down = null;
    if (moved || onGizmo || measure.active) return;
    if (aiming) {
      const hit = viewer.pick(e.clientX, e.clientY);
      if (hit && projectors.selectedId != null) projectors.aimAt(projectors.selectedId, hit.point);
      setAiming(false);
      return;
    }
    const id = projectors.pick(e.clientX, e.clientY);
    if (id != null) projectors.select(id);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && aiming) setAiming(false);
  });

  const unitSel = $<HTMLSelectElement>("#unit");
  const upSel = $<HTMLSelectElement>("#up");
  const originSel = $<HTMLSelectElement>("#origin");

  function readOptions(): ImportOptions {
    return {
      unit: unitSel.value as Unit,
      up: upSel.value as UpAxis,
      origin: originSel.value as OriginMode,
    };
  }

  function updateGridNote() {
    $("#gridNote").textContent = `grade: ${viewer.gridCell} m · eixos: X vermelho, Y verde, Z azul`;
  }

  function afterTransform(reframe: boolean) {
    if (!model) return;
    const box = model.sceneBox();
    const [w, h, d] = boxSize(box);
    $("#dims").innerHTML = `
      <div><span>Largura (X)</span><strong>${fmtM(w)}</strong></div>
      <div><span>Altura (Y)</span><strong>${fmtM(h)}</strong></div>
      <div><span>Profund. (Z)</span><strong>${fmtM(d)}</strong></div>
      <div><span>Triângulos</span><strong>${nf.format(model.triangles)}</strong></div>`;
    const largest = Math.max(w, h, d);
    viewer.setGrid(Math.max(10, largest * 1.6));
    updateGridNote();
    measure.setScale(largest);
    measure.clear();
    if (reframe) viewer.setView("perspectiva");
    projectors.modelChanged();
    viewer.invalidate();
  }

  function renderSurfaces() {
    if (!model) return;
    $("#surfaces").innerHTML = model.surfaces
      .map(
        (s) => `
        <li>
          <label><input type="checkbox" data-proj="${s.id}" ${s.projection ? "checked" : ""} />
            <span title="${esc(s.name)}">${esc(s.name)}</span></label>
          <small>${nf.format(s.triangles)} tri</small>
          <button class="eye ${s.visible ? "" : "off"}" data-eye="${s.id}" aria-label="mostrar/esconder">👁</button>
        </li>`,
      )
      .join("");
  }

  function load(fileName: string, text: string) {
    let raw;
    try {
      raw = parseObj(text);
    } catch (e) {
      alert(`Não consegui ler "${fileName}": ${(e as Error).message}`);
      return;
    }
    if (model) {
      viewer.modelRoot.remove(model.root);
      model.dispose();
    }
    // Palpite de unidade pelo tamanho; o usuário confirma.
    const tmp = new ImportedModel(fileName, raw, { unit: "m", up: "Y", origin: "centro-chao" });
    unitSel.value = guessUnit(tmp.rawBox);
    upSel.value = "Y";
    originSel.value = "centro-chao";
    tmp.apply(readOptions());
    model = tmp;
    viewer.modelRoot.add(model.root);
    projectors.setModel(model);

    $("#fileName").textContent = fileName;
    $("#modelInfo").hidden = false;
    $("#surfacesPanel").hidden = false;
    $("#empty").hidden = true;
    renderSurfaces();
    afterTransform(true);
  }

  async function loadFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".obj")) {
      alert("Por enquanto só arquivos .obj.");
      return;
    }
    load(file.name, await file.text());
  }

  // --- eventos ---------------------------------------------------------------

  $<HTMLInputElement>("#file").addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) void loadFile(f);
    (e.target as HTMLInputElement).value = "";
  });

  $("#samples").addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-sample]");
    const s = b && SAMPLES[b.dataset.sample!];
    if (!s) return;
    const res = await fetch(`${import.meta.env.BASE_URL}samples/${s.file}`);
    load(s.file, await res.text());
  });

  for (const sel of [unitSel, upSel, originSel]) {
    sel.addEventListener("change", () => {
      if (!model) return;
      model.apply(readOptions());
      afterTransform(true);
    });
  }

  $("#surfaces").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (!model) return;
    const eye = t.closest<HTMLElement>("[data-eye]");
    if (eye) {
      const s = model.surfaces.find((x) => x.id === Number(eye.dataset.eye));
      if (s) s.visible = !s.visible;
    } else if (t instanceof HTMLInputElement && t.dataset.proj) {
      const s = model.surfaces.find((x) => x.id === Number(t.dataset.proj));
      if (s) s.projection = t.checked;
    } else return;
    model.refreshMaterials();
    renderSurfaces();
    projectors.modelChanged();
  });

  root.querySelector(".surface-actions")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-all]");
    if (!b || !model) return;
    for (const s of model.surfaces) s.projection = b.dataset.all === "on";
    model.refreshMaterials();
    renderSurfaces();
    viewer.invalidate();
  });

  root.querySelector(".view-buttons")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-view]");
    if (b) viewer.setView(b.dataset.view as ViewPreset);
  });

  const measureBtn = $("#measure");
  function toggleMeasure(on: boolean) {
    measure.setActive(on);
    measureBtn.setAttribute("aria-pressed", String(on));
    measureBtn.classList.toggle("on", on);
    if (on) setAiming(false);
    syncGizmo();
  }
  measureBtn.addEventListener("click", () => toggleMeasure(!measure.active));
  measure.onChange = (m: Measurement | null, pending: boolean) => {
    const out = $("#measureOut");
    if (pending) out.innerHTML = `<p class="hint">Agora clique no segundo ponto.</p>`;
    else if (!m) out.innerHTML = `<p class="hint">${MEASURE_HINT}</p>`;
    else
      out.innerHTML = `
        <div class="measure-big">${fmtM(m.distance)}</div>
        <div class="dims">
          <div><span>ΔX</span><strong>${fmtM(Math.abs(m.delta.x))}</strong></div>
          <div><span>ΔY (altura)</span><strong>${fmtM(Math.abs(m.delta.y))}</strong></div>
          <div><span>ΔZ</span><strong>${fmtM(Math.abs(m.delta.z))}</strong></div>
          <div><span>Horizontal</span><strong>${fmtM(Math.hypot(m.delta.x, m.delta.z))}</strong></div>
        </div>`;
  };

  // arrastar e soltar
  viewport.addEventListener("dragover", (e) => {
    e.preventDefault();
    viewport.classList.add("dragging");
  });
  viewport.addEventListener("dragleave", () => viewport.classList.remove("dragging"));
  viewport.addEventListener("drop", (e) => {
    e.preventDefault();
    viewport.classList.remove("dragging");
    const f = e.dataTransfer?.files[0];
    if (f) void loadFile(f);
  });

  updateGridNote();
  viewer.setView("perspectiva");
}
