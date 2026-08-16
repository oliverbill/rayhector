// Verificador de alcançabilidade: simula a física REAL do player (mesmas
// constantes do player.js) sobre a geometria do level.js e responde quais
// plataformas dá para alcançar a partir do começo do nível.
//
// Uso: node tests/reach.js          — lista o que estiver inalcançável
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');

// ---------- carrega só o level.js (sem DOM: o desenho não é exercitado) ----------
const win = { FG: {} };
const doc = { createElement: () => ({ getContext: () => ({}) }), getElementById: () => null };
const src = fs.readFileSync(path.join(DIR, 'level.js'), 'utf8');
new Function('window', 'document', 'FG', src)(win, doc, win.FG);
const level = win.FG.level;

// ---------- constantes do player (espelham player.js) ----------
const ACCEL = 2400, FRICTION = 2000, MAX_VX = 340;
const GRAVITY = 2200, JUMP_VY = -720, GLIDE_FALL = 90, MAX_FALL = 1100;
const PW = 30, PH = 44;

const solids = level.solids;

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// mesma resolução de colisão do engine (eixo a eixo)
function moveAndCollide(e, dt) {
  e.x += e.vx * dt;
  for (const s of solids) {
    if (!overlap(e, s)) continue;
    if (e.vx > 0) e.x = s.x - e.w; else if (e.vx < 0) e.x = s.x + s.w;
    e.vx = 0;
  }
  e.onGround = false;
  e.y += e.vy * dt;
  for (const s of solids) {
    if (!overlap(e, s)) continue;
    if (e.vy > 0) { e.y = s.y - e.h; e.onGround = true; }
    else if (e.vy < 0) e.y = s.y + s.h;
    e.vy = 0;
  }
}

// Simula um pulo: sai de (x0, topo do solid i), corre na direção dir, pula,
// dá o segundo pulo após `delay2` s, plana se `glide`. Devolve o índice do
// solid onde pousou (ou -1 se caiu do mundo / não pousou).
function simulate(x0, y0, dir, vx0, delay2, glide) {
  const p = { x: x0 - PW / 2, y: y0 - PH, w: PW, h: PH, vx: vx0, vy: 0, onGround: true };
  const dt = 1 / 240;
  let t = 0, jumps = 0;
  p.vy = JUMP_VY; jumps = 1; // pulo inicial
  while (t < 4) {
    t += dt;
    // controle aéreo: segura a direção o tempo todo
    p.vx += dir * ACCEL * dt;
    if (p.vx > MAX_VX) p.vx = MAX_VX;
    if (p.vx < -MAX_VX) p.vx = -MAX_VX;
    // segundo pulo
    if (jumps === 1 && delay2 !== null && t >= delay2) { p.vy = JUMP_VY; jumps = 2; }
    p.vy += GRAVITY * dt;
    const cap = (glide && jumps >= 2 && p.vy > 0) ? GLIDE_FALL : MAX_FALL;
    if (p.vy > cap) p.vy = cap;
    moveAndCollide(p, dt);
    if (p.onGround) {
      // achou o solid de apoio
      for (let i = 0; i < solids.length; i++) {
        const s = solids[i];
        if (Math.abs(p.y + p.h - s.y) < 1.5 && p.x + p.w > s.x && p.x < s.x + s.w) return i;
      }
      return -1;
    }
    if (p.y > level.H + 200 || p.x < -50 || p.x > level.W + 50) return -1;
  }
  return -1;
}

// ---------- grafo de alcançabilidade ----------
// PERITO: tudo que a física permite (timing perfeito do 2º pulo + planagem).
// CASUAL: como se joga de verdade — segundo pulo numa janela folgada, sem
// depender de planar. O que só aparece no PERITO é "tecnicamente possível,
// injusto na prática" e conta como problema de level design.
const STRAT = {
  perito: { delays: [null, 0.05, 0.12, 0.2, 0.28, 0.33, 0.4, 0.5], glides: [false, true],
            vx0: [-MAX_VX, -200, 0, 200, MAX_VX] },
  casual: { delays: [null, 0.18, 0.26, 0.34], glides: [false],
            vx0: [-MAX_VX, 0, MAX_VX] },
};

function reachableFrom(i, st) {
  const s = solids[i];
  const out = new Set();
  // amostra posições de decolagem ao longo do topo da plataforma
  const step = Math.max(8, s.w / 12);
  for (let x = s.x + 4; x <= s.x + s.w - 4; x += step) {
    for (const dir of [-1, 1]) {
      for (const vx0 of st.vx0) {
        for (const d2 of st.delays) {
          for (const glide of st.glides) {
            const landed = simulate(x, s.y, dir, vx0, d2, glide);
            if (landed >= 0 && landed !== i) out.add(landed);
          }
        }
      }
    }
  }
  return out;
}

// BFS a partir da plataforma onde o player começa
function startSolid() {
  const px = level.playerStart.x + PW / 2;
  let best = -1, bestY = Infinity;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (px >= s.x && px <= s.x + s.w && s.y >= level.playerStart.y && s.y < bestY) { best = i; bestY = s.y; }
  }
  return best;
}

const start = startSolid();
if (start < 0) { console.error('não achei a plataforma inicial'); process.exit(1); }

// ---------- escalada de parede ----------
// O player agarra numa parede e sobe alternando agarrar→saltar (~120px por
// salto), então uma face vertical contínua vale como ligação: de um apoio
// rente à base da parede dá para chegar ao topo dela, qualquer que seja a
// altura. Modelamos isso como arestas extras no grafo, em vez de simular a
// escalada salto a salto.
const MIN_PAREDE = 50;   // abaixo disso é degrau, não parede
const RENTE = 46;        // distância horizontal que conta como "rente à face"

function arestasDeParede() {
  const arestas = [];   // {de, para} — subir a face de `para` a partir de `de`
  for (let w = 0; w < solids.length; w++) {
    const W = solids[w];
    if (W.k === 'h') continue;
    for (const face of [W.x, W.x + W.w]) {         // face esquerda e direita
      for (let f = 0; f < solids.length; f++) {
        if (f === w) continue;
        const F = solids[f];
        const alturaParede = F.y - W.y;            // quanto a parede sobe
        if (alturaParede < MIN_PAREDE) continue;
        // o apoio precisa terminar (ou começar) rente à face da parede
        const perto = Math.min(Math.abs(F.x + F.w - face), Math.abs(F.x - face));
        if (perto > RENTE) continue;
        arestas.push({ de: f, para: w, altura: alturaParede });
      }
    }
  }
  return arestas;
}
const PAREDES = arestasDeParede();

function bfs(st, comParede) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const i = queue.shift();
    for (const j of reachableFrom(i, st)) if (!seen.has(j)) { seen.add(j); queue.push(j); }
    if (comParede) {
      for (const e of PAREDES) {
        if (e.de === i && !seen.has(e.para)) { seen.add(e.para); queue.push(e.para); }
      }
    }
  }
  return seen;
}

const perito = bfs(STRAT.perito, true);    // tudo, inclusive escalar parede
const casual = bfs(STRAT.casual, true);
const semParede = bfs(STRAT.perito, false); // só pulo: mostra o que a parede desbloqueia

// ---------- relatório ----------
const KIND = { g: 'terra', m: 'cogumelo', r: 'pedra', h: 'piso oculto' };
const total = solids.filter((s) => s.k !== 'h').length;
const impossiveis = [], injustas = [];
for (let i = 0; i < solids.length; i++) {
  const s = solids[i];
  if (s.k === 'h') continue;          // piso oculto no fundo das poças: não conta
  if (!perito.has(i)) impossiveis.push({ i, s });
  else if (!casual.has(i)) injustas.push({ i, s });
}

function linha(u) {
  console.log('  [%d] %s x=%d y=%d w=%d h=%d', u.i, KIND[u.s.k] || u.s.k, u.s.x, u.s.y, u.s.w, u.s.h);
}
console.log('plataformas: %d | alcançáveis (perito): %d | alcançáveis (casual): %d',
  total, perito.size, casual.size);
console.log('IMPOSSÍVEIS (nem com timing perfeito + planar): %d', impossiveis.length);
impossiveis.forEach(linha);
console.log('INJUSTAS (só com timing perfeito ou planando): %d', injustas.length);
injustas.forEach(linha);

// ---------- degrau exigido: o pulo mais alto que a plataforma cobra ----------
// Para cada plataforma, o MENOR degrau vertical entre ela e algum apoio de
// onde se salta direto para ela (casual). Degrau grande = toda rota de entrada
// exige pulo duplo no limite. Referência: pulo simples sobe ~118px, duplo ~236.
const CONFORTO = 150;
const degraus = [];
for (let i = 0; i < solids.length; i++) {
  if (solids[i].k === 'h') continue;
  let min = Infinity, from = -1;
  for (let j = 0; j < solids.length; j++) {
    if (j === i || !casual.has(j)) continue;
    if (!reachableFrom(j, STRAT.casual).has(i)) continue;
    const rise = solids[j].y - solids[i].y;  // >0 = subiu
    if (rise < min) { min = rise; from = j; }
  }
  if (from >= 0) degraus.push({ i, from, rise: min, s: solids[i] });
}
degraus.sort((a, b) => b.rise - a.rise);
const duros = degraus.filter((d) => d.rise > CONFORTO);
console.log('DEGRAUS ACIMA DE %dpx (toda entrada exige pulo duplo no limite): %d', CONFORTO, duros.length);
for (const d of duros) {
  console.log('  [%d] %s x=%d y=%d — sobe %dpx vindo de [%d] (y=%d)',
    d.i, KIND[d.s.k] || d.s.k, d.s.x, d.s.y, Math.round(d.rise), d.from, solids[d.from].y);
}
console.log('(maiores degraus, para referência: %s)',
  degraus.slice(0, 5).map((d) => `[${d.i}]=${Math.round(d.rise)}px`).join(' '));

// ---------- o que só existe graças à escalada de parede ----------
const soPorParede = [];
for (let i = 0; i < solids.length; i++) {
  if (solids[i].k === 'h') continue;
  if (perito.has(i) && !semParede.has(i)) soPorParede.push(i);
}
console.log('\nsó alcançável ESCALANDO PAREDE: %d %s', soPorParede.length,
  soPorParede.length ? '[' + soPorParede.join(', ') + ']' : '');
console.log('faces de parede escaláveis mapeadas: %d', PAREDES.length);

// Degrau grande é problema só se NÃO houver parede escalável levando lá.
const durosSemParede = duros.filter((d) => !PAREDES.some((e) => e.para === d.i));
if (duros.length !== durosSemParede.length) {
  console.log('(%d degraus grandes têm parede escalável e não contam como problema)',
    duros.length - durosSemParede.length);
}
process.exit(impossiveis.length + injustas.length + durosSemParede.length ? 1 : 0);
