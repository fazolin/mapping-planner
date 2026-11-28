import * as THREE from "three";

/**
 * Material das superfícies do modelo que recebe a projeção de N projetores
 * (projective texture mapping + sombra por mapa de profundidade).
 *
 * O shader é gerado com N fixo (um bloco por projetor, sem arrays de
 * samplers). Quando o número de projetores muda, cria-se um material novo.
 */

export interface ProjectorBinding {
  /** projeção × view do projetor */
  viewProj: THREE.Matrix4;
  position: THREE.Vector3;
  pattern: THREE.Texture;
  depth: THREE.Texture;
  near: number;
  far: number;
  on: boolean;
}

const VERTEX = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

function fragment(n: number): string {
  let decl = "";
  let body = "";
  if (n > 0) {
    decl = `
uniform mat4 projMatrix[${n}];
uniform vec3 projPos[${n}];
uniform float projNear[${n}];
uniform float projFar[${n}];
uniform float projOn[${n}];
${Array.from({ length: n }, (_, i) => `uniform sampler2D projPattern${i};\nuniform sampler2D projDepth${i};`).join("\n")}
`;
    for (let i = 0; i < n; i++) {
      body += `
  {
    vec4 c = projMatrix[${i}] * vec4(vWorldPos, 1.0);
    if (projOn[${i}] > 0.5 && c.w > 0.0) {
      vec3 ndc = c.xyz / c.w;
      if (abs(ndc.x) <= 1.0 && abs(ndc.y) <= 1.0 && ndc.z <= 1.0) {
        vec2 uv = ndc.xy * 0.5 + 0.5;
        float sd = texture2D(projDepth${i}, uv).r;
        float nn = projNear[${i}];
        float ff = projFar[${i}];
        float shadowLin = (2.0 * nn * ff) / (ff + nn - (2.0 * sd - 1.0) * (ff - nn));
        vec3 L = normalize(projPos[${i}] - vWorldPos);
        float cosI = abs(dot(N, L));
        float bias = 0.01 + 0.003 * c.w * (1.0 + 3.0 * (1.0 - cosI));
        if (c.w <= shadowLin + bias) {
          col += texture2D(projPattern${i}, uv).rgb * (0.35 + 0.65 * cosI);
        }
      }
    }
  }`;
    }
  }
  return /* glsl */ `
uniform vec3 baseColor;
uniform vec3 lightDir;
uniform float ambient;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
${decl}
void main() {
  vec3 N = normalize(vWorldNormal);
  float diff = 0.45 + 0.55 * abs(dot(N, normalize(lightDir)));
  vec3 col = baseColor * diff * ambient;
${body}
  gl_FragColor = vec4(col, 1.0);
}`;
}

export function createProjectionMaterial(base: THREE.ColorRepresentation, bindings: ProjectorBinding[]): THREE.ShaderMaterial {
  const n = bindings.length;
  const uniforms: Record<string, THREE.IUniform> = {
    baseColor: { value: new THREE.Color(base) },
    lightDir: { value: new THREE.Vector3(0.5, 1, 0.7) },
    ambient: { value: n > 0 ? 0.45 : 1 },
  };
  if (n > 0) {
    uniforms.projMatrix = { value: bindings.map((b) => b.viewProj) };
    uniforms.projPos = { value: bindings.map((b) => b.position) };
    uniforms.projNear = { value: bindings.map((b) => b.near) };
    uniforms.projFar = { value: bindings.map((b) => b.far) };
    uniforms.projOn = { value: bindings.map((b) => (b.on ? 1 : 0)) };
    bindings.forEach((b, i) => {
      uniforms[`projPattern${i}`] = { value: b.pattern };
      uniforms[`projDepth${i}`] = { value: b.depth };
    });
  }
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: fragment(n),
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

/** Atualiza os uniforms sem recompilar (mesmo número de projetores). */
export function updateProjectionMaterial(mat: THREE.ShaderMaterial, bindings: ProjectorBinding[]): void {
  const u = mat.uniforms;
  if (!u.projMatrix) return;
  bindings.forEach((b, i) => {
    (u.projMatrix!.value as THREE.Matrix4[])[i] = b.viewProj;
    (u.projPos!.value as THREE.Vector3[])[i] = b.position;
    (u.projNear!.value as number[])[i] = b.near;
    (u.projFar!.value as number[])[i] = b.far;
    (u.projOn!.value as number[])[i] = b.on ? 1 : 0;
    u[`projPattern${i}`]!.value = b.pattern;
    u[`projDepth${i}`]!.value = b.depth;
  });
}
