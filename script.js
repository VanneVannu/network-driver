/* ===================================================
   NETWORK-DRIVER // MOTOR DE CARRERA COMPLETO + AUDIO
   =================================================== */

const canvas = document.getElementById('lienzo-carrera') || document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 450;

let aliasJugador = "DRIVER_01";
let dificultad = "medio";

let gameLoopInterval = null;
let countdownInterval = null;
let musicInterval = null;

let isPaused = true;
let isGameOver = false;

let estadoFase = "INSPECCION";
let countdownTimer = 3;
let zoomFactor = 0.35;
let targetZoom = 1.0;

let textoNotificacion = "";
let timerNotificacion = 0;

let framesFueraDePista = 0;
let flashFaltaTimer = 0;

let cam = { x: 400, y: 650, angle: -Math.PI / 2 };

let car = {
  x: 400,
  y: 650,
  vx: 0,
  vy: 0,
  angle: -Math.PI / 2,
  speed: 0,
  maxSpeed: 8,
  accel: 0.22,
  friction: 0.97,
  turnSpeed: 0.05
};

let tiempoRestante = 60;
let kmRecorridos = 0;
let nivelActual = 1;
let fueraDePista = false;
let cruzoMeta = false;

let particulas = [];

const keys = { up: false, down: false, left: false, right: false, nitro: false };

// ===================================================
// CIRCUITOS REESTRUCTURADOS (5 NIVELES)
// ===================================================
const circuitos = [
  // Nivel 1: El Gran Óvalo Suave
  [
    { x: 400, y: 800 }, { x: 400, y: 200 }, { x: 900, y: 100 },
    { x: 1500, y: 300 }, { x: 1500, y: 800 }, { x: 900, y: 1000 }
  ],
  // Nivel 2: Serpiente con Curvas Estilo F1
  [
    { x: 400, y: 800 }, { x: 300, y: 400 }, { x: 600, y: 200 },
    { x: 1100, y: 100 }, { x: 1300, y: 500 }, { x: 1000, y: 600 },
    { x: 1400, y: 900 }, { x: 800, y: 1050 }
  ],
  // Nivel 3 (Anterior Nivel 4): Autódromo de Horquillas
  [
    { x: 400, y: 900 }, { x: 200, y: 500 }, { x: 400, y: 150 },
    { x: 800, y: 150 }, { x: 800, y: 650 }, { x: 1200, y: 150 },
    { x: 1600, y: 400 }, { x: 1500, y: 900 }, { x: 900, y: 850 }
  ],
  // Nivel 4 (Anterior Nivel 5): Megacircuito Network
  [
    { x: 400, y: 1000 }, { x: 200, y: 450 }, { x: 500, y: 100 },
    { x: 1200, y: 100 }, { x: 1700, y: 400 }, { x: 1700, y: 850 },
    { x: 1200, y: 1100 }, { x: 900, y: 700 }, { x: 600, y: 1100 }
  ],
  // Nivel 5 (NUEVO MAPA 5): Supercircuito Cyber-Ring
  [
    { x: 500, y: 900 }, { x: 500, y: 300 }, { x: 1000, y: 200 },
    { x: 1600, y: 400 }, { x: 1700, y: 900 }, { x: 1200, y: 1200 },
    { x: 800, y: 800 }
  ]
];

function obtenerCircuitoActual() {
  return circuitos[(nivelActual - 1) % circuitos.length];
}

function obtenerDatosMeta() {
  const circuito = obtenerCircuitoActual();
  let p1 = circuito[0];
  let p2 = circuito[1];

  let dx = p2.x - p1.x;
  let dy = p2.y - p1.y;

  const angulo = Math.atan2(dy, dx);
  const metaX = p1.x + dx * 0.3;
  const metaY = p1.y + dy * 0.3;

  return { metaX, metaY, angulo, p1, p2, dx, dy };
}

// ===================================================
// SISTEMA DE AUDIO SINTETIZADO (WEB AUDIO API)
// ===================================================
let audioCtx = null;
let engineOsc = null;
let engineGain = null;

function iniciarAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  engineOsc = audioCtx.createOscillator();
  engineGain = audioCtx.createGain();

  engineOsc.type = 'sawtooth';
  engineOsc.frequency.setValueAtTime(40, audioCtx.currentTime);
  engineGain.gain.setValueAtTime(0, audioCtx.currentTime);

  engineOsc.connect(engineGain);
  engineGain.connect(audioCtx.destination);
  engineOsc.start();

  reproducirMusicaSynth();
}

function detenerAudioCompleto() {
  if (engineGain && audioCtx) {
    engineGain.gain.cancelScheduledValues(audioCtx.currentTime);
    engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
  }
  if (musicInterval) {
    clearInterval(musicInterval);
    musicInterval = null;
  }
}

function actualizarSonidoMotor(velocidad, maxVel) {
  if (!audioCtx || !engineOsc || !engineGain) return;
  const absVel = Math.abs(velocidad);

  if (absVel < 0.1 || isPaused || isGameOver || estadoFase !== "CARRERA") {
    engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
    return;
  }

  const ratio = absVel / maxVel;
  const freq = 40 + ratio * 160;
  const vol = 0.02 + ratio * 0.04;

  engineOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.08);
  engineGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.08);
}

function reproducirEfectoDerrape() {
  if (!audioCtx || isPaused || isGameOver) return;
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
  if (musicInterval) clearInterval(musicInterval);
  const notas = [110, 130.81, 146.83, 164.81];
  let paso = 0;

  musicInterval = setInterval(() => {
    if (isPaused || isGameOver || !audioCtx || estadoFase !== "CARRERA") return;

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

// ===================================================
// CONTROLES DE TECLADO
// ===================================================
window.addEventListener('keydown', (e) => {
  if (isGameOver) return;
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

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

// ===================================================
// FLUJO DE JUEGO Y ESTADOS
// ===================================================
function iniciarCarrera() {
  iniciarAudio();
  const aliasInput = document.getElementById('input-alias');
  if (aliasInput && aliasInput.value.trim() !== "") aliasJugador = aliasInput.value.trim().toUpperCase();

  const selectDiff = document.getElementById('select-diff');
  if (selectDiff) dificultad = selectDiff.value;

  if (dificultad === 'facil') car.maxSpeed = 7;
  else if (dificultad === 'medio') car.maxSpeed = 9;
  else if (dificultad === 'dificil') car.maxSpeed = 11;

  const menuInicio = document.getElementById('menu-inicio');
  const escenarioJuego = document.getElementById('escenario-juego');
  if (menuInicio) menuInicio.classList.add('oculto');
  if (escenarioJuego) escenarioJuego.classList.remove('oculto');

  prepararEstadoInicial();
}

function prepararEstadoInicial() {
  clearInterval(gameLoopInterval);
  clearInterval(countdownInterval);

  nivelActual = 1;
  tiempoRestante = 60;
  kmRecorridos = 0;
  particulas = [];
  framesFueraDePista = 0;

  isGameOver = false;
  isPaused = true;
  cruzoMeta = false;
  
  estadoFase = "INSPECCION";
  zoomFactor = 0.35;
  targetZoom = 1.0;

  colocarAutoEnSalida();
  actualizarHUD();

  const btnPause = document.getElementById('btn-pause');
  if (btnPause) btnPause.innerText = '[ INICIAR CARRERA ]';

  gameLoopInterval = setInterval(gameStep, 1000 / 60);
}

function colocarAutoEnSalida() {
  const { metaX, metaY, angulo } = obtenerDatosMeta();

  car.x = metaX + Math.cos(angulo) * 80;
  car.y = metaY + Math.sin(angulo) * 80;

  car.angle = angulo;
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;

  cam.x = car.x;
  cam.y = car.y;
  cam.angle = car.angle;

  cruzoMeta = false;
  framesFueraDePista = 0;
}

function pausarJuego() {
  if (isGameOver) return;
  iniciarAudio();

  if (estadoFase === "INSPECCION") {
    estadoFase = "COUNTDOWN";
    countdownTimer = 3;

    const btnPause = document.getElementById('btn-pause');
    if (btnPause) btnPause.innerText = '[ EN CARRERA ]';

    countdownInterval = setInterval(() => {
      countdownTimer--;
      if (countdownTimer <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        
        estadoFase = "CARRERA";
        isPaused = false;
        iniciarTimerReloj();
      }
    }, 1000);
  } else if (estadoFase === "CARRERA") {
    isPaused = !isPaused;
    if (isPaused) detenerAudioCompleto();
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
  detenerAudioCompleto();
  prepararEstadoInicial();
}

function volverAlMenu() {
  clearInterval(gameLoopInterval);
  clearInterval(countdownInterval);
  detenerAudioCompleto();

  const menuInicio = document.getElementById('menu-inicio');
  const escenarioJuego = document.getElementById('escenario-juego');
  if (escenarioJuego) escenarioJuego.classList.add('oculto');
  if (menuInicio) menuInicio.classList.remove('oculto');
}

// ===================================================
// FÍSICA Y CICLO DE CÁLCULO (GAME STEP)
// ===================================================
function gameStep() {
  if (estadoFase === "COUNTDOWN" || estadoFase === "CARRERA") {
    if (zoomFactor < targetZoom) zoomFactor += (targetZoom - zoomFactor) * 0.04;
  }

  if (estadoFase === "CARRERA" && !isPaused && !isGameOver) {
    verificarFueraDePista();
    actualizarSonidoMotor(car.speed, car.maxSpeed);

    if (fueraDePista && Math.abs(car.speed) > 0.5) {
      reproducirEfectoDerrape();
      framesFueraDePista++;
      if (framesFueraDePista >= 30) {
        tiempoRestante = Math.max(0, tiempoRestante - 1);
        framesFueraDePista = 0;
        flashFaltaTimer = 15;
        if (tiempoRestante <= 0) gameOverTimeout();
      }
    } else {
      framesFueraDePista = 0;
    }

    if (keys.left) car.angle -= car.turnSpeed;
    if (keys.right) car.angle += car.turnSpeed;

    let maxVelActual = keys.nitro ? car.maxSpeed * 1.4 : car.maxSpeed;
    if (fueraDePista) maxVelActual *= 0.35;

    if (keys.up || keys.nitro) {
      let acelActual = keys.nitro ? car.accel * 1.5 : car.accel;
      if (car.speed < maxVelActual) car.speed += acelActual;
    } else if (keys.down) {
      if (car.speed > -maxVelActual * 0.4) car.speed -= car.accel;
    } else {
      car.speed *= car.friction;
    }

    if (fueraDePista) car.speed *= 0.88;

    let forwardX = Math.cos(car.angle) * car.speed;
    let forwardY = Math.sin(car.angle) * car.speed;

    car.vx += (forwardX - car.vx) * 0.15;
    car.vy += (forwardY - car.vy) * 0.15;

    car.x += car.vx;
    car.y += car.vy;

    kmRecorridos += Math.sqrt(car.vx * car.vx + car.vy * car.vy) * 0.005;

    if (keys.nitro || fueraDePista || (Math.abs(car.speed) > 4 && (keys.left || keys.right))) {
      particulas.push({
        x: car.x - Math.cos(car.angle) * 15,
        y: car.y - Math.sin(car.angle) * 15,
        size: Math.random() * 4 + 2,
        life: 1.0,
        color: fueraDePista ? '#ff3355' : (keys.nitro ? '#facc15' : '#d946ef')
      });
    }

    // Detección de Meta con validación de sentido
    const { metaX, metaY, angulo } = obtenerDatosMeta();
    let distMeta = Math.hypot(car.x - metaX, car.y - metaY);

    let dirPistaX = Math.cos(angulo);
    let dirPistaY = Math.sin(angulo);
    let dirAutoX = Math.cos(car.angle);
    let dirAutoY = Math.sin(car.angle);

    let vaEnSentidoCorrecto = (dirAutoX * dirPistaX + dirAutoY * dirPistaY) > 0.5;

    if (distMeta < 45 && car.speed > 2 && kmRecorridos > 0.6 && !cruzoMeta && vaEnSentidoCorrecto) {
      cruzoMeta = true;
      avanzarNivel();
    }

    cam.x += (car.x - cam.x) * 0.1;
    cam.y += (car.y - cam.y) * 0.1;
    
    let diffAngle = car.angle - cam.angle;
    while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
    while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
    cam.angle += diffAngle * 0.08;
  } else {
    actualizarSonidoMotor(0, car.maxSpeed);
  }

  for (let i = particulas.length - 1; i >= 0; i--) {
    particulas[i].life -= 0.05;
    if (particulas[i].life <= 0) particulas.splice(i, 1);
  }

  if (timerNotificacion > 0) timerNotificacion--;
  if (flashFaltaTimer > 0) flashFaltaTimer--;

  actualizarHUD();
  renderizar();
}

function verificarFueraDePista() {
  const circuito = obtenerCircuitoActual();
  let distMinima = 9999;

  for (let i = 0; i < circuito.length; i++) {
    const p1 = circuito[i];
    const p2 = circuito[(i + 1) % circuito.length];
    const dist = distanciaPuntoASegmento(car.x, car.y, p1.x, p1.y, p2.x, p2.y);
    if (dist < distMinima) distMinima = dist;
  }

  fueraDePista = distMinima > 45;
}

function distanciaPuntoASegmento(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function avanzarNivel() {
  if (nivelActual >= circuitos.length) {
    isGameOver = true;
    detenerAudioCompleto();
    alert("¡LEYENDA DEL ROAD! HAS COMPLETADO LOS 5 MEGACIRCUITOS.");
    volverAlMenu();
    return;
  }

  nivelActual++;
  tiempoRestante = 60;
  kmRecorridos = 0;
  textoNotificacion = `¡NIVEL ${nivelActual} / ${circuitos.length} INICIADO!`;
  timerNotificacion = 150;

  colocarAutoEnSalida();
}

function gameOverTimeout() {
  isGameOver = true;
  detenerAudioCompleto();
  ctx.fillStyle = 'rgba(9, 5, 20, 0.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ff3355';
  ctx.font = 'bold 24px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('TIME OUT // CONNECTION LOST', canvas.width / 2, canvas.height / 2);
}

function actualizarHUD() {
  const elScore = document.getElementById('score-val');
  const elSpeed = document.getElementById('speed-val');
  const elTemp = document.getElementById('temp-val');

  if (elScore) elScore.innerText = `MAPA ${nivelActual}/${circuitos.length}`;
  if (elSpeed) elSpeed.innerText = `${Math.floor(Math.abs(car.speed) * 25)} KM/H`;
  if (elTemp) {
    elTemp.innerText = `${tiempoRestante}S`;
    elTemp.style.color = (flashFaltaTimer > 0 || tiempoRestante <= 10) ? '#ff3355' : '#facc15';
  }
}

// ===================================================
// RENDERIZADO Y DIBUJO TÉCNICO
// ===================================================
function renderizar() {
  ctx.fillStyle = '#05020a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();

  if (estadoFase === "INSPECCION") {
    ctx.translate(canvas.width / 2 - 200, canvas.height / 2 - 150);
    ctx.scale(0.3, 0.3);
    dibujarGridFondo();
    dibujarPista();
    dibujarAutoJugador();
  } else {
    let shakeX = fueraDePista ? (Math.random() - 0.5) * 4 : 0;
    let shakeY = fueraDePista ? (Math.random() - 0.5) * 4 : 0;

    ctx.translate(canvas.width / 2 + shakeX, canvas.height / 2 + shakeY);
    ctx.scale(zoomFactor, zoomFactor);
    ctx.rotate(-cam.angle - Math.PI / 2);
    ctx.translate(-cam.x, -cam.y);

    dibujarGridFondo();
    dibujarPista();
    dibujarParticulas();
    dibujarAutoJugador();
  }

  ctx.restore();

  if (estadoFase === "CARRERA") {
    dibujarMiniMapa();
    
    if (fueraDePista) {
      ctx.fillStyle = '#ff3355';
      ctx.font = 'bold 18px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('[ ¡FUERA DE PISTA! PENALIZACIÓN -1S ]', canvas.width / 2, canvas.height - 30);
    }

    if (timerNotificacion > 0) {
      ctx.fillStyle = 'rgba(18, 8, 36, 0.85)';
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.fillRect(canvas.width / 2 - 180, 20, 360, 45);
      ctx.strokeRect(canvas.width / 2 - 180, 20, 360, 45);

      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 16px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(textoNotificacion, canvas.width / 2, 48);
    }
  }

  if (estadoFase === "COUNTDOWN" && countdownTimer > 0) {
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 60px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(countdownTimer.toString(), canvas.width / 2, canvas.height / 2);
  }
}

function dibujarGridFondo() {
  ctx.strokeStyle = fueraDePista ? 'rgba(255, 51, 85, 0.12)' : 'rgba(217, 70, 239, 0.07)';
  ctx.lineWidth = 1;
  const gridSize = 80;
  
  const startX = Math.floor((cam.x - 1200) / gridSize) * gridSize;
  const endX = startX + 2400;
  const startY = Math.floor((cam.y - 1200) / gridSize) * gridSize;
  const endY = startY + 2400;

  ctx.beginPath();
  for (let x = startX; x < endX; x += gridSize) {
    ctx.moveTo(x, startY); ctx.lineTo(x, endY);
  }
  for (let y = startY; y < endY; y += gridSize) {
    ctx.moveTo(startX, y); ctx.lineTo(endX, y);
  }
  ctx.stroke();
}

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

  // 3. Meta Centrada
  const { metaX, metaY, angulo } = obtenerDatosMeta();

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

function dibujarParticulas() {
  for (let p of particulas) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;
}

function dibujarAutoJugador() {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  ctx.fillStyle = fueraDePista ? '#ff3355' : '#d946ef';
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 10;
  ctx.fillRect(-18, -12, 36, 24);

  ctx.fillStyle = '#facc15';
  ctx.fillRect(-4, -9, 12, 18);
  ctx.shadowBlur = 0;

  ctx.restore();
}

function dibujarMiniMapa() {
  const mapW = 110;
  const mapH = 70;
  const mapX = canvas.width - mapW - 15;
  const mapY = 15;
  const circuito = obtenerCircuitoActual();

  ctx.fillStyle = 'rgba(9, 5, 20, 0.85)';
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 1;
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  ctx.save();
  ctx.translate(mapX + 10, mapY + 10);
  ctx.scale(0.05, 0.05);
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 15;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  trazarCaminoCurvo(circuito);
  ctx.stroke();

  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(car.x, car.y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ===================================================
// INICIALIZACIÓN DE BOTONES DOM Y EVENTOS
// ===================================================
window.onload = () => {
  const btnStart = document.getElementById('btn-start');
  if (btnStart) btnStart.addEventListener('click', iniciarCarrera);

  const btnPause = document.getElementById('btn-pause');
  if (btnPause) btnPause.addEventListener('click', pausarJuego);

  const btnRestart = document.getElementById('btn-restart');
  if (btnRestart) btnRestart.addEventListener('click', reiniciarCarrera);

  const btnMenu = document.getElementById('btn-menu');
  if (btnMenu) btnMenu.addEventListener('click', volverAlMenu);

  prepararEstadoInicial();
};
