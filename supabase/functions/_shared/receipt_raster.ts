// RECEIPT DESIGNER 2026-10-26 — the customer receipt a store designs in Admin
// (Stores › Receipt). Kitchen tickets are untouched: they stay in raster.ts.
//
// Built for satori like the rest of the slips, with three extras satori can't
// draw itself, each turned into a picture first with resvg:
//   * Arabic lines — satori lays out glyphs one by one, so Arabic comes out
//     unjoined and backwards. resvg shapes text properly (right to left,
//     joined letters), so each Arabic line is drawn by resvg with Noto Sans
//     Arabic and placed as an image.
//   * the feedback QR code — drawn from its modules.
//   * the logo — fetched once per URL and cached; printed black and white.

import qrcode from "npm:qrcode-generator@1.4.4";
import { Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import type { ReceiptOrder } from "./escpos.ts";
import type { ReceiptCfg } from "./receipt_config.ts";

type Node = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, ...children: unknown[]): Node => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.length === 1 ? children[0] : children },
});
const img = (src: string, w: number, h: number, style: Record<string, unknown> = {}): Node =>
  ({ type: "img", props: { src, width: w, height: h, style: { width: w, height: h, ...style } } });

export interface ReceiptPictures {
  logo?: { src: string; w: number; h: number };
  arName?: { src: string; w: number; h: number };
  arInvoice?: { src: string; w: number; h: number };
  arFooter?: { src: string; w: number; h: number };
  qr?: { src: string; w: number; h: number };
}

// ---- pictures --------------------------------------------------------------
function b64(bytes: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}
const pngUri = (bytes: Uint8Array) => "data:image/png;base64," + b64(bytes);

let arFonts: Promise<Uint8Array[]> | null = null;
function arabicFonts(): Promise<Uint8Array[]> {
  if (!arFonts) {
    const base = "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansArabic/hinted/ttf/";
    arFonts = Promise.all(["NotoSansArabic-Regular.ttf", "NotoSansArabic-Bold.ttf"].map((f) =>
      fetch(base + f).then((r) => { if (!r.ok) throw new Error("arabic font " + r.status); return r.arrayBuffer(); }).then((b) => new Uint8Array(b))));
    arFonts.catch(() => { arFonts = null; });   // try again next time
  }
  return arFonts;
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// One centred Arabic line, shaped by resvg. Returns null if the font can't load
// (the receipt then simply prints without that line).
async function arabicLine(text: string, size: number, bold: boolean, width: number, white = false) {
  const t = text.trim();
  if (!t) return undefined;
  try {
    const fonts = await arabicFonts();
    const h = Math.round(size * 1.7);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}">` +
      `<rect width="${width}" height="${h}" fill="${white ? "#000" : "#fff"}"/>` +
      `<text x="${width / 2}" y="${Math.round(h * 0.68)}" font-family="Noto Sans Arabic" font-weight="${bold ? 700 : 400}" font-size="${size}" text-anchor="middle" direction="rtl" fill="${white ? "#fff" : "#000"}">${esc(t)}</text></svg>`;
    const png = new Resvg(svg, { font: { fontBuffers: fonts, defaultFontFamily: "Noto Sans Arabic", loadSystemFonts: false } } as never).render().asPng();
    return { src: pngUri(png), w: width, h };
  } catch (e) {
    console.error("arabic line skipped:", e);
    return undefined;
  }
}

function qrPicture(url: string, size: number) {
  try {
    const q = qrcode(0, "M");
    q.addData(url);
    q.make();
    const n = q.getModuleCount();
    const quiet = 2, cells = n + quiet * 2, unit = Math.max(2, Math.floor(size / cells)), px = unit * cells;
    let path = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) path += `M${(c + quiet) * unit} ${(r + quiet) * unit}h${unit}v${unit}h-${unit}z`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}"><rect width="${px}" height="${px}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
    return { src: pngUri(new Resvg(svg).render().asPng()), w: px, h: px };
  } catch (e) {
    console.error("qr skipped:", e);
    return undefined;
  }
}

// PNG / JPEG size from the file header, so the logo keeps its shape.
function imageSize(b: Uint8Array): { w: number; h: number; mime: string } | null {
  if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, h: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0, mime: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b[i + 2] << 8 | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b[i + 5] << 8 | b[i + 6], w: b[i + 7] << 8 | b[i + 8], mime: "image/jpeg" };
      i += 2 + len;
    }
  }
  return null;
}
const logoCache = new Map<string, { uri: string; w: number; h: number }>();
async function logoPicture(url: string, maxW: number) {
  try {
    let hit = logoCache.get(url);
    if (!hit) {
      const r = await fetch(url);
      if (!r.ok) throw new Error("logo " + r.status);
      const bytes = new Uint8Array(await r.arrayBuffer());
      const dim = imageSize(bytes);
      if (!dim || !dim.w || !dim.h) throw new Error("logo must be a PNG or JPEG");
      hit = { uri: "data:" + dim.mime + ";base64," + b64(bytes), w: dim.w, h: dim.h };
      logoCache.set(url, hit);
    }
    const w = Math.min(maxW, hit.w * 2), h = Math.round(w * hit.h / hit.w);
    return { src: hit.uri, w, h: Math.min(h, 260) };
  } catch (e) {
    console.error("logo skipped:", e);
    return undefined;
  }
}

export async function receiptPictures(o: ReceiptOrder, c: ReceiptCfg, paperDots: number): Promise<ReceiptPictures> {
  const inner = paperDots - 20;
  const uae = c.country === "UAE";
  const logoW = { S: 0.3, M: 0.45, L: 0.65 }[c.logo_size] * paperDots;
  const [logo, arName, arInvoice, arFooter] = await Promise.all([
    c.show_logo && c.logo_url ? logoPicture(c.logo_url, Math.round(logoW)) : Promise.resolve(undefined),
    uae && c.show_arabic ? arabicLine(c.arabic_name, 30, true, inner) : Promise.resolve(undefined),
    uae && (o as any).invoiceNo ? arabicLine("فاتورة ضريبية", 28, true, inner) : Promise.resolve(undefined),
    uae && c.show_arabic ? arabicLine(c.arabic_footer, 24, false, inner) : Promise.resolve(undefined),
  ]);
  const qr = c.show_qr && c.qr_url ? qrPicture(c.qr_url, Math.round(paperDots * 0.4)) : undefined;
  return { logo, arName, arInvoice, arFooter, qr };
}

// ---- the receipt ----------------------------------------------------------
export function customerReceiptTree(o: ReceiptOrder, c: ReceiptCfg, P: ReceiptPictures): Node {
  const x = o as ReceiptOrder & { invoiceNo?: string; tableLabel?: string; dineIn?: boolean };
  const uae = c.country === "UAE";
  const sym = uae ? "" : String(o.currency || "GBP").toUpperCase() === "GBP" ? "£" : "";
  const m = (n: number) => sym + n.toFixed(2);
  const row = (l: unknown, r: unknown, s: Record<string, unknown> = {}) =>
    el("div", { justifyContent: "space-between", width: "100%", ...s }, el("div", { maxWidth: "75%" }, l), el("div", {}, r));
  const center = (t: string, s: Record<string, unknown> = {}) => el("div", { justifyContent: "center", width: "100%", textAlign: "center", ...s }, t);
  const dash = () => el("div", { borderBottom: "2px dashed #000", width: "100%", margin: "10px 0" });
  const out: unknown[] = [];

  // store details
  if (P.logo) out.push(el("div", { justifyContent: "center", width: "100%", marginBottom: 8 }, img(P.logo.src, P.logo.w, P.logo.h)));
  out.push(center((c.brand_name || o.brandName || "Chocoberry").toUpperCase(), { fontSize: 34, fontWeight: 700, letterSpacing: 2 }));
  if (P.arName) out.push(el("div", { justifyContent: "center", width: "100%" }, img(P.arName.src, P.arName.w, P.arName.h)));
  for (const l of c.address.split("\n").map((s) => s.trim()).filter(Boolean)) out.push(center(l));
  if (c.phone) out.push(center(c.phone));
  if (c.header) out.push(center(c.header, { marginTop: 4 }));

  // tax heading
  if (uae && x.invoiceNo) {
    out.push(el("div", { justifyContent: "center", width: "100%", background: "#000", color: "#fff", fontWeight: 700, fontSize: 30, padding: "6px 0", marginTop: 10 }, "TAX INVOICE"));
    if (P.arInvoice) out.push(el("div", { justifyContent: "center", width: "100%" }, img(P.arInvoice.src, P.arInvoice.w, P.arInvoice.h)));
  } else if (uae) {
    // Printed before payment: a bill, not the invoice. The invoice (with its
    // number) prints once the order is paid.
    out.push(el("div", { justifyContent: "center", width: "100%", border: "3px solid #000", fontWeight: 700, fontSize: 28, padding: "4px 0", marginTop: 10 }, "BILL - NOT A TAX INVOICE"));
  }
  if (c.tax_id) out.push(center((uae ? "TRN: " : "VAT No: ") + c.tax_id, { fontWeight: 700, marginTop: 4 }));
  if (o.reprint) out.push(center("* COPY *", { fontWeight: 700, fontSize: 28, marginTop: 6 }));
  out.push(dash());

  // order
  if (uae && x.invoiceNo) out.push(row("Invoice No", x.invoiceNo, { fontWeight: 700 }));
  const no = "#" + (o.tabletNo ? "T" + o.tabletNo + "-" : "") + o.orderNumber;
  const where = x.dineIn ? (c.show_table && x.tableLabel ? x.tableLabel.toUpperCase() : "DINE IN") : "TAKEAWAY";
  out.push(row(no, where, { fontWeight: 700, fontSize: c.big_order_no ? 36 : 26 }));
  out.push(row(String(o.placedAt).replace(/(\d{1,2}:\d{2}):\d{2}/, "$1"), o.customerName ? o.customerName : ""));
  out.push(dash());

  // items
  if (uae) out.push(row("Item", "AED", { fontSize: 20 }));
  for (const it of o.items) {
    out.push(row(`${it.qty} x ${it.name}`, typeof it.price === "number" ? m(it.price) : ""));
    if (c.show_mods) for (const mod of it.modifiers ?? []) out.push(el("div", { paddingLeft: 26, fontSize: 21 }, "+ " + mod));
  }
  out.push(dash());

  // totals
  const total = typeof o.total === "number" ? o.total : o.items.reduce((t, it) => t + (typeof it.price === "number" ? it.price : 0), 0);
  const disc = typeof o.discount === "number" && o.discount > 0 ? o.discount : 0;
  const due = Math.max(0, Math.round((total - disc) * 100) / 100);
  const vat = Math.round(due * c.vat_rate / (100 + c.vat_rate) * 100) / 100;
  const big = { fontWeight: 700, fontSize: 32 };
  if (disc) {
    out.push(row("Subtotal", m(total)));
    out.push(row("Discount" + (o.discountLabel ? " (" + o.discountLabel + ")" : ""), "-" + m(disc)));
  }
  if (uae) {
    out.push(row("Total excl. VAT", m(due - vat)));
    out.push(row("VAT " + c.vat_rate + "%", m(vat)));
    out.push(row("TOTAL (AED)", m(due), big));
  } else {
    out.push(row("TOTAL", m(due), big));
    out.push(row("incl. VAT @ " + c.vat_rate + "%", m(vat)));
  }
  if (c.show_payment) {
    const paid = typeof o.amountPaid === "number" ? o.amountPaid : 0;
    const left = Math.round((due - paid) * 100) / 100;
    const method = o.paidMethod ? o.paidMethod.replace(/_/g, " ").replace(/\b\w/g, (s) => s.toUpperCase()) : "";
    if (paid > 0) out.push(row("Paid" + (method ? " · " + method : ""), m(paid)));
    if (left > 0.004) out.push(row("Balance due", m(left), { fontWeight: 700 }));
  }
  out.push(dash());

  // bottom
  if (P.arFooter) out.push(el("div", { justifyContent: "center", width: "100%" }, img(P.arFooter.src, P.arFooter.w, P.arFooter.h)));
  if (c.footer) out.push(center(c.footer));
  if (P.qr) {
    out.push(el("div", { justifyContent: "center", width: "100%", marginTop: 8 }, img(P.qr.src, P.qr.w, P.qr.h)));
    if (c.qr_caption) out.push(center(c.qr_caption, { fontSize: 21 }));
  }
  if (c.show_wifi && c.wifi) out.push(center("Wi-Fi: " + c.wifi, { fontSize: 21 }));
  if (c.show_social && c.social) out.push(center(c.social, { fontSize: 21 }));

  return el("div",
    { flexDirection: "column", width: "100%", fontFamily: "Inter", fontSize: 24, lineHeight: 1.35, color: "#000", background: "#fff", padding: "8px 10px" },
    ...out);
}
