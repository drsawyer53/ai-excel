import { useMemo } from "react";
import type { ColumnDef, DateFormat } from "./ColumnPanel";

export type SheetCellMatrix = string[][];

function colLetter(i: number) {
  const A = "A".charCodeAt(0);
  if (i < 26) return String.fromCharCode(A + i);
  const first = Math.floor(i / 26) - 1;
  const second = i % 26;
  return String.fromCharCode(A + first) + String.fromCharCode(A + second);
}

function toNumberLike(s: string): number | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  const normalized = v.replace(/[$,%\s,]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function toDateLike(s: string): Date | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function formatNumber(n: number, decimals: number) {
  return n.toFixed(decimals);
}

function formatDate(d: Date, fmt: DateFormat): string {
  const yyyy = d.getFullYear();
  const mm = d.getMonth() + 1;
  const dd = d.getDate();

  if (fmt === "iso") {
    const m = String(mm).padStart(2, "0");
    const day = String(dd).padStart(2, "0");
    return `${yyyy}-${m}-${day}`;
  }
  return `${mm}/${dd}/${yyyy}`;
}

function computeValue(
  col: ColumnDef,
  rowValuesById: Record<string, string>
): { value: string; error: string | null } {
  const spec = col.computed;
  if (!spec) return { value: "", error: "Missing computed spec" };

  const aId = spec.inputs?.[0] ?? "";
  const bId = spec.inputs?.[1] ?? "";
  const aRaw = aId ? rowValuesById[aId] ?? "" : "";
  const bRaw = bId ? rowValuesById[bId] ?? "" : "";

  if (!aId || !bId) return { value: "", error: "Select input columns" };

  if (spec.kind === "divide") {
    const a = toNumberLike(aRaw);
    const b = toNumberLike(bRaw);
    if (a === null || b === null) return { value: "", error: "Inputs must be numbers" };
    if (b === 0) return { value: "", error: "Divide by zero" };
    return { value: String(a / b), error: null };
  }

  if (spec.kind === "subtract") {
    const a = toNumberLike(aRaw);
    const b = toNumberLike(bRaw);
    if (a === null || b === null) return { value: "", error: "Inputs must be numbers" };
    return { value: String(a - b), error: null };
  }

  if (spec.kind === "date_diff_years") {
    const start = toDateLike(aRaw);
    const end = toDateLike(bRaw);
    if (!start || !end) return { value: "", error: "Inputs must be dates" };
    const ms = end.getTime() - start.getTime();
    const years = ms / (1000 * 60 * 60 * 24 * 365.25);
    return { value: String(years), error: null };
  }

  return { value: "", error: "Unknown computed operation" };
}

function validateCell(col: ColumnDef, raw: string): string | null {
  if (col.type === "computed") return null;
  if (col.type === "untyped") return null;

  const v = (raw ?? "").trim();

  if (col.required && v.length === 0) return "Required";
  if (v.length === 0) return null;

  switch (col.type) {
    case "text":
      return null;

    case "number": {
      const n = toNumberLike(v);
      return n === null ? "Must be a number" : null;
    }

    case "currency": {
      const n = toNumberLike(v);
      return n === null ? "Must be a currency amount" : null;
    }

    case "percent": {
      const n = toNumberLike(v);
      if (n === null) return "Must be a percent";
      if (n < -100 || n > 1000) return "Percent looks off";
      return null;
    }

    case "date": {
      const d = toDateLike(v);
      return d ? null : "Invalid date";
    }

    case "enum": {
      const opts = col.enumValues ?? [];
      if (opts.length === 0) return "Enum has no options";
      return opts.includes(v) ? null : `Must be one of: ${opts.join(", ")}`;
    }

    default:
      return null;
  }
}

function applyFormattingOnBlur(col: ColumnDef, raw: string): string {
  const v = (raw ?? "").trim();
  if (!v) return "";

  const decimals = col.format?.decimals ?? (col.type === "currency" || col.type === "percent" ? 2 : 2);

  if (col.type === "number" || col.type === "currency") {
    const n = toNumberLike(v);
    if (n === null) return raw;
    return formatNumber(n, decimals);
  }

  if (col.type === "percent") {
    const n = toNumberLike(v);
    if (n === null) return raw;
    return `${formatNumber(n, decimals)}%`;
  }

  if (col.type === "date") {
    const d = toDateLike(v);
    if (!d) return raw;
    const fmt = (col.format?.dateFormat ?? "iso") as DateFormat;
    return formatDate(d, fmt);
  }

  return raw;
}

function focusCell(r: number, c: number) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-cell="${r}-${c}"]`) as HTMLElement | null;
    el?.focus();
  });
}

export function SpreadsheetGrid({
  columns,
  cells,
  selectedCol,
  activeCell,
  onSelectCol,
  onSelectCell,
  onFillDown,
  onChangeCell,
}: {
  columns: ColumnDef[];
  cells: SheetCellMatrix;
  selectedCol: number | null;
  activeCell: { r: number; c: number } | null;
  onSelectCol: (colIndex: number) => void;
  onSelectCell: (r: number, c: number) => void;
  onFillDown: (r: number, c: number) => void;
  onChangeCell: (r: number, c: number, value: string) => void;
}) {
  const rowCount = cells.length;
  const colCount = columns.length;

  const headerLabels = useMemo(() => {
    return columns.map((c, idx) => (c.name?.trim() ? c.name : colLetter(idx)));
  }, [columns]);

  function moveTo(r: number, c: number) {
    const rr = Math.max(0, Math.min(rowCount - 1, r));
    const cc = Math.max(0, Math.min(colCount - 1, c));
    onSelectCell(rr, cc);
    focusCell(rr, cc);
  }

  function handleNavKey(e: React.KeyboardEvent, r: number, c: number) {
    // Ctrl+D = Fill Down (Excel-style)
    if (e.ctrlKey && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      onFillDown(r, c);
      return;
    }

    // Tab navigation
    if (e.key === "Tab") {
      e.preventDefault();
      moveTo(r, c + (e.shiftKey ? -1 : 1));
      return;
    }

    // Enter navigation
    if (e.key === "Enter") {
      e.preventDefault();
      moveTo(r + (e.shiftKey ? -1 : 1), c);
      return;
    }

    // Optional: Ctrl + Arrow keys for cell navigation (without breaking cursor movement)
    if (e.ctrlKey) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        moveTo(r, c + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveTo(r, c - 1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveTo(r + 1, c);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveTo(r - 1, c);
      }
    }
  }

  return (
    <div className="sheetWrap">
      <div className="sheet" style={{ gridTemplateColumns: `56px repeat(${colCount}, 160px)` }}>
        <div className="sheetCorner" />

        {headerLabels.map((label, cIdx) => {
          const isSelected = selectedCol === cIdx;
          const typed = columns[cIdx].type !== "untyped";
          return (
            <button
              key={`h_${cIdx}`}
              className={`sheetColHeader ${isSelected ? "selected" : ""}`}
              onClick={() => onSelectCol(cIdx)}
              title={columns[cIdx].description || ""}
            >
              <div className="sheetColHeaderTop">
                <span className="sheetColLetter">{colLetter(cIdx)}</span>
                <span className={`sheetTypePill ${typed ? "typed" : ""}`}>{columns[cIdx].type}</span>
              </div>
              <div className="sheetColHeaderLabel">{label}</div>
            </button>
          );
        })}

        {Array.from({ length: rowCount }).map((_, rIdx) => {
          const rowValuesById: Record<string, string> = {};
          for (let c = 0; c < colCount; c++) rowValuesById[columns[c].id] = cells[rIdx]?.[c] ?? "";

          return (
            <div key={`r_${rIdx}`} className="sheetRow">
              <div className="sheetRowHeader">{rIdx + 1}</div>

              {Array.from({ length: colCount }).map((__, cIdx) => {
                const col = columns[cIdx];

                const isActive = activeCell?.r === rIdx && activeCell?.c === cIdx;

                // Computed: format always (read-only)
                if (col.type === "computed") {
                  const { value, error } = computeValue(col, rowValuesById);
                  const invalid = Boolean(error);
                  const dec = col.format?.decimals ?? 4;
                  const n = toNumberLike(value);
                  const display = error ? "" : n === null ? value : formatNumber(n, dec);

                  return (
                    <input
                      key={`cell_${rIdx}_${cIdx}`}
                      data-cell={`${rIdx}-${cIdx}`}
                      className={`sheetCell sheetCellComputed ${invalid ? "sheetCellInvalid" : ""} ${
                        isActive ? "sheetCellActive" : ""
                      }`}
                      value={display}
                      readOnly
                      onFocus={() => onSelectCell(rIdx, cIdx)}
                      onKeyDown={(e) => handleNavKey(e, rIdx, cIdx)}
                      title={error ?? "Computed"}
                    />
                  );
                }

                const value = cells[rIdx]?.[cIdx] ?? "";
                const error = validateCell(col, value);
                const invalid = Boolean(error);

                if (col.type === "enum" && (col.enumValues?.length ?? 0) > 0) {
                  return (
                    <select
                      key={`cell_${rIdx}_${cIdx}`}
                      data-cell={`${rIdx}-${cIdx}`}
                      className={`sheetCellSelect ${invalid ? "sheetCellInvalid" : ""} ${
                        isActive ? "sheetCellActive" : ""
                      }`}
                      value={value}
                      onFocus={() => onSelectCell(rIdx, cIdx)}
                      onKeyDown={(e) => handleNavKey(e, rIdx, cIdx)}
                      onChange={(e) => onChangeCell(rIdx, cIdx, e.target.value)}
                      title={error ?? ""}
                    >
                      <option value="">—</option>
                      {col.enumValues!.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  );
                }

                return (
                  <input
                    key={`cell_${rIdx}_${cIdx}`}
                    data-cell={`${rIdx}-${cIdx}`}
                    className={`sheetCell ${invalid ? "sheetCellInvalid" : ""} ${isActive ? "sheetCellActive" : ""}`}
                    value={value}
                    onFocus={() => onSelectCell(rIdx, cIdx)}
                    onKeyDown={(e) => handleNavKey(e, rIdx, cIdx)}
                    onChange={(e) => onChangeCell(rIdx, cIdx, e.target.value)}
                    onBlur={() => {
                      const formatted = applyFormattingOnBlur(col, value);
                      if (formatted !== value) onChangeCell(rIdx, cIdx, formatted);
                    }}
                    title={error ?? ""}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
