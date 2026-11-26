import { ImportedModel, parseObj, type ImportOptions } from "../scene/objImport";
import { fmtM, MeasureTool, type Measurement } from "../scene/measure";
import { boxSize, guessUnit, UNIT_LABEL, type OriginMode, type Unit, type UpAxis } from "../scene/units";
import { Viewer, type ViewPreset } from "../scene/viewer";

const SAMPLE_URL = `${import.meta.env.BASE_URL}samples/fachada.obj`;
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
          <button class="btn" id="sample">Exemplo</button>
        </div>
        <p class="hint">Ou arraste um arquivo .obj para a área 3D.</p>
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

  $("#sample").addEventListener("click", async () => {
    const res = await fetch(SAMPLE_URL);
    load("fachada-exemplo.obj", await res.text());
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
    viewer.invalidate();
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
  measureBtn.addEventListener("click", () => {
    measure.setActive(!measure.active);
    measureBtn.setAttribute("aria-pressed", String(measure.active));
    measureBtn.classList.toggle("on", measure.active);
  });
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
