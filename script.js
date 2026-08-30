/* ===================================================
   NETWORK-DRIVER // CYBER OVERDRIVE v3.0 (360° DRIFT)
   MOTOR DE CONDUCCIÓN FLUIDA TIPO MARIO KART TOP-DOWN
   =================================================== */

const canvas = document.getElementById('lienzo-carrera');
const ctx = canvas.getContext('2d');

let aliasJugador = "DRIVER_01";
let dificultad = "medio";

let gameLoopInterval = null;
let isPaused = true;
let isGameOver = false;

// Estado de la Fase
let estadoFase = "MENU"; // "INSPECCION", "COUNTDOWN", "CARRERA"
let countdownTimer = 3;
let countdownInterval = null;
let zoomFactor = 0.3; 
let targetZoom = 1.0;

// Variables de Nivel y Tiempo
let nivelActual = 1;
let tiempoRestante = 45;
let lapActual = 1;
const totalLaps = 3;

// FÍSICA Y VECTORIAL DEL VEHÍCULO (360 GRADOS)
let car = {
  x: 300,
  y: 350,
  angle: -Math.PI / 2, // Apuntando hacia arriba
  speed: 0,
  maxSpeed: 7,
  accel: 0.15,
  friction: 0.96,
  turnSpeed: 0.065,
  nitro: false
};

// Teclas activas
const keys = { up: false, down: false, left: false, right: false, nitro: false };

/* ===================================================
   1. SISTEMA DE AUDIO (WEB AUDIO API)
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
      osc.type = type; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
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
   2. EVENTOS DE TECLADO (CONDUCCIÓN CONTINUA)
   =================================================== */
window.addEventListener('keydown', (e) => {
  sfx.init();
  if (isGameOver || estadoFase !== "CARRERA") return;

  if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') keys.up = true;
  if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') keys.down = true;
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.left = true;
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = true;
  if (e.key === ' ' || e.key === 'Spacebar') keys.nitro = true;
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') keys.up = false;
  if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') keys.down = false;
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.left = false;
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = false;
  if (e.key === ' ' || e.key === 'Spacebar') keys.nitro = false;
});

/* ===================================================
   3. INICIO DE CARRERA Y ZOOM DE CÁMARA
   =================================================== */
function iniciarCarrera() {
  sfx.init();
  const aliasInput = document.getElementById('input-alias').value.trim();
  aliasJugador = aliasInput !== "" ? aliasInput.toUpperCase() : "DRIVER_01";
  dificultad = document.getElementById('select-diff').value;

  if (dificultad === 'facil') car.maxSpeed = 5.5;
  else if (dificultad === 'medio') car.maxSpeed = 7.0;
  else if (dificultad === 'dificil') car.maxSpeed = 8.5;

  document.getElementById('menu-inicio').classList.add('oculto');
  document.getElementById('escenario-juego').classList.remove('oculto');

  prepararEstadoInicial();
}

function prepararEstadoInicial() {
  clearInterval(gameLoopInterval);
  clearInterval(countdownInterval);

  nivelActual = 1;
  tiempoRestante = 45;
  lapActual = 1;
  
  // Posición inicial en la línea de meta
  car.x = 120;
  car.y = 200;
  car.angle = Math.PI / 2; // Orientado hacia abajo
  car.speed = 0;
  
  isGameOver = false;
  isPaused = true;
  
  // Vista general inicial
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
   4. MOTOR DE FÍSICA FLUIDA 360°
   =================================================== */
function gameStep() {
  // Transición suave de Zoom inicial
  if (estadoFase === "COUNTDOWN" || estadoFase === "CARRERA") {
    if (zoomFactor < targetZoom) zoomFactor += (targetZoom - zoomFactor) * 0.04;
  }

  if (estadoFase === "CARRERA" && !isPaused && !isGameOver) {
    // Giro de Dirección
    if (keys.left) car.angle -= car.turnSpeed * (car.speed / car.maxSpeed + 0.2);
    if (keys.right) car.angle += car.turnSpeed * (car.speed / car.maxSpeed + 0.2);

    // Aceleración y Freno
    let maxVel = keys.nitro ? car.maxSpeed * 1.4 : car.maxSpeed;
    if (keys.up) {
      if (car.speed < maxVel) car.speed += car.accel;
    } else if (keys.down) {
      if (car.speed > -car.maxSpeed * 0.4) car.speed -= car.accel;
    } else {
      car.speed *= car.friction; // Inercia / desaceleración
    }

    // Actualizar Posición Vectorial en el Mapa
    car.x += Math.cos(car.angle) * car.speed;
    car.y += Math.sin(car.angle) * car.speed;

    // Verificar si el auto se sale del lienzo (Bordes del mapa)
    if (car.x < 30 || car.x > canvas.width - 30 || car.y < 30 || car.y > canvas.height - 30) {
      car.speed *= 0.8; // Freno por roce neón
    }

    // Detección simplificada de paso por Meta (Línea en X=120, Y=200)
    if (car.x > 100 && car.x < 140 && car.y > 180 && car.y < 220 && car.speed > 2) {
      // Avanzar Vuelta / Lap
      lapActual++;
      sfx.playBeep(900, 'triangle', 0.2);
      if (lapActual > totalLaps) {
        victoriaTotal();
        return;
      }
    }
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

function victoriaTotal() {
  isGameOver = true;
  ctx.fillStyle = 'rgba(9, 5, 20, 0.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 24px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('¡CARRERA COMPLETADA!', canvas.width / 2, canvas.height / 2 - 10);
  ctx.fillStyle = '#d946ef';
  ctx.font = '14px Courier New';
  ctx.fillText(`PILOTO: ${aliasJugador} | TIEMPO RESTANTE: ${tiempoRestante}S`, canvas.width / 2, canvas.height / 2 + 20);
}

function actualizarHUD() {
  const velKmh = Math.floor(Math.abs(car.speed) * 35);
  document.getElementById('score-val').innerText = `LAP ${lapActual}/${totalLaps}`;
  document.getElementById('speed-val').innerText = `${velKmh} KM/H`;

  const tempEl = document.getElementById('temp-val');
  tempEl.innerText = `${tiempoRestante}S`;
  tempEl.style.color = tiempoRestante <= 10 ? '#ff3355' : '#facc15';
}

/* ===================================================
   5. RENDERIZADO VISUAL DEL CIRCUITO Y VEHÍCULO 360°
   =================================================== */
function renderizar() {
  ctx.fillStyle = '#05020a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();

  // Si estamos jugando, centramos la cámara suavemente en el vehículo
  if (estadoFase === "CARRERA" || estadoFase === "COUNTDOWN") {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoomFactor, zoomFactor);
    ctx.translate(-car.x, -car.y);
  }

  // Dibujar el Pista del Circuito Completo (Trazado Neón)
  dibujarCircuitoCompleto();

  // Dibujar Auto del Jugador (Rotación libre)
  dibujarAuto360(car.x, car.y, car.angle);

  ctx.restore();

  // Mini-Mapa HUD fijo en pantalla
  if (estadoFase === "CARRERA") {
    dibujarMiniMapa();
  }

  // Pantalla de Cuenta Regresiva
  if (estadoFase === "COUNTDOWN") {
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 50px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(countdownTimer > 0 ? countdownTimer : "GO!", canvas.width / 2, canvas.height / 2);
  }
}

// Dibujar trazado de pista con curvas estilo Mario Kart
function dibujarCircuitoCompleto() {
  // Asfalto principal
  ctx.strokeStyle = '#120824';
  ctx.lineWidth = 90;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  dibujarRutaPista(ctx);
  ctx.stroke();

  // Bordes Neón Púrpura
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 96;
  ctx.shadowColor = '#d946ef';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  dibujarRutaPista(ctx);
  ctx.stroke();

  // Interior de la pista
  ctx.strokeStyle = '#090514';
  ctx.lineWidth = 84;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  dibujarRutaPista(ctx);
  ctx.stroke();

  // Línea de Meta (Checkered Line)
  ctx.fillStyle = '#facc15';
  ctx.fillRect(100, 180, 40, 15);
}

// Ruta con curvas suaves para el circuito
function dibujarRutaPista(c) {
  c.moveTo(120, 200);
  c.lineTo(120, 320);
  c.quadraticCurveTo(120, 380, 200, 380);
  c.lineTo(400, 380);
  c.quadraticCurveTo(500, 380, 500, 280);
  c.lineTo(500, 150);
  c.quadraticCurveTo(500, 80, 400, 80);
  c.lineTo(200, 80);
  c.quadraticCurveTo(120, 80, 120, 200);
}

// Renderizar el vehículo con su rotación exacta
function dibujarAuto360(x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Fuego de Nitro / Escape
  if (keys.nitro) {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-22, -4, 10, 8);
  }

  // Chasis Neón
  ctx.fillStyle = '#d946ef';
  ctx.shadowColor = '#d946ef';
  ctx.shadowBlur = 12;
  ctx.fillRect(-14, -8, 28, 16);

  // Cabina / Parabrisas
  ctx.fillStyle = '#facc15';
  ctx.fillRect(-2, -6, 10, 12);

  ctx.restore();
}

// Mini-Mapa Esquina Superior Derecha
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

  // Pista en pequeño (Escalada)
  ctx.save();
  ctx.translate(mapX + 10, mapY + 10);
  ctx.scale(0.15, 0.12);
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 10;
  ctx.beginPath();
  dibujarRutaPista(ctx);
  ctx.stroke();
  ctx.restore();

  // Posición del Jugador en el Radar
  const dotX = mapX + 10 + (car.x * 0.15);
  const dotY = mapY + 10 + (car.y * 0.12);
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
  ctx.fill();
}
