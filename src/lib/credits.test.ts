import { describe, expect, it } from "vitest";
import { PACKS, pricePerPhoto } from "./credits";

const get = (id: string) => PACKS.find((p) => p.id === id)!;

describe("pacotes de créditos", () => {
  it("Iniciante: 25 fotos por R$15 = R$0,60/foto", () => {
    expect(get("iniciante")).toMatchObject({ photos: 25, price: 15 });
    expect(pricePerPhoto(get("iniciante"))).toBe(0.6);
  });
  it("Ensaio Completo: 60 fotos por R$29 ≈ R$0,48/foto", () => {
    expect(get("ensaio")).toMatchObject({ photos: 60, price: 29, popular: true });
    expect(pricePerPhoto(get("ensaio"))).toBe(0.48);
  });
  it("Eventos: 120 fotos por R$49 ≈ R$0,40/foto", () => {
    expect(get("eventos")).toMatchObject({ photos: 120, price: 49 });
    expect(pricePerPhoto(get("eventos"))).toBe(0.4);
  });
});
