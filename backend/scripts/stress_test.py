from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.pythia.stress_test import SCENARIOS, run_stress_scenario


def format_inr(value: float) -> str:
    whole = int(round(value))
    s = f"{whole:,}"
    parts = s.split(",")
    if len(parts) <= 1:
        return f"₹{s}"
    last3 = parts[-1]
    rest = "".join(parts[:-1])
    if len(rest) > 2:
        rest_fmt = ",".join([rest[max(i - 2, 0) : i] for i in range(len(rest), 0, -2)][::-1])
    else:
        rest_fmt = rest
    return f"₹{rest_fmt},{last3}"


def print_result(name: str) -> bool:
    output = run_stress_scenario(name)
    cfg = SCENARIOS[name]
    title = name.replace("_", " ").title()
    print("╔══════════════════════════════════════════════════════════╗")
    print(f"║  PYTHIA STRESS TEST: {title:<36}║")
    print(f"║  Monte Carlo: {cfg['simulations']:,} simulations{'':<24}║")
    print("╠══════════════════════════════════════════════════════════╣")
    print(f"║  Workers exposed:              {output.workers_exposed:>8,}                   ║")
    print(f"║  Mean total liability:        {format_inr(output.mean_liability):<24}║")
    print(f"║  90% CI for liability:  {format_inr(output.ci_low)} – {format_inr(output.ci_high):<16}║")
    print(f"║  Current pool reserves:       {format_inr(output.pool_reserves):<24}║")
    adequacy_label = "UNDERFUNDED" if output.underfunded else "ADEQUATE"
    warn = "⚠️" if output.underfunded else "✓"
    print(f"║  Pool adequacy (mean):         {output.pool_adequacy * 100:>5.1f}% {warn}  {adequacy_label:<12}║")
    print(f"║  Mean BCR during event:           {output.mean_bcr:>4.2f}                   ║")
    print(f"║  Recommended reserve buffer:  {format_inr(output.reserve_buffer):<24}║")
    action = "SUSPEND Tier 4 enrolments. Alert admin." if output.underfunded else "Continue enrolments. Monitor BCR."
    print(f"║  Action: {action:<46}║")
    print("╚══════════════════════════════════════════════════════════╝")
    return output.underfunded


def main() -> int:
    parser = argparse.ArgumentParser(description="Run PYTHIA stress scenarios.")
    parser.add_argument("--scenario", choices=list(SCENARIOS.keys()))
    parser.add_argument("--all", action="store_true", help="Run all scenarios sequentially.")
    parser.add_argument("--cities", default="", help="Optional city override list (not used in deterministic mock).")
    args = parser.parse_args()

    scenarios = list(SCENARIOS.keys()) if args.all else [args.scenario]
    if not scenarios or scenarios == [None]:
        parser.error("Provide --scenario or --all")

    any_underfunded = False
    for idx, name in enumerate(scenarios):
        any_underfunded = print_result(name) or any_underfunded
        if idx != len(scenarios) - 1:
            print()

    return 1 if any_underfunded else 0


if __name__ == "__main__":
    sys.exit(main())
