# Chroma Ultimate UI

DBeaver-style web GUI for [ChromaDB](https://www.trychroma.com/) — browse collections across multiple servers simultaneously and dump/copy data between ChromaDB instances.

---

## Features

| Category | What it does |
|---|---|
| **Multi-connection** | Connect to many ChromaDB servers at once; each shows its own collection tree |
| **Browse records** | Double-click any collection to page through its records (id / document / metadata / embedding) |
| **Record detail** | Click a row to open a full-detail modal including the complete embedding vector |
| **Delete records** | Checkbox multi-select across pages → bulk delete; or delete from the detail modal |
| **Metadata filter** | Filter by any metadata field; type the field name and pick its type manually |
| **Dump / copy** | Copy a collection from one ChromaDB server to another with resume-safe checkpointing |
| **Filtered dump** | Apply a metadata filter first, then dump only the matching records |
| **Batch queue** | All dump jobs run sequentially (one at a time) so a weak source server is never overloaded |
| **Job history** | Global jobs panel with live progress bar, pause / resume, and clear-finished |
| **Collection CRUD** | Create, rename, and delete collections via right-click context menu |
| **Connection CRUD** | Save, edit, rename, and delete connections; auth tokens encrypted at rest |

---

## Requirements

| Requirement | Version |
|---|---|
| Python | 3.10 or later |
| Node.js | 18 or later |
| npm | 9 or later |

ตรวจ version ที่มีอยู่:

```bash
python3 --version
node --version
npm --version
```

---

## Installation & Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd chroma_ultimate_ui
```

### 2. รัน (ครั้งแรก)

**macOS / Linux:**
```bash
make dev
```

`make dev` จะ:
- สร้าง Python virtual environment ใน `backend/.venv` อัตโนมัติ
- ติดตั้ง Python dependencies
- ติดตั้ง Node.js dependencies (`npm install`)
- รัน backend (port 8080) และ frontend (port 5173) พร้อมกัน

รอจนเห็น output แบบนี้:

```
→ setting up backend venv
→ installing frontend deps
INFO:     Uvicorn running on http://0.0.0.0:8080
VITE v5.x.x  ready in ...ms  ➜  Local: http://localhost:5173/
```

แล้วเปิด **http://localhost:5173** ในเบราว์เซอร์

กด **Ctrl+C** เพื่อหยุดทั้งสองตัวพร้อมกัน

### 3. ครั้งต่อไป

```bash
make dev
```

ใช้คำสั่งเดิม — ถ้า venv และ node_modules มีอยู่แล้วจะข้ามขั้นตอนติดตั้งและรันทันที

---

### Windows

Windows ไม่มี `make` built-in — มี 3 วิธี:

**วิธี 1 — ติดตั้ง make (แนะนำ)**

```powershell
winget install GnuWin32.Make
```

รีสตาร์ท terminal แล้วใช้ `make dev` ได้เลย

**วิธี 2 — ใช้ Git Bash**

ถ้าติดตั้ง [Git for Windows](https://git-scm.com/download/win) อยู่แล้ว เปิด **Git Bash** แทน PowerShell → `make dev` ใช้ได้เลย

**วิธี 3 — ใช้ dev.bat (ไม่ต้องติดตั้งอะไรเพิ่ม)**

ดับเบิลคลิกไฟล์ `dev.bat` ในโฟลเดอร์โปรเจกต์
หรือรันใน CMD / PowerShell:

```powershell
dev.bat
```

จะเปิด 2 หน้าต่างอัตโนมัติ (backend + frontend) พร้อมติดตั้ง dependencies ให้ในครั้งแรก
ปิดทั้งสองหน้าต่างเพื่อหยุด

---

## การใช้งาน

### เพิ่ม Connection

1. กดปุ่ม **+** ที่ toolbar ด้านบนซ้าย
2. กรอกข้อมูล:
   - **Name** — ชื่อสำหรับจำ เช่น `Production`, `Dev`
   - **Host** — IP หรือ hostname ของ ChromaDB server เช่น `10.100.3.91`
   - **Port** — port ที่ ChromaDB ฟังอยู่ เช่น `8001`
   - **Token** — Bearer token (ถ้า server ต้องการ auth) — ถ้าไม่มีให้เว้นว่าง
3. กด **Save**

### เชื่อมต่อและดูข้อมูล

1. คลิกที่ connection row → ระบบโหลด collection list
2. กด **▶** หน้า **Collections** เพื่อขยาย
3. **Double-click** ที่ collection → เปิดดูข้อมูลในหน้าขวา
4. คลิกที่แถวข้อมูล → เปิด detail modal (ดู embedding เต็ม, metadata, document)

### Right-click menu

- **คลิกขวาที่ connection** → Disconnect / Refresh / New collection / Copy collections / Rename / Delete
- **คลิกขวาที่ collection** → Open / Rename / Delete
- **Cmd+click หรือ Shift+click** → เลือกหลาย collection พร้อมกัน (สำหรับ bulk delete)

### Filter ข้อมูล

1. เปิด collection → กดปุ่ม **+ condition** ในแถบ Filter
2. พิมพ์ **field name** → เลือก **type** (str / int / float / bool) → เลือก **operator** → ใส่ **value**
3. กด **Apply** → ตารางแสดงเฉพาะแถวที่ตรงเงื่อนไข
4. เงื่อนไขหลายอัน → รวมด้วย AND อัตโนมัติ

Operator ที่รองรับ:

| Type | Operators |
|---|---|
| str | `=` `≠` `in` `not in` |
| int | `=` `≠` `>` `≥` `<` `≤` `in` `not in` |
| float | `=` `≠` `>` `≥` `<` `≤` |
| bool | `=` `≠` |

### Dump (copy) Collection

1. **คลิกขวาที่ connection** → **Copy collections…** (หรือกด Copy บน folder)
2. เลือก source collection(s)
3. เลือก target connection และตั้งชื่อ collection ปลายทาง
4. กด **Start** → job เข้าคิวและรันทันที

หรือ dump เฉพาะข้อมูลที่ filter แล้ว:
1. เปิด collection → ตั้ง filter → กด **Dump filtered…**
2. เลือก target → กด Start

ดู progress ได้ที่ปุ่ม **⏱** (clock icon) toolbar ด้านบน

### Delete Records

- **ตาราง** → tick checkbox หน้าแถว → กด **Delete N records** (เลือกข้ามหน้าได้)
- **Detail modal** → กดปุ่ม **Delete** มุมขวาบน

---

## Production dumps (ไม่ auto-reload)

`make dev` ใช้ `--reload` — ถ้าแก้โค้ดระหว่าง dump backend จะ restart และ interrupt job

สำหรับ dump จริงที่ใช้เวลานาน:

```bash
# Terminal 1
make serve      # backend ไม่มี --reload

# Terminal 2
make frontend
```

Dump resume-safe — ถ้า backend restart ระหว่างทาง กด **Resume** ใน jobs panel เพื่อดึงต่อจาก checkpoint ล่าสุด

---

## Configuration

ปรับผ่าน environment variable — ไม่ต้องแก้ไฟล์

| Variable | Default | Description |
|---|---|---|
| `CUI_BATCH` | `50` | จำนวน record ต่อ batch ระหว่าง dump |
| `CUI_MAX_CONCURRENT_JOBS` | `1` | จำนวน dump job ที่รันพร้อมกัน (แนะนำ 1 สำหรับ server ที่ไม่แรง) |
| `CUI_DATA_DIR` | `~/.chroma_ultimate_ui` | ที่เก็บ SQLite database และ encryption key |
| `CUI_CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed origins (ปรับถ้า deploy บน server อื่น) |

ตัวอย่าง:

```bash
CUI_BATCH=200 make serve
```

---

## How dumps work

1. ดึง ID ทั้งหมดจาก source collection 1 ครั้ง (ไม่โหลด embedding — เร็วมาก)
2. แบ่ง IDs เป็น slice ขนาด `CUI_BATCH` → `get(ids=slice)` ทีละชุด
3. แต่ละ batch เขียนลง target ด้วย `upsert` (idempotent — รันซ้ำได้ปลอดภัย)
4. บันทึก progress + checkpoint ลง SQLite หลังทุก batch
5. Jobs รันทีละ 1 งาน (FIFO queue) — server ต้นทางไม่ถูก hit พร้อมกัน
6. เมื่อ backend restart → jobs ที่ค้างอยู่ถูก re-enqueue อัตโนมัติ

---

## Data storage

ข้อมูลทั้งหมดเก็บใน `~/.chroma_ultimate_ui/`:

```
~/.chroma_ultimate_ui/
├── store.db      # SQLite — saved connections + job history
└── secret.key    # Fernet encryption key (สร้างครั้งแรกอัตโนมัติ)
```

Auth token ของ connection ถูก encrypt ด้วย Fernet ก่อนเก็บใน `store.db` — ไม่มีการส่ง token กลับมาที่ frontend

---

## Project layout

```
chroma_ultimate_ui/
├── backend/
│   └── app/
│       ├── main.py             # FastAPI app, startup hooks
│       ├── config.py           # Env vars, Fernet encryption
│       ├── db.py               # SQLite schema + migrations
│       ├── models.py           # Pydantic request/response schemas
│       ├── chroma_client.py    # Per-connection ChromaDB client cache
│       ├── routers/
│       │   ├── connections.py  # CRUD for saved connections
│       │   ├── collections.py  # Browse, filter, CRUD, delete records
│       │   └── migrate.py      # Dump job lifecycle
│       └── services/
│           └── migrator.py     # Worker thread, batch loop, resume logic
├── frontend/
│   └── src/
│       ├── App.tsx             # Main layout, sidebar tree, record table
│       ├── FilterBar.tsx       # Metadata filter builder
│       ├── FilteredDumpDialog.tsx
│       ├── JobsPanel.tsx       # Live job list with progress bars
│       ├── MigratePanel.tsx    # Dump dialog
│       ├── ConnectionForm.tsx  # Add / edit connection form
│       └── api.ts              # Typed fetch client
├── docker-compose.yml
└── Makefile
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python · FastAPI · ChromaDB client · SQLite · Fernet encryption |
| Frontend | React · TypeScript · Vite |
| Storage | SQLite (`~/.chroma_ultimate_ui/store.db`) — connections + job history |
