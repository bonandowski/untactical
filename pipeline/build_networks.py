"""Build pass networks + pass sonars: public/data/networks/{team_slug}.json.

One file per team with every match in chronological order. The network covers the period
up to the team's first substitution or red card (fixed XI); sonars use the whole match.
"""
import math
from collections import Counter, defaultdict

from build_goals import POSITION
from common import (
    OUT, load_competitions, load_events, match_meta, player_names, r1, short_name, team_info,
    ts_seconds, write_json,
)

YARD = 0.9144
SECTORS = 24
CARDS_OFF = {"Red Card", "Second Yellow"}
MIN_EDGE = 2


def cut_index(events, team):
    """Index of the first substitution or red card of `team` (or None)."""
    for e in events:
        if e.get("team", {}).get("name") != team:
            continue
        if e["type"]["name"] == "Substitution":
            return e["index"], e["minute"]
        card = (e.get("foul_committed") or e.get("bad_behaviour") or {}).get("card", {}).get("name")
        if card in CARDS_OFF:
            return e["index"], e["minute"]
    return None, None


def possession_seconds(events):
    """Seconds of possession per team, summing the duration of each possession chain."""
    spans = {}
    for e in events:
        if e["period"] >= 5:
            continue
        key = (e["period"], e["possession"])
        t = ts_seconds(e["timestamp"])
        team = e["possession_team"]["name"]
        if key not in spans:
            spans[key] = [team, t, t]
        else:
            spans[key][2] = max(spans[key][2], t)
    out = Counter()
    for team, a, b in spans.values():
        out[team] += b - a
    return out


def pass_angle(p):
    dx = p["pass"]["end_location"][0] - p["location"][0]
    dy = p["pass"]["end_location"][1] - p["location"][1]
    return math.degrees(math.atan2(dy, dx)) % 360


def build_team_match(m, events, team, names, poss):
    meta = match_meta(m)
    home = m["home_team"]["home_team_name"]
    is_home = team == home
    opp = m["away_team"]["away_team_name"] if is_home else home
    gf, ga = (m["home_score"], m["away_score"]) if is_home else (m["away_score"], m["home_score"])
    xi_event = next(e for e in events if e["type"]["name"] == "Starting XI" and e["team"]["name"] == team)
    xi = {p["player"]["id"]: (p["jersey_number"], p["position"]["name"]) for p in xi_event["tactics"]["lineup"]}
    cut, cut_minute = cut_index(events, team)
    before = [e for e in events if e.get("team", {}).get("name") == team and (cut is None or e["index"] < cut)
              and e["period"] < 5]

    loc = defaultdict(lambda: [0.0, 0.0, 0])
    passes_ok = Counter()
    edges = Counter()
    for e in before:
        pid = e.get("player", {}).get("id")
        if pid in xi and "location" in e:
            s = loc[pid]
            s[0] += e["location"][0]
            s[1] += e["location"][1]
            s[2] += 1
        if e["type"]["name"] == "Pass" and "outcome" not in e["pass"] and pid in xi:
            passes_ok[pid] += 1
            rec = e["pass"].get("recipient", {}).get("id")
            if rec in xi:
                edges[(pid, rec)] += 1

    nodes = []
    for pid, (jersey, pos) in xi.items():
        s = loc.get(pid)
        if not s or not s[2]:
            continue
        nodes.append({
            "i": pid, "n": short_name(names.get(pid, {"name": str(pid)})["name"]), "j": jersey,
            "r": POSITION.get(pos, pos.lower()), "x": r1(s[0] / s[2]), "y": r1(s[1] / s[2]),
            "t": s[2], "p": passes_ok[pid],
        })

    # Sonar: every pass of the match by each player who started.
    sonar = defaultdict(lambda: [[0, 0.0, 0] for _ in range(SECTORS)])
    all_passes = [e for e in events if e["type"]["name"] == "Pass" and e.get("team", {}).get("name") == team
                  and e["period"] < 5 and e["pass"].get("type", {}).get("name") not in ("Throw-in", "Kick Off")]
    for p in all_passes:
        pid = p["player"]["id"]
        if pid not in xi:
            continue
        sec = int(pass_angle(p) // (360 / SECTORS)) % SECTORS
        cell = sonar[pid][sec]
        cell[0] += 1
        cell[1] += p["pass"]["length"] * YARD
        cell[2] += "outcome" not in p["pass"]

    team_passes = [e for e in events if e["type"]["name"] == "Pass" and e.get("team", {}).get("name") == team
                   and e["period"] < 5]
    completed = [p for p in team_passes if "outcome" not in p["pass"]]
    involvement = Counter()
    for p in completed:
        involvement[p["player"]["id"]] += 1
        rec = p["pass"].get("recipient", {}).get("id")
        if rec:
            involvement[rec] += 1
    top_id, top_n = involvement.most_common(1)[0] if involvement else (None, 0)
    total_poss = sum(poss.values()) or 1

    return {
        **{k: meta[k] for k in ("match_id", "comp", "date", "week")},
        "home": is_home, "opp": team_info(opp)["slug"], "gf": gf, "ga": ga,
        "res": "V" if gf > ga else "N" if gf == ga else "P",
        "cut": cut_minute,
        "kpi": {
            "poss": round(100 * poss[team] / total_poss, 1),
            "passes": len(team_passes),
            "acc": round(100 * len(completed) / max(1, len(team_passes)), 1),
            "len": r1(sum(p["pass"]["length"] for p in team_passes) * YARD / max(1, len(team_passes))),
            "fwd": round(100 * sum(1 for p in team_passes if p["pass"]["end_location"][0] - p["location"][0] > 0)
                         / max(1, len(team_passes)), 1),
            "top": short_name(names.get(top_id, {"name": "?"})["name"]) if top_id else None,
            "top_id": top_id,
            "top_share": round(100 * top_n / max(1, 2 * len(completed)), 1),
        },
        "nodes": nodes,
        "edges": [[a, b, c] for (a, b), c in edges.most_common() if c >= MIN_EDGE],
        "sonar": {
            str(pid): [[i, c[0], r1(c[1] / c[0]), round(100 * c[2] / c[0])] for i, c in enumerate(cells) if c[0]]
            for pid, cells in sonar.items()
        },
    }


def main() -> dict:
    per_team = defaultdict(list)
    for m in load_competitions():
        events = load_events(m["match_id"])
        names = player_names(m["match_id"])
        poss = possession_seconds(events)
        for team in (m["home_team"]["home_team_name"], m["away_team"]["away_team_name"]):
            per_team[team].append(build_team_match(m, events, team, names, poss))
    sizes = {}
    for team, matches in per_team.items():
        info = team_info(team)
        sizes[info["slug"]] = write_json(OUT / "networks" / f"{info['slug']}.json", {**info, "matches": matches})
    print(f"networks: {len(per_team)} teams, largest {max(sizes.values()) / 1024:.0f} KB")
    return per_team


if __name__ == "__main__":
    main()
