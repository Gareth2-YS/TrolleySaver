"""Run every TrolleySaver test suite, then print one summary table.

    python tests\\run_all.py                        # backend unit tests, frontend unit tests, template lint
    python tests\\run_all.py --aws                  # also the smoke test and Smart Basket evaluation on dev
    python tests\\run_all.py --only backend,lint    # just these suites

Suites: backend, frontend, lint, smoke, basket. The smoke test and the basket evaluation call the
deployed dev stack, so they only run with --aws (or when named in --only) and need AWS credentials in
this terminal (backend/TESTING.md part 0). Each suite's output is shown as it runs. A suite whose tool
isn't installed is reported as Skipped, with what to set up, rather than as a failure.

Standard library only, so any Python 3 can run it; the backend suites use backend/.venv's Python.
Exits 1 if any suite failed.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")


class Skip(Exception):
    """The suite can't run on this machine; the message says what to set up."""


# ---------- How to start each suite ----------

def backend_python():
    for candidate in (BACKEND / ".venv" / "Scripts" / "python.exe", BACKEND / ".venv" / "bin" / "python"):
        if candidate.exists():
            return str(candidate)
    raise Skip("no backend/.venv yet; set it up as in backend/TESTING.md part 0")


def backend_command():
    return [backend_python(), "-m", "pytest"], BACKEND


def frontend_command():
    npm = shutil.which("npm")
    if not npm:
        raise Skip("npm not found; install Node.js")
    if not (FRONTEND / "node_modules").is_dir():
        raise Skip("run npm ci in frontend/ first")
    return [npm, "test"], FRONTEND


def lint_command():
    sam = shutil.which("sam")
    if not sam:
        raise Skip("sam not found; install the AWS SAM CLI")
    return [sam, "validate", "--lint"], BACKEND


def smoke_command():
    return [backend_python(), str(Path("scripts") / "smoke_test.py"), "--env", "dev"], BACKEND


def basket_command():
    return [backend_python(), str(Path("scripts") / "basket_eval.py"), "--env", "dev", "--http"], BACKEND


# ---------- Reading the counts out of each suite's output ----------

def pytest_counts(lines):
    for line in reversed(lines):
        if re.search(r"\d+ (passed|failed|errors?)\b", line):
            return re.sub(r"\s+in [\d.]+s.*$", "", line.strip(" =")).strip()
    return ""


def vitest_counts(lines):
    for line in reversed(lines):
        match = re.match(r"\s*Tests\s+(.+?)\s*\(\d+\)\s*$", line)
        if match:
            return match.group(1).replace(" | ", ", ")
    return ""


def lint_counts(lines):
    return "valid template" if any("is a valid SAM Template" in line for line in lines) else ""


def smoke_counts(lines):
    passed = sum(line.startswith("PASS  ") for line in lines)
    failed = sum(line.startswith("FAIL  ") for line in lines)
    return f"{passed} checks passed" + (f", {failed} failed" if failed else "") if passed or failed else ""


def basket_counts(lines):
    for line in reversed(lines):
        match = re.search(r"(\d+) of (\d+) checks passed.*?; (\d+) failed", line)
        if match:
            return f"{match[1]} of {match[2]} checks passed, {match[3]} failed"
    return ""


@dataclass
class Suite:
    key: str
    title: str
    command: Callable[[], tuple]
    counts: Callable[[list], str]
    aws: bool = False


SUITES = [
    Suite("backend", "Backend unit tests", backend_command, pytest_counts),
    Suite("frontend", "Frontend unit tests", frontend_command, vitest_counts),
    Suite("lint", "Template lint", lint_command, lint_counts),
    Suite("smoke", "Smoke test (dev)", smoke_command, smoke_counts, aws=True),
    Suite("basket", "Basket evaluation (dev)", basket_command, basket_counts, aws=True),
]


def run(suite):
    """Run one suite, echoing its output. Returns (status, counts, seconds)."""
    try:
        command, cwd = suite.command()
    except Skip as reason:
        return "Skipped", str(reason), None
    print(f"\n===== {suite.title}: {' '.join([Path(command[0]).stem, *command[1:]])}  (in {cwd.relative_to(ROOT)})\n", flush=True)
    started = time.monotonic()
    lines = []
    try:
        process = subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                   encoding="utf-8", errors="replace",
                                   env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"})
    except OSError as error:
        return "Failed", f"could not start: {error}", time.monotonic() - started
    for line in process.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
        lines.append(ANSI.sub("", line.rstrip("\n")))
    status = "Passed" if process.wait() == 0 else "Failed"
    return status, suite.counts(lines), time.monotonic() - started


def duration(seconds):
    if seconds is None:
        return "-"
    return f"{seconds:.0f}s" if seconds < 60 else f"{int(seconds // 60)}m {seconds % 60:02.0f}s"


def print_summary(results):
    rows = [("Suite", "Status", "Result", "Time")] + [(s.title, status, counts, duration(t)) for s, status, counts, t in results]
    widths = [max(len(row[i]) for row in rows) for i in range(4)]
    print("\n===== Summary\n")
    for i, row in enumerate(rows):
        print("  ".join(cell.ljust(width) for cell, width in zip(row, widths)).rstrip())
        if i == 0:
            print("  ".join("-" * width for width in widths))


def main():
    parser = argparse.ArgumentParser(description="Run every TrolleySaver test suite and summarise the results.")
    parser.add_argument("--aws", action="store_true", help="Also run the suites that call the deployed dev stack (smoke, basket)")
    parser.add_argument("--only", metavar="SUITES", help="Comma-separated suites to run: " + ", ".join(s.key for s in SUITES))
    args = parser.parse_args()
    sys.stdout.reconfigure(errors="replace")

    selected = SUITES
    if args.only:
        keys = [key.strip() for key in args.only.split(",") if key.strip()]
        unknown = sorted(set(keys) - {s.key for s in SUITES})
        if unknown:
            parser.error(f"unknown suite(s): {', '.join(unknown)}. Choose from {', '.join(s.key for s in SUITES)}")
        selected = [s for s in SUITES if s.key in keys]

    results = []
    try:
        for suite in selected:
            if suite.aws and not args.aws and not args.only:
                results.append((suite, "Skipped", "add --aws to run it against dev", None))
            else:
                results.append((suite, *run(suite)))
    except KeyboardInterrupt:
        print("\nStopped.")
        sys.exit(130)

    print_summary(results)
    failed = [suite.title for suite, status, _, _ in results if status == "Failed"]
    print(f"\n{'Failed: ' + ', '.join(failed) if failed else 'No failures.'}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
