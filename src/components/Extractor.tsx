"use client";

import { useCallback, useRef, useState, type ComponentProps } from "react";
import { runChecks, toCsv, type Check, type Invoice } from "@/lib/invoice";

type Doc = {
  id: string;
  name: string;
  preview: string | null;
  state: "reading" | "done" | "error";
  error?: string;
  invoice?: Invoice;
  meta?: { model: string; ms: number; tokens: number | null };
};

const SAMPLES = [
  { file: "/samples/northwind-invoice.png", label: "Clean invoice" },
  { file: "/samples/lahore-print-invoice.png", label: "Invoice with a maths error" },
];

/** Downscale big photos in the browser so uploads stay small and fast. */
async function prepare(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 900_000) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.85));
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

function verdict(checks: Check[]) {
  if (checks.some((c) => c.status === "fail")) return { label: "Doesn't add up", tone: "bg-bad-soft text-bad" };
  if (checks.some((c) => c.status === "warn")) return { label: "Needs a look", tone: "bg-warn-soft text-warn" };
  return { label: "Ready to export", tone: "bg-good-soft text-good" };
}

export function Extractor() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const patch = (id: string, p: Partial<Doc>) => setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)));

  const handle = useCallback(async (files: File[]) => {
    for (const raw of files.slice(0, 5)) {
      const id = Math.random().toString(36).slice(2);
      const preview = raw.type.startsWith("image/") ? URL.createObjectURL(raw) : null;
      setDocs((ds) => [{ id, name: raw.name, preview, state: "reading" }, ...ds]);
      try {
        const file = await prepare(raw);
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/extract", { method: "POST", body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
        patch(id, { state: "done", invoice: data.invoice, meta: data.meta });
      } catch (e) {
        patch(id, { state: "error", error: e instanceof Error ? e.message : "Something went wrong." });
      }
    }
  }, []);

  async function trySample(path: string) {
    const blob = await (await fetch(path)).blob();
    handle([new File([blob], path.split("/").pop()!, { type: blob.type })]);
  }

  const done = docs.filter((d) => d.state === "done" && d.invoice);

  function download(name: string, text: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handle([...e.dataTransfer.files]);
        }}
        className={`grid gap-4 rounded-2xl border-2 border-dashed p-6 transition sm:grid-cols-[1fr_auto] sm:items-center ${dragging ? "border-accent bg-accent-soft" : "border-line bg-panel"}`}
      >
        <div>
          <p className="font-medium">Drop invoices or receipts here</p>
          <p className="mt-1 text-sm text-muted">JPG, PNG, WebP or PDF, up to 4 MB each, 5 at a time. Phone photos are fine.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">No invoice handy?</span>
            {SAMPLES.map((s) => (
              <button key={s.file} onClick={() => trySample(s.file)} className="rounded-full border border-line px-3 py-1 text-xs hover:border-accent">
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => input.current?.click()} className="rounded-xl bg-ink px-5 py-3 font-medium text-paper hover:bg-accent-ink">
          Choose files
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            handle([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>

      {done.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3">
          <p className="text-sm text-muted">
            {done.length} document{done.length === 1 ? "" : "s"} extracted. Edits re-run the checks and go into the export.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => download("invoices.csv", toCsv(done.map((d) => ({ file: d.name, inv: d.invoice! }))), "text/csv")}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-ink hover:bg-accent-ink hover:text-paper"
            >
              Export CSV
            </button>
            <button
              onClick={() => download("invoices.json", JSON.stringify(done.map((d) => ({ file: d.name, ...d.invoice })), null, 2), "application/json")}
              className="rounded-lg border border-line px-4 py-2 text-sm hover:border-ink"
            >
              JSON
            </button>
          </div>
        </div>
      )}

      {docs.map((d) => (
        <DocCard key={d.id} doc={d} onChange={(inv) => patch(d.id, { invoice: inv })} onRemove={() => setDocs((ds) => ds.filter((x) => x.id !== d.id))} />
      ))}
    </div>
  );
}

function DocCard({ doc, onChange, onRemove }: { doc: Doc; onChange: (inv: Invoice) => void; onRemove: () => void }) {
  const inv = doc.invoice;
  const checks = inv ? runChecks(inv) : [];
  const flagged = new Set(checks.flatMap((c) => c.fields));
  const v = verdict(checks);

  const set = <K extends keyof Invoice>(k: K, val: Invoice[K]) => inv && onChange({ ...inv, [k]: val });
  const setLine = (i: number, k: "description" | "quantity" | "unit_price" | "amount", val: string) => {
    if (!inv) return;
    const items = inv.line_items.map((it, j) => (j === i ? { ...it, [k]: k === "description" ? val : toNum(val) } : it));
    onChange({ ...inv, line_items: items });
  };

  return (
    <article className="rise overflow-hidden rounded-2xl border border-line bg-panel">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <p className="truncate font-mono text-sm">{doc.name}</p>
          {doc.state === "done" && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${v.tone}`}>{v.label}</span>}
          {doc.state === "reading" && <span className="blink shrink-0 text-xs text-muted">Reading the document…</span>}
        </div>
        <button onClick={onRemove} className="text-xs text-faint hover:text-bad" aria-label={`Remove ${doc.name}`}>Remove</button>
      </header>

      {doc.state === "error" && <p className="m-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{doc.error}</p>}

      {doc.state === "reading" && (
        <div className="grid gap-4 p-4 md:grid-cols-[220px_1fr]">
          <Preview doc={doc} />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-paper" />)}
          </div>
        </div>
      )}

      {inv && (
        <div className="grid gap-5 p-4 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
          <Preview doc={doc} />

          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Field label="Vendor" value={inv.vendor_name} flag={flagged.has("vendor_name")} onChange={(x) => set("vendor_name", x)} wide />
              <Field label="Invoice #" value={inv.invoice_number} flag={flagged.has("invoice_number")} onChange={(x) => set("invoice_number", x)} />
              <Field label="Tax ID" value={inv.vendor_tax_id} flag={flagged.has("vendor_tax_id")} onChange={(x) => set("vendor_tax_id", x)} />
              <Field label="Date" value={inv.invoice_date} flag={flagged.has("invoice_date")} onChange={(x) => set("invoice_date", x)} />
              <Field label="Due" value={inv.due_date} flag={flagged.has("due_date")} onChange={(x) => set("due_date", x)} />
              <Field label="Currency" value={inv.currency} flag={flagged.has("currency")} onChange={(x) => set("currency", x?.toUpperCase() ?? null)} />
            </div>

            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper text-left">
                    <th className="label px-2 py-2 font-normal">Item</th>
                    <th className="label w-16 px-2 py-2 text-right font-normal">Qty</th>
                    <th className="label w-24 px-2 py-2 text-right font-normal">Price</th>
                    <th className="label w-28 px-2 py-2 text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.line_items.map((it, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-1 py-1"><Cell value={it.description} onChange={(x) => setLine(i, "description", x)} /></td>
                      <td className="px-1 py-1"><Cell value={it.quantity} num onChange={(x) => setLine(i, "quantity", x)} /></td>
                      <td className="px-1 py-1"><Cell value={it.unit_price} num onChange={(x) => setLine(i, "unit_price", x)} /></td>
                      <td className="px-1 py-1"><Cell value={it.amount} num flag={flagged.has(`line_items.${i}.amount`)} onChange={(x) => setLine(i, "amount", x)} /></td>
                    </tr>
                  ))}
                  {inv.line_items.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-3 text-center text-xs text-muted">No line items printed</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="ml-auto grid max-w-xs grid-cols-[1fr_120px] items-center gap-x-3 gap-y-1.5 text-sm">
              {(["subtotal", "tax", "total"] as const).map((k) => (
                <TotalRow key={k} label={k} value={inv[k]} flag={flagged.has(k)} strong={k === "total"} onChange={(x) => set(k, toNum(x))} />
              ))}
            </div>
          </div>

          <aside className="space-y-2">
            <p className="label">Checks run in code</p>
            <ul className="space-y-1.5">
              {checks.map((c) => (
                <li key={c.id} className="rounded-lg border border-line p-2.5 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <span className={c.status === "pass" ? "text-good" : c.status === "warn" ? "text-warn" : "text-bad"}>
                      {c.status === "pass" ? "✓" : c.status === "warn" ? "!" : "✗"}
                    </span>
                    {c.label}
                  </p>
                  <p className="mt-0.5 pl-5 text-xs text-muted">{c.detail}</p>
                </li>
              ))}
            </ul>
            {doc.meta && (
              <p className="pt-1 font-mono text-[11px] text-faint">
                {doc.meta.model} · {(doc.meta.ms / 1000).toFixed(1)}s{doc.meta.tokens ? ` · ${doc.meta.tokens} tok` : ""}
              </p>
            )}
          </aside>
        </div>
      )}
    </article>
  );
}

function Preview({ doc }: { doc: Doc }) {
  return doc.preview ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={doc.preview} alt={`Preview of ${doc.name}`} className="max-h-80 w-full rounded-lg border border-line object-contain object-top bg-paper" />
  ) : (
    <div className="grid h-40 place-items-center rounded-lg border border-line bg-paper font-mono text-xs text-muted">PDF</div>
  );
}

function toNum(s: string | null): number | null {
  if (s === null || s.trim() === "") return null;
  const n = Number(s.replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function Field({ label, value, onChange, flag, wide }: { label: string; value: string | null; onChange: (v: string | null) => void; flag?: boolean; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <span className="label">{label}</span>
      <input
        value={value ?? ""}
        placeholder="not found"
        onChange={(e) => onChange(e.target.value || null)}
        className={`mt-1 w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-accent ${flag ? "border-warn bg-warn-soft" : "border-line bg-paper"}`}
      />
    </label>
  );
}

/** Keeps what the user is typing (e.g. "4.") locally and only commits on blur or Enter, so numbers can be edited naturally. */
function DraftInput({ value, onCommit, ...rest }: { value: string | number | null; onCommit: (v: string) => void } & Omit<ComponentProps<"input">, "value" | "onChange">) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      {...rest}
      value={draft ?? value ?? ""}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

function Cell({ value, onChange, num, flag }: { value: string | number | null; onChange: (v: string) => void; num?: boolean; flag?: boolean }) {
  return (
    <DraftInput
      value={value}
      onCommit={onChange}
      inputMode={num ? "decimal" : undefined}
      className={`w-full rounded px-1.5 py-1 outline-none focus:bg-paper focus:ring-1 focus:ring-accent ${num ? "text-right font-mono tabular-nums" : ""} ${flag ? "bg-bad-soft text-bad" : "bg-transparent"}`}
    />
  );
}

function TotalRow({ label, value, onChange, flag, strong }: { label: string; value: number | null; onChange: (v: string) => void; flag?: boolean; strong?: boolean }) {
  return (
    <>
      <span className={`text-right capitalize ${strong ? "font-medium" : "text-muted"}`}>{label}</span>
      <DraftInput
        value={value}
        placeholder="—"
        onCommit={onChange}
        className={`rounded-md border px-2 py-1 text-right font-mono tabular-nums outline-none focus:border-accent ${flag ? "border-bad bg-bad-soft text-bad" : "border-line bg-paper"} ${strong ? "font-semibold" : ""}`}
      />
    </>
  );
}
