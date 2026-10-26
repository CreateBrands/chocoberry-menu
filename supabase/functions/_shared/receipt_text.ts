// RECEIPT DESIGNER 2026-10-26 — plain-text fallback for a designed customer
// receipt, used only if the picture version (receipt_raster.ts) fails to
// render. Same lines in the same order; no logo, QR or Arabic (a text printer
// has no Arabic code page), but every line the law needs is still there.

import { Receipt, wrap, LINE_WIDTH, type ReceiptOrder } from "./escpos.ts";
import type { ReceiptCfg } from "./receipt_config.ts";

export function buildDesignedReceiptText(o: ReceiptOrder, c: ReceiptCfg): Receipt {
  const x = o as ReceiptOrder & { invoiceNo?: string; tableLabel?: string; dineIn?: boolean };
  const uae = c.country === "UAE";
  const code = uae ? "" : "GBP ";
  const m = (n: number) => code + n.toFixed(2);
  const r = new Receipt().init();

  r.align(1).size(1, 1).bold(true).line((c.brand_name || o.brandName || "Chocoberry").toUpperCase()).bold(false).size(0, 0);
  for (const l of c.address.split("\n").map((s) => s.trim()).filter(Boolean)) r.line(l);
  if (c.phone) r.line(c.phone);
  if (c.header) for (const l of wrap(c.header, LINE_WIDTH)) r.line(l);
  if (uae) r.feed(1).bold(true).line(x.invoiceNo ? "TAX INVOICE" : "BILL - NOT A TAX INVOICE").bold(false);
  if (c.tax_id) r.bold(true).line((uae ? "TRN: " : "VAT No: ") + c.tax_id).bold(false);
  if (o.reprint) r.bold(true).line("* COPY *").bold(false);
  r.align(0).divider();

  if (uae && x.invoiceNo) r.leftRight("Invoice No", x.invoiceNo);
  const no = "#" + (o.tabletNo ? "T" + o.tabletNo + "-" : "") + o.orderNumber;
  const where = x.dineIn ? (c.show_table && x.tableLabel ? x.tableLabel.toUpperCase() : "DINE IN") : "TAKEAWAY";
  r.bold(true).leftRight(no, where).bold(false);
  r.line(o.placedAt);
  r.divider();

  for (const it of o.items) {
    r.leftRight(`${it.qty} x ${it.name}`, typeof it.price === "number" ? m(it.price) : "");
    if (c.show_mods) for (const mod of it.modifiers ?? []) for (const l of wrap("+ " + mod, LINE_WIDTH - 2)) r.line("  " + l);
  }
  r.divider();

  const total = typeof o.total === "number" ? o.total : o.items.reduce((t, it) => t + (typeof it.price === "number" ? it.price : 0), 0);
  const disc = typeof o.discount === "number" && o.discount > 0 ? o.discount : 0;
  const due = Math.max(0, Math.round((total - disc) * 100) / 100);
  const vat = Math.round(due * c.vat_rate / (100 + c.vat_rate) * 100) / 100;
  if (disc) { r.leftRight("Subtotal", m(total)); r.leftRight("Discount", "-" + m(disc)); }
  if (uae) {
    r.leftRight("Total excl. VAT", m(due - vat));
    r.leftRight("VAT " + c.vat_rate + "%", m(vat));
    r.bold(true).leftRight("TOTAL (AED)", m(due)).bold(false);
  } else {
    r.bold(true).leftRight("TOTAL", m(due)).bold(false);
    r.leftRight("incl. VAT @ " + c.vat_rate + "%", m(vat));
  }
  if (c.show_payment) {
    const paid = typeof o.amountPaid === "number" ? o.amountPaid : 0;
    const left = Math.round((due - paid) * 100) / 100;
    if (paid > 0) r.leftRight("Paid" + (o.paidMethod ? " " + o.paidMethod.toUpperCase() : ""), m(paid));
    if (left > 0.004) r.bold(true).leftRight("Balance due", m(left)).bold(false);
  }
  r.divider().align(1);
  if (c.footer) for (const l of wrap(c.footer, LINE_WIDTH)) r.line(l);
  if (c.show_qr && c.qr_url) r.line(c.qr_url);
  if (c.show_wifi && c.wifi) r.line("Wi-Fi: " + c.wifi);
  if (c.show_social && c.social) r.line(c.social);
  r.feed(3).cut();
  return r;
}
