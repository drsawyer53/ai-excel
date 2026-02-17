export type ColumnType =
  | "untyped"
  | "date"
  | "text"
  | "number"
  | "currency"
  | "percent"
  | "enum"
  | "computed";

export type ComputedKind = "divide" | "subtract" | "date_diff_years";

export type ComputedSpec = {
  kind: ComputedKind;
  inputs: string[]; // column IDs
};

export type DateFormat = "iso" | "mdy";

export type ColumnFormat = {
  decimals?: number;      // for number/currency/percent/computed
  dateFormat?: DateFormat; // for date
};

export type ColumnDef = {
  id: string;
  name: string;
  type: ColumnType;
  required: boolean;
  description: string;
  enumValues: string[];
  computed?: ComputedSpec;
  format?: ColumnFormat;
};

function kindLabel(k: ComputedKind) {
  switch (k) {
    case "divide":
      return "Divide (A / B)";
    case "subtract":
      return "Subtract (A - B)";
    case "date_diff_years":
      return "Date diff in years (end - start)";
    default:
      return k;
  }
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function ColumnPanel({
  column,
  columnIndex,
  allColumns,
  onClose,
  onUpdate,
}: {
  column: ColumnDef | null;
  columnIndex: number | null;
  allColumns: ColumnDef[];
  onClose: () => void;
  onUpdate: (patch: Partial<ColumnDef>) => void;
}) {
  if (!column || columnIndex === null) {
    return (
      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">Column</div>
        </div>
        <div className="panelBody">
          <div className="panelEmpty">Click a column header (A, B, C…) to describe it.</div>
        </div>
      </div>
    );
  }

  const otherColumns = allColumns.filter((c) => c.id !== column.id);

  const computed = column.computed ?? { kind: "divide" as ComputedKind, inputs: ["", ""] };
  const inputA = computed.inputs?.[0] ?? "";
  const inputB = computed.inputs?.[1] ?? "";

  const fmt = column.format ?? {};
  const decimals =
    typeof fmt.decimals === "number" ? fmt.decimals : (column.type === "currency" || column.type === "percent" ? 2 : 4);
  const dateFormat: DateFormat = (fmt.dateFormat as DateFormat) ?? "iso";

  const showDecimals = ["number", "currency", "percent", "computed"].includes(column.type);
  const showDateFormat = column.type === "date";

  return (
    <div className="panel">
      <div className="panelHeader">
        <div className="panelTitle">Column {columnIndex + 1}</div>
        <button className="iconButton" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div className="panelBody">
        <label className="label">Name</label>
        <input
          className="input"
          value={column.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="e.g., Pricing Date"
        />

        <div style={{ height: 12 }} />

        <label className="label">Type</label>
        <select
          className="select"
          value={column.type}
          onChange={(e) => {
            const nextType = e.target.value as ColumnType;

            // If switching to computed, initialize computed spec
            if (nextType === "computed") {
              onUpdate({
                type: nextType,
                required: false,
                enumValues: [],
                computed: column.computed ?? { kind: "divide", inputs: ["", ""] },
                format: column.format ?? { decimals: 4 },
              });
              return;
            }

            // If switching to date, ensure dateFormat exists
            if (nextType === "date") {
              onUpdate({
                type: nextType,
                computed: undefined,
                enumValues: [],
                format: { ...(column.format ?? {}), dateFormat: (column.format?.dateFormat ?? "iso") as DateFormat },
              });
              return;
            }

            // If switching to number/currency/percent, ensure decimals exists
            if (nextType === "number" || nextType === "currency" || nextType === "percent") {
              const defaultDec = nextType === "number" ? 2 : 2;
              onUpdate({
                type: nextType,
                computed: undefined,
                enumValues: nextType === "enum" ? column.enumValues : [],
                format: { ...(column.format ?? {}), decimals: column.format?.decimals ?? defaultDec },
              });
              return;
            }

            // Enum: keep enum values
            if (nextType === "enum") {
              onUpdate({ type: nextType, computed: undefined });
              return;
            }

            // Everything else
            onUpdate({
              type: nextType,
              computed: undefined,
              enumValues: [],
            });
          }}
        >
          <option value="untyped">untyped</option>
          <option value="text">text</option>
          <option value="number">number</option>
          <option value="date">date</option>
          <option value="currency">currency</option>
          <option value="percent">percent</option>
          <option value="enum">enum</option>
          <option value="computed">computed</option>
        </select>

        <div style={{ height: 12 }} />

        <label className="label">Description</label>
        <textarea
          className="textarea"
          rows={3}
          value={column.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Describe what goes in this column so the AI never has to guess."
        />

        <div style={{ height: 12 }} />

        <label className="label" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={column.required}
            disabled={column.type === "computed"}
            onChange={(e) => onUpdate({ required: e.target.checked })}
          />
          Required {column.type === "computed" ? "(computed columns are derived)" : ""}
        </label>

        {column.type === "enum" && (
          <>
            <div style={{ height: 12 }} />
            <label className="label">Enum values</label>
            <input
              className="input"
              value={(column.enumValues ?? []).join(", ")}
              onChange={(e) =>
                onUpdate({
                  enumValues: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="USD, EUR, GBP"
            />
          </>
        )}

        {/* ---- Formatting ---- */}
        {(showDecimals || showDateFormat) && (
          <>
            <div style={{ height: 14 }} />
            <div className="panelDivider" />
            <div style={{ height: 14 }} />

            <div style={{ fontWeight: 800, marginBottom: 10 }}>Formatting</div>

            {showDecimals && (
              <>
                <label className="label">Decimals</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={8}
                  value={decimals}
                  onChange={(e) => {
                    const n = clampInt(Number(e.target.value), 0, 8);
                    onUpdate({ format: { ...(column.format ?? {}), decimals: n } });
                  }}
                />
                <div style={{ height: 10 }} />
              </>
            )}

            {showDateFormat && (
              <>
                <label className="label">Date display</label>
                <select
                  className="select"
                  value={dateFormat}
                  onChange={(e) =>
                    onUpdate({ format: { ...(column.format ?? {}), dateFormat: e.target.value as DateFormat } })
                  }
                >
                  <option value="iso">YYYY-MM-DD</option>
                  <option value="mdy">M/D/YYYY</option>
                </select>
              </>
            )}
          </>
        )}

        {/* ---- Computed config ---- */}
        {column.type === "computed" && (
          <>
            <div style={{ height: 14 }} />
            <div className="panelDivider" />
            <div style={{ height: 14 }} />

            <div style={{ fontWeight: 800, marginBottom: 10 }}>Computed config</div>

            <label className="label">Operation</label>
            <select
              className="select"
              value={computed.kind}
              onChange={(e) => {
                const kind = e.target.value as ComputedKind;
                onUpdate({
                  computed: {
                    kind,
                    inputs: ["", ""],
                  },
                });
              }}
            >
              <option value="divide">{kindLabel("divide")}</option>
              <option value="subtract">{kindLabel("subtract")}</option>
              <option value="date_diff_years">{kindLabel("date_diff_years")}</option>
            </select>

            <div style={{ height: 12 }} />

            <label className="label">{computed.kind === "date_diff_years" ? "Start date column" : "A (left) column"}</label>
            <select
              className="select"
              value={inputA}
              onChange={(e) => {
                const a = e.target.value;
                onUpdate({
                  computed: {
                    ...computed,
                    inputs: [a, inputB],
                  },
                });
              }}
            >
              <option value="">— select a column —</option>
              {otherColumns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.id} ({c.type})
                </option>
              ))}
            </select>

            <div style={{ height: 12 }} />

            <label className="label">{computed.kind === "date_diff_years" ? "End date column" : "B (right) column"}</label>
            <select
              className="select"
              value={inputB}
              onChange={(e) => {
                const b = e.target.value;
                onUpdate({
                  computed: {
                    ...computed,
                    inputs: [inputA, b],
                  },
                });
              }}
            >
              <option value="">— select a column —</option>
              {otherColumns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.id} ({c.type})
                </option>
              ))}
            </select>

            <div style={{ height: 10 }} />

            <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.35 }}>
              This column is read-only in the grid. Values update automatically when inputs change.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
