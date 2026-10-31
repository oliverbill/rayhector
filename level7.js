// Fagulho: Lendas do Bosque — level7.js
// Fase 7, 'praia': A Praia. O jogador começa no alto de um penhasco de areia,
// ACIMA do nível do mar — a borda do penhasco é o fim do chão; depois dela só
// há água. Pular (ou simplesmente andar) pra fora da borda já é mergulhar: o
// capacete de mergulho (desenhado por cima dele o tempo todo nesta fase, em
// drawFront) está posto desde o início, e o PRIMEIRO mergulho afunda devagar
// (~10s, FG.level.afundoLento) direto até DEEP_FLOOR_Y — 5x mais fundo que
// uma praia comum teria — porque é NESSA profundidade que a fase INTEIRA se
// passa, sem trecho raso nenhum pra voltar depois. Dali em diante, o jogador
// pode tanto NADAR (longe do chão) quanto ANDAR normalmente, de pé, quando
// os pés tocam o leito — ver `swimming` em player.js, que só é verdade longe
// do chão. A fase INTEIRA depois do penhasco é debaixo d'água — um único
// retângulo gigante de FG.level.waters cobre o mar inteiro, e a física de
// natação do player.js (pensada para ilhas pontuais de água, como o riacho
// da fase 6) aguenta isso sem quebrar: não há fôlego nem afogamento no jogo.
//
// GEOMETRIA DO MAR: ao contrário das fases anteriores (chão todo desenhado à
// mão), o leito do mar e os recifes de coral são gerados por um gerador
// seedado (kit.makeRand) que roda uma vez no load — escrever à mão ~18000px
// de leito oscilando seria datilografia pura, não design. O gerador também
// encaixa inimigos, ouriços e lumis alinhados ao leito real, e os checkpoints
// caem exatamente em cima do leito gerado no instante em que o cruza. O
// penhasco inicial e a arena do chefão são as únicas partes desenhadas à
// mão — são as que precisam de acabamento.
//
// Inimigos desta fase (tubarao, peixeespada, e os gigantes baleia e orca —
// os outros bichos do desenho de referência, antes só decorativos ao fundo)
// moram em enemies.js, registrados no bossId 'francisco' — o Torpedão
// Francisco mora em boss7.js e se registra sozinho no load.
//
// Registra-se em FG.levels; quem escolhe a fase corrente é o engine.
// Nada aqui referencia FG.player/FG.engine/FG.audio no load — só dentro de
// funções chamadas em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  var kit = FG.levelkit;
  var S = kit.S, makeRand = kit.makeRand, makeCanvas = kit.makeCanvas;

  var VIEW_W = kit.VIEW_W, VIEW_H = kit.VIEW_H;
  var W = 20800, H = 3100;
  // CAM_Y_MAX aqui é só a referência do parallax vertical — FIXA, não o
  // fundo real do mundo (que agora é bem mais profundo por causa do poço de
  // entrada): se ela seguisse H, a camada distante desalinharia na fase
  // inteira, não só no poço.
  var CAM_Y_MAX = 360;
  // VISUAL_DEPTH: profundidade "normal" de referência para a cor da água e
  // os raios de sol (ver buildAll) — o degradê não estica até H; passado
  // VISUAL_DEPTH fica tudo igual ao azul mais escuro, porque é abismo, não
  // uma transição suave.
  var VISUAL_DEPTH = 900;

  function Hz(x, y, w, h, t) { return { x: x, y: y, w: w, h: h, t: t }; }

  // ---------------------------------------------------------------
  // GEOMETRIA — sólidos
  // k: 'a' = areia SECA do penhasco da praia (só no trecho inicial, fora
  //         d'água — é um paredão, não uma faixa rasa: o jogador fica
  //         ACIMA do nível do mar o tempo todo em cima dele),
  //    'g' = areia MOLHADA do leito do mar,
  //    'r' = recife de coral (coluna no leito OU pendurado do teto na fossa,
  //         OU a parede do poço de entrada).
  //
  // RITMO EM 3 TRECHOS:
  //  (1) x 0..780       O PENHASCO: areia seca, ACIMA do mar (superfície em
  //                     y=300; o penhasco desce até o fundo do mundo, parede
  //                     sólida — não dá pra nadar por baixo dele voltando).
  //                     A borda em x=780 é o fim do chão: depois dela só há
  //                     água, da superfície ao leito. Pular (ou só andar) pra
  //                     fora da borda é o mergulho.
  //  (2) x 780..19300   O MAR ABERTO: a fase INTEIRA vive no fundo profundo
  //                     (DEEP_FLOOR_Y — 5x mais fundo que uma praia comum
  //                     teria, ~2600px abaixo da superfície), sem trecho raso
  //                     nenhum — o primeiro mergulho já afunda direto até a
  //                     profundidade em que o resto da fase inteira se passa.
  //                     Gerado a partir da própria borda do penhasco: rasos
  //                     de coral no começo (ainda no fundo profundo), aperta
  //                     numa fossa de teto baixo no meio (x 7000..13000), e
  //                     termina denso de tubarões, peixes-espada, baleias e
  //                     orcas no "território" do Torpedão Francisco.
  //  (3) x 19300..20800 A ARENA DO CHEFÃO: fundo plano na mesma profundidade,
  //                     sem obstrução.
  // ---------------------------------------------------------------
  var CLIFF_X = 780;      // borda do penhasco: fim do chão, início do mergulho
  var SEA_SURFACE = 300;  // y da superfície do mar — o topo do penhasco fica nesta altura
  var SHALLOW_REF_Y = 820;                                // referência de "praia rasa comum", só pra calcular o 5x abaixo
  var DEEP_FLOOR_Y = SEA_SURFACE + (SHALLOW_REF_Y - SEA_SURFACE) * 5; // 5x mais fundo — a profundidade da fase INTEIRA
  var solids = [
    // ---- (1) o penhasco: topo em SEA_SURFACE, parede sólida até o fundo do
    // mundo — o jogador está ACIMA do mar o tempo todo em cima dele ----
    S(0, SEA_SURFACE, CLIFF_X, H - SEA_SURFACE, 'a'),
  ];

  var hazards = [];
  var checkpoints = [];
  var enemyDefs = [];
  var lumis = [];
  function lumiArc(cx, apexY, n, span, sag) { kit.lumiArc(lumis, cx, apexY, span, sag, n); }
  function lumiLine(x, y, n, dx) { kit.lumiLine(lumis, x, y, n, dx); }
  function lumiCol(x, y, n, dy) { kit.lumiCol(lumis, x, y, n, dy); }

  lumiLine(200, 260, 4, 60); // no alto do penhasco, acima da areia — o tutorial

  // um checkpoint logo depois da borda, já no fundo profundo — a primeira
  // garantia de progresso assim que o mergulho termina
  checkpoints.push({ x: CLIFF_X + 140, y: DEEP_FLOOR_Y });

  // ---------------------------------------------------------------
  // GERADOR DO LEITO — roda uma vez, no load. Seed fixa: o layout nunca
  // muda de partida pra partida, só varia visualmente a cada versão do
  // arquivo (se a seed ou as regras mudarem). Começa bem na borda do
  // penhasco, já na profundidade funda — a fase inteira é no fundo do mar.
  // ---------------------------------------------------------------
  (function buildOceano() {
    var r = makeRand(70031);
    var x = CLIFF_X;
    var floorY = DEEP_FLOOR_Y;
    var i = 0;
    var nextCP = x + 2600;
    while (x < 19300) {
      var segW = 420 + r() * 260;
      floorY += (r() * 2 - 1) * 70;
      floorY = Math.max(DEEP_FLOOR_Y - 60, Math.min(DEEP_FLOOR_Y + 60, floorY));
      solids.push(S(x, floorY, segW, H - floorY, 'g'));

      // recife ocasional por cima do leito — plataforma pra nadar por cima
      // ou se esconder atrás
      if (r() < 0.35) {
        var reefH = 90 + r() * 160;
        var reefW = 50 + r() * 70;
        var reefX = x + segW * (0.15 + r() * 0.55);
        solids.push(S(reefX, floorY - reefH, reefW, reefH, 'r'));
      }

      // coral pendurado do teto, só na FOSSA (x 7000..13000): aperta a
      // passagem e dá a sensação de caverna submersa sem fechar de vez
      if (x > 7000 && x < 13000 && r() < 0.3) {
        var ceilH = 90 + r() * 140;
        solids.push(S(x + segW * 0.25, 20, segW * 0.55, ceilH, 'r'));
      }

      // ouriço-do-mar no leito, de vez em quando
      if (r() < 0.22) {
        hazards.push(Hz(x + segW * 0.3, floorY - 30, 38 + r() * 18, 30, 'u'));
      }

      // inimigos: mais densos no território do Torpedão (x > 13000). De vez
      // em quando, em vez do bicho comum, sai um gigante (baleia ou orca) —
      // os outros bichos do desenho de referência, agora encontráveis de
      // verdade, não só passando decorativos ao fundo.
      var denso = x > 13000;
      if (r() < 0.05) {
        var gigante = r() < 0.5 ? 'baleia' : 'orca';
        enemyDefs.push({
          type: gigante,
          x: x + segW * 0.5,
          y: floorY - (120 + r() * 160),
          range: gigante === 'baleia' ? (140 + r() * 80) : (220 + r() * 120),
        });
      } else if (r() < (denso ? 0.5 : 0.28)) {
        var tipo = r() < 0.55 ? 'tubarao' : 'peixeespada';
        var def = {
          type: tipo,
          x: x + segW * 0.5,
          y: floorY - (80 + r() * 160),
          range: tipo === 'tubarao' ? (190 + r() * 150) : (260 + r() * 170),
        };
        if (tipo === 'peixeespada') def.speed = 620 + r() * 140;
        enemyDefs.push(def);
      }

      // lumis: um arco a cada 3 trechos, pra recompensar explorar o leito
      if (i % 3 === 0) {
        lumiArc(x + segW * 0.5, floorY - 200, 4, 150, 32);
      }

      // checkpoint exatamente em cima do leito real, a cada ~3400px
      if (x > nextCP) {
        checkpoints.push({ x: x, y: floorY });
        nextCP += 3400;
      }

      x += segW;
      i++;
    }
  })();

  // ---- (3) a arena do chefão: fundo plano, mesma profundidade funda do
  // resto da fase, território do Torpedão Francisco ----
  var ARENA_FLOOR = DEEP_FLOOR_Y;
  solids.push(S(19300, ARENA_FLOOR, 1500, H - ARENA_FLOOR, 'g'));
  checkpoints.push({ x: 19260, y: ARENA_FLOOR }); // logo antes do gatilho

  // ---------------------------------------------------------------
  // ÁGUA — um único retângulo cobrindo o mar inteiro, da BORDA do penhasco
  // (x=CLIFF_X) até a ponta do mundo. A SUPERFÍCIE do mar é plana em
  // SEA_SURFACE — a mesma altura do topo do penhasco, não o topo do mundo:
  // acima dela (y < SEA_SURFACE), mesmo já tendo passado a borda, é ar —
  // pular da beirada ainda é uma queda livre curta antes do baque n'água, e
  // só a partir da superfície é que a física de natação assume. Dali pra
  // baixo é tudo mar, até o fundo (y=H): sem fôlego, sem afogamento, sem
  // limite de tempo — o jogador só afunda (ou nada) até onde quiser.
  // ---------------------------------------------------------------
  var waters = [
    { x: CLIFF_X, y: SEA_SURFACE, w: W - CLIFF_X, h: H - SEA_SURFACE },
  ];

  // ---------------------------------------------------------------
  // DECORAÇÃO por sólido (pré-computada: nada de random por frame).
  // 'a' guarda capim-de-duna e conchinhas; 'g' guarda algas e
  // estrelas-do-mar; 'r' guarda anêmonas/pólipos coloridos.
  // ---------------------------------------------------------------
  var decor = [];
  (function () {
    var r = makeRand(20271027);
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      var d = { capim: [], conchas: [], algas: [], estrelas: [], polipos: [] };
      if (s.k === 'a') {
        var nc = Math.max(3, Math.floor(s.w / 60));
        for (var j = 0; j < nc; j++) {
          d.capim.push({ x: 8 + r() * Math.max(1, s.w - 16), h: 10 + r() * 14, lean: (r() * 2 - 1) * 0.6 });
        }
        var nco = Math.max(1, Math.floor(s.w / 220));
        for (var c = 0; c < nco; c++) {
          d.conchas.push({ x: 14 + r() * Math.max(1, s.w - 28), rot: r() * 6.28,
            cor: r() < 0.5 ? '#f2d8c0' : '#f8c0a8' });
        }
      } else if (s.k === 'g') {
        var na = Math.max(2, Math.floor(s.w / 90));
        for (var a2 = 0; a2 < na; a2++) {
          d.algas.push({ x: 10 + r() * Math.max(1, s.w - 20), h: 18 + r() * 26, blades: 2 + Math.floor(r() * 2) });
        }
        var ne = (s.w > 400 && r() < 0.6) ? 1 : 0;
        for (var e2 = 0; e2 < ne; e2++) {
          d.estrelas.push({ x: 30 + r() * Math.max(1, s.w - 60),
            cor: r() < 0.5 ? '#e8a030' : '#e85858' });
        }
      } else if (s.k === 'r') {
        var np = Math.max(2, Math.floor((s.w + s.h) / 50));
        for (var p2 = 0; p2 < np; p2++) {
          d.polipos.push({
            x: 4 + r() * Math.max(1, s.w - 8),
            y: 4 + r() * Math.max(1, s.h - 8),
            r: 3 + r() * 5,
            cor: ['#e85ba0', '#ff9850', '#c060f0', '#50d0c8'][Math.floor(r() * 4)],
          });
        }
      }
      decor.push(d);
    }
  })();

  // CARDUME DE FUNDO — silhuetas grandes passando ao longe (baleia, orca),
  // tabela fixa sem alocar por frame, no mesmo molde dos pássaros da floresta.
  // `off` sorteado só dentro do MAR (x >= CLIFF_X): são bichos d'água, nunca
  // cruzam por cima da areia seca.
  var cetaceos = [];
  (function () {
    var r = makeRand(5301);
    var bichos = [
      { tipo: 'baleia', w: 240, h: 64, cor: 'rgba(60,75,88,0.55)' },
      { tipo: 'orca', w: 210, h: 58, cor: 'rgba(16,22,28,0.6)' },
      { tipo: 'baleia', w: 180, h: 48, cor: 'rgba(60,75,88,0.45)' },
    ];
    for (var i = 0; i < bichos.length; i++) {
      cetaceos.push({
        tipo: bichos[i].tipo, w: bichos[i].w, h: bichos[i].h, cor: bichos[i].cor,
        // cruzam perto da profundidade em que a fase inteira se passa
        // (DEEP_FLOOR_Y), não lá em cima perto da superfície — senão nunca
        // cruzariam a vista de um jogador que nunca sobe até lá
        y: DEEP_FLOOR_Y - 500 + r() * 380,
        v: 16 + r() * 14,
        ph: r() * 6.28,
        dir: r() < 0.5 ? 1 : -1,
        off: CLIFF_X + r() * (W - CLIFF_X),
      });
    }
  })();

  // BOLHAS AMBIENTE — sobem o tempo todo, em ciclo (posição por módulo do
  // tempo, nada de array crescendo). x sorteado só dentro do mar, mesma
  // razão dos cetáceos; y0 parte de DEEP_FLOOR_Y — nascem perto do leito de
  // verdade, não de uma profundidade que o jogador nunca mais visita.
  var bolhas = [];
  (function () {
    var r = makeRand(9091);
    for (var i = 0; i < 26; i++) {
      bolhas.push({ x: CLIFF_X + r() * (W - CLIFF_X), y0: DEEP_FLOOR_Y + 60, per: 4 + r() * 5, ph: r() * 6.28, s: 1.5 + r() * 3 });
    }
  })();

  // GAIVOTAS — voando sobre o penhasco, sempre dentro da faixa de areia (x
  // entre 0 e CLIFF_X+120, pra ainda se ver uma saindo de cena rumo ao mar
  // sem nunca cruzar o horizonte inteiro). Mesmo molde dos pássaros da
  // floresta: tabela fixa, x computado do tempo em módulo.
  var gaivotas = [];
  (function () {
    var r = makeRand(4201);
    for (var i = 0; i < 5; i++) {
      gaivotas.push({
        y: 50 + r() * 140,
        v: 22 + r() * 26,
        ph: r() * 6.28,
        dir: r() < 0.5 ? 1 : -1,
        off: r() * (CLIFF_X + 240),
        s: 0.8 + r() * 0.5,
      });
    }
  })();

  // FAÍSCAS — pool fixo do kit.
  var sparks = kit.makeSparks(48);

  // ---------------------------------------------------------------
  // OFFSCREENS — fundo d'água (gradiente por profundidade + raios de luz),
  // camada distante de recife em silhueta, vinheta.
  // ---------------------------------------------------------------
  var built = false;
  var ceuSpr, aguaSpr, farL, vig, lumiSpr;
  var LAYER_H = 500;

  function buildAll() {
    if (built) return;
    built = true;

    // CÉU do penhasco: azul claro de dia de praia, com o sol baixo no
    // horizonte — só aparece atrás da areia seca (x < CLIFF_X); o mar nunca
    // o mostra, fica coberto pelo recorte da coluna d'água no draw.
    ceuSpr = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, '#5ec8f0');
      gr.addColorStop(0.55, '#a8e4f5');
      gr.addColorStop(0.82, '#e8f6e0');
      gr.addColorStop(1, '#d8c88a');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      // sol baixo, à esquerda — um disco quente com halo suave
      var sx = VIEW_W * 0.22, sy = VIEW_H * 0.42;
      var sg = g.createRadialGradient(sx, sy, 4, sx, sy, 140);
      sg.addColorStop(0, 'rgba(255,250,210,0.95)');
      sg.addColorStop(0.3, 'rgba(255,235,160,0.55)');
      sg.addColorStop(1, 'rgba(255,220,140,0)');
      g.fillStyle = sg;
      g.beginPath(); g.arc(sx, sy, 140, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff6d8';
      g.beginPath(); g.arc(sx, sy, 34, 0, Math.PI * 2); g.fill();
    })(ceuSpr.getContext('2d'));

    // COLUNA D'ÁGUA inteira (altura H, não só VIEW_H): perto da superfície é
    // azul-turquesa claro com raios de sol, afunda pra azul-marinho quase
    // preto na profundidade normal (VISUAL_DEPTH) — um canvas só, amostrado
    // por cam.y no draw. Passado VISUAL_DEPTH (o poço de entrada vai bem
    // além disso) a cor NÃO continua escurecendo: fica no mesmo azul mais
    // escuro até o fundo — é abismo, não uma transição suave infinita.
    aguaSpr = makeCanvas(VIEW_W, H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, H);
      var vdFrac = VISUAL_DEPTH / H;
      gr.addColorStop(0, '#5fd4e0');
      gr.addColorStop(0.12 * vdFrac, '#2fa8c8');
      gr.addColorStop(0.35 * vdFrac, '#1872a8');
      gr.addColorStop(0.62 * vdFrac, '#0d4578');
      gr.addColorStop(0.85 * vdFrac, '#081f44');
      gr.addColorStop(vdFrac, '#040f26');
      gr.addColorStop(1, '#040f26');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, H);

      // raios de sol, só na metade de cima da profundidade normal — somem
      // bem antes do poço de entrada
      var r = makeRand(61);
      g.globalCompositeOperation = 'lighter';
      var raioY = VISUAL_DEPTH * 0.55;
      for (var i = 0; i < 7; i++) {
        var rx = 40 + r() * (VIEW_W - 80), rw = 30 + r() * 70;
        var rg = g.createLinearGradient(rx, 0, rx + 90, raioY);
        rg.addColorStop(0, 'rgba(255,255,230,0.22)');
        rg.addColorStop(0.5, 'rgba(220,250,255,0.08)');
        rg.addColorStop(1, 'rgba(220,250,255,0)');
        g.fillStyle = rg;
        g.beginPath();
        g.moveTo(rx, 0);
        g.lineTo(rx + rw, 0);
        g.lineTo(rx + rw + 90, raioY);
        g.lineTo(rx + 90, raioY);
        g.closePath();
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    })(aguaSpr.getContext('2d'));

    farL = makeCanvas(2400, LAYER_H);
    paintFar(farL.getContext('2d'));

    // vinheta: mais escura embaixo, dando peso à profundidade
    vig = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 260, VIEW_W / 2, VIEW_H / 2, 640);
      gr.addColorStop(0, 'rgba(2,8,18,0)');
      gr.addColorStop(1, 'rgba(2,8,18,0.4)');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    })(vig.getContext('2d'));

    lumiSpr = kit.makeLumiSprite();
  }

  // --- camada distante: silhuetas de recife e rochas submersas ---
  function paintFar(g) {
    var r = makeRand(8301);
    var base = LAYER_H;
    g.fillStyle = 'rgba(10,40,55,0.55)';
    for (var i = 0; i < 16; i++) {
      var px = r() * 2400, pw = 60 + r() * 140, ph = 60 + r() * 180;
      g.beginPath();
      g.moveTo(px, base);
      g.quadraticCurveTo(px + pw * 0.3, base - ph, px + pw * 0.5, base - ph * 1.1);
      g.quadraticCurveTo(px + pw * 0.7, base - ph, px + pw, base);
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(8,30,42,0.7)';
    for (var j = 0; j < 10; j++) {
      var qx = r() * 2400, qw = 40 + r() * 90, qh = 30 + r() * 90;
      g.fillRect(qx, base - qh, qw, qh);
    }
  }

  function drawLayer(ctx, layer, f, cam) {
    var lw = layer.width;
    var y = VIEW_H - layer.height + (CAM_Y_MAX - cam.y) * f;
    var off = -((cam.x * f) % lw);
    if (off > 0) off -= lw;
    ctx.drawImage(layer, off, y);
    if (off + lw < VIEW_W) ctx.drawImage(layer, off + lw, y);
  }

  // O MERGULHO INICIAL — a primeira vez que o jogador entra na água (pulando
  // da beirada do penhasco) dispara ~10s de afundar pesado e lento
  // (FG.level.afundoLento, lido pelo player.js — um número em px/s, não só
  // um booleano) em vez do nado normal de combate, até alcançar a
  // profundidade em que a fase inteira se passa. A taxa é calculada da
  // própria profundidade: DEEP_FLOOR_Y ÷ AFUNDA_DUR, então os ~10s sempre
  // levam exatamente até lá, por mais fundo que DEEP_FLOOR_Y fique no
  // futuro. Só acontece uma vez por partida: morrer e voltar num checkpoint
  // debaixo d'água não repete o mergulho cinematográfico.
  var mergulhoFeito = false;
  var afundaTimer = 0;
  var AFUNDA_DUR = 10;
  var AFUNDA_TAXA = (DEEP_FLOOR_Y - SEA_SURFACE) / AFUNDA_DUR;

  // ---------------------------------------------------------------
  // RESET — o engine chama ao (re)carregar a fase.
  // ---------------------------------------------------------------
  function reset() {
    for (var i = 0; i < lumis.length; i++) lumis[i].taken = false;
    kit.apagarFaiscas(sparks);
    mergulhoFeito = false;
    afundaTimer = 0;
    FG.level.afundoLento = false;
  }

  // ---------------------------------------------------------------
  // UPDATE — coleta de lumis e o cronômetro do mergulho inicial; o resto da
  // fase é geometria estática mais os bichos (enemies.js) e o chefão
  // (boss7.js).
  // ---------------------------------------------------------------
  function update(dt) {
    kit.coletarLumis(lumis, sparks, dt);

    var p = FG.player;
    if (p) {
      if (!mergulhoFeito && p.inWater) {
        mergulhoFeito = true;
        afundaTimer = AFUNDA_DUR;
      }
      if (afundaTimer > 0) {
        afundaTimer -= dt;
        FG.level.afundoLento = AFUNDA_TAXA;
      } else {
        FG.level.afundoLento = false;
      }
    }
  }

  // ---------------------------------------------------------------
  // DRAW BACK — céu/sol/gaivotas por trás da areia seca, coluna d'água
  // (amostrada por profundidade) recortada só a partir da borda do penhasco,
  // ondas na linha da superfície, recife distante, cardume de fundo
  // (baleia/orca passando) e bolhas subindo.
  // ---------------------------------------------------------------
  function drawBack(ctx, cam) {
    buildAll();
    var t = FG.engine.time;

    // o céu fica por baixo de tudo — onde o recorte do mar não cobrir, é o
    // que aparece atrás da areia
    ctx.drawImage(ceuSpr, 0, 0);

    // gaivotas: só sobrevoam a faixa de areia (ver geração da tabela) —
    // desenhadas ANTES do recorte do mar, pra nunca "voar" por cima da água
    ctx.save();
    ctx.strokeStyle = 'rgba(40,40,46,0.8)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    var GSPAN = CLIFF_X + 600;
    for (var gu = 0; gu < gaivotas.length; gu++) {
      var gv = gaivotas[gu];
      var gx = ((gv.off + gv.dir * gv.v * t) % GSPAN + GSPAN) % GSPAN - 300 - cam.x * 0.3;
      var gy = gv.y + Math.sin(t * 1.1 + gv.ph) * 12 - cam.y * 0.25;
      if (gx < -40 || gx > VIEW_W + 40) continue;
      var asa = Math.sin(t * 6 + gv.ph) * 6 * gv.s;
      ctx.beginPath();
      ctx.moveTo(gx - 10 * gv.s, gy - asa);
      ctx.quadraticCurveTo(gx, gy + 3 * gv.s, gx + 10 * gv.s, gy - asa);
      ctx.stroke();
    }
    ctx.restore();

    // a coluna d'água (e tudo que vive nela) só existe a partir da borda do
    // penhasco E abaixo da linha da superfície — ACIMA dela, mesmo já
    // passado o penhasco, continua sendo o mesmo horizonte da areia (céu,
    // sol, gaivotas): o recorte usa as duas bordas, não só a de x.
    var screenCliffX = CLIFF_X - cam.x;
    var surfY = SEA_SURFACE - cam.y;
    var clipY = Math.max(0, surfY);
    if (screenCliffX < VIEW_W && clipY < VIEW_H) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(Math.max(0, screenCliffX), clipY, VIEW_W - Math.max(0, screenCliffX), VIEW_H - clipY);
      ctx.clip();

      // amostra a coluna d'água pela posição vertical real da câmera
      ctx.drawImage(aguaSpr, 0, Math.max(0, Math.min(H - VIEW_H, cam.y)), VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

      // ondas na linha da superfície (y=SEA_SURFACE), só se estiver à vista
      if (surfY > -24 && surfY < VIEW_H + 24) {
        ctx.save();
        ctx.strokeStyle = 'rgba(235,250,255,0.8)'; ctx.lineWidth = 2.6;
        ctx.beginPath();
        for (var wx2 = Math.max(0, screenCliffX); wx2 <= VIEW_W; wx2 += 14) {
          var wy2 = surfY + Math.sin(t * 1.8 + (wx2 + cam.x) * 0.045) * 5
            + Math.sin(t * 0.9 + (wx2 + cam.x) * 0.012) * 7;
          if (wx2 === Math.max(0, screenCliffX)) ctx.moveTo(wx2, wy2); else ctx.lineTo(wx2, wy2);
        }
        ctx.stroke();
        // uma segunda crista, mais fraca e defasada, dando corpo à ondulação
        ctx.strokeStyle = 'rgba(180,230,245,0.45)'; ctx.lineWidth = 4;
        ctx.beginPath();
        for (var wx3 = Math.max(0, screenCliffX); wx3 <= VIEW_W; wx3 += 14) {
          var wy3 = surfY + 10 + Math.sin(t * 1.5 + 2 + (wx3 + cam.x) * 0.03) * 6;
          if (wx3 === Math.max(0, screenCliffX)) ctx.moveTo(wx3, wy3); else ctx.lineTo(wx3, wy3);
        }
        ctx.stroke();
        // espuminha branca nas cristas mais altas
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        for (var wf = Math.max(0, screenCliffX); wf <= VIEW_W; wf += 34) {
          var wfy = surfY + Math.sin(t * 1.8 + (wf + cam.x) * 0.045) * 5
            + Math.sin(t * 0.9 + (wf + cam.x) * 0.012) * 7;
          ctx.beginPath(); ctx.ellipse(wf, wfy - 1, 5, 1.6, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      drawLayer(ctx, farL, 0.22, cam);

      // cardume de fundo: baleia e orca cruzando a vista devagar, sempre de
      // perfil, batendo a cauda. O recorte do mar (acima) já garante que
      // nunca aparecem do lado da areia, então a posição pode ciclar livre
      // num span próprio, com o mesmo parallax fraco (×0.35) de sempre.
      var SPAN = W + 600;
      for (var b = 0; b < cetaceos.length; b++) {
        var cb = cetaceos[b];
        var cx = ((cb.off + cb.dir * cb.v * t) % SPAN + SPAN) % SPAN - 300 - cam.x * 0.35;
        var cy = cb.y + Math.sin(t * 0.3 + cb.ph) * 18 - cam.y * 0.3;
        if (cx < -400 || cx > VIEW_W + 400) continue;
        drawCetaceo(ctx, cx, cy, cb, t);
      }

      // bolhas subindo, em ciclo — reaparecem no fundo assim que saem por cima
      ctx.fillStyle = 'rgba(220,250,255,0.5)';
      for (var i = 0; i < bolhas.length; i++) {
        var bo = bolhas[i];
        var prog = ((t + bo.ph) % bo.per) / bo.per; // 0 no fundo, 1 no topo
        var wx = bo.x - cam.x + Math.sin(t * 1.4 + bo.ph) * 10;
        var wy = bo.y0 - prog * (VISUAL_DEPTH + 60) - cam.y;
        if (wx < -10 || wx > VIEW_W + 10 || wy < -10 || wy > VIEW_H + 10) continue;
        ctx.globalAlpha = 0.25 + 0.4 * Math.sin(prog * Math.PI);
        ctx.beginPath();
        ctx.arc(wx, wy, bo.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.restore();
    }
  }

  function drawCetaceo(ctx, cx, cy, cb, t) {
    var dir = cb.dir;
    var bat = Math.sin(t * 1.6 + cb.ph) * 10;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(dir, 1);
    ctx.fillStyle = cb.cor;
    ctx.beginPath();
    ctx.moveTo(-cb.w * 0.5, 0);
    ctx.quadraticCurveTo(-cb.w * 0.2, -cb.h * 0.5, cb.w * 0.3, -cb.h * 0.3);
    ctx.quadraticCurveTo(cb.w * 0.5, -cb.h * 0.05, cb.w * 0.46, cb.h * 0.08);
    ctx.quadraticCurveTo(cb.w * 0.1, cb.h * 0.42, -cb.w * 0.4, cb.h * 0.3);
    ctx.closePath();
    ctx.fill();
    // cauda batendo
    ctx.beginPath();
    ctx.moveTo(-cb.w * 0.48, cb.h * 0.05);
    ctx.lineTo(-cb.w * 0.68, -cb.h * 0.3 + bat * 0.4);
    ctx.lineTo(-cb.w * 0.58, cb.h * 0.1);
    ctx.lineTo(-cb.w * 0.68, cb.h * 0.5 + bat * 0.4);
    ctx.closePath();
    ctx.fill();
    if (cb.tipo === 'orca') {
      // mancha branca da orca
      ctx.fillStyle = 'rgba(230,240,245,0.5)';
      ctx.beginPath();
      ctx.ellipse(cb.w * 0.05, cb.h * 0.12, cb.w * 0.18, cb.h * 0.14, -0.2, 0, Math.PI * 2);
      ctx.fill();
      // barbatana dorsal alta
      ctx.fillStyle = cb.cor;
      ctx.beginPath();
      ctx.moveTo(-cb.w * 0.02, -cb.h * 0.3);
      ctx.lineTo(cb.w * 0.04, -cb.h * 0.95);
      ctx.lineTo(cb.w * 0.16, -cb.h * 0.26);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------
  // DRAW SOLIDS — leito do mar, recifes, areia da praia, ouriços,
  // checkpoints, lumis e faíscas.
  // ---------------------------------------------------------------
  function drawSolids(ctx, cam) {
    buildAll();
    var t = FG.engine.time;
    var x0 = cam.x - 220, x1 = cam.x + VIEW_W + 220;

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.x > x1 || s.x + s.w < x0) continue;
      var d = decor[i];
      if (s.k === 'a') drawAreia(ctx, s, d);
      else if (s.k === 'r') drawRecife(ctx, s, d, t);
      else drawFundo(ctx, s, d, t);
    }

    for (var h2 = 0; h2 < hazards.length; h2++) {
      var hz2 = hazards[h2];
      if (hz2.x > x1 || hz2.x + hz2.w < x0) continue;
      drawOuricoo(ctx, hz2, t);
    }

    for (var c = 0; c < checkpoints.length; c++) {
      var cp = checkpoints[c];
      if (cp.x > x1 || cp.x < x0) continue;
      drawBoiaCheckpoint(ctx, cp, FG.engine.checkpoint.x === cp.x, t);
    }

    kit.desenharLumis(ctx, cam, lumis, lumiSpr, t);
    kit.desenharFaiscas(ctx, sparks);

    ctx.restore();
  }

  // --- areia seca da praia: tom quente, capim-de-duna e conchinhas ---
  function drawAreia(ctx, s, d) {
    var g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    g.addColorStop(0, '#e8cf98');
    g.addColorStop(0.4, '#d8ba7a');
    g.addColorStop(1, '#a8884e');
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = 'rgba(255,250,230,0.5)';
    ctx.fillRect(s.x, s.y, s.w, 4);

    ctx.strokeStyle = '#b89848'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < d.capim.length; i++) {
      var cp = d.capim[i];
      ctx.moveTo(s.x + cp.x, s.y + 2);
      ctx.quadraticCurveTo(s.x + cp.x + cp.lean * 8, s.y - cp.h * 0.6, s.x + cp.x + cp.lean * 12, s.y - cp.h);
    }
    ctx.stroke();

    for (var j = 0; j < d.conchas.length; j++) {
      var co = d.conchas[j];
      ctx.save();
      ctx.translate(s.x + co.x, s.y - 2);
      ctx.rotate(co.rot);
      ctx.fillStyle = co.cor;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      for (var k = -2; k <= 2; k++) ctx.lineTo(k * 2.4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // --- leito de areia molhada: mais escuro e frio que a praia, com algas
  // ondulando e estrelas-do-mar paradas ---
  function drawFundo(ctx, s, d, t) {
    var g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    g.addColorStop(0, '#b8a468');
    g.addColorStop(0.4, '#7c7048');
    g.addColorStop(1, '#3c3626');
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = 'rgba(200,220,210,0.25)';
    ctx.fillRect(s.x, s.y, s.w, 4);

    ctx.strokeStyle = '#3a8c68'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    for (var i = 0; i < d.algas.length; i++) {
      var al = d.algas[i];
      for (var b = 0; b < al.blades; b++) {
        var sway = Math.sin(t * 1.3 + al.x * 0.04 + b) * 7;
        ctx.beginPath();
        ctx.moveTo(s.x + al.x + b * 5, s.y + 2);
        ctx.quadraticCurveTo(s.x + al.x + b * 5 + sway, s.y - al.h * 0.6,
          s.x + al.x + b * 5 + sway * 1.6, s.y - al.h);
        ctx.stroke();
      }
    }

    for (var j = 0; j < d.estrelas.length; j++) {
      var es = d.estrelas[j];
      drawEstrela(ctx, s.x + es.x, s.y - 4, 9, es.cor);
    }
  }

  function drawEstrela(ctx, cx, cy, r, cor) {
    ctx.fillStyle = cor;
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      var a2 = a + Math.PI / 5;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5);
      ctx.lineTo(cx + Math.cos(a2) * r * 0.42, cy + Math.sin(a2) * r * 0.5 * 0.42);
    }
    ctx.closePath();
    ctx.fill();
  }

  // --- recife de coral: massa rochosa clara com pólipos/anêmonas coloridos
  // salpicados — a variedade de cor que distingue o recife do leito liso ---
  function drawRecife(ctx, s, d, t) {
    var g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    g.addColorStop(0, '#d8c8a8');
    g.addColorStop(0.5, '#b09868');
    g.addColorStop(1, '#705a3c');
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = 'rgba(255,250,235,0.25)';
    ctx.fillRect(s.x, s.y, s.w, 3);

    for (var i = 0; i < d.polipos.length; i++) {
      var po = d.polipos[i];
      var pulse = 1 + Math.sin(t * 2 + po.x * 0.1) * 0.12;
      ctx.fillStyle = po.cor;
      ctx.beginPath();
      ctx.arc(s.x + po.x, s.y + po.y, po.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      for (var k = 0; k < 5; k++) {
        var a = (k / 5) * Math.PI * 2 + t * 0.6;
        ctx.beginPath();
        ctx.moveTo(s.x + po.x, s.y + po.y);
        ctx.lineTo(s.x + po.x + Math.cos(a) * po.r * 1.8, s.y + po.y + Math.sin(a) * po.r * 1.8);
        ctx.stroke();
      }
    }
  }

  // --- ouriço-do-mar: bolota escura toda de espinhos pretos, parado no
  // leito — hazard estático, não precisa de animação além do tremor leve ---
  function drawOuricoo(ctx, hz, t) {
    var cx = hz.x + hz.w / 2, cy = hz.y + hz.h * 0.6;
    var trem = Math.sin(t * 5 + hz.x) * 0.6;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#241c28';
    ctx.beginPath();
    ctx.ellipse(0, 0, hz.w * 0.42, hz.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#120e16'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    var n = 14;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + trem * 0.05;
      var r1 = hz.w * 0.4, r2 = hz.w * 0.75;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.9);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2 * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- checkpoint: boia de resgate presa a uma âncora cravada no leito,
  // acendendo quando é o checkpoint ativo — mesma ideia do totem da
  // floresta, trocado pela utilaria de praia ---
  function drawBoiaCheckpoint(ctx, cp, lit, t) {
    var x = cp.x, y = cp.y;
    var bob = Math.sin(t * 1.8) * 4;
    // corrente até a âncora no leito
    ctx.strokeStyle = 'rgba(180,190,195,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y - 86 + bob);
    ctx.stroke();
    // âncora
    ctx.fillStyle = '#3a3a3e';
    ctx.fillRect(x - 3, y - 14, 6, 12);
    ctx.beginPath();
    ctx.arc(x - 8, y - 2, 7, 0.2, Math.PI - 0.2);
    ctx.arc(x + 8, y - 2, 7, 0.2, Math.PI - 0.2, true);
    ctx.fill();
    // boia listrada
    ctx.save();
    ctx.translate(x, y - 96 + bob);
    ctx.fillStyle = lit ? '#ff5050' : '#8a4040';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lit ? '#fff6e0' : '#9a9080';
    for (var i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 16, (i / 4) * Math.PI * 2, (i / 4) * Math.PI * 2 + Math.PI / 4);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath(); ctx.ellipse(0, 0, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (lit) {
      ctx.save();
      ctx.shadowColor = '#ffd080';
      ctx.shadowBlur = 22;
      ctx.fillStyle = 'rgba(255,220,150,0.6)';
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------
  // DRAW FRONT — o capacete de mergulho do jogador E do MurphOliver (por
  // cima dos dois o tempo todo, nesta fase) e a vinheta de profundidade.
  // ---------------------------------------------------------------
  function drawFront(ctx, cam) {
    buildAll();
    var p = FG.player;
    if (p) drawCapacete(ctx, cam, p.x + p.w / 2, p.y + p.h * 0.28, p.w * 0.62);
    // o MurphOliver também mergulha de capacete — menor, do tamanho dele.
    // Só desenha se ele já foi resgatado (FG.companion.active) nesta
    // partida: sem resgate na floresta, ele nem aparece aqui.
    var m = FG.companion;
    if (m && m.active) drawCapacete(ctx, cam, m.x, m.y - 16, 22);
    ctx.drawImage(vig, 0, 0);
  }

  // Cúpula de vidro redonda com aro de metal rebitado e uma mangueira de ar
  // saindo de cima — desenhada em coordenadas de MUNDO, sobre a cabeça de
  // quem for passado (jogador OU MurphOliver), todo frame. Não é um pickup
  // nem muda física nenhuma: é o figurino da fase, pedido explicitamente
  // ("pula com um capacete de mergulho" / "add um capacete pra ele também");
  // a fase inteira é submersa, então nenhum dos dois tira.
  function drawCapacete(ctx, cam, wx, wy, r) {
    var cx = wx - cam.x;
    var cy = wy - cam.y;
    ctx.save();
    ctx.translate(cx, cy);

    // mangueira de ar subindo e se perdendo em bolhas
    ctx.strokeStyle = 'rgba(200,200,205,0.7)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(r * 0.5, -r * 0.3);
    ctx.quadraticCurveTo(r * 1.1, -r * 1.1, r * 0.7, -r * 1.9);
    ctx.stroke();

    // cúpula de vidro
    var g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
    g.addColorStop(0, 'rgba(255,255,255,0.4)');
    g.addColorStop(0.5, 'rgba(200,235,240,0.18)');
    g.addColorStop(1, 'rgba(160,200,210,0.08)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,240,245,0.55)'; ctx.lineWidth = 1.6;
    ctx.stroke();

    // aro de metal com rebites, na base
    ctx.fillStyle = '#7a8088';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.78, r * 0.92, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a4e54';
    for (var i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(i * r * 0.26, r * 0.78, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------
  // API pública — a fase entra no registro na ordem do index.html.
  // ---------------------------------------------------------------
  FG.levels = FG.levels || [];
  FG.levels.push({
    id: 'praia',
    nome: 'A Praia',
    musica: 'praia',
    W: W,
    H: H,
    playerStart: { x: 60, y: 150 }, // cai no topo do penhasco — bem acima do mar (SEA_SURFACE=300)
    solids: solids,
    hazards: hazards,
    waters: waters,
    checkpoints: checkpoints,
    enemyDefs: enemyDefs,
    obstacleDefs: [],
    bossId: 'francisco',
    bossTriggerX: 19420,
    arena: { x: 19300, w: 1500 },
    reset: reset,
    update: update,
    drawBack: drawBack,
    drawSolids: drawSolids,
    drawFront: drawFront,
  });
})();
