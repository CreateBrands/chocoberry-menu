// One place for money formatting, so a tablet in Dubai does not price its
// menu in pounds.
//
// The active currency is module state rather than React state on purpose:
// money() is called from dozens of render paths — order rows, receipts, the
// kiosk, the till sheets — that never see a prop, and threading one through
// all of them would be a far larger change than the problem deserves. The
// app sets it once from the store it is serving, before anything renders.
//
// Named setActiveCurrency/money rather than a short cur() helper: the
// dashboard shipped a blank screen when its cur() was shadowed by a local
// rollup variable of the same name.

const SYMBOLS = { GBP: "£", AED: "AED ", USD: "$", EUR: "€", SAR: "SAR ", QAR: "QAR " };

let active = "GBP";

// Unknown or empty codes leave the current setting alone, so a missing
// per-store setting cannot blank out every price on the screen.
export function setActiveCurrency(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c && SYMBOLS[c]) active = c;
}

export function activeCurrency() {
  return active;
}

export function currencySymbol() {
  return SYMBOLS[active] || "";
}

// Anything that is not a number prints as zero rather than "£NaN", which is
// what staff used to see mid-keystroke on the discount sheets.
export function money(n) {
  const v = Number(n);
  return currencySymbol() + (Number.isFinite(v) ? v : 0).toFixed(2);
}
