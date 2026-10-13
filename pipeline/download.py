"""Download the StatsBomb open-data files needed for the project into data/raw/.

Idempotent: files already on disk are skipped.
"""
import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"
RAW = Path(__file__).resolve().parent.parent / "data" / "raw"

SERIE_A = (12, [27])
CL_FINALS = (16, [1, 2, 4, 21, 22, 23, 24, 25, 26, 27, 37, 39, 41, 44, 76])
SEASONS = [SERIE_A, CL_FINALS]


def fetch(rel: str) -> Path:
    dest = RAW / rel
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(f"{BASE}/{rel}", timeout=60) as r:
                data = r.read()
            tmp = dest.with_suffix(".part")
            tmp.write_bytes(data)
            tmp.replace(dest)
            return dest
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise RuntimeError(f"failed {rel}: {e}") from e
    return dest


def main() -> None:
    fetch("competitions.json")
    match_ids = []
    for comp_id, seasons in SEASONS:
        for season_id in seasons:
            path = fetch(f"matches/{comp_id}/{season_id}.json")
            matches = json.loads(path.read_text())
            match_ids += [m["match_id"] for m in matches]
            print(f"comp {comp_id} season {season_id}: {len(matches)} matches")
    rels = [f"{kind}/{mid}.json" for mid in match_ids for kind in ("events", "lineups")]
    with ThreadPoolExecutor(max_workers=16) as pool:
        for i, _ in enumerate(pool.map(fetch, rels), 1):
            if i % 200 == 0:
                print(f"  {i}/{len(rels)} files")
    print(f"done: {len(match_ids)} matches")


if __name__ == "__main__":
    sys.exit(main())
