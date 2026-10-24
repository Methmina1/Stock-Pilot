# StockPilot

An AI-powered stock investment advisory web platform. For any stock it produces a
BUY / HOLD / SELL verdict with a confidence level, an explainable six-factor
breakdown (sentiment, momentum, valuation, volatility, volume, growth), a
FinBERT news-sentiment reading, and a historical backtest — plus portfolio
tracking, a trading journal and a strategy marketplace.

- **Frontend:** React 18 + Vite
- **Backend:** FastAPI (Python) + SQLAlchemy (async)
- **Database:** PostgreSQL
- **AI/ML:** XGBoost, FinBERT (Transformers), yfinance, vectorbt

---

## 1. Prerequisites

Install these on each PC before starting:

| Tool | Version | Notes |
|------|---------|-------|
| **Git** | any | to clone the repo |
| **Python** | 3.10+ (3.12 recommended) | backend runtime |
| **uv** | latest | Python package/venv manager — https://docs.astral.sh/uv/ |
| **Node.js** | 18+ (LTS) | frontend runtime (includes npm) |
| **PostgreSQL** | 16 | database |

> **Note:** the first backend install downloads PyTorch + the FinBERT model
> (a few GB). Make sure you have disk space and a decent connection.

Install **uv** (Windows PowerShell):
```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```
(macOS/Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`)

---

## 2. Clone the repository

```bash
git clone https://github.com/Methmina1/Stock-Pilot.git
cd Stock-Pilot
```

---

## 3. Create the database

Open **psql** (or pgAdmin) and create an empty database:

```sql
CREATE DATABASE stockpilot;
```

Remember your PostgreSQL username, password and port (default `5432`) — you'll
use them to configure the backend process next. The application creates all tables
automatically on first start, so no manual migration step is needed.

---

## 4. Backend setup (`Backend/`)

```bash
cd Backend
```

**a. Configure the backend process** using your local environment or a secret manager.
Set at least:
- `DATABASE_URL` — e.g. `postgresql+asyncpg://postgres:YOUR_PASSWORD@localhost:5432/stockpilot`
- `SECRET_KEY` — generate a persistent, private value:
  ```bash
  uv run python -c "import secrets; print(secrets.token_hex(32))"
  ```

**b. Install dependencies** (creates a `.venv` from `uv.lock`):

```bash
uv sync
```

**c. Seed demo data** (creates the demo users, analysts and the admin account).
This command deletes all existing application tables and data; use it only on a fresh demo database:

```bash
uv run python seed.py --reset-demo-db
```

**d. Model artifact** — `models/xgboost/current/model.pkl` is included for the
live XGBoost prediction. Only load model files from a source you trust.

**e. Run the backend** (http://localhost:8000):

```bash
uv run uvicorn app.main:app --reload
```

Interactive API docs: http://localhost:8000/docs

---

## 5. Frontend setup (`Frontend/`)

In a **second terminal**:

```bash
cd Frontend
npm install
npm run dev
```

The app runs at **http://localhost:5173** and proxies API calls to the backend
on port `8000` (configured in `vite.config.js`), so keep both running.

---

## 6. Log in

Open http://localhost:5173 and sign in with a seeded account. Each seed run
generates fresh passwords in the local, Git-ignored
`Backend/data_storage/demo-credentials.json` file:

| Role | Email |
|------|-------|
| Investor | `demo@stockpilot.io` |
| Analyst | `sarah@stockpilot.io` |
| Admin | `admin@stockpilot.io` |

You can also register a new **Investor** or **Financial Analyst** account.
Administrators are provisioned separately (via `seed.py`) and are not
self-registerable.

The seeded predictions, marketplace ratings, sales and historical returns are
illustrative demo records. Use the live prediction and backtest endpoints for
current model output; market data and headlines depend on external providers.

---

## 7. Running the tests

From `Backend/`:

```bash
uv run python -m pytest -q
```

---

## Ports & quick reference

| Service | URL |
|---------|-----|
| Frontend (Vite) | http://localhost:5173 |
| Backend (FastAPI) | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |

## Troubleshooting

- **Backend won't start / DB error** — check `DATABASE_URL`,
  confirm PostgreSQL is running and the `stockpilot` database exists.
- **`SECRET_KEY` / settings error** — make sure the backend process has
  `DATABASE_URL` and `SECRET_KEY` set.
- **Frontend can't reach the API** — the backend must be running on port 8000;
  the Vite dev server proxies `/api` to it.
- **First run is slow** — PyTorch and the FinBERT model download on first use.
- **`uv` not found** — reopen the terminal after installing uv so it's on PATH.
