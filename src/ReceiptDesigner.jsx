import { useMemo, useState } from "react";
import { normalizeReceiptCfg, receiptDefaults, receiptMissing } from "./receiptConfig.js";

// RECEIPT DESIGNER 2026-10-26 — Admin › Stores › Receipt.
//
// Each store designs its own customer receipt: what prints, in a fixed order,
// with the lines the law needs locked on for its country (UK VAT receipt / UAE
// simplified tax invoice). The preview on the right follows every change; Save
// stores it ("receipt:<location>") and, for a UAE store, switches on its
// tax-invoice numbering. Kitchen tickets are never affected.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
async function post(pin, action, data) {
  try {
    const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
      body: JSON.stringify({ pin, action, data }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j.ok !== false, ...j };
  } catch { return { ok: false, message: "No connection — try again." }; }
}

const AR = "'Noto Sans Arabic','Geeza Pro','Segoe UI',sans-serif";

// The store's Receipt tab: what it prints now, and the button that opens the
// designer full screen (the Stores panel is too narrow for a live preview).
export default function ReceiptTab(props) {
  const { loc, getSetting, T } = props;
  const [open, setOpen] = useState(false);
  const saved = getSetting("receipt:" + loc.id);
  const cfg = saved ? normalizeReceiptCfg(saved) : null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 8 }}>Customer receipt · this store</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 16px", border: "1px solid " + T.line, borderRadius: 12, background: T.card }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{cfg ? (cfg.country === "UAE" ? "UAE tax invoice" : "UK VAT receipt") + " · designed" : "Standard receipt"}</div>
          <div style={{ fontSize: 12, color: T.faint }}>{cfg ? (cfg.tax_id ? (cfg.country === "UAE" ? "TRN " : "VAT No ") + cfg.tax_id : "") + (cfg.country === "UAE" && cfg.invoice_prefix ? " · invoices " + cfg.invoice_prefix + "-000001…" : "") : "No VAT number or address printed yet. Kitchen tickets are not affected."}</div>
        </div>
        <button type="button" onClick={() => setOpen(true)} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{cfg ? "Edit receipt" : "Design receipt"}</button>
      </div>
      {open && (
        <div role="dialog" aria-label={"Receipt designer · " + loc.name} style={{ position: "fixed", inset: 0, zIndex: 400, background: T.bg, overflowY: "auto", fontFamily: "'Hanken Grotesk',system-ui,sans-serif" }}>
          <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", gap: 12, padding: "14px 22px", background: T.card, borderBottom: "1px solid " + T.line }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: T.faint }}>Stores › {loc.name}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.ink }}>Receipt</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid " + T.line, background: "#fff", color: T.ink, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
          </div>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 22px 24px" }}>
            <ReceiptDesigner {...props} />
          </div>
        </div>
      )}
    </div>
  );
}

function ReceiptDesigner({ loc, pin, getSetting, onSaved, ImageUpload, T }) {
  const saved = getSetting("receipt:" + loc.id);
  const initial = useMemo(() => {
    if (saved) return normalizeReceiptCfg(saved);
    // First time: start from what the store already has.
    const uae = String(getSetting("currency:" + loc.id) || "").toUpperCase() === "AED";
    const d = receiptDefaults(uae ? "UAE" : "UK");
    return normalizeReceiptCfg({
      ...d,
      brand_name: getSetting("brand_name:" + loc.id) || "",
      address: getSetting("company_address:" + loc.id) || "",
      tax_id: getSetting("tax_number:" + loc.id) || "",
      vat_rate: getSetting("vat_rate:" + loc.id) !== "" && getSetting("vat_rate:" + loc.id) != null ? Number(getSetting("vat_rate:" + loc.id)) : d.vat_rate,
    });
  }, [saved, loc.id]); // eslint-disable-line
  const [c, setC] = useState(initial);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState(null);   // {tone, text}
  const dirty = JSON.stringify(c) !== JSON.stringify(initial) || !saved;
  const uae = c.country === "UAE";
  const set = (k, v) => { setC((x) => ({ ...x, [k]: v })); setNote(null); };
  const missing = receiptMissing(c);

  const save = async () => {
    setBusy("save"); setNote(null);
    const r = await post(pin, "receipt_save", { location_id: loc.id, config: c });
    setBusy("");
    if (!r.ok) { setNote({ tone: "bad", text: r.message || r.error || "Couldn't save." }); return; }
    setNote({ tone: "good", text: "Saved. Receipts at " + loc.name + " print like this from now on." + (r.invoice && r.invoice.enabled ? " Next invoice: " + (r.invoice.prefix ? r.invoice.prefix + "-" : "") + String(r.invoice.next_no).padStart(6, "0") + "." : "") });
    onSaved && onSaved();
  };
  const test = async () => {
    setBusy("test"); setNote(null);
    const r = await post(pin, "receipt_test", { location_id: loc.id, config: c });
    setBusy("");
    setNote(r.ok ? { tone: "good", text: "Test sent to " + (r.printer || "the receipt printer") + "." } : { tone: "bad", text: r.message || r.error || "The test didn't print." });
  };
  const reset = async () => {
    if (!window.confirm("Go back to the standard receipt at " + loc.name + "? The design is removed.")) return;
    setBusy("reset");
    const r = await post(pin, "receipt_save", { location_id: loc.id, clear: true });
    setBusy("");
    if (r.ok) { setNote({ tone: "good", text: "Back to the standard receipt." }); onSaved && onSaved(); }
    else setNote({ tone: "bad", text: r.message || "Couldn't reset." });
  };

  // ---------- small parts ----------
  const lbl = { fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 4, display: "block" };
  const inp = { width: "100%", boxSizing: "border-box", padding: "9px 11px", fontSize: 13.5, border: "1px solid " + T.line, borderRadius: 9, background: "#fff", color: T.ink, fontFamily: "inherit" };
  const Text = ({ k, label, placeholder, rtl, area, hint, req }) => (
    <label style={{ display: "block" }}>
      <span style={{ ...lbl, color: req && !String(c[k] || "").trim() ? "#b4462f" : T.faint }}>{label}{req ? " · required" : ""}</span>
      {area
        ? <textarea defaultValue={c[k]} rows={2} placeholder={placeholder} onBlur={(e) => set(k, e.target.value)} style={{ ...inp, resize: "vertical" }} />
        : <input defaultValue={c[k]} placeholder={placeholder} dir={rtl ? "rtl" : undefined} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} onBlur={(e) => set(k, e.target.value)} style={{ ...inp, fontFamily: rtl ? AR : "inherit" }} />}
      {hint && <span style={{ fontSize: 11, color: T.faint, marginTop: 3, display: "block" }}>{hint}</span>}
    </label>
  );
  const Toggle = ({ k, label, hint, locked }) => {
    const on = locked ? true : !!c[k];
    return (
      <button type="button" aria-pressed={on} onClick={() => !locked && set(k, !c[k])}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 11, cursor: locked ? "default" : "pointer", fontFamily: "inherit", background: on ? "#f3f8ef" : "#fff", border: "1.5px solid " + (on ? "#a9c199" : T.line) }}>
        <span>
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink }}>{label}</span>
          <span style={{ display: "block", fontSize: 11.5, color: T.faint }}>{locked ? "Required by law here" : hint}</span>
        </span>
        <span style={{ flexShrink: 0, width: 40, height: 23, borderRadius: 12, position: "relative", background: on ? (locked ? "#b7cba9" : T.accent) : "#d6d3c8" }}>
          <span style={{ position: "absolute", top: 3, left: on ? 20 : 3, width: 17, height: 17, borderRadius: 9, background: "#fff", transition: "left .12s" }} />
        </span>
      </button>
    );
  };
  const Card = ({ title, sub, children }) => (
    <section style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: T.faint, marginBottom: 10 }}>{sub}</div>}
      {children}
    </section>
  );
  const grid2 = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 };

  // ---------- preview figures ----------
  const items = uae
    ? [{ q: 1, n: "Dubai Choc Cup", p: 39, m: "Pistachio sauce" }, { q: 1, n: "Spanish Latte", p: 22 }, { q: 1, n: "Mojito", p: 26 }]
    : [{ q: 1, n: "Chocoberry Waffle", p: 8.99, m: "Vanilla ice cream" }, { q: 1, n: "Strawberry Cup", p: 7.99 }, { q: 1, n: "Hot Chocolate", p: 3.99 }];
  const total = Math.round(items.reduce((t, i) => t + i.p, 0) * 100) / 100;
  const vat = Math.round(total * c.vat_rate / (100 + c.vat_rate) * 100) / 100;
  const m = (n) => (uae ? "" : "£") + n.toFixed(2);
  const R = ({ l, r, b, big }) => <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: b || big ? 700 : 400, fontSize: big ? 16 : 13 }}><span>{l}</span><span>{r}</span></div>;
  const Dash = () => <div style={{ borderTop: "1.5px dashed #000", margin: "7px 0" }} />;
  const Ctr = ({ children, s }) => <div style={{ textAlign: "center", ...s }}>{children}</div>;
  const logoPx = { S: 60, M: 90, L: 130 }[c.logo_size];
  const prefixShow = (c.invoice_prefix ? c.invoice_prefix + "-" : "") + "000418";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".6px", textTransform: "uppercase" }}>Customer receipt · this store</div>
          <div style={{ fontSize: 12, color: T.faint }}>{saved ? "This store prints its own design." : "Not set up yet — this store prints the standard receipt."} Kitchen tickets don't change.</div>
        </div>
        <div role="group" aria-label="Country" style={{ display: "flex", gap: 3, background: "#ecebe3", padding: 3, borderRadius: 10 }}>
          {[["UK", "UK · VAT receipt"], ["UAE", "UAE · Tax invoice"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setC((x) => normalizeReceiptCfg({ ...x, country: k, vat_rate: k === "UAE" ? 5 : 20, show_arabic: k === "UAE" }))}
              style={{ border: "none", padding: "7px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: c.country === k ? "#fff" : "transparent", color: c.country === k ? T.ink : T.muted }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 460px", minWidth: 0 }}>
          <Card title="Store details" sub="Who the receipt is from">
            <div style={{ ...grid2, marginBottom: 10 }}>
              <Text k="brand_name" label="Name on the receipt" placeholder={getSetting("brand_name:" + loc.id) || "Chocoberry"} />
              <Text k="phone" label="Phone" placeholder={uae ? "06 000 0000" : "0116 000 0000"} />
              <Text k="address" label="Address" area req placeholder={"Street\nTown, postcode"} />
              <Text k="tax_id" label={uae ? "TRN (15 digits)" : "VAT number"} req placeholder={uae ? "100XXXXXXXXXXX3" : "GB 123 4567 89"} />
              <label style={{ display: "block" }}>
                <span style={lbl}>VAT rate %</span>
                <input type="number" min="0" max="30" step="0.5" defaultValue={c.vat_rate} onBlur={(e) => set("vat_rate", Number(e.target.value))} style={inp} />
              </label>
              {uae && <Text k="invoice_prefix" label="Invoice prefix" req placeholder="AZ" hint={"Invoices run " + prefixShow + ", one number per paid order"} />}
            </div>
            <div style={grid2}>
              <Toggle k="show_address" label="Address and phone" locked />
              <Toggle k="tax_id" label={uae ? "TRN" : "VAT number"} locked />
              {uae && <Toggle k="tax_invoice" label='"Tax Invoice" and invoice number' locked />}
              <Toggle k="show_logo" label="Logo" hint="Black and white prints best" />
              {uae && <Toggle k="show_arabic" label="Arabic name and thank-you" hint="Printed in Arabic and English" />}
            </div>
            {c.show_logo && (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginTop: 10 }}>
                <div style={{ width: 200 }}><ImageUpload value={c.logo_url} prefix="receipt-logos" height={90} onChange={(url) => set("logo_url", url)} /></div>
                <div>
                  <span style={lbl}>Logo size</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {["S", "M", "L"].map((s) => <button key={s} type="button" onClick={() => set("logo_size", s)} style={{ width: 40, padding: "7px 0", borderRadius: 8, border: "1.5px solid " + (c.logo_size === s ? T.accent : T.line), background: c.logo_size === s ? "#f3f8ef" : "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{s}</button>)}
                  </div>
                </div>
              </div>
            )}
            {uae && c.show_arabic && (
              <div style={{ ...grid2, marginTop: 10 }}>
                <Text k="arabic_name" label="Arabic name" rtl />
                <Text k="arabic_footer" label="Arabic thank-you" rtl />
              </div>
            )}
          </Card>

          <Card title="Order details" sub="What the customer sees about their order">
            <div style={grid2}>
              <Toggle k="show_table" label="Table number" hint="Dine-in orders" />
              <Toggle k="big_order_no" label="Large order number" hint="Easier to call out" />
              <Toggle k="show_mods" label="Item extras" hint="Ice cream, sauces, milk" />
              <Toggle k="show_payment" label="How it was paid" hint="Card, cash or split" />
            </div>
          </Card>

          <Card title="Your words" sub="Top and bottom of the receipt">
            <div style={grid2}>
              <Text k="header" label="Header line" placeholder="Fresh desserts, made to order" />
              <Text k="footer" label="Footer line" placeholder="Thank you for visiting!" />
            </div>
          </Card>

          <Card title="Bottom of the receipt" sub="Reasons to come back">
            <div style={{ ...grid2, marginBottom: 10 }}>
              <Toggle k="show_qr" label="QR code" hint="Reviews, feedback, Instagram" />
              <Toggle k="show_wifi" label="Wi-Fi details" hint="Network and password" />
              <Toggle k="show_social" label="Social handle" hint="Instagram or TikTok" />
            </div>
            <div style={grid2}>
              {c.show_qr && <Text k="qr_url" label="QR code opens" placeholder="https://…" />}
              {c.show_qr && <Text k="qr_caption" label="Under the QR code" placeholder="Scan to rate your visit" />}
              {c.show_wifi && <Text k="wifi" label="Wi-Fi" placeholder="Chocoberry-Guest · password" />}
              {c.show_social && <Text k="social" label="Social handle" placeholder="@chocoberry.uk" />}
            </div>
          </Card>
          <div style={{ fontSize: 11.5, color: T.faint }}>Paper width and number of copies are set per printer, in Devices.</div>
        </div>

        <aside style={{ flex: "1 1 320px", position: "sticky", top: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, background: "#e6e4dc", borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase", color: T.muted }}>Preview · example order</div>
          <div style={{ width: 300, background: "#fff", boxShadow: "0 10px 26px rgba(40,36,25,.18)", padding: "16px 16px 12px", fontFamily: "Inter,system-ui,sans-serif", fontSize: 13, lineHeight: 1.5, color: "#000" }}>
            {c.show_logo && (c.logo_url
              ? <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}><img src={c.logo_url} alt="Logo" style={{ width: logoPx, maxHeight: 120, objectFit: "contain", filter: "grayscale(1) contrast(1.4)" }} /></div>
              : <div style={{ width: logoPx, height: logoPx * .6, margin: "0 auto 6px", border: "1.5px dashed #999", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#777" }}>Upload a logo</div>)}
            <Ctr s={{ fontWeight: 700, fontSize: 16, letterSpacing: ".04em" }}>{(c.brand_name || getSetting("brand_name:" + loc.id) || "Chocoberry").toUpperCase()}</Ctr>
            {uae && c.show_arabic && c.arabic_name && <Ctr s={{ fontFamily: AR, fontWeight: 700, direction: "rtl" }}>{c.arabic_name}</Ctr>}
            {c.address ? c.address.split("\n").filter(Boolean).map((l, i) => <Ctr key={i}>{l}</Ctr>) : <Ctr s={{ color: "#b4462f" }}>[address]</Ctr>}
            {c.phone && <Ctr>{c.phone}</Ctr>}
            {c.header && <Ctr s={{ marginTop: 2 }}>{c.header}</Ctr>}
            {uae && <div style={{ background: "#000", color: "#fff", textAlign: "center", fontWeight: 700, padding: "3px 0", marginTop: 6 }}>TAX INVOICE</div>}
            {uae && <Ctr s={{ fontFamily: AR, fontWeight: 700 }}>فاتورة ضريبية</Ctr>}
            <Ctr s={{ fontWeight: 700, color: c.tax_id ? "#000" : "#b4462f" }}>{(uae ? "TRN: " : "VAT No: ") + (c.tax_id || "[required]")}</Ctr>
            <Dash />
            {uae && <R l="Invoice No" r={prefixShow} b />}
            <R l="#T5-042" r={c.show_table ? "TABLE 12" : "DINE IN"} b big={c.big_order_no} />
            <R l="26/10/2026, 19:42" r="" />
            <Dash />
            {uae && <R l={<span style={{ fontSize: 11 }}>Item</span>} r={<span style={{ fontSize: 11 }}>AED</span>} />}
            {items.map((it, i) => (
              <div key={i}>
                <R l={it.q + " x " + it.n} r={m(it.p)} />
                {c.show_mods && it.m && <div style={{ paddingLeft: 14, fontSize: 12 }}>+ {it.m}</div>}
              </div>
            ))}
            <Dash />
            {uae ? (<>
              <R l="Total excl. VAT" r={m(total - vat)} />
              <R l={"VAT " + c.vat_rate + "%"} r={m(vat)} />
              <R l="TOTAL (AED)" r={m(total)} big />
            </>) : (<>
              <R l="TOTAL" r={m(total)} big />
              <R l={"incl. VAT @ " + c.vat_rate + "%"} r={m(vat)} />
            </>)}
            {c.show_payment && <R l="Paid · Card" r={m(total)} />}
            <Dash />
            {uae && c.show_arabic && c.arabic_footer && <Ctr s={{ fontFamily: AR, direction: "rtl" }}>{c.arabic_footer}</Ctr>}
            {c.footer && <Ctr>{c.footer}</Ctr>}
            {c.show_qr && (<>
              <div aria-label="QR code" style={{ width: 84, height: 84, margin: "8px auto 2px", border: "4px solid #000", background: "repeating-linear-gradient(90deg,#000 0 6px,#fff 6px 12px),repeating-linear-gradient(0deg,#000 0 6px,#fff 6px 12px)", backgroundBlendMode: "difference", opacity: c.qr_url ? 1 : .3 }} />
              {c.qr_caption && <Ctr s={{ fontSize: 11 }}>{c.qr_caption}</Ctr>}
            </>)}
            {c.show_wifi && c.wifi && <Ctr s={{ fontSize: 11 }}>Wi-Fi: {c.wifi}</Ctr>}
            {c.show_social && c.social && <Ctr s={{ fontSize: 11 }}>{c.social}</Ctr>}
          </div>
          {uae && <div style={{ fontSize: 11.5, color: T.muted, maxWidth: 300, textAlign: "center" }}>Before payment the slip prints as "BILL - NOT A TAX INVOICE"; the invoice number is given when the order is paid.</div>}
        </aside>
      </div>

      <div style={{ position: "sticky", bottom: 0, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12, padding: "10px 12px", background: T.card, border: "1px solid " + T.line, borderRadius: 12 }}>
        <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, fontWeight: 600, color: note ? (note.tone === "bad" ? "#b4462f" : "#3c5a2e") : missing.length ? "#b4462f" : T.muted }}>
          {note ? note.text : missing.length ? "Still needed: " + missing.join(", ") : dirty ? "Not saved yet" : "All saved"}
        </div>
        {saved && <button type="button" onClick={reset} disabled={!!busy} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid " + T.line, background: "#fff", color: T.muted, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Use standard receipt</button>}
        <button type="button" onClick={test} disabled={!!busy} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid " + T.line, background: "#fff", color: T.ink, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{busy === "test" ? "Printing…" : "Print test"}</button>
        <button type="button" onClick={save} disabled={!!busy || missing.length > 0} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: missing.length ? "#c9c5b8" : T.accent, color: "#fff", fontWeight: 800, cursor: missing.length ? "default" : "pointer", fontFamily: "inherit" }}>{busy === "save" ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
