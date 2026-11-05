export type Settings = {
  blemish: number; // 0-100
  darkCircles: number;
  preserveFreckles: boolean;
  smoothing: number;
  texture: number;
  evenTone: number;
  shine: number;
  dodgeBurn: number;
  // studio
  backdropEven: boolean;
  creases: number;
  extend: number;
  floorClean: number;
  preserveShadows: boolean;
  floorReflect: number;
  autoClean: boolean;
  // advanced
  radius: number; // 1-20 px
  maskTolerance: number; // 0-100
  brightness: number; // -50..50
  warmth: number;
  saturation: number;
  sharpen: number; // 0-100
};

export const defaultSettings: Settings = {
  blemish: 0,
  darkCircles: 0,
  preserveFreckles: true,
  smoothing: 0,
  texture: 0,
  evenTone: 0,
  shine: 0,
  dodgeBurn: 0,
  backdropEven: false,
  creases: 0,
  extend: 0,
  floorClean: 0,
  preserveShadows: true,
  floorReflect: 0,
  autoClean: false,
  radius: 6,
  maskTolerance: 50,
  brightness: 0,
  warmth: 0,
  saturation: 0,
  sharpen: 0,
};

/** Soft skin probability from YCbCr chroma. */
function skinProb(r: number, g: number, b: number, tol: number) {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const dcb = (cb - 108) / (14 + tol * 12);
  const dcr = (cr - 150) / (10 + tol * 10);
  const d = dcb * dcb + dcr * dcr;
  return Math.max(0, Math.min(1, 1.5 - d));
}

function blurData(src: HTMLCanvasElement, px: number) {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(src, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height).data;
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export function processImage(
  src: HTMLCanvasElement,
  out: HTMLCanvasElement,
  s: Settings,
  showMask = false,
  brush?: Uint8ClampedArray | null,
) {
  const w = src.width, h = src.height;
  out.width = w; out.height = h;
  const o = src.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const bl = blurData(src, s.radius);
  const big = blurData(src, Math.max(12, Math.round(Math.max(w, h) / 60)));

  const studio = s.backdropEven || s.creases || s.extend || s.floorClean || s.floorReflect || s.autoClean || !!brush;
  const huge = studio ? blurData(src, Math.max(30, Math.round(Math.max(w, h) / 14))) : big;
  const edgeBand = 0.12 * Math.min(w, h);
  const res = new ImageData(w, h);
  const r = res.data;
  const strength = s.smoothing / 100;
  const tex = s.texture / 100;
  const tol = s.maskTolerance / 100;
  const sharp = (s.sharpen / 100) * 1.2;
  const blem = s.blemish / 100;
  const dc = s.darkCircles / 100;
  const even = s.evenTone / 100;
  const shine = s.shine / 100;
  const db = s.dodgeBurn / 100;
  const bright = s.brightness * 0.8;
  const warm = s.warmth * 0.5;
  const sat = 1 + s.saturation / 100;

  for (let i = 0; i < o.length; i += 4) {
    const R = o[i]!, G = o[i + 1]!, B = o[i + 2]!;
    const bR = bl[i]!, bG = bl[i + 1]!, bB = bl[i + 2]!;
    const gR = big[i]!, gG = big[i + 1]!, gB = big[i + 2]!;
    const m = skinProb(bR, bG, bB, tol);
    if (showMask) {
      const v = m * 255;
      r[i] = v * 0.9 + R * 0.1; r[i + 1] = v * 0.4 + G * 0.1; r[i + 2] = v * 0.3 + B * 0.1; r[i + 3] = 255;
      continue;
    }
    let nr = R, ng = G, nb = B;
    const L = lum(R, G, B), gL = lum(gR, gG, gB);

    if (m > 0) {
      // blemishes: local dark/red spots pulled to the surrounding skin
      if (blem > 0) {
        const spot = gL - L; // positive = darker than surroundings
        const redness = (R - G) - (gR - gG); // positive = redder than surroundings
        let wgt = Math.max(0, Math.min(1, (spot - 4) / 22));
        if (s.preserveFreckles) wgt *= Math.max(0, Math.min(1, redness / 12));
        else wgt = Math.max(wgt, Math.max(0, Math.min(1, redness / 14)));
        const a = wgt * blem * m;
        nr += (gR - nr) * a; ng += (gG - ng) * a; nb += (gB - nb) * a;
      }
      // dark circles: lift shadows below local average
      if (dc > 0) {
        const lift = Math.max(0, gL - L) * dc * m * 0.9;
        nr += lift * 1.05; ng += lift; nb += lift * 0.92;
      }
      // smoothing
      const a = m * strength;
      nr += (bR - nr) * a; ng += (bG - ng) * a; nb += (bB - nb) * a;
      // texture back in
      const k = a * tex;
      nr += (R - bR) * k; ng += (G - bG) * k; nb += (B - bB) * k;
      // even tone: replace local chroma with wide-area chroma
      if (even > 0) {
        const nl = lum(nr, ng, nb), e = even * m;
        nr += (gR - gL - (nr - nl)) * e; ng += (gG - gL - (ng - nl)) * e; nb += (gB - gL - (nb - nl)) * e;
      }
      // shine reduction: compress highlights
      if (shine > 0) {
        const nl = lum(nr, ng, nb);
        const over = Math.max(0, nl - Math.max(150, gL)) * shine * m * 0.8;
        nr -= over * 0.95; ng -= over; nb -= over * 1.05;
      }
      // subtle dodge & burn: enhance large-scale light shape
      if (db > 0) {
        const d = (gL - 128) * db * m * 0.22;
        nr += d; ng += d; nb += d;
      }
      // tone
      nr += (bright + warm) * m; ng += bright * m; nb += (bright - warm) * m;
      if (sat !== 1) {
        const l = lum(nr, ng, nb), f = 1 + (sat - 1) * m;
        nr = l + (nr - l) * f; ng = l + (ng - l) * f; nb = l + (nb - l) * f;
      }
    }
    // studio backdrop & floor (non-skin, low-saturation areas)
    if (studio) {
      const px = (i >> 2) % w, py = (i >> 2) / w | 0;
      const hR = huge[i]!, hG = huge[i + 1]!, hB = huge[i + 2]!;
      const chroma = Math.max(bR, bG, bB) - Math.min(bR, bG, bB);
      const bg = (1 - m) * Math.max(0, Math.min(1, 1 - (chroma - 18) / 40));
      const mix = (tR: number, tG: number, tB: number, a: number) => {
        if (a <= 0) return; nr += (tR - nr) * a; ng += (tG - ng) * a; nb += (tB - nb) * a;
      };
      if (s.creases) mix(gR, gG, gB, bg * (s.creases / 100) * 0.9);
      if (s.backdropEven) mix(hR, hG, hB, bg * 0.6);
      if (s.extend) {
        const d = Math.min(px, w - px, py, h - py);
        mix(hR, hG, hB, (1 - m) * Math.max(0, 1 - d / edgeBand) * (s.extend / 100));
      }
      const floor = Math.max(0, Math.min(1, (py / h - 0.62) / 0.15));
      if (floor > 0 && s.floorClean) {
        const a = bg * floor * (s.floorClean / 100);
        mix(gR, gG, gB, a); // small marks & dust
        if (!s.preserveShadows) mix(hR, hG, hB, a * 0.8); // also flattens large shadows
      }
      if (floor > 0 && s.floorReflect) {
        const nl = lum(nr, ng, nb), hl = lum(hR, hG, hB);
        const over = Math.max(0, nl - hl) * bg * floor * (s.floorReflect / 100);
        nr -= over; ng -= over; nb -= over;
      }
      if (s.autoClean && L < gL - 14) mix(gR, gG, gB, bg * 0.95);
      if (brush) {
        const a = brush[i + 3]! / 255;
        if (a > 0) mix(hR, hG, hB, a);
      }
    }
    // sharpen outside skin
    const ks = (1 - m) * sharp;
    nr += (R - bR) * ks; ng += (G - bG) * ks; nb += (B - bB) * ks;

    r[i] = nr; r[i + 1] = ng; r[i + 2] = nb; r[i + 3] = 255;
  }
  out.getContext("2d")!.putImageData(res, 0, 0);
}
