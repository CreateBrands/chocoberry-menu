// ===========================================================================
// ZREPORT RASTER 2026-10-24 — the end-of-day slip drawn as an image, the same
// way customer receipts are (satori -> resvg -> 1-bit raster), so it gets real
// typography: a headline figure, section bars, aligned columns and a boxed
// cash result. The text version in zreport.ts stays as the fallback and is
// used if this throws or comes out too large to send.
//
// Thermal paper is 1-bit: everything here is pure black or pure white.
// Same data and order as zreport.ts (see the notes there on what HMRC / FTA
// and the main POS systems expect on a Z).
// ===========================================================================
import type { ZMeta } from "./zreport.ts";

type Node = { type: string; props: Record<string, unknown> };
type S = Record<string, unknown>;
const el = (style: S, ...children: unknown[]): Node => ({
  type: "div",
  props: { style: { display: "flex", ...style }, children: children.length === 1 ? children[0] : children },
});
const col = (style: S, ...c: unknown[]) => el({ flexDirection: "column", ...style }, ...c);
const txt = (s: unknown, style: S = {}) => el(style, String(s ?? ""));

const SYM: Record<string, string> = { GBP: "£", EUR: "€", USD: "$" };

function fmtDate(iso: unknown, tz: string, kind: "day" | "time" | "full") {
  if (!iso) return "—";
  const d = new Date(String(iso));
  if (!isFinite(d.getTime())) return "—";
  const o: Intl.DateTimeFormatOptions = kind === "day"
    ? { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric" }
    : kind === "time"
      ? { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
      : { timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  return new Intl.DateTimeFormat("en-GB", o).format(d).replace(",", "");
}

const TYPE_LABEL: Record<string, string> = {
  dine_in: "Eat-in", takeaway: "Takeaway", collection: "Collection", delivery: "Delivery", other: "Other",
};
const SOURCE_ORDER = ["Till", "Tablet", "Table QR", "App", "Web", "Phone"];

export function zReportTree(s: any, m: ZMeta, dots = 576): Node {
  const narrow = dots < 500;                    // 58mm handheld paper
  const k = narrow ? 0.72 : 1;                  // scale every size for 58mm
  const fs = (n: number) => Math.round(n * k);
  const cur = (m.currency || "GBP").toUpperCase();
  const sym = SYM[cur];
  const n2 = (v: unknown) => {
    const x = Number(v) || 0;
    return (x < 0 ? "-" : "") + Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  const money = (v: unknown) => {
    const x = Number(v) || 0;
    return (x < 0 ? "-" : "") + (sym ? sym : cur + " ") + n2(Math.abs(x));
  };
  // Share of a whole, for the % column. Blank when the whole is zero.
  const pct = (part: unknown, whole: unknown) => {
    const w = Number(whole) || 0, p = Number(part) || 0;
    if (w <= 0) return "";
    const v = (p / w) * 100;
    return (v >= 10 || v === 0 ? v.toFixed(0) : v.toFixed(1)) + "%";
  };
  // Shorten a long name at a word where possible, with an ellipsis.
  const clip = (t: string, n: number) => {
    if (t.length <= n) return t;
    const cut = t.slice(0, n - 1), sp = cut.lastIndexOf(" ");
    return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
  };
  const isZ = m.kind !== "x";
  const zNo = s.z_number != null ? String(s.z_number).padStart(6, "0") : null;
  const body = fs(22), small = fs(18), rowPad = fs(4);

  // ---- building blocks ----
  const rule = (w = 2, my = 8) => el({ height: 0, borderTop: `${w}px solid #000`, width: "100%", margin: `${fs(my)}px 0` });
  const dotted = () => el({ height: 0, borderTop: "2px dashed #000", width: "100%", margin: `${fs(6)}px 0` });
  // Section heading: bold title over a heavy rule. No black fills anywhere on
  // this slip - solid black overheats a thermal head, smearing the text
  // around it and slowing the print (24 Oct, first real Z came out blurred).
  const bar = (title: string, right = "") =>
    el({ justifyContent: "space-between", alignItems: "flex-end", borderBottom: "4px solid #000", paddingBottom: fs(4), marginTop: fs(22), marginBottom: fs(6) },
      txt(title, { fontSize: fs(23), fontWeight: 700, letterSpacing: 1 }),
      txt(right, { fontSize: fs(16), fontWeight: 700 }));
  // label ......... value   (optional count column)
  // label | count | % | amount — count and % columns only where asked for.
  const CW = fs(64), PW = fs(76), VW = fs(150);
  type LineOpts = { bold?: boolean; big?: boolean; indent?: boolean; count?: string; showCount?: boolean; pct?: string; showPct?: boolean };
  const line = (label: string, value: string, o: LineOpts = {}) =>
    el({ justifyContent: "space-between", alignItems: "baseline", padding: `${rowPad}px 0`, fontSize: o.big ? fs(26) : body, fontWeight: o.bold ? 700 : 400 },
      txt(label, { paddingLeft: o.indent ? fs(14) : 0, flex: 1 }),
      o.showCount ? txt(o.count ?? "", { width: CW, justifyContent: "flex-end" }) : txt(""),
      o.showPct ? txt(o.pct ?? "", { width: PW, justifyContent: "flex-end" }) : txt(""),
      txt(value, { width: VW, justifyContent: "flex-end" }));
  const head = (cols: string[], showCount = true, showPct = false) =>
    el({ justifyContent: "space-between", fontSize: fs(16), fontWeight: 700, paddingBottom: fs(2) },
      txt(cols[0], { flex: 1 }),
      showCount ? txt(cols[1], { width: CW, justifyContent: "flex-end" }) : txt(""),
      showPct ? txt("%", { width: PW, justifyContent: "flex-end" }) : txt(""),
      txt(cols[2], { width: VW, justifyContent: "flex-end" }));
  const totalRow = (label: string, value: string, count?: string, pctStr?: string) =>
    col({}, rule(2, 4), line(label, value, { bold: true, count, showCount: count !== undefined, pct: pctStr, showPct: pctStr !== undefined }));

  const parts: unknown[] = [];

  // ---- 1. Header ----
  parts.push(col({ alignItems: "center", textAlign: "center" },
    txt((m.brandName || "Chocoberry").toUpperCase(), { fontSize: fs(42), fontWeight: 700, letterSpacing: 3 }),
    m.storeName ? txt(m.storeName, { fontSize: fs(24), fontWeight: 700, marginTop: fs(2) }) : txt(""),
    m.legalName ? txt(m.legalName, { fontSize: small, marginTop: fs(4) }) : txt(""),
    ...(m.address ? String(m.address).split(/\n|\s*\|\s*/).filter((p) => p.trim()).map((p) => txt(p.trim(), { fontSize: small })) : []),
    m.taxNumber ? txt((cur === "AED" ? "TRN " : "VAT No. ") + m.taxNumber, { fontSize: small, fontWeight: 700, marginTop: fs(2) }) : txt(""),
  ));

  // ---- 2. Title banner ----
  const title = m.kind === "x" ? "X READ" : m.kind === "reprint" ? "Z REPORT · REPRINT" : "Z REPORT";
  const subtitle = m.kind === "x" ? "Figures so far · nothing is reset" : m.kind === "reprint" ? "Copy of the original · not a new close" : "End of day · till closed";
  parts.push(col({ border: "4px solid #000", alignItems: "center", padding: `${fs(8)}px 0`, marginTop: fs(14) },
    txt(title, { fontSize: fs(34), fontWeight: 700, letterSpacing: 3 }),
    txt(subtitle, { fontSize: fs(18), fontWeight: 700, marginTop: fs(2) })));

  // ---- 3. Z number + trading day ----
  parts.push(el({ justifyContent: "space-between", alignItems: "flex-end", marginTop: fs(12) },
    col({},
      txt(isZ ? "Z NUMBER" : "READ AT", { fontSize: fs(15), fontWeight: 700, letterSpacing: 2 }),
      txt(isZ ? (zNo || "—") : fmtDate(m.printedAt.toISOString(), m.timeZone, "time"), { fontSize: fs(40), fontWeight: 700, lineHeight: 1.1 })),
    col({ alignItems: "flex-end" },
      txt(fmtDate(s.first_order || s.closed_at || m.printedAt.toISOString(), m.timeZone, "day"), { fontSize: fs(24), fontWeight: 700 }),
      txt(fmtDate(s.first_order, m.timeZone, "time") + " – " + fmtDate(s.last_order, m.timeZone, "time") + "  ·  " + cur, { fontSize: small }))));

  // ---- 4. Headline box ----
  const stat = (label: string, value: string, last = false) =>
    col({ flex: 1, alignItems: "center", borderRight: last ? "0px solid #000" : "2px solid #000", padding: `${fs(4)}px 0` },
      txt(value, { fontSize: fs(26), fontWeight: 700 }),
      txt(label, { fontSize: fs(16), fontWeight: 700 }));
  parts.push(col({ border: "3px solid #000", marginTop: fs(14) },
    col({ alignItems: "center", padding: `${fs(10)}px 0 ${fs(8)}px` },
      txt("NET SALES", { fontSize: fs(16), fontWeight: 700, letterSpacing: 3 }),
      txt(money(s.net), { fontSize: fs(54), fontWeight: 700, lineHeight: 1.05 })),
    el({ borderTop: "2px solid #000" },
      stat("ORDERS", String(s.order_count || 0)),
      stat("AVG ORDER", money(s.avg_ticket)),
      stat("TAKEN", money(s.total), true))));

  // ---- 5. Sales ----
  parts.push(bar("SALES", "INC. VAT · % OF GROSS"));
  parts.push(line("Gross sales", n2(s.gross), { pct: "100%", showPct: true }));
  if (Number(s.discount_total) > 0) parts.push(line("Discounts", "-" + n2(s.discount_total), { indent: true, pct: pct(s.discount_total, s.gross), showPct: true }));
  if (Number(s.refund_total) > 0) parts.push(line("Refunds (" + (s.refund_count || 0) + ")", "-" + n2(s.refund_total), { indent: true, pct: pct(s.refund_total, s.gross), showPct: true }));
  parts.push(totalRow("Net sales", n2(s.net), undefined, pct(s.net, s.gross)));
  if (s.items_sold) parts.push(line("Items sold", String(s.items_sold), { indent: true }));

  // ---- 6. VAT ----
  const rate = Number(m.vatRate);
  if (rate > 0) {
    const gross = Number(s.net) || 0;
    const vat = Math.round(gross * rate / (100 + rate) * 100) / 100;
    parts.push(bar("VAT", rate + "% STANDARD"));
    parts.push(line("Net of VAT", n2(gross - vat), { pct: pct(gross - vat, gross), showPct: true }));
    parts.push(line("VAT", n2(vat), { pct: pct(vat, gross), showPct: true }));
    parts.push(totalRow("Gross", n2(gross), undefined, "100%"));
  }

  // ---- 7. Takings ----
  const t = s.tenders || {};
  parts.push(bar("TAKINGS", "PAYMENTS RECEIVED"));
  parts.push(head(["", "COUNT", cur], true, true));
  parts.push(line("Card", n2(s.card), { count: String(t.card || 0), showCount: true, pct: pct(s.card, s.total), showPct: true }));
  parts.push(line("Cash", n2(s.cash), { count: String(t.cash || 0), showCount: true, pct: pct(s.cash, s.total), showPct: true }));
  if (Number(s.other) !== 0 || t.other) parts.push(line("Other", n2(s.other), { count: String(t.other || 0), showCount: true, pct: pct(s.other, s.total), showPct: true }));
  parts.push(totalRow("Total taken", n2(s.total), String(s.tender_count || 0), "100%"));
  if (s.platform && s.platform.count) {
    parts.push(dotted());
    parts.push(line("Delivery platforms", n2(s.platform.amount), { count: String(s.platform.count), showCount: true, pct: pct(s.platform.amount, s.net), showPct: true }));
    parts.push(txt("% of net sales. Paid out later by the platform — not in the drawer or on the card terminal.", { fontSize: fs(16), paddingLeft: fs(14) }));
  }
  if (Number(s.unpaid_count) > 0) {
    parts.push(el({ border: "2px solid #000", marginTop: fs(8), padding: `${fs(4)}px ${fs(10)}px`, justifyContent: "space-between", fontSize: body, fontWeight: 700 },
      txt("UNPAID AT CLOSE · " + s.unpaid_count), txt(n2(s.unpaid_total))));
  }

  // ---- 8. Cash drawer ----
  parts.push(bar("CASH DRAWER"));
  if (s.float_amount != null) parts.push(line("Opening float" + (s.float_changed ? " (changed)" : ""), n2(s.float_amount)));
  if (s.float_changed && s.float_known != null) parts.push(line("  System float was", n2(s.float_known)));
  parts.push(line("+ Cash taken", n2(s.cash)));
  if (Number(s.cash_dropped) > 0) parts.push(line("− Dropped to safe", n2(s.cash_dropped)));
  const counted = s.cash_counted;
  if (counted != null) {
    parts.push(totalRow("= Expected", n2(s.cash_expected)));
    parts.push(line("Counted", n2(counted), { bold: true }));
    // CASH CONTROLS: counting again until it balances is visible on paper.
    if (Number(s.recounts) > 0 && s.first_count != null) parts.push(line("First count (" + (Number(s.recounts) + 1) + " counts)", n2(s.first_count)));
    const v = Number(s.cash_variance) || 0;
    const verdict = v === 0 ? "BALANCED" : v > 0 ? "OVER" : "SHORT";
    // The result is what a manager looks for first: large, in a heavy box.
    parts.push(el({ border: "4px solid #000", justifyContent: "space-between", alignItems: "center", padding: `${fs(8)}px ${fs(12)}px`, marginTop: fs(8) },
      txt(verdict, { fontSize: fs(30), fontWeight: 700, letterSpacing: 3 }),
      txt((v > 0 ? "+" : "") + n2(v) + (v !== 0 && Number(s.cash_expected) > 0 ? "  (" + (v > 0 ? "+" : "-") + pct(Math.abs(v), s.cash_expected) + ")" : ""), { fontSize: fs(30), fontWeight: 700 })));
  } else if (m.kind === "x") {
    parts.push(totalRow("= Expected now", n2((Number(s.float_amount) || 0) + (Number(s.cash) || 0))));
  } else {
    parts.push(el({ border: "3px solid #000", justifyContent: "center", padding: `${fs(8)}px 0`, marginTop: fs(8) },
      txt("CASH NOT COUNTED", { fontSize: fs(26), fontWeight: 700, letterSpacing: 2 })));
  }

  // ---- 9. Order type + channel ----
  const types = (Object.entries(s.by_type || {}) as [string, any][]).sort((a, b) => b[1].amount - a[1].amount);
  if (types.length) {
    const tAll = types.reduce((a, [, v]) => a + (Number(v.amount) || 0), 0);
    parts.push(bar("ORDER TYPE", "% OF SALES"));
    parts.push(head(["", "ORDERS", cur], true, true));
    for (const [key, v] of types) parts.push(line(TYPE_LABEL[key] || key, n2(v.amount), { count: String(v.count), showCount: true, pct: pct(v.amount, tAll), showPct: true }));
  }
  const rank = (x: string) => { const i = SOURCE_ORDER.indexOf(x); return i < 0 ? 99 : i; };
  const srcs = (Object.entries(s.by_source || {}) as [string, any][]).sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].amount - a[1].amount);
  if (srcs.length) {
    const sAll = srcs.reduce((a, [, v]) => a + (Number(v.amount) || 0), 0);
    parts.push(bar("CHANNEL", "% OF SALES"));
    parts.push(head(["", "ORDERS", cur], true, true));
    for (const [key, v] of srcs) parts.push(line(key, n2(v.amount), { count: String(v.count), showCount: true, pct: pct(v.amount, sAll), showPct: true }));
  }

  // ---- 10. Controls ----
  parts.push(bar("CONTROLS", "% OF GROSS"));
  parts.push(head(["", "COUNT", cur], true, true));
  const ctl = (label: string, amount: unknown, count: string, withPct = true) =>
    line(label, amount === "" ? "" : n2(amount), { count, showCount: true, pct: withPct ? pct(amount, s.gross) : "", showPct: true });
  parts.push(ctl("Voided items", s.void_total, String(s.void_count || 0)));
  parts.push(ctl("Refunds", s.refund_total, String(s.refund_count || 0)));
  parts.push(ctl("Discounts", s.discount_total, ""));
  parts.push(ctl("Cancelled orders", s.cancelled_total, String(s.cancelled_count || 0)));
  if (s.drawer_opens != null) parts.push(ctl("No-sale drawer opens", "", String(s.drawer_opens), false));
  parts.push(ctl("Unpaid at close", s.unpaid_total, String(s.unpaid_count || 0)));

  // ---- 11. Top items ----
  const top = Array.isArray(s.top_items) ? s.top_items : [];
  if (top.length) {
    parts.push(bar("TOP ITEMS", "% OF NET SALES"));
    parts.push(head(["", "QTY", cur], true, true));
    top.forEach((it: any, i: number) => parts.push(
      el({ justifyContent: "space-between", alignItems: "baseline", padding: `${rowPad}px 0`, fontSize: body },
        txt(String(i + 1) + ".", { width: fs(34), fontWeight: 700 }),
        txt(clip(String(it.name || ""), narrow ? 13 : 19), { flex: 1 }),
        txt(String(it.qty || 0), { width: CW, justifyContent: "flex-end" }),
        txt(pct(it.sales, s.net), { width: PW, justifyContent: "flex-end" }),
        txt(n2(it.sales), { width: VW, justifyContent: "flex-end" }))));
  }

  // ---- 11b. Shifts (handovers during the day) ----
  const shifts = Array.isArray(s.shifts) ? s.shifts : [];
  if (shifts.length) {
    parts.push(bar("SHIFTS", "OVER / SHORT"));
    for (const sh of shifts) {
      const who = String(sh.opened_by || "—").split(" ")[0];
      const span = fmtDate(sh.opened_at, m.timeZone, "time") + "–" + (sh.ended_at ? fmtDate(sh.ended_at, m.timeZone, "time") : "now");
      const v = sh.variance == null ? (sh.status === "closed" ? "end of day" : "running") : ((Number(sh.variance) > 0 ? "+" : "") + n2(sh.variance));
      parts.push(el({ justifyContent: "space-between", alignItems: "baseline", padding: `${rowPad}px 0`, fontSize: body },
        txt(span + "  " + who, { flex: 1 }),
        txt(sh.taken == null ? "" : n2(sh.taken), { width: VW, justifyContent: "flex-end" }),
        txt(v, { width: fs(130), justifyContent: "flex-end", fontWeight: 700 })));
    }
    if (Number(s.cash_dropped) > 0) parts.push(line("Dropped to safe", n2(s.cash_dropped), { bold: true }));
  }

  // ---- 12. Continuity (audit trail) ----
  if (isZ && (s.receipt_from != null || s.gt_after != null)) {
    parts.push(bar("CONTINUITY", "AUDIT"));
    if (s.receipt_from != null) parts.push(line("Orders", "#" + s.receipt_from + " – #" + s.receipt_to));
    if (s.gt_before != null) {
      parts.push(line("Grand total b/f", n2(s.gt_before)));
      parts.push(line("+ This Z (taken)", n2(s.total), { indent: true }));
      parts.push(totalRow("Grand total c/f", n2(s.gt_after)));
    }
  }

  // ---- 13. Note ----
  if (s.note) {
    parts.push(bar("NOTE"));
    parts.push(txt(String(s.note), { fontSize: body, lineHeight: 1.35 }));
  }

  // ---- 14. Details + sign-off ----
  parts.push(rule(2, 14));
  const meta = (l: string, v: string) => el({ justifyContent: "space-between", fontSize: small, padding: `${fs(2)}px 0` }, txt(l), txt(v, { fontWeight: 700 }));
  if (s.mode === "trading_day" && s.cutoff) parts.push(meta("Trading day ends", fmtDate(s.cutoff, m.timeZone, "full")));
  if (isZ && s.closed_at) parts.push(meta("Closed", fmtDate(s.closed_at, m.timeZone, "full")));
  if (s.closed_by) parts.push(meta("Closed by", String(s.closed_by).slice(0, 30)));
  if (s.approved_by) parts.push(meta("Approved by", String(s.approved_by).slice(0, 30)));
  parts.push(meta("Printed", fmtDate(m.printedAt.toISOString(), m.timeZone, "full")));
  if (m.kind !== "x") {
    const sign = (who: string) => col({ flex: 1, marginRight: fs(16) },
      el({ height: fs(54), borderBottom: "2px solid #000" }),
      txt(who, { fontSize: fs(15), fontWeight: 700, letterSpacing: 2, marginTop: fs(4) }));
    parts.push(el({ marginTop: fs(10) }, sign("STAFF SIGNATURE"), sign("MANAGER")));
  }

  // ---- 15. Footer ----
  parts.push(col({ alignItems: "center", marginTop: fs(18) },
    el({ border: "2px solid #000", padding: `${fs(5)}px ${fs(16)}px` },
      txt(m.kind === "x" ? "DAY STILL OPEN" : (m.kind === "reprint" ? "REPRINT · " : "DAY CLOSED · ") + (zNo ? "Z " + zNo : "Z"), { fontSize: fs(20), fontWeight: 700, letterSpacing: 2 })),
    m.kind !== "x" ? txt(cur === "AED" ? "Keep with daily sales records (UAE FTA)" : "Keep with daily takings for 6 years (HMRC)", { fontSize: fs(15), marginTop: fs(6) }) : txt("")));

  return col({ width: dots, padding: `${fs(6)}px ${fs(6)}px ${fs(20)}px`, background: "#fff", color: "#000", fontFamily: "Inter", fontSize: body }, ...parts);
}


// ===========================================================================
// SHIFTS 2026-10-24 — the handover slip printed when a shift is counted.
// Same visual language as the Z report, much shorter.
// ===========================================================================
export function shiftSlipTree(r: any, m: ZMeta, dots = 576): Node {
  const narrow = dots < 500, k = narrow ? 0.72 : 1, fs = (n: number) => Math.round(n * k);
  const cur = (m.currency || "GBP").toUpperCase(), sym = SYM[cur];
  const n2 = (v: unknown) => { const x = Number(v) || 0; return (x < 0 ? "-" : "") + Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); };
  const money = (v: unknown) => { const x = Number(v) || 0; return (x < 0 ? "-" : "") + (sym ? sym : cur + " ") + n2(Math.abs(x)); };
  const pct = (a: unknown, b: unknown) => { const w = Number(b) || 0; if (w <= 0) return ""; const v = (Number(a) || 0) / w * 100; return (v >= 10 || v === 0 ? v.toFixed(0) : v.toFixed(1)) + "%"; };
  const body = fs(22), small = fs(18);
  const row = (l: string, v: string, o: { bold?: boolean; p?: string } = {}) =>
    el({ justifyContent: "space-between", alignItems: "baseline", padding: `${fs(4)}px 0`, fontSize: body, fontWeight: o.bold ? 700 : 400 },
      txt(l, { flex: 1 }), txt(o.p ?? "", { width: fs(76), justifyContent: "flex-end" }), txt(v, { width: fs(150), justifyContent: "flex-end" }));
  const rule = () => el({ height: 0, borderTop: "2px solid #000", width: "100%", margin: `${fs(4)}px 0` });
  const bar = (t: string, right = "") => el({ justifyContent: "space-between", alignItems: "flex-end", borderBottom: "4px solid #000", paddingBottom: fs(4), marginTop: fs(20), marginBottom: fs(6) },
    txt(t, { fontSize: fs(23), fontWeight: 700 }), txt(right, { fontSize: fs(16), fontWeight: 700 }));
  const t = (iso: unknown) => fmtDate(iso, m.timeZone, "time");
  const v = Number(r.variance) || 0;
  const parts: unknown[] = [];
  parts.push(col({ alignItems: "center" },
    txt((m.brandName || "Chocoberry").toUpperCase(), { fontSize: fs(34), fontWeight: 700, letterSpacing: 2 }),
    m.storeName ? txt(m.storeName, { fontSize: fs(22), fontWeight: 700 }) : txt("")));
  parts.push(col({ border: "4px solid #000", alignItems: "center", padding: `${fs(8)}px 0`, marginTop: fs(12) },
    txt("SHIFT HANDOVER", { fontSize: fs(30), fontWeight: 700, letterSpacing: 2 }),
    txt(fmtDate(r.opened_at, m.timeZone, "day") + " · " + t(r.opened_at) + " – " + t(r.ended_at), { fontSize: small, fontWeight: 700, marginTop: fs(2) })));
  parts.push(el({ justifyContent: "space-between", marginTop: fs(10), fontSize: small },
    col({}, txt("OPENED BY", { fontSize: fs(15), fontWeight: 700 }), txt(r.opened_by || "—", { fontSize: body, fontWeight: 700 })),
    col({ alignItems: "flex-end" }, txt("ENDED BY", { fontSize: fs(15), fontWeight: 700 }), txt(r.ended_by || "—", { fontSize: body, fontWeight: 700 }))));
  parts.push(col({ border: "3px solid #000", alignItems: "center", padding: `${fs(8)}px 0`, marginTop: fs(12) },
    txt("TAKEN THIS SHIFT", { fontSize: fs(16), fontWeight: 700, letterSpacing: 2 }),
    txt(money(r.taken), { fontSize: fs(46), fontWeight: 700, lineHeight: 1.05 }),
    txt((r.orders || 0) + " orders", { fontSize: small, fontWeight: 700 })));
  parts.push(bar("TAKINGS", "% OF TAKEN"));
  parts.push(row("Card", n2(r.card), { p: pct(r.card, r.taken) }));
  parts.push(row("Cash", n2(r.cash), { p: pct(r.cash, r.taken) }));
  if (Number(r.other)) parts.push(row("Other", n2(r.other), { p: pct(r.other, r.taken) }));
  if (Number(r.refunds)) parts.push(row("Refunds", "-" + n2(r.refunds)));
  parts.push(rule()); parts.push(row("Total taken", n2(r.taken), { bold: true, p: "100%" }));
  parts.push(bar("CASH DRAWER", "BLIND COUNT"));
  parts.push(row("Opening float", n2(r.opening_float)));
  parts.push(row("+ Cash this shift", n2(r.cash)));
  parts.push(rule()); parts.push(row("= Expected", n2(r.expected), { bold: true }));
  parts.push(row("Counted in drawer", n2(r.counted_raw)));
  if (Number(r.cash_since_end)) parts.push(row("− Next shift's cash", n2(r.cash_since_end)));
  parts.push(row("Counted for this shift", n2(r.counted), { bold: true }));
  if (Number(r.recounts) > 0 && r.first_count != null) parts.push(row("First count (" + (Number(r.recounts) + 1) + " counts)", n2(r.first_count)));
  parts.push(el({ border: "4px solid #000", justifyContent: "space-between", alignItems: "center", padding: `${fs(8)}px ${fs(12)}px`, marginTop: fs(8) },
    txt(v === 0 ? "BALANCED" : v > 0 ? "OVER" : "SHORT", { fontSize: fs(30), fontWeight: 700, letterSpacing: 2 }),
    txt((v > 0 ? "+" : "") + n2(v) + (v !== 0 && Number(r.expected) > 0 ? "  (" + (v > 0 ? "+" : "-") + pct(Math.abs(v), r.expected) + ")" : ""), { fontSize: fs(30), fontWeight: 700 })));
  parts.push(bar("HANDOVER"));
  parts.push(row("Drop to safe", n2(r.drop), { bold: true }));
  parts.push(row("Float left in drawer", n2(r.float_left), { bold: true }));
  if (r.note) { parts.push(bar("NOTE")); parts.push(txt(String(r.note), { fontSize: body, lineHeight: 1.35 })); }
  const sign = (who: string) => col({ flex: 1, marginRight: fs(16) }, el({ height: fs(54), borderBottom: "2px solid #000" }), txt(who, { fontSize: fs(15), fontWeight: 700, marginTop: fs(4) }));
  parts.push(el({ marginTop: fs(16) }, sign("OUTGOING"), sign("INCOMING / MANAGER")));
  parts.push(col({ alignItems: "center", marginTop: fs(12) }, txt("Counted " + fmtDate(r.counted_at, m.timeZone, "full") + (r.confirmed_by ? " · " + String(r.confirmed_by).split(" ")[0] : ""), { fontSize: fs(15) })));
  return col({ width: dots, padding: `${fs(6)}px ${fs(6)}px ${fs(20)}px`, background: "#fff", color: "#000", fontFamily: "Inter", fontSize: body }, ...parts);
}
