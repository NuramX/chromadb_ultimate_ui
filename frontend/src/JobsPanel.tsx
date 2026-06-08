import { api, type Connection, type JobStatus } from "./api";

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center",
};
const card: React.CSSProperties = {
  background: "#252526", border: "1px solid #3c3c3c", borderRadius: 8,
  padding: 20, width: 560, maxHeight: "85vh", overflow: "auto", display: "grid", gap: 10,
};

const STATE_COLOR: Record<JobStatus["state"], string> = {
  pending: "#e2c08d", running: "#4fc3f7", paused: "#e2c08d",
  done: "#81c784", error: "#f48771",
};

// Shared Jobs view — shows every dump job (running + history), survives closing
// the migrate dialog. Polling is owned by App; this is presentational + actions.
export function JobsPanel({ jobs, conns, onClose, onChanged }:
  { jobs: JobStatus[]; conns: Connection[]; onClose: () => void; onChanged: () => void }) {

  const act = async (fn: () => Promise<unknown>) => { await fn().catch(() => {}); onChanged(); };
  const finished = jobs.filter(j => j.state === "done" || j.state === "error").length;

  // Resolve connection id -> display label; falls back to #id if deleted.
  const dbName = (id: number) => {
    const c = conns.find(x => x.id === id);
    return c ? c.name : `conn#${id}`;
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div className="row">
          <h3 style={{ flex: 1, margin: 0 }}>Dump jobs</h3>
          {finished > 0 && (
            <button className="ghost" onClick={() => act(api.clearFinishedJobs)}>
              Clear finished ({finished})
            </button>
          )}
          <button className="ghost" onClick={onClose}>Close</button>
        </div>

        {jobs.length === 0 && <p className="muted">No jobs yet.</p>}

        {jobs.map(j => {
          const pct = j.state === "done" ? 100 : j.total ? Math.round((j.processed / j.total) * 100) : 0;
          return (
            <div key={j.id} style={{ borderBottom: "1px solid #333", paddingBottom: 8 }}>
              <div className="row" style={{ margin: 0 }}>
                <span style={{ flex: 1 }}>
                  <span className="muted">#{j.id}</span>{" "}
                  {j.source_collection} <span className="muted">@ {dbName(j.source_conn_id)}</span>
                  {" → "}
                  {j.target_collection} <span className="muted">@ {dbName(j.target_conn_id)}</span>
                </span>
                <span style={{ color: STATE_COLOR[j.state], fontWeight: 500 }}>{j.state}</span>
                <span className="muted">{j.processed}/{j.total} ({pct}%)</span>
              </div>
              <div className="bar"><div style={{ width: pct + "%" }} /></div>
              {j.error && <div style={{ color: "#f48771", fontSize: 12 }}>{j.error}</div>}
              <div className="row" style={{ margin: "4px 0 0", justifyContent: "flex-end" }}>
                {j.state === "running" &&
                  <button className="ghost" onClick={() => act(() => api.pauseJob(j.id))}>Pause</button>}
                {(j.state === "paused" || j.state === "error") &&
                  <button className="ghost" onClick={() => act(() => api.resumeJob(j.id))}>Resume</button>}
                {(j.state !== "running" && j.state !== "pending") &&
                  <button className="ghost" onClick={() => act(() => api.deleteJob(j.id))}>Delete</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
