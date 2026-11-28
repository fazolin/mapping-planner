import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  applyLensLimits,
  frustumAtNear,
  illuminance,
  imageRect,
  imageSize,
  incidenceAngle,
  onSurface,
  pixelSize,
  toDegrees,
  toRadians,
  type LensSpec,
  type Resolution,
  type Shift,
  type Size2,
} from "../core/optics";
import { aimCenterAt, centerRayLocal, type Vec3 } from "../core/pose";
import { DEFAULT_RESOLUTION, PROJECTOR_COLORS, RESOLUTIONS } from "../core/presets";
import { OTHER_COLOR, PROJECTOR_LAYER, SURFACE_COLOR, type ImportedModel } from "./objImport";
import { createProjectionMaterial, updateProjectionMaterial, type ProjectorBinding } from "./projectionMaterial";
import type { Viewer } from "./viewer";

/** Dados editáveis de um projetor (o que será salvo no projeto). Ângulos em graus, shift em %. */
export interface ProjectorData {
  id: number;
  name: string;
  color: string;
  position: Vec3;
  /** giro (°): 0 = olhando para −Z; positivo vira à esquerda */
  yaw: number;
  /** inclinação (°): positivo aponta para cima */
  pitch: number;
  /** rotação no eixo da lente (°): 90 = retrato */
  roll: number;
  resKey: string;
  lumens: number;
  trMin: number;
  trMax: number;
  tr: number;
  shiftHMax: number;
  shiftVMax: number;
  shiftH: number;
  shiftV: number;
  visible: boolean;
}

export interface ProjectorStats {
  /** o raio central atinge o modelo */
  hit: boolean;
  /** distância da lente ao ponto atingido pelo centro da imagem (m) */
  throwDistance: number;
  /** distância medida ao longo do eixo da lente (base do throw ratio) */
  axisDistance: number;
  image: Size2;
  pixelMm: number;
  lux: number;
  surfaceLux: number;
  surfacePixelMm: number;
  incidenceDeg: number;
  point: THREE.Vector3 | null;
  tr: number;
  shift: Shift;
  warnings: string[];
}

const SHADOW_SIZE = 2048;
const NEAR = 0.05;
const BODY = { w: 0.5, h: 0.18, d: 0.45 };

interface Runtime {
  data: ProjectorData;
  camera: THREE.PerspectiveCamera;
  target: THREE.WebGLRenderTarget;
  pattern: THREE.CanvasTexture;
  patternKey: string;
  group: THREE.Group;
  body: THREE.Mesh;
  frustum: THREE.LineSegments;
  label: CSS2DObject;
  binding: ProjectorBinding;
  stats: ProjectorStats;
}

export class ProjectorSystem {
  /** corpos + frustums (fora do modelo, para não fazer sombra) */
  readonly group = new THREE.Group();
  private items: Runtime[] = [];
  private nextId = 1;
  private model: ImportedModel | null = null;
  private surfaceMat: THREE.ShaderMaterial | null = null;
  private otherMat: THREE.ShaderMaterial | null = null;
  private depthDirty = true;
  private readonly depthMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  private readonly raycaster = new THREE.Raycaster();
  selectedId: number | null = null;
  /** avisa a interface quando algo muda */
  onChange: () => void = () => {};

  constructor(private readonly viewer: Viewer) {
    this.group.name = "projetores";
    viewer.scene.add(this.group);
    viewer.frameExtras.push(this.group);
    viewer.beforeRender.push(() => this.renderDepth());
    this.rebuildMaterials();
  }

  get list(): readonly ProjectorData[] {
    return this.items.map((r) => r.data);
  }

  get(id: number): ProjectorData | undefined {
    return this.items.find((r) => r.data.id === id)?.data;
  }

  stats(id: number): ProjectorStats | undefined {
    return this.items.find((r) => r.data.id === id)?.stats;
  }

  /** Objeto 3D do projetor (para as setas de mover). */
  object(id: number): THREE.Object3D | undefined {
    return this.items.find((r) => r.data.id === id)?.group;
  }

  private sceneSize(): number {
    const s = this.viewer.modelBox().getSize(new THREE.Vector3());
    return Math.max(s.x, s.y, s.z, 10);
  }

  // --- modelo ----------------------------------------------------------------

  setModel(model: ImportedModel | null): void {
    this.model = model;
    this.applyMaterials();
    this.modelChanged();
  }

  /** Chamar quando o modelo muda (escala, origem, visibilidade). */
  modelChanged(): void {
    for (const r of this.items) this.refresh(r);
    this.depthDirty = true;
    this.viewer.invalidate();
    this.onChange();
  }

  private applyMaterials(): void {
    if (this.model && this.surfaceMat && this.otherMat) this.model.setMaterials(this.surfaceMat, this.otherMat);
  }

  private rebuildMaterials(): void {
    this.surfaceMat?.dispose();
    this.otherMat?.dispose();
    const bindings = this.items.map((r) => r.binding);
    this.surfaceMat = createProjectionMaterial(SURFACE_COLOR, bindings);
    this.otherMat = createProjectionMaterial(OTHER_COLOR, bindings);
    this.applyMaterials();
  }

  // --- criar / editar ----------------------------------------------------------

  add(partial: Partial<ProjectorData> = {}): ProjectorData {
    const id = this.nextId++;
    const data: ProjectorData = { ...this.defaults(id), ...partial, id };
    const camera = new THREE.PerspectiveCamera();
    camera.layers.set(PROJECTOR_LAYER);
    const target = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, {
      depthTexture: new THREE.DepthTexture(SHADOW_SIZE, SHADOW_SIZE, THREE.FloatType),
      depthBuffer: true,
    });

    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(BODY.w, BODY.h, BODY.d).translate(0, 0, BODY.d / 2),
      new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.6 }),
    );
    body.userData.projectorId = id;
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.06, 20).rotateX(Math.PI / 2).translate(0, 0, -0.02),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
    );
    lens.userData.projectorId = id;
    const frustum = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: data.color, transparent: true, opacity: 0.7 }),
    );
    frustum.raycast = () => {};
    const el = document.createElement("div");
    el.className = "projector-label";
    const label = new CSS2DObject(el);
    label.position.set(0, BODY.h, BODY.d / 2);
    group.add(body, lens, frustum, label);
    this.group.add(group);

    const r: Runtime = {
      data,
      camera,
      target,
      pattern: new THREE.CanvasTexture(document.createElement("canvas")),
      patternKey: "",
      group,
      body,
      frustum,
      label,
      binding: {
        viewProj: new THREE.Matrix4(),
        position: new THREE.Vector3(),
        pattern: new THREE.Texture(),
        depth: target.depthTexture!,
        near: NEAR,
        far: 100,
        on: true,
      },
      stats: emptyStats(),
    };
    this.items.push(r);
    this.refresh(r);
    this.rebuildMaterials();
    this.selectedId = id;
    this.depthDirty = true;
    this.viewer.invalidate();
    this.onChange();
    return data;
  }

  duplicate(id: number): ProjectorData | undefined {
    const src = this.get(id);
    if (!src) return;
    const { id: _, ...rest } = src;
    return this.add({
      ...rest,
      name: `${src.name} (cópia)`,
      color: PROJECTOR_COLORS[(this.nextId - 1) % PROJECTOR_COLORS.length]!,
      position: [src.position[0] + 1, src.position[1], src.position[2]],
    });
  }

  remove(id: number): void {
    const i = this.items.findIndex((r) => r.data.id === id);
    if (i < 0) return;
    const [r] = this.items.splice(i, 1);
    this.group.remove(r!.group);
    r!.label.element.remove();
    r!.target.dispose();
    r!.pattern.dispose();
    r!.body.geometry.dispose();
    r!.frustum.geometry.dispose();
    if (this.selectedId === id) this.selectedId = this.items[0]?.data.id ?? null;
    this.rebuildMaterials();
    this.depthDirty = true;
    this.viewer.invalidate();
    this.onChange();
  }

  update(id: number, patch: Partial<ProjectorData>): void {
    const r = this.items.find((x) => x.data.id === id);
    if (!r) return;
    Object.assign(r.data, patch, { id });
    this.refresh(r);
    updateProjectionMaterial(this.surfaceMat!, this.items.map((x) => x.binding));
    updateProjectionMaterial(this.otherMat!, this.items.map((x) => x.binding));
    this.depthDirty = true;
    this.viewer.invalidate();
    this.onChange();
  }

  select(id: number | null): void {
    this.selectedId = id;
    for (const r of this.items) this.styleSelection(r);
    this.viewer.invalidate();
    this.onChange();
  }

  /** Gira o projetor para que o centro da imagem caia no ponto. */
  aimAt(id: number, point: THREE.Vector3): void {
    const r = this.items.find((x) => x.data.id === id);
    if (!r) return;
    const { throwRatio: tr, shift } = this.lensState(r.data);
    const o = aimCenterAt(r.data.position, point.toArray(), toRadians(r.data.roll), tr, this.res(r.data), shift);
    this.update(id, { yaw: round(toDegrees(o.yaw), 2), pitch: round(toDegrees(o.pitch), 2) });
  }

  /** Projetor sob o cursor, se houver. */
  pick(clientX: number, clientY: number): number | null {
    const hit = this.viewer.raycastObject(this.group, clientX, clientY).find((h) => h.object.userData.projectorId);
    return hit ? (hit.object.userData.projectorId as number) : null;
  }

  // --- cálculo e desenho ---------------------------------------------------------

  private defaults(id: number): ProjectorData {
    const box = this.viewer.modelBox();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const tr = 1.5;
    const res = RESOLUTIONS[DEFAULT_RESOLUTION]!;
    // distância para a imagem cobrir ~110% da altura do modelo
    const imageW = (size.y * 1.1 * res.width) / res.height;
    const dist = THREE.MathUtils.clamp(imageW * tr, 3, 60);
    const n = this.items.length;
    const position: Vec3 = [
      round(center.x + n * 1.5, 2),
      round(Math.max(1.2, Math.min(center.y, 3)), 2),
      round(center.z + dist, 2),
    ];
    const o = aimCenterAt(position, center.toArray(), 0, tr, res, { h: 0, v: 0 });
    return {
      id,
      name: `Projetor ${id}`,
      color: PROJECTOR_COLORS[(id - 1) % PROJECTOR_COLORS.length]!,
      position,
      yaw: round(toDegrees(o.yaw), 2),
      pitch: round(toDegrees(o.pitch), 2),
      roll: 0,
      resKey: DEFAULT_RESOLUTION,
      lumens: 10000,
      trMin: 1.2,
      trMax: 2.0,
      tr,
      shiftHMax: 10,
      shiftVMax: 50,
      shiftH: 0,
      shiftV: 0,
      visible: true,
    };
  }

  private res(d: ProjectorData): Resolution {
    return RESOLUTIONS[d.resKey] ?? RESOLUTIONS[DEFAULT_RESOLUTION]!;
  }

  private lens(d: ProjectorData): LensSpec {
    return {
      throwRatio: { min: Math.min(d.trMin, d.trMax), max: Math.max(d.trMin, d.trMax) },
      shiftH: { min: -d.shiftHMax / 100, max: d.shiftHMax / 100 },
      shiftV: { min: -d.shiftVMax / 100, max: d.shiftVMax / 100 },
    };
  }

  private lensState(d: ProjectorData) {
    return applyLensLimits(this.lens(d), d.tr, { h: d.shiftH / 100, v: d.shiftV / 100 });
  }

  private refresh(r: Runtime): void {
    const d = r.data;
    const res = this.res(d);
    const check = this.lensState(d);
    const tr = check.throwRatio;
    const shift = check.shift;

    // pose
    r.group.position.set(...d.position);
    r.group.rotation.set(toRadians(d.pitch), toRadians(d.yaw), toRadians(d.roll), "YXZ");
    r.group.visible = d.visible;
    r.group.updateMatrixWorld(true);

    // câmera do projetor (frustum assimétrico pelo shift)
    const far = this.sceneSize() * 6 + 50;
    const f = frustumAtNear(NEAR, tr, res, shift);
    r.camera.position.copy(r.group.position);
    r.camera.quaternion.copy(r.group.quaternion);
    r.camera.updateMatrixWorld(true);
    r.camera.projectionMatrix.makePerspective(f.left, f.right, f.top, f.bottom, NEAR, far);
    r.camera.projectionMatrixInverse.copy(r.camera.projectionMatrix).invert();
    r.binding.viewProj = new THREE.Matrix4().multiplyMatrices(r.camera.projectionMatrix, r.camera.matrixWorldInverse);
    r.binding.position = r.group.position.clone();
    r.binding.far = far;
    r.binding.on = d.visible;

    // padrão de teste
    const key = `${d.name}|${d.color}|${d.resKey}`;
    if (key !== r.patternKey) {
      r.pattern.dispose();
      r.pattern = makePattern(d, res);
      r.patternKey = key;
      (r.body.material as THREE.MeshStandardMaterial).color.set(d.color);
      (r.frustum.material as THREE.LineBasicMaterial).color.set(d.color);
    }
    r.binding.pattern = r.pattern;
    r.label.element.textContent = d.name;

    // números no ponto atingido pelo centro da imagem
    r.stats = this.computeStats(r, tr, shift, res, check.warnings);

    // linhas do frustum até o ponto atingido (ou a uma distância padrão)
    const L = r.stats.hit ? r.stats.axisDistance : this.sceneSize() * 0.6;
    const q = imageRect(1, tr, res, shift);
    const c = [
      [q.left, q.bottom],
      [q.right, q.bottom],
      [q.right, q.top],
      [q.left, q.top],
    ].map(([x, y]) => new THREE.Vector3(x! * L, y! * L, -L));
    const o = new THREE.Vector3();
    const pts = [o, c[0]!, o, c[1]!, o, c[2]!, o, c[3]!, c[0]!, c[1]!, c[1]!, c[2]!, c[2]!, c[3]!, c[3]!, c[0]!];
    r.frustum.geometry.dispose();
    r.frustum.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.styleSelection(r);
  }

  private computeStats(r: Runtime, tr: number, shift: Shift, res: Resolution, warnings: string[]): ProjectorStats {
    const d = r.data;
    const local = centerRayLocal(tr, res, shift);
    const dir = new THREE.Vector3(...local).applyQuaternion(r.group.quaternion).normalize();
    const axis = new THREE.Vector3(0, 0, -1).applyQuaternion(r.group.quaternion);
    this.raycaster.set(r.group.position, dir);
    const hit = this.model
      ? this.raycaster.intersectObject(this.model.root, true).find((h) => h.object.visible)
      : undefined;

    const base = { ...emptyStats(), tr, shift, warnings: [...warnings] };
    if (!hit || !hit.face) {
      base.warnings.push("O centro da imagem não atinge o modelo.");
      return base;
    }
    const axisDistance = hit.point.clone().sub(r.group.position).dot(axis);
    const image = imageSize(axisDistance, tr, res);
    const px = pixelSize(image.width, res);
    const lux = illuminance(d.lumens, image);
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const inc = incidenceAngle(dir.toArray(), normal.toArray());
    const surf = onSurface(lux, px, inc);
    if (toDegrees(inc) > 60) base.warnings.push(`Ângulo de incidência alto (${Math.round(toDegrees(inc))}°): imagem esticada e mais escura.`);
    return {
      ...base,
      hit: true,
      throwDistance: hit.distance,
      axisDistance,
      image,
      pixelMm: px * 1000,
      lux,
      surfaceLux: surf.lux,
      surfacePixelMm: surf.pixelSizeMax * 1000,
      incidenceDeg: toDegrees(inc),
      point: hit.point.clone(),
    };
  }

  private styleSelection(r: Runtime): void {
    const sel = r.data.id === this.selectedId;
    (r.frustum.material as THREE.LineBasicMaterial).opacity = sel ? 1 : 0.45;
    (r.body.material as THREE.MeshStandardMaterial).emissive.set(sel ? 0x333333 : 0x000000);
    r.label.element.classList.toggle("selected", sel);
  }

  private renderDepth(): void {
    if (!this.depthDirty) return;
    this.depthDirty = false;
    const { renderer, scene } = this.viewer;
    const prevTarget = renderer.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    scene.overrideMaterial = this.depthMaterial;
    scene.background = null;
    for (const r of this.items) {
      if (!r.data.visible) continue;
      renderer.setRenderTarget(r.target);
      renderer.clear();
      renderer.render(scene, r.camera);
    }
    renderer.setRenderTarget(prevTarget);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
  }
}

function emptyStats(): ProjectorStats {
  return {
    hit: false,
    throwDistance: 0,
    axisDistance: 0,
    image: { width: 0, height: 0 },
    pixelMm: 0,
    lux: 0,
    surfaceLux: 0,
    surfacePixelMm: 0,
    incidenceDeg: 0,
    point: null,
    tr: 0,
    shift: { h: 0, v: 0 },
    warnings: [],
  };
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Padrão de teste: área tingida, grade, borda, cruz central e nome. */
function makePattern(d: ProjectorData, res: Resolution): THREE.CanvasTexture {
  const W = 1024;
  const H = Math.round((W * res.height) / res.width);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.35;
  g.fillStyle = d.color;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;

  g.strokeStyle = d.color;
  g.lineWidth = 2;
  const cols = 16;
  const rows = Math.round(cols * (H / W));
  g.beginPath();
  for (let i = 1; i < cols; i++) {
    g.moveTo((i * W) / cols, 0);
    g.lineTo((i * W) / cols, H);
  }
  for (let j = 1; j < rows; j++) {
    g.moveTo(0, (j * H) / rows);
    g.lineTo(W, (j * H) / rows);
  }
  g.stroke();

  g.strokeStyle = "#fff";
  g.lineWidth = 10;
  g.strokeRect(5, 5, W - 10, H - 10);
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(W / 2 - 40, H / 2);
  g.lineTo(W / 2 + 40, H / 2);
  g.moveTo(W / 2, H / 2 - 40);
  g.lineTo(W / 2, H / 2 + 40);
  g.stroke();
  g.beginPath();
  g.arc(W / 2, H / 2, Math.min(W, H) * 0.35, 0, Math.PI * 2);
  g.stroke();

  g.fillStyle = "#fff";
  g.font = "bold 44px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText(d.name, W / 2, H * 0.2);
  g.font = "30px system-ui, sans-serif";
  g.fillText(`${res.width}×${res.height}`, W / 2, H * 0.2 + 42);

  const t = new THREE.CanvasTexture(cv);
  t.flipY = true;
  return t;
}
