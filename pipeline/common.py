"""Shared loaders, team/player mappings and helpers for the pipeline."""
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"

SERIE_A = {"key": "serie-a", "name": "Serie A 2015/16", "competition_id": 12, "season_ids": [27]}
CL = {
    "key": "champions",
    "name": "Champions League",
    "competition_id": 16,
    "season_ids": [1, 2, 4, 21, 22, 23, 24, 25, 26, 27, 37, 39, 41, 44],
}
COMPETITIONS = [SERIE_A, CL]

# Team identity: 3-letter code + kits drawn as SVG patterns (no logos, no trademarks).
# Kit: pattern (solid | stripes | halves | band | diagonal), colours, number colour.
def kit(pattern, colors, num="#ffffff"):
    return {"p": pattern, "c": colors, "num": num}


WHITE = kit("solid", ["#f4f4f4"], "#111111")
TEAMS = {
    # Serie A 2015/16: home kit, away kit
    "AC Milan": ("MIL", kit("stripes", ["#d6182b", "#111111"]), WHITE),
    "AS Roma": ("ROM", kit("solid", ["#8e1f2f"], "#f0bc42"), WHITE),
    "Atalanta": ("ATA", kit("stripes", ["#1e71b8", "#111111"]), WHITE),
    "Bologna": ("BOL", kit("stripes", ["#b3202c", "#1a2f6b"]), WHITE),
    "Carpi": ("CAR", kit("stripes", ["#e2231a", "#ffffff"], "#111111"), kit("solid", ["#1b3c8c"])),
    "Chievo": ("CHI", kit("solid", ["#ffe600"], "#1d3c8f"), WHITE),
    "Empoli": ("EMP", kit("solid", ["#0055a4"]), WHITE),
    "Fiorentina": ("FIO", kit("solid", ["#6a2c91"]), WHITE),
    "Frosinone": ("FRO", kit("solid", ["#ffd700"], "#0047ab"), WHITE),
    "Genoa": ("GEN", kit("halves", ["#b0172a", "#0b2c6b"]), WHITE),
    "Hellas Verona": ("VER", kit("solid", ["#0b3c8c"], "#ffd200"), kit("solid", ["#ffd200"], "#0b3c8c")),
    "Inter Milan": ("INT", kit("stripes", ["#0068a8", "#111111"]), WHITE),
    "Juventus": ("JUV", kit("stripes", ["#ffffff", "#111111"], "#111111"), kit("solid", ["#1c1c1c"])),
    "Lazio": ("LAZ", kit("solid", ["#87d8f7"], "#111111"), WHITE),
    "Napoli": ("NAP", kit("solid", ["#12a0d7"]), WHITE),
    "Palermo": ("PAL", kit("solid", ["#f4a6c0"], "#111111"), kit("solid", ["#1c1c1c"])),
    "Sampdoria": ("SAM", kit("band", ["#1b5497", "#ffffff", "#e30613", "#111111"]), WHITE),
    "Sassuolo": ("SAS", kit("stripes", ["#00a752", "#111111"]), WHITE),
    "Torino": ("TOR", kit("solid", ["#8a1e03"]), WHITE),
    "Udinese": ("UDI", kit("stripes", ["#ffffff", "#111111"], "#111111"), kit("solid", ["#1c1c1c"])),
    # Champions League finalists
    "AS Monaco": ("MON", kit("diagonal", ["#e51b22", "#ffffff"], "#111111"), WHITE),
    "Atlético Madrid": ("ATM", kit("stripes", ["#cb3524", "#ffffff"], "#262e61"), kit("solid", ["#262e61"])),
    "Barcelona": ("BAR", kit("stripes", ["#a50044", "#004d98"]), kit("solid", ["#f7d417"], "#a50044")),
    "Bayern Munich": ("BAY", kit("solid", ["#dc052d"]), WHITE),
    "Borussia Dortmund": ("BVB", kit("solid", ["#fde100"], "#111111"), kit("solid", ["#1c1c1c"], "#fde100")),
    "Chelsea": ("CHE", kit("solid", ["#034694"]), WHITE),
    "FC Porto": ("POR", kit("stripes", ["#003893", "#ffffff"], "#111111"), WHITE),
    "Liverpool": ("LIV", kit("solid", ["#c8102e"]), WHITE),
    "Manchester United": ("MUN", kit("solid", ["#da291c"]), WHITE),
    "Real Madrid": ("RMA", kit("solid", ["#f4f4f4"], "#111111"), kit("solid", ["#3a2c6b"])),
    "Tottenham Hotspur": ("TOT", kit("solid", ["#f4f4f4"], "#132257"), kit("solid", ["#132257"])),
}

ITALIAN_NAMES = {
    "AC Milan": "Milan",
    "AS Roma": "Roma",
    "Inter Milan": "Inter",
    "Hellas Verona": "Verona",
    "Bayern Munich": "Bayern Monaco",
    "AS Monaco": "Monaco",
    "Atlético Madrid": "Atlético Madrid",
    "Manchester United": "Manchester United",
    "Tottenham Hotspur": "Tottenham",
}


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def team_info(name: str) -> dict:
    code, home, away = TEAMS.get(name, (name[:3].upper(), kit("solid", ["#888888"]), WHITE))
    return {
        "slug": slugify(name),
        "name": ITALIAN_NAMES.get(name, name),
        "code": code,
        "kit": home,
        "away_kit": away,
    }


def load_json(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_competitions() -> list[dict]:
    """Return every match of the project's perimeter, tagged with its competition key."""
    out = []
    for comp in COMPETITIONS:
        for sid in comp["season_ids"]:
            for m in load_json(RAW / "matches" / str(comp["competition_id"]) / f"{sid}.json"):
                m["_comp"] = comp["key"]
                out.append(m)
    out.sort(key=lambda m: (m["match_date"], m["match_id"]))
    return out


@lru_cache(maxsize=8)
def load_events(match_id: int) -> list[dict]:
    return load_json(RAW / "events" / f"{match_id}.json")


@lru_cache(maxsize=8)
def load_lineups(match_id: int) -> list[dict]:
    return load_json(RAW / "lineups" / f"{match_id}.json")


def player_names(match_id: int) -> dict[int, dict]:
    """player_id -> {name (short, nickname preferred), jersey}."""
    out = {}
    for team in load_lineups(match_id):
        for p in team["lineup"]:
            out[p["player_id"]] = {
                "name": p.get("player_nickname") or p["player_name"],
                "jersey": p.get("jersey_number"),
            }
    return out


def short_name(full: str) -> str:
    """Display surname: last token for multi-word names, kept whole for single names."""
    parts = full.split()
    if len(parts) <= 1:
        return full
    particles = {"de", "di", "da", "van", "von", "der", "dos", "del", "la", "le"}
    if parts[-2].lower() in particles:
        return " ".join(parts[-2:])
    return parts[-1]


def ts_seconds(ts: str) -> float:
    h, m, s = ts.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def match_meta(m: dict) -> dict:
    home, away = m["home_team"]["home_team_name"], m["away_team"]["away_team_name"]
    return {
        "match_id": m["match_id"],
        "comp": m["_comp"],
        "date": m["match_date"],
        "week": m.get("match_week"),
        "home": team_info(home)["slug"],
        "away": team_info(away)["slug"],
        "home_score": m["home_score"],
        "away_score": m["away_score"],
    }


def r1(v: float) -> float:
    return round(float(v), 1)


def pt(loc) -> list[float]:
    return [r1(v) for v in loc]


def write_json(path: Path, data) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    return len(text.encode())
