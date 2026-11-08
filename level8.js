// Fagulho: Lendas do Bosque — level8.js
// Fase 8, 'lava': As Terras de Lava. Baseada num desenho de referência:
// vulcões PRETOS ao fundo cuspindo lava laranja, DRAGÕES DE GELO azuis
// cruzando o céu — tanto lá longe em silhueta quanto sobrevoando a própria
// fase — e o chão... não existe. A fase INTEIRA é feita de pilares de pedra
// vulcânica (basalto) brotando de um MAR DE LAVA que cobre o mundo de
// LAVA_Y até o fundo. Tema de Nether: fantasmas de chama, piglins de espada
// dourada, ghasts cuspidores e blazes moram em enemies.js; os STRIDERS —
// as criaturas que andam NA lava e servem de balsa viva — moram em
// obstacles.js. O chefão ('verola') espera na arena de pedra do fim.
//
// GEOMETRIA: como no level7, o miolo da fase sai de um gerador seedado
// (kit.makeRand) que roda uma vez no load — escrever à mão ~9000px de
// pilares seria datilografia, não design. As regras do gerador garantem o
// que a física do player exige: vão ≤ ~330px entre pilares consecutivos
// (pulo duplo cobre ~355 sem planar — folga de verdade, não limite) e
// degrau de subida ≤ ~120px (o teste reach.js marca como "duro" qualquer
// entrada acima de 150). As EXCEÇÕES deliberadas são os VÃOS LARGOS
// (~600-700px): neles vive um strider fazendo o vai-e-vem como travessia
// confortável, e — porque plataforma móvel não entra na geometria estática
// que o reach.js enxerga — uma PEDRA RASANTE semi-emersa no meio do vão é
// a rota arriscada que mantém o caminho fisicamente possível sem strider:
// dois pulos curtos colado na lava em vez de uma carona tranquila.
//
// Registra-se em FG.levels; quem escolhe a fase corrente é o engine.
// Nada aqui referencia FG.player/FG.engine/FG.audio no load — só dentro
// de funções chamadas em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  // Único acoplamento de load permitido no projeto: kit → fase.
  var kit = FG.levelkit;
  var S = kit.S, makeRand = kit.makeRand, makeCanvas = kit.makeCanvas;

  var VIEW_W = kit.VIEW_W, VIEW_H = kit.VIEW_H;
  var W = 13600, H = 1100;
  var CAM_Y_MAX = H - VIEW_H;   // 560 — referência do parallax vertical

  // A superfície do mar de lava. Dela até o fundo (H) é tudo lava; o
  // engine pune contato com os hazards (1 de dano) e cair além de H+120
  // (2 de dano + respawn), então a banda de hazard é um retângulo por vão
  // — não precisa fatiar a lava inteira.
  var LAVA_Y = 880;

  function Hz(x, y, w, h, t) { return { x: x, y: y, w: w, h: h, t: t }; }

  // ---------------------------------------------------------------
  // GEOMETRIA — sólidos
  // k: 'r' = pilar de basalto (todos os apoios da fase: nascem no topo e
  //         descem ATÉ O FUNDO do mundo, emergindo da lava — é o que faz o
  //         vão entre dois pilares ser lava visível de verdade, sem espaço
  //         "embaixo da plataforma" pra cair sem castigo),
  //    'p' = pedra rasante: pilar baixinho quase no nível da lava, o apoio
  //         arriscado no meio dos vãos largos dos striders.
  //
  // RITMO EM 4 TRECHOS:
  //  (1) x 0..3000       TUTORIAL: pilares largos e próximos, vãos curtos
  //                      (≤280px), um fantasma de chama manso.
  //  (2) x 3000..6200    A TRAVESSIA: os vãos largos com striders (e as
  //                      pedras rasantes), ghasts no alto dos vãos.
  //  (3) x 6200..9600    AS ILHAS: pilares menores subindo e descendo,
  //                      blazes pairando e mais um vão de strider.
  //  (4) x 9600..12100   A RETA FINAL: pilares largos de novo, densos de
  //                      piglins, até o checkpoint da porta da arena.
  //  ARENA x 12100..13600: pedra GRANDE e plana (topo 820) do chefão.
  // ---------------------------------------------------------------
  var solids = [];
  var hazards = [];
  var checkpoints = [];
  var enemyDefs = [];
  var obstacleDefs = [];
  var lumis = [];
  function lumiLine(x, y, n, dx) { kit.lumiLine(lumis, x, y, n, dx); }
  function lumiArc(cx, apexY, n, span, sag) { kit.lumiArc(lumis, cx, apexY, span, sag, n); }

  // ---- (1) o tutorial, à mão: é a cara da fase, merece acabamento ----
  solids.push(S(0, 780, 720, H - 780, 'r'));        // plataforma inicial generosa
  solids.push(S(950, 800, 520, H - 800, 'r'));      // vão 230
  solids.push(S(1720, 760, 520, H - 760, 'r'));     // vão 250
  solids.push(S(2520, 790, 480, H - 790, 'r'));     // vão 280

  lumiLine(180, 720, 4, 60);                        // a linha de boas-vindas
  lumiArc(835, 700, 4, 190, 38);                    // arcos convidando cada pulo
  lumiArc(1595, 680, 4, 200, 38);
  lumiArc(2410, 690, 4, 220, 40);
  lumiLine(1800, 700, 3, 50);

  enemyDefs.push({ type: 'fantasmachama', x: 1180, y: 700, range: 110 });
  enemyDefs.push({ type: 'fantasmachama', x: 2740, y: 680, range: 120 });

  checkpoints.push({ x: 2760, y: 790 });            // o 1º, no fim do tutorial

  // ---------------------------------------------------------------
  // GERADOR DO MIOLO — roda uma vez, no load, com seed fixa: o layout é o
  // mesmo em toda partida e toda máquina. `marks` são os x aproximados dos
  // vãos largos: cruzou a marca, o próximo passo é um vão de strider.
  // ---------------------------------------------------------------
  (function buildMiolo() {
    var r = makeRand(88017);
    var x = 3000;          // onde o tutorial termina
    var topo = 790;        // topo do último pilar do tutorial
    var marks = [3150, 4650, 6900, 9900];
    var mi = 0;
    var cpMarks = [5400, 8300, 10700];   // checkpoints do miolo
    var ci = 0;
    var moverMarks = [5200, 8600];       // onde entram as 2 plataformas móveis
    var vi = 0;

    while (x < 11200) {
      // ---- vão LARGO com strider + pedra rasante ----
      // Ancorado no FIM REAL do último pilar (não em `x`, que já traz o
      // vão normal embutido): senão o pulo até a pedra rasante somaria
      // vão normal + g1 e passaria do que o pulo duplo cobre.
      if (mi < marks.length && x >= marks[mi]) {
        mi++;
        var antes = solids[solids.length - 1];
        x = antes.x + antes.w;
        var g1 = 240 + r() * 50;                 // pilar → pedra rasante
        var sw = 110 + r() * 40;                 // a pedra em si
        var g2 = 230 + r() * 50;                 // pedra → pilar seguinte
        var sx = x + g1;
        solids.push(S(sx, 846, sw, H - 846, 'p'));
        var nx = sx + sw + g2;
        // o strider patrulha o vão inteiro: range é meia-amplitude, então
        // nos dois sentidos a balsa alcança as duas margens com folga
        obstacleDefs.push({
          type: 'strider',
          x: x + (nx - x) / 2,
          y: LAVA_Y,
          range: (nx - x) / 2 - 50,
          speed: 62 + r() * 26,
        });
        // ghast guardando o alto do vão — o tiro vem de cima, a balsa é
        // lenta: ou se desvia na pedra rasante, ou se reza na carona
        enemyDefs.push({
          type: 'ghast',
          x: x + (nx - x) / 2,
          y: 460 + r() * 120,
          range: 170 + r() * 80,
        });
        // arcos de pulo REAIS (pilar→pedra e pedra→pilar), não sobre o
        // strider: lumi em cima de plataforma móvel o reach.js não vê
        lumiArc(x + g1 / 2, 760, 3, g1 * 0.7, 30);
        lumiArc(sx + sw + g2 / 2, 756, 3, g2 * 0.7, 30);
        x = nx;
        topo = 760;   // a margem de saída é sempre baixa: subir da pedra
                      // rasante (846) pra cá é degrau de 86px, um pulo só
        continue;
      }

      // ---- pilar comum, com parâmetros por trecho ----
      var w, gap;
      if (x < 6200) {            // (2) a travessia: pilares médios
        w = 320 + r() * 140;
        gap = 240 + r() * 90;
        topo += (r() * 2 - 1) * 90;
      } else if (x < 9600) {     // (3) as ilhas: pilares menores, mais altos
        w = 200 + r() * 120;
        gap = 230 + r() * 100;
        topo += (r() * 2 - 1) * 140;
      } else {                   // (4) a reta final: chão largo pros piglins
        w = 380 + r() * 160;
        gap = 220 + r() * 80;
        topo += (r() * 2 - 1) * 70;
      }
      // as garantias que a física cobra: subida ≤120px por vão (reach.js
      // marca >150 como duro), descida ≤190, e tudo dentro da faixa jogável
      var prevTopo = solids[solids.length - 1].y;
      if (prevTopo - topo > 120) topo = prevTopo - 120;
      if (topo - prevTopo > 190) topo = prevTopo + 190;
      topo = Math.max(600, Math.min(844, topo));
      topo = Math.round(topo);
      w = Math.round(w); gap = Math.round(gap);

      solids.push(S(x, topo, w, H - topo, 'r'));

      // lumis: linha em cima dos pilares largos, arco sobre o vão à frente
      if (w >= 380) lumiLine(x + 70, topo - 64, 3, 52);
      lumiArc(x + w + gap / 2, Math.min(topo, 844) - 120, 4, gap * 0.75, 36);

      // inimigos por trecho — mais densos no último terço
      if (x < 6200) {
        if (r() < 0.4) enemyDefs.push({ type: 'fantasmachama', x: x + w / 2, y: topo - 120, range: 100 + r() * 60 });
      } else if (x < 9600) {
        var sorte = r();
        if (sorte < 0.3) enemyDefs.push({ type: 'blaze', x: x + w / 2, y: topo - 160, range: 90 + r() * 70 });
        else if (sorte < 0.5) enemyDefs.push({ type: 'fantasmachama', x: x + w / 2, y: topo - 130, range: 100 + r() * 60 });
      } else {
        if (w >= 360) enemyDefs.push({ type: 'piglin', x: x + w / 2, y: topo - 40, range: Math.round(w * 0.3) });
        if (r() < 0.45) enemyDefs.push({ type: 'fantasmachama', x: x + w * 0.3, y: topo - 140, range: 90 + r() * 50 });
      }

      // checkpoint do miolo: no centro do pilar que cruzar a marca
      if (ci < cpMarks.length && x + w / 2 > cpMarks[ci]) {
        checkpoints.push({ x: Math.round(x + w / 2), y: topo });
        ci++;
      }

      // plataforma móvel de pedra sobre o vão à frente: redundância
      // confortável (a geometria estática já atravessa sozinha)
      if (vi < moverMarks.length && x + w > moverMarks[vi]) {
        obstacleDefs.push({
          type: 'plataforma',
          x: x + w + 20, y: topo - 40, w: 110,
          dx: Math.max(60, gap - 150), dy: -30,
          period: 5 + vi * 0.6, phase: vi * 1.7,
        });
        vi++;
      }

      x += w + gap;
    }

    // ---- emenda com a plataforma da porta da arena (x=11760): o gerador
    // para onde a seed mandar, então o último vão é ajustado na mão pra
    // ficar na mesma faixa dos outros (≈300px), esticando ou encurtando o
    // último pilar — nunca deixando um vão impossível nem um encosto ----
    var ult = solids[solids.length - 1];
    var fim = ult.x + ult.w;
    if (11760 - fim > 320) ult.w = 11760 - 300 - ult.x;
    else if (11760 - fim < 150) ult.w = Math.max(220, 11460 - ult.x);
  })();

  // ---- reforço de blazes nas ilhas: o sorteio do miolo pode sair avaro
  // (a seed atual dá um só), e o trecho 3 é deles. Pós-passe deterministico
  // SEM mexer no fluxo do gerador (consumir r() a mais deslocaria toda a
  // geometria): escolhe o pilar mais próximo de cada âncora e pousa um
  // blaze pairando sobre ele ----
  (function () {
    var ancoras = [7300, 9300];
    for (var a = 0; a < ancoras.length; a++) {
      var melhor = null, dist = 1e9;
      for (var i = 0; i < solids.length; i++) {
        var s = solids[i];
        if (s.k !== 'r' || s.x < 6200 || s.x > 9600) continue;
        var d = Math.abs(s.x + s.w / 2 - ancoras[a]);
        if (d < dist) { dist = d; melhor = s; }
      }
      if (melhor) {
        enemyDefs.push({
          type: 'blaze',
          x: Math.round(melhor.x + melhor.w / 2),
          y: melhor.y - 170,
          range: Math.round(Math.min(120, melhor.w * 0.35)),
        });
      }
    }
  })();

  // ---- (4b) a porta da arena: plataforma do último checkpoint ----
  solids.push(S(11760, 840, 340, H - 840, 'r'));
  checkpoints.push({ x: 12040, y: 840 });
  enemyDefs.push({ type: 'piglin', x: 11900, y: 800, range: 110 });
  lumiArc(11700, 740, 4, 200, 38);

  // ---- a ARENA do chefão: pedra grande e plana, colada na porta ----
  solids.push(S(12100, 820, 1500, H - 820, 'r'));

  // ---------------------------------------------------------------
  // HAZARDS DE LAVA — um retângulo por vão, cobrindo exatamente os trechos
  // de lava a céu aberto entre pilares. Computado da geometria final: se um
  // pilar mudar de lugar, a banda acompanha sozinha.
  // ---------------------------------------------------------------
  (function buildLava() {
    var ints = [];
    for (var i = 0; i < solids.length; i++) ints.push([solids[i].x, solids[i].x + solids[i].w]);
    ints.sort(function (a, b) { return a[0] - b[0]; });
    var fim = ints[0][1];
    for (var j = 1; j < ints.length; j++) {
      if (ints[j][0] > fim + 1) hazards.push(Hz(fim, LAVA_Y, ints[j][0] - fim, 100, 'l'));
      fim = Math.max(fim, ints[j][1]);
    }
  })();

  // ---------------------------------------------------------------
  // DECORAÇÃO por sólido (pré-computada: nada de random por frame).
  // estrias = os riscos verticais de coluna de basalto; rachas = rachaduras
  // com brilho de magma pulsando (segmentos em zigue-zague na metade de
  // baixo do pilar, onde o calor da lava "entra" pela pedra).
  // ---------------------------------------------------------------
  var decor = [];
  (function () {
    var r = makeRand(20271108);
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      var d = { estrias: [], rachas: [] };
      var ne = Math.max(2, Math.floor(s.w / 70));
      for (var e = 0; e < ne; e++) {
        d.estrias.push({ x: 10 + r() * Math.max(1, s.w - 20), len: 40 + r() * 120 });
      }
      var nr = s.w > 300 ? 3 : (s.w > 150 ? 2 : 1);
      for (var c = 0; c < nr; c++) {
        var alt = Math.min(s.h, LAVA_Y - s.y);     // só a parte emersa
        if (alt < 60) continue;
        var rx = 14 + r() * Math.max(1, s.w - 28);
        var ry = alt * (0.45 + r() * 0.4);
        var pontos = [];
        var px2 = 0, py2 = 0;
        var nseg = 3 + Math.floor(r() * 3);
        for (var k = 0; k < nseg; k++) {
          px2 += (r() * 2 - 1) * 16;
          py2 -= 14 + r() * 18;
          pontos.push({ x: px2, y: py2 });
        }
        d.rachas.push({ x: rx, y: ry, pts: pontos, ph: r() * 6.28 });
      }
      decor.push(d);
    }
  })();

  // ---------------------------------------------------------------
  // TABELAS FIXAS DE AMBIENTE — tudo posição por módulo do tempo, como as
  // bolhas do level7: nada de array crescendo nem alocação por frame.
  // ---------------------------------------------------------------

  // DRAGÕES DE GELO DISTANTES — silhuetas azul-claras cruzando o céu, no
  // molde dos cetáceos da praia (tabela fixa, parallax fraco).
  var dragoesLonge = [];
  (function () {
    var r = makeRand(7103);
    for (var i = 0; i < 3; i++) {
      dragoesLonge.push({
        y: 60 + r() * 150,
        v: 18 + r() * 14,
        ph: r() * 6.28,
        dir: r() < 0.5 ? 1 : -1,
        off: r() * (W + 600),
        s: 0.32 + r() * 0.16,
      });
    }
  })();

  // DRAGÕES DE GELO SOBREVOANDO A FASE — grandes (escala ~1), em
  // coordenadas de MUNDO com parallax 1, sempre ACIMA da linha de jogo
  // (topos de pilar começam em y=600; eles voam entre 240 e 430).
  // Decorativos: não machucam, não colidem. São desenhados no FIM do
  // drawBack — atrás dos pilares e do player — porque na frente roubariam
  // a leitura do jogo nos pulos; atrás, leem como fauna cruzando o fundo
  // da ação, que é o efeito do desenho de referência.
  var dragoesPerto = [];
  (function () {
    var r = makeRand(7207);
    for (var i = 0; i < 4; i++) {
      dragoesPerto.push({
        y: 240 + r() * 190,
        v: 42 + r() * 26,
        ph: r() * 6.28,
        dir: r() < 0.5 ? 1 : -1,
        off: r() * (W + 800),
        s: 0.9 + r() * 0.25,
      });
    }
  })();

  // CINZAS flutuando no céu (drawBack, quase em coordenadas de tela).
  var cinzas = [];
  (function () {
    var r = makeRand(3301);
    for (var i = 0; i < 22; i++) {
      cinzas.push({ x0: r() * VIEW_W, per: 8 + r() * 7, ph: r() * 6.28, s: 1 + r() * 1.6 });
    }
  })();

  // BOLHAS DE LAVA estourando na superfície (drawSolids).
  var bolhas = [];
  (function () {
    var r = makeRand(9181);
    for (var i = 0; i < 20; i++) {
      bolhas.push({ x: r() * W, per: 2.2 + r() * 2.6, ph: r() * 6.28, s: 3 + r() * 4 });
    }
  })();

  // BRASAS subindo da lava (drawFront).
  var brasas = [];
  (function () {
    var r = makeRand(5511);
    for (var i = 0; i < 34; i++) {
      brasas.push({ x0: r() * W, per: 3 + r() * 3, ph: r() * 6.28 });
    }
  })();

  // CUSPIDAS dos vulcões: 6 partículas por cratera, parábola em módulo do
  // tempo — em coordenadas LOCAIS da camada de vulcões (ver paintVulcoes).
  var cuspidas = [];
  (function () {
    var r = makeRand(6161);
    for (var i = 0; i < 6; i++) {
      cuspidas.push({ phi: r() * 1.7, vx: (r() * 2 - 1) * 34, vy: 95 + r() * 70, s: 1.6 + r() * 1.8 });
    }
  })();

  // FAÍSCAS de coleta — pool fixo do kit.
  var sparks = kit.makeSparks(48);

  // ---------------------------------------------------------------
  // OFFSCREENS — assados uma vez no primeiro draw.
  // ---------------------------------------------------------------
  var built = false;
  var ceuSpr, vulcSpr, rochaSpr, vigSpr, glowSpr, heatSpr, lumiSpr;
  var crateras = [];          // {x, y} locais de vulcSpr — as bocas vivas
  var VULC_H = 620, ROCHA_H = 300;

  function buildAll() {
    if (built) return;
    built = true;

    // CÉU de crepúsculo vulcânico: laranja queimado no horizonte afundando
    // em roxo/preto no alto — o contraluz que faz os vulcões serem PRETOS.
    ceuSpr = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, '#140820');
      gr.addColorStop(0.38, '#3a1030');
      gr.addColorStop(0.68, '#7a2420');
      gr.addColorStop(0.88, '#c85618');
      gr.addColorStop(1, '#f09030');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      // o clarão difuso do horizonte — a lava do mundo inteiro refletida
      var hg = g.createRadialGradient(VIEW_W * 0.5, VIEW_H + 40, 30, VIEW_W * 0.5, VIEW_H + 40, 420);
      hg.addColorStop(0, 'rgba(255,170,70,0.5)');
      hg.addColorStop(1, 'rgba(255,170,70,0)');
      g.fillStyle = hg;
      g.fillRect(0, VIEW_H - 300, VIEW_W, 300);
    })(ceuSpr.getContext('2d'));

    // VULCÕES PRETOS em silhueta (camada que tile-a em x). As crateras
    // ficam registradas em `crateras`: o brilho pulsante e as cuspidas são
    // desenhados por cima, no draw, na posição de cada tile.
    vulcSpr = makeCanvas(2400, VULC_H);
    paintVulcoes(vulcSpr.getContext('2d'));

    // segunda camada, mais próxima: rochas escuras recortadas
    rochaSpr = makeCanvas(2000, ROCHA_H);
    paintRochas(rochaSpr.getContext('2d'));

    // brilho genérico laranja — serve pra cratera, runa de checkpoint e
    // linha da lava; assado uma vez, vira drawImage com alpha
    glowSpr = makeCanvas(64, 64);
    (function (g) {
      var gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,230,160,0.95)');
      gr.addColorStop(0.35, 'rgba(255,160,60,0.6)');
      gr.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    })(glowSpr.getContext('2d'));

    // faixa de calor: gradiente vertical transparente→quente→transparente,
    // que o drawFront faz subir em loop — a distorção "fake" e barata
    heatSpr = makeCanvas(160, VIEW_H);
    (function (g) {
      var gr = g.createLinearGradient(0, 0, 0, VIEW_H);
      gr.addColorStop(0, 'rgba(255,140,60,0)');
      gr.addColorStop(0.3, 'rgba(255,150,70,0.045)');
      gr.addColorStop(0.5, 'rgba(255,170,90,0.07)');
      gr.addColorStop(0.7, 'rgba(255,150,70,0.045)');
      gr.addColorStop(1, 'rgba(255,140,60,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 160, VIEW_H);
    })(heatSpr.getContext('2d'));

    // vinheta avermelhada — o calor fechando as bordas da tela
    vigSpr = makeCanvas(VIEW_W, VIEW_H);
    (function (g) {
      var gr = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 250, VIEW_W / 2, VIEW_H / 2, 640);
      gr.addColorStop(0, 'rgba(50,8,4,0)');
      gr.addColorStop(1, 'rgba(50,8,4,0.42)');
      g.fillStyle = gr;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    })(vigSpr.getContext('2d'));

    lumiSpr = kit.makeLumiSprite();
  }

  // --- a cordilheira de vulcões: cones pretos, crateras com lábio aceso e
  // escorridas de lava pintadas nas encostas (estáticas; o que pulsa e
  // cospe é desenhado no draw, por cima, via `crateras`) ---
  function paintVulcoes(g) {
    var r = makeRand(4409);
    var base = VULC_H;
    var defs = [
      { cx: 330, cw: 520, ch: 430 },
      { cx: 950, cw: 420, ch: 330 },
      { cx: 1540, cw: 560, ch: 480 },
      { cx: 2120, cw: 400, ch: 300 },
    ];
    for (var i = 0; i < defs.length; i++) {
      var v = defs[i];
      var topoY = base - v.ch, bocaW = v.cw * 0.16;
      // o cone, preto contra o crepúsculo
      g.fillStyle = i % 2 === 0 ? '#0b060c' : '#120a12';
      g.beginPath();
      g.moveTo(v.cx - v.cw / 2, base);
      g.quadraticCurveTo(v.cx - v.cw * 0.18, topoY + v.ch * 0.3, v.cx - bocaW, topoY);
      g.lineTo(v.cx + bocaW, topoY);
      g.quadraticCurveTo(v.cx + v.cw * 0.18, topoY + v.ch * 0.3, v.cx + v.cw / 2, base);
      g.closePath();
      g.fill();
      // escorridas de lava nas encostas: riscos que afinam descendo
      for (var e = 0; e < 3; e++) {
        var lado = e === 1 ? -1 : 1;
        var ex = v.cx + lado * bocaW * (0.4 + r() * 0.5);
        var el = v.ch * (0.3 + r() * 0.45);
        var eg = g.createLinearGradient(0, topoY, 0, topoY + el);
        eg.addColorStop(0, 'rgba(255,180,70,0.9)');
        eg.addColorStop(0.6, 'rgba(240,100,30,0.55)');
        eg.addColorStop(1, 'rgba(180,50,15,0)');
        g.strokeStyle = eg;
        g.lineWidth = 3 + r() * 2;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(ex, topoY + 4);
        g.quadraticCurveTo(ex + lado * (10 + r() * 14), topoY + el * 0.5,
          ex + lado * (18 + r() * 22), topoY + el);
        g.stroke();
      }
      // o lábio da boca, já meio aceso (o pulso vivo vem no draw)
      g.fillStyle = 'rgba(255,150,50,0.55)';
      g.fillRect(v.cx - bocaW, topoY - 2, bocaW * 2, 4);
      crateras.push({ x: v.cx, y: topoY });
    }
  }

  // --- rochas escuras mais próximas: lombadas e agulhas recortadas contra
  // o clarão da lava ---
  function paintRochas(g) {
    var r = makeRand(8812);
    var base = ROCHA_H;
    g.fillStyle = 'rgba(16,8,12,0.88)';
    for (var i = 0; i < 14; i++) {
      var px = r() * 2000, pw = 90 + r() * 180, ph = 60 + r() * 150;
      g.beginPath();
      g.moveTo(px, base);
      g.quadraticCurveTo(px + pw * 0.3, base - ph, px + pw * 0.5, base - ph * 1.08);
      g.quadraticCurveTo(px + pw * 0.7, base - ph, px + pw, base);
      g.closePath();
      g.fill();
    }
    // agulhas finas, como as do Nether
    g.fillStyle = 'rgba(10,5,9,0.92)';
    for (var j = 0; j < 8; j++) {
      var qx = r() * 2000, qw = 16 + r() * 26, qh = 90 + r() * 140;
      g.beginPath();
      g.moveTo(qx, base);
      g.lineTo(qx + qw * 0.5, base - qh);
      g.lineTo(qx + qw, base);
      g.closePath();
      g.fill();
    }
  }

  // camada que repete em x com parallax f (mesma matemática do level7)
  function drawLayer(ctx, layer, f, cam) {
    var lw = layer.width;
    var y = VIEW_H - layer.height + (CAM_Y_MAX - cam.y) * f;
    var off = -((cam.x * f) % lw);
    if (off > 0) off -= lw;
    ctx.drawImage(layer, off, y);
    if (off + lw < VIEW_W) ctx.drawImage(layer, off + lw, y);
    return { off: off, y: y, lw: lw };
  }

  // ---------------------------------------------------------------
  // RESET — o engine chama ao (re)carregar a fase: reacende as lumis e
  // apaga as faíscas que a partida anterior deixou no ar.
  // ---------------------------------------------------------------
  function reset() {
    for (var i = 0; i < lumis.length; i++) lumis[i].taken = false;
    kit.apagarFaiscas(sparks);
  }

  // ---------------------------------------------------------------
  // UPDATE — a coleta de lumis; o resto da fase é geometria estática mais
  // os bichos (enemies.js), os striders (obstacles.js) e o chefão.
  // ---------------------------------------------------------------
  function update(dt) {
    kit.coletarLumis(lumis, sparks, dt);
  }

  // ---------------------------------------------------------------
  // DRAW BACK — céu de crepúsculo, cinzas, vulcões vivos (brilho pulsante
  // na boca + cuspidas em parábola), dragões distantes em silhueta, rochas
  // próximas e, por último (mais perto do plano de jogo), os dragões de
  // gelo GRANDES sobrevoando a fase em coordenadas de mundo.
  // ---------------------------------------------------------------
  function drawBack(ctx, cam) {
    buildAll();
    var t = FG.engine.time;

    ctx.drawImage(ceuSpr, 0, 0);

    // cinzas à deriva, caindo devagar em zigue-zague
    ctx.save();
    ctx.fillStyle = 'rgba(170,158,160,0.3)';
    for (var a = 0; a < cinzas.length; a++) {
      var cz = cinzas[a];
      var prog = ((t / cz.per + cz.ph) % 1 + 1) % 1;
      var ax = (cz.x0 + Math.sin(t * 0.6 + cz.ph) * 34 - cam.x * 0.05);
      ax = ((ax % VIEW_W) + VIEW_W) % VIEW_W;
      var ay = prog * (VIEW_H + 40) - 20;
      ctx.globalAlpha = 0.14 + 0.16 * Math.sin(prog * Math.PI);
      ctx.fillRect(ax, ay, cz.s, cz.s);
    }
    ctx.restore();

    // dragões de gelo DISTANTES: silhuetas azul-claras, parallax fraco
    var SPANL = W + 600;
    for (var dl = 0; dl < dragoesLonge.length; dl++) {
      var dg = dragoesLonge[dl];
      var dx = ((dg.off + dg.dir * dg.v * t) % SPANL + SPANL) % SPANL - 300 - cam.x * 0.12;
      var dy = dg.y + Math.sin(t * 0.5 + dg.ph) * 10 - cam.y * 0.1;
      if (dx < -160 || dx > VIEW_W + 160) continue;
      drawDragao(ctx, dx, dy, dg.dir, dg.s, t, dg.ph, true);
    }

    // a cordilheira de vulcões (e as bocas vivas por cima, nos dois tiles)
    var pos = drawLayer(ctx, vulcSpr, 0.22, cam);
    for (var tile = 0; tile < 2; tile++) {
      var tx = pos.off + tile * pos.lw;
      if (tx > VIEW_W || tx + pos.lw < 0) continue;
      for (var c = 0; c < crateras.length; c++) {
        var cr = crateras[c];
        var cx = tx + cr.x, cy = pos.y + cr.y;
        if (cx < -80 || cx > VIEW_W + 80) continue;
        // o pulso da boca: brilho que respira, cada vulcão no seu ritmo
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 1.8 + c * 2.1);
        ctx.drawImage(glowSpr, cx - 34, cy - 22, 68, 40);
        ctx.restore();
        // as cuspidas: partículas em parábola, posição por módulo do tempo
        ctx.save();
        ctx.fillStyle = '#ffb050';
        for (var u = 0; u < cuspidas.length; u++) {
          var cu = cuspidas[u];
          var tt = ((t + cu.phi + c * 0.53) % 1.7);
          var px = cx + cu.vx * tt;
          var py = cy - cu.vy * tt + 150 * tt * tt;
          ctx.globalAlpha = Math.max(0, 1 - tt / 1.7) * 0.9;
          ctx.beginPath();
          ctx.arc(px, py, cu.s, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // rochas escuras, mais perto
    drawLayer(ctx, rochaSpr, 0.45, cam);

    // dragões de gelo SOBREVOANDO A FASE: grandes, em coordenadas de
    // mundo (parallax 1), acima da linha de jogo. Último desenho do
    // drawBack de propósito — ficam atrás dos pilares e do player.
    var SPANP = W + 800;
    for (var dp = 0; dp < dragoesPerto.length; dp++) {
      var dgp = dragoesPerto[dp];
      var wx = ((dgp.off + dgp.dir * dgp.v * t) % SPANP + SPANP) % SPANP - 400;
      var sx = wx - cam.x;
      var sy = dgp.y + Math.sin(t * 0.7 + dgp.ph) * 22 - cam.y;
      if (sx < -260 || sx > VIEW_W + 260) continue;
      drawDragao(ctx, sx, sy, dgp.dir, dgp.s, t, dgp.ph, false);
    }
  }

  // --- o dragão de gelo: corpo serpenteante azul-gelo, asas membranosas
  // batendo, chifres e (nos grandes) rastro de cristaizinhos. `silhueta`
  // é a versão distante: uma cor só, sem detalhe ---
  function drawDragao(ctx, x, y, dir, s, t, ph, silhueta) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir * s, s);

    var corCorpo = silhueta ? 'rgba(168,210,240,0.5)' : '#a8d4f0';
    var corSombra = silhueta ? 'rgba(168,210,240,0.5)' : '#6ea8d8';
    var corAsa = silhueta ? 'rgba(168,210,240,0.4)' : 'rgba(190,230,255,0.72)';
    var flap = Math.sin(t * 5 + ph);

    // rastro de cristaizinhos/flocos, só nos grandes — losangos que ficam
    // pra trás da cauda, esmaecendo
    if (!silhueta) {
      ctx.fillStyle = 'rgba(210,240,255,0.8)';
      for (var k = 1; k <= 5; k++) {
        var tx2 = -78 - k * 20;
        var ty2 = Math.sin(-k * 1.1 + t * 3 + ph) * 9 + k * 2;
        var cs = 3.4 - k * 0.5;
        ctx.globalAlpha = 0.5 - k * 0.085;
        ctx.beginPath();
        ctx.moveTo(tx2, ty2 - cs);
        ctx.lineTo(tx2 + cs, ty2);
        ctx.lineTo(tx2, ty2 + cs);
        ctx.lineTo(tx2 - cs, ty2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // asa de trás (bate em contrafase, mais escura — dá o volume)
    if (!silhueta) {
      ctx.fillStyle = 'rgba(120,170,215,0.55)';
      drawAsa(ctx, -6, -6, -flap * 0.8, -1);
    }

    // corpo serpenteante: espinha em senoide, desenhada como traço gordo
    ctx.strokeStyle = corCorpo;
    ctx.lineCap = 'round';
    ctx.lineWidth = 15;
    ctx.beginPath();
    for (var i = 0; i <= 6; i++) {
      var bx = -78 + i * 24;
      var by = Math.sin(i * 1.1 + t * 3 + ph) * 9;
      if (i === 0) ctx.moveTo(bx, by); else ctx.lineTo(bx, by);
    }
    ctx.stroke();
    // barriga mais clara por cima, afinando o traço
    if (!silhueta) {
      ctx.strokeStyle = '#d8eeff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (var i2 = 0; i2 <= 6; i2++) {
        var bx2 = -78 + i2 * 24;
        var by2 = Math.sin(i2 * 1.1 + t * 3 + ph) * 9 + 3;
        if (i2 === 0) ctx.moveTo(bx2, by2); else ctx.lineTo(bx2, by2);
      }
      ctx.stroke();
    }

    // cauda em leque de cristal
    var tyf = Math.sin(-1.1 + t * 3 + ph) * 9;
    ctx.fillStyle = corSombra;
    ctx.beginPath();
    ctx.moveTo(-78, tyf);
    ctx.lineTo(-100, tyf - 10 + flap * 3);
    ctx.lineTo(-96, tyf);
    ctx.lineTo(-100, tyf + 10 + flap * 3);
    ctx.closePath();
    ctx.fill();

    // asa da frente, membranosa, batendo
    ctx.fillStyle = corAsa;
    drawAsa(ctx, 2, -8, flap, 1);

    // cabeça: focinho comprido, chifres pra trás, olho
    var hy = Math.sin(6 * 1.1 + t * 3 + ph) * 9;
    ctx.fillStyle = corCorpo;
    ctx.beginPath();
    ctx.ellipse(74, hy - 2, 16, 10, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();                      // o focinho
    ctx.moveTo(84, hy - 7);
    ctx.lineTo(102, hy - 1);
    ctx.lineTo(84, hy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = silhueta ? corCorpo : '#e8f6ff';   // chifres
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(72, hy - 9); ctx.lineTo(60, hy - 22);
    ctx.moveTo(79, hy - 9); ctx.lineTo(70, hy - 24);
    ctx.stroke();
    if (!silhueta) {
      ctx.fillStyle = '#16304a';
      ctx.beginPath();
      ctx.arc(78, hy - 4, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // a membrana da asa: do ombro ao punho e a barra de dedos, com dois
  // "dedos" de cartilagem riscados por dentro
  function drawAsa(ctx, ax, ay, flap, lado) {
    var tipY = ay - 34 - flap * 20;
    ctx.beginPath();
    ctx.moveTo(ax - 10, ay);
    ctx.quadraticCurveTo(ax + 6 * lado, tipY - 10, ax + 26 * lado, tipY);
    ctx.quadraticCurveTo(ax + 34 * lado, ay - 10, ax + 44 * lado, ay + 2 - flap * 5);
    ctx.quadraticCurveTo(ax + 18 * lado, ay + 8, ax - 10, ay);
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------------------
  // DRAW SOLIDS — pilares de basalto, o MAR DE LAVA (ondas, bolhas, glow),
  // totens de checkpoint, lumis e faíscas. A lava é desenhada DEPOIS dos
  // pilares: é ela que recobre a base deles e os faz "emergir".
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
      drawPilar(ctx, s, decor[i], t);
    }

    drawMarDeLava(ctx, cam, t);

    for (var c = 0; c < checkpoints.length; c++) {
      var cp = checkpoints[c];
      if (cp.x > x1 || cp.x < x0) continue;
      drawTotemCheckpoint(ctx, cp, FG.engine.checkpoint.x === cp.x, t);
    }

    kit.desenharLumis(ctx, cam, lumis, lumiSpr, t);
    kit.desenharFaiscas(ctx, sparks);

    ctx.restore();
  }

  // --- pilar de basalto: cinza-escuro em colunas, topo com borda
  // incandescente sutil (o calor do ar) e rachaduras de magma pulsando na
  // metade de baixo (pré-computadas em decor) ---
  function drawPilar(ctx, s, d, t) {
    var g = ctx.createLinearGradient(0, s.y, 0, Math.min(s.y + s.h, LAVA_Y + 60));
    g.addColorStop(0, '#4a4a54');
    g.addColorStop(0.3, '#34343e');
    g.addColorStop(0.8, '#26222c');
    g.addColorStop(1, '#3a2018');   // a base já tingida pelo brilho da lava
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, s.w, s.h);

    // topo: laje mais clara + a borda incandescente sutil
    ctx.fillStyle = '#5c5c66';
    ctx.fillRect(s.x, s.y, s.w, 5);
    ctx.fillStyle = 'rgba(255,140,50,0.3)';
    ctx.fillRect(s.x, s.y - 1, s.w, 2);

    // estrias verticais de coluna de basalto
    ctx.strokeStyle = 'rgba(10,8,14,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var e = 0; e < d.estrias.length; e++) {
      var es = d.estrias[e];
      ctx.moveTo(s.x + es.x, s.y + 8);
      ctx.lineTo(s.x + es.x, s.y + 8 + Math.min(es.len, s.h - 10));
    }
    ctx.stroke();

    // rachaduras com magma dentro, pulsando devagar
    for (var c = 0; c < d.rachas.length; c++) {
      var ra = d.rachas[c];
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.3 * Math.sin(t * 1.6 + ra.ph);
      ctx.strokeStyle = '#ff7828';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x + ra.x, s.y + ra.y);
      for (var k = 0; k < ra.pts.length; k++) {
        ctx.lineTo(s.x + ra.x + ra.pts[k].x, s.y + ra.y + ra.pts[k].y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // --- o mar de lava: gradiente laranja→vermelho escuro, superfície
  // ondulando em senoides (as mesmas contas das ondas do level7), bolhas
  // estourando e uma linha de glow na superfície ---
  function drawMarDeLava(ctx, cam, t) {
    var lx0 = cam.x, lx1 = cam.x + VIEW_W;

    // o corpo da lava (só o visível, da superfície ao pé da tela)
    var g = ctx.createLinearGradient(0, LAVA_Y, 0, H);
    g.addColorStop(0, '#ffb030');
    g.addColorStop(0.25, '#f06818');
    g.addColorStop(0.6, '#b03010');
    g.addColorStop(1, '#600e06');
    ctx.fillStyle = g;
    ctx.fillRect(lx0, LAVA_Y, VIEW_W, H - LAVA_Y);

    // a superfície ondulando: crista principal clara + uma segunda mais
    // gorda e defasada, dando corpo
    ctx.save();
    ctx.strokeStyle = 'rgba(255,225,130,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (var wx = lx0; wx <= lx1; wx += 14) {
      var wy = LAVA_Y + Math.sin(t * 1.4 + wx * 0.04) * 4 + Math.sin(t * 0.7 + wx * 0.011) * 6;
      if (wx === lx0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,150,60,0.5)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (var wx2 = lx0; wx2 <= lx1; wx2 += 14) {
      var wy2 = LAVA_Y + 9 + Math.sin(t * 1.1 + 2 + wx2 * 0.027) * 5;
      if (wx2 === lx0) ctx.moveTo(wx2, wy2); else ctx.lineTo(wx2, wy2);
    }
    ctx.stroke();
    ctx.restore();

    // glow na linha da superfície: o sprite assado esticado na horizontal
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.1 * Math.sin(t * 1.2);
    for (var gx = lx0 - 32; gx < lx1 + 32; gx += 128) {
      ctx.drawImage(glowSpr, gx, LAVA_Y - 26, 160, 52);
    }
    ctx.restore();

    // bolhas de lava: incham subindo um nadinha e estouram num anel
    ctx.save();
    for (var b = 0; b < bolhas.length; b++) {
      var bo = bolhas[b];
      if (bo.x < lx0 - 20 || bo.x > lx1 + 20) continue;
      var prog = ((t + bo.ph) % bo.per) / bo.per;
      var by = LAVA_Y + 6 - prog * 14;
      if (prog < 0.8) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ff9838';
        ctx.beginPath();
        ctx.arc(bo.x, by, bo.s * (0.5 + prog * 0.7), 0, Math.PI * 2);
        ctx.fill();
      } else {
        // o estouro: anel que abre e some
        var pb = (prog - 0.8) / 0.2;
        ctx.globalAlpha = (1 - pb) * 0.8;
        ctx.strokeStyle = '#ffd880';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bo.x, by, bo.s * (1 + pb * 1.6), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- checkpoint: totem de pedras empilhadas com uma runa que acende —
  // o mesmo papel da boia da praia, no figurino das Terras de Lava ---
  function drawTotemCheckpoint(ctx, cp, lit, t) {
    var x = cp.x, y = cp.y;
    ctx.save();
    ctx.translate(x, y);

    // as três pedras empilhadas, da maior pra menor
    ctx.fillStyle = '#3c3842';
    ctx.beginPath();
    ctx.ellipse(0, -12, 20, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#48444e';
    ctx.beginPath();
    ctx.ellipse(0, -32, 15, 10, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#56525c';
    ctx.beginPath();
    ctx.ellipse(0, -50, 11, 8, -0.06, 0, Math.PI * 2);
    ctx.fill();

    // a runa (losango gravado na pedra do meio) — acesa, pulsa
    if (lit) {
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(t * 3);
      ctx.drawImage(glowSpr, -22, -54, 44, 44);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = lit ? '#ffcc70' : '#2a2630';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.lineTo(6, -32);
    ctx.lineTo(0, -24);
    ctx.lineTo(-6, -32);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }

  // ---------------------------------------------------------------
  // DRAW FRONT — o calor: faixas de ar quente subindo (a distorção fake e
  // barata), brasas subindo da lava e a vinheta avermelhada.
  // ---------------------------------------------------------------
  function drawFront(ctx, cam) {
    buildAll();
    var t = FG.engine.time;

    // 3 faixas de calor subindo em loop, cada uma no seu passo e com um
    // balanço horizontal — dois drawImage por faixa fazem o wrap vertical
    var FAIXAS = [0.14, 0.5, 0.82];
    for (var f = 0; f < FAIXAS.length; f++) {
      var fx = FAIXAS[f] * VIEW_W - 80 + Math.sin(t * (0.5 + f * 0.2) + f * 2) * 26;
      var fy = -((t * (36 + f * 12)) % VIEW_H);
      ctx.drawImage(heatSpr, fx, fy);
      ctx.drawImage(heatSpr, fx, fy + VIEW_H);
    }

    // brasas: fagulhas laranja subindo da lava, posição por módulo do tempo
    ctx.save();
    for (var b = 0; b < brasas.length; b++) {
      var br = brasas[b];
      var prog = ((t + br.ph) % br.per) / br.per;
      var bx = br.x0 - cam.x + Math.sin(t * 2 + br.ph) * 16;
      var by = LAVA_Y - prog * 640 - cam.y;
      if (bx < -8 || bx > VIEW_W + 8 || by < -8 || by > VIEW_H + 8) continue;
      ctx.globalAlpha = (1 - prog) * 0.8;
      ctx.fillStyle = prog < 0.3 ? '#ffd080' : '#ff9040';
      ctx.fillRect(bx, by, 2.6, 2.6);
    }
    ctx.restore();

    ctx.drawImage(vigSpr, 0, 0);
  }

  // ---------------------------------------------------------------
  // API pública — a fase entra no registro na ordem do index.html.
  // ---------------------------------------------------------------
  FG.levels = FG.levels || [];
  FG.levels.push({
    id: 'lava',
    nome: 'As Terras de Lava',
    musica: 'lava',
    W: W,
    H: H,
    playerStart: { x: 120, y: 720 },   // cai em pé na plataforma inicial (topo 780)
    solids: solids,
    hazards: hazards,
    checkpoints: checkpoints,
    enemyDefs: enemyDefs,
    obstacleDefs: obstacleDefs,
    bossId: 'verola',
    bossTriggerX: 12260,
    arena: { x: 12100, w: 1500 },
    reset: reset,
    update: update,
    drawBack: drawBack,
    drawSolids: drawSolids,
    drawFront: drawFront,
  });
})();
