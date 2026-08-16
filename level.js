// Fagulho: Lendas do Bosque — level.js
// Fase 0, 'bosque': geometria do mundo, lumis, checkpoints, inimigos e
// obstáculos (defs) e todo o visual pintado do bosque crepuscular.
// Registra-se em FG.levels; quem escolhe a fase corrente é o engine.
// Nada aqui referencia FG.player/FG.engine/FG.audio no load — só em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  // Único acoplamento de load permitido no projeto: kit → fase. O index.html
  // carrega levelkit.js antes dos level*.js, então FG.levelkit já existe — e
  // precisa existir, porque a geometria abaixo é construída no load.
  var kit = FG.levelkit;
  var S = kit.S, makeRand = kit.makeRand, makeCanvas = kit.makeCanvas;

  var VIEW_W = kit.VIEW_W, VIEW_H = kit.VIEW_H;
  var W = 7200, H = 720;
  var CAM_Y_MAX = H - VIEW_H; // 180 — usado no parallax vertical

  // ---------------------------------------------------------------
  // GEOMETRIA — sólidos
  // k: 'g' = terra/musgo, 'r' = pedra, 'c' = penhasco (parede de rocha
  //    empilhada, escalável), 'i' = ilha flutuante, 'h' = piso oculto
  //    (fundo das poças venenosas, não é desenhado).
  //
  // RITMO EM 6 TRECHOS
  //  (1) x 0..1180    tutorial plano, degraus suaves, sem perigo
  //  (2) x 1180..2450 mesas em vários níveis + saliências estreitas
  //  (3) x 2450..3700 gorge, maciço de pedra com arco de caverna na base e a
  //                   CHAMINÉ ESCALÁVEL (fenda de 70px em 3100..3170, 400px
  //                   de parede vertical) até o platô superior
  //  (4) x 3700..5060 travessia de ilhas flutuantes sobre o abismo; quem cai
  //                   vai parar no pântano e volta pela SEGUNDA CHAMINÉ, a
  //                   fenda de 80px entre a agulha de pedra e o desfiladeiro
  //  (5) x 5060..5420 DESFILADEIRO: duas paredes frente a frente, descida
  //                   controlada agarrando (fenda de 140px, 390px de queda)
  //  (6) x 5420..7200 reta final e a clareira plana do dragão-chefe
  //
  // As duas escaladas: a chaminé do gorge (única saída de lá, 400px) e a
  // fenda do pântano (415px, única saída de quem cai do arquipélago).
  // Nada de beco sem saída: de todo lugar onde se cai dá para voltar.
  //
  // Alturas: pulo simples sobe ~118px, duplo ~236px, e uma parede vertical
  // contínua sobe indefinidamente agarrando (~120px por salto de parede).
  // ---------------------------------------------------------------
  var solids = [
    // ---- (1) tutorial — chão plano e degraus curtos, nada de perigo ----
    S(0, 620, 1180, 100, 'g'),        // [0] chão inicial
    S(250, 588, 90, 32, 'r'),         // [1] +32
    S(420, 552, 110, 68, 'r'),        // [2] +36
    S(620, 508, 130, 26, 'g'),        // [3] +44
    S(810, 448, 120, 24, 'g'),        // [4] +60
    S(980, 396, 110, 22, 'g'),        // [5] +52
    S(1070, 300, 100, 20, 'g'),       // [6] bônus alto (+96)

    // ---- fosso A: poça venenosa com piso oculto no fundo ----
    S(1180, 724, 170, 40, 'h'),       // [7]

    // ---- (2) mesas de alturas variadas e saliências estreitas ----
    S(1350, 620, 300, 100, 'g'),      // [8] mesa base (checkpoint 1)
    S(1650, 556, 250, 164, 'g'),      // [9] mesa média (+64)
    S(1960, 500, 90, 20, 'r'),        // [10] saliência estreita (+56)
    S(2110, 452, 90, 20, 'r'),        // [11] saliência estreita (+48)
    S(2250, 496, 200, 224, 'g'),      // [12] mesa alta, desce para o gorge

    // ---- (3) gorge + maciço de pedra com a CHAMINÉ ESCALÁVEL ----
    // O chão do gorge passa por baixo do arco do pilar (70px) e morre dentro
    // da fenda de 70px entre o pilar e o penhasco. Dali só se sai por cima:
    // agarrar, saltar de face em face e ganhar ~120px a cada salto, de 620
    // até 220 — 400px de parede vertical contínua.
    S(2450, 620, 720, 100, 'g'),      // [13] chão do gorge 2450..3170
    S(3020, 250, 80, 300, 'c'),       // [14] pilar (arco de 70px por baixo)
    S(3170, 220, 130, 500, 'c'),      // [15] penhasco (face esquerda = chaminé)
    S(3300, 220, 400, 500, 'c'),      // [16] maciço/platô superior (checkpoint 2)

    // ---- (4) ilhas flutuantes de pedra sobre o abismo ----
    S(3700, 620, 1280, 100, 'g'),     // [17] fundo do abismo (pântano) 3700..4980
    S(3890, 290, 150, 110, 'i'),      // [18] ilha 1
    S(4330, 350, 130, 110, 'i'),      // [19] ilha 2
    S(4640, 130, 110, 50, 'i'),       // [20] ilha-mirante (o sopro abre o caminho)
    S(4740, 300, 140, 110, 'i'),      // [21] ilha 3

    // ---- (5) desfiladeiro: duas paredes frente a frente, fenda de 140px ----
    // Quem cai no pântano volta escalando a parede esquerda (390px, do chão
    // ao topo); quem vem das ilhas desce a fenda agarrado, controlando a queda.
    S(4900, 250, 80, 300, 'c'),       // [22] agulha de pedra (arco de 70px por baixo)
    S(4980, 620, 80, 100, 'g'),       // [23] chão da fenda do pântano 4980..5060
    S(5060, 205, 90, 515, 'c'),       // [24] parede esquerda (do chão ao topo, 515px)
    S(5150, 620, 760, 100, 'g'),      // [25] fundo do desfiladeiro + reta final
    S(5290, 210, 130, 340, 'c'),      // [26] parede direita (arco de 70px, crista de espinhos)

    // ---- (6) reta final e clareira do dragão-chefe ----
    S(5560, 530, 130, 26, 'g'),       // [27] passa por cima dos espinhos
    S(5750, 480, 110, 22, 'g'),       // [28] bônus
    S(5910, 724, 120, 40, 'h'),       // [29] piso oculto da poça pré-clareira
    S(6030, 620, 1170, 100, 'g'),     // [30] clareira plana do chefão
  ];

  // ---------------------------------------------------------------
  // HAZARDS — t: 's' = espinhos, 'p' = poça venenosa
  // ---------------------------------------------------------------
  function Hz(x, y, w, h, t) { return { x: x, y: y, w: w, h: h, t: t }; }

  var hazards = [
    Hz(1180, 698, 170, 26, 'p'),   // poça do fosso A
    Hz(1780, 532, 100, 24, 's'),   // espinhos na mesa média
    Hz(2280, 472, 90, 24, 's'),    // espinhos na mesa alta
    Hz(2820, 596, 110, 24, 's'),   // espinhos no fundo do gorge
    Hz(3760, 596, 1120, 26, 'p'),  // pântano no fundo do abismo: cair custa caro
    Hz(5200, 596, 90, 24, 's'),    // fundo do desfiladeiro (metade direita)
    Hz(5290, 186, 130, 24, 's'),   // crista da parede direita: não dá para cortar caminho
    Hz(5620, 596, 120, 24, 's'),   // reta final
    Hz(5910, 698, 120, 26, 'p'),   // poça pré-clareira
  ];

  // 3 lanternas-checkpoint (acendem quando ativadas)
  var checkpoints = [
    { x: 1470, y: 620 },   // mesa base do trecho 2
    { x: 3340, y: 220 },   // platô superior — prêmio de escalar a chaminé
    { x: 5440, y: 620 },   // saída do desfiladeiro, já na reta final
  ];

  // ---------------------------------------------------------------
  // INIMIGOS — nenhum antes de x=900 (tutorial limpo)
  // ---------------------------------------------------------------
  var enemyDefs = [
    { type: 'voadeira',  x: 1255, y: 520, range: 120 },
    { type: 'espinhoco', x: 1450, y: 590, range: 100 },
    { type: 'sapeca',    x: 1720, y: 520, range: 70 },
    { type: 'voadeira',  x: 2050, y: 390, range: 140 },
    { type: 'espinhoco', x: 2380, y: 462, range: 80 },
    { type: 'sapeca',    x: 2650, y: 584, range: 90 },   // chão do gorge
    { type: 'voadeira',  x: 3600, y: 140, range: 130 },  // sobre o platô
    { type: 'voadeira',  x: 3960, y: 230, range: 150 },  // ilhas
    { type: 'voadeira',  x: 4400, y: 270, range: 170 },
    { type: 'espinhoco', x: 4790, y: 270, range: 90 },   // ilha 3
    { type: 'voadeira',  x: 5150, y: 400, range: 110 },  // dentro do desfiladeiro
    { type: 'espinhoco', x: 5500, y: 590, range: 50 },
    { type: 'sapeca',    x: 6120, y: 584, range: 60 },
  ];

  // ---------------------------------------------------------------
  // OBSTÁCULOS DINÂMICOS (FG.obstacles lê daqui) — nenhum antes de x=900
  // Convenções de coordenada usadas aqui:
  //   plataforma  {x,y,w,dx,dy,period,phase} — (x,y) = canto superior
  //               esquerdo no repouso; vai até (x+dx, y+dy) e volta.
  //   desmorona   {x,y,w} — (x,y) = canto superior esquerdo da saliência.
  //   sopro       {x,y,w,h} — retângulo da coluna de ar (y = topo).
  //   pendulo     {x,y,len,arc,period} — (x,y) = ponto de fixação da corrente.
  //   espinhorolo {x,y,w,range,speed} — y = TOPO do rolo (a base fica em y+w).
  // ---------------------------------------------------------------
  var obstacleDefs = [
    // (2) mesas: rolo curto, saliência que cai, coluna sobre o vão e a bola
    { type: 'espinhorolo', x: 1670, y: 512, w: 44, range: 90, speed: 110 },
    { type: 'desmorona',   x: 1870, y: 512, w: 80 },
    { type: 'sopro',       x: 2054, y: 392, w: 52, h: 130 },
    { type: 'pendulo',     x: 2350, y: 290, len: 175, arc: 0.9, period: 2.6 },

    // (3) gorge: rolo no corredor, coluna quente que faz flutuar por cima do
    // espinheiro e a bola de ferro no vão antes da chaminé.
    // NADA de sopro dentro da chaminé: a subida ali é agarrando, e só.
    { type: 'espinhorolo', x: 2700, y: 576, w: 44, range: 260, speed: 140 },
    { type: 'sopro',       x: 2800, y: 452, w: 130, h: 144 },
    { type: 'pendulo',     x: 2900, y: 250, len: 230, arc: 0.85, period: 3.0 },

    // (4) platô e ilhas: rolo de espinhos no corredor do platô, degrau que cai
    // ao sair dele, plataforma móvel entre as ilhas 1 e 2, bola sobre o vazio
    // e a coluna que abre a ilha-mirante
    { type: 'espinhorolo', x: 3420, y: 176, w: 44, range: 240, speed: 150 },
    { type: 'desmorona',   x: 3730, y: 250, w: 110 },
    { type: 'plataforma',  x: 4080, y: 330, w: 110, dx: 170, dy: -30, period: 4.2, phase: 0 },
    { type: 'pendulo',     x: 4530, y: 190, len: 165, arc: 0.7, period: 2.8 },
    { type: 'sopro',       x: 4560, y: 180, w: 80, h: 230 },
    { type: 'desmorona',   x: 4650, y: 240, w: 90 },

    // (5) desfiladeiro: elevador na fenda, para quem não quiser descer agarrado
    { type: 'plataforma',  x: 5170, y: 300, w: 100, dx: 0, dy: 240, period: 4.4, phase: 0 },

    // (6) reta final: a bola varre a saliência que cai sobre a poça
    { type: 'pendulo',     x: 5970, y: 430, len: 140, arc: 0.8, period: 2.4 },
    { type: 'desmorona',   x: 5930, y: 600, w: 110 },
  ];

  // ---------------------------------------------------------------
  // LUMIS — linhas, arcos e COLUNAS (as colunas ensinam a escalar)
  // ---------------------------------------------------------------
  // Os construtores vivem no kit; aqui ficam só os atalhos que amarram o
  // array desta fase e preservam a ordem de argumento usada no traçado abaixo.
  var lumis = [];
  function lumiLine(x, y, n, dx) { kit.lumiLine(lumis, x, y, n, dx); }
  function lumiCol(x, y, n, dy) { kit.lumiCol(lumis, x, y, n, dy); }
  function lumiArc(cx, apexY, n, span, sag) { kit.lumiArc(lumis, cx, apexY, span, sag, n); }
  // (1) tutorial
  lumiLine(150, 578, 4, 62);
  lumiArc(555, 460, 5, 180, 30);
  lumiLine(830, 404, 3, 34);
  lumiLine(1000, 352, 3, 34);
  lumiLine(1085, 256, 2, 36);
  // (2) mesas e saliências
  lumiArc(1265, 540, 4, 150, 46);
  lumiLine(1690, 512, 3, 44);
  lumiArc(1900, 452, 3, 110, 32);
  lumiArc(2080, 408, 3, 120, 36);
  lumiCol(2082, 470, 3, -46);          // dentro da coluna de ar do vão
  lumiLine(2300, 452, 3, 44);          // sobre a mesa alta
  // (3) gorge e chaminé escalável
  lumiArc(2530, 552, 3, 120, 34);
  lumiArc(2640, 540, 3, 130, 38);
  lumiArc(2900, 552, 3, 140, 38);
  lumiCol(3135, 496, 6, -52);          // CHAMINÉ: a escada de lumis ensina a subir agarrado
  lumiLine(3350, 160, 4, 62);          // platô (por cima do rolo de espinhos)
  // (4) ilhas
  lumiArc(3800, 236, 3, 140, 38);
  lumiArc(4180, 296, 4, 200, 46);
  lumiArc(4600, 262, 3, 180, 42);
  lumiCol(4600, 350, 4, -50);          // coluna que abre a ilha-mirante
  lumiLine(4670, 88, 2, 44);
  lumiLine(4780, 258, 3, 42);
  // (5) desfiladeiro
  lumiCol(5020, 556, 4, -62);          // FENDA DO PÂNTANO: a segunda escalada
  lumiCol(5215, 270, 5, 56);           // descida do desfiladeiro: colar e escorregar
  lumiLine(5185, 200, 2, 50);
  lumiArc(5220, 556, 3, 100, 34);
  // (6) reta final e clareira
  lumiLine(5460, 578, 3, 52);
  lumiLine(5590, 488, 3, 42);
  lumiLine(5780, 438, 2, 40);
  lumiArc(5970, 546, 4, 140, 42);
  lumiLine(6090, 570, 2, 60);

  // FAÍSCAS — brilho de despedida da lumi coletada (pool fixo do kit, sem GC)
  var sparks = kit.makeSparks(64);

  // ---------------------------------------------------------------
  // DECORAÇÃO por sólido (pré-computada: nada de random por frame).
  // Penhascos ('c') e ilhas ('i') não guardam dados: eles viram um
  // offscreen inteiro no primeiro draw (custo zero por frame).
  // ---------------------------------------------------------------
  var decor = [];
  (function () {
    var r = makeRand(20260815);
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      var d = { tufts: [], spots: [], spr: null, ox: 0, oy: 0 };
      if (s.k === 'g') {
        var nt = Math.max(3, Math.floor(s.w / 55));
        for (var j = 0; j < nt; j++) {
          d.tufts.push({ dx: r() * s.w, len: 7 + r() * 9, lean: r() * 2 - 1 });
        }
        if (s.h > 34) {
          var ns = 1 + Math.floor(s.w / 120);
          for (var j2 = 0; j2 < ns; j2++) {
            d.spots.push({ dx: 12 + r() * (s.w - 24), dy: 24 + r() * (s.h - 34), rad: 4 + r() * 7 });
          }
        }
      } else if (s.k === 'r') {
        d.spots.push({ dx: s.w * 0.3, dy: s.h * 0.4, rad: 3 });
        d.spots.push({ dx: s.w * 0.65, dy: s.h * 0.6, rad: 2.5 });
      }
      decor.push(d);
    }
  })();

  // ---------------------------------------------------------------
  // OFFSCREENS — céu, sol, camadas de parallax, névoa, vinheta, lumi
  // e um sprite por penhasco/ilha. Construídos uma única vez.
  // ---------------------------------------------------------------
  var built = false;
  var skySpr, sunSpr, raysL, farL, midL, mistL, nearL, frontL, vig, lumiSpr;
  var LAYER_H = 680;
  var ROCK_PAD = 16;        // folga para o musgo/capim transbordar a rocha
  var ISLE_TIP = 76;        // ponta de pedra pendurada sob a ilha

  function buildAll() {
    if (built) return;
    built = true;

    // céu crepúsculo: roxo profundo → âmbar dourado, com estrelas tímidas
    skySpr = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, '#241048');
      gr.addColorStop(0.35, '#5c2260');
      gr.addColorStop(0.68, '#b2543f');
      gr.addColorStop(0.88, '#e8933f');
      gr.addColorStop(1, '#f0ad55');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      var r = makeRand(11);
      g.fillStyle = 'rgba(255,240,220,0.7)';
      for (var i = 0; i < 40; i++) {
        var sx = r() * VIEW_W, sy = r() * 200, sr = 0.5 + r() * 1.1;
        g.globalAlpha = 0.15 + r() * 0.5;
        g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    })(skySpr.getContext('2d'));

    // sol difuso do entardecer
    sunSpr = makeCanvas(280, 280);
    (function (g) {
      var gr = g.createRadialGradient(140, 140, 8, 140, 140, 140);
      gr.addColorStop(0, 'rgba(255,240,200,0.95)');
      gr.addColorStop(0.18, 'rgba(255,205,130,0.8)');
      gr.addColorStop(0.5, 'rgba(255,150,70,0.28)');
      gr.addColorStop(1, 'rgba(255,130,60,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 280, 280);
    })(sunSpr.getContext('2d'));

    // raios de luz diagonais (translúcidos), repetem a cada 1200px
    raysL = makeCanvas(1200, LAYER_H);
    (function (g) {
      var r = makeRand(31);
      for (var i = 0; i < 3; i++) {
        var bx = 120 + i * 400 + r() * 120, bw = 60 + r() * 60, lean = 170 + r() * 60;
        var gr = g.createLinearGradient(0, 0, 0, LAYER_H);
        gr.addColorStop(0, 'rgba(255,210,130,0.16)');
        gr.addColorStop(0.7, 'rgba(255,180,100,0.05)');
        gr.addColorStop(1, 'rgba(255,180,100,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(bx, 0);
        g.lineTo(bx + bw, 0);
        g.lineTo(bx + bw - lean, LAYER_H);
        g.lineTo(bx - lean, LAYER_H);
        g.closePath();
        g.fill();
      }
    })(raysL.getContext('2d'));

    farL = makeCanvas(2400, LAYER_H); paintFar(farL.getContext('2d'));
    midL = makeCanvas(2400, LAYER_H); paintMid(midL.getContext('2d'));
    mistL = makeCanvas(1600, LAYER_H); paintMist(mistL.getContext('2d'));
    nearL = makeCanvas(2400, LAYER_H); paintNear(nearL.getContext('2d'));
    frontL = makeCanvas(1800, LAYER_H); paintFront(frontL.getContext('2d'));

    // vinheta sutil
    vig = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 240, VIEW_W / 2, VIEW_H / 2, 640);
      gr.addColorStop(0, 'rgba(12,4,24,0)');
      gr.addColorStop(1, 'rgba(12,4,24,0.5)');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    })(vig.getContext('2d'));

    // sprite da lumi (halo dourado + núcleo) — igual nas três fases
    lumiSpr = kit.makeLumiSprite();

    // um offscreen por penhasco e por ilha (desenho caro, feito uma vez)
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i], c;
      if (s.k === 'c') {
        c = makeCanvas(s.w + ROCK_PAD * 2, s.h + ROCK_PAD * 2);
        paintCliff(c.getContext('2d'), s.w, s.h, 9001 + i * 137);
        decor[i].spr = c; decor[i].ox = -ROCK_PAD; decor[i].oy = -ROCK_PAD;
      } else if (s.k === 'i') {
        c = makeCanvas(s.w + ROCK_PAD * 2, s.h + ROCK_PAD + ISLE_TIP);
        paintIsland(c.getContext('2d'), s.w, s.h, 4201 + i * 211);
        decor[i].spr = c; decor[i].ox = -ROCK_PAD; decor[i].oy = -ROCK_PAD;
      }
    }
  }

  // ---------------------------------------------------------------
  // PENHASCO — rocha empilhada em camadas, bocas de caverna escuras ao
  // fundo, face direita na sombra e topo com musgo claro (como nos prints).
  // ---------------------------------------------------------------
  function paintCliff(g, w, h, seed) {
    var r = makeRand(seed);
    var P = ROCK_PAD;

    g.save();
    g.beginPath(); g.rect(P, P, w, h); g.clip();

    // corpo em gradiente crepúsculo
    var gr = g.createLinearGradient(0, P, 0, P + h);
    gr.addColorStop(0, '#6d5568');
    gr.addColorStop(0.4, '#4a3a50');
    gr.addColorStop(1, '#231a2b');
    g.fillStyle = gr;
    g.fillRect(P, P, w, h);

    // bocas de caverna: manchas escuras ao fundo, antes das pedras
    if (w >= 100 && h >= 140) {
      var nc = 1 + Math.floor(r() * 2);
      for (var ci = 0; ci < nc; ci++) {
        var mx = P + 26 + r() * Math.max(1, w - 52);
        var my = P + h * (0.3 + r() * 0.45);
        var mw = 18 + r() * 26, mh = 24 + r() * 32;
        var mg = g.createRadialGradient(mx, my - mh * 0.2, 2, mx, my, mh);
        mg.addColorStop(0, 'rgba(5,2,10,0.95)');
        mg.addColorStop(0.6, 'rgba(13,7,20,0.78)');
        mg.addColorStop(1, 'rgba(20,12,30,0)');
        g.fillStyle = mg;
        g.beginPath();
        g.ellipse(mx, my, mw, mh, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    // camadas de pedras arredondadas empilhadas, de baixo para cima
    var band = 38 + r() * 12;
    var row = 0;
    for (var y = P + h; y > P - band; y -= band, row++) {
      var off = (row % 2) * band * 0.5;
      var tone = 0.10 + 0.09 * ((row % 3) / 2);
      for (var x = P - band + off; x < P + w + band; x += band * 0.9) {
        var rr = band * (0.5 + r() * 0.18);
        var px = x + rr, py = y - rr * 0.7;
        g.fillStyle = 'rgba(126,104,126,' + tone.toFixed(3) + ')';
        g.beginPath();
        g.ellipse(px, py, rr, rr * 0.72, 0, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(255,192,124,0.16)';   // aresta batida pelo sol
        g.beginPath();
        g.ellipse(px, py, rr - 1, rr * 0.72 - 1, 0, Math.PI * 1.05, Math.PI * 1.78);
        g.stroke();
        g.strokeStyle = 'rgba(9,4,15,0.34)';        // sombra por baixo
        g.beginPath();
        g.ellipse(px, py, rr - 1, rr * 0.72 - 1, 0, Math.PI * 0.14, Math.PI * 0.86);
        g.stroke();
      }
    }

    // rachaduras verticais: a parede pede para ser agarrada
    g.strokeStyle = 'rgba(12,6,18,0.35)';
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    var ncr = 1 + Math.floor(w / 70);
    for (var k = 0; k < ncr; k++) {
      var cx0 = P + 10 + r() * Math.max(1, w - 20);
      var cy0 = P + r() * h * 0.5, cl = 40 + r() * (h * 0.5);
      g.beginPath();
      g.moveTo(cx0, cy0);
      g.quadraticCurveTo(cx0 + (r() * 2 - 1) * 14, cy0 + cl * 0.5, cx0 + (r() * 2 - 1) * 20, cy0 + cl);
      g.stroke();
    }

    // luz na face esquerda, sombra na direita (o sol vem do alto-esquerda)
    var sg = g.createLinearGradient(P, 0, P + w, 0);
    sg.addColorStop(0, 'rgba(255,180,110,0.11)');
    sg.addColorStop(0.45, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(12,6,20,0.45)');
    g.fillStyle = sg;
    g.fillRect(P, P, w, h);

    // base afundando na sombra da caverna
    var bh = Math.min(110, h * 0.45);
    var bg = g.createLinearGradient(0, P + h - bh, 0, P + h);
    bg.addColorStop(0, 'rgba(10,5,18,0)');
    bg.addColorStop(1, 'rgba(10,5,18,0.62)');
    g.fillStyle = bg;
    g.fillRect(P, P + h - bh, w, bh);
    g.restore();

    // topo: musgo transbordando as bordas + fio claro de luz
    g.fillStyle = '#3f7a2e';
    g.fillRect(P - 3, P - 2, w + 6, 13);
    g.fillStyle = '#6fb84a';
    g.fillRect(P - 3, P - 2, w + 6, 7);
    g.fillStyle = 'rgba(255,238,196,0.6)';
    g.fillRect(P - 3, P - 3, w + 6, 3);
    // gotas de musgo escorrendo nas quinas
    g.fillStyle = '#3f7a2e';
    g.beginPath(); g.arc(P - 1, P + 16, 4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(P + w + 1, P + 19, 4.5, 0, Math.PI * 2); g.fill();
    // tufos de capim no topo
    g.strokeStyle = '#7cc850';
    g.lineWidth = 2;
    g.lineCap = 'round';
    var nt = Math.max(3, Math.floor(w / 44));
    for (var ti = 0; ti < nt; ti++) {
      var bx = P + r() * w, len = 7 + r() * 10, lean = r() * 2 - 1;
      g.beginPath();
      g.moveTo(bx, P);
      g.quadraticCurveTo(bx + lean * 4, P - len * 0.7, bx + lean * 8, P - len);
      g.stroke();
    }
  }

  // ---------------------------------------------------------------
  // ILHA FLUTUANTE — pedra com base pontuda e topo de grama
  // ---------------------------------------------------------------
  function paintIsland(g, w, h, seed) {
    var r = makeRand(seed);
    var P = ROCK_PAD;
    var tip = ISLE_TIP * (0.62 + r() * 0.34);
    var cx = P + w / 2;

    g.save();
    // silhueta: topo reto (é a superfície de colisão), laterais afunilando
    g.beginPath();
    g.moveTo(P, P);
    g.lineTo(P + w, P);
    g.lineTo(P + w - 5, P + h * 0.55);
    g.quadraticCurveTo(P + w * 0.8, P + h + tip * 0.32, cx + 7, P + h + tip);
    g.lineTo(cx - 7, P + h + tip);
    g.quadraticCurveTo(P + w * 0.2, P + h + tip * 0.32, P + 5, P + h * 0.55);
    g.closePath();
    g.save();
    g.clip();

    var gr = g.createLinearGradient(0, P, 0, P + h + tip);
    gr.addColorStop(0, '#6d5568');
    gr.addColorStop(0.42, '#463848');
    gr.addColorStop(1, '#1c1424');
    g.fillStyle = gr;
    g.fillRect(0, 0, P * 2 + w, P + h + tip + 8);

    // estratos horizontais de rocha
    for (var y = P + 16; y < P + h + tip; y += 20 + r() * 12) {
      g.strokeStyle = 'rgba(12,6,18,0.3)';
      g.lineWidth = 2 + r() * 2;
      g.beginPath();
      g.moveTo(P - 4, y);
      g.quadraticCurveTo(cx, y + (r() * 2 - 1) * 7, P + w + 4, y + (r() * 2 - 1) * 5);
      g.stroke();
      g.strokeStyle = 'rgba(255,186,120,0.10)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(P - 4, y - 3);
      g.quadraticCurveTo(cx, y - 3 + (r() * 2 - 1) * 7, P + w + 4, y - 3 + (r() * 2 - 1) * 5);
      g.stroke();
    }
    // pedras arredondadas soltas na barriga da ilha
    for (var b = 0; b < 4; b++) {
      var bx = P + 8 + r() * Math.max(1, w - 16), by = P + h * (0.3 + r() * 0.6), br = 8 + r() * 12;
      g.fillStyle = 'rgba(126,104,126,0.16)';
      g.beginPath(); g.ellipse(bx, by, br, br * 0.75, 0, 0, Math.PI * 2); g.fill();
    }
    // sombra na face direita
    var sg = g.createLinearGradient(P, 0, P + w, 0);
    sg.addColorStop(0, 'rgba(255,180,110,0.10)');
    sg.addColorStop(0.5, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(12,6,20,0.42)');
    g.fillStyle = sg;
    g.fillRect(P, P, w, h + tip);
    g.restore();
    g.restore();

    // topo com grama transbordando
    g.fillStyle = '#3f7a2e';
    g.fillRect(P - 4, P - 2, w + 8, 15);
    g.fillStyle = '#6fb84a';
    g.fillRect(P - 4, P - 2, w + 8, 8);
    g.fillStyle = 'rgba(255,238,196,0.55)';
    g.fillRect(P - 4, P - 3, w + 8, 3);
    // grama pendurada nas quinas
    g.fillStyle = '#3f7a2e';
    g.beginPath(); g.arc(P - 2, P + 18, 5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(P + w + 2, P + 21, 5.5, 0, Math.PI * 2); g.fill();
    // tufos e raízes penduradas
    g.strokeStyle = '#7cc850';
    g.lineWidth = 2;
    g.lineCap = 'round';
    var nt = Math.max(3, Math.floor(w / 40));
    for (var ti = 0; ti < nt; ti++) {
      var tx = P + r() * w, len = 8 + r() * 11, lean = r() * 2 - 1;
      g.beginPath();
      g.moveTo(tx, P);
      g.quadraticCurveTo(tx + lean * 4, P - len * 0.7, tx + lean * 8, P - len);
      g.stroke();
    }
    g.strokeStyle = 'rgba(74,120,58,0.7)';
    g.lineWidth = 1.8;
    for (var v = 0; v < 4; v++) {
      var vx = P + 8 + r() * Math.max(1, w - 16), vl = 18 + r() * 34;
      g.beginPath();
      g.moveTo(vx, P + 12);
      g.quadraticCurveTo(vx + (r() * 2 - 1) * 8, P + 12 + vl * 0.6, vx + (r() * 2 - 1) * 10, P + 12 + vl);
      g.stroke();
    }
  }

  // --- camada distante: penhascos em silhueta, morros e árvores retorcidas ---
  function paintFar(g) {
    var r = makeRand(101);
    var base = LAYER_H;

    // paredões de pedra ao fundo, com bocas de caverna escuras
    for (var c = 0; c < 5; c++) {
      var cw = 180 + r() * 190;
      var cx = c * 480 + r() * 120;
      var ch = 250 + r() * 170;
      var top = base - 40 - ch;
      g.fillStyle = 'rgba(58,30,78,0.8)';
      g.beginPath();
      g.moveTo(cx, base);
      g.lineTo(cx + 12, top + 26);
      g.quadraticCurveTo(cx + cw * 0.35, top - 14, cx + cw * 0.62, top + 10);
      g.quadraticCurveTo(cx + cw * 0.85, top + 24, cx + cw, top + 60);
      g.lineTo(cx + cw, base);
      g.closePath();
      g.fill();
      // camadas horizontais de rocha
      g.strokeStyle = 'rgba(30,14,44,0.55)';
      g.lineWidth = 3;
      for (var ly = top + 60; ly < base - 30; ly += 34 + r() * 22) {
        g.beginPath();
        g.moveTo(cx + 6, ly);
        g.quadraticCurveTo(cx + cw * 0.5, ly + (r() * 2 - 1) * 10, cx + cw - 6, ly + (r() * 2 - 1) * 8);
        g.stroke();
      }
      // boca de caverna
      var kx = cx + cw * (0.3 + r() * 0.4), ky = base - 60 - r() * 90;
      var kg = g.createRadialGradient(kx, ky, 3, kx, ky, 60);
      kg.addColorStop(0, 'rgba(6,2,12,0.9)');
      kg.addColorStop(0.6, 'rgba(12,5,20,0.6)');
      kg.addColorStop(1, 'rgba(12,5,20,0)');
      g.fillStyle = kg;
      g.beginPath();
      g.ellipse(kx, ky, 34, 46, 0, 0, Math.PI * 2);
      g.fill();
    }

    // dois cordões de morros por cima dos paredões
    g.fillStyle = 'rgba(52,26,74,0.85)';
    hillBand(g, r, base - 210, 90, 5);
    g.fillStyle = 'rgba(38,17,58,0.95)';
    hillBand(g, r, base - 130, 70, 6);

    // árvores retorcidas
    g.strokeStyle = '#221034';
    g.fillStyle = '#221034';
    for (var i = 0; i < 11; i++) {
      var tx = 60 + i * 215 + r() * 90;
      var th = 150 + r() * 130;
      var ty = base - 40;
      var sway = (r() * 2 - 1) * 60;
      g.lineWidth = 10 + r() * 8;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(tx, ty);
      g.bezierCurveTo(tx + sway * 0.3, ty - th * 0.4, tx + sway, ty - th * 0.7, tx + sway * 0.7, ty - th);
      g.stroke();
      for (var b = 0; b < 3; b++) {
        var bt = 0.45 + b * 0.2;
        var bx = tx + sway * bt * 0.8, by = ty - th * bt;
        var dir = (b % 2 === 0 ? 1 : -1);
        g.lineWidth = 4 + r() * 3;
        g.beginPath();
        g.moveTo(bx, by);
        g.quadraticCurveTo(bx + dir * 40, by - 18, bx + dir * (55 + r() * 30), by - 40 - r() * 25);
        g.stroke();
      }
      for (var cc = 0; cc < 3; cc++) {
        g.beginPath();
        g.arc(tx + sway * 0.7 + (r() * 2 - 1) * 34, ty - th - r() * 26, 24 + r() * 22, 0, Math.PI * 2);
        g.fill();
      }
    }
    // névoa quente rente ao chão
    var gr = g.createLinearGradient(0, base - 90, 0, base);
    gr.addColorStop(0, 'rgba(230,140,80,0)');
    gr.addColorStop(1, 'rgba(230,140,80,0.22)');
    g.fillStyle = gr;
    g.fillRect(0, base - 90, 2400, 90);
  }

  function hillBand(g, r, topY, amp, n) {
    g.beginPath();
    g.moveTo(0, LAYER_H);
    g.lineTo(0, topY + amp * 0.5);
    var step = 2400 / n;
    for (var i = 0; i < n; i++) {
      var x0 = i * step, x1 = (i + 1) * step;
      g.quadraticCurveTo(x0 + step / 2, topY - r() * amp, x1, topY + r() * amp * 0.6);
    }
    g.lineTo(2400, LAYER_H);
    g.closePath();
    g.fill();
  }

  // --- camada média: torres de pedra e cogumelos gigantes (só decoração) ---
  function paintMid(g) {
    var r = makeRand(202);
    var base = LAYER_H;
    g.fillStyle = 'rgba(49,32,62,0.9)';
    g.fillRect(0, base - 56, 2400, 56);

    // torres de pedra em camadas, com fenda escura no meio
    for (var s = 0; s < 4; s++) {
      var sx = 200 + s * 620 + r() * 110;
      var sw = 90 + r() * 70, sh = 210 + r() * 150;
      g.fillStyle = '#3c2a4c';
      g.beginPath();
      g.moveTo(sx, base);
      g.lineTo(sx + 8, base - sh + 20);
      g.quadraticCurveTo(sx + sw * 0.5, base - sh - 16, sx + sw - 8, base - sh + 24);
      g.lineTo(sx + sw, base);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(22,12,34,0.6)';
      g.lineWidth = 3;
      for (var ly = base - sh + 46; ly < base - 20; ly += 30 + r() * 18) {
        g.beginPath();
        g.moveTo(sx + 5, ly);
        g.quadraticCurveTo(sx + sw * 0.5, ly + (r() * 2 - 1) * 8, sx + sw - 5, ly + (r() * 2 - 1) * 6);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,170,95,0.16)';    // aresta com o sol batendo
      g.fillRect(sx + 6, base - sh + 22, 5, sh - 30);
      // fenda / boca de caverna
      g.fillStyle = 'rgba(8,3,14,0.75)';
      g.beginPath();
      g.ellipse(sx + sw * 0.5, base - sh * 0.42, 13 + r() * 8, 26 + r() * 16, 0, 0, Math.PI * 2);
      g.fill();
    }

    // cogumelos gigantes — DECORAÇÃO de fundo, nunca plataforma
    for (var i = 0; i < 7; i++) {
      var mx = 120 + i * 335 + r() * 100;
      var mh = 190 + r() * 140;
      var capW = 110 + r() * 70, capH = 46 + r() * 26;
      var top = base - mh;
      g.fillStyle = '#41284e';
      g.beginPath();
      g.moveTo(mx - 16, base);
      g.quadraticCurveTo(mx - 10, top + capH, mx - 12, top + capH * 0.7);
      g.lineTo(mx + 12, top + capH * 0.7);
      g.quadraticCurveTo(mx + 10, top + capH, mx + 20, base);
      g.closePath();
      g.fill();
      g.fillStyle = '#54305e';
      g.beginPath();
      g.ellipse(mx, top + capH, capW, capH, 0, Math.PI, Math.PI * 2);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,165,90,0.35)';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(mx, top + capH, capW - 2, capH - 2, 0, Math.PI * 1.05, Math.PI * 1.6);
      g.stroke();
      g.fillStyle = 'rgba(220,190,230,0.28)';
      for (var d = 0; d < 4; d++) {
        g.beginPath();
        g.arc(mx - capW * 0.6 + r() * capW * 1.2, top + capH * 0.45 - r() * capH * 0.3, 4 + r() * 6, 0, Math.PI * 2);
        g.fill();
      }
    }
    // troncos nus entre os cogumelos
    g.fillStyle = '#3a2348';
    for (var t2 = 0; t2 < 4; t2++) {
      var tx = 260 + t2 * 580 + r() * 120;
      g.beginPath();
      g.moveTo(tx - 12, base);
      g.quadraticCurveTo(tx - 4, base - 190, tx + (r() * 2 - 1) * 30 - 6, base - 300);
      g.lineTo(tx + (r() * 2 - 1) * 30 + 8, base - 300);
      g.quadraticCurveTo(tx + 8, base - 180, tx + 16, base);
      g.closePath();
      g.fill();
    }
  }

  // --- névoa entre os níveis: duas faixas quentes que separam os patamares ---
  function paintMist(g) {
    var r = makeRand(505);
    var base = LAYER_H;
    var bands = [base - 380, base - 170];
    for (var i = 0; i < bands.length; i++) {
      var by = bands[i], bh = 90 + i * 40;
      var gr = g.createLinearGradient(0, by - bh * 0.5, 0, by + bh * 0.5);
      gr.addColorStop(0, 'rgba(226,150,110,0)');
      gr.addColorStop(0.5, 'rgba(226,150,110,' + (0.16 + i * 0.06).toFixed(2) + ')');
      gr.addColorStop(1, 'rgba(226,150,110,0)');
      g.fillStyle = gr;
      g.fillRect(0, by - bh * 0.5, 1600, bh);
      // bolsões mais densos, para a faixa não parecer uma régua
      g.fillStyle = 'rgba(240,170,125,0.10)';
      for (var k = 0; k < 9; k++) {
        var px = r() * 1600, pw = 90 + r() * 190, ph = 20 + r() * 34;
        g.beginPath();
        g.ellipse(px, by + (r() * 2 - 1) * 22, pw, ph, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // --- camada próxima: arbustos e samambaias ---
  function paintNear(g) {
    var r = makeRand(303);
    var base = LAYER_H;
    g.fillStyle = '#132917';
    g.fillRect(0, base - 82, 2400, 82);
    g.fillStyle = '#16301c';
    for (var i = 0; i < 16; i++) {
      var bx = i * 150 + r() * 80, by = base - 70 - r() * 30;
      for (var b = 0; b < 3; b++) {
        g.beginPath();
        g.arc(bx + b * 26 - 26, by + r() * 14, 26 + r() * 20, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.strokeStyle = '#20421f';
    g.lineCap = 'round';
    for (var f = 0; f < 14; f++) {
      var fx = 40 + f * 170 + r() * 90, fy = base - 24;
      var nfr = 4 + Math.floor(r() * 3);
      for (var k = 0; k < nfr; k++) {
        var dir = (k % 2 === 0 ? 1 : -1);
        var len = 55 + r() * 55;
        g.lineWidth = 3.5;
        g.beginPath();
        g.moveTo(fx, fy);
        g.quadraticCurveTo(fx + dir * len * 0.35, fy - len, fx + dir * len, fy - len * 0.55);
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(70,120,60,0.8)';
    g.lineWidth = 2;
    for (var s2 = 0; s2 < 40; s2++) {
      var gx = r() * 2400, gy = base - 6;
      g.beginPath();
      g.moveTo(gx, gy);
      g.quadraticCurveTo(gx + (r() * 2 - 1) * 8, gy - 16, gx + (r() * 2 - 1) * 16, gy - 26 - r() * 12);
      g.stroke();
    }
  }

  // --- primeiro plano: folhagem escura embaixo + pendentes no alto ---
  function paintFront(g) {
    var r = makeRand(404);
    var base = LAYER_H;
    g.fillStyle = '#0a140c';
    for (var i = 0; i < 22; i++) {
      var lx = i * 85 + r() * 50, lh = 70 + r() * 110;
      var lean = (r() * 2 - 1) * 40;
      g.beginPath();
      g.moveTo(lx - 26, base + 10);
      g.quadraticCurveTo(lx - 20 + lean * 0.4, base - lh * 0.6, lx + lean, base - lh);
      g.quadraticCurveTo(lx + 20 + lean * 0.4, base - lh * 0.6, lx + 26, base + 10);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#0d1a10';
    g.fillRect(0, base - 34, 1800, 34);
    g.strokeStyle = '#0b150d';
    g.fillStyle = '#0b150d';
    g.lineCap = 'round';
    for (var h2 = 0; h2 < 3; h2++) {
      var hx = 220 + h2 * 620 + r() * 140;
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(hx - 90, 130);
      g.quadraticCurveTo(hx, 150, hx + 100, 200);
      g.stroke();
      for (var v = 0; v < 4; v++) {
        var vx = hx - 60 + v * 46, vy = 150 + v * 12;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(vx, vy);
        g.quadraticCurveTo(vx + 6, vy + 26, vx - 4, vy + 44 + r() * 22);
        g.stroke();
        g.beginPath();
        g.ellipse(vx - 4, vy + 50 + r() * 18, 6, 11, 0.4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // desenha uma camada com wrap horizontal + parallax vertical
  function drawLayer(ctx, layer, f, cam) {
    var lw = layer.width;
    var y = VIEW_H - layer.height + (CAM_Y_MAX - cam.y) * f;
    var off = -((cam.x * f) % lw);
    if (off > 0) off -= lw;
    ctx.drawImage(layer, off, y);
    if (off + lw < VIEW_W) ctx.drawImage(layer, off + lw, y);
  }

  // ---------------------------------------------------------------
  // RESET — o engine chama ao (re)carregar a fase: reacende todas as lumis e
  // apaga as faíscas em voo. Antes o próprio update reacendia sozinho quando
  // via o contador do HUD zerado; com três fases o contador NÃO zera entre
  // elas (as lumis acumulam), então aquele palpite virou mentira.
  // ---------------------------------------------------------------
  function reset() {
    for (var i = 0; i < lumis.length; i++) lumis[i].taken = false;
    kit.apagarFaiscas(sparks);
  }

  // ---------------------------------------------------------------
  // UPDATE — coleta de lumis e faíscas (a mecânica é do kit; o bosque não
  // tem coletável próprio além das lumis)
  // ---------------------------------------------------------------
  function update(dt) {
    kit.coletarLumis(lumis, sparks, dt);
  }

  // ---------------------------------------------------------------
  // DRAW BACK — céu, sol, camadas de parallax, névoa, raios, vagalumes
  // ---------------------------------------------------------------
  function drawBack(ctx, cam) {
    buildAll();
    var t = FG.engine.time;

    ctx.drawImage(skySpr, 0, 0);

    // sol difuso, quase fixo no céu
    var sx = 700 - cam.x * 0.04, sy = 150 - cam.y * 0.06;
    ctx.drawImage(sunSpr, sx - 140, sy - 140);

    drawLayer(ctx, farL, 0.2, cam);

    // raios de luz pulsando devagar
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 0.6);
    drawLayer(ctx, raysL, 0.3, cam);
    ctx.restore();

    drawLayer(ctx, midL, 0.45, cam);

    // vagalumes em senoide
    ctx.save();
    for (var i = 0; i < 20; i++) {
      var fx = (((i * 397 + Math.sin(t * 0.3 + i) * 40) - cam.x * 0.55) % 1040 + 1040) % 1040 - 40;
      var fy = 90 + (i * 211) % 330 + Math.sin(t * 0.9 + i * 1.7) * 22 - cam.y * 0.5;
      var a = 0.3 + 0.28 * Math.sin(t * 2.1 + i * 2.3);
      if (a <= 0.05) continue;
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = '#ffd870';
      ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff0b8';
      ctx.beginPath(); ctx.arc(fx, fy, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // névoa separando os patamares (respira devagar)
    ctx.save();
    ctx.globalAlpha = 0.72 + 0.14 * Math.sin(t * 0.35);
    drawLayer(ctx, mistL, 0.6, cam);
    ctx.restore();

    drawLayer(ctx, nearL, 0.7, cam);
  }

  // ---------------------------------------------------------------
  // DRAW SOLIDS — poças, terreno, penhascos, ilhas, espinhos, lanternas,
  // lumis e faíscas (tudo com culling de ~1 tela)
  // ---------------------------------------------------------------
  function drawSolids(ctx, cam) {
    buildAll();
    var t = FG.engine.time;
    var x0 = cam.x - 220, x1 = cam.x + VIEW_W + 220;

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // poças venenosas (atrás das bordas dos buracos)
    for (var hi = 0; hi < hazards.length; hi++) {
      var hz = hazards[hi];
      if (hz.t !== 'p' || hz.x > x1 || hz.x + hz.w < x0) continue;
      drawPool(ctx, hz, t);
    }

    // plataformas
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.k === 'h' || s.x > x1 || s.x + s.w < x0) continue;
      var d = decor[i];
      if (s.k === 'c') drawCliff(ctx, s, d);
      else if (s.k === 'i') drawIsland(ctx, s, d);
      else if (s.k === 'r') drawRock(ctx, s, d);
      else drawTerrain(ctx, s, d);
    }

    // espinhos por cima do terreno
    for (var h2 = 0; h2 < hazards.length; h2++) {
      var hz2 = hazards[h2];
      if (hz2.t !== 's' || hz2.x > x1 || hz2.x + hz2.w < x0) continue;
      drawSpikes(ctx, hz2);
    }

    // lanternas-checkpoint
    for (var c = 0; c < checkpoints.length; c++) {
      var cp = checkpoints[c];
      if (cp.x > x1 || cp.x < x0) continue;
      drawLantern(ctx, cp, FG.engine.checkpoint.x === cp.x, t);
    }

    // lumis e faíscas de coleta (ctx já está no espaço do mundo)
    kit.desenharLumis(ctx, cam, lumis, lumiSpr, t);
    kit.desenharFaiscas(ctx, sparks);

    ctx.restore();
  }

  // --- penhasco e ilha: o desenho pesado já foi assado em offscreen no
  // buildAll (paintCliff/paintIsland), aqui é um blit e nada mais ---
  function drawCliff(ctx, s, d) { ctx.drawImage(d.spr, s.x + d.ox, s.y + d.oy); }
  function drawIsland(ctx, s, d) { ctx.drawImage(d.spr, s.x + d.ox, s.y + d.oy); }

  // --- plataforma de terra com topo de musgo ---
  function drawTerrain(ctx, s, d) {
    ctx.fillStyle = '#4a2e1c';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    if (s.h > 20) {
      ctx.fillStyle = 'rgba(20,10,6,0.35)';
      ctx.fillRect(s.x, s.y + s.h - 10, s.w, 10);
    }
    ctx.fillStyle = 'rgba(30,16,10,0.5)';
    for (var i = 0; i < d.spots.length; i++) {
      var sp = d.spots[i];
      ctx.beginPath();
      ctx.ellipse(s.x + sp.dx, s.y + sp.dy, sp.rad * 1.6, sp.rad, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#3f7a2e';
    ctx.fillRect(s.x - 3, s.y - 2, s.w + 6, 14);
    ctx.fillStyle = '#6fb84a';
    ctx.fillRect(s.x - 3, s.y - 2, s.w + 6, 7);
    ctx.fillStyle = 'rgba(255,220,140,0.3)';
    ctx.fillRect(s.x - 3, s.y - 2, s.w + 6, 2);
    ctx.fillStyle = '#3f7a2e';
    ctx.beginPath(); ctx.arc(s.x - 1, s.y + 15, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s.x + s.w + 1, s.y + 17, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7cc850';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (var j = 0; j < d.tufts.length; j++) {
      var tf = d.tufts[j];
      var bx = s.x + tf.dx, by = s.y - 1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + tf.lean * 4, by - tf.len * 0.7, bx + tf.lean * 8, by - tf.len);
      ctx.stroke();
    }
  }

  // --- pedra ---
  function drawRock(ctx, s, d) {
    ctx.fillStyle = '#5d5348';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + s.h);
    ctx.lineTo(s.x + 4, s.y + 6);
    ctx.quadraticCurveTo(s.x + s.w / 2, s.y - 6, s.x + s.w - 4, s.y + 6);
    ctx.lineTo(s.x + s.w, s.y + s.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,150,0.18)';
    ctx.fillRect(s.x + 4, s.y + 2, s.w - 8, 4);
    ctx.fillStyle = 'rgba(20,15,10,0.4)';
    for (var i = 0; i < d.spots.length; i++) {
      var sp = d.spots[i];
      ctx.beginPath();
      ctx.arc(s.x + sp.dx, s.y + sp.dy, sp.rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- poça venenosa com bolhas ---
  function drawPool(ctx, hz, t) {
    var bot = hz.y + hz.h + 22;
    ctx.fillStyle = '#0f3d14';
    ctx.fillRect(hz.x, hz.y, hz.w, bot - hz.y);
    ctx.fillStyle = 'rgba(60,150,40,0.5)';
    ctx.fillRect(hz.x, hz.y, hz.w, 10);
    ctx.save();
    ctx.strokeStyle = '#8fe64a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    var step = 18;
    ctx.moveTo(hz.x, hz.y + Math.sin(t * 2 + hz.x * 0.05) * 2);
    for (var x = hz.x + step; x <= hz.x + hz.w; x += step) {
      ctx.lineTo(x, hz.y + Math.sin(t * 2 + x * 0.05) * 2.4);
    }
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = '#a8f060';
    var nb = Math.max(2, Math.floor(hz.w / 70));
    for (var i = 0; i < nb; i++) {
      var bx = hz.x + 12 + (i * 83) % (hz.w - 24);
      var per = (t * 0.45 + i * 0.37) % 1;
      var by = bot - 4 - per * (bot - hz.y - 6);
      ctx.globalAlpha = 0.65 * (1 - per);
      ctx.beginPath();
      ctx.arc(bx, by, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.3 + 0.12 * Math.sin(t * 2.4 + hz.x);
    ctx.fillStyle = '#5fd63a';
    ctx.fillRect(hz.x, hz.y - 3, hz.w, 3);
    ctx.restore();
  }

  // --- espinhos ---
  function drawSpikes(ctx, hz) {
    var n = Math.max(3, Math.round(hz.w / 16));
    var sw = hz.w / n;
    ctx.fillStyle = '#2a2118';
    ctx.fillRect(hz.x, hz.y + hz.h - 5, hz.w, 5);
    for (var i = 0; i < n; i++) {
      var bx = hz.x + i * sw;
      ctx.fillStyle = '#cdbfae';
      ctx.beginPath();
      ctx.moveTo(bx, hz.y + hz.h);
      ctx.lineTo(bx + sw / 2, hz.y);
      ctx.lineTo(bx + sw, hz.y + hz.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(60,45,35,0.55)';
      ctx.beginPath();
      ctx.moveTo(bx + sw / 2, hz.y);
      ctx.lineTo(bx + sw, hz.y + hz.h);
      ctx.lineTo(bx + sw / 2, hz.y + hz.h);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- lanterna-checkpoint (acesa quando é o checkpoint atual) ---
  function drawLantern(ctx, cp, lit, t) {
    var x = cp.x, y = cp.y;
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(x - 3, y - 64, 6, 64);
    ctx.fillStyle = '#2a1c12';
    ctx.fillRect(x - 8, y - 4, 16, 4);
    ctx.fillStyle = '#2a1c12';
    ctx.fillRect(x - 11, y - 92, 22, 30);
    if (lit) {
      var fl = 0.8 + 0.2 * Math.sin(t * 9 + Math.sin(t * 5.3));
      ctx.save();
      ctx.shadowColor = '#ffb030';
      ctx.shadowBlur = 22 * fl;
      ctx.fillStyle = '#ffd870';
      ctx.fillRect(x - 8, y - 89, 16, 24);
      ctx.restore();
      ctx.fillStyle = '#fff2c0';
      ctx.beginPath();
      ctx.ellipse(x, y - 77, 3.4, 5.5 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#241f1a';
      ctx.fillRect(x - 8, y - 89, 16, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x - 8, y - 89, 5, 24);
    }
    ctx.fillStyle = '#1d130c';
    ctx.beginPath();
    ctx.moveTo(x - 14, y - 92);
    ctx.lineTo(x, y - 102);
    ctx.lineTo(x + 14, y - 92);
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------------------
  // DRAW FRONT — folhagem de primeiro plano + vinheta
  // ---------------------------------------------------------------
  function drawFront(ctx, cam) {
    buildAll();
    drawLayer(ctx, frontL, 1.15, cam);
    ctx.drawImage(vig, 0, 0);
  }

  // ---------------------------------------------------------------
  // API pública — a fase entra no registro na ordem em que o index.html
  // carrega os level*.js, então o índice sai certo sem ninguém combinar nada.
  // Quem publica FG.level (a fase corrente) é o engine.
  // ---------------------------------------------------------------
  FG.levels = FG.levels || [];
  FG.levels.push({
    id: 'bosque',
    nome: 'O Bosque Crepuscular',
    W: W,
    H: H,
    playerStart: { x: 80, y: 560 },
    solids: solids,
    hazards: hazards,
    checkpoints: checkpoints,
    enemyDefs: enemyDefs,
    obstacleDefs: obstacleDefs,
    bossId: 'dragao',
    bossTriggerX: 6350,
    arena: { x: 6200, w: 1000 },
    reset: reset,
    update: update,
    drawBack: drawBack,
    drawSolids: drawSolids,
    drawFront: drawFront,
  });
})();
