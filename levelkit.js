// Fagulho: Lendas do Bosque — levelkit.js
// FG.levelkit: a caixa de ferramentas que as três fases dividem.
//
// Aqui só entra o que é genérico de verdade: construtor de sólido, o RNG
// determinístico, os construtores de lumi, o offscreen, o sprite da lumi, a
// coleta/desenho de lumis e o teste de visibilidade. Tudo o que tem cheiro de
// bosque (paleta, parallax, penhasco, poça) fica na fase — kit pequeno e
// honesto vale mais que kit que serve a todos torcendo cada um.
//
// Este arquivo não referencia nenhum outro módulo FG no load; `FG.engine`,
// `FG.player` e `FG.audio` só aparecem dentro de funções chamadas em runtime.
// A ÚNICA dependência de ordem de load permitida no projeto é kit → fase:
// o index.html carrega levelkit.js antes dos level*.js.
window.FG = window.FG || {};

(function () {
  'use strict';

  var VIEW_W = 960, VIEW_H = 540;
  var MARGEM = 220;   // folga de culling: ~1 tela, como o resto do jogo usa

  // ---------------------------------------------------------------
  // GEOMETRIA
  // ---------------------------------------------------------------
  // k = tipo visual do sólido; cada fase decide o que cada letra pinta.
  // 'g' terra, 'r' pedra, 'c' penhasco escalável, 'i' ilha flutuante,
  // 'h' piso oculto (não é desenhado), 'p' poste vertical.
  function S(x, y, w, h, k) { return { x: x, y: y, w: w, h: h, k: k || 'g' }; }

  // ---------------------------------------------------------------
  // RNG determinístico (LCG). Fases inteiras são decoradas com ele: o mundo
  // tem de sair igual em toda partida e em toda máquina, então nada de
  // Math.random na construção da geometria e da decoração.
  // ---------------------------------------------------------------
  function makeRand(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ---------------------------------------------------------------
  // CONSTRUTORES DE LUMI — recebem o array da fase como primeiro argumento
  // (antes escreviam num `lumis` de escopo; com três fases cada uma tem o seu).
  // `ph` é a fase da senoide de brilho: derivada do índice, para as lumis
  // vizinhas não piscarem em uníssono.
  // ---------------------------------------------------------------
  function lumiLine(arr, x, y, n, dx) {
    for (var i = 0; i < n; i++) {
      arr.push({ x: x + i * dx, y: y, ph: arr.length * 0.7, taken: false });
    }
  }

  function lumiCol(arr, x, y, n, dy) {
    for (var i = 0; i < n; i++) {
      arr.push({ x: x, y: y + i * dy, ph: arr.length * 0.7, taken: false });
    }
  }

  // Arco de parábola: `span` de largura, `sag` de barriga para baixo — é a
  // forma que desenha a trajetória de um pulo e convida a fazê-lo.
  function lumiArc(arr, cx, apexY, span, sag, n) {
    for (var i = 0; i < n; i++) {
      var t = n > 1 ? i / (n - 1) - 0.5 : 0;
      arr.push({ x: cx + t * span, y: apexY + sag * 4 * t * t, ph: arr.length * 0.7, taken: false });
    }
  }

  // ---------------------------------------------------------------
  // OFFSCREEN — todo desenho caro é assado uma vez num canvas fora de tela.
  // O fallback sem DOM existe porque os testes headless carregam os level*.js
  // só para ler geometria: se algum caminho de desenho for tocado sem
  // document, ele tem de virar no-op em vez de derrubar o teste.
  // ---------------------------------------------------------------
  function noopCtx() {
    var g = {
      canvas: null,
      save: nada, restore: nada, beginPath: nada, closePath: nada, clip: nada,
      moveTo: nada, lineTo: nada, quadraticCurveTo: nada, bezierCurveTo: nada,
      arc: nada, ellipse: nada, rect: nada, fill: nada, stroke: nada,
      fillRect: nada, strokeRect: nada, clearRect: nada, fillText: nada,
      translate: nada, rotate: nada, scale: nada, setTransform: nada,
      drawImage: nada, setLineDash: nada,
      measureText: function () { return { width: 0 }; },
      createLinearGradient: grad, createRadialGradient: grad,
    };
    function nada() {}
    function grad() { return { addColorStop: nada }; }
    return g;
  }

  function makeCanvas(w, h) {
    if (typeof document === 'undefined' || !document.createElement) {
      var g = noopCtx();
      var fake = { width: w, height: h, getContext: function () { return g; } };
      g.canvas = fake;
      return fake;
    }
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Sprite da lumi: halo dourado que some para fora + núcleo quase branco.
  // Desenhar isso por lumi e por frame com shadowBlur custaria caro; assado
  // uma vez, o desenho vira um drawImage.
  function makeLumiSprite() {
    var c = makeCanvas(36, 36);
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(18, 18, 1, 18, 18, 18);
    gr.addColorStop(0, 'rgba(255,250,225,1)');
    gr.addColorStop(0.28, 'rgba(255,215,110,0.95)');
    gr.addColorStop(0.6, 'rgba(255,175,50,0.35)');
    gr.addColorStop(1, 'rgba(255,160,40,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 36, 36);
    return c;
  }

  // ---------------------------------------------------------------
  // FAÍSCAS — brilho de despedida da lumi coletada. Pool fixo alocado uma
  // única vez: nada de criar objeto por coleta no meio do jogo.
  // O cursor circular mora no próprio array (`.i`), para a fase não precisar
  // carregar uma variável solta ao lado da pool.
  // ---------------------------------------------------------------
  function makeSparks(n) {
    var pool = [];
    for (var i = 0; i < n; i++) pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1 });
    pool.i = 0;
    return pool;
  }

  function burst(sparks, x, y, n) {
    var qtd = n || 6;
    for (var i = 0; i < qtd; i++) {
      var p = sparks[sparks.i];
      sparks.i = (sparks.i + 1) % sparks.length;
      var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 70;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 40;
      p.max = 0.45 + Math.random() * 0.25;
      p.life = p.max;
    }
  }

  function apagarFaiscas(sparks) {
    for (var i = 0; i < sparks.length; i++) sparks[i].life = 0;
    sparks.i = 0;
  }

  // ---------------------------------------------------------------
  // COLETA — proximidade do centro do player, sem AABB: a lumi é uma bolha
  // de luz, e o raio generoso (28px) é o que faz a coleta parecer magnética.
  // Chamado do update(dt) da fase; não faz reacender nada — quem reacende é
  // o reset() da fase, chamado pelo engine ao (re)carregar a fase.
  // ---------------------------------------------------------------
  function coletarLumis(lumis, sparks, dt) {
    var eng = FG.engine, p = FG.player;

    var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    for (var i = 0; i < lumis.length; i++) {
      var l = lumis[i];
      if (l.taken) continue;
      var dx = l.x - cx, dy = l.y - cy;
      if (dx * dx + dy * dy < 28 * 28) {
        l.taken = true;
        eng.addLumi();
        FG.audio.sfx('lumi');
        burst(sparks, l.x, l.y);
      }
    }

    for (var s = 0; s < sparks.length; s++) {
      var sp = sparks[s];
      if (sp.life <= 0) continue;
      sp.life -= dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy -= 30 * dt;   // faísca sobe de leve, ao contrário de poeira
    }
  }

  // ---------------------------------------------------------------
  // DESENHO — os dois esperam o ctx JÁ transladado para o mundo
  // (ctx.translate(-cam.x, -cam.y)), como fazem os drawSolids das fases.
  // ---------------------------------------------------------------
  function desenharLumis(ctx, cam, lumis, spr, t) {
    var x0 = cam.x - MARGEM, x1 = cam.x + VIEW_W + MARGEM;
    ctx.save();
    for (var i = 0; i < lumis.length; i++) {
      var l = lumis[i];
      if (l.taken || l.x > x1 || l.x < x0) continue;
      var bob = Math.sin(t * 2 + l.ph) * 5;
      ctx.globalAlpha = 0.72 + 0.28 * Math.sin(t * 3 + l.ph * 1.3);
      ctx.drawImage(spr, l.x - 18, l.y - 18 + bob);
    }
    ctx.restore();
  }

  // Faíscas não são cortadas por culling: são poucas, vivem meio segundo e
  // só existem onde o player acabou de passar — ou seja, sempre na tela.
  function desenharFaiscas(ctx, sparks) {
    ctx.save();
    ctx.fillStyle = '#ffe9a0';
    for (var i = 0; i < sparks.length; i++) {
      var pk = sparks[i];
      if (pk.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, pk.life / pk.max);
      ctx.beginPath(); ctx.arc(pk.x, pk.y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------
  // CULLING — ~1 tela de folga em volta da câmera. Retângulo em coordenadas
  // de mundo; a câmera é o canto superior esquerdo da vista.
  // ---------------------------------------------------------------
  function visible(cam, x, y, w, h) {
    return x + w > cam.x - MARGEM && x < cam.x + VIEW_W + MARGEM &&
           y + h > cam.y - MARGEM && y < cam.y + VIEW_H + MARGEM;
  }

  // ---------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------
  FG.levelkit = {
    VIEW_W: VIEW_W,
    VIEW_H: VIEW_H,
    MARGEM: MARGEM,
    S: S,
    makeRand: makeRand,
    lumiLine: lumiLine,
    lumiCol: lumiCol,
    lumiArc: lumiArc,
    makeCanvas: makeCanvas,
    makeLumiSprite: makeLumiSprite,
    makeSparks: makeSparks,
    burst: burst,
    apagarFaiscas: apagarFaiscas,
    coletarLumis: coletarLumis,
    desenharLumis: desenharLumis,
    desenharFaiscas: desenharFaiscas,
    visible: visible,
  };
})();
