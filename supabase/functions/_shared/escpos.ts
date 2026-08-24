// ===========================================================================
// ⚠ FALLBACK ONLY — THIS IS **NOT** WHAT NORMALLY PRINTS.
//    buildOrderReceipt() below is a plain-text ESC/POS receipt used ONLY if the
//    raster renderer (raster.ts) throws. With RECEIPT_MODE="raster" (the
//    default), the printer uses raster.ts, NOT this file.
//
//    ➜ To change what the kitchen slip looks like, edit raster.ts (receiptTree).
//    ➜ Editing THIS file alone will NOT change the normal printed receipt.
//    Keep this fallback in sync with raster.ts so both render the same info.
// ===========================================================================
// ---------------------------------------------------------------------------
// ESC/POS builder for Sunmi NT311 (80mm, Font A = 48 chars per line)
// Sunmi cloud printers accept UTF-8 text inside standard ESC/POS commands.
// ---------------------------------------------------------------------------

const ESC = 0x1b;
const GS = 0x1d;

export const LINE_WIDTH = 48; // 80mm paper, Font A

export class Receipt {
  private bytes: number[] = [];
  private enc = new TextEncoder();

  raw(...b: number[]): this {
    this.bytes.push(...b);
    return this;
  }

  /** Initialise printer (clears styles) */
  init(): this {
    return this.raw(ESC, 0x40);
  }

  /** 0 = left, 1 = centre, 2 = right */
  align(n: 0 | 1 | 2): this {
    return this.raw(ESC, 0x61, n);
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** Width/height multipliers, 0 = normal .. 3 = 4x */
  size(w: 0 | 1 | 2 | 3, h: 0 | 1 | 2 | 3): this {
    return this.raw(GS, 0x21, ((w & 0x0f) << 4) | (h & 0x0f));
  }

  text(s: string): this {
    this.bytes.push(...this.enc.encode(s));
    return this;
  }

  line(s = ""): this {
    return this.text(s + "\n");
  }

  feed(n = 1): this {
    return this.raw(ESC, 0x64, Math.max(0, Math.min(n, 255)));
  }

  divider(ch = "-", width = LINE_WIDTH): this {
    return this.line(ch.repeat(width));
  }

  /** Left + right text on one line, padded to `width` columns */
  leftRight(left: string, right: string, width = LINE_WIDTH): this {
    const space = width - left.length - right.length;
    if (space >= 1) return this.line(left + " ".repeat(space) + right);
    // Left text too long: wrap it, put right value on its own line
    for (const l of wrap(left, width)) this.line(l);
    return this.line(" ".repeat(Math.max(0, width - right.length)) + right);
  }

  /** Partial cut with feed */
  cut(): this {
    return this.raw(GS, 0x56, 0x42, 0x00);
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.bytes);
  }

  toBase64(): string {
    let bin = "";
    const b = this.toBytes();
    for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return btoa(bin);
  }

  toHex(): string {
    return [...this.toBytes()]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }
}

export function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  for (const para of s.split("\n")) {
    let cur = "";
    for (const word of para.split(" ")) {
      if (cur.length === 0) cur = word;
      else if (cur.length + 1 + word.length <= width) cur += " " + word;
      else {
        out.push(cur);
        cur = word;
      }
      while (cur.length > width) {
        out.push(cur.slice(0, width));
        cur = cur.slice(width);
      }
    }
    out.push(cur);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Order shape used by templates. normalizeOrder() (index.ts) maps DB rows here.
// ---------------------------------------------------------------------------

export interface ReceiptItem {
  qty: number;
  name: string;
  price?: number; // line total in GBP (e.g. 7.5)
  modifiers?: string[]; // e.g. ["No cream", "Extra strawberries"]
  note?: string; // per-item kitchen note (e.g. "Extra hot, no cream")
  added?: boolean; // true if this line was added after the original order
  batch?: number; // round number: 0 = original, 1 = 2nd round, 2 = 3rd round ...
}

export interface ReceiptOrder {
  orderNumber: string;
  tabletNo?: string; // tablet the order came from, prefixes the order number (T3-014)
  reprint?: boolean; // true when this is a re-print of an already-printed order
  hasAdditions?: boolean; // true when items were added to an existing order
  placedAt: string; // pre-formatted local time string
  orderType?: string; // "Collection", "Delivery", "Table 4" ...
  customerName?: string;
  phone?: string;
  items: ReceiptItem[];
  subtotal?: number;
  deliveryFee?: number;
  total?: number;
  notes?: string;
  storeName?: string;
  batchTimes?: string[]; // pre-formatted local time per round; batchTimes[0]=original, [1]=2nd round ...
}

const gbp = (n: number) => "GBP " + n.toFixed(2);
// NOTE: "£" prints fine on most NT-series charset configs (UTF-8 world font).
// Test it; if it renders as garbage, keep "GBP", or set the printer's default
// character set to UTF-8 in the Cloud Printer Utility.

export function buildOrderReceipt(o: ReceiptOrder): Receipt {
  const r = new Receipt().init();

  // Header
  r.align(1).size(1, 1).bold(true).line("CHOCOBERRY").bold(false).size(0, 0);
  if (o.storeName) r.line(o.storeName);
  // Reprint marker — makes a duplicate slip unmistakable so it isn't taken as a new order.
  if (o.reprint) {
    r.feed(1).size(1, 1).bold(true).line("*** REPRINT ***").line("DUPLICATE").bold(false).size(0, 0);
  }
  r.feed(1);

  // Order number — big, this is what the kitchen looks for
  r.size(1, 2).bold(true).line(`#${o.tabletNo ? "T" + o.tabletNo + "-" : ""}${o.orderNumber}`).bold(false).size(0, 0);
  if (o.orderType) r.size(0, 1).line(o.orderType.toUpperCase()).size(0, 0);
  r.line(o.placedAt);

  // Pay-at-counter banner — tells staff the order is UNPAID and how much to charge.
  if (typeof o.total === "number") {
    r.feed(1).divider("*").size(3, 3).bold(true).line("PAY AT TILL").size(2, 2).line(gbp(o.total)).bold(false).size(0, 0).divider("*");
  }
  r.feed(1);

  // Customer block
  r.align(0);
  if (o.customerName || o.phone) {
    r.divider();
    if (o.customerName) r.line(`Customer: ${o.customerName}`);
    if (o.phone) r.line(`Phone:    ${o.phone}`);
  }

  // Items — when items were added to an existing order, split into ORIGINAL and
  // ADDED sections so the kitchen sees clearly what's new (and doesn't remake the
  // original). Otherwise print a single flat list.
  const printItem = (it: ReceiptItem) => {
    const qtyName = `${it.qty} x ${it.name}`;
    if (typeof it.price === "number") {
      r.size(0, 1).bold(true);
      r.leftRight(qtyName, gbp(it.price));
      r.bold(false).size(0, 0);
    } else {
      r.size(0, 1).bold(true).line(qtyName).bold(false).size(0, 0);
    }
    for (const m of it.modifiers ?? []) {
      for (const l of wrap("+ " + m, LINE_WIDTH - 2)) r.line("  " + l);
    }
    if (it.note) {
      r.bold(true);
      for (const l of wrap("** " + it.note + " **", LINE_WIDTH - 2)) r.line("  " + l);
      r.bold(false);
    }
  };

  if (o.hasAdditions) {
    const bt = o.batchTimes || [];
    const batches = [...new Set(o.items.map((it) => it.batch ?? 0))].sort((a, b) => a - b);
    for (const b of batches) {
      const label = b === 0 ? "ROUND 1" : "ROUND " + (b + 1) + " - ADDED";
      const time = bt[b] || "";
      r.divider("-");
      r.bold(true).leftRight(label, time).bold(false);
      r.divider("-");
      for (const it of o.items.filter((x) => (x.batch ?? 0) === b)) printItem(it);
    }
    r.divider("=");
  } else {
    r.divider("=");
    for (const it of o.items) printItem(it);
    r.divider("=");
  }

  // Totals
  if (typeof o.subtotal === "number") r.leftRight("Subtotal", gbp(o.subtotal));
  if (typeof o.deliveryFee === "number" && o.deliveryFee > 0) {
    r.leftRight("Delivery", gbp(o.deliveryFee));
  }
  if (typeof o.total === "number") {
    r.size(0, 1).bold(true).leftRight("TOTAL", gbp(o.total)).bold(false).size(0, 0);
  }

  // Notes
  if (o.notes) {
    r.feed(1).bold(true).line("NOTES:").bold(false);
    for (const l of wrap(o.notes, LINE_WIDTH)) r.line(l);
  }

  // When this order had items added, remind the kitchen the newest round is last.
  if (o.hasAdditions) {
    r.feed(1).align(1).line("-- newest round at the bottom --").align(0);
  }

  r.feed(1).align(1).line("Thank you!").feed(3).cut();
  return r;
}

export function buildTestReceipt(label: string): Receipt {
  return new Receipt()
    .init()
    .align(1)
    .size(1, 1)
    .bold(true)
    .line("CHOCOBERRY")
    .bold(false)
    .size(0, 0)
    .line("Cloud printing test")
    .line(label)
    .line(new Date().toISOString())
    .feed(3)
    .cut();
}
