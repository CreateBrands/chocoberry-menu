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
  const isZ = m.kind !== "x";
  const zNo = s.z_number != null ? String(s.z_number).padStart(6, "0") : null;
  const body = fs(22), small = fs(18), rowPad = fs(4);

  // ---- building blocks ----
  const rule = (w = 2, my = 8) => el({ height: 0, borderTop: `${w}px solid #000`, width: "100%", margin: `${fs(my)}px 0` });
  const dotted = () => el({ height: 0, borderTop: "2px dashed #000", width: "100%", margin: `${fs(6)}px 0` });
  const bar = (title: string, right = "") =>
    el({ background: "#000", color: "#fff", justifyContent: "space-between", alignItems: "center", padding: `${fs(5)}px ${fs(12)}px`, marginTop: fs(18), marginBottom: fs(6) },
      txt(title, { fontSize: fs(20), fontWeight: 700, letterSpacing: 2 }),
      txt(right, { fontSize: fs(16), fontWeight: 700, letterSpacing: 1 }));
  // label ......... value   (optional count column)
  const line = (label: string, value: string, o: { bold?: boolean; big?: boolean; indent?: boolean; count?: string; showCount?: boolean } = {}) =>
    el({ justifyContent: "space-between", alignItems: "baseline", padding: `${rowPad}px 0`, fontSize: o.big ? fs(26) : body, fontWeight: o.bold ? 700 : 400 },
      txt(label, { paddingLeft: o.indent ? fs(14) : 0, flex: 1 }),
      o.showCount ? txt(o.count ?? "", { width: fs(70), justifyContent: "flex-end" }) : txt(""),
      txt(value, { width: fs(170), justifyContent: "flex-end" }));
  const head = (cols: [string, string, string]) =>
    el({ justifyContent: "space-between", fontSize: fs(15), fontWeight: 700, letterSpacing: 1, paddingBottom: fs(2) },
      txt(cols[0], { flex: 1 }), txt(cols[1], { width: fs(70), justifyContent: "flex-end" }), txt(cols[2], { width: fs(170), justifyContent: "flex-end" }));
  const totalRow = (label: string, value: string, count?: string) =>
    col({}, rule(2, 4), line(label, value, { bold: true, count, showCount: count !== undefined }));

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
  parts.push(col({ background: "#000", color: "#fff", alignItems: "center", padding: `${fs(10)}px 0`, marginTop: fs(14) },
    txt(title, { fontSize: fs(32), fontWeight: 700, letterSpacing: 4 }),
    txt(subtitle, { fontSize: fs(17), marginTop: fs(2) })));

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
      txt(label, { fontSize: fs(14), fontWeight: 700, letterSpacing: 1 }));
  parts.push(col({ border: "3px solid #000", marginTop: fs(14) },
    col({ alignItems: "center", padding: `${fs(10)}px 0 ${fs(8)}px` },
      txt("NET SALES", { fontSize: fs(16), fontWeight: 700, letterSpacing: 3 }),
      txt(money(s.net), { fontSize: fs(54), fontWeight: 700, lineHeight: 1.05 })),
    el({ borderTop: "2px solid #000" },
      stat("ORDERS", String(s.order_count || 0)),
      stat("AVG ORDER", money(s.avg_ticket)),
      stat("TAKEN", money(s.total), true))));

  // ---- 5. Sales ----
  parts.push(bar("SALES", "INC. VAT"));
  parts.push(line("Gross sales", n2(s.gross)));
  if (Number(s.discount_total) > 0) parts.push(line("Discounts", "-" + n2(s.discount_total), { indent: true }));
  if (Number(s.refund_total) > 0) parts.push(line("Refunds (" + (s.refund_count || 0) + ")", "-" + n2(s.refund_total), { indent: true }));
  parts.push(totalRow("Net sales", n2(s.net)));
  if (s.items_sold) parts.push(line("Items sold", String(s.items_sold), { indent: true }));

  // ---- 6. VAT ----
  const rate = Number(m.vatRate);
  if (rate > 0) {
    const gross = Number(s.net) || 0;
    const vat = Math.round(gross * rate / (100 + rate) * 100) / 100;
    parts.push(bar("VAT", rate + "% STANDARD"));
    parts.push(line("Net of VAT", n2(gross - vat)));
    parts.push(line("VAT", n2(vat)));
    parts.push(totalRow("Gross", n2(gross)));
  }

  // ---- 7. Takings ----
  const t = s.tenders || {};
  parts.push(bar("TAKINGS", "PAYMENTS RECEIVED"));
  parts.push(head(["", "COUNT", cur]));
  parts.push(line("Card", n2(s.card), { count: String(t.card || 0), showCount: true }));
  parts.push(line("Cash", n2(s.cash), { count: String(t.cash || 0), showCount: true }));
  if (Number(s.other) !== 0 || t.other) parts.push(line("Other", n2(s.other), { count: String(t.other || 0), showCount: true }));
  parts.push(totalRow("Total taken", n2(s.total), String(s.tender_count || 0)));
  if (s.platform && s.platform.count) {
    parts.push(dotted());
    parts.push(line("Delivery platforms", n2(s.platform.amount), { count: String(s.platform.count), showCount: true }));
    parts.push(txt("Paid out later by the platform — not in the drawer or on the card terminal.", { fontSize: fs(16), paddingLeft: fs(14) }));
  }
  if (Number(s.unpaid_count) > 0) {
    parts.push(el({ border: "2px solid #000", marginTop: fs(8), padding: `${fs(4)}px ${fs(10)}px`, justifyContent: "space-between", fontSize: body, fontWeight: 700 },
      txt("UNPAID AT CLOSE · " + s.unpaid_count), txt(n2(s.unpaid_total))));
  }

  // ---- 8. Cash drawer ----
  parts.push(bar("CASH DRAWER"));
  if (s.float_amount != null) parts.push(line("Opening float", n2(s.float_amount)));
  parts.push(line("+ Cash taken", n2(s.cash)));
  const counted = s.cash_counted;
  if (counted != null) {
    parts.push(totalRow("= Expected", n2(s.cash_expected)));
    parts.push(line("Counted", n2(counted), { bold: true }));
    const v = Number(s.cash_variance) || 0;
    const verdict = v === 0 ? "BALANCED" : v > 0 ? "OVER" : "SHORT";
    // The result is what a manager looks for first: solid black, full width.
    parts.push(el({ background: "#000", color: "#fff", justifyContent: "space-between", alignItems: "center", padding: `${fs(8)}px ${fs(12)}px`, marginTop: fs(8) },
      txt(verdict, { fontSize: fs(30), fontWeight: 700, letterSpacing: 3 }),
      txt((v > 0 ? "+" : "") + n2(v), { fontSize: fs(30), fontWeight: 700 })));
  } else if (m.kind === "x") {
    parts.push(totalRow("= Expected now", n2((Number(s.float_amount) || 0) + (Number(s.cash) || 0))));
  } else {
    parts.push(el({ border: "3px solid #000", justifyContent: "center", padding: `${fs(8)}px 0`, marginTop: fs(8) },
      txt("CASH NOT COUNTED", { fontSize: fs(26), fontWeight: 700, letterSpacing: 2 })));
  }

  // ---- 9. Order type + channel ----
  const types = (Object.entries(s.by_type || {}) as [string, any][]).sort((a, b) => b[1].amount - a[1].amount);
  if (types.length) {
    parts.push(bar("ORDER TYPE"));
    parts.push(head(["", "ORDERS", cur]));
    for (const [key, v] of types) parts.push(line(TYPE_LABEL[key] || key, n2(v.amount), { count: String(v.count), showCount: true }));
  }
  const rank = (x: string) => { const i = SOURCE_ORDER.indexOf(x); return i < 0 ? 99 : i; };
  const srcs = (Object.entries(s.by_source || {}) as [string, any][]).sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].amount - a[1].amount);
  if (srcs.length) {
    parts.push(bar("CHANNEL"));
    parts.push(head(["", "ORDERS", cur]));
    for (const [key, v] of srcs) parts.push(line(key, n2(v.amount), { count: String(v.count), showCount: true }));
  }

  // ---- 10. Controls ----
  parts.push(bar("CONTROLS", "CHECK THESE"));
  parts.push(head(["", "COUNT", cur]));
  parts.push(line("Voided items", n2(s.void_total), { count: String(s.void_count || 0), showCount: true }));
  parts.push(line("Refunds", n2(s.refund_total), { count: String(s.refund_count || 0), showCount: true }));
  parts.push(line("Discounts", n2(s.discount_total), { count: "", showCount: true }));
  parts.push(line("Cancelled orders", n2(s.cancelled_total), { count: String(s.cancelled_count || 0), showCount: true }));
  if (s.drawer_opens != null) parts.push(line("No-sale drawer opens", "", { count: String(s.drawer_opens), showCount: true }));
  parts.push(line("Unpaid at close", n2(s.unpaid_total), { count: String(s.unpaid_count || 0), showCount: true }));

  // ---- 11. Top items ----
  const top = Array.isArray(s.top_items) ? s.top_items : [];
  if (top.length) {
    parts.push(bar("TOP ITEMS"));
    parts.push(head(["", "QTY", cur]));
    top.forEach((it: any, i: number) => parts.push(
      el({ justifyContent: "space-between", alignItems: "baseline", padding: `${rowPad}px 0`, fontSize: body },
        txt(String(i + 1) + ".", { width: fs(34), fontWeight: 700 }),
        txt(String(it.name || "").slice(0, narrow ? 18 : 26), { flex: 1 }),
        txt(String(it.qty || 0), { width: fs(70), justifyContent: "flex-end" }),
        txt(n2(it.sales), { width: fs(136), justifyContent: "flex-end" }))));
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
