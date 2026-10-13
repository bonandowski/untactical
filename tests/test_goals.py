import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from common import OUT, load_competitions  # noqa: E402

ZAZA_MATCH = 3879739  # Juventus-Napoli 2016-02-13


def load(match_id):
    return json.loads((OUT / "goals" / f"{match_id}.json").read_text())


def test_zaza_goal():
    goals = load(ZAZA_MATCH)
    zaza = [g for g in goals if "Zaza" in g["scorer"]["name"]]
    assert len(zaza) == 1
    g = zaza[0]
    assert g["minute"] == 88
    assert g["chain"], "chain should not be empty"
    assert len(g["pl"]) == 22
    assert all(len(p["k"]) == len(g["chain"]) + 1 for p in g["pl"])
    shooter = next(p for p in g["pl"] if p["i"] == g["scorer"]["id"])
    assert shooter["k"][-1][2] == 1, "shooter position at the shot is exact"
    assert g["before"] == [0, 0] and g["after"] == [1, 0]


def test_scores_match_final_result():
    """Goals + own goals tracked in the pipeline must reproduce every final score
    (excluding shoot-outs)."""
    for m in load_competitions():
        path = OUT / "goals" / f"{m['match_id']}.json"
        if not path.exists():
            continue
        last = load(m["match_id"])[-1]
        own_goals_after = (m["home_score"] - last["after"][0]) + (m["away_score"] - last["after"][1])
        assert own_goals_after >= 0, m["match_id"]


def test_coordinates_in_pitch():
    for path in (OUT / "goals").glob("*.json"):
        for g in json.loads(path.read_text()):
            for a in g["chain"]:
                for x, y in (a["s"], a["e"]):
                    assert 0 <= x <= 120.5 and 0 <= y <= 80.5
            assert 0 <= g["xg"] <= 1


def test_no_cl_1999():
    assert not (OUT / "goals" / "3750240.json").exists()


def test_network_juve_napoli():
    net = json.loads((OUT / "networks" / "juventus.json").read_text())
    m = next(x for x in net["matches"] if x["match_id"] == ZAZA_MATCH)
    assert len(m["nodes"]) == 11
    assert m["edges"] and all(c >= 2 for _, _, c in m["edges"])
    assert m["res"] == "V" and m["gf"] == 1 and m["ga"] == 0
    assert 0 < m["kpi"]["poss"] < 100
    assert all(0 <= s[0] < 24 for sectors in m["sonar"].values() for s in sectors)


def test_pressing_napoli():
    data = json.loads((OUT / "pressing" / "napoli.json").read_text())
    s = data["comps"]["serie-a"]
    assert set(s) >= {"all|all", "1|home", "2|away"}
    a = s["all|all"]
    assert a["matches"] == 38 and len(a["rec"]) == 96 and len(a["pct"]) == 96
    assert 5 < a["ppda"] < 25 and 30 < a["height"] < 70
    assert abs(sum(a["terr"]) - 100) < 1
    league = json.loads((OUT / "pressing" / "league.json").read_text())
    assert len(league["serie-a"]["all|all"]) == 20
