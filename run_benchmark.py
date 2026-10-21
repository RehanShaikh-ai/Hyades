#!/usr/bin/env python3
"""Run latency benchmark and write results to file."""
import subprocess, sys, os

cwd = os.path.dirname(os.path.abspath(__file__))
env = {**os.environ, "PYTHONPATH": os.path.join(cwd, "backend")}

r = subprocess.run(
    [sys.executable, "scripts/benchmark_v0_5_1_latency.py", "--format", "markdown", "--iterations", "25"],
    capture_output=True, text=True, timeout=120, cwd=cwd, env=env,
)
result = f"STDOUT:\n{r.stdout}\nSTDERR:\n{r.stderr}\nRC:{r.returncode}"
with open(os.path.join(cwd, "benchmark_results.txt"), "w", encoding="utf-8") as f:
    f.write(result)
print("done rc=" + str(r.returncode))
