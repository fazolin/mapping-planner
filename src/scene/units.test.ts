import { describe, expect, it } from "vitest";
import { boxSize, guessUnit, originOffset, toScene, transformBox, type Box3 } from "./units";

describe("unidade e eixo", () => {
  it("cm → m, Y para cima", () => {
    expect(toScene([100, 250, -50], "cm", "Y")).toEqual([1, 2.5, -0.5]);
  });

  it("mm → m", () => {
    expect(toScene([1000, 0, 0], "mm", "Y")[0]).toBeCloseTo(1, 9);
  });

  it("Z para cima (Blender/SketchUp) vira Y para cima", () => {
    // ponto 3 m acima do chão e 2 m "para trás" (+Y no Blender)
    const p = toScene([1, 2, 3], "m", "Z");
    expect(p[0]).toBeCloseTo(1, 9);
    expect(p[1]).toBeCloseTo(3, 9);
    expect(p[2]).toBeCloseTo(-2, 9);
  });

  it("caixa de 10 × 4 × 3 m em Z-up mantém as medidas", () => {
    const raw: Box3 = { min: [0, 0, 0], max: [10, 4, 3] };
    const s = boxSize(transformBox(raw, "m", "Z"));
    expect(s[0]).toBeCloseTo(10, 9); // largura
    expect(s[1]).toBeCloseTo(3, 9); // altura
    expect(s[2]).toBeCloseTo(4, 9); // profundidade
  });
});

describe("origem", () => {
  const box: Box3 = { min: [2, 1, -4], max: [6, 5, 0] };

  it("original não desloca", () => {
    expect(originOffset(box, "original")).toEqual([0, 0, 0]);
  });

  it("centro no chão: centraliza X/Z e apoia no Y = 0", () => {
    expect(originOffset(box, "centro-chao")).toEqual([-4, -1, 2]);
  });

  it("centro: centraliza nos três eixos", () => {
    expect(originOffset(box, "centro")).toEqual([-4, -3, 2]);
  });
});

describe("palpite de unidade", () => {
  it("fachada de 20 m em metros", () => {
    expect(guessUnit({ min: [0, 0, 0], max: [20, 12, 1] })).toBe("m");
  });
  it("2.000 → cm", () => {
    expect(guessUnit({ min: [0, 0, 0], max: [2000, 1200, 100] })).toBe("cm");
  });
  it("20.000 → mm", () => {
    expect(guessUnit({ min: [0, 0, 0], max: [20000, 12000, 1000] })).toBe("mm");
  });
});
