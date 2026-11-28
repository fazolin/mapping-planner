import { describe, expect, it } from "vitest";
import { toRadians } from "./optics";
import {
  aimCenterAt,
  axisDirection,
  centerRayDirection,
  rotate,
  yawPitchFromDirection,
  type Vec3,
} from "./pose";

const FULL_HD = { width: 1920, height: 1080 };
const P = 9;

const expectVec = (a: Vec3, b: Vec3, p = P) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, p));
const dir = (from: Vec3, to: Vec3): Vec3 => {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const l = Math.hypot(...d);
  return [d[0] / l, d[1] / l, d[2] / l];
};

describe("orientação", () => {
  it("zero: eixo para −Z", () => {
    expectVec(axisDirection({ yaw: 0, pitch: 0, roll: 0 }), [0, 0, -1]);
  });

  it("giro +90°: olha para −X (vira à esquerda)", () => {
    expectVec(axisDirection({ yaw: toRadians(90), pitch: 0, roll: 0 }), [-1, 0, 0]);
  });

  it("inclinação +30°: aponta para cima", () => {
    const d = axisDirection({ yaw: 0, pitch: toRadians(30), roll: 0 });
    expectVec(d, [0, 0.5, -Math.sqrt(3) / 2]);
  });

  it("rotação 90° (retrato): o 'cima' do projetor vira −X", () => {
    expectVec(rotate({ yaw: 0, pitch: 0, roll: toRadians(90) }, [0, 1, 0]), [-1, 0, 0]);
  });

  it("direção → giro/inclinação (ida e volta)", () => {
    const o = { yaw: toRadians(-35), pitch: toRadians(12), roll: 0 };
    const yp = yawPitchFromDirection(axisDirection(o));
    expect(yp.yaw).toBeCloseTo(o.yaw, P);
    expect(yp.pitch).toBeCloseTo(o.pitch, P);
  });
});

describe("apontar o centro da imagem", () => {
  const pos: Vec3 = [2, 1.2, 10];
  const target: Vec3 = [-1, 4, 0];

  it("sem shift: eixo aponta direto para o alvo", () => {
    const o = aimCenterAt(pos, target, 0, 1.5, FULL_HD, { h: 0, v: 0 });
    expectVec(axisDirection(o), dir(pos, target));
  });

  it("com shift V +50%: o centro da imagem cai no alvo, e o eixo fica abaixo", () => {
    const shift = { h: 0, v: 0.5 };
    const o = aimCenterAt(pos, target, 0, 1.5, FULL_HD, shift);
    expectVec(centerRayDirection(o, 1.5, FULL_HD, shift), dir(pos, target), 7);
    expect(axisDirection(o)[1]).toBeLessThan(dir(pos, target)[1]);
  });

  it("retrato com shift H: centro no alvo", () => {
    const shift = { h: 0.1, v: 0.3 };
    const o = aimCenterAt(pos, target, toRadians(90), 1.2, FULL_HD, shift);
    expectVec(centerRayDirection(o, 1.2, FULL_HD, shift), dir(pos, target), 7);
  });
});
