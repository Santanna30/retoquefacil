import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PACKS, brl, type CreditPack } from "@/lib/credits";

type Props = { open: boolean; reason?: string | undefined; onClose: () => void; onPaid: (photos: number) => void };
const EXPIRY = 15 * 60;

export function CreditsModal({ open, reason, onClose, onPaid }: Props) {
  const [pack, setPack] = useState<CreditPack | null>(null);
  const [status, setStatus] = useState<"waiting" | "checking" | "paid" | "expired">("waiting");
  const [copied, setCopied] = useState(false);
  const [left, setLeft] = useState(EXPIRY);
  const [txid, setTxid] = useState("");

  useEffect(() => { if (!open) { setPack(null); setCopied(false); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  const startCharge = (p: CreditPack) => {
    setPack(p); setStatus("waiting"); setLeft(EXPIRY); setCopied(false);
    setTxid(Math.random().toString(36).slice(2, 12).toUpperCase());
  };

  useEffect(() => {
    if (!pack || status === "paid" || status === "expired") return;
    const t = setInterval(() => setLeft((l) => {
      if (l <= 1) { setStatus("expired"); return 0; }
      return l - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [pack, status]);

  if (!open) return null;
  const pixCode = pack
    ? `00020126580014BR.GOV.BCB.PIX0136skinretouch-demo-chave-pix-000000005204000053039865406${pack.price.toFixed(2)}5802BR5915SKINRETOUCH AI6009SAO PAULO62140510${txid}6304DEMO`
    : "";
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");

  const verify = () => {
    setStatus("checking");
    setTimeout(() => {
      setStatus("paid");
      setTimeout(() => { onPaid(pack!.photos); onClose(); }, 1600);
    }, 2400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/85 p-4 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-panel shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recarga de créditos</p>
            <h2 className="mt-0.5 text-base font-semibold">{pack ? "Pagamento via Pix" : "Selecione um pacote"}</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {!pack ? (
          <div className="p-6">
            {reason && <p className="mb-4 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground">{reason}</p>}
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground">Sem mensalidades.</span> Pague apenas pelo que usar. Os créditos nunca expiram.
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {PACKS.map((p) => (
                <div key={p.id} className={`relative flex flex-col rounded-md border p-5 ${p.popular ? "border-primary/70 bg-card" : "border-border bg-card/60"}`}>
                  {p.popular && <span className="absolute right-3 top-3 rounded-sm border border-primary/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">Mais popular</span>}
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{p.name}</span>
                  <span className="mt-4 font-mono text-3xl font-medium">{p.photos}<span className="ml-1.5 font-sans text-xs text-muted-foreground">fotos</span></span>
                  <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                    <span className="text-base font-semibold">{brl(p.price)}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{brl(p.perPhoto)}/foto</span>
                  </div>
                  <button onClick={() => startCharge(p)}
                    className={`mt-5 h-9 rounded-sm text-xs font-semibold transition ${p.popular ? "bg-primary text-primary-foreground hover:brightness-105" : "border border-input text-foreground hover:bg-accent"}`}>
                    Pagar com Pix
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center border-b border-border bg-canvas p-6 md:border-b-0 md:border-r">
              <div className={`rounded-md bg-foreground p-3 transition ${status === "expired" ? "opacity-20 blur-[2px]" : ""}`}>
                <QRCodeSVG value={pixCode} size={176} bgColor="transparent" fgColor="#111111" />
              </div>
              <div className="mt-4 text-center">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Expira em</p>
                <p className={`font-mono text-2xl tabular-nums ${left < 60 ? "text-destructive" : "text-foreground"}`}>{mm}:{ss}</p>
              </div>
              <div className="mt-3 h-1 w-44 overflow-hidden rounded-full bg-input">
                <div className="h-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${(left / EXPIRY) * 100}%` }} />
              </div>
            </div>

            <div className="flex flex-col p-6">
              <dl className="grid grid-cols-2 gap-y-2 text-xs">
                <dt className="text-muted-foreground">Pacote</dt><dd className="text-right">{pack.name}</dd>
                <dt className="text-muted-foreground">Créditos</dt><dd className="text-right font-mono">{pack.photos} fotos</dd>
                <dt className="text-muted-foreground">Identificador</dt><dd className="text-right font-mono">{txid}</dd>
                <dt className="border-t border-border pt-2 text-muted-foreground">Total</dt>
                <dd className="border-t border-border pt-2 text-right text-base font-semibold">{brl(pack.price)}</dd>
              </dl>

              <label className="mt-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Pix copia e cola</label>
              <div className="mt-1.5 flex">
                <input readOnly value={pixCode} onFocus={(e) => e.target.select()}
                  className="h-9 min-w-0 flex-1 rounded-l-sm border border-r-0 border-input bg-canvas px-3 font-mono text-[10px] text-muted-foreground outline-none" />
                <button disabled={status === "expired"} onClick={() => { navigator.clipboard?.writeText(pixCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="h-9 shrink-0 rounded-r-sm border border-input bg-card px-3 text-xs font-medium hover:bg-accent disabled:opacity-40">
                  {copied ? "Copiado ✓" : "Copiar código"}
                </button>
              </div>

              <div className="mt-5 flex items-center gap-2.5 rounded-sm border border-border bg-card px-3 py-2.5 text-xs">
                {status === "waiting" && (<><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" /><span className="relative h-2 w-2 rounded-full bg-primary" /></span>Aguardando confirmação bancária...</>)}
                {status === "checking" && (<><span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />Consultando instituição financeira...</>)}
                {status === "paid" && (<><span className="h-2 w-2 rounded-full bg-success" />Pagamento confirmado · {pack.photos} créditos adicionados</>)}
                {status === "expired" && (<><span className="h-2 w-2 rounded-full bg-destructive" />Cobrança expirada. Gere um novo QR Code.</>)}
              </div>

              <div className="mt-auto flex gap-2 pt-5">
                <button onClick={() => setPack(null)} className="h-10 rounded-sm border border-input px-4 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">Voltar</button>
                {status === "expired" ? (
                  <button onClick={() => startCharge(pack)} className="h-10 flex-1 rounded-sm bg-primary text-xs font-semibold text-primary-foreground hover:brightness-105">Gerar novo QR Code</button>
                ) : (
                  <button disabled={status !== "waiting"} onClick={verify}
                    className="h-10 flex-1 rounded-sm bg-primary text-xs font-semibold text-primary-foreground transition hover:brightness-105 disabled:opacity-60">
                    {status === "paid" ? "Confirmado" : status === "checking" ? "Verificando..." : "Já fiz o pagamento"}
                  </button>
                )}
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground">Ambiente de demonstração — nenhuma cobrança real é efetuada.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
