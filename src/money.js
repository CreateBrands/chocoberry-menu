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
//
// Everything a currency changes about the till lives in the table below, not
// just the symbol. The cash-up pad, the quick-tender buttons and the variance
// threshold were all written as UK notes and coins, and staff cannot count a
// drawer with the wrong buttons on it. GBP's figures are exactly what the till
// used before this table existed, so a store with no currency setting behaves
// as it always has.

const CURRENCIES = {
  GBP: {
    symbol: "£",
    minor: "p",
    // Cash-up pad, largest first. UK notes and coins.
    denoms: [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01],
    // Quick-tender buttons on the cash sheet: the notes a customer hands over.
    notes: [5, 10, 20, 50],
    // Drawer variance beyond this needs a written reason at close.
    varianceNote: 5,
  },
  AED: {
    symbol: "AED ",
    // 1 dirham = 100 fils. Only the 25 and 50 fils coins still circulate.
    minor: "f",
    denoms: [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.5, 0.25],
    notes: [10, 20, 50, 100, 200],
    // ~£4, so it catches the same size of mistake £5 catches in London
    // rather than firing on nearly every close.
    varianceNote: 20,
  },
  USD: { symbol: "$", minor: "c", denoms: [100, 50, 20, 10, 5, 1, 0.25, 0.1, 0.05, 0.01], notes: [5, 10, 20, 50], varianceNote: 5 },
  EUR: { symbol: "€", minor: "c", denoms: [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05], notes: [5, 10, 20, 50], varianceNote: 5 },
  SAR: { symbol: "SAR ", minor: "h", denoms: [500, 200, 100, 50, 10, 5, 1, 0.5, 0.25], notes: [10, 50, 100], varianceNote: 20 },
  QAR: { symbol: "QAR ", minor: "d", denoms: [500, 200, 100, 50, 10, 5, 1, 0.5, 0.25], notes: [10, 50, 100], varianceNote: 20 },
};

let active = "GBP";

function cur() {
  return CURRENCIES[active] || CURRENCIES.GBP;
}

// Unknown or empty codes leave the current setting alone, so a missing
// per-store setting cannot blank out every price on the screen.
export function setActiveCurrency(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c && CURRENCIES[c]) active = c;
}

export function activeCurrency() {
  return active;
}

export function currencySymbol() {
  return cur().symbol;
}

// Anything that is not a number prints as zero rather than "£NaN", which is
// what staff used to see mid-keystroke on the discount sheets.
export function money(n) {
  const v = Number(n);
  return currencySymbol() + (Number.isFinite(v) ? v : 0).toFixed(2);
}

// Same figure with the trailing ".00" dropped, for the tender buttons where
// "£20" reads better than "£20.00" on a narrow sheet.
export function moneyShort(n) {
  const v = Number(n);
  return currencySymbol() + (Number.isFinite(v) ? v : 0).toFixed(2).replace(/\.00$/, "");
}

// The cash-up pad, largest first.
export function denominations() {
  return cur().denoms;
}

// A note or coin as staff know it: "£50", "50p", "AED 1000", "25f".
export function denomLabel(d) {
  const c = cur();
  const v = Number(d) || 0;
  return v >= 1 ? c.symbol + v : Math.round(v * 100) + c.minor;
}

// Quick-tender buttons on the cash sheet.
export function cashNotes() {
  return cur().notes;
}

// Drawer variance beyond this needs a written reason at close.
export function varianceNoteFrom() {
  return cur().varianceNote;
}
