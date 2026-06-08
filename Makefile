BACKEND_PORT ?= 8080
FRONTEND_PORT ?= 5173

.PHONY: dev install backend frontend

dev: install
	@trap 'kill 0' SIGINT; \
	( cd backend && .venv/bin/uvicorn app.main:app --reload --port $(BACKEND_PORT) ) & \
	( cd frontend && npm run dev ) & \
	wait

install:
	@if [ ! -d backend/.venv ]; then \
		echo "→ setting up backend venv"; \
		cd backend && python3 -m venv .venv && .venv/bin/pip install -q -e .; \
	fi
	@if [ ! -d frontend/node_modules ]; then \
		echo "→ installing frontend deps"; \
		cd frontend && npm install; \
	fi

backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port $(BACKEND_PORT)

frontend:
	cd frontend && npm run dev
