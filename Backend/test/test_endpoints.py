#!/usr/bin/env python3
"""
StockPilot Endpoint Tester – Final (Works with Current Backend)
"""

import json
import time
import sys
import uuid
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

import requests

BASE_URL = "http://localhost:8000/api/v1"
TIMEOUT = 180


class TestResult:
    def __init__(self, endpoint: str, method: str, status: int, elapsed: float,
                 expected_status: Optional[int] = None, error: Optional[str] = None):
        self.endpoint = endpoint
        self.method = method
        self.status = status
        self.elapsed = elapsed
        self.expected_status = expected_status
        self.error = error

    @property
    def passed(self) -> bool:
        if self.expected_status is not None:
            expected = self.expected_status
            return self.status in expected if isinstance(expected, tuple) else self.status == expected
        return self.status < 400

    def __str__(self):
        return (f"{self.method:6} {self.endpoint:50} "
                f"→ {self.status:3} ({self.elapsed*1000:5.0f}ms) "
                f"{'✓' if self.passed else '✗'}")


class EndpointTester:
    def __init__(self):
        self.session = requests.Session()
        self.results: List[TestResult] = []
        self.tokens: Dict[str, str] = {}

    def login(self, email: str, password: str, role: str) -> bool:
        resp = self.session.post(
            f"{BASE_URL}/auth/login",
            json={"email": email, "password": password},
            timeout=TIMEOUT
        )
        if resp.status_code != 200:
            print(f"❌ Login failed for {role}: {resp.text[:200]}")
            return False
        data = resp.json()
        token = data["access_token"]
        self.tokens[role] = token
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        return True

    def set_token(self, role: str):
        if role in self.tokens:
            self.session.headers["Authorization"] = f"Bearer {self.tokens[role]}"
        else:
            self.session.headers.pop("Authorization", None)

    def _request(self, method: str, endpoint: str, expected_status: Optional[int] = None,
                 json_data: Optional[Dict] = None, headers: Optional[Dict] = None,
                 files: Optional[Dict] = None) -> tuple:
        url = f"{BASE_URL}{endpoint}"
        start = time.perf_counter()
        try:
            if method == "GET":
                resp = self.session.get(url, headers=headers, params=json_data, timeout=TIMEOUT)
            elif method == "POST":
                if files:
                    resp = self.session.post(url, files=files, data=json_data, headers=headers, timeout=TIMEOUT)
                else:
                    resp = self.session.post(url, json=json_data, headers=headers, timeout=TIMEOUT)
            elif method == "PUT":
                resp = self.session.put(url, json=json_data, headers=headers, timeout=TIMEOUT)
            elif method == "DELETE":
                resp = self.session.delete(url, headers=headers, timeout=TIMEOUT)
            elif method == "PATCH":
                resp = self.session.patch(url, json=json_data, headers=headers, timeout=TIMEOUT)
            else:
                raise ValueError(f"Unsupported method {method}")
        except requests.Timeout:
            elapsed = time.perf_counter() - start
            return 0, {"error": "Timeout"}, elapsed
        except Exception as e:
            elapsed = time.perf_counter() - start
            return 0, {"error": str(e)}, elapsed
        elapsed = time.perf_counter() - start
        try:
            data = resp.json()
        except:
            data = {"text": resp.text}
        return resp.status_code, data, elapsed

    def test(self, method: str, endpoint: str, expected_status: Optional[int] = None,
             json_data: Optional[Dict] = None, headers: Optional[Dict] = None,
             files: Optional[Dict] = None, role: Optional[str] = None):
        if role:
            self.set_token(role)
        status, data, elapsed = self._request(method, endpoint, expected_status,
                                              json_data, headers, files)
        error = None
        if expected_status is not None and not (status in expected_status if isinstance(expected_status, tuple) else status == expected_status):
            error = f"Expected {expected_status}, got {status}: {data}"
        elif expected_status is None and status >= 400:
            error = f"HTTP {status}: {data.get('detail', data)}"
        result = TestResult(endpoint, method, status, elapsed, expected_status, error)
        self.results.append(result)
        print(f"  {result}")
        return result

    def run_tests(self):
        print("\n" + "="*80)
        print("STARTING ENDPOINT TESTS")
        print("="*80)
        credentials_path = Path(__file__).resolve().parents[1] / "data_storage" / "demo-credentials.json"
        credentials = json.loads(credentials_path.read_text(encoding="utf-8"))

        # ---------- AUTHENTICATION ----------
        print("\n--- Authentication (Public) ---")
        unique_email = f"test_{int(time.time())}_{uuid.uuid4().hex[:6]}@example.com"
        self.test("POST", "/auth/register",
                  json_data={"full_name": "Test User", "email": unique_email, "password": "test1234"},
                  expected_status=200)
        self.test("POST", "/auth/register",
                  json_data={"full_name": "Test User", "email": unique_email, "password": "test1234"},
                  expected_status=409)

        self.test("POST", "/auth/login",
                  json_data={"email": "demo@stockpilot.io", "password": credentials["demo@stockpilot.io"]},
                  expected_status=200)
        self.test("POST", "/auth/login",
                  json_data={"email": "admin@stockpilot.io", "password": credentials["admin@stockpilot.io"]},
                  expected_status=200)
        self.test("POST", "/auth/login",
                  json_data={"email": "sarah@stockpilot.io", "password": credentials["sarah@stockpilot.io"]},
                  expected_status=200)

        if not self.login("demo@stockpilot.io", credentials["demo@stockpilot.io"], "investor"):
            print("❌ Investor login failed – aborting.")
            return
        self.login("admin@stockpilot.io", credentials["admin@stockpilot.io"], "admin")
        self.login("sarah@stockpilot.io", credentials["sarah@stockpilot.io"], "analyst")

        resp = self.session.post(f"{BASE_URL}/auth/login",
                                 json={"email": "demo@stockpilot.io", "password": credentials["demo@stockpilot.io"]})
        if resp.status_code == 200:
            refresh = resp.json().get("refresh_token")
            self.test("POST", "/auth/refresh", json_data={"refresh_token": refresh}, expected_status=200)

        # ---------- USER PROFILE ----------
        print("\n--- User Profile ---")
        if self.login(unique_email, "test1234", "registered"):
            self.test("GET", "/users/me", expected_status=200, role="registered")

        # ---------- STOCKS & PREDICTIONS ----------
        print("\n--- Stocks & Predictions ---")
        self.set_token("investor")
        self.test("GET", "/stocks", expected_status=200)
        self.test("GET", "/stocks/AAPL", expected_status=200)
        self.test("GET", "/stocks/INVALID", expected_status=404)
        self.test("GET", "/stocks/AAPL/history", expected_status=200)
        self.test("GET", "/predictions", expected_status=200)
        self.test("GET", "/predictions/AAPL", expected_status=200)
        self.test("GET", "/predictions/INVALID", expected_status=404)
        self.test("GET", "/predictions/AAPL/live", expected_status=200)

        # ---------- LIVE MARKET DATA ----------
        print("\n--- Live Market Data ---")
        self.test("GET", "/live/market-status", expected_status=200)
        self.test("GET", "/live/quote/AAPL", expected_status=200)
        self.test("GET", "/live/quote/INVALID", expected_status=(404, 502))
        self.test("GET", "/live/intraday/AAPL?interval=1m", expected_status=200)
        self.test("GET", "/live/chart/AAPL?period=1mo&interval=1d", expected_status=200)

        # ---------- SENTIMENT ----------
        print("\n--- Sentiment ---")
        self.test("GET", "/sentiment/AAPL", expected_status=200)
        self.test("GET", "/sentiment/INVALID", expected_status=200)

        # ---------- ANALYSIS ----------
        print("\n--- Analysis (AI Core) ---")
        self.set_token("investor")
        weights = {"w_sentiment": 14, "w_momentum": 22, "w_valuation": 20,
                   "w_volatility": 18, "w_volume": 10, "w_growth": 16}
        self.test("GET", "/analysis/AAPL/factors", json_data=weights, expected_status=200)
        self.test("GET", "/analysis/AAPL/factors", json_data={**weights, "w_sentiment": 100}, expected_status=200)
        self.test("GET", "/analysis/INVALID/factors", json_data=weights, expected_status=404)
        backtest_params = {"period": "6mo", "risk": "Moderate", "horizon": "Medium", **weights}
        self.test("GET", "/analysis/AAPL/backtest", json_data=backtest_params, expected_status=200)
        self.test("GET", "/analysis/AAPL/backtest", json_data={**backtest_params, "period": "1d"}, expected_status=422)
        self.test("GET", "/analysis/AAPL/bull-bear", expected_status=200)
        self.test("GET", "/analysis/AAPL/fundamentals", expected_status=200)

        # ---------- PORTFOLIO ----------
        print("\n--- Portfolio ---")
        self.set_token("investor")
        self.test("GET", "/portfolio", expected_status=200)
        holding_data = {"ticker": "META", "quantity": 5, "avg_cost": 500.0}
        res = self.test("POST", "/portfolio", json_data=holding_data, expected_status=201)
        holding_id = None
        if res.status == 201:
            resp = self.session.get(f"{BASE_URL}/portfolio")
            if resp.status_code == 200:
                holdings = resp.json()
                for h in holdings:
                    if h.get("ticker") == "META" and h.get("quantity") == 5:
                        holding_id = h["id"]
                        break
            if holding_id:
                self.test("PUT", f"/portfolio/{holding_id}",
                          json_data={"quantity": 20}, expected_status=200)
                self.test("DELETE", f"/portfolio/{holding_id}", expected_status=204)
        self.test("PUT", "/portfolio/00000000-0000-0000-0000-000000000000",
                  json_data={"quantity": 20}, expected_status=404)
        self.test("DELETE", "/portfolio/00000000-0000-0000-0000-000000000000",
                  expected_status=404)

        # ---------- WATCHLIST ----------
        print("\n--- Watchlist ---")
        self.set_token("investor")
        # Clean up any existing NFLX
        self.session.delete(f"{BASE_URL}/watchlist/NFLX", timeout=TIMEOUT)
        self.test("GET", "/watchlist", expected_status=200)
        self.test("POST", "/watchlist", json_data={"ticker": "NFLX"}, expected_status=201)
        self.test("POST", "/watchlist", json_data={"ticker": "NFLX"}, expected_status=409)
        self.test("DELETE", "/watchlist/NFLX", expected_status=204)
        self.test("DELETE", "/watchlist/XYZ", expected_status=404)

        # ---------- TRADING JOURNAL ----------
        print("\n--- Trading Journal ---")
        self.set_token("investor")
        self.test("GET", "/trades", expected_status=200)
        trade = {
            "ticker": "MSFT",
            "side": "buy",
            "entry_price": 450.0,
            "exit_price": 470.0,
            "quantity": 10,
            "opened_at": datetime.now().isoformat(),
            "closed_at": datetime.now().isoformat(),
            "strategy_label": "API_TEST",
            "notes": "Created by tester"
        }
        res = self.test("POST", "/trades", json_data=trade, expected_status=201)
        trade_id = None
        if res.status == 201:
            resp = self.session.get(f"{BASE_URL}/trades")
            if resp.status_code == 200:
                trades = resp.json()
                for t in trades:
                    if t.get("strategy_label") == "API_TEST" and t.get("notes") == "Created by tester":
                        trade_id = t["id"]
                        break
            if trade_id:
                self.test("DELETE", f"/trades/{trade_id}", expected_status=204)
        self.test("DELETE", "/trades/00000000-0000-0000-0000-000000000000", expected_status=404)

        # ---------- STRATEGIES ----------
        print("\n--- Strategies ---")
        self.set_token("investor")
        self.test("GET", "/strategies", expected_status=200)
        strat = {
            "name": "Test Strategy",
            "description": "A temporary test strategy",
            "weights": {"sentiment": 20, "momentum": 20, "valuation": 20,
                        "volatility": 20, "volume": 10, "growth": 10}
        }
        res = self.test("POST", "/strategies", json_data=strat, expected_status=201)
        strat_id = None
        if res.status == 201:
            resp = self.session.get(f"{BASE_URL}/strategies")
            if resp.status_code == 200:
                strategies = resp.json()
                for s in strategies:
                    if s.get("name") == "Test Strategy":
                        strat_id = s["id"]
                        break
            if strat_id:
                self.test("PUT", f"/strategies/{strat_id}",
                          json_data={"name": "Updated Test Strategy"}, expected_status=200)
                self.test("DELETE", f"/strategies/{strat_id}", expected_status=204)
        self.test("PUT", "/strategies/00000000-0000-0000-0000-000000000000",
                  json_data={"name": "x"}, expected_status=404)
        self.test("DELETE", "/strategies/00000000-0000-0000-0000-000000000000",
                  expected_status=404)

        # ---------- PUBLISH (analyst) ----------
        print("\n--- Publish Strategy (Analyst) ---")
        self.set_token("analyst")
        strat = {
            "name": "Analyst Test Strategy",
            "description": "For publish test",
            "weights": {"sentiment": 10, "momentum": 40, "valuation": 5,
                        "volatility": 10, "volume": 20, "growth": 15}
        }
        resp = self.session.post(f"{BASE_URL}/strategies", json=strat)
        if resp.status_code == 201:
            strat_id = resp.json()["id"]
            publish_data = {
                "price_cents": 999,
                "backtest_trades": 10,
                "backtest_winrate": 0.5,
                "backtest_sharpe": 0.8,
                "backtest_max_drawdown": 0.3,
                "backtest_profit_factor": 1.2,
                "backtest_return": 0.15
            }
            # Submission is rejected when the supplied backtest misses thresholds.
            self.test("POST", f"/strategies/{strat_id}/publish",
                      json_data=publish_data, expected_status=400)
            self.set_token("investor")
            self.test("POST", f"/strategies/{strat_id}/publish",
                      json_data=publish_data, expected_status=403)
            self.set_token("analyst")
            self.test("DELETE", f"/strategies/{strat_id}", expected_status=204)
        else:
            print("⚠️  Could not create analyst strategy – skipping publish test.")

        # ---------- MARKETPLACE ----------
        print("\n--- Marketplace ---")
        self.set_token("investor")
        # Use the correct endpoint: /listings
        self.test("GET", "/marketplace/listings", expected_status=200)
        self.test("GET", "/admin/thresholds", expected_status=403)

        # ---------- NOTIFICATIONS ----------
        print("\n--- Notifications ---")
        self.set_token("investor")
        self.test("GET", "/notifications", expected_status=200)
        resp = self.session.get(f"{BASE_URL}/notifications")
        if resp.status_code == 200:
            notifs = resp.json()
            if notifs:
                first_id = notifs[0]["id"]
                self.test("PUT", f"/notifications/{first_id}/read", expected_status=200)
        self.test("PUT", "/notifications/read-all", expected_status=200)

        # ---------- DASHBOARD ----------
        print("\n--- Dashboard ---")
        self.set_token("investor")
        self.test("GET", "/dashboard/market-indices", expected_status=200)
        self.test("GET", "/dashboard/sector-breakdown", expected_status=200)
        self.test("GET", "/dashboard/portfolio-history", expected_status=200)
        self.test("GET", "/dashboard/batch", expected_status=200)

        # ---------- ADMIN ----------
        print("\n--- Admin (Admin role) ---")
        self.set_token("admin")
        self.test("GET", "/admin/stats", expected_status=200)
        self.test("GET", "/admin/revenue", expected_status=200)
        self.test("GET", "/admin/users", expected_status=200)
        self.test("GET", "/admin/pending", expected_status=200)
        self.test("GET", "/admin/listings", expected_status=200)
        self.test("GET", "/admin/strategies", expected_status=200)
        self.test("GET", "/admin/thresholds", expected_status=200)
        self.test("PUT", "/admin/thresholds",
                  json_data={"min_trades": 50, "min_winrate": 0.6, "min_sharpe": 1.0,
                             "max_drawdown": 0.2, "min_profit_factor": 1.5},
                  expected_status=200)

        # Invalid listing operations
        self.test("POST", "/admin/listings/00000000-0000-0000-0000-000000000000/approve",
                  expected_status=404)
        self.test("POST", "/admin/listings/00000000-0000-0000-0000-000000000000/reject",
                  expected_status=404)
        self.test("POST", "/admin/listings/00000000-0000-0000-0000-000000000000/remove",
                  expected_status=404)
        self.test("DELETE", "/admin/listings/00000000-0000-0000-0000-000000000000",
                  expected_status=404)
        self.test("DELETE", "/admin/strategies/00000000-0000-0000-0000-000000000000",
                  expected_status=404)

        # ---------- SUMMARY ----------
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        total = len(self.results)
        passed = sum(1 for r in self.results if r.passed)
        failed = total - passed
        print(f"Total tests: {total}")
        print(f"Passed:      {passed}")
        print(f"Failed:      {failed}")
        if failed:
            print("\nFailed tests:")
            for r in self.results:
                if not r.passed:
                    print(f"  {r.method} {r.endpoint} → {r.status} (expected {r.expected_status})")
        avg_time = sum(r.elapsed for r in self.results) / total if total else 0
        print(f"Average response time: {avg_time*1000:.1f} ms")
        print("\n✅ Testing complete.")


if __name__ == "__main__":
    tester = EndpointTester()
    tester.run_tests()
