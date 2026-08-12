const express = require("express");
const items = require("./data/items");
const { calcQuote } = require("./calc");
const { buildQuoteWorkbook } = require("./xlsxExport");
const { validateQuoteInput } = require("./validate");

const app = express();

const APP_PASSWORD = process.env.APP_PASSWORD || "bathroom1234";

function basicAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const [, password] = decoded.split(":");
    if (password === APP_PASSWORD) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="bathroom-estimate"');
  res.status(401).send("비밀번호가 필요합니다.");
}

app.use(basicAuth);
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
