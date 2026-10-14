# Invoice Extractor

Drop in invoices or receipts (photos, scans or PDFs). A vision model reads each one into a fixed schema, then **plain code checks the maths, dates and currency** and highlights anything that doesn't add up, so a person reviews it before it reaches the books. Export to CSV or JSON.

Try the built-in sample with a deliberate error: its grand total has two digits swapped (21,465 instead of 21,645), and the checks catch it.

## How it works

- **Copy, don't compute.** The model is told to copy values as printed and use `null` when unsure, never to fix totals itself.
- **Schema, then Zod.** Output is constrained with a JSON schema (`responseJsonSchema`) and validated again on the server (`src/lib/invoice.ts`). Off-shape answers are rejected.
- **Deterministic checks** (`runChecks`): required fields, qty × price = amount per line, lines sum to the subtotal, subtotal + tax = total, real and ordered dates, ISO currency, plus any fields the model itself marked unclear.
- **Human in the loop.** Every field is editable and the checks re-run in the browser as you edit.
- **Safe export.** CSV values are quoted and formula-like cells are neutralised against CSV injection.
- Images are downscaled in the browser before upload; files are processed in memory and never stored. Per-visitor hourly limit.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Gemini vision via `@google/genai` (structured output) · Zod · Vercel

## Run locally

```bash
cp .env.example .env.local   # add GEMINI_API_KEY
npm install
npm run dev
```

Built by [Shah Sawar](https://shahsawar.dev).
