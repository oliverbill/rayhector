// Fagulho: Lendas do Bosque — level5.js
// Fase 5, 'caverna': A Caverna. Geometria, lumis, checkpoints, inimigos
// (aranhas e morcegos), obstáculos (defs), a arena do chefão e todo o visual
// de mina abandonada — rocha úmida, veios de cristal azul, escoras de
// madeira, estalactites pingando e teias nos cantos.
//
// O QUE FAZ ESTA FASE DIFERENTE: ela é ESCURA. Não há céu nem sol; a única
// luz é a das lanternas de mineração penduradas ao longo da galeria (e o
// brilho do próprio Fagulho). O breu é pintado no drawFront, por cima de
// tudo: uma camada quase preta com buracos recortados onde há luz (ver
// drawEscuridao). A lista `lanternas` é, ao mesmo tempo, iluminação e mapa —
// onde há lanterna, há caminho.
//
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
  var W = 13200, H = 720;
  var CAM_Y_MAX = H - VIEW_H; // 180 — usado no parallax vertical

  // ---------------------------------------------------------------
  // GEOMETRIA — sólidos
  // k: 'g' = chão de rocha da galeria, 'r' = bloco solto (degrau de minério,
  //    laje de cristal), 'c' = paredão escalável (frente de escavação, com
  //    cristais encravados), 'h' = piso oculto (fundo do poço, não desenhado).
  //
  // RITMO EM 6 TRECHOS
  //  (1) x 0..1600      A BOCA DA MINA: galeria plana e escorada, duas levas
  //                     de degraus curtos. Nenhum bicho, nenhum perigo — é
  //                     onde se aprende que só se enxerga perto da lanterna.
  //  (2) x 1600..3940   O POÇO DAS ARANHAS: duas levas de degraus de minério
  //                     sobre poços de estalagmites (piso oculto no fundo:
  //                     cair custa caro, nunca é beco sem saída), com aranhas
  //                     descendo do teto bem em cima dos degraus.
  //  (3) x 3940..5900   A FRENTE DE ESCAVAÇÃO: dois paredões de 400px
  //                     atravessados na galeria. Só se passa escalando
  //                     (agarrar + saltar) até o patamar — prêmio no topo de
  //                     cada um (checkpoints 3 e 4), e morcegos no caminho.
  //  (4) x 5900..7500   O VEIO DE CRISTAL: travessia sobre o poço em lajes de
  //                     cristal soltas, com um balde-elevador e uma corrente
  //                     de ar da mina (sopro) no trecho final.
  //  (5) x 7500..9600   O DESMORONAMENTO: lajes instáveis que caem com o
  //                     peso, balde de minério balançando (pêndulo) e roda de
  //                     serra do túnel.
  //  (6) x 9400..13200  A ESTAÇÃO: o fim da linha, cortada por uma vala de
  //                     1080px. O comboio de mineração ANDA sem parar entre
  //                     o cais e a doca, com as topeiras ajudantes nos
  //                     vagões, e é por cima dele — saltando de vagão em
  //                     vagão e viajando neles — que se atravessa. Do outro
  //                     lado espera ESBELTINHO OTTON, o chefão.
  //
  // Nada de beco sem saída: dos poços sobe-se pela margem (degrau curto), e
  // os paredões do trecho 3 ficam logo atrás para escalar de volta.
  //
  // Alturas: pulo simples sobe ~118px, duplo ~236px, e uma parede vertical
  // contínua sobe indefinidamente agarrando (~120px por salto de parede —
  // ver tests/parede.js, que prova 500px).
  // ---------------------------------------------------------------
  var solids = [
    // ---- (1) a boca da mina — duas levas de degraus curtos ----
    S(0, 620, 1600, 100, 'g'),        // galeria de entrada
    S(300, 580, 96, 40, 'r'),         // +40
    S(480, 536, 110, 84, 'r'),        // +44
    S(670, 488, 120, 24, 'r'),        // +48 (bônus alto)
    S(1150, 580, 96, 40, 'r'),        // +40 (segunda leva)
    S(1330, 536, 110, 84, 'r'),       // +44

    // ---- (2) o poço das aranhas (duplo) ----
    S(1600, 620, 300, 100, 'g'),      // margem 1600..1900 (checkpoint 1)
    S(1950, 560, 150, 26, 'r'),       // degrau 1 (+60)
    S(2150, 500, 150, 26, 'r'),       // degrau 2 (+60)
    S(2350, 560, 150, 26, 'r'),       // degrau 3, descendo (-60)
    S(1950, 700, 620, 30, 'h'),       // piso oculto do poço (leva 1)
    S(2570, 620, 300, 100, 'g'),      // margem 2570..2870 (checkpoint 2)
    S(2920, 560, 150, 26, 'r'),       // degrau 1 (leva 2)
    S(3120, 500, 150, 26, 'r'),       // degrau 2 (leva 2)
    S(3320, 560, 150, 26, 'r'),       // degrau 3, descendo (leva 2)
    S(2920, 700, 620, 30, 'h'),       // piso oculto do poço (leva 2)
    S(3540, 620, 400, 100, 'g'),      // margem 3540..3940

    // ---- (3) a frente de escavação (dupla) ----
    // O chão continua, mas dois paredões o atravessam de alto a baixo: 400px
    // de rocha vertical contínua. Dali só se sai por cima, agarrando e
    // saltando de face em face até o patamar (o adarve da mina).
    // O chão vem em trechos que TERMINAM rente a cada face de paredão, de
    // propósito: é assim que o jogador (e o tests/reach.js, que modela a
    // escalada como aresta entre um apoio rente à face e o topo) tem onde
    // encostar para começar a subir, dos dois lados de cada parede.
    // (não há piso solto por baixo dos paredões: eles próprios descem até
    // y=620 e fecham o chão naquela coluna — é por isso que não se passa.)
    S(3940, 620, 360, 100, 'g'),      // galeria 3940..4300, até a face do paredão 1
    S(4390, 620, 710, 100, 'g'),      // galeria 4390..5100, entre os dois paredões
    S(5190, 620, 710, 100, 'g'),      // galeria 5190..5900, saída
    S(4300, 220, 90, 400, 'c'),       // paredão 1
    S(4390, 220, 320, 40, 'c'),       // patamar do topo 1 (checkpoint 3)
    S(5100, 220, 90, 400, 'c'),       // paredão 2
    S(5190, 220, 320, 40, 'c'),       // patamar do topo 2 (checkpoint 4)

    // ---- (4) o veio de cristal — lajes soltas sobre o poço ----
    S(5900, 620, 200, 100, 'g'),      // margem de entrada
    S(6100, 700, 1420, 30, 'h'),      // piso oculto do poço
    S(6220, 560, 130, 24, 'r'),       // laje 1
    S(6440, 500, 120, 24, 'r'),       // laje 2
    S(6660, 540, 120, 24, 'r'),       // laje 3
    S(6880, 480, 120, 24, 'r'),       // laje 4
    S(7100, 540, 120, 24, 'r'),       // laje 5
    S(7320, 600, 120, 24, 'r'),       // laje 6, descendo de volta ao chão

    // ---- (5) o desmoronamento ----
    S(7500, 620, 600, 100, 'g'),      // galeria 7500..8100 (checkpoint 5)
    S(8180, 560, 130, 26, 'r'),       // laje instável 1 (+60)
    S(8400, 520, 110, 24, 'r'),       // laje suspensa (+40)
    S(8600, 620, 300, 100, 'g'),      // galeria 8600..8900 (checkpoint 6)
    S(8980, 560, 130, 26, 'r'),       // laje instável 2 (+60)
    S(9200, 520, 110, 24, 'r'),       // laje suspensa 2 (+40)

    // ---- (6) a estação do comboio (arena do chefão) ----
    // O cais da estação e a doca do chefão são DUAS plataformas separadas por
    // uma vala de 1080px com estalagmites no fundo. Não há ponte fixa: a
    // ponte é o comboio, que vai e vem sem parar e nunca cobre a vala
    // inteira (ver `min`/`max` em obstacleDefs) — é saltando para os vagões e
    // viajando neles que se chega ao Esbeltinho Otton.
    // Quem cai não fica preso: há piso oculto no fundo, e a face esquerda da
    // doca (80px acima do fundo) é escalável — mas custa as estalagmites e o
    // tempo, que é o preço de não usar o comboio.
    S(9400, 620, 720, 100, 'g'),      // cais da estação 9400..10120 (checkpoint 7)
    S(10120, 700, 1080, 30, 'h'),     // piso oculto do fundo da vala
    // A doca é COMPRIDA de propósito (2000px): o Otton investe 460px para a
    // esquerda, e quem não tiver para onde recuar leva a investida de graça
    // ou cai na vala a fugir dela. O chefão fica no fundo (x≈12980) e sobra
    // mais de mil pixels de recuo entre ele e a beira.
    S(11200, 620, 2000, 100, 'g'),    // doca do chefão 11200..13200
    S(11320, 530, 130, 24, 'r'),      // pilha de dormentes: o degrau da chegada
    S(12300, 540, 130, 24, 'r'),      // pilha de dormentes: o degrau da luta
  ];

  // ---------------------------------------------------------------
  // HAZARDS — t: 'e' = estalagmites (espinhos de rocha, 1 de dano)
  // ---------------------------------------------------------------
  function Hz(x, y, w, h, t) { return { x: x, y: y, w: w, h: h, t: t }; }

  var hazards = [
    Hz(1950, 674, 620, 26, 'e'),   // fundo do poço das aranhas, leva 1
    Hz(2920, 674, 620, 26, 'e'),   // fundo do poço das aranhas, leva 2
    Hz(4180, 596, 90, 24, 'e'),    // ao pé do paredão 1
    Hz(4980, 596, 90, 24, 'e'),    // ao pé do paredão 2
    Hz(6100, 674, 1420, 26, 'e'),  // fundo do poço do veio de cristal
    Hz(8120, 596, 56, 24, 'e'),    // antes da laje instável 1
    Hz(8920, 596, 56, 24, 'e'),    // antes da laje instável 2
    Hz(9640, 596, 70, 24, 'e'),    // entrada da estação
    Hz(10120, 674, 1080, 26, 'e'), // fundo da vala da estação
  ];

  // 6 lanternas-checkpoint (acendem forte quando ativadas)
  var checkpoints = [
    { x: 1650, y: 620 },   // margem do poço das aranhas, leva 1
    { x: 2620, y: 620 },   // margem do poço das aranhas, leva 2
    { x: 4550, y: 220 },   // topo do paredão 1 — prêmio de escalar
    { x: 5350, y: 220 },   // topo do paredão 2 — prêmio de escalar
    { x: 7560, y: 620 },   // saída do veio de cristal
    { x: 8650, y: 620 },   // meio do desmoronamento
    { x: 9760, y: 620 },   // cais da estação, antes da travessia de comboio
  ];

  // ---------------------------------------------------------------
  // LANTERNAS — a iluminação da mina, e a razão de a fase ser jogável no
  // escuro. Cada uma é um buraco de luz recortado na camada de breu do
  // drawFront, e um lampião desenhado no drawSolids. Ficam onde o caminho
  // vai: num trecho sem lanterna o jogador anda só com o próprio brilho.
  // r = raio da luz em px.
  // ---------------------------------------------------------------
  function Lz(x, y, r) { return { x: x, y: y, r: r || 170 }; }

  var lanternas = [
    // (1) boca da mina — bem iluminada, é o tutorial do escuro
    Lz(160, 540, 190), Lz(560, 470, 180), Lz(980, 540, 190), Lz(1420, 470, 180),
    // (2) poço das aranhas
    Lz(1700, 540, 185), Lz(2060, 450, 165), Lz(2460, 500, 165),
    Lz(2680, 540, 185), Lz(3030, 450, 165), Lz(3430, 500, 165),
    Lz(3700, 540, 180),
    // (3) frente de escavação — lanternas na própria rocha, marcando a subida
    Lz(4120, 540, 175), Lz(4270, 430, 150), Lz(4270, 300, 150), Lz(4520, 190, 185),
    Lz(4880, 540, 175), Lz(5070, 430, 150), Lz(5070, 300, 150), Lz(5320, 190, 185),
    Lz(5750, 540, 180),
    // (4) veio de cristal — a travessia é escura de propósito, só as pontas
    Lz(6000, 540, 185), Lz(6500, 430, 150), Lz(7000, 430, 150), Lz(7420, 540, 175),
    // (5) desmoronamento
    Lz(7620, 540, 185), Lz(8020, 500, 160), Lz(8500, 450, 160),
    Lz(8700, 540, 185), Lz(9120, 450, 160),
    // (6) estação — a mais iluminada da fase: é onde se luta, e é onde o
    // jogador precisa LER o comboio a tempo de saltar. A vala leva lanternas
    // penduradas do teto por cima dela (a travessia nunca é às cegas).
    Lz(9700, 530, 200), Lz(10000, 470, 190),
    Lz(10350, 440, 200), Lz(10750, 440, 200), Lz(11080, 470, 200),
    Lz(11400, 500, 200), Lz(11800, 500, 210),
    Lz(12250, 480, 210), Lz(12700, 500, 210), Lz(13080, 500, 200),
  ];

  // ---------------------------------------------------------------
  // INIMIGOS — só aranhas e morcegos, os bichos da caverna. NENHUM antes de
  // x=1600 (a boca da mina é limpa: ali se aprende a enxergar no escuro).
  //   aranha  — ancorada no teto (y = a altura do fio), desce em quem passa
  //             por baixo. `range` é o alcance horizontal do bote.
  //   morcego — dorme no teto e acorda em voo quando alguém chega perto.
  // ---------------------------------------------------------------
  var enemyDefs = [
    // (2) o poço das aranhas — é a casa delas
    { type: 'aranha',  x: 2020, y: 330, range: 130 },
    { type: 'aranha',  x: 2220, y: 300, range: 130 },
    { type: 'aranha',  x: 2420, y: 330, range: 130 },
    { type: 'morcego', x: 2300, y: 240, range: 240 },
    { type: 'aranha',  x: 2990, y: 330, range: 130 },
    { type: 'aranha',  x: 3190, y: 300, range: 130 },
    { type: 'aranha',  x: 3390, y: 330, range: 130 },
    { type: 'morcego', x: 3270, y: 240, range: 240 },
    { type: 'morcego', x: 3700, y: 380, range: 220 },
    // (3) a frente de escavação — morcegos, que é o que voa junto à parede
    { type: 'morcego', x: 4150, y: 300, range: 240 },
    { type: 'morcego', x: 4550, y: 120, range: 230 },   // sobre o patamar 1
    { type: 'aranha',  x: 4850, y: 300, range: 120 },
    { type: 'morcego', x: 4950, y: 300, range: 240 },
    { type: 'morcego', x: 5350, y: 120, range: 230 },   // sobre o patamar 2
    { type: 'morcego', x: 5700, y: 340, range: 230 },
    // (4) o veio de cristal — aranhas sobre as lajes, morcegos no vão
    { type: 'aranha',  x: 6300, y: 300, range: 130 },
    { type: 'morcego', x: 6520, y: 330, range: 250 },
    { type: 'aranha',  x: 6740, y: 280, range: 130 },
    { type: 'morcego', x: 6960, y: 330, range: 250 },
    { type: 'aranha',  x: 7180, y: 300, range: 130 },
    // (5) o desmoronamento
    { type: 'morcego', x: 7800, y: 350, range: 240 },
    { type: 'aranha',  x: 8240, y: 320, range: 130 },
    { type: 'morcego', x: 8450, y: 300, range: 240 },
    { type: 'aranha',  x: 9040, y: 320, range: 130 },
    { type: 'morcego', x: 9260, y: 300, range: 240 },
    // (6) a estação, antes do gatilho do chefão
    { type: 'morcego', x: 9800, y: 330, range: 250 },
    { type: 'aranha',  x: 10050, y: 300, range: 130 },
    { type: 'morcego', x: 10750, y: 320, range: 250 },
    { type: 'aranha',  x: 11600, y: 300, range: 130 },
    { type: 'morcego', x: 12100, y: 320, range: 250 },
  ];

  // ---------------------------------------------------------------
  // OBSTÁCULOS DINÂMICOS (FG.obstacles lê daqui)
  //   plataforma  {x,y,w,dx,dy,period,phase} — balde-elevador do poço
  //   desmorona   {x,y,w} — laje que treme e cai
  //   sopro       {x,y,w,h} — corrente de ar da mina, empurra para cima
  //   pendulo     {x,y,len,arc,period} — balde de minério balançando
  //   espinhorolo {x,y,w,range,speed} — roda de serra do túnel
  //   locomotiva  {x,groundY,vagoes,interval} — o comboio da estação, com as
  //               topeiras ajudantes dando picaretadas (ver obstacles.js).
  //               SÓ existe na arena do chefão: é a entrada em cena dele.
  // ---------------------------------------------------------------
  var obstacleDefs = [
    // (4) veio de cristal: balde-elevador no vão mais largo e corrente de ar
    // da mina erguendo no trecho final
    { type: 'plataforma', x: 6960, y: 440, w: 110, dx: 140, dy: -40, period: 4.4, phase: 0 },
    { type: 'sopro',      x: 7250, y: 300, w: 90, h: 240 },

    // (5) desmoronamento: as duas lajes instáveis, o balde de minério
    // balançando sobre a galeria e a roda de serra do túnel
    { type: 'desmorona',   x: 8200, y: 512, w: 90 },
    { type: 'pendulo',     x: 8455, y: 300, len: 190, arc: 0.85, period: 2.8 },
    { type: 'espinhorolo', x: 8700, y: 576, w: 44, range: 110, speed: 130 },
    { type: 'desmorona',   x: 9000, y: 512, w: 90 },

    // (6) a estação: o comboio parado nos trilhos. Fica DENTRO da arena do
    // chefão (x 9700..12000), à esquerda dele — vagões e máquina são
    // sólidos, e cada vagão leva uma topeira de picareta.
    // O comboio nasce encostado ao cais (min) e corre até encostar a
    // máquina na doca do chefão (max). Comprimento total ~900px numa vala de
    // 1080: em nenhum instante ele cobre a vala toda, então a travessia é
    // sempre embarcar, viajar e saltar — nunca atravessar a pé por cima.
    { type: 'locomotiva', x: 9500, min: 9500, max: 10460, speed: 185,
      groundY: 620, vagoes: 4, interval: 1.8 },
  ];

  // ---------------------------------------------------------------
  // LUMIS — linhas, arcos e COLUNAS. As colunas marcam o que se sobe: os
  // paredões e a corrente de ar da mina.
  // ---------------------------------------------------------------
  var lumis = [];
  function lumiLine(x, y, n, dx) { kit.lumiLine(lumis, x, y, n, dx); }
  function lumiCol(x, y, n, dy) { kit.lumiCol(lumis, x, y, n, dy); }
  function lumiArc(cx, apexY, n, span, sag) { kit.lumiArc(lumis, cx, apexY, span, sag, n); }
  // (1) boca da mina
  lumiLine(150, 578, 4, 60);
  lumiArc(540, 470, 5, 190, 34);
  lumiLine(660, 442, 3, 40);
  lumiLine(1010, 578, 4, 60);
  lumiArc(1390, 470, 5, 190, 34);
  // (2) poço das aranhas
  lumiArc(1780, 540, 4, 180, 42);
  lumiLine(2010, 520, 3, 44);
  lumiLine(2210, 460, 3, 44);
  lumiArc(2450, 540, 4, 180, 44);
  lumiArc(2750, 540, 4, 180, 42);
  lumiLine(2980, 520, 3, 44);
  lumiLine(3180, 460, 3, 44);
  lumiArc(3420, 540, 4, 180, 44);
  // (3) frente de escavação — a escada de lumis ensina a subir agarrado
  lumiArc(4120, 552, 3, 130, 36);
  lumiCol(4265, 540, 7, -52);
  lumiLine(4420, 160, 4, 62);
  lumiArc(4900, 552, 3, 130, 36);
  lumiCol(5065, 540, 7, -52);
  lumiLine(5220, 160, 4, 62);
  lumiArc(5700, 552, 3, 130, 36);
  // (4) veio de cristal — um arco por laje
  lumiArc(6280, 460, 3, 120, 32);
  lumiArc(6500, 400, 3, 130, 34);
  lumiArc(6720, 440, 3, 120, 32);
  lumiArc(6940, 380, 3, 130, 34);
  lumiCol(7255, 570, 5, -60);          // dentro da corrente de ar
  lumiArc(7160, 440, 3, 120, 32);
  lumiArc(7380, 500, 3, 120, 32);
  // (5) desmoronamento
  lumiLine(7560, 578, 3, 54);
  lumiArc(8240, 460, 4, 160, 40);
  lumiLine(8640, 578, 3, 50);
  lumiArc(9040, 460, 4, 160, 40);
  lumiLine(9280, 470, 2, 48);
  // (6) estação
  lumiLine(9700, 578, 3, 54);
  lumiLine(9980, 500, 3, 60);          // a escada para o teto do vagão
  lumiLine(10300, 480, 6, 90);         // trilha por cima da vala, à altura dos vagões
  lumiLine(10950, 480, 3, 90);
  lumiLine(11340, 490, 3, 44);
  lumiArc(11650, 546, 4, 170, 42);
  lumiLine(12040, 578, 3, 56);
  lumiLine(12340, 500, 3, 44);
  lumiArc(12750, 546, 4, 170, 42);

  // FAÍSCAS — brilho de despedida da lumi coletada (pool fixo do kit, sem GC).
  var sparks = kit.makeSparks(64);

  // ---------------------------------------------------------------
  // DECORAÇÃO por sólido (pré-computada: nada de random por frame).
  // 'g' e 'r' guardam veios de minério e trincas; 'c' vira um offscreen
  // inteiro no primeiro draw (custo zero por frame).
  // ---------------------------------------------------------------
  var decor = [];
  (function () {
    var r = makeRand(20261016);
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      var d = { veios: [], trincas: [], cristais: [], spr: null, ox: 0, oy: 0 };
      if (s.k === 'g' || s.k === 'r') {
        var nv = Math.max(2, Math.floor(s.w / 110));
        for (var j = 0; j < nv; j++) {
          d.veios.push({
            x: 10 + r() * Math.max(1, s.w - 20),
            y: 6 + r() * Math.max(4, Math.min(s.h - 8, 40)),
            len: 16 + r() * 34, bend: (r() * 2 - 1) * 10,
          });
        }
        var nt = Math.max(2, Math.floor(s.w / 90));
        for (var k = 0; k < nt; k++) {
          d.trincas.push({
            x: 10 + r() * Math.max(1, s.w - 20),
            bend: (r() * 2 - 1) * 14, len: 8 + r() * 16,
          });
        }
        // cristais azuis brotando da aresta de cima — a assinatura da fase
        var nc = (s.w > 240) ? 2 + Math.floor(r() * 3) : (r() < 0.55 ? 1 : 0);
        for (var c = 0; c < nc; c++) {
          d.cristais.push({
            x: 14 + r() * Math.max(1, s.w - 28),
            h: 14 + r() * 26, w: 5 + r() * 5, lean: (r() * 2 - 1) * 0.35,
          });
        }
      }
      decor.push(d);
    }
  })();

  // ---------------------------------------------------------------
  // OFFSCREENS — fundo de caverna (não há céu: há rocha), camadas de
  // parallax (paredão distante com veios de cristal, colunas de estalagmite,
  // névoa de poeira de rocha, crista escura), vinheta, lumi, a camada de breu
  // e um sprite por paredão. Construídos uma única vez.
  // ---------------------------------------------------------------
  var built = false;
  var rochaSpr, farL, midL, mistL, nearL, frontL, vig, lumiSpr, escuro;
  var LAYER_H = 680;
  var WALL_PAD = 16;        // folga para a rocha transbordar o paredão

  function buildAll() {
    if (built) return;
    built = true;

    // FUNDO: não há horizonte nenhum — é a parede do outro lado da galeria,
    // escura em cima (o teto some no breu) e um pouco mais quente embaixo,
    // onde a luz das lanternas bate.
    rochaSpr = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, '#06050a');
      gr.addColorStop(0.35, '#120f1c');
      gr.addColorStop(0.72, '#1e1826');
      gr.addColorStop(1, '#2a2130');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      // manchas de umidade na rocha do fundo
      var r = makeRand(31);
      for (var i = 0; i < 22; i++) {
        g.fillStyle = 'rgba(70,60,90,' + (0.05 + r() * 0.07).toFixed(3) + ')';
        g.beginPath();
        g.ellipse(r() * VIEW_W, 120 + r() * (VIEW_H - 120), 60 + r() * 150, 30 + r() * 70, 0, 0, Math.PI * 2);
        g.fill();
      }
    })(rochaSpr.getContext('2d'));

    farL = makeCanvas(2400, LAYER_H); paintFar(farL.getContext('2d'));
    midL = makeCanvas(2400, LAYER_H); paintMid(midL.getContext('2d'));
    mistL = makeCanvas(1600, LAYER_H); paintPoeira(mistL.getContext('2d'));
    nearL = makeCanvas(2400, LAYER_H); paintNear(nearL.getContext('2d'));
    frontL = makeCanvas(1800, LAYER_H); paintFront(frontL.getContext('2d'));

    // vinheta: fecha mais do que nas outras fases — é uma caverna
    vig = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 200, VIEW_W / 2, VIEW_H / 2, 620);
      gr.addColorStop(0, 'rgba(4,3,8,0)');
      gr.addColorStop(1, 'rgba(4,3,8,0.6)');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    })(vig.getContext('2d'));

    // a camada de breu: redesenhada todo frame (os buracos de luz andam com
    // a câmera), mas o canvas é alocado UMA vez
    escuro = makeCanvas(VIEW_W, VIEW_H);

    // sprite da lumi (halo dourado + núcleo) — igual nas outras fases
    lumiSpr = kit.makeLumiSprite();

    // um offscreen por paredão (desenho caro, feito uma vez)
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.k !== 'c') continue;
      var c = makeCanvas(s.w + WALL_PAD * 2, s.h + WALL_PAD * 2);
      paintParedao(c.getContext('2d'), s.w, s.h, 5519 + i * 173);
      decor[i].spr = c; decor[i].ox = -WALL_PAD; decor[i].oy = -WALL_PAD;
    }
  }

  // ---------------------------------------------------------------
  // PAREDÃO — frente de escavação: rocha em camadas (estratos), marcas de
  // picareta, cristais encravados e escoras de madeira. A face tem de
  // CONVIDAR a agarrar, então as saliências são horizontais e marcadas.
  // ---------------------------------------------------------------
  function paintParedao(g, w, h, seed) {
    var r = makeRand(seed);
    var P = WALL_PAD;

    g.save();
    g.beginPath(); g.rect(P, P, w, h); g.clip();

    var gr = g.createLinearGradient(0, P, 0, P + h);
    gr.addColorStop(0, '#4a4256');
    gr.addColorStop(0.45, '#332c40');
    gr.addColorStop(1, '#17121e');
    g.fillStyle = gr;
    g.fillRect(P, P, w, h);

    // estratos: fiadas horizontais de rocha, a "escada" natural da escalada
    var bh = 26 + r() * 10;
    for (var y = P; y < P + h; y += bh) {
      g.fillStyle = 'rgba(190,180,215,' + (0.04 + r() * 0.07).toFixed(3) + ')';
      g.fillRect(P, y + 2, w, bh - 5);
      g.fillStyle = 'rgba(8,6,12,0.5)';
      g.fillRect(P, y, w, 2);
    }

    // marcas de picareta: riscos curtos em diagonal, aos pares
    g.strokeStyle = 'rgba(12,9,16,0.45)';
    g.lineWidth = 2;
    g.lineCap = 'round';
    var nm = 3 + Math.floor(h / 90);
    for (var k = 0; k < nm; k++) {
      var mx = P + 8 + r() * Math.max(1, w - 16), my = P + r() * h;
      g.beginPath();
      g.moveTo(mx, my); g.lineTo(mx + 10, my + 7);
      g.moveTo(mx + 5, my - 4); g.lineTo(mx + 15, my + 3);
      g.stroke();
    }

    // cristais azuis encravados, com halo frio — a luz própria da rocha
    var nc = 1 + Math.floor(h / 150);
    for (var ci = 0; ci < nc; ci++) {
      var cx = P + 12 + r() * Math.max(1, w - 24);
      var cy = P + 40 + r() * Math.max(1, h - 80);
      var cs = 10 + r() * 16;
      var hg = g.createRadialGradient(cx, cy, 1, cx, cy, cs * 3);
      hg.addColorStop(0, 'rgba(120,200,255,0.4)');
      hg.addColorStop(1, 'rgba(90,160,255,0)');
      g.fillStyle = hg;
      g.beginPath(); g.arc(cx, cy, cs * 3, 0, Math.PI * 2); g.fill();
      cristalShape(g, cx, cy, cs, (r() * 2 - 1) * 0.5);
    }

    // escoras de madeira cravadas na face (mineração de verdade)
    g.fillStyle = 'rgba(70,48,30,0.85)';
    var ne = Math.max(1, Math.floor(h / 180));
    for (var ei = 0; ei < ne; ei++) {
      var ey = P + 60 + ei * (h / ne) + r() * 30;
      g.fillRect(P, ey, w, 10);
      g.fillStyle = 'rgba(120,90,55,0.5)';
      g.fillRect(P, ey, w, 2.5);
      g.fillStyle = 'rgba(70,48,30,0.85)';
    }

    // sombra na direita, luz fraca na esquerda
    var sg = g.createLinearGradient(P, 0, P + w, 0);
    sg.addColorStop(0, 'rgba(150,190,255,0.08)');
    sg.addColorStop(0.5, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(4,3,8,0.45)');
    g.fillStyle = sg;
    g.fillRect(P, P, w, h);
    g.restore();

    // topo: borda irregular de rocha quebrada
    g.fillStyle = '#5a5168';
    g.fillRect(P - 3, P - 8, w + 6, 10);
    g.fillStyle = 'rgba(190,210,255,0.22)';
    g.fillRect(P - 3, P - 8, w + 6, 2.4);
  }

  // Cristal: prisma alongado com ponta, núcleo claro e aresta brilhante.
  function cristalShape(g, cx, baseY, h, lean) {
    var w = Math.max(3, h * 0.34);
    g.save();
    g.translate(cx, baseY);
    g.rotate(lean);
    var cg = g.createLinearGradient(-w, 0, w, 0);
    cg.addColorStop(0, 'rgba(60,120,200,0.95)');
    cg.addColorStop(0.45, 'rgba(150,225,255,0.95)');
    cg.addColorStop(1, 'rgba(50,100,180,0.95)');
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(-w, 0);
    g.lineTo(-w * 0.7, -h * 0.72);
    g.lineTo(0, -h);
    g.lineTo(w * 0.7, -h * 0.72);
    g.lineTo(w, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(220,245,255,0.6)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, -h); g.lineTo(0, -h * 0.1);
    g.stroke();
    g.restore();
  }

  // --- camada distante: a galeria se perdendo no escuro, com bocas de túnel
  // e veios de cristal brilhando lá no fundo ---
  function paintFar(g) {
    var r = makeRand(7101);
    var base = LAYER_H;

    g.fillStyle = 'rgba(26,21,34,0.9)';
    g.fillRect(0, base - 320, 2400, 320);

    // bocas de túnel laterais: arcos pretos escorados em madeira
    for (var ax = 90; ax < 2400; ax += 420) {
      var aw = 110 + r() * 60, ah = 130 + r() * 50;
      g.fillStyle = 'rgba(5,4,9,0.92)';
      g.beginPath();
      g.moveTo(ax, base);
      g.lineTo(ax, base - ah);
      g.quadraticCurveTo(ax + aw / 2, base - ah - 30, ax + aw, base - ah);
      g.lineTo(ax + aw, base);
      g.closePath();
      g.fill();
      // escoras do túnel
      g.fillStyle = 'rgba(62,42,26,0.8)';
      g.fillRect(ax - 8, base - ah, 10, ah);
      g.fillRect(ax + aw - 2, base - ah, 10, ah);
      g.fillRect(ax - 10, base - ah - 12, aw + 22, 12);
    }

    // veios de cristal distantes, pontos de luz fria no breu
    for (var i = 0; i < 26; i++) {
      var cx = r() * 2400, cy = base - 60 - r() * 260, cs = 5 + r() * 9;
      var hg = g.createRadialGradient(cx, cy, 1, cx, cy, cs * 4);
      hg.addColorStop(0, 'rgba(110,190,255,0.3)');
      hg.addColorStop(1, 'rgba(80,150,255,0)');
      g.fillStyle = hg;
      g.beginPath(); g.arc(cx, cy, cs * 4, 0, Math.PI * 2); g.fill();
      cristalShape(g, cx, cy + cs, cs, (r() * 2 - 1) * 0.4);
    }
  }

  // --- camada média: colunas de estalagmite/estalactite encontrando-se no
  // meio, e vagonetes abandonados tombados ---
  function paintMid(g) {
    var r = makeRand(7202);
    var base = LAYER_H;

    g.fillStyle = 'rgba(20,16,26,0.92)';
    g.fillRect(0, base - 70, 2400, 70);

    for (var s = 0; s < 9; s++) {
      var cx = 120 + s * 270 + r() * 90;
      var cw = 26 + r() * 26;
      var hUp = 150 + r() * 160;     // estalagmite subindo do chão
      var hDn = 120 + r() * 170;     // estalactite descendo do teto
      var cg = g.createLinearGradient(cx - cw, 0, cx + cw, 0);
      cg.addColorStop(0, '#3a3246');
      cg.addColorStop(0.5, '#2a2334');
      cg.addColorStop(1, '#14101c');
      g.fillStyle = cg;
      g.beginPath();
      g.moveTo(cx - cw, base - 60);
      g.quadraticCurveTo(cx - cw * 0.3, base - 60 - hUp * 0.6, cx, base - 60 - hUp);
      g.quadraticCurveTo(cx + cw * 0.3, base - 60 - hUp * 0.6, cx + cw, base - 60);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(cx - cw * 0.8, 0);
      g.quadraticCurveTo(cx - cw * 0.3, hDn * 0.6, cx, hDn);
      g.quadraticCurveTo(cx + cw * 0.3, hDn * 0.6, cx + cw * 0.8, 0);
      g.closePath();
      g.fill();
    }

    // vagonetes velhos encostados na parede
    for (var v = 0; v < 4; v++) {
      var vx = 260 + v * 620 + r() * 120, vy = base - 70;
      g.fillStyle = 'rgba(48,44,52,0.9)';
      g.fillRect(vx, vy - 44, 86, 40);
      g.fillStyle = 'rgba(18,16,22,0.95)';
      g.beginPath(); g.arc(vx + 20, vy, 11, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(vx + 66, vy, 11, 0, Math.PI * 2); g.fill();
    }
  }

  // --- poeira de rocha pairando nas faixas da galeria ---
  function paintPoeira(g) {
    var r = makeRand(7303);
    var base = LAYER_H;
    var bands = [base - 300, base - 140];
    for (var i = 0; i < bands.length; i++) {
      var by = bands[i], bh = 110 + i * 40;
      var gr = g.createLinearGradient(0, by - bh * 0.5, 0, by + bh * 0.5);
      gr.addColorStop(0, 'rgba(120,130,170,0)');
      gr.addColorStop(0.5, 'rgba(120,130,170,' + (0.08 + i * 0.05).toFixed(2) + ')');
      gr.addColorStop(1, 'rgba(120,130,170,0)');
      g.fillStyle = gr;
      g.fillRect(0, by - bh * 0.5, 1600, bh);
      g.fillStyle = 'rgba(150,160,200,0.055)';
      for (var k = 0; k < 9; k++) {
        g.beginPath();
        g.ellipse(r() * 1600, by + (r() * 2 - 1) * 22, 90 + r() * 180, 18 + r() * 30, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // --- camada próxima: crista de rocha escura com fio de luz fria na aresta ---
  function paintNear(g) {
    var r = makeRand(7404);
    var base = LAYER_H;
    g.fillStyle = '#0a0810';
    g.fillRect(0, base - 76, 2400, 76);

    for (var i = 0; i < 20; i++) {
      var bx = i * 122 + r() * 60, by = base - 64 - r() * 44;
      var bw = 60 + r() * 70, bh = 40 + r() * 46;
      g.fillStyle = '#100c16';
      g.beginPath();
      g.moveTo(bx, by + bh);
      g.lineTo(bx + 8, by + 10);
      g.lineTo(bx + bw * 0.42, by);
      g.lineTo(bx + bw - 8, by + 14);
      g.lineTo(bx + bw, by + bh);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(130,190,255,0.12)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(bx + 8, by + 10);
      g.lineTo(bx + bw * 0.42, by);
      g.lineTo(bx + bw - 8, by + 14);
      g.stroke();
    }
  }

  // --- primeiro plano: estalactites pendendo do teto e pedras na borda de
  // baixo, tudo em silhueta preta ---
  function paintFront(g) {
    var r = makeRand(7505);
    var base = LAYER_H;

    g.fillStyle = '#05040a';
    g.fillRect(0, 0, 1800, 26);
    for (var i = 0; i < 22; i++) {
      var sx = i * 84 + r() * 44;
      var sh = 50 + r() * 130, sw = 16 + r() * 22;
      g.beginPath();
      g.moveTo(sx - sw / 2, 0);
      g.quadraticCurveTo(sx - sw * 0.2, sh * 0.6, sx, sh);
      g.quadraticCurveTo(sx + sw * 0.2, sh * 0.6, sx + sw / 2, 0);
      g.closePath();
      g.fill();
    }
    // pedras entrando pela borda de baixo
    g.fillRect(0, base - 22, 1800, 22);
    for (var k = 0; k < 14; k++) {
      var px = k * 132 + r() * 70, ph = 20 + r() * 40;
      g.beginPath();
      g.moveTo(px - 40, base);
      g.lineTo(px - 14, base - ph);
      g.lineTo(px + 16, base - ph * 0.7);
      g.lineTo(px + 44, base);
      g.closePath();
      g.fill();
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
  // RESET — o engine chama ao (re)carregar a fase: reacende lumis e apaga as
  // faíscas em voo. NÃO se olha FG.engine.lumis para decidir nada: as lumis
  // acumulam entre fases e aquele contador não zera nunca.
  // ---------------------------------------------------------------
  function reset() {
    for (var i = 0; i < lumis.length; i++) lumis[i].taken = false;
    kit.apagarFaiscas(sparks);
  }

  // ---------------------------------------------------------------
  // UPDATE — coleta de lumis (mecânica do kit); a caverna não tem coletável
  // próprio além das lumis.
  // ---------------------------------------------------------------
  function update(dt) {
    kit.coletarLumis(lumis, sparks, dt);
  }

  // ---------------------------------------------------------------
  // DRAW BACK — rocha de fundo, camadas de parallax, poeira e pingos. Nada
  // de céu: o que está lá em cima é teto.
  // ---------------------------------------------------------------
  function drawBack(ctx, cam) {
    buildAll();
    var t = FG.engine.time;

    ctx.drawImage(rochaSpr, 0, 0);

    drawLayer(ctx, farL, 0.2, cam);
    drawLayer(ctx, midL, 0.45, cam);

    // pingos caindo do teto: riscos verticais curtos, cada um no seu ciclo
    ctx.save();
    ctx.strokeStyle = 'rgba(150,200,255,0.35)';
    ctx.lineWidth = 1.6;
    for (var i = 0; i < 14; i++) {
      var px = (((i * 331 + 60) - cam.x * 0.55) % 1180 + 1180) % 1180 - 60;
      var ciclo = (t * (0.5 + (i % 4) * 0.12) + i * 0.37) % 1;
      var py = 40 + ciclo * 420 - cam.y * 0.5;
      ctx.globalAlpha = 0.25 + 0.5 * (1 - ciclo);
      ctx.beginPath();
      ctx.moveTo(px, py); ctx.lineTo(px, py + 9);
      ctx.stroke();
    }
    ctx.restore();

    // poeira de rocha respirando entre os patamares
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.12 * Math.sin(t * 0.3);
    drawLayer(ctx, mistL, 0.6, cam);
    ctx.restore();

    drawLayer(ctx, nearL, 0.7, cam);
  }

  // ---------------------------------------------------------------
  // DRAW SOLIDS — chão, paredões, lajes, estalagmites, lanternas (comuns e
  // de checkpoint), lumis e faíscas (tudo com culling de ~1 tela)
  // ---------------------------------------------------------------
  function drawSolids(ctx, cam) {
    buildAll();
    var t = FG.engine.time;
    var x0 = cam.x - 220, x1 = cam.x + VIEW_W + 220;

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.k === 'h' || s.x > x1 || s.x + s.w < x0) continue;
      var d = decor[i];
      if (s.k === 'c') ctx.drawImage(d.spr, s.x + d.ox, s.y + d.oy);
      else drawRocha(ctx, s, d, t);
    }

    // estalagmites por cima do terreno
    for (var h2 = 0; h2 < hazards.length; h2++) {
      var hz2 = hazards[h2];
      if (hz2.x > x1 || hz2.x + hz2.w < x0) continue;
      drawEstalagmites(ctx, hz2, t);
    }

    // lanternas comuns da mina (as que só iluminam)
    for (var l = 0; l < lanternas.length; l++) {
      var lz = lanternas[l];
      if (lz.x > x1 || lz.x < x0) continue;
      drawLanterna(ctx, lz.x, lz.y, t, 1);
    }

    // lanternas-checkpoint (acesa = checkpoint atual)
    for (var c = 0; c < checkpoints.length; c++) {
      var cp = checkpoints[c];
      if (cp.x > x1 || cp.x < x0) continue;
      drawPosteCheckpoint(ctx, cp, FG.engine.checkpoint.x === cp.x, t);
    }

    kit.desenharLumis(ctx, cam, lumis, lumiSpr, t);
    kit.desenharFaiscas(ctx, sparks);

    ctx.restore();
  }

  // --- rocha da galeria: corpo escuro, veios de minério, trincas, cristais
  // na aresta de cima e um fio de luz fria no topo (onde se pisa) ---
  function drawRocha(ctx, s, d, t) {
    var g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    g.addColorStop(0, '#453d52');
    g.addColorStop(0.4, '#2e2739');
    g.addColorStop(1, '#161220');
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, s.w, s.h);

    // veios de minério: riscos claros, levemente dourados
    ctx.strokeStyle = 'rgba(205,180,120,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < d.veios.length; i++) {
      var v = d.veios[i];
      ctx.moveTo(s.x + v.x, s.y + Math.min(v.y, Math.max(2, s.h - 2)));
      ctx.lineTo(s.x + v.x + v.bend, s.y + Math.min(v.y + v.len, Math.max(3, s.h - 1)));
    }
    ctx.stroke();

    // trincas escuras na face de cima
    ctx.strokeStyle = 'rgba(8,6,12,0.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (var k = 0; k < d.trincas.length; k++) {
      var tr = d.trincas[k];
      ctx.moveTo(s.x + tr.x, s.y + 2);
      ctx.lineTo(s.x + tr.x + tr.bend, s.y + Math.min(s.h - 2, tr.len));
    }
    ctx.stroke();

    // aresta de cima, fria
    ctx.fillStyle = '#6a6080';
    ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, 4);
    ctx.fillStyle = 'rgba(190,220,255,0.28)';
    ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, 1.4);

    // cristais brotando do topo, pulsando devagar
    for (var c = 0; c < d.cristais.length; c++) {
      var cr = d.cristais[c];
      ctx.save();
      ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 1.4 + cr.x);
      cristalShape(ctx, s.x + cr.x, s.y, cr.h, cr.lean);
      ctx.restore();
    }
  }

  // --- estalagmites: dentes de rocha subindo do fundo do poço ---
  function drawEstalagmites(ctx, hz, t) {
    var n = Math.max(3, Math.round(hz.w / 22));
    var sw = hz.w / n;
    ctx.fillStyle = '#141020';
    ctx.fillRect(hz.x, hz.y + hz.h - 5, hz.w, 5);
    for (var i = 0; i < n; i++) {
      var bx = hz.x + i * sw;
      var alt = hz.h * (0.75 + 0.45 * Math.abs(Math.sin(i * 2.17)));
      var g = ctx.createLinearGradient(bx, hz.y + hz.h - alt, bx, hz.y + hz.h);
      g.addColorStop(0, '#9aa6c0');
      g.addColorStop(0.5, '#5a5470');
      g.addColorStop(1, '#241e32');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx, hz.y + hz.h);
      ctx.quadraticCurveTo(bx + sw * 0.3, hz.y + hz.h - alt * 0.5, bx + sw / 2, hz.y + hz.h - alt);
      ctx.quadraticCurveTo(bx + sw * 0.7, hz.y + hz.h - alt * 0.5, bx + sw, hz.y + hz.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(210,230,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(bx + sw * 0.42, hz.y + hz.h - alt * 0.95);
      ctx.lineTo(bx + sw * 0.52, hz.y + hz.h - alt);
      ctx.lineTo(bx + sw * 0.48, hz.y + hz.h - alt * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- lanterna de mineração: gancho, aro de ferro, vidro e chama. É o
  // objeto que dá nome à fase; o buraco de luz dela é recortado no breu
  // (ver drawEscuridao) ---
  function drawLanterna(ctx, x, y, t, acesa) {
    var fl = 0.82 + 0.18 * Math.sin(t * 7 + x * 0.013);
    ctx.save();
    // gancho preso na rocha
    ctx.strokeStyle = '#2a2430';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 46);
    ctx.quadraticCurveTo(x + 8, y - 34, x, y - 26);
    ctx.stroke();
    // corpo
    ctx.fillStyle = '#39353f';
    ctx.fillRect(x - 10, y - 26, 20, 5);
    ctx.fillRect(x - 10, y - 4, 20, 6);
    ctx.fillStyle = 'rgba(30,26,34,0.9)';
    ctx.fillRect(x - 9, y - 21, 18, 17);
    if (acesa) {
      ctx.save();
      ctx.shadowColor = '#ffb040';
      ctx.shadowBlur = 20 * fl;
      ctx.fillStyle = 'rgba(255,205,120,' + (0.8 * fl).toFixed(2) + ')';
      ctx.fillRect(x - 8, y - 20, 16, 15);
      ctx.restore();
      ctx.fillStyle = '#fff2c8';
      ctx.beginPath();
      ctx.ellipse(x, y - 12, 2.6, 5 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // armação de arame por cima do vidro
    ctx.strokeStyle = '#4a4450';
    ctx.lineWidth = 1.2;
    for (var i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 19 + i * 5);
      ctx.lineTo(x + 9, y - 19 + i * 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- poste-checkpoint: uma escora de madeira com a lanterna grande no
  // topo. Apagada até ser ativada; acesa, ilumina um pedaço inteiro ---
  function drawPosteCheckpoint(ctx, cp, lit, t) {
    var x = cp.x, y = cp.y;
    ctx.fillStyle = '#4a3220';
    ctx.fillRect(x - 5, y - 96, 10, 96);
    ctx.fillStyle = '#5e4028';
    ctx.fillRect(x - 16, y - 100, 32, 8);
    ctx.fillStyle = '#2a1e14';
    ctx.fillRect(x - 14, y - 4, 28, 6);
    if (lit) {
      var fl = 0.8 + 0.2 * Math.sin(t * 9 + Math.sin(t * 5.3));
      ctx.save();
      ctx.shadowColor = '#ffc060';
      ctx.shadowBlur = 30 * fl;
      ctx.fillStyle = '#ffd890';
      ctx.fillRect(x - 12, y - 136, 24, 34);
      ctx.restore();
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath();
      ctx.ellipse(x, y - 118, 4.4, 8 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#221c28';
      ctx.fillRect(x - 12, y - 136, 24, 34);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x - 12, y - 136, 6, 34);
    }
    ctx.fillStyle = '#39353f';
    ctx.fillRect(x - 15, y - 142, 30, 8);
  }

  // ---------------------------------------------------------------
  // DRAW FRONT — silhuetas de primeiro plano, A ESCURIDÃO e a vinheta.
  // A ordem importa: o breu entra por cima de tudo (inclusive do jogador e
  // dos bichos), e as silhuetas do primeiro plano ficam por baixo dele, para
  // não virarem recortes brilhantes no meio do preto.
  // ---------------------------------------------------------------
  function drawFront(ctx, cam) {
    buildAll();
    drawLayer(ctx, frontL, 1.15, cam);
    drawEscuridao(ctx, cam);
    ctx.drawImage(vig, 0, 0);
  }

  // A caverna é escura: uma camada quase preta cobrindo a tela inteira, com
  // BURACOS recortados (composite 'destination-out') em cada lanterna visível
  // e em volta do jogador — ele é uma fagulha, e carrega o próprio halo. Um
  // offscreen do tamanho da vista, alocado uma vez e repintado por frame; o
  // custo é um fillRect e um punhado de gradientes, só das lanternas na tela.
  function drawEscuridao(ctx, cam) {
    var g = escuro.getContext('2d');
    var t = FG.engine.time;

    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    g.fillStyle = 'rgba(3,2,8,0.9)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    g.globalCompositeOperation = 'destination-out';
    for (var i = 0; i < lanternas.length; i++) {
      var lz = lanternas[i];
      var lx = lz.x - cam.x, ly = lz.y - 14 - cam.y;
      if (lx < -lz.r || lx > VIEW_W + lz.r || ly < -lz.r || ly > VIEW_H + lz.r) continue;
      var tremor = 1 + 0.045 * Math.sin(t * 7 + lz.x * 0.013);
      furoDeLuz(g, lx, ly, lz.r * tremor);
    }
    // halo do próprio herói: sem isto, andar entre duas lanternas seria
    // caminhar às cegas — e o jogo é de plataforma, não de adivinhação
    var p = FG.player;
    if (p) {
      furoDeLuz(g, p.x + p.w / 2 - cam.x, p.y + p.h / 2 - cam.y, 150);
    }
    g.globalCompositeOperation = 'source-over';

    ctx.drawImage(escuro, 0, 0);

    // e um sopro de luz quente por cima dos buracos, para a lanterna PARECER
    // uma chama e não um recorte na cartolina
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var k = 0; k < lanternas.length; k++) {
      var l2 = lanternas[k];
      var ax = l2.x - cam.x, ay = l2.y - 14 - cam.y;
      if (ax < -l2.r || ax > VIEW_W + l2.r || ay < -l2.r || ay > VIEW_H + l2.r) continue;
      var gr = ctx.createRadialGradient(ax, ay, 2, ax, ay, l2.r * 0.6);
      gr.addColorStop(0, 'rgba(255,190,110,0.17)');
      gr.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(ax, ay, l2.r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Buraco de luz: opaco no centro (apaga o breu por completo) e esfumado na
  // borda, para a luz morrer em degradê em vez de num círculo recortado.
  function furoDeLuz(g, x, y, r) {
    var gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(0.45, 'rgba(0,0,0,0.85)');
    gr.addColorStop(0.78, 'rgba(0,0,0,0.35)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // ---------------------------------------------------------------
  // API pública — a fase entra no registro na ordem em que o index.html
  // carrega os level*.js, então o índice sai certo sem ninguém combinar nada.
  // Quem publica FG.level (a fase corrente) é o engine.
  // ---------------------------------------------------------------
  FG.levels = FG.levels || [];
  FG.levels.push({
    id: 'caverna',
    nome: 'A Caverna',
    musica: 'caverna',
    W: W,
    H: H,
    playerStart: { x: 80, y: 560 },
    solids: solids,
    hazards: hazards,
    checkpoints: checkpoints,
    lanternas: lanternas,
    enemyDefs: enemyDefs,
    obstacleDefs: obstacleDefs,
    bossId: 'otton',
    bossTriggerX: 11320,
    arena: { x: 9700, w: 3500 },
    reset: reset,
    update: update,
    drawBack: drawBack,
    drawSolids: drawSolids,
    drawFront: drawFront,
  });
})();
