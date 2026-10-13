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

# Team identity: 3-letter code + primary/secondary colour (no logos, no trademarks).
TEAMS = {
    "AC Milan": ("MIL", "#d6182b", "#111111"),
    "AS Roma": ("ROM", "#8e1f2f", "#f0bc42"),
    "Atalanta": ("ATA", "#1e71b8", "#111111"),
    "Bologna": ("BOL", "#1a2f48", "#a21c26"),
    "Carpi": ("CAR", "#e2231a", "#ffffff"),
    "Chievo": ("CHI", "#ffe600", "#1d3c8f"),
    "Empoli": ("EMP", "#0055a4", "#ffffff"),
    "Fiorentina": ("FIO", "#6a2c91", "#ffffff"),
    "Frosinone": ("FRO", "#ffd700", "#0047ab"),
    "Genoa": ("GEN", "#a51d2d", "#002d62"),
    "Hellas Verona": ("VER", "#ffd200", "#003a7d"),
    "Inter Milan": ("INT", "#0068a8", "#111111"),
    "Juventus": ("JUV", "#ffffff", "#111111"),
    "Lazio": ("LAZ", "#87d8f7", "#ffffff"),
    "Napoli": ("NAP", "#12a0d7", "#ffffff"),
    "Palermo": ("PAL", "#f4a6c0", "#111111"),
    "Sampdoria": ("SAM", "#1b5497", "#e30613"),
    "Sassuolo": ("SAS", "#00a752", "#111111"),
    "Torino": ("TOR", "#8a1e03", "#ffffff"),
    "Udinese": ("UDI", "#f2f2f2", "#111111"),
    # Champions League
    "AS Monaco": ("MON", "#e51b22", "#ffffff"),
    "Atlético Madrid": ("ATM", "#cb3524", "#262e61"),
    "Barcelona": ("BAR", "#a50044", "#004d98"),
    "Bayern Munich": ("BAY", "#dc052d", "#ffffff"),
    "Borussia Dortmund": ("BVB", "#fde100", "#111111"),
    "Chelsea": ("CHE", "#034694", "#ffffff"),
    "FC Porto": ("POR", "#003893", "#ffffff"),
    "Liverpool": ("LIV", "#c8102e", "#00b2a9"),
    "Manchester United": ("MUN", "#da291c", "#fbe122"),
    "Real Madrid": ("RMA", "#febe10", "#ffffff"),
    "Tottenham Hotspur": ("TOT", "#ffffff", "#132257"),
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
    code, primary, secondary = TEAMS.get(name, (name[:3].upper(), "#888888", "#ffffff"))
    return {
        "slug": slugify(name),
        "name": ITALIAN_NAMES.get(name, name),
        "code": code,
        "primary": primary,
        "secondary": secondary,
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
