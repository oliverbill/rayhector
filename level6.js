// Fagulho: Lendas do Bosque — level6.js
// Fase 6, 'floresta': A Floresta. Geometria, lumis, checkpoints, inimigos
// (tarântulas azuis, cobras, aranhas nas copas), obstáculos (defs), a arena
// do chefão e todo o visual de mata fechada — árvores altas, CASAS NA ÁRVORE
// de caçadores com janelas acesas e escadas de corda, cogumelos vermelhos,
// pássaros ao fundo, raios de sol entre as copas e um riacho de verdade.
//
// O QUE FAZ ESTA FASE DIFERENTE: ela é o território dos caçadores. No meio
// da mata, numa clareira a ~2/3 do caminho, está a JAULA com o MurphOliver
// preso — três socos a quebram e ele passa a acompanhar o jogador (quem
// cuida dele dali em diante é FG.companion; a fase só o liberta). O riacho
// é água mergulhável (FG.level.waters): cair da ponte não é castigo, é nado.
//
// Registra-se em FG.levels; quem escolhe a fase corrente é o engine.
// Nada aqui referencia FG.player/FG.engine/FG.audio/FG.companion no load —
// só dentro de funções chamadas em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  // Único acoplamento de load permitido no projeto: kit → fase.
  var kit = FG.levelkit;
  var S = kit.S, makeRand = kit.makeRand, makeCanvas = kit.makeCanvas;

  var VIEW_W = kit.VIEW_W, VIEW_H = kit.VIEW_H;
  var W = 21600, H = 720;
  var CAM_Y_MAX = H - VIEW_H; // 180 — usado no parallax vertical

  // ---------------------------------------------------------------
  // GEOMETRIA — sólidos
  // k: 'g' = chão de terra com grama, 'r' = pedra (degrau, pedra do riacho),
  //    'c' = tronco escalável (sobe-se agarrando, como os paredões da mina),
  //    'w' = madeira (piso de casa na árvore, tábua de ponte),
  //    'h' = piso oculto (leito do riacho, não desenhado).
  //
  // RITMO EM 5 TRECHOS — fase TRIPLICADA (W = 21600): cada trecho cresceu
  // com conteúdo próprio, não esticando o que havia.
  //  (1) x 0..4000      A ORLA DA MATA: clareira entre cogumelos, degraus de
  //                     tronco caído e lajes. Bicho manso — o tutorial da fase.
  //  (2) x 4000..9000   AS CASAS NA ÁRVORE: DOIS povoados de caçadores, cada
  //                     um com dois troncos escaláveis atravessando o caminho
  //                     (como a frente de escavação da mina) e os pisos das
  //                     casas lá em cima — rota alta com lumis de prêmio,
  //                     rota baixa com espinheiros, e um respiro de chão
  //                     corrido entre um povoado e o outro.
  //  (3) x 9000..11600  O RIACHO: dois braços de água de nadar separados por
  //                     uma ilha, cada braço com a sua ponte de tábuas (uma
  //                     tábua desmorona em cada) e um cipó por cima.
  //  (4) x 11600..19800 O TERRITÓRIO DOS CAÇADORES: o trecho mais longo —
  //                     espinheiros, tarântulas e cobras, DUAS armadilhas de
  //                     tronco pendurado, TRÊS rolos de espinho e, na
  //                     clareira a 2/3 do caminho (x~14300), A JAULA com o
  //                     MurphOliver preso.
  //  (5) x 19800..21600 A CLAREIRA DO CHEFÃO: a Dalilesma Slime espera no
  //                     fim, montada na lesma. A arena é chão corrido.
  //
  // Nada de beco sem saída: do riacho sobe-se nadando até a margem, e os
  // troncos escaláveis têm o chão rente às duas faces (é onde se agarra).
  //
  // Alturas: pulo simples sobe ~118px, duplo ~236px, parede contínua sobe
  // indefinidamente agarrando (ver tests/parede.js).
  // ---------------------------------------------------------------
  var solids = [
    // ---- (1) a orla da mata ----
    S(0, 620, 4000, 100, 'g'),        // chão até a face do tronco 1
    S(340, 572, 110, 48, 'r'),        // tronco caído (+48)
    S(530, 524, 120, 24, 'r'),        // pedra alta (+48, bônus)
    S(900, 572, 110, 48, 'r'),        // segundo tronco caído
    S(1240, 536, 130, 24, 'r'),       // laje de pedra (+84, arco de lumis)
    S(1650, 560, 140, 26, 'r'),       // laje baixa de respiro
    S(1960, 512, 120, 24, 'r'),       // pedra alta (+108, pulo cheio)
    S(2350, 572, 110, 48, 'r'),       // terceiro tronco caído
    S(2600, 524, 120, 24, 'r'),       // pedra alta
    S(2980, 536, 130, 24, 'r'),       // laje de pedra
    S(3400, 572, 110, 48, 'r'),       // quarto tronco caído
    S(3680, 524, 120, 24, 'r'),       // pedra alta da despedida da orla

    // ---- (2) as casas na árvore: POVOADO 1 (troncos escaláveis) ----
    // O chão termina RENTE a cada face de tronco, de propósito: é onde o
    // jogador (e o tests/reach.js) encosta para começar a subir.
    S(4000, 300, 80, 320, 'c'),       // tronco 1 — sobe-se agarrando
    S(4080, 300, 220, 24, 'w'),       // piso da casa 1 (topo do tronco 1)
    S(4080, 620, 820, 100, 'g'),      // chão entre os troncos
    S(4360, 420, 140, 20, 'w'),       // sacada intermediária (rota alta)
    S(4590, 330, 150, 20, 'w'),       // passarela (rota alta)
    S(4720, 240, 180, 24, 'w'),       // piso da casa 2 (encosta no tronco 2)
    S(4900, 240, 80, 380, 'c'),       // tronco 2
    S(4980, 620, 920, 100, 'g'),      // chão do respiro entre os povoados

    // ---- (2b) as casas na árvore: POVOADO 2 ----
    S(5900, 320, 80, 300, 'c'),       // tronco 3
    S(5980, 320, 200, 24, 'w'),       // piso da casa 3 (topo do tronco 3)
    S(5980, 620, 900, 100, 'g'),      // chão entre os troncos do povoado 2
    S(6260, 440, 140, 20, 'w'),       // sacada intermediária
    S(6500, 350, 150, 20, 'w'),       // passarela
    S(6700, 260, 180, 24, 'w'),       // piso da casa 4 (encosta no tronco 4)
    S(6880, 260, 80, 360, 'c'),       // tronco 4
    S(6960, 620, 2040, 100, 'g'),     // chão corrido até a margem do riacho
    S(7400, 560, 130, 26, 'r'),       // degraus do caminho até o riacho
    S(8000, 524, 120, 24, 'r'),
    S(8550, 560, 130, 26, 'r'),

    // ---- (3) o riacho: braço 1, a ilha e o braço 2 ----
    S(9000, 556, 260, 16, 'w'),       // ponte 1, tábuas 1 (saem da margem)
    S(9360, 536, 200, 16, 'w'),       // ponte 1, tábuas 2 (vão antes: desmorona)
    S(9660, 556, 300, 16, 'w'),       // ponte 1, tábuas 3 (chegam na ilha)
    S(9280, 612, 80, 36, 'r'),        // pedra do braço 1
    S(9590, 606, 90, 42, 'r'),        // pedra do braço 1
    S(9000, 700, 1100, 20, 'h'),      // leito do braço 1 (oculto)
    S(10100, 620, 400, 100, 'g'),     // a ILHA entre os dois braços
    S(10500, 556, 260, 16, 'w'),      // ponte 2, tábuas 1 (saem da ilha)
    S(10860, 536, 200, 16, 'w'),      // ponte 2, tábuas 2 (vão antes: desmorona)
    S(11160, 556, 300, 16, 'w'),      // ponte 2, tábuas 3 (chegam na margem)
    S(10780, 612, 80, 36, 'r'),       // pedra do braço 2
    S(11100, 606, 90, 42, 'r'),       // pedra do braço 2
    S(10500, 700, 1100, 20, 'h'),     // leito do braço 2 (oculto)

    // ---- (4) o território dos caçadores (o chão segue até o fim do mundo:
    // a clareira do chefão é a ponta dele, sem emenda) ----
    S(11600, 620, 10000, 100, 'g'),   // chão corrido do território + clareira
    S(12100, 560, 130, 26, 'r'),      // degraus e mirantes espalhados
    S(12700, 524, 120, 24, 'r'),
    S(13300, 560, 130, 26, 'r'),      // antes do primeiro rolo de espinhos
    S(14460, 524, 120, 24, 'r'),      // pedra ao lado da jaula (mirante)
    S(15200, 560, 130, 26, 'r'),
    S(15900, 524, 120, 24, 'r'),
    S(16700, 560, 130, 26, 'r'),      // antes da segunda armadilha
    S(17500, 524, 120, 24, 'r'),
    S(18300, 560, 130, 26, 'r'),      // antes do último rolo
    S(19000, 560, 130, 26, 'r'),

    // ---- (5) a clareira do chefão: chão corrido, a arena é o relevo ----
  ];

  // ---------------------------------------------------------------
  // ÁGUA MERGULHÁVEL — o riacho. player.js lê FG.level.waters: dentro deste
  // retângulo a física vira nado. Cair da ponte é molhar-se, não morrer.
  // ---------------------------------------------------------------
  var waters = [
    { x: 9000, y: 648, w: 1100, h: 72 },    // braço 1
    { x: 10500, y: 648, w: 1100, h: 72 },   // braço 2
  ];

  // ---------------------------------------------------------------
  // HAZARDS — t: 'e' = arbusto de espinhos (1 de dano)
  // ---------------------------------------------------------------
  function Hz(x, y, w, h, t) { return { x: x, y: y, w: w, h: h, t: t }; }

  var hazards = [
    // (1) a orla — espinheiros pedindo o pulo
    Hz(1150, 596, 60, 24, 'e'),    // antes da laje de pedra
    Hz(2500, 596, 70, 24, 'e'),    // depois do terceiro tronco caído
    Hz(3550, 596, 60, 24, 'e'),    // despedida da orla
    // (2) os povoados — convidam à rota alta
    Hz(4480, 596, 70, 24, 'e'),    // entre os troncos do povoado 1
    Hz(5440, 596, 60, 24, 'e'),    // no respiro entre os povoados
    Hz(6380, 596, 70, 24, 'e'),    // entre os troncos do povoado 2
    Hz(7700, 596, 60, 24, 'e'),    // caminho até o riacho
    // (4) o território dos caçadores
    Hz(11850, 596, 70, 24, 'e'),   // entrada do território
    Hz(12240, 596, 60, 24, 'e'),
    Hz(13150, 596, 70, 24, 'e'),
    Hz(14240, 596, 60, 24, 'e'),   // antes da jaula
    Hz(15050, 596, 70, 24, 'e'),
    Hz(15660, 596, 60, 24, 'e'),
    Hz(16550, 596, 70, 24, 'e'),   // antes da segunda armadilha
    Hz(17150, 596, 60, 24, 'e'),
    Hz(18150, 596, 70, 24, 'e'),   // caminho do último rolo
    Hz(19250, 596, 60, 24, 'e'),
    Hz(19890, 596, 60, 24, 'e'),   // porta da clareira do chefão
  ];

  // 7 checkpoints — totens de madeira dos caçadores, reaproveitados. A fase
  // triplicou; morrer não pode custar meia floresta.
  var checkpoints = [
    { x: 1480, y: 620 },   // meio da orla
    { x: 3880, y: 620 },   // fim da orla, antes do tronco 1
    { x: 5500, y: 620 },   // o respiro entre os dois povoados
    { x: 8800, y: 620 },   // antes do riacho
    { x: 11700, y: 620 },  // margem de chegada do riacho
    { x: 14600, y: 620 },  // logo depois da jaula
    { x: 20180, y: 620 },  // porta da clareira do chefão
  ];

  // ---------------------------------------------------------------
  // INIMIGOS — tarântulas azuis e cobras (os bichos novos da floresta),
  // misturados com espinhocos no chão, voadeiras no ar e aranhas penduradas
  // nas copas. NENHUM antes de x=600 (a orla é mansa).
  // ---------------------------------------------------------------
  var enemyDefs = [
    // (1) a orla — apresentação gradual: um bicho de cada vez
    { type: 'espinhoco', x: 700, y: 590, range: 120 },
    { type: 'cobra',     x: 1100, y: 590, range: 140 },
    { type: 'espinhoco', x: 1860, y: 590, range: 80 },
    { type: 'cobra',     x: 2250, y: 590, range: 140 },
    { type: 'tarantula', x: 2820, y: 590, range: 90 },   // a primeira tarântula
    { type: 'espinhoco', x: 3200, y: 590, range: 90 },
    { type: 'cobra',     x: 3590, y: 590, range: 80 },
    // (2) povoado 1 — o perigo vem de cima
    { type: 'aranha',    x: 4200, y: 120, range: 130 },  // sobre o piso da casa 1
    { type: 'voadeira',  x: 4530, y: 380, range: 140 },
    { type: 'aranha',    x: 4780, y: 90,  range: 130 },  // sobre a passarela
    { type: 'espinhoco', x: 5150, y: 590, range: 110 },
    { type: 'cobra',     x: 5300, y: 590, range: 100 },
    { type: 'espinhoco', x: 5750, y: 590, range: 100 },
    // (2b) povoado 2
    { type: 'aranha',    x: 6100, y: 140, range: 130 },  // sobre o piso da casa 3
    { type: 'voadeira',  x: 6430, y: 400, range: 140 },
    { type: 'aranha',    x: 6700, y: 110, range: 130 },  // sobre a passarela
    { type: 'tarantula', x: 7100, y: 590, range: 130 },
    { type: 'cobra',     x: 7850, y: 590, range: 110 },
    { type: 'espinhoco', x: 8250, y: 590, range: 100 },
    { type: 'tarantula', x: 8420, y: 590, range: 80 },
    // (3) o riacho — voadeiras patrulhando as pontes, uma cobra na ilha
    { type: 'voadeira',  x: 9430, y: 460, range: 150 },
    { type: 'cobra',     x: 10250, y: 590, range: 120 },  // dona da ilha
    { type: 'voadeira',  x: 10930, y: 460, range: 150 },
    // (4) o território dos caçadores — tarântulas e cobras mandam aqui
    { type: 'tarantula', x: 11900, y: 590, range: 130 },
    { type: 'cobra',     x: 12320, y: 590, range: 80 },
    { type: 'voadeira',  x: 12600, y: 430, range: 140 },
    { type: 'tarantula', x: 13000, y: 590, range: 130 },
    { type: 'cobra',     x: 13450, y: 590, range: 140 },
    { type: 'tarantula', x: 13900, y: 590, range: 130 },
    { type: 'tarantula', x: 14420, y: 590, range: 130 },  // ronda a jaula
    { type: 'cobra',     x: 14800, y: 590, range: 140 },
    { type: 'voadeira',  x: 15100, y: 430, range: 140 },
    { type: 'tarantula', x: 15500, y: 590, range: 130 },
    { type: 'cobra',     x: 16000, y: 590, range: 140 },
    { type: 'tarantula', x: 16500, y: 590, range: 130 },
    { type: 'cobra',     x: 16900, y: 590, range: 140 },
    { type: 'voadeira',  x: 17200, y: 430, range: 140 },
    { type: 'tarantula', x: 17700, y: 590, range: 130 },
    { type: 'cobra',     x: 18200, y: 590, range: 140 },
    { type: 'tarantula', x: 18700, y: 590, range: 130 },
    { type: 'espinhoco', x: 19200, y: 590, range: 110 },
    // (5) a porta da clareira
    { type: 'espinhoco', x: 19750, y: 590, range: 110 },
  ];

  // ---------------------------------------------------------------
  // OBSTÁCULOS DINÂMICOS (FG.obstacles lê daqui)
  //   plataforma  — o elevador de carga da casa 1 (rota alternativa à escalada)
  //   cipo        — o cipó por cima do riacho (rota alternativa à ponte)
  //   desmorona   — a tábua podre do primeiro vão da ponte
  //   pendulo     — a armadilha de tronco pendurado dos caçadores
  //   espinhorolo — o rolo de espinhos que os caçadores soltaram no caminho
  // ---------------------------------------------------------------
  var obstacleDefs = [
    // os elevadores de carga dos povoados (rota alternativa à escalada)
    { type: 'plataforma',  x: 4360, y: 560, w: 110, dx: 0, dy: -150, period: 5.2, phase: 0 },
    { type: 'plataforma',  x: 6260, y: 580, w: 110, dx: 0, dy: -150, period: 5.6, phase: 1.6 },
    // as pontes do riacho: uma tábua podre e um cipó por braço
    { type: 'desmorona',   x: 9270, y: 556, w: 80 },
    { type: 'cipo',        x1: 9260, y1: 420, x2: 9620, y2: 420, sag: 72 },
    { type: 'desmorona',   x: 10770, y: 556, w: 80 },
    { type: 'cipo',        x1: 10760, y1: 420, x2: 11120, y2: 420, sag: 72 },
    // as armadilhas do território dos caçadores
    { type: 'pendulo',     x: 12450, y: 300, len: 190, arc: 0.8, period: 2.9 },
    { type: 'espinhorolo', x: 13600, y: 576, w: 44, range: 120, speed: 125 },
    { type: 'pendulo',     x: 16250, y: 300, len: 190, arc: 0.85, period: 2.6 },
    { type: 'espinhorolo', x: 17300, y: 576, w: 44, range: 130, speed: 135 },
    { type: 'espinhorolo', x: 18700, y: 576, w: 44, range: 120, speed: 150 },
  ];

  // ---------------------------------------------------------------
  // A JAULA — o MurphOliver preso pelo caçador. Três socos a quebram; a
  // fase então chama FG.companion.rescue() (módulo próprio do companheiro)
  // e dali em diante ele acompanha o jogador. O reset() SÓ re-arma a jaula
  // enquanto o resgate não aconteceu: companheiro solto não volta pra jaula.
  // ---------------------------------------------------------------
  var jaula = {
    x: 14300, y: 496, w: 116, h: 124,  // pousada no chão (y+h = 620), a ~2/3 da fase
    hits: 0, max: 3, quebrada: false,
    cool: 0,          // carência entre socos contados (o soco dura ~0.22s)
    tremor: 0,        // tempo de tremida depois de um soco
  };

  // ---------------------------------------------------------------
  // LUMIS
  // ---------------------------------------------------------------
  var lumis = [];
  function lumiLine(x, y, n, dx) { kit.lumiLine(lumis, x, y, n, dx); }
  function lumiCol(x, y, n, dy) { kit.lumiCol(lumis, x, y, n, dy); }
  function lumiArc(cx, apexY, n, span, sag) { kit.lumiArc(lumis, cx, apexY, span, sag, n); }
  // (1) a orla
  lumiLine(160, 578, 4, 60);
  lumiArc(400, 500, 4, 170, 36);
  lumiLine(545, 480, 3, 40);
  lumiArc(1190, 480, 5, 200, 40);   // por cima do arbusto de espinhos
  lumiLine(1680, 520, 3, 46);
  lumiArc(2010, 470, 4, 160, 36);   // sobre a pedra alta
  lumiArc(2420, 500, 4, 170, 36);
  lumiLine(2630, 480, 3, 40);
  lumiArc(3040, 490, 4, 160, 36);
  lumiArc(3580, 480, 5, 200, 40);   // por cima do espinheiro da despedida
  // (2) povoado 1 — a coluna ensina a escalar o tronco
  lumiCol(3990, 560, 7, -48);
  lumiLine(4110, 258, 4, 54);       // sobre o piso da casa 1
  lumiArc(4420, 390, 3, 120, 30);
  lumiArc(4650, 300, 3, 130, 32);
  lumiLine(4750, 200, 3, 52);       // sobre o piso da casa 2
  lumiCol(4890, 560, 7, -48);       // a face do tronco 2 pelo chão
  lumiLine(5250, 578, 4, 60);       // o respiro entre os povoados
  lumiArc(5470, 490, 4, 170, 38);   // por cima do espinheiro do respiro
  // (2b) povoado 2
  lumiCol(5890, 560, 6, -48);
  lumiLine(6010, 278, 4, 50);       // sobre o piso da casa 3
  lumiArc(6320, 410, 3, 120, 30);
  lumiArc(6560, 320, 3, 130, 32);
  lumiLine(6730, 220, 3, 52);       // sobre o piso da casa 4
  lumiCol(6870, 560, 7, -48);       // a face do tronco 4 pelo chão
  lumiLine(7430, 520, 3, 44);
  lumiArc(8040, 480, 4, 170, 38);
  lumiLine(8580, 520, 3, 44);
  // (3) o riacho — um arco por vão de cada ponte, e um colar em cada braço
  lumiArc(9295, 500, 4, 150, 36);
  lumiArc(9590, 490, 4, 150, 36);
  lumiLine(9200, 690, 5, 110);      // mergulhar também paga
  lumiLine(10200, 578, 3, 60);      // a ilha
  lumiArc(10795, 500, 4, 150, 36);
  lumiArc(11090, 490, 4, 150, 36);
  lumiLine(10700, 690, 5, 110);     // o colar do braço 2
  // (4) o território dos caçadores
  lumiLine(11780, 578, 3, 54);
  lumiArc(12450, 440, 5, 220, 44);  // por cima da primeira armadilha de tronco
  lumiLine(12740, 486, 3, 44);
  lumiArc(13600, 480, 4, 170, 38);  // por cima do primeiro rolo de espinhos
  lumiLine(14490, 486, 3, 44);      // no mirante da jaula
  lumiArc(14900, 500, 4, 170, 36);
  lumiLine(15240, 520, 3, 44);
  lumiArc(16250, 440, 5, 220, 44);  // por cima da segunda armadilha
  lumiLine(16740, 520, 3, 44);
  lumiArc(17300, 480, 4, 170, 38);  // por cima do segundo rolo
  lumiLine(17540, 486, 3, 44);
  lumiLine(18340, 520, 3, 44);
  lumiArc(18700, 480, 4, 170, 38);  // por cima do rolo veloz
  lumiLine(19040, 520, 3, 44);
  // (5) a clareira
  lumiLine(19900, 578, 4, 60);
  lumiLine(20160, 578, 3, 60);

  // FAÍSCAS — pool fixo do kit (também usada na quebra da jaula).
  var sparks = kit.makeSparks(64);

  // ---------------------------------------------------------------
  // DECORAÇÃO por sólido (pré-computada: nada de random por frame).
  // 'g' guarda tufos de grama, florzinhas e COGUMELOS vermelhos; 'r' guarda
  // musgo e trincas; 'w' guarda os veios das tábuas; 'c' vira um offscreen
  // de casca de árvore no primeiro draw.
  // ---------------------------------------------------------------
  var decor = [];
  (function () {
    var r = makeRand(20261026);
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      var d = { tufos: [], flores: [], fungos: [], musgo: [], veios: [], spr: null, ox: 0, oy: 0 };
      if (s.k === 'g') {
        var nt = Math.max(3, Math.floor(s.w / 70));
        for (var j = 0; j < nt; j++) {
          d.tufos.push({ x: 8 + r() * Math.max(1, s.w - 16), h: 7 + r() * 9, lean: (r() * 2 - 1) * 0.5 });
        }
        var nf = Math.max(1, Math.floor(s.w / 260));
        for (var f = 0; f < nf; f++) {
          d.flores.push({ x: 20 + r() * Math.max(1, s.w - 40), c: r() < 0.5 ? '#ffd0e8' : '#fff2a8' });
        }
        // cogumelos vermelhos de bolinhas — a assinatura da fase (decorativos)
        var ng = (s.w > 500) ? 2 + Math.floor(r() * 3) : (r() < 0.4 ? 1 : 0);
        for (var g2 = 0; g2 < ng; g2++) {
          d.fungos.push({ x: 40 + r() * Math.max(1, s.w - 80), h: 16 + r() * 18, w: 14 + r() * 12 });
        }
      } else if (s.k === 'r') {
        var nm = Math.max(1, Math.floor(s.w / 60));
        for (var m = 0; m < nm; m++) {
          d.musgo.push({ x: 6 + r() * Math.max(1, s.w - 12), w: 14 + r() * 20 });
        }
      } else if (s.k === 'w') {
        var nv = Math.max(2, Math.floor(s.w / 48));
        for (var v = 0; v < nv; v++) {
          d.veios.push({ x: 10 + r() * Math.max(1, s.w - 20), len: 10 + r() * 22 });
        }
      }
      decor.push(d);
    }
  })();

  // PÁSSAROS — decorativos, voando ao fundo em ciclo (tabela fixa, nada de
  // alocar por frame). Cada um tem a sua faixa de altura, velocidade e fase
  // de bater de asas; o x sai do tempo, em módulo sobre a vista alargada.
  var passaros = [];
  (function () {
    var r = makeRand(777);
    for (var i = 0; i < 7; i++) {
      passaros.push({
        y: 60 + r() * 160,
        v: 26 + r() * 30,            // px/s na TELA (parallax já embutido)
        ph: r() * 6.28,
        dir: r() < 0.5 ? 1 : -1,
        off: r() * 1400,
        s: 0.7 + r() * 0.6,          // escala
      });
    }
  })();

  // ---------------------------------------------------------------
  // OFFSCREENS — céu entre copas, camadas de parallax (mata distante, troncos
  // com casas na árvore, névoa, arbustos próximos), vinheta, lumi e um sprite
  // por tronco escalável. Construídos uma única vez.
  // ---------------------------------------------------------------
  var built = false;
  var ceuSpr, farL, midL, mistL, nearL, frontL, vig, lumiSpr;
  var LAYER_H = 680;
  var TRONCO_PAD = 14;      // folga para a casca transbordar o tronco

  function buildAll() {
    if (built) return;
    built = true;

    // CÉU: luz esverdeada coando pelas copas — em cima é folhagem fechada,
    // embaixo a claridade quente da clareira.
    ceuSpr = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, '#0e2412');
      gr.addColorStop(0.3, '#1d4423');
      gr.addColorStop(0.65, '#3d7a3c');
      gr.addColorStop(1, '#9ac86a');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      // raios de sol entre as copas
      var r = makeRand(41);
      g.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 6; i++) {
        var rx = 80 + r() * (VIEW_W - 160), rw = 40 + r() * 80;
        var rg = g.createLinearGradient(rx, 0, rx + 130, VIEW_H);
        rg.addColorStop(0, 'rgba(255,245,180,0.16)');
        rg.addColorStop(0.7, 'rgba(255,240,170,0.05)');
        rg.addColorStop(1, 'rgba(255,240,170,0)');
        g.fillStyle = rg;
        g.beginPath();
        g.moveTo(rx, 0);
        g.lineTo(rx + rw, 0);
        g.lineTo(rx + rw + 130, VIEW_H);
        g.lineTo(rx + 130, VIEW_H);
        g.closePath();
        g.fill();
      }
    })(ceuSpr.getContext('2d'));

    farL = makeCanvas(2400, LAYER_H); paintFar(farL.getContext('2d'));
    midL = makeCanvas(2400, LAYER_H); paintMid(midL.getContext('2d'));
    mistL = makeCanvas(1600, LAYER_H); paintNevoa(mistL.getContext('2d'));
    nearL = makeCanvas(2400, LAYER_H); paintNear(nearL.getContext('2d'));
    frontL = makeCanvas(1800, LAYER_H); paintFront(frontL.getContext('2d'));

    // vinheta leve: é dia na floresta, não a boca da mina
    vig = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 260, VIEW_W / 2, VIEW_H / 2, 640);
      gr.addColorStop(0, 'rgba(6,14,6,0)');
      gr.addColorStop(1, 'rgba(6,14,6,0.34)');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    })(vig.getContext('2d'));

    lumiSpr = kit.makeLumiSprite();

    // um offscreen por tronco escalável (casca cara de desenhar, feita uma vez)
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.k !== 'c') continue;
      var c = makeCanvas(s.w + TRONCO_PAD * 2, s.h + TRONCO_PAD * 2);
      paintTronco(c.getContext('2d'), s.w, s.h, 6201 + i * 97);
      decor[i].spr = c; decor[i].ox = -TRONCO_PAD; decor[i].oy = -TRONCO_PAD;
    }
  }

  // ---------------------------------------------------------------
  // TRONCO ESCALÁVEL — casca em fiadas horizontais (a "escada" natural da
  // escalada), nós de madeira, hera subindo e um pedaço de copa no topo.
  // ---------------------------------------------------------------
  function paintTronco(g, w, h, seed) {
    var r = makeRand(seed);
    var P = TRONCO_PAD;

    g.save();
    g.beginPath(); g.rect(P, P, w, h); g.clip();

    var gr = g.createLinearGradient(P, 0, P + w, 0);
    gr.addColorStop(0, '#6b4a2c');
    gr.addColorStop(0.45, '#4e3420');
    gr.addColorStop(1, '#2c1c10');
    g.fillStyle = gr;
    g.fillRect(P, P, w, h);

    // fiadas de casca: sulcos horizontais marcados — convite ao agarrão
    var bh = 24 + r() * 8;
    for (var y = P; y < P + h; y += bh) {
      g.fillStyle = 'rgba(240,210,160,' + (0.05 + r() * 0.06).toFixed(3) + ')';
      g.fillRect(P, y + 2, w, bh - 6);
      g.fillStyle = 'rgba(16,8,4,0.5)';
      g.fillRect(P, y, w, 2);
    }

    // nós de madeira
    var nn = 2 + Math.floor(h / 140);
    for (var k = 0; k < nn; k++) {
      var nx = P + 10 + r() * Math.max(1, w - 20), ny = P + 30 + r() * (h - 60);
      g.fillStyle = 'rgba(20,10,5,0.75)';
      g.beginPath(); g.ellipse(nx, ny, 7, 10, 0.2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(200,160,110,0.3)';
      g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(nx, ny, 10, 14, 0.2, 0, Math.PI * 2); g.stroke();
    }

    // hera subindo pela face
    g.strokeStyle = 'rgba(70,140,60,0.8)';
    g.lineWidth = 2.5;
    g.beginPath();
    var hx = P + w * 0.3;
    g.moveTo(hx, P + h);
    for (var hy = P + h; hy > P; hy -= 30) {
      hx += (r() * 2 - 1) * 14;
      hx = Math.max(P + 4, Math.min(P + w - 4, hx));
      g.quadraticCurveTo(hx + 8, hy - 15, hx, hy - 30);
    }
    g.stroke();
    g.fillStyle = 'rgba(90,170,70,0.85)';
    for (var li = 0; li < Math.floor(h / 40); li++) {
      var lx = P + 6 + r() * Math.max(1, w - 12), ly = P + r() * h;
      g.beginPath(); g.ellipse(lx, ly, 5, 3, r() * 3, 0, Math.PI * 2); g.fill();
    }

    // sombra na direita, luz na esquerda
    var sg = g.createLinearGradient(P, 0, P + w, 0);
    sg.addColorStop(0, 'rgba(255,240,190,0.12)');
    sg.addColorStop(0.5, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(10,5,2,0.45)');
    g.fillStyle = sg;
    g.fillRect(P, P, w, h);
    g.restore();

    // topo: aresta de madeira cortada
    g.fillStyle = '#7a5635';
    g.fillRect(P - 3, P - 7, w + 6, 9);
    g.fillStyle = 'rgba(255,235,180,0.3)';
    g.fillRect(P - 3, P - 7, w + 6, 2.2);
  }

  // --- camada distante: a mata fechada se perdendo na bruma ---
  function paintFar(g) {
    var r = makeRand(8101);
    var base = LAYER_H;
    g.fillStyle = 'rgba(26,52,30,0.9)';
    g.fillRect(0, base - 340, 2400, 340);
    // troncos distantes, finos e azulados pela distância
    for (var i = 0; i < 26; i++) {
      var tx = r() * 2400, tw = 10 + r() * 16, th = 200 + r() * 140;
      g.fillStyle = 'rgba(30,48,40,' + (0.5 + r() * 0.3).toFixed(2) + ')';
      g.fillRect(tx, base - th, tw, th);
      // copa borrada
      g.fillStyle = 'rgba(34,70,40,0.55)';
      g.beginPath();
      g.ellipse(tx + tw / 2, base - th - 20, 50 + r() * 50, 36 + r() * 30, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  // --- camada média: os troncos grossos com as CASAS NA ÁRVORE dos
  // caçadores — caixas de tábua com janelas amarelas acesas e escadas de
  // corda descendo, como no desenho ---
  function paintMid(g) {
    var r = makeRand(8202);
    var base = LAYER_H;
    g.fillStyle = 'rgba(22,44,26,0.92)';
    g.fillRect(0, base - 80, 2400, 80);

    for (var s = 0; s < 6; s++) {
      var cx = 140 + s * 400 + r() * 110;
      var tw2 = 44 + r() * 26;
      var th2 = 330 + r() * 150;

      // tronco
      var tg = g.createLinearGradient(cx - tw2 / 2, 0, cx + tw2 / 2, 0);
      tg.addColorStop(0, '#54402a');
      tg.addColorStop(0.5, '#3c2c1c');
      tg.addColorStop(1, '#241a10');
      g.fillStyle = tg;
      g.fillRect(cx - tw2 / 2, base - th2, tw2, th2);

      // copa
      g.fillStyle = 'rgba(42,92,46,0.95)';
      for (var cb = 0; cb < 4; cb++) {
        g.beginPath();
        g.ellipse(cx + (r() * 2 - 1) * 60, base - th2 - 10 - r() * 50,
                  60 + r() * 55, 42 + r() * 30, 0, 0, Math.PI * 2);
        g.fill();
      }

      // a casa: caixa de tábuas abraçando o tronco
      var hy = base - th2 + 60 + r() * 60;
      var hw = tw2 + 64, hh = 64 + r() * 22;
      g.fillStyle = '#6b4e30';
      g.fillRect(cx - hw / 2, hy, hw, hh);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (var tb = 1; tb < 4; tb++) g.fillRect(cx - hw / 2, hy + tb * hh / 4, hw, 2);
      // telhado
      g.fillStyle = '#4a3420';
      g.beginPath();
      g.moveTo(cx - hw / 2 - 10, hy);
      g.lineTo(cx, hy - 26);
      g.lineTo(cx + hw / 2 + 10, hy);
      g.closePath();
      g.fill();
      // janelas amarelas acesas
      g.save();
      g.shadowColor = '#ffd870';
      g.shadowBlur = 10;
      g.fillStyle = '#ffd870';
      var nj = 2 + Math.floor(r() * 2);
      for (var j = 0; j < nj; j++) {
        var jx = cx - hw / 2 + 12 + j * (hw - 24) / Math.max(1, nj - 1) - 7;
        g.beginPath(); g.arc(jx + 7, hy + hh * 0.45, 7, 0, Math.PI * 2); g.fill();
      }
      g.restore();
      // escada de corda descendo do piso da casa
      var ex = cx + hw / 2 - 14;
      g.strokeStyle = 'rgba(210,180,130,0.7)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(ex, hy + hh); g.lineTo(ex, base - 14);
      g.moveTo(ex + 12, hy + hh); g.lineTo(ex + 12, base - 14);
      g.stroke();
      for (var dg = hy + hh + 10; dg < base - 16; dg += 14) {
        g.beginPath(); g.moveTo(ex, dg); g.lineTo(ex + 12, dg); g.stroke();
      }
    }
  }

  // --- névoa da manhã pairando entre os troncos ---
  function paintNevoa(g) {
    var r = makeRand(8303);
    var base = LAYER_H;
    var bands = [base - 260, base - 110];
    for (var i = 0; i < bands.length; i++) {
      var by = bands[i], bh = 100 + i * 40;
      var gr = g.createLinearGradient(0, by - bh * 0.5, 0, by + bh * 0.5);
      gr.addColorStop(0, 'rgba(210,235,190,0)');
      gr.addColorStop(0.5, 'rgba(210,235,190,' + (0.08 + i * 0.05).toFixed(2) + ')');
      gr.addColorStop(1, 'rgba(210,235,190,0)');
      g.fillStyle = gr;
      g.fillRect(0, by - bh * 0.5, 1600, bh);
      g.fillStyle = 'rgba(225,245,205,0.05)';
      for (var k = 0; k < 9; k++) {
        g.beginPath();
        g.ellipse(r() * 1600, by + (r() * 2 - 1) * 20, 90 + r() * 170, 16 + r() * 28, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // --- camada próxima: moitas escuras com samambaias e cogumelos ---
  function paintNear(g) {
    var r = makeRand(8404);
    var base = LAYER_H;
    g.fillStyle = '#122c16';
    g.fillRect(0, base - 70, 2400, 70);
    for (var i = 0; i < 20; i++) {
      var bx = i * 122 + r() * 60, by = base - 58 - r() * 40;
      var bw = 70 + r() * 70;
      g.fillStyle = '#16351a';
      g.beginPath();
      g.ellipse(bx + bw / 2, by + 40, bw / 2, 44 + r() * 20, 0, Math.PI, 0);
      g.fill();
      // samambaia: hastes arqueadas
      g.strokeStyle = 'rgba(60,120,55,0.6)';
      g.lineWidth = 2;
      for (var f = 0; f < 3; f++) {
        g.beginPath();
        g.moveTo(bx + bw / 2, by + 24);
        g.quadraticCurveTo(bx + bw / 2 + (f - 1) * 26, by - 16, bx + bw / 2 + (f - 1) * 44, by + 4);
        g.stroke();
      }
    }
    // cogumelos vermelhos na moita, aqui e ali
    for (var c = 0; c < 8; c++) {
      var mx = 100 + c * 300 + r() * 120, my = base - 16;
      g.fillStyle = '#efe6d2';
      g.fillRect(mx - 3, my - 14, 6, 14);
      g.fillStyle = '#c93a2e';
      g.beginPath(); g.ellipse(mx, my - 14, 13, 9, 0, Math.PI, 0); g.fill();
      g.fillStyle = 'rgba(255,245,230,0.85)';
      g.beginPath(); g.arc(mx - 5, my - 18, 2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(mx + 4, my - 17, 1.6, 0, Math.PI * 2); g.fill();
    }
  }

  // --- primeiro plano: folhagem escura pendendo de cima e capim na borda
  // de baixo, tudo em silhueta ---
  function paintFront(g) {
    var r = makeRand(8505);
    var base = LAYER_H;
    g.fillStyle = '#081607';
    g.fillRect(0, 0, 1800, 20);
    for (var i = 0; i < 24; i++) {
      var sx = i * 76 + r() * 40;
      var sh = 30 + r() * 90;
      g.beginPath();
      g.moveTo(sx - 26, 0);
      g.quadraticCurveTo(sx - 8, sh * 0.7, sx, sh);
      g.quadraticCurveTo(sx + 8, sh * 0.7, sx + 26, 0);
      g.closePath();
      g.fill();
      // folhas soltas na ponta
      g.beginPath(); g.ellipse(sx, sh + 4, 9, 5, 0.3, 0, Math.PI * 2); g.fill();
    }
    // capim entrando pela borda de baixo
    g.fillRect(0, base - 18, 1800, 18);
    for (var k = 0; k < 40; k++) {
      var px = k * 46 + r() * 30, ph = 14 + r() * 26;
      g.beginPath();
      g.moveTo(px - 6, base);
      g.quadraticCurveTo(px + (r() * 2 - 1) * 8, base - ph, px + 2, base - ph);
      g.lineTo(px + 7, base);
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
  // RESET — o engine chama ao (re)carregar a fase: reacende lumis, apaga as
  // faíscas e re-arma a jaula SE o resgate ainda não aconteceu (companheiro
  // solto não volta para a jaula nem numa partida recomeçada do checkpoint).
  // ---------------------------------------------------------------
  function reset() {
    for (var i = 0; i < lumis.length; i++) lumis[i].taken = false;
    kit.apagarFaiscas(sparks);
    var comp = FG.companion;
    if (!comp || !comp.active) {
      jaula.hits = 0;
      jaula.quebrada = false;
      jaula.cool = 0;
      jaula.tremor = 0;
    } else {
      jaula.quebrada = true;
    }
  }

  // ---------------------------------------------------------------
  // UPDATE — coleta de lumis (kit) e a mecânica da jaula: três socos a
  // quebram; na quebra a fase entrega o MurphOliver ao FG.companion.
  // ---------------------------------------------------------------
  function update(dt) {
    kit.coletarLumis(lumis, sparks, dt);

    if (jaula.cool > 0) jaula.cool -= dt;
    if (jaula.tremor > 0) jaula.tremor -= dt;

    // companheiro já solto (resgate normal OU o automático do ?chefe=1, que
    // acontece DEPOIS do reset desta fase) nunca convive com jaula armada —
    // senão o MurphOliver aparecia voando atrás do jogador E preso na jaula.
    if (!jaula.quebrada && FG.companion && FG.companion.active) {
      jaula.quebrada = true;
    }

    if (!jaula.quebrada) {
      var p = FG.player, eng = FG.engine;
      if (p && p.attackBox && p.attackBox.active && jaula.cool <= 0 &&
          eng.rectsOverlap(p.attackBox, jaula)) {
        jaula.hits++;
        jaula.cool = 0.45;
        jaula.tremor = 0.3;
        FG.audio.sfx('hitEnemy');
        kit.burst(sparks, jaula.x + jaula.w / 2, jaula.y + jaula.h / 2, 8);
        if (jaula.hits >= jaula.max) {
          jaula.quebrada = true;
          FG.audio.sfx('checkpoint');
          kit.burst(sparks, jaula.x + jaula.w / 2, jaula.y + jaula.h * 0.4, 18);
          kit.burst(sparks, jaula.x + 16, jaula.y + jaula.h - 20, 10);
          kit.burst(sparks, jaula.x + jaula.w - 16, jaula.y + jaula.h - 20, 10);
          if (FG.companion && FG.companion.rescue) {
            FG.companion.rescue(jaula.x + jaula.w / 2, jaula.y + jaula.h - 4);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------
  // DRAW BACK — céu entre copas, pássaros, camadas de parallax e névoa.
  // ---------------------------------------------------------------
  function drawBack(ctx, cam) {
    buildAll();
    var t = FG.engine.time;

    ctx.drawImage(ceuSpr, 0, 0);

    drawLayer(ctx, farL, 0.2, cam);

    // pássaros ao fundo: silhuetas batendo asas, cruzando a vista em ciclo
    ctx.save();
    ctx.strokeStyle = 'rgba(30,40,30,0.75)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    var SPAN = VIEW_W + 400;
    for (var b = 0; b < passaros.length; b++) {
      var pb = passaros[b];
      var px = ((pb.off + pb.dir * pb.v * t - cam.x * 0.25) % SPAN + SPAN) % SPAN - 200;
      var py = pb.y + Math.sin(t * 0.9 + pb.ph) * 10 - cam.y * 0.2;
      var asa = Math.sin(t * 7 + pb.ph) * 6 * pb.s;
      ctx.beginPath();
      ctx.moveTo(px - 9 * pb.s, py - asa);
      ctx.quadraticCurveTo(px, py + 3 * pb.s, px + 9 * pb.s, py - asa);
      ctx.stroke();
    }
    ctx.restore();

    drawLayer(ctx, midL, 0.45, cam);

    // névoa respirando entre os troncos
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.12 * Math.sin(t * 0.3);
    drawLayer(ctx, mistL, 0.6, cam);
    ctx.restore();

    drawLayer(ctx, nearL, 0.7, cam);
  }

  // ---------------------------------------------------------------
  // DRAW SOLIDS — riacho, chão, troncos, tábuas, pedras, arbustos de
  // espinho, a jaula, checkpoints, lumis e faíscas (culling de ~1 tela).
  // ---------------------------------------------------------------
  function drawSolids(ctx, cam) {
    buildAll();
    var t = FG.engine.time;
    var x0 = cam.x - 220, x1 = cam.x + VIEW_W + 220;

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // o riacho primeiro: a água fica por baixo das pedras e das tábuas
    for (var wti = 0; wti < waters.length; wti++) {
      var wt = waters[wti];
      if (wt.x > x1 || wt.x + wt.w < x0) continue;
      drawRiacho(ctx, wt, t);
    }

    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.k === 'h' || s.x > x1 || s.x + s.w < x0) continue;
      var d = decor[i];
      if (s.k === 'c') ctx.drawImage(d.spr, s.x + d.ox, s.y + d.oy);
      else if (s.k === 'w') drawMadeira(ctx, s, d);
      else if (s.k === 'r') drawPedra(ctx, s, d);
      else drawTerra(ctx, s, d, t);
    }

    // arbustos de espinho por cima do terreno
    for (var h2 = 0; h2 < hazards.length; h2++) {
      var hz2 = hazards[h2];
      if (hz2.x > x1 || hz2.x + hz2.w < x0) continue;
      drawEspinheiro(ctx, hz2, t);
    }

    // a jaula do caçador (ou os restos dela)
    if (jaula.x < x1 && jaula.x + jaula.w > x0) drawJaula(ctx, t);

    // totens-checkpoint
    for (var c = 0; c < checkpoints.length; c++) {
      var cp = checkpoints[c];
      if (cp.x > x1 || cp.x < x0) continue;
      drawTotemCheckpoint(ctx, cp, FG.engine.checkpoint.x === cp.x, t);
    }

    kit.desenharLumis(ctx, cam, lumis, lumiSpr, t);
    kit.desenharFaiscas(ctx, sparks);

    ctx.restore();
  }

  // --- riacho: água azul com correnteza, brilhos andando e margem de areia ---
  function drawRiacho(ctx, wt, t) {
    var g = ctx.createLinearGradient(0, wt.y, 0, wt.y + wt.h);
    g.addColorStop(0, 'rgba(90,180,230,0.9)');
    g.addColorStop(0.5, 'rgba(45,120,190,0.92)');
    g.addColorStop(1, 'rgba(20,60,120,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(wt.x, wt.y, wt.w, wt.h);

    // brilhos da correnteza, andando rio abaixo em ciclo
    ctx.save();
    ctx.strokeStyle = 'rgba(220,245,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    var passo = 90;
    for (var i = 0; i < Math.ceil(wt.w / passo) + 1; i++) {
      var bx = wt.x + ((i * passo + t * 55) % wt.w);
      var by = wt.y + 6 + (i % 3) * 14;
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + 14, by - 3, bx + 28, by);
    }
    ctx.stroke();
    // a linha da superfície, ondulando de leve
    ctx.strokeStyle = 'rgba(235,250,255,0.75)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (var sx = wt.x; sx <= wt.x + wt.w; sx += 16) {
      var sy = wt.y + Math.sin(t * 2.2 + sx * 0.04) * 2;
      if (sx === wt.x) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();

    // margens de areia clara
    ctx.fillStyle = '#c8b280';
    ctx.fillRect(wt.x - 26, wt.y - 4, 26, 10);
    ctx.fillRect(wt.x + wt.w, wt.y - 4, 26, 10);
  }

  // --- chão de terra com topo de grama, tufos, flores e cogumelos ---
  function drawTerra(ctx, s, d, t) {
    var g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    g.addColorStop(0, '#5e4428');
    g.addColorStop(0.5, '#47331e');
    g.addColorStop(1, '#2b1e12');
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, s.w, s.h);

    // manto de grama no topo
    ctx.fillStyle = '#4e8c3a';
    ctx.fillRect(s.x - 2, s.y - 3, s.w + 4, 9);
    ctx.fillStyle = '#7ab654';
    ctx.fillRect(s.x - 2, s.y - 3, s.w + 4, 3);

    // tufos balançando de leve
    ctx.strokeStyle = '#69aa48';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < d.tufos.length; i++) {
      var tf = d.tufos[i];
      var sw = Math.sin(t * 1.6 + tf.x * 0.05) * 2;
      ctx.moveTo(s.x + tf.x, s.y + 2);
      ctx.quadraticCurveTo(s.x + tf.x + tf.lean * 6 + sw, s.y - tf.h * 0.6,
                           s.x + tf.x + tf.lean * 10 + sw, s.y - tf.h);
    }
    ctx.stroke();

    // florzinhas
    for (var f = 0; f < d.flores.length; f++) {
      var fl = d.flores[f];
      ctx.fillStyle = fl.c;
      ctx.beginPath(); ctx.arc(s.x + fl.x, s.y - 6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8a020';
      ctx.beginPath(); ctx.arc(s.x + fl.x, s.y - 6, 1.2, 0, Math.PI * 2); ctx.fill();
    }

    // cogumelos vermelhos de bolinhas (decorativos, como no desenho)
    for (var m = 0; m < d.fungos.length; m++) {
      var fg = d.fungos[m];
      var mx = s.x + fg.x, my = s.y;
      ctx.fillStyle = '#efe6d2';
      ctx.fillRect(mx - fg.w * 0.18, my - fg.h * 0.55, fg.w * 0.36, fg.h * 0.55);
      ctx.fillStyle = '#c93a2e';
      ctx.beginPath();
      ctx.ellipse(mx, my - fg.h * 0.55, fg.w, fg.h * 0.5, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,245,230,0.9)';
      ctx.beginPath(); ctx.arc(mx - fg.w * 0.4, my - fg.h * 0.72, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + fg.w * 0.3, my - fg.h * 0.66, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // --- pedra com musgo no topo ---
  function drawPedra(ctx, s, d) {
    var g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    g.addColorStop(0, '#8d8a7e');
    g.addColorStop(0.5, '#6a6558');
    g.addColorStop(1, '#3e3a30');
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = 'rgba(255,255,240,0.18)';
    ctx.fillRect(s.x, s.y, s.w, 3);
    ctx.fillStyle = '#5a8c3e';
    for (var i = 0; i < d.musgo.length; i++) {
      var m = d.musgo[i];
      ctx.beginPath();
      ctx.ellipse(s.x + m.x, s.y + 1, m.w / 2, 4, 0, Math.PI, 0);
      ctx.fill();
    }
  }

  // --- tábua de madeira: pranchas, veios e cordas de amarração nas pontas ---
  function drawMadeira(ctx, s, d) {
    var g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    g.addColorStop(0, '#a87c48');
    g.addColorStop(0.5, '#8a6236');
    g.addColorStop(1, '#5e4022');
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    // frisos de prancha
    ctx.fillStyle = 'rgba(40,24,10,0.4)';
    for (var px = s.x + 34; px < s.x + s.w; px += 34) ctx.fillRect(px, s.y, 2, s.h);
    // veios
    ctx.strokeStyle = 'rgba(60,38,16,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (var i = 0; i < d.veios.length; i++) {
      var v = d.veios[i];
      ctx.moveTo(s.x + v.x, s.y + 4);
      ctx.lineTo(s.x + v.x + v.len, s.y + s.h - 4);
    }
    ctx.stroke();
    // luz na aresta de cima
    ctx.fillStyle = 'rgba(255,230,170,0.35)';
    ctx.fillRect(s.x, s.y, s.w, 2.2);
    // amarras de corda nas pontas (ponte de caçador)
    ctx.strokeStyle = 'rgba(210,180,130,0.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(s.x + 4, s.y - 6); ctx.lineTo(s.x + 4, s.y + s.h + 4);
    ctx.moveTo(s.x + s.w - 4, s.y - 6); ctx.lineTo(s.x + s.w - 4, s.y + s.h + 4);
    ctx.stroke();
  }

  // --- arbusto de espinhos: moita escura com acúleos claros ---
  function drawEspinheiro(ctx, hz, t) {
    ctx.fillStyle = '#1e3a18';
    ctx.beginPath();
    ctx.ellipse(hz.x + hz.w / 2, hz.y + hz.h, hz.w / 2 + 4, hz.h, 0, Math.PI, 0);
    ctx.fill();
    var n = Math.max(4, Math.round(hz.w / 12));
    ctx.strokeStyle = '#c8d8b0';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var bx = hz.x + 4 + i * (hz.w - 8) / (n - 1);
      var alt = hz.h * (0.6 + 0.4 * Math.abs(Math.sin(i * 1.93)));
      ctx.moveTo(bx, hz.y + hz.h - 2);
      ctx.lineTo(bx + ((i % 2) ? 3 : -3), hz.y + hz.h - alt);
    }
    ctx.stroke();
  }

  // --- a jaula do caçador: barras de ferro sobre base de madeira, cadeado,
  // e o MurphOliver lá dentro pedindo socorro até ser solto ---
  function drawJaula(ctx, t) {
    var j = jaula;
    var tx = j.tremor > 0 ? Math.sin(t * 60) * 3 * (j.tremor / 0.3) : 0;

    ctx.save();
    ctx.translate(j.x + tx, j.y);

    if (!j.quebrada) {
      // o prisioneiro, atrás das barras
      drawPreso(ctx, j.w / 2, j.h - 8, t);

      // moldura de madeira
      ctx.fillStyle = '#5e4022';
      ctx.fillRect(-4, -6, j.w + 8, 10);               // travessa de cima
      ctx.fillRect(-4, j.h - 8, j.w + 8, 10);          // base
      // barras de ferro (as que já levaram soco ficam tortas)
      var nb = 6;
      for (var b = 0; b <= nb; b++) {
        var bx = b * j.w / nb;
        var bend = (j.hits > 0 && (b % 2)) ? j.hits * 2.2 : 0;
        ctx.strokeStyle = '#3a3d44';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(bx, 2);
        ctx.quadraticCurveTo(bx + bend, j.h / 2, bx, j.h - 4);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(200,210,225,0.3)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(bx - 1.4, 2);
        ctx.quadraticCurveTo(bx - 1.4 + bend, j.h / 2, bx - 1.4, j.h - 4);
        ctx.stroke();
      }
      // travessa horizontal do meio
      ctx.fillStyle = '#2e3138';
      ctx.fillRect(0, j.h / 2 - 3, j.w, 6);
      // cadeado
      ctx.fillStyle = '#c8a028';
      ctx.fillRect(j.w - 18, j.h / 2 - 10, 16, 18);
      ctx.strokeStyle = '#8a6c14';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(j.w - 10, j.h / 2 - 12, 6, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#5e4a0c';
      ctx.beginPath(); ctx.arc(j.w - 10, j.h / 2 - 1, 2.4, 0, Math.PI * 2); ctx.fill();

      // balão de socorro, quando o jogador está perto
      var p = FG.player;
      if (p && Math.abs(p.x - j.x) < 520) {
        var bob = Math.sin(t * 2.4) * 3;
        ctx.save();
        ctx.translate(j.w / 2, -34 + bob);
        ctx.fillStyle = 'rgba(255,255,250,0.95)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 46, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-6, 14); ctx.lineTo(2, 30); ctx.lineTo(8, 13);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Me solta!', 0, 4);
        ctx.restore();
      }
    } else {
      // os restos: base lascada e barras tortas caídas
      ctx.fillStyle = '#5e4022';
      ctx.fillRect(-4, j.h - 8, j.w + 8, 10);
      ctx.strokeStyle = '#3a3d44';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      var tortas = [[8, -24, 0.5], [34, -18, -0.8], [66, -26, 1.1], [94, -16, -0.4]];
      for (var r2 = 0; r2 < tortas.length; r2++) {
        var tt = tortas[r2];
        ctx.save();
        ctx.translate(tt[0], j.h - 8);
        ctx.rotate(tt[2]);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(0, tt[1]);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // --- o MurphOliver preso: o desenho bom é do FG.companion (drawCaged);
  // sem ele, uma silhueta verde de olhos grandes para a jaula nunca ir vazia ---
  function drawPreso(ctx, cx, baseY, t) {
    var comp = FG.companion;
    if (comp && comp.drawCaged) {
      comp.drawCaged(ctx, cx, baseY);
      return;
    }
    var bob = Math.sin(t * 3) * 2;
    ctx.save();
    ctx.translate(cx, baseY + bob);
    ctx.fillStyle = '#5a9c34';
    ctx.beginPath();
    ctx.ellipse(0, -26, 24, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-8, -40, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, -42, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1e3a14';
    ctx.beginPath(); ctx.arc(-7, -39, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(8, -41, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // --- totem-checkpoint: mastro de madeira com a pena acesa no topo ---
  function drawTotemCheckpoint(ctx, cp, lit, t) {
    var x = cp.x, y = cp.y;
    ctx.fillStyle = '#4a3220';
    ctx.fillRect(x - 5, y - 92, 10, 92);
    ctx.fillStyle = '#5e4028';
    ctx.fillRect(x - 14, y - 96, 28, 8);
    ctx.fillStyle = '#2a1e14';
    ctx.fillRect(x - 12, y - 4, 24, 6);
    // marcas entalhadas
    ctx.strokeStyle = 'rgba(20,10,4,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 70); ctx.lineTo(x + 4, y - 62);
    ctx.moveTo(x + 4, y - 48); ctx.lineTo(x - 4, y - 40);
    ctx.stroke();
    if (lit) {
      var fl = 0.8 + 0.2 * Math.sin(t * 9 + Math.sin(t * 5.3));
      ctx.save();
      ctx.shadowColor = '#ffc060';
      ctx.shadowBlur = 26 * fl;
      ctx.fillStyle = '#ffd890';
      ctx.beginPath();
      ctx.ellipse(x, y - 112, 9, 16 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath();
      ctx.ellipse(x, y - 114, 3.6, 7 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#28331e';
      ctx.beginPath();
      ctx.ellipse(x, y - 112, 8, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------
  // DRAW FRONT — folhagem de primeiro plano e a vinheta leve.
  // ---------------------------------------------------------------
  function drawFront(ctx, cam) {
    buildAll();
    drawLayer(ctx, frontL, 1.15, cam);
    ctx.drawImage(vig, 0, 0);
  }

  // ---------------------------------------------------------------
  // API pública — a fase entra no registro na ordem do index.html.
  // ---------------------------------------------------------------
  FG.levels = FG.levels || [];
  FG.levels.push({
    id: 'floresta',
    nome: 'A Floresta',
    musica: 'floresta',
    W: W,
    H: H,
    playerStart: { x: 80, y: 560 },
    solids: solids,
    hazards: hazards,
    waters: waters,
    checkpoints: checkpoints,
    enemyDefs: enemyDefs,
    obstacleDefs: obstacleDefs,
    bossId: 'dalilesma',
    // x da jaula: quem nasce DEPOIS dele (atalho ?chefe=1) ganha o resgate
    // de graça — o engine lê este campo para não deixar o MurphOliver
    // trancado numa jaula que o jogador nunca vai ver
    resgateX: jaula.x,
    bossTriggerX: 20550,
    arena: { x: 20380, w: 1150 },
    reset: reset,
    update: update,
    drawBack: drawBack,
    drawSolids: drawSolids,
    drawFront: drawFront,
  });
})();
