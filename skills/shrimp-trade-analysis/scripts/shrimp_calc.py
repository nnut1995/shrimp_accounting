#!/usr/bin/env python3
"""Recompute shrimp buy/sell notebook calculations from transcribed JSON."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any


def dec(value: Any) -> Decimal:
    return Decimal(str(value))


def money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def fmt(value: Decimal, places: str = "0.01") -> str:
    q = value.quantize(Decimal(places), rounding=ROUND_HALF_UP)
    return f"{q:,.2f}"


def row_amount(row: dict[str, Any]) -> Decimal | None:
    if "kg" in row and "price" in row:
        return money(dec(row["kg"]) * dec(row["price"]))
    if "kg" in row and "buy_price" in row:
        return money(dec(row["kg"]) * dec(row["buy_price"]))
    return None


def section_total(rows: list[dict[str, Any]]) -> Decimal:
    total = Decimal("0")
    for row in rows:
        if "amount" in row:
            total += dec(row["amount"])
        else:
            amount = row_amount(row)
            if amount is not None:
                total += amount
    return money(total)


def kg_by_size(rows: list[dict[str, Any]]) -> dict[str, Decimal]:
    totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for row in rows:
        size = str(row.get("match_size", row.get("size", "unknown")))
        totals[size] += dec(row.get("kg", 0))
    return dict(totals)


def money_by_size(rows: list[dict[str, Any]]) -> dict[str, Decimal]:
    totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for row in rows:
        size = str(row.get("match_size", row.get("size", "unknown")))
        if "amount" in row:
            totals[size] += dec(row["amount"])
        else:
            amount = row_amount(row)
            if amount is not None:
                totals[size] += amount
    return {size: money(value) for size, value in totals.items()}


def check_amounts(name: str, rows: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    for i, row in enumerate(rows, 1):
        expected = row_amount(row)
        if expected is None or "amount" not in row:
            continue
        actual = money(dec(row["amount"]))
        if abs(expected - actual) > Decimal("0.51"):
            label = row.get("label") or row.get("size") or row.get("lot") or f"row {i}"
            warnings.append(
                f"{name} row {i} ({label}): kg x price = {fmt(expected)}, written amount = {fmt(actual)}, diff = {fmt(actual - expected)}"
            )
    return warnings


def print_growth(buy_rows: list[dict[str, Any]], sell_rows: list[dict[str, Any]]) -> None:
    buy = kg_by_size(buy_rows)
    sell = kg_by_size(sell_rows)
    buy_money = money_by_size(buy_rows)
    sell_money = money_by_size(sell_rows)
    sizes = sorted(set(buy) | set(sell), key=lambda s: (s == "soft", s))
    print("Weight growth by size")
    print("size,buy_kg,sell_kg,growth_kg,growth_pct,buy_cost,sale_amount,gross_margin")
    for size in sizes:
        b = buy.get(size, Decimal("0"))
        s = sell.get(size, Decimal("0"))
        growth = s - b
        pct = "n/a" if b == 0 else f"{(growth / b * Decimal('100')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)}%"
        buy_cost = buy_money.get(size, Decimal("0"))
        sale_amount = sell_money.get(size, Decimal("0"))
        print(f"{size},{fmt(b)},{fmt(s)},{fmt(growth)},{pct},{fmt(buy_cost)},{fmt(sale_amount)},{fmt(sale_amount - buy_cost)}")
    print()
    print(f"Total buy kg: {fmt(sum(buy.values(), Decimal('0')))}")
    print(f"Total sell kg: {fmt(sum(sell.values(), Decimal('0')))}")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: shrimp_calc.py data.json", file=sys.stderr)
        return 2

    data = json.loads(Path(sys.argv[1]).read_text())
    buy_rows = data.get("buy_rows", [])
    sell_rows = data.get("sell_rows", [])
    buy_costs = data.get("buy_costs", [])
    sell_adjustments = data.get("sell_adjustments", [])
    expenses = data.get("expenses", [])
    written_totals = data.get("written_totals", {})

    print_growth(buy_rows, sell_rows)

    gross_sale = section_total(sell_rows)
    adjustments = section_total(sell_adjustments)
    buy_cost_total = section_total(buy_costs)
    expense_total = section_total(expenses)
    net_sale = money(gross_sale + adjustments)
    profit = money(net_sale - buy_cost_total - expense_total)

    print()
    print("Money totals")
    print(f"Gross sale: {fmt(gross_sale)}")
    print(f"Sale adjustments: {fmt(adjustments)}")
    print(f"Net sale: {fmt(net_sale)}")
    print(f"Buy cost: {fmt(buy_cost_total)}")
    print(f"Expenses: {fmt(expense_total)}")
    print(f"Profit: {fmt(profit)}")

    if written_totals:
        written_net = dec(written_totals.get("net_sale", net_sale))
        written_buy = dec(written_totals.get("buy_cost", buy_cost_total))
        written_expenses = dec(written_totals.get("expenses", expense_total))
        written_profit = money(written_net - written_buy - written_expenses)
        print()
        print("Written summary check")
        print(f"Written net sale: {fmt(written_net)} (diff vs recomputed {fmt(written_net - net_sale)})")
        print(f"Written buy cost: {fmt(written_buy)} (diff vs recomputed {fmt(written_buy - buy_cost_total)})")
        print(f"Written expenses: {fmt(written_expenses)} (diff vs recomputed {fmt(written_expenses - expense_total)})")
        print(f"Written-summary profit: {fmt(written_profit)}")

    warnings = []
    warnings.extend(check_amounts("sell", sell_rows))
    warnings.extend(check_amounts("buy cost", buy_costs))
    if warnings:
        print()
        print("Calculation warnings")
        for warning in warnings:
            print(f"- {warning}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
