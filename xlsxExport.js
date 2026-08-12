const ExcelJS = require("exceljs");
const getNotes = require("./data/notes");

const ACCENT = "FF1D6F5C";
const ACCENT_DARK = "FF12463A";
const HEADER_FILL = "FFEEF3F1";
const ZEBRA_FILL = "FFF7FAF9";
const BORDER_COLOR = "FFD8E0DD";

const thinBorder = { style: "thin", color: { argb: BORDER_COLOR } };
const box = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

async function buildQuoteWorkbook({ meta, quote }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("견적서", { pageSetup: { fitToPage: true, fitToWidth: 1 } });

  ws.columns = [
    { width: 22 }, // A 품명
    { width: 14 }, // B 규격
    { width: 8 }, // C 단위
    { width: 8 }, // D 수량
    { width: 13 }, // E 단가
    { width: 15 }, // F 금액
    { width: 18 }, // G 비고
  ];

  // Title band
  ws.mergeCells("A1:G2");
  const titleCell = ws.getCell("A1");
  titleCell.value = "견   적   서";
  titleCell.font = { size: 22, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 24;
  ws.getRow(2).height = 24;
  for (let c = 1; c <= 7; c++) {
    ws.getCell(2, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
    ws.getCell(1, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
  }

  let r = 4;

  // Two-column info block: 공급자 (left) / 현장정보 (right)
  const infoStart = r;
  const supplierLines = [
    ["업체명", meta.supplierName],
    ["대표자", meta.supplierRep],
    ["연락처", meta.supplierContact],
    ["입금계좌", meta.supplierAccount],
    ["사업자등록번호", meta.supplierBizRegNo],
  ];
  const clientLines = [
    ["거래처명", meta.clientName],
    ["연락처", meta.contact],
    ["현장주소", meta.siteAddress],
    ["상담일자 / 시공예정일", [meta.consultDate, meta.workDate].filter(Boolean).join(" / ")],
    ["견적번호", meta.quoteNumber],
    ["유효기간", meta.validUntil ? `${meta.validUntil}까지` : ""],
  ];

  const writeInfoBlock = (title, lines, colLabel, colValueStart, colValueEnd) => {
    const cell = ws.getCell(r, colLabel);
    ws.mergeCells(r, colLabel, r, colValueEnd);
    cell.value = title;
    cell.font = { bold: true, size: 11, color: { argb: ACCENT_DARK } };
    cell.alignment = { horizontal: "left" };
  };

  ws.getCell(r, 1).value = "공급자 정보";
  ws.getCell(r, 1).font = { bold: true, size: 11, color: { argb: ACCENT_DARK } };
  ws.mergeCells(r, 1, r, 3);
  ws.getCell(r, 5).value = "현장 정보";
  ws.getCell(r, 5).font = { bold: true, size: 11, color: { argb: ACCENT_DARK } };
  ws.mergeCells(r, 5, r, 7);
  r += 1;

  const maxLines = Math.max(supplierLines.length, clientLines.length);
  for (let i = 0; i < maxLines; i++) {
    if (supplierLines[i]) {
      ws.getCell(r, 1).value = supplierLines[i][0];
      ws.getCell(r, 1).font = { size: 9.5, color: { argb: "FF6B7873" } };
      ws.mergeCells(r, 2, r, 3);
      ws.getCell(r, 2).value = supplierLines[i][1] || "";
      ws.getCell(r, 2).font = { size: 10 };
    }
    if (clientLines[i]) {
      ws.getCell(r, 5).value = clientLines[i][0];
      ws.getCell(r, 5).font = { size: 9.5, color: { argb: "FF6B7873" } };
      ws.mergeCells(r, 6, r, 7);
      ws.getCell(r, 6).value = clientLines[i][1] || "";
      ws.getCell(r, 6).font = { size: 10 };
    }
    r += 1;
  }
  r += 1;

  // Line items table
  const headerRow = r;
  const headers = ["품명", "규격", "단위", "수량", "단가", "금액", "비고"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: ACCENT_DARK } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = box;
  });
  ws.getRow(headerRow).height = 20;
  r += 1;

  const firstItemRow = r;
  quote.lineItems.forEach((it, idx) => {
    if (idx % 2 === 1) {
      for (let c = 1; c <= 7; c++) {
        ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } };
      }
    }
    ws.getCell(r, 1).value = it.name;
    ws.getCell(r, 1).alignment = { horizontal: "left" };
    ws.getCell(r, 2).value = it.spec || "";
    ws.getCell(r, 3).value = it.unit || "";
    ws.getCell(r, 4).value = it.qty;
    ws.getCell(r, 5).value = it.unitPrice;
    ws.getCell(r, 5).numFmt = "#,##0";
    ws.getCell(r, 5).alignment = { horizontal: "right" };
    // 금액 = 수량(D) * 단가(E) — 값이 아니라 수식으로 넣어서 나중에 단가를 고치면 자동 반영되게 함
    ws.getCell(r, 6).value = { formula: `D${r}*E${r}`, result: it.amount };
    ws.getCell(r, 6).numFmt = "#,##0";
    ws.getCell(r, 6).alignment = { horizontal: "right" };
    ws.getCell(r, 7).value = it.note || "";
    for (let c = 1; c <= 7; c++) {
      ws.getCell(r, c).border = box;
    }
    r += 1;
  });
  const lastItemRow = r - 1;
  r += 1;

  // 합계 블록: 다섯 줄의 위치를 먼저 정해서, 부가세 방식(별도/포함)에 따라
  // 서로 다른 방향으로 셀을 참조하는 수식을 쓸 수 있게 한다
  const subtotalRow = r;
  const vatRow = r + 1;
  const grandRow = r + 2;
  const depositRow = r + 3;
  const balanceRow = r + 4;
  const sumRange = `F${firstItemRow}:F${lastItemRow}`;

  const writeTotalRow = (rowNum, label, formula, result, opts = {}) => {
    ws.mergeCells(`A${rowNum}:E${rowNum}`);
    const labelCell = ws.getCell(`A${rowNum}`);
    labelCell.value = label;
    labelCell.alignment = { horizontal: "right" };
    const valueCell = ws.getCell(`F${rowNum}`);
    valueCell.value = { formula, result };
    valueCell.numFmt = "#,##0";
    valueCell.alignment = { horizontal: "right" };
    if (opts.grand) {
      for (let c = 1; c <= 6; c++) {
        ws.getCell(rowNum, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
        ws.getCell(rowNum, c).font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
      }
      ws.getRow(rowNum).height = 22;
    } else {
      labelCell.font = { size: 10.5, color: { argb: "FF444444" } };
      valueCell.font = { size: 10.5 };
    }
  };

  if (quote.vatMode === "inclusive") {
    // 총 합계금액이 담은 단가의 합 그 자체이고, 공급가액/부가세는 거기서 역산
    writeTotalRow(grandRow, "총 합계금액", `SUM(${sumRange})`, quote.total, { grand: true });
    writeTotalRow(subtotalRow, "공급가액", `ROUND(F${grandRow}/(1+${quote.vatRate}),0)`, quote.subtotal);
    writeTotalRow(vatRow, `부가세 (${Math.round(quote.vatRate * 100)}%)`, `F${grandRow}-F${subtotalRow}`, quote.vat);
  } else {
    writeTotalRow(subtotalRow, "공급가액", `SUM(${sumRange})`, quote.subtotal);
    writeTotalRow(vatRow, `부가세 (${Math.round(quote.vatRate * 100)}%)`, `ROUND(F${subtotalRow}*${quote.vatRate},0)`, quote.vat);
    writeTotalRow(grandRow, "총 합계금액", `F${subtotalRow}+F${vatRow}`, quote.total, { grand: true });
  }
  writeTotalRow(depositRow, `계약금 (${Math.round(quote.depositRate * 100)}%)`, `ROUND(F${grandRow}*${quote.depositRate},0)`, quote.deposit);
  writeTotalRow(balanceRow, "잔    금", `F${grandRow}-F${depositRow}`, quote.balance);

  r = balanceRow + 2;

  const notes = getNotes(Math.round(quote.depositRate * 100), quote.vatMode);
  for (const line of notes) {
    ws.mergeCells(`A${r}:G${r}`);
    const cell = ws.getCell(`A${r}`);
    cell.value = `※ ${line}`;
    cell.font = { size: 9, italic: true, color: { argb: "FF8A9490" } };
    r += 1;
  }

  return wb;
}

module.exports = { buildQuoteWorkbook };
