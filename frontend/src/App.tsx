import { useEffect, useRef, useState } from "react";
import { api, type Connection, type CollectionInfo, type RecordsPage, type JobStatus, type FieldInfo, type Where } from "./api";
import { ConnectionForm } from "./ConnectionForm";
import { MigratePanel } from "./MigratePanel";
import { JobsPanel } from "./JobsPanel";
import { FilterBar } from "./FilterBar";
import { FilteredDumpDialog } from "./FilteredDumpDialog";

// DBeaver-style SVG Icon Components
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="chevron-icon"
      style={{
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease",
        opacity: 0.7,
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function DatabaseIcon({ connected }: { connected: boolean }) {
  return (
    <span className="database-icon-container">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="database-svg"
        style={{ color: connected ? "#4fc3f7" : "#b0bec5" }}
      >
        <ellipse cx="12" cy="5" rx="9" ry="3" fill={connected ? "#0288d1" : "#455a64"} fillOpacity="0.2"/>
        <path d="M3 5V19A9 3 0 0 0 21 19V5" fill={connected ? "#0288d1" : "#455a64"} fillOpacity="0.2"/>
        <path d="M3 12A9 3 0 0 0 21 12"/>
      </svg>
      <span className={`status-badge ${connected ? "connected" : "disconnected"}`} />
    </span>
  );
}

function FolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ffa726"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="folder-svg"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="#ffb74d" fillOpacity="0.2" />
    </svg>
  );
}

function CollectionsIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#81c784"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="collections-svg"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="#81c784" fillOpacity="0.1" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="10" y1="9" x2="10" y2="21" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 4v6h-6" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function JobsIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v4" />
      <path d="M12 12l3 2" />
      <circle cx="12" cy="13" r="8" />
    </svg>
  );
}

// A collection identified by which connection it lives in.
type CollRef = { connId: number; name: string };
const sameRef = (a: CollRef | null, b: CollRef) =>
  !!a && a.connId === b.connId && a.name === b.name;

export function App() {
  const [conns, setConns] = useState<Connection[]>([]);
  // Per-connection browse state — many connections can be open at once.
  const [collsByConn, setCollsByConn] = useState<Record<number, CollectionInfo[]>>({});
  const [connectedIds, setConnectedIds] = useState<Set<number>>(new Set());
  const [connErr, setConnErr] = useState<Record<number, string>>({});
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());

  const [opened, setOpened] = useState<CollRef | null>(null);   // record view target
  const [fields, setFields] = useState<FieldInfo[]>([]);        // metadata fields of opened
  const [appliedWhere, setAppliedWhere] = useState<Where | null>(null);
  const [filteredDump, setFilteredDump] = useState<{ connId: number; collection: string; where: Where } | null>(null);
  // Multi-select for bulk actions, scoped to a single connection at a time.
  const [selConnId, setSelConnId] = useState<number | null>(null);
  const [selNames, setSelNames] = useState<Set<string>>(new Set());
  const [selAnchor, setSelAnchor] = useState<string | null>(null);
  const reqSeq = useRef(0);  // monotonic counter — stale responses are discarded
  const [page, setPage] = useState<RecordsPage | null>(null);
  const [selRows, setSelRows] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [migrateSource, setMigrateSource] = useState<Connection | null>(null);
  const [err, setErr] = useState<string | null>(null);
  type Menu =
    | { kind: "conn"; x: number; y: number; conn: Connection }
    | { kind: "coll"; x: number; y: number; connId: number; name: string };
  const [menu, setMenu] = useState<Menu | null>(null);

  // Global job tracking — polled at App level so progress + history survive
  // closing the migrate dialog.
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [showJobs, setShowJobs] = useState(false);
  const hasActiveJob = jobs.some(j => j.state === "running" || j.state === "pending");
  const activeCount = jobs.filter(j => j.state === "running" || j.state === "pending").length;

  const refreshJobs = () => api.listJobs().then(setJobs).catch(() => {});

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("cui-sidebar-width");
    return saved ? parseInt(saved, 10) : 240;
  });
  const [isDragging, setIsDragging] = useState(false);

  const [filterText, setFilterText] = useState("");
  const [expandedConns, setExpandedConns] = useState<Record<number, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const refresh = () => api.listConnections().then(setConns).catch(e => setErr(e.message));
  useEffect(() => { refresh(); }, []);

  // Poll jobs: fast (1s) when a job is active or the panel is open, slow (5s)
  // otherwise so the badge stays current without hammering the backend.
  useEffect(() => {
    let alive = true;
    const tick = () => { if (alive) refreshJobs(); };
    tick();
    const id = window.setInterval(tick, (showJobs || hasActiveJob) ? 1000 : 5000);
    return () => { alive = false; clearInterval(id); };
  }, [showJobs, hasActiveJob]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(160, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
      localStorage.setItem("cui-sidebar-width", String(newWidth));
    };
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    document.body.classList.add("dragging-active");
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.classList.remove("dragging-active");
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Connect to a DB and load its collections. Does NOT touch other open
  // connections — many can stay connected at once (DBeaver-style).
  async function connectConn(c: Connection) {
    setExpandedConns(prev => ({ ...prev, [c.id]: true }));
    setExpandedFolders(prev => ({ ...prev, [`${c.id}-colls`]: true }));
    setLoadingIds(prev => new Set(prev).add(c.id));
    setConnErr(prev => { const n = { ...prev }; delete n[c.id]; return n; });
    try {
      const list = await api.listCollections(c.id);
      setCollsByConn(prev => ({ ...prev, [c.id]: list }));
      setConnectedIds(prev => new Set(prev).add(c.id));
    } catch (e: any) {
      setConnErr(prev => ({ ...prev, [c.id]: e.message }));
    } finally {
      setLoadingIds(prev => { const n = new Set(prev); n.delete(c.id); return n; });
    }
  }

  // single click — select (highlight) only, no data fetch. Cmd/Ctrl toggles,
  // Shift selects a range. Selection is scoped to one connection.
  function clickColl(e: React.MouseEvent, connId: number, name: string, names: string[]) {
    const multi = e.metaKey || e.ctrlKey;
    const range = e.shiftKey;
    if ((multi || range) && selConnId !== connId) {
      // switching connection mid-select -> start fresh in the new one
      setSelConnId(connId); setSelNames(new Set([name])); setSelAnchor(name);
      return;
    }
    if (multi) {
      setSelConnId(connId);
      setSelNames(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
      setSelAnchor(name);
    } else if (range && selAnchor) {
      const a = names.indexOf(selAnchor), b = names.indexOf(name);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelConnId(connId);
      setSelNames(new Set(names.slice(lo, hi + 1)));
    } else {
      setSelConnId(connId); setSelNames(new Set([name])); setSelAnchor(name);
    }
  }

  const isSelected = (connId: number, name: string) =>
    selConnId === connId && selNames.has(name);

  async function deleteCollections(connId: number, names: string[]) {
    if (!names.length) return;
    const label = names.length === 1 ? `"${names[0]}"` : `${names.length} collections`;
    if (!window.confirm(`Delete ${label}?\nThis erases all their data.`)) return;
    for (const nm of names) {
      try { await api.deleteCollection(connId, nm); }
      catch (e: any) { setErr(e.message); }
    }
    await reloadColls(connId);
    if (opened?.connId === connId && names.includes(opened.name)) { setOpened(null); setPage(null); }
    setSelNames(new Set());
  }

  // Fetch one page of the opened collection with the current filter.
  async function fetchPage(connId: number, name: string, offset: number, where: Where | null) {
    const seq = ++reqSeq.current;
    setErr(null);
    setPage(null);
    try {
      const result = await api.queryRecords(connId, name, where, offset, 50);
      if (seq !== reqSeq.current) return;  // newer request already in flight
      setPage(result);
    } catch (e: any) {
      if (seq !== reqSeq.current) return;
      setErr(e.message);
    }
  }

  // double click — open a collection fresh: clear filter, load fields + page 1.
  async function openColl(connId: number, name: string) {
    setOpened({ connId, name });
    setSelConnId(connId); setSelNames(new Set([name])); setSelAnchor(name);
    setAppliedWhere(null);
    setFields([]);
    setSelRows(new Set());  // clear record row selection when switching collection
    api.getFields(connId, name).then(setFields).catch(() => setFields([]));
    fetchPage(connId, name, 0, null);
  }

  function applyFilter(where: Where | null) {
    if (!opened) return;
    setAppliedWhere(where);
    fetchPage(opened.connId, opened.name, 0, where);
  }

  const toggleConn = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedConns(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFolder = (folderKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(prev => ({ ...prev, [folderKey]: !prev[folderKey] }));
  };

  // Clicking a connection row connects it (loads collections) if not already.
  const handleConnRowClick = (c: Connection) => {
    if (!connectedIds.has(c.id)) connectConn(c);
    else setExpandedConns(prev => ({ ...prev, [c.id]: true }));
  };

  async function openMigrate(c: Connection) {
    if (!connectedIds.has(c.id)) await connectConn(c);
    setMigrateSource(c);
  }

  // Reload collection list for one connection (after create/rename/delete).
  async function reloadColls(id: number) {
    try {
      const list = await api.listCollections(id);
      setCollsByConn(prev => ({ ...prev, [id]: list }));
    } catch (e: any) { setErr(e.message); }
  }

  async function renameConn(c: Connection) {
    const name = window.prompt("Rename connection:", c.name);
    if (!name || name === c.name) return;
    try { await api.updateConnection(c.id, { ...c, name, token: "" }); refresh(); }
    catch (e: any) { setErr(e.message); }
  }

  async function createCollection(c: Connection) {
    const name = window.prompt("New collection name:");
    if (!name) return;
    try { await api.createCollection(c.id, name); await reloadColls(c.id); }
    catch (e: any) { setErr(e.message); }
  }

  async function renameCollection(connId: number, name: string) {
    const next = window.prompt("Rename collection:", name);
    if (!next || next === name) return;
    try {
      await api.renameCollection(connId, name, next);
      await reloadColls(connId);
      if (opened?.connId === connId && opened.name === name) setOpened({ connId, name: next });
    } catch (e: any) { setErr(e.message); }
  }

  // Close the open connection without deleting its saved config.
  function disconnectConn(id: number) {
    setConnectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setCollsByConn(prev => { const n = { ...prev }; delete n[id]; return n; });
    setConnErr(prev => { const n = { ...prev }; delete n[id]; return n; });
    setExpandedConns(prev => ({ ...prev, [id]: false }));
    if (opened?.connId === id) { setOpened(null); setPage(null); }
    if (selConnId === id) { setSelNames(new Set()); setSelConnId(null); }
  }

  // Permanently remove the saved connection.
  async function deleteConn(c: Connection) {
    if (!window.confirm(`Delete connection "${c.name}"?\nThis removes the saved host/token.`)) return;
    try { await api.deleteConnection(c.id); }
    catch (e: any) { setErr(e.message); return; }
    disconnectConn(c.id);
    refresh();
  }

  // Close the right-click menu on any outside click. Registered on the next
  // tick so the very gesture that opened the menu doesn't immediately close it.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const t = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("contextmenu", close);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [menu]);

  const filteredConns = conns.filter(c =>
    c.name.toLowerCase().includes(filterText.toLowerCase()) ||
    `${c.host}:${c.port}`.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div className="layout" style={{ gridTemplateColumns: `${sidebarWidth}px 4px 1fr` }}>
      <aside className="sidebar">
        {/* DBeaver-style Toolbar */}
        <div className="sidebar-toolbar">
          <div className="search-box">
            <span className="search-icon"><SearchIcon /></span>
            <input
              type="text"
              placeholder="Filter connections by name"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="toolbar-actions">
            <button
              onClick={() => setShowJobs(true)}
              title="Dump jobs"
              className="icon-button"
              style={{ position: "relative" }}
            >
              <JobsIcon />
              {activeCount > 0 && <span className="jobs-badge">{activeCount}</span>}
            </button>
            <button
              onClick={() => setAdding(true)}
              title="New Connection"
              className="icon-button"
            >
              <PlusIcon />
            </button>
            <button
              onClick={refresh}
              title="Refresh Connections"
              className="icon-button"
            >
              <RefreshIcon />
            </button>
          </div>
        </div>

        {/* Tree Container */}
        <div className="tree-container">
          {filteredConns.map(c => {
            const isConnected = connectedIds.has(c.id);
            const isLoading = loadingIds.has(c.id);
            const loadErr = connErr[c.id];
            const isConnExpanded = !!expandedConns[c.id];
            const collsFolderKey = `${c.id}-colls`;
            const isFolderExpanded = !!expandedFolders[collsFolderKey];
            const collList = collsByConn[c.id] ?? [];

            return (
              <div key={c.id} className="tree-node-group">
                {/* Connection Row */}
                <div
                  className={`tree-row conn-row ${isConnected ? "active" : ""}`}
                  onClick={() => handleConnRowClick(c)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenu({ kind: "conn", x: e.clientX, y: e.clientY, conn: c });
                  }}
                >
                  <span
                    className="caret-container"
                    onClick={(e) => toggleConn(c.id, e)}
                  >
                    <ChevronIcon expanded={isConnExpanded} />
                  </span>
                  <DatabaseIcon connected={isConnected} />
                  <span className="node-text">
                    <span className="conn-name">{c.name}</span>
                    <span className="conn-detail">
                      {c.host}:{c.port}{isLoading ? " · connecting…" : ""}
                    </span>
                  </span>
                </div>

                {/* Connection Children (Folders) */}
                {isConnExpanded && (
                  <div className="tree-children">
                    {/* Collections Folder */}
                    <div
                      className="tree-row folder-row"
                      onClick={(e) => toggleFolder(collsFolderKey, e)}
                    >
                      <span className="caret-container">
                        <ChevronIcon expanded={isFolderExpanded} />
                      </span>
                      <FolderIcon />
                      <span className="node-text">Collections</span>
                      {isConnected && (
                        <>
                          <button
                            className="ghost mini-action-btn"
                            onClick={(e) => { e.stopPropagation(); createCollection(c); }}
                            title="New collection"
                          >
                            +
                          </button>
                          <button
                            className="ghost mini-action-btn"
                            onClick={(e) => { e.stopPropagation(); openMigrate(c); }}
                            title="Copy Collections"
                          >
                            Copy
                          </button>
                        </>
                      )}
                    </div>

                    {/* Collections Folder Children (Collections List) */}
                    {isFolderExpanded && (
                      <div className="tree-children folder-children">
                        {loadErr ? (
                          <div className="tree-row empty-row" onClick={() => connectConn(c)}>
                            <span className="caret-spacer" />
                            <span className="node-text link-style" style={{ color: "#f48771" }}>
                              ⚠ {loadErr} — retry
                            </span>
                          </div>
                        ) : isConnected ? (
                          collList.length > 0 ? (
                            collList.map(collection => {
                              const ref = { connId: c.id, name: collection.name };
                              return (
                                <div
                                  key={collection.id}
                                  className={`tree-row collection-row ${
                                    sameRef(opened, ref) ? "selected" :
                                    isSelected(c.id, collection.name) ? "highlighted" : ""
                                  }`}
                                  onClick={(e) => clickColl(e, c.id, collection.name, collList.map(x => x.name))}
                                  onDoubleClick={() => openColl(c.id, collection.name)}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    // right-clicking outside the current selection selects just this one
                                    if (!isSelected(c.id, collection.name)) {
                                      setSelConnId(c.id); setSelNames(new Set([collection.name])); setSelAnchor(collection.name);
                                    }
                                    setMenu({ kind: "coll", x: e.clientX, y: e.clientY, connId: c.id, name: collection.name });
                                  }}
                                  title="Double-click to open · Cmd/Shift-click to multi-select · right-click for actions"
                                >
                                  <span className="caret-spacer" />
                                  <CollectionsIcon />
                                  <span className="node-text collection-text">
                                    <span className="collection-name">{collection.name}</span>
                                    <span className="collection-detail">
                                      ({collection.count}{collection.dimension ? `, d=${collection.dimension}` : ""})
                                    </span>
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            <div className="tree-row empty-row">
                              <span className="caret-spacer" />
                              <span className="node-text muted italic">No collections</span>
                            </div>
                          )
                        ) : (
                          <div className="tree-row empty-row" onClick={() => connectConn(c)}>
                            <span className="caret-spacer" />
                            <span className="node-text muted italic link-style">
                              {isLoading ? "Connecting…" : "Click to connect and load"}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <div
        className={`resizer ${isDragging ? "dragging" : ""}`}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
      />

      <main className="main">
        {err && <div style={{ color: "#f48771", marginBottom: 8 }}>⚠ {err}</div>}
        {!opened && connectedIds.size === 0 &&
          <p className="muted">Pick or add a connection.</p>}
        {!opened && connectedIds.size > 0 &&
          <p className="muted">Double-click a collection to browse its records.</p>}
        {opened && (
          <>
            <FilterBar
              fields={fields}
              active={!!appliedWhere}
              onApply={applyFilter}
              onDumpFiltered={(w) => setFilteredDump({ connId: opened.connId, collection: opened.name, where: w })}
            />
            {page && (
              <RecordTable
                name={opened.name}
                conn={conns.find(c => c.id === opened.connId)?.name ?? `#${opened.connId}`}
                connId={opened.connId}
                page={page}
                filtered={!!appliedWhere}
                selRows={selRows}
                onSelRows={setSelRows}
                onPage={(off) => fetchPage(opened.connId, opened.name, off, appliedWhere)}
                onDelete={async (ids) => {
                  await api.deleteRecords(opened.connId, opened.name, ids);
                  setSelRows(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
                  fetchPage(opened.connId, opened.name, page.offset, appliedWhere);
                  reloadColls(opened.connId);
                }}
              />
            )}
          </>
        )}
      </main>

      {adding && <ConnectionForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} />}
      {migrateSource && (
        <MigratePanel conns={conns} source={migrateSource}
                      collections={collsByConn[migrateSource.id] ?? []}
                      onClose={() => setMigrateSource(null)} />
      )}
      {showJobs && (
        <JobsPanel jobs={jobs} conns={conns} onClose={() => setShowJobs(false)} onChanged={refreshJobs} />
      )}
      {filteredDump && (
        <FilteredDumpDialog
          conns={conns}
          sourceConnId={filteredDump.connId}
          collection={filteredDump.collection}
          where={filteredDump.where}
          onClose={() => setFilteredDump(null)}
          onStarted={() => { setFilteredDump(null); setShowJobs(true); refreshJobs(); }}
        />
      )}

      {menu?.kind === "conn" && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}
             onClick={(e) => e.stopPropagation()}>
          {connectedIds.has(menu.conn.id) ? (
            <>
              <div className="ctx-item" onClick={() => { disconnectConn(menu.conn.id); setMenu(null); }}>
                Disconnect
              </div>
              <div className="ctx-item" onClick={() => { connectConn(menu.conn); setMenu(null); }}>
                Refresh collections
              </div>
              <div className="ctx-item" onClick={() => { setMenu(null); createCollection(menu.conn); }}>
                New collection…
              </div>
            </>
          ) : (
            <div className="ctx-item" onClick={() => { connectConn(menu.conn); setMenu(null); }}>
              Connect
            </div>
          )}
          <div className="ctx-item" onClick={() => { openMigrate(menu.conn); setMenu(null); }}>
            Copy collections…
          </div>
          <div className="ctx-item" onClick={() => { setMenu(null); renameConn(menu.conn); }}>
            Rename connection…
          </div>
          <div className="ctx-sep" />
          <div className="ctx-item danger" onClick={() => { setMenu(null); deleteConn(menu.conn); }}>
            Delete connection
          </div>
        </div>
      )}

      {menu?.kind === "coll" && (() => {
        const m = menu;
        const bulk = selConnId === m.connId && selNames.has(m.name) && selNames.size > 1;
        const names = bulk ? [...selNames] : [m.name];
        return (
          <div className="ctx-menu" style={{ left: m.x, top: m.y }}
               onClick={(e) => e.stopPropagation()}>
            {!bulk && (
              <>
                <div className="ctx-item" onClick={() => { setMenu(null); openColl(m.connId, m.name); }}>
                  Open
                </div>
                <div className="ctx-item" onClick={() => { setMenu(null); renameCollection(m.connId, m.name); }}>
                  Rename collection…
                </div>
                <div className="ctx-sep" />
              </>
            )}
            <div className="ctx-item danger" onClick={() => { setMenu(null); deleteCollections(m.connId, names); }}>
              {bulk ? `Delete ${names.length} collections` : "Delete collection"}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Stringify metadata with keys in a stable (alphabetical) order so every row
// shows its fields in the same sequence, regardless of insertion order.
function metaJson(meta: Record<string, unknown> | null, indent?: number): string {
  if (!meta) return "";
  const keys = Object.keys(meta).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = meta[k];
  return JSON.stringify(ordered, null, indent);
}

function RecordTable({ name, conn, connId, page, filtered, selRows, onSelRows, onPage, onDelete }:
  { name: string; conn: string; connId: number; page: RecordsPage; filtered: boolean;
    selRows: Set<string>; onSelRows: (s: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    onPage: (off: number) => void; onDelete: (ids: string[]) => Promise<void> }) {
  const { offset, limit, total } = page;
  const [detail, setDetail] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const toggleRow = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    e.stopPropagation();
    onSelRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    // "select all" on this page merges into the global selection; uncheck clears only this page's IDs.
    if (e.target.checked) {
      onSelRows(prev => { const n = new Set(prev); page.ids.forEach(id => n.add(id)); return n; });
    } else {
      onSelRows(prev => { const n = new Set(prev); page.ids.forEach(id => n.delete(id)); return n; });
    }
  };

  const handleDelete = async (ids: string[]) => {
    const label = ids.length === 1 ? `record "${ids[0]}"` : `${ids.length} records`;
    if (!window.confirm(`Delete ${label}?\nThis cannot be undone.`)) return;
    setDeleting(true);
    try { await onDelete(ids); setDetail(null); }
    finally { setDeleting(false); }
  };

  // "all checked" = every ID on THIS page is selected (cross-page sel may have more).
  const allChecked = page.ids.length > 0 && page.ids.every(id => selRows.has(id));
  const someChecked = selRows.size > 0;

  return (
    <>
      <div className="row">
        <h3 style={{ flex: 1, margin: 0 }}>{name} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>@ {conn}</span></h3>
        {someChecked && (
          <button className="ghost" style={{ color: "#f48771" }} disabled={deleting}
                  onClick={() => handleDelete([...selRows])}>
            Delete {selRows.size} record{selRows.size > 1 ? "s" : ""}
          </button>
        )}
        <span className="muted">{total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, total)} / {total}{filtered ? " matched" : ""}</span>
        <button className="ghost" disabled={offset === 0}
                onClick={() => onPage(Math.max(0, offset - limit))}>◀</button>
        <button className="ghost" disabled={offset + limit >= total}
                onClick={() => onPage(offset + limit)}>▶</button>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 28 }}>
              <input type="checkbox" style={{ width: "auto" }}
                     checked={allChecked} onChange={toggleAll} />
            </th>
            <th>id</th><th>document</th><th>metadata</th><th>embedding</th>
          </tr>
        </thead>
        <tbody>
          {page.ids.map((id, i) => (
            <tr key={id} onClick={() => setDetail(i)} style={{ cursor: "pointer" }}
                title="Click to view full record"
                className={selRows.has(id) ? "highlighted" : ""}>
              <td onClick={e => e.stopPropagation()}>
                <input type="checkbox" style={{ width: "auto" }}
                       checked={selRows.has(id)}
                       onChange={e => toggleRow(e, id)} />
              </td>
              <td>{id}</td>
              <td title={page.documents[i] ?? ""}>{page.documents[i]}</td>
              <td>{metaJson(page.metadatas[i])}</td>
              <td className="muted">{page.embeddings_preview[i]
                ? `[${page.embeddings_preview[i]!.map(n => n.toFixed(3)).join(", ")}…]` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {detail !== null && (
        <RecordDetail
          id={page.ids[detail]}
          document={page.documents[detail]}
          metadata={page.metadatas[detail]}
          embeddingPreview={page.embeddings_preview[detail]}
          connId={connId}
          collName={name}
          onClose={() => setDetail(null)}
          onDelete={() => handleDelete([page.ids[detail]])}
        />
      )}
    </>
  );
}

function RecordDetail({ id, document, metadata, embeddingPreview, connId, collName, onClose, onDelete }:
  { id: string; document: string | null; metadata: Record<string, unknown> | null;
    embeddingPreview: number[] | null; connId: number; collName: string;
    onClose: () => void; onDelete: () => void }) {
  const [fullEmb, setFullEmb] = useState<number[] | null | "loading">("loading");
  useEffect(() => {
    api.getRecord(connId, collName, id)
      .then(r => setFullEmb(r.embedding))
      .catch(() => setFullEmb(embeddingPreview));  // fallback to preview on error
  }, [id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center",
  };
  const card: React.CSSProperties = {
    background: "#252526", border: "1px solid #3c3c3c", borderRadius: 8,
    padding: 20, width: 640, maxHeight: "85vh", overflow: "auto", display: "grid", gap: 12,
  };
  const box: React.CSSProperties = {
    background: "#1e1e1e", border: "1px solid #3c3c3c", borderRadius: 4,
    padding: 10, margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word",
    maxHeight: 280, overflow: "auto",
  };
  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div className="row" style={{ margin: 0 }}>
          <h3 style={{ flex: 1, margin: 0 }}>Record</h3>
          <button className="ghost" style={{ color: "#f48771" }} onClick={onDelete}>Delete</button>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>

        <div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>id</div>
          <pre style={box}>{id}</pre>
        </div>

        <div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>document</div>
          <pre style={box}>{document ?? <span className="muted">(none)</span>}</pre>
        </div>

        <div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>metadata</div>
          <pre style={box}>{metadata ? metaJson(metadata, 2) : <span className="muted">(none)</span>}</pre>
        </div>

        <div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
            embedding{fullEmb !== "loading" && fullEmb ? ` (${fullEmb.length} dims)` : ""}
          </div>
          <pre style={box}>
            {fullEmb === "loading"
              ? <span className="muted">loading…</span>
              : fullEmb
                ? `[${fullEmb.map(n => n.toFixed(6)).join(",\n ")}]`
                : <span className="muted">(none)</span>}
          </pre>
        </div>
      </div>
    </div>
  );
}
