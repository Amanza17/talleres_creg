#!/usr/bin/env python3
import json
import math
import mimetypes
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
TAU = math.pi * 2
WORLD = {"width": 1000, "height": 680}
SENSOR_OFFSETS = [-9, 0, 9]

TRACK_DEFS = [
    {
        "id": "academy_gp",
        "name": "Academy GP",
        "difficulty": "Facil",
        "description": "Circuito grande con recta principal, curva larga y una horquilla sencilla.",
        "lineWidth": 25,
        "asphaltWidth": 128,
        "maxOff": 8,
        "laps": 1250,
        "speed": 46,
        "kp": 40,
        "controls": [[95, 555], [95, 110], [175, 82], [255, 125], [255, 205], [565, 205], [820, 120], [925, 230], [895, 390], [710, 485], [405, 515], [405, 600], [250, 600], [250, 555]],
    },
    {
        "id": "iberia_ring",
        "name": "Iberia Ring",
        "difficulty": "Media",
        "description": "Rectas muy largas, chicane de media velocidad y curva final pronunciada.",
        "lineWidth": 24,
        "asphaltWidth": 116,
        "maxOff": 6,
        "laps": 1400,
        "speed": 40,
        "kp": 50,
        "controls": [[88, 548], [88, 105], [210, 80], [292, 145], [292, 235], [475, 235], [520, 118], [790, 118], [930, 250], [900, 398], [760, 465], [555, 485], [485, 575], [305, 606], [240, 535]],
    },
    {
        "id": "harbor_street",
        "name": "Harbor Street",
        "difficulty": "Dificil",
        "description": "Trazado urbano grande con dos horquillas, S lenta y pocos metros de margen.",
        "lineWidth": 23,
        "asphaltWidth": 106,
        "maxOff": 4,
        "laps": 1550,
        "speed": 34,
        "kp": 60,
        "controls": [[92, 548], [92, 95], [245, 78], [320, 150], [320, 282], [470, 282], [470, 108], [735, 108], [918, 218], [905, 382], [745, 448], [592, 468], [572, 592], [408, 612], [360, 498], [224, 498], [224, 575]],
    },
    {
        "id": "grand_prix_pro",
        "name": "Grand Prix Pro",
        "difficulty": "Experto",
        "description": "Circuito largo con recta principal, doble apex, chicane estrecha y horquilla final.",
        "lineWidth": 22,
        "asphaltWidth": 98,
        "maxOff": 2,
        "laps": 1700,
        "speed": 30,
        "kp": 70,
        "controls": [[82, 555], [82, 88], [210, 68], [278, 126], [278, 222], [430, 222], [462, 92], [645, 92], [672, 215], [835, 145], [934, 278], [866, 405], [690, 405], [672, 528], [518, 612], [372, 540], [350, 450], [212, 450], [212, 555]],
    },
]


def catmull_rom(p0, p1, p2, p3, t):
    t2 = t * t
    t3 = t2 * t
    return [
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2*p0[0] - 5*p1[0] + 4*p2[0] - p3[0]) * t2 + (-p0[0] + 3*p1[0] - 3*p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2*p0[1] - 5*p1[1] + 4*p2[1] - p3[1]) * t2 + (-p0[1] + 3*p1[1] - 3*p2[1] + p3[1]) * t3),
    ]


def build_track(defn):
    controls = defn["controls"]
    points = []
    steps = 32
    for i in range(len(controls)):
        p0 = controls[(i - 1) % len(controls)]
        p1 = controls[i]
        p2 = controls[(i + 1) % len(controls)]
        p3 = controls[(i + 2) % len(controls)]
        for step in range(steps):
            points.append(catmull_rom(p0, p1, p2, p3, step / steps))
    return points

TRACKS = []
for item in TRACK_DEFS:
    copy = dict(item)
    copy["points"] = build_track(item)
    TRACKS.append(copy)


def clamp(value, low, high):
    return max(low, min(high, float(value)))


def nearest_on_line(track, x, y):
    best = {"distance": 10**9, "index": 0.0, "x": track["points"][0][0], "y": track["points"][0][1]}
    points = track["points"]
    for i, a in enumerate(points):
        b = points[(i + 1) % len(points)]
        abx = b[0] - a[0]
        aby = b[1] - a[1]
        denom = abx * abx + aby * aby or 1
        t = clamp(((x - a[0]) * abx + (y - a[1]) * aby) / denom, 0, 1)
        px = a[0] + abx * t
        py = a[1] + aby * t
        distance = math.hypot(x - px, y - py)
        if distance < best["distance"]:
            best = {"distance": distance, "index": i + t, "x": px, "y": py}
    return best


def simulate(code, track_index):
    track = TRACKS[track_index]
    points = track["points"]
    a, b = points[0], points[1]
    state = {
        "x": a[0], "y": a[1], "angle": math.atan2(b[1] - a[1], b[0] - a[0]),
        "left": 0.0, "right": 0.0, "speed": 0.0, "ticks": 0, "offTrack": 0,
        "progress": 0.0, "bestProgress": 0.0, "prevIndex": 0.0, "failed": False,
        "lapDone": False, "sensors": [0, 0, 0], "error": 0.0,
    }
    frames = []
    console = []

    class StopSimulation(Exception):
        pass

    def sensor_point(offset):
        forward = 23
        return {
            "x": state["x"] + math.cos(state["angle"]) * forward + math.cos(state["angle"] + math.pi / 2) * offset,
            "y": state["y"] + math.sin(state["angle"]) * forward + math.sin(state["angle"] + math.pi / 2) * offset,
        }

    def leer_linea():
        values = []
        for offset in SENSOR_OFFSETS:
            point = sensor_point(offset)
            near = nearest_on_line(track, point["x"], point["y"])
            values.append(1 if near["distance"] <= track["lineWidth"] / 2 else 0)
        state["sensors"] = values
        return tuple(values)

    def leer_error():
        values = leer_linea()
        if values[0] and not values[2]:
            state["error"] = -1.0
        elif values[2] and not values[0]:
            state["error"] = 1.0
        elif values[1]:
            state["error"] = 0.0
        else:
            near = nearest_on_line(track, state["x"], state["y"])
            right_x = math.cos(state["angle"] + math.pi / 2)
            right_y = math.sin(state["angle"] + math.pi / 2)
            state["error"] = clamp(((near["x"] - state["x"]) * right_x + (near["y"] - state["y"]) * right_y) / 30, -1.4, 1.4)
        return state["error"]

    def motor(izquierda, derecha):
        state["left"] = clamp(izquierda, -100, 100)
        state["right"] = clamp(derecha, -100, 100)

    def leer_velocidad():
        return state["speed"]

    def leer_progreso():
        return state["bestProgress"]

    def tiempo():
        return state["ticks"]

    def update_progress():
        near = nearest_on_line(track, state["x"], state["y"])
        delta = near["index"] - state["prevIndex"]
        count = len(points)
        if delta > count / 2:
            delta -= count
        if delta < -count / 2:
            delta += count
        state["prevIndex"] = near["index"]
        state["progress"] = clamp(state["progress"] + delta / count, -0.25, 1.2)
        state["bestProgress"] = max(state["bestProgress"], state["progress"])
        return near

    def record_frame():
        frames.append({
            "x": round(state["x"], 2), "y": round(state["y"], 2), "angle": state["angle"],
            "speed": round(state["speed"], 2), "ticks": state["ticks"], "offTrack": state["offTrack"],
            "progress": round(min(state["bestProgress"], 1), 4), "failed": state["failed"],
            "lapDone": state["lapDone"], "sensors": state["sensors"], "error": round(state["error"], 3),
        })

    def esperar():
        dt = 0.09
        base = (state["left"] + state["right"]) / 2
        turn = (state["right"] - state["left"]) / 70
        accel = base * 0.12
        state["speed"] = clamp(state["speed"] * 0.92 + accel, -18, 24)
        state["angle"] += turn * dt
        state["x"] += math.cos(state["angle"]) * state["speed"] * dt
        state["y"] += math.sin(state["angle"]) * state["speed"] * dt
        state["ticks"] += 1
        leer_error()
        near = update_progress()
        if near["distance"] > track["asphaltWidth"] / 2:
            state["offTrack"] += 1
            if state["offTrack"] > track.get("maxOff", 8):
                state["failed"] = True
                console.append(f"DNF: salida de pista. Maximo permitido: {track.get('maxOff', 8)} frames.")
                record_frame()
                raise StopSimulation()
        if state["bestProgress"] >= 0.995 and state["ticks"] > 80:
            state["lapDone"] = True
            console.append(f"FINISH: vuelta completa en {state['ticks']} ciclos, {state['offTrack']} salidas.")
            record_frame()
            raise StopSimulation()
        if state["ticks"] > 1800:
            console.append("Tiempo agotado: el programa no completo la vuelta.")
            record_frame()
            raise StopSimulation()
        record_frame()

    def imprimir(*items):
        if len(console) < 120:
            console.append(" ".join(str(item) for item in items))

    safe_builtins = {
        "abs": abs, "min": min, "max": max, "round": round, "range": range,
        "len": len, "float": float, "int": int, "print": imprimir,
        "sum": sum, "enumerate": enumerate,
    }
    env = {
        "leer_linea": leer_linea, "leer_error": leer_error, "motor": motor, "esperar": esperar,
        "leer_velocidad": leer_velocidad, "leer_progreso": leer_progreso, "tiempo": tiempo,
        "imprimir": imprimir, "math": math,
    }

    deadline = time.monotonic() + 6.0
    trace_steps = {"count": 0}

    def timeout_trace(frame, event, _arg):
        if frame.f_code.co_filename != "piloto.py":
            return None
        if event == "line":
            trace_steps["count"] += 1
            if trace_steps["count"] > 200000 or time.monotonic() > deadline:
                raise TimeoutError("Tiempo maximo de Python agotado. Revisa bucles infinitos.")
        return timeout_trace

    old_trace = sys.gettrace()
    sys.settrace(timeout_trace)
    try:
        run_globals = {"__builtins__": safe_builtins, **env}
        exec(compile(code, "piloto.py", "exec"), run_globals, run_globals)
        if not frames:
            record_frame()
        if not state["lapDone"] and not state["failed"]:
            console.append("El programa termino antes de completar la vuelta.")
    except StopSimulation:
        pass
    except Exception as exc:
        state["failed"] = True
        console.append(f"ERROR Python: {exc}")
        if not frames:
            record_frame()
    finally:
        sys.settrace(old_trace)

    return {"frames": frames, "console": console, "summary": frames[-1] if frames else {}, "track": track["id"]}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def send_json(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/tracks":
            payload = []
            for t in TRACKS:
                payload.append({k: t[k] for k in ("id", "name", "difficulty", "description", "lineWidth", "asphaltWidth", "laps", "speed", "kp", "points")})
            self.send_json({"world": WORLD, "tracks": payload})
            return
        if path == "/":
            path = "/index.html"
        target = (ROOT / path.lstrip("/")).resolve()
        if ROOT not in target.parents and target != ROOT:
            self.send_error(403)
            return
        if not target.exists() or target.is_dir():
            self.send_error(404)
            return
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(str(target))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if urlparse(self.path).path != "/simulate":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            track_index = int(payload.get("trackIndex", 0))
            if not 0 <= track_index < len(TRACKS):
                raise ValueError("trackIndex invalido")
            result = simulate(str(payload.get("code", "")), track_index)
            self.send_json(result)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 400)


def main():
    port = int(os.environ.get("PORT", "8765"))
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"Formula Python Lab: http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
