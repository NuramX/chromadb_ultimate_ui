import { useState } from "react";
import type { Where } from "./api";

type FType = "str" | "int" | "float" | "bool";

const OPS: Record<FType, { op: string; label: string }[]> = {
  str: [
    { op: "$eq", label: "=" }, { op: "$ne", label: "≠" },
    { op: "$in", label: "in" }, { op: "$nin", label: "not in" },
  ],
  bool: [{ op: "$eq", label: "=" }, { op: "$ne", label: "≠" }],
  int: [
    { op: "$eq", label: "=" }, { op: "$ne", label: "≠" },
    { op: "$gt", label: ">" }, { op: "$gte", label: "≥" },
    { op: "$lt", label: "<" }, { op: "$lte", label: "≤" },
    { op: "$in", label: "in" }, { op: "$nin", label: "not in" },
  ],
  float: [
    { op: "$eq", label: "=" }, { op: "$ne", label: "≠" },
    { op: "$gt", label: ">" }, { op: "$gte", label: "≥" },
    { op: "$lt", label: "<" }, { op: "$lte", label: "≤" },
  ],
};

const TYPES: FType[] = ["str", "int", "float", "bool"];

interface Cond { field: string; type: FType; op: string; value: string; }

function coerce(type: FType, op: string, raw: string): unknown {
  const one = (s: string): unknown => {
    s = s.trim();
    if (type === "int") return parseInt(s, 10);
    if (type === "float") return parseFloat(s);
    if (type === "bool") return s === "true" || s === "1";
    return s;
  };
  if (op === "$in" || op === "$nin") return raw.split(",").map(one);
  return one(raw);
}

function buildWhere(conds: Cond[]): Where | null {
  const valid = conds.filter(c => c.field.trim() && c.value.trim() !== "");
  if (!valid.length) return null;
  const clauses = valid.map(c => ({ [c.field.trim()]: { [c.op]: coerce(c.type, c.op, c.value) } }));
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

export function FilterBar({ onApply, onDumpFiltered, active }:
  { onApply: (w: Where | null) => void;
    onDumpFiltered: (w: Where) => void; active: boolean }) {
  const [conds, setConds] = useState<Cond[]>([]);

  const addRow = () => setConds(c => [...c, { field: "", type: "str", op: OPS.str[0].op, value: "" }]);
  const setRow = (i: number, patch: Partial<Cond>) =>
    setConds(c => c.map((r, j) => j === i ? { ...r, ...patch } : r));
  const delRow = (i: number) => setConds(c => c.filter((_, j) => j !== i));

  const where = buildWhere(conds);

  return (
    <div style={{ marginBottom: 10, padding: 8, border: "1px solid #3c3c3c", borderRadius: 6 }}>
      <div className="row" style={{ margin: 0, marginBottom: conds.length ? 8 : 0 }}>
        <strong style={{ flex: 1, fontSize: 12 }}>
          Filter (metadata) {active && <span style={{ color: "#4fc3f7" }}>● active</span>}
        </strong>
        <button className="ghost" onClick={addRow}>+ condition</button>
      </div>

      {conds.map((c, i) => (
        <div key={i} className="row" style={{ margin: "0 0 6px" }}>
          <input style={{ flex: 2 }} value={c.field} placeholder="field name"
            onChange={e => setRow(i, { field: e.target.value })} />
          <select style={{ flex: 1 }} value={c.type}
            onChange={e => { const t = e.target.value as FType; setRow(i, { type: t, op: OPS[t][0].op }); }}>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select style={{ flex: 1 }} value={c.op} onChange={e => setRow(i, { op: e.target.value })}>
            {OPS[c.type].map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
          </select>
          <input style={{ flex: 2 }} value={c.value}
            placeholder={c.op === "$in" || c.op === "$nin" ? "a, b, c" : "value"}
            onChange={e => setRow(i, { value: e.target.value })} />
          <button className="ghost" onClick={() => delRow(i)}>✕</button>
        </div>
      ))}

      {conds.length > 0 && (
        <div className="row" style={{ margin: 0, justifyContent: "flex-end" }}>
          <span className="muted" style={{ flex: 1, fontSize: 11 }}>
            {conds.length > 1 ? "all conditions (AND)" : ""}
          </span>
          <button className="ghost" onClick={() => { setConds([]); onApply(null); }}>Clear</button>
          <button className="ghost" disabled={!where} onClick={() => where && onDumpFiltered(where)}>Dump filtered…</button>
          <button disabled={!where} onClick={() => onApply(where)}>Apply</button>
        </div>
      )}
    </div>
  );
}
