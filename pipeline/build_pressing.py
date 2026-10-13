"""Build pressing / territory maps: public/data/pressing/{team_slug}.json + pressing/league.json.

Per team and competition, aggregated over every match, with splits by half (all/1/2) and
venue (all/home/away). All coordinates are in the team's own frame (attacking left -> right).
"""
from collections import defaultdict

from common import OUT, load_competitions, load_events, r1, team_info, ts_seconds, write_json

GX, GY = 12, 8          # 10 x 10 cells
WON = {"Won", "Success", "Success In Play", "Success Out"}
DEF_HEIGHT = {"Pressure", "Interception", "Ball Recovery", "Block", "Clearance", "Duel"}
PPDA_ACTIONS = {"Interception", "Foul Committed"}  # + tackles (Duel of type Tackle), see is_ppda_action
SET_PIECES = {"Throw-in", "Goal Kick", "Kick Off", "Corner", "Free Kick"}
PRESS_WINDOW = 5.0
HALVES = ("all", "1", "2")
VENUES = ("all", "home", "away")


def cell(loc):
    x = min(GX - 1, max(0, int(loc[0] // 10)))
    y = min(GY - 1, max(0, int(loc[1] // 10)))
    return y * GX + x


def new_acc():
    return {
        "minutes": 0.0, "matches": 0,
        "rec": [0] * (GX * GY), "touch": [0] * (GX * GY),
        "def_x": 0.0, "def_n": 0, "line_x": 0.0, "line_n": 0,
        "opp_pass": 0, "ppda_def": 0, "rec_ft": 0,
    }


def is_ppda_action(e):
    """Classic PPDA defensive actions: tackles, interceptions, fouls."""
    t = e["type"]["name"]
    return t in PPDA_ACTIONS or (t == "Duel" and (e["duel"].get("type") or {}).get("name") == "Tackle")


def is_recovery(e, events, i, team):
    t = e["type"]["name"]
    if t == "Ball Recovery":
        return not (e.get("ball_recovery") or {}).get("recovery_failure")
    if t == "Interception":
        return e["interception"]["outcome"]["name"] in WON
    if t == "Duel":
        return (e["duel"].get("outcome") or {}).get("name") in WON
    if t == "Pressure":
        # Pressure that wins the ball back: the team starts a new possession within 5 s.
        t0 = ts_seconds(e["timestamp"])
        for nxt in events[i + 1:i + 40]:
            if nxt["period"] != e["period"] or ts_seconds(nxt["timestamp"]) - t0 > PRESS_WINDOW:
                return False
            if nxt["possession"] != e["possession"]:
                return nxt["possession_team"]["name"] == team
    return False


def period_minutes(events):
    ends = defaultdict(float)
    for e in events:
        if e["period"] < 5:
            ends[e["period"]] = max(ends[e["period"]], ts_seconds(e["timestamp"]) / 60)
    return ends


def add_match(acc, m, events, team):
    home = m["home_team"]["home_team_name"]
    venue = "home" if team == home else "away"
    mins = period_minutes(events)

    def keys(period):
        hs = ["all"] + ([str(period)] if period in (1, 2) else [])
        return [(h, v) for h in hs for v in ("all", venue)]

    for h in HALVES:
        for v in ("all", venue):
            a = acc[(h, v)]
            a["minutes"] += sum(mins.values()) if h == "all" else mins.get(int(h), 0)
            a["matches"] += 1

    for i, e in enumerate(events):
        if e["period"] >= 5 or "location" not in e:
            continue
        mine = e.get("team", {}).get("name") == team
        t = e["type"]["name"]
        loc = e["location"]
        for k in keys(e["period"]):
            a = acc[k]
            if mine:
                a["touch"][cell(loc)] += 1
                if t in DEF_HEIGHT:
                    a["def_x"] += loc[0]
                    a["def_n"] += 1
                if is_ppda_action(e) and loc[0] > 48:
                    a["ppda_def"] += 1
                if "Back" in (e.get("position") or {}).get("name", "") and e["possession_team"]["name"] != team:
                    a["line_x"] += loc[0]
                    a["line_n"] += 1
            elif t == "Pass" and loc[0] < 72 and (e["pass"].get("type") or {}).get("name") not in SET_PIECES:
                a["opp_pass"] += 1
        if mine and t in ("Ball Recovery", "Interception", "Duel", "Pressure") and is_recovery(e, events, i, team):
            for k in keys(e["period"]):
                acc[k]["rec"][cell(loc)] += 1
                if loc[0] >= 80:
                    acc[k]["rec_ft"] += 1


def summarise(a):
    p90 = 90 / a["minutes"] if a["minutes"] else 0
    touches = sum(a["touch"]) or 1
    return {
        "matches": a["matches"],
        "rec": [round(c * p90, 2) for c in a["rec"]],
        "terr": [round(100 * c / touches, 2) for c in a["touch"]],
        "rec90": r1(sum(a["rec"]) * p90),
        "rec_ft": r1(a["rec_ft"] * p90),
        "height": r1(a["def_x"] / a["def_n"]) if a["def_n"] else None,
        "line": r1(a["line_x"] / a["line_n"]) if a["line_n"] else None,
        "ppda": r1(a["opp_pass"] / a["ppda_def"]) if a["ppda_def"] else None,
    }


def percentile(value, values):
    if not values:
        return 0
    below = sum(1 for v in values if v < value)
    equal = sum(1 for v in values if v == value)
    return round(100 * (below + 0.5 * equal) / len(values))


def main():
    accs = defaultdict(lambda: defaultdict(new_acc))  # (comp, team) -> split -> acc
    for m in load_competitions():
        events = load_events(m["match_id"])
        for team in (m["home_team"]["home_team_name"], m["away_team"]["away_team_name"]):
            add_match(accs[(m["_comp"], team)], m, events, team)

    summaries = {key: {f"{h}|{v}": summarise(a) for (h, v), a in splits.items()} for key, splits in accs.items()}

    # Percentile of each cell's recoveries/90 among the teams of the same competition and split.
    league = defaultdict(dict)
    for comp in {c for c, _ in summaries}:
        teams = [(t, s) for (c, t), s in summaries.items() if c == comp]
        for split in teams[0][1]:
            rows = [(t, s[split]) for t, s in teams if split in s]
            for i in range(GX * GY):
                col = [s["rec"][i] for _, s in rows]
                for _, s in rows:
                    s.setdefault("pct", [0] * (GX * GY))[i] = percentile(s["rec"][i], col)
            league[comp][split] = [
                {"slug": team_info(t)["slug"], **{k: s[k] for k in ("ppda", "height", "line", "rec90", "rec_ft")}}
                for t, s in rows
            ]

    per_team = defaultdict(dict)
    for (comp, team), splits in summaries.items():
        per_team[team][comp] = splits
    sizes = [write_json(OUT / "pressing" / f"{team_info(t)['slug']}.json", {"slug": team_info(t)["slug"], "comps": comps})
             for t, comps in per_team.items()]
    write_json(OUT / "pressing" / "league.json", league)
    print(f"pressing: {len(per_team)} teams, largest {max(sizes) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
