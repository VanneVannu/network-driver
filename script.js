/* ===================================================
   NETWORK-DRIVER // MOTOR DE CARRERA 360° CORREGIDO
   =================================================== */

const canvas = document.getElementById('lienzo-carrera');
const ctx = canvas.getContext('2d');

// Ajustar resolución interna del Canvas
canvas.width = 800;
canvas.height = 450;

let aliasJugador = "DRIVER_01";
let dificultad = "medio";

let gameLoopInterval = null;
let countdownInterval = null;

let isPaused = true;
let isGameOver = false;

// Estado de Fases
let estadoFase = "INSPECCION"; // "INSPECCION", "COUNTDOWN", "CARRERA"
let countdownTimer = 3;
let zoomFactor = 0.35;
let targetZoom = 1.0;

// Estado del Vehículo
let car = {
  x: 400,
  y: 650,
  angle: -Math.PI / 2,
  speed: 0,
  maxSpeed: 8,
  accel: 0.18,
  friction: 0.96,
  turnSpeed: 0.055
};

// Métricas
let tiempoRestante = 45;
let kmRecorridos = 0;
let nivelActual = 1;

// Teclas
const keys = { up: false, down: false, left: false, right: false, nitro: false };

// Circuito Base
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
   CONTROLES DE TECLADO
   =================================================== */
window.addEventListener('keydown', (e) => {
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
   FLUJO Y BOTONES
   =================================================== */
function iniciarCarrera() {
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

  tiempoRestante = 45;
  kmRecorridos = 0;
  nivelActual = 1;
  isGameOver = false;
  isPaused = true;
  
  estadoFase = "INSPECCION";
  zoomFactor = 0.35;
  targetZoom = 1.0;

  actualizarHUD();

  const btnPause = document.getElementById('btn-pause');
  if (btnPause) btnPause.innerText = '[ INICIAR CARRERA ]';

  // Iniciar bucle constante de dibujo (60 FPS)
  gameLoopInterval = setInterval(gameStep, 1000 / 60);
}

function pausarJuego() {
  if (isGameOver) return;

  if (estadoFase === "INSPECCION") {
    keys.up = keys.down = keys.left = keys.right = keys.nitro = false;

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

function volverAlMenu() {
  clearInterval(gameLoopInterval);
  clearInterval(countdownInterval);
  document.getElementById('escenario-juego').classList.add('oculto');
  document.getElementById('menu-inicio').classList.remove('oculto');
}

/* ===================================================
   FÍSICA
   =================================================== */
function gameStep() {
  if (estadoFase === "COUNTDOWN" || estadoFase === "CARRERA") {
    if (zoomFactor < targetZoom) zoomFactor += (targetZoom - zoomFactor) * 0.04;
  }

  if (estadoFase === "CARRERA" && !isPaused && !isGameOver) {
    if (keys.left) car.angle -= car.turnSpeed;
    if (keys.right) car.angle += car.turnSpeed;

    let topVel = keys.nitro ? car.maxSpeed * 1.4 : car.maxSpeed;
    if (keys.up) {
      if (car.speed < topVel) car.speed += car.accel;
    } else if (keys.down) {
      if (car.speed > -topVel * 0.4) car.speed -= car.accel;
    } else {
      car.speed *= car.friction;
    }

    car.x += Math.cos(car.angle) * car.speed;
    car.y += Math.sin(car.angle) * car.speed;

    kmRecorridos += Math.abs(car.speed) * 0.05;

    // Detección de Meta
    if (car.x >= 350 && car.x <= 450 && car.y >= 630 && car.y <= 670 && car.speed > 1) {
      nivelActual++;
      tiempoRestante += 25;
      car.x = 400;
      car.y = 650;
      car.angle = -Math.PI / 2;
      car.speed = 0;
    }
  }

  actualizarHUD();
  renderizar();
}

function gameOverTimeout() {
  isGameOver = true;
  ctx.fillStyle = 'rgba(9, 5, 20, 0.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ff3355';
  ctx.font = 'bold 24px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('TIME OUT // CONNECTION LOST', canvas.width / 2, canvas.height / 2);
}

function actualizarHUD() {
  document.getElementById('score-val').innerText = `LAP ${nivelActual}/3`;
  document.getElementById('speed-val').innerText = `${Math.floor(Math.abs(car.speed) * 25)} KM/H`;

  const tempEl = document.getElementById('temp-val');
  tempEl.innerText = `${tiempoRestante}S`;
  tempEl.style.color = tiempoRestante <= 10 ? '#ff3355' : '#facc15';
}

/* ===================================================
   RENDERIZADO VISUAL
   =================================================== */
function renderizar() {
  ctx.fillStyle = '#05020a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();

  if (estadoFase === "INSPECCION") {
    ctx.translate(canvas.width / 2 - 200, canvas.height / 2 - 150);
    ctx.scale(0.45, 0.45);
    dibujarPista();
    dibujarAutoJugador();
  } else {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoomFactor, zoomFactor);
    ctx.rotate(-car.angle - Math.PI / 2);
    ctx.translate(-car.x, -car.y);

    dibujarPista();
    dibujarAutoJugador();
  }

  ctx.restore();

  if (estadoFase === "CARRERA") dibujarMiniMapa();

  if (estadoFase === "COUNTDOWN" && countdownTimer > 0) {
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 60px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(countdownTimer.toString(), canvas.width / 2, canvas.height / 2);
  }
}

function dibujarPista() {
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 98;
  ctx.shadowColor = '#d946ef';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  trazarCaminoCircuito();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#120824';
  ctx.lineWidth = 86;
  ctx.stroke();

  // Línea de Meta
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

function dibujarAutoJugador() {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  if (keys.nitro) {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-28, -6, 12, 12);
  }

  ctx.fillStyle = '#d946ef';
  ctx.shadowColor = '#d946ef';
  ctx.shadowBlur = 12;
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

  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(car.x, car.y, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
