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
git clone https://github.com/thestockpilot/stock_pilot.git
cd stock_pilot
```

---

## 3. Create the database

Open **psql** (or pgAdmin) and create an empty database:

```sql
CREATE DATABASE stockpilot;
```

Remember your PostgreSQL username, password and port (default `5432`) — you'll
put them in the backend `.env` next. The application creates all tables
automatically on first start, so no manual migration step is needed.

---

## 4. Backend setup (`backend/`)

```bash
cd backend
```

**a. Create your `.env`** — copy the template and fill in your values:

```bash
# Windows PowerShell
copy .env.example .env
# macOS/Linux
cp .env.example .env
```

Edit `.env` and set at least:
- `DATABASE_URL` — e.g. `postgresql+asyncpg://postgres:YOUR_PASSWORD@localhost:5432/stockpilot`
- `SECRET_KEY` — generate one:
  ```bash
  uv run python -c "import secrets; print(secrets.token_hex(32))"
  ```

**b. Install dependencies** (creates a `.venv` from `uv.lock`):

```bash
uv sync
```

**c. Seed demo data** (creates the demo users, analysts and the admin account):

```bash
uv run python seed.py
```

**d. (Optional) Train the model** — needed for the live "MODEL LIVE" XGBoost
prediction. The explainable six-factor verdict works without it.

```bash
uv run python train.py
```

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

Open http://localhost:5173 and sign in with a seeded account:

| Role | Email | Password |
|------|-------|----------|
| Investor | `demo@stockpilot.io` | `demo1234` |
| Analyst | `sarah@stockpilot.io` | `analyst1234` |
| Admin | `admin@stockpilot.io` | `admin1234` |

You can also register a new **Investor** or **Financial Analyst** account.
Administrators are provisioned separately (via `seed.py`) and are not
self-registerable.

---

## 7. Running the tests

From `backend/`:

```bash
uv run python -m pytest tests/ -q     # unit tests (AI layer, schemas, security)
uv run python db_tests.py             # database constraint tests (all rolled back)
```

---

## Ports & quick reference

| Service | URL |
|---------|-----|
| Frontend (Vite) | http://localhost:5173 |
| Backend (FastAPI) | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |

## Troubleshooting

- **Backend won't start / DB error** — check `DATABASE_URL` in `backend/.env`,
  confirm PostgreSQL is running and the `stockpilot` database exists.
- **`SECRET_KEY` / settings error** — make sure `backend/.env` exists (copied
  from `.env.example`) and has `DATABASE_URL` and `SECRET_KEY` set.
- **Frontend can't reach the API** — the backend must be running on port 8000;
  the Vite dev server proxies `/api` to it.
- **First run is slow** — PyTorch and the FinBERT model download on first use.
- **`uv` not found** — reopen the terminal after installing uv so it's on PATH.

> Keep your `backend/.env` private — it holds your database password and JWT
> secret and should never be committed.
