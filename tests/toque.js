// Prova headless dos controles de toque (tests/toque.js).
//
// Monta um DOM que se comporta como iPhone/iPad — touch events, ponteiro
// grosso, canvas escalado por CSS e deslocado na página — e dirige o jogo só
// com o dedo: começa a partida, corre, arrasta o dedo de um botão para o
// outro, pula e solta. É a única forma de garantir, sem aparelho na mão, que
// a conversão dedo -> coordenada do jogo e a máquina de estados do input
// continuam de pé.
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');

// ---------- stub de canvas/context ----------
function makeGradient() { return { addColorStop() {} }; }
function makeCtx() {
  const base = {
    canvas: null,
    save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    arc() {}, ellipse() {}, rect() {}, roundRect() {}, fill() {}, stroke() {},
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    translate() {}, rotate() {}, scale() {}, setTransform() {}, transform() {},
    drawImage() {}, measureText() { return { width: 10 }; },
    createLinearGradient: makeGradient, createRadialGradient: makeGradient,
    createPattern() { return {}; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; },
    putImageData() {}, setLineDash() {},
  };
  return new Proxy(base, {
    get(t, k) { return k in t ? t[k] : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function makeCanvas(w, h) {
  const c = { width: w || 300, height: h || 150, style: {}, addEventListener() {} };
  const ctx = makeCtx();
  ctx.canvas = c;
  c.getContext = () => ctx;
  return c;
}

// ---------- stub de window/document, em modo "aparelho de toque" ----------
// O canvas mora deslocado (left 160 / top 60) e escalado (800×450 para um
// backbuffer de 960×540): se a conversão do toque ignorar rect ou escala, os
// cenários abaixo erram o botão e o teste quebra.
const RECT = { left: 160, top: 60, width: 800, height: 450 };
const VIEW_W = 960, VIEW_H = 540;

const winL = {}, docL = {};
global.window = {
  innerWidth: 1120, innerHeight: 570,   // paisagem
  ontouchstart: null,                   // "este aparelho tem toque"
  navigator: { maxTouchPoints: 5 },
  matchMedia: (q) => ({ matches: /coarse/.test(q), media: q, addListener() {} }),
  addEventListener(ev, fn) { (winL[ev] = winL[ev] || []).push(fn); },
  removeEventListener() {},
};
const gameCanvas = makeCanvas(VIEW_W, VIEW_H);
gameCanvas.getBoundingClientRect = () => RECT;
global.document = {
  hidden: false,
  getElementById: (id) => (id === 'game' ? gameCanvas : null),
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : {}),
  addEventListener(ev, fn) { (docL[ev] = docL[ev] || []).push(fn); },
  removeEventListener() {},
};

let rafCb = null;
global.requestAnimationFrame = (cb) => { rafCb = cb; };
global.performance = global.performance || { now: () => 0 };
global.window.AudioContext = undefined;
global.window.webkitAudioContext = undefined;
function ImageStub() { this.complete = true; this.naturalWidth = 68; this.naturalHeight = 96; }
Object.defineProperty(ImageStub.prototype, 'src', { set() {} });

// ---------- carrega os scripts na ordem do index.html ----------
global.window.FG = {};
const order = [
  'assets.js', 'audio.js',
  'levelkit.js', 'level.js', 'level2.js', 'level3.js',
  'obstacles.js', 'player.js',
  'enemies.js', 'boss1.js', 'boss2.js', 'boss3.js',
  'engine.js', 'touch.js',
].filter((f) => fs.existsSync(path.join(DIR, f)));
for (const f of order) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const fn = new Function('window', 'document', 'requestAnimationFrame', 'performance', 'FG', 'Image', src);
  fn(global.window, global.document, global.requestAnimationFrame, global.performance, global.window.FG, ImageStub);
}
const FG = global.window.FG;
function falha(msg) { console.error('FALHOU: ' + msg); process.exit(1); }
if (!FG.touch) falha('touch.js não publicou FG.touch');

// ---------- helpers de simulação ----------
let now = 0;
function frames(n) {
  for (let i = 0; i < n; i++) {
    now += 16.7;
    const cb = rafCb; rafCb = null;
    if (!cb) throw new Error('loop parou de agendar rAF');
    cb(now);
  }
}
// coordenada do JOGO (960×540) -> coordenada de tela do dedo
function paraTela(gx, gy) {
  return {
    clientX: RECT.left + gx * RECT.width / VIEW_W,
    clientY: RECT.top + gy * RECT.height / VIEW_H,
  };
}
// os mesmos centros de botão do touch.js
const BOTAO = {
  left: paraTela(96, 452), right: paraTela(216, 452),
  attack: paraTela(748, 462), jump: paraTela(872, 404),
  vazio: paraTela(480, 250),                 // meio da tela, longe de tudo
  tarja: { clientX: 20, clientY: 300 },      // fora do canvas (letterbox)
};
let dedos = [];   // dedos atualmente na tela
function evento(mudou) {
  return { touches: dedos.slice(), changedTouches: mudou, preventDefault() {} };
}
function disparar(tipo, mudou) {
  for (const fn of docL[tipo] || []) fn(evento(mudou));
}
function encostar(p) { dedos.push(p); disparar('touchstart', [p]); }
function arrastar(de, para) {
  const i = dedos.indexOf(de);
  if (i >= 0) dedos[i] = para;
  disparar('touchmove', [para]);
  return para;
}
function soltar(p) {
  dedos = dedos.filter((d) => d !== p);
  disparar('touchend', [p]);
}
function soltarTodos() { const todos = dedos.slice(); dedos = []; disparar('touchend', todos); }

// ---------- 1: aparelho de toque já nasce com os botões ----------
if (!FG.touch.active) falha('ponteiro grosso (celular) devia ligar os controles de toque na hora');
if (!docL.touchstart || !docL.touchstart.length) falha('nenhum listener de touchstart registrado');
frames(10);
if (FG.engine.state !== 'menu') falha('estado inicial != menu: ' + FG.engine.state);

// ---------- 2: toque fora dos botões, no menu, começa o jogo ----------
encostar(BOTAO.vazio);
soltar(BOTAO.vazio);
frames(5);
if (FG.engine.state !== 'playing') falha('toque no menu não começou o jogo: ' + FG.engine.state);
frames(30);

// ---------- 3: ▶ faz o Heitor correr para a direita ----------
const x0 = FG.player.x;
let dedo = BOTAO.right;
encostar(dedo);
if (!FG.input.right) falha('o botão ▶ não acendeu input.right');
frames(45);
if (FG.player.x <= x0 + 40) falha('segurando ▶ o Heitor não correu (x ' + Math.round(x0) + ' -> ' + Math.round(FG.player.x) + ')');

// ---------- 4: arrastar o dedo de ▶ para ◀ troca a direção ----------
dedo = arrastar(dedo, BOTAO.left);
if (FG.input.right || !FG.input.left) {
  falha('arrastar ▶ -> ◀ não trocou a direção (left=' + FG.input.left + ' right=' + FG.input.right + ')');
}
const x1 = FG.player.x;
frames(45);
if (FG.player.x >= x1 - 20) falha('segurando ◀ o Heitor não voltou');
soltar(dedo);
if (FG.input.left) falha('soltar o dedo não apagou input.left');

// ---------- 5: PULO tira o Heitor do chão, e o segundo dedo soca junto ----------
frames(40);
if (!FG.player.onGround) falha('cenário: o Heitor devia estar no chão antes do pulo');
const yChao = FG.player.y;
const dedoPulo = BOTAO.jump;
encostar(dedoPulo);
frames(3);
if (FG.player.y >= yChao) falha('o botão PULO não pulou (y ' + Math.round(yChao) + ' -> ' + Math.round(FG.player.y) + ')');
const dedoSoco = BOTAO.attack;   // dois dedos ao mesmo tempo: pular e socar
encostar(dedoSoco);
if (!FG.input.jump || !FG.input.attack) {
  falha('multi-toque falhou (jump=' + FG.input.jump + ' attack=' + FG.input.attack + ')');
}
frames(4);
if (!FG.player.attackBox || !FG.player.attackBox.active) falha('o botão SOCO não abriu a hitbox do soco');
soltarTodos();
if (FG.input.jump || FG.input.attack) falha('soltar tudo não apagou os botões');

// ---------- 6: dedo na tarja preta (fora do canvas) não vira comando ----------
const antes = { l: FG.input.left, r: FG.input.right, j: FG.input.jump };
encostar(BOTAO.tarja);
if (FG.input.left !== antes.l || FG.input.right !== antes.r || FG.input.jump !== antes.j) {
  falha('toque fora do canvas mexeu no input');
}
soltarTodos();
frames(60);

// ---------- 7: trocar de app com o dedo no botão não deixa o Heitor correndo ----------
encostar(BOTAO.right);
if (!FG.input.right) falha('cenário: ▶ devia estar pressionado');
global.document.hidden = true;
for (const fn of docL.visibilitychange || []) fn({});
if (FG.input.right) falha('ir para segundo plano com o dedo no ▶ deixou o comando preso');
global.document.hidden = false;
dedos = [];
frames(30);

// ---------- 8: o teclado continua funcionando lado a lado ----------
for (const fn of winL.keydown || []) fn({ code: 'ArrowRight', preventDefault() {} });
if (!FG.input.right) falha('o teclado parou de funcionar depois do toque');
for (const fn of winL.keyup || []) fn({ code: 'ArrowRight', preventDefault() {} });
if (FG.input.right) falha('keyup não soltou');

// ---------- 9: desenho dos botões não explode em nenhuma tela ----------
for (const estado of ['playing', 'dead', 'fase', 'victory', 'menu']) {
  FG.engine.state = estado;
  frames(3);
}
global.window.innerWidth = 570; global.window.innerHeight = 1120;  // retrato: aviso de giro
FG.engine.state = 'menu';
frames(3);

console.log('TOQUE OK — menu, corrida, arrasto entre botões, multi-toque, pausa e teclado');
process.exit(0);
