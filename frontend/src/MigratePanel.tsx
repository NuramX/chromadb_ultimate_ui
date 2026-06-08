import { useEffect, useRef, useState } from "react";
import { api, type Connection, type CollectionInfo, type JobStatus } from "./api";

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center",
};
const card: React.CSSProperties = {
  background: "#252526", border: "1px solid #3c3c3c", borderRadius: 8,
  padding: 20, width: 460, maxHeight: "90vh", overflow: "auto", display: "grid", gap: 10,
};

export function MigratePanel({ conns, source, collections, onClose }:
  { conns: Connection[]; source: Connection; collections: CollectionInfo[]; onClose: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [targetId, setTargetId] = useState<number>(conns.find(c => c.id !== source.id)?.id ?? source.id);
  const [batch, setBatch] = useState<string>("");   // blank = use server config default
  const [jobIds, setJobIds] = useState<number[]>([]);
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const poll = useRef<number>();

  const toggle = (name: string) => setPicked(p => {
    const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n;
  });

  async function startBatch() {
    setErr(null);
    const body: Record<string, unknown> = {
      source_connection_id: source.id,
      target_connection_id: targetId,
      source_collections: [...picked],
    };
    if (batch.trim()) body.batch_size = Number(batch);   // else backend uses config default
    try {
      const created = await api.createBatch(body);
      setJobIds(created.map(j => j.id));
      setJobs(created);
    } catch (e: any) { setErr(e.message); }
  }

  // Poll all jobs in this batch until every one is done/errored.
  useEffect(() => {
    if (!jobIds.length) return;
    const tick = async () => {
      try {
        const all = await api.listJobs();
        const mine = all.filter(j => jobIds.includes(j.id));
        setJobs(mine);
        if (mine.every(j => j.state === "done" || j.state === "error")) {
          clearInterval(poll.current);
        }
      } catch { /* ignore transient */ }
    };
    poll.current = window.setInterval(tick, 700);
    tick();
    return () => clearInterval(poll.current);
  }, [jobIds.join(",")]);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>Copy collections — {source.name}</h3>
        <div className="muted" style={{ fontSize: 12 }}>
          Runs one collection at a time (sequential). Page size from server config
          {batch.trim() ? ` — overridden to ${batch}` : " (CUI_BATCH)"}.
        </div>

        {jobIds.length === 0 && (
          <>
            <div>
              <div className="row"><strong style={{ flex: 1 }}>Source collections</strong>
                <button className="ghost" onClick={() => setPicked(
                  picked.size === collections.length ? new Set() : new Set(collections.map(c => c.name)))}>
                  {picked.size === collections.length ? "none" : "all"}
                </button></div>
              <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid #3c3c3c", borderRadius: 4, padding: 4 }}>
                {collections.map(c => (
                  <label key={c.id} className="row" style={{ margin: 0, padding: "2px 4px" }}>
                    <input type="checkbox" style={{ width: "auto" }}
                      checked={picked.has(c.name)} onChange={() => toggle(c.name)} />
                    <span style={{ flex: 1 }}>{c.name}</span>
                    <span className="muted">{c.count}{c.dimension ? `, d=${c.dimension}` : ""}</span>
                  </label>
                ))}
              </div>
            </div>

            <label>Target connection
              <select value={targetId} onChange={e => setTargetId(+e.target.value)}>
                {conns.map(c => <option key={c.id} value={c.id}>{c.name} — {c.host}:{c.port}</option>)}
              </select>
            </label>
            <label>Page size override <span className="muted">(blank = config default)</span>
              <input type="number" value={batch} placeholder="config" onChange={e => setBatch(e.target.value)} />
            </label>
          </>
        )}

        {jobs.length > 0 && (
          <div style={{ display: "grid", gap: 6 }}>
            <strong>Queue ({jobs.filter(j => j.state === "done").length}/{jobs.length} done)</strong>
            {jobs.map(j => {
              const pct = j.state === "done" ? 100 : j.total ? Math.round((j.processed / j.total) * 100) : 0;
              return (
                <div key={j.id}>
                  <div className="row" style={{ margin: 0 }}>
                    <span style={{ flex: 1 }}>{j.source_collection}</span>
                    <span className="muted">{j.state} · {j.processed}/{j.total}</span>
                    {(j.state === "paused" || j.state === "error") &&
                      <button className="ghost" onClick={() => api.resumeJob(j.id)}>resume</button>}
                    {j.state === "running" &&
                      <button className="ghost" onClick={() => api.pauseJob(j.id)}>pause</button>}
                  </div>
                  <div className="bar"><div style={{ width: pct + "%" }} /></div>
                  {j.error && <div style={{ color: "#f48771", fontSize: 12 }}>{j.error}</div>}
                </div>
              );
            })}
          </div>
        )}

        {err && <div style={{ color: "#f48771" }}>{err}</div>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="ghost" onClick={onClose}>Close</button>
          {jobIds.length === 0 &&
            <button disabled={!picked.size} onClick={startBatch}>
              Dump {picked.size || ""} collection{picked.size === 1 ? "" : "s"}
            </button>}
        </div>
      </div>
    </div>
  );
}
