// Print-ready QR stickers for a store's dining tables.
// Opens a new window with an A4 grid; each card = store name, table label,
// the table's QR (menu-app URL ?store=<qr_token>) and a "scan to order" line.
// QRs are generated locally with the `qrcode` package — nothing external.
import QRCode from "qrcode";

export async function openTableStickerSheet({ storeName, tables, origin, brandName }) {
  const rows = tables.filter((t) => t.qr_token);
  const cards = await Promise.all(rows.map(async (t) => {
    const url = origin + "/?store=" + t.qr_token;
    const png = await QRCode.toDataURL(url, { width: 520, margin: 1, errorCorrectionLevel: "M", color: { dark: "#2E2119", light: "#FFFFFF" } });
    return { label: t.label, png, url };
  }));
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(storeName)} — table QR stickers</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Poppins, system-ui, sans-serif; color: #2E2119; background: #fff; }
  .bar { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #e6dfd2; font-size: 13px; }
  .bar b { font-size: 15px; }
  .bar button { font: inherit; font-weight: 700; background: #8F4123; color: #F9EDDC; border: 0; border-radius: 999px; padding: 9px 18px; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(3, 60mm); gap: 6mm; padding: 8mm; justify-content: center; }
  .card { width: 60mm; height: 78mm; border: 0.4mm dashed #c9bfae; border-radius: 4mm; padding: 4mm; display: flex; flex-direction: column; align-items: center; text-align: center; page-break-inside: avoid; break-inside: avoid; background: #F9EDDC; }
  .brand { font-size: 10pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #8F4123; }
  .store { font-size: 8pt; color: #6b5a4d; margin-top: 1mm; }
  .qr { width: 42mm; height: 42mm; margin: 3mm 0 2mm; background: #fff; border-radius: 2mm; padding: 1.5mm; }
  .qr img { width: 100%; height: 100%; display: block; }
  .label { font-size: 15pt; font-weight: 700; line-height: 1; }
  .hint { font-size: 7.5pt; color: #6b5a4d; margin-top: 1.5mm; }
  @media print { .bar { display: none; } .grid { padding: 0; } }
</style></head><body>
<div class="bar"><div><b>${esc(storeName)}</b> · ${cards.length} table sticker${cards.length === 1 ? "" : "s"} · 60 × 78 mm, 9 per A4 sheet</div><button onclick="window.print()">Print</button></div>
<div class="grid">
${cards.map((c) => `<div class="card"><div class="brand">${esc(brandName || "Chocoberry")}</div><div class="store">${esc(storeName)}</div><div class="qr"><img src="${c.png}" alt="QR for ${esc(c.label)}"></div><div class="label">${esc(c.label)}</div><div class="hint">Scan to see the menu &amp; order to your table</div></div>`).join("\n")}
</div></body></html>`;
  const w = window.open("", "_blank");
  if (!w) { alert("Pop-up blocked — allow pop-ups for this site and try again."); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

// VIEWONLY 2026-10-24 — one large "Scan to view our menu" card for a store's
// view-only customer link (/menu/<token>), to print, or to save the QR image
// for WhatsApp, Instagram or a website.
export async function openMenuQrSheet({ storeName, url, brandName }) {
  const png = await QRCode.toDataURL(url, { width: 900, margin: 2, errorCorrectionLevel: "M", color: { dark: "#2E2119", light: "#FFFFFF" } });
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const file = (String(storeName || "store").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "store") + "-menu-QR.png";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(storeName)} — menu QR</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A5; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Poppins, system-ui, sans-serif; color: #2E2119; background: #fff; }
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 18px; border-bottom: 1px solid #e6dfd2; font-size: 13px; flex-wrap: wrap; }
  .bar b { font-size: 15px; }
  .bar .btns { display: flex; gap: 8px; }
  .bar a, .bar button { font: inherit; font-weight: 700; background: #8F4123; color: #F9EDDC; border: 0; border-radius: 999px; padding: 9px 18px; cursor: pointer; text-decoration: none; }
  .bar a { background: #F3EADA; color: #8F4123; }
  .card { width: 120mm; margin: 10mm auto; border-radius: 6mm; padding: 9mm 8mm; background: #F9EDDC; text-align: center; }
  .brand { font-size: 20pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #8F4123; }
  .store { font-size: 12pt; color: #6b5a4d; margin-top: 1mm; }
  .qr { width: 86mm; height: 86mm; margin: 6mm auto 5mm; background: #fff; border-radius: 3mm; padding: 2.5mm; }
  .qr img { width: 100%; height: 100%; display: block; }
  .cta { font-size: 17pt; font-weight: 700; }
  .url { font-size: 8.5pt; color: #6b5a4d; margin-top: 2mm; word-break: break-all; }
  @media print { .bar { display: none; } .card { margin: 0 auto; } }
</style></head><body>
<div class="bar"><div><b>${esc(storeName)}</b> · view-only menu link</div><div class="btns"><a href="${png}" download="${esc(file)}">Save QR image</a><button onclick="window.print()">Print</button></div></div>
<div class="card"><div class="brand">${esc(brandName || "Chocoberry")}</div><div class="store">${esc(storeName)}</div><div class="qr"><img src="${png}" alt="Menu QR"></div><div class="cta">Scan to view our menu</div><div class="url">${esc(url.replace(/^https?:\/\//, ""))}</div></div>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) { alert("Pop-up blocked — allow pop-ups for this site and try again."); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
