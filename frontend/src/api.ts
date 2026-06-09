// Typed client for the FastAPI backend.
const BASE = import.meta.env.VITE_API ?? "http://localhost:8080";

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? r.statusText);
  return r.json() as Promise<T>;
}

export interface Connection {
  id: number; name: string; host: string; port: number;
  ssl: boolean; tenant: string; database: string; has_token: boolean;
}
export interface CollectionInfo {
  name: string; id: string; count: number;
  metadata: Record<string, unknown> | null; dimension: number | null;
}
export interface FieldInfo { name: string; type: "str" | "int" | "float" | "bool"; }
export type Where = Record<string, unknown>;

export interface RecordsPage {
  ids: string[]; documents: (string | null)[];
  metadatas: (Record<string, unknown> | null)[];
  embeddings_preview: (number[] | null)[];
  offset: number; limit: number; total: number;
}
export interface JobStatus {
  id: number; state: "pending" | "running" | "paused" | "done" | "error";
  source_conn_id: number; target_conn_id: number;
  source_collection: string; target_collection: string;
  total: number; processed: number; checkpoint_offset: number; error: string | null;
}

export const api = {
  listConnections: () => req<Connection[]>("/connections"),
  createConnection: (b: Partial<Connection> & { token?: string }) =>
    req<Connection>("/connections", { method: "POST", body: JSON.stringify(b) }),
  updateConnection: (id: number, b: Partial<Connection> & { token?: string }) =>
    req<Connection>(`/connections/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteConnection: (id: number) =>
    req(`/connections/${id}`, { method: "DELETE" }),
  testConnection: (id: number) =>
    req<{ ok: boolean; heartbeat_ns: number }>(`/connections/${id}/test`, { method: "POST" }),

  listCollections: (id: number) =>
    req<CollectionInfo[]>(`/connections/${id}/collections`),
  getRecords: (id: number, name: string, offset = 0, limit = 50) =>
    req<RecordsPage>(`/connections/${id}/collections/${encodeURIComponent(name)}/records?offset=${offset}&limit=${limit}`),
  queryRecords: (id: number, name: string, where: Where | null, offset = 0, limit = 50) =>
    req<RecordsPage>(`/connections/${id}/collections/${encodeURIComponent(name)}/records`,
      { method: "POST", body: JSON.stringify({ where, offset, limit }) }),
  getRecord: (id: number, name: string, recordId: string) =>
    req<{ id: string; document: string | null; metadata: Record<string, unknown> | null; embedding: number[] | null }>(
      `/connections/${id}/collections/${encodeURIComponent(name)}/records/${encodeURIComponent(recordId)}`),
  getFields: (id: number, name: string) =>
    req<FieldInfo[]>(`/connections/${id}/collections/${encodeURIComponent(name)}/fields`),
  createCollection: (id: number, name: string, space = "cosine") =>
    req(`/connections/${id}/collections`, { method: "POST", body: JSON.stringify({ name, space }) }),
  renameCollection: (id: number, name: string, new_name: string) =>
    req(`/connections/${id}/collections/${encodeURIComponent(name)}`, { method: "PATCH", body: JSON.stringify({ new_name }) }),
  deleteCollection: (id: number, name: string) =>
    req(`/connections/${id}/collections/${encodeURIComponent(name)}`, { method: "DELETE" }),
  deleteRecords: (id: number, name: string, ids: string[]) =>
    req<{ ok: boolean; deleted: number }>(
      `/connections/${id}/collections/${encodeURIComponent(name)}/records`,
      { method: "DELETE", body: JSON.stringify({ ids }) }),

  createJob: (b: object) => req<JobStatus>("/jobs", { method: "POST", body: JSON.stringify(b) }),
  createBatch: (b: object) => req<JobStatus[]>("/jobs/batch", { method: "POST", body: JSON.stringify(b) }),
  checkCompat: (b: object) => req("/jobs/compat", { method: "POST", body: JSON.stringify(b) }),
  getJob: (id: number) => req<JobStatus>(`/jobs/${id}`),
  listJobs: () => req<JobStatus[]>("/jobs"),
  resumeJob: (id: number) => req<JobStatus>(`/jobs/${id}/resume`, { method: "POST" }),
  pauseJob: (id: number) => req<JobStatus>(`/jobs/${id}/pause`, { method: "POST" }),
  deleteJob: (id: number) => req(`/jobs/${id}`, { method: "DELETE" }),
  clearFinishedJobs: () => req<{ deleted: number }>("/jobs/clear-finished", { method: "POST" }),
};
