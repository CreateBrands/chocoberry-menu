// petpooja-sync — pulls Dubai sales from the Petpooja billing portal into flipdish_sales.
// PETPOOJA 2026-09-11m — subtotal = net_sales (after discount); cleaner payment labels
//
// How it works (discovered from the portal's own network traffic, like the RMS sync):
//   1. POST https://billing.petpooja.com/  header_changed_rest_id=<id>   -> selects the outlet for the session
//   2. POST /custom_reports/get_data_query/1/28  -> "Orders Summary With Time"        (one row per bill)
//   3. POST /custom_reports/get_data_query/1/39  -> "Item Wise Report With Bill No. With Time" (one row per line)
//   Both take a `filter` JSON on B.created (datetime range). Responses are {fields:[...], final_result:[[...]]}.
//   Bills + lines are joined on Invoice No. and upserted on (sale_id, brand_id), sale_id = pp-<outlet>-<invoice>.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   PETPOOJA_COOKIE   full cookie string from the portal: "PETPOOJA_CO=...; user_id=...; user_key=..."
//   SYNC_SECRET       same shared secret the other syncs use (x-sync-secret header)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Call:  POST { "fromDate":"YYYY-MM-DD", "toDate":"YYYY-MM-DD", "dry": false }
//        defaults: yesterday..today (Dubai time). dry=true parses and returns a sample without writing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE = "https://billing.petpooja.com";
const BRAND_ID = "chocoberry-uae";
const CURRENCY = "AED";
const TZ_OFFSET = "+04:00"; // Asia/Dubai, no DST
// Trading day rolls over at this hour (Dubai time): bills before it belong to the previous day,
// which is how Petpooja's own daily summaries count them.
const DAY_CLOSE_HOUR = 4;
function businessDateOf(isoDubai: string): string {
  const [d, t] = isoDubai.split("T"); const h = parseInt(t.slice(0, 2), 10);
  return h < DAY_CLOSE_HOUR ? addDays(d, -1) : d;
}

// Petpooja restaurant id -> dashboard store
const OUTLETS: Record<string, { storeId: string; name: string }> = {
  "328987": { storeId: "store-dubai-downtown", name: "CHOCOBERRY - Downtown Dubai" },
  "348596": { storeId: "store-zahia-mall",     name: "Chocoberry - Al Zahia Mall" },
};

const DS_BILLS = 28;
const DS_LINES = 39;

type Row = Record<string, any>;

function dubaiToday(): string {
  const d = new Date(Date.now() + 4 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const num = (v: any): number => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };

// "2026-09-10 14:32:11" | "10-09-2026 14:32" | "2026-09-10" -> ISO with Dubai offset
function toIso(dateStr: string, timeStr?: string): string | null {
  let s = String(dateStr || "").trim();
  if (timeStr && !/\d{1,2}:\d{2}/.test(s)) s += " " + String(timeStr).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  let y, mo, d, h = "00", mi = "00", se = "00";
  if (m) { [, y, mo, d] = m; h = m[4] ?? h; mi = m[5] ?? mi; se = m[6] ?? se; }
  else {
    m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    [, d, mo, y] = m; h = m[4] ?? h; mi = m[5] ?? mi; se = m[6] ?? se;
  }
  const p = (x: string) => x.padStart(2, "0");
  return `${y}-${p(mo!)}-${p(d!)}T${p(h)}:${mi}:${se}${TZ_OFFSET}`;
}

class NeedsLogin extends Error {}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Cookie jar: starts from the secret, absorbs any Set-Cookie the portal sends (the outlet switch may rotate the session)
const jar = new Map<string, string>();
function loadJar(cookie: string) {
  cookie.split(";").map(s => s.trim()).filter(Boolean).forEach(kv => { const i = kv.indexOf("="); if (i > 0) jar.set(kv.slice(0, i), kv.slice(i + 1)); });
}
function jarHeader() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "); }
function absorb(res: Response) {
  const raw: string[] = (res.headers as any).getSetCookie ? (res.headers as any).getSetCookie() : [];
  for (const line of raw) { const kv = line.split(";")[0]; const i = kv.indexOf("="); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1)); }
}

async function ppFetch(_cookie: string, path: string, form: Record<string, string>, referer = BASE + "/custom_reports/view_report/60") {
  const body = new URLSearchParams(form).toString();
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "cookie": jarHeader(),
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "accept": "*/*",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      "x-requested-with": "XMLHttpRequest",
      "x-app-client": "billing-web",
      "origin": BASE,
      "referer": referer,
      "user-agent": UA,
      "sec-fetch-dest": "empty", "sec-fetch-mode": "cors", "sec-fetch-site": "same-origin",
    },
    body,
    redirect: "manual",
  });
  absorb(res);
  const text = await res.text();
  if (res.status === 302 || res.status === 301) {
    const loc = res.headers.get("location") || "";
    if (/login|users\/?$/i.test(loc)) throw new NeedsLogin("redirected to login: " + loc);
  }
  return { status: res.status, text, contentType: res.headers.get("content-type") || "" };
}

async function selectOutlet(cookie: string, restId: string) {
  // The portal's hidden form: <form id="change_res" method=post action="https://billing.petpooja.com/">
  const res = await fetch(BASE + "/", {
    method: "POST", redirect: "manual",
    headers: { "cookie": jarHeader(), "content-type": "application/x-www-form-urlencoded", "origin": BASE,
               "referer": BASE + "/custom_reports/reports/", "user-agent": UA, "accept": "text/html,application/xhtml+xml,*/*;q=0.8" },
    body: new URLSearchParams({ header_changed_rest_id: restId }).toString(),
  });
  absorb(res); await res.text();
  if (res.status >= 400) throw new Error(`outlet switch ${restId} -> HTTP ${res.status}`);
  const loc = res.headers.get("location") || "";
  if (/login/i.test(loc)) throw new NeedsLogin("outlet switch redirected to login");
}

async function runDatasource(cookie: string, ds: number, from: string, to: string): Promise<Row[]> {
  const filter = [
    { table: "B", field: "created", operator: "gteq", value: `${from} 00:00:00` },
    { table: "B", field: "created", operator: "lteq", value: `${to} 23:59:59` },
  ];
  const r = await ppFetch(cookie, `/custom_reports/get_data_query/1/${ds}`, {
    json_query: "", datasource: String(ds), replace: "[]", filter: JSON.stringify(filter),
  });
  let j: any;
  try { j = JSON.parse(r.text); }
  catch {
    if (/<form[^>]*login|name="password"/i.test(r.text)) throw new NeedsLogin("html login page returned");
    throw new Error(`datasource ${ds}: non-JSON response (HTTP ${r.status}): ${r.text.slice(0, 200)}`);
  }
  if (j.error && j.error !== 0 && j.error !== "0") throw new Error(`datasource ${ds}: ${JSON.stringify(j).slice(0, 300)}`);
  const fields = normalizeFields(j.fields, ds, (j.final_result || [])[0]?.length || 0);
  lastFieldShapes[ds] = { raw: j.fields, used: fields };
  return (j.final_result || []).map((arr: any[]) => {
    const o: Row = {}; fields.forEach((f, i) => { o[f] = arr[i]; }); return o;
  });
}

// Column order per datasource from the portal's own catalogue (json_display_fields), used when the
// response's `fields` isn't a plain string array.
const CATALOGUE_FIELDS: Record<number, string[]> = {
  28: ["Invoice No.","Date","Biller","Kot No.","Payment Type","Payment Description","Order Type","Status","Area","sub_order_type","group_name","brand_name","gstin","Assign To","Customer Phone","Customer Name","Customer Address","Customer Locality","Persons","Order Cancel Reason","My Amount (Rs.)","Discount (Rs.)","net_sales","Delivery Charge","Container Charge","Service Charge","Additional Charge","Total Tax (Rs.)","Round Off","Waived off","Total (Rs.)","Online Tax Calculated","GST Paid by Merchant","GST Paid by Ecommerce","Tip (Rs.)"],
  39: ["Date","Timestamp","Invoice No.","Item","Price","Qty.","Sub Total","Discount","Tax","Final Total","Table No.","Server Name","Covers","Variation","Category","hsn_code"],
};
const lastFieldShapes: Record<number, any> = {};
function normalizeFields(f: any, ds: number, width: number): string[] {
  let out: string[] = [];
  if (Array.isArray(f)) out = f.map((x: any) => typeof x === "string" ? x : String(x?.display ?? x?.name ?? x?.field ?? x?.alias ?? ""));
  else if (f && typeof f === "object") {
    const sel = f.select && typeof f.select === "object" ? f.select : f;
    const keys = Object.keys(sel);
    // Petpooja sends {"0":"Invoice No.","1":"Date",...}: numeric keys, names as VALUES
    out = keys.every(k => /^\d+$/.test(k))
      ? keys.sort((a, b) => Number(a) - Number(b)).map(k => String(sel[k] ?? ""))
      : keys;
  }
  if (out.length && out.every(x => x)) return out;
  const cat = CATALOGUE_FIELDS[ds] || [];
  return cat.length ? cat : Array.from({ length: width }, (_, i) => `col${i}`);
}

// tolerant column access: first key that matches any of the candidates (case/space-insensitive)
function pick(row: Row, ...cands: string[]): any {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const keys = Object.keys(row);
  for (const c of cands) { const k = keys.find(k => norm(k) === norm(c)); if (k !== undefined) return row[k]; }
  return undefined;
}

// Channel = the sales source, named the way the UK rows name theirs (POS, UberEats, Deliveroo...),
// so the dashboard's revenue breakdown splits Dubai by platform with no reporting changes.
const PLATFORMS: [RegExp, string][] = [
  [/talabat/i, "Talabat"], [/deliveroo/i, "Deliveroo"], [/keeta/i, "Keeta"], [/noon/i, "Noon"],
  [/careem/i, "Careem"], [/zomato/i, "Zomato"], [/smiles/i, "Smiles"], [/instashop/i, "InstaShop"],
  [/uber/i, "UberEats"],
];
function platformOf(b: Row): string | null {
  // Petpooja puts the aggregator in Payment Type ("Other [Deliveroo]", "Other [Talabat Cash]",
  // "Other [keeta]") for orders keyed in by hand, and in Area / sub_order_type for integrated ones.
  const t = [pick(b, "Payment Type"), pick(b, "Payment Description"), pick(b, "Area"), pick(b, "sub_order_type"), pick(b, "Order Type")]
    .map(x => String(x ?? "")).join(" | ");
  for (const [re, name] of PLATFORMS) if (re.test(t)) return name;
  return null;
}
// "Other [Deliveroo]" -> "Deliveroo", "Other [Talabat Cash]" -> "Talabat Cash", "Online" on a Talabat order -> "Talabat Online"
function cleanPayment(raw: string, platform: string | null): string {
  let p = raw.replace(/^other\s*\[(.*)\]$/i, "$1").trim();
  if (/^online$/i.test(p) && platform) p = `${platform} Online`;
  if (/^card$/i.test(p)) p = "Card";
  if (/^cash$/i.test(p)) p = "Cash";
  return p.replace(/\bkeeta\b/i, "Keeta").replace(/\bdeliveroo\b/i, "Deliveroo").replace(/\btalabat\b/i, "Talabat");
}
function channelOf(b: Row): string {
  const p = platformOf(b);
  if (p) return p;
  const t = [pick(b, "Order Type"), pick(b, "Area"), pick(b, "sub_order_type"), pick(b, "Payment Type")]
    .map(x => String(x ?? "").toLowerCase()).join(" | ");
  if (/online order|web|\bapp\b/.test(t)) return "Online";
  return "POS";
}

function buildSales(restId: string, bills: Row[], lines: Row[]) {
  const outlet = OUTLETS[restId];
  const linesByInv = new Map<string, Row[]>();
  for (const l of lines) {
    const inv = String(pick(l, "Invoice No.", "Invoice No", "invoice_no") ?? "").trim();
    if (!inv) continue;
    if (!linesByInv.has(inv)) linesByInv.set(inv, []);
    linesByInv.get(inv)!.push(l);
  }
  // one row per invoice: a bill with split payments comes back as several rows
  const seen = new Set<string>();
  const out: any[] = [];
  for (const b of bills) {
    const inv = String(pick(b, "Invoice No.", "Invoice No", "invoice_no") ?? "").trim();
    if (!inv || seen.has(inv)) continue;
    seen.add(inv);
    const when = toIso(String(pick(b, "Date", "created") ?? ""));
    if (!when) continue;
    const status = String(pick(b, "Status") ?? "");
    const cancelled = /cancel|void/i.test(status);
    const items = (linesByInv.get(inv) || []).map((l, i) => {
      const qty = num(pick(l, "Qty.", "Qty", "Quantity"));
      const price = num(pick(l, "Price"));
      const final = num(pick(l, "Final Total", "Total"));
      const tax = num(pick(l, "Tax"));
      const sub = num(pick(l, "Sub Total", "Subtotal"));
      return {
        id: `${inv}-${i + 1}`,
        caption: String(pick(l, "Item", "Item Name") ?? ""),
        category: String(pick(l, "Category") ?? ""),
        variation: pick(l, "Variation") || null,
        quantity: qty,
        unitPrice: price,
        retailPrice: sub,
        netRetailPrice: final,
        taxAmount: tax,
        taxPercentage: sub ? Math.round((tax / sub) * 10000) / 100 : null,
        discount: num(pick(l, "Discount")),
        saleItems: [],
      };
    });
    out.push({
      sale_id: `pp-${restId}-${inv}`,
      brand_id: BRAND_ID,
      store_id: outlet.storeId,
      storefront_id: `pp-${restId}`,
      property_name: outlet.name,
      channel: channelOf(b),
      sale_time: when,
      business_date: businessDateOf(when),
      // ex-VAT AFTER discount (Petpooja net_sales); "My Amount" is before discount and stays in raw_rms
      amount_subtotal: (pick(b, "net_sales") != null && String(pick(b, "net_sales")) !== "")
        ? num(pick(b, "net_sales"))
        : num(pick(b, "My Amount (Rs.)", "My Amount")) - num(pick(b, "Discount (Rs.)", "Discount")),
      amount_discount: num(pick(b, "Discount (Rs.)", "Discount")),
      amount_tax: num(pick(b, "Total Tax (Rs.)", "Total Tax")),
      amount_total: num(pick(b, "Total (Rs.)", "Total")),
      payment_method: cleanPayment(String(pick(b, "Payment Type") ?? ""), platformOf(b)),
      status: cancelled ? "CANCELLED" : (/refund/i.test(status) ? "REFUNDED" : "PAID"),
      is_cancelled: cancelled,
      is_fully_refunded: false,
      sale_items: items,
      receipt_lines: [{ method: String(pick(b, "Payment Type") ?? ""), description: pick(b, "Payment Description") ?? null,
                        amount: num(pick(b, "Total (Rs.)", "Total")) }],
      discounts_detail: null,
      raw_rms: { source: "petpooja", platform: platformOf(b), order_type: pick(b, "Order Type") ?? null,
                 payment_rows: bills.filter(x => String(pick(x, "Invoice No.", "Invoice No") ?? "").trim() === inv).map(x => ({ type: pick(x, "Payment Type"), desc: pick(x, "Payment Description"), total: pick(x, "Total (Rs.)") })),
                 bill: b, lines: linesByInv.get(inv) || [] },
      source: "petpooja",
      currency: CURRENCY,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("SYNC_SECRET");
  if (secret && req.headers.get("x-sync-secret") !== secret) return new Response("unauthorized", { status: 401 });

  const cookie = Deno.env.get("PETPOOJA_COOKIE") || "";
  if (!cookie) return Response.json({ error: "PETPOOJA_COOKIE secret not set" }, { status: 500 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: any = {}; try { body = await req.json(); } catch { /* no body */ }
  const today = dubaiToday();
  const from = body.fromDate || addDays(today, -2);
  const to = body.toDate || today;
  const dry = !!body.dry;

  loadJar(cookie);
  if (body.probe) {
    const out: any = {};
    // single-outlet datasources are only reachable with an outlet selected
    await selectOutlet(cookie, "328987"); out.outlet = "328987 Downtown";
    for (const ds of [52, 28, 39]) {
      const filter = ds === 52
        ? [{ table: "B", field: "created_date", operator: "gteq", value: from }, { table: "B", field: "created_date", operator: "lteq", value: to }]
        : [{ table: "B", field: "created", operator: "gteq", value: `${from} 00:00:00` }, { table: "B", field: "created", operator: "lteq", value: `${to} 23:59:59` }];
      const r = await ppFetch(cookie, `/custom_reports/get_data_query/1/${ds}`, { json_query: "", datasource: String(ds), replace: "[]", filter: JSON.stringify(filter) });
      out[ds] = { status: r.status, contentType: r.contentType, head: r.text.slice(0, 400) };
    }
    out.cookiesNow = [...jar.keys()];
    return Response.json(out);
  }
  const started = new Date().toISOString();
  const summary: any = { from, to, dry, outlets: {} };
  let status = "ok", errorText: string | null = null, upserted = 0;

  try {
    for (const restId of Object.keys(OUTLETS)) {
      await selectOutlet(cookie, restId);
      const bills = await runDatasource(cookie, DS_BILLS, from, to);
      const lines = await runDatasource(cookie, DS_LINES, from, to);
      const sales = buildSales(restId, bills, lines);
      summary.outlets[restId] = { store: OUTLETS[restId].storeId, bills: bills.length, lines: lines.length, sales: sales.length,
        sample: dry ? sales.slice(0, 2) : undefined, billFields: dry ? Object.keys(bills[0] || {}) : undefined,
        lineFields: dry ? Object.keys(lines[0] || {}) : undefined,
        fieldShapes: dry ? { bills: lastFieldShapes[DS_BILLS]?.raw, lines: lastFieldShapes[DS_LINES]?.raw } : undefined };
      if (dry) continue;
      for (let i = 0; i < sales.length; i += 200) {
        const chunk = sales.slice(i, i + 200);
        const { error } = await sb.from("flipdish_sales").upsert(chunk, { onConflict: "sale_id,brand_id" });
        if (error) throw new Error(`upsert ${OUTLETS[restId].storeId}: ${error.message}`);
        upserted += chunk.length;
      }
    }
  } catch (e) {
    status = e instanceof NeedsLogin ? "needs_login" : "error";
    errorText = String(e?.message || e);
  }

  summary.upserted = upserted; summary.status = status; summary.error = errorText;
  if (!dry) {
    await sb.from("petpooja_sync_log").insert({ started_at: started, from_date: from, to_date: to, status, upserted, detail: summary });
    const { data: prevLog } = await sb.from("petpooja_sync_log").select("status").order("id", { ascending: false }).range(1, 1);
    const alreadyFlagged = (prevLog || [])[0]?.status === "needs_login";
    if (status === "needs_login" && !alreadyFlagged) {
      // surface it in the dashboard rather than fail silently
      // notifications are per recipient: tell every owner login
      const { data: owners } = await sb.from("users").select("id").eq("role", "owner");
      const rows = (owners || []).map((u: any) => ({
        recipient_type: "user", recipient_id: u.id, kind: "system",
        title: "Petpooja session expired",
        body: "Dubai sales sync stopped: sign in to billing.petpooja.com, copy the PETPOOJA_CO / user_id / user_key cookies and update the PETPOOJA_COOKIE secret.",
      }));
      if (rows.length) await sb.from("notifications").insert(rows).then(() => {}, () => {});
    }
  }
  return Response.json(summary, { status: status === "ok" ? 200 : 500 });
});
