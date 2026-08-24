// ===========================================================================
// ⭐ THIS IS THE RECEIPT THE PRINTER ACTUALLY USES (when RECEIPT_MODE="raster",
//    which is the default). Edit the printed slip layout HERE, in receiptTree().
//
//    There is a SECOND receipt builder in escpos.ts (buildOrderReceipt). That
//    one is only a TEXT FALLBACK used if raster rendering throws. Editing
//    escpos.ts will NOT change what normally prints. If a receipt change
//    "isn't showing up" after deploy, you are almost certainly editing the
//    wrong file — change it HERE.  (See receiptHexFor() in sunmi-print/index.ts
//    for the selector.)  Keep BOTH files in sync so the fallback matches.
// ===========================================================================
// ---------------------------------------------------------------------------
// Raster receipt renderer (Uber Eats-style, real typography)
// satori (layout+font) -> resvg-wasm (rasterise) -> 1-bit -> ESC/POS GS v 0
// Produces hex for Sunmi pushContent. ~50KB raster / ~100KB hex per ticket.
// Fonts + wasm are fetched once at cold start and cached in module scope.
// ---------------------------------------------------------------------------

import satori from "npm:satori@0.12.2";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import type { ReceiptOrder } from "./escpos.ts";

const W = 576; // NT311 printable width in dots (80mm)

// ---- cold-start assets ----------------------------------------------------
let ready: Promise<{ inter400: ArrayBuffer; inter700: ArrayBuffer }> | null = null;

function loadAssets() {
  if (!ready) {
    ready = (async () => {
      const [wasm, inter400, inter700] = await Promise.all([
        fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm").then((r) => r.arrayBuffer()),
        fetch("https://cdn.jsdelivr.net/npm/@fontsource/inter@5.1.0/files/inter-latin-400-normal.woff").then((r) => r.arrayBuffer()),
        fetch("https://cdn.jsdelivr.net/npm/@fontsource/inter@5.1.0/files/inter-latin-700-normal.woff").then((r) => r.arrayBuffer()),
      ]);
      await initWasm(wasm);
      return { inter400, inter700 };
    })();
  }
  return ready;
}

// ---- tiny element helpers (satori takes React-shaped objects) -------------
type Node = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, ...children: unknown[]): Node => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.length === 1 ? children[0] : children },
});
const row = (l: string, r: string, sL: Record<string, unknown> = {}, sR: Record<string, unknown> = {}) =>
  el("div", { justifyContent: "space-between", width: "100%" },
    el("div", { ...sL }, l),
    el("div", { ...sR }, r));
const rule = () => el("div", { borderBottom: "2px solid #000", width: "100%", margin: "10px 0" });

const gbp = (n: number) => "\u00A3" + n.toFixed(2);

function receiptTree(o: ReceiptOrder): Node {
  const [typeMain, ...typeRest] = (o.orderType ?? "ORDER").split(" - ");
  return el("div",
    { flexDirection: "column", width: "100%", fontFamily: "Inter", fontSize: 24, color: "#000", background: "#fff", padding: "8px 10px" },
    el("div", { justifyContent: "space-between", alignItems: "center", background: "#000", color: "#fff", padding: "10px 14px", fontSize: 38, fontWeight: 700 },
      el("div", {}, (o.tabletNo ? "T" + o.tabletNo + "-" : "") + o.orderNumber.slice(0, 6)),
      el("div", {}, (o.customerName ?? "").slice(0, 14))),
    el("div", { marginTop: 10 }, `Placed at ${o.placedAt}`),
    ...(o.reprint
      ? [el("div", { justifyContent: "center", alignItems: "center", background: "#000", color: "#fff", padding: "8px 14px", fontSize: 40, fontWeight: 700, letterSpacing: 3, marginTop: 10 }, "* * *  REPRINT  * * *")]
      : []),
    rule(),
    el("div", { flexDirection: "column", alignItems: "center", width: "100%" },
      el("div", { fontSize: 52, fontWeight: 700, letterSpacing: 2 }, typeMain.toUpperCase()),
      ...typeRest.map((t) => el("div", { fontSize: 32, fontWeight: 700 }, t))),
    rule(),
    ...(o.notes
      ? [el("div", {},
          el("div", { fontWeight: 700, marginRight: 8 }, "NOTE:"),
          el("div", {}, o.notes)),
        rule()]
      : []),
    // Items. When items were added across multiple rounds, group by round
    // (batch) so each addition is clearly separated with its own label + time.
    // Within a round (or the whole order), items are grouped under their master
    // category heading. Otherwise render a single flat list.
    ...(() => {
      const bt = o.batchTimes || [];
      // Render one item (name row + modifiers + note).
      const renderItem = (it: typeof o.items[number], big: boolean) => [
        row(`${it.qty} x ${it.name}`,
          typeof it.price === "number" ? gbp(it.price) : "",
          { fontWeight: 700, fontSize: big ? 30 : 27, maxWidth: "430px" },
          { fontWeight: 700, fontSize: big ? 30 : 27 }),
        ...(it.modifiers ?? []).map((m) => el("div", { paddingLeft: 26, fontSize: 23 }, m)),
        ...(it.note ? [el("div", { paddingLeft: 26, fontSize: 25, fontWeight: 700 }, "** " + it.note + " **")] : []),
        el("div", { height: 6 }),
      ];
      // Group a list of items by master category, preserving first-seen order,
      // and render each group under an underlined category heading (Style B).
      const renderGrouped = (list: typeof o.items, big: boolean) => {
        const order: string[] = [];
        const groups = new Map<string, typeof o.items>();
        for (const it of list) {
          const cat = (it.category || "OTHER").toUpperCase();
          if (!groups.has(cat)) { groups.set(cat, []); order.push(cat); }
          groups.get(cat)!.push(it);
        }
        return order.flatMap((cat) => [
          el("div", { fontSize: 24, fontWeight: 700, letterSpacing: 1, borderBottom: "1.5px solid #000", paddingBottom: 3, marginTop: 8, marginBottom: 5 }, cat),
          ...groups.get(cat)!.flatMap((it) => renderItem(it, big)),
        ]);
      };

      if (o.hasAdditions) {
        const batches = [...new Set(o.items.map((it) => it.batch ?? 0))].sort((a, b) => a - b);
        return batches.flatMap((b) => {
          const label = b === 0 ? "ROUND 1" : "ROUND " + (b + 1) + " - ADDED";
          const its = o.items.filter((it) => (it.batch ?? 0) === b);
          return [
            el("div", { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", width: "100%", borderTop: "2px solid #000", paddingTop: 6, marginTop: 10, marginBottom: 6 },
              el("div", { fontSize: 27, fontWeight: 700, letterSpacing: 1 }, label),
              el("div", { fontSize: 22, fontWeight: 700 }, bt[b] || "")),
            ...renderGrouped(its, b > 0),
          ];
        });
      }
      return renderGrouped(o.items, false);
    })()),
    rule(),
    ...(typeof o.subtotal === "number" && o.subtotal !== o.total
      ? [row("Subtotal", gbp(o.subtotal))]
      : []),
    ...(typeof o.deliveryFee === "number" && o.deliveryFee > 0
      ? [row("Delivery", gbp(o.deliveryFee))]
      : []),
    ...(typeof o.total === "number"
      ? [row("Amount due", gbp(o.total), { fontWeight: 700, fontSize: 30 }, { fontWeight: 700, fontSize: 30 })]
      : []),
    rule(),
    ...(o.hasAdditions
      ? [el("div", { justifyContent: "center", width: "100%", fontSize: 22, fontWeight: 700, marginBottom: 6 },
          "-- newest round at the bottom --")]
      : []),
    el("div", { justifyContent: "center", width: "100%", fontSize: 22 },
      `Chocoberry${o.storeName ? " - " + o.storeName : ""} - thank you!`),
  );
}

// ---- render to 1-bit ESC/POS raster hex -----------------------------------
export async function buildOrderRasterHex(o: ReceiptOrder): Promise<string> {
  const { inter400, inter700 } = await loadAssets();

  const svg = await satori(receiptTree(o) as never, {
    width: W,
    height: 2000, // generous canvas; trimmed to content below
    fonts: [
      { name: "Inter", data: inter400, weight: 400, style: "normal" },
      { name: "Inter", data: inter700, weight: 700, style: "normal" },
    ],
  });

  const rendered = new Resvg(svg, { fitTo: { mode: "width", value: W }, background: "white" }).render();
  const { width, height } = rendered;
  const px = rendered.pixels; // RGBA

  // Trim trailing whitespace (find last row containing a dark pixel)
  let last = 0;
  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (px[rowStart + x * 4] < 160) { last = y; break; }
    }
  }
  const H = Math.min(height, last + 16);

  // Pack to 1 bit/pixel, MSB = leftmost, 1 = black (threshold 160)
  const bytesPerRow = width >> 3;
  const mono = new Uint8Array(bytesPerRow * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4] < 160) {
        mono[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  // ESC/POS: init, raster blocks (GS v 0), feed, cut
  const out: number[] = [0x1b, 0x40];
  const CHUNK = 512; // rows per raster block
  for (let y0 = 0; y0 < H; y0 += CHUNK) {
    const rows = Math.min(CHUNK, H - y0);
    out.push(0x1d, 0x76, 0x30, 0x00,
      bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
      rows & 0xff, (rows >> 8) & 0xff);
    for (let i = 0; i < rows * bytesPerRow; i++) out.push(mono[y0 * bytesPerRow + i]);
  }
  out.push(0x1b, 0x64, 0x02);       // feed 2
  out.push(0x1d, 0x56, 0x42, 0x00); // partial cut

  let hex = "";
  const lut: string[] = [];
  for (let i = 0; i < 256; i++) lut.push(i.toString(16).padStart(2, "0"));
  for (let i = 0; i < out.length; i++) hex += lut[out[i]];
  return hex;
}
