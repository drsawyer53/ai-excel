import { useEffect, useMemo, useState } from "react";
import { DataGrid, type ColumnSpec, type ColumnType, type Row } from "./DataGrid";

const STORAGE_KEY = "ai-excel:v1";

type SavedState = {
  prompt: string;
  columns: ColumnSpec[] | null;
  rows: Row[]; // rows even if columns null (we keep it simple)
};

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * TEMP: mocked “AI” so we can build UI first.
 * Later this becomes an API call to your backend / OpenAI.
 */
function mockGenerateSchema(prompt: string): ColumnSpec[] {
  const p = prompt.toLowerCase();

  if (p.includes("investment grade") || p.includes("primary market") || p.includes("ig")) {
    return [
      { id: "date", name: "Pricing Date", type: "date", required: true, description: "Deal pricing date" },
      { id: "issuer", name: "Issuer", type: "text", required: true, description: "Company / issuer name" },
      { id: "currency", name: "Currency", type: "enum", required: true, enumValues: ["USD", "EUR", "GBP"] },
      { id: "amount_mm", name: "Amount (mm)", type: "number", required: true, description: "Deal size in millions" },
      { id: "spread_bp", name: "Spread (bp)", type: "number", required: true, description: "e.g., T+120" },
      { id: "coupon_pct", name: "Coupon (%)", type: "percent", required: false },
      { id: "maturity", name: "Maturity Date", type: "date", required: true },
      {
        id: "sector",
        name: "Sector",
        type: "enum",
        required: false,
        enumValues: ["Financials", "Industrials", "Utilities", "TMT", "Healthcare"],
      },
      { id: "ratings", name: "Ratings (M/S/F)", type: "text", required: false, description: "Example: A3/A-/A-" },
    ];
  }

  return [
    { id: "date", name: "Date", type: "date", required: true },
    { id: "name", name: "Name", type: "text", required: true },
    { id: "value", name: "Value", type: "number", required: false },
  ];
}

function makeEmptyRow(columns: ColumnSpec[]): Row {
  const r: Row = {};
  for (const c of columns) r[c.id] = "";
  return r;
}

function loadSaved(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { prompt: "", columns: null, rows: [] };

    const parsed = JSON.parse(raw) as SavedState;

    return {
      prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
      columns: Array.isArray(parsed.columns) ? parsed.columns : null,
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    };
  } catch {
    return { prompt: "", columns: null, rows: [] };
  }
}

export function SchemaBuilder() {
  // Load once on mount
  const saved = useMemo(() => loadSaved(), []);
  const [prompt, setPrompt] = useState(saved.prompt);
  const [columns, setColumns] = useState<ColumnSpec[] | null>(saved.columns);
  const [rows, setRows] = useState<Row[]>(saved.rows);

  const canGenerate = prompt.trim().length >= 8;

  // If schema exists but there are no rows yet, start with one empty row
  useEffect(() => {
    if (columns && rows.length === 0) {
      setRows([makeEmptyRow(columns)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  // Persist any time state changes
  useEffect(() => {
    const payload: SavedState = { prompt, columns, rows };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [prompt, columns, rows]);

  const schemaJson = useMemo(() => {
    if (!columns) return "";
    return JSON.stringify(columns, null, 2);
  }, [columns]);

  function onGenerate() {
    const generated = mockGenerateSchema(prompt);
    setColumns(generated);
    setRows([makeEmptyRow(generated)]);
  }

  function addColumn() {
    const base = "new_column";
    const nextIndex = (columns?.filter((c) => c.id.startsWith(base)).length ?? 0) + 1;
    const id = `${base}_${nextIndex}`;

    const newCol: ColumnSpec = {
      id,
      name: "New Column",
      type: "text",
      required: false,
    };

    setColumns((prev) => (prev ? [...prev, newCol] : [newCol]));

    // Extend existing rows with that new column
    setRows((prevRows) =>
      prevRows.map((r) => ({
        ...r,
        [id]: r[id] ?? "",
      }))
    );
  }

  function updateColumn(idx: number, patch: Partial<ColumnSpec>) {
    setColumns((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const before = next[idx];
      const updated: ColumnSpec = { ...before, ...patch };

      // If name changes and id is generic, auto-rename id
      if (patch.name && updated.id.startsWith("new_column")) {
        updated.id = slugify(patch.name) || updated.id;
      }

      // If type changes away from enum, clear enumValues
      if (patch.type && patch.type !== "enum") {
        delete updated.enumValues;
      }

      next[idx] = updated;
      return next;
    });
  }

  function removeColumn(idx: number) {
    setColumns((prev) => {
      if (!prev) return prev;
      const col = prev[idx];
      const next = prev.filter((_, i) => i !== idx);

      // Remove this key from all rows
      setRows((prevRows) =>
        prevRows.map((r) => {
          const copy = { ...r };
          delete copy[col.id];
          return copy;
        })
      );

      return next;
    });
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    setPrompt("");
    setColumns(null);
    setRows([]);
  }

  return (
    <div className="card">
      <label className="label">Describe your sheet</label>
      <textarea
        className="textarea"
        placeholder="Example: Build a tracker for the investment grade primary market with date, issuer, amount, spread, coupon, and maturity..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
      />

      <div className="row">
        <button className="button" onClick={onGenerate} disabled={!canGenerate}>
          Generate Schema
        </button>

        <button className="button secondary" onClick={addColumn} disabled={!columns}>
          + Add Column
        </button>

        <button className="button secondary" onClick={resetAll} style={{ marginLeft: "auto" }}>
          Reset
        </button>
      </div>

      {columns && (
        <>
          <h2 className="h2">Columns</h2>

          <div className="table">
            <div className="thead">
              <div>Name</div>
              <div>Type</div>
              <div>Required</div>
              <div>Description</div>
              <div></div>
            </div>

            {columns.map((col, idx) => (
              <div className="trow" key={col.id + idx}>
                <input
                  className="input"
                  value={col.name}
                  onChange={(e) => updateColumn(idx, { name: e.target.value })}
                />

                <select
                  className="select"
                  value={col.type}
                  onChange={(e) => updateColumn(idx, { type: e.target.value as ColumnType })}
                >
                  <option value="date">date</option>
                  <option value="text">text</option>
                  <option value="number">number</option>
                  <option value="currency">currency</option>
                  <option value="percent">percent</option>
                  <option value="enum">enum</option>
                </select>

                <input
                  type="checkbox"
                  checked={col.required}
                  onChange={(e) => updateColumn(idx, { required: e.target.checked })}
                />

                <input
                  className="input"
                  value={col.description ?? ""}
                  onChange={(e) => updateColumn(idx, { description: e.target.value })}
                  placeholder="optional"
                />

                <button className="iconButton" onClick={() => removeColumn(idx)} title="Remove">
                  ✕
                </button>

                {col.type === "enum" && (
                  <div className="enumRow">
                    <div className="enumLabel">Enum values</div>
                    <input
                      className="input"
                      value={(col.enumValues ?? []).join(", ")}
                      onChange={(e) =>
                        updateColumn(idx, {
                          enumValues: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="e.g. USD, EUR, GBP"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <h2 className="h2">Schema JSON</h2>
          <pre className="pre">{schemaJson}</pre>

          <DataGrid columns={columns} rows={rows} onChangeRows={setRows} />
        </>
      )}
    </div>
  );
}
