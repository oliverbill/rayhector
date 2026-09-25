// Fagulho: Lendas do Bosque — level2.js
// Fase 1, 'pantano': O Pântano. Geometria, lumis, ninhos, perigos,
// inimigos e obstáculos (defs) mais todo o visual amarelo-esverdeado da bruma.
// Registra-se em FG.levels na ordem do index.html — quem escolhe a fase
// corrente é o engine. Nada aqui referencia FG.player/FG.engine/FG.audio no
// load, só em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  // Único acoplamento de load permitido no projeto: kit → fase. O index.html
  // carrega levelkit.js antes dos level*.js, e a geometria abaixo é construída
  // já no load, então FG.levelkit precisa existir aqui.
  var kit = FG.levelkit;
  var S = kit.S, makeRand = kit.makeRand, makeCanvas = kit.makeCanvas;

  var VIEW_W = kit.VIEW_W, VIEW_H = kit.VIEW_H;
  var W = 7200, H = 1040;   // H cresceu para caber a GRUTA SUBMERSA do trecho 1
  var CAM_Y_MAX = H - VIEW_H; // 180 — usado no parallax vertical

  // ---------------------------------------------------------------
  // GEOMETRIA — sólidos
  // k: 'g' = lodo firme com limo, 'r' = raiz/pedra, 'p' = POSTE de bambu
  //    (fino e alto: a escalada de parede já existente sobe nele de graça),
  //    'b' = feixe de bambu deitado (plataforma estreita), 'c' = barranco de
  //    raízes escalável, 'h' = piso oculto (fundo das poças, não é desenhado).
  //
  // RITMO EM 6 TRECHOS — cada um ensina uma coisa antes de cobrá-la
  //  (1) x 0..880     MARGEM SECA. Chão firme, raízes em degrau, nenhum perigo.
//  (2+3) x 880..4480 O LAGO SUBMERSO — METADE DA FASE debaixo d'água. Água
//                   limpa (sem veneno): mergulhar é OBRIGATÓRIO em dois
//                   pontos do traçado (o resto é respiro), com trilhas de
//                   lumis, um ninho no fundo, pilares de pedra, piranhas,
//                   carangos, e agora o jacaré (mordida forte, patrulha
//                   lenta) e o candiru (minúsculo, só ativo com o jogador
//                   molhado). Na superfície, troncos-boia e três ILHAS de
//                   lodo (com nado por baixo delas) dão respiro entre os dois
//                   mergulhos forçados — não mais uma rota seca ponta a
//                   ponta: os troncos que fechavam ILHA A→B e B→C foram
//                   removidos de propósito, então quem tenta ir só por cima
//                   cai no vão e molha de qualquer jeito. O checkpoint do
//                   meio fica na ILHA B, alcançável nadando e escalando a
//                   face dela (toda face vertical contínua é escalável).
//  (4) x 4480..5150 MARGEM LESTE. Sai da água, lodo raso, rumo à fenda.
//  (5) x 5150..5560 A FENDA DAS RAÍZES. Duas paredes frente a frente: descida
//                   controlada agarrando, e a saída de quem caiu no lamaçal.
//  (6) x 5560..7200 LAMAÇAL FINAL e a clareira de lodo do chefão.
//
// Nada de beco sem saída: o lago se atravessa nadando por definição, as faces
// das margens e das ilhas são escaláveis, e as poças do trecho 6 têm piso.
//
// Alturas de referência do player: pulo simples ~118px, duplo ~236px, e uma
  // face vertical contínua sobe indefinidamente agarrando (~120px por salto).
  // ---------------------------------------------------------------
  var solids = [
    // ---- (1) MARGEM SECA — degraus de raiz, nada que machuque ----
    S(0, 620, 880, 420, 'g'),        // [0] margem inicial 0..880 (parede oeste do lago)
    S(230, 586, 90, 34, 'r'),        // [1] raiz baixa (+34)
    S(400, 544, 110, 26, 'g'),       // [2] (+42)
    S(590, 492, 120, 24, 'g'),       // [3] (+52)
    S(780, 438, 110, 22, 'g'),       // [4] bônus alto (+54)

    // ---- (2+3) O LAGO SUBMERSO — metade da fase debaixo d'água ----
    // x 880..4480 (3600px = 50% do mundo). Superfície em 664, leito em 1000.
    // A rota principal é NADAR; os troncos-boia e as ilhas dão a rota de
    // superfície para quem preferir, e os pilares dão relevo ao mergulho.
    S(836, 1000, 3688, 40, 'h'),     // [5] leito do lago (entra 44px sob as
                                     //     margens: rente às faces p/ escalada)
    S(1750, 610, 240, 190, 'g'),     // [6] ILHA A (topo 610, base 800 — nado por baixo)
    S(2650, 600, 260, 200, 'g'),     // [7] ILHA B (checkpoint; base 800)
    S(3550, 610, 240, 190, 'g'),     // [8] ILHA C (base 800)
    S(2200, 820, 90, 180, 'r'),      // [9] pilar submerso 1 (topo 820)
    S(3080, 760, 100, 240, 'r'),     // [10] pilar submerso 2 (topo 760 — tem carango!)
    S(4050, 840, 90, 160, 'r'),      // [11] pilar submerso 3 (topo 840)

    // ---- (4) MARGEM LESTE — a saída do lago, caminho para a fenda ----
    S(4480, 640, 670, 400, 'g'),     // [12] margem leste 4480..5150 (parede do lago)

    // ---- (5) FENDA DAS RAÍZES ----
    S(5150, 210, 90, 510, 'c'),      // [13] parede esquerda (do fundo ao topo)
    S(5240, 620, 800, 100, 'g'),     // [14] fundo da fenda + lamaçal 5240..6040
    S(5390, 230, 110, 320, 'c'),     // [15] parede direita suspensa (arco de 70px por baixo)

    // ---- (6) LAMAÇAL FINAL e a clareira do chefão ----
    S(5700, 540, 120, 24, 'g'),      // [16] degrau por cima dos juncos
    S(5880, 486, 110, 22, 'g'),      // [17] bônus
    S(6040, 700, 140, 40, 'h'),      // [18] piso oculto da poça pré-clareira
    S(6180, 620, 1020, 100, 'g'),    // [19] clareira de lodo do chefão
  ];

  // ---------------------------------------------------------------
  // HAZARDS — t: 'p' = lodo venenoso, 's' = espinhos de junco seco
  // As poças do lodo profundo são faixas SEPARADAS de propósito: entre elas
  // sobram bancos secos, para a caminhada da vergonha até a fenda não ser uma
  // sentença de morte de quem já pagou o preço de cair.
  // ---------------------------------------------------------------
  function Hz(x, y, w, h, t) { return { x: x, y: y, w: w, h: h, t: t }; }

  var hazards = [
    Hz(4480, 616, 190, 26, 'p'),   // lodo raso na saída do lago
    Hz(4780, 616, 370, 26, 'p'),   // lodo profundo antes da fenda
    Hz(5390, 206, 110, 24, 's'),   // crista da parede direita: sem atalho por cima
    Hz(5760, 596, 100, 24, 's'),   // reta final
    Hz(6040, 676, 140, 26, 'p'),   // poça pré-clareira
  ];

  // 3 lanternas-checkpoint, nos três respiros do traçado
  var checkpoints = [
    { x: 2760, y: 600 },   // topo da ILHA B, no meio do lago
    { x: 4560, y: 640 },   // margem leste, saindo da água
    { x: 5580, y: 620 },   // saída da fenda, já no lamaçal
  ];

  // ---------------------------------------------------------------
  // INIMIGOS — o peixe voador é a assinatura da fase: fica bufando parado e
  // dispara na horizontal quando o jogador entra no alcance. Ele estreia no
  // chão firme do bambuzal (x=2700), onde dá para ler o disparo sem estar
  // pendurado em nada, e só depois cruza os cipós.
  // Nenhum inimigo antes de x=1000: o trecho 1 é margem limpa.
  //
  // O jacaré patrulha bem os dois vãos onde os troncos-boia foram removidos
  // (1990..2650 e 2910..3550): é ele quem cobra o pedágio de quem tenta
  // atravessar por cima. O candiru fica espalhado pelo lago inteiro, mas só
  // acorda (e só machuca) com o jogador dentro d'água — fora d'água é
  // decoração inofensiva.
  // ---------------------------------------------------------------
  var enemyDefs = [
    { type: 'voadeira',  x: 1030, y: 520, range: 110 },  // (1) fim da margem

    // (2+3) O LAGO — piranhas patrulhando o volume, carangos no leito e nos
    // pilares, os peixes voadores rasantes por cima da superfície, e agora
    // jacarés e candirus nos dois vãos obrigatórios
    { type: 'piranha',   x: 930,  y: 770, range: 110 },
    { type: 'piranha',   x: 1060, y: 890, range: 100 },
    { type: 'carango',   x: 970,  y: 968, range: 90 },
    { type: 'candiru',   x: 1180, y: 840, range: 0 },
    { type: 'piranha',   x: 1550, y: 810, range: 120 },
    { type: 'carango',   x: 1900, y: 968, range: 90 },
    { type: 'jacare',    x: 2300, y: 900, range: 260 },  // vão obrigatório ILHA A→B
    { type: 'piranha',   x: 2150, y: 760, range: 130 },
    { type: 'candiru',   x: 2080, y: 900, range: 0 },
    { type: 'piranha',   x: 2450, y: 900, range: 110 },
    { type: 'candiru',   x: 2560, y: 950, range: 0 },
    { type: 'carango',   x: 3110, y: 734, range: 38 },   // em cima do pilar 2!
    { type: 'jacare',    x: 3140, y: 900, range: 240 },  // vão obrigatório ILHA B→C
    { type: 'piranha',   x: 2950, y: 880, range: 120 },
    { type: 'candiru',   x: 3260, y: 860, range: 0 },
    { type: 'carango',   x: 3300, y: 968, range: 100 },
    { type: 'piranha',   x: 3450, y: 790, range: 110 },
    { type: 'piranha',   x: 4100, y: 900, range: 120 },
    { type: 'carango',   x: 4300, y: 968, range: 80 },
    { type: 'peixe',     x: 2500, y: 600, range: 380, speed: 540 }, // rasante sobre a água
    { type: 'peixe',     x: 3900, y: 590, range: 340, speed: 560 },
    { type: 'voadeira',  x: 3550, y: 520, range: 140 },  // sobre a ILHA C

    // (4) margem leste
    { type: 'espinhoco', x: 4600, y: 614, range: 100 },

    // range curto de propósito: a fenda tem 150px de vão, e uma voadeira de
    // range largo entraria e sairia de dentro das paredes (ela não colide)
    { type: 'voadeira',  x: 5300, y: 430, range: 34 },   // (5) dentro da fenda

    { type: 'espinhoco', x: 5620, y: 590, range: 90 },   // (6) lamaçal final
    { type: 'peixe',     x: 5980, y: 552, range: 300 },
    { type: 'voadeira',  x: 6100, y: 500, range: 120 },
    { type: 'sapeca',    x: 6250, y: 584, range: 60 },   // já na borda da clareira
  ];

  // ---------------------------------------------------------------
  // OBSTÁCULOS DINÂMICOS (FG.obstacles lê daqui)
  // Convenções de coordenada usadas nesta fase:
  //   tronco {x,y,w}      — (x,y) = canto superior esquerdo EM REPOUSO (o ponto
  //                         mais alto). Afunda até 70px com o player em cima,
  //                         a 55px/s, e volta a 90px/s. Altura sólida fixa 22px.
  //   cipo   {x1,y1,x2,y2,sag} — pinos em t=0 e t=1; `sag` é a barriga no meio.
  //                         Não é sólido: agarra quem encosta NO AR.
  //   disco  {x,y,w,bob,period,phase} — (x,y) = canto superior esquerdo na
  //                         posição MÉDIA; oscila ±bob. Altura sólida fixa 18px.
  //
  // Todo tronco daqui foi conferido em duas contas: (a) o ponto mais fundo
  // (y+70+22) fica ACIMA da superfície da poça, senão ele sumiria no lodo; e
  // (b) o pulo para a peça seguinte continua possível A PARTIR do ponto mais
  // fundo — nenhum deles cobra mais que ~78px de subida, um pulo simples.
  // Todo cipó reserva sag+13+60px livres abaixo da reta dos pinos.
  // ---------------------------------------------------------------
  var obstacleDefs = [
    // troncos-boia na superfície do lago: dão respiro entre os mergulhos,
    // mas NÃO fecham o lago ponta a ponta — de propósito faltam os troncos
    // entre ILHA A e ILHA B e entre ILHA B e ILHA C (vãos de 640-660px, bem
    // além do que pulo duplo + planagem cobrem), então esses dois trechos só
    // se atravessam nadando, cara a cara com o jacaré. Afundam com o peso
    // (556+70+22 = 648 < 664, nunca somem).
    { type: 'tronco', x: 960,  y: 556, w: 130 },
    { type: 'tronco', x: 1440, y: 568, w: 110 },
    { type: 'tronco', x: 1640, y: 568, w: 110 },
    { type: 'tronco', x: 4180, y: 560, w: 110 },

    // (6) lamaçal final: um tronco sobre a poça pré-clareira, como despedida.
    { type: 'tronco', x: 6060, y: 570, w: 110 },
  ];

  // ---------------------------------------------------------------
  // NINHOS COM CASULO — coletável gordo: 5 lumis de uma vez, com estouro
  // dourado. São só dois na fase inteira, e os dois são prêmio de arriscar:
  // o primeiro só cai no colo de quem solta o cipó 2 no meio (o arco do
  // impulso passa exatamente por ele); o segundo fica no eixo da fenda, no
  // caminho de quem desce controlando a queda em vez de despencar colado.
  // ---------------------------------------------------------------
  var NINHO_R = 34;      // raio de coleta: é um casulo gordo, não uma fagulha
  var ninhos = [
    { x: 2450, y: 930, taken: false, ph: 0.0 },   // no fundo do lago, entre as piranhas
    { x: 5312, y: 396, taken: false, ph: 1.7 },
  ];

  // ---------------------------------------------------------------
  // ÁGUA RASA — não é hazard nem sólido: é só o visual do trecho 1, onde o
  // piso oculto [5] deixa o jogador vadear. Existe para o tronco-tutorial ter
  // um lugar em que afundar não seja punição.
  // ---------------------------------------------------------------
  var rasos = [
    { x: 880, y: 662, w: 3600, h: 378 },  // o LAGO inteiro, metade da fase
  ];

  // ---------------------------------------------------------------
  // ÁGUA MERGULHÁVEL — o player.js lê FG.level.waters: dentro destes
  // retângulos a física vira nado (segurar PULO sobe, soltar afunda).
  // A gruta é a única água mergulhável da fase; as poças venenosas
  // continuam sendo hazard, não piscina.
  // ---------------------------------------------------------------
  var waters = [
    { x: 880, y: 664, w: 3600, h: 336 },
  ];

  // ---------------------------------------------------------------
  // GRUTA SUBMERSA — tabelas fixas da animação (nada de random por frame).
  // Tudo em coordenadas LOCAIS do retângulo da água (0,0 = canto do raso):
  // algas presas ao leito, plâncton em deriva, colunas de bolhas e os raios
  // de luz que entram pela superfície. O que não mexe (leito, paredes,
  // pedras, concha) vai baked no offscreen grutaSpr, montado no buildAll.
  // ---------------------------------------------------------------
  var gruta = { algas: [], plancton: [], bolhas: [], raios: [], deco: [] };
  (function () {
    var r = makeRand(20260910);
    var gw = rasos[0].w, gh = rasos[0].h;
    // as densidades escalam com a largura (as bases foram afinadas para os
    // ~300px da gruta original), com TETO para o custo por frame não crescer
    // junto do lago — quem segura o resto é o culling do drawGruta
    var nAlgas = Math.min(34, Math.round(4 * gw / 300));
    var nPlanc = Math.min(104, Math.round(16 * gw / 300));
    var nBolhas = Math.min(20, Math.round(3 * gw / 300));
    var nRaios = Math.min(16, Math.round(3 * gw / 300));
    // talos de alga no leito, comprimentos e fases diferentes para nunca
    // ondularem em uníssono
    for (var i = 0; i < nAlgas; i++) {
      gruta.algas.push({
        dx: 34 + i * ((gw - 68) / (nAlgas - 1)) + (r() * 2 - 1) * 26,
        len: 64 + r() * 52,
        ph: r() * Math.PI * 2,
        amp: 7 + r() * 7,
        seg: 3 + (i % 2),          // nº de folhas laterais
      });
    }
    // plâncton: pontinhos claros em suspensão, cada um com órbita própria
    for (var p = 0; p < nPlanc; p++) {
      gruta.plancton.push({
        dx: 12 + r() * (gw - 24),
        dy: 40 + r() * (gh - 80),
        ph: r() * Math.PI * 2,
        ax: 6 + r() * 10,          // amplitude horizontal da deriva
        ay: 4 + r() * 8,           // amplitude vertical
        rad: 0.8 + r() * 1.1,
      });
    }
    // colunas esparsas de bolhinhas subindo do fundo
    for (var b = 0; b < nBolhas; b++) {
      gruta.bolhas.push({ dx: 50 + b * ((gw - 100) / (nBolhas - 1)) + (r() * 2 - 1) * 34, ph: r() });
    }
    // feixes de luz diagonais, cada um com largura e balanço próprios
    for (var f = 0; f < nRaios; f++) {
      gruta.raios.push({
        dx: 40 + f * ((gw - 80) / (nRaios - 1)) + (r() * 2 - 1) * 42,  // onde fura a superfície
        wTop: 16 + r() * 12,
        wBot: 44 + r() * 26,
        lean: 46 + r() * 30,       // quanto o feixe tomba para a direita
        ph: r() * Math.PI * 2,
      });
    }
  })();

  // ---------------------------------------------------------------
  // DECORAÇÃO SUBMERSA das ilhas e pilares — musgo/limo escorrido pelas
  // paredes, cracas/caramujos grudados e raízes descendo da base das ilhas
  // flutuantes até perto do leito. Tudo VISUAL (sem colisão nenhuma), em
  // coordenadas de MUNDO, com as posições das 3 ilhas + 3 pilares do lago
  // hardcoded aqui — o drawGrutaDeco desenha por cima dos sólidos.
  // ---------------------------------------------------------------
  (function () {
    var r = makeRand(20260912);
    var LEITO = 1000, SUP = 666;   // leito do lago e linha d'água
    var st = [
      // as 3 ilhas de lodo flutuantes (topo fora d'água, base em 800)
      { x: 1750, w: 240, top: SUP, bot: 800, ilha: true },
      { x: 2650, w: 260, top: SUP, bot: 800, ilha: true },
      { x: 3550, w: 240, top: SUP, bot: 800, ilha: true },
      // os 3 pilares submersos (assentam no leito)
      { x: 2200, w: 90, top: 822, bot: LEITO, ilha: false },
      { x: 3080, w: 100, top: 762, bot: LEITO, ilha: false },
      { x: 4050, w: 90, top: 842, bot: LEITO, ilha: false },
    ];
    for (var si = 0; si < st.length; si++) {
      var s = st[si];
      var d = { x0: s.x - 50, x1: s.x + s.w + 50, musgo: [], cracas: [], raizes: [] };
      for (var lado = 0; lado < 2; lado++) {
        var wx = lado === 0 ? s.x + 2 : s.x + s.w - 2;
        var dir = lado === 0 ? -1 : 1;
        // musgo/limo escorrido pela parede submersa
        var nm = 2 + Math.round(r() * 2);
        for (var m = 0; m < nm; m++) {
          var my = s.top + 8 + r() * (s.bot - s.top - 34);
          d.musgo.push({
            x: wx, y: my, l: 14 + r() * 26,
            cx: wx + dir * (2 + r() * 4),
            ex: wx + dir * (3 + r() * 5),
          });
        }
        // cracas/caramujos grudados na parede
        var nc = 3 + Math.round(r() * 2);
        for (var c = 0; c < nc; c++) {
          d.cracas.push({
            x: wx + dir * 1.5,
            y: s.top + 14 + r() * (s.bot - s.top - 24),
            rad: 1.6 + r() * 1.8,
          });
        }
      }
      // raízes descendo da base flutuante da ilha até perto do leito —
      // é o que vende que a ilha BOIA em vez de assentar no fundo
      if (s.ilha) {
        for (var k = 0; k < 3; k++) {
          var rx = s.x + 24 + k * ((s.w - 48) / 2) + (r() * 2 - 1) * 12;
          var ry = LEITO - 16 - r() * 26;   // ponta perto do leito
          d.raizes.push({
            x: rx, y: s.bot - 4,
            c1x: rx + (r() * 2 - 1) * 22, c1y: s.bot + (ry - s.bot) * 0.35,
            c2x: rx + (r() * 2 - 1) * 16, c2y: s.bot + (ry - s.bot) * 0.7,
            ex: rx + (r() * 2 - 1) * 26, ey: ry,
            lw: 3 + r() * 2.5,
          });
        }
      }
      gruta.deco.push(d);
    }
  })();

  // ---------------------------------------------------------------
  // LUMIS — linhas por cima dos troncos (puxam o ritmo de atravessar sem
  // parar), COLUNAS coladas nas faces dos postes e das paredes (ensinam a
  // escalar) e arcos marcando as trajetórias de soltar o cipó.
  // ---------------------------------------------------------------
  var lumis = [];
  function lumiLine(x, y, n, dx) { kit.lumiLine(lumis, x, y, n, dx); }
  function lumiCol(x, y, n, dy) { kit.lumiCol(lumis, x, y, n, dy); }
  function lumiArc(cx, apexY, n, span, sag) { kit.lumiArc(lumis, cx, apexY, span, sag, n); }

  // (1) margem seca
  lumiLine(150, 578, 4, 62);
  lumiArc(500, 500, 5, 190, 34);
  lumiLine(800, 396, 3, 36);
  lumiArc(1035, 556, 4, 190, 44);      // por cima do tronco-boia tutorial
  // (2+3) O LAGO — trilha de superfície pelos troncos e ilhas...
  lumiLine(1470, 630, 3, 60);
  lumiArc(1870, 560, 3, 130, 30);      // sobre a ILHA A
  lumiArc(2780, 550, 3, 140, 30);      // sobre a ILHA B
  lumiArc(3670, 560, 3, 130, 30);      // sobre a ILHA C
  // ...e as trilhas SUBMERSAS: o convite pro mergulho é a luz lá embaixo
  lumiCol(1030, 940, 4, -72);          // a escada que convida a descer
  lumiLine(920, 972, 3, 56);
  lumiLine(1300, 800, 4, 90);
  lumiArc(2000, 770, 4, 220, 50);      // por cima do pilar 1
  lumiLine(2330, 900, 4, 80);          // rumo ao ninho submerso
  lumiCol(2770, 940, 4, -70);          // debaixo da ILHA B
  lumiLine(3000, 724, 4, 90);          // por cima do pilar 2 (cuidado co'o carango)
  lumiArc(3600, 850, 4, 220, 50);
  lumiLine(4000, 800, 3, 90);
  lumiCol(4430, 950, 4, -75);          // a subida para a margem leste
  // (5) fenda das raízes — a coluna da esquerda é a placa de "sobe por aqui"
  lumiCol(5132, 578, 6, -56);
  lumiCol(5312, 268, 5, 58);
  lumiArc(5300, 570, 3, 110, 30);
  // (6) lamaçal final e clareira
  lumiLine(5570, 572, 3, 54);
  lumiLine(5730, 494, 3, 44);
  lumiLine(5910, 440, 2, 44);
  lumiArc(6110, 550, 4, 150, 42);
  lumiLine(6260, 566, 2, 60);

  // FAÍSCAS — brilho de despedida do coletável (pool fixa do kit, sem GC)
  var sparks = kit.makeSparks(72);

  // ---------------------------------------------------------------
  // DECORAÇÃO por sólido, pré-computada — nada de random por frame.
  // Barrancos ('c'), postes ('p') e feixes ('b') não guardam dados soltos:
  // viram um offscreen inteiro no primeiro draw, e o custo por frame é um blit.
  // ---------------------------------------------------------------
  var decor = [];
  (function () {
    var r = makeRand(20260816);
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      var d = { tufts: [], spots: [], spr: null, ox: 0, oy: 0 };
      if (s.k === 'g') {
        // juncos no topo do lodo firme
        var nt = Math.max(3, Math.floor(s.w / 48));
        for (var j = 0; j < nt; j++) {
          d.tufts.push({ dx: r() * s.w, len: 9 + r() * 13, lean: r() * 2 - 1 });
        }
        if (s.h > 34) {
          var ns = 1 + Math.floor(s.w / 110);
          for (var j2 = 0; j2 < ns; j2++) {
            d.spots.push({ dx: 12 + r() * (s.w - 24), dy: 26 + r() * (s.h - 36), rad: 4 + r() * 8 });
          }
        }
      } else if (s.k === 'r') {
        d.spots.push({ dx: s.w * 0.32, dy: s.h * 0.45, rad: 3 });
        d.spots.push({ dx: s.w * 0.66, dy: s.h * 0.62, rad: 2.4 });
      }
      decor.push(d);
    }
  })();

  // ---------------------------------------------------------------
  // OFFSCREENS — céu, luz difusa, camadas de parallax, bruma, vinheta, sprite
  // da lumi, halo do casulo e um sprite por barranco/poste/feixe.
  //
  // A bruma é o traço da fase: em vez de uma faixa entre patamares como no
  // bosque, aqui ela é uma CAMADA CHEIA de ocre que cobre a tela inteira e
  // engole o fundo. É o que separa este lugar do crepúsculo roxo do bosque.
  // ---------------------------------------------------------------
  var built = false;
  var skySpr, luzSpr, farL, midL, mistL, nearL, frontL, brumaSpr, vig, lumiSpr, casuloSpr;
  var grutaSpr, veuSpr;
  var LAYER_H = 680;
  var ROCK_PAD = 16;        // folga para o limo transbordar o barranco

  function buildAll() {
    if (built) return;
    built = true;

    // céu do pântano: verde-oliva alto → ocre doente → bruma clara embaixo.
    // Sem estrelas e sem sol de verdade: aqui a luz é difusa, ninguém vê a
    // fonte. Isso, mais que a cor, é o que faz o lugar parecer abafado.
    skySpr = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, '#4d5520');
      gr.addColorStop(0.28, '#6f7526');
      gr.addColorStop(0.55, '#9b9236');
      gr.addColorStop(0.8, '#c0a54c');
      gr.addColorStop(1, '#d5bd6f');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      // esporos boiando no ar parado
      var r = makeRand(77);
      g.fillStyle = 'rgba(240,230,170,0.5)';
      for (var i = 0; i < 46; i++) {
        var sx = r() * VIEW_W, sy = r() * VIEW_H * 0.7, sr = 0.6 + r() * 1.4;
        g.globalAlpha = 0.08 + r() * 0.22;
        g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    })(skySpr.getContext('2d'));

    // clarão sem contorno: o sol existe, mas não se enxerga através da bruma
    luzSpr = makeCanvas(420, 420);
    (function (g) {
      var gr = g.createRadialGradient(210, 210, 10, 210, 210, 210);
      gr.addColorStop(0, 'rgba(255,250,195,0.5)');
      gr.addColorStop(0.3, 'rgba(238,226,140,0.26)');
      gr.addColorStop(0.65, 'rgba(206,192,96,0.1)');
      gr.addColorStop(1, 'rgba(190,178,80,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 420, 420);
    })(luzSpr.getContext('2d'));

    farL = makeCanvas(2400, LAYER_H); paintFar(farL.getContext('2d'));
    midL = makeCanvas(2400, LAYER_H); paintMid(midL.getContext('2d'));
    mistL = makeCanvas(1600, LAYER_H); paintMist(mistL.getContext('2d'));
    nearL = makeCanvas(2400, LAYER_H); paintNear(nearL.getContext('2d'));
    frontL = makeCanvas(1800, LAYER_H); paintFront(frontL.getContext('2d'));

    // bruma de tela cheia: a camada que faz o pântano ser o pântano
    brumaSpr = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, 'rgba(196,178,96,0.06)');
      gr.addColorStop(0.45, 'rgba(206,186,104,0.16)');
      gr.addColorStop(1, 'rgba(216,196,120,0.3)');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      // bolsões densos, para a bruma não parecer um filtro liso
      var r = makeRand(909);
      g.fillStyle = 'rgba(224,206,132,0.09)';
      for (var i = 0; i < 16; i++) {
        var px = r() * VIEW_W, py = 120 + r() * (VIEW_H - 120);
        g.beginPath();
        g.ellipse(px, py, 120 + r() * 210, 26 + r() * 46, 0, 0, Math.PI * 2);
        g.fill();
      }
    })(brumaSpr.getContext('2d'));

    // vinheta esverdeada, mais fechada que a do bosque: o horizonte some
    vig = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 210, VIEW_W / 2, VIEW_H / 2, 640);
      gr.addColorStop(0, 'rgba(26,30,10,0)');
      gr.addColorStop(1, 'rgba(26,30,10,0.5)');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    })(vig.getContext('2d'));

    lumiSpr = kit.makeLumiSprite();

    // GRUTA SUBMERSA — tudo o que não mexe vai num offscreen só: o corpo
    // d'água em gradiente (superfície verde-oliva clareada pela luz →
    // fundo verde-escuro profundo), as raízes descendo pelas paredes, as
    // pedras musgosas do leito e a conchinha. O custo por frame é um blit;
    // por cima dele só entram as camadas animadas (algas, raios, plâncton,
    // bolhas e a linha de superfície).
    grutaSpr = makeCanvas(rasos[0].w, rasos[0].h);
    paintGruta(grutaSpr.getContext('2d'), rasos[0].w, rasos[0].h, 20260911);

    // véu de imersão: cobre a tela quando o player está debaixo d'água.
    // Verde-azulado escuro com uma vinheta aquática levinha nas bordas —
    // desenhado com alpha ~0.14 lá no drawFront, com transição por lerp.
    veuSpr = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      g.fillStyle = 'rgba(14,52,44,1)';
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      var gr = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 200, VIEW_W / 2, VIEW_H / 2, 620);
      gr.addColorStop(0, 'rgba(6,30,28,0)');
      gr.addColorStop(1, 'rgba(6,30,28,0.85)');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    })(veuSpr.getContext('2d'));

    // halo do casulo: verde-azulado, o único frio da paleta inteira — é o que
    // faz o ninho saltar no meio de tanto amarelo
    casuloSpr = makeCanvas(96, 96);
    (function (g) {
      var gr = g.createRadialGradient(48, 48, 3, 48, 48, 48);
      gr.addColorStop(0, 'rgba(190,255,240,0.9)');
      gr.addColorStop(0.25, 'rgba(90,220,200,0.55)');
      gr.addColorStop(0.6, 'rgba(50,170,160,0.2)');
      gr.addColorStop(1, 'rgba(40,150,140,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 96, 96);
    })(casuloSpr.getContext('2d'));

    // um offscreen por barranco, poste e feixe (desenho caro, feito uma vez)
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i], c;
      if (s.k === 'c') {
        c = makeCanvas(s.w + ROCK_PAD * 2, s.h + ROCK_PAD * 2);
        paintBarranco(c.getContext('2d'), s.w, s.h, 3301 + i * 137);
        decor[i].spr = c; decor[i].ox = -ROCK_PAD; decor[i].oy = -ROCK_PAD;
      } else if (s.k === 'p') {
        c = makeCanvas(s.w + 24, s.h + 30);
        paintPoste(c.getContext('2d'), s.w, s.h, 5501 + i * 211);
        decor[i].spr = c; decor[i].ox = -12; decor[i].oy = -22;
      } else if (s.k === 'b') {
        c = makeCanvas(s.w + 20, s.h + 34);
        paintFeixe(c.getContext('2d'), s.w, s.h, 7701 + i * 97);
        decor[i].spr = c; decor[i].ox = -10; decor[i].oy = -12;
      }
    }
  }

  // ---------------------------------------------------------------
  // BARRANCO DE RAÍZES ('c') — a parede escalável da fase. Onde o bosque
  // empilhava pedra, aqui é terra encharcada segurada por um emaranhado de
  // raízes: são elas que dizem "dá para agarrar".
  // ---------------------------------------------------------------
  function paintBarranco(g, w, h, seed) {
    var r = makeRand(seed);
    var P = ROCK_PAD;

    g.save();
    g.beginPath(); g.rect(P, P, w, h); g.clip();

    var gr = g.createLinearGradient(0, P, 0, P + h);
    gr.addColorStop(0, '#6b6a34');
    gr.addColorStop(0.4, '#4a4826');
    gr.addColorStop(1, '#22240f');
    g.fillStyle = gr;
    g.fillRect(P, P, w, h);

    // estratos de turfa: faixas horizontais irregulares
    for (var y = P + 18; y < P + h; y += 26 + r() * 20) {
      g.strokeStyle = 'rgba(22,24,10,0.42)';
      g.lineWidth = 2 + r() * 3;
      g.beginPath();
      g.moveTo(P - 6, y);
      g.quadraticCurveTo(P + w * 0.5, y + (r() * 2 - 1) * 9, P + w + 6, y + (r() * 2 - 1) * 7);
      g.stroke();
      g.strokeStyle = 'rgba(214,204,120,0.12)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(P - 6, y - 4);
      g.quadraticCurveTo(P + w * 0.5, y - 4 + (r() * 2 - 1) * 9, P + w + 6, y - 4 + (r() * 2 - 1) * 5);
      g.stroke();
    }

    // raízes pendendo pela face — o convite visual para agarrar
    g.lineCap = 'round';
    var nr = 2 + Math.floor(w / 46);
    for (var k = 0; k < nr; k++) {
      var rx = P + 6 + r() * Math.max(1, w - 12);
      var ry = P + r() * h * 0.55, rl = 60 + r() * (h * 0.5);
      g.strokeStyle = 'rgba(30,34,14,0.55)';
      g.lineWidth = 4 + r() * 4;
      g.beginPath();
      g.moveTo(rx, ry);
      g.bezierCurveTo(rx + (r() * 2 - 1) * 22, ry + rl * 0.4,
                      rx + (r() * 2 - 1) * 26, ry + rl * 0.75, rx + (r() * 2 - 1) * 16, ry + rl);
      g.stroke();
      g.strokeStyle = 'rgba(168,178,86,0.24)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(rx - 2, ry);
      g.quadraticCurveTo(rx - 4, ry + rl * 0.5, rx - 2, ry + rl * 0.9);
      g.stroke();
    }

    // bocas escuras de lodo escorrendo
    if (w >= 80 && h >= 140) {
      var nb = 1 + Math.floor(r() * 2);
      for (var bi = 0; bi < nb; bi++) {
        var mx = P + 20 + r() * Math.max(1, w - 40);
        var my = P + h * (0.35 + r() * 0.4);
        var mg = g.createRadialGradient(mx, my - 8, 2, mx, my, 46);
        mg.addColorStop(0, 'rgba(10,14,4,0.9)');
        mg.addColorStop(0.6, 'rgba(16,22,8,0.6)');
        mg.addColorStop(1, 'rgba(16,22,8,0)');
        g.fillStyle = mg;
        g.beginPath(); g.ellipse(mx, my, 20 + r() * 18, 26 + r() * 26, 0, 0, Math.PI * 2); g.fill();
      }
    }

    // luz difusa: quase sem direção, só um pouco mais clara em cima
    var sg = g.createLinearGradient(0, P, 0, P + h);
    sg.addColorStop(0, 'rgba(226,214,132,0.12)');
    sg.addColorStop(0.5, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(14,18,6,0.5)');
    g.fillStyle = sg;
    g.fillRect(P, P, w, h);
    g.restore();

    // topo: limo amarelo-esverdeado transbordando as bordas
    g.fillStyle = '#5c7a1e';
    g.fillRect(P - 3, P - 2, w + 6, 14);
    g.fillStyle = '#9dc23a';
    g.fillRect(P - 3, P - 2, w + 6, 7);
    g.fillStyle = 'rgba(246,240,170,0.55)';
    g.fillRect(P - 3, P - 3, w + 6, 3);
    g.fillStyle = '#5c7a1e';
    g.beginPath(); g.arc(P - 1, P + 17, 4.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(P + w + 1, P + 21, 5, 0, Math.PI * 2); g.fill();
    // juncos no topo
    g.strokeStyle = '#b8d24a';
    g.lineWidth = 2;
    g.lineCap = 'round';
    var nt = Math.max(3, Math.floor(w / 40));
    for (var ti = 0; ti < nt; ti++) {
      var bx = P + r() * w, len = 10 + r() * 14, lean = r() * 2 - 1;
      g.beginPath();
      g.moveTo(bx, P);
      g.quadraticCurveTo(bx + lean * 5, P - len * 0.7, bx + lean * 10, P - len);
      g.stroke();
    }
  }

  // ---------------------------------------------------------------
  // POSTE DE BAMBU ('p') — cana roliça com nós. É um sólido fino e alto, e a
  // escalada de parede do player já funciona nele; aqui é só o retrato.
  // O offscreen tem folga lateral porque as folhas saem para fora da colisão.
  // ---------------------------------------------------------------
  function paintPoste(g, w, h, seed) {
    var r = makeRand(seed);
    var X = 12, Y = 22;   // origem do sólido dentro do offscreen

    // corpo roliço: claro no meio, escuro nas bordas (é um cilindro)
    var gr = g.createLinearGradient(X, 0, X + w, 0);
    gr.addColorStop(0, '#7b6522');
    gr.addColorStop(0.3, '#c8a94f');
    gr.addColorStop(0.55, '#e0c46c');
    gr.addColorStop(0.8, '#9d8134');
    gr.addColorStop(1, '#5f4d1a');
    g.fillStyle = gr;
    g.fillRect(X, Y, w, h);

    // nós da cana a cada ~64px: são eles que leem como bambu de longe
    var passo = 58 + r() * 16;
    for (var y = Y + passo * 0.4; y < Y + h; y += passo) {
      g.fillStyle = 'rgba(70,56,16,0.6)';
      g.fillRect(X - 2, y, w + 4, 5);
      g.fillStyle = 'rgba(246,232,160,0.35)';
      g.fillRect(X - 2, y + 5, w + 4, 2);
      // toco de galho seco, alternando de lado
      var lado = r() < 0.5 ? -1 : 1;
      if (r() < 0.55) {
        g.strokeStyle = '#6d5a1e';
        g.lineWidth = 3;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(X + (lado < 0 ? 1 : w - 1), y + 2);
        g.lineTo(X + (lado < 0 ? -8 : w + 8), y - 5);
        g.stroke();
      }
    }

    // fibras verticais
    g.strokeStyle = 'rgba(60,48,14,0.28)';
    g.lineWidth = 1.2;
    for (var f = 0; f < 3; f++) {
      var fx = X + 4 + r() * (w - 8);
      g.beginPath(); g.moveTo(fx, Y); g.lineTo(fx, Y + h); g.stroke();
    }

    // musgo escorrendo pela base: o poste está enfiado no lodo
    var bg = g.createLinearGradient(0, Y + h - 90, 0, Y + h);
    bg.addColorStop(0, 'rgba(40,56,14,0)');
    bg.addColorStop(1, 'rgba(40,56,14,0.75)');
    g.fillStyle = bg;
    g.fillRect(X, Y + h - 90, w, 90);

    // topo cortado em bisel, com a boca escura da cana
    g.fillStyle = '#3d3210';
    g.beginPath();
    g.ellipse(X + w / 2, Y + 2, w / 2, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e6cf7e';
    g.beginPath();
    g.ellipse(X + w / 2, Y, w / 2, 5, 0, Math.PI, Math.PI * 2);
    g.fill();

    // folhas de bambu no alto, saindo para fora da colisão
    g.strokeStyle = '#7fa02c';
    g.fillStyle = '#8fb134';
    g.lineWidth = 2;
    for (var l = 0; l < 5; l++) {
      var ly = Y + 6 + r() * 46;
      var dir = l % 2 === 0 ? -1 : 1;
      var lx = X + (dir < 0 ? 0 : w);
      var len = 16 + r() * 16;
      g.beginPath();
      g.moveTo(lx, ly);
      g.quadraticCurveTo(lx + dir * len * 0.6, ly - 12, lx + dir * len, ly - 18 - r() * 8);
      g.stroke();
    }
  }

  // ---------------------------------------------------------------
  // FEIXE DE BAMBU ('b') — plataforma estreita feita de três canas amarradas.
  // Estreita de propósito: no bambuzal o pouso tem de ser mirado.
  // ---------------------------------------------------------------
  function paintFeixe(g, w, h, seed) {
    var r = makeRand(seed);
    var X = 10, Y = 12;

    // sombra do feixe, para ele não parecer colado no fundo
    g.fillStyle = 'rgba(18,22,6,0.3)';
    g.fillRect(X + 4, Y + h, w - 8, 5);

    // três canas empilhadas, a de cima é a superfície de colisão
    var canas = [
      { dy: h * 0.62, hh: h * 0.42, c0: '#8a7128', c1: '#c4a44a' },
      { dy: h * 0.3, hh: h * 0.44, c0: '#9c8231', c1: '#d6b658' },
      { dy: 0, hh: h * 0.5, c0: '#b5974a', c1: '#eed683' },
    ];
    for (var i = 0; i < canas.length; i++) {
      var c = canas[i];
      var gr = g.createLinearGradient(0, Y + c.dy, 0, Y + c.dy + c.hh);
      gr.addColorStop(0, c.c1);
      gr.addColorStop(1, c.c0);
      g.fillStyle = gr;
      g.fillRect(X, Y + c.dy, w, c.hh);
    }
    // fio claro no topo: onde a luz difusa pega
    g.fillStyle = 'rgba(250,240,180,0.5)';
    g.fillRect(X, Y - 1, w, 2);

    // amarras de cipó a cada terço
    g.strokeStyle = '#4d3d14';
    g.lineWidth = 3.5;
    for (var a = 1; a <= 2; a++) {
      var ax = X + (w * a) / 3;
      g.beginPath();
      g.moveTo(ax - 3, Y - 2);
      g.lineTo(ax + 3, Y + h + 2);
      g.stroke();
    }

    // limo pendurado na barriga do feixe
    g.strokeStyle = 'rgba(96,124,32,0.75)';
    g.lineWidth = 2;
    g.lineCap = 'round';
    var nl = Math.max(2, Math.round(w / 34));
    for (var k = 0; k < nl; k++) {
      var lx = X + 8 + r() * Math.max(1, w - 16), ll = 8 + r() * 16;
      g.beginPath();
      g.moveTo(lx, Y + h);
      g.quadraticCurveTo(lx + (r() * 2 - 1) * 5, Y + h + ll * 0.6, lx + (r() * 2 - 1) * 7, Y + h + ll);
      g.stroke();
    }
  }

  // ---------------------------------------------------------------
  // GRUTA SUBMERSA (estático) — o corpo d'água e o cenário do fundo.
  // Ordem das tintas: gradiente da água → decoração (raízes, pedras,
  // concha) → segunda demão fina de água por cima, para o cenário parecer
  // AFUNDADO na água e não colado na frente dela.
  // ---------------------------------------------------------------
  function paintGruta(g, w, h, seed) {
    var r = makeRand(seed);

    // o corpo d'água: superfície verde-oliva clareada pela luz difusa,
    // escurecendo até um verde-escuro de fundo de gruta
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(118,138,62,0.5)');
    gr.addColorStop(0.22, 'rgba(84,108,52,0.6)');
    gr.addColorStop(0.55, 'rgba(48,72,42,0.72)');
    gr.addColorStop(1, 'rgba(16,34,24,0.88)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);

    // raízes retorcidas descendo pelas paredes internas (x=0 e x=w),
    // do meio da gruta até perto do leito — são as margens que continuam
    // vivas debaixo d'água
    g.lineCap = 'round';
    for (var lado = 0; lado < 2; lado++) {
      var px = lado === 0 ? 3 : w - 3;
      var dir = lado === 0 ? 1 : -1;
      var nr = 3;
      for (var k = 0; k < nr; k++) {
        var ry = 58 + k * 86 + r() * 40;
        var rl = 90 + r() * 110;
        g.strokeStyle = 'rgba(26,34,16,0.7)';
        g.lineWidth = 4.5 + r() * 3.5;
        g.beginPath();
        g.moveTo(px, ry);
        g.bezierCurveTo(px + dir * (14 + r() * 18), ry + rl * 0.3,
                        px + dir * (4 + r() * 10), ry + rl * 0.65,
                        px + dir * (18 + r() * 20), ry + rl);
        g.stroke();
        // fio de limo claro acompanhando a raiz
        g.strokeStyle = 'rgba(120,150,70,0.3)';
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(px + dir * 2, ry + 6);
        g.quadraticCurveTo(px + dir * (12 + r() * 12), ry + rl * 0.5, px + dir * (10 + r() * 14), ry + rl * 0.9);
        g.stroke();
      }
    }

    // pedras musgosas espalhadas pelo leito inteiro (escala com a largura)
    var np = Math.max(5, Math.round(w / 72));
    for (var pi = 0; pi < np; pi++) {
      var bx = 24 + pi * ((w - 48) / (np - 1)) + (r() * 2 - 1) * 22;
      var brw = 12 + r() * 14, brh = 7 + r() * 7;
      g.fillStyle = 'rgba(30,38,22,0.9)';
      g.beginPath();
      g.ellipse(bx, h - 5 - brh * 0.4, brw, brh, 0, 0, Math.PI * 2);
      g.fill();
      // coroa de musgo por cima da pedra
      g.fillStyle = 'rgba(74,104,46,0.55)';
      g.beginPath();
      g.ellipse(bx - brw * 0.15, h - 6 - brh * 0.8, brw * 0.7, brh * 0.45, 0, 0, Math.PI * 2);
      g.fill();
    }

    // conchinhas rente ao leito, espalhadas pelo comprimento todo — cada
    // trecho do lago ganha o seu tesourinho para valer a nadada
    var nsh = Math.max(1, Math.round(w / 620));
    for (var sh = 0; sh < nsh; sh++) {
      var cx2 = 90 + sh * ((w - 180) / Math.max(1, nsh - 1)) + (r() * 2 - 1) * 60;
      var cy2 = h - 8;
      g.fillStyle = 'rgba(214,206,170,0.85)';
      g.beginPath();
      g.moveTo(cx2 - 9, cy2);
      g.quadraticCurveTo(cx2, cy2 - 13, cx2 + 9, cy2);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(120,110,80,0.7)';
      g.lineWidth = 1.2;
      for (var v = -1; v <= 1; v++) {
        g.beginPath();
        g.moveTo(cx2 + v * 4, cy2 - 1);
        g.lineTo(cx2 + v * 6, cy2 - 9 + Math.abs(v) * 3);
        g.stroke();
      }
    }
    // cristaizinhos verde-azulados pelo leito — o único frio da paleta,
    // como o casulo: são o que faz o fundo valer o mergulho
    var nkx = Math.max(1, Math.round(w / 740));
    for (var kk = 0; kk < nkx; kk++) {
      var kx = 180 + kk * ((w - 360) / Math.max(1, nkx - 1)) + (r() * 2 - 1) * 80;
      var ky = h - 7;
      g.fillStyle = 'rgba(110,220,200,0.8)';
      g.beginPath();
      g.moveTo(kx, ky - 14);
      g.lineTo(kx + 5, ky - 4);
      g.lineTo(kx + 2, ky);
      g.lineTo(kx - 3, ky - 2);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(220,255,246,0.7)';
      g.fillRect(kx - 1, ky - 12, 2, 6);
    }

    // segunda demão fina de água por cima da decoração: afunda tudo
    var gr2 = g.createLinearGradient(0, 0, 0, h);
    gr2.addColorStop(0, 'rgba(104,128,60,0.16)');
    gr2.addColorStop(0.6, 'rgba(40,64,38,0.2)');
    gr2.addColorStop(1, 'rgba(12,28,20,0.34)');
    g.fillStyle = gr2;
    g.fillRect(0, 0, w, h);

    // faixa clara logo abaixo da superfície: a luz que ainda entra
    var gr3 = g.createLinearGradient(0, 0, 0, 26);
    gr3.addColorStop(0, 'rgba(222,232,150,0.28)');
    gr3.addColorStop(1, 'rgba(222,232,150,0)');
    g.fillStyle = gr3;
    g.fillRect(0, 0, w, 26);
  }

  // --- camada distante: barrancos e árvores mortas afogadas na bruma ---
  function paintFar(g) {
    var r = makeRand(1102);
    var base = LAYER_H;

    // barrancos chapados, quase monocromáticos: a bruma come o contraste
    for (var c = 0; c < 6; c++) {
      var cw = 200 + r() * 220;
      var cx = c * 420 + r() * 130;
      var ch = 200 + r() * 190;
      var top = base - 30 - ch;
      g.fillStyle = 'rgba(104,104,52,0.55)';
      g.beginPath();
      g.moveTo(cx, base);
      g.lineTo(cx + 14, top + 30);
      g.quadraticCurveTo(cx + cw * 0.4, top - 18, cx + cw * 0.66, top + 14);
      g.quadraticCurveTo(cx + cw * 0.88, top + 30, cx + cw, top + 64);
      g.lineTo(cx + cw, base);
      g.closePath();
      g.fill();
    }

    // choupana da bruxa do pântano, bem ao longe: só a silhueta — é a dona
    // do lodo, e a fase agora tem cara dela mesmo antes de chegar ao chefão
    (function () {
      var hx = 1860, hb = base - 30, hw = 92, hh = 76;
      g.fillStyle = 'rgba(60,58,28,0.62)';
      g.beginPath();
      g.moveTo(hx - hw / 2, hb);
      g.lineTo(hx - hw / 2, hb - hh * 0.55);
      g.lineTo(hx, hb - hh);
      g.lineTo(hx + hw / 2, hb - hh * 0.55);
      g.lineTo(hx + hw / 2, hb);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(46,44,20,0.7)';
      g.beginPath();
      g.moveTo(hx - hw * 0.62, hb - hh * 0.5);
      g.lineTo(hx, hb - hh * 1.24);
      g.lineTo(hx + hw * 0.62, hb - hh * 0.5);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(160,220,90,0.35)';
      g.beginPath();
      g.arc(hx - 6, hb - hh * 0.42, 8, 0, Math.PI * 2);
      g.fill();
    })();

    // duas fileiras de morros baixos
    g.fillStyle = 'rgba(120,118,58,0.5)';
    hillBand(g, r, base - 190, 70, 5);
    g.fillStyle = 'rgba(96,96,44,0.62)';
    hillBand(g, r, base - 116, 56, 7);

    // árvores mortas: só tronco e galhos secos, nenhuma folha
    g.strokeStyle = 'rgba(70,70,34,0.8)';
    for (var i = 0; i < 13; i++) {
      var tx = 50 + i * 182 + r() * 80;
      var th = 160 + r() * 150;
      var ty = base - 30;
      var sway = (r() * 2 - 1) * 46;
      g.lineWidth = 8 + r() * 7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(tx, ty);
      g.bezierCurveTo(tx + sway * 0.3, ty - th * 0.4, tx + sway, ty - th * 0.72, tx + sway * 0.6, ty - th);
      g.stroke();
      for (var b = 0; b < 4; b++) {
        var bt = 0.4 + b * 0.16;
        var bx = tx + sway * bt * 0.8, by = ty - th * bt;
        var dir = (b % 2 === 0 ? 1 : -1);
        g.lineWidth = 3 + r() * 3;
        g.beginPath();
        g.moveTo(bx, by);
        g.quadraticCurveTo(bx + dir * 34, by - 22, bx + dir * (48 + r() * 30), by - 44 - r() * 22);
        g.stroke();
      }
    }

    // a bruma já morde aqui: quanto mais longe, mais amarelo e menos forma
    var gr = g.createLinearGradient(0, base - 320, 0, base);
    gr.addColorStop(0, 'rgba(206,190,110,0.1)');
    gr.addColorStop(0.6, 'rgba(206,190,110,0.3)');
    gr.addColorStop(1, 'rgba(214,198,124,0.55)');
    g.fillStyle = gr;
    g.fillRect(0, base - 320, 2400, 320);
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

  // --- camada média: touceiras de bambu e troncos afogados ---
  function paintMid(g) {
    var r = makeRand(2203);
    var base = LAYER_H;

    // linha d'água do brejo ao fundo
    g.fillStyle = 'rgba(84,88,38,0.72)';
    g.fillRect(0, base - 50, 2400, 50);

    // touceiras: grupos de canas de alturas diferentes, sem detalhe
    for (var t = 0; t < 9; t++) {
      var bx = 90 + t * 268 + r() * 90;
      var n = 4 + Math.floor(r() * 5);
      for (var i = 0; i < n; i++) {
        var cx = bx + i * (9 + r() * 8);
        var ch = 190 + r() * 210;
        var lean = (r() * 2 - 1) * 16;
        g.strokeStyle = i % 2 ? 'rgba(140,126,54,0.72)' : 'rgba(116,106,44,0.72)';
        g.lineWidth = 7 + r() * 5;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx, base - 30);
        g.quadraticCurveTo(cx + lean * 0.5, base - 30 - ch * 0.6, cx + lean, base - 30 - ch);
        g.stroke();
        // penacho de folhas no alto
        g.strokeStyle = 'rgba(126,150,44,0.6)';
        g.lineWidth = 2.5;
        for (var l = 0; l < 3; l++) {
          var dir = l % 2 ? 1 : -1;
          g.beginPath();
          g.moveTo(cx + lean, base - 30 - ch);
          g.quadraticCurveTo(cx + lean + dir * 16, base - 30 - ch - 14,
                             cx + lean + dir * 30, base - 30 - ch - 6 - r() * 14);
          g.stroke();
        }
      }
    }

    // troncos caídos meio submersos, quase em silhueta
    g.fillStyle = 'rgba(66,64,28,0.8)';
    for (var k = 0; k < 6; k++) {
      var lx = 130 + k * 400 + r() * 140;
      var lw = 150 + r() * 160, lh = 16 + r() * 12;
      var tilt = (r() * 2 - 1) * 0.16;
      g.save();
      g.translate(lx, base - 34 - r() * 26);
      g.rotate(tilt);
      g.beginPath();
      g.ellipse(0, 0, lw / 2, lh / 2, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // reflexos frouxos na água parada
    g.strokeStyle = 'rgba(226,214,140,0.16)';
    g.lineWidth = 2;
    for (var w2 = 0; w2 < 26; w2++) {
      var wx = r() * 2400, wy = base - 44 + r() * 40, ww = 30 + r() * 90;
      g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + ww, wy); g.stroke();
    }
  }

  // --- bruma em faixas: o que o bosque fazia entre patamares, aqui é o clima ---
  function paintMist(g) {
    var r = makeRand(4404);
    var base = LAYER_H;
    var bands = [base - 430, base - 280, base - 140];
    for (var i = 0; i < bands.length; i++) {
      var by = bands[i], bh = 120 + i * 44;
      var gr = g.createLinearGradient(0, by - bh * 0.5, 0, by + bh * 0.5);
      gr.addColorStop(0, 'rgba(222,206,126,0)');
      gr.addColorStop(0.5, 'rgba(222,206,126,' + (0.2 + i * 0.07).toFixed(2) + ')');
      gr.addColorStop(1, 'rgba(222,206,126,0)');
      g.fillStyle = gr;
      g.fillRect(0, by - bh * 0.5, 1600, bh);
      g.fillStyle = 'rgba(234,220,148,0.11)';
      for (var k = 0; k < 11; k++) {
        var px = r() * 1600, pw = 110 + r() * 220, ph = 24 + r() * 40;
        g.beginPath();
        g.ellipse(px, by + (r() * 2 - 1) * 26, pw, ph, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // --- camada próxima: juncos altos e folhas de taboa ---
  function paintNear(g) {
    var r = makeRand(3304);
    var base = LAYER_H;
    g.fillStyle = '#2b3312';
    g.fillRect(0, base - 78, 2400, 78);
    g.fillStyle = '#333c15';
    for (var i = 0; i < 18; i++) {
      var bx = i * 134 + r() * 70, by = base - 66 - r() * 26;
      for (var b = 0; b < 3; b++) {
        g.beginPath();
        g.arc(bx + b * 24 - 24, by + r() * 12, 24 + r() * 20, 0, Math.PI * 2);
        g.fill();
      }
    }
    // taboas: lâminas retas e altas, o desenho típico de brejo
    g.strokeStyle = '#3f4c17';
    g.lineCap = 'round';
    for (var f = 0; f < 26; f++) {
      var fx = 30 + f * 92 + r() * 60, fy = base - 20;
      var nb = 3 + Math.floor(r() * 3);
      for (var k = 0; k < nb; k++) {
        var dir = (k % 2 === 0 ? 1 : -1);
        var len = 70 + r() * 80;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(fx, fy);
        g.quadraticCurveTo(fx + dir * len * 0.2, fy - len * 0.7, fx + dir * len * 0.5, fy - len);
        g.stroke();
      }
      // espiga marrom da taboa
      if (r() < 0.4) {
        g.fillStyle = '#6b4a1c';
        g.beginPath();
        g.ellipse(fx + 6, fy - 96 - r() * 26, 4, 15, 0.1, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.strokeStyle = 'rgba(140,168,58,0.7)';
    g.lineWidth = 2;
    for (var s2 = 0; s2 < 44; s2++) {
      var gx = r() * 2400, gy = base - 6;
      g.beginPath();
      g.moveTo(gx, gy);
      g.quadraticCurveTo(gx + (r() * 2 - 1) * 8, gy - 18, gx + (r() * 2 - 1) * 16, gy - 30 - r() * 14);
      g.stroke();
    }
  }

  // --- primeiro plano: juncos escuros embaixo e cipós pendurados no alto ---
  function paintFront(g) {
    var r = makeRand(5505);
    var base = LAYER_H;
    g.fillStyle = '#151a08';
    for (var i = 0; i < 24; i++) {
      var lx = i * 78 + r() * 46, lh = 80 + r() * 130;
      var lean = (r() * 2 - 1) * 34;
      g.beginPath();
      g.moveTo(lx - 20, base + 10);
      g.quadraticCurveTo(lx - 14 + lean * 0.4, base - lh * 0.6, lx + lean, base - lh);
      g.quadraticCurveTo(lx + 14 + lean * 0.4, base - lh * 0.6, lx + 20, base + 10);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#1a2009';
    g.fillRect(0, base - 30, 1800, 30);

    // cipós pendurados do teto — a promessa visual da mecânica da fase
    g.strokeStyle = '#161c09';
    g.fillStyle = '#161c09';
    g.lineCap = 'round';
    for (var h2 = 0; h2 < 4; h2++) {
      var hx = 180 + h2 * 470 + r() * 120;
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(hx - 100, 110);
      g.quadraticCurveTo(hx, 138, hx + 110, 186);
      g.stroke();
      for (var v = 0; v < 5; v++) {
        var vx = hx - 70 + v * 42, vy = 132 + v * 11;
        g.lineWidth = 2.6;
        g.beginPath();
        g.moveTo(vx, vy);
        g.quadraticCurveTo(vx + 7, vy + 30, vx - 5, vy + 54 + r() * 26);
        g.stroke();
        g.beginPath();
        g.ellipse(vx - 5, vy + 60 + r() * 20, 5, 12, 0.35, 0, Math.PI * 2);
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
  // RESET — o engine chama ao (re)carregar a fase. Reacende lumis e ninhos e
  // apaga as faíscas em voo. Nada de auto-reacender olhando o contador do HUD:
  // as lumis ACUMULAM entre fases, então o contador nunca volta a zero e o
  // palpite seria mentira.
  // ---------------------------------------------------------------
  function reset() {
    for (var i = 0; i < lumis.length; i++) lumis[i].taken = false;
    for (var j = 0; j < ninhos.length; j++) ninhos[j].taken = false;
    kit.apagarFaiscas(sparks);
  }

  // ---------------------------------------------------------------
  // UPDATE — lumis pelo kit, ninhos aqui (são o coletável próprio da fase).
  // A coleta do ninho é por proximidade do centro do player, como a da lumi,
  // com raio maior: é um casulo do tamanho da cabeça dele, não uma fagulha.
  // ---------------------------------------------------------------
  function update(dt) {
    kit.coletarLumis(lumis, sparks, dt);

    var p = FG.player;
    var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    for (var i = 0; i < ninhos.length; i++) {
      var n = ninhos[i];
      if (n.taken) continue;
      var dx = n.x - cx, dy = n.y - cy;
      if (dx * dx + dy * dy < NINHO_R * NINHO_R) {
        n.taken = true;
        FG.engine.addLumi(5);
        FG.audio.sfx('checkpoint');
        kit.burst(sparks, n.x, n.y, 22);   // estouro dourado, bem maior que o da lumi
      }
    }
  }

  // ---------------------------------------------------------------
  // DRAW BACK — céu, clarão difuso, camadas de parallax, bruma, mosquitos
  // ---------------------------------------------------------------
  function drawBack(ctx, cam) {
    buildAll();
    var t = FG.engine.time;

    ctx.drawImage(skySpr, 0, 0);

    // o clarão anda de leve com a câmera, mas sem disco: não há sol visível
    var sx = 420 - cam.x * 0.03, sy = 120 - cam.y * 0.05;
    ctx.drawImage(luzSpr, sx - 210, sy - 210);

    drawLayer(ctx, farL, 0.2, cam);

    // bruma no fundo primeiro: ela some com a camada distante e deixa a média
    // parecer bem mais perto do que está
    ctx.save();
    ctx.globalAlpha = 0.66 + 0.16 * Math.sin(t * 0.27);
    drawLayer(ctx, mistL, 0.34, cam);
    ctx.restore();

    drawLayer(ctx, midL, 0.5, cam);

    // nuvem de mosquitos: o vagalume do bosque virou praga de brejo — mais
    // rápido, mais miúdo e esverdeado, para não parecer a mesma fase
    ctx.save();
    for (var i = 0; i < 24; i++) {
      var fx = (((i * 331 + Math.sin(t * 1.6 + i * 2.1) * 26) - cam.x * 0.6) % 1040 + 1040) % 1040 - 40;
      var fy = 110 + (i * 173) % 340 + Math.sin(t * 2.7 + i * 1.3) * 14 - cam.y * 0.55;
      var a = 0.2 + 0.2 * Math.sin(t * 3.4 + i * 2.7);
      if (a <= 0.04) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#d7e88a';
      ctx.beginPath(); ctx.arc(fx, fy, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // segunda passada de bruma, mais forte e mais perto: é ela que engole a
    // camada média e deixa só a próxima com contorno
    ctx.save();
    ctx.globalAlpha = 0.78 + 0.12 * Math.sin(t * 0.41 + 1.2);
    drawLayer(ctx, mistL, 0.66, cam);
    ctx.restore();

    drawLayer(ctx, nearL, 0.76, cam);
  }

  // ---------------------------------------------------------------
  // DRAW SOLIDS — água rasa, poças, terreno, barrancos, postes, feixes,
  // espinhos, lanternas, ninhos, lumis e faíscas (tudo com culling de ~1 tela)
  // ---------------------------------------------------------------
  function drawSolids(ctx, cam) {
    buildAll();
    var t = FG.engine.time;
    var x0 = cam.x - 220, x1 = cam.x + VIEW_W + 220;

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // água do trecho 1 (não machuca): o que era vau raso virou a boca da
    // GRUTA SUBMERSA — água funda ganha o desenho próprio de mergulho
    for (var ri = 0; ri < rasos.length; ri++) {
      var ra = rasos[ri];
      if (ra.x > x1 || ra.x + ra.w < x0) continue;
      if (ra.h > 120) drawGruta(ctx, ra, t, x0, x1);
      else drawRaso(ctx, ra, t);
    }

    // lodo venenoso, atrás das bordas dos buracos
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
      if (s.k === 'c' || s.k === 'p' || s.k === 'b') ctx.drawImage(d.spr, s.x + d.ox, s.y + d.oy);
      else if (s.k === 'r') drawRoot(ctx, s, d);
      else drawTerrain(ctx, s, d);
    }

    // decoração submersa das ilhas e pilares do lago — vem DEPOIS dos
    // sólidos porque o musgo, as cracas e as raízes grudam neles por cima
    drawGrutaDeco(ctx, x0, x1);

    // espinhos por cima do terreno
    for (var h2 = 0; h2 < hazards.length; h2++) {
      var hz2 = hazards[h2];
      if (hz2.t !== 's' || hz2.x > x1 || hz2.x + hz2.w < x0) continue;
      drawSpikes(ctx, hz2);
    }

    // ninhos com casulo
    for (var ni = 0; ni < ninhos.length; ni++) {
      var nn = ninhos[ni];
      if (nn.taken || nn.x > x1 || nn.x < x0) continue;
      drawNinho(ctx, nn, t);
    }

    // lanternas-checkpoint
    for (var c = 0; c < checkpoints.length; c++) {
      var cp = checkpoints[c];
      if (cp.x > x1 || cp.x < x0) continue;
      drawLantern(ctx, cp, FG.engine.checkpoint.x === cp.x, t);
    }

    // lumis e faíscas (o ctx já está no espaço do mundo)
    kit.desenharLumis(ctx, cam, lumis, lumiSpr, t);
    kit.desenharFaiscas(ctx, sparks);

    ctx.restore();
  }

  // --- lodo firme com topo de limo amarelo-esverdeado ---
  function drawTerrain(ctx, s, d) {
    ctx.fillStyle = '#3b3a1c';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    if (s.h > 20) {
      ctx.fillStyle = 'rgba(14,18,6,0.4)';
      ctx.fillRect(s.x, s.y + s.h - 12, s.w, 12);
    }
    // barranco fundo (as margens da gruta descem 420px): bandas de
    // escurecimento progressivo, para a terra afundar em vez de ficar uma
    // parede chapada da mesma cor até lá embaixo. Rects fixos, sem gradiente
    // por frame.
    if (s.h > 220) {
      ctx.fillStyle = 'rgba(14,18,8,0.18)';
      ctx.fillRect(s.x, s.y + s.h * 0.4, s.w, s.h * 0.6);
      ctx.fillStyle = 'rgba(10,14,8,0.22)';
      ctx.fillRect(s.x, s.y + s.h * 0.62, s.w, s.h * 0.38);
      ctx.fillStyle = 'rgba(6,10,6,0.26)';
      ctx.fillRect(s.x, s.y + s.h * 0.82, s.w, s.h * 0.18);
    }
    ctx.fillStyle = 'rgba(20,26,8,0.5)';
    for (var i = 0; i < d.spots.length; i++) {
      var sp = d.spots[i];
      ctx.beginPath();
      ctx.ellipse(s.x + sp.dx, s.y + sp.dy, sp.rad * 1.7, sp.rad, 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    // camada de limo: escura embaixo, viva em cima, com um fio de luz difusa
    ctx.fillStyle = '#5c7a1e';
    ctx.fillRect(s.x - 3, s.y - 2, s.w + 6, 15);
    ctx.fillStyle = '#9dc23a';
    ctx.fillRect(s.x - 3, s.y - 2, s.w + 6, 8);
    ctx.fillStyle = 'rgba(246,240,170,0.32)';
    ctx.fillRect(s.x - 3, s.y - 2, s.w + 6, 2);
    ctx.fillStyle = '#5c7a1e';
    ctx.beginPath(); ctx.arc(s.x - 1, s.y + 16, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s.x + s.w + 1, s.y + 19, 5, 0, Math.PI * 2); ctx.fill();
    // juncos no topo
    ctx.strokeStyle = '#b8d24a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (var j = 0; j < d.tufts.length; j++) {
      var tf = d.tufts[j];
      var bx = s.x + tf.dx, by = s.y - 1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + tf.lean * 5, by - tf.len * 0.7, bx + tf.lean * 10, by - tf.len);
      ctx.stroke();
    }
  }

  // --- raiz exposta ('r'): o degrau baixo do trecho 1 ---
  function drawRoot(ctx, s, d) {
    ctx.fillStyle = '#5a4a20';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + s.h);
    ctx.lineTo(s.x + 5, s.y + 7);
    ctx.quadraticCurveTo(s.x + s.w / 2, s.y - 7, s.x + s.w - 5, s.y + 7);
    ctx.lineTo(s.x + s.w, s.y + s.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(228,214,132,0.2)';
    ctx.fillRect(s.x + 5, s.y + 3, s.w - 10, 4);
    ctx.fillStyle = 'rgba(96,124,32,0.55)';
    ctx.fillRect(s.x + 2, s.y + 1, s.w - 4, 3);
    ctx.fillStyle = 'rgba(18,22,8,0.45)';
    for (var i = 0; i < d.spots.length; i++) {
      var sp = d.spots[i];
      ctx.beginPath();
      ctx.arc(s.x + sp.dx, s.y + sp.dy, sp.rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- água rasa: transparente, sem borda ácida, e o fundo aparecendo ---
  function drawRaso(ctx, ra, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(84,104,48,0.55)';
    ctx.fillRect(ra.x, ra.y, ra.w, ra.h);
    ctx.strokeStyle = 'rgba(206,222,140,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ra.x, ra.y + Math.sin(t * 1.6) * 2);
    for (var x = ra.x + 20; x <= ra.x + ra.w; x += 20) {
      ctx.lineTo(x, ra.y + Math.sin(t * 1.6 + x * 0.045) * 2.6);
    }
    ctx.stroke();
    // pedrinhas do fundo, visíveis porque a água é rasa
    ctx.fillStyle = 'rgba(60,64,26,0.6)';
    for (var i = 0; i < 6; i++) {
      var px = ra.x + 18 + (i * 47) % (ra.w - 36);
      ctx.beginPath();
      ctx.ellipse(px, ra.y + ra.h - 16 - (i % 3) * 5, 7 + (i % 3) * 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------
  // GRUTA SUBMERSA (animado) — o blit do corpo d'água estático e, por cima,
  // as camadas vivas: algas ondulando no leito, raios de luz entrando pela
  // superfície, plâncton em deriva, bolhinhas subindo e a linha de
  // superfície ondulante. Tudo determinístico por t, tabelas fixas do init.
  // ---------------------------------------------------------------
  function drawGruta(ctx, ra, t, x0, x1) {
    // o lago tem 3600px: blita só a FATIA visível do offscreen e faz culling
    // por elemento em todas as tabelas — o custo por frame é o de uma tela
    var sx = Math.max(0, Math.floor(x0 - ra.x));
    var sw = Math.min(ra.w, Math.ceil(x1 - ra.x)) - sx;
    if (sw <= 0) return;
    ctx.drawImage(grutaSpr, sx, 0, sw, ra.h, ra.x + sx, ra.y, sw, ra.h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(ra.x, ra.y, ra.w, ra.h);
    ctx.clip();

    // algas compridas presas ao leito, ondulando devagar
    ctx.lineCap = 'round';
    for (var ai = 0; ai < gruta.algas.length; ai++) {
      var al = gruta.algas[ai];
      var bx = ra.x + al.dx, by = ra.y + ra.h - 2;
      if (bx < x0 - 60 || bx > x1 + 60) continue;
      var sw1 = Math.sin(t * 0.7 + al.ph) * al.amp;          // balanço do meio
      var sw2 = Math.sin(t * 0.7 + al.ph + 1.1) * al.amp * 1.7; // balanço da ponta
      ctx.strokeStyle = 'rgba(58,110,48,0.85)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.bezierCurveTo(bx + sw1 * 0.4, by - al.len * 0.4,
                        bx + sw1, by - al.len * 0.72, bx + sw2, by - al.len);
      ctx.stroke();
      // folhas laterais curtas acompanhando o talo
      ctx.strokeStyle = 'rgba(96,152,64,0.6)';
      ctx.lineWidth = 2;
      for (var fs = 1; fs <= al.seg; fs++) {
        var ft = fs / (al.seg + 1);
        var fx = bx + sw1 * ft, fy = by - al.len * ft;
        var fdir = fs % 2 === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(fx + fdir * 7, fy - 5, fx + fdir * 11 + sw1 * 0.2, fy - 11);
        ctx.stroke();
      }
    }

    // raios de luz diagonais entrando pela superfície, com respiração lenta
    for (var li = 0; li < gruta.raios.length; li++) {
      var rl = gruta.raios[li];
      var top = ra.y + 3;
      var lx = ra.x + rl.dx + Math.sin(t * 0.22 + rl.ph) * 8;
      if (lx + rl.lean + rl.wBot < x0 - 20 || lx - rl.wTop > x1 + 20) continue;
      var depth = ra.h * 0.72;
      ctx.globalAlpha = 0.055 + 0.035 * Math.sin(t * 0.3 + rl.ph);
      if (ctx.globalAlpha > 0.015) {
        ctx.fillStyle = '#e8ecaa';
        ctx.beginPath();
        ctx.moveTo(lx - rl.wTop / 2, top);
        ctx.lineTo(lx + rl.wTop / 2, top);
        ctx.lineTo(lx + rl.lean + rl.wBot / 2, top + depth);
        ctx.lineTo(lx + rl.lean - rl.wBot / 2, top + depth);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // plâncton em suspensão: pontinhos claros com deriva lenta e brilho
    // pulsando fora de fase
    ctx.fillStyle = '#d8e8b0';
    for (var pi = 0; pi < gruta.plancton.length; pi++) {
      var pl = gruta.plancton[pi];
      if (ra.x + pl.dx < x0 - 24 || ra.x + pl.dx > x1 + 24) continue;
      var px = ra.x + pl.dx + Math.sin(t * 0.24 + pl.ph) * pl.ax;
      var py = ra.y + pl.dy + Math.sin(t * 0.17 + pl.ph * 1.9) * pl.ay;
      var pa = 0.16 + 0.16 * Math.sin(t * 0.9 + pl.ph * 2.3);
      if (pa <= 0.03) continue;
      ctx.globalAlpha = pa;
      ctx.beginPath();
      ctx.arc(px, py, pl.rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // bolhinhas subindo do fundo em colunas esparsas, sumindo perto da
    // superfície (mesma receita das poças de veneno, em tom de água)
    ctx.fillStyle = 'rgba(210,232,190,0.9)';
    var fundo = ra.y + ra.h - 6;
    for (var bi = 0; bi < gruta.bolhas.length; bi++) {
      var bo = gruta.bolhas[bi];
      if (ra.x + bo.dx < x0 - 20 || ra.x + bo.dx > x1 + 20) continue;
      for (var k2 = 0; k2 < 3; k2++) {
        var per = (t * 0.16 + bo.ph + k2 * 0.34) % 1;
        var byy = fundo - per * (ra.h - 18);
        var bxx = ra.x + bo.dx + Math.sin(t * 1.1 + bi * 2 + k2 * 2.4 + per * 5) * 4;
        ctx.globalAlpha = 0.5 * (1 - per);
        ctx.beginPath();
        ctx.arc(bxx, byy, 1.6 + (k2 % 3) * 0.9 + per * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // a linha de superfície ondulante, por cima de tudo (fora do clip para
    // as cristas poderem passar 2-3px da borda, como no raso) — só o trecho
    // visível, alinhado na grade de 20px para a onda não "pular" com a câmera
    ctx.save();
    ctx.strokeStyle = 'rgba(206,222,140,0.55)';
    ctx.lineWidth = 2;
    var lx0 = Math.max(ra.x, ra.x + Math.floor((x0 - ra.x - 20) / 20) * 20);
    var lx1 = Math.min(ra.x + ra.w, x1 + 20);
    ctx.beginPath();
    ctx.moveTo(lx0, ra.y + Math.sin(t * 1.6 + lx0 * 0.045) * 2);
    for (var x = lx0 + 20; x <= lx1; x += 20) {
      ctx.lineTo(x, ra.y + Math.sin(t * 1.6 + x * 0.045) * 2.6);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------
  // DECORAÇÃO SUBMERSA das ilhas/pilares — desenhada POR CIMA dos sólidos
  // (drawSolids chama depois do loop de plataformas): musgo escorrido nas
  // paredes, cracas/caramujos e as raízes das ilhas flutuantes descendo até
  // perto do leito. Tabelas fixas do init, culling por estrutura.
  // ---------------------------------------------------------------
  function drawGrutaDeco(ctx, x0, x1) {
    ctx.save();
    ctx.lineCap = 'round';
    for (var di = 0; di < gruta.deco.length; di++) {
      var d = gruta.deco[di];
      if (d.x1 < x0 || d.x0 > x1) continue;
      // musgo/limo escorrido pelas paredes submersas
      ctx.strokeStyle = 'rgba(96,132,52,0.55)';
      ctx.lineWidth = 2.2;
      for (var m = 0; m < d.musgo.length; m++) {
        var mo = d.musgo[m];
        ctx.beginPath();
        ctx.moveTo(mo.x, mo.y);
        ctx.quadraticCurveTo(mo.cx, mo.y + mo.l * 0.6, mo.ex, mo.y + mo.l);
        ctx.stroke();
      }
      // cracas/caramujos grudados
      ctx.fillStyle = 'rgba(206,196,160,0.6)';
      for (var c = 0; c < d.cracas.length; c++) {
        var cr = d.cracas[c];
        ctx.beginPath();
        ctx.arc(cr.x, cr.y, cr.rad, 0, Math.PI * 2);
        ctx.fill();
      }
      // raízes descendo da base das ilhas — visual puro, sem colisão
      ctx.strokeStyle = 'rgba(26,34,16,0.65)';
      for (var k = 0; k < d.raizes.length; k++) {
        var rz = d.raizes[k];
        ctx.lineWidth = rz.lw;
        ctx.beginPath();
        ctx.moveTo(rz.x, rz.y);
        ctx.bezierCurveTo(rz.c1x, rz.c1y, rz.c2x, rz.c2y, rz.ex, rz.ey);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- lodo venenoso: verde-ácido gritante contra o ocre de tudo o mais ---
  function drawPool(ctx, hz, t) {
    var bot = hz.y + hz.h + 26;
    ctx.fillStyle = '#1c2b0e';
    ctx.fillRect(hz.x, hz.y, hz.w, bot - hz.y);
    ctx.fillStyle = 'rgba(112,168,36,0.5)';
    ctx.fillRect(hz.x, hz.y, hz.w, 12);
    ctx.save();
    ctx.strokeStyle = '#c6f047';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hz.x, hz.y + Math.sin(t * 1.7 + hz.x * 0.05) * 2);
    for (var x = hz.x + 18; x <= hz.x + hz.w; x += 18) {
      ctx.lineTo(x, hz.y + Math.sin(t * 1.7 + x * 0.05) * 2.6);
    }
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.restore();
    // bolhas subindo: o lodo respira, e é isso que avisa que ele está vivo
    ctx.save();
    ctx.fillStyle = '#dcff70';
    var nb = Math.max(2, Math.floor(hz.w / 64));
    for (var i = 0; i < nb; i++) {
      var bx = hz.x + 14 + (i * 79) % (hz.w - 28);
      var per = (t * 0.38 + i * 0.31) % 1;
      var by = bot - 4 - per * (bot - hz.y - 6);
      ctx.globalAlpha = 0.6 * (1 - per);
      ctx.beginPath();
      ctx.arc(bx, by, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.28 + 0.14 * Math.sin(t * 2.1 + hz.x);
    ctx.fillStyle = '#a8e034';
    ctx.fillRect(hz.x, hz.y - 3, hz.w, 3);
    ctx.restore();
  }

  // --- espinhos: aqui são juncos secos partidos, não estalagmites ---
  function drawSpikes(ctx, hz) {
    var n = Math.max(3, Math.round(hz.w / 15));
    var sw = hz.w / n;
    ctx.fillStyle = '#2c2a12';
    ctx.fillRect(hz.x, hz.y + hz.h - 5, hz.w, 5);
    for (var i = 0; i < n; i++) {
      var bx = hz.x + i * sw;
      ctx.fillStyle = '#d6cf9a';
      ctx.beginPath();
      ctx.moveTo(bx, hz.y + hz.h);
      ctx.lineTo(bx + sw / 2, hz.y);
      ctx.lineTo(bx + sw, hz.y + hz.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(58,54,24,0.55)';
      ctx.beginPath();
      ctx.moveTo(bx + sw / 2, hz.y);
      ctx.lineTo(bx + sw, hz.y + hz.h);
      ctx.lineTo(bx + sw / 2, hz.y + hz.h);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- ninho com casulo: cama de folhas + casulo verde-azulado pulsando ---
  function drawNinho(ctx, n, t) {
    var bob = Math.sin(t * 1.6 + n.ph) * 3;
    var y = n.y + bob;
    var pulso = 0.78 + 0.22 * Math.sin(t * 2.3 + n.ph * 1.7);

    // halo (offscreen, sem shadowBlur: isto é desenhado todo frame)
    ctx.save();
    ctx.globalAlpha = 0.55 * pulso;
    ctx.drawImage(casuloSpr, n.x - 48, y - 48);
    ctx.restore();

    // cama de folhas secas em volta
    ctx.save();
    ctx.strokeStyle = '#6d5a1c';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * Math.PI * 2 + n.ph;
      var rx = Math.cos(a), ry = Math.sin(a) * 0.55;
      ctx.beginPath();
      ctx.moveTo(n.x + rx * 8, y + 8 + ry * 6);
      ctx.lineTo(n.x + rx * 24, y + 10 + ry * 12);
      ctx.stroke();
    }
    ctx.fillStyle = '#4c4418';
    ctx.beginPath();
    ctx.ellipse(n.x, y + 12, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // casulo: cápsula verde-azulada com um fio claro de luz e nervuras
    ctx.save();
    ctx.fillStyle = '#2e8f84';
    ctx.beginPath();
    ctx.ellipse(n.x, y, 13, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#54c4b0';
    ctx.beginPath();
    ctx.ellipse(n.x - 3, y - 2, 9, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(220,255,246,' + (0.5 * pulso).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(n.x - 5, y - 5, 3.6, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(16,72,68,0.7)';
    ctx.lineWidth = 1.6;
    for (var k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(n.x + k * 6, y - 16);
      ctx.quadraticCurveTo(n.x + k * 9, y, n.x + k * 6, y + 16);
      ctx.stroke();
    }
    // haste que prende o casulo às folhas
    ctx.strokeStyle = '#6d5a1c';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(n.x, y - 18);
    ctx.lineTo(n.x, y - 26);
    ctx.stroke();
    ctx.restore();
  }

  // --- lanterna-checkpoint: aqui é um lampião de brejo pendurado num junco ---
  function drawLantern(ctx, cp, lit, t) {
    var x = cp.x, y = cp.y;
    ctx.fillStyle = '#4a3d16';
    ctx.fillRect(x - 3, y - 66, 6, 66);
    ctx.fillStyle = '#33290f';
    ctx.fillRect(x - 9, y - 4, 18, 4);
    ctx.fillStyle = '#33290f';
    ctx.fillRect(x - 11, y - 94, 22, 30);
    if (lit) {
      var fl = 0.8 + 0.2 * Math.sin(t * 8 + Math.sin(t * 4.7));
      ctx.save();
      ctx.shadowColor = '#c9f04a';
      ctx.shadowBlur = 22 * fl;
      ctx.fillStyle = '#e4ff86';
      ctx.fillRect(x - 8, y - 91, 16, 24);
      ctx.restore();
      ctx.fillStyle = '#f6ffd0';
      ctx.beginPath();
      ctx.ellipse(x, y - 79, 3.4, 5.5 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#242011';
      ctx.fillRect(x - 8, y - 91, 16, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x - 8, y - 91, 5, 24);
    }
    ctx.fillStyle = '#1e1a0b';
    ctx.beginPath();
    ctx.moveTo(x - 14, y - 94);
    ctx.lineTo(x, y - 104);
    ctx.lineTo(x + 14, y - 94);
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------------------
  // DRAW FRONT — juncos de primeiro plano, a bruma de tela cheia e a vinheta.
  // A bruma vem DEPOIS de tudo, inclusive do player: é o que faz o pântano
  // parecer abafado em vez de só amarelo.
  // ---------------------------------------------------------------
  // véu de imersão: persegue 0/1 com lerp por frame, para o mergulho na
  // gruta entrar e sair de cena suave em vez de piscar
  var veuAlvo = 0, veuNivel = 0;

  function drawFront(ctx, cam) {
    buildAll();
    var t = FG.engine.time;
    drawLayer(ctx, frontL, 1.18, cam);
    ctx.save();
    ctx.globalAlpha = 0.82 + 0.1 * Math.sin(t * 0.23);
    ctx.drawImage(brumaSpr, 0, 0);
    ctx.restore();

    // debaixo d'água a tela inteira ganha o filtro verde-azulado escuro —
    // é ele que vende a sensação de mergulho, mais que a própria gruta
    veuAlvo = (FG.player && FG.player.inWater) ? 1 : 0;
    veuNivel += (veuAlvo - veuNivel) * 0.1;
    if (veuNivel > 0.01) {
      ctx.save();
      ctx.globalAlpha = veuNivel * (0.14 + 0.02 * Math.sin(t * 0.7));
      ctx.drawImage(veuSpr, 0, 0);
      ctx.restore();
    }

    ctx.drawImage(vig, 0, 0);
  }

  // ---------------------------------------------------------------
  // API pública — a fase entra no registro na ordem em que o index.html
  // carrega os level*.js (este vem depois do level.js, então cai no índice 1
  // sozinho). Quem publica FG.level é o engine.
  // ---------------------------------------------------------------
  FG.levels = FG.levels || [];
  FG.levels.push({
    id: 'pantano',
    nome: 'O Pântano',
    musica: 'pantano',
    W: W,
    H: H,
    playerStart: { x: 80, y: 560 },
    solids: solids,
    hazards: hazards,
    checkpoints: checkpoints,
    enemyDefs: enemyDefs,
    obstacleDefs: obstacleDefs,
    ninhos: ninhos,
    bossId: 'sandrola',
    bossTriggerX: 6350,
    arena: { x: 6200, w: 1000 },
    waters: waters,
    reset: reset,
    update: update,
    drawBack: drawBack,
    drawSolids: drawSolids,
    drawFront: drawFront,
  });
})();
