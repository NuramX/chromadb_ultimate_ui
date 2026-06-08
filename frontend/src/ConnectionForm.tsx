import { useState } from "react";
import { api } from "./api";

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
  display: "grid", placeItems: "center",
};
const card: React.CSSProperties = {
  background: "#252526", border: "1px solid #3c3c3c", borderRadius: 8,
  padding: 20, width: 360, display: "grid", gap: 8,
};

export function ConnectionForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: "", host: "localhost", port: 8000, ssl: false,
    tenant: "default_tenant", database: "default_database", token: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true); setErr(null);
    try { await api.createConnection(f); onSaved(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>New connection</h3>
        <label>Name<input value={f.name} onChange={e => set("name", e.target.value)} /></label>
        <div className="row">
          <label style={{ flex: 2 }}>Host<input value={f.host} onChange={e => set("host", e.target.value)} /></label>
          <label style={{ flex: 1 }}>Port<input type="number" value={f.port} onChange={e => set("port", +e.target.value)} /></label>
        </div>
        <label>Token (Bearer)<input type="password" value={f.token} onChange={e => set("token", e.target.value)} /></label>
        <div className="row">
          <label style={{ flex: 1 }}>Tenant<input value={f.tenant} onChange={e => set("tenant", e.target.value)} /></label>
          <label style={{ flex: 1 }}>Database<input value={f.database} onChange={e => set("database", e.target.value)} /></label>
        </div>
        <label className="row"><input type="checkbox" style={{ width: "auto" }}
          checked={f.ssl} onChange={e => set("ssl", e.target.checked)} /> SSL</label>
        {err && <div style={{ color: "#f48771" }}>{err}</div>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button disabled={busy || !f.name} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
