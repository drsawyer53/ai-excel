import { useMemo } from "react";

export type ColumnType = "date" | "text" | "number" | "currency" | "percent" | "enum";

export type ColumnSpec = {
  id: string;
  name: string;
  type: ColumnType;
  required: boolean;
  description?: string;
  enumValues?: string[];
};

export type Row = Record<string, string>;

type CellError = string | null;

function validateCell(col: ColumnSpec, raw: string): CellError {
  const v = raw.trim();

  if (col.required && v.length === 0) return "Required";
  if (v.length === 0) return null;

  switch (col.type) {
    case "text":
      return null;

    case "number": {
      const n = Number(v);
      return Number.isFinite(n) ? null : "Must be a number";
    }

    case "currency": {
      const normalized = v.replace(/[$,]/g, "");
      const n = Number(normalized);
      return Number.isFinite(n) ? null : "Must be a currency amount";
    }

    case "percent": {
      const normalized = v.replace(/%/g, "");
      const n = Number(normalized);
      if (!Number.isFinite(n)) return "Must be a percent";
      if (n < -100 || n > 1000) return "Percent looks off";
      return null;
    }

    case "date": {
      const d = new Date(v);
      return isNaN(d.getTime()) ? "Invalid date" : null;
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

function makeEmptyRow(columns: ColumnSpec[]): Row {
  const r: Row = {};
  for (const c of columns) r[c.id] = "";
  return r;
}

export function DataGrid({
  columns,
  rows,
  onChangeRows,
}: {
  columns: ColumnSpec[];
  rows: Row[];
  onChangeRows: (rows: Row[]) => void;
}) {
  // Ensure every row matches current columns (add missing keys, drop removed keys)
  const normalizedRows = useMemo(() => {
    return rows.map((r) => {
      const next: Row = { ...r };
      for (const c of columns) if (next[c.id] === undefined) next[c.id] = "";
      for (const k of Object.keys(next)) {
        if (!columns.some((c) => c.id === k)) delete next[k];
      }
      return next;
    });
  }, [rows, columns]);

  const errors = useMemo(() => {
    return normalizedRows.map((r) => {
      const e: Record<string, CellError> = {};
      for (const c of columns) e[c.id] = validateCell(c, r[c.id] ?? "");
      return e;
    });
  }, [normalizedRows, columns]);

  const hasAnyErrors = useMemo(() => {
    return errors.some((rowE) => Object.values(rowE).some((x) => x));
  }, [errors]);

  function addRow() {
    onChangeRows([...normalizedRows, makeEmptyRow(columns)]);
  }

  function updateCell(rowIdx: number, colId: string, value: string) {
    const next = [...normalizedRows];
    next[rowIdx] = { ...next[rowIdx], [colId]: value };
    onChangeRows(next);
  }

  function removeRow(rowIdx: number) {
    onChangeRows(normalizedRows.filter((_, i) => i !== rowIdx));
  }

  function copyJson() {
    navigator.clipboard.writeText(JSON.stringify(normalizedRows, null, 2));
    alert("Copied rows JSON to clipboard");
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>Data</h2>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            {hasAnyErrors ? "Fix validation errors to make the sheet AI-clean." : "All good — clean, typed data."}
          </div>
        </div>

        <div className="row" style={{ marginTop: 0 }}>
          <button className="button secondary" onClick={addRow}>
            + Add Row
          </button>
          <button className="button" onClick={copyJson}>
            Copy JSON
          </button>
        </div>
      </div>

      <div className="gridWrap">
        <div className="grid">
          <div className="gridRow header" style={{ gridTemplateColumns: `40px repeat(${columns.length}, 220px) 44px` }}>
            <div>#</div>
            {columns.map((c) => (
              <div key={c.id} title={c.description ?? ""}>
                {c.name}
                <div style={{ fontSize: 11, opacity: 0.7 }}>{c.type}{c.required ? " • req" : ""}</div>
              </div>
            ))}
            <div></div>
          </div>

          {normalizedRows.map((r, rowIdx) => (
            <div
              key={rowIdx}
              className="gridRow"
              style={{ gridTemplateColumns: `40px repeat(${columns.length}, 220px) 44px` }}
            >
              <div style={{ opacity: 0.7 }}>{rowIdx + 1}</div>

              {columns.map((c) => {
                const err = errors[rowIdx]?.[c.id] ?? null;

                if (c.type === "enum" && (c.enumValues?.length ?? 0) > 0) {
                  return (
                    <div key={c.id} className="cell">
                      <select
                        className={`input ${err ? "inputError" : ""}`}
                        value={r[c.id] ?? ""}
                        onChange={(e) => updateCell(rowIdx, c.id, e.target.value)}
                      >
                        <option value="">—</option>
                        {c.enumValues!.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      {err && <div className="cellError">{err}</div>}
                    </div>
                  );
                }

                const placeholder =
                  c.type === "date" ? "YYYY-MM-DD" :
                  c.type === "number" ? "e.g. 120" :
                  c.type === "currency" ? "e.g. 1000000" :
                  c.type === "percent" ? "e.g. 5.25" :
                  "";

                return (
                  <div key={c.id} className="cell">
                    <input
                      className={`input ${err ? "inputError" : ""}`}
                      value={r[c.id] ?? ""}
                      onChange={(e) => updateCell(rowIdx, c.id, e.target.value)}
                      placeholder={placeholder}
                    />
                    {err && <div className="cellError">{err}</div>}
                  </div>
                );
              })}

              <button className="iconButton" onClick={() => removeRow(rowIdx)} title="Remove row">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
