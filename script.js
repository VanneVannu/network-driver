/* ===================================================
   NETWORK-DRIVER // CYBER OVERDRIVE
   SCRIPT PRINCIPAL DE LÓGICA Y RENDERIZADO CANVAS
   =================================================== */

// 1. CONFIGURACIÓN DEL CANVAS Y ESTADO GLOBAL
const canvas = document.getElementById('lienzo-carrera');
const ctx = canvas.getContext('2d');

let aliasJugador = "DRIVER_01";
let modoCamara = "pseudo3d"; // "pseudo3d" o "topdown"
let dificultad = "medio";

let gameLoopInterval = null;
let isPaused = true;
let isGameOver = false;
let carreraIniciada = false;

// Variables de Juego y Física
let kmRecorridos = 0;
let velocidadActual = 0;
let velocidadBase = 180;
let velocidadMaxima = 320;
let temperatura = 35.0;

// Estado del Jugador (Vehículo)
let playerX = 0; // -1 (Carril Izq), 0 (Centro), 1 (Carril Der)
let targetPlayerX = 0;
let playerYPos3D = 0; // Animación de rebote en 3D

// Estado de Teclas
const keys = {
  left: false,
  right: false,
  nitro: false,
  brake: false
};

// Tráfico (Vehículos de red)
let trafico = [];
let spawnTimer = 0;

/* ===================================================
   2. SISTEMA DE AUDIO (WEB AUDIO API SINTETIZADO)
   =================================================== */
class SoundEffects {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playBeep(freq = 440, type = 'sine', duration = 0.1, vol = 0.1) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }

  playCrash() {
    if (!this.ctx) return;
    try {
      const bufferSize = this.ctx.sampleRate * 0.3;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
      whiteNoise.connect(gain);
      gain.connect(this.ctx.destination);
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
  if (isGameOver) return;

  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
    if (targetPlayerX > -1) targetPlayerX -= 1;
  }
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
    if (targetPlayerX < 1) targetPlayerX += 1;
  }
  if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
    keys.nitro = true;
  }
  if (e.key === ' ' || e.key === 'Spacebar') {
    keys.brake = true;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
    keys.nitro = false;
  }
  if (e.key === ' ' || e.key === 'Spacebar') {
    keys.brake = false;
  }
});

/* ===================================================
   4. FLUJO DE NAVEGACIÓN Y CONFIGURACIÓN
   =================================================== */
function iniciarCarrera() {
  sfx.init();
  
  // Leer campos de formulario
  const aliasInput = document.getElementById('input-alias').value.trim();
  aliasJugador = aliasInput !== "" ? aliasInput.toUpperCase() : "DRIVER_01";
  modoCamara = document.getElementById('select-camara').value;
  dificultad = document.getElementById('select-diff').value;

  // Ajustar velocidad base según dificultad
  if (dificultad === 'facil') velocidadBase = 140;
  else if (dificultad === 'medio') velocidadBase = 200;
  else if (dificultad === 'dificil') velocidadBase = 260;

  // Ocultar menú y mostrar juego
  document.getElementById('menu-inicio').classList.add('oculto');
  document.getElementById('escenario-juego').classList.remove('oculto');

  prepararEstadoInicial();
}

function prepararEstadoInicial() {
  clearInterval(gameLoopInterval);
  gameLoopInterval = null;

  kmRecorridos = 0;
  velocidadActual = 0;
  temperatura = 35.0;
  playerX = 0;
  targetPlayerX = 0;
  trafico = [];
  spawnTimer = 0;
  
  isGameOver = false;
  isPaused = true;
  carreraIniciada = false;

  actualizarHUD();
  renderizar(); // Muestra el estado estático listo

  const btnPause = document.getElementById('btn-pause');
  if (btnPause) btnPause.innerText = '[ INICIAR PARTIDA ]';

  // Iniciar bucle congelado en pausa
  gameLoopInterval = setInterval(gameStep, 1000 / 60);
}

function reiniciarCarrera() {
  prepararEstadoInicial();
  iniciarBucle();
}

function iniciarBucle() {
  carreraIniciada = true;
  isPaused = false;
  const btnPause = document.getElementById('btn-pause');
  if (btnPause) btnPause.innerText = '[ PAUSA ]';
  sfx.playBeep(880, 'triangle', 0.15, 0.2);
}

function pausarJuego() {
  if (isGameOver) return;

  if (!carreraIniciada) {
    iniciarBucle();
    return;
  }

  isPaused = !isPaused;
  const btnPause = document.getElementById('btn-pause');
  if (btnPause) btnPause.innerText = isPaused ? '[ REANUDAR ]' : '[ PAUSA ]';
}

function volverAlMenu() {
  clearInterval(gameLoopInterval);
  gameLoopInterval = null;
  document.getElementById('escenario-juego').classList.add('oculto');
  document.getElementById('menu-inicio').classList.remove('oculto');
}

/* ===================================================
   5. BUCLE PRINCIPAL DE FÍSICA (GAME STEP)
   =================================================== */
function gameStep() {
  if (isPaused || isGameOver) return;

  // Transición suave de carril
  playerX += (targetPlayerX - playerX) * 0.2;

  // Manejo de Velocidad y Nitro
  let velObjetivo = velocidadBase;
  if (keys.nitro) {
    velObjetivo = velocidadMaxima;
    temperatura += 0.15; // Calienta el motor
  } else if (keys.brake) {
    velObjetivo = velocidadBase * 0.4;
  } else {
    if (temperatura > 35.0) temperatura -= 0.08; // Enfría gradualmente
  }

  // Límite de temperatura
  if (temperatura >= 95.0) {
    temperatura = 95.0;
    // Penalización por sobrecalentamiento
    velObjetivo = velocidadBase * 0.5;
    sfx.playBeep(220, 'sawtooth', 0.05, 0.05);
  }

  velocidadActual += (velObjetivo - velocidadActual) * 0.05;
  kmRecorridos += (velocidadActual / 3600) * 0.2;

  // Spawn de Tráfico
  spawnTimer++;
  if (spawnTimer > (12000 / velocidadActual)) {
    spawnTimer = 0;
    const carrilRandom = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
    trafico.push({
      x: carrilRandom,
      z: modoCamara === 'pseudo3d' ? 1000 : -100, // Distancia
      speed: velocidadBase * (0.5 + Math.random() * 0.3)
    });
  }

  // Actualizar posición de tráfico
  for (let i = trafico.length - 1; i >= 0; i--) {
    let t = trafico[i];
    if (modoCamara === 'pseudo3d') {
      t.z -= (velocidadActual - t.speed) * 0.15;
      
      // Chequeo Colisión 3D
      if (t.z < 80 && t.z > 20 && Math.abs(t.x - playerX) < 0.5) {
        colisionDetectada();
      }
      if (t.z < 0) trafico.splice(i, 1);
    } else {
      // Top-Down
      t.z += (velocidadActual - t.speed) * 0.08;
      
      // Chequeo Colisión Top-Down
      if (t.z > 260 && t.z < 340 && Math.abs(t.x - playerX) < 0.6) {
        colisionDetectada();
      }
      if (t.z > 450) trafico.splice(i, 1);
    }
  }

  actualizarHUD();
  renderizar();
}

function colisionDetectada() {
  sfx.playCrash();
  isGameOver = true;
  clearInterval(gameLoopInterval);
  
  // Dibujar mensaje de Game Over
  ctx.fillStyle = 'rgba(9, 5, 20, 0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ff3355';
  ctx.font = 'bold 26px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('CRASH // SYSTEM FAILURE', canvas.width / 2, canvas.height / 2 - 10);

  ctx.fillStyle = '#facc15';
  ctx.font = '14px Courier New';
  ctx.fillText(`PILOTO: ${aliasJugador} | DISTANCIA: ${Math.floor(kmRecorridos)} KM`, canvas.width / 2, canvas.height / 2 + 25);
}

function actualizarHUD() {
  document.getElementById('score-val').innerText = `${Math.floor(kmRecorridos).toString().padStart(4, '0')} KM`;
  document.getElementById('speed-val').innerText = `${Math.floor(velocidadActual)} KM/H`;
  
  const tempEl = document.getElementById('temp-val');
  tempEl.innerText = `${temperatura.toFixed(1)}°C`;
  if (temperatura > 75.0) {
    tempEl.style.color = '#ff3355';
  } else {
    tempEl.style.color = '#facc15';
  }
}

/* ===================================================
   6. RENDERIZADO VISUAL (PERSPECTIVAS CANVAS)
   =================================================== */
function renderizar() {
  // Limpiar lienzo
  ctx.fillStyle = '#05020a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (modoCamara === 'pseudo3d') {
    renderizarPseudo3D();
  } else {
    renderizarTopDown();
  }
}

// --- MÓDULO 1: PERSPECTIVA 3D (PSEUDO-3D HORIZON) ---
function renderizarPseudo3D() {
  const horizon = canvas.height * 0.45;
  const centerX = canvas.width / 2;

  // Fondo Noche / Horizonte
  const grad = ctx.createLinearGradient(0, 0, 0, horizon);
  grad.addColorStop(0, '#090514');
  grad.addColorStop(1, '#2b0938');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, horizon);

  // Sol Cibernético
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(centerX, horizon - 10, 35, Math.PI, 0, false);
  ctx.fill();

  // Dibujar Pista (Trapecio hacia el horizonte)
  ctx.fillStyle = '#120824';
  ctx.beginPath();
  ctx.moveTo(centerX - 40, horizon);
  ctx.lineTo(centerX + 40, horizon);
  ctx.lineTo(canvas.width - 50, canvas.height);
  ctx.lineTo(50, canvas.height);
  ctx.closePath();
  ctx.fill();

  // Bordes Neón
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centerX - 40, horizon);
  ctx.lineTo(50, canvas.height);
  ctx.moveTo(centerX + 40, horizon);
  ctx.lineTo(canvas.width - 50, canvas.height);
  ctx.stroke();

  // Dibujar Tráfico 3D
  trafico.sort((a, b) => b.z - a.z); // Renderizar de atrás hacia adelante
  trafico.forEach(t => {
    const scale = 1 - (t.z / 1000);
    if (scale > 0) {
      const x = centerX + (t.x * 120 * scale);
      const y = horizon + ((canvas.height - horizon) * scale);
      const w = 40 * scale;
      const h = 20 * scale;

      ctx.fillStyle = '#ff3355';
      ctx.fillRect(x - w / 2, y - h, w, h);
    }
  });

  // Auto del Jugador (Base de pantalla)
  const playerCanvasX = centerX + (playerX * 130);
  const playerY = canvas.height - 50;

  // Estela de Nitro
  if (keys.nitro) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(playerCanvasX - 15, playerY + 15);
    ctx.lineTo(playerCanvasX + 15, playerY + 15);
    ctx.lineTo(playerCanvasX, playerY + 35 + Math.random() * 10);
    ctx.closePath();
    ctx.fill();
  }

  // Cuerpo Auto Jugador
  ctx.fillStyle = '#d946ef';
  ctx.shadowColor = '#d946ef';
  ctx.shadowBlur = 15;
  ctx.fillRect(playerCanvasX - 25, playerY - 15, 50, 25);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(playerCanvasX - 20, playerY - 10, 40, 8); // Parabrisas
  ctx.shadowBlur = 0;
}

// --- MÓDULO 2: VISTA AÉREA (TOP-DOWN) ---
function renderizarTopDown() {
  const roadWidth = 240;
  const roadLeft = (canvas.width - roadWidth) / 2;

  // Asfalto
  ctx.fillStyle = '#120824';
  ctx.fillRect(roadLeft, 0, roadWidth, canvas.height);

  // Lineas Laterales Neón
  ctx.strokeStyle = '#d946ef';
  ctx.lineWidth = 4;
  ctx.strokeRect(roadLeft, 0, roadWidth, canvas.height);

  // Líneas de Carril Punteadas
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)';
  ctx.setLineDash([20, 20]);
  ctx.lineDashOffset = -kmRecorridos * 100;
  ctx.beginPath();
  ctx.moveTo(roadLeft + roadWidth / 3, 0);
  ctx.lineTo(roadLeft + roadWidth / 3, canvas.height);
  ctx.moveTo(roadLeft + (roadWidth / 3) * 2, 0);
  ctx.lineTo(roadLeft + (roadWidth / 3) * 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]); // Resetear patrón

  // Tráfico Top-Down
  trafico.forEach(t => {
    const x = roadLeft + roadWidth / 2 + (t.x * 70);
    const y = t.z;

    ctx.fillStyle = '#ff3355';
    ctx.fillRect(x - 15, y - 25, 30, 50);
  });

  // Auto del Jugador
  const playerCanvasX = roadLeft + roadWidth / 2 + (playerX * 70);
  const playerY = 300;

  // Fuego de Nitro
  if (keys.nitro) {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(playerCanvasX - 10, playerY + 25, 20, 15 + Math.random() * 10);
  }

  // Cuerpo Auto Top-Down
  ctx.fillStyle = '#d946ef';
  ctx.shadowColor = '#d946ef';
  ctx.shadowBlur = 12;
  ctx.fillRect(playerCanvasX - 18, playerY - 25, 36, 50);
  ctx.fillStyle = '#090514';
  ctx.fillRect(playerCanvasX - 14, playerY - 10, 28, 15); // Techo
  ctx.shadowBlur = 0;
}