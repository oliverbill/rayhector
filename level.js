// Fagulho: Lendas do Bosque — level.js
// FG.level: geometria do mundo, lumis, checkpoints, inimigos (defs) e todo o
// visual pintado do bosque encantado (céu, parallax, plataformas orgânicas).
// Nada aqui referencia FG.player/FG.engine/FG.audio no load — só em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  var VIEW_W = 960, VIEW_H = 540;
  var W = 7200, H = 720;
  var CAM_Y_MAX = H - VIEW_H; // 180 — usado no parallax vertical

  // ---------------------------------------------------------------
  // RNG determinístico (as camadas e a decoração saem iguais sempre)
  // ---------------------------------------------------------------
  function makeRand(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ---------------------------------------------------------------
  // GEOMETRIA — sólidos
  // k: 'g' = terra/musgo, 'm' = cogumelo, 'r' = pedra, 'h' = piso oculto
  // (piso oculto: fundo das poças venenosas, não é desenhado)
  // Ritmo: tutorial → poça venenosa → escada de cogumelos → descida →
  // reta final → clareira do Dragomilão. Tudo alcançável com pulo duplo.
  // ---------------------------------------------------------------
  function S(x, y, w, h, k) { return { x: x, y: y, w: w, h: h, k: k || 'g' }; }

  var solids = [
    // (1) tutorial — chão plano, degraus suaves, sem inimigos
    S(0, 620, 1180, 100, 'g'),
    S(160, 588, 70, 32, 'r'),
    S(300, 572, 100, 48, 'r'),
    S(540, 528, 150, 28, 'g'),
    S(700, 452, 110, 24, 'g'),
    S(880, 500, 140, 26, 'g'),
    S(920, 380, 110, 22, 'g'),      // bônus alto (ensina o pulo duplo)
    S(1060, 552, 100, 26, 'g'),
    // fosso A — poça pequena (piso oculto no fundo)
    S(1180, 724, 140, 40, 'h'),
    // chão do primeiro checkpoint
    S(1320, 620, 560, 100, 'g'),
    // (2) poça venenosa grande com plataformas flutuantes
    S(1880, 724, 960, 40, 'h'),
    S(1950, 560, 130, 26, 'g'),
    S(2160, 514, 125, 24, 'g'),
    S(2370, 556, 130, 26, 'g'),
    S(2580, 510, 125, 24, 'g'),
    S(2740, 564, 90, 26, 'g'),
    S(2300, 424, 120, 22, 'g'),     // bônus alto sobre a poça (94px acima do vizinho)
    // chão entre a poça e a escada
    S(2840, 620, 560, 100, 'g'),
    S(2870, 580, 60, 40, 'r'),
    S(3080, 540, 110, 26, 'g'),
    // (3) escada de cogumelos gigantes
    S(3300, 545, 150, 24, 'm'),
    S(3500, 470, 140, 24, 'm'),
    S(3660, 490, 220, 36, 'g'),     // patamar do checkpoint 2
    S(3440, 380, 100, 22, 'm'),     // bônus da escada
    S(3760, 430, 100, 22, 'm'),
    S(3920, 410, 140, 24, 'm'),
    S(4090, 330, 130, 24, 'm'),
    S(4180, 280, 300, 40, 'g'),     // cume
    S(4280, 170, 120, 22, 'm'),     // bônus do cume
    // (4) descida longa com plataformas espaçadas
    S(4540, 360, 130, 26, 'g'),
    S(4700, 260, 110, 22, 'm'),     // bônus da descida
    S(4740, 430, 130, 26, 'g'),
    S(4950, 500, 130, 26, 'g'),
    S(5060, 400, 100, 22, 'm'),     // bônus da descida
    S(5160, 560, 140, 26, 'g'),
    S(5240, 500, 90, 22, 'g'),      // caminho alternativo
    // (5) reta final
    S(5330, 620, 580, 100, 'g'),
    S(5560, 530, 130, 26, 'g'),     // passa por cima dos espinhos
    // poça pré-clareira
    S(5910, 724, 120, 40, 'h'),
    // clareira do Dragomilão — plana
    S(6030, 620, 1170, 100, 'g'),
  ];

  // ---------------------------------------------------------------
  // HAZARDS — t: 's' = espinhos, 'p' = poça venenosa
  // As poças ficam no fundo dos buracos maiores, sobre o piso oculto.
  // ---------------------------------------------------------------
  function Hz(x, y, w, h, t) { return { x: x, y: y, w: w, h: h, t: t }; }

  var hazards = [
    Hz(1560, 596, 90, 24, 's'),
    Hz(2940, 596, 100, 24, 's'),
    Hz(4300, 256, 70, 24, 's'),     // espinhos no cume
    Hz(5620, 596, 90, 24, 's'),
    Hz(1180, 700, 140, 24, 'p'),
    Hz(1880, 698, 960, 26, 'p'),
    Hz(5910, 700, 120, 24, 'p'),
  ];

  // 3 lanternas-checkpoint (acendem quando ativadas)
  var checkpoints = [
    { x: 1800, y: 620 },
    { x: 3700, y: 490 },   // no patamar da escada de cogumelos
    { x: 5400, y: 620 },
  ];

  // ---------------------------------------------------------------
  // INIMIGOS — nenhum antes de x=900 (tutorial limpo)
  // ---------------------------------------------------------------
  var enemyDefs = [
    { type: 'voadeira',  x: 1250, y: 520, range: 100 },
    { type: 'espinhoco', x: 1420, y: 590, range: 70 },
    { type: 'sapeca',    x: 1700, y: 590, range: 60 },
    { type: 'voadeira',  x: 2120, y: 440, range: 150 },
    { type: 'voadeira',  x: 2520, y: 420, range: 150 },
    { type: 'espinhoco', x: 3230, y: 590, range: 90 },
    { type: 'voadeira',  x: 3700, y: 300, range: 160 },
    { type: 'voadeira',  x: 4620, y: 280, range: 170 },
    { type: 'voadeira',  x: 4900, y: 400, range: 170 },
    { type: 'sapeca',    x: 5500, y: 590, range: 90 },
    { type: 'espinhoco', x: 5790, y: 590, range: 80 },
    { type: 'sapeca',    x: 6120, y: 590, range: 50 },
  ];

  // ---------------------------------------------------------------
  // LUMIS — linhas e arcos que ensinam o caminho (~95)
  // ---------------------------------------------------------------
  var lumis = [];
  function lumiLine(x, y, n, dx) {
    for (var i = 0; i < n; i++) lumis.push({ x: x + i * dx, y: y, ph: lumis.length * 0.7, taken: false });
  }
  function lumiArc(cx, apexY, n, span, sag) {
    for (var i = 0; i < n; i++) {
      var t = n > 1 ? i / (n - 1) - 0.5 : 0;
      lumis.push({ x: cx + t * span, y: apexY + sag * 4 * t * t, ph: lumis.length * 0.7, taken: false });
    }
  }
  // tutorial
  lumiLine(150, 578, 6, 58);
  lumiArc(615, 462, 5, 200, 46);
  lumiLine(712, 410, 4, 30);
  lumiLine(892, 456, 4, 36);
  lumiLine(932, 336, 3, 36);
  // fosso A e espinhos 1
  lumiArc(1250, 540, 5, 160, 50);
  lumiArc(1605, 538, 4, 140, 40);
  // poça grande
  lumiArc(2035, 468, 4, 160, 40);
  lumiArc(2330, 462, 4, 170, 40);
  lumiArc(2650, 460, 4, 170, 40);
  lumiLine(2315, 380, 4, 32);
  // espinhos 2
  lumiArc(2985, 530, 4, 150, 40);
  // escada de cogumelos (um par por chapéu)
  lumiLine(3340, 500, 2, 60);
  lumiLine(3535, 425, 2, 60);
  lumiLine(3720, 445, 2, 70);
  lumiLine(3955, 365, 2, 60);
  lumiLine(4120, 285, 2, 60);
  lumiLine(3452, 336, 3, 32);
  // cume
  lumiLine(4205, 232, 5, 54);
  lumiLine(4292, 126, 3, 42);
  // descida
  lumiArc(4705, 330, 4, 150, 36);
  lumiArc(4910, 400, 4, 150, 36);
  lumiArc(5120, 468, 4, 150, 36);
  lumiLine(4712, 216, 3, 36);
  lumiLine(5072, 356, 3, 32);
  // reta final e clareira
  lumiLine(5380, 578, 4, 52);
  lumiLine(5582, 486, 3, 40);
  lumiArc(5970, 548, 5, 140, 44);
  lumiLine(6070, 572, 3, 56);

  // ---------------------------------------------------------------
  // FAÍSCAS — brilho de despedida da lumi coletada (pool fixo, sem GC)
  // ---------------------------------------------------------------
  var sparks = [];
  for (var si = 0; si < 64; si++) sparks.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1 });
  var sparkIdx = 0;
  function burst(x, y) {
    for (var i = 0; i < 6; i++) {
      var p = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparks.length;
      var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 70;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 40;
      p.max = 0.45 + Math.random() * 0.25;
      p.life = p.max;
    }
  }

  // ---------------------------------------------------------------
  // DECORAÇÃO por sólido (pré-computada: nada de random por frame)
  // ---------------------------------------------------------------
  var mushCols = ['#c94f38', '#d8783a', '#b8503f', '#c86a2e'];
  var decor = [];
  (function () {
    var r = makeRand(20260815);
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i], d = { tufts: [], spots: [], dots: [], col: null };
      if (s.k === 'm') {
        d.col = mushCols[i % mushCols.length];
        var nd = 3 + Math.floor(r() * 3);
        for (var j = 0; j < nd; j++) {
          d.dots.push({ dx: 10 + r() * (s.w - 20), dy: -4 - r() * 14, rad: 2.5 + r() * 3.5 });
        }
      } else if (s.k === 'g') {
        var nt = Math.max(3, Math.floor(s.w / 55));
        for (var j2 = 0; j2 < nt; j2++) {
          d.tufts.push({ dx: r() * s.w, len: 7 + r() * 9, lean: r() * 2 - 1 });
        }
        if (s.h > 34) {
          var ns = 1 + Math.floor(s.w / 120);
          for (var j3 = 0; j3 < ns; j3++) {
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
  // OFFSCREENS — céu, sol, camadas de parallax, vinheta, sprite da lumi
  // Construídos uma única vez, no primeiro draw.
  // ---------------------------------------------------------------
  var built = false;
  var skySpr, sunSpr, raysL, farL, midL, nearL, frontL, vig, lumiSpr;
  var LAYER_H = 680;

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

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

    // sprite da lumi (halo dourado + núcleo)
    lumiSpr = makeCanvas(36, 36);
    (function (g) {
      var gr = g.createRadialGradient(18, 18, 1, 18, 18, 18);
      gr.addColorStop(0, 'rgba(255,250,225,1)');
      gr.addColorStop(0.28, 'rgba(255,215,110,0.95)');
      gr.addColorStop(0.6, 'rgba(255,175,50,0.35)');
      gr.addColorStop(1, 'rgba(255,160,40,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 36, 36);
    })(lumiSpr.getContext('2d'));
  }

  // --- camada distante: morros e árvores retorcidas em silhueta roxa ---
  function paintFar(g) {
    var r = makeRand(101);
    var base = LAYER_H;
    // dois cordões de morros
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
      // galhos tortos
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
      // copa em blobs
      for (var c = 0; c < 3; c++) {
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

  // --- camada média: cogumelos gigantes e troncos ---
  function paintMid(g) {
    var r = makeRand(202);
    var base = LAYER_H;
    g.fillStyle = 'rgba(49,32,62,0.9)';
    g.fillRect(0, base - 56, 2400, 56);
    for (var i = 0; i < 7; i++) {
      var mx = 120 + i * 335 + r() * 100;
      var mh = 190 + r() * 140;
      var capW = 110 + r() * 70, capH = 46 + r() * 26;
      var top = base - mh;
      // talo
      g.fillStyle = '#41284e';
      g.beginPath();
      g.moveTo(mx - 16, base);
      g.quadraticCurveTo(mx - 10, top + capH, mx - 12, top + capH * 0.7);
      g.lineTo(mx + 12, top + capH * 0.7);
      g.quadraticCurveTo(mx + 10, top + capH, mx + 20, base);
      g.closePath();
      g.fill();
      // chapéu
      g.fillStyle = '#54305e';
      g.beginPath();
      g.ellipse(mx, top + capH, capW, capH, 0, Math.PI, Math.PI * 2);
      g.closePath();
      g.fill();
      // luz de contorno do crepúsculo
      g.strokeStyle = 'rgba(255,165,90,0.35)';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(mx, top + capH, capW - 2, capH - 2, 0, Math.PI * 1.05, Math.PI * 1.6);
      g.stroke();
      // pintas
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

  // --- camada próxima: arbustos e samambaias ---
  function paintNear(g) {
    var r = makeRand(303);
    var base = LAYER_H;
    g.fillStyle = '#132917';
    g.fillRect(0, base - 82, 2400, 82);
    // arbustos em blobs
    g.fillStyle = '#16301c';
    for (var i = 0; i < 16; i++) {
      var bx = i * 150 + r() * 80, by = base - 70 - r() * 30;
      for (var b = 0; b < 3; b++) {
        g.beginPath();
        g.arc(bx + b * 26 - 26, by + r() * 14, 26 + r() * 20, 0, Math.PI * 2);
        g.fill();
      }
    }
    // samambaias: frondes em arco
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
    // fios de capim iluminados
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
    // folhas grandes pontudas na borda inferior
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
    // galhos pendentes no topo (aparecem quando a câmera está embaixo)
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
  // UPDATE — coleta de lumis, faíscas, reset em jogo novo
  // ---------------------------------------------------------------
  var anyTaken = false;

  function update(dt) {
    var eng = FG.engine, p = FG.player;

    // jogo novo (o engine zera o contador): reacende todas as lumis
    if (anyTaken && eng.lumis === 0) {
      for (var r0 = 0; r0 < lumis.length; r0++) lumis[r0].taken = false;
      anyTaken = false;
    }

    // coleta por proximidade do centro do player
    var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    for (var i = 0; i < lumis.length; i++) {
      var l = lumis[i];
      if (l.taken) continue;
      var dx = l.x - cx, dy = l.y - cy;
      if (dx * dx + dy * dy < 28 * 28) {
        l.taken = true;
        anyTaken = true;
        eng.addLumi();
        FG.audio.sfx('lumi');
        burst(l.x, l.y);
      }
    }

    // faíscas de despedida
    for (var s2 = 0; s2 < sparks.length; s2++) {
      var sp = sparks[s2];
      if (sp.life <= 0) continue;
      sp.life -= dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy -= 30 * dt; // faísca sobe de leve
    }
  }

  // ---------------------------------------------------------------
  // DRAW BACK — céu, sol, 3 camadas de parallax, raios, vagalumes
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

    drawLayer(ctx, nearL, 0.7, cam);
  }

  // ---------------------------------------------------------------
  // DRAW SOLIDS — poças, plataformas orgânicas, espinhos, lanternas,
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
      if (s.k === 'm') drawMush(ctx, s, d);
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

    // lumis
    ctx.save();
    for (var li = 0; li < lumis.length; li++) {
      var l = lumis[li];
      if (l.taken || l.x > x1 || l.x < x0) continue;
      var bob = Math.sin(t * 2 + l.ph) * 5;
      ctx.globalAlpha = 0.72 + 0.28 * Math.sin(t * 3 + l.ph * 1.3);
      ctx.drawImage(lumiSpr, l.x - 18, l.y - 18 + bob);
    }
    ctx.restore();

    // faíscas de coleta
    ctx.save();
    ctx.fillStyle = '#ffe9a0';
    for (var sp2 = 0; sp2 < sparks.length; sp2++) {
      var pk = sparks[sp2];
      if (pk.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, pk.life / pk.max);
      ctx.beginPath(); ctx.arc(pk.x, pk.y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  // --- plataforma de terra com topo de musgo ---
  function drawTerrain(ctx, s, d) {
    // corpo terra/raiz
    ctx.fillStyle = '#4a2e1c';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    // sombra na base
    if (s.h > 20) {
      ctx.fillStyle = 'rgba(20,10,6,0.35)';
      ctx.fillRect(s.x, s.y + s.h - 10, s.w, 10);
    }
    // manchas de raiz
    ctx.fillStyle = 'rgba(30,16,10,0.5)';
    for (var i = 0; i < d.spots.length; i++) {
      var sp = d.spots[i];
      ctx.beginPath();
      ctx.ellipse(s.x + sp.dx, s.y + sp.dy, sp.rad * 1.6, sp.rad, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // camadas de musgo transbordando nas bordas
    ctx.fillStyle = '#3f7a2e';
    ctx.fillRect(s.x - 3, s.y - 2, s.w + 6, 14);
    ctx.fillStyle = '#6fb84a';
    ctx.fillRect(s.x - 3, s.y - 2, s.w + 6, 7);
    ctx.fillStyle = 'rgba(255,220,140,0.3)';
    ctx.fillRect(s.x - 3, s.y - 2, s.w + 6, 2);
    // gotas de musgo escorrendo nas quinas
    ctx.fillStyle = '#3f7a2e';
    ctx.beginPath(); ctx.arc(s.x - 1, s.y + 15, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s.x + s.w + 1, s.y + 17, 4.5, 0, Math.PI * 2); ctx.fill();
    // tufos de capim
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

  // --- cogumelo-plataforma: chapéu redondo + talo ---
  function drawMush(ctx, s, d) {
    var cx = s.x + s.w / 2;
    // talo desce abaixo do chapéu
    ctx.fillStyle = '#e2d2ac';
    ctx.beginPath();
    ctx.moveTo(cx - s.w * 0.16, s.y + s.h - 2);
    ctx.quadraticCurveTo(cx - s.w * 0.12, s.y + s.h + 46, cx - s.w * 0.2, s.y + s.h + 88);
    ctx.lineTo(cx + s.w * 0.2, s.y + s.h + 88);
    ctx.quadraticCurveTo(cx + s.w * 0.12, s.y + s.h + 46, cx + s.w * 0.16, s.y + s.h - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(90,60,40,0.25)';
    ctx.fillRect(cx + s.w * 0.02, s.y + s.h + 2, s.w * 0.13, 84);
    // chapéu (domo)
    ctx.fillStyle = d.col;
    ctx.beginPath();
    ctx.ellipse(cx, s.y + s.h, s.w / 2 + 8, s.h + 10, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    // lamelas embaixo do chapéu
    ctx.fillStyle = 'rgba(70,35,45,0.6)';
    ctx.beginPath();
    ctx.ellipse(cx, s.y + s.h, s.w / 2 + 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // brilho do topo
    ctx.strokeStyle = 'rgba(255,230,170,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, s.y + s.h, s.w / 2 + 3, s.h + 6, 0, Math.PI * 1.15, Math.PI * 1.65);
    ctx.stroke();
    // pintas claras
    ctx.fillStyle = 'rgba(255,240,220,0.75)';
    for (var i = 0; i < d.dots.length; i++) {
      var dt2 = d.dots[i];
      ctx.beginPath();
      ctx.arc(s.x + dt2.dx, s.y + dt2.dy + s.h, dt2.rad, 0, Math.PI * 2);
      ctx.fill();
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
    // corpo do veneno
    ctx.fillStyle = '#0f3d14';
    ctx.fillRect(hz.x, hz.y, hz.w, bot - hz.y);
    ctx.fillStyle = 'rgba(60,150,40,0.5)';
    ctx.fillRect(hz.x, hz.y, hz.w, 10);
    // superfície ondulada
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
    // bolhas subindo
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
    // brilho tóxico difuso
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
      // face sombreada
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
    // poste
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(x - 3, y - 64, 6, 64);
    ctx.fillStyle = '#2a1c12';
    ctx.fillRect(x - 8, y - 4, 16, 4);
    // caixa da lanterna
    ctx.fillStyle = '#2a1c12';
    ctx.fillRect(x - 11, y - 92, 22, 30);
    // vidro
    if (lit) {
      var fl = 0.8 + 0.2 * Math.sin(t * 9 + Math.sin(t * 5.3));
      ctx.save();
      ctx.shadowColor = '#ffb030';
      ctx.shadowBlur = 22 * fl;
      ctx.fillStyle = '#ffd870';
      ctx.fillRect(x - 8, y - 89, 16, 24);
      ctx.restore();
      // chama
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
    // telhadinho
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
  // API pública
  // ---------------------------------------------------------------
  FG.level = {
    W: W,
    H: H,
    playerStart: { x: 80, y: 560 },
    solids: solids,
    hazards: hazards,
    checkpoints: checkpoints,
    enemyDefs: enemyDefs,
    bossTriggerX: 6350,
    arena: { x: 6200, w: 1000 },
    update: update,
    drawBack: drawBack,
    drawSolids: drawSolids,
    drawFront: drawFront,
  };
})();
