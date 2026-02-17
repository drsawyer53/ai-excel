import { useEffect, useMemo, useState } from "react";
import { SpreadsheetGrid, type SheetCellMatrix } from "./SpreadsheetGrid";
import { ColumnPanel, type ColumnDef, type ColumnType } from "./ColumnPanel";

const STORAGE_KEY = "ai-excel:workbook:v1";

type WorkbookState = {
  purpose: string;
  columns: ColumnDef[];
  cells: SheetCellMatrix;
  rowCount: number;
};

function makeDefaultColumns(count: number): ColumnDef[] {
  const cols: ColumnDef[] = [];
  for (let i = 0; i < count; i++) {
    cols.push({
      id: `col_${i}`,
      name: String.fromCharCode("A".charCodeAt(0) + i), // A, B, C...
      type: "untyped",
      required: false,
      description: "",
      enumValues: [],
    });
  }
  return cols;
}

function makeEmptyCells(rows: number, cols: number): SheetCellMatrix {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

function loadState(): WorkbookState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        purpose: "",
        rowCount: 50,
        columns: makeDefaultColumns(12),
        cells: makeEmptyCells(50, 12),
      };
    }
    const parsed = JSON.parse(raw) as Partial<WorkbookState>;
    const rowCount = typeof parsed.rowCount === "number" ? parsed.rowCount : 50;
    const columns = Array.isArray(parsed.columns) && parsed.columns.length > 0 ? parsed.columns : makeDefaultColumns(12);
    const colCount = columns.length;

    const cells =
      Array.isArray(parsed.cells) && parsed.cells.length > 0
        ? (parsed.cells as SheetCellMatrix)
        : makeEmptyCells(rowCount, colCount);

    // Normalize cells dimensions to rowCount x colCount
    const normalized = makeEmptyCells(rowCount, colCount);
    for (let r = 0; r < Math.min(rowCount, cells.length); r++) {
      for (let c = 0; c < Math.min(colCount, (cells[r] ?? []).length); c++) {
        normalized[r][c] = String(cells[r][c] ?? "");
      }
    }

    return {
      purpose: typeof parsed.purpose === "string" ? parsed.purpose : "",
      rowCount,
      columns,
      cells: normalized,
    };
  } catch {
    return {
      purpose: "",
      rowCount: 50,
      columns: makeDefaultColumns(12),
      cells: makeEmptyCells(50, 12),
    };
  }
}

function mockSuggestColumnsFromPurpose(purpose: string): ColumnDef[] {
  const p = purpose.toLowerCase();

  if (p.includes("investment grade") || p.includes("primary market") || p.includes("ig")) {
    const cols: ColumnDef[] = [
      { id: "date", name: "Pricing Date", type: "date", required: true, description: "Deal pricing date", enumValues: [] },
      { id: "issuer", name: "Issuer", type: "text", required: true, description: "Company / issuer name", enumValues: [] },
      { id: "currency", name: "Currency", type: "enum", required: true, description: "Deal currency", enumValues: ["USD", "EUR", "GBP"] },
      { id: "amount_mm", name: "Amount (mm)", type: "number", required: true, description: "Deal size in millions", enumValues: [] },
      { id: "spread_bp", name: "Spread (bp)", type: "number", required: true, description: "Spread in basis points (e.g., 120)", enumValues: [] },
      { id: "coupon_pct", name: "Coupon (%)", type: "percent", required: false, description: "Coupon percent (e.g., 5.25)", enumValues: [] },
      { id: "maturity", name: "Maturity Date", type: "date", required: true, description: "Bond maturity date", enumValues: [] },
      { id: "sector", name: "Sector", type: "enum", required: false, description: "Issuer sector", enumValues: ["Financials", "Industrials", "Utilities", "TMT", "Healthcare"] },
      { id: "ratings", name: "Ratings (M/S/F)", type: "text", required: false, description: "Example: A3/A-/A-", enumValues: [] },
    ];

    // Pad to 12 columns so it still feels like a sheet
    while (cols.length < 12) {
      const i = cols.length;
      cols.push({
        id: `extra_${i}`,
        name: String.fromCharCode("A".charCodeAt(0) + i),
        type: "untyped",
        required: false,
        description: "",
        enumValues: [],
      });
    }
    return cols;
  }

  // Default: keep 12 columns but label A-L, mark as untyped
  return makeDefaultColumns(12);
}

export function Workbook() {
  const initial = useMemo(() => loadState(), []);
  const [purpose, setPurpose] = useState(initial.purpose);
  const [columns, setColumns] = useState<ColumnDef[]>(initial.columns);
  const [cells, setCells] = useState<SheetCellMatrix>(initial.cells);
  const [rowCount, setRowCount] = useState<number>(initial.rowCount);

  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null);

  // Persist
  useEffect(() => {
    const payload: WorkbookState = { purpose, columns, cells, rowCount };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [purpose, columns, cells, rowCount]);

  // If columns count changes, resize cells
  useEffect(() => {
    const colCount = columns.length;
    const normalized = makeEmptyCells(rowCount, colCount);

    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        normalized[r][c] = cells?.[r]?.[c] ?? "";
      }
    }

    setCells(normalized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.length, rowCount]);

  function onChangeCell(r: number, c: number, value: string) {
    setCells((prev) => {
      const next = prev.map((row) => row.slice());
      next[r][c] = value;
      return next;
    });
  }

  function fillDownFromCell(r: number, c: number) {
    setCells((prev) => {
      const next = prev.map((row) => row.slice());
      const source = next[r]?.[c] ?? "";
      if (!source.trim()) return prev;

      // Fill down through contiguous blank cells only
      for (let rr = r + 1; rr < next.length; rr++) {
        if ((next[rr]?.[c] ?? "").trim() !== "") break;
        next[rr][c] = source;
      }
      return next;
    });
  }

  function onUpdateColumn(idx: number, patch: Partial<ColumnDef>) {
    setColumns((prev) => {
      const next = [...prev];
      const updated: ColumnDef = { ...next[idx], ...patch };

      // If type changes away from enum, clear enum values
      if (patch.type && patch.type !== "enum") {
        updated.enumValues = [];
      }

      // If type changes away from computed, clear computed spec
      if (patch.type && patch.type !== "computed") {
        updated.computed = undefined;
      }

      next[idx] = updated;
      return next;
    });
  }

  function setPurposeAndKeepGrid() {
    setPurpose((p) => p.trim());
  }

  function aiSuggestColumns() {
    const suggested = mockSuggestColumnsFromPurpose(purpose);
    setColumns(suggested);

    // Resize / preserve existing data as best as possible
    const newCells = makeEmptyCells(rowCount, suggested.length);
    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < Math.min(suggested.length, cells[0]?.length ?? 0); c++) {
        newCells[r][c] = cells[r]?.[c] ?? "";
      }
    }
    setCells(newCells);
    setSelectedCol(null);
    setActiveCell(null);
  }

  function resetWorkbook() {
    localStorage.removeItem(STORAGE_KEY);
    const cols = makeDefaultColumns(12);
    setPurpose("");
    setColumns(cols);
    setRowCount(50);
    setCells(makeEmptyCells(50, cols.length));
    setSelectedCol(null);
    setActiveCell(null);
  }

  const selectedColumnDef = selectedCol === null ? null : columns[selectedCol];

  return (
    <div className="workbook">
      <div className="wbTop">
        <div className="wbTitle">
          <div className="wbName">AI Excel</div>
          <div className="wbHint">Spreadsheet-first. AI keeps structure + meaning tight.</div>
        </div>

        <div className="purposeBar">
          <textarea
            className="textarea"
            rows={2}
            placeholder="Describe what you're building (e.g., 'Track the investment grade primary market')"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="button" onClick={setPurposeAndKeepGrid} disabled={purpose.trim().length === 0}>
              Set Purpose
            </button>
            <button className="button secondary" onClick={aiSuggestColumns} disabled={purpose.trim().length < 6}>
              AI: Suggest Columns
            </button>
            <button className="button secondary" onClick={resetWorkbook} style={{ marginLeft: "auto" }}>
              Reset Workbook
            </button>
          </div>
        </div>
      </div>

      <div className="wbBody">
        <div className="wbGrid">
          <SpreadsheetGrid
            columns={columns}
            cells={cells}
            selectedCol={selectedCol}
            activeCell={activeCell}
            onSelectCol={setSelectedCol}
            onSelectCell={(r, c) => setActiveCell({ r, c })}
            onFillDown={(r, c) => fillDownFromCell(r, c)}
            onChangeCell={onChangeCell}
          />
        </div>

        <div className="wbPanel">
          <ColumnPanel
            column={selectedColumnDef}
            columnIndex={selectedCol}
            allColumns={columns}
            onClose={() => setSelectedCol(null)}
            onUpdate={(patch) => {
              if (selectedCol === null) return;
              onUpdateColumn(selectedCol, patch);
            }}
          />
        </div>
      </div>
    </div>
  );
}
