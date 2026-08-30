/* ===================================================
   NETWORK-DRIVER // TOP-DOWN ROTATIONAL RACER
   MODO CÁMARA LIBRE 360° ESTILO MARIO KRAFT / DRIFT
   =================================================== */

const canvas = document.getElementById('lienzo-carrera');
const ctx = canvas.getContext('2d');

let aliasJugador = "DRIVER_01";
let dificultad = "medio";

let gameLoopInterval = null;
let isPaused = true;
let isGameOver = false;

// Estado de Fases
let estadoFase = "INSPECCION"; // "INSPECCION", "COUNTDOWN", "CARRERA"
let countdownTimer = 3;
let countdownInterval = null;
let zoomFactor = 0.35; // Inicia alejado para vista general
let targetZoom = 1.0;

// Estado del Auto (Posición X, Y y Ángulo en el mundo)
let car = {
  x: 400,
  y: 650,
  angle: -Math.PI / 2, // Apuntando hacia arriba
  speed: 0,
  maxSpeed: 8,
  accel: 0.18,
  friction: 0.96,
  turnSpeed: 0.055
};

// Física de Juego
let tiempoRestante = 45;
let kmRecorridos = 0;
let nivelActual = 1;

// Teclas
const keys = { up: false, down: false, left: false, right: false, nitro: false };

/* ===================================================
   1. DEFINICIÓN DEL CIRCUITO (TRAZADO GEOMÉTRICO)
   =================================================== */
// Pista definida por un camino de puntos (Waypoints)
const circuitoBase = [
  { x: 400, y: 650 },
  { x: 400, y: 250 },
  { x: 650, y: 150 },
  { x: 950, y: 250 },
  { x: 950, y: 650 },
  { x: 750, y: 800 },
  { x: 550, y: 750 }
];

/* ===================================================
   2. SISTEMA DE AUDIO
   =================================================== */
class SoundEffects {
  constructor() { this.ctx = null; }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  playBeep(freq = 440, type = 'sine', duration = 0.1) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(); osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }
  playCrash() {
    if (!this.ctx) return;
    try {
      const bufferSize = this.ctx.sampleRate * 0.3;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
      whiteNoise.connect(gain); gain.connect(this.ctx.destination);
      whiteNoise.start();
    } catch (e) {}
  }
}
const sfx = new SoundEffects();

/* ===================================================
   3. CONTROLES Y EVENTOS
   =================================================== */
window.addEventListener('keydown', (e) => {
  sfx.init();
  if (isGameOver || estadoFase !== "CARRERA") return;

  if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') keys.up = true;
  if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') keys.down = true;
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.left = true;
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = true;
  if (e.key === ' ' || e.key === 'Shift') keys.nitro = true;
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') keys.up = false;
  if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') keys.down = false;
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.left = false;
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = false;
  if (e.key === ' ' || e.key === 'Shift') keys.nitro = false;
});

/* ===================================================
   4. FLUJO DE JUEGO Y CONTEO
   =================================================== */
function iniciarCarrera() {
  sfx.init();
  const aliasInput = document.getElementById('input-alias').value.trim();
  aliasJugador = aliasInput !== "" ? aliasInput.toUpperCase() : "DRIVER_01";
  dificultad = document.getElementById('select-diff').value;

  if (dificultad === 'facil') car.maxSpeed = 7;
  else if (dificultad === 'medio') car.maxSpeed = 9;
  else if (dificultad === 'dificil') car.maxSpeed = 11;

  document.getElementById('menu-inicio').classList.add('oculto');
  document.getElementById('escenario-juego').classList.remove('oculto');

  prepararEstadoInicial();
}

function prepararEstadoInicial() {
  clearInterval(gameLoopInterval);
  clearInterval(countdownInterval);

  car.x = 400;
  car.y = 650;
  car.angle = -Math.PI / 2;
  car.speed = 0;

  tiempoRestante = 40;
  kmRecorridos = 0;
  isGameOver = false;
  isPaused = true;
  
  estadoFase = "INSPECCION";
  zoomFactor = 0.35;
  targetZoom = 1.0;

  actualizarHUD();
  const btnPause = document.getElementById('btn-pause');
  if (btnPause) btnPause.innerText = '[ INICIAR CARRERA ]';

  gameLoopInterval = setInterval(gameStep, 1000 / 60);
}

function iniciarBucle() {
  if (estadoFase === "INSPECCION") {
    estadoFase = "COUNTDOWN";
    countdownTimer = 3;
    sfx.playBeep(600, 'sine', 0.1);

    const btnPause = document.getElementById('btn-pause');
    if (btnPause) btnPause.innerText = '[ EN CARRERA ]';

    countdownInterval = setInterval(() => {
      countdownTimer--;
      if (countdownTimer > 0) {
        sfx.playBeep(600, 'sine', 0.1);
      } else if (countdownTimer === 0) {
        sfx.playBeep(1200, 'triangle', 0.3);
        estadoFase = "CARRERA";
        isPaused = false;
        clearInterval(countdownInterval);
        iniciarTimerReloj();
      }
    }, 1000);
  } else if (estadoFase === "CARRERA") {
    isPaused = !isPaused;
    const btnPause = document.getElementById('btn-pause');
    if (btnPause) btnPause.innerText = isPaused ? '[ REANUDAR ]' : '[ PAUSA ]';
  }
}

function iniciarTimerReloj() {
  const timerSec = setInterval(() => {
    if (!isPaused && !isGameOver && estadoFase === "CARRERA") {
      tiempoRestante--;
      if (tiempoRestante <= 0) {
        tiempoRestante = 0;
        clearInterval(timerSec);
        gameOverTimeout();
      }
    }
  }, 1000);
}

function reiniciarCarrera() { prepararEstadoInicial(); }
function pausarJuego() { if (!isGameOver) iniciarBucle(); }
function volverAlMenu() {
  clearInterval(gameLoopInterval);
  clearInterval(countdownInterval);
  document.getElementById('escenario-juego').classList.add('oculto');
  document.getElementById('menu-inicio').classList.remove('oculto');
}

/* ===================================================
   5. BUCLE DE FÍSICA ROTACIONAL (360°)
   =================================================== */
function gameStep() {
  // Transición de Zoom inicial
  if (estadoFase === "COUNTDOWN" || estadoFase === "CARRERA") {
    if (zoomFactor < targetZoom) zoomFactor += (targetZoom - zoomFactor) * 0.04;
  }

  if (estadoFase === "CARRERA" && !isPaused && !isGameOver) {
    // Giro del auto
    if (keys.left) car.angle -= car.turnSpeed * (car.speed / car.maxSpeed + 0.2);
    if (keys.right) car.angle += car.turnSpeed * (car.speed / car.maxSpeed + 0.2);

    // Aceleración y Nitro
    let topVel = keys.nitro ? car.maxSpeed * 1.4 : car.maxSpeed;
    if (keys.up) {
      if (car.speed < topVel) car.speed += car.accel;
    } else if (keys.down) {
      if (car.speed > -topVel * 0.4) car.speed -= car.accel;
    } else {
      car.speed *= car.friction; // Ficción natural
    }

    // Actualizar coordenadas globales X, Y
    car.x += Math.cos(car.angle) * car.speed;
    car.y += Math.sin(car.angle) * car.speed;

    kmRecorridos += Math.abs(car.speed) * 0.05;
  }

  actualizarHUD();
  renderizar();
}

function gameOverTimeout() {
  sfx.playCrash();
  isGameOver = true;
  ctx.fillStyle = 'rgba(9, 5, 20, 0.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ff3355';
  ctx.font = 'bold 24px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('TIME OUT // CONNECTION LOST', canvas.width / 2, canvas.height / 2);
}

function actualizarHUD() {
  document.getElementById('score-val').innerText = `${Math.floor(kmRecorridos)} M`;
  document.getElementById('speed-val').innerText = `${Math.floor(Math.abs(car.speed) * 25)} KM/H`;

  const tempEl = document.getElementById('temp-val');
  tempEl.innerText = `${tiempoRestante}S`;
  tempEl.style.color = tiempoRestante <= 10 ? '#ff3355' : '#facc15';
}

/* ===================================================
   6. RENDERIZADO CON ROTACIÓN DE CÁMARA
   =================================================== */
function renderizar() {
  ctx.fillStyle = '#05020a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();

  if (estadoFase === "INSPECCION") {
    // Vista General del Circuito Fijo
    ctx.translate(canvas.width / 2 - 200, canvas.height / 2 - 150);
    ctx.scale(0.45, 0.45);
    dibujarPista();
    dibujarAutoJugador();
  } else {
    // Cámara Centrada en el Auto con Rotación Libre
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoomFactor, zoomFactor);
    ctx.rotate(-car.angle - Math.PI / 2); // La cámara gira con la dirección del auto
    ctx.translate(-car.x, -car.y);

    dibujarPista();
    dibujarAutoJugador();
  }

  ctx.restore();

  // Mini-Mapa HUD Fijo en Pantalla
  if (estadoFase === "CARRERA") dibujarMiniMapa();

  // Conteo Regresivo
  if (estadoFase === "COUNTDOWN") {
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 60px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(countdownTimer > 0 ? countdownTimer : "OVERDRIVE!", canvas.width / 2, canvas.height / 2);
  }
}

// Dibujar el trazado del circuito
function dibujarPista() {
  // Asfalto
  ctx.strokeStyle = '#120824';
  ctx.lineWidth = 90;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  trazarCaminoCircuito();
  ctx.stroke();

  // Bordes Neón
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 98;
  ctx.shadowColor = '#d946ef';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Re-dibujar asfalto interno
  ctx.strokeStyle = '#120824';
  ctx.lineWidth = 86;
  ctx.stroke();

  // Línea Meta / Salida
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(350, 650);
  ctx.lineTo(450, 650);
  ctx.stroke();
}

function trazarCaminoCircuito() {
  ctx.moveTo(circuitoBase[0].x, circuitoBase[0].y);
  for (let i = 1; i < circuitoBase.length; i++) {
    ctx.lineTo(circuitoBase[i].x, circuitoBase[i].y);
  }
  ctx.closePath();
}

// Dibujar vehículo del jugador
function dibujarAutoJugador() {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  // Fuego de Nitro
  if (keys.nitro) {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-28, -6, 12, 12);
  }

  // Chasis Auto
  ctx.fillStyle = '#d946ef';
  ctx.shadowColor = '#d946ef';
  ctx.shadowBlur = 12;
  ctx.fillRect(-18, -12, 36, 24);

  // Cabina / Parabrisas
  ctx.fillStyle = '#facc15';
  ctx.fillRect(-4, -9, 12, 18);
  ctx.shadowBlur = 0;

  ctx.restore();
}

// Mini-Mapa Radar
function dibujarMiniMapa() {
  const mapW = 110;
  const mapH = 70;
  const mapX = canvas.width - mapW - 15;
  const mapY = 15;

  ctx.fillStyle = 'rgba(9, 5, 20, 0.85)';
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 1;
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  ctx.save();
  ctx.translate(mapX + 10, mapY + 10);
  ctx.scale(0.12, 0.1);
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 15;
  ctx.beginPath();
  trazarCaminoCircuito();
  ctx.stroke();

  // Punto del Jugador
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(car.x, car.y, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
