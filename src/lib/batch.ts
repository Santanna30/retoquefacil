import { defaultSettings, processImage, type Settings } from "./retouch";

export const MAX_PHOTOS = 50;

export const SKIN_KEYS: (keyof Settings)[] = [
  "blemish", "darkCircles", "preserveFreckles", "smoothing", "texture", "evenTone",
  "shine", "dodgeBurn", "radius", "maskTolerance", "brightness", "warmth", "saturation", "sharpen",
];
export const STUDIO_KEYS: (keyof Settings)[] = [
  "backdropEven", "creases", "extend", "floorClean", "preserveShadows", "floorReflect", "autoClean",
];

export function syncSettings(source: Settings, target: Settings, skin: boolean, studio: boolean): Settings {
  const keys = [...(skin ? SKIN_KEYS : []), ...(studio ? STUDIO_KEYS : [])];
  const out = { ...defaultSettings, ...target };
  for (const k of keys) (out as Record<string, unknown>)[k] = source[k];
  return out;
}

export function renderPhoto(url: string, settings: Settings, maxSide = 2000): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const src = document.createElement("canvas");
      src.width = Math.round(img.width * s); src.height = Math.round(img.height * s);
      src.getContext("2d")!.drawImage(img, 0, 0, src.width, src.height);
      const out = document.createElement("canvas");
      processImage(src, out, settings, false);
      out.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), "image/jpeg", 0.92);
    };
    img.onerror = reject;
    img.src = url;
  });
}
