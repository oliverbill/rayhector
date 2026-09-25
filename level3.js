// Fagulho: Lendas do Bosque — level3.js
// Fase 3, 'mansao': A Mansão Assombrada. Geometria, lumis, checkpoints,
// inimigos, obstáculos (defs), o ninho do topo da "chaminé" (agora a torre
// da mansão) e todo o visual de fachada gótica, névoa fria e céu de lua cheia.
// A GEOMETRIA (solids/hazards/checkpoints/enemyDefs/obstacleDefs/lumis) é a
// MESMA da antiga "A Encosta do Vulcão": só o retema visual mudou — o que
// era lava vira poço negro/sangue estagnado, o que era espinho de obsidiana
// vira grade de ferro, e por aí adiante. Nenhuma coordenada foi tocada.
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
  // GEOMETRIA — sólidos (coordenadas intocadas: só o desenho abaixo mudou de
  // vulcão para mansão gótica)
  // k: 'g' = chão de cemitério (crosta fria por cima, veios de musgo/luar por
  //    baixo), 'r' = bloco de lápide solta, 'c' = fachada escalável (muro de
  //    pedra com hera morta), 'h' = piso oculto (fundo do poço negro, não é
  //    desenhado).
  //
  // RITMO EM 6 TRECHOS
  //  (1) x 0..1020     O JARDIM DE ENTRADA: pedra em degraus, seguro, e UMA
  //                    zona de fenda sombria isolada e lentíssima (period
  //                    3.8, ainda `type: 'brasa'` no código) — o jogador
  //                    aprende a ler a mancha no chão antes da rajada.
  //  (2) x 1020..2320  O CAMPO DE LÁPIDES: três zonas alternadas com abrigos
  //                    de pedra. O ritmo é esperar a rajada e correr; as
  //                    zonas são dessincronizadas por `phase` para nunca
  //                    virarem um metrônomo só.
  //  (3) x 2320..3520  O FOSSO NEGRO: o chão vira `hazard` (água estagnada
  //                    refletindo a lua) e a travessia é de disco em disco,
  //                    com duas colunas de vento gélido dando altura. Quem
  //                    cai não morre: há piso no fundo e dois afloramentos de
  //                    pedra para se recompor.
  //  (4) x 3520..4800  A TORRE DA MANSÃO: fenda de 70px entre o pilar e a
  //                    fachada (450px de parede vertical), com névoa/energia
  //                    sombria caindo pelo vão — subir tem de ser no
  //                    intervalo. Prêmio no topo: o relicário com o casulo.
  //                    Depois, a descida em degraus até a borda do pátio dos
  //                    fundos, com o talude embaixo servindo de rede (e
  //                    cobrando outra zona de fenda).
  //  (5) x 4800..5660  AS CORRENTES SOBRE O PÁTIO: duas correntes de ferro
  //                    ancoradas em três blocos — contraforte, pináculo
  //                    central e contraforte — com um disco de descanso em
  //                    cada poço. Cair custa caro (o fosso negro), mas todo
  //                    poço é rente a uma face escalável: dá sempre para
  //                    voltar.
  //  (6) x 5660..7200  O PÁTIO DO CHEFÃO: reta com rolo e a última rajada
  //                    antes da arena de Patriçola Drácula.
  //
  // Nada de beco sem saída: do fundo do fosso negro sai-se pela margem
  // direita (degrau de 70px); dos poços do pátio, escalando o pináculo
  // (280px) ou os contrafortes (400px e 470px).
  //
  // Alturas: pulo simples sobe ~118px, duplo ~236px, e uma parede vertical
  // contínua sobe indefinidamente agarrando (~120px por salto de parede).
  // ---------------------------------------------------------------
  var solids = [
    // ---- (1) o jardim de entrada — degraus curtos de pedra, nada de perigo até x=800 ----
    S(0, 620, 1020, 100, 'g'),        // [0] chão do jardim
    S(250, 580, 96, 40, 'r'),         // [1] +40
    S(410, 536, 110, 84, 'r'),        // [2] +44
    S(590, 488, 120, 24, 'r'),        // [3] +48

    // ---- (2) o campo de lápides — chão corrido, abrigos suspensos ----
    // As saliências ficam a 130..140px do chão: um pulo duplo folgado. São o
    // prêmio de quem espera a rajada em vez de correr no susto.
    S(1020, 620, 1300, 100, 'g'),     // [4] chão do campo 1020..2320
    S(1330, 480, 120, 26, 'r'),       // [5] abrigo A (+140)
    S(1720, 486, 130, 26, 'r'),       // [6] abrigo B (+134)
    S(2130, 490, 120, 26, 'r'),       // [7] abrigo C (+130)

    // ---- (3) o fosso negro — piso oculto no fundo e dois afloramentos ----
    // O piso oculto não é misericórdia gratuita: é o que impede o beco sem
    // saída. Quem cai anda para a direita tomando 1 de dano a cada 1.2s e sobe
    // 70px na margem. Os afloramentos são estreitos de propósito (70px, vãos
    // de 320..430px): servem para se recompor, não como rota alternativa.
    S(2320, 690, 1200, 30, 'h'),      // [8] fundo do fosso 2320..3520
    S(2530, 596, 70, 94, 'r'),        // [9] afloramento 1
    S(3020, 584, 70, 106, 'r'),       // [10] afloramento 2
    S(3520, 620, 300, 100, 'g'),      // [11] margem direita / base da torre

    // ---- (4) a torre da mansão ----
    // O chão da base passa por baixo do arco do pilar (70px de vão) e morre
    // dentro da fenda de 70px. Dali só se sai por cima: agarrar e saltar de
    // face em face, de 620 até 170 — 450px de parede vertical contínua, com a
    // cortina de névoa/energia sombria caindo pelo meio.
    S(3660, 170, 90, 380, 'c'),       // [12] pilar (arco de 70px por baixo)
    S(3820, 170, 480, 550, 'c'),      // [13] fachada da torre + platô superior
    S(4300, 620, 500, 100, 'g'),      // [14] talude ao pé do platô 4300..4800
    S(4340, 296, 130, 24, 'r'),       // [15] descida: degrau 1 (-126 do platô)
    S(4520, 396, 120, 24, 'r'),       // [16] degrau 2 (-100)
    S(4690, 486, 110, 24, 'r'),       // [17] degrau 3 (-90)

    // ---- (5) as correntes sobre o pátio dos fundos ----
    // TRÊS blocos seguram as duas correntes, e é por isso que elas existem:
    // corrente de ferro precisa de pedra onde morder. Os pinos ficam cravados
    // nas FACES (nunca no topo), senão o jogador pendurado junto ao pino fica
    // com o corpo dentro da rocha — o contrato do cipó pede sag+13+60px livres
    // abaixo da reta dos pinos, e sobre o topo de uma plataforma isso é zero.
    // O contraforte esquerdo é o trampolim (220px de parede a partir da borda);
    // o pináculo central é o descanso do meio; o contraforte direito é a saída.
    // O fundo do pátio é partido em dois poços, cada um rente a duas faces:
    // quem cai escala 280px (pináculo) ou 400px (contrafortes) e volta.
    S(4800, 520, 80, 200, 'g'),       // [18] borda do pátio
    S(4880, 300, 80, 420, 'c'),       // [19] contraforte esquerdo (âncora da corrente 1)
    S(4960, 700, 180, 20, 'h'),       // [20] fundo do pátio, poço oeste 4960..5140
    S(5140, 470, 80, 250, 'c'),       // [21] pináculo central: descanso e âncora do meio
    S(5220, 700, 340, 20, 'h'),       // [22] fundo do pátio, poço leste 5220..5560
    // O topo do contraforte direito está a 240px acima do pináculo — 4px acima
    // do pulo duplo (236). É de propósito: com 170px de desnível um perito
    // fechava o vão de 340px planando e pulava a corrente 2 inteira, que é
    // justamente a prova do trecho. Agora a única entrada aérea é soltar a
    // corrente com ESPAÇO, que sobe 93px a partir do pino.
    S(5560, 230, 100, 490, 'c'),      // [23] contraforte direito (âncora da corrente 2)

    // ---- (6) o pátio do chefão ----
    S(5660, 620, 1540, 100, 'g'),     // [24] pátio 5660..7200
    S(5740, 540, 120, 24, 'r'),       // [25] (+80)
    S(5880, 496, 110, 22, 'r'),       // [26] (+44 do anterior)
  ];

  // ---------------------------------------------------------------
  // HAZARDS — t: 'l' = poço negro (era lava; só a pintura mudou), 's' = grade
  // de ferro pontuda (era lasca de obsidiana)
  // A superfície do poço negro fica a 650 (fosso) e 656 (pátio): quem está de
  // pé no piso oculto (690 / 700) fica com o corpo dentro dele, quem está no
  // topo de um afloramento (596 / 584) não encosta.
  // ---------------------------------------------------------------
  function Hz(x, y, w, h, t) { return { x: x, y: y, w: w, h: h, t: t }; }

  var hazards = [
    Hz(1560, 596, 90, 24, 's'),    // grade de ferro no meio do campo de lápides
    Hz(2160, 596, 90, 24, 's'),    // última mordida antes do fosso
    Hz(2320, 650, 210, 34, 'l'),   // fosso negro — trecho 1
    Hz(2600, 650, 420, 34, 'l'),   // fosso negro — trecho 2
    Hz(3090, 650, 430, 34, 'l'),   // fosso negro — trecho 3
    Hz(4420, 596, 110, 24, 's'),   // talude: a rota fácil também cobra
    Hz(4640, 596, 100, 24, 's'),
    Hz(4960, 656, 180, 34, 'l'),   // pátio: poço oeste, sob a corrente 1
    Hz(5220, 656, 340, 34, 'l'),   // pátio: poço leste, sob a corrente 2
    Hz(5890, 596, 90, 24, 's'),    // pátio do chefão
  ];

  // 4 velas-checkpoint (acendem quando ativadas)
  var checkpoints = [
    { x: 1050, y: 620 },   // entrada do campo de lápides
    { x: 3560, y: 620 },   // base da torre
    { x: 3880, y: 170 },   // topo da torre — o mais caro de todos
    { x: 5720, y: 620 },   // entrada do pátio do chefão
  ];

  // ---------------------------------------------------------------
  // RELICÁRIO COM CASULO — 5 lumis de uma vez. Um só, no topo da torre: é o
  // prêmio dos 450px de escalada com névoa sombria caindo na cabeça, e fica
  // logo na saída da fenda para não obrigar a um segundo desvio.
  // ---------------------------------------------------------------
  var ninhos = [
    { x: 3900, y: 138, taken: false },
  ];

  // ---------------------------------------------------------------
  // INIMIGOS — voadeira e espinhoco carregam a fase: névoa sombria cai de
  // cima, então ameaça aérea combina e ameaça rasteira obriga a parar no
  // lugar errado. NENHUM `peixe`: ele é a assinatura do pântano e é desenhado
  // no enemies.js como bicho aquático (turquesa, rastro de bolhas). Sobre o
  // poço negro isso não se lê como fauna da mansão, lê-se como bug — e o
  // desenho dele não é deste arquivo para eu repaginar. Sobre o fosso entra
  // voadeira (aqui lida como morcego).
  //
  // A ESSES SOMAM-SE os três bichos próprios da mansão (lobo, fantasma,
  // ratazana — em enemies.js), espalhados um a dois por trecho, NUNCA
  // empilhados no começo: lobo e ratazana são rasteiros com range curto o
  // bastante para não saírem do piso real de cada trecho; fantasma não tem
  // gravidade, então entra livremente sobre o fosso e as correntes, onde os
  // outros dois não caberiam.
  // ---------------------------------------------------------------
  var enemyDefs = [
    { type: 'espinhoco', x: 700, y: 594, range: 80 },    // sopé, antes da 1ª brasa
    { type: 'voadeira',  x: 1180, y: 500, range: 120 },
    { type: 'ratazana',  x: 1260, y: 588, range: 110 },  // campo de lápides: rasteira robusta
    { type: 'espinhoco', x: 1390, y: 594, range: 100 },
    { type: 'voadeira',  x: 1600, y: 470, range: 140 },
    { type: 'sapeca',    x: 1790, y: 588, range: 70 },
    { type: 'voadeira',  x: 2040, y: 480, range: 150 },
    { type: 'espinhoco', x: 2280, y: 594, range: 80 },
    { type: 'lobo',      x: 2180, y: 590, range: 120 },  // fim do campo: caçada antes do fosso
    { type: 'fantasma',  x: 2750, y: 340, range: 220 },  // sobre o fosso negro: só ele voa livre ali
    { type: 'voadeira',  x: 2860, y: 430, range: 190 },  // sobre o rio de lava
    { type: 'voadeira',  x: 3200, y: 420, range: 160 },
    { type: 'voadeira',  x: 3900, y: 90, range: 130 },   // sobre o platô
    { type: 'espinhoco', x: 4180, y: 144, range: 90 },   // platô (topo em 170)
    { type: 'voadeira',  x: 4560, y: 330, range: 120 },  // na descida
    { type: 'ratazana',  x: 4400, y: 588, range: 70 },   // talude: antes da 2ª rajada
    { type: 'sapeca',    x: 4700, y: 588, range: 80 },   // talude
    { type: 'fantasma',  x: 4900, y: 380, range: 170 },  // pátio dos fundos: sobre a corrente 1
    { type: 'voadeira',  x: 5200, y: 380, range: 170 },  // sobre a caldeira
    { type: 'fantasma',  x: 5300, y: 380, range: 170 },  // pátio dos fundos: sobre o poço leste
    { type: 'voadeira',  x: 5450, y: 400, range: 150 },
    { type: 'espinhoco', x: 5820, y: 594, range: 90 },
    { type: 'sapeca',    x: 6060, y: 588, range: 70 },
    { type: 'lobo',      x: 5980, y: 590, range: 150 },  // pátio do chefão: última caçada
  ];

  // ---------------------------------------------------------------
  // OBSTÁCULOS DINÂMICOS (FG.obstacles lê daqui)
  // Os NOMES DE TIPO abaixo são os mesmos do obstacles.js compartilhado
  // (ex.: 'brasa', 'espinhorolo') e não podem mudar — só o desenho de cada um
  // foi repintado (o motor que anima cada `type` é genérico às três fases).
  // Convenções de coordenada usadas aqui:
  //   brasa       {x,y,w,h,period,phase} — (x,y) = canto superior esquerdo da
  //               zona; aqui pintada como fenda de energia sombria: nasce
  //               logo acima de y e ESTOURA em y+h, que por isso tem de
  //               coincidir com o piso real. `phase` em SEGUNDOS de
  //               adiantamento no ciclo (0.8s de aviso, 1.1s de rajada, o
  //               resto de descanso).
  //   disco       {x,y,w,bob,period,phase} — (x,y) = canto superior esquerdo na
  //               posição MÉDIA; altura sólida fixa de 18px; `phase` em RADIANOS.
  //   cipo        {x1,y1,x2,y2,sag} — pinos das duas pontas; `sag` é a barriga.
  //               Precisa de sag+13+60px livres abaixo da reta dos pinos.
  //   sopro       {x,y,w,h} — retângulo da coluna de vento gélido (y = topo).
  //   pendulo     {x,y,len,arc,period} — (x,y) = ponto de fixação da corrente.
  //   espinhorolo {x,y,w,range,speed} — y = TOPO do rolo (a base fica em y+w).
  //   trovao      {x,w,groundY,interval,jitter} — (x,w) = faixa onde o raio
  //               pode cair (ponto exato sorteado a cada disparo); groundY é
  //               onde ele estoura (mesma regra da brasa: tem de ser piso
  //               real). Não é sólido, não machuca à distância — só perto do
  //               ponto de impacto — e sacode a câmera inteira ao cair.
  //
  // TODAS as zonas de fenda abaixo fecham em piso real:
  //   620 (chão do jardim, do campo, da base da torre, do talude e do pátio)
  //   e 170 (topo da fachada). Fenda que estoura no ar não se lê.
  // ---------------------------------------------------------------
  var obstacleDefs = [
    // (1) jardim de entrada: uma zona só, larga e lenta. Period 3.8 dá quase
    // 2s de descanso entre rajadas — tempo de sobra para ver a mancha acender
    // e recuar.
    { type: 'brasa', x: 800, y: 400, w: 200, h: 220, period: 3.8, phase: 0 },

    // (2) campo de lápides: três zonas com abrigo entre elas. As fases (0,
    // 1.5, 0.8) e os períodos diferentes garantem que duas vizinhas nunca
    // disparem juntas — atravessar é sempre possível, mas nunca no mesmo compasso.
    { type: 'brasa', x: 1080, y: 400, w: 240, h: 220, period: 3.0, phase: 0 },
    { type: 'brasa', x: 1470, y: 400, w: 250, h: 220, period: 3.0, phase: 1.5 },
    { type: 'brasa', x: 1860, y: 400, w: 260, h: 220, period: 2.6, phase: 0.8 },
    // A bola varre o abrigo A: descansar debaixo dela tem preço, e a saída é
    // pelas pontas da saliência, onde o arco já subiu.
    { type: 'pendulo', x: 1395, y: 250, len: 180, arc: 0.9, period: 2.7 },
    // O rolo mora no ÚLTIMO abrigo: quando ele aparece, o jogador já sabe ler
    // a fenda e pode ter duas coisas na cabeça ao mesmo tempo.
    { type: 'espinhorolo', x: 2150, y: 576, w: 44, range: 110, speed: 135 },

    // (3) fosso negro: cinco discos com vãos de 100..140px (pulo simples
    // sobra), alturas alternadas para o ritmo não virar escada, e dois sopros
    // de vento gélido nos vãos maiores, que também abrem as colunas de lumi
    // lá em cima.
    { type: 'disco', x: 2400, y: 520, w: 120, bob: 12, period: 3.0, phase: 0 },
    { type: 'disco', x: 2660, y: 486, w: 110, bob: 14, period: 3.4, phase: 1.1 },
    { type: 'sopro', x: 2800, y: 300, w: 90, h: 350 },
    { type: 'disco', x: 2900, y: 500, w: 110, bob: 12, period: 2.8, phase: 2.5 },
    { type: 'disco', x: 3140, y: 470, w: 120, bob: 16, period: 3.6, phase: 0.7 },
    { type: 'sopro', x: 3270, y: 280, w: 80, h: 370 },
    { type: 'disco', x: 3360, y: 510, w: 110, bob: 10, period: 3.0, phase: 1.9 },

    // (4) torre: a cortina de névoa/energia sombria desce a fenda inteira
    // (200..620). Zona de 70px de largura = 3 colunas e a taxa mínima (8/s):
    // é uma cortina fina e legível, não uma parede impossível. Period 3.2
    // deixa ~1.3s de descanso — dois saltos de parede por intervalo, que é o
    // que a subida pede.
    { type: 'brasa', x: 3750, y: 200, w: 70, h: 420, period: 3.2, phase: 0 },
    // No platô a névoa cai do céu noturno (y=0) e estoura na pedra (170).
    { type: 'brasa', x: 4040, y: 0, w: 220, h: 170, period: 3.0, phase: 1.4 },
    // O talude é a rota fácil da descida — e cobra a sua própria rajada.
    { type: 'brasa', x: 4380, y: 400, w: 220, h: 220, period: 3.4, phase: 2.1 },

    // (5) correntes sobre o pátio dos fundos. Cada corrente DESCE do bloco
    // alto para o baixo e a seguinte volta a subir: é o zigue-zague que dá o
    // ritmo de "solta no alto, cai, agarra de novo". Os quatro pinos estão
    // cravados em face de pedra (contraforte 4960, pináculo 5180 e 5270,
    // contraforte 5560), com 210..300px livres abaixo da reta — bem acima dos
    // sag+73 exigidos. Soltar com ESPAÇO sobe 93px, e as duas correntes
    // terminam diferente de propósito: a 1 põe o jogador limpo em cima do
    // pináculo (precisa de 77 dos 93), a 2 o encosta na parede do contraforte
    // e os últimos palmos são um salto de parede — a mesma escalada da torre
    // cobrada de novo, agora com o poço negro embaixo. Chegar arrastado até a
    // ponta não sobe nada: aí ele cai no poço e volta escalando, que é o
    // preço combinado.
    { type: 'cipo', x1: 4964, y1: 330, x2: 5136, y2: 490, sag: 66 },
    { type: 'disco', x: 4990, y: 570, w: 110, bob: 9, period: 3.0, phase: 0.4 },
    { type: 'cipo', x1: 5224, y1: 490, x2: 5556, y2: 270, sag: 76 },
    // Vento gélido subindo do poço leste: é o poço mais largo e o de parede
    // mais alta, então é ali que quem cai precisa de ajuda para voltar.
    { type: 'sopro', x: 5240, y: 420, w: 80, h: 240 },
    // Os discos de descanso ficam BAIXOS de propósito (570). Servem para
    // recuperar o fôlego e voltar à corrente com um pulo duplo, mas o salto de
    // um disco para o contraforte direito daria 280px — acima dos 236 do pulo
    // duplo. Sem isso o pátio se atravessaria de disco em disco e as
    // correntes viravam enfeite.
    { type: 'disco', x: 5340, y: 570, w: 110, bob: 10, period: 3.4, phase: 1.9 },

    // (6) pátio do chefão: o rolo passa por baixo das saliências e a última
    // rajada fecha em 6200, exatamente na boca da arena — nada de obstáculo
    // dentro dela, a luta é do chefão.
    { type: 'espinhorolo', x: 5700, y: 576, w: 44, range: 130, speed: 140 },
    { type: 'brasa', x: 6020, y: 400, w: 180, h: 220, period: 3.2, phase: 0.6 },

    // TROVÕES — só em trecho de chão RETO e sem fosso por baixo (jardim,
    // campo de lápides, pátio do chefão): cair fora do lugar certo por causa
    // de um raio não pode custar a fase. groundY é sempre 620, o piso real
    // desses três trechos. Intervalos longos e com jitter (6..10s) para não
    // virar metrônomo nem empilhar em cima das rajadas de brasa já existentes.
    { type: 'trovao', x: 500, w: 900, groundY: 620, interval: 7, jitter: 2 },     // jardim + início do campo
    { type: 'trovao', x: 1700, w: 700, groundY: 620, interval: 8, jitter: 2.5 },  // campo de lápides, 2ª metade
    { type: 'trovao', x: 6200, w: 800, groundY: 620, interval: 7.5, jitter: 2.5 }, // pátio do chefão
  ];

  // ---------------------------------------------------------------
  // LUMIS — linhas, arcos e COLUNAS. As colunas marcam o que se sobe: a
  // torre e as duas colunas de vento gélido do fosso.
  // ---------------------------------------------------------------
  var lumis = [];
  function lumiLine(x, y, n, dx) { kit.lumiLine(lumis, x, y, n, dx); }
  function lumiCol(x, y, n, dy) { kit.lumiCol(lumis, x, y, n, dy); }
  function lumiArc(cx, apexY, n, span, sag) { kit.lumiArc(lumis, cx, apexY, span, sag, n); }
  // (1) jardim de entrada
  lumiLine(140, 578, 4, 60);
  lumiArc(520, 470, 5, 190, 34);
  lumiLine(640, 442, 3, 40);
  lumiArc(900, 520, 4, 170, 40);       // dentro da 1ª zona de fenda: o prêmio de ler a mancha
  // (2) campo de lápides — arco por zona (puxa a corrida) e linha por abrigo
  lumiArc(1200, 540, 4, 180, 44);
  lumiLine(1350, 436, 3, 44);
  lumiArc(1595, 528, 4, 190, 46);
  lumiLine(1745, 442, 3, 44);
  lumiArc(1990, 520, 5, 210, 48);
  lumiLine(2155, 446, 3, 44);
  // (3) fosso negro — um arco por disco, coluna dentro de cada sopro
  lumiArc(2460, 470, 3, 130, 34);
  lumiArc(2715, 436, 3, 130, 34);
  lumiCol(2845, 600, 5, -62);
  lumiArc(2955, 452, 3, 130, 34);
  lumiArc(3200, 420, 3, 140, 36);
  lumiCol(3310, 590, 5, -64);
  lumiArc(3415, 460, 3, 130, 34);
  // (4) torre e platô
  lumiCol(3785, 560, 6, -62);          // A TORRE: a escada de lumis ensina a subir agarrado
  lumiLine(3850, 120, 3, 56);
  lumiLine(4110, 118, 4, 54);          // platô, por baixo da névoa
  lumiArc(4400, 250, 3, 130, 34);      // descida em degraus
  lumiArc(4580, 350, 3, 120, 32);
  lumiArc(4745, 440, 3, 110, 30);
  lumiArc(4480, 560, 4, 180, 44);      // talude, dentro da rajada
  // (5) correntes sobre o pátio dos fundos — arco de entrada em cada corrente
  // e uma linha em cima do pináculo, que é o descanso do meio da travessia
  lumiArc(5040, 400, 4, 150, 42);
  lumiLine(5155, 430, 2, 44);          // sobre o pináculo central (topo em 470)
  lumiArc(5390, 420, 4, 190, 44);
  lumiCol(5280, 630, 5, -56);          // dentro do vento gélido do poço leste
  // (6) pátio do chefão
  lumiLine(5690, 578, 3, 54);
  lumiLine(5770, 500, 3, 44);
  lumiLine(5910, 456, 3, 44);
  lumiArc(6110, 520, 4, 160, 40);      // última rajada
  lumiLine(6280, 570, 2, 60);

  // FAÍSCAS — brilho de despedida da lumi coletada (pool fixo do kit, sem GC).
  // 80 e não 64 como no bosque: o estouro do relicário sozinho gasta 22.
  var sparks = kit.makeSparks(80);

  // ---------------------------------------------------------------
  // MANCHAS ESCURAS — cicatriz permanente no chão de cada zona de fenda,
  // derivada dos obstacleDefs no load. Serve de leitura ANTES de a zona
  // acender pela primeira vez: o jogador vê a terra revolvida e desconfia.
  // (era mancha de queimado no vulcão) ---------------------------------
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
  // metal; o contexto de pedra é meu. Cada ponta ganha um bloco de pedra do
  // muro cravado com argola de ferro forjado, para a corrente parecer presa
  // na mansão e não flutuando. Derivadas dos defs no load, para não repetir
  // coordenada.
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
  // 'g' e 'r' guardam veios de musgo/luar (que pulsam, era brasa) e dentes de
  // crosta; 'c' vira um offscreen inteiro no primeiro draw (custo zero por frame).
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

    // CÉU NOTURNO. A ordem das paradas ainda vai do escuro no topo para o
    // mais claro embaixo — só que agora o claro embaixo é o luar frio subindo
    // do horizonte, não o brilho quente da lava. O topo é breu quase preto,
    // com nuvens roxas escuras rolando por cima do horizonte violeta.
    skySpr = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, '#040309');
      gr.addColorStop(0.3, '#0c0a1e');
      gr.addColorStop(0.6, '#1c1638');
      gr.addColorStop(0.84, '#332a56');
      gr.addColorStop(1, '#4a3d6e');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      // nuvens roxas escuras rolando no alto, para o céu não ser um degradê liso
      var r = makeRand(13);
      g.fillStyle = 'rgba(20,12,36,0.5)';
      for (var i = 0; i < 26; i++) {
        g.globalAlpha = 0.10 + r() * 0.24;
        g.beginPath();
        g.ellipse(r() * VIEW_W, r() * 250, 70 + r() * 150, 22 + r() * 46, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      // a lua cheia: disco pálido fixo no céu, com auréola fria
      var mx = VIEW_W * 0.74, my = 118, mr = 46;
      var halo = g.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 3.2);
      halo.addColorStop(0, 'rgba(230,230,255,0.35)');
      halo.addColorStop(1, 'rgba(230,230,255,0)');
      g.fillStyle = halo;
      g.beginPath(); g.arc(mx, my, mr * 3.2, 0, Math.PI * 2); g.fill();
      var moon = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 4, mx, my, mr);
      moon.addColorStop(0, '#fbfbf6');
      moon.addColorStop(0.7, '#e4e2ec');
      moon.addColorStop(1, '#c7c6dc');
      g.fillStyle = moon;
      g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
      // crateras
      g.fillStyle = 'rgba(170,168,196,0.4)';
      g.beginPath(); g.arc(mx - 14, my - 8, 7, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(mx + 10, my + 12, 5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(mx + 4, my - 16, 4, 0, Math.PI * 2); g.fill();
      // um morcego solitário riscando a lua, pra marcar o tom da fase de cara
      g.fillStyle = 'rgba(10,8,16,0.7)';
      g.beginPath();
      g.moveTo(mx - 20, my + 6);
      g.lineTo(mx - 6, my - 2);
      g.lineTo(mx, my + 2);
      g.lineTo(mx + 6, my - 2);
      g.lineTo(mx + 20, my + 6);
      g.lineTo(mx, my + 12);
      g.closePath();
      g.fill();
    })(skySpr.getContext('2d'));

    // CLARÃO DO LUAR — o "sol" desta fase (frio, prateado) mora embaixo da
    // tela: é o que sobe da névoa rasteira e das lápides molhadas de orvalho.
    glowSpr = makeCanvas(560, 300);
    (function (g) {
      var gr = g.createRadialGradient(280, 300, 10, 280, 300, 290);
      gr.addColorStop(0, 'rgba(220,225,255,0.55)');
      gr.addColorStop(0.22, 'rgba(150,150,210,0.35)');
      gr.addColorStop(0.55, 'rgba(90,80,150,0.16)');
      gr.addColorStop(1, 'rgba(60,50,110,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 560, 300);
    })(glowSpr.getContext('2d'));

    // FAIXAS DE BRILHO reaproveitáveis: assadas uma vez e esticadas com
    // drawImage onde for preciso. É o que permite ter glow em todo poço negro
    // e sob toda saliência sem criar um gradiente por frame.
    glowUp = makeCanvas(16, 160);
    (function (g) {
      var gr = g.createLinearGradient(0, 160, 0, 0);
      gr.addColorStop(0, 'rgba(150,140,220,0.42)');
      gr.addColorStop(0.35, 'rgba(110,90,180,0.18)');
      gr.addColorStop(1, 'rgba(90,70,160,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 16, 160);
    })(glowUp.getContext('2d'));

    glowDown = makeCanvas(16, 90);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, 90);
      gr.addColorStop(0, 'rgba(160,150,225,0.36)');
      gr.addColorStop(1, 'rgba(110,90,180,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 16, 90);
    })(glowDown.getContext('2d'));

    farL = makeCanvas(2400, LAYER_H); paintFar(farL.getContext('2d'));
    midL = makeCanvas(2400, LAYER_H); paintMid(midL.getContext('2d'));
    fumL = makeCanvas(1600, LAYER_H); paintFumaca(fumL.getContext('2d'));
    nearL = makeCanvas(2400, LAYER_H); paintNear(nearL.getContext('2d'));
    frontL = makeCanvas(1800, LAYER_H); paintFront(frontL.getContext('2d'));

    // vinheta invertida: escura EM CIMA. No bosque ela fechava por igual; aqui
    // fechar embaixo apagaria justamente a fonte de luz (o luar subindo do chão).
    vig = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, 'rgba(3,2,8,0.6)');
      gr.addColorStop(0.45, 'rgba(3,2,8,0.14)');
      gr.addColorStop(1, 'rgba(3,2,8,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      var rg = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 260, VIEW_W / 2, VIEW_H / 2, 660);
      rg.addColorStop(0, 'rgba(4,2,8,0)');
      rg.addColorStop(1, 'rgba(4,2,8,0.5)');
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
  // PENHASCO — agora fachada de mansão/muro de pedra gótico: fiadas de
  // alvenaria justas, quase pretas, com a hera morta subindo em vez de veio de
  // brasa e a BASE brilhando de luar refletido na névoa rasteira. O bosque
  // fazia o contrário: lá o topo pegava sol e a base afundava na sombra.
  // ---------------------------------------------------------------
  function paintCliff(g, w, h, seed) {
    var r = makeRand(seed);
    var P = ROCK_PAD;

    g.save();
    g.beginPath(); g.rect(P, P, w, h); g.clip();

    // corpo: preto em cima, arroxeando para baixo (pedra molhada de orvalho)
    var gr = g.createLinearGradient(0, P, 0, P + h);
    gr.addColorStop(0, '#0f0e16');
    gr.addColorStop(0.55, '#181428');
    gr.addColorStop(1, '#241c3a');
    g.fillStyle = gr;
    g.fillRect(P, P, w, h);

    // fiadas de alvenaria: uma sucessão de faixas verticais com aresta clara de
    // um lado e junta escura do outro. É a assinatura da fachada de pedra.
    var cw = 20 + r() * 12;
    for (var x = P; x < P + w; x += cw) {
      var lw = cw * (0.82 + r() * 0.3);
      var tom = 0.05 + r() * 0.07;
      g.fillStyle = 'rgba(140,130,168,' + tom.toFixed(3) + ')';
      g.fillRect(x, P, lw, h);
      g.fillStyle = 'rgba(3,2,8,0.5)';
      g.fillRect(x + lw - 2, P, 2.5, h);
      // quebras horizontais da fiada (a pedra racha em blocos)
      g.fillStyle = 'rgba(3,2,8,0.35)';
      for (var y = P + 20 + r() * 40; y < P + h; y += 44 + r() * 46) {
        g.fillRect(x, y, lw, 2);
        g.fillStyle = 'rgba(150,140,200,0.10)';
        g.fillRect(x, y + 2, lw, 1.4);
        g.fillStyle = 'rgba(3,2,8,0.35)';
      }
    }

    // hera morta: trepadeiras retorcidas subindo do pé da parede, sem folha
    // nenhuma — só o galho seco, com um brilho frio de luar na aresta
    g.lineCap = 'round';
    var nv = 1 + Math.floor(w / 55);
    for (var k = 0; k < nv; k++) {
      var vx = P + 8 + r() * Math.max(1, w - 16);
      var vy = P + h - 4 - r() * (h * 0.25);
      var vl = 40 + r() * (h * 0.55);
      g.strokeStyle = 'rgba(40,60,50,0.55)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(vx, vy);
      g.quadraticCurveTo(vx + (r() * 2 - 1) * 16, vy - vl * 0.5, vx + (r() * 2 - 1) * 22, vy - vl);
      g.stroke();
      g.strokeStyle = 'rgba(90,120,100,0.5)';
      g.lineWidth = 1.6;
      g.stroke();
    }

    // janelas escuras (arcos), como as cavernas do bosque mas com um vislumbre
    // de vela lá dentro
    if (w >= 90 && h >= 160) {
      var nb = 1 + Math.floor(r() * 2);
      for (var bi = 0; bi < nb; bi++) {
        var mx = P + 22 + r() * Math.max(1, w - 44);
        var my = P + h * (0.45 + r() * 0.4);
        var mh = 20 + r() * 26;
        g.fillStyle = '#050308';
        g.beginPath();
        g.ellipse(mx, my, mh * 0.7, mh, 0, 0, Math.PI * 2);
        g.fill();
        var mg = g.createRadialGradient(mx, my, 2, mx, my, mh * 1.4);
        mg.addColorStop(0, 'rgba(255,200,120,0.4)');
        mg.addColorStop(0.45, 'rgba(180,90,40,0.15)');
        mg.addColorStop(1, 'rgba(120,60,30,0)');
        g.fillStyle = mg;
        g.beginPath();
        g.ellipse(mx, my, mh * 1.0, mh * 0.75, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    // pé da parede iluminado pela névoa (o luar refletido sobe do chão)
    var bh = Math.min(150, h * 0.5);
    var bg = g.createLinearGradient(0, P + h - bh, 0, P + h);
    bg.addColorStop(0, 'rgba(140,140,210,0)');
    bg.addColorStop(1, 'rgba(150,150,220,0.34)');
    g.fillStyle = bg;
    g.fillRect(P, P + h - bh, w, bh);
    g.restore();

    // topo: telhado/parapeito de ardósia fria, sem brilho nenhum — é a face
    // que dá as costas para a lua, e é o contraste dela que vende a luz de baixo.
    g.fillStyle = '#201c2a';
    g.fillRect(P - 3, P - 2, w + 6, 11);
    g.fillStyle = '#38324a';
    g.fillRect(P - 3, P - 2, w + 6, 5);
    g.fillStyle = 'rgba(12,10,20,0.9)';
    g.fillRect(P - 3, P + 7, w + 6, 3);
    // telhas soltas na aresta
    g.fillStyle = '#211d2e';
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

  // --- camada distante: torres da mansão e mausoléus em silhueta contra o
  // céu, com uma janela acesa no alto e árvores mortas retorcidas ao pé.
  // Rim light na CRISTA porque o luar vem de trás e de cima — mesma lógica de
  // luz do vulcão, só que a fonte trocou de lugar. ---
  function paintFar(g) {
    var r = makeRand(9101);
    var base = LAYER_H;

    for (var c = 0; c < 4; c++) {
      var cx = 130 + c * 620 + r() * 160;
      var ch = 300 + r() * 190;
      var cw = 320 + r() * 220;
      var top = base - 40 - ch;
      g.fillStyle = 'rgba(14,10,26,0.92)';
      g.beginPath();
      g.moveTo(cx - cw / 2, base);
      g.lineTo(cx - 34, top + 16);
      g.lineTo(cx - 12, top);
      g.lineTo(cx + 14, top + 4);
      g.lineTo(cx + 36, top + 18);
      g.lineTo(cx + cw / 2, base);
      g.closePath();
      g.fill();

      // telhado pontudo da torre e cata-vento
      g.fillStyle = 'rgba(10,8,20,0.95)';
      g.beginPath();
      g.moveTo(cx - 20, top + 4);
      g.lineTo(cx - 2, top - 34);
      g.lineTo(cx + 16, top + 6);
      g.closePath();
      g.fill();

      // janela acesa no alto: uma vela solitária na torre
      var kg = g.createRadialGradient(cx, top + 6, 2, cx, top + 6, 60);
      kg.addColorStop(0, 'rgba(255,210,140,0.55)');
      kg.addColorStop(0.3, 'rgba(200,120,50,0.22)');
      kg.addColorStop(1, 'rgba(160,80,30,0)');
      g.fillStyle = kg;
      g.beginPath();
      g.ellipse(cx, top + 6, 34, 26, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,200,120,0.6)';
      g.fillRect(cx - 4, top - 2, 8, 14);

      // árvores mortas retorcidas escalando as encostas
      g.lineCap = 'round';
      for (var v = 0; v < 3; v++) {
        var dirv = v === 1 ? 0 : (v === 0 ? -1 : 1);
        var ex = cx + dirv * (18 + r() * 26);
        var ey = top + 10;
        var el = ch * (0.5 + r() * 0.45);
        g.strokeStyle = 'rgba(20,16,30,0.5)';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(ex, ey);
        g.quadraticCurveTo(ex + dirv * 50, ey + el * 0.55, ex + dirv * (70 + r() * 60), ey + el);
        g.stroke();
        g.strokeStyle = 'rgba(90,90,130,0.4)';
        g.lineWidth = 2.2;
        g.stroke();
      }

      // rim light na crista voltada para a lua
      g.strokeStyle = 'rgba(160,160,225,0.3)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(cx - 34, top + 16);
      g.lineTo(cx - 12, top);
      g.lineTo(cx + 14, top + 4);
      g.lineTo(cx + 36, top + 18);
      g.stroke();
    }

    // cordão de lápides e mausoléus à frente das torres
    g.fillStyle = 'rgba(10,8,18,0.95)';
    hillBand(g, r, base - 150, 70, 6);

    // névoa de cemitério no horizonte: é ela que acende a base da camada
    var gr = g.createLinearGradient(0, base - 120, 0, base);
    gr.addColorStop(0, 'rgba(140,140,220,0)');
    gr.addColorStop(0.6, 'rgba(140,140,220,0.16)');
    gr.addColorStop(1, 'rgba(180,180,240,0.38)');
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

  // --- camada média: árvores mortas retorcidas e pontas de grade de ferro
  // forjado, com névoa fria correndo por baixo em vez de fumarola ---
  function paintMid(g) {
    var r = makeRand(9202);
    var base = LAYER_H;

    g.fillStyle = 'rgba(12,10,20,0.94)';
    g.fillRect(0, base - 60, 2400, 60);

    for (var s = 0; s < 6; s++) {
      var sx = 140 + s * 400 + r() * 120;
      var sw = 54 + r() * 60, sh = 190 + r() * 190;
      g.fillStyle = '#100b18';
      g.beginPath();
      g.moveTo(sx, base);
      g.lineTo(sx + sw * 0.22, base - sh + 14);
      g.lineTo(sx + sw * 0.5, base - sh);
      g.lineTo(sx + sw * 0.8, base - sh + 22);
      g.lineTo(sx + sw, base);
      g.closePath();
      g.fill();
      // juntas verticais da árvore/pilar de grade
      g.fillStyle = 'rgba(3,2,8,0.5)';
      for (var j = 1; j < 4; j++) {
        g.fillRect(sx + (sw / 4) * j, base - sh + 26, 2, sh - 30);
      }
      // pé com o luar refletido na névoa
      g.fillStyle = 'rgba(140,140,210,0.16)';
      g.fillRect(sx + 4, base - 52, sw - 8, 52);
      g.fillStyle = 'rgba(190,190,235,0.2)';
      g.fillRect(sx + sw * 0.2, base - sh + 14, 3, sh - 20);
    }

    // névoa fria: colunas de neblina rasteira subindo entre as árvores
    for (var f = 0; f < 8; f++) {
      var fx = 90 + f * 300 + r() * 110;
      var fh = 150 + r() * 200;
      g.fillStyle = 'rgba(180,185,210,0.055)';
      for (var b = 0; b < 5; b++) {
        var by = base - 40 - (b / 5) * fh;
        g.beginPath();
        g.ellipse(fx + (r() * 2 - 1) * 22, by, 20 + b * 9 + r() * 14, 16 + b * 6, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    // rachaduras de gelo/luar correndo pelo chão da camada
    g.lineCap = 'round';
    for (var k = 0; k < 14; k++) {
      var kx = r() * 2400, ky = base - 8 - r() * 34, kl = 40 + r() * 110;
      g.strokeStyle = 'rgba(150,150,215,0.2)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(kx, ky);
      g.quadraticCurveTo(kx + kl * 0.5, ky + (r() * 2 - 1) * 12, kx + kl, ky + (r() * 2 - 1) * 8);
      g.stroke();
      g.strokeStyle = 'rgba(220,220,245,0.42)';
      g.lineWidth = 1.4;
      g.stroke();
    }
  }

  // --- névoa entre os patamares: as faixas do bosque, aqui em cinza-azulado
  // frio e mais baixas, porque a bruma do cemitério nasce no chão e sobe ---
  function paintFumaca(g) {
    var r = makeRand(9303);
    var base = LAYER_H;
    var bands = [base - 300, base - 130];
    for (var i = 0; i < bands.length; i++) {
      var by = bands[i], bh = 110 + i * 50;
      var gr = g.createLinearGradient(0, by - bh * 0.5, 0, by + bh * 0.5);
      gr.addColorStop(0, 'rgba(150,155,200,0)');
      gr.addColorStop(0.5, 'rgba(160,165,205,' + (0.16 + i * 0.08).toFixed(2) + ')');
      gr.addColorStop(1, 'rgba(150,155,200,0)');
      g.fillStyle = gr;
      g.fillRect(0, by - bh * 0.5, 1600, bh);
      g.fillStyle = 'rgba(200,205,225,0.09)';
      for (var k = 0; k < 10; k++) {
        g.beginPath();
        g.ellipse(r() * 1600, by + (r() * 2 - 1) * 26, 100 + r() * 200, 22 + r() * 38, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // --- camada próxima: muro de pedra do cemitério com lápides na crista,
  // a aresta pegando o luar em vez da brasa ---
  function paintNear(g) {
    var r = makeRand(9404);
    var base = LAYER_H;
    g.fillStyle = '#0a0810';
    g.fillRect(0, base - 78, 2400, 78);

    // lápides e blocos de muro empilhados na crista
    for (var i = 0; i < 20; i++) {
      var bx = i * 122 + r() * 60, by = base - 66 - r() * 44;
      var bw = 60 + r() * 70, bh = 40 + r() * 50;
      g.fillStyle = '#0e0b16';
      g.beginPath();
      g.moveTo(bx, by + bh);
      g.lineTo(bx + 6, by + 8);
      g.lineTo(bx + bw * 0.45, by);
      g.lineTo(bx + bw - 6, by + 12);
      g.lineTo(bx + bw, by + bh);
      g.closePath();
      g.fill();
      // aresta superior levemente acesa pelo luar
      g.strokeStyle = 'rgba(160,160,225,0.18)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(bx + 6, by + 8);
      g.lineTo(bx + bw * 0.45, by);
      g.lineTo(bx + bw - 6, by + 12);
      g.stroke();
    }

    // fissuras de gelo/musgo prateado entre os blocos
    g.lineCap = 'round';
    for (var k = 0; k < 24; k++) {
      var kx = r() * 2400, ky = base - 6 - r() * 26;
      g.strokeStyle = 'rgba(150,150,215,0.24)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(kx, ky);
      g.lineTo(kx + (r() * 2 - 1) * 26, ky - 12 - r() * 18);
      g.stroke();
      g.strokeStyle = 'rgba(220,220,245,0.4)';
      g.lineWidth = 1.2;
      g.stroke();
    }
  }

  // --- primeiro plano: pontas de grade de ferro forjado entrando pela borda
  // de baixo e morcegos/gárgulas pendendo do alto ---
  function paintFront(g) {
    var r = makeRand(9505);
    var base = LAYER_H;

    g.fillStyle = '#040308';
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
    g.fillStyle = '#050409';
    g.fillRect(0, base - 30, 1800, 30);

    // morcegos e gárgulas penduradas no teto/beiral
    for (var s = 0; s < 9; s++) {
      var sx = 90 + s * 210 + r() * 90;
      var sh = 60 + r() * 110, sw = 26 + r() * 26;
      g.fillStyle = '#050409';
      g.beginPath();
      g.moveTo(sx - sw / 2, 0);
      g.lineTo(sx + sw / 2, 0);
      g.lineTo(sx + (r() * 2 - 1) * 6, sh);
      g.closePath();
      g.fill();
      // olho de brasa vermelha na ponta (morcego pendurado ou gárgula)
      g.fillStyle = 'rgba(255,30,50,0.4)';
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

    // fogos-fátuos em suspensão — o equivalente dos vagalumes do bosque, mas
    // frios e esverdeados, e ainda SOBEM. Posição derivada do índice e do
    // tempo: nenhuma alocação por frame.
    ctx.save();
    for (var i = 0; i < 22; i++) {
      var fx = (((i * 421 + Math.sin(t * 0.4 + i) * 30) - cam.x * 0.55) % 1040 + 1040) % 1040 - 40;
      var sobe = (t * (26 + (i % 5) * 9) + i * 97) % 620;
      var fy = VIEW_H + 30 - sobe + Math.sin(t * 1.4 + i * 1.9) * 14 - cam.y * 0.5;
      var a = 0.15 + 0.35 * (1 - sobe / 620);
      if (a <= 0.05) continue;
      ctx.globalAlpha = a * 0.45;
      ctx.fillStyle = '#7fe0a0';
      ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#d8ffe6';
      ctx.beginPath(); ctx.arc(fx, fy, 1.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // névoa respirando entre os patamares
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

    // poço negro primeiro: ele é o fundo contra o qual as bordas de pedra se
    // recortam (era lava; mesmo hazard 't'==='l', só o desenho mudou)
    for (var hi = 0; hi < hazards.length; hi++) {
      var hz = hazards[hi];
      if (hz.t !== 'l' || hz.x > x1 || hz.x + hz.w < x0) continue;
      drawLava(ctx, hz, t);
    }

    // manchas escuras de terra revolvida das zonas de brasa/energia sombria
    // (por baixo das plataformas — era cicatriz de queimado)
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,18,0.5)';
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

    // grades de ferro pontudas por cima do terreno (era lasca de obsidiana;
    // mesmo hazard 't'==='s', só o desenho mudou)
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

    // velas-checkpoint (eram braseiros)
    for (var c = 0; c < checkpoints.length; c++) {
      var cp = checkpoints[c];
      if (cp.x > x1 || cp.x < x0) continue;
      drawBraseiro(ctx, cp, FG.engine.checkpoint.x === cp.x, t);
    }

    // ninho/relicário com o casulo
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

  // --- chão de cemitério ('g'): terra fria em cima, corpo escuro, veios de
  // luar/musgo fosforescente e uma faixa de brilho DEBAIXO da aresta. É a
  // regra de luz da fase inteira resumida numa plataforma (era basalto). ---
  function drawBasalto(ctx, s, d, t) {
    ctx.fillStyle = '#140f1e';
    ctx.fillRect(s.x, s.y, s.w, s.h);

    // corpo arroxeando para o fundo (a terra encharcada de névoa)
    ctx.fillStyle = 'rgba(40,30,70,0.5)';
    ctx.fillRect(s.x, s.y + s.h * 0.45, s.w, s.h * 0.55);

    veios(ctx, s, d, t);

    // crosta cinza-clara no topo — grama seca/geada — é o que faz a
    // silhueta do chão ler contra o céu escuro
    ctx.fillStyle = '#302c3c';
    ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, 12);
    ctx.fillStyle = '#4a465c';
    ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, 5);
    ctx.fillStyle = 'rgba(8,6,14,0.85)';
    ctx.fillRect(s.x - 2, s.y + 9, s.w + 4, 3);
    dentes(ctx, s, d);

    // musgo fosforescente escorrendo pela borda: fio pálido logo abaixo da crosta
    ctx.fillStyle = 'rgba(140,180,150,0.30)';
    ctx.fillRect(s.x, s.y + 12, s.w, 2.5);
    // e o glow derramado para baixo, a partir da aresta
    ctx.drawImage(glowDown, s.x, s.y + 12, s.w, Math.min(70, s.h));
  }

  // --- bloco de lápide/pedra solta ('r') ---
  function drawRocha(ctx, s, d, t) {
    ctx.fillStyle = '#191426';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + s.h);
    ctx.lineTo(s.x + 3, s.y + 5);
    ctx.lineTo(s.x + s.w * 0.4, s.y - 3);
    ctx.lineTo(s.x + s.w - 4, s.y + 6);
    ctx.lineTo(s.x + s.w, s.y + s.h);
    ctx.closePath();
    ctx.fill();

    veios(ctx, s, d, t);

    ctx.fillStyle = '#3a3548';
    ctx.fillRect(s.x + 2, s.y, s.w - 4, 5);
    ctx.fillStyle = 'rgba(120,114,140,0.7)';
    ctx.fillRect(s.x + 2, s.y, s.w - 4, 2);
    dentes(ctx, s, d);

    // a barriga do bloco pega o luar refletido no poço negro
    ctx.fillStyle = 'rgba(150,150,220,0.16)';
    ctx.fillRect(s.x + 2, s.y + s.h - 5, s.w - 4, 5);
    ctx.drawImage(glowDown, s.x, s.y + s.h - 4, s.w, 44);
  }

  // veios de musgo fosforescente/luar pulsando na face da pedra (era brasa;
  // pré-computados no decor)
  function veios(ctx, s, d, t) {
    ctx.save();
    ctx.lineCap = 'round';
    for (var i = 0; i < d.veios.length; i++) {
      var v = d.veios[i];
      var puls = 0.55 + 0.45 * Math.sin(t * 1.6 + v.ph);
      var bx = s.x + v.x, by = s.y + v.y;
      ctx.globalAlpha = 0.22 + 0.2 * puls;
      ctx.strokeStyle = '#6aa878';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + v.bend * 0.5, by + v.len * 0.5, bx + v.bend, by + v.len);
      ctx.stroke();
      ctx.globalAlpha = 0.45 + 0.4 * puls;
      ctx.strokeStyle = '#c8f0d0';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  // serrilha da aresta de cima: a pedra quebrou, não foi cortada
  function dentes(ctx, s, d) {
    ctx.fillStyle = '#26212f';
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

  // --- poço negro: água estagnada de cemitério, escura e parada, refletindo
  // a lua fria por cima. Era lava — mesma geometria/comportamento de hazard,
  // só a pintura mudou de fogo para água morta. ---
  function drawLava(ctx, hz, t) {
    var bot = hz.y + hz.h + 46;

    // poço
    ctx.fillStyle = '#0c0a1a';
    ctx.fillRect(hz.x, hz.y, hz.w, bot - hz.y);
    ctx.fillStyle = '#1c1638';
    ctx.fillRect(hz.x, hz.y, hz.w, 16);
    ctx.fillStyle = '#4a3d6e';
    ctx.fillRect(hz.x, hz.y + 1, hz.w, 5);

    // lodo escuro à deriva: placas que andam devagar para a direita e
    // reentram pelo começo — a água parada tem de parecer viscosa, não viva
    ctx.save();
    ctx.fillStyle = 'rgba(8,6,16,0.72)';
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

    // ondulação da superfície, luar refletido tremulando
    ctx.save();
    ctx.strokeStyle = '#c8c8ec';
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(hz.x, hz.y + Math.sin(t * 1.6 + hz.x * 0.04) * 2);
    for (var x = hz.x + 20; x <= hz.x + hz.w; x += 20) {
      ctx.lineTo(x, hz.y + Math.sin(t * 1.6 + x * 0.04) * 2.6);
    }
    ctx.stroke();
    ctx.restore();

    // bolhas de gás do pântano estourando na superfície
    ctx.save();
    ctx.fillStyle = '#b8c8e6';
    var nb = Math.max(2, Math.floor(hz.w / 90));
    for (var b = 0; b < nb; b++) {
      var bx = hz.x + 16 + (b * 97) % Math.max(1, hz.w - 32);
      var per = (t * 0.5 + b * 0.29) % 1;
      ctx.globalAlpha = 0.5 * (1 - per);
      ctx.beginPath();
      ctx.arc(bx, hz.y + 6 - per * 12, 2 + (b % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // o glow frio que sobe do poço: a fonte de luz da fase, esticada com
    // drawImage (nada de criar gradiente por frame)
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.18 * Math.sin(t * 0.9 + hz.x * 0.01);
    ctx.drawImage(glowUp, hz.x, hz.y - 150, hz.w, 152);
    ctx.restore();
  }

  // --- grade de ferro pontuda (o "espinho" desta fase, era lasca de
  // obsidiana): barras enferrujadas com o luar riscando a lateral ---
  function drawObsidiana(ctx, hz) {
    var n = Math.max(3, Math.round(hz.w / 16));
    var sw = hz.w / n;
    ctx.fillStyle = '#0a0812';
    ctx.fillRect(hz.x, hz.y + hz.h - 5, hz.w, 5);
    for (var i = 0; i < n; i++) {
      var bx = hz.x + i * sw;
      ctx.fillStyle = '#211c28';
      ctx.beginPath();
      ctx.moveTo(bx, hz.y + hz.h);
      ctx.lineTo(bx + sw / 2, hz.y);
      ctx.lineTo(bx + sw, hz.y + hz.h);
      ctx.closePath();
      ctx.fill();
      // face esquerda com o reflexo do luar, direita quase preta (ferrugem)
      ctx.fillStyle = 'rgba(160,160,225,0.32)';
      ctx.beginPath();
      ctx.moveTo(bx + sw / 2, hz.y);
      ctx.lineTo(bx + sw * 0.5, hz.y + hz.h);
      ctx.lineTo(bx + sw * 0.22, hz.y + hz.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(20,10,10,0.7)';
      ctx.beginPath();
      ctx.moveTo(bx + sw / 2, hz.y);
      ctx.lineTo(bx + sw, hz.y + hz.h);
      ctx.lineTo(bx + sw * 0.62, hz.y + hz.h);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- âncora de pedra das correntes: bloco de pedra do muro cravado com
  // argola de ferro forjado. `lado` diz para que lado a corrente sai, e é ele
  // que orienta a mísula. ---
  function drawAncora(ctx, a, t) {
    var x = a.x, y = a.y;
    // bloco
    ctx.fillStyle = '#1c1428';
    ctx.beginPath();
    ctx.moveTo(x - a.lado * 30, y - 20);
    ctx.lineTo(x + a.lado * 12, y - 24);
    ctx.lineTo(x + a.lado * 14, y + 16);
    ctx.lineTo(x - a.lado * 32, y + 22);
    ctx.closePath();
    ctx.fill();
    // aresta de cima fria, barriga com o luar refletido
    ctx.fillStyle = 'rgba(110,104,140,0.6)';
    ctx.fillRect(x - a.lado * 30 - (a.lado > 0 ? 0 : 12), y - 24, 42, 3);
    ctx.fillStyle = 'rgba(150,150,220,0.2)';
    ctx.beginPath();
    ctx.moveTo(x - a.lado * 32, y + 22);
    ctx.lineTo(x + a.lado * 14, y + 16);
    ctx.lineTo(x + a.lado * 14, y + 10);
    ctx.lineTo(x - a.lado * 32, y + 15);
    ctx.closePath();
    ctx.fill();
    // argola de ferro forjado onde a corrente morde
    ctx.strokeStyle = '#3e3a48';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(180,180,235,0.4)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y + 1, 8, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    // cravo
    ctx.fillStyle = '#605a70';
    ctx.beginPath();
    ctx.arc(x - a.lado * 14, y - 4, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- vela-checkpoint: castiçal de ferro forjado com uma chama viva. Acesa
  // é o checkpoint atual; apagada é pavio frio (era braseiro). ---
  function drawBraseiro(ctx, cp, aceso, t) {
    var x = cp.x, y = cp.y;
    ctx.strokeStyle = '#332e3c';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 12, y); ctx.lineTo(x - 3, y - 46);
    ctx.moveTo(x + 12, y); ctx.lineTo(x + 3, y - 46);
    ctx.moveTo(x, y); ctx.lineTo(x, y - 46);
    ctx.stroke();

    // pratinho do castiçal
    ctx.fillStyle = '#251f2c';
    ctx.beginPath();
    ctx.moveTo(x - 17, y - 62);
    ctx.lineTo(x + 17, y - 62);
    ctx.lineTo(x + 11, y - 44);
    ctx.lineTo(x - 11, y - 44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3e3846';
    ctx.fillRect(x - 18, y - 64, 36, 4);
    // corpo da vela
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(x - 4, y - 78, 8, 16);

    if (aceso) {
      var fl = 0.8 + 0.2 * Math.sin(t * 9 + Math.sin(t * 5.1));
      ctx.save();
      ctx.shadowColor = '#ff9a30';
      ctx.shadowBlur = 22 * fl;
      ctx.fillStyle = '#ffb856';
      ctx.beginPath();
      ctx.ellipse(x, y - 78, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // labareda de vela: menor e mais quieta que uma fogueira
      ctx.fillStyle = '#ffc65a';
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 78);
      ctx.quadraticCurveTo(x - 3, y - 90 * fl - 2, x, y - 98 * fl);
      ctx.quadraticCurveTo(x + 4, y - 90 * fl - 2, x + 5, y - 78);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff2c0';
      ctx.beginPath();
      ctx.ellipse(x, y - 82 - 4 * fl, 2.4, 5 * fl, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#1a1420';
      ctx.beginPath();
      ctx.ellipse(x, y - 79, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- relicário/ninho: cama de galhos secos carbonizados e um casulo
  // verde-azulado guardando um amuleto luminoso. É a única coisa fria e viva
  // da mansão, e é de propósito: contra o roxo de tudo, ele se acha sozinho.
  // (era o ninho com casulo do vulcão — mesma coleta, mesma coordenada) ---
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

    // galhos secos retorcidos
    ctx.strokeStyle = '#1e1826';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * Math.PI + 0.15;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * 30, y + 30 - Math.sin(a) * 5);
      ctx.quadraticCurveTo(x, y + 38, x + Math.cos(a) * 30, y + 30 - Math.sin(a) * 5);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(150,150,220,0.3)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 28, y + 32);
    ctx.quadraticCurveTo(x, y + 40, x + 28, y + 32);
    ctx.stroke();

    // casulo/relicário
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
  // pântano), e na mansão isso não existe — corda de sisal sobre um poço negro
  // seria pior que o cipó, e nem combina com o ferro forjado do resto do
  // cenário. Então elo por elo por cima dela, a partir dos pontos que o
  // próprio obstáculo já calculou (o.pts). Os elos junto da mão do jogador são
  // pulados quando ele está pendurado: assim a luva fica por cima da
  // corrente, que é o que a leitura pede.
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
    id: 'mansao',
    nome: 'A Mansão Assombrada',
    musica: 'mansao',
    W: W,
    H: H,
    playerStart: { x: 80, y: 560 },
    solids: solids,
    hazards: hazards,
    checkpoints: checkpoints,
    enemyDefs: enemyDefs,
    obstacleDefs: obstacleDefs,
    ninhos: ninhos,
    bossId: 'draculina',
    bossTriggerX: 6350,
    arena: { x: 6200, w: 1000 },
    reset: reset,
    update: update,
    drawBack: drawBack,
    drawSolids: drawSolids,
    drawFront: drawFront,
  });
})();
