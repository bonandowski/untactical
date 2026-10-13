"""Run the whole pipeline and report output size against the budget."""
import shutil

from common import OUT
import build_goals
import build_index

BUDGET_TOTAL = 25 * 1024 * 1024
BUDGET_FILE = 1.5 * 1024 * 1024


def main() -> None:
    shutil.rmtree(OUT / "goals", ignore_errors=True)
    goals = build_goals.main()
    build_index.main(goals)
    files = [p for p in OUT.rglob("*.json")]
    total = sum(p.stat().st_size for p in files)
    biggest = max(files, key=lambda p: p.stat().st_size)
    print(f"output: {len(files)} files, {total / 1024 / 1024:.2f} MB "
          f"(largest {biggest.relative_to(OUT)} {biggest.stat().st_size / 1024:.0f} KB)")
    assert total < BUDGET_TOTAL, "over total budget"
    assert biggest.stat().st_size < BUDGET_FILE, "file over budget"


if __name__ == "__main__":
    main()
