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
    assert len(g["ff"]) >= 11
    assert sum(1 for p in g["ff"] if p.get("sh")) == 1
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
