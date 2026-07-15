const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const editor = document.querySelector("#codeEditor");
const codeHighlight = document.querySelector("#codeHighlight");
const lineNumbers = document.querySelector("#lineNumbers");
const output = document.querySelector("#consoleOutput");
const message = document.querySelector("#message");
const lapText = document.querySelector("#lapText");
const speedText = document.querySelector("#speedText");
const timeText = document.querySelector("#timeText");
const offText = document.querySelector("#offText");
const errorText = document.querySelector("#errorText");
const cameraStrip = document.querySelector("#cameraStrip");
const cameraText = document.querySelector("#cameraText");
const trackList = document.querySelector("#trackList");
const simTitle = document.querySelector("#simTitle");
const runBtn = document.querySelector("#runBtn");
const stepBtn = document.querySelector("#stepBtn");
const resetBtn = document.querySelector("#resetBtn");
const zoomInBtn = document.querySelector("#zoomInBtn");
const zoomOutBtn = document.querySelector("#zoomOutBtn");
const snippetSelect = document.querySelector("#snippetSelect");
const fileSelect = document.querySelector("#fileSelect");
const fileNameInput = document.querySelector("#fileNameInput");
const fileList = document.querySelector("#fileList");
const loadFileBtn = document.querySelector("#loadFileBtn");
const saveFileBtn = document.querySelector("#saveFileBtn");

const TAU = Math.PI * 2;
const SIM_DT = 0.02;
const MAX_GAUGE_SPEED = 90;
const sensorOffsets = [-6, 0, 6];
const cameraPixels = 11;
const cameraSpan = 28;
let world = { width: 1000, height: 680 };
let tracks = [];
let currentTrackIndex = 0;
let frames = [];
let frameIndex = 0;
let player = null;
let car = null;
let zoom = 1;
let playbackStep = 1;
let savedFiles = [];

function starterFor(track) {
  return `# Python real: este codigo se ejecuta en server.py
# Circuito: ${track.name} (${track.difficulty})
# Reto: completa las funciones. No basta con ir recto.

MAX_PASOS = ${Math.ceil(Math.max(track.laps * 2, 9900) / 3)}

# Ajusta estos valores despues de mirar la telemetria.
STRAIGHT_SPEED = ${Math.max(30, track.speed - 6)}
CORNER_SPEED = ${Math.max(24, track.speed - 18)}
KP = 0
KD = 0

last_error = 0
last_side = 0


def calculate_error():
    # TODO 1:
    # read_camera() devuelve 11 valores: 1=linea, 0=asfalto.
    # Calcula el centroide de los pixeles activos.
    # Error negativo = linea a la izquierda; positivo = derecha.
    camera = read_camera()
    return 0


def choose_speed(error):
    # TODO 2:
    # Baja la velocidad cuando el error sea grande.
    # Puedes usar abs(error), get_speed() o get_progress().
    return STRAIGHT_SPEED


def control(error):
    # TODO 3:
    # Implementa un controlador P o PD.
    # correction = error * KP + derivative * KD
    return 0


for paso in range(MAX_PASOS):
    error = calculate_error()
    speed = choose_speed(error)
    correction = control(error)

    set_motor(speed - correction, speed + correction)
    sleep()

    # Puedes imprimir cada 25 decisiones para depurar sin saturar consola.
    if paso % 25 == 0:
        print(paso, read_line(), round(error, 2), round(get_speed(), 1))`;
}

function ifSnippet(track) {
  return `# Plantilla alternativa: maquina de estados.
# Completa las ramas y usa memoria para recuperar la linea.

MAX_PASOS = ${Math.ceil(Math.max(track.laps * 2, 9900) / 3)}
speed = ${Math.max(24, track.speed - 14)}
last_side = 0

for paso in range(MAX_PASOS):
    left, center, right = read_line()

    if center == 1:
        # TODO: recta o curva suave
        set_motor(0, 0)
    elif left == 1:
        # TODO: gira hacia la izquierda y guarda last_side
        set_motor(0, 0)
    elif right == 1:
        # TODO: gira hacia la derecha y guarda last_side
        set_motor(0, 0)
    else:
        # TODO: recuperacion cuando no ve linea
        # usa last_side para buscar sin salirte.
        set_motor(0, 0)

    sleep()`;
}

function debugSnippet() {
  return `# Exploracion: no completa la vuelta, solo sirve para entender sensores.
for paso in range(160):
    left, center, right = read_line()
    print(paso, "sensores=", (left, center, right), "v=", round(get_speed(), 1))
    set_motor(30, 30)
    sleep()`;
}

function solutionSnippet(track) {
  return `# Solucion de referencia: el error se calcula desde read_camera().
# Funciona en las diez pistas, pero aun se puede mejorar.

MAX_PASOS = ${Math.ceil(Math.max(track.laps * 2, 9900) / 3)}
STRAIGHT_SPEED = 8
CORNER_SPEED = 4
KP = 14
KD = 6

last_error = 0
last_side = 0
lost_frames = 0


def calculate_error():
    global last_side, lost_frames
    camera = read_camera()
    total = sum(camera)

    if total > 0:
        center = (len(camera) - 1) / 2
        weighted = 0
        for i, value in enumerate(camera):
            weighted += (i - center) * value
        error = weighted / total / center
        last_side = -1 if error < 0 else 1 if error > 0 else last_side
        lost_frames = 0
        return error

    lost_frames += 1
    return last_side * min(1.8, 0.8 + lost_frames * 0.08)


def choose_speed(error):
    if abs(error) > 0.7:
        return CORNER_SPEED
    if abs(error) > 0.18:
        return CORNER_SPEED
    return STRAIGHT_SPEED


def control(error):
    global last_error
    derivative = error - last_error
    last_error = error
    return error * KP + derivative * KD


for paso in range(MAX_PASOS):
    error = calculate_error()
    speed = choose_speed(error)
    correction = control(error)

    set_motor(speed - correction, speed + correction)
    sleep()

    if paso % 50 == 0:
        print(paso, "error=", round(error, 2), "camara=", read_camera())`;
}

async function boot() {
  try {
    const response = await fetch("/tracks");
    if (!response.ok) throw new Error("No se pudo cargar /tracks");
    const data = await response.json();
    world = data.world;
    tracks = data.tracks;
    selectTrack(0, true);
    await refreshFiles();
    setMessage("Listo. Escribe Python y pulsa Ejecutar.", "");
  } catch (error) {
    setMessage("Abre la actividad desde server.py: python3 server.py", "error");
    output.textContent = `${error.message}\n`;
  }
}

function slugFileName(name) {
  return `${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "piloto"}.py`;
}

function selectTrack(index, replaceCode = false) {
  currentTrackIndex = index;
  const track = tracks[index];
  if (!fileNameInput.value || fileNameInput.value === "piloto.py") fileNameInput.value = slugFileName(track.name);
  if (replaceCode || !editor.value.trim()) editor.value = starterFor(track);
  frames = [];
  frameIndex = 0;
  car = startFrame(track);
  updateLineNumbers();
  renderTrackList();
  updateText();
  updateTelemetry(car);
  render();
}

function startFrame(track) {
  const a = track.points[0];
  const b = track.points[1];
  return {
    x: a[0], y: a[1], angle: Math.atan2(b[1] - a[1], b[0] - a[0]), speed: 0,
    ticks: 0, offTrack: 0, progress: 0, sensors: [0, 0, 0], error: 0, failed: false, lapDone: false
  };
}

function renderTrackList() {
  trackList.innerHTML = "";
  tracks.forEach((track, index) => {
    const btn = document.createElement("button");
    btn.className = `track-btn${index === currentTrackIndex ? " active" : ""}`;
    btn.type = "button";
    btn.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><strong>${track.name}</strong><small>${track.difficulty}</small>`;
    btn.addEventListener("click", () => selectTrack(index, true));
    trackList.appendChild(btn);
  });
}

function updateText() {
  const track = tracks[currentTrackIndex];
  simTitle.textContent = track.name;
}


async function refreshFiles() {
  try {
    const response = await fetch("/solutions");
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "No se pudieron listar archivos");
    savedFiles = data.files || [];
    fileSelect.innerHTML = `<option value="">Nuevo archivo</option>` + savedFiles.map((name) => `<option value="${name}">${name}</option>`).join("");
    renderFileList();
  } catch (error) {
    setMessage(error.message, "error");
  }
}


function renderFileList() {
  if (!fileList) return;
  if (!savedFiles.length) {
    fileList.innerHTML = `<div class="empty">No hay archivos en solutions/</div>`;
    return;
  }
  fileList.innerHTML = "";
  savedFiles.forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = name === fileNameInput.value ? "active" : "";
    button.innerHTML = `<span>${name}</span>`;
    button.addEventListener("click", () => {
      fileSelect.value = name;
      fileNameInput.value = name;
      renderFileList();
      loadSelectedFile();
    });
    fileList.appendChild(button);
  });
}

function normalizedFileName() {
  let name = fileNameInput.value.trim();
  if (!name) name = slugFileName(tracks[currentTrackIndex]?.name || "piloto");
  if (!name.endsWith(".py")) name += ".py";
  fileNameInput.value = name;
  return name;
}

async function saveCurrentFile() {
  const name = normalizedFileName();
  try {
    const response = await fetch("/solution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code: editor.value })
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "No se pudo guardar");
    await refreshFiles();
    fileSelect.value = data.name;
    fileNameInput.value = data.name;
    renderFileList();
    setMessage(`Guardado en solutions/${data.name}.`, "win");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function loadSelectedFile() {
  const name = fileSelect.value || normalizedFileName();
  if (!name) return;
  try {
    const response = await fetch(`/solution?name=${encodeURIComponent(name)}`);
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "No se pudo cargar");
    editor.value = data.code || "";
    fileNameInput.value = data.name;
    fileSelect.value = data.name;
    renderFileList();
    updateLineNumbers();
    frames = [];
    frameIndex = 0;
    car = startFrame(tracks[currentTrackIndex]);
    updateTelemetry(car);
    render();
    setMessage(`Cargado solutions/${data.name}.`, "");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function runPython() {
  stopPlayer();
  setMessage("Ejecutando Python real...", "");
  output.textContent = "";
  try {
    const response = await fetch("/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIndex: currentTrackIndex, code: editor.value })
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "Error ejecutando Python");
    frames = data.frames || [];
    playbackStep = Math.max(1, Math.ceil(frames.length / 1200));
    frameIndex = 0;
    output.textContent = (data.console || []).join("\n");
    if (!output.textContent) output.textContent = "Python terminado sin imprimir mensajes.";
    if (frames.length) {
      car = frames[0];
      playFrames();
    }
  } catch (error) {
    setMessage(error.message, "error");
    output.textContent = `ERROR: ${error.message}\n`;
  }
}

function playFrames() {
  stopPlayer();
  player = setInterval(() => {
    if (frameIndex >= frames.length) {
      stopPlayer();
      summarize();
      return;
    }
    const nextIndex = Math.min(frames.length - 1, frameIndex + playbackStep - 1);
    car = frames[nextIndex];
    frameIndex = nextIndex + 1;
    updateTelemetry(car);
    render();
  }, 16);
}

function stepFrame() {
  if (!frames.length) {
    runPython();
    return;
  }
  stopPlayer();
  if (frameIndex < frames.length) {
    car = frames[frameIndex++];
  }
  updateTelemetry(car);
  render();
  if (frameIndex >= frames.length) summarize();
}

function summarize() {
  if (!car) return;
  if (car.lapDone) setMessage(`Vuelta completada en ${formatSeconds(car.time ?? car.ticks * SIM_DT)}.`, "win");
  else if (car.failed) setMessage("Simulacion fallida. Revisa velocidad, kp o logica.", "error");
  else setMessage("El programa termino antes de completar la vuelta.", "");
}

function stopPlayer() {
  if (player) clearInterval(player);
  player = null;
}

function reset() {
  stopPlayer();
  frames = [];
  frameIndex = 0;
  car = startFrame(tracks[currentTrackIndex]);
  updateTelemetry(car);
  setMessage("Simulacion reiniciada.", "");
  render();
}

function fitCanvas() {
  const width = Math.max(420, Math.floor(canvas.clientWidth));
  const height = Math.max(360, Math.floor(canvas.clientHeight));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function render() {
  if (!tracks.length || !car) return;
  fitCanvas();
  const baseScale = Math.min(canvas.width / world.width, canvas.height / world.height);
  const scale = baseScale * zoom;
  const ox = (canvas.width - world.width * scale) / 2;
  const oy = (canvas.height - world.height * scale) / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111b15";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  drawEnvironment();
  drawTrack();
  drawStartLine();
  drawDrivenPath();
  drawCar();
  drawSensors();
}

function drawEnvironment() {
  const grad = ctx.createLinearGradient(0, 0, 1000, 680);
  grad.addColorStop(0, "#20361f");
  grad.addColorStop(1, "#101b15");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, world.width, world.height);
  ctx.strokeStyle = "rgba(255,255,255,.045)";
  for (let x = -150; x < world.width + 160; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 140, world.height);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,.08)";
  ctx.fillRect(72, 72, 110, 24);
  ctx.fillRect(790, 568, 130, 26);
}

function strokePath(points, width, color, dash = null) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  points.forEach((p, index) => index ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawTrack() {
  const track = tracks[currentTrackIndex];
  strokePath(track.points, track.asphaltWidth + 2, "#f4f5f7", [7, 7]);
  strokePath(track.points, track.asphaltWidth + 1, "#b91c2c", [9, 9]);
  strokePath(track.points, track.asphaltWidth, "#343842");
  strokePath(track.points, Math.max(2, track.asphaltWidth - 3), "#282d35");
  strokePath(track.points, 0.6, "rgba(255,255,255,.22)", [16, 24]);
  strokePath(track.points, track.lineWidth, "#050608");
}

function drawStartLine() {
  const track = tracks[currentTrackIndex];
  const points = track.points;
  const a = points[0];
  const b = points[1];
  const width = Math.max(18, track.asphaltWidth * 1.45);
  const length = Math.max(12, track.asphaltWidth * 0.95);
  const cols = 6;
  const rows = 4;
  const cellW = width / cols;
  const cellH = length / rows;
  ctx.save();
  ctx.translate(a[0], a[1]);
  ctx.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2);
  ctx.strokeStyle = "rgba(0,0,0,.45)";
  ctx.lineWidth = 1.2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? "#f8fafc" : "#101114";
      ctx.fillRect(-width / 2 + col * cellW, -length / 2 + row * cellH, cellW, cellH);
      ctx.strokeRect(-width / 2 + col * cellW, -length / 2 + row * cellH, cellW, cellH);
    }
  }
  ctx.restore();
}

function drawDrivenPath() {
  if (!frames.length) return;
  const visibleCount = Math.max(1, Math.min(frameIndex || 1, frames.length));
  const visible = frames.slice(0, visibleCount);
  if (visible.length < 2) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = "rgba(0,0,0,.35)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  visible.forEach((frame, index) => {
    if (index === 0) ctx.moveTo(frame.x, frame.y);
    else ctx.lineTo(frame.x, frame.y);
  });
  ctx.stroke();

  for (let i = 1; i < visible.length; i++) {
    const previous = visible[i - 1];
    const current = visible[i];
    const offTrackNow = (current.offTrack || 0) > (previous.offTrack || 0);
    ctx.strokeStyle = offTrackNow ? "rgba(255,77,104,.88)" : "rgba(40,209,124,.72)";
    ctx.lineWidth = offTrackNow ? 4.5 : 3.5;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCar() {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle + Math.PI / 2);
  ctx.scale(0.38, 0.38);

  ctx.fillStyle = "rgba(0,0,0,.34)";
  ctx.beginPath();
  ctx.ellipse(0, 10, 38, 66, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#06080c";
  roundRect(-40, -34, 16, 30, 5);
  roundRect(24, -34, 16, 30, 5);
  roundRect(-41, 14, 17, 34, 5);
  roundRect(24, 14, 17, 34, 5);

  ctx.fillStyle = "#f8fafc";
  roundRect(-38, -66, 76, 9, 3);
  roundRect(-42, 50, 84, 10, 3);
  ctx.fillStyle = "#111827";
  roundRect(-31, -58, 62, 5, 2);
  roundRect(-35, 45, 70, 5, 2);

  const body = ctx.createLinearGradient(0, -68, 0, 55);
  body.addColorStop(0, "#ff3f5d");
  body.addColorStop(.45, "#d20f2f");
  body.addColorStop(1, "#6f0b1b");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -72);
  ctx.bezierCurveTo(14, -58, 18, -36, 14, -10);
  ctx.bezierCurveTo(24, 9, 19, 34, 8, 54);
  ctx.lineTo(-8, 54);
  ctx.bezierCurveTo(-19, 34, -24, 9, -14, -10);
  ctx.bezierCurveTo(-18, -36, -14, -58, 0, -72);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#0f1724";
  roundRect(-9, -18, 18, 28, 8);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -8, 15, Math.PI * .1, Math.PI * .9, false);
  ctx.stroke();

  ctx.fillStyle = "#ffd15c";
  roundRect(-5, -43, 10, 20, 4);
  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.fillRect(-2, -62, 4, 104);
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawSensors() {
  const camera = car.camera || [];
  const half = (cameraPixels - 1) / 2;
  for (let i = 0; i < cameraPixels; i++) {
    const offset = ((i - half) / half) * (cameraSpan / 2);
    const point = sensorPoint(offset);
    const on = camera[i] === 1;
    if (i === 0) {
      ctx.strokeStyle = "rgba(245,124,0,.28)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(car.x, car.y); ctx.lineTo(point.x, point.y); ctx.stroke();
    }
    ctx.fillStyle = on ? "#28d17c" : "rgba(255,255,255,.28)";
    ctx.beginPath(); ctx.arc(point.x, point.y, on ? 2.4 : 1.7, 0, TAU); ctx.fill();
  }
}

function sensorPoint(offset) {
  const forward = 8;
  return {
    x: car.x + Math.cos(car.angle) * forward + Math.cos(car.angle + Math.PI / 2) * offset,
    y: car.y + Math.sin(car.angle) * forward + Math.sin(car.angle + Math.PI / 2) * offset
  };
}

function paintedPercent() {
  if (!frames.length) return 0;
  const visibleCount = Math.max(0, Math.min(frameIndex || 0, frames.length));
  return Math.round((visibleCount / frames.length) * 100);
}

function formatSeconds(value) {
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  if (minutes <= 0) return `${seconds.toFixed(2)} s`;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function updateTelemetry(frame) {
  const kmh = Math.max(0, Math.round((frame.speed || 0) * 3.6));
  const seconds = Math.max(0, frame.time ?? ((frame.ticks || 0) * SIM_DT));
  const gaugeRatio = Math.min(kmh, MAX_GAUGE_SPEED) / MAX_GAUGE_SPEED;
  const needleDeg = -125 + gaugeRatio * 250;

  lapText.textContent = `${paintedPercent()}%`;
  speedText.textContent = kmh;
  speedText.closest(".speedometer")?.style.setProperty("--needle", `${needleDeg}deg`);
  timeText.textContent = formatSeconds(seconds);
  offText.textContent = frame.offTrack || 0;
  errorText.textContent = Number(frame.error || 0).toFixed(2);
  updateCameraView(frame.camera || []);
}

function updateCameraView(camera) {
  if (!cameraStrip.children.length) {
    cameraStrip.innerHTML = Array.from({ length: cameraPixels }, () => "<i></i>").join("");
  }
  const total = camera.reduce((sum, value) => sum + value, 0);
  let centroid = -1;
  if (total > 0) {
    centroid = camera.reduce((sum, value, index) => sum + index * value, 0) / total;
  }
  [...cameraStrip.children].forEach((cell, index) => {
    cell.classList.toggle("on", camera[index] === 1);
    cell.classList.toggle("centroid", total > 0 && Math.round(centroid) === index);
  });
  if (total === 0) {
    cameraText.textContent = "sin linea";
    return;
  }
  const center = (camera.length - 1) / 2;
  const error = (centroid - center) / center;
  cameraText.textContent = `px ${centroid.toFixed(1)} · error ${error.toFixed(2)}`;
}

function setMessage(text, kind) {
  message.textContent = text;
  message.className = `message ${kind || ""}`.trim();
}


function escapeHtml(text) {
  return text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
}

const pyKeywords = new Set(["and","as","assert","break","class","continue","def","del","elif","else","except","False","finally","for","from","global","if","import","in","is","lambda","None","nonlocal","not","or","pass","raise","return","True","try","while","with","yield"]);
const pyBuiltins = new Set(["abs","all","any","bool","dict","enumerate","float","int","len","list","max","min","print","range","round","set","str","sum","tuple","zip"]);
const pyApi = new Set(["read_camera","read_line","set_motor","sleep","get_speed","get_progress","time","math"]);

function highlightPython(code) {
  const tokenPattern = /(#.*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b|\n|\s+|.)/g;
  let previousKeyword = "";
  return code.replace(tokenPattern, (token) => {
    if (token === "\n") return "\n";
    if (/^\s+$/.test(token)) return token;
    const escaped = escapeHtml(token);
    if (token.startsWith("#")) return `<span class="tok-comment">${escaped}</span>`;
    if (token.startsWith("'") || token.startsWith('"')) return `<span class="tok-string">${escaped}</span>`;
    if (/^\d/.test(token)) return `<span class="tok-number">${escaped}</span>`;
    if (/^[A-Za-z_]\w*$/.test(token)) {
      if (previousKeyword === "def" || previousKeyword === "class") {
        previousKeyword = "";
        return `<span class="tok-defname">${escaped}</span>`;
      }
      if (pyKeywords.has(token)) {
        previousKeyword = token;
        return `<span class="tok-keyword">${escaped}</span>`;
      }
      previousKeyword = "";
      if (pyApi.has(token)) return `<span class="tok-api">${escaped}</span>`;
      if (pyBuiltins.has(token)) return `<span class="tok-builtin">${escaped}</span>`;
    } else {
      previousKeyword = "";
    }
    return escaped;
  });
}

function updateHighlight() {
  codeHighlight.innerHTML = highlightPython(editor.value) + "\n";
  codeHighlight.scrollTop = editor.scrollTop;
  codeHighlight.scrollLeft = editor.scrollLeft;
}

function updateLineNumbers() {
  const count = editor.value.split("\n").length;
  lineNumbers.textContent = Array.from({ length: count }, (_, index) => index + 1).join("\n");
  updateHighlight();
}

editor.addEventListener("input", updateLineNumbers);
editor.addEventListener("scroll", () => { codeHighlight.scrollTop = editor.scrollTop; codeHighlight.scrollLeft = editor.scrollLeft; });
editor.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = `${editor.value.slice(0, start)}    ${editor.value.slice(end)}`;
    editor.selectionStart = editor.selectionEnd = start + 4;
    updateLineNumbers();
  }
});

runBtn.addEventListener("click", runPython);
stepBtn.addEventListener("click", stepFrame);
resetBtn.addEventListener("click", reset);
saveFileBtn.addEventListener("click", saveCurrentFile);
loadFileBtn.addEventListener("click", loadSelectedFile);
fileSelect.addEventListener("change", () => { if (fileSelect.value) fileNameInput.value = fileSelect.value; renderFileList(); });
zoomInBtn.addEventListener("click", () => { zoom = Math.min(3, +(zoom + 0.25).toFixed(2)); render(); });
zoomOutBtn.addEventListener("click", () => { zoom = Math.max(0.75, +(zoom - 0.25).toFixed(2)); render(); });
snippetSelect.addEventListener("change", () => {
  if (!snippetSelect.value || !tracks.length) return;
  const track = tracks[currentTrackIndex];
  if (snippetSelect.value === "pid") editor.value = starterFor(track);
  if (snippetSelect.value === "ifelse") editor.value = ifSnippet(track);
  if (snippetSelect.value === "debug") editor.value = debugSnippet(track);
  if (snippetSelect.value === "solution") editor.value = solutionSnippet(track);
  snippetSelect.value = "";
  updateLineNumbers();
});
window.addEventListener("resize", render);

boot();
