import ExcelJS from "exceljs";

/**
 * Parses a base64-encoded .xlsx workbook into an array of row objects keyed
 * by the header row. Used by the users and cost-codes bulk-import endpoints.
 */
export async function parseExcelBase64(base64: string): Promise<Record<string, string>[]> {
  const buffer = Buffer.from(base64, "base64");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, string> = {};
    row.eachCell((cell, colNumber) => {
      const key = headers[colNumber];
      if (key) obj[key] = String(cell.value ?? "").trim();
    });
    if (Object.keys(obj).length > 0) rows.push(obj);
  });

  return rows;
}

export async function buildExcelWorkbook(
  sheetName: string,
  columns: { header: string; key: string; width?: number }[],
  rows: Record<string, unknown>[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

interface SheetSpec {
  sheetName: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, unknown>[];
}

/**
 * Builds a bulk-import template: a main sheet with headers + example rows,
 * plus an optional reference sheet (valid roles, current team names, etc.)
 * so the person filling it in knows exactly what values are accepted.
 */
export async function buildImportTemplate(main: SheetSpec, reference?: SheetSpec): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet(main.sheetName);
  sheet.columns = main.columns;
  sheet.addRows(main.rows);
  sheet.getRow(1).font = { bold: true };

  if (reference) {
    const refSheet = workbook.addWorksheet(reference.sheetName);
    refSheet.columns = reference.columns;
    refSheet.addRows(reference.rows);
    refSheet.getRow(1).font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
