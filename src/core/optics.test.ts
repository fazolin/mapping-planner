import { describe, expect, it } from "vitest";
import {
  applyLensLimits,
  aspectRatio,
  distanceForHeight,
  distanceForWidth,
  distanceRange,
  fieldOfView,
  frustumAtNear,
  illuminance,
  imageRect,
  imageSize,
  imageWidthRange,
  incidenceAngle,
  luminance,
  onSurface,
  pixelDensity,
  pixelSize,
  shiftFromPercentOfHalfImage,
  shiftFromPercentOfImage,
  throwRatioFor,
  throwRatioFromHorizontalFov,
  toDegrees,
  toRadians,
  type LensSpec,
} from "./optics";

// Casos de referência calculados à mão. Precisão: 6 casas.
const FULL_HD = { width: 1920, height: 1080 };
const WUXGA = { width: 1920, height: 1200 };
const P = 6;

describe("throw ratio, distância e tamanho", () => {
  it("aspecto", () => {
    expect(aspectRatio(FULL_HD)).toBeCloseTo(0.5625, P);
    expect(aspectRatio(WUXGA)).toBeCloseTo(0.625, P);
  });

  it("TR 1.5 a 6 m → imagem 4 × 2,25 m (Full HD)", () => {
    const s = imageSize(6, 1.5, FULL_HD);
    expect(s.width).toBeCloseTo(4, P);
    expect(s.height).toBeCloseTo(2.25, P);
  });

  it("inversas: distância ↔ largura ↔ throw ratio", () => {
    expect(distanceForWidth(4, 1.5)).toBeCloseTo(6, P);
    expect(throwRatioFor(6, 4)).toBeCloseTo(1.5, P);
    // altura 2,5 m em WUXGA → largura 4 m → 4 × 0,8 = 3,2 m
    expect(distanceForHeight(2.5, 0.8, WUXGA)).toBeCloseTo(3.2, P);
  });

  it("lente zoom 1.2–2.0", () => {
    const lens: LensSpec = {
      throwRatio: { min: 1.2, max: 2.0 },
      shiftH: { min: -0.1, max: 0.1 },
      shiftV: { min: -0.5, max: 0.5 },
    };
    // a 10 m: 10/2.0 = 5 m até 10/1.2 = 8,333 m
    const w = imageWidthRange(10, lens);
    expect(w.min).toBeCloseTo(5, P);
    expect(w.max).toBeCloseTo(8.333333, P);
    // imagem de 5 m: 6 m a 10 m
    const d = distanceRange(5, lens);
    expect(d.min).toBeCloseTo(6, P);
    expect(d.max).toBeCloseTo(10, P);
  });

  it("rejeita valores inválidos", () => {
    expect(() => imageSize(0, 1.5, FULL_HD)).toThrow(RangeError);
    expect(() => imageSize(6, -1, FULL_HD)).toThrow(RangeError);
    expect(() => aspectRatio({ width: 0, height: 1080 })).toThrow(RangeError);
  });
});

describe("lens shift e frustum", () => {
  it("sem shift: imagem centrada no eixo", () => {
    const r = imageRect(6, 1.5, FULL_HD);
    expect(r.left).toBeCloseTo(-2, P);
    expect(r.right).toBeCloseTo(2, P);
    expect(r.bottom).toBeCloseTo(-1.125, P);
    expect(r.top).toBeCloseTo(1.125, P);
  });

  it("shift V +0.5: borda inferior sobre o eixo", () => {
    const r = imageRect(6, 1.5, FULL_HD, { h: 0, v: 0.5 });
    expect(r.bottom).toBeCloseTo(0, P);
    expect(r.top).toBeCloseTo(2.25, P);
  });

  it("shift H −0.25: imagem desloca 1 m para a esquerda", () => {
    const r = imageRect(6, 1.5, FULL_HD, { h: -0.25, v: 0 });
    expect(r.left).toBeCloseTo(-3, P);
    expect(r.right).toBeCloseTo(1, P);
  });

  it("frustum no near = imagem escalada para near", () => {
    const f = frustumAtNear(0.1, 1.5, FULL_HD, { h: 0, v: 0.5 });
    expect(f.left).toBeCloseTo(-0.1 / 3, P);
    expect(f.right).toBeCloseTo(0.1 / 3, P);
    expect(f.bottom).toBeCloseTo(0, P);
    expect(f.top).toBeCloseTo(0.0375, P);
  });

  it("FOV: TR 1.0 → 2·atan(0,5) = 53,1301°", () => {
    const fov = fieldOfView(1, FULL_HD);
    expect(toDegrees(fov.horizontal)).toBeCloseTo(53.130102, 5);
    expect(fov.left).toBeCloseTo(-fov.right, P);
  });

  it("FOV com shift V +0.5: borda inferior a 0°", () => {
    const fov = fieldOfView(1, FULL_HD, { h: 0, v: 0.5 });
    expect(fov.bottom).toBeCloseTo(0, P);
    expect(fov.top).toBeCloseTo(Math.atan(0.5625), P);
  });

  it("FOV → throw ratio (ida e volta)", () => {
    expect(throwRatioFromHorizontalFov(toRadians(53.130102))).toBeCloseTo(1, 5);
    const tr = 1.37;
    expect(throwRatioFromHorizontalFov(fieldOfView(tr, FULL_HD).horizontal)).toBeCloseTo(tr, P);
  });

  it("conversores de shift dos fabricantes", () => {
    expect(shiftFromPercentOfImage(50)).toBeCloseTo(0.5, P);
    expect(shiftFromPercentOfImage(-10)).toBeCloseTo(-0.1, P);
    expect(shiftFromPercentOfHalfImage(100)).toBeCloseTo(0.5, P);
  });
});

describe("pixel, brilho e incidência", () => {
  it("pixel: 4 m / 1920 = 2,0833 mm", () => {
    expect(pixelSize(4, FULL_HD)).toBeCloseTo(0.00208333, 8);
    expect(pixelDensity(4, FULL_HD)).toBeCloseTo(480, P);
  });

  it("lux: 10.000 lm em 4 × 2,25 m = 1.111,1 lx", () => {
    expect(illuminance(10000, { width: 4, height: 2.25 })).toBeCloseTo(1111.111111, 5);
  });

  it("luminância: 1.000 lx, refletância 0,8 → 254,6 nits", () => {
    expect(luminance(1000, 0.8)).toBeCloseTo(254.647909, 5);
  });

  it("incidência: frontal = 0°, 45° e independente do sentido", () => {
    expect(incidenceAngle([0, 0, -1], [0, 0, 1])).toBeCloseTo(0, P);
    expect(toDegrees(incidenceAngle([0, 0, -1], [0, 1, 1]))).toBeCloseTo(45, P);
    expect(toDegrees(incidenceAngle([1, 0, 0], [0, 1, 0]))).toBeCloseTo(90, P);
  });

  it("superfície a 60°: lux pela metade, pixel o dobro", () => {
    const s = onSurface(1000, 0.002, toRadians(60));
    expect(s.lux).toBeCloseTo(500, P);
    expect(s.pixelSizeMax).toBeCloseTo(0.004, P);
    expect(s.stretch).toBeCloseTo(2, P);
  });

  it("incidência rasante não gera infinito no lux", () => {
    const s = onSurface(1000, 0.002, toRadians(90));
    expect(s.lux).toBe(0);
    expect(s.stretch).toBe(Infinity);
  });
});

describe("limites da lente", () => {
  const lens: LensSpec = {
    throwRatio: { min: 1.2, max: 2.0 },
    shiftH: { min: -0.1, max: 0.1 },
    shiftV: { min: -0.5, max: 0.5 },
  };

  it("dentro da faixa: nada muda", () => {
    const r = applyLensLimits(lens, 1.5, { h: 0.05, v: 0.3 });
    expect(r.clamped).toBe(false);
    expect(r.throwRatio).toBe(1.5);
    expect(r.warnings).toHaveLength(0);
  });

  it("fora da faixa: limita e avisa", () => {
    const r = applyLensLimits(lens, 2.5, { h: 0.2, v: -0.6 });
    expect(r.clamped).toBe(true);
    expect(r.throwRatio).toBe(2.0);
    expect(r.shift).toEqual({ h: 0.1, v: -0.5 });
    expect(r.warnings).toHaveLength(3);
  });

  it("lente fixa", () => {
    const fixed: LensSpec = { ...lens, throwRatio: { min: 0.8, max: 0.8 } };
    expect(applyLensLimits(fixed, 1.0).throwRatio).toBe(0.8);
  });
});
