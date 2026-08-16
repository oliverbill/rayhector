// Fagulho: Lendas do Bosque — obstacles.js
// FG.obstacles: os perigos e as plataformas dinâmicas do cenário — o que dá
// ritmo ao nível (o terreno parado só faz o chão). Nove tipos:
//   plataforma  — pedra flutuante que vai e volta e CARREGA o player
//   desmorona   — saliência que treme, cai e volta 3s depois
//   sopro       — coluna de ar quente que empurra o player para cima
//   pendulo     — corrente sólida com bola de ferro que machuca
//   espinhorolo — rolo de espinhos correndo num trilho
//   cipo        — corda em catenária entre dois pinos: agarra no ar, anda nela
//                 com ←/→ e solta com ESPAÇO (não é sólida)
//   disco       — disco de âmbar que sobe e desce de leve; sólido e carrega
//   tronco      — tronco que AFUNDA com o peso do player e volta a subir
//   brasa       — zona de chuva de brasa em rajadas telegrafadas (não sólida)
//
// A colisão sai de graça: as peças sólidas vivas entram em `movers` e o engine
// injeta esse array em FG.level.solids a cada frame. Aqui só se move a peça e
// se arrasta o player quando ele está apoiado.
//
// Canvas puro, zero assets, zero alocação por frame (pools e reuso; tudo o que
// aloca vive em reset()). Nenhuma referência a outro módulo FG no load.
window.FG = window.FG || {};

(function () {
  'use strict';

  var VIEW_W = 960;          // canvas interno (culling horizontal)
  var VIEW_H = 540;          // canvas interno (culling vertical)
  var CULL = 200;            // margem de culling em px (~1 tela de folga)
  var GRAV = 2200;           // mesma gravidade do player
  var TAU = Math.PI * 2;

  var PLAT_H = 22;           // altura fixa da plataforma móvel
  var DESM_H = 20;           // altura da saliência que desmorona
  var DESM_SHAKE = 0.45;     // tempo tremendo antes de cair
  var DESM_BACK = 3.0;       // tempo até reaparecer
  var DESM_FADE = 0.45;      // duração do fade-in ao voltar

  var SOPRO_ACC = 2600;      // aceleração para cima dentro do sopro (px/s²)
  var SOPRO_ACC_GLIDE = 3600;// planando dentro dele, sobe de verdade
  var SOPRO_CAP = -260;      // subida máxima normal (px/s)
  var SOPRO_CAP_GLIDE = -330;// subida máxima planando

  var CHAIN_LINKS = 4;       // elos sólidos do pêndulo (dá para pousar)
  var LINK_W = 30, LINK_H = 11;

  // --- cipó ---------------------------------------------------------
  var CIPO_SEGS = 24;        // pontos pré-calculados da catenária (SEGS+1)
  var CIPO_SWAY = 5;         // amplitude do balanço na perpendicular (px)
  var CIPO_SWAY_W = 1.15;    // rad/s do balanço — devagar, é corda pesada
  var CIPO_DIP = 13;         // quanto a corda cede sob o peso do player
  var CIPO_DIP_R = 0.30;     // raio (em t) da cedência em volta dele
  var CIPO_SPEED = 1.1;      // comprimentos de corda por segundo andando nela
  var CIPO_HANDS = 6;        // o player pendura pelas MÃOS: topo dele 6px abaixo
  var CIPO_GRAB_PAD = 5;     // folga do teste de encostar na corda
  var CIPO_COOL = 0.35;      // carência para reagarrar A MESMA corda
  var CIPO_OUT_VY = -640;    // impulso vertical ao soltar com ESPAÇO
  var CIPO_OUT_VX = 220;     // impulso horizontal, na direção em que andava
  var CIPO_END_VX = 90;      // saída pela ponta: só a inércia, sem impulso

  // --- disco --------------------------------------------------------
  var DISCO_H = 18;          // altura sólida do disco (a elipse é maior)

  // --- tronco -------------------------------------------------------
  var TRONCO_H = 22;         // altura sólida do tronco deitado
  var TRONCO_MAX = 70;       // afundamento máximo
  var TRONCO_DOWN = 55;      // px/s afundando com o player em cima
  var TRONCO_UP = 90;        // px/s voltando quando ele sai

  // --- brasa --------------------------------------------------------
  var BRASA_TELE = 0.8;      // telegraph: manchas pulsando antes da rajada
  var BRASA_RAJADA = 1.1;    // duração da rajada
  var BRASA_MAX = 30;        // brasas simultâneas por zona (pool fixa)
  var BRASA_GRAV = 900;      // brasa é leve: cai mais devagar que o player

  // ------------------------------------------------------------------
  // Pool de partículas (poeirinha do desmorona, faíscas do rolo).
  // Reuso total: spawnParticle nunca cria objeto.
  // ------------------------------------------------------------------
  var MAXP = 140;
  var particles = [];
  for (var pi = 0; pi < MAXP; pi++) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: '#fff', grav: 0 });
  }
  var pNext = 0;

  function spawnParticle(x, y, vx, vy, life, size, color, grav) {
    var p = particles[pNext];
    pNext = (pNext + 1) % MAXP;
    p.active = true;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life;
    p.size = size; p.color = color; p.grav = grav || 0;
  }

  function updateParticles(dt) {
    for (var i = 0; i < MAXP; i++) {
      var p = particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function drawParticles(ctx, cam) {
    ctx.save();
    for (var i = 0; i < MAXP; i++) {
      var p = particles[i];
      if (!p.active) continue;
      var sx = p.x - cam.x, sy = p.y - cam.y;
      if (sx < -40 || sx > VIEW_W + 40 || sy < -40 || sy > VIEW_H + 40) continue;
      var k = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size * (0.35 + 0.65 * k), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Culling: a peça só é desenhada se estiver a até ~1 tela da câmera.
  function visible(cam, x, y, w, h) {
    return !(x + w < cam.x - CULL || x > cam.x + VIEW_W + CULL ||
             y + h < cam.y - CULL || y > cam.y + VIEW_H + CULL);
  }

  // ------------------------------------------------------------------
  // Gradientes cacheados. São criados uma única vez, em coordenadas
  // LOCAIS (0..altura), e reaproveitados sob ctx.translate — assim o
  // desenho não aloca nada por frame.
  // ------------------------------------------------------------------
  var grad = {
    pedra: null, musgo: null, terra: null, sopro: null, soproBase: null,
    bola: null, rolo: null, trilho: null,
    pino: null, discoCrosta: null, discoGlow: null, discoBorda: null,
    casca: null, limo: null, brasaAviso: null, brasaMiolo: null,
  };

  function buildGrads(ctx) {
    if (grad.pedra) return;
    var g;

    // corpo da plataforma de pedra (topo claro → base escura)
    g = ctx.createLinearGradient(0, 0, 0, PLAT_H + 14);
    g.addColorStop(0, '#a89c88');
    g.addColorStop(0.35, '#7d7263');
    g.addColorStop(1, '#3a3229');
    grad.pedra = g;

    // musgo do topo
    g = ctx.createLinearGradient(0, -3, 0, 9);
    g.addColorStop(0, '#a8e05a');
    g.addColorStop(0.55, '#5faa2c');
    g.addColorStop(1, '#2f6a18');
    grad.musgo = g;

    // saliência de terra do desmorona
    g = ctx.createLinearGradient(0, 0, 0, DESM_H);
    g.addColorStop(0, '#9a7548');
    g.addColorStop(0.4, '#6d4f2c');
    g.addColorStop(1, '#3a2716');
    grad.terra = g;

    // coluna de ar quente: topo (y=0) dissolvido, base (y=1) quente
    g = ctx.createLinearGradient(0, 0, 0, 1);
    g.addColorStop(0, 'rgba(255,235,170,0.02)');
    g.addColorStop(0.55, 'rgba(255,180,60,0.20)');
    g.addColorStop(1, 'rgba(255,120,20,0.34)');
    grad.sopro = g; // usado com scale(1, h) — ver drawSopro

    // brilho da boca do sopro
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(255,246,200,0.85)');
    g.addColorStop(0.45, 'rgba(255,160,40,0.45)');
    g.addColorStop(1, 'rgba(255,110,10,0)');
    grad.soproBase = g; // usado com scale — ver drawSopro

    // bola de ferro (luz vinda de cima-esquerda)
    g = ctx.createRadialGradient(-0.35, -0.4, 0.05, 0, 0, 1.05);
    g.addColorStop(0, '#8f96a3');
    g.addColorStop(0.35, '#4d5460');
    g.addColorStop(0.8, '#23272f');
    g.addColorStop(1, '#111318');
    grad.bola = g; // usado com scale(r, r)

    // cilindro do rolo
    g = ctx.createLinearGradient(0, -1, 0, 1);
    g.addColorStop(0, '#b9bfc9');
    g.addColorStop(0.4, '#767d8a');
    g.addColorStop(1, '#2c3038');
    grad.rolo = g; // usado com scale(r, r)

    // trilho de ferro
    g = ctx.createLinearGradient(0, -6, 0, 8);
    g.addColorStop(0, '#5b5f68');
    g.addColorStop(0.5, '#33373e');
    g.addColorStop(1, '#191c21');
    grad.trilho = g;

    // pino de ancoragem do cipó (metal escovado, luz de cima-esquerda)
    g = ctx.createRadialGradient(-0.35, -0.4, 0.05, 0, 0, 1.05);
    g.addColorStop(0, '#c9cfd8');
    g.addColorStop(0.4, '#7a818d');
    g.addColorStop(0.85, '#3a3f47');
    g.addColorStop(1, '#1b1e23');
    grad.pino = g; // usado com scale(r, r)

    // disco de âmbar: crosta escura em cima, lava viva embaixo
    g = ctx.createLinearGradient(0, -1, 0, 1);
    g.addColorStop(0, '#3a2b1c');
    g.addColorStop(0.34, '#5d3a17');
    g.addColorStop(0.6, '#d1671a');
    g.addColorStop(0.85, '#ffb038');
    g.addColorStop(1, '#ffe6a0');
    grad.discoCrosta = g; // usado com scale(rx, ry)

    // glow que o disco derrama por baixo
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(255,190,90,0.55)');
    g.addColorStop(0.45, 'rgba(255,130,30,0.24)');
    g.addColorStop(1, 'rgba(255,90,10,0)');
    grad.discoGlow = g; // usado com scale

    // borda incandescente vista de lado
    g = ctx.createLinearGradient(0, -1, 0, 1);
    g.addColorStop(0, 'rgba(255,214,140,0.0)');
    g.addColorStop(0.5, 'rgba(255,180,70,0.85)');
    g.addColorStop(1, 'rgba(255,120,20,0.9)');
    grad.discoBorda = g; // usado com scale(rx, ry)

    // casca do tronco (topo iluminado, barriga na sombra do lodo)
    g = ctx.createLinearGradient(0, 0, 0, TRONCO_H);
    g.addColorStop(0, '#7c6238');
    g.addColorStop(0.45, '#523f22');
    g.addColorStop(1, '#241a0e');
    grad.casca = g;

    // limo do topo do tronco
    g = ctx.createLinearGradient(0, -2, 0, 7);
    g.addColorStop(0, '#c3e05a');
    g.addColorStop(0.5, '#6f9a2a');
    g.addColorStop(1, '#3c5a17');
    grad.limo = g;

    // mancha de aviso no chão da zona de brasa
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(255,120,30,0.55)');
    g.addColorStop(0.5, 'rgba(160,40,10,0.30)');
    g.addColorStop(1, 'rgba(90,20,5,0)');
    grad.brasaAviso = g; // usado com scale

    // miolo quente da brasa
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(255,248,210,0.95)');
    g.addColorStop(0.35, 'rgba(255,176,60,0.75)');
    g.addColorStop(1, 'rgba(255,90,10,0)');
    grad.brasaMiolo = g; // usado com scale(r, r)
  }

  // ==================================================================
  // Construtores — TUDO o que aloca acontece aqui (chamado em reset()).
  // ==================================================================

  // 1) plataforma {x, y, w, dx, dy, period, phase}
  function makePlataforma(d) {
    var w = d.w || 120;
    var o = {
      type: 'plataforma',
      ox: d.x, oy: d.y, w: w, h: PLAT_H,
      dx: d.dx || 0, dy: d.dy || 0,
      period: d.period || 4, phase: d.phase || 0,
      rect: { x: d.x, y: d.y, w: w, h: PLAT_H },
      tufts: [],   // tufos de musgo (decoração determinística)
      runas: [],   // runas brilhantes embaixo
    };
    var n = Math.max(3, Math.round(w / 26));
    for (var i = 0; i < n; i++) {
      o.tufts.push({ x: 6 + (i + 0.5) * ((w - 12) / n), h: 5 + ((i * 37) % 7), lean: ((i % 3) - 1) * 0.35 });
    }
    var rn = Math.max(2, Math.round(w / 46));
    for (var k = 0; k < rn; k++) {
      o.runas.push({ x: (k + 0.5) * (w / rn), ph: k * 1.7, r: 3 + (k % 2) });
    }
    return o;
  }

  // 2) desmorona {x, y, w}
  function makeDesmorona(d) {
    var w = d.w || 90;
    var o = {
      type: 'desmorona',
      ox: d.x, oy: d.y, w: w, h: DESM_H,
      state: 'firme',   // firme → tremendo → caindo → sumido → voltando
      timer: 0,
      vy: 0,
      alpha: 1,
      shakeX: 0, shakeY: 0,
      dustAccum: 0,
      rect: { x: d.x, y: d.y, w: w, h: DESM_H },
      cracks: [],       // rachaduras desenhadas (determinísticas)
      pebbles: [],      // pedrinhas soltas na base
    };
    var n = Math.max(2, Math.round(w / 34));
    for (var i = 0; i < n; i++) {
      o.cracks.push({ x: 8 + (i + 0.5) * ((w - 16) / n), bend: ((i * 53) % 9) - 4 });
    }
    for (var k = 0; k < n + 1; k++) {
      o.pebbles.push({ x: 4 + (k * (w - 8)) / n, r: 2 + (k % 3) });
    }
    return o;
  }

  // 3) sopro {x, y, w, h}
  function makeSopro(d) {
    var w = d.w || 90, h = d.h || 200;
    var o = {
      type: 'sopro',
      x: d.x, y: d.y, w: w, h: h,
      zone: { x: d.x, y: d.y, w: w, h: h },
      phase: (d.x * 0.013) % TAU,
      motes: [],   // partículas quentes (posição derivada do tempo: zero alocação)
    };
    var n = Math.max(8, Math.round((w * h) / 1500));
    if (n > 26) n = 26;
    for (var i = 0; i < n; i++) {
      o.motes.push({
        fx: (i * 0.6180339887) % 1,       // coluna (sequência de baixa discrepância)
        off: (i * 0.7548776662) % 1,      // deslocamento de fase na subida
        spd: 0.35 + ((i * 17) % 10) / 18, // velocidade relativa
        r: 1.6 + ((i * 13) % 5) * 0.7,
        sw: 5 + ((i * 29) % 11),          // amplitude do zigue-zague
      });
    }
    return o;
  }

  // 4) pendulo {x, y, len, arc, period}
  function makePendulo(d) {
    var len = d.len || 190;
    var o = {
      type: 'pendulo',
      ax: d.x, ay: d.y,           // âncora
      len: len,
      arc: d.arc != null ? d.arc : 0.9,
      period: d.period || 3,
      phase: d.phase || 0,
      ang: 0,
      bx: d.x, by: d.y + len,     // posição da bola
      br: 19,                     // raio da bola de ferro
      ballRect: { x: 0, y: 0, w: 0, h: 0 },
      links: [],                  // elos sólidos (entram em movers)
      spec: [],                   // elos decorativos (só desenho)
    };
    // Elos sólidos: 4 pedacinhos da corrente onde dá para pousar. Param bem
    // antes da bola, senão pousar já seria levar pancada.
    var fr = [0.30, 0.46, 0.62, 0.78];
    for (var i = 0; i < CHAIN_LINKS; i++) {
      o.links.push({ x: 0, y: 0, w: LINK_W, h: LINK_H, f: fr[i % fr.length] });
    }
    // Elos desenhados um a um ao longo de toda a corrente.
    var n = Math.max(6, Math.round(len / 17));
    for (var k = 0; k < n; k++) o.spec.push({ f: (k + 0.5) / n });
    return o;
  }

  // 5) espinhorolo {x, y, w, range, speed}
  function makeEspinhorolo(d) {
    var w = d.w || 46;
    var o = {
      type: 'espinhorolo',
      ox: d.x, oy: d.y,
      w: w, h: w,
      range: d.range || 220,
      speed: d.speed || 130,
      pos: 0, dir: 1,
      rot: 0,
      x: d.x, y: d.y,
      rect: { x: d.x, y: d.y, w: w, h: w },
      sparkAccum: 0,
      spikes: 10,
    };
    return o;
  }

  // 6) cipo {x1, y1, x2, y2, sag}
  // A corda pendurada entre dois pinos. Não é sólida: o contato dela com o
  // player é agarre, não colisão — por isso não entra em `movers`.
  function makeCipo(d) {
    var x1 = d.x1, y1 = d.y1, x2 = d.x2, y2 = d.y2;
    var dx = x2 - x1, dy = y2 - y1;
    var corda = Math.sqrt(dx * dx + dy * dy);
    var sag = d.sag != null ? d.sag : Math.max(30, corda * 0.22);
    var o = {
      type: 'cipo',
      x1: x1, y1: y1, x2: x2, y2: y2, sag: sag,
      corda: corda,
      // comprimento real (com a barriga) — só para o desenho da trança
      len: corda + sag * 0.9,
      phase: (x1 * 0.011 + y1 * 0.007) % TAU,  // balanço dessincronizado por posição
      pts: [],          // catenária amostrada: reescrita in loco a cada frame
      held: false,      // o player está pendurado NESTA corda?
      t: 0.5,           // parâmetro dele ao longo da corda (0..1)
      dir: 1,           // última direção em que andava (dá a direção do impulso)
      cool: 0,          // carência de reagarre depois de soltar
      // O que vai para FG.player.hang. É um objeto próprio de cada corda, então
      // dá para saber, por identidade, se é NESTA que ele está pendurado.
      hangInfo: { type: 'cipo', x: 0, y: 0, t: 0.5, dir: 1 },
    };
    for (var i = 0; i <= CIPO_SEGS; i++) o.pts.push({ x: x1, y: y1 });
    // meias-voltas da trança: uma a cada ~16px, para o passo não esticar em
    // cordas longas nem virar renda em cordas curtas.
    o.twist = Math.max(6, Math.round(o.len / 16));
    return o;
  }

  // 7) disco {x, y, w, bob, period, phase}
  function makeDisco(d) {
    var w = d.w || 110;
    var o = {
      type: 'disco',
      ox: d.x, oy: d.y, w: w, h: DISCO_H,
      bob: d.bob != null ? d.bob : 10,
      period: d.period || 3,
      phase: d.phase || 0,
      rect: { x: d.x, y: d.y, w: w, h: DISCO_H },
      veios: [],   // gretas acesas na crosta (decoração determinística)
    };
    var n = Math.max(3, Math.round(w / 34));
    for (var i = 0; i < n; i++) {
      o.veios.push({
        fx: -0.78 + (i + 0.5) * (1.56 / n),      // posição relativa no raio
        fy: -0.42 + ((i * 31) % 5) * 0.10,
        len: 0.16 + ((i * 17) % 4) * 0.06,
        ph: i * 1.3,
      });
    }
    return o;
  }

  // 8) tronco {x, y, w}
  function makeTronco(d) {
    var w = d.w || 130;
    var o = {
      type: 'tronco',
      ox: d.x, oy: d.y, w: w, h: TRONCO_H,
      sink: 0,          // quanto já afundou (0..TRONCO_MAX)
      rect: { x: d.x, y: d.y, w: w, h: TRONCO_H },
      bubAccum: 0,
      limos: [],        // tufos de limo no topo
      nos: [],          // nós/gretas na casca
    };
    var n = Math.max(3, Math.round(w / 30));
    for (var i = 0; i < n; i++) {
      o.limos.push({ x: 8 + (i + 0.5) * ((w - 16) / n), h: 4 + ((i * 41) % 5), lean: ((i % 3) - 1) * 0.4 });
    }
    var m = Math.max(2, Math.round(w / 44));
    for (var k = 0; k < m; k++) {
      o.nos.push({ x: 14 + (k + 0.5) * ((w - 28) / m), y: 5 + ((k * 23) % 9), r: 2.2 + (k % 3) * 0.8 });
    }
    return o;
  }

  // 9) brasa {x, y, w, h, period, phase}
  function makeBrasa(d) {
    var w = d.w || 200, h = d.h || 220;
    var o = {
      type: 'brasa',
      x: d.x, y: d.y, w: w, h: h,
      period: Math.max(BRASA_TELE + BRASA_RAJADA + 0.3, d.period || 3.4),
      phase: d.phase || 0,        // em SEGUNDOS de adiantamento no ciclo
      chao: d.y + h,              // onde a brasa estoura (base da zona)
      fase: 'descanso',
      ct: 0,
      acc: 0,
      taxa: Math.max(8, w / 9),   // brasas por segundo durante a rajada
      hitRect: { x: 0, y: 0, w: 0, h: 0 },
      colunas: [],                // onde caem (também são as manchas de aviso)
      pool: [],
      pn: 0,
    };
    var n = Math.max(3, Math.min(9, Math.round(w / 46)));
    for (var i = 0; i < n; i++) {
      o.colunas.push({ fx: (i + 0.5) / n, r: 16 + ((i * 29) % 11), ph: i * 0.9 });
    }
    for (var k = 0; k < BRASA_MAX; k++) {
      o.pool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, r: 3, life: 0, spin: 0 });
    }
    return o;
  }

  // ==================================================================
  // Auxiliares de runtime
  // ==================================================================

  // O player está apoiado em cima deste retângulo? (pés a ~2px do topo e
  // sobreposição horizontal). É o que autoriza a plataforma a arrastá-lo.
  function playerOnTop(rect, p) {
    if (!p.onGround) return false;
    if (p.x + p.w <= rect.x + 1 || p.x >= rect.x + rect.w - 1) return false;
    var d = (p.y + p.h) - rect.y;
    return d >= -4 && d <= 6;
  }

  // Planando? O player não expõe o estado, mas a assinatura é inconfundível:
  // segurando o pulo, no ar, caindo devagar (a queda planando é limitada a
  // ~90 px/s). Serve só para dar um empurrão extra dentro do sopro.
  function isGliding(p) {
    var input = FG.input;
    return !!(input && input.jump) && !p.onGround && p.vy > 0 && p.vy < 140;
  }

  // ==================================================================
  // UPDATE por tipo
  // ==================================================================

  function updatePlataforma(o, dt, p, t) {
    // Vaivém senoidal entre (ox,oy) e (ox+dx, oy+dy): u vai de 0 a 1 e volta.
    var u = 0.5 - 0.5 * Math.cos((t / o.period) * TAU + o.phase);
    var nx = o.ox + o.dx * u;
    var ny = o.oy + o.dy * u;

    // Quem estava apoiado ANTES do movimento vai junto.
    var carrying = p && playerOnTop(o.rect, p);

    var ddx = nx - o.rect.x, ddy = ny - o.rect.y;
    o.rect.x = nx; o.rect.y = ny;

    if (carrying) {
      p.x += ddx;
      p.y += ddy;
    }
  }

  function updateDesmorona(o, dt, p) {
    if (o.state === 'firme') {
      if (p && playerOnTop(o.rect, p)) {
        o.state = 'tremendo';
        o.timer = DESM_SHAKE;
        o.dustAccum = 0;
      }
    } else if (o.state === 'tremendo') {
      o.timer -= dt;
      // treme cada vez mais forte conforme o tempo acaba
      var k = 1 - o.timer / DESM_SHAKE;
      var amp = 1 + k * 3;
      o.shakeX = Math.sin(o.timer * 62) * amp;
      o.shakeY = Math.cos(o.timer * 49) * amp * 0.5;
      // poeirinha caindo da base
      o.dustAccum += dt * (14 + k * 26);
      while (o.dustAccum >= 1) {
        o.dustAccum -= 1;
        spawnParticle(o.rect.x + Math.random() * o.w, o.rect.y + o.h - 2,
          rand(-16, 16), rand(10, 60), rand(0.35, 0.7), rand(1.5, 3.4),
          'rgba(196,166,120,0.85)', 220);
      }
      // arrasta o player junto do tremor (ele sente o chão fugir)
      if (o.timer <= 0) {
        o.state = 'caindo';
        o.vy = 0;
        o.shakeX = 0; o.shakeY = 0;
        // estilhaços do desprendimento
        for (var i = 0; i < 8; i++) {
          spawnParticle(o.rect.x + Math.random() * o.w, o.rect.y + o.h * 0.6,
            rand(-70, 70), rand(-60, 30), rand(0.4, 0.8), rand(2, 5),
            'rgba(150,118,78,0.9)', 620);
        }
      }
    } else if (o.state === 'caindo') {
      o.vy += GRAV * dt;
      o.rect.y += o.vy * dt;
      o.alpha = Math.max(0, 1 - (o.rect.y - o.oy) / 260);
      var chao = (FG.level && FG.level.H) || 720;
      if (o.rect.y > chao + 160 || o.alpha <= 0) {
        o.state = 'sumido';
        o.timer = DESM_BACK;
        o.alpha = 0;
      }
    } else if (o.state === 'sumido') {
      o.timer -= dt;
      if (o.timer <= 0) {
        o.state = 'voltando';
        o.timer = DESM_FADE;
        o.rect.x = o.ox; o.rect.y = o.oy;
        o.vy = 0;
      }
    } else if (o.state === 'voltando') {
      // reaparece no lugar com fade-in (já sólida, para não sumir sob os pés)
      o.timer -= dt;
      o.alpha = 1 - Math.max(0, o.timer / DESM_FADE);
      if (o.timer <= 0) { o.state = 'firme'; o.alpha = 1; }
    }
  }

  function updateSopro(o, dt, p, t) {
    if (!p) return;
    if (!FG.engine.rectsOverlap(p, o.zone)) return;
    var glide = isGliding(p);
    p.vy -= (glide ? SOPRO_ACC_GLIDE : SOPRO_ACC) * dt;
    var cap = glide ? SOPRO_CAP_GLIDE : SOPRO_CAP;
    if (p.vy < cap) p.vy = cap;
    // brasinha marcando que a coluna está agindo
    if (Math.random() < dt * 18) {
      spawnParticle(p.x + Math.random() * p.w, p.y + p.h,
        rand(-20, 20), rand(-160, -60), rand(0.25, 0.5), rand(1.5, 3),
        'rgba(255,205,110,0.9)', -60);
    }
  }

  function updatePendulo(o, dt, p, t) {
    o.ang = o.arc * Math.sin((t / o.period) * TAU + o.phase);
    var sa = Math.sin(o.ang), ca = Math.cos(o.ang);
    o.bx = o.ax + sa * o.len;
    o.by = o.ay + ca * o.len;

    // Elos sólidos ao longo da corrente (o engine os injeta em solids).
    for (var i = 0; i < o.links.length; i++) {
      var L = o.links[i];
      var lx = o.ax + sa * o.len * L.f;
      var ly = o.ay + ca * o.len * L.f;
      L.x = lx - L.w / 2;
      L.y = ly - L.h / 2;
    }

    // A bola machuca. AABB reaproveitado, nada de objeto novo.
    if (p) {
      var r = o.br;
      var br = o.ballRect;
      br.x = o.bx - r; br.y = o.by - r; br.w = r * 2; br.h = r * 2;
      if (FG.engine.rectsOverlap(p, br)) p.hurt(1, o.bx);
    }
  }

  function updateEspinhorolo(o, dt, p) {
    // Ida e volta no trilho, com a rotação acompanhando o deslocamento.
    var step = o.dir * o.speed * dt;
    o.pos += step;
    if (o.pos > o.range) { o.pos = o.range; o.dir = -1; }
    else if (o.pos < 0) { o.pos = 0; o.dir = 1; }
    o.x = o.ox + o.pos;
    o.rect.x = o.x; o.rect.y = o.y;
    o.rot += step / (o.w / 2);

    // faíscas do atrito com o trilho
    o.sparkAccum += dt * 12;
    while (o.sparkAccum >= 1) {
      o.sparkAccum -= 1;
      spawnParticle(o.x + o.w / 2 - o.dir * o.w * 0.4, o.y + o.h - 1,
        -o.dir * rand(30, 110), rand(-70, -10), rand(0.2, 0.4), rand(1.2, 2.4),
        'rgba(255,214,120,0.95)', 500);
    }

    if (p && FG.engine.rectsOverlap(p, o.rect)) p.hurt(1, o.x + o.w / 2);
  }

  // --- cipó ----------------------------------------------------------
  // Reescreve os pontos da catenária IN LOCO (nada de alocar). A forma é a
  // parábola 4u(1-u), que a esta escala é indistinguível de uma catenária e
  // custa uma multiplicação; o balanço é uma senoide na perpendicular da
  // corda, com a mesma barriga, para a corda ondular sem esticar as pontas.
  function cipoPontos(o, t, comPeso) {
    var dx = o.x2 - o.x1, dy = o.y2 - o.y1;
    var L = o.corda || 1;
    var nx = -dy / L, ny = dx / L;               // perpendicular unitária
    var sw = Math.sin(t * CIPO_SWAY_W + o.phase) * CIPO_SWAY;
    for (var i = 0; i <= CIPO_SEGS; i++) {
      var u = i / CIPO_SEGS;
      var barriga = 4 * u * (1 - u);             // 1 no meio, 0 nas pontas
      var px = o.x1 + dx * u + nx * sw * barriga;
      var py = o.y1 + dy * u + o.sag * barriga + ny * sw * barriga;
      if (comPeso) {
        // a corda cede em volta de quem está pendurado nela
        var d = Math.abs(u - o.t);
        if (d < CIPO_DIP_R) {
          var k = 1 - d / CIPO_DIP_R;
          py += CIPO_DIP * k * k;
        }
      }
      var pt = o.pts[i];
      pt.x = px; pt.y = py;
    }
  }

  // Ponto da corda em t (0..1), escrito em o.hangInfo — é dali que sai a
  // posição do player e o desenho das mãos.
  function cipoPonto(o, t) {
    var f = t * CIPO_SEGS;
    var i = f | 0;
    if (i < 0) i = 0;
    if (i > CIPO_SEGS - 1) i = CIPO_SEGS - 1;
    var fr = f - i;
    var a = o.pts[i], b = o.pts[i + 1];
    var hi = o.hangInfo;
    hi.x = a.x + (b.x - a.x) * fr;
    hi.y = a.y + (b.y - a.y) * fr;
    hi.t = t;
  }

  // Soltar. `impulso` só com ESPAÇO; chegar na ponta larga sem prêmio.
  function cipoSolta(o, p, impulso) {
    o.held = false;
    o.cool = CIPO_COOL;
    p.hang = null;
    if (impulso) {
      p.vy = CIPO_OUT_VY;
      p.vx = o.dir * CIPO_OUT_VX;
      if (FG.audio) FG.audio.sfx('doublejump');
    } else {
      p.vy = 0;
      p.vx = o.dir * CIPO_END_VX;
    }
  }

  function updateCipo(o, dt, p, t) {
    if (o.cool > 0) o.cool -= dt;
    var input = FG.input;
    var pendurado = !!(p && p.hang && p.hang === o.hangInfo);

    if (pendurado) {
      // ←/→ andam ao longo da corda; o resto da física dele está desligado
      var dir = 0;
      if (input) {
        if (input.left && !input.right) dir = -1;
        else if (input.right && !input.left) dir = 1;
      }
      if (dir !== 0) { o.t += dir * CIPO_SPEED * dt; o.dir = dir; }
      o.hangInfo.dir = o.dir;

      if (input && input.jumpPressed) {
        cipoSolta(o, p, true);
        pendurado = false;
      } else if (o.t <= 0 || o.t >= 1) {
        // passou da ponta: sai por ali mesmo, sem impulso
        o.t = o.t <= 0 ? 0 : 1;
        cipoSolta(o, p, false);
        pendurado = false;
      }
    }

    o.held = pendurado;
    cipoPontos(o, t, pendurado);

    if (pendurado) {
      cipoPonto(o, o.t);
      // pendura pelas MÃOS: o topo do corpo fica logo abaixo da corda
      p.x = o.hangInfo.x - p.w / 2;
      p.y = o.hangInfo.y + CIPO_HANDS;
      p.vx = 0; p.vy = 0;   // senão, ao soltar, ele herda a queda de antes
      return;
    }

    // Agarrar: só no ar, só se não estiver pendurado em nada e a carência
    // desta corda tiver passado (senão ele gruda de novo no mesmo frame).
    if (!p || p.onGround || p.hang || o.cool > 0) return;
    var x0 = p.x - CIPO_GRAB_PAD, x1 = p.x + p.w + CIPO_GRAB_PAD;
    var y0 = p.y - CIPO_GRAB_PAD, y1 = p.y + p.h + CIPO_GRAB_PAD;
    var cx = p.x + p.w / 2, cy = p.y + p.h * 0.25;   // mira nas mãos, não nos pés
    var melhor = -1, melhorD = 0;
    for (var i = 0; i <= CIPO_SEGS; i++) {
      var pt = o.pts[i];
      if (pt.x < x0 || pt.x > x1 || pt.y < y0 || pt.y > y1) continue;
      var ddx = pt.x - cx, ddy = pt.y - cy;
      var d2 = ddx * ddx + ddy * ddy;
      if (melhor < 0 || d2 < melhorD) { melhor = i; melhorD = d2; }
    }
    if (melhor < 0) return;

    o.held = true;
    // agarrar em cima do pino soltaria no frame seguinte (t fora de 0..1):
    // afasta um pouco das pontas para ele sempre ganhar um instante de corda
    o.t = Math.min(0.96, Math.max(0.04, melhor / CIPO_SEGS));
    o.dir = p.vx < 0 ? -1 : 1;
    o.hangInfo.dir = o.dir;
    cipoPonto(o, o.t);
    p.hang = o.hangInfo;
    p.x = o.hangInfo.x - p.w / 2;
    p.y = o.hangInfo.y + CIPO_HANDS;
    p.vx = 0; p.vy = 0;
    if (FG.audio) FG.audio.sfx('glide');
  }

  // --- disco ---------------------------------------------------------
  function updateDisco(o, dt, p, t) {
    // sobe e desce de leve; mesma mecânica de arrasto da plataforma
    var ny = o.oy + o.bob * Math.sin((t / o.period) * TAU + o.phase);
    var carrying = p && playerOnTop(o.rect, p);
    var ddy = ny - o.rect.y;
    o.rect.y = ny;
    if (carrying) p.y += ddy;
  }

  // --- tronco --------------------------------------------------------
  function updateTronco(o, dt, p) {
    var carrying = p && playerOnTop(o.rect, p);
    if (carrying) {
      o.sink += TRONCO_DOWN * dt;
      if (o.sink > TRONCO_MAX) o.sink = TRONCO_MAX;
    } else if (o.sink > 0) {
      o.sink -= TRONCO_UP * dt;
      if (o.sink < 0) o.sink = 0;
    }
    var ny = o.oy + o.sink;
    var ddy = ny - o.rect.y;
    o.rect.y = ny;
    if (carrying) p.y += ddy;

    // bolhas de lodo escapando por baixo enquanto afunda (só afundando: parado
    // no fundo não borbulha, senão a poça vira jacuzzi)
    if (carrying && o.sink < TRONCO_MAX) {
      o.bubAccum += dt * 16;
      while (o.bubAccum >= 1) {
        o.bubAccum -= 1;
        spawnParticle(o.rect.x + rand(6, o.w - 6), o.rect.y + o.h - 2,
          rand(-12, 12), rand(-40, -12), rand(0.4, 0.85), rand(1.8, 3.6),
          'rgba(170,205,110,0.75)', -30);
      }
    } else {
      o.bubAccum = 0;
    }
  }

  // --- brasa ---------------------------------------------------------
  function brasaSolta(o) {
    var e = o.pool[o.pn];
    o.pn = (o.pn + 1) % BRASA_MAX;
    var col = o.colunas[(Math.random() * o.colunas.length) | 0];
    e.active = true;
    e.x = o.x + col.fx * o.w + rand(-14, 14);
    e.y = o.y - rand(2, 26);
    e.vx = rand(-24, 24);
    e.vy = rand(90, 200);
    e.r = rand(2.6, 5.2);
    e.life = 4;
    e.spin = rand(0, TAU);
  }

  function updateBrasa(o, dt, p, t) {
    // ciclo: aviso (telegraph) → rajada → descanso
    var ct = (t + o.phase) % o.period;
    o.ct = ct;
    o.fase = ct < BRASA_TELE ? 'aviso' : (ct < BRASA_TELE + BRASA_RAJADA ? 'rajada' : 'descanso');

    if (o.fase === 'rajada') {
      o.acc += dt * o.taxa;
      while (o.acc >= 1) { o.acc -= 1; brasaSolta(o); }
    } else {
      o.acc = 0;
    }

    var hr = o.hitRect;
    for (var i = 0; i < BRASA_MAX; i++) {
      var e = o.pool[i];
      if (!e.active) continue;
      e.life -= dt;
      e.vy += BRASA_GRAV * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.spin += dt * 6;

      if (p) {
        hr.x = e.x - e.r; hr.y = e.y - e.r; hr.w = e.r * 2; hr.h = e.r * 2;
        if (FG.engine.rectsOverlap(p, hr)) {
          p.hurt(1, e.x);
          e.active = false;
          continue;
        }
      }
      if (e.y >= o.chao) {
        // estoura em faíscas ao bater no chão da zona
        for (var k = 0; k < 4; k++) {
          spawnParticle(e.x, o.chao - 1, rand(-90, 90), rand(-150, -40),
            rand(0.18, 0.42), rand(1.2, 2.6), 'rgba(255,196,90,0.95)', 900);
        }
        e.active = false;
        continue;
      }
      if (e.life <= 0) e.active = false;
    }
  }

  // ==================================================================
  // DESENHO por tipo — tudo pintado (gradientes, glow), sem assets.
  // As funções trabalham em coordenadas de tela (cam já descontada).
  // ==================================================================

  function drawPlataforma(ctx, o, cam, t) {
    var r = o.rect;
    if (!visible(cam, r.x, r.y - 10, r.w, r.h + 40)) return;
    var sx = r.x - cam.x, sy = r.y - cam.y;

    ctx.save();
    ctx.translate(sx, sy);

    // corpo de pedra: topo reto, base irregular (pedra arrancada do chão)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r.w, 0);
    ctx.lineTo(r.w - 4, r.h);
    ctx.lineTo(r.w * 0.72, r.h + 9);
    ctx.lineTo(r.w * 0.5, r.h + 4);
    ctx.lineTo(r.w * 0.28, r.h + 11);
    ctx.lineTo(4, r.h);
    ctx.closePath();
    ctx.fillStyle = grad.pedra;
    ctx.fill();

    // veios claros na pedra
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#e8dfcd';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(r.w * 0.15, r.h * 0.55);
    ctx.lineTo(r.w * 0.42, r.h * 0.35);
    ctx.moveTo(r.w * 0.58, r.h * 0.7);
    ctx.lineTo(r.w * 0.84, r.h * 0.45);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // musgo por cima
    ctx.fillStyle = grad.musgo;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r.w, 0);
    ctx.lineTo(r.w, 6);
    ctx.quadraticCurveTo(r.w * 0.5, 10, 0, 6);
    ctx.closePath();
    ctx.fill();
    // tufos balançando de leve
    ctx.strokeStyle = '#8fd94a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < o.tufts.length; i++) {
      var tf = o.tufts[i];
      var sway = Math.sin(t * 2.2 + tf.x * 0.12) * 1.6 + tf.lean;
      ctx.moveTo(tf.x, 1);
      ctx.quadraticCurveTo(tf.x + sway, -tf.h * 0.6, tf.x + sway * 1.8, -tf.h);
    }
    ctx.stroke();

    // runas brilhantes na barriga da pedra (o que a mantém no ar)
    ctx.shadowColor = '#7fd8ff';
    ctx.shadowBlur = 12;
    for (var k = 0; k < o.runas.length; k++) {
      var ru = o.runas[k];
      var pulse = 0.45 + 0.45 * Math.sin(t * 2.6 + ru.ph);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#bff0ff';
      ctx.beginPath();
      ctx.arc(ru.x, r.h + 5, ru.r, 0, TAU);
      ctx.fill();
      // risquinho de runa
      ctx.strokeStyle = '#8fe6ff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ru.x - ru.r - 2, r.h + 5);
      ctx.lineTo(ru.x + ru.r + 2, r.h + 5);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawDesmorona(ctx, o, cam, t) {
    if (o.state === 'sumido') {
      // fantasma do lugar onde ela volta, para o jogador se planejar
      var gx = o.ox - cam.x, gy = o.oy - cam.y;
      if (!visible(cam, o.ox, o.oy, o.w, o.h)) return;
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 5);
      ctx.strokeStyle = '#d8b878';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(gx, gy, o.w, o.h);
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }

    var r = o.rect;
    if (!visible(cam, r.x, r.y, o.w, o.h + 8)) return;
    var sx = r.x - cam.x + o.shakeX, sy = r.y - cam.y + o.shakeY;

    ctx.save();
    ctx.globalAlpha = o.alpha;
    ctx.translate(sx, sy);
    if (o.state === 'caindo') {
      // gira devagar ao despencar
      ctx.translate(o.w / 2, o.h / 2);
      ctx.rotate((r.y - o.oy) * 0.0016);
      ctx.translate(-o.w / 2, -o.h / 2);
    }

    // saliência de terra com base em ponta
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(o.w, 0);
    ctx.lineTo(o.w - 6, o.h);
    ctx.lineTo(o.w * 0.55, o.h + 6);
    ctx.lineTo(o.w * 0.3, o.h + 2);
    ctx.lineTo(6, o.h);
    ctx.closePath();
    ctx.fillStyle = grad.terra;
    ctx.fill();

    // grama rala no topo
    ctx.fillStyle = 'rgba(120,170,60,0.85)';
    ctx.fillRect(0, 0, o.w, 4);

    // rachaduras — abrem conforme o tremor avança
    var open = o.state === 'tremendo' ? 1 - o.timer / DESM_SHAKE : (o.state === 'firme' ? 0.25 : 1);
    ctx.strokeStyle = 'rgba(28,18,10,' + (0.35 + 0.5 * open) + ')';
    ctx.lineWidth = 1 + 1.6 * open;
    ctx.beginPath();
    for (var i = 0; i < o.cracks.length; i++) {
      var c = o.cracks[i];
      ctx.moveTo(c.x, 2);
      ctx.lineTo(c.x + c.bend * 0.4, o.h * 0.55);
      ctx.lineTo(c.x + c.bend, o.h);
    }
    ctx.stroke();

    // pedrinhas soltas pendendo da base
    ctx.fillStyle = 'rgba(90,68,42,0.9)';
    for (var k = 0; k < o.pebbles.length; k++) {
      var pb = o.pebbles[k];
      var jig = o.state === 'tremendo' ? Math.sin(t * 40 + k) * 1.5 : 0;
      ctx.beginPath();
      ctx.arc(pb.x, o.h + 1 + jig, pb.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSoproFundo(ctx, o, cam, t) {
    if (!visible(cam, o.x, o.y, o.w, o.h)) return;
    var sx = o.x - cam.x, sy = o.y - cam.y;

    ctx.save();
    ctx.translate(sx, sy);
    // corpo translúcido com bordas ondulando (distorção do ar quente)
    ctx.save();
    ctx.scale(1, o.h);
    ctx.fillStyle = grad.sopro;
    ctx.beginPath();
    ctx.moveTo(0, 1);
    for (var i = 0; i <= 8; i++) {
      var f = i / 8;
      var wob = Math.sin(t * 2.4 + f * 5 + o.phase) * 6;
      ctx.lineTo(wob, 1 - f);
    }
    for (var k = 8; k >= 0; k--) {
      var f2 = k / 8;
      var wob2 = Math.sin(t * 2.1 + f2 * 5.4 + o.phase + 1.7) * 6;
      ctx.lineTo(o.w + wob2, 1 - f2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // boca da coluna: mais brilhante, respirando
    ctx.save();
    ctx.translate(o.w / 2, o.h);
    var br = o.w * (0.75 + 0.08 * Math.sin(t * 6 + o.phase));
    ctx.scale(br, br * 0.55);
    ctx.fillStyle = grad.soproBase;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    ctx.restore();

    // grelha de pedra da base (de onde o sopro sai)
    ctx.fillStyle = 'rgba(50,36,28,0.85)';
    ctx.fillRect(-4, o.h - 6, o.w + 8, 8);
    ctx.fillStyle = 'rgba(255,150,40,0.8)';
    for (var g = 0; g < 4; g++) {
      var gx = 6 + g * ((o.w - 12) / 3);
      ctx.fillRect(gx - 2, o.h - 5, 4, 6);
    }
    ctx.restore();
  }

  function drawSoproFrente(ctx, o, cam, t) {
    if (!visible(cam, o.x, o.y, o.w, o.h)) return;
    var sx = o.x - cam.x, sy = o.y - cam.y;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < o.motes.length; i++) {
      var m = o.motes[i];
      // sobe em laço contínuo: posição derivada do tempo (nada guardado)
      var up = ((t * m.spd * 0.45 + m.off) % 1);
      var py = o.h * (1 - up);
      var px = m.fx * o.w + Math.sin(t * 3 + m.off * 9 + o.phase) * m.sw;
      var fade = up < 0.15 ? up / 0.15 : (up > 0.75 ? (1 - up) / 0.25 : 1);
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillStyle = up > 0.5 ? '#ffe6a8' : '#ffb44a';
      ctx.beginPath();
      ctx.arc(px, py, m.r * (0.6 + 0.6 * (1 - up)), 0, TAU);
      ctx.fill();
    }
    // riscos de calor subindo (distorção barata e legível)
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#ffd9a0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var k = 0; k < 3; k++) {
      var lx = (k + 0.5) * (o.w / 3);
      var off = ((t * 0.7 + k * 0.33) % 1) * o.h;
      ctx.moveTo(lx + Math.sin(t * 4 + k) * 4, o.h - off);
      ctx.lineTo(lx + Math.sin(t * 4 + k + 1) * 4, o.h - off - 26);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawPenduloFundo(ctx, o, cam, t) {
    if (!visible(cam, o.ax - o.len - 30, o.ay - 20, o.len * 2 + 60, o.len + 60)) return;
    var ax = o.ax - cam.x, ay = o.ay - cam.y;

    ctx.save();
    // suporte: viga de pedra e argola da âncora
    ctx.fillStyle = '#4a4238';
    ctx.fillRect(ax - 26, ay - 16, 52, 16);
    ctx.fillStyle = '#2a251e';
    ctx.fillRect(ax - 26, ay - 4, 52, 5);
    ctx.strokeStyle = '#6d7480';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(ax, ay, 6, 0, TAU);
    ctx.stroke();

    // elos da corrente, desenhados um a um ao longo da linha
    var sa = Math.sin(o.ang), ca = Math.cos(o.ang);
    for (var i = 0; i < o.spec.length; i++) {
      var f = o.spec[i].f;
      var lx = ax + sa * o.len * f;
      var ly = ay + ca * o.len * f;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(-o.ang);
      var wide = (i % 2) === 0;
      ctx.strokeStyle = wide ? '#8b929e' : '#5c626d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, wide ? 5.5 : 3.5, 8.5, 0, 0, TAU);
      ctx.stroke();
      // brilho especular do metal
      ctx.strokeStyle = 'rgba(230,240,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(-1.2, -1, wide ? 4 : 2.4, 6, 0, Math.PI * 0.9, Math.PI * 1.7);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawPenduloFrente(ctx, o, cam, t) {
    if (!visible(cam, o.bx - 40, o.by - 40, 80, 80)) return;
    var bx = o.bx - cam.x, by = o.by - cam.y;
    var r = o.br;

    ctx.save();
    ctx.translate(bx, by);
    // argola de ligação com a corrente
    ctx.strokeStyle = '#6d7480';
    ctx.lineWidth = 3;
    ctx.save();
    ctx.rotate(-o.ang);
    ctx.beginPath();
    ctx.arc(0, -r - 2, 5, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // bola de ferro
    ctx.save();
    ctx.scale(r, r);
    ctx.fillStyle = grad.bola;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    ctx.restore();

    // brilho especular e reflexo frio embaixo
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#dfe7f2';
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, -r * 0.38, r * 0.2, r * 0.13, -0.7, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#9fd8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r - 2, 0.5, 2.1);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // rebites
    ctx.fillStyle = 'rgba(20,22,28,0.8)';
    for (var i = 0; i < 3; i++) {
      var a = 1.2 + i * 0.8;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, 1.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTrilho(ctx, o, cam) {
    if (!visible(cam, o.ox - 20, o.oy, o.range + o.w + 40, o.h + 16)) return;
    var x0 = o.ox - cam.x, y = o.oy - cam.y;
    var len = o.range + o.w;

    ctx.save();
    ctx.translate(x0, y + o.h);
    // barra do trilho
    ctx.fillStyle = grad.trilho;
    ctx.fillRect(-10, -6, len + 20, 12);
    // topo com brilho
    ctx.fillStyle = 'rgba(200,215,235,0.35)';
    ctx.fillRect(-10, -6, len + 20, 2);
    // parafusos ao longo do trilho
    ctx.fillStyle = '#12151a';
    for (var i = 0; i <= len; i += 42) {
      ctx.beginPath();
      ctx.arc(i, 0, 2.6, 0, TAU);
      ctx.fill();
    }
    // batentes das pontas
    ctx.fillStyle = '#3d424b';
    ctx.fillRect(-14, -14, 8, 22);
    ctx.fillRect(len + 6, -14, 8, 22);
    ctx.restore();
  }

  function drawEspinhorolo(ctx, o, cam, t) {
    if (!visible(cam, o.x - 16, o.y - 16, o.w + 32, o.h + 32)) return;
    var cx = o.x + o.w / 2 - cam.x, cy = o.y + o.h / 2 - cam.y;
    var r = o.w / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(o.rot);

    // espinhos em volta (desenhados antes do cilindro, para nascerem dele)
    ctx.fillStyle = '#d8dee8';
    for (var i = 0; i < o.spikes; i++) {
      var a = (i / o.spikes) * TAU;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-5, -r + 2);
      ctx.lineTo(0, -r - 13);
      ctx.lineTo(5, -r + 2);
      ctx.closePath();
      ctx.fill();
      // ponta afiada mais clara
      ctx.fillStyle = '#f4f8ff';
      ctx.beginPath();
      ctx.moveTo(-1.8, -r - 4);
      ctx.lineTo(0, -r - 13);
      ctx.lineTo(1.8, -r - 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d8dee8';
      ctx.restore();
    }

    // cilindro
    ctx.save();
    ctx.scale(r, r);
    ctx.fillStyle = grad.rolo;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    ctx.restore();

    // aros e estrias que denunciam o giro
    ctx.strokeStyle = 'rgba(20,24,30,0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,240,255,0.35)';
    ctx.lineWidth = 1.4;
    for (var k = 0; k < 4; k++) {
      var ka = (k / 4) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ka) * r * 0.25, Math.sin(ka) * r * 0.25);
      ctx.lineTo(Math.cos(ka) * r * 0.85, Math.sin(ka) * r * 0.85);
      ctx.stroke();
    }
    ctx.restore();

    // aviso quente na direção do movimento (leitura rápida do perigo)
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.12 * Math.sin(t * 9);
    ctx.fillStyle = '#ff6a2a';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 14, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // --- cipó ----------------------------------------------------------
  // Traça um dos dois fios da trança. O deslocamento é na perpendicular da
  // corda e alterna de sinal ao longo dela (senoide), então os dois fios se
  // cruzam: é isso que dá a leitura de corda trançada e não de fio de arame.
  function cipoFio(ctx, o, cam, sinal) {
    ctx.beginPath();
    for (var i = 0; i <= CIPO_SEGS; i++) {
      var pt = o.pts[i];
      var a = o.pts[i > 0 ? i - 1 : 0];
      var b = o.pts[i < CIPO_SEGS ? i + 1 : CIPO_SEGS];
      var tx = b.x - a.x, ty = b.y - a.y;
      var l = Math.sqrt(tx * tx + ty * ty) || 1;
      var off = sinal * 3.2 * Math.sin((i / CIPO_SEGS) * o.twist * Math.PI);
      var x = pt.x - cam.x + (-ty / l) * off;
      var y = pt.y - cam.y + (tx / l) * off;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  function drawCipoFundo(ctx, o, cam, t) {
    var bx = Math.min(o.x1, o.x2) - 24, by = Math.min(o.y1, o.y2) - 24;
    var bw = Math.abs(o.x2 - o.x1) + 48;
    var bh = Math.abs(o.y2 - o.y1) + o.sag + CIPO_DIP + 60;
    if (!visible(cam, bx, by, bw, bh)) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // alma da corda: um traço grosso e escuro por baixo dos dois fios, para a
    // trança não ficar vazada contra o fundo
    ctx.beginPath();
    for (var i = 0; i <= CIPO_SEGS; i++) {
      var pt = o.pts[i];
      if (i === 0) ctx.moveTo(pt.x - cam.x, pt.y - cam.y);
      else ctx.lineTo(pt.x - cam.x, pt.y - cam.y);
    }
    ctx.strokeStyle = '#3a2a12';
    ctx.lineWidth = 7;
    ctx.stroke();

    // os dois fios
    cipoFio(ctx, o, cam, 1);
    ctx.strokeStyle = '#9c7a3a';
    ctx.lineWidth = 4;
    ctx.stroke();
    cipoFio(ctx, o, cam, -1);
    ctx.strokeStyle = '#77592a';
    ctx.lineWidth = 4;
    ctx.stroke();

    // luz por cima do fio de fora (a corda é roliça)
    cipoFio(ctx, o, cam, 1);
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#d8b46a';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // nós a cada 4 segmentos: marcam o passo e dão onde "olhar" para agarrar
    ctx.fillStyle = '#5d4520';
    for (var k = 4; k < CIPO_SEGS; k += 4) {
      var n = o.pts[k];
      var na = o.pts[k - 1], nb = o.pts[k + 1];
      var ang = Math.atan2(nb.y - na.y, nb.x - na.x);
      ctx.save();
      ctx.translate(n.x - cam.x, n.y - cam.y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.6, 5.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(216,180,106,0.5)';
      ctx.beginPath();
      ctx.ellipse(-1, -1.4, 2.4, 2.6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5d4520';
      ctx.restore();
    }

    // pinos das duas pontas
    drawPino(ctx, o.x1 - cam.x, o.y1 - cam.y);
    drawPino(ctx, o.x2 - cam.x, o.y2 - cam.y);

    // faísca no ponto onde ele está agarrado (leitura de que a corda o segura)
    if (o.held) {
      ctx.globalAlpha = 0.5 + 0.25 * Math.sin(t * 9);
      ctx.fillStyle = '#ffd88a';
      ctx.beginPath();
      ctx.arc(o.hangInfo.x - cam.x, o.hangInfo.y - cam.y, 6, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawPino(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    // chapa de madeira presa no poste
    ctx.fillStyle = '#4a3a20';
    ctx.fillRect(-7, -11, 14, 22);
    ctx.fillStyle = 'rgba(230,200,140,0.25)';
    ctx.fillRect(-7, -11, 14, 3);
    // argola de metal
    ctx.save();
    ctx.scale(9, 9);
    ctx.fillStyle = grad.pino;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#1d2026';
    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#e6eeff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 6.4, Math.PI * 1.05, Math.PI * 1.65);
    ctx.stroke();
    ctx.restore();
  }

  // --- disco ---------------------------------------------------------
  function drawDisco(ctx, o, cam, t) {
    var r = o.rect;
    if (!visible(cam, r.x - 24, r.y - 24, r.w + 48, r.h + 70)) return;
    var cx = r.x + r.w / 2 - cam.x;
    var cy = r.y + r.h / 2 - cam.y;
    var rx = r.w / 2, ry = r.h / 2 + 4;   // elipse achatada, um pouco mais alta

    ctx.save();
    ctx.translate(cx, cy);

    // glow derramado por baixo — é o que faz o disco parecer feito de lava
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 + 0.15 * Math.sin(t * 1.9 + o.phase);
    ctx.translate(0, ry * 0.8);
    ctx.scale(rx * 1.3, ry * 3.2);
    ctx.fillStyle = grad.discoGlow;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    ctx.restore();

    // corpo: crosta escura em cima virando âmbar incandescente embaixo
    ctx.save();
    ctx.scale(rx, ry);
    ctx.fillStyle = grad.discoCrosta;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    ctx.restore();

    // borda quente
    ctx.save();
    ctx.scale(rx, ry);
    ctx.strokeStyle = grad.discoBorda;
    ctx.lineWidth = 1 / Math.max(rx, ry) * 3;
    ctx.beginPath();
    ctx.arc(0, 0, 0.97, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // tampo de crosta escura (a superfície onde se pisa)
    ctx.fillStyle = '#241a12';
    ctx.beginPath();
    ctx.ellipse(0, -ry * 0.28, rx * 0.9, ry * 0.6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,102,84,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, -ry * 0.34, rx * 0.86, ry * 0.5, 0, 0, TAU);
    ctx.fill();

    // gretas acesas na crosta, respirando
    ctx.lineCap = 'round';
    for (var i = 0; i < o.veios.length; i++) {
      var v = o.veios[i];
      var pulse = 0.45 + 0.4 * Math.sin(t * 2.4 + v.ph);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#ffb44a';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(v.fx * rx, (v.fy - 0.1) * ry);
      ctx.lineTo((v.fx + v.len) * rx, (v.fy + 0.22) * ry);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // --- tronco --------------------------------------------------------
  function drawTronco(ctx, o, cam, t) {
    var r = o.rect;
    if (!visible(cam, r.x - 16, r.y - 16, r.w + 32, r.h + 40)) return;
    var sx = r.x - cam.x, sy = r.y - cam.y;
    var h = o.h, cap = 9;

    ctx.save();
    ctx.translate(sx, sy);

    // corpo roliço: retângulo com as duas pontas arredondadas
    ctx.fillStyle = grad.casca;
    ctx.beginPath();
    ctx.moveTo(cap, 0);
    ctx.lineTo(o.w - cap, 0);
    ctx.ellipse(o.w - cap, h / 2, cap, h / 2, 0, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(cap, h);
    ctx.ellipse(cap, h / 2, cap, h / 2, 0, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
    ctx.fill();

    // estrias da casca
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#1c1409';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (var i = 0; i < o.nos.length; i++) {
      var n = o.nos[i];
      ctx.moveTo(n.x - 10, n.y);
      ctx.lineTo(n.x + 10, n.y + 1.5);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // nós da madeira
    ctx.fillStyle = '#33240f';
    for (var k = 0; k < o.nos.length; k++) {
      var no = o.nos[k];
      ctx.beginPath();
      ctx.ellipse(no.x, no.y, no.r * 1.4, no.r, 0, 0, TAU);
      ctx.fill();
    }

    // limo no topo (é o que diz "escorregadio, não confie")
    ctx.fillStyle = grad.limo;
    ctx.beginPath();
    ctx.moveTo(cap * 0.4, 1);
    ctx.lineTo(o.w - cap * 0.4, 1);
    ctx.lineTo(o.w - cap * 0.4, 5);
    ctx.quadraticCurveTo(o.w / 2, 8.5, cap * 0.4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8fc23a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (var j = 0; j < o.limos.length; j++) {
      var lm = o.limos[j];
      var sway = Math.sin(t * 1.8 + lm.x * 0.1) * 1.2 + lm.lean;
      ctx.moveTo(lm.x, 2);
      ctx.quadraticCurveTo(lm.x + sway, -lm.h * 0.5, lm.x + sway * 1.6, -lm.h);
    }
    ctx.stroke();

    // face do tronco na ponta direita: anéis de crescimento
    ctx.save();
    ctx.translate(o.w - cap * 0.6, h / 2);
    ctx.fillStyle = '#6b5228';
    ctx.beginPath();
    ctx.ellipse(0, 0, cap * 0.62, h / 2 - 1, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,28,12,0.6)';
    ctx.lineWidth = 1;
    for (var a = 1; a <= 2; a++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, cap * 0.62 * (a / 3), (h / 2 - 1) * (a / 3), 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // linha do lodo: quanto mais afundado, mais escura a barriga
    if (o.sink > 0) {
      ctx.globalAlpha = Math.min(0.55, o.sink / TRONCO_MAX * 0.55);
      ctx.fillStyle = '#25330f';
      ctx.fillRect(0, h * 0.55, o.w, h * 0.45 + 3);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // --- brasa ---------------------------------------------------------
  function drawBrasaFundo(ctx, o, cam, t) {
    if (!visible(cam, o.x, o.y - 30, o.w, o.h + 60)) return;
    var sx = o.x - cam.x, sy = o.y - cam.y;

    // Telegraph: as manchas acendem no chão ANTES de cair qualquer coisa. É o
    // aviso que torna a rajada justa.
    var aviso = o.fase === 'aviso' ? o.ct / BRASA_TELE : (o.fase === 'rajada' ? 1 : 0);
    if (aviso <= 0) return;

    ctx.save();
    ctx.translate(sx, sy);
    for (var i = 0; i < o.colunas.length; i++) {
      var c = o.colunas[i];
      var pulse = 0.55 + 0.45 * Math.sin(t * 12 + c.ph);
      ctx.save();
      ctx.globalAlpha = aviso * (o.fase === 'rajada' ? 0.4 : pulse);
      ctx.translate(c.fx * o.w, o.h - 2);
      ctx.scale(c.r * (0.7 + 0.5 * aviso), c.r * 0.4);
      ctx.fillStyle = grad.brasaAviso;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // clarão no alto da zona, de onde a brasa vai despencar
    ctx.globalAlpha = aviso * 0.30;
    ctx.fillStyle = 'rgba(255,120,30,0.8)';
    ctx.fillRect(0, -6, o.w, 8);
    ctx.restore();
  }

  function drawBrasaFrente(ctx, o, cam, t) {
    if (!visible(cam, o.x - 20, o.y - 40, o.w + 40, o.h + 60)) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < BRASA_MAX; i++) {
      var e = o.pool[i];
      if (!e.active) continue;
      var ex = e.x - cam.x, ey = e.y - cam.y;
      if (ex < -40 || ex > VIEW_W + 40 || ey < -40 || ey > VIEW_H + 40) continue;
      // rastro: a brasa risca o ar por onde veio
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#ff9a30';
      ctx.lineWidth = e.r * 0.8;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - e.vx * 0.03, ey - e.vy * 0.045);
      ctx.stroke();
      // miolo quente
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.scale(e.r * 2.4, e.r * 2.4);
      ctx.fillStyle = grad.brasaMiolo;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // ==================================================================
  // API pública — FG.obstacles
  // ==================================================================
  var list = [];      // todos os obstáculos vivos
  var movers = [];    // só o que está SÓLIDO agora (o engine injeta em solids)

  var obstacles = {
    list: list,
    movers: movers,

    // Repovoa tudo a partir de FG.level.obstacleDefs. Seguro de chamar
    // várias vezes e com a lista vazia ou ausente (o level pode ainda não
    // ter o campo).
    reset: function () {
      list.length = 0;
      movers.length = 0;
      for (var i = 0; i < MAXP; i++) particles[i].active = false;
      pNext = 0;
      // As cordas antigas morrem aqui; se o player ficasse pendurado numa
      // delas, o update dele continuaria desligado para sempre e ninguém o
      // soltaria. Repovoar é sempre soltar.
      if (FG.player) FG.player.hang = null;

      var lvl = FG.level;
      var defs = (lvl && lvl.obstacleDefs) || [];
      for (var k = 0; k < defs.length; k++) {
        var d = defs[k];
        if (!d) continue;
        if (d.type === 'plataforma') list.push(makePlataforma(d));
        else if (d.type === 'desmorona') list.push(makeDesmorona(d));
        else if (d.type === 'sopro') list.push(makeSopro(d));
        else if (d.type === 'pendulo') list.push(makePendulo(d));
        else if (d.type === 'espinhorolo') list.push(makeEspinhorolo(d));
        else if (d.type === 'cipo') list.push(makeCipo(d));
        else if (d.type === 'disco') list.push(makeDisco(d));
        else if (d.type === 'tronco') list.push(makeTronco(d));
        else if (d.type === 'brasa') list.push(makeBrasa(d));
      }
    },

    update: function (dt) {
      if (!FG.engine || !FG.player) return;
      var t = FG.engine.time;
      var p = FG.player;

      // `movers` é reconstruído por frame reaproveitando os MESMOS retângulos
      // (length=0 + push de objetos já existentes: zero alocação).
      movers.length = 0;

      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o.type === 'plataforma') {
          updatePlataforma(o, dt, p, t);
          movers.push(o.rect);
        } else if (o.type === 'desmorona') {
          updateDesmorona(o, dt, p);
          // sólida enquanto viva e ainda não caída
          if (o.state === 'firme' || o.state === 'tremendo' || o.state === 'voltando') {
            movers.push(o.rect);
          }
        } else if (o.type === 'sopro') {
          updateSopro(o, dt, p, t);
        } else if (o.type === 'pendulo') {
          updatePendulo(o, dt, p, t);
          for (var k = 0; k < o.links.length; k++) movers.push(o.links[k]);
        } else if (o.type === 'espinhorolo') {
          updateEspinhorolo(o, dt, p);
        } else if (o.type === 'cipo') {
          updateCipo(o, dt, p, t);   // não é sólido: nada em movers
        } else if (o.type === 'disco') {
          updateDisco(o, dt, p, t);
          movers.push(o.rect);
        } else if (o.type === 'tronco') {
          updateTronco(o, dt, p);
          movers.push(o.rect);
        } else if (o.type === 'brasa') {
          updateBrasa(o, dt, p, t);
        }
      }

      updateParticles(dt);
    },

    // Camada de trás: o que o player pisa ou atravessa fica atrás dele.
    drawBehind: function (ctx, cam) {
      if (!FG.engine) return;
      buildGrads(ctx);
      var t = FG.engine.time;
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o.type === 'plataforma') drawPlataforma(ctx, o, cam, t);
        else if (o.type === 'desmorona') drawDesmorona(ctx, o, cam, t);
        else if (o.type === 'sopro') drawSoproFundo(ctx, o, cam, t);
        else if (o.type === 'pendulo') drawPenduloFundo(ctx, o, cam, t);
        else if (o.type === 'espinhorolo') drawTrilho(ctx, o, cam);
        else if (o.type === 'cipo') drawCipoFundo(ctx, o, cam, t);
        else if (o.type === 'disco') drawDisco(ctx, o, cam, t);
        else if (o.type === 'tronco') drawTronco(ctx, o, cam, t);
        else if (o.type === 'brasa') drawBrasaFundo(ctx, o, cam, t);
      }
    },

    // Camada da frente: o que machuca passa POR CIMA do player.
    drawFront: function (ctx, cam) {
      if (!FG.engine) return;
      buildGrads(ctx);
      var t = FG.engine.time;
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o.type === 'sopro') drawSoproFrente(ctx, o, cam, t);
        else if (o.type === 'pendulo') drawPenduloFrente(ctx, o, cam, t);
        else if (o.type === 'espinhorolo') drawEspinhorolo(ctx, o, cam, t);
        else if (o.type === 'brasa') drawBrasaFrente(ctx, o, cam, t);
      }
      drawParticles(ctx, cam);
    },
  };

  FG.obstacles = obstacles;
})();
