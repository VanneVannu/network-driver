// ==========================================
// CONFIGURACIÓN Y ESTADO DEL JUEGO
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameLoopInterval = null;
let musicInterval = null;

let isPaused = true;
let isGameOver = false;
let cruzoMeta = false;
let nivelActual = 1;
let framesFueraDePista = 0;
let kmRecorridos = 0;

// Auto y Cámara
const car = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  angle: 0,
  speed: 0,
  maxSpeed: 8,
  accel: 0.2,
  friction: 0.96,
  turnSpeed: 0.05
};

const cam = { x: 0, y: 0, angle: 0 };
let zoomFactor = 0.35;

// Teclas
const keys = {};

window.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  // Iniciar contexto de audio en la primera interacción del usuario
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

// ==========================================
// CIRCUITOS (DEFINICIÓN DE PISTAS)
// ==========================================
const circuitos = [
  // Nivel 1
  [
    { x: 300, y: 300 },
    { x: 900, y: 300 },
    { x: 900, y: 800 },
    { x: 300, y: 800 }
  ],
  // Nivel 2
  [
    { x: 200, y: 200 },
    { x: 1000, y: 200 },
    { x: 1200, y: 600 },
    { x: 800, y: 900 },
    { x: 200, y: 700 }
  ],
  // Nivel 3
  [
    { x: 300, y: 300 },
    { x: 1100, y: 300 },
    { x: 1100, y: 900 },
    { x: 700, y: 600 },
    { x: 300, y: 900 }
  ]
];

function obtenerCircuitoActual() {
  return circuitos[(nivelActual - 1) % circuitos.length];
}

// ==========================================
// SISTEMA DE AUDIO (WEB AUDIO API)
// ==========================================
let audioCtx = null;
let engineOsc = null;
let engineGain = null;

function iniciarAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Oscilador para el Motor
  engineOsc = audioCtx.createOscillator();
  engineGain = audioCtx.createGain();

  engineOsc.type = 'sawtooth';
  engineOsc.frequency.setValueAtTime(40, audioCtx.currentTime);
  engineGain.gain.setValueAtTime(0.04, audioCtx.currentTime);

  engineOsc.connect(engineGain);
  engineGain.connect(audioCtx.destination);
  engineOsc.start();

  reproducirMusicaSynth();
}

function actualizarSonidoMotor(velocidad, maxVel) {
  if (!audioCtx || !engineOsc) return;
  const ratio = Math.abs(velocidad) / maxVel;
  const freq = 40 + ratio * 160;
  engineOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.1);
}

function reproducirEfectoDerrape() {
  if (!audioCtx) return;
  const bufferSize = audioCtx.sampleRate * 0.05;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.02, audioCtx.currentTime);

  noise.connect(gain);
  gain.connect(audioCtx.destination);
  noise.start();
}

function reproducirMusicaSynth() {
  const notas = [110, 130.81, 146.83, 164.81]; // A2, C3, D3, E3
  let paso = 0;

  musicInterval = setInterval(() => {
    if (isPaused || isGameOver || !audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(notas[paso % notas.length], audioCtx.currentTime);

    gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);

    paso++;
  }, 250);
}

// ==========================================
// CICLO PRINCIPAL Y LÓGICA (GAME LOOP)
// ==========================================
function prepararEstadoInicial() {
  clearInterval(gameLoopInterval);

  nivelActual = 1;
  kmRecorridos = 0;
  framesFueraDePista = 0;

  isGameOver = false;
  isPaused = true;
  cruzoMeta = false;

  colocarAutoEnSalida();

  const btnPause = document.getElementById('btn-pause');
  if (btnPause) btnPause.innerText = '[ INICIAR CARRERA ]';

  gameLoopInterval = setInterval(gameStep, 1000 / 60);
}

function colocarAutoEnSalida() {
  const circuito = obtenerCircuitoActual();
  let p1 = circuito[0];
  let p2 = circuito[1];

  let dx = p2.x - p1.x;
  let dy = p2.y - p1.y;
  let dist = Math.hypot(dx, dy);

  if (dist < 150 && circuito.length > 2) {
    p1 = circuito[1];
    p2 = circuito[2];
    dx = p2.x - p1.x;
    dy = p2.y - p1.y;
  }

  const anguloPista = Math.atan2(dy, dx);

  // Auto posicionado a 120px (después de la meta ubicada a 40px)
  car.x = p1.x + Math.cos(anguloPista) * 120;
  car.y = p1.y + Math.sin(anguloPista) * 120;

  car.angle = anguloPista;
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;

  cam.x = car.x;
  cam.y = car.y;

  cruzoMeta = false;
  framesFueraDePista = 0;
}

function gameStep() {
  actualizarDimensionesCanvas();

  if (!isPaused && !isGameOver) {
    iniciarAudio();
    actualizarFisicas();
  }

  actualizarSonidoMotor(car.speed, car.maxSpeed);

  // Actualizar Cámara
  cam.x += (car.x - cam.x) * 0.1;
  cam.y += (car.y - cam.y) * 0.1;

  // Renderizado
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  
  // Transformación de Cámara
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(zoomFactor, zoomFactor);
  ctx.translate(-cam.x, -cam.y);

  dibujarPista();
  dibujarAuto();

  ctx.restore();

  verificarCondicionesMeta();
}

function actualizarFisicas() {
  // Controles
  if (keys['ArrowUp'] || keys['w'] || keys['W']) car.speed += car.accel;
  if (keys['ArrowDown'] || keys['s'] || keys['S']) car.speed -= car.accel;
  if (keys['ArrowLeft'] || keys['a'] || keys['A']) car.angle -= car.turnSpeed;
  if (keys['ArrowRight'] || keys['d'] || keys['D']) car.angle += car.turnSpeed;

  car.speed *= car.friction;

  if (car.speed > car.maxSpeed) car.speed = car.maxSpeed;
  if (car.speed < -car.maxSpeed / 2) car.speed = -car.maxSpeed / 2;

  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;

  car.x += car.vx;
  car.y += car.vy;

  kmRecorridos += Math.abs(car.speed) * 0.001;
}

function verificarCondicionesMeta() {
  const circuito = obtenerCircuitoActual();
  let p1 = circuito[0];
  let p2 = circuito[1];

  let dx = p2.x - p1.x;
  let dy = p2.y - p1.y;
  let dist = Math.hypot(dx, dy);

  if (dist < 150 && circuito.length > 2) {
    p1 = circuito[1];
    p2 = circuito[2];
    dx = p2.x - p1.x;
    dy = p2.y - p1.y;
  }

  const angulo = Math.atan2(dy, dx);
  const metaX = p1.x + Math.cos(angulo) * 40;
  const metaY = p1.y + Math.sin(angulo) * 40;

  let distMeta = Math.hypot(car.x - metaX, car.y - metaY);

  // Requiere velocidad y haber recorrido cierta distancia para evitar falsos positivos
  if (distMeta < 45 && car.speed > 2 && kmRecorridos > 0.5 && !cruzoMeta) {
    cruzoMeta = true;
    avanzarNivel();
  }
}

function avanzarNivel() {
  if (nivelActual >= circuitos.length) {
    isGameOver = true;
    alert("¡FELICITACIONES! HAS COMPLETADO TODAS LAS PISTAS.");
    prepararEstadoInicial();
    return;
  }

  nivelActual++;
  alert(`¡NIVEL COMPLETADO! INICIANDO NIVEL ${nivelActual}`);
  colocarAutoEnSalida();
}

// ==========================================
// RENDERIZADO Y DIBUJO DE PISTA Y AUTO
// ==========================================
function dibujarPista() {
  const circuito = obtenerCircuitoActual();

  // 1. Borde Neón
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 98;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#d946ef';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  trazarCaminoCurvo(circuito);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 2. Asfalto Interior
  ctx.strokeStyle = '#120824';
  ctx.lineWidth = 80;
  ctx.stroke();

  // 3. LÍNEA DE META PERPENDICULAR PERFECTA
  let p1 = circuito[0];
  let p2 = circuito[1];
  let dx = p2.x - p1.x;
  let dy = p2.y - p1.y;
  let dist = Math.hypot(dx, dy);

  if (dist < 150 && circuito.length > 2) {
    p1 = circuito[1];
    p2 = circuito[2];
    dx = p2.x - p1.x;
    dy = p2.y - p1.y;
  }

  const angulo = Math.atan2(dy, dx);
  const metaX = p1.x + Math.cos(angulo) * 40;
  const metaY = p1.y + Math.sin(angulo) * 40;

  ctx.save();
  ctx.translate(metaX, metaY);
  ctx.rotate(angulo);

  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, -40);
  ctx.lineTo(0, 40);
  ctx.stroke();

  ctx.restore();
}

function trazarCaminoCurvo(pts) {
  if (pts.length < 3) return;

  const len = pts.length;
  const radioCurva = 80;

  const startX = (pts[0].x + pts[1].x) / 2;
  const startY = (pts[0].y + pts[1].y) / 2;

  ctx.moveTo(startX, startY);

  for (let i = 1; i <= len; i++) {
    const pPrev = pts[i % len];
    const pNext = pts[(i + 1) % len];
    ctx.arcTo(pPrev.x, pPrev.y, pNext.x, pNext.y, radioCurva);
  }

  ctx.closePath();
}

function dibujarAuto() {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  // Cuerpo del auto
  ctx.fillStyle = '#a855f7';
  ctx.shadowColor = '#a855f7';
  ctx.shadowBlur = 10;
  ctx.fillRect(-15, -10, 30, 20);
  ctx.shadowBlur = 0;

  // Parabrisas
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, -7, 8, 14);

  ctx.restore();
}

function actualizarDimensionesCanvas() {
  if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
}

// Alternar pausa con botón o barra espaciadora
function togglePausa() {
  isPaused = !isPaused;
  const btnPause = document.getElementById('btn-pause');
  if (btnPause) {
    btnPause.innerText = isPaused ? '[ CONTINUAR ]' : '[ PAUSA ]';
  }
}

// Inicializar al cargar
window.onload = () => {
  prepararEstadoInicial();
};
