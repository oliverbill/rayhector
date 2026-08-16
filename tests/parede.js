// Teste focado da escalada de penhasco: monta uma parede limpa de 500px e
// sobe agarrando e saltando, com um controlador realista (segura o pulo, volta
// a colar depois do wallLock). Falha se a subida não vencer a parede.
//
// Uso: node tests/parede.js [--trace]
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');

// ---------- stubs de DOM/canvas ----------
function makeGradient() { return { addColorStop() {} }; }
function makeCtx() {
  const base = {
    canvas: null, save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, arc() {},
    ellipse() {}, rect() {}, roundRect() {}, fill() {}, stroke() {}, fillRect() {},
    strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {}, translate() {},
    rotate() {}, scale() {}, setTransform() {}, transform() {}, drawImage() {},
    measureText() { return { width: 10 }; }, createLinearGradient: makeGradient,
    createRadialGradient: makeGradient, createPattern() { return {}; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; }, putImageData() {},
    setLineDash() {},
  };
  return new Proxy(base, { get(t, k) { return t[k]; }, set(t, k, v) { t[k] = v; return true; } });
}
function makeCanvas(w, h) {
  const c = { width: w || 300, height: h || 150, style: {} };
  const ctx = makeCtx(); ctx.canvas = c; c.getContext = () => ctx; return c;
}
const listeners = {};
global.window = {
  innerWidth: 1280, innerHeight: 720,
  addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
  removeEventListener() {},
};
const gameCanvas = makeCanvas(960, 540);
global.document = {
  getElementById: (id) => (id === 'game' ? gameCanvas : null),
  createElement: (t) => (t === 'canvas' ? makeCanvas() : {}),
};
let rafCb = null;
global.requestAnimationFrame = (cb) => { rafCb = cb; };
global.performance = { now: () => 0 };
function ImageStub() { this.complete = true; this.naturalWidth = 68; this.naturalHeight = 96; }
Object.defineProperty(ImageStub.prototype, 'src', { set() {} });

global.window.FG = {};
for (const f of ['assets.js', 'audio.js', 'level.js', 'obstacles.js', 'player.js', 'enemies.js', 'engine.js']) {
  new Function('window', 'document', 'requestAnimationFrame', 'performance', 'FG', 'Image',
    fs.readFileSync(path.join(DIR, f), 'utf8'))(global.window, global.document,
    global.requestAnimationFrame, global.performance, global.window.FG, ImageStub);
}
const FG = global.window.FG;

let now = 0;
function frames(n) { for (let i = 0; i < n; i++) { now += 16.7; const cb = rafCb; rafCb = null; cb(now); } }
function key(code, down) { for (const fn of (down ? listeners.keydown : listeners.keyup) || []) fn({ code, preventDefault() {} }); }

// ---------- cenário: chão + um penhasco de 500px ----------
// Tem de ser montado ANTES de iniciar a partida: o engine congela a geometria
// base no startGame para poder injetar as plataformas móveis nela.
const ALTURA = 500;
const BASE_Y = 620, TOPO_Y = BASE_Y - ALTURA;
FG.level.solids.length = 0;
FG.level.solids.push({ x: 0, y: BASE_Y, w: 900, h: 100, k: 'g' });
FG.level.solids.push({ x: 600, y: TOPO_Y, w: 300, h: ALTURA, k: 'c' });
FG.level.hazards.length = 0;
FG.level.enemyDefs.length = 0;
FG.level.obstacleDefs.length = 0;
FG.level.checkpoints.length = 0;
FG.level.playerStart.x = 400;
FG.level.playerStart.y = 560;

frames(5); key('Space', true); frames(2); key('Space', false); frames(3);
if (FG.engine.state !== 'playing') throw new Error('não entrou em jogo: ' + FG.engine.state);

const p = FG.player;
const TRACE = process.argv.includes('--trace');

// corre até a parede, pula, e no ar continua empurrando contra ela: agarra
key('ArrowRight', true);
frames(24);                        // encosta na base da parede (ainda no chão)
key('Space', true); frames(10);    // pulo normal para sair do chão
key('Space', false);
let agarrou = false;
for (let i = 0; i < 40 && !agarrou; i++) { frames(1); agarrou = p.clinging; }
if (!agarrou) throw new Error('não agarrou na parede empurrando contra ela no ar');
const yBase = p.y;

// ciclos de escalada: segura o pulo, espera o wallLock, volta a colar
const CICLOS = 8;
let melhor = yBase;
for (let i = 0; i < CICLOS; i++) {
  key('Space', true); frames(9);
  key('Space', false); frames(7);
  key('ArrowRight', true); frames(10);
  if (p.y < melhor) melhor = p.y;
  if (TRACE) console.log('ciclo %d: y=%d (subiu %d)', i, Math.round(p.y), Math.round(yBase - p.y));
  if (p.onGround && p.y + p.h <= TOPO_Y + 4) break;   // chegou ao topo
}
key('ArrowRight', false);

const subiu = Math.round(yBase - melhor);
const porSalto = Math.round(subiu / CICLOS);
console.log('escalada: subiu %dpx de uma parede de %dpx (~%dpx por salto)', subiu, ALTURA, porSalto);

if (subiu < ALTURA * 0.8) {
  throw new Error(`escalada não venceu a parede: ${subiu}px de ${ALTURA}px`);
}
if (porSalto < 50) {
  throw new Error('ganho por salto baixo demais: ' + porSalto + 'px');
}
console.log('PAREDE OK — o penhasco é escalável agarrando e saltando');
process.exit(0);
