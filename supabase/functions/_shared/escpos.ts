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
}

export interface ReceiptOrder {
  orderNumber: string;
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
  r.feed(1);

  // Order number — big, this is what the kitchen looks for
  r.size(1, 2).bold(true).line(`#${o.orderNumber}`).bold(false).size(0, 0);
  if (o.orderType) r.size(0, 1).line(o.orderType.toUpperCase()).size(0, 0);
  r.line(o.placedAt);
  r.feed(1);

  // Customer block
  r.align(0);
  if (o.customerName || o.phone) {
    r.divider();
    if (o.customerName) r.line(`Customer: ${o.customerName}`);
    if (o.phone) r.line(`Phone:    ${o.phone}`);
  }

  // Items
  r.divider("=");
  for (const it of o.items) {
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
  }
  r.divider("=");

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
