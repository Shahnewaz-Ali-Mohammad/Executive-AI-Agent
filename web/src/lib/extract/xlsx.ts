/**
 * Excel (.xlsx) → one page per worksheet, each as a Markdown table that the
 * AI can read. Very large sheets are cut off with a note, so one huge export
 * can't flood the search index.
 */
import "server-only";
import ExcelJS from "exceljs";

const MAX_ROWS = 2000;
const MAX_COLUMNS = 40;

function cellText(cell: ExcelJS.Cell): string {
  const text = cell.text ?? "";
  return String(text).replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}

export async function extractXlsx(data: Uint8Array): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(data) as unknown as ArrayBuffer);

  const pages: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (rows.length >= MAX_ROWS) return;
      const cells: string[] = [];
      for (let column = 1; column <= Math.min(sheet.columnCount, MAX_COLUMNS); column++) {
        cells.push(cellText(row.getCell(column)));
      }
      if (cells.some(Boolean)) rows.push(cells);
    });

    const lines = [`## Sheet: ${sheet.name}`, ""];
    if (rows.length === 0) {
      lines.push("(empty sheet)");
    } else {
      const width = Math.max(...rows.map((row) => row.length));
      const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
      lines.push(line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line));
      if (sheet.rowCount > MAX_ROWS) lines.push("", `(only the first ${MAX_ROWS} rows of ${sheet.rowCount} are included)`);
    }
    pages.push(lines.join("\n"));
  });
  return pages;
}
