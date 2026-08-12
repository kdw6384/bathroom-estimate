function calcQuote({ items, vatRate = 0.1, depositRate = 0.5, vatMode = "exclusive" }) {
  const lineItems = items.map((it) => {
    const qty = Number(it.qty) || 0;
    const unitPrice = Number(it.unitPrice) || 0;
    return { ...it, qty, unitPrice, amount: Math.round(qty * unitPrice) };
  });

  const rawSum = lineItems.reduce((sum, it) => sum + it.amount, 0);

  let subtotal, vat, total;
  if (vatMode === "inclusive") {
    total = rawSum;
    subtotal = Math.round(total / (1 + vatRate));
    vat = total - subtotal;
  } else {
    subtotal = rawSum;
    vat = Math.round(subtotal * vatRate);
    total = subtotal + vat;
  }

  const deposit = Math.round(total * depositRate);
  const balance = total - deposit;

  return { lineItems, subtotal, vat, vatRate, vatMode, total, deposit, depositRate, balance };
}

module.exports = { calcQuote };
