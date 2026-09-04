/* ===================================================
   NETWORK-DRIVER // MOTOR DE CARRERA 360° COMPLETO
   NIVELES DINÁMICOS, ZONA OFF-ROAD Y ARRANQUE DIRECTO
   =================================================== */

const canvas = document.getElementById('lienzo-carrera');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 450;

let aliasJugador = "DRIVER_01";
let dificultad = "medio";

let gameLoopInterval = null;
let countdownInterval = null;

let isPaused = true;
let isGameOver = false;
let cruzoMeta = false; // Evita activar la meta inmediatamente al aparecer

// Estado de Fases
let estadoFase = "INSPECCION";
let countdownTimer = 3;
let zoomFactor = 0.35;
let targetZoom = 1.0;

// Cámara Suave
let cam = { x: 400, y: 650, angle: -Math.PI / 2 };

// Estado del Vehículo
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

let tiempoRestante = 45;
let kmRecorridos = 0;
let nivelActual = 1;
let fueraDePista = false;

let particulas = [];

const keys = { up: false, down: false, left: false, right: false, nitro: false };

// ===================================================
// TRUTAS Y CIRCUITOS POR NIVEL
// ===================================================
const circuitos = [
  // Nivel 1: Circuito Oval
  [
    { x: 400, y: 650 }, { x: 400, y: 250 }, { x: 650, y: 150 },
    { x: 950, y: 250 }, { x: 950, y: 650 }, { x: 750, y: 800 }, { x: 550, y: 750 }
  ],
  // Nivel 2: Circuito con Chicana / S
  [
    { x: 400, y: 650 }, { x: 300, y: 300 }, { x: 600, y: 300 },
    { x: 600, y: 100 }, { x: 1000, y: 100 }, { x: 1000, y: 650 }, { x: 700, y: 750 }
  ],
  // Nivel 3: Circuito Complejo (Hardcore)
  [
    { x: 400, y: 650 }, { x: 200, y: 400 }, { x: 400, y: 150 },
    { x: 800, y: 150 }, { x: 1000, y: 350 }, { x: 800, y: 550 },
    { x: 1100, y: 750 }, { x: 600, y: 850 }
  ]
];

function obtenerCircuitoActual() {
  return circuitos[(nivelActual - 1) % circuitos.length];
}

/* ===================================================
   CONTROLES DE TECLADO
   =================================================== */
window.addEventListener('keydown', (e) => {
  if (isGameOver) return;
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
   FLUJO DE JUEGO Y RESTART
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

  nivelActual = 1; // Asegura iniciar siempre en nivel 1
  colocarAutoEnSalida();

  tiempoRestante = 45;
  kmRecorridos = 0;
  particulas = [];

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

function colocarAutoEnSalida() {
  const circuito = obtenerCircuitoActual();
  const pSalida = circuito[0];
  const pSiguiente = circuito[1];

  // 1. Calcular la dirección/ángulo hacia donde va la pista desde la salida
  const dx = pSiguiente.x - pSalida.x;
  const dy = pSiguiente.y - pSalida.y;
  const anguloPista = Math.atan2(dy, dx);

  // 2. Colocar el auto 80 píxeles ADELANTE de la línea de meta
  const distanciaAdelanto = 80;
  car.x = pSalida.x + Math.cos(anguloPista) * distanciaAdelanto;
  car.y = pSalida.y + Math.sin(anguloPista) * distanciaAdelanto;

  // 3. Orientar el auto y la cámara hacia la dirección de la pista
  car.angle = anguloPista;
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;

  cam.x = car.x;
  cam.y = car.y;
  cam.angle = car.angle;

  cruzoMeta = false;
}

function pausarJuego() {
  if (isGameOver) return;

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
        
        // Habilitar controles e inicio inmediato
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
   FÍSICA, OFF-ROAD Y DETECCIÓN DE META
   =================================================== */
function gameStep() {
  if (estadoFase === "COUNTDOWN" || estadoFase === "CARRERA") {
    if (zoomFactor < targetZoom) zoomFactor += (targetZoom - zoomFactor) * 0.04;
  }

  if (estadoFase === "CARRERA" && !isPaused && !isGameOver) {
    // Verificar si estamos fuera de pista
    verificarFueraDePista();

    // Giros
    if (keys.left) car.angle -= car.turnSpeed;
    if (keys.right) car.angle += car.turnSpeed;

    // Velocidad máxima reducida si estás fuera de pista
    let maxVelActual = keys.nitro ? car.maxSpeed * 1.4 : car.maxSpeed;
    if (fueraDePista) maxVelActual *= 0.35; // Frenado del 65% en pasto/código

    if (keys.up || keys.nitro) {
      let acelActual = keys.nitro ? car.accel * 1.5 : car.accel;
      if (car.speed < maxVelActual) car.speed += acelActual;
    } else if (keys.down) {
      if (car.speed > -maxVelActual * 0.4) car.speed -= car.accel;
    } else {
      car.speed *= car.friction;
    }

    // Fricción extra fuera de pista
    if (fueraDePista) car.speed *= 0.88;

    // Movimiento Vectorial
    let forwardX = Math.cos(car.angle) * car.speed;
    let forwardY = Math.sin(car.angle) * car.speed;

    car.vx += (forwardX - car.vx) * 0.15;
    car.vy += (forwardY - car.vy) * 0.15;

    car.x += car.vx;
    car.y += car.vy;

    kmRecorridos += Math.sqrt(car.vx * car.vx + car.vy * car.vy) * 0.05;

    // Partículas
    if (keys.nitro || fueraDePista || (Math.abs(car.speed) > 4 && (keys.left || keys.right))) {
      particulas.push({
        x: car.x - Math.cos(car.angle) * 15,
        y: car.y - Math.sin(car.angle) * 15,
        size: Math.random() * 4 + 2,
        life: 1.0,
        color: fueraDePista ? '#ff3355' : (keys.nitro ? '#facc15' : '#d946ef')
      });
    }

   // Detección de Meta al completar la vuelta
    const pMeta = obtenerCircuitoActual()[0];
    let distMeta = Math.hypot(car.x - pMeta.x, car.y - pMeta.y);

    // Solo activa la meta si el auto pasa cerca y va a más de 2 KM/H
    if (distMeta < 50 && car.speed > 2 && !cruzoMeta) {
      cruzoMeta = true;
      avanzarNivel();
    }

    // Cámara Suave (Lerp)
    cam.x += (car.x - cam.x) * 0.1;
    cam.y += (car.y - cam.y) * 0.1;
    
    let diffAngle = car.angle - cam.angle;
    while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
    while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
    cam.angle += diffAngle * 0.08;
  }

  // Actualizar partículas
  for (let i = particulas.length - 1; i >= 0; i--) {
    particulas[i].life -= 0.05;
    if (particulas[i].life <= 0) particulas.splice(i, 1);
  }

  actualizarHUD();
  renderizar();
}

// Comprueba la distancia mínima a los segmentos de la pista
function verificarFueraDePista() {
  const circuito = obtenerCircuitoActual();
  let distMinima = 9999;

  for (let i = 0; i < circuito.length; i++) {
    const p1 = circuito[i];
    const p2 = circuito[(i + 1) % circuito.length];
    const dist = distanciaPuntoASegmento(car.x, car.y, p1.x, p1.y, p2.x, p2.y);
    if (dist < distMinima) distMinima = dist;
  }

  // Ancho de la pista es 84px, el radio de tolerancia es 42px
  fueraDePista = distMinima > 42;
}

function distanciaPuntoASegmento(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function avanzarNivel() {
  nivelActual++;
  tiempoRestante += 20;

  if (nivelActual > 3) {
    isGameOver = true;
    alert("¡FELICIDADES! HAS COMPLETADO TODOS LOS NIVELES.");
    volverAlMenu();
    return;
  }

  colocarAutoEnSalida();
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
  document.getElementById('score-val').innerText = `MAPA ${nivelActual}/3`;
  document.getElementById('speed-val').innerText = `${Math.floor(Math.abs(car.speed) * 25)} KM/H`;

  const tempEl = document.getElementById('temp-val');
  tempEl.innerText = `${tiempoRestante}S`;
  tempEl.style.color = tiempoRestante <= 10 ? '#ff3355' : '#facc15';
}

/* ===================================================
   RENDERIZADO
   =================================================== */
function renderizar() {
  ctx.fillStyle = '#05020a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();

  if (estadoFase === "INSPECCION") {
    ctx.translate(canvas.width / 2 - 200, canvas.height / 2 - 150);
    ctx.scale(0.45, 0.45);
    dibujarGridFondo();
    dibujarPista();
    dibujarAutoJugador();
  } else {
    // Sacudida de cámara si está fuera de pista
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
    
    // Alerta Fuera de Pista en pantalla
    if (fueraDePista) {
      ctx.fillStyle = '#ff3355';
      ctx.font = 'bold 18px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('[ ¡FUERA DE PISTA! ]', canvas.width / 2, canvas.height - 30);
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
  
  const startX = Math.floor((cam.x - 1000) / gridSize) * gridSize;
  const endX = startX + 2000;
  const startY = Math.floor((cam.y - 1000) / gridSize) * gridSize;
  const endY = startY + 2000;

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

  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 98;
  ctx.shadowColor = '#d946ef';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  trazarCaminoCircuito(circuito);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#120824';
  ctx.lineWidth = 84;
  ctx.stroke();

  // Línea de Meta
  const pMeta = circuito[0];
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(pMeta.x - 50, pMeta.y);
  ctx.lineTo(pMeta.x + 50, pMeta.y);
  ctx.stroke();
}

function trazarCaminoCircuito(circuito) {
  ctx.moveTo(circuito[0].x, circuito[0].y);
  for (let i = 1; i < circuito.length; i++) {
    ctx.lineTo(circuito[i].x, circuito[i].y);
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
  ctx.scale(0.08, 0.07);
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 15;
  ctx.beginPath();
  trazarCaminoCircuito(circuito);
  ctx.stroke();

  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(car.x, car.y, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
