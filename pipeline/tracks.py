"""Estimate where every player on the pitch is at each step of a goal move.

StatsBomb open data has no tracking: the only full snapshot is the shot freeze frame.
For every player we therefore combine
  * anchors: exact locations from events they appear in (on-ball actions, ball receipts,
    pressures, duels...) and the freeze frame at the shot;
  * a baseline: the player's average location in the match, shifted with the ball
    (the team block slides towards the ball).
Between two anchors the position is interpolated; away from anchors the offset from the
baseline decays with time. Each keyframe carries an `exact` flag.
All coordinates are in the scoring team's frame (attacking left -> right).
"""
import math
from collections import defaultdict

from common import r1, short_name, ts_seconds

DECAY_S = 4.0       # seconds for an anchor's influence to fade (1/e)
EXACT_S = 0.35      # an anchor this close in time counts as an exact position
WINDOW_BEFORE = 6.0  # also use events this many seconds before the move starts
SHIFT_X, SHIFT_Y = 0.32, 0.12
GK_SHIFT = 0.12
CARDS_OFF = {"Red Card", "Second Yellow"}


def flip(loc):
    return [120 - loc[0], 80 - loc[1]]


def on_pitch(events, shot_index):
    """team name -> {player_id: (jersey, position name)} for players on the pitch at the shot."""
    teams = {}
    for e in events:
        if e["index"] >= shot_index:
            break
        t = e["type"]["name"]
        team = e.get("team", {}).get("name")
        if t == "Starting XI":
            teams[team] = {p["player"]["id"]: (p["jersey_number"], p["position"]["name"])
                           for p in e["tactics"]["lineup"]}
        elif t == "Tactical Shift" and team in teams:
            for p in e["tactics"]["lineup"]:
                if p["player"]["id"] in teams[team]:
                    teams[team][p["player"]["id"]] = (p["jersey_number"], p["position"]["name"])
        elif t == "Substitution" and team in teams:
            out = teams[team].pop(e["player"]["id"], (None, e.get("position", {}).get("name", "")))
            teams[team][e["substitution"]["replacement"]["id"]] = (None, out[1])
        else:
            card = (e.get("foul_committed") or e.get("bad_behaviour") or {}).get("card", {}).get("name")
            if card in CARDS_OFF and team in teams:
                teams[team].pop(e.get("player", {}).get("id"), None)
    return teams


def build_tracks(events, shot, key_times, first_t, names, positions_it):
    """Return one entry per player on the pitch with a keyframe per entry of key_times
    (seconds relative to first_t)."""
    team = shot["team"]["name"]
    period = shot["period"]
    lineups = on_pitch(events, shot["index"])

    def frame(e, loc):
        return list(loc) if e.get("team", {}).get("name") == team else flip(loc)

    # Baselines: mean location of each player's events in the whole match.
    sums = defaultdict(lambda: [0.0, 0.0, 0])
    for e in events:
        if "location" in e and "player" in e:
            x, y = frame(e, e["location"])
            s = sums[e["player"]["id"]]
            s[0] += x
            s[1] += y
            s[2] += 1
    base = {pid: (s[0] / s[2], s[1] / s[2]) for pid, s in sums.items() if s[2]}

    # Anchors within the move's time window.
    shot_t = ts_seconds(shot["timestamp"]) - first_t
    anchors = defaultdict(list)
    for e in events:
        if e["period"] != period or e["index"] > shot["index"]:
            continue
        t = ts_seconds(e["timestamp"]) - first_t
        if t < -WINDOW_BEFORE:
            continue
        if "location" in e and "player" in e:
            anchors[e["player"]["id"]].append((t, *frame(e, e["location"])))
            end = (e.get("pass") or {}).get("end_location")
            rec = (e.get("pass") or {}).get("recipient")
            if end and rec and "outcome" not in e["pass"]:
                anchors[rec["id"]].append((t + (e.get("duration") or 0.5), *frame(e, end)))
            cend = (e.get("carry") or {}).get("end_location")
            if cend:
                anchors[e["player"]["id"]].append((t + (e.get("duration") or 0.5), *frame(e, cend)))
    for f in shot["shot"].get("freeze_frame", []):
        anchors[f["player"]["id"]].append((shot_t, *f["location"]))
    anchors[shot["player"]["id"]].append((shot_t, *shot["location"]))
    for a in anchors.values():
        a.sort()

    # Ball position at each key time, for the block shift.
    ball_at = []
    for kt in key_times:
        best = None
        for e in events:
            if e["period"] != period or e["index"] > shot["index"] or "location" not in e:
                continue
            t = ts_seconds(e["timestamp"]) - first_t
            if t <= kt + 1e-6 and (best is None or t >= best[0]):
                best = (t, frame(e, e["location"]))
        ball_at.append(best[1] if best else list(shot["location"]))

    def estimate(pid, k, gk):
        bx, by = base.get(pid, (60.0, 40.0))
        f = GK_SHIFT if gk else 1.0
        x = bx + SHIFT_X * f * (ball_at[k][0] - 60)
        y = by + SHIFT_Y * f * (ball_at[k][1] - 40)
        return x, y

    def position(pid, k, gk):
        kt = key_times[k]
        ex, ey = estimate(pid, k, gk)
        a = anchors.get(pid, [])
        before = [p for p in a if p[0] <= kt]
        after = [p for p in a if p[0] > kt]
        b = before[-1] if before else None
        n = after[0] if after else None
        exact = any(abs(p[0] - kt) <= EXACT_S for p in a)
        if b and n:
            span = n[0] - b[0]
            w = (kt - b[0]) / span if span > 0 else 0
            x, y = b[1] + (n[1] - b[1]) * w, b[2] + (n[2] - b[2]) * w
            # Long gaps between anchors: pull towards the shifted baseline in the middle.
            pull = 1 - math.exp(-span / (2 * DECAY_S * 2))
            m = pull * math.sin(math.pi * w)
            x, y = x + (ex - x) * m, y + (ey - y) * m
        elif b or n:
            p = b or n
            w = math.exp(-abs(kt - p[0]) / DECAY_S)
            x, y = ex + (p[1] - ex) * w, ey + (p[2] - ey) * w
        else:
            x, y = ex, ey
        return [r1(min(120, max(0, x))), r1(min(80, max(0, y))), 1 if exact else 0]

    players = []
    for team_name, roster in lineups.items():
        mate = team_name == team
        for pid, (jersey, pos) in roster.items():
            gk = pos == "Goalkeeper"
            info = names.get(pid, {"name": str(pid), "jersey": jersey})
            entry = {
                "i": pid, "n": short_name(info["name"]), "j": info.get("jersey") or jersey,
                "r": positions_it.get(pos, pos.lower()), "tm": mate,
                "k": [position(pid, k, gk) for k in range(len(key_times))],
            }
            if gk:
                entry["gk"] = True
            players.append(entry)
    return players
