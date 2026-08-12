let catalog = [];
let rows = [];

const won = (n) => Math.round(n || 0).toLocaleString("ko-KR");

async function init() {
  const res = await fetch("/api/items");
  catalog = await res.json();
  renderCatalog();
  addRow();
  renderRows();
  await recalc();
  renderNotes();
}

function renderCatalog() {
  const el = document.getElementById("catalog");
  el.innerHTML = "";
  catalog.forEach((item) => {
    const btn = document.createElement("button");
    btn.textContent = `${item.name} (${won(item.unitPrice)}원/${item.unit || "-"})`;
    btn.onclick = () => {
      const existing = rows.find((r) => r.catalogId === item.id);
      if (existing) {
        existing.qty += 1;
      } else {
        rows.push({ catalogId: item.id, name: item.name, spec: item.spec, unit: item.unit, qty: 1, unitPrice: item.unitPrice });
      }
      renderRows();
      recalc();
    };
    el.appendChild(btn);
  });
}

function addRow() {
  rows.push({ name: "", spec: "", unit: "EA", qty: 1, unitPrice: 0 });
}

function renderRows() {
  const body = document.getElementById("itemsBody");
  body.innerHTML = "";
  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    nameTd.className = "name-cell";
    nameTd.innerHTML = `<input value="${escapeHtml(row.name)}" data-field="name" />`;
    tr.appendChild(nameTd);

    const specTd = document.createElement("td");
    specTd.innerHTML = `<input value="${escapeHtml(row.spec || "")}" data-field="spec" />`;
    tr.appendChild(specTd);

    const unitTd = document.createElement("td");
    unitTd.innerHTML = `<input value="${escapeHtml(row.unit || "")}" data-field="unit" style="width:50px" />`;
    tr.appendChild(unitTd);

    const qtyTd = document.createElement("td");
    qtyTd.innerHTML = `<input type="number" value="${row.qty}" data-field="qty" style="width:50px" />`;
    tr.appendChild(qtyTd);

    const priceTd = document.createElement("td");
    priceTd.innerHTML = `<input type="number" value="${row.unitPrice}" data-field="unitPrice" style="width:80px" />`;
    tr.appendChild(priceTd);

    const amountTd = document.createElement("td");
    amountTd.className = "amount-cell";
    amountTd.textContent = won(row.qty * row.unitPrice) + "원";
    tr.appendChild(amountTd);

    const actionTd = document.createElement("td");
    actionTd.className = "row-actions";
    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.onclick = () => {
      rows.splice(idx, 1);
      renderRows();
      recalc();
    };
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);

    tr.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const field = e.target.dataset.field;
        const val = field === "qty" || field === "unitPrice" ? Number(e.target.value) : e.target.value;
        rows[idx][field] = val;
        if (field === "name") {
          // manual edits detach the row from catalog-click quantity tracking
          delete rows[idx].catalogId;
        }
        if (field === "qty" || field === "unitPrice") {
          amountTd.textContent = won(rows[idx].qty * rows[idx].unitPrice) + "원";
          recalc();
        }
      });
    });

    body.appendChild(tr);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function getRates() {
  const vatRate = Number(document.getElementById("vatRate").value) / 100;
  const depositRate = Number(document.getElementById("depositRate").value) / 100;
  return { vatRate, depositRate };
}

async function recalc() {
  const { vatRate, depositRate } = getRates();
  const validItems = rows.filter((r) => r.name && r.qty > 0);
  const res = await fetch("/api/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: validItems, vatRate, depositRate }),
  });
  const quote = await res.json();
  renderTotals(quote);
}

function renderTotals(quote) {
  const el = document.getElementById("totals");
  el.innerHTML = `
    <div class="line"><span>합계</span><span>${won(quote.subtotal)}원</span></div>
    <div class="line"><span>부가세 (${Math.round(quote.vatRate * 100)}%)</span><span>${won(quote.vat)}원</span></div>
    <div class="line grand"><span>총 합계금액</span><span>${won(quote.total)}원</span></div>
    <div class="line"><span>계약금 (${Math.round(quote.depositRate * 100)}%)</span><span>${won(quote.deposit)}원</span></div>
    <div class="line"><span>잔금</span><span>${won(quote.balance)}원</span></div>
  `;
}

function renderNotes() {
  const el = document.getElementById("notesArea");
  el.innerHTML = [
    "※ 상기 금액은 부가세 별도입니다.",
    "※ 계약금 50%, 공사완료 후 나머지 잔금 입금.",
    "※ 하자 보수기간은 공사종료 후 시점부터 1년간 보장함.",
    "※ 견적금액은 현장작업 상황에 따라 변동될 수 있습니다.",
  ].join("<br/>");
}

document.getElementById("addRowBtn").addEventListener("click", () => {
  addRow();
  renderRows();
});

document.getElementById("vatRate").addEventListener("input", recalc);
document.getElementById("depositRate").addEventListener("input", recalc);

document.getElementById("downloadBtn").addEventListener("click", async () => {
  const { vatRate, depositRate } = getRates();
  const validItems = rows.filter((r) => r.name && r.qty > 0);
  const meta = {
    supplierName: document.getElementById("supplierName").value,
    supplierRep: document.getElementById("supplierRep").value,
    supplierContact: document.getElementById("supplierContact").value,
    supplierAccount: document.getElementById("supplierAccount").value,
    clientName: document.getElementById("clientName").value,
    contact: document.getElementById("contact").value,
    siteAddress: document.getElementById("siteAddress").value,
    consultDate: document.getElementById("consultDate").value,
    workDate: document.getElementById("workDate").value,
  };
  const res = await fetch("/api/quote/xlsx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: validItems, vatRate, depositRate, meta }),
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meta.clientName || "견적서"}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
});

init();
