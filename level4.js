// Fagulho: Lendas do Bosque — level4.js
// Fase 3, 'coliseu': O Coliseu. Geometria, lumis, checkpoints, inimigos,
// obstáculos (defs), a arena do chefão final e todo o visual de arena de
// gladiadores — pedra e areia, arquibancadas em anfiteatro, tochas acesas,
// estandartes, céu de pôr do sol sangrento.
// Registra-se em FG.levels; quem escolhe a fase corrente é o engine.
// Nada aqui referencia FG.player/FG.engine/FG.audio/FG.obstacles no load —
// só dentro de funções chamadas em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  // Único acoplamento de load permitido no projeto: kit → fase. O index.html
  // carrega levelkit.js antes dos level*.js, então FG.levelkit já existe — e
  // precisa existir, porque a geometria abaixo é construída no load.
  var kit = FG.levelkit;
  var S = kit.S, makeRand = kit.makeRand, makeCanvas = kit.makeCanvas;

  var VIEW_W = kit.VIEW_W, VIEW_H = kit.VIEW_H;
  var W = 6800, H = 720;
  var CAM_Y_MAX = H - VIEW_H; // 180 — usado no parallax vertical

  // ---------------------------------------------------------------
  // GEOMETRIA — sólidos
  // k: 'g' = piso de areia/pedra da arena, 'r' = bloco de muralha solto
  //    (base de estátua, escombro), 'c' = muralha escalável (paredão de
  //    pedra do coliseu, com tochas encaixadas), 'h' = piso oculto (fundo da
  //    fossa de lâminas, não é desenhado).
  //
  // RITMO EM 6 TRECHOS
  //  (1) x 0..900       O VESTÍBULO: piso plano, degraus curtos, seguro —
  //                     nenhum inimigo, nenhum perigo.
  //  (2) x 900..1900    A ARQUIBANCADA: degraus de pedra subindo e descendo
  //                     sobre uma fossa de lâminas de gladiador (piso oculto
  //                     no fundo: cair custa caro, mas nunca é beco sem
  //                     saída), com rolo de lâminas e pêndulo (flagelo).
  //  (3) x 1900..3000   A MURALHA ESCALÁVEL: fenda de 70px entre o pilar e o
  //                     paredão (400px de parede vertical com tochas),
  //                     subindo até o adarve — prêmio no topo (checkpoint).
  //  (4) x 3000..4400   A FOSSA DE LÂMINAS: travessia sobre destroços do
  //                     piso original da arena (pedaços de pedra soltos),
  //                     com uma plataforma-elevador ajudando o trecho mais
  //                     largo. Piso oculto no fundo: quem cai anda tomando
  //                     dano e sobe de volta pela margem.
  //  (5) x 4400..5500   AS RUÍNAS DE ESTÁTUAS: escombros que desmoronam sob
  //                     o peso, coluna de ar quente da fornalha por baixo da
  //                     arena, e o rolo de lâminas final antes da clareira.
  //  (6) x 5500..6800   A ARENA DO CHEFÃO: clareira plana de areia batida,
  //                     com as últimas lâminas antes do combate contra
  //                     Sergiola Mutante.
  //
  // Nada de beco sem saída: da fossa da arquibancada sobe-se pela margem
  // direita (degrau curto); da fossa de lâminas do trecho 4, a parede da
  // muralha do trecho 3 fica logo atrás para escalar de volta.
  //
  // Alturas: pulo simples sobe ~118px, duplo ~236px, e uma parede vertical
  // contínua sobe indefinidamente agarrando (~120px por salto de parede).
  // ---------------------------------------------------------------
  var solids = [
    // ---- (1) o vestíbulo — degraus curtos de pedra, nada de perigo ----
    S(0, 620, 900, 100, 'g'),         // [0] piso do vestíbulo
    S(280, 580, 96, 40, 'r'),         // [1] +40
    S(460, 536, 110, 84, 'r'),        // [2] +44
    S(650, 488, 120, 24, 'r'),        // [3] +48 (bônus alto)

    // ---- (2) a arquibancada — degraus sobre a fossa de lâminas ----
    // O piso corre 900..1180 e só volta em 1850: entre eles é a fossa, e os
    // degraus [5..7] são a única rota. Cada subida é ~60px (bem dentro do
    // pulo simples), e o último degrau desce de volta ao nível do piso do
    // outro lado — nunca mais que um pulo simples de vão.
    S(900, 620, 280, 100, 'g'),       // [4] piso 900..1180 (checkpoint 1)
    S(1230, 560, 150, 26, 'r'),       // [5] degrau 1 (+60)
    S(1430, 500, 150, 26, 'r'),       // [6] degrau 2 (+60)
    S(1630, 560, 150, 26, 'r'),       // [7] degrau 3, descendo (-60)
    S(1230, 700, 650, 30, 'h'),       // [8] piso oculto da fossa de lâminas
    S(1850, 620, 350, 100, 'g'),      // [9] piso 1850..2200, entrando na muralha

    // ---- (3) a muralha escalável ----
    // O piso passa por baixo do arco do pilar (70px de vão) e morre dentro da
    // fenda de 70px. Dali só se sai por cima: agarrar e saltar de face em
    // face, de 620 até 220 — 400px de parede vertical contínua, com tochas
    // encaixadas marcando o caminho.
    S(2200, 620, 100, 100, 'g'),      // [10] base da muralha
    S(2300, 250, 90, 370, 'c'),       // [11] pilar (arco de 70px por baixo)
    S(2460, 220, 400, 500, 'c'),      // [12] paredão/adarve superior (checkpoint 2)
    S(2860, 620, 140, 100, 'g'),      // [13] talude ao pé do adarve, do outro lado

    // ---- (4) a fossa de lâminas — pedaços soltos do piso da arena ----
    // Piso oculto no fundo (3000..4400): cair custa caro, mas a margem
    // direita [23] devolve ao caminho, e a esquerda é a muralha do trecho 3.
    S(3000, 700, 1400, 30, 'h'),      // [14] piso oculto da fossa
    S(3120, 560, 130, 24, 'r'),       // [15] pedaço 1
    S(3340, 500, 120, 24, 'r'),       // [16] pedaço 2
    S(3560, 540, 120, 24, 'r'),       // [17] pedaço 3
    S(3780, 480, 120, 24, 'r'),       // [18] pedaço 4
    S(4000, 540, 120, 24, 'r'),       // [19] pedaço 5
    S(4220, 600, 120, 24, 'r'),       // [20] pedaço 6, descendo de volta ao piso
    S(4400, 620, 200, 100, 'g'),      // [21] piso 4400..4600, saída da fossa

    // ---- (5) as ruínas de estátuas ----
    S(4600, 620, 300, 100, 'g'),      // [22] piso 4600..4900 (checkpoint 3)
    S(4980, 560, 130, 26, 'r'),       // [23] base de estátua caída (+60)
    S(5180, 620, 320, 100, 'g'),      // [24] piso 5180..5500

    // ---- (6) a arena do chefão ----
    S(5500, 620, 1300, 100, 'g'),     // [25] clareira de areia batida
    S(5620, 540, 120, 24, 'r'),       // [26] (+80)
    S(5780, 496, 110, 22, 'r'),       // [27] (+44 do anterior)
  ];

  // ---------------------------------------------------------------
  // HAZARDS — t: 's' = lâminas de gladiador (espinhos reskinados)
  // ---------------------------------------------------------------
  function Hz(x, y, w, h, t) { return { x: x, y: y, w: w, h: h, t: t }; }

  var hazards = [
    Hz(1230, 674, 650, 26, 's'),   // fossa da arquibancada
    Hz(2280, 596, 90, 24, 's'),    // base da muralha, antes de subir
    Hz(3000, 674, 1400, 26, 's'),  // fossa de destroços do trecho 4
    Hz(4650, 596, 100, 24, 's'),   // ruínas, antes da estátua caída
    Hz(5210, 596, 90, 24, 's'),    // entrando na clareira
    Hz(5850, 596, 90, 24, 's'),    // arena do chefão
  ];

  // 3 tochas-checkpoint (acendem quando ativadas)
  var checkpoints = [
    { x: 950, y: 620 },    // entrada da arquibancada
    { x: 2660, y: 220 },   // topo da muralha — prêmio de escalar
    { x: 4650, y: 620 },   // entrada das ruínas de estátuas
  ];

  // ---------------------------------------------------------------
  // INIMIGOS — reusa voadeira/espinhoco/sapeca. NENHUM antes de x=900
  // (vestíbulo limpo).
  // ---------------------------------------------------------------
  var enemyDefs = [
    { type: 'espinhoco', x: 1000, y: 594, range: 100 },
    { type: 'voadeira',  x: 1330, y: 460, range: 130 },
    { type: 'sapeca',    x: 1560, y: 480, range: 80 },
    { type: 'voadeira',  x: 1900, y: 430, range: 140 },
    { type: 'voadeira',  x: 2660, y: 130, range: 130 },   // sobre o adarve
    { type: 'espinhoco', x: 2900, y: 594, range: 90 },
    { type: 'voadeira',  x: 3300, y: 420, range: 170 },   // sobre a fossa
    { type: 'voadeira',  x: 3700, y: 380, range: 160 },
    { type: 'voadeira',  x: 4100, y: 420, range: 150 },
    { type: 'espinhoco', x: 4460, y: 594, range: 80 },
    { type: 'sapeca',    x: 4720, y: 588, range: 90 },
    { type: 'voadeira',  x: 5030, y: 420, range: 130 },
    { type: 'espinhoco', x: 5560, y: 594, range: 90 },
    { type: 'sapeca',    x: 5900, y: 588, range: 70 },
  ];

  // ---------------------------------------------------------------
  // OBSTÁCULOS DINÂMICOS (FG.obstacles lê daqui) — reusa só os cinco tipos
  // já existentes: plataforma, desmorona, sopro, pendulo, espinhorolo.
  //   plataforma  {x,y,w,dx,dy,period,phase} — elevador de pedra da arena
  //   desmorona   {x,y,w} — laje que treme e cai (escombro instável)
  //   sopro       {x,y,w,h} — fornalha embaixo da arena, sopro quente
  //   pendulo     {x,y,len,arc,period} — flagelo/maça de gladiador
  //   espinhorolo {x,y,w,range,speed} — roda de lâminas num trilho
  // ---------------------------------------------------------------
  var obstacleDefs = [
    // (2) arquibancada: flagelo varrendo o degrau do meio, roda de lâminas
    // no último degrau
    { type: 'pendulo',     x: 1505, y: 300, len: 190, arc: 0.85, period: 2.8 },
    { type: 'espinhorolo', x: 1650, y: 576, w: 44, range: 110, speed: 130 },

    // (3) muralha: NADA dentro da fenda — a subida ali é agarrando, e só.

    // (4) fossa de destroços: um elevador de pedra no vão mais largo, para
    // quem não quiser saltar pedaço a pedaço, e um sopro de ar quente da
    // fornalha por baixo da arena erguendo sobre o trecho final.
    { type: 'plataforma', x: 3860, y: 440, w: 110, dx: 140, dy: -40, period: 4.4, phase: 0 },
    { type: 'sopro',      x: 4150, y: 300, w: 90, h: 240 },

    // (5) ruínas: a estátua caída é instável, e o rolo de lâminas final
    // cobra a travessia antes da arena.
    { type: 'desmorona',   x: 5000, y: 512, w: 90 },
    { type: 'espinhorolo', x: 5220, y: 576, w: 44, range: 140, speed: 140 },

    // (6) arena do chefão: última roda de lâminas antes do combate — nada
    // dentro da própria arena, a luta é do chefão.
    { type: 'espinhorolo', x: 5680, y: 576, w: 44, range: 120, speed: 145 },
  ];

  // ---------------------------------------------------------------
  // LUMIS — linhas, arcos e COLUNAS. As colunas marcam o que se sobe: a
  // muralha e a coluna de ar quente da fornalha.
  // ---------------------------------------------------------------
  var lumis = [];
  function lumiLine(x, y, n, dx) { kit.lumiLine(lumis, x, y, n, dx); }
  function lumiCol(x, y, n, dy) { kit.lumiCol(lumis, x, y, n, dy); }
  function lumiArc(cx, apexY, n, span, sag) { kit.lumiArc(lumis, cx, apexY, span, sag, n); }
  // (1) vestíbulo
  lumiLine(140, 578, 4, 60);
  lumiArc(520, 470, 5, 190, 34);
  lumiLine(640, 442, 3, 40);
  // (2) arquibancada
  lumiArc(1060, 540, 4, 180, 42);
  lumiLine(1290, 520, 3, 44);
  lumiLine(1490, 460, 3, 44);
  lumiArc(1730, 540, 4, 180, 44);
  // (3) muralha
  lumiArc(2000, 552, 3, 130, 36);
  lumiCol(2335, 496, 6, -52);          // A MURALHA: a escada de lumis ensina a subir agarrado
  lumiLine(2560, 160, 4, 62);          // adarve
  lumiArc(2960, 552, 3, 130, 36);
  // (4) fossa de destroços — um arco por pedaço solto
  lumiArc(3180, 460, 3, 120, 32);
  lumiArc(3400, 400, 3, 130, 34);
  lumiArc(3620, 440, 3, 120, 32);
  lumiArc(3840, 380, 3, 130, 34);
  lumiCol(4155, 570, 5, -60);          // dentro do sopro da fornalha
  lumiArc(4060, 440, 3, 120, 32);
  lumiArc(4280, 500, 3, 120, 32);
  // (5) ruínas de estátuas
  lumiLine(4650, 578, 3, 54);
  lumiArc(5040, 460, 4, 160, 40);
  lumiLine(5240, 578, 3, 50);
  // (6) arena do chefão
  lumiLine(5660, 500, 3, 44);
  lumiLine(5820, 456, 3, 44);
  lumiArc(6100, 546, 4, 170, 42);
  lumiLine(6280, 570, 2, 60);

  // FAÍSCAS — brilho de despedida da lumi coletada (pool fixo do kit, sem GC).
  var sparks = kit.makeSparks(64);

  // ---------------------------------------------------------------
  // DECORAÇÃO por sólido (pré-computada: nada de random por frame).
  // 'g' e 'r' guardam entalhes de pedra e trincas; 'c' vira um offscreen
  // inteiro no primeiro draw (custo zero por frame).
  // ---------------------------------------------------------------
  var decor = [];
  (function () {
    var r = makeRand(20260910);
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      var d = { blocos: [], trincas: [], spr: null, ox: 0, oy: 0 };
      if (s.k === 'g' || s.k === 'r') {
        // juntas de alvenaria: linhas de blocos de pedra empilhados
        var nb = Math.max(2, Math.floor(s.w / 70));
        for (var j = 0; j < nb; j++) {
          d.blocos.push({ dx: 6 + j * (Math.max(1, s.w - 12) / nb), w: Math.max(1, s.w - 12) / nb - 3 });
        }
        // trincas escuras na face de cima
        var nt = Math.max(2, Math.floor(s.w / 90));
        for (var k = 0; k < nt; k++) {
          d.trincas.push({
            x: 10 + r() * Math.max(1, s.w - 20),
            bend: (r() * 2 - 1) * 14, len: 10 + r() * 20,
          });
        }
      }
      decor.push(d);
    }
  })();

  // ---------------------------------------------------------------
  // OFFSCREENS — céu de pôr do sol sangrento, camadas de parallax (anéis de
  // arquibancada, colunas/estátuas, tochas com fumaça), vinheta, lumi e um
  // sprite por paredão de muralha. Construídos uma única vez.
  // ---------------------------------------------------------------
  var built = false;
  var skySpr, farL, midL, mistL, nearL, frontL, vig, lumiSpr;
  var LAYER_H = 680;
  var WALL_PAD = 16;        // folga para a pedra transbordar a muralha

  function buildAll() {
    if (built) return;
    built = true;

    // CÉU DE PÔR DO SOL SANGRENTO: sol baixo e vermelho no horizonte, roxo
    // profundo subindo ao zênite — a arena luta à luz do fim da tarde.
    skySpr = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, '#1a0e22');
      gr.addColorStop(0.32, '#3a1420');
      gr.addColorStop(0.62, '#7a1f22');
      gr.addColorStop(0.84, '#c4441f');
      gr.addColorStop(1, '#e88a3a');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      // aves/urubus distantes, riscos escuros no céu
      var r = makeRand(17);
      g.strokeStyle = 'rgba(20,8,14,0.5)';
      g.lineWidth = 1.6;
      for (var i = 0; i < 6; i++) {
        var bx = r() * VIEW_W, by = 60 + r() * 160, bw = 8 + r() * 8;
        g.beginPath();
        g.moveTo(bx - bw, by);
        g.quadraticCurveTo(bx, by - bw * 0.6, bx + bw, by);
        g.stroke();
      }
      g.globalAlpha = 1;
    })(skySpr.getContext('2d'));

    farL = makeCanvas(2400, LAYER_H); paintFar(farL.getContext('2d'));
    midL = makeCanvas(2400, LAYER_H); paintMid(midL.getContext('2d'));
    mistL = makeCanvas(1600, LAYER_H); paintFumaca(mistL.getContext('2d'));
    nearL = makeCanvas(2400, LAYER_H); paintNear(nearL.getContext('2d'));
    frontL = makeCanvas(1800, LAYER_H); paintFront(frontL.getContext('2d'));

    // vinheta: fecha por igual, um pouco mais quente que o bosque (poeira da
    // arena no ar)
    vig = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 250, VIEW_W / 2, VIEW_H / 2, 650);
      gr.addColorStop(0, 'rgba(20,6,10,0)');
      gr.addColorStop(1, 'rgba(20,6,10,0.5)');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    })(vig.getContext('2d'));

    // sprite da lumi (halo dourado + núcleo) — igual nas outras fases
    lumiSpr = kit.makeLumiSprite();

    // um offscreen por muralha (desenho caro, feito uma vez)
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.k !== 'c') continue;
      var c = makeCanvas(s.w + WALL_PAD * 2, s.h + WALL_PAD * 2);
      paintMuralha(c.getContext('2d'), s.w, s.h, 8117 + i * 191);
      decor[i].spr = c; decor[i].ox = -WALL_PAD; decor[i].oy = -WALL_PAD;
    }
  }

  // ---------------------------------------------------------------
  // MURALHA — blocos de pedra empilhados, tochas encaixadas na face
  // (luz quente pontual), musgo raro nas juntas mais baixas, ameias no topo.
  // ---------------------------------------------------------------
  function paintMuralha(g, w, h, seed) {
    var r = makeRand(seed);
    var P = WALL_PAD;

    g.save();
    g.beginPath(); g.rect(P, P, w, h); g.clip();

    // corpo: arenito quente, mais escuro na base (sombra do fosso)
    var gr = g.createLinearGradient(0, P, 0, P + h);
    gr.addColorStop(0, '#8a6a4c');
    gr.addColorStop(0.5, '#5e4632');
    gr.addColorStop(1, '#2c2018');
    g.fillStyle = gr;
    g.fillRect(P, P, w, h);

    // fiadas de blocos retangulares, juntas escuras alternadas
    var bw = 34 + r() * 14, bh = 22 + r() * 8;
    var row = 0;
    for (var y = P; y < P + h; y += bh, row++) {
      var off = (row % 2) * bw * 0.5;
      for (var x = P - bw + off; x < P + w; x += bw) {
        var tone = 0.06 + r() * 0.10;
        g.fillStyle = 'rgba(230,200,160,' + tone.toFixed(3) + ')';
        g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        g.fillStyle = 'rgba(20,12,8,0.45)';
        g.fillRect(x, y, bw, 1.6);
        g.fillRect(x, y, 1.6, bh);
      }
    }

    // trincas verticais: a parede pede para ser agarrada
    g.strokeStyle = 'rgba(15,9,6,0.4)';
    g.lineWidth = 2.4;
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

    // tochas encaixadas na face: braçadeira de ferro + chama pulsante,
    // espalhadas quando a parede é alta o bastante
    if (h >= 160) {
      var nTochas = 1 + Math.floor(h / 220);
      for (var ti = 0; ti < nTochas; ti++) {
        var tx = P + 14 + r() * Math.max(1, w - 28);
        var ty = P + 40 + ti * (h / nTochas) + r() * 30;
        g.fillStyle = '#241a12';
        g.fillRect(tx - 5, ty, 10, 16);
        var fg = g.createRadialGradient(tx, ty - 6, 2, tx, ty - 6, 30);
        fg.addColorStop(0, 'rgba(255,220,140,0.85)');
        fg.addColorStop(0.4, 'rgba(255,130,40,0.45)');
        fg.addColorStop(1, 'rgba(255,90,20,0)');
        g.fillStyle = fg;
        g.beginPath();
        g.ellipse(tx, ty - 6, 26, 30, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    // luz na face esquerda (o sol do poente bate de raspão), sombra na direita
    var sg = g.createLinearGradient(P, 0, P + w, 0);
    sg.addColorStop(0, 'rgba(255,160,90,0.14)');
    sg.addColorStop(0.45, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(10,6,4,0.4)');
    g.fillStyle = sg;
    g.fillRect(P, P, w, h);

    // base afundando na sombra do fosso
    var bh2 = Math.min(120, h * 0.4);
    var bg = g.createLinearGradient(0, P + h - bh2, 0, P + h);
    bg.addColorStop(0, 'rgba(6,3,2,0)');
    bg.addColorStop(1, 'rgba(6,3,2,0.55)');
    g.fillStyle = bg;
    g.fillRect(P, P + h - bh2, w, bh2);
    g.restore();

    // topo: ameias (merlons) do adarve
    g.fillStyle = '#3a2c20';
    g.fillRect(P - 3, P - 14, w + 6, 14);
    var mw = 26, gap = 16;
    g.fillStyle = '#4a3826';
    for (var mx = P - 3; mx < P + w + 6; mx += mw + gap) {
      g.fillRect(mx, P - 26, mw, 26);
    }
    g.fillStyle = 'rgba(255,200,140,0.25)';
    g.fillRect(P - 3, P - 26, w + 6, 3);
    // musgo raro nas juntas baixas
    g.fillStyle = 'rgba(90,120,50,0.28)';
    var nm = Math.max(2, Math.floor(w / 90));
    for (var mi = 0; mi < nm; mi++) {
      var mmx = P + 10 + r() * Math.max(1, w - 20), mmy = P + h - 10 - r() * (h * 0.3);
      g.beginPath();
      g.ellipse(mmx, mmy, 8 + r() * 8, 4 + r() * 4, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  // --- camada distante: anéis de arquibancada do coliseu em silhueta, com
  // arcadas escuras e o sol baixo atrás ---
  function paintFar(g) {
    var r = makeRand(6101);
    var base = LAYER_H;

    // curva geral das arquibancadas subindo em anéis
    g.fillStyle = 'rgba(60,26,26,0.85)';
    hillBand(g, r, base - 260, 130, 6);
    g.fillStyle = 'rgba(46,18,20,0.92)';
    hillBand(g, r, base - 150, 90, 7);

    // arcadas: fileira de vãos escuros na fiada baixa das arquibancadas
    g.fillStyle = 'rgba(18,6,8,0.7)';
    var aw = 70, agap = 30;
    for (var ax = 20; ax < 2400; ax += aw + agap) {
      var ah = 60 + r() * 40;
      g.beginPath();
      g.moveTo(ax, base);
      g.lineTo(ax, base - ah);
      g.quadraticCurveTo(ax + aw / 2, base - ah - 18, ax + aw, base - ah);
      g.lineTo(ax + aw, base);
      g.closePath();
      g.fill();
    }

    // figuras da plateia — manchas escuras densas na crista, sem detalhe
    g.fillStyle = 'rgba(20,8,10,0.6)';
    for (var i = 0; i < 90; i++) {
      var px = r() * 2400, py = base - 260 - r() * 40;
      g.beginPath();
      g.ellipse(px, py, 6 + r() * 5, 8 + r() * 6, 0, 0, Math.PI * 2);
      g.fill();
    }

    // sol baixo e vermelho, quase tocando a crista das arquibancadas
    var sx = 1200, sy = base - 300;
    var sg = g.createRadialGradient(sx, sy, 10, sx, sy, 260);
    sg.addColorStop(0, 'rgba(255,190,110,0.55)');
    sg.addColorStop(0.4, 'rgba(230,90,40,0.28)');
    sg.addColorStop(1, 'rgba(200,40,20,0)');
    g.fillStyle = sg;
    g.beginPath();
    g.ellipse(sx, sy, 260, 200, 0, 0, Math.PI * 2);
    g.fill();
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

  // --- camada média: colunas e estátuas quebradas de gladiadores, com
  // estandartes pendurados entre elas ---
  function paintMid(g) {
    var r = makeRand(6202);
    var base = LAYER_H;

    g.fillStyle = 'rgba(46,28,24,0.92)';
    g.fillRect(0, base - 64, 2400, 64);

    for (var s = 0; s < 6; s++) {
      var sx = 150 + s * 400 + r() * 110;
      var sw = 44 + r() * 20, sh = 210 + r() * 170;
      // fuste da coluna, com estrias
      var cg = g.createLinearGradient(sx, 0, sx + sw, 0);
      cg.addColorStop(0, '#6a4c3a');
      cg.addColorStop(0.5, '#4a3428');
      cg.addColorStop(1, '#2c1e18');
      g.fillStyle = cg;
      g.fillRect(sx, base - sh, sw, sh);
      g.strokeStyle = 'rgba(20,12,8,0.4)';
      g.lineWidth = 2;
      for (var st = 1; st < 5; st++) {
        g.beginPath();
        g.moveTo(sx + (sw / 5) * st, base - sh + 14);
        g.lineTo(sx + (sw / 5) * st, base - 6);
        g.stroke();
      }
      // capitel e base
      g.fillStyle = '#7a5c44';
      g.fillRect(sx - 6, base - sh - 12, sw + 12, 14);
      g.fillRect(sx - 8, base - 14, sw + 16, 14);
      // topo quebrado numa coluna a cada dois — ruína, não templo intacto
      if (s % 2 === 0) {
        g.fillStyle = 'rgba(20,12,8,0.9)';
        g.beginPath();
        g.moveTo(sx - 6, base - sh - 12);
        g.lineTo(sx + sw * 0.4, base - sh - 30);
        g.lineTo(sx + sw + 6, base - sh - 12);
        g.closePath();
        g.fill();
      }
    }

    // estandartes pendurados entre as colunas, ondulando
    g.fillStyle = 'rgba(120,20,20,0.55)';
    for (var b = 0; b < 4; b++) {
      var bx = 340 + b * 580 + r() * 120;
      var bw2 = 60 + r() * 20, bh2 = 140 + r() * 60;
      g.beginPath();
      g.moveTo(bx, base - 300);
      g.lineTo(bx + bw2, base - 300);
      for (var wv = 0; wv <= 6; wv++) {
        var fx = bx + bw2 - (wv / 6) * bw2 + Math.sin(wv * 1.3) * 6;
        var fy = base - 300 + (wv / 6) * bh2;
        g.lineTo(fx, fy);
      }
      g.closePath();
      g.fill();
    }
  }

  // --- fumaça de tocha entre os patamares: faixas quentes e baixas ---
  function paintFumaca(g) {
    var r = makeRand(6303);
    var base = LAYER_H;
    var bands = [base - 300, base - 130];
    for (var i = 0; i < bands.length; i++) {
      var by = bands[i], bh = 100 + i * 46;
      var gr = g.createLinearGradient(0, by - bh * 0.5, 0, by + bh * 0.5);
      gr.addColorStop(0, 'rgba(200,110,70,0)');
      gr.addColorStop(0.5, 'rgba(210,110,70,' + (0.14 + i * 0.07).toFixed(2) + ')');
      gr.addColorStop(1, 'rgba(200,110,70,0)');
      g.fillStyle = gr;
      g.fillRect(0, by - bh * 0.5, 1600, bh);
      g.fillStyle = 'rgba(220,140,90,0.09)';
      for (var k = 0; k < 9; k++) {
        g.beginPath();
        g.ellipse(r() * 1600, by + (r() * 2 - 1) * 24, 90 + r() * 190, 20 + r() * 34, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // --- camada próxima: crista de pedra da arena com aresta batida de luz ---
  function paintNear(g) {
    var r = makeRand(6404);
    var base = LAYER_H;
    g.fillStyle = '#140d09';
    g.fillRect(0, base - 76, 2400, 76);

    for (var i = 0; i < 20; i++) {
      var bx = i * 122 + r() * 60, by = base - 64 - r() * 40;
      var bw = 60 + r() * 70, bh = 40 + r() * 46;
      g.fillStyle = '#1c130c';
      g.beginPath();
      g.moveTo(bx, by + bh);
      g.lineTo(bx + 6, by + 8);
      g.lineTo(bx + bw * 0.45, by);
      g.lineTo(bx + bw - 6, by + 12);
      g.lineTo(bx + bw, by + bh);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,150,60,0.16)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(bx + 6, by + 8);
      g.lineTo(bx + bw * 0.45, by);
      g.lineTo(bx + bw - 6, by + 12);
      g.stroke();
    }
  }

  // --- primeiro plano: lanças cravadas na areia entrando pela borda de baixo
  // e o beiral do adarve pendendo do alto ---
  function paintFront(g) {
    var r = makeRand(6505);
    var base = LAYER_H;

    g.fillStyle = '#0c0705';
    for (var i = 0; i < 16; i++) {
      var lx = i * 118 + r() * 60;
      var lean = (r() * 2 - 1) * 10;
      g.save();
      g.translate(lx, base + 20);
      g.rotate(lean * 0.04);
      g.fillRect(-3, -170, 6, 170);
      g.beginPath();
      g.moveTo(-9, -170); g.lineTo(0, -196); g.lineTo(9, -170);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.fillStyle = '#0a0604';
    g.fillRect(0, base - 28, 1800, 28);

    // beiral do adarve no alto, com ameias em silhueta
    g.fillStyle = '#0a0604';
    for (var s = 0; s < 10; s++) {
      var sx = 60 + s * 190 + r() * 60;
      g.fillRect(sx, 0, 40, 46);
    }
    g.fillRect(0, 0, 1800, 18);
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
  // RESET — o engine chama ao (re)carregar a fase: reacende lumis e apaga as
  // faíscas em voo. NÃO se olha FG.engine.lumis para decidir nada: as lumis
  // acumulam entre fases e aquele contador não zera nunca.
  // ---------------------------------------------------------------
  function reset() {
    for (var i = 0; i < lumis.length; i++) lumis[i].taken = false;
    kit.apagarFaiscas(sparks);
  }

  // ---------------------------------------------------------------
  // UPDATE — coleta de lumis (mecânica do kit); o coliseu não tem coletável
  // próprio além das lumis.
  // ---------------------------------------------------------------
  function update(dt) {
    kit.coletarLumis(lumis, sparks, dt);
  }

  // ---------------------------------------------------------------
  // DRAW BACK — céu de pôr do sol sangrento, camadas de parallax, fumaça de
  // tocha e urubus. Tudo o que sobe, sobe: a poeira da arena sobe do chão.
  // ---------------------------------------------------------------
  function drawBack(ctx, cam) {
    buildAll();
    var t = FG.engine.time;

    ctx.drawImage(skySpr, 0, 0);

    drawLayer(ctx, farL, 0.2, cam);
    drawLayer(ctx, midL, 0.45, cam);

    // poeira da arena subindo — o equivalente dos vagalumes do bosque, mas
    // sobem devagar e são cor de terracota, não brilho mágico
    ctx.save();
    for (var i = 0; i < 18; i++) {
      var fx = (((i * 421 + Math.sin(t * 0.4 + i) * 30) - cam.x * 0.55) % 1040 + 1040) % 1040 - 40;
      var sobe = (t * (20 + (i % 5) * 7) + i * 97) % 620;
      var fy = VIEW_H + 30 - sobe + Math.sin(t * 1.2 + i * 1.9) * 12 - cam.y * 0.5;
      var a = 0.12 + 0.22 * (1 - sobe / 620);
      if (a <= 0.04) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#c9a26a';
      ctx.beginPath(); ctx.arc(fx, fy, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // fumaça de tocha respirando entre os patamares
    ctx.save();
    ctx.globalAlpha = 0.68 + 0.14 * Math.sin(t * 0.3);
    drawLayer(ctx, mistL, 0.6, cam);
    ctx.restore();

    drawLayer(ctx, nearL, 0.7, cam);
  }

  // ---------------------------------------------------------------
  // DRAW SOLIDS — piso, muralhas, blocos soltos, lâminas, tochas-checkpoint,
  // lumis e faíscas (tudo com culling de ~1 tela)
  // ---------------------------------------------------------------
  function drawSolids(ctx, cam) {
    buildAll();
    var t = FG.engine.time;
    var x0 = cam.x - 220, x1 = cam.x + VIEW_W + 220;

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // plataformas
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.k === 'h' || s.x > x1 || s.x + s.w < x0) continue;
      var d = decor[i];
      if (s.k === 'c') ctx.drawImage(d.spr, s.x + d.ox, s.y + d.oy);
      else drawPedra(ctx, s, d, t);
    }

    // lâminas por cima do terreno
    for (var h2 = 0; h2 < hazards.length; h2++) {
      var hz2 = hazards[h2];
      if (hz2.t !== 's' || hz2.x > x1 || hz2.x + hz2.w < x0) continue;
      drawLaminas(ctx, hz2);
    }

    // tochas-checkpoint
    for (var c = 0; c < checkpoints.length; c++) {
      var cp = checkpoints[c];
      if (cp.x > x1 || cp.x < x0) continue;
      drawTocha(ctx, cp, FG.engine.checkpoint.x === cp.x, t);
    }

    // lumis e faíscas de coleta (ctx já está no espaço do mundo)
    kit.desenharLumis(ctx, cam, lumis, lumiSpr, t);
    kit.desenharFaiscas(ctx, sparks);

    ctx.restore();
  }

  // --- piso/bloco de pedra da arena, com juntas de alvenaria e trincas ---
  function drawPedra(ctx, s, d, t) {
    ctx.fillStyle = '#8a6a4c';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    if (s.h > 20) {
      ctx.fillStyle = 'rgba(20,12,6,0.3)';
      ctx.fillRect(s.x, s.y + s.h - 10, s.w, 10);
    }
    // juntas de alvenaria
    ctx.fillStyle = 'rgba(20,12,6,0.35)';
    for (var i = 0; i < d.blocos.length; i++) {
      var b = d.blocos[i];
      ctx.fillRect(s.x + b.dx, s.y, 1.6, Math.min(s.h, 10));
    }
    // trincas escuras
    ctx.strokeStyle = 'rgba(20,12,6,0.4)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (var k = 0; k < d.trincas.length; k++) {
      var tr = d.trincas[k];
      ctx.moveTo(s.x + tr.x, s.y + 2);
      ctx.lineTo(s.x + tr.x + tr.bend, s.y + Math.min(s.h - 2, tr.len));
    }
    ctx.stroke();
    // aresta de cima, quente ao sol do poente
    ctx.fillStyle = '#c99a68';
    ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, 4);
    ctx.fillStyle = 'rgba(255,200,140,0.3)';
    ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, 1.4);
  }

  // --- lâminas de gladiador cravadas na areia ---
  function drawLaminas(ctx, hz) {
    var n = Math.max(3, Math.round(hz.w / 16));
    var sw = hz.w / n;
    ctx.fillStyle = '#241a10';
    ctx.fillRect(hz.x, hz.y + hz.h - 5, hz.w, 5);
    for (var i = 0; i < n; i++) {
      var bx = hz.x + i * sw;
      var g = ctx.createLinearGradient(bx, hz.y, bx + sw, hz.y);
      g.addColorStop(0, '#d8d8e0');
      g.addColorStop(0.5, '#a8aab8');
      g.addColorStop(1, '#6a6c78');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx, hz.y + hz.h);
      ctx.lineTo(bx + sw / 2, hz.y);
      ctx.lineTo(bx + sw, hz.y + hz.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(30,20,15,0.5)';
      ctx.beginPath();
      ctx.moveTo(bx + sw / 2, hz.y);
      ctx.lineTo(bx + sw, hz.y + hz.h);
      ctx.lineTo(bx + sw / 2, hz.y + hz.h);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- tocha-checkpoint (acesa quando é o checkpoint atual) ---
  function drawTocha(ctx, cp, lit, t) {
    var x = cp.x, y = cp.y;
    ctx.fillStyle = '#4a3a28';
    ctx.fillRect(x - 4, y - 70, 8, 70);
    ctx.fillStyle = '#241a12';
    ctx.fillRect(x - 10, y - 4, 20, 5);
    ctx.fillStyle = '#2a1c12';
    ctx.fillRect(x - 12, y - 98, 24, 30);
    if (lit) {
      var fl = 0.8 + 0.2 * Math.sin(t * 9 + Math.sin(t * 5.3));
      ctx.save();
      ctx.shadowColor = '#ff9020';
      ctx.shadowBlur = 24 * fl;
      ctx.fillStyle = '#ffb850';
      ctx.fillRect(x - 9, y - 95, 18, 26);
      ctx.restore();
      ctx.fillStyle = '#fff0c0';
      ctx.beginPath();
      ctx.ellipse(x, y - 82, 3.6, 6 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#241f1a';
      ctx.fillRect(x - 9, y - 95, 18, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x - 9, y - 95, 5, 26);
    }
    ctx.fillStyle = '#1d130c';
    ctx.beginPath();
    ctx.moveTo(x - 15, y - 98);
    ctx.lineTo(x, y - 108);
    ctx.lineTo(x + 15, y - 98);
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------------------
  // DRAW FRONT — lanças de primeiro plano + adarve + vinheta
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
    id: 'coliseu',
    nome: 'O Coliseu',
    musica: 'coliseu',
    W: W,
    H: H,
    playerStart: { x: 80, y: 560 },
    solids: solids,
    hazards: hazards,
    checkpoints: checkpoints,
    enemyDefs: enemyDefs,
    obstacleDefs: obstacleDefs,
    bossId: 'sergiola',
    bossTriggerX: 5760,
    arena: { x: 5700, w: 1100 },
    reset: reset,
    update: update,
    drawBack: drawBack,
    drawSolids: drawSolids,
    drawFront: drawFront,
  });
})();
