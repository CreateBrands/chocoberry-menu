// RECEIPT DESIGNER 2026-10-26 — one store's customer-receipt settings.
//
// Saved as JSON in menu_app_settings under "receipt:<location id>" (admin-api
// receipt_save). A store with no setting prints the receipt it always has;
// one with a setting prints the designed receipt below.
//
// Mirrored for the Admin screen in src/receiptConfig.js — keep the two in step.
//
// The law decides some lines, so they cannot be switched off:
//   UK  VAT receipt: name, address, VAT number, date, items, total + VAT rate.
//   UAE simplified tax invoice: "Tax Invoice", name, address, TRN, invoice
//       number, date, items, VAT rate and amount, total.

export type ReceiptCountry = "UK" | "UAE";

export interface ReceiptCfg {
  country: ReceiptCountry;
  // store details
  show_logo: boolean;
  logo_url: string;
  logo_size: "S" | "M" | "L";
  brand_name: string;      // empty = the store's brand name
  show_arabic: boolean;    // UAE: Arabic name + Arabic thank-you
  arabic_name: string;
  arabic_footer: string;
  address: string;         // one or two lines, "\n" between
  phone: string;
  header: string;          // free text under the address
  tax_id: string;          // UK VAT number / UAE TRN
  vat_rate: number;        // percent: 20 UK, 5 UAE
  invoice_prefix: string;  // UAE invoice numbers: prefix + running number
  // order details
  show_table: boolean;
  big_order_no: boolean;
  show_mods: boolean;
  show_payment: boolean;
  // bottom
  footer: string;
  show_qr: boolean;
  qr_url: string;
  qr_caption: string;
  show_wifi: boolean;
  wifi: string;
  show_social: boolean;
  social: string;
}

export function receiptDefaults(country: ReceiptCountry = "UK"): ReceiptCfg {
  const uae = country === "UAE";
  return {
    country,
    show_logo: false, logo_url: "", logo_size: "M",
    brand_name: "",
    show_arabic: uae, arabic_name: uae ? "شوكوبيري" : "", arabic_footer: uae ? "شكراً لزيارتكم" : "",
    address: "", phone: "", header: "",
    tax_id: "", vat_rate: uae ? 5 : 20, invoice_prefix: "",
    show_table: true, big_order_no: true, show_mods: true, show_payment: true,
    footer: "Thank you for visiting!",
    show_qr: false, qr_url: "", qr_caption: "Scan to rate your visit",
    show_wifi: false, wifi: "",
    show_social: false, social: "",
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

// Anything stored (or sent from Admin) comes back as a complete, safe config.
export function normalizeReceiptCfg(raw: unknown): ReceiptCfg {
  let o: Record<string, unknown> = {};
  if (typeof raw === "string") { try { o = JSON.parse(raw) || {}; } catch { o = {}; } }
  else if (raw && typeof raw === "object") o = raw as Record<string, unknown>;
  const country: ReceiptCountry = o.country === "UAE" ? "UAE" : "UK";
  const d = receiptDefaults(country);
  const rate = Number(o.vat_rate);
  return {
    country,
    show_logo: bool(o.show_logo, d.show_logo),
    logo_url: /^https:\/\//i.test(str(o.logo_url, 500)) ? str(o.logo_url, 500) : "",
    logo_size: o.logo_size === "S" || o.logo_size === "L" ? o.logo_size : "M",
    brand_name: str(o.brand_name, 40),
    show_arabic: country === "UAE" && bool(o.show_arabic, d.show_arabic),
    arabic_name: str(o.arabic_name ?? d.arabic_name, 40),
    arabic_footer: str(o.arabic_footer ?? d.arabic_footer, 60),
    address: str(o.address, 120),
    phone: str(o.phone, 30),
    header: str(o.header, 80),
    tax_id: str(o.tax_id, 30).trim(),
    vat_rate: isFinite(rate) && rate >= 0 && rate <= 30 ? rate : d.vat_rate,
    invoice_prefix: str(o.invoice_prefix, 8).toUpperCase().replace(/[^A-Z0-9-]/g, ""),
    show_table: bool(o.show_table, d.show_table),
    big_order_no: bool(o.big_order_no, d.big_order_no),
    show_mods: bool(o.show_mods, d.show_mods),
    show_payment: bool(o.show_payment, d.show_payment),
    footer: str(o.footer ?? d.footer, 80),
    show_qr: bool(o.show_qr, d.show_qr),
    qr_url: str(o.qr_url, 200).trim(),
    qr_caption: str(o.qr_caption ?? d.qr_caption, 40),
    show_wifi: bool(o.show_wifi, d.show_wifi),
    wifi: str(o.wifi, 60),
    show_social: bool(o.show_social, d.show_social),
    social: str(o.social, 40),
  };
}

// What has to be filled in before a store's designed receipt is legal.
export function receiptMissing(c: ReceiptCfg): string[] {
  const miss: string[] = [];
  if (!c.address.trim()) miss.push("address");
  if (!c.tax_id) miss.push(c.country === "UAE" ? "TRN" : "VAT number");
  if (c.country === "UAE" && !c.invoice_prefix) miss.push("invoice prefix");
  return miss;
}
