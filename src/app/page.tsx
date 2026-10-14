import { Extractor } from "@/components/Extractor";
import { Integrate } from "@/components/Integrate";
import { Footer, Header, Hero } from "@/components/Chrome";
import { APP } from "@/app.config";

export default function Page() {
  return (
    <>
      <Header app={APP.name} repo={APP.repo} />
      <main className="flex-1">
        <Hero kicker="Live demo · vision model with schema-validated output" title="Invoices to spreadsheet rows," accent="checked before you trust them.">
          AI reads each document into a fixed schema. Then plain code checks the maths, the dates and the currency, and
          highlights anything that doesn&apos;t add up so a person looks at it before it reaches your books.
        </Hero>
        <section className="mx-auto max-w-6xl px-4 sm:px-6">
          <Extractor />
        </section>
        <section className="mx-auto mt-16 mb-16 max-w-6xl px-4 sm:px-6">
          <p className="label">Why the checks matter</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">The model reads. Code decides what to trust.</h2>
          <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Copy, don't compute", "The model is told to copy values as printed and use null when unsure, never to fix totals itself. Fixing is the checks' job."],
              ["Schema, then Zod", "Output is constrained by a JSON schema and validated again on the server. Anything off-shape is rejected, not guessed at."],
              ["Maths checked in code", "Each line, the subtotal and the total are recomputed. A typo on the invoice or a misread digit shows up in red."],
              ["Human in the loop", "Every field is editable and the checks re-run as you type. The CSV escapes formulas so a cell can't run code in Excel."],
            ].map(([t, d]) => (
              <div key={t} className="bg-panel p-5">
                <p className="font-medium">{t}</p>
                <p className="mt-1.5 text-sm text-muted">{d}</p>
              </div>
            ))}
          </div>
        </section>
        <Integrate
          c={{
            title: "Stop typing invoices into spreadsheets",
            intro: "Pick how invoices should reach it and where the data should go. Every document gets the same maths checks you see above, and anything that doesn't add up waits for a person.",
            options: [
              { name: "Web app for your team", tag: "Works today", detail: "Your team drops invoices in, fixes anything flagged, and exports CSV or JSON for your accounting software." },
              { name: "Automatic inbox", detail: "Suppliers' invoices forwarded to a dedicated email address, or saved into a Google Drive or Dropbox folder, are read automatically. No one has to upload anything." },
              { name: "Straight into your books", detail: "Clean invoices go into Xero, QuickBooks, Google Sheets or your own system through its API. Flagged ones go to a review queue first." },
              { name: "Your own fields and rules", detail: "Add what your business needs, such as purchase-order numbers, cost centres, approval limits or duplicate-invoice detection." },
            ],
            needs: ["A few sample invoices from your real suppliers", "Where the data should end up (for example Xero, QuickBooks or a Google Sheet)", "Who should review flagged invoices"],
            timeline: "A working version on your own invoices in about a week.",
          }}
        />
      </main>
      <Footer note="Demo with a per-visitor hourly limit · files are not stored" />
    </>
  );
}
