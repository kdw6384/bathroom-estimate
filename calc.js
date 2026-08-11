function calcQuote({ items, vatRate = 0.1, depositRate = 0.5 }) {
  const lineItems = items.map((it) => {
    const qty = Number(it.qty) || 0;
    const unitPrice = Number(it.unitPrice) || 0;
    return { ...it, qty, unitPrice, amount: Math.round(qty * unitPrice) };
  });

  const subtotal = lineItems.reduce((sum, it) => sum + it.amount, 0);
  const vat = Math.round(subtotal * vatRate);
  const total = subtotal + vat;
  const deposit = Math.round(total * depositRate);
  const balance = total - deposit;

  return { lineItems, subtotal, vat, vatRate, total, deposit, depositRate, balance };
}

module.exports = { calcQuote };
