import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import sample from "@/assets/sample-portrait.jpg";
import { BatchExportModal, SyncDialog } from "@/components/BatchModals";
import { MAX_PHOTOS, syncSettings } from "@/lib/batch";
import { CreditsModal } from "@/components/CreditsModal";
import { FREE_CREDITS, STORAGE_KEY } from "@/lib/credits";
import { defaultSettings, processImage, type Settings } from "@/lib/retouch";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SkinRetouch AI — Suavização inteligente de pele" },
      { name: "description", content: "Editor profissional de retoque e suavização de pele para fotógrafos, direto no navegador." },
      { property: "og:title", content: "SkinRetouch AI" },
      { property: "og:description", content: "Retoque de pele inteligente com comparação antes e depois." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Editor,
});

type ViewMode = "split" | "edited";
type Photo = { id: string; name: string; url: string; settings: Settings };
const ACCEPT = ["image/jpeg", "image/png"];
const MAX_SIDE = 2000;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function Editor() {
  const srcRef = useRef<HTMLCanvasElement | null>(null);
  const outRef = useRef<HTMLCanvasElement>(null);
  const origRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [photos, setPhotos] = useState<Photo[]>([{ id: "sample", name: "retrato-amostra.jpg", url: sample, settings: defaultSettings }]);
  const [activeId, setActiveId] = useState("sample");
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncOpen, setSyncOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const fileName = photos.find((p) => p.id === activeId)?.name ?? "";
  const [mode, setMode] = useState<ViewMode>("split");
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [holding, setHolding] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [showMask, setShowMask] = useState(false);
  const [busy, setBusy] = useState(false);
  const [panelTab, setPanelTab] = useState<"pele" | "estudio">("pele");
  const [brushOn, setBrushOn] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [maskVersion, setMaskVersion] = useState(0);
  const [detecting, setDetecting] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const brushRef = useRef<HTMLCanvasElement>(null);
  const hasStrokes = useRef(false);
  const brushData = () => {
    const c = brushRef.current;
    if (!c || !hasStrokes.current || !c.width) return null;
    return c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  };
  const clearBrush = () => {
    const c = brushRef.current; if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasStrokes.current = false; setMaskVersion((v) => v + 1);
  };
  const autoDetect = () => {
    setDetecting(true);
    setTimeout(() => { setSettings((x) => ({ ...x, autoClean: true })); setDetecting(false); }, 1800);
  };
  const [online, setOnline] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [credits, setCredits] = useState(FREE_CREDITS);
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyReason, setBuyReason] = useState<string | undefined>();
  useEffect(() => {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v !== null) setCredits(Number(v) || 0);
  }, []);
  const updateCredits = (fn: (c: number) => number) =>
    setCredits((c) => { const n = Math.max(0, fn(c)); localStorage.setItem(STORAGE_KEY, String(n)); return n; });

  const view = useRef({ zoom, offset });
  view.current = { zoom, offset };

  // connection status
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const fit = useCallback((w = size.w, h = size.h) => {
    const el = viewportRef.current;
    if (!el || !w) return;
    const r = el.getBoundingClientRect();
    const z = Math.min((r.width - 64) / w, (r.height - 64) / h);
    setZoom(z);
    setOffset({ x: (r.width - w * z) / 2, y: (r.height - h * z) / 2 });
  }, [size]);

  const zoomTo = (next: number, px?: number, py?: number) => {
    const el = viewportRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = px ?? r.width / 2, cy = py ?? r.height / 2;
    const { zoom: z, offset: o } = view.current;
    const n = clamp(next, 0.05, 8), k = n / z;
    setZoom(n);
    setOffset({ x: cx - (cx - o.x) * k, y: cy - (cy - o.y) * k });
  };

  const loadImage = useCallback((url: string) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      srcRef.current = c;
      const o = origRef.current!;
      o.width = c.width; o.height = c.height;
      o.getContext("2d")!.drawImage(c, 0, 0);
      const bc = brushRef.current;
      if (bc) { bc.width = c.width; bc.height = c.height; }
      hasStrokes.current = false;
      setSize({ w: c.width, h: c.height });
      requestAnimationFrame(() => fit(c.width, c.height));
    };
    img.src = url;
  }, [fit]);

  useEffect(() => { loadImage(sample); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // processing (debounced)
  useEffect(() => {
    if (!srcRef.current || !outRef.current) return;
    setBusy(true);
    const t = setTimeout(() => {
      processImage(srcRef.current!, outRef.current!, settings, showMask, brushData());
      setBusy(false);
    }, 650); // simulated inference latency
    return () => clearTimeout(t);
  }, [settings, size, showMask, maskVersion]);

  const switchPhoto = (id: string, list = photos) => {
    if (id === activeId && list === photos) return;
    const saved = list.map((p) => (p.id === activeId ? { ...p, settings } : p));
    const next = saved.find((p) => p.id === id);
    if (!next) return;
    setPhotos(saved);
    setActiveId(id);
    setSettings(next.settings);
    loadImage(next.url);
  };

  const addFiles = (files: FileList | File[]) => {
    let valid = Array.from(files).filter((f) => ACCEPT.includes(f.type));
    if (!valid.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (valid.length > room) {
      setNotice(`Limite de ${MAX_PHOTOS} fotos por sessão. ${valid.length - Math.max(room, 0)} foto(s) não foram importadas.`);
      setTimeout(() => setNotice(null), 5000);
      valid = valid.slice(0, Math.max(room, 0));
      if (!valid.length) return;
    }
    const added = valid.map((f, i) => ({ id: `${Date.now()}-${i}`, name: f.name, url: URL.createObjectURL(f), settings: defaultSettings }));
    const list = [...photos, ...added];
    setPhotos(list);
    switchPhoto(added[0]!.id, list);
  };

  const removePhoto = (id: string) => {
    if (photos.length === 1) return;
    const list = photos.filter((p) => p.id !== id);
    setPhotos(list);
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    if (id === activeId) { setActiveId(list[0]!.id); setSettings(list[0]!.settings); loadImage(list[0]!.url); }
  };

  // instant CSS preview while the "AI" result is pending
  const studioMock = (settings.creases + settings.floorClean + settings.extend) / 300 + (settings.backdropEven ? 0.3 : 0);
  const mockFilter = busy && !showMask
    ? `blur(${(studioMock * 0.8).toFixed(2)}px) brightness(${1 + settings.floorReflect / -1500 + studioMock * 0.03}) blur(${((settings.smoothing / 100) * settings.radius * 0.35 * (1 - settings.texture / 200)).toFixed(2)}px) brightness(${1 + settings.darkCircles / 900 + settings.dodgeBurn / 1200 - settings.shine / 1000 + settings.brightness / 300}) contrast(${1 - settings.evenTone / 900 - settings.blemish / 1500 + settings.dodgeBurn / 900}) saturate(${1 + settings.saturation / 150 - settings.evenTone / 800})`
    : "none";

  // wheel zoom (non-passive)
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e) => {
    const r = viewportRef.current!.getBoundingClientRect();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    zoomTo(view.current.zoom * Math.exp(-dy * 0.0015), e.clientX - r.left, e.clientY - r.top);
  };
  useEffect(() => {
    const el = viewportRef.current; if (!el) return;
    const fn = (e: WheelEvent) => { e.preventDefault(); wheelRef.current(e); };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, []);

  // keyboard: Space = original, 1 = 100%, F = fit, Y = split view
  const keyActions = useRef({ one: () => {}, fit: () => {}, split: () => {} });
  keyActions.current = { one: () => zoomTo(1), fit: () => fit(), split: () => setMode((m) => (m === "split" ? "edited" : "split")) };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") { e.preventDefault(); setHolding(true); }
      else if (e.key === "1") keyActions.current.one();
      else if (e.key.toLowerCase() === "f") keyActions.current.fit();
      else if (e.key.toLowerCase() === "y") keyActions.current.split();
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setHolding(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // pan + split drag
  const drag = useRef<{ type: "pan" | "split" | "brush"; x: number; y: number; ox: number; oy: number } | null>(null);
  const toImg = (e: React.PointerEvent) => {
    const r = viewportRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - offset.x) / zoom, y: (e.clientY - r.top - offset.y) / zoom };
  };
  const paint = (x: number, y: number, from?: { x: number; y: number }) => {
    const ctx = brushRef.current?.getContext("2d"); if (!ctx) return;
    ctx.strokeStyle = ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.lineCap = "round"; ctx.lineWidth = brushSize;
    ctx.beginPath(); ctx.moveTo(from?.x ?? x, from?.y ?? y); ctx.lineTo(x, y); ctx.stroke();
    hasStrokes.current = true;
  };
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const isHandle = (e.target as HTMLElement).dataset["handle"] === "split";
    const type = isHandle ? "split" : brushOn && e.button === 0 ? "brush" : "pan";
    drag.current = { type, x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    if (type === "brush") { const p = toImg(e); paint(p.x, p.y); lastPt.current = p; }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (brushOn) { const r = viewportRef.current!.getBoundingClientRect(); setCursor({ x: e.clientX - r.left, y: e.clientY - r.top }); }
    const d = drag.current; if (!d) return;
    if (d.type === "brush") { const p = toImg(e); paint(p.x, p.y, lastPt.current ?? undefined); lastPt.current = p; return; }
    if (d.type === "pan") setOffset({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
    else {
      const r = viewportRef.current!.getBoundingClientRect();
      const imgX = (e.clientX - r.left - offset.x) / zoom;
      setSplit(clamp((imgX / size.w) * 100, 0, 100));
    }
  };
  const onPointerUp = () => {
    if (drag.current?.type === "brush") setMaskVersion((v) => v + 1);
    drag.current = null; lastPt.current = null;
  };

  const exportImage = (type: "image/jpeg" | "image/png", quality?: number) => {
    setExportOpen(false);
    if (credits <= 0) {
      setBuyReason("Seu saldo acabou. Adicione créditos para exportar esta foto.");
      setBuyOpen(true);
      return;
    }
    updateCredits((n) => n - 1);
    const c = document.createElement("canvas");
    processImage(srcRef.current!, c, settings, false, brushData());
    const ext = type === "image/png" ? "png" : "jpg";
    c.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = fileName.replace(/\.[^.]+$/, "") + `-retouch.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, type, quality);
  };

  const set = (k: keyof Settings) => (v: number) => setSettings((s) => ({ ...s, [k]: v }));
  const resetKeys = (keys: (keyof Settings)[]) =>
    setSettings((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, defaultSettings[k]])) }));
  const showOriginalFull = holding;
  const clipRight = showOriginalFull ? 0 : mode === "split" ? 100 - split : 100;

  return (
    <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      className="flex h-screen flex-col overflow-hidden bg-background text-foreground select-none">
      <SyncDialog open={syncOpen} count={[...selected].filter((id) => id !== activeId).length} onClose={() => setSyncOpen(false)}
        onApply={(skin, studio) => setPhotos((ps) => ps.map((p) => (selected.has(p.id) && p.id !== activeId ? { ...p, settings: syncSettings(settings, p.settings, skin, studio) } : p)))} />
      <BatchExportModal open={batchOpen} credits={credits} onClose={() => setBatchOpen(false)}
        items={(selected.size ? photos.filter((p) => selected.has(p.id)) : photos).map((p) => (p.id === activeId ? { ...p, settings } : p))}
        onSpend={(n) => updateCredits((c) => c - n)}
        onNeedCredits={() => { setBatchOpen(false); setBuyReason("Saldo insuficiente para exportar o lote."); setBuyOpen(true); }} />
      {notice && <div className="fixed bottom-28 left-1/2 z-40 -translate-x-1/2 rounded-md border border-border bg-popover px-4 py-2 text-xs shadow-xl">{notice}</div>}
      <CreditsModal open={buyOpen} reason={buyReason} onClose={() => setBuyOpen(false)} onPaid={(n) => updateCredits((c) => c + n)} />
      {/* Header */}
      <header className="z-20 flex h-12 shrink-0 items-center justify-between border-b border-border bg-panel px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary text-[11px] font-bold text-primary-foreground">S</div>
          <span className="text-sm font-semibold tracking-tight">SkinRetouch <span className="text-primary">AI</span></span>
          <span className="ml-3 hidden font-mono text-[11px] text-muted-foreground md:inline">{fileName} · {size.w}×{size.h}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-success" : "bg-destructive"}`} />
            {online ? (busy ? "Processando…" : "Conectado") : "Offline"}
          </span>
          <span className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${credits > 0 ? "border-primary/40 bg-primary/10 text-primary" : "border-destructive/50 bg-destructive/10 text-destructive"}`}>
            ⚡ {credits} {credits === 1 ? "foto restante" : "fotos restantes"}
          </span>
          <button onClick={() => { setBuyReason(undefined); setBuyOpen(true); }}
            className="h-8 rounded-md border border-input px-3 text-xs text-foreground transition hover:bg-accent">+ Adicionar créditos</button>
          <span className="mx-1 h-5 w-px bg-border" />
          <HBtn onClick={() => fileRef.current?.click()}>Abrir foto</HBtn>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={(e) => {
            if (e.target.files) addFiles(e.target.files); e.target.value = "";
          }} />
          <HBtn onClick={() => setMode(mode === "split" ? "edited" : "split")} active={mode === "split"}>
            {mode === "split" ? "Antes / Depois" : "Somente editada"}
          </HBtn>
          <div className="relative">
            <button onClick={() => setExportOpen((o) => !o)} className="h-8 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:brightness-110">
              Exportar ▾
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-10 w-52 rounded-md border border-border bg-popover p-1 text-xs shadow-2xl">
                {[
                  ["JPEG · Máxima (100%)", () => exportImage("image/jpeg", 1)],
                  ["JPEG · Alta (90%)", () => exportImage("image/jpeg", 0.9)],
                  ["JPEG · Web (75%)", () => exportImage("image/jpeg", 0.75)],
                  ["PNG · Sem perdas", () => exportImage("image/png")],
                ].map(([label, fn]) => (
                  <button key={label as string} onClick={fn as () => void} className="block w-full rounded-sm px-3 py-2 text-left text-popover-foreground hover:bg-accent">
                    {label as string}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Center */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div
            ref={viewportRef}
            className={`checker relative flex-1 overflow-hidden ${brushOn ? "cursor-none" : "cursor-grab active:cursor-grabbing"}`}
            onPointerLeave={() => setCursor(null)} onContextMenu={(e) => e.preventDefault()}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            onDoubleClick={() => fit()}
          >
            <div className="absolute left-0 top-0" style={{ width: size.w, height: size.h, transformOrigin: "0 0", transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}>
              <canvas ref={outRef} className="absolute inset-0 shadow-2xl transition-[filter] duration-150" style={{ filter: mockFilter }} />
              <canvas ref={brushRef} className={`pointer-events-none absolute inset-0 mix-blend-screen transition-opacity ${brushOn ? "opacity-30" : "opacity-0"}`} style={{ filter: "sepia(1) saturate(4) hue-rotate(-20deg)" }} />
              <canvas ref={origRef} className="absolute inset-0" style={{ clipPath: `inset(0 ${clipRight}% 0 0)` }} />
              {mode === "split" && !holding && (
                <div className="absolute inset-y-0" style={{ left: `${split}%` }}>
                  <div className="absolute inset-y-0 -translate-x-1/2 bg-foreground/80" style={{ width: 1.5 / zoom }} />
                  <div data-handle="split" className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-foreground/60 bg-panel/90 text-foreground backdrop-blur"
                    style={{ width: 34 / zoom, height: 34 / zoom, fontSize: 12 / zoom }}>
                    <span data-handle="split" className="pointer-events-none">◂▸</span>
                  </div>
                </div>
              )}
            </div>
            <div onPointerDown={(e) => e.stopPropagation()}
              className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-border bg-panel/90 p-0.5 text-[11px] shadow-lg backdrop-blur">
              {([
                ["1:1 / 100%", "1", () => zoomTo(1), Math.abs(zoom - 1) < 0.001],
                ["Ajustar", "F", () => fit(), false],
                ["Split View", "Y", () => setMode((m) => (m === "split" ? "edited" : "split")), mode === "split"],
              ] as const).map(([label, key, fn, active]) => (
                <button key={label} onClick={fn} title={`${label} (${key})`}
                  className={`flex h-7 items-center gap-2 rounded-sm px-2.5 transition ${active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                  {label}<kbd className="rounded-[3px] border border-border px-1 font-mono text-[9px] text-muted-foreground">{key}</kbd>
                </button>
              ))}
            </div>
            {mode === "split" && !holding && (
              <>
                <Tag className="left-3">Antes</Tag>
                <Tag className="right-3">Depois</Tag>
              </>
            )}
            {holding && <Tag className="left-1/2 -translate-x-1/2">Original</Tag>}
            {brushOn && cursor && (
              <span className="pointer-events-none absolute rounded-full border border-primary shadow-[0_0_0_1px_var(--canvas)]"
                style={{ left: cursor.x, top: cursor.y, width: brushSize * zoom, height: brushSize * zoom, transform: "translate(-50%,-50%)" }} />
            )}
            {(busy || detecting) && (
              <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-2 rounded-full border border-border bg-panel/85 px-3 py-1.5 text-[11px] text-foreground backdrop-blur animate-in fade-in">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                {detecting ? "Detectando cabos e tripés…" : "Processando IA…"}
              </span>
            )}
            {dragging && (
              <div className="pointer-events-none absolute inset-4 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-canvas/85 text-sm">
                <span className="text-3xl text-primary">⇪</span>
                <span className="font-semibold">Solte suas fotos aqui</span>
                <span className="text-xs text-muted-foreground">JPEG ou PNG · várias de uma vez</span>
              </div>
            )}
          </div>

          {/* Shortcut bar */}
          <div className="flex h-11 shrink-0 items-center justify-between border-t border-border bg-panel px-4 text-xs">
            <div className="flex items-center gap-1">
              <HBtn onClick={() => zoomTo(1)}>Zoom 100%</HBtn>
              <HBtn onClick={() => fit()}>Ajustar à tela</HBtn>
              <button
                onPointerDown={() => setHolding(true)} onPointerUp={() => setHolding(false)} onPointerLeave={() => setHolding(false)}
                className={`flex h-8 items-center gap-2 rounded-md px-3 transition ${holding ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
              >
                Segurar para ver original <kbd className="rounded-sm border border-border px-1.5 font-mono text-[10px]">Espaço</kbd>
              </button>
            </div>
            <div className="flex items-center gap-3 font-mono text-muted-foreground">
              <button onClick={() => zoomTo(zoom / 1.25)} className="hover:text-foreground">−</button>
              <span className="w-12 text-center text-foreground">{Math.round(zoom * 100)}%</span>
              <button onClick={() => zoomTo(zoom * 1.25)} className="hover:text-foreground">+</button>
            </div>
          </div>
          {/* Batch toolbar */}
          <div className="flex h-10 shrink-0 items-center gap-2 border-t border-border bg-panel px-4 text-xs">
            <span className="text-muted-foreground">{selected.size} de {photos.length} selecionadas</span>
            <button onClick={() => setSelected(new Set(photos.map((p) => p.id)))} className="rounded-sm px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">Selecionar todas</button>
            <button onClick={() => setSelected(new Set())} className="rounded-sm px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">Limpar seleção</button>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setSyncOpen(true)}
                className="h-7 rounded-md border border-primary/60 bg-primary/15 px-3 font-semibold text-primary transition hover:bg-primary/25">⇄ Sincronizar Ajustes</button>
              <button onClick={() => setBatchOpen(true)}
                className="h-7 rounded-md bg-primary px-3 font-semibold text-primary-foreground transition hover:brightness-110">
                Exportar Lote ({selected.size || photos.length})</button>
            </div>
          </div>
          {/* Filmstrip */}
          <div className="flex h-24 shrink-0 items-center gap-2 overflow-x-auto border-t border-border bg-canvas px-4">
            <button onClick={() => fileRef.current?.click()}
              className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-input text-muted-foreground transition hover:border-primary hover:text-primary">
              <span className="text-lg leading-none">+</span>
              <span className="mt-1 text-[9px]">Arraste ou clique</span>
            </button>
            {photos.map((p) => (
              <div key={p.id} className={`group relative shrink-0 rounded-md ${selected.has(p.id) ? "ring-2 ring-primary/50 ring-offset-1 ring-offset-canvas" : ""}`}>
                <button onClick={() => switchPhoto(p.id)} title={p.name}
                  className={`block h-16 w-16 overflow-hidden rounded-md border-2 transition ${p.id === activeId ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}>
                  <img src={p.url} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                </button>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSel(p.id)} aria-label={`Selecionar ${p.name}`}
                  className={`absolute left-1 top-1 h-3.5 w-3.5 cursor-pointer accent-primary ${selected.has(p.id) ? "" : "opacity-0 group-hover:opacity-100"}`} />
                {photos.length > 1 && (
                  <button onClick={() => removePhoto(p.id)} aria-label={`Remover ${p.name}`}
                    className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-panel text-[9px] text-muted-foreground group-hover:flex hover:text-destructive">✕</button>
                )}
              </div>
            ))}
            <span className="ml-auto shrink-0 pl-4 font-mono text-[10px] text-muted-foreground">{photos.length}/{MAX_PHOTOS} fotos na sessão</span>
          </div>
        </main>

        {/* Side panel */}
        <aside className={`relative shrink-0 border-l border-border bg-panel transition-[width] duration-300 ${panelOpen ? "w-80" : "w-0"}`}>
          <button onClick={() => setPanelOpen((o) => !o)}
            className="absolute -left-6 top-4 z-10 flex h-10 w-6 items-center justify-center rounded-l-md border border-r-0 border-border bg-panel text-xs text-muted-foreground hover:text-foreground">
            {panelOpen ? "›" : "‹"}
          </button>
          <div className={`flex h-full w-80 flex-col overflow-hidden ${panelOpen ? "" : "invisible"}`}>
            <div className="grid grid-cols-2 border-b border-border text-xs">
              {([["pele", "Pele"], ["estudio", "Cenário & Estúdio"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => { setPanelTab(k); if (k === "pele") setBrushOn(false); }}
                  className={`h-10 transition ${panelTab === k ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
              ))}
            </div>
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{panelTab === "pele" ? "Retoque de Pele" : "Cenário e Set"}</span>
              <button onClick={() => { setSettings(defaultSettings); if (panelTab === "estudio") clearBrush(); }} className="rounded-sm px-2 py-1 text-[11px] text-primary hover:bg-accent">Resetar todos os ajustes</button>
            </div>
            {panelTab === "estudio" && (
            <div className="flex-1 overflow-y-auto">
              <Accordion title="Suavização Tonal de Ciclorama / Fundo de Estúdio" defaultOpen onReset={() => resetKeys(["backdropEven", "creases", "extend"])}>
                <Toggle label="Normalizar Gradiente de Luminância" checked={settings.backdropEven} onChange={(v) => setSettings((x) => ({ ...x, backdropEven: v }))} />
                <Slider label="Correção de Vincos e Dobras do Fundo" value={settings.creases} onChange={set("creases")} def={0} suffix="%" />
                <Slider label="Extensão de Ciclorama / Preenchimento de Bordas" value={settings.extend} onChange={set("extend")} def={0} suffix="%" />
              </Accordion>
              <Accordion title="Limpeza de Piso e Marcas de Set" defaultOpen onReset={() => resetKeys(["floorClean", "preserveShadows", "floorReflect"])}>
                <Slider label="Remoção de Marcas de Calçado e Partículas" value={settings.floorClean} onChange={set("floorClean")} def={0} suffix="%" />
                <Toggle label="Preservar Sombras de Contato" checked={settings.preserveShadows} onChange={(v) => setSettings((x) => ({ ...x, preserveShadows: v }))} />
                <Slider label="Controle de Especulares do Piso" value={settings.floorReflect} onChange={set("floorReflect")} def={0} suffix="%" />
              </Accordion>
              <Accordion title="Remoção de Equipamentos de Set" defaultOpen onReset={() => { resetKeys(["autoClean"]); clearBrush(); setBrushSize(40); setBrushOn(false); }}>
                <button onClick={() => setBrushOn((b) => !b)}
                  className={`flex h-9 w-full items-center justify-center gap-2 rounded-md border text-xs font-medium transition ${brushOn ? "border-primary bg-primary/15 text-primary" : "border-input text-foreground hover:bg-accent"}`}>
                  Pincel de Reconstrução / Apagar {brushOn && "· ativo"}
                </button>
                <Slider label="Diâmetro do Pincel" value={brushSize} min={5} max={200} def={40} onChange={setBrushSize} suffix="px" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">Pinte sobre cabos, tripés ou fitas. Com o pincel ativo, arraste para pintar; use o botão direito ou desative para mover a foto.</p>
                <button onClick={clearBrush} className="text-[11px] text-muted-foreground hover:text-foreground">Limpar pinceladas</button>
                <button onClick={autoDetect} disabled={detecting}
                  className={`flex h-9 w-full items-center justify-center gap-2 rounded-md text-xs font-semibold transition ${settings.autoClean ? "border border-success/50 text-success" : "bg-primary text-primary-foreground hover:brightness-110"} disabled:opacity-70`}>
                  {detecting ? "Detectando…" : settings.autoClean ? "✓ Equipamentos removidos" : "Detecção Automática de Cabos e Tripés"}
                </button>
              </Accordion>
            </div>
            )}
            {panelTab === "pele" && (
            <div className="flex-1 overflow-y-auto">
              <Accordion title="Limpeza Tonal e Imperfeições" defaultOpen onReset={() => resetKeys(["blemish", "darkCircles", "preserveFreckles"])}>
                <Slider label="Correção de Imperfeições" value={settings.blemish} onChange={set("blemish")} def={0} suffix="%" />
                <Slider label="Neutralização de Olheiras" value={settings.darkCircles} onChange={set("darkCircles")} def={0} suffix="%" />
                <Toggle label="Preservar Sardas e Pintas Naturais" checked={settings.preserveFreckles} onChange={(v) => setSettings((x) => ({ ...x, preserveFreckles: v }))} />
              </Accordion>
              <Accordion title="Uniformização com Preservação de Micro-textura" defaultOpen onReset={() => resetKeys(["smoothing", "texture", "evenTone"])}>
                <Slider label="Intensidade de Uniformização" value={settings.smoothing} onChange={set("smoothing")} def={0} suffix="%" />
                <Slider label="Retenção de Micro-textura" value={settings.texture} onChange={set("texture")} def={0} suffix="%" />
                <Slider label="Equalização Cromática da Pele" value={settings.evenTone} onChange={set("evenTone")} def={0} suffix="%" />
              </Accordion>
              <Accordion title="Especulares e Modelagem de Luz" defaultOpen onReset={() => resetKeys(["shine", "dodgeBurn"])}>
                <Slider label="Controle de Especulares" value={settings.shine} onChange={set("shine")} def={0} suffix="%" />
                <Slider label="Dodge & Burn Sutil" value={settings.dodgeBurn} onChange={set("dodgeBurn")} def={0} suffix="%" />
              </Accordion>
              <Accordion title="Parâmetros Avançados" onReset={() => resetKeys(["radius", "maskTolerance", "brightness", "warmth", "saturation", "sharpen"])}>
                <Slider label="Raio de Frequência" value={settings.radius} min={1} max={20} def={defaultSettings.radius} onChange={set("radius")} suffix="px" />
                <Slider label="Tolerância da Máscara de Pele" value={settings.maskTolerance} def={defaultSettings.maskTolerance} onChange={set("maskTolerance")} />
                <Slider label="Exposição da Pele" value={settings.brightness} min={-50} max={50} def={0} onChange={set("brightness")} />
                <Slider label="Temperatura de Cor" value={settings.warmth} min={-50} max={50} def={0} onChange={set("warmth")} />
                <Slider label="Saturação da Pele" value={settings.saturation} min={-50} max={50} def={0} onChange={set("saturation")} />
                <Slider label="Nitidez Seletiva (fora da pele)" value={settings.sharpen} def={0} onChange={set("sharpen")} />
                <Toggle label="Visualizar Máscara de Pele" checked={showMask} onChange={setShowMask} />
              </Accordion>
            </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function HBtn({ children, onClick, active }: { children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button onClick={onClick}
      className={`h-8 rounded-md px-3 text-xs transition ${active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
      {children}
    </button>
  );
}

function Tag({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`pointer-events-none absolute top-3 rounded-sm bg-panel/80 px-2 py-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground backdrop-blur ${className}`}>{children}</span>;
}

function Accordion({ title, children, defaultOpen = false, onReset }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; onReset: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <div className="flex items-center px-4">
        <button onClick={() => setOpen((o) => !o)} className="flex h-11 flex-1 items-center gap-2 text-left text-xs font-semibold text-foreground">
          <span className={`text-[9px] text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
          {title}
        </button>
        <button onClick={onReset} title="Resetar seção" className="rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">Resetar</button>
      </div>
      {open && <div className="space-y-4 px-4 pb-5 pt-1">{children}</div>}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between text-xs text-foreground/85">
      {label}
      <span className={`relative h-4 w-7 rounded-full transition ${checked ? "bg-primary" : "bg-input"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-foreground transition-all ${checked ? "left-3.5" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Slider({ label, value, onChange, min = 0, max = 100, def, suffix = "" }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; def: number; suffix?: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n)) onChange(clamp(Math.round(n), min, max)); else setDraft(String(value));
  };
  return (
    <div className="group">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-foreground/85">{label}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => onChange(def)} title="Resetar" aria-label={`Resetar ${label}`}
            className={`text-[11px] text-muted-foreground transition hover:text-primary ${value === def ? "invisible" : "opacity-0 group-hover:opacity-100"}`}>↺</button>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                const step = (e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1);
                onChange(clamp(value + step, min, max));
              }
              if (e.key === "Escape") { onChange(0 >= min && 0 <= max ? 0 : def); (e.target as HTMLInputElement).blur(); }
            }}
            onDoubleClick={() => onChange(0 >= min && 0 <= max ? 0 : def)}
            title="↑/↓ ajuste fino · Shift ×10 · duplo clique zera"
            className="w-10 rounded-sm border border-transparent bg-transparent text-right font-mono text-muted-foreground outline-none hover:border-border focus:border-ring focus:bg-canvas focus:text-foreground" />
          <span className="w-3 font-mono text-[10px] text-muted-foreground">{suffix}</span>
        </div>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(0 >= min && 0 <= max ? 0 : def)} className="range-pro" style={{ ["--fill" as string]: `${fill}%` }} />
    </div>
  );
}
