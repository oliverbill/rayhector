// Smoke test headless do Fagulho: stubs de DOM/canvas, carrega os 5 scripts
// e roda o jogo por milhares de frames simulando input real.
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
    arc() {}, ellipse() {}, rect() {}, fill() {}, stroke() {},
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    translate() {}, rotate() {}, scale() {}, setTransform() {}, transform() {},
    drawImage() {}, measureText() { return { width: 10 }; },
    createLinearGradient: makeGradient, createRadialGradient: makeGradient,
    createPattern() { return {}; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; },
    putImageData() {}, setLineDash() {},
  };
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      return undefined; // propriedades tipo fillStyle: gravadas via set
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
// O <input> escondido do popup "Pular Fase" (index.html). Sem ele o engine
// trata o popup como inexistente e o cheat nunca é exercitado.
var senhaInput = {
  id: 'pularSenhaInput', value: '', maxLength: 11, inputMode: 'text',
  style: {}, focus() {}, blur() {}, addEventListener() {},
};

function makeCanvas(w, h) {
  // getBoundingClientRect: o engine usa-o para alinhar o <input> escondido do
  // popup "Pular Fase" por cima da caixinha desenhada no canvas.
  const c = {
    width: w || 300, height: h || 150, style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w || 960, height: h || 540 }),
    addEventListener() {},
  };
  const ctx = makeCtx();
  ctx.canvas = c;
  c.getContext = () => ctx;
  return c;
}

// ---------- stub de window/document ----------
const listeners = {};
global.window = {
  innerWidth: 1280, innerHeight: 720,
  addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
  removeEventListener() {},
};
global.document = {
  getElementById: (id) => (id === 'game' ? gameCanvas
    : id === 'pularSenhaInput' ? senhaInput : null),
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : {}),
};
const gameCanvas = makeCanvas(960, 540);

let rafCb = null;
global.requestAnimationFrame = (cb) => { rafCb = cb; };
global.performance = global.performance || { now: () => 0 };
// setInterval real do node funciona (música nem inicia: sem AudioContext)

// window.FG etc.
global.window.AudioContext = undefined;
global.window.webkitAudioContext = undefined;

// stub de Image: o sprite embutido do assets.js "carrega" na hora, para o
// caminho de desenho com drawImage ser exercitado
function ImageStub() { this.complete = true; this.naturalWidth = 68; this.naturalHeight = 96; }
Object.defineProperty(ImageStub.prototype, 'src', { set() {} });

// ---------- carrega os scripts na ordem do index.html ----------
// No browser, `FG` e `window.FG` são o mesmo global; aqui pré-criamos o objeto
// e o passamos também como parâmetro `FG` para os bare references funcionarem.
global.window.FG = {};
// A ordem é a do index.html. As fases e os chefões são opcionais no filtro
// porque o jogo cresce em arquivos: com 1 fase o teste roda igual, com 3 ele
// exercita as três. Só assets/audio/player/enemies/engine são obrigatórios.
const order = [
  'assets.js', 'audio.js',
  'levelkit.js', 'level.js', 'level2.js', 'level3.js', 'level4.js', 'level5.js', 'level6.js',
  'obstacles.js', 'player.js', 'companion.js', 'babachops.js', 'allistergator.js', 'dragowuggy.js',
  'enemies.js', 'boss1.js', 'boss2.js', 'boss3.js', 'boss4.js', 'boss5.js', 'boss6.js',
  'engine.js', 'touch.js',
].filter((f) => fs.existsSync(path.join(DIR, f)));
for (const f of order) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const fn = new Function('window', 'document', 'requestAnimationFrame', 'performance', 'FG', 'Image', src);
  fn(global.window, global.document, global.requestAnimationFrame, global.performance, global.window.FG, ImageStub);
}
const FG = global.window.FG;
if (!FG || !FG.engine || !FG.player || !FG.levels || !FG.enemies || !FG.audio) {
  console.error('FALHOU: módulos ausentes', Object.keys(FG || {}));
  process.exit(1);
}
console.log('carregados: %s · fases: %d', order.join(' '), FG.levels.length);

// ---------- helpers de simulação ----------
let now = 0;
function frames(n) {
  for (let i = 0; i < n; i++) {
    now += 16.7;
    const cb = rafCb; rafCb = null;
    cb(now);
    if (!rafCb) throw new Error('loop parou de agendar rAF');
  }
}
function key(code, down) {
  const evs = listeners.keydown && !down ? listeners.keyup : listeners.keydown;
  const list = down ? listeners.keydown : listeners.keyup;
  for (const fn of list || []) fn({ code, preventDefault() {} });
}
function tap(code, framesHeld) {
  key(code, true); frames(framesHeld || 2); key(code, false);
}

// ---------- cenário 1: menu → jogar ----------
frames(30); // menu animando
if (FG.engine.state !== 'menu') throw new Error('estado inicial != menu: ' + FG.engine.state);
tap('Space', 2);
frames(5);
if (FG.engine.state !== 'playing') throw new Error('não entrou em playing: ' + FG.engine.state);

// ---------- cenário 2: correr, pular, planar, socar por 20s ----------
key('ArrowRight', true);
for (let burst = 0; burst < 12; burst++) {
  frames(40);
  tap('Space', 3); frames(6); tap('Space', 3);      // pulo duplo
  key('Space', true); frames(20); key('Space', false); // planar
  tap('KeyX', 3);                                    // soco
}
key('ArrowRight', false);
frames(30);
console.log('pós-passeio: x=%s hp=%s lumis=%s estado=%s',
  Math.round(FG.player.x), FG.player.hp, FG.engine.lumis, FG.engine.state);

// (a escalada de parede tem teste próprio, com cenário controlado: tests/parede.js)

// ---------- cenário 2b: "Pular Fase" leva para a fase DIGITADA ----------
// Duas etapas no mesmo popup: senha (o portão) e número da fase (1..N). O
// que se valida aqui é o portão, o alcance do número e a viagem em si — nos
// dois sentidos, porque agora também dá para VOLTAR.
// Espelha SENHA_PULAR do engine.js (é privada lá, e deve seguir assim).
const SENHA_TESTE = '%Baleia302%';
const ultima = FG.levels.length;
function abrirPularFase() {
  key('Escape', true); key('Escape', false); frames(2);      // pausa
  if (FG.engine.state !== 'paused') throw new Error('Escape não pausou: ' + FG.engine.state);
  key('Digit2', true); key('Digit2', false); frames(2);      // Pular Fase
  if (FG.engine.state !== 'pularSenha') throw new Error('Digit2 não abriu o popup: ' + FG.engine.state);
  if (senhaInput.value !== '') {
    throw new Error('o "2" que abre o popup vazou para dentro do campo: "' + senhaInput.value + '"');
  }
}
function confirmar(texto) {
  senhaInput.value = texto;
  key('Enter', true); key('Enter', false); frames(2);
}

abrirPularFase();
confirmar('senha errada');
if (FG.engine.state !== 'pularSenha') throw new Error('senha errada não devia passar do popup');
confirmar(SENHA_TESTE);
if (FG.engine.state !== 'pularSenha') throw new Error('a senha certa devia manter o popup, pedindo a fase');
confirmar(String(ultima + 1));
if (FG.engine.state !== 'pularSenha') throw new Error('fase ' + (ultima + 1) + ' não existe e devia ser recusada');
confirmar('0');
if (FG.engine.state !== 'pularSenha') throw new Error('fase 0 não existe e devia ser recusada');
confirmar('abc');
if (FG.engine.state !== 'pularSenha') throw new Error('texto que não é número devia ser recusado');
confirmar(String(ultima));
if (FG.engine.state !== 'playing') throw new Error('não saiu do popup para a fase pedida: ' + FG.engine.state);
if (FG.engine.levelIndex !== ultima - 1) {
  throw new Error('pediu a fase ' + ultima + ' e foi para a ' + (FG.engine.levelIndex + 1));
}
// e de volta para a primeira: o salto vale nos dois sentidos
abrirPularFase();
confirmar(SENHA_TESTE);
confirmar('1');
if (FG.engine.levelIndex !== 0) throw new Error('pediu a fase 1 e foi para a ' + (FG.engine.levelIndex + 1));
if (FG.engine.state !== 'playing') throw new Error('voltar para a fase 1 não retomou o jogo: ' + FG.engine.state);
console.log('pular fase: senha + número validados, ida à fase %d e volta à 1', ultima);

// ---------- cenário 3: percorre TODAS as fases, lutando e matando cada chefão ----------
// Cada volta: teleporta para a arena, deixa o chefão acordar, briga um pouco
// (para exercitar update/draw de ataque e projétil), mata pelo takeHit e
// confere a transição — 'fase' se ainda há fase na fila, 'victory' na última.
const totalFases = FG.levels.length;
let lumisAntes = 0;

for (let f = 0; f < totalFases; f++) {
  if (FG.engine.levelIndex !== f) {
    throw new Error('esperava estar na fase ' + f + ', estou na ' + FG.engine.levelIndex);
  }
  const lv = FG.level;
  if (FG.engine.state === 'dead') frames(120);

  // cai dentro da arena a partir do alto: funciona em qualquer fase, sem
  // precisar saber a altura do chão dela
  FG.player.x = lv.bossTriggerX + 40; FG.player.y = 60; FG.player.vy = 0;
  for (let k = 0; k < 60; k++) { FG.player.hp = FG.player.maxHp; frames(1); }

  const boss = FG.enemies.boss;
  if (!boss) throw new Error('fase ' + f + ' (' + lv.id + ') não tem chefão em FG.enemies.boss');
  if (boss.id !== lv.bossId) {
    throw new Error('fase ' + lv.id + ' pediu chefão ' + lv.bossId + ' e veio ' + boss.id);
  }
  if (!boss.started) throw new Error('chefão ' + boss.id + ' não disparou dentro da arena');
  frames(90); // intro + primeiro ataque
  if (!boss.active) throw new Error('chefão ' + boss.id + ' não ficou ativo após a intro');

  // ---- ajudantes de chefão (tecla B): cada um exclusivo da sua luta ----
  // Baba Chops na do Hugo (fase 1), Allister Gator na da Sandrola (fase 2).
  // O certo entra voando, dá UM soco (1 takeHit) e sai voando; recarga 30s.
  // Os demais têm de estar indisponíveis — inclusive fora das suas fases.
  const AJUDANTES = { hugo: ['baba chops', FG.babachops], sandrola: ['allister gator', FG.allister], sergiola: ['dragowuggy', FG.drago] };
  for (const bid in AJUDANTES) {
    const nomeA = AJUDANTES[bid][0], aj = AJUDANTES[bid][1];
    if (!aj) throw new Error('ajudante ' + nomeA + ' não carregou');
    if (bid === boss.id) {
      if (!aj.disponivel()) throw new Error(nomeA + ' indisponível na luta do ' + bid);
      if (!aj.podeComandar()) throw new Error(nomeA + ' não pôde ser comandado');
      const hpAntes = boss.hp;
      tap('KeyB', 2);
      frames(330); // voo de entrada (até ~2.2s) + soco + voo de saída
      if (boss.hp !== hpAntes - 1) {
        throw new Error('soco do ' + nomeA + ' não tirou 1 de hp: ' + hpAntes + ' -> ' + boss.hp);
      }
      if (aj.mode !== 'fora') throw new Error(nomeA + ' não saiu de cena: ' + aj.mode);
      if (!(aj.restTimer > 0)) throw new Error('recarga do ' + nomeA + ' não armou');
      if (aj.podeComandar()) throw new Error(nomeA + ' comandável durante a recarga');
      console.log('%s: soco ok (hp %d -> %d), recarga %ss',
        nomeA, hpAntes, boss.hp, aj.restTimer.toFixed(1));
    } else if (aj.disponivel()) {
      throw new Error(nomeA + ' disponível fora da luta dele (fase ' + f + ', chefão ' + boss.id + ')');
    }
  }

  for (let i = 0; i < 14; i++) {
    key(i % 2 ? 'ArrowLeft' : 'ArrowRight', true);
    frames(30);
    key(i % 2 ? 'ArrowLeft' : 'ArrowRight', false);
    tap('Space', 3); tap('KeyX', 3);
    frames(30);
    if (FG.player.hp <= 0 || FG.engine.state === 'dead') {
      FG.player.hp = FG.player.maxHp; // "cheats" para continuar exercitando código
      if (FG.engine.state === 'dead') frames(120);
    }
  }
  console.log('fase %d (%s) · chefão %s: hp=%s estado=%s · lumis=%d',
    f, lv.id, boss.id, boss.hp, boss.state, FG.engine.lumis);

  if (typeof boss.takeHit !== 'function') {
    throw new Error('chefão ' + boss.id + ' não expõe takeHit() — o smoke precisa dele para matar');
  }
  let guard = 0;
  while (boss.hp > 0 && guard++ < 100) boss.takeHit();
  if (!boss.dead) throw new Error('chefão ' + boss.id + ': dead não setado com hp 0');

  lumisAntes = FG.engine.lumis;
  frames(240); // morte cinematográfica + overlay
  const esperado = f < totalFases - 1 ? 'fase' : 'victory';
  if (FG.engine.state !== esperado) {
    throw new Error('fase ' + f + ': esperava ' + esperado + ', veio ' + FG.engine.state);
  }
  tap('Space', 2);
  frames(5);
  if (f < totalFases - 1) {
    if (FG.engine.state !== 'playing') throw new Error('não entrou na fase ' + (f + 1) + ': ' + FG.engine.state);
    if (FG.engine.lumis < lumisAntes) {
      throw new Error('as lumis zeraram na troca de fase (eram ' + lumisAntes + ', viraram ' + FG.engine.lumis + ')');
    }
  }
}

// ---------- cenário 4: reinicia da vitória ----------
if (FG.engine.state !== 'playing') throw new Error('restart pós-vitória falhou: ' + FG.engine.state);
if (FG.engine.levelIndex !== 0) throw new Error('restart não voltou para a fase 0: ' + FG.engine.levelIndex);
if (FG.engine.lumis !== 0) throw new Error('lumis não zeraram no restart: ' + FG.engine.lumis);
if (FG.enemies.boss.started) throw new Error('chefão não re-armou no restart');
frames(60);

// ---------- cenário 5: morte por queda e respawn ----------
FG.player.y = FG.level.H + 200; FG.player.vy = 100; FG.player.hp = 1;
frames(5);
if (FG.engine.state !== 'dead') throw new Error('queda com hp 1 não matou: ' + FG.engine.state);
frames(120);
if (FG.engine.state !== 'playing') throw new Error('não respawnou: ' + FG.engine.state);

console.log('SMOKE OK — %d fase(s), todos os cenários passaram', totalFases);
process.exit(0);
