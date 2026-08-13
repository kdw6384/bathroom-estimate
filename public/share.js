const won = (n) => Math.round(n || 0).toLocaleString("ko-KR");

function getQuoteId() {
  return new URLSearchParams(location.search).get("id");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function renderMessage(message) {
  document.getElementById("app").innerHTML = `<div class="card"><p>${escapeHtml(message)}</p></div>`;
}

async function load() {
  const id = getQuoteId();
  if (!id) {
    renderMessage("잘못된 링크예요. 주소를 다시 확인해주세요.");
    return;
  }

  const [quoteRes, itemsRes] = await Promise.all([
    supabaseClient.rpc("get_shared_quote", { p_quote_id: id }),
    supabaseClient.rpc("get_shared_quote_items", { p_quote_id: id }),
  ]);
  const quote = quoteRes.data && quoteRes.data[0];
  if (quoteRes.error || !quote) {
    renderMessage("견적서를 찾을 수 없어요. 링크를 다시 확인해주세요.");
    return;
  }

  supabaseClient.rpc("mark_quote_opened", { p_quote_id: id }); // 언제 열렸는지 기록 (결과를 기다릴 필요 없음)

  render(quote, itemsRes.data || []);
}

function render(quote, items) {
  const vatLine = quote.vat_mode === "inclusive"
    ? "상기 금액은 부가세가 포함된 금액입니다."
    : "상기 금액은 부가세 별도입니다.";
  const depositPercent = Math.round(quote.deposit_rate ?? 0);

  const itemsHtml = items.map((it) => `
    <div class="item-row">
      <div>
        <div class="item-row-name">${escapeHtml(it.name)}${it.spec ? ` <span class="item-row-sub" style="margin:0">(${escapeHtml(it.spec)})</span>` : ""}</div>
        <div class="item-row-sub">${won(it.unit_price)}원 × ${it.qty}${it.unit ? escapeHtml(it.unit) : ""}</div>
      </div>
      <div class="item-row-amount">${won(it.amount)}원</div>
    </div>
  `).join("");

  document.getElementById("app").innerHTML = `
    <div class="card header-card">
      ${quote.logo_url ? `<img class="logo" src="${escapeHtml(quote.logo_url)}" alt="로고" />` : ""}
      <h1>견적서</h1>
      <div class="meta-line">${escapeHtml(quote.quote_number || "")}</div>
      <div class="meta-line muted">발행일 ${escapeHtml(formatDate(quote.created_at))} · 유효기간 ${escapeHtml(quote.valid_until || "")}까지</div>
    </div>

    <div class="card">
      <h2>공급자</h2>
      <div class="info-grid">
        <div><span>업체명</span><strong>${escapeHtml(quote.supplier_name) || "-"}</strong></div>
        <div><span>대표자</span><strong>${escapeHtml(quote.supplier_rep) || "-"}</strong></div>
        <div><span>연락처</span><strong>${escapeHtml(quote.supplier_contact) || "-"}</strong></div>
        <div><span>사업자등록번호</span><strong>${escapeHtml(quote.supplier_biz_reg_no) || "-"}</strong></div>
      </div>
    </div>

    <div class="card">
      <h2>거래처</h2>
      <div class="info-grid">
        <div><span>거래처명</span><strong>${escapeHtml(quote.client_name) || "-"}</strong></div>
        <div><span>연락처</span><strong>${escapeHtml(quote.contact) || "-"}</strong></div>
        <div><span>현장주소</span><strong>${escapeHtml(quote.site_address) || "-"}</strong></div>
      </div>
    </div>

    <div class="card">
      <h2>견적 항목</h2>
      <div class="items-list">${itemsHtml}</div>
    </div>

    <div class="card totals-card">
      <div class="line"><span>공급가액</span><span>${won(quote.subtotal)}원</span></div>
      <div class="line"><span>부가세</span><span>${won(quote.vat)}원</span></div>
      <div class="line grand"><span>총 합계금액</span><span>${won(quote.total)}원</span></div>
      <div class="line"><span>계약금 (${depositPercent}%)</span><span>${won(quote.deposit)}원</span></div>
      <div class="line"><span>잔금</span><span>${won(quote.balance)}원</span></div>
      ${quote.stamp_url ? `<img class="stamp" src="${escapeHtml(quote.stamp_url)}" alt="직인" />` : ""}
    </div>

    <div class="notes">
      ※ ${vatLine}<br/>
      ※ 계약금 ${depositPercent}%, 공사완료 후 나머지 잔금 입금.<br/>
      ※ 하자 보수기간은 공사종료 후 시점부터 1년간 보장함.<br/>
      ※ 견적금액은 현장작업 상황에 따라 변동될 수 있습니다.
    </div>

    <button class="print-btn no-print" id="printBtn">PDF로 저장 / 인쇄</button>
  `;

  document.getElementById("printBtn").addEventListener("click", () => window.print());
}

load();
