"""Build per-match goal replay files: public/data/goals/{match_id}.json.

Each goal carries the last actions of the scoring possession, the shot, the freeze frame
(plus the shooter), narrative tags, Televideo-style badges and a templated one-liner.
"""
import hashlib
import math

from common import (
    OUT, load_competitions, load_events, match_meta, player_names, pt, r1, short_name,
    team_info, ts_seconds, write_json,
)

CHAIN_TYPES = {"Pass", "Carry", "Dribble"}
MAX_ACTIONS = 8
YARD = 0.9144

BODY = {"Right Foot": "destro", "Left Foot": "sinistro", "Head": "testa", "Other": "altro"}
SHOT_TYPE = {"Open Play": "azione", "Penalty": "rigore", "Free Kick": "punizione", "Corner": "corner"}
TECHNIQUE = {
    "Normal": "normale", "Volley": "al volo", "Half Volley": "mezzo volo", "Lob": "pallonetto",
    "Backheel": "di tacco", "Overhead Kick": "rovesciata", "Diving Header": "in tuffo",
}
POSITION = {
    "Goalkeeper": "portiere", "Right Back": "terzino dx", "Left Back": "terzino sx",
    "Right Center Back": "centrale dx", "Left Center Back": "centrale sx", "Center Back": "centrale",
    "Right Wing Back": "esterno dx", "Left Wing Back": "esterno sx",
    "Right Defensive Midfield": "mediano dx", "Left Defensive Midfield": "mediano sx",
    "Center Defensive Midfield": "regista", "Right Midfield": "esterno dx", "Left Midfield": "esterno sx",
    "Right Center Midfield": "mezzala dx", "Left Center Midfield": "mezzala sx",
    "Center Midfield": "centrocampista", "Right Attacking Midfield": "trequartista dx",
    "Left Attacking Midfield": "trequartista sx", "Center Attacking Midfield": "trequartista",
    "Right Wing": "ala dx", "Left Wing": "ala sx", "Right Center Forward": "punta dx",
    "Left Center Forward": "punta sx", "Center Forward": "centravanti", "Secondary Striker": "seconda punta",
}
PASS_KIND = {"Ground Pass": "rasoterra", "Low Pass": "basso", "High Pass": "alto"}

QUIPS = [
    ("penalty", [
        "Rigore. Il portiere si è tuffato con convinzione, dalla parte sbagliata.",
        "Undici metri, zero dubbi, qualche battito in più.",
        "Dal dischetto: la cosa più facile del calcio, finché non tocca a te.",
    ]),
    ("freezer", [
        "xG {xg}: il modello statistico ha chiesto il cambio.",
        "Su 100 tiri così ne entrano {pct}. {scorer} ha scelto proprio questo.",
        "Gol da freezer: l'algoritmo è ancora lì che ricalcola.",
    ]),
    ("long", [
        "Da {dist} metri. Il portiere sta ancora cercando di capire da dove è arrivata.",
        "Tiro da {dist} metri: in allenamento finisce in tangenziale, in partita all'incrocio.",
    ]),
    ("tiki", [
        "{n} passaggi di fila: avversari ipnotizzati, pubblico pure.",
        "{n} passaggi consecutivi. Qualcuno dall'altra parte ha toccato palla? No.",
    ]),
    ("counter", [
        "{origin} alla rete in {sec} secondi. C'è chi ci mette di più a scegliere il panino.",
        "Contropiede da {sec} secondi: la difesa era ancora negli spogliatoi a discutere.",
    ]),
    ("head", [
        "Di capoccia. Old school, nessuna vergogna.",
        "Colpo di testa: il pallone ha trovato la fronte, la fronte ha trovato la porta.",
    ]),
    ("solo", [
        "{scorer} ha deciso di fare tutto da solo. I compagni applaudono lo stesso.",
        "Assolo di {scorer}: passaggi zero, egoismo giustificato dal risultato.",
    ]),
    ("cesarini", [
        "Minuto {min}: zona Cesarini, cuori deboli cambiare canale.",
        "Al {min}' c'è chi esce per evitare il traffico. Errore.",
    ]),
    ("easy", [
        "xG {xg}: sbagliarlo era più difficile.",
        "Porta spalancata, emozione contenuta. Ma vale uguale.",
    ]),
    ("setpiece", [
        "Palla inattiva, testa attiva.",
        "Schema da calcio piazzato: provato mille volte in allenamento, riuscito una.",
    ]),
    ("default", [
        "Tiro, rete, tabellone che cambia. Il calcio, in sostanza.",
        "{scorer} la mette dentro al {min}'. Nessuna domanda dal VAR (nel 2015 non c'era).",
        "Gol pulito, senza bisogno di commenti. Il commento c'è lo stesso.",
    ]),
]


def pick(key: str, options: list[str]) -> str:
    h = int(hashlib.md5(key.encode()).hexdigest(), 16)
    return options[h % len(options)]


def shot_distance(loc) -> float:
    """Distance in metres from the shot location to the centre of the goal."""
    return math.hypot(120 - loc[0], 40 - loc[1]) * YARD


def origin_phrase(x: float) -> str:
    if x < 18:
        return "dalla propria area"
    if x < 60:
        return "dalla propria metà campo"
    if x < 80:
        return "dalla trequarti"
    if x < 102:
        return "dal limite dell'area"
    return "dentro l'area"


def describe(goal: dict, n_passes: int, secs: float, start_x: float) -> str:
    if goal["penalty"]:
        return "Dal dischetto. Undici metri di pura ansia."
    if goal["shot_type"] in ("punizione", "corner") and n_passes == 0:
        return f"Direttamente su {goal['shot_type']}."
    t = "un secondo" if secs < 1.5 else f"{secs:.0f} secondi"
    if n_passes == 0:
        return f"Nessun passaggio, {t}, {origin_phrase(start_x)}."
    p = "passaggio" if n_passes == 1 else "passaggi"
    return f"{n_passes} {p} in {t}, {origin_phrase(start_x)}."


def build_match(m: dict) -> list[dict]:
    meta = match_meta(m)
    events = load_events(m["match_id"])
    names = player_names(m["match_id"])
    home = m["home_team"]["home_team_name"]
    by_id = {e["id"]: e for e in events}

    def person(p):
        if not p:
            return None
        info = names.get(p["id"], {"name": p["name"], "jersey": None})
        return {"id": p["id"], "name": info["name"], "short": short_name(info["name"]), "jersey": info["jersey"]}

    score = [0, 0]
    goals = []
    for e in events:
        t = e["type"]["name"]
        if e.get("period", 1) >= 5:
            continue
        side = 0 if e.get("team", {}).get("name") == home else 1
        if t == "Own Goal For":
            score[side] += 1
            continue
        if t != "Shot" or e["shot"]["outcome"]["name"] != "Goal":
            continue
        before = list(score)
        score[side] += 1
        shot = e["shot"]
        team_name = e["team"]["name"]
        opp_name = m["away_team"]["away_team_name"] if side == 0 else home

        chain_full = [
            c for c in events
            if c["possession"] == e["possession"] and c["period"] == e["period"]
            and c["index"] < e["index"] and c.get("team", {}).get("name") == team_name
            and c["type"]["name"] in CHAIN_TYPES
        ]
        chain = chain_full[-MAX_ACTIONS:]
        shot_t = ts_seconds(e["timestamp"])
        first_t = ts_seconds(chain_full[0]["timestamp"]) if chain_full else shot_t
        secs = max(0.0, shot_t - first_t)
        start_x = chain_full[0]["location"][0] if chain_full else e["location"][0]
        n_passes = sum(1 for c in chain_full if c["type"]["name"] == "Pass")

        actions = []
        for c in chain:
            kind = c["type"]["name"].lower()
            s = pt(c["location"])
            if kind == "pass":
                end = pt(c["pass"]["end_location"])
                detail = PASS_KIND.get(c["pass"].get("height", {}).get("name"), "")
                ok = "outcome" not in c["pass"]
            elif kind == "carry":
                end, detail, ok = pt(c["carry"]["end_location"]), "", True
            else:
                end, detail = s, ""
                ok = c.get("dribble", {}).get("outcome", {}).get("name") == "Complete"
            actions.append({
                "k": kind, "p": short_name(person(c.get("player"))["name"]) if c.get("player") else "",
                "s": s, "e": end, "t": r1(ts_seconds(c["timestamp"]) - first_t),
                "d": r1(c.get("duration") or 0.5), "x": detail, "ok": ok,
            })

        assist = None
        kp = shot.get("key_pass_id")
        if kp and kp in by_id and by_id[kp].get("pass", {}).get("goal_assist"):
            assist = person(by_id[kp].get("player"))

        scorer = person(e["player"])
        ff = [{
            "x": r1(f["location"][0]), "y": r1(f["location"][1]),
            "n": short_name(names.get(f["player"]["id"], {"name": f["player"]["name"]})["name"]),
            "r": POSITION.get(f["position"]["name"], f["position"]["name"].lower()),
            "tm": f["teammate"], **({"gk": True} if f["position"]["name"] == "Goalkeeper" else {}),
        } for f in shot.get("freeze_frame", [])]
        ff.append({"x": r1(e["location"][0]), "y": r1(e["location"][1]), "n": scorer["short"],
                   "r": POSITION.get(e["position"]["name"], ""), "tm": True, "sh": True})

        xg = round(shot.get("statsbomb_xg", 0), 3)
        shot_type = SHOT_TYPE.get(shot["type"]["name"], shot["type"]["name"].lower())
        penalty = shot["type"]["name"] == "Penalty"
        dist = shot_distance(e["location"])
        body = BODY.get(shot["body_part"]["name"], "altro")
        set_piece = shot_type in ("punizione", "corner") or (
            e["play_pattern"]["name"] in ("From Corner", "From Free Kick") and secs < 10)
        solo = any(
            c.get("player", {}).get("id") == e["player"]["id"] and (
                c["type"]["name"] == "Dribble" or (
                    c["type"]["name"] == "Carry"
                    and math.dist(c["location"], c["carry"]["end_location"]) * YARD > 20))
            for c in chain_full)
        counter = bool(chain_full) and secs < 15 and start_x < 60

        tags = []
        if penalty:
            tags.append("rigore")
        elif set_piece:
            tags.append("palla inattiva")
        if counter and not penalty:
            tags.append("contropiede")
        if n_passes >= 6:
            tags.append("azione manovrata")
        if solo and not penalty:
            tags.append("assolo")
        if not tags:
            tags.append("azione")

        flags = {
            "penalty": penalty, "freezer": xg < 0.05 and not penalty, "long": dist >= 22 and not penalty,
            "tiki": n_passes >= 8, "counter": counter and not penalty, "head": body == "testa",
            "solo": solo and not penalty, "cesarini": e["minute"] >= 88, "easy": xg >= 0.6 and not penalty,
            "setpiece": set_piece and not penalty, "default": True,
        }
        badges = [label for key, label in [
            ("freezer", "🥶 GOL DA FREEZER"), ("easy", "🛋 PORTA VUOTA O QUASI"), ("cesarini", "⏱ ZONA CESARINI"),
            ("long", "🚀 DA LONTANO"), ("head", "🧠 DI CAPOCCIA"), ("tiki", "🔁 TIKI-TAKA"),
            ("counter", "⚡ CONTROPIEDE"), ("solo", "🕺 ASSOLO"), ("penalty", "🎯 DAL DISCHETTO"),
        ] if flags[key]]

        gid = f"{m['match_id']}-{len(goals) + 1}"
        goal = {
            "id": gid, **meta,
            "team": team_info(team_name)["slug"], "opp": team_info(opp_name)["slug"],
            "period": e["period"], "minute": e["minute"] + 1, "second": e["second"],
            "scorer": scorer, "assist": assist,
            "before": before, "after": list(score),
            "xg": xg, "body": body, "shot_type": shot_type,
            "technique": TECHNIQUE.get(shot["technique"]["name"], ""),
            "penalty": penalty, "dist": r1(dist),
            "start": pt(e["location"]), "end": pt(shot["end_location"]),
            "chain": actions, "ff": ff, "secs": r1(secs), "passes": n_passes,
            "tags": tags, "badges": badges,
        }
        goal["line"] = describe(goal, n_passes, secs, start_x)
        key = next(k for k, _ in QUIPS if flags[k])
        template = pick(gid, dict(QUIPS)[key])
        goal["quip"] = template.format(
            xg=f"{xg:.2f}", pct=max(1, round(xg * 100)), scorer=scorer["short"], dist=round(dist),
            n=n_passes, sec=round(secs), min=goal["minute"],
            origin=origin_phrase(start_x).capitalize())
        goals.append(goal)
    return goals


def main() -> list[dict]:
    all_goals = []
    for m in load_competitions():
        goals = build_match(m)
        if goals:
            write_json(OUT / "goals" / f"{m['match_id']}.json", goals)
        all_goals += goals
    print(f"goals: {len(all_goals)}")
    return all_goals


if __name__ == "__main__":
    import random
    gs = main()
    for g in random.Random(7).sample(gs, 10):
        print(f"{g['date']} {g['team']} {g['minute']}' {g['scorer']['name']} xG={g['xg']} "
              f"{g['tags']} | {g['line']} | {g['quip']}")
