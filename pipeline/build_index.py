"""Build public/data/index.json: catalogues for the selectors (competitions, teams, matches, goals)."""
from common import COMPETITIONS, OUT, load_competitions, match_meta, team_info, write_json

GOAL_FIELDS = ("id", "match_id", "comp", "team", "opp", "minute", "xg", "tags", "before", "after")


def main(goals: list[dict]) -> dict:
    matches = [match_meta(m) for m in load_competitions()]
    teams = {}
    for m in load_competitions():
        for name in (m["home_team"]["home_team_name"], m["away_team"]["away_team_name"]):
            info = team_info(name)
            entry = teams.setdefault(info["slug"], {**info, "comps": []})
            if m["_comp"] not in entry["comps"]:
                entry["comps"].append(m["_comp"])
    index = {
        "competitions": [{"key": c["key"], "name": c["name"]} for c in COMPETITIONS],
        "teams": sorted(teams.values(), key=lambda t: t["name"]),
        "matches": matches,
        "goals": [
            {**{k: g[k] for k in GOAL_FIELDS}, "scorer": g["scorer"]["name"], "home": g["home"], "away": g["away"],
             "badges": len(g["badges"])}
            for g in goals
        ],
    }
    size = write_json(OUT / "index.json", index)
    print(f"index: {len(matches)} matches, {len(teams)} teams, {len(goals)} goals, {size / 1024:.0f} KB")
    return index


if __name__ == "__main__":
    import build_goals
    main(build_goals.main())
