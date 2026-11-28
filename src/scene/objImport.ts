import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { originOffset, transformBox, UNIT_SCALE, type Box3, type OriginMode, type Unit, type UpAxis } from "./units";

export const PROJECTOR_LAYER = 1;

/** Cores base das superfícies (com ou sem projeção). */
export const SURFACE_COLOR = 0xdcdee3;
export const OTHER_COLOR = 0x5b616b;

export interface ImportOptions {
  unit: Unit;
  up: UpAxis;
  origin: OriginMode;
}

export interface Surface {
  id: number;
  name: string;
  mesh: THREE.Mesh;
  triangles: number;
  /** recebe projeção */
  projection: boolean;
  visible: boolean;
}

/**
 * Modelo importado. Hierarquia:
 *   root (deslocamento de origem, em m)
 *     └ axis (escala da unidade + rotação Z-up → Y-up)
 *         └ raw (conteúdo do OBJ, nas coordenadas do arquivo)
 */
export class ImportedModel {
  readonly root = new THREE.Group();
  private readonly axis = new THREE.Group();
  readonly surfaces: Surface[] = [];
  readonly rawBox: Box3;
  private edges: THREE.LineSegments[] = [];

  constructor(
    readonly fileName: string,
    private readonly raw: THREE.Group,
    public options: ImportOptions,
  ) {
    this.root.name = "modelo";
    this.axis.add(raw);
    this.root.add(this.axis);

    const b = new THREE.Box3().setFromObject(raw);
    this.rawBox = { min: b.min.toArray(), max: b.max.toArray() };

    let i = 0;
    raw.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const geo = o.geometry as THREE.BufferGeometry;
      if (!geo.attributes.normal) geo.computeVertexNormals();
      // camada 1 = o que as câmeras dos projetores enxergam (mapa de sombra)
      o.layers.enable(PROJECTOR_LAYER);
      const triangles = (geo.index ? geo.index.count : geo.attributes.position!.count) / 3;
      i++;
      this.surfaces.push({
        id: i,
        name: o.name || `Objeto ${i}`,
        mesh: o,
        triangles,
        projection: true,
        visible: true,
      });
    });

    // Contornos ajudam a ler a geometria; desligados em modelos pesados.
    if (this.triangles <= 300_000) {
      for (const s of this.surfaces) {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(s.mesh.geometry, 25), EDGE_MATERIAL);
        e.raycast = () => {};
        s.mesh.add(e);
        this.edges.push(e);
      }
    }

    this.refreshMaterials();
    this.apply(options);
  }

  get triangles(): number {
    return this.surfaces.reduce((n, s) => n + s.triangles, 0);
  }

  /** Aplica unidade, eixo e origem. */
  apply(options: ImportOptions): void {
    this.options = options;
    const s = UNIT_SCALE[options.unit];
    this.axis.scale.setScalar(s);
    this.axis.rotation.set(options.up === "Z" ? -Math.PI / 2 : 0, 0, 0);
    const off = originOffset(this.sceneBoxNoOrigin(), options.origin);
    this.root.position.set(...off);
    this.root.updateMatrixWorld(true);
  }

  /** Caixa na cena antes do deslocamento de origem. */
  private sceneBoxNoOrigin(): Box3 {
    return transformBox(this.rawBox, this.options.unit, this.options.up);
  }

  /** Caixa final na cena (m). */
  sceneBox(): Box3 {
    const b = this.sceneBoxNoOrigin();
    const o = this.root.position;
    return {
      min: [b.min[0] + o.x, b.min[1] + o.y, b.min[2] + o.z],
      max: [b.max[0] + o.x, b.max[1] + o.y, b.max[2] + o.z],
    };
  }

  private surfaceMaterial: THREE.Material = SURFACE_MATERIAL;
  private otherMaterial: THREE.Material = OTHER_MATERIAL;

  /** Troca os materiais (ex.: material com projeção). */
  setMaterials(surface: THREE.Material, other: THREE.Material): void {
    this.surfaceMaterial = surface;
    this.otherMaterial = other;
    this.refreshMaterials();
  }

  refreshMaterials(): void {
    for (const s of this.surfaces) {
      s.mesh.material = s.projection ? this.surfaceMaterial : this.otherMaterial;
      s.mesh.visible = s.visible;
    }
  }

  dispose(): void {
    for (const s of this.surfaces) s.mesh.geometry.dispose();
    for (const e of this.edges) e.geometry.dispose();
  }
}

const SURFACE_MATERIAL = new THREE.MeshStandardMaterial({
  color: SURFACE_COLOR,
  roughness: 0.9,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});
const OTHER_MATERIAL = new THREE.MeshStandardMaterial({
  color: OTHER_COLOR,
  roughness: 1,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});
const EDGE_MATERIAL = new THREE.LineBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.45 });

/** Lê o texto de um OBJ. Materiais (.mtl) são ignorados na v1. */
export function parseObj(text: string): THREE.Group {
  const group = new OBJLoader().parse(text);
  let meshes = 0;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes++;
  });
  if (meshes === 0) throw new Error("Nenhuma geometria encontrada no OBJ.");
  return group;
}
