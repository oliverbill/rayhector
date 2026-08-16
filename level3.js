// Fagulho: Lendas do Bosque — level3.js
// Fase 2, 'vulcao': A Encosta do Vulcão. Geometria, lumis, checkpoints,
// inimigos, obstáculos (defs), o ninho do topo da chaminé e todo o visual de
// rocha preta, veio de brasa e céu de fumaça.
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
  var W = 7200, H = 720;
  var CAM_Y_MAX = H - VIEW_H; // 180 — usado no parallax vertical

  // ---------------------------------------------------------------
  // GEOMETRIA — sólidos
  // k: 'g' = basalto de chão (crosta cinza por cima, veios acesos por baixo),
  //    'r' = bloco de rocha solta, 'c' = penhasco escalável (basalto colunar),
  //    'h' = piso oculto (fundo da lava, não é desenhado).
  //
  // RITMO EM 6 TRECHOS
  //  (1) x 0..1020     O SOPÉ: rocha em degraus, seguro, e UMA zona de chuva
  //                    de brasa isolada e lentíssima (period 3.8) — o jogador
  //                    aprende a ler a mancha no chão antes da rajada.
  //  (2) x 1020..2320  O CAMPO DE BRASA: três zonas alternadas com abrigos de
  //                    pedra. O ritmo é esperar a rajada e correr; as zonas
  //                    são dessincronizadas por `phase` para nunca virarem um
  //                    metrônomo só.
  //  (3) x 2320..3520  O RIO DE LAVA: o chão vira `hazard` e a travessia é de
  //                    disco em disco, com duas colunas de ar quente dando
  //                    altura. Quem cai não morre: há piso no fundo e dois
  //                    afloramentos de basalto para se recompor.
  //  (4) x 3520..4800  A CHAMINÉ VULCÂNICA: fenda de 70px entre o pilar e o
  //                    paredão (450px de parede vertical), com brasa caindo
  //                    pela chaminé — subir tem de ser no intervalo. Prêmio no
  //                    topo: o ninho com casulo. Depois, a descida em degraus
  //                    até a borda da caldeira, com o talude embaixo servindo
  //                    de rede (e cobrando outra zona de brasa).
  //  (5) x 4800..5660  AS CORRENTES SOBRE A CALDEIRA: duas correntes de ferro
  //                    ancoradas em três rochas — contraforte, pináculo central
  //                    e contraforte — com um disco de descanso em cada poço.
  //                    Cair custa caro (lava aberta), mas todo poço é rente a
  //                    uma face escalável: dá sempre para voltar.
  //  (6) x 5660..7200  O PLATÔ DO CHEFÃO: reta com rolo e a última rajada de
  //                    brasa antes da arena do Coração de Magma.
  //
  // Nada de beco sem saída: do fundo do rio de lava sai-se pela margem direita
  // (degrau de 70px); dos poços da caldeira, escalando o pináculo (280px) ou
  // os contrafortes (400px e 470px).
  //
  // Alturas: pulo simples sobe ~118px, duplo ~236px, e uma parede vertical
  // contínua sobe indefinidamente agarrando (~120px por salto de parede).
  // ---------------------------------------------------------------
  var solids = [
    // ---- (1) o sopé — degraus curtos de rocha, nada de perigo até x=800 ----
    S(0, 620, 1020, 100, 'g'),        // [0] chão do sopé
    S(250, 580, 96, 40, 'r'),         // [1] +40
    S(410, 536, 110, 84, 'r'),        // [2] +44
    S(590, 488, 120, 24, 'r'),        // [3] +48

    // ---- (2) o campo de brasa — chão corrido, abrigos suspensos ----
    // As saliências ficam a 130..140px do chão: um pulo duplo folgado. São o
    // prêmio de quem espera a rajada em vez de correr no susto.
    S(1020, 620, 1300, 100, 'g'),     // [4] chão do campo 1020..2320
    S(1330, 480, 120, 26, 'r'),       // [5] abrigo A (+140)
    S(1720, 486, 130, 26, 'r'),       // [6] abrigo B (+134)
    S(2130, 490, 120, 26, 'r'),       // [7] abrigo C (+130)

    // ---- (3) o rio de lava — piso oculto no fundo e dois afloramentos ----
    // O piso oculto não é misericórdia gratuita: é o que impede o beco sem
    // saída. Quem cai anda para a direita tomando 1 de dano a cada 1.2s e sobe
    // 70px na margem. Os afloramentos são estreitos de propósito (70px, vãos
    // de 320..430px): servem para se recompor, não como rota alternativa.
    S(2320, 690, 1200, 30, 'h'),      // [8] fundo do rio 2320..3520
    S(2530, 596, 70, 94, 'r'),        // [9] afloramento 1
    S(3020, 584, 70, 106, 'r'),       // [10] afloramento 2
    S(3520, 620, 300, 100, 'g'),      // [11] margem direita / base da chaminé

    // ---- (4) a chaminé vulcânica ----
    // O chão da base passa por baixo do arco do pilar (70px de vão) e morre
    // dentro da fenda de 70px. Dali só se sai por cima: agarrar e saltar de
    // face em face, de 620 até 170 — 450px de parede vertical contínua, com a
    // cortina de brasa caindo pelo meio.
    S(3660, 170, 90, 380, 'c'),       // [12] pilar (arco de 70px por baixo)
    S(3820, 170, 480, 550, 'c'),      // [13] paredão da chaminé + platô superior
    S(4300, 620, 500, 100, 'g'),      // [14] talude ao pé do platô 4300..4800
    S(4340, 296, 130, 24, 'r'),       // [15] descida: degrau 1 (-126 do platô)
    S(4520, 396, 120, 24, 'r'),       // [16] degrau 2 (-100)
    S(4690, 486, 110, 24, 'r'),       // [17] degrau 3 (-90)

    // ---- (5) as correntes sobre a caldeira ----
    // TRÊS rochas seguram as duas correntes, e é por isso que elas existem:
    // corrente de ferro precisa de pedra onde morder. Os pinos ficam cravados
    // nas FACES (nunca no topo), senão o jogador pendurado junto ao pino fica
    // com o corpo dentro da rocha — o contrato do cipó pede sag+13+60px livres
    // abaixo da reta dos pinos, e sobre o topo de uma plataforma isso é zero.
    // O contraforte esquerdo é o trampolim (220px de parede a partir da borda);
    // o pináculo central é o descanso do meio; o contraforte direito é a saída.
    // O fundo da caldeira é partido em dois poços, cada um rente a duas faces:
    // quem cai escala 280px (pináculo) ou 400px (contrafortes) e volta.
    S(4800, 520, 80, 200, 'g'),       // [18] borda da caldeira
    S(4880, 300, 80, 420, 'c'),       // [19] contraforte esquerdo (âncora da corrente 1)
    S(4960, 700, 180, 20, 'h'),       // [20] fundo da caldeira, poço oeste 4960..5140
    S(5140, 470, 80, 250, 'c'),       // [21] pináculo central: descanso e âncora do meio
    S(5220, 700, 340, 20, 'h'),       // [22] fundo da caldeira, poço leste 5220..5560
    // O topo do contraforte direito está a 240px acima do pináculo — 4px acima
    // do pulo duplo (236). É de propósito: com 170px de desnível um perito
    // fechava o vão de 340px planando e pulava a corrente 2 inteira, que é
    // justamente a prova do trecho. Agora a única entrada aérea é soltar a
    // corrente com ESPAÇO, que sobe 93px a partir do pino.
    S(5560, 230, 100, 490, 'c'),      // [23] contraforte direito (âncora da corrente 2)

    // ---- (6) o platô do chefão ----
    S(5660, 620, 1540, 100, 'g'),     // [24] platô 5660..7200
    S(5740, 540, 120, 24, 'r'),       // [25] (+80)
    S(5880, 496, 110, 22, 'r'),       // [26] (+44 do anterior)
  ];

  // ---------------------------------------------------------------
  // HAZARDS — t: 'l' = lava, 's' = lascas de obsidiana
  // A superfície da lava fica a 650 (rio) e 656 (caldeira): quem está de pé no
  // piso oculto (690 / 700) fica com o corpo dentro dela, quem está no topo de
  // um afloramento (596 / 584) não encosta.
  // ---------------------------------------------------------------
  function Hz(x, y, w, h, t) { return { x: x, y: y, w: w, h: h, t: t }; }

  var hazards = [
    Hz(1560, 596, 90, 24, 's'),    // obsidiana no meio do campo de brasa
    Hz(2160, 596, 90, 24, 's'),    // última mordida antes do rio
    Hz(2320, 650, 210, 34, 'l'),   // rio de lava — trecho 1
    Hz(2600, 650, 420, 34, 'l'),   // rio de lava — trecho 2
    Hz(3090, 650, 430, 34, 'l'),   // rio de lava — trecho 3
    Hz(4420, 596, 110, 24, 's'),   // talude: a rota fácil também cobra
    Hz(4640, 596, 100, 24, 's'),
    Hz(4960, 656, 180, 34, 'l'),   // caldeira: poço oeste, sob a corrente 1
    Hz(5220, 656, 340, 34, 'l'),   // caldeira: poço leste, sob a corrente 2
    Hz(5890, 596, 90, 24, 's'),    // platô do chefão
  ];

  // 4 braseiros-checkpoint (acendem quando ativados)
  var checkpoints = [
    { x: 1050, y: 620 },   // entrada do campo de brasa
    { x: 3560, y: 620 },   // base da chaminé
    { x: 3880, y: 170 },   // topo da chaminé — o mais caro de todos
    { x: 5720, y: 620 },   // entrada do platô do chefão
  ];

  // ---------------------------------------------------------------
  // NINHO COM CASULO — 5 lumis de uma vez. Um só, no topo da chaminé: é o
  // prêmio dos 450px de escalada com brasa caindo na cabeça, e fica logo na
  // saída da fenda para não obrigar a um segundo desvio.
  // ---------------------------------------------------------------
  var ninhos = [
    { x: 3900, y: 138, taken: false },
  ];

  // ---------------------------------------------------------------
  // INIMIGOS — voadeira e espinhoco carregam a fase: brasa cai de cima, então
  // ameaça aérea combina e ameaça rasteira obriga a parar no lugar errado.
  // NENHUM `peixe`: ele é a assinatura do pântano e é desenhado no enemies.js
  // como bicho aquático (turquesa, rastro de bolhas). Sobre lava aberta isso
  // não se lê como fauna do vulcão, lê-se como bug — e o desenho dele não é
  // deste arquivo para eu repaginar. Sobre o rio de lava entra voadeira.
  // ---------------------------------------------------------------
  var enemyDefs = [
    { type: 'espinhoco', x: 700, y: 594, range: 80 },    // sopé, antes da 1ª brasa
    { type: 'voadeira',  x: 1180, y: 500, range: 120 },
    { type: 'espinhoco', x: 1390, y: 594, range: 100 },
    { type: 'voadeira',  x: 1600, y: 470, range: 140 },
    { type: 'sapeca',    x: 1790, y: 588, range: 70 },
    { type: 'voadeira',  x: 2040, y: 480, range: 150 },
    { type: 'espinhoco', x: 2280, y: 594, range: 80 },
    { type: 'voadeira',  x: 2860, y: 430, range: 190 },  // sobre o rio de lava
    { type: 'voadeira',  x: 3200, y: 420, range: 160 },
    { type: 'voadeira',  x: 3900, y: 90, range: 130 },   // sobre o platô
    { type: 'espinhoco', x: 4180, y: 144, range: 90 },   // platô (topo em 170)
    { type: 'voadeira',  x: 4560, y: 330, range: 120 },  // na descida
    { type: 'sapeca',    x: 4700, y: 588, range: 80 },   // talude
    { type: 'voadeira',  x: 5200, y: 380, range: 170 },  // sobre a caldeira
    { type: 'voadeira',  x: 5450, y: 400, range: 150 },
    { type: 'espinhoco', x: 5820, y: 594, range: 90 },
    { type: 'sapeca',    x: 6060, y: 588, range: 70 },
  ];

  // ---------------------------------------------------------------
  // OBSTÁCULOS DINÂMICOS (FG.obstacles lê daqui)
  // Convenções de coordenada usadas aqui:
  //   brasa       {x,y,w,h,period,phase} — (x,y) = canto superior esquerdo da
  //               zona; as brasas nascem logo acima de y e ESTOURAM em y+h, que
  //               por isso tem de coincidir com o piso real. `phase` em
  //               SEGUNDOS de adiantamento no ciclo (0.8s de aviso, 1.1s de
  //               rajada, o resto de descanso).
  //   disco       {x,y,w,bob,period,phase} — (x,y) = canto superior esquerdo na
  //               posição MÉDIA; altura sólida fixa de 18px; `phase` em RADIANOS.
  //   cipo        {x1,y1,x2,y2,sag} — pinos das duas pontas; `sag` é a barriga.
  //               Precisa de sag+13+60px livres abaixo da reta dos pinos.
  //   sopro       {x,y,w,h} — retângulo da coluna de ar (y = topo).
  //   pendulo     {x,y,len,arc,period} — (x,y) = ponto de fixação da corrente.
  //   espinhorolo {x,y,w,range,speed} — y = TOPO do rolo (a base fica em y+w).
  //
  // TODAS as zonas de brasa abaixo fecham em piso real:
  //   620 (chão do sopé, do campo, da base da chaminé, do talude e do platô)
  //   e 170 (topo do paredão). Brasa que estoura no ar não se lê.
  // ---------------------------------------------------------------
  var obstacleDefs = [
    // (1) sopé: uma zona só, larga e lenta. Period 3.8 dá quase 2s de descanso
    // entre rajadas — tempo de sobra para ver a mancha acender e recuar.
    { type: 'brasa', x: 800, y: 400, w: 200, h: 220, period: 3.8, phase: 0 },

    // (2) campo de brasa: três zonas com abrigo entre elas. As fases (0, 1.5,
    // 0.8) e os períodos diferentes garantem que duas vizinhas nunca disparem
    // juntas — atravessar é sempre possível, mas nunca no mesmo compasso.
    { type: 'brasa', x: 1080, y: 400, w: 240, h: 220, period: 3.0, phase: 0 },
    { type: 'brasa', x: 1470, y: 400, w: 250, h: 220, period: 3.0, phase: 1.5 },
    { type: 'brasa', x: 1860, y: 400, w: 260, h: 220, period: 2.6, phase: 0.8 },
    // A bola varre o abrigo A: descansar debaixo dela tem preço, e a saída é
    // pelas pontas da saliência, onde o arco já subiu.
    { type: 'pendulo', x: 1395, y: 250, len: 180, arc: 0.9, period: 2.7 },
    // O rolo mora no ÚLTIMO abrigo: quando ele aparece, o jogador já sabe ler
    // a brasa e pode ter duas coisas na cabeça ao mesmo tempo.
    { type: 'espinhorolo', x: 2150, y: 576, w: 44, range: 110, speed: 135 },

    // (3) rio de lava: cinco discos com vãos de 100..140px (pulo simples
    // sobra), alturas alternadas para o ritmo não virar escada, e dois sopros
    // nos vãos maiores, que também abrem as colunas de lumi lá em cima.
    { type: 'disco', x: 2400, y: 520, w: 120, bob: 12, period: 3.0, phase: 0 },
    { type: 'disco', x: 2660, y: 486, w: 110, bob: 14, period: 3.4, phase: 1.1 },
    { type: 'sopro', x: 2800, y: 300, w: 90, h: 350 },
    { type: 'disco', x: 2900, y: 500, w: 110, bob: 12, period: 2.8, phase: 2.5 },
    { type: 'disco', x: 3140, y: 470, w: 120, bob: 16, period: 3.6, phase: 0.7 },
    { type: 'sopro', x: 3270, y: 280, w: 80, h: 370 },
    { type: 'disco', x: 3360, y: 510, w: 110, bob: 10, period: 3.0, phase: 1.9 },

    // (4) chaminé: a cortina de brasa desce a fenda inteira (200..620). Zona de
    // 70px de largura = 3 colunas e a taxa mínima (8 brasas/s): é uma cortina
    // fina e legível, não uma parede impossível. Period 3.2 deixa ~1.3s de
    // descanso — dois saltos de parede por intervalo, que é o que a subida pede.
    { type: 'brasa', x: 3750, y: 200, w: 70, h: 420, period: 3.2, phase: 0 },
    // No platô a brasa cai do céu de fumaça (y=0) e estoura na rocha (170).
    { type: 'brasa', x: 4040, y: 0, w: 220, h: 170, period: 3.0, phase: 1.4 },
    // O talude é a rota fácil da descida — e cobra a sua própria rajada.
    { type: 'brasa', x: 4380, y: 400, w: 220, h: 220, period: 3.4, phase: 2.1 },

    // (5) correntes sobre a caldeira. Cada corrente DESCE da rocha alta para a
    // baixa e a seguinte volta a subir: é o zigue-zague que dá o ritmo de
    // "solta no alto, cai, agarra de novo". Os quatro pinos estão cravados em
    // face de rocha (contraforte 4960, pináculo 5180 e 5270, contraforte 5560),
    // com 210..300px livres abaixo da reta — bem acima dos sag+73 exigidos.
    // Soltar com ESPAÇO sobe 93px, e as duas correntes terminam diferente de
    // propósito: a 1 põe o jogador limpo em cima do pináculo (precisa de 77 dos
    // 93), a 2 o encosta na parede do contraforte e os últimos palmos são um
    // salto de parede — a mesma escalada da chaminé cobrada de novo, agora com
    // lava embaixo. Chegar arrastado até a ponta não sobe nada: aí ele cai no
    // poço e volta escalando, que é o preço combinado.
    { type: 'cipo', x1: 4964, y1: 330, x2: 5136, y2: 490, sag: 66 },
    { type: 'disco', x: 4990, y: 570, w: 110, bob: 9, period: 3.0, phase: 0.4 },
    { type: 'cipo', x1: 5224, y1: 490, x2: 5556, y2: 270, sag: 76 },
    // Ar quente subindo do poço leste: é o poço mais largo e o de parede mais
    // alta, então é ali que quem cai precisa de ajuda para voltar.
    { type: 'sopro', x: 5240, y: 420, w: 80, h: 240 },
    // Os discos de descanso ficam BAIXOS de propósito (570). Servem para
    // recuperar o fôlego e voltar à corrente com um pulo duplo, mas o salto de
    // um disco para o contraforte direito daria 280px — acima dos 236 do pulo
    // duplo. Sem isso a caldeira se atravessaria de disco em disco e as
    // correntes viravam enfeite.
    { type: 'disco', x: 5340, y: 570, w: 110, bob: 10, period: 3.4, phase: 1.9 },

    // (6) platô do chefão: o rolo passa por baixo das saliências e a última
    // rajada fecha em 6200, exatamente na boca da arena — nada de obstáculo
    // dentro dela, a luta é do chefão.
    { type: 'espinhorolo', x: 5700, y: 576, w: 44, range: 130, speed: 140 },
    { type: 'brasa', x: 6020, y: 400, w: 180, h: 220, period: 3.2, phase: 0.6 },
  ];

  // ---------------------------------------------------------------
  // LUMIS — linhas, arcos e COLUNAS. As colunas marcam o que se sobe: a
  // chaminé e as duas colunas de ar quente do rio.
  // ---------------------------------------------------------------
  var lumis = [];
  function lumiLine(x, y, n, dx) { kit.lumiLine(lumis, x, y, n, dx); }
  function lumiCol(x, y, n, dy) { kit.lumiCol(lumis, x, y, n, dy); }
  function lumiArc(cx, apexY, n, span, sag) { kit.lumiArc(lumis, cx, apexY, span, sag, n); }
  // (1) sopé
  lumiLine(140, 578, 4, 60);
  lumiArc(520, 470, 5, 190, 34);
  lumiLine(640, 442, 3, 40);
  lumiArc(900, 520, 4, 170, 40);       // dentro da 1ª zona de brasa: o prêmio de ler a mancha
  // (2) campo de brasa — arco por zona (puxa a corrida) e linha por abrigo
  lumiArc(1200, 540, 4, 180, 44);
  lumiLine(1350, 436, 3, 44);
  lumiArc(1595, 528, 4, 190, 46);
  lumiLine(1745, 442, 3, 44);
  lumiArc(1990, 520, 5, 210, 48);
  lumiLine(2155, 446, 3, 44);
  // (3) rio de lava — um arco por disco, coluna dentro de cada sopro
  lumiArc(2460, 470, 3, 130, 34);
  lumiArc(2715, 436, 3, 130, 34);
  lumiCol(2845, 600, 5, -62);
  lumiArc(2955, 452, 3, 130, 34);
  lumiArc(3200, 420, 3, 140, 36);
  lumiCol(3310, 590, 5, -64);
  lumiArc(3415, 460, 3, 130, 34);
  // (4) chaminé e platô
  lumiCol(3785, 560, 6, -62);          // A CHAMINÉ: a escada de lumis ensina a subir agarrado
  lumiLine(3850, 120, 3, 56);
  lumiLine(4110, 118, 4, 54);          // platô, por baixo da chuva de brasa
  lumiArc(4400, 250, 3, 130, 34);      // descida em degraus
  lumiArc(4580, 350, 3, 120, 32);
  lumiArc(4745, 440, 3, 110, 30);
  lumiArc(4480, 560, 4, 180, 44);      // talude, dentro da rajada
  // (5) correntes sobre a caldeira — arco de entrada em cada corrente e uma
  // linha em cima do pináculo, que é o descanso do meio da travessia
  lumiArc(5040, 400, 4, 150, 42);
  lumiLine(5155, 430, 2, 44);          // sobre o pináculo central (topo em 470)
  lumiArc(5390, 420, 4, 190, 44);
  lumiCol(5280, 630, 5, -56);          // dentro do ar quente do poço leste
  // (6) platô do chefão
  lumiLine(5690, 578, 3, 54);
  lumiLine(5770, 500, 3, 44);
  lumiLine(5910, 456, 3, 44);
  lumiArc(6110, 520, 4, 160, 40);      // última rajada
  lumiLine(6280, 570, 2, 60);

  // FAÍSCAS — brilho de despedida da lumi coletada (pool fixo do kit, sem GC).
  // 80 e não 64 como no bosque: o estouro do ninho sozinho gasta 22.
  var sparks = kit.makeSparks(80);

  // ---------------------------------------------------------------
  // MANCHAS DE QUEIMADO — cicatriz permanente no chão de cada zona de brasa,
  // derivada dos obstacleDefs no load. Serve de leitura ANTES de a zona
  // acender pela primeira vez: o jogador vê a rocha esturricada e desconfia.
  // ---------------------------------------------------------------
  var queimados = [];
  (function () {
    var r = makeRand(70707);
    for (var i = 0; i < obstacleDefs.length; i++) {
      var d = obstacleDefs[i];
      if (d.type !== 'brasa') continue;
      var n = 3 + Math.floor(d.w / 70);
      for (var k = 0; k < n; k++) {
        queimados.push({
          x: d.x + 10 + r() * (d.w - 20),
          y: d.y + d.h,
          rx: 16 + r() * 26,
          ry: 4 + r() * 5,
        });
      }
    }
  })();

  // ---------------------------------------------------------------
  // ÂNCORAS DAS CORRENTES — o obstacles.js desenha a corda e os pinos de
  // metal; o contexto de pedra é meu. Cada ponta ganha um bloco de basalto
  // cravado com argola, para a corrente parecer presa na montanha e não
  // flutuando. Derivadas dos defs no load, para não repetir coordenada.
  //
  // `lado` é o lado para onde o BLOCO cresce, e ele cresce para dentro da
  // rocha, ou seja, para o lado oposto ao da corrente: o pino x1 tem pedra à
  // esquerda (lado +1) e o x2 tem pedra à direita (lado -1). Toda corrente
  // desta fase respeita isso — os pinos estão cravados em face de rocha.
  // ---------------------------------------------------------------
  var ancoras = [];
  (function () {
    for (var i = 0; i < obstacleDefs.length; i++) {
      var d = obstacleDefs[i];
      if (d.type !== 'cipo') continue;
      ancoras.push({ x: d.x1, y: d.y1, lado: 1 });
      ancoras.push({ x: d.x2, y: d.y2, lado: -1 });
    }
  })();

  // ---------------------------------------------------------------
  // DECORAÇÃO por sólido (pré-computada: nada de random por frame).
  // 'g' e 'r' guardam veios de brasa (que pulsam) e dentes de crosta; 'c' vira
  // um offscreen inteiro no primeiro draw (custo zero por frame).
  // ---------------------------------------------------------------
  var decor = [];
  (function () {
    var r = makeRand(20260816);
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      var d = { veios: [], dentes: [], spr: null, ox: 0, oy: 0 };
      if (s.k === 'g' || s.k === 'r') {
        // veios: rachaduras acesas descendo pela face, mais densas embaixo
        var nv = Math.max(2, Math.floor(s.w / 90));
        for (var j = 0; j < nv; j++) {
          var vx = 8 + r() * Math.max(1, s.w - 16);
          var vy = 6 + r() * Math.max(4, s.h * 0.35);
          var vl = Math.min(s.h - vy - 2, 16 + r() * 46);
          d.veios.push({
            x: vx, y: vy, len: Math.max(8, vl),
            bend: (r() * 2 - 1) * 12, ph: j * 1.7 + r() * 2,
          });
        }
        // dentes de crosta na aresta de cima: a rocha quebrou e ficou serrilhada
        var nd = Math.max(3, Math.floor(s.w / 46));
        for (var k = 0; k < nd; k++) {
          d.dentes.push({ dx: r() * s.w, w: 5 + r() * 9, h: 3 + r() * 5 });
        }
      }
      decor.push(d);
    }
  })();

  // ---------------------------------------------------------------
  // OFFSCREENS — céu, brilho da caldeira, camadas de parallax, fumaça,
  // vinheta, faixas de brilho reaproveitáveis, sprite da lumi e um sprite por
  // penhasco. Construídos uma única vez.
  // ---------------------------------------------------------------
  var built = false;
  var skySpr, glowSpr, farL, midL, fumL, nearL, frontL, vig, lumiSpr;
  var glowUp, glowDown;
  var LAYER_H = 680;
  var ROCK_PAD = 16;        // folga para a crosta transbordar a rocha

  function buildAll() {
    if (built) return;
    built = true;

    // CÉU DE FUMAÇA. A ordem das paradas é a do bosque ao contrário: lá o
    // claro estava embaixo porque o sol punha no horizonte; aqui o claro está
    // embaixo porque a LUZ VEM DE BAIXO, da lava. O topo é fuligem quase preta.
    skySpr = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, '#0b0509');
      gr.addColorStop(0.3, '#250d14');
      gr.addColorStop(0.6, '#5e1a15');
      gr.addColorStop(0.84, '#a8341a');
      gr.addColorStop(1, '#d95a22');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      // fuligem: manchas escuras rolando no alto, para o céu não ser um degradê liso
      var r = makeRand(13);
      g.fillStyle = 'rgba(10,4,8,0.5)';
      for (var i = 0; i < 26; i++) {
        g.globalAlpha = 0.10 + r() * 0.24;
        g.beginPath();
        g.ellipse(r() * VIEW_W, r() * 250, 70 + r() * 150, 22 + r() * 46, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    })(skySpr.getContext('2d'));

    // CLARÃO DA CALDEIRA — o "sol" desta fase, e ele mora embaixo da tela.
    glowSpr = makeCanvas(560, 300);
    (function (g) {
      var gr = g.createRadialGradient(280, 300, 10, 280, 300, 290);
      gr.addColorStop(0, 'rgba(255,238,180,0.75)');
      gr.addColorStop(0.22, 'rgba(255,160,60,0.5)');
      gr.addColorStop(0.55, 'rgba(230,80,30,0.2)');
      gr.addColorStop(1, 'rgba(200,50,20,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 560, 300);
    })(glowSpr.getContext('2d'));

    // FAIXAS DE BRILHO reaproveitáveis: assadas uma vez e esticadas com
    // drawImage onde for preciso. É o que permite ter glow em toda lava e sob
    // toda saliência sem criar um gradiente por frame.
    glowUp = makeCanvas(16, 160);
    (function (g) {
      var gr = g.createLinearGradient(0, 160, 0, 0);
      gr.addColorStop(0, 'rgba(255,150,50,0.5)');
      gr.addColorStop(0.35, 'rgba(255,110,30,0.2)');
      gr.addColorStop(1, 'rgba(255,90,25,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 16, 160);
    })(glowUp.getContext('2d'));

    glowDown = makeCanvas(16, 90);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, 90);
      gr.addColorStop(0, 'rgba(255,130,45,0.42)');
      gr.addColorStop(1, 'rgba(255,110,30,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 16, 90);
    })(glowDown.getContext('2d'));

    farL = makeCanvas(2400, LAYER_H); paintFar(farL.getContext('2d'));
    midL = makeCanvas(2400, LAYER_H); paintMid(midL.getContext('2d'));
    fumL = makeCanvas(1600, LAYER_H); paintFumaca(fumL.getContext('2d'));
    nearL = makeCanvas(2400, LAYER_H); paintNear(nearL.getContext('2d'));
    frontL = makeCanvas(1800, LAYER_H); paintFront(frontL.getContext('2d'));

    // vinheta invertida: escura EM CIMA. No bosque ela fechava por igual; aqui
    // fechar embaixo apagaria justamente a fonte de luz.
    vig = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, 'rgba(6,2,6,0.55)');
      gr.addColorStop(0.45, 'rgba(6,2,6,0.12)');
      gr.addColorStop(1, 'rgba(6,2,6,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      var rg = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 260, VIEW_W / 2, VIEW_H / 2, 660);
      rg.addColorStop(0, 'rgba(8,2,6,0)');
      rg.addColorStop(1, 'rgba(8,2,6,0.45)');
      g.fillStyle = rg;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    })(vig.getContext('2d'));

    // sprite da lumi (halo dourado + núcleo) — igual nas três fases
    lumiSpr = kit.makeLumiSprite();

    // um offscreen por penhasco (desenho caro, feito uma vez)
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.k !== 'c') continue;
      var c = makeCanvas(s.w + ROCK_PAD * 2, s.h + ROCK_PAD * 2);
      paintCliff(c.getContext('2d'), s.w, s.h, 7331 + i * 173);
      decor[i].spr = c; decor[i].ox = -ROCK_PAD; decor[i].oy = -ROCK_PAD;
    }
  }

  // ---------------------------------------------------------------
  // PENHASCO — basalto colunar: colunas verticais justas, quase pretas, com
  // as juntas acesas e a BASE brilhando (a luz vem de baixo). O bosque fazia o
  // contrário: lá o topo pegava sol e a base afundava na sombra.
  // ---------------------------------------------------------------
  function paintCliff(g, w, h, seed) {
    var r = makeRand(seed);
    var P = ROCK_PAD;

    g.save();
    g.beginPath(); g.rect(P, P, w, h); g.clip();

    // corpo: preto em cima, avermelhando para baixo
    var gr = g.createLinearGradient(0, P, 0, P + h);
    gr.addColorStop(0, '#181218');
    gr.addColorStop(0.55, '#241419');
    gr.addColorStop(1, '#3d1a16');
    g.fillStyle = gr;
    g.fillRect(P, P, w, h);

    // colunas hexagonais: uma sucessão de faixas verticais com aresta clara de
    // um lado e junta escura do outro. É a assinatura do basalto.
    var cw = 20 + r() * 12;
    for (var x = P; x < P + w; x += cw) {
      var lw = cw * (0.82 + r() * 0.3);
      var tom = 0.05 + r() * 0.07;
      g.fillStyle = 'rgba(120,92,104,' + tom.toFixed(3) + ')';
      g.fillRect(x, P, lw, h);
      g.fillStyle = 'rgba(6,2,6,0.5)';
      g.fillRect(x + lw - 2, P, 2.5, h);
      // quebras horizontais da coluna (o basalto racha em blocos)
      g.fillStyle = 'rgba(6,2,6,0.35)';
      for (var y = P + 20 + r() * 40; y < P + h; y += 44 + r() * 46) {
        g.fillRect(x, y, lw, 2);
        g.fillStyle = 'rgba(255,140,60,0.10)';
        g.fillRect(x, y + 2, lw, 1.4);
        g.fillStyle = 'rgba(6,2,6,0.35)';
      }
    }

    // veios de brasa: fissuras acesas subindo do pé da parede
    g.lineCap = 'round';
    var nv = 1 + Math.floor(w / 55);
    for (var k = 0; k < nv; k++) {
      var vx = P + 8 + r() * Math.max(1, w - 16);
      var vy = P + h - 4 - r() * (h * 0.25);
      var vl = 40 + r() * (h * 0.55);
      g.strokeStyle = 'rgba(255,120,40,0.30)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(vx, vy);
      g.quadraticCurveTo(vx + (r() * 2 - 1) * 16, vy - vl * 0.5, vx + (r() * 2 - 1) * 22, vy - vl);
      g.stroke();
      g.strokeStyle = 'rgba(255,214,140,0.65)';
      g.lineWidth = 1.6;
      g.stroke();
    }

    // bocas quentes ao fundo, como as cavernas do bosque mas acesas
    if (w >= 90 && h >= 160) {
      var nb = 1 + Math.floor(r() * 2);
      for (var bi = 0; bi < nb; bi++) {
        var mx = P + 22 + r() * Math.max(1, w - 44);
        var my = P + h * (0.45 + r() * 0.4);
        var mh = 20 + r() * 26;
        var mg = g.createRadialGradient(mx, my, 2, mx, my, mh * 1.6);
        mg.addColorStop(0, 'rgba(255,190,90,0.5)');
        mg.addColorStop(0.45, 'rgba(220,70,25,0.25)');
        mg.addColorStop(1, 'rgba(200,50,20,0)');
        g.fillStyle = mg;
        g.beginPath();
        g.ellipse(mx, my, mh * 1.2, mh, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    // pé da parede aceso (a luz vem de baixo)
    var bh = Math.min(150, h * 0.5);
    var bg = g.createLinearGradient(0, P + h - bh, 0, P + h);
    bg.addColorStop(0, 'rgba(255,110,35,0)');
    bg.addColorStop(1, 'rgba(255,130,45,0.4)');
    g.fillStyle = bg;
    g.fillRect(P, P + h - bh, w, bh);
    g.restore();

    // topo: crosta de cinza fria, sem brilho nenhum — é a face que dá as
    // costas para a lava, e é o contraste dela que vende a luz de baixo.
    g.fillStyle = '#2c2830';
    g.fillRect(P - 3, P - 2, w + 6, 11);
    g.fillStyle = '#464150';
    g.fillRect(P - 3, P - 2, w + 6, 5);
    g.fillStyle = 'rgba(20,16,22,0.9)';
    g.fillRect(P - 3, P + 7, w + 6, 3);
    // lascas soltas na aresta
    g.fillStyle = '#241f2a';
    var nl = Math.max(3, Math.floor(w / 40));
    for (var li = 0; li < nl; li++) {
      var lx = P + r() * w, lh = 3 + r() * 7, lwd = 5 + r() * 9;
      g.beginPath();
      g.moveTo(lx, P);
      g.lineTo(lx + lwd * 0.5, P - lh);
      g.lineTo(lx + lwd, P);
      g.closePath();
      g.fill();
    }
  }

  // --- camada distante: cones de vulcão em silhueta, com cratera acesa e
  // rios de lava descendo. Rim light na CRISTA porque o clarão vem de trás e
  // de baixo — mesma lógica de luz, lida à distância. ---
  function paintFar(g) {
    var r = makeRand(9101);
    var base = LAYER_H;

    for (var c = 0; c < 4; c++) {
      var cx = 130 + c * 620 + r() * 160;
      var ch = 300 + r() * 190;
      var cw = 320 + r() * 220;
      var top = base - 40 - ch;
      g.fillStyle = 'rgba(30,14,22,0.92)';
      g.beginPath();
      g.moveTo(cx - cw / 2, base);
      g.lineTo(cx - 34, top + 16);
      g.lineTo(cx - 12, top);
      g.lineTo(cx + 14, top + 4);
      g.lineTo(cx + 36, top + 18);
      g.lineTo(cx + cw / 2, base);
      g.closePath();
      g.fill();

      // cratera acesa e pluma
      var kg = g.createRadialGradient(cx, top + 6, 2, cx, top + 6, 90);
      kg.addColorStop(0, 'rgba(255,220,140,0.75)');
      kg.addColorStop(0.3, 'rgba(255,120,40,0.35)');
      kg.addColorStop(1, 'rgba(220,60,20,0)');
      g.fillStyle = kg;
      g.beginPath();
      g.ellipse(cx, top + 6, 90, 60, 0, 0, Math.PI * 2);
      g.fill();

      // rios de lava escorrendo pelas encostas
      g.lineCap = 'round';
      for (var v = 0; v < 3; v++) {
        var dirv = v === 1 ? 0 : (v === 0 ? -1 : 1);
        var ex = cx + dirv * (18 + r() * 26);
        var ey = top + 10;
        var el = ch * (0.5 + r() * 0.45);
        g.strokeStyle = 'rgba(255,110,35,0.34)';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(ex, ey);
        g.quadraticCurveTo(ex + dirv * 50, ey + el * 0.55, ex + dirv * (70 + r() * 60), ey + el);
        g.stroke();
        g.strokeStyle = 'rgba(255,206,130,0.6)';
        g.lineWidth = 2.2;
        g.stroke();
      }

      // rim light na crista voltada para o clarão
      g.strokeStyle = 'rgba(255,140,60,0.28)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(cx - 34, top + 16);
      g.lineTo(cx - 12, top);
      g.lineTo(cx + 14, top + 4);
      g.lineTo(cx + 36, top + 18);
      g.stroke();
    }

    // cordão de morros de escória à frente dos cones
    g.fillStyle = 'rgba(22,10,16,0.95)';
    hillBand(g, r, base - 150, 70, 6);

    // lago de lava no horizonte: é ele que acende a base da camada
    var gr = g.createLinearGradient(0, base - 120, 0, base);
    gr.addColorStop(0, 'rgba(255,90,30,0)');
    gr.addColorStop(0.6, 'rgba(255,100,30,0.18)');
    gr.addColorStop(1, 'rgba(255,170,70,0.42)');
    g.fillStyle = gr;
    g.fillRect(0, base - 120, 2400, 120);
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

  // --- camada média: agulhas de basalto e fumarolas ---
  function paintMid(g) {
    var r = makeRand(9202);
    var base = LAYER_H;

    g.fillStyle = 'rgba(24,12,18,0.94)';
    g.fillRect(0, base - 60, 2400, 60);

    for (var s = 0; s < 6; s++) {
      var sx = 140 + s * 400 + r() * 120;
      var sw = 54 + r() * 60, sh = 190 + r() * 190;
      g.fillStyle = '#1c1018';
      g.beginPath();
      g.moveTo(sx, base);
      g.lineTo(sx + sw * 0.22, base - sh + 14);
      g.lineTo(sx + sw * 0.5, base - sh);
      g.lineTo(sx + sw * 0.8, base - sh + 22);
      g.lineTo(sx + sw, base);
      g.closePath();
      g.fill();
      // juntas verticais da agulha
      g.fillStyle = 'rgba(6,2,6,0.5)';
      for (var j = 1; j < 4; j++) {
        g.fillRect(sx + (sw / 4) * j, base - sh + 26, 2, sh - 30);
      }
      // pé aceso
      g.fillStyle = 'rgba(255,120,40,0.18)';
      g.fillRect(sx + 4, base - 52, sw - 8, 52);
      g.fillStyle = 'rgba(255,190,110,0.22)';
      g.fillRect(sx + sw * 0.2, base - sh + 14, 3, sh - 20);
    }

    // fumarolas: colunas de vapor subindo entre as agulhas
    for (var f = 0; f < 8; f++) {
      var fx = 90 + f * 300 + r() * 110;
      var fh = 150 + r() * 200;
      g.fillStyle = 'rgba(180,140,140,0.06)';
      for (var b = 0; b < 5; b++) {
        var by = base - 40 - (b / 5) * fh;
        g.beginPath();
        g.ellipse(fx + (r() * 2 - 1) * 22, by, 20 + b * 9 + r() * 14, 16 + b * 6, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    // rachaduras acesas correndo pelo chão da camada
    g.lineCap = 'round';
    for (var k = 0; k < 14; k++) {
      var kx = r() * 2400, ky = base - 8 - r() * 34, kl = 40 + r() * 110;
      g.strokeStyle = 'rgba(255,120,40,0.24)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(kx, ky);
      g.quadraticCurveTo(kx + kl * 0.5, ky + (r() * 2 - 1) * 12, kx + kl, ky + (r() * 2 - 1) * 8);
      g.stroke();
      g.strokeStyle = 'rgba(255,220,150,0.5)';
      g.lineWidth = 1.4;
      g.stroke();
    }
  }

  // --- fumaça entre os patamares: as faixas do bosque, aqui em ocre-vermelho
  // e mais baixas, porque a fumaça do vulcão nasce no chão e sobe ---
  function paintFumaca(g) {
    var r = makeRand(9303);
    var base = LAYER_H;
    var bands = [base - 300, base - 130];
    for (var i = 0; i < bands.length; i++) {
      var by = bands[i], bh = 110 + i * 50;
      var gr = g.createLinearGradient(0, by - bh * 0.5, 0, by + bh * 0.5);
      gr.addColorStop(0, 'rgba(150,70,50,0)');
      gr.addColorStop(0.5, 'rgba(160,74,50,' + (0.16 + i * 0.08).toFixed(2) + ')');
      gr.addColorStop(1, 'rgba(150,70,50,0)');
      g.fillStyle = gr;
      g.fillRect(0, by - bh * 0.5, 1600, bh);
      g.fillStyle = 'rgba(200,110,70,0.09)';
      for (var k = 0; k < 10; k++) {
        g.beginPath();
        g.ellipse(r() * 1600, by + (r() * 2 - 1) * 26, 100 + r() * 200, 22 + r() * 38, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // --- camada próxima: crista de rocha preta com a aresta pegando o clarão ---
  function paintNear(g) {
    var r = makeRand(9404);
    var base = LAYER_H;
    g.fillStyle = '#100a0e';
    g.fillRect(0, base - 78, 2400, 78);

    // blocos de rocha empilhados na crista
    for (var i = 0; i < 20; i++) {
      var bx = i * 122 + r() * 60, by = base - 66 - r() * 44;
      var bw = 60 + r() * 70, bh = 40 + r() * 50;
      g.fillStyle = '#150d13';
      g.beginPath();
      g.moveTo(bx, by + bh);
      g.lineTo(bx + 6, by + 8);
      g.lineTo(bx + bw * 0.45, by);
      g.lineTo(bx + bw - 6, by + 12);
      g.lineTo(bx + bw, by + bh);
      g.closePath();
      g.fill();
      // aresta superior levemente acesa pelo clarão do fundo
      g.strokeStyle = 'rgba(255,130,50,0.16)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(bx + 6, by + 8);
      g.lineTo(bx + bw * 0.45, by);
      g.lineTo(bx + bw - 6, by + 12);
      g.stroke();
    }

    // fissuras acesas entre os blocos
    g.lineCap = 'round';
    for (var k = 0; k < 24; k++) {
      var kx = r() * 2400, ky = base - 6 - r() * 26;
      g.strokeStyle = 'rgba(255,110,35,0.3)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(kx, ky);
      g.lineTo(kx + (r() * 2 - 1) * 26, ky - 12 - r() * 18);
      g.stroke();
      g.strokeStyle = 'rgba(255,200,120,0.5)';
      g.lineWidth = 1.2;
      g.stroke();
    }
  }

  // --- primeiro plano: lascas de obsidiana entrando pela borda de baixo e
  // estalactites de rocha pendendo do alto ---
  function paintFront(g) {
    var r = makeRand(9505);
    var base = LAYER_H;

    g.fillStyle = '#080407';
    for (var i = 0; i < 24; i++) {
      var lx = i * 78 + r() * 44, lh = 60 + r() * 120;
      var lean = (r() * 2 - 1) * 26;
      g.beginPath();
      g.moveTo(lx - 30, base + 12);
      g.lineTo(lx - 8 + lean * 0.4, base - lh * 0.6);
      g.lineTo(lx + lean, base - lh);
      g.lineTo(lx + 12 + lean * 0.4, base - lh * 0.55);
      g.lineTo(lx + 30, base + 12);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#0a0509';
    g.fillRect(0, base - 30, 1800, 30);

    // estalactites do teto de rocha
    for (var s = 0; s < 9; s++) {
      var sx = 90 + s * 210 + r() * 90;
      var sh = 60 + r() * 110, sw = 26 + r() * 26;
      g.fillStyle = '#0a0509';
      g.beginPath();
      g.moveTo(sx - sw / 2, 0);
      g.lineTo(sx + sw / 2, 0);
      g.lineTo(sx + (r() * 2 - 1) * 6, sh);
      g.closePath();
      g.fill();
      // gota de brasa pendurada na ponta
      g.fillStyle = 'rgba(255,140,50,0.35)';
      g.beginPath();
      g.arc(sx, sh - 4, 3.5, 0, Math.PI * 2);
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
  // RESET — o engine chama ao (re)carregar a fase: reacende lumis e ninhos e
  // apaga as faíscas em voo. NÃO se olha FG.engine.lumis para decidir nada: as
  // lumis acumulam entre fases e aquele contador não zera nunca.
  // ---------------------------------------------------------------
  function reset() {
    for (var i = 0; i < lumis.length; i++) lumis[i].taken = false;
    for (var k = 0; k < ninhos.length; k++) ninhos[k].taken = false;
    kit.apagarFaiscas(sparks);
  }

  // ---------------------------------------------------------------
  // UPDATE — coleta de lumis (mecânica do kit) e do ninho com casulo, que é
  // coletável próprio desta fase.
  // ---------------------------------------------------------------
  function update(dt) {
    kit.coletarLumis(lumis, sparks, dt);
    coletarNinhos();
  }

  // O casulo tem raio de coleta maior que o da lumi (38 contra 28): é um alvo
  // gordo e único, e errar de raspão um prêmio de 5 lumis seria mesquinho.
  function coletarNinhos() {
    var p = FG.player;
    var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    for (var i = 0; i < ninhos.length; i++) {
      var n = ninhos[i];
      if (n.taken) continue;
      var dx = n.x - cx, dy = n.y - cy;
      if (dx * dx + dy * dy < 38 * 38) {
        n.taken = true;
        FG.engine.addLumi(5);
        FG.audio.sfx('lumi');
        kit.burst(sparks, n.x, n.y, 22);   // estouro dourado, gordo
      }
    }
  }

  // ---------------------------------------------------------------
  // DRAW BACK — céu, clarão da caldeira, camadas de parallax, fumaça e as
  // brasas em suspensão. Tudo o que sobe, sobe: a fase inteira flui de baixo
  // para cima, ao contrário do bosque, onde a poeira caía.
  // ---------------------------------------------------------------
  function drawBack(ctx, cam) {
    buildAll();
    var t = FG.engine.time;

    ctx.drawImage(skySpr, 0, 0);

    // o clarão acompanha a câmera de leve e mora colado na borda de baixo
    var gx = 480 - cam.x * 0.05;
    var gy = VIEW_H + 60 - cam.y * 0.05;
    ctx.drawImage(glowSpr, gx - 280, gy - 300);

    drawLayer(ctx, farL, 0.2, cam);
    drawLayer(ctx, midL, 0.45, cam);

    // brasas em suspensão — o equivalente dos vagalumes do bosque, mas SOBEM.
    // Posição derivada do índice e do tempo: nenhuma alocação por frame.
    ctx.save();
    for (var i = 0; i < 22; i++) {
      var fx = (((i * 421 + Math.sin(t * 0.4 + i) * 30) - cam.x * 0.55) % 1040 + 1040) % 1040 - 40;
      var sobe = (t * (26 + (i % 5) * 9) + i * 97) % 620;
      var fy = VIEW_H + 30 - sobe + Math.sin(t * 1.4 + i * 1.9) * 14 - cam.y * 0.5;
      var a = 0.15 + 0.35 * (1 - sobe / 620);
      if (a <= 0.05) continue;
      ctx.globalAlpha = a * 0.45;
      ctx.fillStyle = '#ff8a30';
      ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffdca0';
      ctx.beginPath(); ctx.arc(fx, fy, 1.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // fumaça respirando entre os patamares
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.16 * Math.sin(t * 0.3);
    drawLayer(ctx, fumL, 0.6, cam);
    ctx.restore();

    drawLayer(ctx, nearL, 0.7, cam);
  }

  // ---------------------------------------------------------------
  // DRAW SOLIDS — lava, terreno, penhascos, obsidiana, âncoras das correntes,
  // braseiros, ninho, lumis e faíscas (tudo com culling de ~1 tela)
  // ---------------------------------------------------------------
  function drawSolids(ctx, cam) {
    buildAll();
    var t = FG.engine.time;
    var x0 = cam.x - 220, x1 = cam.x + VIEW_W + 220;

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // lava primeiro: ela é o fundo contra o qual as bordas de rocha se recortam
    for (var hi = 0; hi < hazards.length; hi++) {
      var hz = hazards[hi];
      if (hz.t !== 'l' || hz.x > x1 || hz.x + hz.w < x0) continue;
      drawLava(ctx, hz, t);
    }

    // cicatrizes de queimado das zonas de brasa (por baixo das plataformas)
    ctx.save();
    ctx.fillStyle = 'rgba(18,8,10,0.5)';
    for (var qi = 0; qi < queimados.length; qi++) {
      var q = queimados[qi];
      if (q.x > x1 || q.x < x0) continue;
      ctx.beginPath();
      ctx.ellipse(q.x, q.y - 1, q.rx, q.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // plataformas
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.k === 'h' || s.x > x1 || s.x + s.w < x0) continue;
      var d = decor[i];
      if (s.k === 'c') ctx.drawImage(d.spr, s.x + d.ox, s.y + d.oy);
      else if (s.k === 'r') drawRocha(ctx, s, d, t);
      else drawBasalto(ctx, s, d, t);
    }

    // lascas de obsidiana por cima do terreno
    for (var h2 = 0; h2 < hazards.length; h2++) {
      var hz2 = hazards[h2];
      if (hz2.t !== 's' || hz2.x > x1 || hz2.x + hz2.w < x0) continue;
      drawObsidiana(ctx, hz2);
    }

    // âncoras de pedra das correntes (a corda e os pinos de metal vêm do
    // obstacles.js e são desenhados logo depois, por cima destas)
    for (var a = 0; a < ancoras.length; a++) {
      var an = ancoras[a];
      if (an.x > x1 || an.x < x0) continue;
      drawAncora(ctx, an, t);
    }

    // braseiros-checkpoint
    for (var c = 0; c < checkpoints.length; c++) {
      var cp = checkpoints[c];
      if (cp.x > x1 || cp.x < x0) continue;
      drawBraseiro(ctx, cp, FG.engine.checkpoint.x === cp.x, t);
    }

    // ninho com casulo
    for (var n = 0; n < ninhos.length; n++) {
      var nn = ninhos[n];
      if (nn.taken || nn.x > x1 || nn.x < x0) continue;
      drawNinho(ctx, nn, t);
    }

    // lumis e faíscas de coleta (ctx já está no espaço do mundo)
    kit.desenharLumis(ctx, cam, lumis, lumiSpr, t);
    kit.desenharFaiscas(ctx, sparks);

    ctx.restore();
  }

  // --- chão de basalto ('g'): crosta fria em cima, corpo preto, veios acesos
  // e uma faixa de brilho DEBAIXO da aresta. É a regra de luz da fase inteira
  // resumida numa plataforma. ---
  function drawBasalto(ctx, s, d, t) {
    ctx.fillStyle = '#1b1218';
    ctx.fillRect(s.x, s.y, s.w, s.h);

    // corpo avermelhando para o fundo (a rocha está quente por dentro)
    ctx.fillStyle = 'rgba(90,26,18,0.5)';
    ctx.fillRect(s.x, s.y + s.h * 0.45, s.w, s.h * 0.55);

    veios(ctx, s, d, t);

    // crosta cinza no topo — a única coisa fria da paleta, e é o que faz a
    // silhueta do chão ler contra o céu vermelho
    ctx.fillStyle = '#332d38';
    ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, 12);
    ctx.fillStyle = '#4b4455';
    ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, 5);
    ctx.fillStyle = 'rgba(12,6,10,0.85)';
    ctx.fillRect(s.x - 2, s.y + 9, s.w + 4, 3);
    dentes(ctx, s, d);

    // brasa escorrendo pela borda: fio quente logo abaixo da crosta
    ctx.fillStyle = 'rgba(255,120,40,0.30)';
    ctx.fillRect(s.x, s.y + 12, s.w, 2.5);
    // e o glow derramado para baixo, a partir da aresta
    ctx.drawImage(glowDown, s.x, s.y + 12, s.w, Math.min(70, s.h));
  }

  // --- bloco de rocha solta ('r') ---
  function drawRocha(ctx, s, d, t) {
    ctx.fillStyle = '#1d1420';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + s.h);
    ctx.lineTo(s.x + 3, s.y + 5);
    ctx.lineTo(s.x + s.w * 0.4, s.y - 3);
    ctx.lineTo(s.x + s.w - 4, s.y + 6);
    ctx.lineTo(s.x + s.w, s.y + s.h);
    ctx.closePath();
    ctx.fill();

    veios(ctx, s, d, t);

    ctx.fillStyle = '#3a3442';
    ctx.fillRect(s.x + 2, s.y, s.w - 4, 5);
    ctx.fillStyle = 'rgba(80,74,92,0.7)';
    ctx.fillRect(s.x + 2, s.y, s.w - 4, 2);
    dentes(ctx, s, d);

    // a barriga do bloco pega a luz da lava
    ctx.fillStyle = 'rgba(255,120,40,0.18)';
    ctx.fillRect(s.x + 2, s.y + s.h - 5, s.w - 4, 5);
    ctx.drawImage(glowDown, s.x, s.y + s.h - 4, s.w, 44);
  }

  // veios de brasa pulsando na face da rocha (pré-computados no decor)
  function veios(ctx, s, d, t) {
    ctx.save();
    ctx.lineCap = 'round';
    for (var i = 0; i < d.veios.length; i++) {
      var v = d.veios[i];
      var puls = 0.55 + 0.45 * Math.sin(t * 1.6 + v.ph);
      var bx = s.x + v.x, by = s.y + v.y;
      ctx.globalAlpha = 0.22 + 0.2 * puls;
      ctx.strokeStyle = '#ff7a26';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + v.bend * 0.5, by + v.len * 0.5, bx + v.bend, by + v.len);
      ctx.stroke();
      ctx.globalAlpha = 0.45 + 0.4 * puls;
      ctx.strokeStyle = '#ffd08a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  // serrilha da aresta de cima: a rocha quebrou, não foi cortada
  function dentes(ctx, s, d) {
    ctx.fillStyle = '#2a2431';
    for (var i = 0; i < d.dentes.length; i++) {
      var dt2 = d.dentes[i];
      var bx = s.x + dt2.dx;
      ctx.beginPath();
      ctx.moveTo(bx, s.y);
      ctx.lineTo(bx + dt2.w * 0.5, s.y - dt2.h);
      ctx.lineTo(bx + dt2.w, s.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- lava: superfície viva com crosta escura à deriva e glow para cima ---
  function drawLava(ctx, hz, t) {
    var bot = hz.y + hz.h + 46;

    // poço
    ctx.fillStyle = '#8c1c06';
    ctx.fillRect(hz.x, hz.y, hz.w, bot - hz.y);
    ctx.fillStyle = '#e04a10';
    ctx.fillRect(hz.x, hz.y, hz.w, 16);
    ctx.fillStyle = '#ffb040';
    ctx.fillRect(hz.x, hz.y + 1, hz.w, 5);

    // crosta escura à deriva: placas que andam devagar para a direita e
    // reentram pelo começo — a lava tem de parecer que corre, não que ferve
    ctx.save();
    ctx.fillStyle = 'rgba(30,12,12,0.72)';
    var np = Math.max(2, Math.floor(hz.w / 90));
    for (var i = 0; i < np; i++) {
      var pw = 40 + (i % 4) * 16;
      var px = hz.x + (((i * 137 + t * 16) % (hz.w + pw)) - pw / 2);
      if (px + pw < hz.x || px > hz.x + hz.w) continue;
      ctx.beginPath();
      ctx.ellipse(px, hz.y + 8 + (i % 3) * 3, pw / 2, 5 + (i % 3), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ondulação da superfície
    ctx.save();
    ctx.strokeStyle = '#ffdc86';
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(hz.x, hz.y + Math.sin(t * 1.6 + hz.x * 0.04) * 2);
    for (var x = hz.x + 20; x <= hz.x + hz.w; x += 20) {
      ctx.lineTo(x, hz.y + Math.sin(t * 1.6 + x * 0.04) * 2.6);
    }
    ctx.stroke();
    ctx.restore();

    // bolhas de gás estourando
    ctx.save();
    ctx.fillStyle = '#ffe6a8';
    var nb = Math.max(2, Math.floor(hz.w / 90));
    for (var b = 0; b < nb; b++) {
      var bx = hz.x + 16 + (b * 97) % Math.max(1, hz.w - 32);
      var per = (t * 0.5 + b * 0.29) % 1;
      ctx.globalAlpha = 0.7 * (1 - per);
      ctx.beginPath();
      ctx.arc(bx, hz.y + 6 - per * 12, 2 + (b % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // o glow que sobe da lava: a fonte de luz da fase, esticada com drawImage
    // (nada de criar gradiente por frame)
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.2 * Math.sin(t * 0.9 + hz.x * 0.01);
    ctx.drawImage(glowUp, hz.x, hz.y - 150, hz.w, 152);
    ctx.restore();
  }

  // --- lascas de obsidiana (o "espinho" desta fase): vidro preto com aresta
  // acesa por dentro ---
  function drawObsidiana(ctx, hz) {
    var n = Math.max(3, Math.round(hz.w / 16));
    var sw = hz.w / n;
    ctx.fillStyle = '#100a12';
    ctx.fillRect(hz.x, hz.y + hz.h - 5, hz.w, 5);
    for (var i = 0; i < n; i++) {
      var bx = hz.x + i * sw;
      ctx.fillStyle = '#241c2c';
      ctx.beginPath();
      ctx.moveTo(bx, hz.y + hz.h);
      ctx.lineTo(bx + sw / 2, hz.y);
      ctx.lineTo(bx + sw, hz.y + hz.h);
      ctx.closePath();
      ctx.fill();
      // face esquerda com o reflexo do clarão, direita quase preta
      ctx.fillStyle = 'rgba(255,140,60,0.35)';
      ctx.beginPath();
      ctx.moveTo(bx + sw / 2, hz.y);
      ctx.lineTo(bx + sw * 0.5, hz.y + hz.h);
      ctx.lineTo(bx + sw * 0.22, hz.y + hz.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(8,4,10,0.7)';
      ctx.beginPath();
      ctx.moveTo(bx + sw / 2, hz.y);
      ctx.lineTo(bx + sw, hz.y + hz.h);
      ctx.lineTo(bx + sw * 0.62, hz.y + hz.h);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- âncora de pedra das correntes: bloco de basalto cravado com argola.
  // `lado` diz para que lado a corrente sai, e é ele que orienta a mísula. ---
  function drawAncora(ctx, a, t) {
    var x = a.x, y = a.y;
    // bloco
    ctx.fillStyle = '#211722';
    ctx.beginPath();
    ctx.moveTo(x - a.lado * 30, y - 20);
    ctx.lineTo(x + a.lado * 12, y - 24);
    ctx.lineTo(x + a.lado * 14, y + 16);
    ctx.lineTo(x - a.lado * 32, y + 22);
    ctx.closePath();
    ctx.fill();
    // aresta de cima fria, barriga acesa
    ctx.fillStyle = 'rgba(90,84,102,0.6)';
    ctx.fillRect(x - a.lado * 30 - (a.lado > 0 ? 0 : 12), y - 24, 42, 3);
    ctx.fillStyle = 'rgba(255,120,40,0.22)';
    ctx.beginPath();
    ctx.moveTo(x - a.lado * 32, y + 22);
    ctx.lineTo(x + a.lado * 14, y + 16);
    ctx.lineTo(x + a.lado * 14, y + 10);
    ctx.lineTo(x - a.lado * 32, y + 15);
    ctx.closePath();
    ctx.fill();
    // argola de ferro onde a corrente morde
    ctx.strokeStyle = '#4b4652';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,150,70,0.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y + 1, 8, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    // cravo
    ctx.fillStyle = '#6a6474';
    ctx.beginPath();
    ctx.arc(x - a.lado * 14, y - 4, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- braseiro-checkpoint: tripé de ferro com uma taça de brasa. Aceso é o
  // checkpoint atual; apagado é carvão frio. ---
  function drawBraseiro(ctx, cp, aceso, t) {
    var x = cp.x, y = cp.y;
    ctx.strokeStyle = '#3a3440';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 12, y); ctx.lineTo(x - 3, y - 46);
    ctx.moveTo(x + 12, y); ctx.lineTo(x + 3, y - 46);
    ctx.moveTo(x, y); ctx.lineTo(x, y - 46);
    ctx.stroke();

    // taça
    ctx.fillStyle = '#2b2530';
    ctx.beginPath();
    ctx.moveTo(x - 17, y - 62);
    ctx.lineTo(x + 17, y - 62);
    ctx.lineTo(x + 11, y - 44);
    ctx.lineTo(x - 11, y - 44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#453e4d';
    ctx.fillRect(x - 18, y - 64, 36, 4);

    if (aceso) {
      var fl = 0.8 + 0.2 * Math.sin(t * 9 + Math.sin(t * 5.1));
      ctx.save();
      ctx.shadowColor = '#ff7a20';
      ctx.shadowBlur = 26 * fl;
      ctx.fillStyle = '#ff9a30';
      ctx.beginPath();
      ctx.ellipse(x, y - 64, 13, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // labareda
      ctx.fillStyle = '#ffc65a';
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 64);
      ctx.quadraticCurveTo(x - 4, y - 76 * fl - 6, x, y - 88 * fl);
      ctx.quadraticCurveTo(x + 5, y - 76 * fl - 4, x + 8, y - 64);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff2c0';
      ctx.beginPath();
      ctx.ellipse(x, y - 70 - 6 * fl, 3.4, 7 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#171219';
      ctx.beginPath();
      ctx.ellipse(x, y - 63, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,110,40,0.18)';
      ctx.beginPath();
      ctx.arc(x - 3, y - 63, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- ninho com casulo: cama de gravetos carbonizados e um casulo
  // verde-azulado. É a única coisa fria e viva da encosta, e é de propósito:
  // contra o vermelho de tudo, ele se acha sozinho. ---
  function drawNinho(ctx, n, t) {
    var x = n.x, y = n.y;
    var bob = Math.sin(t * 1.6) * 2.5;

    // halo
    ctx.save();
    ctx.globalAlpha = 0.2 + 0.12 * Math.sin(t * 2.2);
    ctx.fillStyle = '#4fe0d0';
    ctx.beginPath();
    ctx.arc(x, y + bob, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // gravetos carbonizados
    ctx.strokeStyle = '#2a1f20';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * Math.PI + 0.15;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * 30, y + 30 - Math.sin(a) * 5);
      ctx.quadraticCurveTo(x, y + 38, x + Math.cos(a) * 30, y + 30 - Math.sin(a) * 5);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,120,40,0.3)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 28, y + 32);
    ctx.quadraticCurveTo(x, y + 40, x + 28, y + 32);
    ctx.stroke();

    // casulo
    ctx.fillStyle = '#1c5c58';
    ctx.beginPath();
    ctx.ellipse(x, y + bob, 13, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3fb9a8';
    ctx.beginPath();
    ctx.ellipse(x - 2, y + bob - 2, 9, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(220,255,250,0.8)';
    ctx.beginPath();
    ctx.ellipse(x - 4, y + bob - 6, 3, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // costura de seda
    ctx.strokeStyle = 'rgba(210,255,250,0.5)';
    ctx.lineWidth = 1.2;
    for (var k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(x - 12, y + bob + k * 7);
      ctx.quadraticCurveTo(x, y + bob + k * 7 + 3, x + 12, y + bob + k * 7);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------
  // DRAW FRONT — as correntes de ferro por cima da corda, o primeiro plano de
  // obsidiana e a vinheta.
  // ---------------------------------------------------------------
  function drawFront(ctx, cam) {
    buildAll();
    drawCorrentes(ctx, cam);
    drawLayer(ctx, frontL, 1.15, cam);
    ctx.drawImage(vig, 0, 0);
  }

  // As correntes: o obstacles.js desenha uma CORDA (é o mesmo obstáculo do
  // pântano), e no vulcão isso não existe — corda de sisal sobre lava aberta
  // seria pior que o cipó. Então elo por elo por cima dela, a partir dos
  // pontos que o próprio obstáculo já calculou (o.pts). Os elos junto da mão
  // do jogador são pulados quando ele está pendurado: assim a luva fica por
  // cima da corrente, que é o que a leitura pede.
  function drawCorrentes(ctx, cam) {
    var obs = FG.obstacles;
    if (!obs) return;
    var list = obs.list;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.type !== 'cipo' || !o.pts || o.pts.length < 2) continue;
      var bx = Math.min(o.x1, o.x2) - 30, by = Math.min(o.y1, o.y2) - 30;
      var bw = Math.abs(o.x2 - o.x1) + 60;
      var bh = Math.abs(o.y2 - o.y1) + o.sag + 90;
      if (!kit.visible(cam, bx, by, bw, bh)) continue;

      var n = o.pts.length - 1;
      ctx.save();
      for (var k = 0; k < n; k++) {
        if (o.held && Math.abs(k / n - o.t) < 0.055) continue;
        var a = o.pts[k], b = o.pts[k + 1];
        var mx = (a.x + b.x) * 0.5 - cam.x;
        var my = (a.y + b.y) * 0.5 - cam.y;
        var ang = Math.atan2(b.y - a.y, b.x - a.x);
        var lado = (k & 1) === 0;
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(ang);
        // elo: elipse deitada; os ímpares "de perfil" (mais finos), para a
        // corrente ler como elos entrelaçados e não como conta de colar
        ctx.strokeStyle = '#3a3540';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.ellipse(0, 0, 7.5, lado ? 5.2 : 2.4, 0, 0, Math.PI * 2);
        ctx.stroke();
        // a luz vem de baixo: o brilho do elo é na barriga, não no dorso
        ctx.strokeStyle = 'rgba(255,150,70,0.5)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(0, 0.6, 7, lado ? 4.8 : 2.1, 0, Math.PI * 0.12, Math.PI * 0.88);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------
  // API pública — a fase entra no registro na ordem em que o index.html
  // carrega os level*.js. Este arquivo não força índice nenhum e não depende
  // de level2.js existir: se ele não estiver lá, esta vira a fase 1.
  // Quem publica FG.level (a fase corrente) é o engine.
  // ---------------------------------------------------------------
  FG.levels = FG.levels || [];
  FG.levels.push({
    id: 'vulcao',
    nome: 'A Encosta do Vulcão',
    W: W,
    H: H,
    playerStart: { x: 80, y: 560 },
    solids: solids,
    hazards: hazards,
    checkpoints: checkpoints,
    enemyDefs: enemyDefs,
    obstacleDefs: obstacleDefs,
    ninhos: ninhos,
    bossId: 'magma',
    bossTriggerX: 6350,
    arena: { x: 6200, w: 1000 },
    reset: reset,
    update: update,
    drawBack: drawBack,
    drawSolids: drawSolids,
    drawFront: drawFront,
  });
})();
