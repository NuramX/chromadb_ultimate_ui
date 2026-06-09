import { useEffect, useState } from "react";
import { api, type Connection, type Where } from "./api";

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center",
};
const card: React.CSSProperties = {
  background: "#252526", border: "1px solid #3c3c3c", borderRadius: 8,
  padding: 20, width: 440, display: "grid", gap: 10,
};

// Dump only the records matching `where` from one collection into a target.
export function FilteredDumpDialog({ conns, sourceConnId, collection, where, onClose, onStarted }:
  { conns: Connection[]; sourceConnId: number; collection: string; where: Where;
    onClose: () => void; onStarted: () => void }) {
  const [targetId, setTargetId] = useState<number>(
    conns.find(c => c.id !== sourceConnId)?.id ?? sourceConnId);
  const [targetColl, setTargetColl] = useState(collection);
  const [matched, setMatched] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Show how many records match before committing.
  useEffect(() => {
    api.queryRecords(sourceConnId, collection, where, 0, 1)
      .then(p => setMatched(p.total)).catch(() => setMatched(null));
  }, [sourceConnId, collection]);

  async function start() {
    setBusy(true); setErr(null);
    try {
      await api.createJob({
        source_connection_id: sourceConnId, target_connection_id: targetId,
        source_collection: collection, target_collection: targetColl || collection, where,
      });
      onStarted();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>Dump filtered — {collection}</h3>
        <div className="muted" style={{ fontSize: 12 }}>
          {matched === null ? "counting matches…" : `${matched} matching records`} ·
          one sequential job, page size from config
        </div>
        <pre style={{ background: "#1e1e1e", border: "1px solid #3c3c3c", borderRadius: 4,
                      padding: 8, margin: 0, fontSize: 11, overflow: "auto" }}>
{JSON.stringify(where, null, 2)}
        </pre>

        <label>Target connection
          <select value={targetId} onChange={e => setTargetId(+e.target.value)}>
            {conns.map(c => <option key={c.id} value={c.id}>{c.name} — {c.host}:{c.port}</option>)}
          </select>
        </label>
        <label>Target collection
          <input value={targetColl} onChange={e => setTargetColl(e.target.value)} />
        </label>

        {err && <div style={{ color: "#f48771" }}>{err}</div>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button disabled={busy || matched === 0} onClick={start}>
            Dump {matched ?? ""} records
          </button>
        </div>
      </div>
    </div>
  );
}
