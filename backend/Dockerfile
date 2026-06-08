FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir -e . || pip install --no-cache-dir \
    fastapi "uvicorn[standard]" chromadb pydantic cryptography sse-starlette
COPY . .
RUN pip install --no-cache-dir -e .
EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
