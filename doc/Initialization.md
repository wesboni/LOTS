# Initialization Guide

## 1. Backend (Python/FastAPI)
Run this command from the project root (ensure your virtual environment is active):

```powershell
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 --ssl-keyfile certs/key.pem --ssl-certfile certs/cert.pem
```

## 2. Frontend (React/Vite)
Run this command from the project root in a separate terminal:

```powershell
npm run dev
```
