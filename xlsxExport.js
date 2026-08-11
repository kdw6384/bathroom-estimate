const ExcelJS = require("exceljs");
const notes = require("./data/notes");

const won = (n) => Math.round(n).toLocaleString("ko-KR");

async function buildQuoteWorkbook({ meta, quote }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("견적서");

  ws.columns = [
    { width: 14 }, // A 품목
    { width: 24 }, // B 품명
    { width: 12 }, // C 규격
    { width: 8 }, // D 단위
    { width: 8 }, // E 수량
    { width: 12 }, // F 단가
    { width: 14 }, // G 금액
    { width: 16 }, // H 비고
  ];

  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = "견   적   서";
  ws.getCell("A1").font = { size: 18, bold: true };
  ws.getCell("A1").alignment = { horizontal: "center" };

  let r = 3;
  const metaRow = (label, value) => {
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`A${r}`).font = { bold: true };
    ws.mergeCells(`B${r}:H${r}`);
    ws.getCell(`B${r}`).value = value || "";
    r += 1;
  };
  metaRow("상담일자", meta.consultDate);
  metaRow("시공예정일", meta.workDate);
  metaRow("현장주소", meta.siteAddress);
  metaRow("거래처명", meta.clientName);
  metaRow("연락처", meta.contact);
  r += 1;

  const headerRow = r;
  const headers = ["품목", "품명", "규격", "단위", "수량", "단가", "금액", "비고"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center" };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  r += 1;

  for (const it of quote.lineItems) {
    ws.getCell(r, 1).value = it.category || "";
    ws.getCell(r, 2).value = it.name;
    ws.getCell(r, 3).value = it.spec || "";
    ws.getCell(r, 4).value = it.unit || "";
    ws.getCell(r, 5).value = it.qty;
    ws.getCell(r, 6).value = it.unitPrice;
    ws.getCell(r, 6).numFmt = "#,##0";
    ws.getCell(r, 7).value = it.amount;
    ws.getCell(r, 7).numFmt = "#,##0";
    ws.getCell(r, 8).value = it.note || "";
    for (let c = 1; c <= 8; c++) {
      ws.getCell(r, c).border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } };
    }
    r += 1;
  }
  r += 1;

  const totalRow = (label, value, bold = false) => {
    ws.mergeCells(`A${r}:F${r}`);
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`A${r}`).alignment = { horizontal: "right" };
    ws.getCell(`G${r}`).value = value;
    ws.getCell(`G${r}`).numFmt = "#,##0";
    if (bold) {
      ws.getCell(`A${r}`).font = { bold: true };
      ws.getCell(`G${r}`).font = { bold: true };
    }
    r += 1;
  };

  totalRow("합    계", quote.subtotal);
  totalRow(`부가세 (${Math.round(quote.vatRate * 100)}%)`, quote.vat);
  totalRow("총 합계금액", quote.total, true);
  totalRow(`계약금 (${Math.round(quote.depositRate * 100)}%)`, quote.deposit);
  totalRow("잔금", quote.balance);
  r += 1;

  for (const line of notes) {
    ws.mergeCells(`A${r}:H${r}`);
    ws.getCell(`A${r}`).value = `※ ${line}`;
    ws.getCell(`A${r}`).font = { size: 9, italic: true };
    r += 1;
  }

  return wb;
}

module.exports = { buildQuoteWorkbook };
