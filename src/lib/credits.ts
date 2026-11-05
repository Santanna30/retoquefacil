export type CreditPack = { id: string; name: string; photos: number; price: number; perPhoto: number; popular?: boolean };

export const PACKS: CreditPack[] = [
  { id: "iniciante", name: "Iniciante", photos: 25, price: 15, perPhoto: 0.6 },
  { id: "ensaio", name: "Ensaio Completo", photos: 60, price: 29, perPhoto: 0.48, popular: true },
  { id: "eventos", name: "Fotógrafo de Eventos", photos: 120, price: 49, perPhoto: 0.4 },
];

export const pricePerPhoto = (p: CreditPack) => p.perPhoto;

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const FREE_CREDITS = 5;
export const STORAGE_KEY = "skinretouch.credits";
