// ===== 입력 제한값 (서버 validate.js와 동일하게 맞춰둠) =====
const LIMITS = { qtyMax: 9999, priceMax: 100000000, rateMax: 100 };

function clampQty(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(n, LIMITS.qtyMax);
}
function clampPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, LIMITS.priceMax);
}
function clampRate(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, LIMITS.rateMax);
}

// ===== 브라우저에 저장되는 자주 쓰는 품목 (등록/수정/삭제) =====
const CUSTOM_ITEMS_KEY = "bathroom-estimate-custom-items";
const HIDDEN_ITEMS_KEY = "bathroom-estimate-hidden-items";
const OVERRIDES_KEY = "bathroom-estimate-item-overrides";

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// ===== 하나로 모은 상태 =====
const state = {
  catalog: [], // 서버 기본 품목
  customItems: loadJSON(CUSTOM_ITEMS_KEY, []),
  hiddenIds: new Set(loadJSON(HIDDEN_ITEMS_KEY, [])),
  overrides: loadJSON(OVERRIDES_KEY, {}),
  items: [], // 지금 담은 견적 항목
  vatRatePercent: 10,
  vatMode: "exclusive", // "exclusive" = 부가세 별도, "inclusive" = 부가세 포함
  depositRatePercent: 50,
  editingItemId: null,
  editingIsCustom: false,
  undo: null, // { item, index, timeoutId }
};

let itemSeq = 0;
const nextItemId = () => `row-${Date.now()}-${itemSeq++}`;

const won = (n) => Math.round(n || 0).toLocaleString("ko-KR");

function saveCustomItems() {
  localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(state.customItems));
}
function saveHiddenIds() {
  localStorage.setItem(HIDDEN_ITEMS_KEY, JSON.stringify([...state.hiddenIds]));
}
function saveOverrides() {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(state.overrides));
}

// ===== 견적번호 / 유효기간 =====
const QUOTE_SEQ_KEY = "bathroom-estimate-quote-seq";

function todayYYYYMMDD(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function nextQuoteNumber() {
  const today = todayYYYYMMDD();
  const stored = loadJSON(QUOTE_SEQ_KEY, { date: "", seq: 0 });
  const seq = stored.date === today ? stored.seq + 1 : 1;
  localStorage.setItem(QUOTE_SEQ_KEY, JSON.stringify({ date: today, seq }));
  return `Q-${today}-${String(seq).padStart(3, "0")}`;
}

function validUntilDate(daysFromNow = 15) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ===== 계산: 서버 왕복 없이 브라우저에서 즉시 =====
function computeQuote() {
  const lineItems = state.items.map((it) => ({ ...it, amount: Math.round(it.qty * it.unitPrice) }));
  const rawSum = lineItems.reduce((s, it) => s + it.amount, 0);
  const vatRate = state.vatRatePercent / 100;

  let subtotal, vat, total;
  if (state.vatMode === "inclusive") {
    // 담은 단가에 부가세가 이미 포함되어 있다고 보고 역산
    total = rawSum;
    subtotal = Math.round(total / (1 + vatRate));
    vat = total - subtotal;
  } else {
    // 담은 단가는 부가세 별도 금액
    subtotal = rawSum;
    vat = Math.round(subtotal * vatRate);
    total = subtotal + vat;
  }

  const depositRate = state.depositRatePercent / 100;
  const deposit = Math.round(total * depositRate);
  const balance = total - deposit;
  return { lineItems, subtotal, vat, vatRate, vatMode: state.vatMode, total, deposit, depositRate, balance };
}

// ===== 화면 전체를 다시 그리는 단일 진입점 =====
function render() {
  renderCatalog();
  renderItemCards();
  renderTotals(computeQuote());
  renderNotes();
}

// 텍스트 입력 중에는 포커스가 끊기지 않도록, 값 변경 시엔 render() 대신
// 합계 영역만 갱신한다 (합계 카드는 입력칸이 없는 별도 DOM이라 안전함).
function recalcTotalsOnly() {
  renderTotals(computeQuote());
  renderNotes();
}

async function init() {
  const res = await fetch("/api/items");
  state.catalog = await res.json();
  render();
}

// ===== 자주 쓰는 품목 =====
// 로그인 상태면 Supabase의 내 단가표(price_items)가 곧 카탈로그다.
// 로그인 전이면 서버 기본 25종 + 이 브라우저에 저장된 커스텀 품목을 쓴다.
function allCatalogItems() {
  if (window.cloudState && window.cloudState.user) {
    return window.cloudState.priceItems.map((p) => ({
      id: p.id,
      name: p.name,
      spec: p.spec,
      unit: p.unit,
      unitPrice: p.sale_price,
      costPrice: p.cost_price,
      category: p.category,
      cloud: true,
    }));
  }
  const base = state.catalog
    .filter((c) => !state.hiddenIds.has(c.id))
    .map((c) => (state.overrides[c.id] ? { ...c, ...state.overrides[c.id] } : c));
  return [...base, ...state.customItems];
}

function addOrBumpItem(item) {
  const existing = state.items.find((r) => r.catalogId === item.id);
  if (existing) {
    existing.qty = clampQty(existing.qty + 1);
  } else {
    state.items.push({
      id: nextItemId(),
      catalogId: item.id,
      name: item.name,
      spec: item.spec,
      unit: item.unit,
      qty: 1,
      unitPrice: clampPrice(item.unitPrice),
    });
  }
  render();
}

function renderCatalog() {
  const el = document.getElementById("catalog");
  el.innerHTML = "";
  allCatalogItems().forEach((item) => {
    const isCloud = item.cloud === true;
    const isCustom = item.custom === true;
    const wrap = document.createElement("span");
    wrap.className = "chip-wrap" + (isCustom || isCloud ? " custom" : "");

    const btn = document.createElement("button");
    btn.className = "cat-btn";
    let label = `${item.name} (${won(item.unitPrice)}원/${item.unit || "-"})`;
    if (isCloud && item.category) {
      label = `[${item.category}] ${label}`;
    }
    if (isCloud && item.costPrice > 0 && item.unitPrice > 0) {
      const marginPercent = Math.round(((item.unitPrice - item.costPrice) / item.unitPrice) * 100);
      label += ` · 마진 ${marginPercent}%`;
    }
    btn.textContent = label;
    btn.onclick = () => addOrBumpItem(item);
    wrap.appendChild(btn);

    const edit = document.createElement("button");
    edit.className = "cat-edit";
    edit.textContent = "✎";
    edit.title = "이 품목 수정";
    edit.onclick = (e) => {
      e.stopPropagation();
      startEditingCatalogItem(item, isCustom, isCloud);
    };
    wrap.appendChild(edit);

    const del = document.createElement("button");
    del.className = "cat-del";
    del.textContent = "×";
    del.title = "이 품목 삭제";
    del.onclick = async (e) => {
      e.stopPropagation();
      if (isCloud) {
        await deletePriceItem(item.id);
      } else if (isCustom) {
        state.customItems = state.customItems.filter((c) => c.id !== item.id);
        saveCustomItems();
      } else {
        state.hiddenIds.add(item.id);
        saveHiddenIds();
      }
      if (state.editingItemId === item.id) resetCatalogEditState();
      render();
    };
    wrap.appendChild(del);

    el.appendChild(wrap);
  });
}

function startEditingCatalogItem(item, isCustom, isCloud) {
  document.getElementById("newItemName").value = item.name;
  document.getElementById("newItemSpec").value = item.spec || "";
  document.getElementById("newItemUnit").value = item.unit || "EA";
  document.getElementById("newItemPrice").value = item.unitPrice;
  if (isCloud) {
    document.getElementById("newItemCost").value = item.costPrice || 0;
    document.getElementById("newItemCategory").value = item.category || "자재";
  }
  state.editingItemId = item.id;
  state.editingIsCustom = isCustom;
  document.getElementById("addCatalogItemBtn").textContent = "수정 완료";
  document.getElementById("cancelEditBtn").style.display = "inline-block";
  document.getElementById("newItemName").focus();
}

function resetCatalogEditState() {
  state.editingItemId = null;
  state.editingIsCustom = false;
  document.getElementById("addCatalogItemBtn").textContent = "+ 자주 쓰는 품목으로 저장";
  document.getElementById("cancelEditBtn").style.display = "none";
  document.getElementById("newItemName").value = "";
  document.getElementById("newItemSpec").value = "";
  document.getElementById("newItemUnit").value = "EA";
  document.getElementById("newItemPrice").value = "";
  document.getElementById("newItemCost").value = "";
  document.getElementById("newItemCategory").value = "자재";
}

// ===== 담은 품목 (모바일 카드 목록) =====
function addRow() {
  state.items.push({ id: nextItemId(), name: "", spec: "", unit: "EA", qty: 1, unitPrice: 0 });
  render();
}

function removeRow(id) {
  const idx = state.items.findIndex((r) => r.id === id);
  if (idx === -1) return;
  const [removed] = state.items.splice(idx, 1);
  showUndoToast(removed, idx);
  render();
}

function showUndoToast(removedItem, index) {
  if (state.undo) clearTimeout(state.undo.timeoutId);
  const toast = document.getElementById("undoToast");
  document.getElementById("undoToastText").textContent = `"${removedItem.name || "품목"}" 지웠어요`;
  toast.style.display = "flex";
  const timeoutId = setTimeout(() => {
    state.undo = null;
    toast.style.display = "none";
  }, 5000);
  state.undo = { item: removedItem, index, timeoutId };
}

function undoRemove() {
  if (!state.undo) return;
  clearTimeout(state.undo.timeoutId);
  const { item, index } = state.undo;
  state.items.splice(Math.min(index, state.items.length), 0, item);
  state.undo = null;
  document.getElementById("undoToast").style.display = "none";
  render();
}

function renderItemCards() {
  const container = document.getElementById("itemsList");
  container.innerHTML = "";

  if (state.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "아직 담은 품목이 없어요. 위에서 자주 쓰는 품목을 눌러 담아보세요.";
    container.appendChild(empty);
    return;
  }

  state.items.forEach((row) => {
    const card = document.createElement("div");
    card.className = "item-card";

    // 품명 + 이 줄 지우기
    const row1 = document.createElement("div");
    row1.className = "item-card-row1";
    const nameInput = document.createElement("input");
    nameInput.className = "item-name-input";
    nameInput.value = row.name;
    nameInput.placeholder = "품명";
    nameInput.addEventListener("input", (e) => {
      row.name = e.target.value;
      delete row.catalogId;
    });
    row1.appendChild(nameInput);

    const delBtn = document.createElement("button");
    delBtn.className = "card-del-btn";
    delBtn.textContent = "이 줄 지우기";
    delBtn.onclick = () => removeRow(row.id);
    row1.appendChild(delBtn);
    card.appendChild(row1);

    // 규격 / 단위
    const row2 = document.createElement("div");
    row2.className = "item-card-row2";
    const specInput = document.createElement("input");
    specInput.placeholder = "규격";
    specInput.value = row.spec || "";
    specInput.addEventListener("input", (e) => { row.spec = e.target.value; });
    const unitInput = document.createElement("input");
    unitInput.placeholder = "단위";
    unitInput.value = row.unit || "";
    unitInput.addEventListener("input", (e) => { row.unit = e.target.value; });
    row2.appendChild(specInput);
    row2.appendChild(unitInput);
    card.appendChild(row2);

    // 수량 스테퍼 + 단가
    const row3 = document.createElement("div");
    row3.className = "item-card-row3";

    const stepper = document.createElement("div");
    stepper.className = "qty-stepper";
    const minusBtn = document.createElement("button");
    minusBtn.className = "stepper-btn";
    minusBtn.type = "button";
    minusBtn.textContent = "−";
    minusBtn.onclick = () => {
      row.qty = clampQty(row.qty - 1);
      qtyDisplay.textContent = row.qty;
      amountValue.textContent = won(row.qty * row.unitPrice) + "원";
      recalcTotalsOnly();
    };
    const qtyDisplay = document.createElement("span");
    qtyDisplay.className = "qty-display";
    qtyDisplay.textContent = row.qty;
    const plusBtn = document.createElement("button");
    plusBtn.className = "stepper-btn";
    plusBtn.type = "button";
    plusBtn.textContent = "+";
    plusBtn.onclick = () => {
      row.qty = clampQty(row.qty + 1);
      qtyDisplay.textContent = row.qty;
      amountValue.textContent = won(row.qty * row.unitPrice) + "원";
      recalcTotalsOnly();
    };
    stepper.appendChild(minusBtn);
    stepper.appendChild(qtyDisplay);
    stepper.appendChild(plusBtn);
    row3.appendChild(stepper);

    const priceField = document.createElement("div");
    priceField.className = "price-field";
    const priceLabel = document.createElement("label");
    priceLabel.textContent = "단가";
    const priceInput = document.createElement("input");
    priceInput.className = "item-price-input";
    priceInput.type = "number";
    priceInput.value = row.unitPrice;
    priceInput.addEventListener("input", (e) => {
      row.unitPrice = clampPrice(e.target.value);
      amountValue.textContent = won(row.qty * row.unitPrice) + "원";
      recalcTotalsOnly();
    });
    priceField.appendChild(priceLabel);
    priceField.appendChild(priceInput);
    row3.appendChild(priceField);

    card.appendChild(row3);

    // 금액
    const amountRow = document.createElement("div");
    amountRow.className = "item-card-amount";
    const amountLabel = document.createElement("span");
    amountLabel.textContent = "금액";
    const amountValue = document.createElement("strong");
    amountValue.textContent = won(row.qty * row.unitPrice) + "원";
    amountRow.appendChild(amountLabel);
    amountRow.appendChild(amountValue);
    card.appendChild(amountRow);

    container.appendChild(card);
  });
}

// ===== 요율 / 합계 =====
function renderTotals(quote) {
  const el = document.getElementById("totals");
  el.innerHTML = `
    <div class="line"><span>공급가액</span><span>${won(quote.subtotal)}원</span></div>
    <div class="line"><span>부가세 (${Math.round(quote.vatRate * 100)}%)</span><span>${won(quote.vat)}원</span></div>
    <div class="line grand"><span>총 합계금액</span><span>${won(quote.total)}원</span></div>
    <div class="line"><span>계약금 (${Math.round(quote.depositRate * 100)}%)</span><span>${won(quote.deposit)}원</span></div>
    <div class="line"><span>잔금</span><span>${won(quote.balance)}원</span></div>
  `;
}

function renderNotes() {
  const el = document.getElementById("notesArea");
  const vatLine = state.vatMode === "inclusive"
    ? "※ 상기 금액은 부가세가 포함된 금액입니다."
    : "※ 상기 금액은 부가세 별도입니다.";
  el.innerHTML = [
    vatLine,
    `※ 계약금 ${state.depositRatePercent}%, 공사완료 후 나머지 잔금 입금.`,
    "※ 하자 보수기간은 공사종료 후 시점부터 1년간 보장함.",
    "※ 견적금액은 현장작업 상황에 따라 변동될 수 있습니다.",
  ].join("<br/>");
}

// ===== 이벤트 바인딩 =====
document.getElementById("addRowBtn").addEventListener("click", addRow);

document.getElementById("undoToastBtn").addEventListener("click", undoRemove);

document.getElementById("addCatalogItemBtn").addEventListener("click", async () => {
  const name = document.getElementById("newItemName").value.trim();
  const spec = document.getElementById("newItemSpec").value.trim();
  const unit = document.getElementById("newItemUnit").value.trim() || "EA";
  const unitPrice = clampPrice(document.getElementById("newItemPrice").value);
  const costPrice = clampPrice(document.getElementById("newItemCost").value);
  const category = document.getElementById("newItemCategory").value;
  if (!name) {
    alert("품명을 입력해주세요.");
    return;
  }

  if (window.cloudState && window.cloudState.user) {
    if (state.editingItemId) {
      await updatePriceItem(state.editingItemId, {
        name, spec, unit, category, sale_price: unitPrice, cost_price: costPrice,
      });
    } else {
      await addPriceItem({ name, spec, unit, category, sale_price: unitPrice, cost_price: costPrice });
    }
    resetCatalogEditState();
    render();
    return;
  }

  if (state.editingItemId) {
    if (state.editingIsCustom) {
      const target = state.customItems.find((c) => c.id === state.editingItemId);
      if (target) Object.assign(target, { name, spec, unit, unitPrice });
      saveCustomItems();
    } else {
      state.overrides[state.editingItemId] = { name, spec, unit, unitPrice };
      saveOverrides();
    }
    resetCatalogEditState();
  } else {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    state.customItems.push({ id, name, spec, unit, unitPrice, custom: true });
    saveCustomItems();
    document.getElementById("newItemName").value = "";
    document.getElementById("newItemSpec").value = "";
    document.getElementById("newItemPrice").value = "";
  }
  render();
});

document.getElementById("cancelEditBtn").addEventListener("click", resetCatalogEditState);

document.getElementById("vatRate").addEventListener("input", (e) => {
  state.vatRatePercent = clampRate(e.target.value);
  recalcTotalsOnly();
});
document.getElementById("depositRate").addEventListener("input", (e) => {
  state.depositRatePercent = clampRate(e.target.value);
  recalcTotalsOnly();
});

document.querySelectorAll(".vat-mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.vatMode = btn.dataset.mode;
    document.querySelectorAll(".vat-mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
    recalcTotalsOnly();
  });
});

document.getElementById("downloadBtn").addEventListener("click", async () => {
  const validItems = state.items.filter((r) => r.name && r.qty > 0);
  if (validItems.length === 0) {
    alert("담은 품목이 없어요. 먼저 품목을 담아주세요.");
    return;
  }
  const meta = {
    supplierName: document.getElementById("supplierName").value,
    supplierRep: document.getElementById("supplierRep").value,
    supplierContact: document.getElementById("supplierContact").value,
    supplierAccount: document.getElementById("supplierAccount").value,
    supplierBizRegNo: document.getElementById("supplierBizRegNo").value,
    clientName: document.getElementById("clientName").value,
    contact: document.getElementById("contact").value,
    siteAddress: document.getElementById("siteAddress").value,
    consultDate: document.getElementById("consultDate").value,
    workDate: document.getElementById("workDate").value,
    quoteNumber: nextQuoteNumber(),
    validUntil: validUntilDate(15),
    logoUrl: window.cloudState?.companyInfo?.logo_url || "",
    stampUrl: window.cloudState?.companyInfo?.stamp_url || "",
  };
  const res = await fetch("/api/quote/xlsx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: validItems,
      vatRate: state.vatRatePercent / 100,
      vatMode: state.vatMode,
      depositRate: state.depositRatePercent / 100,
      meta,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert((err.errors && err.errors.join("\n")) || "엑셀을 만들지 못했어요. 입력값을 확인해주세요.");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meta.clientName || "견적서"}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
});

// ===== 로그인 상태 변화에 맞춰 화면 갱신 (cloud.js가 이벤트를 쏨) =====
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const saveCompanyInfoDebounced = debounce(() => {
  if (!(window.cloudState && window.cloudState.user)) return;
  saveCompanyInfo({
    name: document.getElementById("supplierName").value,
    rep: document.getElementById("supplierRep").value,
    contact: document.getElementById("supplierContact").value,
    account: document.getElementById("supplierAccount").value,
    biz_reg_no: document.getElementById("supplierBizRegNo").value,
  });
}, 800);

["supplierName", "supplierRep", "supplierContact", "supplierAccount", "supplierBizRegNo"].forEach((id) => {
  document.getElementById(id).addEventListener("input", saveCompanyInfoDebounced);
});

document.addEventListener("cloud-changed", () => {
  const loggedIn = !!(window.cloudState && window.cloudState.user);
  document.getElementById("newItemCost").style.display = loggedIn ? "" : "none";
  document.getElementById("newItemCategory").style.display = loggedIn ? "" : "none";
  document.getElementById("logoStampSection").style.display = loggedIn ? "block" : "none";
  document.getElementById("catalogSaveNote").textContent = loggedIn
    ? "※ 로그인 계정에 저장돼서 다른 기기에서도 그대로 보여요."
    : "※ 새로 등록/수정/삭제한 내용은 이 컴퓨터의 이 브라우저에만 저장됩니다.";

  if (loggedIn && window.cloudState.companyInfo) {
    const c = window.cloudState.companyInfo;
    document.getElementById("supplierName").value = c.name || "";
    document.getElementById("supplierRep").value = c.rep || "";
    document.getElementById("supplierContact").value = c.contact || "";
    document.getElementById("supplierAccount").value = c.account || "";
    document.getElementById("supplierBizRegNo").value = c.biz_reg_no || "";
    showImagePreview("logoPreview", c.logo_url);
    showImagePreview("stampPreview", c.stamp_url);
  }

  render();
});

function showImagePreview(elId, url) {
  const img = document.getElementById(elId);
  if (url) {
    img.src = url;
    img.style.display = "inline-block";
  } else {
    img.style.display = "none";
  }
}

async function handleImageUpload(kind, inputEl, previewElId) {
  const file = inputEl.files[0];
  if (!file) return;
  inputEl.disabled = true;
  const { url, error } = await uploadCompanyImage(kind, file);
  inputEl.disabled = false;
  if (error) {
    alert("이미지 업로드에 실패했어요. 다시 시도해주세요.");
    return;
  }
  showImagePreview(previewElId, url);
}

document.getElementById("logoUpload").addEventListener("change", (e) => {
  handleImageUpload("logo", e.target, "logoPreview");
});
document.getElementById("stampUpload").addEventListener("change", (e) => {
  handleImageUpload("stamp", e.target, "stampPreview");
});

init();
