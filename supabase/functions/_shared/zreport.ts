// ===========================================================================
// ZREPORT 2026-10-24 — the end-of-day slip (Z report), X read and reprint.
// 80mm paper, Font A = 48 characters a line (Sunmi NT311 / D3 Pro).
//
// Layout follows what the main POS systems print (Lightspeed, Toast, NCR
// Aloha, Oracle Simphony) and what HMRC / the UAE FTA expect:
//   header with VAT number / TRN → Z number + running grand total (an
//   unbroken, never-reset sequence) → sales → VAT → order type → channel →
//   takings by payment type → cash drawer (float, expected, counted, over /
//   short) → controls (voids, refunds, cancels, no-sale opens, unpaid) →
//   top items → sign-off.
// Sales and cash are two separate sums on purpose: the drawer is balanced
// from cash received, never from the sales total.
// ===========================================================================
import { Receipt } from "./escpos.ts";

const W = 48;

export type ZKind = "z" | "x" | "reprint";

export interface ZMeta {
  kind: ZKind;
  brandName: string;
  storeName: string;
  legalName?: string;
  address?: string;
  taxNumber?: string;     // UK VAT number or UAE TRN
  currency: string;       // GBP / AED / ...
  vatRate: number | null; // % included in prices; null / 0 = don't print VAT
  timeZone: string;
  printedAt: Date;
}

const num = (n: unknown) => {
  const v = Number(n) || 0;
  const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (v < 0 ? "-" : "") + s;
};
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
const lpad = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

function fmtDate(iso: string | null | undefined, tz: string, withTime = true) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "—";
  const o: Intl.DateTimeFormatOptions = withTime
    ? { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
    : { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("en-GB", o).format(d).replace(",", "");
}

const SOURCE_ORDER = ["Till", "Tablet", "Table QR", "App", "Web", "Phone"];
const TYPE_LABEL: Record<string, string> = {
  dine_in: "Eat-in", takeaway: "Takeaway", collection: "Collection", delivery: "Delivery", other: "Other",
};

export function buildZReport(s: any, m: ZMeta): Receipt {
  const r = new Receipt().init();
  const cur = m.currency || "GBP";
  const lr = (l: string, v: string) => r.leftRight(l, v, W);
  // Three columns: label | count | amount
  const row3 = (l: string, c: string, v: string) => r.line(pad(l, 26) + lpad(c, 8) + lpad(v, 14));
  const sec = (t: string) => r.bold(true).line(t).bold(false);
  const div = () => r.line("-".repeat(W));
  const dbl = () => r.line("=".repeat(W));
  const isZ = m.kind !== "x";
  const zNo = s.z_number != null ? String(s.z_number).padStart(6, "0") : null;

  // ---- Header: who and where ----
  r.align(1).size(1, 1).bold(true).line((m.brandName || "CHOCOBERRY").toUpperCase()).bold(false).size(0, 0);
  if (m.storeName) r.line(m.storeName);
  if (m.legalName) r.line(m.legalName);
  if (m.address) for (const part of String(m.address).split(/\n|\s*\|\s*/)) if (part.trim()) r.line(part.trim());
  if (m.taxNumber) r.line((cur === "AED" ? "TRN: " : "VAT No: ") + m.taxNumber);
  r.align(0);
  dbl();
  r.align(1).size(0, 1).bold(true)
    .line(m.kind === "x" ? "X READ - NOT A CLOSE" : m.kind === "reprint" ? "Z REPORT - REPRINT" : "Z REPORT - END OF DAY")
    .bold(false).size(0, 0);
  if (isZ && zNo) r.size(1, 1).bold(true).line("Z No. " + zNo).bold(false).size(0, 0);
  if (m.kind === "x") r.line("Figures so far. Nothing is reset.");
  if (m.kind === "reprint") r.line("Copy of the original. Not a new close.");
  r.align(0);
  dbl();

  lr("Trading day", fmtDate(s.first_order || s.closed_at || m.printedAt.toISOString(), m.timeZone, false));
  lr("First order", fmtDate(s.first_order, m.timeZone));
  lr("Last order", fmtDate(s.last_order, m.timeZone));
  if (s.mode === "trading_day" && s.cutoff) lr("Day ends", fmtDate(s.cutoff, m.timeZone));
  if (isZ && s.closed_at) lr("Closed", fmtDate(s.closed_at, m.timeZone));
  if (s.closed_by) lr("Closed by", String(s.closed_by).slice(0, 30));
  if (s.approved_by) lr("Approved by", String(s.approved_by).slice(0, 30));
  lr("Printed", fmtDate(m.printedAt.toISOString(), m.timeZone));
  div();

  // ---- Continuity: the unbroken sequence ----
  if (isZ && (s.receipt_from != null || s.gt_after != null)) {
    sec("CONTINUITY");
    if (s.receipt_from != null) lr("  Orders", "#" + s.receipt_from + " - #" + s.receipt_to);
    if (s.gt_before != null) {
      lr("  Grand total b/f", num(s.gt_before));
      lr("  + This Z (taken)", num(s.total));
      lr("  Grand total c/f", num(s.gt_after));
    }
    div();
  }

  // ---- Sales ----
  sec("SALES (" + cur + ", PRICES INCLUDE VAT)");
  lr("  Gross sales", num(s.gross));
  if (Number(s.discount_total) > 0) lr("  Discounts", "-" + num(s.discount_total));
  if (Number(s.refund_total) > 0) lr("  Refunds (" + (s.refund_count || 0) + ")", "-" + num(s.refund_total));
  r.bold(true); lr("NET SALES", num(s.net)); r.bold(false);
  lr("  Orders / average", (s.order_count || 0) + " / " + num(s.avg_ticket));
  if (s.items_sold) lr("  Items sold", String(s.items_sold));
  div();

  // ---- VAT ----
  const rate = Number(m.vatRate);
  if (rate > 0) {
    const gross = Number(s.net) || 0;
    const vat = Math.round(gross * rate / (100 + rate) * 100) / 100;
    sec("VAT ANALYSIS");
    r.line(pad("", 14) + lpad("NET", 11) + lpad("VAT", 11) + lpad("GROSS", 12));
    r.line(pad("  " + rate + "%", 14) + lpad(num(gross - vat), 11) + lpad(num(vat), 11) + lpad(num(gross), 12));
    r.line(cur === "AED" ? "  All sales at the standard rate." : "  Every sale treated as standard-rated.");
    div();
  }

  // ---- Order type ----
  const types = Object.entries(s.by_type || {}) as [string, any][];
  if (types.length) {
    sec("ORDER TYPE");
    row3("", "ORDERS", cur);
    for (const [k, v] of types.sort((a, b) => b[1].amount - a[1].amount)) row3("  " + (TYPE_LABEL[k] || k), String(v.count), num(v.amount));
    div();
  }

  // ---- Channel ----
  const srcs = Object.entries(s.by_source || {}) as [string, any][];
  if (srcs.length) {
    sec("SALES BY CHANNEL");
    row3("", "ORDERS", cur);
    const rank = (k: string) => { const i = SOURCE_ORDER.indexOf(k); return i < 0 ? 99 : i; };
    for (const [k, v] of srcs.sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].amount - a[1].amount)) row3("  " + k, String(v.count), num(v.amount));
    div();
  }

  // ---- Takings ----
  sec("TAKINGS (PAYMENTS RECEIVED)");
  row3("", "COUNT", cur);
  const t = s.tenders || {};
  row3("  Card", String(t.card || 0), num(s.card));
  row3("  Cash", String(t.cash || 0), num(s.cash));
  if (Number(s.other) !== 0 || t.other) row3("  Other", String(t.other || 0), num(s.other));
  r.bold(true); row3("TOTAL TAKEN", String(s.tender_count || 0), num(s.total)); r.bold(false);
  if (s.platform && s.platform.count) {
    row3("  Delivery platforms *", String(s.platform.count), num(s.platform.amount));
    r.line("  * Paid out later by the platform, not cash in");
    r.line("    the drawer or card on the terminal.");
  }
  if (Number(s.unpaid_count) > 0) { r.bold(true); row3("  UNPAID AT CLOSE", String(s.unpaid_count), num(s.unpaid_total)); r.bold(false); }
  div();

  // ---- Cash drawer ----
  sec("CASH DRAWER");
  const counted = s.cash_counted;
  if (s.float_amount != null) lr("  Opening float" + (s.float_changed ? " (changed)" : ""), num(s.float_amount));
  if (s.float_changed && s.float_known != null) lr("    System float was", num(s.float_known));
  lr("  + Cash taken (after cash refunds)", num(s.cash));
  if (Number(s.cash_dropped) > 0) lr("  - Dropped to safe", num(s.cash_dropped));
  if (Number(s.dropped_mid_shift) > 0) lr("  - Dropped mid-shift", num(s.dropped_mid_shift));
  if (Number(s.paid_out) > 0) lr("  - Paid out", num(s.paid_out));
  if (Number(s.paid_in) > 0) lr("  + Paid in", num(s.paid_in));
  if (counted != null) {
    lr("  = Expected in drawer", num(s.cash_expected));
    lr("  Counted", num(counted));
    if (Number(s.recounts) > 0 && s.first_count != null) lr("  First count (" + (Number(s.recounts) + 1) + " counts)", num(s.first_count));
    const v = Number(s.cash_variance) || 0;
    r.bold(true); lr(v === 0 ? "BALANCED" : v > 0 ? "OVER" : "SHORT", num(v)); r.bold(false);
    if (s.to_bank != null) lr("  To bank / safe", num(s.to_bank));
    if (s.float_left != null) lr("  Float left for tomorrow", num(s.float_left));
  } else if (m.kind === "x") {
    lr("  = Expected in drawer", num((Number(s.float_amount) || 0) + (Number(s.cash) || 0)));
  } else {
    r.bold(true).line("  CASH NOT COUNTED").bold(false);
  }
  div();

  // ---- Controls ----
  sec("CONTROLS");
  row3("", "COUNT", cur);
  row3("  Voided items", String(s.void_count || 0), num(s.void_total));
  row3("  Refunds", String(s.refund_count || 0), num(s.refund_total));
  row3("  Discounts", "", num(s.discount_total));
  row3("  Cancelled orders", String(s.cancelled_count || 0), num(s.cancelled_total));
  if (s.drawer_opens != null) row3("  No-sale drawer opens", String(s.drawer_opens), "");
  row3("  Unpaid at close", String(s.unpaid_count || 0), num(s.unpaid_total));
  div();

  // ---- Top items ----
  const top = Array.isArray(s.top_items) ? s.top_items : [];
  if (top.length) {
    sec("TOP ITEMS");
    row3("", "QTY", cur);
    for (const it of top) row3("  " + String(it.name || "").slice(0, 24), String(it.qty || 0), num(it.sales));
    div();
  }

  const shifts = Array.isArray(s.shifts) ? s.shifts : [];
  if (shifts.length) {
    sec("SHIFTS");
    for (const sh of shifts) {
      const tt = (iso: string) => iso ? new Intl.DateTimeFormat("en-GB", { timeZone: m.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)) : "now";
      const v = sh.variance == null ? "-" : num(sh.variance);
      row3("  " + tt(sh.opened_at) + "-" + tt(sh.ended_at) + " " + String(sh.opened_by || "").split(" ")[0].slice(0, 8), sh.taken == null ? "" : num(sh.taken), v);
    }
    div();
  }

  const po = s.payout_reasons && typeof s.payout_reasons === "object" ? Object.entries(s.payout_reasons as Record<string, number>) : [];
  if (po.length) {
    sec("PAY OUTS");
    for (const [rr, a] of po) lr("  " + String(rr).slice(0, 30), num(a));
    lr("  Total paid out", num(s.paid_out));
    div();
  }
  if (s.note) { sec("NOTE"); for (const l of String(s.note).match(/.{1,46}(\s|$)/g) || [String(s.note)]) r.line("  " + l.trim()); div(); }

  if (m.kind !== "x") {
    sec("SIGN-OFF");
    r.feed(1).line("  Staff:   " + "_".repeat(34)).feed(1).line("  Manager: " + "_".repeat(34));
  }
  dbl();
  r.align(1);
  if (m.kind === "x") r.bold(true).line("*** X READ - DAY STILL OPEN ***").bold(false);
  else r.bold(true).line("*** " + (m.kind === "reprint" ? "REPRINT - " : "DAY CLOSED - ") + (zNo ? "Z " + zNo : "Z") + " ***").bold(false);
  if (m.kind !== "x") r.line(cur === "AED" ? "Keep with daily sales records (UAE FTA)" : "Keep with daily takings for 6 years (HMRC)");
  r.align(0).feed(3).cut();
  return r;
}


// SHIFTS 2026-10-24 — text fallback for the shift handover slip.
export function buildShiftSlip(r: any, m: ZMeta): Receipt {
  const rc = new Receipt().init();
  const lr = (l: string, v: string) => rc.leftRight(l, v, W);
  const tt = (iso: string) => iso ? new Intl.DateTimeFormat("en-GB", { timeZone: m.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)) : "-";
  rc.align(1).size(1, 1).bold(true).line((m.brandName || "CHOCOBERRY").toUpperCase()).bold(false).size(0, 0);
  if (m.storeName) rc.line(m.storeName);
  rc.line("=".repeat(W)).size(0, 1).bold(true).line("SHIFT HANDOVER").bold(false).size(0, 0)
    .line(tt(r.opened_at) + " - " + tt(r.ended_at)).align(0).line("=".repeat(W));
  lr("Opened by", String(r.opened_by || "-").slice(0, 30));
  lr("Ended by", String(r.ended_by || "-").slice(0, 30));
  rc.line("-".repeat(W));
  lr("Card", num(r.card)); lr("Cash", num(r.cash)); if (Number(r.other)) lr("Other", num(r.other));
  rc.bold(true); lr("TAKEN (" + (r.orders || 0) + " orders)", num(r.taken)); rc.bold(false);
  rc.line("-".repeat(W));
  lr("Opening float", num(r.opening_float)); lr("+ Cash this shift", num(r.cash));
  if (Number(r.paid_out)) lr("- Paid out", num(r.paid_out));
  if (Number(r.paid_in)) lr("+ Paid in", num(r.paid_in));
  if (Number(r.dropped_mid_shift)) lr("- Dropped mid-shift", num(r.dropped_mid_shift));
  lr("= Expected", num(r.expected));
  lr("Counted in drawer", num(r.counted_raw));
  if (Number(r.cash_since_end)) lr("- Next shift's cash", num(r.cash_since_end));
  lr("Counted for this shift", num(r.counted));
  if (Number(r.recounts) > 0 && r.first_count != null) lr("First count (" + (Number(r.recounts) + 1) + " counts)", num(r.first_count));
  const v = Number(r.variance) || 0;
  rc.bold(true); lr(v === 0 ? "BALANCED" : v > 0 ? "OVER" : "SHORT", num(v)); rc.bold(false);
  rc.line("-".repeat(W));
  rc.bold(true); lr("DROP TO SAFE", num(r.drop)); lr("FLOAT LEFT", num(r.float_left)); rc.bold(false);
  if (r.note) { rc.line("-".repeat(W)); for (const l of String(r.note).match(/.{1,46}(\s|$)/g) || [String(r.note)]) rc.line("  " + l.trim()); }
  rc.feed(1).line("  Outgoing: " + "_".repeat(33)).feed(1).line("  Incoming: " + "_".repeat(33));
  rc.feed(3).cut();
  return rc;
}

// CASH MOVEMENTS 2026-10-25 — text fallback of cashSlipTree.
export function buildCashSlip(r: any, m: ZMeta): Receipt {
  const rc = new Receipt().init();
  const lr = (l: string, v: string) => rc.leftRight(l, v, W);
  const title: Record<string, string> = { payout: "PAY OUT", payin: "PAY IN", drop: "DROP TO SAFE", collection: "SAFE COLLECTION", safe_count: "SAFE COUNT" };
  rc.align(1).size(1, 1).bold(true).line((m.brandName || "CHOCOBERRY").toUpperCase()).bold(false).size(0, 0);
  if (m.storeName) rc.line(m.storeName);
  rc.line("=".repeat(W)).size(0, 1).bold(true).line(title[r.type] || "CASH").line(num(r.type === "safe_count" ? r.counted : r.amount)).bold(false).size(0, 0);
  if (r.undo) rc.bold(true).line("CANCELLED").bold(false);
  rc.line(r.at ? new Intl.DateTimeFormat("en-GB", { timeZone: m.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(r.at)) : "").align(0).line("=".repeat(W));
  if (r.reason) lr("Reason", String(r.reason).slice(0, 30));
  if (r.bag_no) lr("Bag number", String(r.bag_no));
  if (r.type === "safe_count") { lr("Expected", num(r.expected)); lr("Counted", num(r.counted)); if (r.first_count != null && Number(r.checks) > 1) lr("First count (" + r.checks + " checks)", num(r.first_count)); rc.bold(true); lr(Number(r.variance) === 0 ? "BALANCED" : Number(r.variance) > 0 ? "OVER" : "SHORT", num(r.variance)); rc.bold(false); }
  if (r.safe_after != null) lr("Safe should now hold", num(r.safe_after));
  if (r.by) lr("By", String(r.by).slice(0, 30));
  if (r.witness) lr("Witness", String(r.witness).slice(0, 30));
  if (r.approved_by) lr("Approved by", String(r.approved_by).slice(0, 30));
  if (r.note) for (const l of String(r.note).match(/.{1,46}(\s|$)/g) || [String(r.note)]) rc.line("  " + l.trim());
  rc.feed(1).line("  Signed: " + "_".repeat(35)).feed(1).line("  Signed: " + "_".repeat(35));
  rc.feed(3).cut();
  return rc;
}
