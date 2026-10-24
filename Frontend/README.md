# StockPilot frontend

React and Vite client for the StockPilot API. See the [project setup guide](../README.md)
for the database, backend, and demo accounts.

From this directory:

```bash
npm ci
npm run dev
```

The development server runs at `http://localhost:5173` and proxies `/api` and
`/uploads` to `http://localhost:8000`. Start the backend first. Use
`npm run build` to create the production bundle in `dist/`.
