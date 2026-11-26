import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

export type ViewPreset = "perspectiva" | "frente" | "topo" | "lado";

/** Visualizador 3D: renderer, câmera, navegação, grade e luzes. Unidades em metros, Y para cima. */
export class Viewer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labels: CSS2DRenderer;
  readonly controls: OrbitControls;
  /** onde fica o modelo importado */
  readonly modelRoot = new THREE.Group();
  /** objetos auxiliares (medições etc.) */
  readonly overlay = new THREE.Group();

  private grid: THREE.GridHelper | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ro: ResizeObserver;
  private frame = 0;
  private dirty = true;

  constructor(private readonly container: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 5000);
    this.camera.position.set(12, 8, 16);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "labels-layer";
    container.appendChild(this.labels.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener("change", () => this.invalidate());

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.6, 1, 0.8);
    this.scene.add(sun);
    this.scene.add(this.modelRoot, this.overlay);
    this.scene.add(new THREE.AxesHelper(1));

    this.applyTheme();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.applyTheme());

    this.setGrid(20);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.loop();
  }

  private applyTheme(): void {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    this.scene.background = new THREE.Color(dark ? 0x14161b : 0xe9ebef);
    if (this.grid) this.setGrid(this.gridSize);
    this.invalidate();
  }

  private gridSize = 20;

  /** Grade no chão com células de 1 m (ou 10 m em cenas muito grandes). */
  setGrid(size: number): void {
    this.gridSize = size;
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
    }
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const cell = size > 200 ? 10 : 1;
    const n = Math.max(2, Math.ceil(size / cell));
    this.grid = new THREE.GridHelper(n * cell, n, dark ? 0x4b5563 : 0x9ca3af, dark ? 0x262a33 : 0xd1d5db);
    this.scene.add(this.grid);
    this.invalidate();
  }

  get gridCell(): number {
    return this.gridSize > 200 ? 10 : 1;
  }

  invalidate(): void {
    this.dirty = true;
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.invalidate();
  }

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    this.controls.update();
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };

  modelBox(): THREE.Box3 {
    const box = new THREE.Box3().setFromObject(this.modelRoot);
    if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
    return box;
  }

  /** Enquadra o modelo numa vista pronta. */
  setView(view: ViewPreset): void {
    const box = this.modelBox();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.5);
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.05;

    const dir = {
      perspectiva: new THREE.Vector3(0.6, 0.45, 1),
      frente: new THREE.Vector3(0, 0, 1),
      topo: new THREE.Vector3(0, 1, 0.0001),
      lado: new THREE.Vector3(1, 0, 0),
    }[view].normalize();

    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.near = Math.max(dist / 1000, 0.01);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
    this.invalidate();
  }

  /** Primeiro ponto do modelo sob o cursor. */
  pick(clientX: number, clientY: number): THREE.Intersection | null {
    return this.pickAll(clientX, clientY)[0] ?? null;
  }

  /** Todos os pontos do modelo sob o cursor, do mais próximo ao mais distante. */
  pickAll(clientX: number, clientY: number): THREE.Intersection[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObject(this.modelRoot, true).filter((h) => h.object.visible);
  }

  /** Posição em pixels (cliente) de um ponto do mundo. */
  toScreen(world: THREE.Vector3): { x: number; y: number; behind: boolean } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const s = world.clone().project(this.camera);
    return {
      x: rect.left + ((s.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - s.y) / 2) * rect.height,
      behind: s.z > 1,
    };
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
