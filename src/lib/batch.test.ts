import { describe, expect, it } from "vitest";
import { syncSettings } from "./batch";
import { defaultSettings } from "./retouch";

const src = { ...defaultSettings, smoothing: 70, blemish: 40, creases: 80, backdropEven: true };
const tgt = { ...defaultSettings, smoothing: 10, creases: 5 };

describe("sincronizar ajustes", () => {
  it("copia apenas pele quando só pele marcada", () => {
    const r = syncSettings(src, tgt, true, false);
    expect(r.smoothing).toBe(70); expect(r.blemish).toBe(40); expect(r.creases).toBe(5); expect(r.backdropEven).toBe(false);
  });
  it("copia apenas fundo quando só fundo marcado", () => {
    const r = syncSettings(src, tgt, false, true);
    expect(r.smoothing).toBe(10); expect(r.creases).toBe(80); expect(r.backdropEven).toBe(true);
  });
});
