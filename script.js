/* ===================================================
   NETWORK-DRIVER // CYBER OVERDRIVE v2.0
   CIRCUITOS CON CURVAS, MAPA GENERAL, ZOOM Y TIMER
   =================================================== */

const canvas = document.getElementById('lienzo-carrera');
const ctx = canvas.getContext('2d');

let aliasJugador = "DRIVER_01";
let modoCamara = "pseudo3d";
let dificultad = "medio";

let gameLoopInterval = null;
let isPaused = true;
let isGameOver = false;

// Estado de la Fase de Inicio (Zoom & Conteo)
let estadoFase = "MENU"; // "INSPECCION", "COUNTDOWN", "CARRERA"
let countdownTimer = 3;
let countdownInterval = null;
let zoomFactor = 0.2; // Inicia alejado para el mapa completo
let targetZoom = 1.0;

// Variables de Pista y Física
let nivelActual = 1;
let tiempoRestante = 45; // Segundos para llegar a la meta
let distanciaRecorrida = 0;
let velocidadActual = 0;
let velocidadBase = 180;
let velocidadMaxima = 320;
let temperatura = 35.0;

// Posición del Jugador en el Trazado
let playerDistance = 0; // Progreso en metros en el circuito
let playerXOffset = 0;  // -1 (Izquierda), 0 (Centro), 1 (Derecha)
let targetXOffset = 0;

// Teclas
const keys = { left: false, right: false, nitro: false, brake: false };

// Tráfico y Obstáculos
let trafico = [];

/* ===================================================
   1. DEFINICIÓN DE CIRCUITOS (TRAZADO Y CURVAS)
   =================================================== */
// Definición de curvas: { inicio, fin, curva (-1 Izq, 1 Der) }
const circuitos = {
  1: {
    longitudTotal: 1200,
    tiempoLimite: 40,
    curvas: [
      { inicio: 200, fin: 400, fuerza: 0.6 },   // Curva suave derecha
      { inicio: 600, fin: 850, fuerza: -0.8 },  // Curva fuerte izquierda
      { inicio: 1000, fin: 1150, fuerza: 0.4 }  // Curva final suave
    ]
  },
  2: {
    longitudTotal: 1800,
    tiempoLimite: 50,
    curvas: [
      { inicio: 200, fin: 500, fuerza: -0.9 },
      { inicio: 700, fin: 1000, fuerza: 0.8 },
      { inicio: 1200, fin: 1400, fuerza: -1.2 }, // Curva S muy cerrada
      { inicio: 1450, fin: 1650, fuerza: 1.0 }
    ]
  }
};

/* ===================================================
   2. SISTEMA DE AUDIO (WEB AUDIO API)
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
   3. CONTROLES Y EVENTOS DE TECLADO
   =================================================== */
window.addEventListener('keydown', (e) => {
  sfx.init();
  if (isGameOver || estadoFase !== "CARRERA") return;

  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') targetXOffset -= 0.35;
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') targetXOffset += 0.35;
  if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') keys.nitro = true;
  if (e.key === ' ' || e.key === 'Spacebar') keys.brake = true;
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') keys.nitro = false;
  if (e.key === ' ' || e.key === 'Spacebar') keys.brake = false;
});

/* ===================================================
   4. FLUJO DE INICIO, SECUENCIA ZOOM Y CONTEO
   =================================================== */
function iniciarCarrera() {
  sfx.init();
  const aliasInput = document.getElementById('input-alias').value.trim();
  aliasJugador = aliasInput !== "" ? aliasInput.toUpperCase() : "DRIVER_01";
  modoCamara = document.getElementById('select-camara').value;
  dificultad = document.getElementById('select-diff').value;

  if (dificultad === 'facil') velocidadBase = 150;
  else if (dificultad === 'medio') velocidadBase = 210;
  else if (dificultad === 'dificil') velocidadBase = 270;

  document.getElementById('menu-inicio').classList.add('oculto');
  document.getElementById('escenario-juego').classList.remove('oculto');

  prepararEstadoInicial();
}

function prepararEstadoInicial() {
  clearInterval(gameLoopInterval);
  clearInterval(countdownInterval);

  nivelActual = 1;
  const mapa = circuitos[nivelActual];
  tiempoRestante = mapa.tiempoLimite;
  playerDistance = 0;
  playerXOffset = 0;
  targetXOffset = 0;
  velocidadActual = 0;
  temperatura = 35.0;
  isGameOver = false;
  isPaused = true;
  
  // Iniciar en modo inspección de mapa
  estadoFase = "INSPECCION";
  zoomFactor = 0.25; 
  targetZoom = 1.0;

  actualizarHUD();
  const btnPause = document.getElementById('btn-pause');
  if (btnPause) btnPause.innerText = '[ INICIAR CARRERA ]';

  // Iniciar bucle de renderizado
  gameLoopInterval = setInterval(gameStep, 1000 / 60);
}

function iniciarBucle() {
  if (estadoFase === "INSPECCION") {
    // Iniciar Secuencia de Zoom y Conteo
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

function reiniciarCarrera() {
  prepararEstadoInicial();
}

function pausarJuego() {
  if (isGameOver) return;
  iniciarBucle();
}

function volverAlMenu() {
  clearInterval(gameLoopInterval);
  clearInterval(countdownInterval);
  document.getElementById('escenario-juego').classList.add('oculto');
  document.getElementById('menu-inicio').classList.remove('oculto');
}

/* ===================================================
   5. FÍSICA Y BUCLE DE JUEGO
   =================================================== */
function gameStep() {
  // Transición suave de Zoom en la fase de conteo
  if (estadoFase === "COUNTDOWN" || estadoFase === "CARRERA") {
    if (zoomFactor < targetZoom) zoomFactor += (targetZoom - zoomFactor) * 0.05;
  }

  if (estadoFase === "CARRERA" && !isPaused && !isGameOver) {
    // Movimiento lateral
    playerXOffset += (targetXOffset - playerXOffset) * 0.15;

    // Calcular si el auto está en una curva
    const fuerzaCurvaActual = obtenerCurvaEnPosicion(playerDistance);
    
    // La fuerza de la curva arrastra el auto hacia afuera
    playerXOffset -= fuerzaCurvaActual * (velocidadActual / 2500);

    // Salirse de pista (Límite lateral)
    let enAsfalto = Math.abs(playerXOffset) <= 1.2;
    if (!enAsfalto) {
      // Rozar el borde neón frena el auto
      velocidadActual *= 0.95;
    }

    // Aceleración y Nitro
    let velObjetivo = velocidadBase;
    if (keys.nitro) {
      velObjetivo = velocidadMaxima;
      temperatura += 0.18;
    } else if (keys.brake) {
      velObjetivo = velocidadBase * 0.3;
    } else {
      if (temperatura > 35.0) temperatura -= 0.08;
    }

    if (temperatura >= 95.0) {
      temperatura = 95.0;
      velObjetivo = velocidadBase * 0.4;
    }

    velocidadActual += (velObjetivo - velocidadActual) * 0.05;
    playerDistance += (velocidadActual / 3600) * 15;

    // Verificar si llegó a la Meta
    const mapaActual = circuitos[nivelActual];
    if (playerDistance >= mapaActual.longitudTotal) {
      sfx.playBeep(1000, 'triangle', 0.5);
      if (circuitos[nivelActual + 1]) {
        nivelActual++;
        playerDistance = 0;
        tiempoRestante += circuitos[nivelActual].tiempoLimite;
      } else {
        victoriaTotal();
        return;
      }
    }
  }

  actualizarHUD();
  renderizar();
}

function obtenerCurvaEnPosicion(dist) {
  const mapa = circuitos[nivelActual];
  for (let c of mapa.curvas) {
    if (dist >= c.inicio && dist <= c.fin) return c.fuerza;
  }
  return 0;
}

function gameOverTimeout() {
  sfx.playCrash();
  isGameOver = true;
  ctx.fillStyle = 'rgba(9, 5, 20, 0.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ff3355';
  ctx.font = 'bold 24px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('TIME OUT // CONNECTION LOST', canvas.width / 2, canvas.height / 2 - 10);
  ctx.fillStyle = '#facc15';
  ctx.font = '14px Courier New';
  ctx.fillText('NO LLEGASTE A LA META A TIEMPO', canvas.width / 2, canvas.height / 2 + 20);
}

function victoriaTotal() {
  isGameOver = true;
  ctx.fillStyle = 'rgba(9, 5, 20, 0.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 24px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('¡CIRCUITO COMPLETADO!', canvas.width / 2, canvas.height / 2 - 10);
  ctx.fillStyle = '#d946ef';
  ctx.font = '14px Courier New';
  ctx.fillText(`PILOTO: ${aliasJugador} | TIEMPO EXTRA RESTANTE: ${tiempoRestante}S`, canvas.width / 2, canvas.height / 2 + 20);
}

function actualizarHUD() {
  const mapa = circuitos[nivelActual];
  const progresoKm = Math.floor(playerDistance);
  const totalKm = mapa.longitudTotal;

  document.getElementById('score-val').innerText = `${progresoKm}/${totalKm} M`;
  document.getElementById('speed-val').innerText = `${Math.floor(velocidadActual)} KM/H`;

  const tempEl = document.getElementById('temp-val');
  tempEl.innerText = `${tiempoRestante}S`;
  tempEl.style.color = tiempoRestante <= 10 ? '#ff3355' : '#facc15';
}

/* ===================================================
   6. RENDERIZADO VISUAL, MAPA GENERAL Y MINI-MAPA
   =================================================== */
function renderizar() {
  ctx.fillStyle = '#05020a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (estadoFase === "INSPECCION" || (estadoFase === "COUNTDOWN" && zoomFactor < 0.6)) {
    // Renderizar Vista General del Trazado Completo
    renderizarVistaGeneralCircuito();
  } else {
    // Renderizar Cámara del Jugador (3D o Top-Down)
    if (modoCamara === 'pseudo3d') {
      renderizarPseudo3D();
    } else {
      renderizarTopDown();
    }
    // Dibujar Mini-Mapa HUD en la esquina
    dibujarMiniMapa();
  }

  // Dibujar texto de cuenta regresiva
  if (estadoFase === "COUNTDOWN") {
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 60px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(countdownTimer > 0 ? countdownTimer : "OVERDRIVE!", canvas.width / 2, canvas.height / 2);
  }
}

// --- VISTA GENERAL PRE-CARRERA (MAPA COMPLETO) ---
function renderizarVistaGeneralCircuito() {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const mapa = circuitos[nivelActual];

  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 12 * zoomFactor;
  ctx.shadowColor = '#d946ef';
  ctx.shadowBlur = 15;

  // Dibujar trazado esquemático en bucle/pista
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, 200 * zoomFactor, 120 * zoomFactor, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Posición de Salida (Jugador)
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(centerX - (195 * zoomFactor), centerY, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText(`CIRCUITO DE DATOS 0${nivelActual} // VISTA GENERAL`, centerX, centerY - 120 * zoomFactor);
}

// --- MÓDULO CÁMARA 3D CON CURVAS ---
function renderizarPseudo3D() {
  const horizon = canvas.height * 0.42;
  const centerX = canvas.width / 2;
  const fuerzaCurva = obtenerCurvaEnPosicion(playerDistance);

  // Fondo Noche
  const grad = ctx.createLinearGradient(0, 0, 0, horizon);
  grad.addColorStop(0, '#090514'); grad.addColorStop(1, '#2b0938');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, horizon);

  // Sol Neón
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(centerX + (fuerzaCurva * 60), horizon - 15, 30, Math.PI, 0, false);
  ctx.fill();

  // Offset del horizonte para simular la curva
  const curveOffsetX = fuerzaCurva * 140;

  // Pista (Trapecio con desplazamiento de curva)
  ctx.fillStyle = '#120824';
  ctx.beginPath();
  ctx.moveTo(centerX - 35 + curveOffsetX, horizon);
  ctx.lineTo(centerX + 35 + curveOffsetX, horizon);
  ctx.lineTo(canvas.width - 40, canvas.height);
  ctx.lineTo(40, canvas.height);
  ctx.closePath();
  ctx.fill();

  // Bordes neón
  ctx.strokeStyle = Math.abs(playerXOffset) > 1.2 ? '#ff3355' : '#d946ef';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(centerX - 35 + curveOffsetX, horizon);
  ctx.lineTo(40, canvas.height);
  ctx.moveTo(centerX + 35 + curveOffsetX, horizon);
  ctx.lineTo(canvas.width - 40, canvas.height);
  ctx.stroke();

  // Auto Jugador
  const playerCanvasX = centerX + (playerXOffset * 90);
  const playerY = canvas.height - 55;

  if (keys.nitro) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(playerCanvasX - 12, playerY + 15);
    ctx.lineTo(playerCanvasX + 12, playerY + 15);
    ctx.lineTo(playerCanvasX, playerY + 35 + Math.random() * 8);
    ctx.closePath(); ctx.fill();
  }

  ctx.fillStyle = '#d946ef';
  ctx.shadowColor = '#d946ef'; ctx.shadowBlur = 12;
  ctx.fillRect(playerCanvasX - 22, playerY - 15, 44, 22);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(playerCanvasX - 18, playerY - 10, 36, 6);
  ctx.shadowBlur = 0;
}

// --- MÓDULO CÁMARA TOP-DOWN CON CURVAS ---
function renderizarTopDown() {
  const roadWidth = 220;
  const fuerzaCurva = obtenerCurvaEnPosicion(playerDistance);
  const curveOffsetX = fuerzaCurva * 70;
  const centerX = (canvas.width / 2) + curveOffsetX;

  // Asfalto
  ctx.fillStyle = '#120824';
  ctx.fillRect(centerX - roadWidth / 2, 0, roadWidth, canvas.height);

  // Bordes
  ctx.strokeStyle = Math.abs(playerXOffset) > 1.2 ? '#ff3355' : '#d946ef';
  ctx.lineWidth = 4;
  ctx.strokeRect(centerX - roadWidth / 2, 0, roadWidth, canvas.height);

  // Auto Jugador
  const playerCanvasX = (canvas.width / 2) + (playerXOffset * 65);
  const playerY = 310;

  if (keys.nitro) {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(playerCanvasX - 8, playerY + 22, 16, 12 + Math.random() * 8);
  }

  ctx.fillStyle = '#d946ef';
  ctx.shadowColor = '#d946ef'; ctx.shadowBlur = 10;
  ctx.fillRect(playerCanvasX - 16, playerY - 22, 32, 44);
  ctx.fillStyle = '#090514';
  ctx.fillRect(playerCanvasX - 12, playerY - 8, 24, 14);
  ctx.shadowBlur = 0;
}

// --- MINI-MAPA HUD (RADAR ESQUINA) ---
function dibujarMiniMapa() {
  const mapW = 100;
  const mapH = 60;
  const mapX = canvas.width - mapW - 15;
  const mapY = 15;
  const mapa = circuitos[nivelActual];

  // Fondo Radar
  ctx.fillStyle = 'rgba(9, 5, 20, 0.85)';
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 1;
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  // Trazado simplificado
  ctx.strokeStyle = 'rgba(217, 70, 239, 0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(mapX + mapW / 2, mapY + mapH / 2, 38, 20, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Progreso del Jugador
  const pct = (playerDistance % mapa.longitudTotal) / mapa.longitudTotal;
  const angle = pct * Math.PI * 2;
  const dotX = (mapX + mapW / 2) - Math.cos(angle) * 38;
  const dotY = (mapY + mapH / 2) + Math.sin(angle) * 20;

  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
  ctx.fill();
}
