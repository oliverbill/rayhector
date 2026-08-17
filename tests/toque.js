// Prova headless dos controles de toque (tests/toque.js).
//
// Monta um DOM que se comporta como aparelho de toque — canvas escalado por
// CSS e deslocado na página, como fica de verdade dentro do letterbox — e
// dirige o jogo só com o dedo: começa a partida, corre, arrasta o dedo de um
// botão para o outro, pula, soca e solta.
//
// Roda o roteiro DUAS vezes, uma por caminho de entrada:
//   · touch events   — o que o Safari do iOS entrega (iPhone, iPad, Android)
//   · pointer events — aparelho com tela sensível que NÃO emite touch events
//                      (PC com touchscreen no Firefox, caneta)
// É a única forma de garantir, sem aparelho na mão, que a conversão dedo ->
// coordenada do jogo e a máquina de estados do input continuam de pé.
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');

function falha(msg) { console.error('FALHOU: ' + msg); process.exit(1); }

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

// O canvas mora deslocado (left 160 / top 60) e escalado (800×450 para um
// backbuffer de 960×540): se a conversão do toque ignorar o rect ou a escala,
// os cenários abaixo erram o botão e o teste quebra.
const RECT = { left: 160, top: 60, width: 800, height: 450 };
const VIEW_W = 960, VIEW_H = 540;

// ---------- carrega uma instância do jogo num DOM de mentira ----------
// `modo` é 'touch', 'pointer' ou 'mouse': muda só QUAIS eventos o navegador de
// mentira sabe emitir, que é exatamente a diferença entre os aparelhos reais.
function montar(modo) {
  const mouse = modo === 'mouse';
  const winL = {}, docL = {};
  const win = {
    innerWidth: 1120, innerHeight: 570,   // paisagem
    navigator: { maxTouchPoints: mouse ? 0 : 5 },
    matchMedia: (q) => ({ matches: !mouse && /coarse/.test(q), media: q, addListener() {} }),
    addEventListener(ev, fn) { (winL[ev] = winL[ev] || []).push(fn); },
    removeEventListener() {},
    AudioContext: undefined, webkitAudioContext: undefined,
  };
  if (modo === 'touch') win.ontouchstart = null;   // o teste do touch.js é `in window`
  if (!mouse) win.PointerEvent = function () {};
  const gameCanvas = makeCanvas(VIEW_W, VIEW_H);
  gameCanvas.getBoundingClientRect = () => RECT;
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

  let now = 0;
  function frames(n) {
    for (let i = 0; i < n; i++) {
      now += 16.7;
      const cb = rafCb; rafCb = null;
      if (!cb) throw new Error('loop parou de agendar rAF');
      cb(now);
    }
  }
  return { FG: win.FG, win, doc, winL, docL, frames };
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

// ---------- a mão que toca a tela, em cada dialeto de evento ----------
// Mesma interface (encostar/arrastar/soltar) para os dois caminhos, para o
// roteiro do teste ser literalmente o mesmo nos dois aparelhos.
function maoTouch(docL) {
  let dedos = [];
  const ev = (mudou) => ({ touches: dedos.slice(), changedTouches: mudou, preventDefault() {} });
  const disparar = (tipo, mudou) => { for (const fn of docL[tipo] || []) fn(ev(mudou)); };
  return {
    encostar(p) { dedos.push(p); disparar('touchstart', [p]); return p; },
    arrastar(de, para) {
      const i = dedos.indexOf(de);
      if (i >= 0) dedos[i] = para;
      disparar('touchmove', [para]);
      return para;
    },
    soltar(p) { dedos = dedos.filter((d) => d !== p); disparar('touchend', [p]); },
    soltarTodos() { const todos = dedos.slice(); dedos = []; disparar('touchend', todos); },
    esquecer() { dedos = []; },
  };
}
function maoPointer(docL) {
  let prox = 1;
  const ids = new Map();
  const disparar = (tipo, e) => { for (const fn of docL[tipo] || []) fn(e); };
  const evt = (p, id) => ({
    pointerId: id, pointerType: 'touch',
    clientX: p.clientX, clientY: p.clientY, preventDefault() {},
  });
  return {
    encostar(p) {
      const id = prox++;
      ids.set(p, id);
      disparar('pointerdown', evt(p, id));
      return p;
    },
    arrastar(de, para) {
      const id = ids.get(de);
      ids.delete(de); ids.set(para, id);
      disparar('pointermove', evt(para, id));
      return para;
    },
    soltar(p) {
      const id = ids.get(p);
      ids.delete(p);
      disparar('pointerup', evt(p, id));
    },
    soltarTodos() { for (const p of Array.from(ids.keys())) this.soltar(p); },
    esquecer() { ids.clear(); },
  };
}

// ---------- o roteiro, igual para os dois aparelhos ----------
function roteiro(modo) {
  const { FG, win, doc, winL, docL, frames } = montar(modo);
  const mao = modo === 'touch' ? maoTouch(docL) : maoPointer(docL);
  const erro = (m) => falha('[' + modo + '] ' + m);

  // 1: aparelho de toque já nasce com os botões, e escutando de verdade
  if (!FG.touch) erro('touch.js não publicou FG.touch');
  if (!FG.touch.active) erro('ponteiro grosso (celular) devia ligar os controles na hora');
  const gatilho = modo === 'touch' ? 'touchstart' : 'pointerdown';
  if (!docL[gatilho] || !docL[gatilho].length) erro('nenhum listener de ' + gatilho + ' registrado');
  frames(10);
  if (FG.engine.state !== 'menu') erro('estado inicial != menu: ' + FG.engine.state);

  // 2: toque fora dos botões, no menu, começa o jogo
  const vazio = mao.encostar(BOTAO.vazio);
  mao.soltar(vazio);
  frames(5);
  if (FG.engine.state !== 'playing') erro('toque no menu não começou o jogo: ' + FG.engine.state);
  frames(30);

  // 2b: e o botão PULO, sozinho, também começa (é o que o menu manda fazer)
  const outro = montar(modo);
  const mao2 = modo === 'touch' ? maoTouch(outro.docL) : maoPointer(outro.docL);
  outro.frames(10);
  mao2.encostar(BOTAO.jump);
  outro.frames(5);
  if (outro.FG.engine.state !== 'playing') {
    erro('tocar em PULO no menu não começou o jogo: ' + outro.FG.engine.state);
  }

  // 3: ▶ faz o Heitor correr para a direita
  const x0 = FG.player.x;
  let dedo = mao.encostar(BOTAO.right);
  if (!FG.input.right) erro('o botão ▶ não acendeu input.right');
  frames(45);
  if (FG.player.x <= x0 + 40) {
    erro('segurando ▶ o Heitor não correu (x ' + Math.round(x0) + ' -> ' + Math.round(FG.player.x) + ')');
  }

  // 4: arrastar o dedo de ▶ para ◀ troca a direção
  dedo = mao.arrastar(dedo, BOTAO.left);
  if (FG.input.right || !FG.input.left) {
    erro('arrastar ▶ -> ◀ não trocou a direção (left=' + FG.input.left + ' right=' + FG.input.right + ')');
  }
  const x1 = FG.player.x;
  frames(45);
  if (FG.player.x >= x1 - 20) erro('segurando ◀ o Heitor não voltou');
  mao.soltar(dedo);
  if (FG.input.left) erro('soltar o dedo não apagou input.left');

  // 5: PULO tira o Heitor do chão, e o segundo dedo soca junto
  frames(40);
  if (!FG.player.onGround) erro('cenário: o Heitor devia estar no chão antes do pulo');
  const yChao = FG.player.y;
  const dedoPulo = mao.encostar(BOTAO.jump);
  frames(3);
  if (FG.player.y >= yChao) {
    erro('o botão PULO não pulou (y ' + Math.round(yChao) + ' -> ' + Math.round(FG.player.y) + ')');
  }
  const dedoSoco = mao.encostar(BOTAO.attack);   // dois dedos ao mesmo tempo
  if (!FG.input.jump || !FG.input.attack) {
    erro('multi-toque falhou (jump=' + FG.input.jump + ' attack=' + FG.input.attack + ')');
  }
  frames(4);
  if (!FG.player.attackBox || !FG.player.attackBox.active) erro('o botão SOCO não abriu a hitbox');
  mao.soltar(dedoPulo); mao.soltar(dedoSoco);
  if (FG.input.jump || FG.input.attack) erro('soltar tudo não apagou os botões');

  // 6: dedo na tarja preta (fora do canvas) não vira comando
  const antes = { l: FG.input.left, r: FG.input.right, j: FG.input.jump };
  const naTarja = mao.encostar(BOTAO.tarja);
  if (FG.input.left !== antes.l || FG.input.right !== antes.r || FG.input.jump !== antes.j) {
    erro('toque fora do canvas mexeu no input');
  }
  mao.soltar(naTarja);
  frames(60);

  // 7: trocar de app com o dedo no botão não deixa o Heitor correndo
  mao.encostar(BOTAO.right);
  if (!FG.input.right) erro('cenário: ▶ devia estar pressionado');
  doc.hidden = true;
  for (const fn of docL.visibilitychange || []) fn({});
  if (FG.input.right) erro('ir para segundo plano com o dedo no ▶ deixou o comando preso');
  doc.hidden = false;
  mao.esquecer();
  frames(30);

  // 8: o teclado continua funcionando lado a lado (iPad com teclado)
  for (const fn of winL.keydown || []) fn({ code: 'ArrowRight', preventDefault() {} });
  if (!FG.input.right) erro('o teclado parou de funcionar depois do toque');
  for (const fn of winL.keyup || []) fn({ code: 'ArrowRight', preventDefault() {} });
  if (FG.input.right) erro('keyup não soltou');

  // 9: desenhar os botões não explode em nenhuma tela, nem em retrato
  for (const estado of ['playing', 'dead', 'fase', 'victory', 'menu']) {
    FG.engine.state = estado;
    frames(3);
  }
  win.innerWidth = 570; win.innerHeight = 1120;   // retrato: aviso de giro
  FG.engine.state = 'menu';
  frames(3);
}

roteiro('touch');
roteiro('pointer');

// ---------- desktop de mouse continua sem botão na tela ----------
// Quem tem mouse e teclado não pode ganhar controle de celular por cima do
// jogo: o touch.js tem de sair de fininho, sem listener e sem desenhar.
(function () {
  const { FG, docL, frames } = montar('mouse');
  if (!FG.touch) falha('[mouse] FG.touch devia existir (o engine consulta FG.touch.active)');
  if (FG.touch.active) falha('[mouse] os botões de toque apareceram num desktop de mouse');
  for (const ev of ['touchstart', 'pointerdown']) {
    if (docL[ev] && docL[ev].length) falha('[mouse] touch.js registrou ' + ev + ' num desktop');
  }
  frames(10);
  if (FG.engine.state !== 'menu') falha('[mouse] o menu não ficou de pé: ' + FG.engine.state);
})();

console.log('TOQUE OK — touch e pointer: menu, corrida, arrasto entre botões, multi-toque, pausa e teclado');
process.exit(0);
