import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { Viewer } from "./viewer";

export interface Measurement {
  a: THREE.Vector3;
  b: THREE.Vector3;
  distance: number;
  delta: THREE.Vector3;
}

const fmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
export const fmtM = (v: number) => `${fmt.format(v)} m`;
const SNAP_PX = 14;

/**
 * Ferramenta de medição: dois cliques sobre o modelo.
 * Um clique é ignorado se o mouse arrastou (para não brigar com a navegação).
 */
export class MeasureTool {
  active = false;
  onChange: (m: Measurement | null, pending: boolean) => void = () => {};

  private group = new THREE.Group();
  private first: THREE.Vector3 | null = null;
  private down: { x: number; y: number } | null = null;
  private markerRadius = 0.05;

  constructor(private readonly viewer: Viewer) {
    viewer.overlay.add(this.group);
    const c = viewer.canvas;
    c.addEventListener("pointerdown", (e) => (this.down = { x: e.clientX, y: e.clientY }));
    c.addEventListener("pointerup", (e) => this.onPointerUp(e));
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.active) this.clear();
    });
  }

  /** Ajusta o tamanho dos marcadores ao tamanho do modelo. */
  setScale(modelSize: number): void {
    this.markerRadius = Math.max(modelSize * 0.004, 0.01);
  }

  setActive(on: boolean): void {
    this.active = on;
    this.viewer.canvas.style.cursor = on ? "crosshair" : "";
    if (!on) this.clear();
  }

  clear(): void {
    this.first = null;
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
    }
    this.viewer.invalidate();
    this.onChange(null, false);
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.active || e.button !== 0 || !this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved > 4) return;

    const hit = this.viewer.pick(e.clientX, e.clientY);
    if (!hit) return;
    // Gruda no canto visível mais próximo (até SNAP_PX). Alt/Option desliga.
    const p = e.altKey ? hit.point.clone() : this.snap(hit, e.clientX, e.clientY);

    if (!this.first || this.group.children.length > 1) {
      this.clear();
      this.first = p;
      this.group.add(this.marker(p));
      this.viewer.invalidate();
      this.onChange(null, true);
      return;
    }

    const a = this.first;
    const b = p;
    this.group.add(this.marker(b));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a, b]),
      new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }),
    );
    line.renderOrder = 10;
    this.group.add(line);

    const distance = a.distanceTo(b);
    const el = document.createElement("div");
    el.className = "measure-label";
    el.textContent = fmtM(distance);
    const label = new CSS2DObject(el);
    label.position.copy(a).add(b).multiplyScalar(0.5);
    this.group.add(label);

    this.first = null;
    this.viewer.invalidate();
    this.onChange({ a, b, distance, delta: b.clone().sub(a) }, false);
  }

  /**
   * Procura o vértice visível mais próximo do cursor (até SNAP_PX) em todas
   * as peças visíveis. Vértices atrás da superfície clicada são ignorados.
   */
  private snap(hit: THREE.Intersection, clientX: number, clientY: number): THREE.Vector3 {
    const cam = this.viewer.camera.position;
    const maxDepth = hit.distance * 1.01 + 0.02;
    let best: THREE.Vector3 | null = null;
    let bestPx = SNAP_PX;
    let bestDepth = Infinity;
    let budget = 2_000_000;
    const w = new THREE.Vector3();

    this.viewer.modelRoot.traverseVisible((o) => {
      if (!(o instanceof THREE.Mesh) || budget <= 0) return;
      const pos = (o.geometry as THREE.BufferGeometry).attributes.position;
      if (!pos) return;
      budget -= pos.count;
      for (let i = 0; i < pos.count; i++) {
        w.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const depth = w.distanceTo(cam);
        if (depth > maxDepth) continue;
        const s = this.viewer.toScreen(w);
        if (s.behind) continue;
        const d = Math.hypot(s.x - clientX, s.y - clientY);
        // Cantos quase sobrepostos na tela (≤ 2 px): fica o mais próximo da câmera.
        const better = best ? d < bestPx - 2 || (Math.abs(d - bestPx) <= 2 && depth < bestDepth) : d < bestPx;
        if (better) {
          bestPx = d;
          bestDepth = depth;
          best = w.clone();
        }
      }
    });
    return best ?? hit.point.clone();
  }

  private marker(p: THREE.Vector3): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(this.markerRadius, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false }),
    );
    m.renderOrder = 11;
    m.position.copy(p);
    return m;
  }
}
