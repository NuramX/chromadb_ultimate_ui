@echo off
echo === Chroma Ultimate UI ===

if not exist backend\.venv (
    echo Setting up backend venv...
    cd backend
    python -m venv .venv
    .venv\Scripts\pip install -q -e .
    cd ..
)

if not exist frontend\node_modules (
    echo Installing frontend deps...
    cd frontend
    npm install
    cd ..
)

echo Starting backend on http://localhost:8080
echo Starting frontend on http://localhost:5173
echo Close both windows to stop.
echo.

start "CUI Backend" cmd /k "cd backend && .venv\Scripts\uvicorn app.main:app --reload --port 8080"
start "CUI Frontend" cmd /k "cd frontend && npm run dev"
