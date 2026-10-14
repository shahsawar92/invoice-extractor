import { z } from "zod";

const num = z.number().nullable();

export const InvoiceSchema = z.object({
  document_type: z.enum(["invoice", "receipt", "other"]),
  vendor_name: z.string().nullable(),
  vendor_tax_id: z.string().nullable(),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable(),
  due_date: z.string().nullable(),
  currency: z.string().nullable(),
  line_items: z.array(
    z.object({
      description: z.string(),
      quantity: num,
      unit_price: num,
      amount: num,
    }),
  ),
  subtotal: num,
  tax: num,
  total: num,
  unclear_fields: z.array(z.string()),
});

export type Invoice = z.infer<typeof InvoiceSchema>;

/** JSON schema sent to the model; mirrors InvoiceSchema. */
export const INVOICE_JSON_SCHEMA = {
  type: "object",
  properties: {
    document_type: { type: "string", enum: ["invoice", "receipt", "other"] },
    vendor_name: { type: ["string", "null"] },
    vendor_tax_id: { type: ["string", "null"], description: "VAT, GST, NTN or tax number if printed" },
    invoice_number: { type: ["string", "null"] },
    invoice_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    due_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    currency: { type: ["string", "null"], description: "ISO 4217 code, e.g. USD, PKR, EUR" },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: ["number", "null"] },
          unit_price: { type: ["number", "null"] },
          amount: { type: ["number", "null"] },
        },
        required: ["description", "quantity", "unit_price", "amount"],
      },
    },
    subtotal: { type: ["number", "null"] },
    tax: { type: ["number", "null"], description: "Total tax amount" },
    total: { type: ["number", "null"], description: "Grand total payable" },
    unclear_fields: {
      type: "array",
      items: { type: "string" },
      description: "Names of fields that were blurry, cut off, handwritten or ambiguous",
    },
  },
  required: [
    "document_type", "vendor_name", "vendor_tax_id", "invoice_number", "invoice_date", "due_date",
    "currency", "line_items", "subtotal", "tax", "total", "unclear_fields",
  ],
};

export type Check = { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string; fields: string[] };

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.005);
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function validDate(s: string | null) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/**
 * Deterministic checks on the extracted data. The model reads the document;
 * these decide whether the result can be trusted without a human look.
 * Runs on the server and again in the browser after every edit.
 */
export function runChecks(inv: Invoice): Check[] {
  const checks: Check[] = [];
  const items = inv.line_items;

  const required: [keyof Invoice, string][] = [["vendor_name", "Vendor"], ["invoice_date", "Date"], ["total", "Total"]];
  const missing = required.filter(([k]) => inv[k] === null || inv[k] === "");
  checks.push({
    id: "required",
    label: "Key fields present",
    status: missing.length ? "fail" : "pass",
    detail: missing.length ? `Missing: ${missing.map(([, l]) => l).join(", ")}` : "Vendor, date and total found",
    fields: missing.map(([k]) => k),
  });

  const badLines = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.quantity !== null && it.unit_price !== null && it.amount !== null && !close(it.quantity * it.unit_price, it.amount));
  if (items.length) {
    checks.push({
      id: "lines",
      label: "Each line: qty × price = amount",
      status: badLines.length ? "fail" : "pass",
      detail: badLines.length
        ? badLines.map(({ it, i }) => `Line ${i + 1}: ${it.quantity} × ${fmt(it.unit_price!)} = ${fmt(it.quantity! * it.unit_price!)}, not ${fmt(it.amount!)}`).join("; ")
        : `${items.length} line${items.length === 1 ? "" : "s"} add up`,
      fields: badLines.map(({ i }) => `line_items.${i}.amount`),
    });
  }

  const lineSum = items.reduce((s, it) => s + (it.amount ?? 0), 0);
  if (items.length && items.every((it) => it.amount !== null)) {
    const base = inv.subtotal ?? (inv.total !== null ? inv.total - (inv.tax ?? 0) : null);
    if (base !== null) {
      const ok = close(lineSum, base);
      checks.push({
        id: "subtotal",
        label: "Lines add up to the subtotal",
        status: ok ? "pass" : "fail",
        detail: ok ? `${fmt(lineSum)}` : `Lines sum to ${fmt(lineSum)}, document says ${fmt(base)}`,
        fields: ok ? [] : [inv.subtotal !== null ? "subtotal" : "total"],
      });
    }
  }

  if (inv.subtotal !== null && inv.total !== null) {
    const expected = inv.subtotal + (inv.tax ?? 0);
    const ok = close(expected, inv.total);
    checks.push({
      id: "total",
      label: "Subtotal + tax = total",
      status: ok ? "pass" : "fail",
      detail: ok ? `${fmt(inv.subtotal)} + ${fmt(inv.tax ?? 0)} = ${fmt(inv.total)}` : `${fmt(inv.subtotal)} + ${fmt(inv.tax ?? 0)} = ${fmt(expected)}, document says ${fmt(inv.total)}`,
      fields: ok ? [] : ["total"],
    });
  }

  const dateFields = (["invoice_date", "due_date"] as const).filter((k) => inv[k] !== null && !validDate(inv[k]));
  const order = validDate(inv.invoice_date) && validDate(inv.due_date) && inv.due_date! < inv.invoice_date!;
  checks.push({
    id: "dates",
    label: "Dates are real and in order",
    status: dateFields.length || order ? "warn" : "pass",
    detail: dateFields.length ? `Not a valid date: ${dateFields.join(", ")}` : order ? "Due date is before the invoice date" : "OK",
    fields: order ? ["due_date"] : [...dateFields],
  });

  const cur = inv.currency;
  checks.push({
    id: "currency",
    label: "Currency recognised",
    status: cur && /^[A-Z]{3}$/.test(cur) ? "pass" : "warn",
    detail: cur ? (/^[A-Z]{3}$/.test(cur) ? cur : `"${cur}" isn't an ISO code`) : "No currency found",
    fields: cur && /^[A-Z]{3}$/.test(cur) ? [] : ["currency"],
  });

  if (inv.unclear_fields.length) {
    checks.push({
      id: "unclear",
      label: "Model flagged unclear text",
      status: "warn",
      detail: inv.unclear_fields.join(", "),
      fields: inv.unclear_fields,
    });
  }

  return checks;
}

export function toCsv(rows: { file: string; inv: Invoice }[]) {
  const head = ["file", "vendor", "vendor_tax_id", "invoice_number", "invoice_date", "due_date", "currency", "line", "description", "quantity", "unit_price", "amount", "subtotal", "tax", "total"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Quote, and neutralise spreadsheet formulas (CSV injection).
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [head.join(",")];
  for (const { file, inv } of rows) {
    const items = inv.line_items.length ? inv.line_items : [{ description: "", quantity: null, unit_price: null, amount: null }];
    items.forEach((it, i) => {
      lines.push(
        [file, inv.vendor_name, inv.vendor_tax_id, inv.invoice_number, inv.invoice_date, inv.due_date, inv.currency, i + 1, it.description, it.quantity, it.unit_price, it.amount, inv.subtotal, inv.tax, inv.total]
          .map(esc)
          .join(","),
      );
    });
  }
  return lines.join("\n");
}
