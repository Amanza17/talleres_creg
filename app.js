const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const editor = document.querySelector("#codeEditor");
const lineNumbers = document.querySelector("#lineNumbers");
const output = document.querySelector("#consoleOutput");
const message = document.querySelector("#message");
const lapText = document.querySelector("#lapText");
const speedText = document.querySelector("#speedText");
const offText = document.querySelector("#offText");
const errorText = document.querySelector("#errorText");
const sensorBars = [...document.querySelectorAll("#sensorBars i")];
const trackList = document.querySelector("#trackList");
const trackName = document.querySelector("#trackName");
const trackDifficulty = document.querySelector("#trackDifficulty");
const simTitle = document.querySelector("#simTitle");
const runBtn = document.querySelector("#runBtn");
const stepBtn = document.querySelector("#stepBtn");
const resetBtn = document.querySelector("#resetBtn");
const snippetSelect = document.querySelector("#snippetSelect");

const TAU = Math.PI * 2;
const sensorOffsets = [-9, 0, 9];
let world = { width: 1000, height: 680 };
let tracks = [];
let currentTrackIndex = 0;
let frames = [];
let frameIndex = 0;
let player = null;
let car = null;

function starterFor(track) {
  return `# Python real: este codigo se ejecuta en server.py
# Circuito: ${track.name} (${track.difficulty})
# Reto: completa las funciones. No basta con ir recto.

MAX_PASOS = ${track.laps}

# Ajusta estos valores despues de mirar la telemetria.
VEL_RECTA = ${Math.max(30, track.speed - 6)}
VEL_CURVA = ${Math.max(24, track.speed - 18)}
KP = 0
KD = 0

ultimo_error = 0
ultimo_lado = 0


def calcular_error():
    # TODO 1:
    # Usa leer_linea() y devuelve un error numerico.
    # Recomendacion:
    #   izquierda -> negativo
    #   derecha   -> positivo
    #   centro    -> 0
    # Si los 3 sensores pierden la linea, usa ultimo_lado.
    izq, centro, der = leer_linea()
    return 0


def elegir_velocidad(error):
    # TODO 2:
    # Baja velocidad cuando el error sea grande.
    # Puedes usar abs(error), leer_velocidad() o leer_progreso().
    return VEL_RECTA


def controlar(error):
    # TODO 3:
    # Implementa un controlador P o PD.
    # correccion = error * KP + derivada * KD
    return 0


for paso in range(MAX_PASOS):
    error = calcular_error()
    velocidad = elegir_velocidad(error)
    correccion = controlar(error)

    motor(velocidad - correccion, velocidad + correccion)
    esperar()

    # Puedes imprimir cada 50 pasos para depurar sin saturar consola.
    if paso % 50 == 0:
        imprimir(paso, leer_linea(), round(error, 2), round(leer_velocidad(), 1))`;
}

function ifSnippet(track) {
  return `# Plantilla alternativa: maquina de estados.
# Completa las ramas y usa memoria para recuperar la linea.

MAX_PASOS = ${track.laps}
velocidad = ${Math.max(24, track.speed - 14)}
ultimo_lado = 0

for paso in range(MAX_PASOS):
    izq, centro, der = leer_linea()

    if centro == 1:
        # TODO: recta o curva suave
        motor(0, 0)
    elif izq == 1:
        # TODO: gira hacia la izquierda y guarda ultimo_lado
        motor(0, 0)
    elif der == 1:
        # TODO: gira hacia la derecha y guarda ultimo_lado
        motor(0, 0)
    else:
        # TODO: recuperacion cuando no ve linea
        # usa ultimo_lado para buscar sin salirte.
        motor(0, 0)

    esperar()`;
}

function debugSnippet() {
  return `# Exploracion: no completa la vuelta, solo sirve para entender sensores.
for paso in range(160):
    izq, centro, der = leer_linea()
    error = leer_error()
    imprimir(paso, "sensores=", (izq, centro, der), "error=", round(error, 2), "v=", round(leer_velocidad(), 1))
    motor(30, 30)
    esperar()`;
}

function solutionSnippet(track) {
  return `# Solucion de referencia: control PD + velocidad adaptativa.
# Funciona en las cuatro pistas, pero aun se puede mejorar.

MAX_PASOS = ${Math.max(track.laps, 1900)}
VEL_RECTA = 32
VEL_CURVA = 18
KP = 38
KD = 14

ultimo_error = 0


def elegir_velocidad(error):
    if abs(error) > 1.0:
        return 14
    if abs(error) > 0.25:
        return VEL_CURVA
    return VEL_RECTA


def controlar(error):
    global ultimo_error
    derivada = error - ultimo_error
    ultimo_error = error
    return error * KP + derivada * KD


for paso in range(MAX_PASOS):
    error = leer_error()
    velocidad = elegir_velocidad(error)
    correccion = controlar(error)

    motor(velocidad - correccion, velocidad + correccion)
    esperar()

    if paso % 100 == 0:
        imprimir(paso, "error=", round(error, 2), "v=", round(leer_velocidad(), 1))`;
}

async function boot() {
  try {
    const response = await fetch("/tracks");
    if (!response.ok) throw new Error("No se pudo cargar /tracks");
    const data = await response.json();
    world = data.world;
    tracks = data.tracks;
    selectTrack(0, true);
    setMessage("Listo. Escribe Python y pulsa Ejecutar.", "");
  } catch (error) {
    setMessage("Abre la actividad desde server.py: python3 server.py", "error");
    output.textContent = `${error.message}\n`;
  }
}

function selectTrack(index, replaceCode = false) {
  currentTrackIndex = index;
  const track = tracks[index];
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
  trackName.textContent = track.name;
  trackDifficulty.textContent = `${track.difficulty}. ${track.description}`;
  simTitle.textContent = track.name;
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
    car = frames[frameIndex++];
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
  if (frameIndex < frames.length) car = frames[frameIndex++];
  updateTelemetry(car);
  render();
  if (frameIndex >= frames.length) summarize();
}

function summarize() {
  if (!car) return;
  if (car.lapDone) setMessage(`Vuelta completada en ${car.ticks} ciclos.`, "win");
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
  const scale = Math.min(canvas.width / world.width, canvas.height / world.height);
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
  drawProgress();
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
  strokePath(track.points, track.asphaltWidth + 18, "#f4f6f8", [18, 18]);
  strokePath(track.points, track.asphaltWidth, "#363b45");
  strokePath(track.points, track.asphaltWidth - 22, "#2b3039");
  strokePath(track.points, track.lineWidth, "#050608");
}

function drawStartLine() {
  const points = tracks[currentTrackIndex].points;
  const a = points[0];
  const b = points[1];
  ctx.save();
  ctx.translate(a[0], a[1]);
  ctx.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2);
  for (let row = -3; row <= 2; row++) {
    for (let col = -2; col <= 1; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? "#fff" : "#111318";
      ctx.fillRect(col * 18, row * 14, 18, 14);
    }
  }
  ctx.restore();
}

function drawProgress() {
  const points = tracks[currentTrackIndex].points;
  const end = Math.max(2, Math.floor(points.length * Math.min(car.progress || 0, .999)));
  strokePath(points.slice(0, end), 5, "rgba(40,209,124,.52)");
}

function drawCar() {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.scale(0.45, 0.45);
  ctx.fillStyle = "rgba(0,0,0,.32)";
  ctx.beginPath();
  ctx.ellipse(0, 8, 40, 60, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#05070b";
  roundRect(-36, -34, 17, 27, 4); roundRect(19, -34, 17, 27, 4); roundRect(-37, 13, 18, 30, 4); roundRect(19, 13, 18, 30, 4);
  ctx.fillStyle = "#f8fafc";
  roundRect(-33, -56, 66, 10, 3); roundRect(-37, 42, 74, 11, 3);
  const body = ctx.createLinearGradient(0, -60, 0, 52);
  body.addColorStop(0, "#ff5068"); body.addColorStop(.48, "#d30f2f"); body.addColorStop(1, "#780d20");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -62);
  ctx.bezierCurveTo(22, -40, 25, -8, 17, 31);
  ctx.lineTo(8, 50); ctx.lineTo(-8, 50);
  ctx.bezierCurveTo(-25, 5, -22, -42, 0, -62);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#111827"; roundRect(-10, -12, 20, 27, 8);
  ctx.fillStyle = "#ffd15c"; roundRect(-5, -38, 10, 19, 4);
  ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(-2, -52, 4, 92);
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawSensors() {
  sensorOffsets.forEach((offset, index) => {
    const point = sensorPoint(offset);
    const on = (car.sensors || [])[index] === 1;
    ctx.strokeStyle = on ? "rgba(40,209,124,.55)" : "rgba(255,77,104,.4)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(car.x, car.y); ctx.lineTo(point.x, point.y); ctx.stroke();
    ctx.fillStyle = on ? "#28d17c" : "#ff4d68";
    ctx.beginPath(); ctx.arc(point.x, point.y, 4, 0, TAU); ctx.fill();
  });
}

function sensorPoint(offset) {
  const forward = 23;
  return {
    x: car.x + Math.cos(car.angle) * forward + Math.cos(car.angle + Math.PI / 2) * offset,
    y: car.y + Math.sin(car.angle) * forward + Math.sin(car.angle + Math.PI / 2) * offset
  };
}

function updateTelemetry(frame) {
  lapText.textContent = `${Math.floor((frame.progress || 0) * 100)}%`;
  speedText.textContent = `${Math.round((frame.speed || 0) * 3.6)} km/h`;
  offText.textContent = `${frame.offTrack || 0} salidas`;
  errorText.textContent = Number(frame.error || 0).toFixed(2);
  sensorBars.forEach((bar, index) => bar.classList.toggle("on", (frame.sensors || [])[index] === 1));
}

function setMessage(text, kind) {
  message.textContent = text;
  message.className = `message ${kind || ""}`.trim();
}

function updateLineNumbers() {
  const count = editor.value.split("\n").length;
  lineNumbers.textContent = Array.from({ length: count }, (_, index) => index + 1).join("\n");
}

editor.addEventListener("input", updateLineNumbers);
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
