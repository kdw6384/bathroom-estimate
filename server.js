const express = require("express");
const items = require("./data/items");
const { calcQuote } = require("./calc");
const { buildQuoteWorkbook } = require("./xlsxExport");
const { validateQuoteInput } = require("./validate");

const app = express();

// 사이트 전체를 막던 비밀번호(기본인증)는 제거했다. 실제 접근 제어는 카카오
// 로그인 + Supabase RLS가 담당한다 (로그인 안 하면 각자 계정 데이터에 접근 불가).
// 카카오톡 인앱 브라우저는 기본인증을 잘 처리 못 하는 문제도 있어서, 카카오톡으로
// 링크를 주고받는 이 앱의 배포 방식과는 애초에 맞지 않았다.
app.use(express.json());
app.use(express.static("public"));

app.get("/api/items", (req, res) => {
  res.json(items);
});

app.post("/api/quote/xlsx", async (req, res) => {
  const { items: lineItems, vatRate, depositRate, vatMode, meta } = req.body;
  const errors = validateQuoteInput({ items: lineItems, vatRate, depositRate, vatMode });
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  const quote = calcQuote({ items: lineItems, vatRate, depositRate, vatMode });
  const wb = await buildQuoteWorkbook({ meta: meta || {}, quote });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="quote.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`bathroom-estimate server running at http://localhost:${PORT}`);
});
