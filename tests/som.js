// Prova headless do áudio (tests/som.js) — com foco no que o iOS faz de
// diferente, que foi o que deixou o jogo mudo no iPhone.
//
// Monta um WebAudio de mentira que CONTA o que foi criado e disparado, e
// verifica a cadeia inteira: gesto do usuário -> contexto rodando -> música
// agendando notas de verdade -> efeito soando. Depois maltrata o contexto do
// jeito que o Safari maltrata:
//   · 'interrupted'  — ligação, Siri ou outro app tomando o áudio. Não é
//                      'suspended', e não sai dele sozinho.
//   · segundo plano  — o iOS suspende sem avisar ninguém.
//   · silencioso     — categoria 'ambient' cala o som; só 'playback' escapa.
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');

function falha(msg) { console.error('FALHOU: ' + msg); process.exit(1); }

// ---------- WebAudio de mentira, com contadores ----------
const conta = { resume: 0, osc: 0, fontes: 0, ganhos: 0 };
function param(v) {
  const p = {
    value: v,
    setValueAtTime() { return p; },
    exponentialRampToValueAtTime() { return p; },
    linearRampToValueAtTime() { return p; },
    cancelScheduledValues() { return p; },
    setTargetAtTime() { return p; },
  };
  return p;
}
function no(extra) {
  return Object.assign({ connect() {}, disconnect() {} }, extra);
}
function FakeCtx() {
  this.state = 'suspended';     // como o iOS entrega: nasce travado
  this.currentTime = 0;
  this.sampleRate = 44100;
  this.destination = no({});
}
FakeCtx.prototype.resume = function () {
  conta.resume++;
  this.state = 'running';
  return { then() {}, catch() {} };
};
FakeCtx.prototype.createGain = function () { conta.ganhos++; return no({ gain: param(1) }); };
FakeCtx.prototype.createDynamicsCompressor = function () {
  return no({ threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) });
};
FakeCtx.prototype.createOscillator = function () {
  return no({ type: 'sine', frequency: param(440), detune: param(0), start() { conta.osc++; }, stop() {} });
};
FakeCtx.prototype.createBufferSource = function () {
  return no({ buffer: null, loop: false, playbackRate: param(1), detune: param(0), start() { conta.fontes++; }, stop() {} });
};
FakeCtx.prototype.createBiquadFilter = function () {
  return no({ type: 'lowpass', frequency: param(1000), Q: param(1), gain: param(0) });
};
FakeCtx.prototype.createBuffer = function (ch, len) {
  return { length: len, getChannelData: () => new Float32Array(len) };
};

// ---------- stub de canvas/DOM (o mínimo para o jogo subir) ----------
function makeGradient() { return { addColorStop() {} }; }
function makeCtx2d() {
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
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : undefined), set: (t, k, v) => { t[k] = v; return true; } });
}
function makeCanvas(w, h) {
  const c = { width: w || 300, height: h || 150, style: {}, addEventListener() {} };
  const cx = makeCtx2d(); cx.canvas = c; c.getContext = () => cx;
  return c;
}

// O contexto vive escondido dentro do audio.js (é privado, e deve seguir
// assim): o teste guarda a referência interceptando o construtor.
let criado = null;
function AudioContextEspiao() { criado = new FakeCtx(); return criado; }
function ctxAtual() { if (!criado) falha('o AudioContext nunca foi criado'); return criado; }

const winL = {}, docL = {};
const audioSession = { type: 'auto' };   // como o Safari entrega antes do init
const win = {
  innerWidth: 1120, innerHeight: 570,
  ontouchstart: null,                    // aparelho de toque, como o iPhone
  navigator: { maxTouchPoints: 5, audioSession: audioSession },
  matchMedia: (q) => ({ matches: /coarse/.test(q), media: q, addListener() {} }),
  addEventListener(ev, fn) { (winL[ev] = winL[ev] || []).push(fn); },
  removeEventListener() {},
  AudioContext: AudioContextEspiao, webkitAudioContext: undefined,
};
const gameCanvas = makeCanvas(960, 540);
gameCanvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 540 });
const doc = {
  hidden: false,
  getElementById: (id) => (id === 'game' ? gameCanvas : null),
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : {}),
  addEventListener(ev, fn) { (docL[ev] = docL[ev] || []).push(fn); },
  removeEventListener() {},
};

let rafCb = null;
const raf = (cb) => { rafCb = cb; };
const perf = { now: () => 0 };
function ImageStub() { this.complete = true; this.naturalWidth = 68; this.naturalHeight = 96; }
Object.defineProperty(ImageStub.prototype, 'src', { set() {} });

// O scheduler da música roda num setInterval; aqui o tick fica na mão do teste,
// para poder avançar o relógio do contexto e conferir o que foi agendado.
let tickMusica = null;
const setIntervalReal = global.setInterval;
global.setInterval = (fn) => { tickMusica = fn; return 1; };
global.clearInterval = () => { tickMusica = null; };

win.FG = {};
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
  fn(win, doc, raf, perf, win.FG, ImageStub);
}
const FG = win.FG;
let now = 0;
function frames(n) {
  for (let i = 0; i < n; i++) {
    now += 16.7;
    const cb = rafCb; rafCb = null;
    if (!cb) throw new Error('loop parou de agendar rAF');
    cb(now);
  }
}
function tocarUmPouco(segundos) {
  // avança o relógio do AudioContext e deixa o scheduler agendar o trecho
  for (let i = 0; i < segundos * 10; i++) {
    ctxAtual().currentTime += 0.1;
    if (tickMusica) tickMusica();
  }
}

// ---------- 1: antes de qualquer gesto, nada de som ----------
if (!FG.audio || typeof FG.audio.ativo !== 'function') falha('FG.audio.ativo() não existe');
if (FG.audio.ativo()) falha('o áudio estava ativo antes de qualquer gesto do usuário');
frames(5);

// ---------- 2: o primeiro toque destrava o áudio ----------
const toqueEv = {
  touches: [{ clientX: 480, clientY: 250 }],
  changedTouches: [{ clientX: 480, clientY: 250 }],
  preventDefault() {},
};
for (const fn of docL.touchstart || []) fn(toqueEv);
if (!criado) falha('o toque não criou o AudioContext');
if (conta.resume < 1) falha('o toque não chamou resume() no contexto travado');
if (!FG.audio.ativo()) falha('depois do toque o áudio devia estar tocando (state=' + ctxAtual().state + ')');

// ---------- 3: a categoria de áudio escapa do botão de silencioso ----------
// Sem isto o jogo roda com o contexto em 'running' e não sai som nenhum pelo
// alto-falante do iPhone quando o silencioso está ligado — que é exatamente o
// sintoma de "funcionou, mas está sem som".
if (audioSession.type !== 'playback') {
  falha("navigator.audioSession.type devia virar 'playback' e ficou '" + audioSession.type + "'");
}

// ---------- 4: a música agenda notas de verdade ----------
for (const fn of docL.touchend || []) fn({ touches: [], changedTouches: toqueEv.changedTouches, preventDefault() {} });
frames(5);
if (FG.engine.state !== 'playing') falha('o jogo não começou: ' + FG.engine.state);
const oscAntes = conta.osc;
tocarUmPouco(2);
if (conta.osc <= oscAntes) falha('a trilha do bosque não agendou uma nota sequer em 2s');
if (!tickMusica) falha('o scheduler da música não ficou armado');

// ---------- 5: efeito sonoro sai ----------
const oscSfx = conta.osc, fontesSfx = conta.fontes;
FG.audio.sfx('lumi'); FG.audio.sfx('jump'); FG.audio.sfx('hit');
if (conta.osc <= oscSfx && conta.fontes <= fontesSfx) falha('nenhum efeito sonoro disparou');

// ---------- 6: 'interrupted' (ligação/Siri) não deixa o jogo mudo ----------
// Este é o estado que só o Safari usa, e do qual o contexto NÃO sai sozinho.
ctxAtual().state = 'interrupted';
if (FG.audio.ativo()) falha("contexto 'interrupted' não devia contar como tocando");
const resumeAntes = conta.resume;
FG.engine.gesture();                      // o jogador toca a tela de novo
if (conta.resume <= resumeAntes) falha("gesto não tentou resume() num contexto 'interrupted'");
if (!FG.audio.ativo()) falha("o jogo ficou mudo depois de uma interrupção do iOS");

// ---------- 7: voltar do segundo plano religa sozinho ----------
ctxAtual().state = 'suspended';
doc.hidden = false;
for (const fn of docL.visibilitychange || []) fn({});
if (!FG.audio.ativo()) falha('voltar do segundo plano não religou o áudio');

// ---------- 8: a música continua andando depois de tudo isso ----------
const oscFim = conta.osc;
tocarUmPouco(2);
if (conta.osc <= oscFim) falha('a trilha parou de agendar depois da interrupção');

global.setInterval = setIntervalReal;
console.log('SOM OK — gesto destrava, categoria playback, trilha e efeitos soam, ' +
            'interrupção e segundo plano se recuperam (%d osciladores, %d fontes)',
            conta.osc, conta.fontes);
process.exit(0);
