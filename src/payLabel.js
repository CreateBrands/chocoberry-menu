// How an order was settled, in words.
//
// Every screen used to do this inline as `method === "cash" ? "Cash" : "Card"`,
// which quietly labelled a split bill, an "other" tender and a comped order as
// Card. One place, so they all agree.
//
//   comp  — a 100% discount closed it; no money changed hands
//   split — more than one tender; see order_payments for the breakdown
export function payLabel(method) {
  switch (method) {
    case "cash": return "Cash";
    case "card": return "Card";
    case "split": return "Split";
    case "comp": return "Comp";
    case "other": return "Other";
    default: return method ? String(method) : "";
  }
}
