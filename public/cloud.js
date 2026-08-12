// 로그인/업체정보/내 단가표를 Supabase와 연결하는 부분.
// app.js는 window.cloudState를 읽어서 로그인 여부에 따라 동작을 바꾼다.

const DEFAULT_ITEMS_URL = "/api/items";

window.cloudState = {
  ready: false, // 최초 세션 확인이 끝났는지
  user: null, // 로그인 안 했으면 null
  companyInfo: null, // { name, rep, biz_reg_no, contact, account }
  priceItems: [], // [{ id, category, name, spec, unit, cost_price, sale_price }]
};

function cloudChanged() {
  renderLoginBar();
  document.dispatchEvent(new CustomEvent("cloud-changed"));
}

async function initCloud() {
  const { data } = await supabaseClient.auth.getSession();
  await handleSession(data.session);
  window.cloudState.ready = true;
  cloudChanged();

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    await handleSession(session);
    cloudChanged();
  });
}

async function handleSession(session) {
  window.cloudState.user = session ? session.user : null;
  if (window.cloudState.user) {
    await Promise.all([loadCompanyInfo(), loadPriceItems()]);
    if (window.cloudState.priceItems.length === 0) {
      await seedDefaultPriceItems();
      await loadPriceItems();
    }
  } else {
    window.cloudState.companyInfo = null;
    window.cloudState.priceItems = [];
  }
}

function renderLoginBar() {
  const el = document.getElementById("loginBar");
  if (!window.cloudState.ready) {
    el.innerHTML = "";
    return;
  }
  if (window.cloudState.user) {
    const name =
      window.cloudState.user.user_metadata?.name ||
      window.cloudState.user.user_metadata?.full_name ||
      "내 계정";
    el.innerHTML = `
      <span class="login-status">
        <span class="cloud-badge">☁ 저장됨</span>
        ${escapeHtmlCloud(name)}님
      </span>
      <button class="logout-btn" id="logoutBtn">로그아웃</button>
    `;
    document.getElementById("logoutBtn").addEventListener("click", signOutOfKakao);
  } else {
    el.innerHTML = `<button class="kakao-login-btn" id="kakaoLoginBtn">카카오로 로그인</button>`;
    document.getElementById("kakaoLoginBtn").addEventListener("click", signInWithKakao);
  }
}

function escapeHtmlCloud(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function signInWithKakao() {
  // Supabase가 카카오 기본 스코프(account_email profile_image profile_nickname)를
  // 이미 요청한다. 여기서 scopes를 또 지정하면 대체가 아니라 뒤에 덧붙는 방식이라
  // "profile_nickname profile_image profile_nickname profile_image"처럼 중복돼
  // 카카오 로그인 세션이 있는 브라우저에서 KOE 오류가 났다. 세 동의항목을 모두
  // 카카오 쪽에서 켰으니 커스텀 scopes 없이 기본값을 그대로 쓴다.
  await supabaseClient.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: window.location.origin + window.location.pathname,
    },
  });
}

async function signOutOfKakao() {
  await supabaseClient.auth.signOut();
}

// ===== 업체정보 =====
async function loadCompanyInfo() {
  const { data, error } = await supabaseClient
    .from("companies")
    .select("*")
    .eq("id", window.cloudState.user.id)
    .maybeSingle();
  if (!error) window.cloudState.companyInfo = data;
}

async function saveCompanyInfo(fields) {
  if (!window.cloudState.user) return;
  const row = { id: window.cloudState.user.id, ...fields, updated_at: new Date().toISOString() };
  const { error } = await supabaseClient.from("companies").upsert(row);
  // upsert만 보낸 컬럼만 갱신하지만, 로컬 캐시는 통째로 덮어쓰면 방금 안 보낸
  // 필드(예: 이름)가 화면에서 비어 보이므로 병합해서 저장한다.
  if (!error) window.cloudState.companyInfo = { ...window.cloudState.companyInfo, ...row };
}

// ===== 로고 / 직인 이미지 =====
async function uploadCompanyImage(kind, file) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${window.cloudState.user.id}/${kind}.${ext}`;
  const { error: uploadError } = await supabaseClient.storage
    .from("company-assets")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (uploadError) return { error: uploadError };

  const { data } = supabaseClient.storage.from("company-assets").getPublicUrl(path);
  const urlField = kind === "logo" ? "logo_url" : "stamp_url";
  await saveCompanyInfo({ [urlField]: data.publicUrl });
  return { url: data.publicUrl };
}

// ===== 내 단가표 =====
async function loadPriceItems() {
  const { data, error } = await supabaseClient
    .from("price_items")
    .select("*")
    .eq("user_id", window.cloudState.user.id)
    .order("created_at", { ascending: true });
  if (!error) window.cloudState.priceItems = data || [];
}

async function seedDefaultPriceItems() {
  const res = await fetch(DEFAULT_ITEMS_URL);
  const defaults = await res.json();
  const rows = defaults.map((it) => ({
    user_id: window.cloudState.user.id,
    category: "자재",
    name: it.name,
    spec: it.spec || "",
    unit: it.unit || "EA",
    cost_price: 0,
    sale_price: it.unitPrice || 0,
  }));
  await supabaseClient.from("price_items").insert(rows);
}

async function addPriceItem({ category, name, spec, unit, cost_price, sale_price }) {
  const row = {
    user_id: window.cloudState.user.id,
    category: category || "자재",
    name,
    spec: spec || "",
    unit: unit || "EA",
    cost_price: cost_price || 0,
    sale_price: sale_price || 0,
  };
  const { data, error } = await supabaseClient.from("price_items").insert(row).select().single();
  if (!error) window.cloudState.priceItems.push(data);
  return { data, error };
}

async function updatePriceItem(id, fields) {
  const { data, error } = await supabaseClient.from("price_items").update(fields).eq("id", id).select().single();
  if (!error) {
    const idx = window.cloudState.priceItems.findIndex((p) => p.id === id);
    if (idx !== -1) window.cloudState.priceItems[idx] = data;
  }
  return { data, error };
}

async function deletePriceItem(id) {
  const { error } = await supabaseClient.from("price_items").delete().eq("id", id);
  if (!error) {
    window.cloudState.priceItems = window.cloudState.priceItems.filter((p) => p.id !== id);
  }
  return { error };
}

initCloud();
