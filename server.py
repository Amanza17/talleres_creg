#!/usr/bin/env python3
import json
import math
import mimetypes
import os
import re
import sys
import time
import types
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
SOLUTIONS_DIR = ROOT / "solutions"
TAU = math.pi * 2
WORLD = {"width": 1000, "height": 680}
TRACK_WIDTH_SCALE = 2.0
SENSOR_OFFSETS = [-6, 0, 6]
CAMERA_PIXELS = 11
CAMERA_SPAN = 28
CONTROL_INTERVAL = 3
PHYSICS_DT = 0.02


def solution_path(name):
    name = str(name or "").strip()
    if not name.endswith(".py"):
        name = f"{name}.py"
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}\.py", name):
        raise ValueError("Nombre invalido. Usa algo como leon.py")
    SOLUTIONS_DIR.mkdir(exist_ok=True)
    target = (SOLUTIONS_DIR / name).resolve()
    if SOLUTIONS_DIR.resolve() not in target.parents:
        raise ValueError("Ruta invalida")
    return target


TRACK_DEFS = [
    {
        "id": "australia_melbourne",
        "name": "Avila - Muralla GP",
        "difficulty": "Intermedia",
        "description": "Albert Park con rectas cortas y cambios de direccion. Buen primer circuito serio para ajustar P y D.",
        "lineWidth": 3,
        "asphaltWidth": 13,
        "maxOff": 6,
        "laps": 1800,
        "speed": 34,
        "kp": 56,
        "controls": [[145,548],[112,500],[112,372],[120,248],[150,150],[224,108],[305,120],[338,178],[332,232],[392,266],[520,248],[648,205],[785,178],[892,238],[902,330],[836,410],[730,448],[615,462],[535,515],[440,560],[305,565],[238,510]],
    },
    {
        "id": "china_shanghai",
        "name": "Burgos - Morcilla Ring",
        "difficulty": "Dificil",
        "description": "Shanghai castiga el retardo del controlador: caracol largo, recta fuerte y horquilla final.",
        "lineWidth": 4,
        "asphaltWidth": 16,
        "maxOff": 8,
        "laps": 2200,
        "speed": 28,
        "kp": 68,
        "controls": [[210,505],[156,425],[160,312],[230,232],[332,206],[430,248],[458,334],[410,410],[305,422],[230,365],[210,278],[270,205],[390,168],[545,185],[704,176],[874,214],[924,312],[855,408],[704,432],[565,455],[505,535],[368,575],[255,550]],
    },
    {
        "id": "japan_suzuka",
        "name": "Leon - Catedral Chicane",
        "difficulty": "Pesadilla",
        "description": "Suzuka mezcla eses, cruce, horquilla y curvas rapidas. Necesita centroide fino y velocidad adaptativa.",
        "lineWidth": 4,
        "asphaltWidth": 16,
        "maxOff": 8,
        "laps": 2300,
        "speed": 26,
        "kp": 72,
        "controls": [[132,420],[190,352],[250,365],[276,318],[342,264],[420,278],[505,238],[604,194],[704,140],[846,195],[812,280],[696,320],[592,340],[584,418],[674,492],[724,540],[610,574],[480,540],[365,496],[245,532],[164,494]],
    },
    {
        "id": "bahrain_sakhir",
        "name": "Zamora - Sanabria Lago Chicane",
        "difficulty": "Intermedia",
        "description": "Sakhir pasado por el Lago de Sanabria: frenadas, curvas de traccion y un sector medio que penaliza entrar pasado.",
        "lineWidth": 3,
        "asphaltWidth": 12,
        "maxOff": 6,
        "laps": 1900,
        "speed": 32,
        "kp": 58,
        "controls": [[158,538],[122,420],[112,248],[188,150],[315,112],[430,170],[364,270],[438,350],[535,300],[585,210],[735,165],[890,214],[925,320],[838,446],[696,455],[615,520],[560,595],[408,582],[298,500],[225,562]],
    },
    {
        "id": "usa_miami",
        "name": "Segovia - Acueducto Raceway",
        "difficulty": "Dificil",
        "description": "Rectas, curva de estadio y zona lenta. Buen test para bajar velocidad cuando sube el error.",
        "lineWidth": 3,
        "asphaltWidth": 12,
        "maxOff": 8,
        "laps": 2000,
        "speed": 29,
        "kp": 66,
        "controls": [[160,510],[122,385],[140,268],[235,182],[355,176],[455,222],[505,302],[438,366],[515,430],[650,382],[770,300],[868,235],[888,318],[822,410],[708,492],[558,520],[420,486],[320,548],[220,565]],
    },
    {
        "id": "emilia_imola",
        "name": "Soria - Torrezno Trail",
        "difficulty": "Dificil",
        "description": "Fluido y traicionero: parece facil hasta que una curva larga te saca por acumulacion de error.",
        "lineWidth": 3,
        "asphaltWidth": 12,
        "maxOff": 5,
        "laps": 1900,
        "speed": 30,
        "kp": 64,
        "controls": [[125,505],[210,438],[325,365],[448,292],[570,220],[718,145],[892,210],[850,322],[732,372],[635,402],[612,512],[506,562],[378,550],[292,482],[220,560]],
    },
    {
        "id": "monaco_montecarlo",
        "name": "Valladolid - Pucela Hairpin",
        "difficulty": "Pesadilla",
        "description": "Lento, estrecho y sin margen. Si no usas memoria al perder linea, no pasas de la zona tecnica.",
        "lineWidth": 3,
        "asphaltWidth": 13,
        "maxOff": 6,
        "laps": 2400,
        "speed": 22,
        "kp": 80,
        "controls": [[132,520],[112,420],[118,284],[156,188],[232,132],[318,158],[330,232],[402,296],[500,260],[612,196],[760,145],[889,245],[846,332],[724,370],[635,372],[610,485],[510,560],[390,575],[318,505],[228,552]],
    },
    {
        "id": "spain_barcelona",
        "name": "El Bierzo - Botillo Sprint",
        "difficulty": "Intermedia",
        "description": "Barcelona combina recta, curva larga y sector final. Ideal para aprender velocidad adaptativa.",
        "lineWidth": 3,
        "asphaltWidth": 12,
        "maxOff": 6,
        "laps": 1900,
        "speed": 32,
        "kp": 58,
        "controls": [[120,515],[118,360],[120,220],[210,142],[330,135],[445,188],[575,158],[735,170],[885,240],[910,342],[822,438],[680,462],[575,448],[528,548],[430,586],[318,552],[250,480]],
    },
    {
        "id": "austria_spielberg",
        "name": "Salamanca - Hornazo GP",
        "difficulty": "Intermedia rapida",
        "description": "Pocas curvas pero mucha velocidad. Facil de entender, dificil de hacer rapido sin trompo.",
        "lineWidth": 3,
        "asphaltWidth": 12,
        "maxOff": 5,
        "laps": 1750,
        "speed": 34,
        "kp": 56,
        "controls": [[168,520],[142,375],[145,260],[245,178],[390,150],[545,120],[720,92],[875,205],[805,330],[678,420],[560,558],[410,542],[300,600],[235,548]],
    },
    {
        "id": "britain_silverstone",
        "name": "Palencia - Cristo del Otero Loop",
        "difficulty": "Muy dificil",
        "description": "Rapido y enlazado. Maggots-Becketts exige anticipacion, derivada y no pasarse con KP.",
        "lineWidth": 3,
        "asphaltWidth": 12,
        "maxOff": 7,
        "laps": 2100,
        "speed": 29,
        "kp": 68,
        "controls": [[145,515],[122,390],[120,255],[220,150],[345,175],[470,120],[610,145],[750,150],[882,242],[830,360],[700,360],[615,420],[660,500],[724,548],[610,578],[438,552],[322,510],[230,568]],
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

def build_segments(points):
    segments = []
    count = len(points)
    for i, a in enumerate(points):
        b = points[(i + 1) % count]
        abx = b[0] - a[0]
        aby = b[1] - a[1]
        segments.append((a[0], a[1], abx, aby, abx * abx + aby * aby or 1))
    return segments

TRACKS = []
for item in TRACK_DEFS:
    copy = dict(item)
    copy["lineWidth"] = round(copy["lineWidth"] * TRACK_WIDTH_SCALE, 2)
    copy["asphaltWidth"] = round(copy["asphaltWidth"] * TRACK_WIDTH_SCALE, 2)
    copy["maxOff"] = int(copy.get("maxOff", 8) * 10)
    copy["points"] = build_track(item)
    copy["segments"] = build_segments(copy["points"])
    TRACKS.append(copy)


def clamp(value, low, high):
    return max(low, min(high, float(value)))



def nearest_on_line(track, x, y, start=None, window=None):
    best_d2 = 10**18
    best = {"distance": 10**9, "index": 0.0, "x": track["points"][0][0], "y": track["points"][0][1]}
    segments = track["segments"]
    count = len(segments)
    if start is None or window is None:
        indices = range(count)
    else:
        center = int(start) % count
        span = int(window)
        indices = ((center + offset) % count for offset in range(-span, span + 1))
    for i in indices:
        ax, ay, abx, aby, denom = segments[i]
        t = ((x - ax) * abx + (y - ay) * aby) / denom
        if t < 0:
            t = 0
        elif t > 1:
            t = 1
        px = ax + abx * t
        py = ay + aby * t
        dx = x - px
        dy = y - py
        d2 = dx * dx + dy * dy
        if d2 < best_d2:
            best_d2 = d2
            best = {"distance": math.sqrt(d2), "index": i + t, "x": px, "y": py}
    return best


def simulate(code, track_index):
    track = TRACKS[track_index]
    points = track["points"]
    a, b = points[0], points[1]
    state = {
        "x": a[0], "y": a[1], "angle": math.atan2(b[1] - a[1], b[0] - a[0]),
        "left": 0.0, "right": 0.0, "appliedLeft": 0.0, "appliedRight": 0.0,
        "speed": 0.0, "yawRate": 0.0, "slip": 0.0, "spinFrames": 0, "ticks": 0, "offTrack": 0,
        "progress": 0.0, "bestProgress": 0.0, "prevIndex": 0.0, "failed": False,
        "lapDone": False, "sensors": [0, 0, 0], "camera": [0] * CAMERA_PIXELS, "error": 0.0,
        "cameraTick": -1, "lineTick": -1, "nearIndex": 0,
    }
    frames = []
    console = []

    class StopSimulation(Exception):
        pass

    def sensor_point(offset):
        forward = 8
        return {
            "x": state["x"] + math.cos(state["angle"]) * forward + math.cos(state["angle"] + math.pi / 2) * offset,
            "y": state["y"] + math.sin(state["angle"]) * forward + math.sin(state["angle"] + math.pi / 2) * offset,
        }

    def read_camera(pixels=CAMERA_PIXELS):
        pixels = int(clamp(pixels, 5, 31))
        if pixels % 2 == 0:
            pixels += 1
        if pixels == CAMERA_PIXELS and state["cameraTick"] == state["ticks"]:
            return tuple(state["camera"])
        half = (pixels - 1) / 2
        values = []
        for i in range(pixels):
            offset = ((i - half) / half) * (CAMERA_SPAN / 2)
            point = sensor_point(offset)
            near = nearest_on_line(track, point["x"], point["y"], state["nearIndex"], 26)
            values.append(1 if near["distance"] <= track["lineWidth"] / 2 else 0)
        center = pixels // 2
        state["sensors"] = [values[0], values[center], values[-1]]
        state["camera"] = values
        state["cameraTick"] = state["ticks"]
        return tuple(values)

    def read_line():
        if state["lineTick"] == state["ticks"]:
            return tuple(state["sensors"])
        camera = read_camera()
        values = [camera[2], camera[len(camera) // 2], camera[-3]]
        state["sensors"] = values
        state["lineTick"] = state["ticks"]
        return tuple(values)

    def update_internal_error():
        camera = read_camera()
        total = sum(camera)
        if total:
            center = (len(camera) - 1) / 2
            weighted = sum((i - center) * v for i, v in enumerate(camera))
            state["error"] = clamp(weighted / total / center, -1.4, 1.4)
        else:
            near = nearest_on_line(track, state["x"], state["y"], state["nearIndex"], 36)
            right_x = math.cos(state["angle"] + math.pi / 2)
            right_y = math.sin(state["angle"] + math.pi / 2)
            state["error"] = clamp(((near["x"] - state["x"]) * right_x + (near["y"] - state["y"]) * right_y) / 14, -1.4, 1.4)
        return state["error"]

    def set_motor(left, right):
        state["left"] = clamp(left, -100, 100)
        state["right"] = clamp(right, -100, 100)

    def get_speed():
        return state["speed"]

    def get_progress():
        return state["bestProgress"]

    def sim_time():
        return state["ticks"] * PHYSICS_DT

    def update_progress():
        near = nearest_on_line(track, state["x"], state["y"], state["nearIndex"], 36)
        delta = near["index"] - state["prevIndex"]
        count = len(points)
        if delta > count / 2:
            delta -= count
        if delta < -count / 2:
            delta += count
        state["prevIndex"] = near["index"]
        state["nearIndex"] = near["index"]
        state["progress"] = clamp(state["progress"] + delta / count, -0.25, 1.2)
        state["bestProgress"] = max(state["bestProgress"], state["progress"])
        return near

    def record_frame():
        frames.append({
            "x": round(state["x"], 2), "y": round(state["y"], 2), "angle": state["angle"],
            "speed": round(state["speed"], 2), "ticks": state["ticks"], "time": round(state["ticks"] * PHYSICS_DT, 3), "offTrack": state["offTrack"],
            "progress": round(min(state["bestProgress"], 1), 4), "failed": state["failed"],
            "lapDone": state["lapDone"], "sensors": state["sensors"], "camera": state["camera"],
            "error": round(state["error"], 3), "slip": round(state["slip"], 3),
        })

    def physics_tick():
        dt = PHYSICS_DT

        # Motores con inercia: un P enorme ya no cambia el giro instantaneamente.
        state["appliedLeft"] += (state["left"] - state["appliedLeft"]) * 0.42
        state["appliedRight"] += (state["right"] - state["appliedRight"]) * 0.42

        base = (state["appliedLeft"] + state["appliedRight"]) / 2
        diff = state["appliedRight"] - state["appliedLeft"]
        accel = base * 0.55
        drag = 0.012 * state["speed"] * abs(state["speed"])
        state["speed"] = clamp(state["speed"] + (accel - drag) * dt, -35, 72)

        desired_yaw = diff / 42
        state["yawRate"] += (desired_yaw - state["yawRate"]) * 0.22

        # Limite simple de adherencia: si pides demasiado giro a mucha velocidad, subvira/derrapa.
        grip_limit = 0.30 + 10.0 / (abs(state["speed"]) + 8.0)
        overload = max(0.0, abs(state["yawRate"]) - grip_limit)
        if overload:
            state["slip"] = min(1.0, state["slip"] * 0.82 + overload * 1.25)
            state["yawRate"] = math.copysign(grip_limit, state["yawRate"])
        else:
            state["slip"] *= 0.70

        state["angle"] += state["yawRate"] * dt
        forward_speed = state["speed"] * (1.0 - state["slip"] * 0.34)
        lateral_speed = state["yawRate"] * state["speed"] * state["slip"] * 0.62
        state["x"] += (math.cos(state["angle"]) * forward_speed + math.cos(state["angle"] + math.pi / 2) * lateral_speed) * dt
        state["y"] += (math.sin(state["angle"]) * forward_speed + math.sin(state["angle"] + math.pi / 2) * lateral_speed) * dt
        state["ticks"] += 1

        update_internal_error()
        near = update_progress()

        if state["slip"] > 0.75:
            state["failed"] = True
            console.append("DNF: trompo por exceso de giro. Baja KP o anade KD.")
            record_frame()
            raise StopSimulation()
        if state["slip"] > 0.30:
            state["spinFrames"] += 1
        else:
            state["spinFrames"] = max(0, state["spinFrames"] - 2)
        if state["spinFrames"] > 120:
            state["failed"] = True
            console.append("DNF: perdida de adherencia. Baja KP o anade KD.")
            record_frame()
            raise StopSimulation()

        if near["distance"] > track["asphaltWidth"] / 2:
            state["offTrack"] += 1
            if state["offTrack"] > track.get("maxOff", 8):
                state["failed"] = True
                console.append(f"DNF: salida de pista. Maximo permitido: {track.get('maxOff', 8)} frames.")
                record_frame()
                raise StopSimulation()
        if state["bestProgress"] >= 0.995 and state["ticks"] > 80:
            state["lapDone"] = True
            console.append(f"FINISH: vuelta completa en {state['ticks'] * PHYSICS_DT:.2f}s, {state['ticks']} ticks, {state['offTrack']} salidas.")
            record_frame()
            raise StopSimulation()
        if state["ticks"] > 9000:
            console.append("Tiempo agotado: el programa no completo la vuelta.")
            record_frame()
            raise StopSimulation()
        record_frame()

    def sleep(cycles=CONTROL_INTERVAL):
        cycles = int(clamp(cycles, 1, 10))
        for _ in range(cycles):
            physics_tick()

    def py_print(*items):
        if len(console) < 120:
            console.append(" ".join(str(item) for item in items))

    def limited_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name != "spanish":
            raise ImportError("Solo se permite importar spanish en esta actividad")
        mod = types.ModuleType("spanish")
        mod.__all__ = [
            "leer_linea", "motor", "esperar", "leer_velocidad",
            "leer_progreso", "tiempo", "imprimir", "leer_camara",
        ]
        mod.leer_linea = read_line
        mod.leer_camara = read_camera
        mod.motor = set_motor
        mod.esperar = sleep
        mod.leer_velocidad = get_speed
        mod.leer_progreso = get_progress
        mod.tiempo = sim_time
        mod.imprimir = py_print
        return mod

    safe_builtins = {
        "abs": abs, "min": min, "max": max, "round": round, "range": range,
        "len": len, "float": float, "int": int, "print": py_print,
        "sum": sum, "enumerate": enumerate, "__import__": limited_import,
    }
    env = {
        "read_line": read_line, "read_camera": read_camera, "set_motor": set_motor, "sleep": sleep,
        "get_speed": get_speed, "get_progress": get_progress, "time": sim_time,
        "math": math,
    }

    deadline = time.monotonic() + 90.0
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
        if path == "/solutions":
            SOLUTIONS_DIR.mkdir(exist_ok=True)
            files = sorted(item.name for item in SOLUTIONS_DIR.glob("*.py") if item.is_file())
            self.send_json({"files": files})
            return
        if path == "/solution":
            try:
                from urllib.parse import parse_qs
                query = parse_qs(urlparse(self.path).query)
                target = solution_path(query.get("name", [""])[0])
                if not target.exists():
                    self.send_json({"error": "Archivo no encontrado"}, 404)
                    return
                self.send_json({"name": target.name, "code": target.read_text(encoding="utf-8")})
            except Exception as exc:
                self.send_json({"error": str(exc)}, 400)
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
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", "0"))
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if path == "/simulate":
                track_index = int(payload.get("trackIndex", 0))
                if not 0 <= track_index < len(TRACKS):
                    raise ValueError("trackIndex invalido")
                result = simulate(str(payload.get("code", "")), track_index)
                self.send_json(result)
                return
            if path == "/solution":
                target = solution_path(payload.get("name", ""))
                code = str(payload.get("code", ""))
                if len(code) > 200_000:
                    raise ValueError("Archivo demasiado grande")
                target.write_text(code, encoding="utf-8", newline="\n")
                self.send_json({"saved": True, "name": target.name})
                return
            self.send_error(404)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 400)


def main():
    port = int(os.environ.get("PORT", "8765"))
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"Formula Python Lab: http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
