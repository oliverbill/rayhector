// RayHector: As Aventuras do Menino-gênio — level.js
// Fase 0, 'parque': geometria do mundo, lumis, checkpoints, inimigos e
// obstáculos (defs) e todo o visual pintado do Parque do Terror assombrado.
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
  //  (6) x 5420..7200 reta final e a clareira plana do chefão
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

    // ---- (6) reta final e clareira do chefão ----
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

    // céu noturno doentio: roxo profundo → verde pântano, com estrelas frias
    skySpr = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, '#0e0620');
      gr.addColorStop(0.35, '#2a1040');
      gr.addColorStop(0.68, '#3c2a2a');
      gr.addColorStop(0.88, '#4a6a2e');
      gr.addColorStop(1, '#5c8a3a');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      var r = makeRand(11);
      g.fillStyle = 'rgba(210,230,255,0.7)';
      for (var i = 0; i < 40; i++) {
        var sx = r() * VIEW_W, sy = r() * 200, sr = 0.5 + r() * 1.1;
        g.globalAlpha = 0.15 + r() * 0.5;
        g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    })(skySpr.getContext('2d'));

    // lua doentia, verde-pálida, meio velada
    sunSpr = makeCanvas(280, 280);
    (function (g) {
      var gr = g.createRadialGradient(140, 140, 8, 140, 140, 140);
      gr.addColorStop(0, 'rgba(220,240,190,0.95)');
      gr.addColorStop(0.18, 'rgba(190,220,150,0.8)');
      gr.addColorStop(0.5, 'rgba(140,180,110,0.26)');
      gr.addColorStop(1, 'rgba(120,160,90,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 280, 280);
    })(sunSpr.getContext('2d'));

    // feixes de luz verde-doentia coados pela névoa, repetem a cada 1200px
    raysL = makeCanvas(1200, LAYER_H);
    (function (g) {
      var r = makeRand(31);
      for (var i = 0; i < 3; i++) {
        var bx = 120 + i * 400 + r() * 120, bw = 60 + r() * 60, lean = 170 + r() * 60;
        var gr = g.createLinearGradient(0, 0, 0, LAYER_H);
        gr.addColorStop(0, 'rgba(150,210,120,0.14)');
        gr.addColorStop(0.7, 'rgba(120,180,140,0.05)');
        gr.addColorStop(1, 'rgba(120,180,140,0)');
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

    // vinheta sutil, mais fria e fechada — clima de mata-assombrada
    vig = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 220, VIEW_W / 2, VIEW_H / 2, 640);
      gr.addColorStop(0, 'rgba(4,10,4,0)');
      gr.addColorStop(1, 'rgba(4,10,4,0.58)');
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
  // PENHASCO — rocha escura empilhada em camadas, bocas de caverna escuras
  // ao fundo, face direita na sombra e topo com musgo doentio (o mesmo
  // formato/tamanho de sempre, só a paleta virou parque abandonado).
  // ---------------------------------------------------------------
  function paintCliff(g, w, h, seed) {
    var r = makeRand(seed);
    var P = ROCK_PAD;

    g.save();
    g.beginPath(); g.rect(P, P, w, h); g.clip();

    // corpo em gradiente de pedra escura, doentia
    var gr = g.createLinearGradient(0, P, 0, P + h);
    gr.addColorStop(0, '#3a4038');
    gr.addColorStop(0.4, '#282e26');
    gr.addColorStop(1, '#12160f');
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
        g.fillStyle = 'rgba(96,106,90,' + tone.toFixed(3) + ')';
        g.beginPath();
        g.ellipse(px, py, rr, rr * 0.72, 0, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(150,200,110,0.12)';   // aresta com luar verde-doentio
        g.beginPath();
        g.ellipse(px, py, rr - 1, rr * 0.72 - 1, 0, Math.PI * 1.05, Math.PI * 1.78);
        g.stroke();
        g.strokeStyle = 'rgba(4,6,3,0.4)';           // sombra por baixo
        g.beginPath();
        g.ellipse(px, py, rr - 1, rr * 0.72 - 1, 0, Math.PI * 0.14, Math.PI * 0.86);
        g.stroke();
      }
    }

    // rachaduras verticais: a parede pede para ser agarrada
    g.strokeStyle = 'rgba(4,6,3,0.4)';
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

    // luar verde-pálido na face esquerda, sombra fechada na direita
    var sg = g.createLinearGradient(P, 0, P + w, 0);
    sg.addColorStop(0, 'rgba(150,200,120,0.10)');
    sg.addColorStop(0.45, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(4,8,4,0.5)');
    g.fillStyle = sg;
    g.fillRect(P, P, w, h);

    // base afundando na sombra da caverna
    var bh = Math.min(110, h * 0.45);
    var bg = g.createLinearGradient(0, P + h - bh, 0, P + h);
    bg.addColorStop(0, 'rgba(4,6,4,0)');
    bg.addColorStop(1, 'rgba(4,6,4,0.68)');
    g.fillStyle = bg;
    g.fillRect(P, P + h - bh, w, bh);
    g.restore();

    // topo: musgo doentio transbordando as bordas + fio pálido de luar
    g.fillStyle = '#3a4a22';
    g.fillRect(P - 3, P - 2, w + 6, 13);
    g.fillStyle = '#5a7a2e';
    g.fillRect(P - 3, P - 2, w + 6, 7);
    g.fillStyle = 'rgba(200,220,180,0.45)';
    g.fillRect(P - 3, P - 3, w + 6, 3);
    // gotas de musgo escorrendo nas quinas
    g.fillStyle = '#3a4a22';
    g.beginPath(); g.arc(P - 1, P + 16, 4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(P + w + 1, P + 19, 4.5, 0, Math.PI * 2); g.fill();
    // tufos de capim ressecado no topo
    g.strokeStyle = '#6a8a3a';
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
    gr.addColorStop(0, '#3a4038');
    gr.addColorStop(0.42, '#242a20');
    gr.addColorStop(1, '#0e120c');
    g.fillStyle = gr;
    g.fillRect(0, 0, P * 2 + w, P + h + tip + 8);

    // estratos horizontais de rocha
    for (var y = P + 16; y < P + h + tip; y += 20 + r() * 12) {
      g.strokeStyle = 'rgba(4,6,3,0.32)';
      g.lineWidth = 2 + r() * 2;
      g.beginPath();
      g.moveTo(P - 4, y);
      g.quadraticCurveTo(cx, y + (r() * 2 - 1) * 7, P + w + 4, y + (r() * 2 - 1) * 5);
      g.stroke();
      g.strokeStyle = 'rgba(150,200,120,0.08)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(P - 4, y - 3);
      g.quadraticCurveTo(cx, y - 3 + (r() * 2 - 1) * 7, P + w + 4, y - 3 + (r() * 2 - 1) * 5);
      g.stroke();
    }
    // pedras arredondadas soltas na barriga da ilha
    for (var b = 0; b < 4; b++) {
      var bx = P + 8 + r() * Math.max(1, w - 16), by = P + h * (0.3 + r() * 0.6), br = 8 + r() * 12;
      g.fillStyle = 'rgba(96,106,90,0.16)';
      g.beginPath(); g.ellipse(bx, by, br, br * 0.75, 0, 0, Math.PI * 2); g.fill();
    }
    // sombra na face direita
    var sg = g.createLinearGradient(P, 0, P + w, 0);
    sg.addColorStop(0, 'rgba(150,200,120,0.09)');
    sg.addColorStop(0.5, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(4,8,4,0.48)');
    g.fillStyle = sg;
    g.fillRect(P, P, w, h + tip);
    g.restore();
    g.restore();

    // topo com musgo doentio transbordando
    g.fillStyle = '#3a4a22';
    g.fillRect(P - 4, P - 2, w + 8, 15);
    g.fillStyle = '#5a7a2e';
    g.fillRect(P - 4, P - 2, w + 8, 8);
    g.fillStyle = 'rgba(200,220,180,0.42)';
    g.fillRect(P - 4, P - 3, w + 8, 3);
    // musgo pendurado nas quinas
    g.fillStyle = '#3a4a22';
    g.beginPath(); g.arc(P - 2, P + 18, 5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(P + w + 2, P + 21, 5.5, 0, Math.PI * 2); g.fill();
    // tufos e raízes ressecadas penduradas
    g.strokeStyle = '#6a8a3a';
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
    g.strokeStyle = 'rgba(60,90,40,0.65)';
    g.lineWidth = 1.8;
    for (var v = 0; v < 4; v++) {
      var vx = P + 8 + r() * Math.max(1, w - 16), vl = 18 + r() * 34;
      g.beginPath();
      g.moveTo(vx, P + 12);
      g.quadraticCurveTo(vx + (r() * 2 - 1) * 8, P + 12 + vl * 0.6, vx + (r() * 2 - 1) * 10, P + 12 + vl);
      g.stroke();
    }
  }

  // --- camada distante: silhuetas de parque assombrado — roda-gigante,
  // tendas de circo pontudas, morros e árvores retorcidas mortas ---
  function paintFar(g) {
    var r = makeRand(101);
    var base = LAYER_H;

    // arco/pórtico de entrada do parque, logo no início (x pequeno) — a
    // primeira coisa que se reconhece como "parque de diversões"
    paintArch(g, r, 140, base);

    // roda-gigante parada, torta, ao fundo do parque — aro e cabines em tom
    // claro/vivo para se destacar do céu escuro (silhueta pura não lia bem)
    (function () {
      var wx = 340, wy = base - 40 - 260, wr = 210;
      g.strokeStyle = 'rgba(196,178,224,0.9)';
      g.lineWidth = 7;
      g.beginPath(); g.arc(wx, wy, wr, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(160,142,196,0.55)';
      for (var i = 0; i < 10; i++) {
        var ang = (i / 10) * Math.PI * 2;
        g.beginPath();
        g.moveTo(wx, wy);
        g.lineTo(wx + Math.cos(ang) * wr, wy + Math.sin(ang) * wr);
        g.stroke();
        // cabines penduradas, tortas — vermelho vivo, alterna com verde-doentio
        var cx = wx + Math.cos(ang) * wr, cy = wy + Math.sin(ang) * wr;
        g.fillStyle = (i % 2 === 0) ? '#c8304c' : '#7a9a3c';
        g.fillRect(cx - 9, cy - 4, 18, 16);
        // pontinho de luz na cabine
        g.fillStyle = 'rgba(255,230,140,0.8)';
        g.beginPath(); g.arc(cx, cy + 4, 2, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = 'rgba(196,178,224,0.9)';
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(wx, wy + wr);
      g.lineTo(wx - 50, base - 20);
      g.moveTo(wx, wy + wr);
      g.lineTo(wx + 50, base - 20);
      g.stroke();
    })();

    // tendas de circo pontudas (silhueta), com bandeirola torta no topo —
    // pano em roxo/violeta claro e listras vermelho-vivo, bem acima do
    // contraste quase-preto de antes
    for (var c = 0; c < 5; c++) {
      var cw = 150 + r() * 150;
      var cx = 760 + c * 420 + r() * 120;
      var ch = 200 + r() * 140;
      var top = base - 40 - ch;
      g.fillStyle = 'rgba(104,52,132,0.92)';
      g.beginPath();
      g.moveTo(cx, base);
      g.lineTo(cx + cw * 0.5, top);
      g.lineTo(cx + cw, base);
      g.closePath();
      g.fill();
      // listras verticais da lona, vermelho vivo
      g.strokeStyle = 'rgba(200,40,60,0.75)';
      g.lineWidth = 3;
      for (var lx = cx + cw * 0.12; lx < cx + cw * 0.9; lx += cw * 0.16) {
        g.beginPath();
        g.moveTo(lx, base);
        g.lineTo(cx + cw * 0.5, top);
        g.stroke();
      }
      // bandeirola torta no mastro
      g.strokeStyle = 'rgba(230,210,240,0.8)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx + cw * 0.5, top);
      g.lineTo(cx + cw * 0.5 + 4, top - 22);
      g.stroke();
      g.fillStyle = '#c8324a';
      g.beginPath();
      g.moveTo(cx + cw * 0.5 + 4, top - 22);
      g.lineTo(cx + cw * 0.5 + 22, top - 16);
      g.lineTo(cx + cw * 0.5 + 4, top - 10);
      g.closePath();
      g.fill();
      // a tenda do meio vira casa de espelhos: rosto de palhaço com a boca
      // como entrada; as demais mantêm a entrada escura simples
      if (c === 2) {
        paintFunhouseFace(g, cx + cw * 0.5, base, cw);
      } else {
        var kx = cx + cw * 0.5, ky = base - r() * 20;
        var kg = g.createRadialGradient(kx, ky - 40, 3, kx, ky - 40, 50);
        kg.addColorStop(0, 'rgba(6,2,12,0.9)');
        kg.addColorStop(0.6, 'rgba(12,5,20,0.6)');
        kg.addColorStop(1, 'rgba(12,5,20,0)');
        g.fillStyle = kg;
        g.beginPath();
        g.ellipse(kx, ky - 40, 26, 46, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    // carrossel-fantasma: cúpula cônica listrada, colunas e cavalinhos
    // pendurados tortos — dois pelo mundo, em posições/tamanhos diferentes
    paintCarousel(g, makeRand(707), 1180, base, 1);
    paintCarousel(g, makeRand(808), 2020, base, 0.82);

    // dois cordões de morros mortiços por trás das tendas
    g.fillStyle = 'rgba(30,42,26,0.85)';
    hillBand(g, r, base - 210, 90, 5);
    g.fillStyle = 'rgba(20,30,18,0.95)';
    hillBand(g, r, base - 130, 70, 6);

    // árvores retorcidas e mortas
    g.strokeStyle = '#151c14';
    g.fillStyle = '#151c14';
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
        // galhos secundários, sem folhagem — árvore morta, só osso
        g.lineWidth = 2.5 + r() * 2;
        g.beginPath();
        g.moveTo(bx + dir * (55 + r() * 30), by - 40 - r() * 25);
        g.quadraticCurveTo(bx + dir * (65 + r() * 20), by - 55, bx + dir * (85 + r() * 20), by - 60 - r() * 18);
        g.stroke();
      }
    }
    // névoa fria e doentia rente ao chão
    var gr = g.createLinearGradient(0, base - 90, 0, base);
    gr.addColorStop(0, 'rgba(120,180,120,0)');
    gr.addColorStop(1, 'rgba(120,180,120,0.22)');
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

  // --- arco/pórtico de entrada do parque: dois postes tortos, um arco
  // curvo por cima e um letreiro torto de "letras" estilizadas + uma
  // caveira no topo — a primeira coisa que estabelece o tema ---
  function paintArch(g, r, cx, base) {
    var half = 130, postH = 260, archTop = base - postH;
    g.save();
    g.strokeStyle = '#241a2c';
    g.lineWidth = 20;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - half, base); g.lineTo(cx - half + 6, archTop + 18); g.stroke();
    g.beginPath(); g.moveTo(cx + half, base); g.lineTo(cx + half - 6, archTop + 18); g.stroke();
    // arco curvo por cima, contorno claro para destacar do céu escuro
    g.strokeStyle = 'rgba(212,190,230,0.85)';
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(cx - half + 4, archTop + 22);
    g.quadraticCurveTo(cx, archTop - 34, cx + half - 4, archTop + 22);
    g.stroke();
    g.strokeStyle = '#3a2848';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(cx - half + 4, archTop + 22);
    g.quadraticCurveTo(cx, archTop - 34, cx + half - 4, archTop + 22);
    g.stroke();
    // letreiro torto de blocos, um por letra de "PARQUE" — só a silhueta,
    // não precisa ser tipografia real, mas lê como palavra à distância
    var word = 'PARQUE';
    var lw = (half * 2 - 20) / word.length;
    g.fillStyle = '#e8d8b8';
    for (var i = 0; i < word.length; i++) {
      var lx = cx - half + 14 + i * lw;
      var ly = archTop - 30 + Math.sin(i * 1.3) * 6;
      var tilt = (i % 2 === 0 ? -1 : 1) * 0.08;
      g.save();
      g.translate(lx + lw * 0.3, ly);
      g.rotate(tilt);
      g.fillRect(-lw * 0.28, -12, lw * 0.56, 24);
      g.restore();
    }
    // caveira torta no topo do arco
    g.save();
    g.translate(cx, archTop - 48);
    g.rotate(-0.12);
    g.fillStyle = '#e8e2d0';
    g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.fill();
    g.fillRect(-9, 10, 18, 8);
    g.fillStyle = '#241a2c';
    g.beginPath(); g.arc(-6, -1, 4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(6, -1, 4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-3, 6); g.lineTo(0, 11); g.lineTo(3, 6); g.closePath(); g.fill();
    g.restore();
    g.restore();
  }

  // --- casa de espelhos: rosto de palhaço/caveira gigante na fachada da
  // tenda, a boca aberta serve de porta (entrada escura reaproveitada) ---
  function paintFunhouseFace(g, cx, base, cw) {
    var faceY = base - 96, faceR = Math.min(70, cw * 0.32);
    g.save();
    // rosto pálido doentio
    g.fillStyle = 'rgba(210,200,180,0.85)';
    g.beginPath(); g.ellipse(cx, faceY, faceR, faceR * 1.12, 0, 0, Math.PI * 2); g.fill();
    // bochechas rosadas descascadas
    g.fillStyle = 'rgba(180,50,70,0.35)';
    g.beginPath(); g.ellipse(cx - faceR * 0.55, faceY + faceR * 0.15, faceR * 0.28, faceR * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx + faceR * 0.55, faceY + faceR * 0.15, faceR * 0.28, faceR * 0.2, 0, 0, Math.PI * 2); g.fill();
    // olhos vazados e escuros
    g.fillStyle = '#100a14';
    g.beginPath(); g.ellipse(cx - faceR * 0.4, faceY - faceR * 0.15, faceR * 0.16, faceR * 0.22, 0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx + faceR * 0.4, faceY - faceR * 0.15, faceR * 0.16, faceR * 0.22, -0.2, 0, Math.PI * 2); g.fill();
    // sobrancelhas tortas, maldosas
    g.strokeStyle = '#100a14';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - faceR * 0.62, faceY - faceR * 0.42); g.lineTo(cx - faceR * 0.2, faceY - faceR * 0.3); g.stroke();
    g.beginPath(); g.moveTo(cx + faceR * 0.62, faceY - faceR * 0.42); g.lineTo(cx + faceR * 0.2, faceY - faceR * 0.3); g.stroke();
    // boca escancarada = a entrada escura da tenda
    var mg = g.createRadialGradient(cx, faceY + faceR * 0.55, 4, cx, faceY + faceR * 0.55, faceR * 0.62);
    mg.addColorStop(0, 'rgba(4,2,6,0.96)');
    mg.addColorStop(0.65, 'rgba(10,4,10,0.75)');
    mg.addColorStop(1, 'rgba(10,4,10,0)');
    g.fillStyle = mg;
    g.beginPath();
    g.ellipse(cx, faceY + faceR * 0.55, faceR * 0.55, faceR * 0.62, 0, 0, Math.PI * 2);
    g.fill();
    // dentes tortos ao redor da boca
    g.fillStyle = '#e8e2d0';
    for (var ti = -2; ti <= 2; ti++) {
      g.fillRect(cx + ti * faceR * 0.2 - 5, faceY + faceR * 0.18, 10, 14);
    }
    g.restore();
  }

  // --- carrossel-fantasma: cúpula cônica listrada, colunas de suporte e
  // silhuetas de cavalinhos pendurados tortos nas hastes ---
  function paintCarousel(g, r, cx, base, scale) {
    var postH = 150 * scale, domeR = 120 * scale, domeH = 60 * scale;
    var topY = base - postH - domeH;
    g.save();
    // colunas de suporte
    g.strokeStyle = 'rgba(200,182,220,0.55)';
    g.lineWidth = 6 * scale;
    g.lineCap = 'round';
    for (var p = -1; p <= 1; p += 2) {
      g.beginPath();
      g.moveTo(cx + p * domeR * 0.72, base);
      g.lineTo(cx + p * domeR * 0.5, base - postH);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(cx, base);
    g.lineTo(cx, base - postH);
    g.stroke();
    // cúpula cônica listrada vermelho/violeta claro, torta
    var tilt = domeR * 0.12;
    g.beginPath();
    g.moveTo(cx - domeR, base - postH);
    g.lineTo(cx + tilt, topY);
    g.lineTo(cx + domeR, base - postH);
    g.closePath();
    var stripeCols = ['#c8304c', '#8a4aa0'];
    g.save();
    g.clip();
    var nStripe = 9;
    for (var si = 0; si < nStripe; si++) {
      g.fillStyle = stripeCols[si % 2];
      g.globalAlpha = 0.88;
      var sx0 = cx - domeR + si * (domeR * 2 / nStripe);
      g.beginPath();
      g.moveTo(sx0, base - postH);
      g.lineTo(sx0 + domeR * 2 / nStripe, base - postH);
      g.lineTo(cx + tilt, topY);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
    // bandeirola no topo do mastro central
    g.strokeStyle = 'rgba(230,210,240,0.8)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx + tilt, topY); g.lineTo(cx + tilt + 4, topY - 20); g.stroke();
    g.fillStyle = '#e8d8b8';
    g.beginPath();
    g.moveTo(cx + tilt + 4, topY - 20);
    g.lineTo(cx + tilt + 20, topY - 14);
    g.lineTo(cx + tilt + 4, topY - 8);
    g.closePath();
    g.fill();
    // hastes com cavalinhos pendurados tortos, embaixo da cúpula
    var nHorse = 5;
    for (var hi = 0; hi < nHorse; hi++) {
      var hAng = (hi / nHorse) * Math.PI * 2;
      var hx = cx + Math.cos(hAng) * domeR * 0.7;
      var hTopY = base - postH + 6;
      var sway = (r() * 2 - 1) * 10;
      g.strokeStyle = 'rgba(160,150,140,0.6)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(hx, hTopY);
      g.lineTo(hx + sway, hTopY + 34 * scale);
      g.stroke();
      // silhueta torta de cavalinho: corpo + pescoço/cabeça inclinados
      g.save();
      g.translate(hx + sway, hTopY + 34 * scale);
      g.rotate((r() * 2 - 1) * 0.3);
      g.fillStyle = 'rgba(224,214,196,0.78)';
      g.beginPath();
      g.ellipse(0, 10 * scale, 16 * scale, 9 * scale, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(10 * scale, 4 * scale);
      g.quadraticCurveTo(20 * scale, -4 * scale, 16 * scale, -14 * scale);
      g.lineTo(9 * scale, -8 * scale);
      g.closePath();
      g.fill();
      // pernas finas
      g.strokeStyle = 'rgba(224,214,196,0.6)';
      g.lineWidth = 2 * scale;
      g.beginPath(); g.moveTo(-10 * scale, 16 * scale); g.lineTo(-12 * scale, 30 * scale); g.stroke();
      g.beginPath(); g.moveTo(8 * scale, 16 * scale); g.lineTo(10 * scale, 30 * scale); g.stroke();
      g.restore();
    }
    g.restore();
  }

  // --- camada média: mastros de tenda listrados e postes de luz tortos
  // (só decoração) ---
  function paintMid(g) {
    var r = makeRand(202);
    var base = LAYER_H;
    g.fillStyle = 'rgba(30,24,34,0.9)';
    g.fillRect(0, base - 56, 2400, 56);

    // mastros de tenda listrados vermelho/branco, com bandeirola no topo
    for (var s = 0; s < 4; s++) {
      var sx = 200 + s * 620 + r() * 110;
      var sw = 22 + r() * 8, sh = 210 + r() * 150;
      var top = base - sh;
      g.fillStyle = '#2a2020';
      g.fillRect(sx, top, sw, sh);
      // listras vermelho vivo — bem mais claras/saturadas que o poste, para
      // não sumir contra o céu
      g.fillStyle = '#c8324a';
      for (var ly = top; ly < base; ly += 26) {
        g.fillRect(sx, ly, sw, 13);
      }
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(sx + 2, top, 3, sh);
      // bandeirola torta
      g.strokeStyle = 'rgba(230,210,240,0.7)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(sx + sw / 2, top);
      g.lineTo(sx + sw / 2 + 6, top - 26);
      g.stroke();
      g.fillStyle = '#d8384f';
      g.beginPath();
      g.moveTo(sx + sw / 2 + 6, top - 26);
      g.lineTo(sx + sw / 2 + 30, top - 18);
      g.lineTo(sx + sw / 2 + 6, top - 10);
      g.closePath();
      g.fill();
      // fenda escura de tenda ao pé do mastro
      g.fillStyle = 'rgba(8,3,6,0.75)';
      g.beginPath();
      g.ellipse(sx + sw * 0.5, base - sh * 0.42, 13 + r() * 8, 26 + r() * 16, 0, 0, Math.PI * 2);
      g.fill();
    }

    // postes de luz tortos, lâmpada apagando/piscando — DECORAÇÃO de fundo
    for (var i = 0; i < 7; i++) {
      var mx = 120 + i * 335 + r() * 100;
      var mh = 190 + r() * 90;
      var top = base - mh;
      var lean = (r() * 2 - 1) * 18;
      g.strokeStyle = '#241c22';
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(mx, base);
      g.quadraticCurveTo(mx + lean * 0.5, base - mh * 0.5, mx + lean, top);
      g.stroke();
      g.strokeStyle = '#241c22';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(mx + lean, top);
      g.lineTo(mx + lean + 26, top - 14);
      g.stroke();
      // globo da lâmpada — algumas quase apagadas, outras ainda vivas e bem
      // mais claras/contrastadas contra o céu escuro
      var lit2 = (i % 3 !== 1);
      g.save();
      if (lit2) {
        g.shadowColor = 'rgba(220,255,150,0.9)';
        g.shadowBlur = 10;
        g.fillStyle = 'rgba(230,255,170,0.85)';
      } else {
        g.fillStyle = 'rgba(150,190,110,0.22)';
      }
      g.beginPath();
      g.arc(mx + lean + 30, top - 18, 10, 0, Math.PI * 2);
      g.fill();
      g.restore();
      // cacho de balões preso no poste — cada dois postes
      if (i % 2 === 0) {
        paintBalloonCluster(g, r, mx + lean - 4, top + 4);
      }
    }

    // barraca de pipoca/algodão-doce, com toldo listrado e balcão
    paintPopcornStand(g, r, 900, base);
    paintPopcornStand(g, r, 1980, base);

    // arbustos retorcidos e ressecados entre os mastros
    g.strokeStyle = '#1c241a';
    g.fillStyle = '#1c241a';
    for (var t2 = 0; t2 < 4; t2++) {
      var tx = 260 + t2 * 580 + r() * 120;
      g.beginPath();
      g.moveTo(tx - 12, base);
      g.quadraticCurveTo(tx - 4, base - 130, tx + (r() * 2 - 1) * 26 - 6, base - 190);
      g.lineTo(tx + (r() * 2 - 1) * 26 + 8, base - 190);
      g.quadraticCurveTo(tx + 8, base - 120, tx + 16, base);
      g.closePath();
      g.fill();
    }
  }

  // --- cacho de balões tortos presos por barbantes, cores vivas dentro da
  // paleta sombria (vermelho/roxo/verde-doente) ---
  function paintBalloonCluster(g, r, x, y) {
    var cols = ['#c8304c', '#8a4aa0', '#6a9a3c'];
    var n = 3;
    g.save();
    g.strokeStyle = 'rgba(200,200,190,0.5)';
    g.lineWidth = 1.2;
    for (var i = 0; i < n; i++) {
      var bx = x + (i - 1) * 9 + (r() * 2 - 1) * 4;
      var by = y - 18 - i * 6;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (bx - x) * 0.5, y - 10, bx, by + 8);
      g.stroke();
      g.fillStyle = cols[i % cols.length];
      g.globalAlpha = 0.85;
      g.beginPath();
      g.ellipse(bx, by, 7, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    g.restore();
  }

  // --- barraca de pipoca/algodão-doce: toldo listrado vermelho-branco
  // sobre um balcão de madeira, tipo barraca de feira ---
  function paintPopcornStand(g, r, cx, base) {
    var w = 130, h = 70, topY = base - h;
    g.save();
    // balcão
    g.fillStyle = '#3a2a1c';
    g.fillRect(cx - w / 2, topY + 30, w, h - 30);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(cx - w / 2, topY + 30, w, 6);
    // postes do toldo
    g.strokeStyle = '#241a12';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(cx - w / 2 + 6, base); g.lineTo(cx - w / 2 + 6, topY); g.stroke();
    g.beginPath(); g.moveTo(cx + w / 2 - 6, base); g.lineTo(cx + w / 2 - 6, topY); g.stroke();
    // toldo listrado, pontas em zigue-zague
    var nz = 6, zw = w / nz;
    g.fillStyle = '#c8324a';
    g.beginPath();
    g.moveTo(cx - w / 2, topY);
    for (var zi = 0; zi < nz; zi++) {
      var zx0 = cx - w / 2 + zi * zw, zx1 = zx0 + zw;
      g.lineTo(zx0 + zw / 2, topY + (zi % 2 === 0 ? -18 : -10));
      g.lineTo(zx1, topY);
    }
    g.lineTo(cx + w / 2, topY - 26);
    g.lineTo(cx - w / 2, topY - 26);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (var si2 = 0; si2 < nz; si2 += 2) {
      g.fillRect(cx - w / 2 + si2 * zw, topY - 26, zw, 26);
    }
    g.restore();
  }

  // --- névoa entre os níveis: duas faixas frias e densas que separam os
  // patamares — o mofo do parque abandonado ---
  function paintMist(g) {
    var r = makeRand(505);
    var base = LAYER_H;
    var bands = [base - 380, base - 170];
    for (var i = 0; i < bands.length; i++) {
      var by = bands[i], bh = 100 + i * 44;
      var gr = g.createLinearGradient(0, by - bh * 0.5, 0, by + bh * 0.5);
      gr.addColorStop(0, 'rgba(120,150,110,0)');
      gr.addColorStop(0.5, 'rgba(120,150,110,' + (0.22 + i * 0.07).toFixed(2) + ')');
      gr.addColorStop(1, 'rgba(120,150,110,0)');
      g.fillStyle = gr;
      g.fillRect(0, by - bh * 0.5, 1600, bh);
      // bolsões mais densos, para a faixa não parecer uma régua
      g.fillStyle = 'rgba(150,190,140,0.13)';
      for (var k = 0; k < 9; k++) {
        var px = r() * 1600, pw = 90 + r() * 190, ph = 20 + r() * 34;
        g.beginPath();
        g.ellipse(px, by + (r() * 2 - 1) * 22, pw, ph, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // --- camada próxima: arbustos secos e cercas quebradas do parque ---
  function paintNear(g) {
    var r = makeRand(303);
    var base = LAYER_H;
    g.fillStyle = '#131c13';
    g.fillRect(0, base - 82, 2400, 82);
    g.fillStyle = '#182418';
    for (var i = 0; i < 16; i++) {
      var bx = i * 150 + r() * 80, by = base - 70 - r() * 30;
      for (var b = 0; b < 3; b++) {
        g.beginPath();
        g.arc(bx + b * 26 - 26, by + r() * 14, 26 + r() * 20, 0, Math.PI * 2);
        g.fill();
      }
    }
    // galhos secos espetados, sem folha — moitas mortas do parque
    g.strokeStyle = '#242f20';
    g.lineCap = 'round';
    for (var f = 0; f < 14; f++) {
      var fx = 40 + f * 170 + r() * 90, fy = base - 24;
      var nfr = 4 + Math.floor(r() * 3);
      for (var k = 0; k < nfr; k++) {
        var dir = (k % 2 === 0 ? 1 : -1);
        var len = 50 + r() * 50;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(fx, fy);
        g.quadraticCurveTo(fx + dir * len * 0.35, fy - len, fx + dir * len, fy - len * 0.55);
        g.stroke();
      }
    }
    // cerca de estacas tortas quebrando o horizonte, de vez em quando
    g.strokeStyle = 'rgba(60,50,44,0.7)';
    g.lineWidth = 5;
    for (var s3 = 0; s3 < 6; s3++) {
      var px2 = 90 + s3 * 380 + r() * 120, ph2 = 30 + r() * 18;
      var tilt = (r() * 2 - 1) * 8;
      g.beginPath();
      g.moveTo(px2, base - 4);
      g.lineTo(px2 + tilt, base - 4 - ph2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(70,90,60,0.55)';
    g.lineWidth = 2;
    for (var s2 = 0; s2 < 40; s2++) {
      var gx = r() * 2400, gy = base - 6;
      g.beginPath();
      g.moveTo(gx, gy);
      g.quadraticCurveTo(gx + (r() * 2 - 1) * 8, gy - 16, gx + (r() * 2 - 1) * 16, gy - 26 - r() * 12);
      g.stroke();
    }
  }

  // --- primeiro plano: silhuetas escuras embaixo + galhos retorcidos e
  // teias de aranha penduradas no alto ---
  function paintFront(g) {
    var r = makeRand(404);
    var base = LAYER_H;
    g.fillStyle = '#050a06';
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
    g.fillStyle = '#08100a';
    g.fillRect(0, base - 34, 1800, 34);
    g.strokeStyle = '#060c07';
    g.fillStyle = '#060c07';
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
      }
      // teia de aranha entre dois pontos do galho
      g.strokeStyle = 'rgba(210,220,210,0.28)';
      g.lineWidth = 1.4;
      var wcx = hx + 40, wcy = 176, wr = 34;
      for (var sp = 0; sp < 6; sp++) {
        var ang = (sp / 6) * Math.PI * 2;
        g.beginPath();
        g.moveTo(wcx, wcy);
        g.lineTo(wcx + Math.cos(ang) * wr, wcy + Math.sin(ang) * wr);
        g.stroke();
      }
      for (var ring = 1; ring <= 2; ring++) {
        g.beginPath();
        for (var sp2 = 0; sp2 <= 6; sp2++) {
          var ang2 = (sp2 / 6) * Math.PI * 2;
          var rr = wr * (ring / 2.4);
          var px3 = wcx + Math.cos(ang2) * rr, py3 = wcy + Math.sin(ang2) * rr;
          if (sp2 === 0) g.moveTo(px3, py3); else g.lineTo(px3, py3);
        }
        g.stroke();
      }
    }

    // varal de luzes penduradas atravessando o topo do campo de visão, de
    // poste a poste — a assinatura mais reconhecível de parque de diversões
    // em primeiro plano; alpha baixo pra não competir com o gameplay, mas
    // com cor viva o bastante pra ler como luz
    var postsX = [10, 460, 910, 1360, 1800];
    g.save();
    for (var pi = 0; pi < postsX.length - 1; pi++) {
      var ax = postsX[pi], bx2 = postsX[pi + 1];
      var ay = 46 + (r() * 2 - 1) * 8, by2 = 46 + (r() * 2 - 1) * 8;
      var sagY = 30 + r() * 18;
      var midx = (ax + bx2) / 2, midy = Math.max(ay, by2) + sagY;
      // o fio do cordão
      g.strokeStyle = 'rgba(30,26,18,0.6)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(ax, ay);
      g.quadraticCurveTo(midx, midy, bx2, by2);
      g.stroke();
      // bulbos ao longo da curva, alternando aceso/apagado
      var nb2 = 9;
      for (var bi = 0; bi <= nb2; bi++) {
        var tt = bi / nb2;
        var bx3 = ax + (bx2 - ax) * tt;
        var by3 = (1 - tt) * (1 - tt) * ay + 2 * (1 - tt) * tt * midy + tt * tt * by2;
        var on = (bi + pi) % 3 !== 0;
        g.save();
        if (on) {
          g.shadowColor = 'rgba(255,205,90,0.9)';
          g.shadowBlur = 8;
          g.fillStyle = 'rgba(255,214,120,0.55)';
        } else {
          g.fillStyle = 'rgba(120,90,50,0.3)';
        }
        g.beginPath();
        g.arc(bx3, by3 + 5, 3.4, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    g.restore();
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
  // UPDATE — coleta de lumis e faíscas (a mecânica é do kit; o parque não
  // tem coletável próprio além das lumis)
  // ---------------------------------------------------------------
  function update(dt) {
    kit.coletarLumis(lumis, sparks, dt);
  }

  // ---------------------------------------------------------------
  // DRAW BACK — céu, lua, camadas de parallax, névoa, raios, faíscas de
  // abóbora flutuando (no lugar dos antigos vagalumes)
  // ---------------------------------------------------------------
  function drawBack(ctx, cam) {
    buildAll();
    var t = FG.engine.time;

    ctx.drawImage(skySpr, 0, 0);

    // lua difusa, quase fixa no céu
    var sx = 700 - cam.x * 0.04, sy = 150 - cam.y * 0.06;
    ctx.drawImage(sunSpr, sx - 140, sy - 140);

    drawLayer(ctx, farL, 0.2, cam);

    // feixes de luz coados pela névoa, pulsando devagar
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 0.6);
    drawLayer(ctx, raysL, 0.3, cam);
    ctx.restore();

    drawLayer(ctx, midL, 0.45, cam);

    // faíscas de abóbora flutuando (chama de vela tremeluzindo, não vaga-lume)
    // — a maioria laranja, um terço fogo-fátuo verde-doentio, pra reforçar
    // a atmosfera de parque assombrado
    ctx.save();
    for (var i = 0; i < 26; i++) {
      var fx = (((i * 397 + Math.sin(t * 0.3 + i) * 40) - cam.x * 0.55) % 1040 + 1040) % 1040 - 40;
      var fy = 90 + (i * 211) % 330 + Math.sin(t * 0.9 + i * 1.7) * 22 - cam.y * 0.5;
      var flicker = Math.sin(t * 9 + i * 3.1) * 0.5 + 0.5;
      var a = (0.28 + 0.26 * Math.sin(t * 2.1 + i * 2.3)) * (0.6 + 0.4 * flicker);
      if (a <= 0.05) continue;
      var green = (i % 3 === 0);
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = green ? '#4aff8a' : '#ff9a2e';
      ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a;
      ctx.fillStyle = green ? '#d8ffc8' : '#ffe07a';
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

  // --- plataforma de terra com topo de musgo doentio ---
  function drawTerrain(ctx, s, d) {
    ctx.fillStyle = '#2c241a';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    if (s.h > 20) {
      ctx.fillStyle = 'rgba(8,6,4,0.4)';
      ctx.fillRect(s.x, s.y + s.h - 10, s.w, 10);
    }
    ctx.fillStyle = 'rgba(14,10,6,0.55)';
    for (var i = 0; i < d.spots.length; i++) {
      var sp = d.spots[i];
      ctx.beginPath();
      ctx.ellipse(s.x + sp.dx, s.y + sp.dy, sp.rad * 1.6, sp.rad, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#3a4a22';
    ctx.fillRect(s.x - 3, s.y - 2, s.w + 6, 14);
    ctx.fillStyle = '#5a7a2e';
    ctx.fillRect(s.x - 3, s.y - 2, s.w + 6, 7);
    ctx.fillStyle = 'rgba(200,220,180,0.28)';
    ctx.fillRect(s.x - 3, s.y - 2, s.w + 6, 2);
    ctx.fillStyle = '#3a4a22';
    ctx.beginPath(); ctx.arc(s.x - 1, s.y + 15, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s.x + s.w + 1, s.y + 17, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6a8a3a';
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

  // --- pedra escura ---
  function drawRock(ctx, s, d) {
    ctx.fillStyle = '#33362e';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + s.h);
    ctx.lineTo(s.x + 4, s.y + 6);
    ctx.quadraticCurveTo(s.x + s.w / 2, s.y - 6, s.x + s.w - 4, s.y + 6);
    ctx.lineTo(s.x + s.w, s.y + s.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(160,200,130,0.14)';
    ctx.fillRect(s.x + 4, s.y + 2, s.w - 8, 4);
    ctx.fillStyle = 'rgba(6,5,4,0.5)';
    for (var i = 0; i < d.spots.length; i++) {
      var sp = d.spots[i];
      ctx.beginPath();
      ctx.arc(s.x + sp.dx, s.y + sp.dy, sp.rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- poça de lodo/óleo do parque abandonado, com bolhas ---
  function drawPool(ctx, hz, t) {
    var bot = hz.y + hz.h + 22;
    ctx.fillStyle = '#100e0a';
    ctx.fillRect(hz.x, hz.y, hz.w, bot - hz.y);
    ctx.fillStyle = 'rgba(70,60,30,0.5)';
    ctx.fillRect(hz.x, hz.y, hz.w, 10);
    ctx.save();
    ctx.strokeStyle = '#5a6e34';
    ctx.lineWidth = 3;
    ctx.beginPath();
    var step = 18;
    ctx.moveTo(hz.x, hz.y + Math.sin(t * 2 + hz.x * 0.05) * 2);
    for (var x = hz.x + step; x <= hz.x + hz.w; x += step) {
      ctx.lineTo(x, hz.y + Math.sin(t * 2 + x * 0.05) * 2.4);
    }
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.restore();
    // manchas de óleo iridescente boiando
    ctx.save();
    ctx.globalAlpha = 0.22;
    for (var o = 0; o < 3; o++) {
      var ox = hz.x + 14 + (o * 91 + Math.sin(t * 0.6 + o) * 10) % Math.max(1, hz.w - 28);
      var og = ctx.createRadialGradient(ox, hz.y + 5, 1, ox, hz.y + 5, 22);
      og.addColorStop(0, 'rgba(140,110,190,0.5)');
      og.addColorStop(0.5, 'rgba(90,150,120,0.35)');
      og.addColorStop(1, 'rgba(90,150,120,0)');
      ctx.fillStyle = og;
      ctx.beginPath();
      ctx.ellipse(ox, hz.y + 5, 22, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.fillStyle = '#6a7a3a';
    var nb = Math.max(2, Math.floor(hz.w / 70));
    for (var i = 0; i < nb; i++) {
      var bx = hz.x + 12 + (i * 83) % (hz.w - 24);
      var per = (t * 0.45 + i * 0.37) % 1;
      var by = bot - 4 - per * (bot - hz.y - 6);
      ctx.globalAlpha = 0.6 * (1 - per);
      ctx.beginPath();
      ctx.arc(bx, by, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 2.4 + hz.x);
    ctx.fillStyle = '#4a5a28';
    ctx.fillRect(hz.x, hz.y - 3, hz.w, 3);
    ctx.restore();
  }

  // --- cerca de arame farpado (mesma hitbox/dimensão dos antigos espinhos) ---
  function drawSpikes(ctx, hz) {
    var n = Math.max(3, Math.round(hz.w / 40));
    var sw = hz.w / n;
    // dois mourões de madeira nas pontas + arames esticados
    ctx.fillStyle = '#1c1712';
    ctx.fillRect(hz.x, hz.y + hz.h - 5, hz.w, 5);
    ctx.strokeStyle = '#3a3228';
    ctx.lineWidth = 3;
    for (var pxi = 0; pxi <= n; pxi++) {
      var px = hz.x + pxi * sw;
      ctx.beginPath();
      ctx.moveTo(px, hz.y);
      ctx.lineTo(px, hz.y + hz.h);
      ctx.stroke();
    }
    // três arames horizontais farpados
    ctx.strokeStyle = '#8a8a80';
    ctx.lineWidth = 2;
    for (var wy = 0; wy < 3; wy++) {
      var ly = hz.y + 4 + wy * (hz.h - 8) / 2;
      ctx.beginPath();
      ctx.moveTo(hz.x, ly + Math.sin(hz.x * 0.1 + wy) * 1.5);
      for (var x2 = hz.x + 6; x2 <= hz.x + hz.w; x2 += 6) {
        ctx.lineTo(x2, ly + Math.sin(x2 * 0.4 + wy) * 1.5);
      }
      ctx.stroke();
      // farpas
      ctx.strokeStyle = '#b8b8ae';
      ctx.lineWidth = 1.4;
      for (var fx = hz.x + 5; fx < hz.x + hz.w; fx += 13) {
        ctx.beginPath();
        ctx.moveTo(fx - 3, ly - 3); ctx.lineTo(fx + 3, ly + 3);
        ctx.moveTo(fx - 3, ly + 3); ctx.lineTo(fx + 3, ly - 3);
        ctx.stroke();
      }
      ctx.strokeStyle = '#8a8a80';
    }
  }

  // --- abóbora-lanterna (jack-o'-lantern) checkpoint (acesa quando é o
  // checkpoint atual) — mesma assinatura de função que a antiga lanterna. ---
  function drawLantern(ctx, cp, lit, t) {
    var x = cp.x, y = cp.y;
    // estaca de madeira apoiando a abóbora
    ctx.fillStyle = '#2a2018';
    ctx.fillRect(x - 3, y - 40, 6, 40);
    ctx.fillStyle = '#1c1610';
    ctx.fillRect(x - 8, y - 4, 16, 4);
    // corpo da abóbora
    var pr = 18;
    var pg = ctx.createRadialGradient(x - 5, y - 46, 3, x, y - 42, pr + 4);
    if (lit) {
      pg.addColorStop(0, '#ff9a2e');
      pg.addColorStop(1, '#c85a10');
    } else {
      pg.addColorStop(0, '#5a4020');
      pg.addColorStop(1, '#3a2a14');
    }
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.ellipse(x, y - 42, pr, pr * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
    // gomos da abóbora
    ctx.strokeStyle = lit ? 'rgba(120,40,4,0.5)' : 'rgba(10,6,2,0.5)';
    ctx.lineWidth = 1.6;
    for (var gi = -1; gi <= 1; gi++) {
      ctx.beginPath();
      ctx.ellipse(x + gi * pr * 0.5, y - 42, pr * 0.32, pr * 0.86, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // cabinho verde torto
    ctx.strokeStyle = '#3a4a1e';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - 42 - pr * 0.86);
    ctx.quadraticCurveTo(x + 4, y - 42 - pr * 0.86 - 8, x - 2, y - 42 - pr * 0.86 - 14);
    ctx.stroke();
    if (lit) {
      var fl = 0.8 + 0.2 * Math.sin(t * 9 + Math.sin(t * 5.3));
      ctx.save();
      ctx.shadowColor = '#ff9a2e';
      ctx.shadowBlur = 22 * fl;
      ctx.fillStyle = '#ffe07a';
      // olhos e boca triangulares vazados, brilhando por dentro
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 48); ctx.lineTo(x - 4, y - 48); ctx.lineTo(x - 7, y - 41); ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 4, y - 48); ctx.lineTo(x + 10, y - 48); ctx.lineTo(x + 7, y - 41); ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 34);
      ctx.lineTo(x - 3, y - 38); ctx.lineTo(x, y - 34); ctx.lineTo(x + 3, y - 38);
      ctx.lineTo(x + 9, y - 34); ctx.lineTo(x + 6, y - 30); ctx.lineTo(x - 6, y - 30);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      // rosto escuro, apagado
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 48); ctx.lineTo(x - 4, y - 48); ctx.lineTo(x - 7, y - 41); ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 4, y - 48); ctx.lineTo(x + 10, y - 48); ctx.lineTo(x + 7, y - 41); ctx.closePath();
      ctx.fill();
    }
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
    id: 'parque',
    nome: 'Parque do Terror',
    musica: 'overworld',
    W: W,
    H: H,
    playerStart: { x: 80, y: 560 },
    solids: solids,
    hazards: hazards,
    checkpoints: checkpoints,
    enemyDefs: enemyDefs,
    obstacleDefs: obstacleDefs,
    bossId: 'hugo',
    bossTriggerX: 6350,
    arena: { x: 6200, w: 1000 },
    reset: reset,
    update: update,
    drawBack: drawBack,
    drawSolids: drawSolids,
    drawFront: drawFront,
  });
})();
