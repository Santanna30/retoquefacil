import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { renderPhoto } from "@/lib/batch";
import type { Settings } from "@/lib/retouch";

function Shell({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`relative w-full ${wide ? "max-w-lg" : "max-w-md"} rounded-xl border border-border bg-panel p-6 shadow-2xl animate-in zoom-in-95`}>
        <button onClick={onClose} aria-label="Fechar" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">✕</button>
        {children}
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-3 text-sm hover:border-input">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
      {label}
    </label>
  );
}

export function SyncDialog({ open, count, onClose, onApply }: {
  open: boolean; count: number; onClose: () => void; onApply: (skin: boolean, studio: boolean) => void;
}) {
  const [skin, setSkin] = useState(true);
  const [studio, setStudio] = useState(true);
  if (!open) return null;
  return (
    <Shell onClose={onClose}>
      <h2 className="text-lg font-semibold">Sincronizar ajustes</h2>
      <p className="mt-1 text-sm text-muted-foreground">Copiar da foto ativa para as fotos selecionadas:</p>
      <div className="mt-5 space-y-2">
        <Check label="Ajustes de Pele (Manchas, Textura, Tom)" checked={skin} onChange={setSkin} />
        <Check label="Limpeza de Fundo e Chão" checked={studio} onChange={setStudio} />
      </div>
      {count === 0 && <p className="mt-4 text-xs text-destructive">Marque outras fotos na tira de miniaturas primeiro.</p>}
      <button disabled={count === 0 || (!skin && !studio)} onClick={() => { onApply(skin, studio); onClose(); }}
        className="mt-6 h-10 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40">
        Aplicar a todas as selecionadas ({count} {count === 1 ? "foto" : "fotos"})
      </button>
    </Shell>
  );
}

type Item = { id: string; name: string; url: string; settings: Settings };
type Result = { name: string; blob: Blob; href: string };

export function BatchExportModal({ open, items, credits, onClose, onSpend, onNeedCredits }: {
  open: boolean; items: Item[]; credits: number; onClose: () => void;
  onSpend: (n: number) => void; onNeedCredits: () => void;
}) {
  const [phase, setPhase] = useState<"summary" | "running" | "done">("summary");
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!open) { results.forEach((r) => URL.revokeObjectURL(r.href)); setPhase("summary"); setDone(0); setResults([]); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const n = items.length;
  const enough = credits >= n;

  const start = async () => {
    if (!enough) { onNeedCredits(); return; }
    cancelled.current = false;
    setPhase("running");
    const out: Result[] = [];
    for (let i = 0; i < items.length; i++) {
      if (cancelled.current) break;
      const it = items[i]!;
      const [blob] = await Promise.all([renderPhoto(it.url, it.settings), new Promise((r) => setTimeout(r, 350))]);
      const name = it.name.replace(/\.[^.]+$/, "") + "-retouch.jpg";
      out.push({ name, blob, href: URL.createObjectURL(blob) });
      onSpend(1);
      setDone(i + 1);
      setResults([...out]);
    }
    setPhase("done");
  };

  const zip = async () => {
    const z = new JSZip();
    results.forEach((r) => z.file(r.name, r.blob));
    const blob = await z.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "skinretouch-lote.zip"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const close = () => { cancelled.current = true; onClose(); };
  const pct = n ? (done / n) * 100 : 0;

  return (
    <Shell onClose={close} wide>
      <h2 className="text-lg font-semibold">Exportar lote</h2>
      {phase === "summary" && (
        <>
          <div className="mt-5 rounded-lg border border-border bg-card p-4">
            <p className="text-sm"><span className="text-2xl font-semibold">{n}</span> fotos serão processadas.</p>
            <p className="mt-1 text-sm text-muted-foreground">Consumo: <span className="font-semibold text-primary">⚡ {n} créditos</span> · Saldo atual: {credits}</p>
          </div>
          {!enough && <p className="mt-3 text-xs text-destructive">Saldo insuficiente. Faltam {n - credits} créditos.</p>}
          <button onClick={start}
            className="mt-6 h-10 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110">
            {enough ? "Iniciar processamento" : "Adicionar créditos"}
          </button>
        </>
      )}
      {phase !== "summary" && (
        <>
          <div className="mt-5 flex justify-between text-xs">
            <span className="text-foreground">{phase === "done" ? `Concluído · ${done} de ${n} fotos` : `Processando ${Math.min(done + 1, n)} de ${n}...`}</span>
            <span className="font-mono text-muted-foreground">{Math.round(pct)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-input">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <ul className="mt-4 max-h-56 space-y-1 overflow-y-auto pr-1">
            {items.map((it, i) => {
              const r = results[i];
              return (
                <li key={it.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-accent">
                  <img src={it.url} alt="" className="h-8 w-8 rounded-sm object-cover" />
                  <span className="min-w-0 flex-1 truncate">{it.name}</span>
                  {r ? <a href={r.href} download={r.name} className="text-primary hover:underline">Baixar</a>
                    : i === done && phase === "running" ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    : <span className="text-muted-foreground">Na fila</span>}
                </li>
              );
            })}
          </ul>
          {phase === "done" && (
            <button onClick={zip} className="mt-5 h-10 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110">
              Baixar Todas (.ZIP)
            </button>
          )}
        </>
      )}
    </Shell>
  );
}
