// 클라이언트(app.js)의 LIMITS와 반드시 같은 값을 유지할 것
const LIMITS = { qtyMax: 9999, priceMax: 100000000, rateMax: 100 };

function validateQuoteInput({ items, vatRate, depositRate }) {
  const errors = [];

  if (!Array.isArray(items) || items.length === 0) {
    errors.push("담은 품목이 없습니다.");
  } else {
    items.forEach((it, i) => {
      const n = i + 1;
      if (!it.name || !String(it.name).trim()) {
        errors.push(`${n}번째 품목의 품명이 비어 있습니다.`);
      }
      const qty = Number(it.qty);
      if (!Number.isFinite(qty) || qty <= 0 || qty > LIMITS.qtyMax) {
        errors.push(`${n}번째 품목의 수량이 올바르지 않습니다. (0 초과 ${LIMITS.qtyMax}개 이하)`);
      }
      const price = Number(it.unitPrice);
      if (!Number.isFinite(price) || price < 0 || price > LIMITS.priceMax) {
        errors.push(`${n}번째 품목의 단가가 올바르지 않습니다. (0원 이상 ${LIMITS.priceMax.toLocaleString("ko-KR")}원 이하)`);
      }
    });
  }

  const vatPercent = Number(vatRate) * 100;
  if (!Number.isFinite(vatPercent) || vatPercent < 0 || vatPercent > LIMITS.rateMax) {
    errors.push("부가세율이 올바르지 않습니다. (0~100%)");
  }

  const depositPercent = Number(depositRate) * 100;
  if (!Number.isFinite(depositPercent) || depositPercent < 0 || depositPercent > LIMITS.rateMax) {
    errors.push("계약금 비율이 올바르지 않습니다. (0~100%)");
  }

  return errors;
}

module.exports = { validateQuoteInput, LIMITS };
