// Fagulho: Lendas do Bosque — FG.touch: controles de toque (iPhone, iPad,
// Android). Sem eles o jogo simplesmente não é jogável num aparelho sem
// teclado: nem sair do menu dava, porque a única entrada era o keydown.
//
// Contrato (ver SPEC.md):
//   FG.touch.active   — true depois do primeiro toque (leitura; o engine usa
//                       para trocar os textos de tela e mandar desenhar)
//   FG.touch.draw(ctx) — desenha os botões em coordenadas do canvas (960×540)
//
// Os botões são pintados no próprio canvas, e não em DOM por cima dele, para
// acompanharem de graça o letterbox/escala do engine — a conversão do dedo
// para coordenadas do jogo sai de um único getBoundingClientRect.
window.FG = window.FG || {};

(function () {
  'use strict';

  var canvas = document.getElementById('game');
  if (!canvas) return;
  var VIEW_W = canvas.width, VIEW_H = canvas.height;

  var touch = { active: false, draw: draw };
  FG.touch = touch;

  // Sem touch events (desktop) nada disto é registrado.
  var temToque = ('ontouchstart' in window) ||
                 (window.navigator && window.navigator.maxTouchPoints > 0);
  if (!temToque) return;

  // Aparelho só-toque (iPhone, iPad, celular) já nasce com os botões na tela:
  // o menu diz "toque em PULO", e não "aperte ESPAÇO" numa tela sem teclado.
  // Num laptop com tela sensível o ponteiro é fino, então nada aparece até o
  // primeiro toque de verdade — quem tem mouse continua vendo o jogo limpo.
  try {
    touch.active = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch (e) { /* sem matchMedia: espera o primeiro toque */ }

  // ------------------------------------------------------------- os botões --
  // r = raio desenhado; hit = raio que responde ao dedo (sempre maior: mira de
  // dedo é grosseira, e errar o pulo por 8px é o que faz um controle parecer
  // quebrado). As posições fogem da barra do chefão (centro, y≈496) e do
  // quadro de comandos (canto superior direito).
  var BTNS = [
    { id: 'left',   action: 'left',   x: 96,  y: 452, r: 52, hit: 74, tipo: 'seta', dir: -1 },
    { id: 'right',  action: 'right',  x: 216, y: 452, r: 52, hit: 74, tipo: 'seta', dir: 1 },
    { id: 'attack', action: 'attack', x: 748, y: 462, r: 46, hit: 64, tipo: 'texto', label: 'SOCO' },
    { id: 'jump',   action: 'jump',   x: 872, y: 404, r: 62, hit: 82, tipo: 'texto', label: 'PULO' },
  ];
  var pressed = {};   // id -> true enquanto houver dedo em cima

  // Dedo -> coordenadas do canvas. O canvas é escalado por CSS (letterbox), e
  // é o rect que conta — não innerWidth/innerHeight.
  function pick(clientX, clientY, rect) {
    var sx = VIEW_W / rect.width, sy = VIEW_H / rect.height;
    var x = (clientX - rect.left) * sx;
    var y = (clientY - rect.top) * sy;
    var melhor = null, melhorD = Infinity;
    for (var i = 0; i < BTNS.length; i++) {
      var b = BTNS[i];
      var dx = x - b.x, dy = y - b.y;
      var d = dx * dx + dy * dy;
      if (d <= b.hit * b.hit && d < melhorD) { melhor = b; melhorD = d; }
    }
    return melhor;
  }

  // Reconstrói o estado inteiro a partir dos dedos que ainda estão na tela.
  // Sem contabilidade por identifier: arrastar o dedo de ◀ para ▶ (ou soltar
  // dois botões de uma vez) já cai certo, porque o estado é recalculado do zero.
  function sync(e) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var agora = {};
    var lista = e.touches || [];
    for (var i = 0; i < lista.length; i++) {
      var b = pick(lista[i].clientX, lista[i].clientY, rect);
      if (b) agora[b.id] = true;
    }
    for (var j = 0; j < BTNS.length; j++) {
      var bt = BTNS[j];
      var on = !!agora[bt.id], era = !!pressed[bt.id];
      if (on !== era) {
        pressed[bt.id] = on;
        if (FG.engine) FG.engine.setAction(bt.action, on);
      }
    }
  }

  function soltarTudo() {
    for (var i = 0; i < BTNS.length; i++) {
      if (pressed[BTNS[i].id]) {
        pressed[BTNS[i].id] = false;
        if (FG.engine) FG.engine.setAction(BTNS[i].action, false);
      }
    }
  }

  function onStart(e) {
    e.preventDefault();
    touch.active = true;
    if (FG.engine) FG.engine.gesture();   // destrava o áudio (o iOS exige gesto)

    // Fora dos botões, nas telas paradas (menu, fase completa, vitória), o
    // toque em qualquer lugar avança — é o que se espera de um jogo de celular.
    var rect = canvas.getBoundingClientRect();
    if (rect.width && FG.engine && FG.engine.state !== 'playing') {
      var t = e.changedTouches && e.changedTouches[0];
      if (t && !pick(t.clientX, t.clientY, rect)) {
        FG.engine.setAction('jump', true);
        FG.engine.setAction('jump', false);
      }
    }
    sync(e);
  }
  function onMove(e) { e.preventDefault(); sync(e); }
  function onEnd(e) { e.preventDefault(); sync(e); }

  // Ouvindo no document, não no canvas: o jogo é 16:9 e o iPhone é mais
  // comprido, então sobra tarja preta dos dois lados — dedo que cai ali ainda
  // é dedo no jogo, e sem isto a página rolava por baixo.
  var opt = { passive: false };
  document.addEventListener('touchstart', onStart, opt);
  document.addEventListener('touchmove', onMove, opt);
  document.addEventListener('touchend', onEnd, opt);
  document.addEventListener('touchcancel', function (e) { e.preventDefault(); soltarTudo(); }, opt);

  // Pinça de zoom no Safari: user-scalable=no é ignorado desde o iOS 10, e sem
  // isto uma pinça no meio da luta escala a página e desalinha os botões.
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, opt);

  // Trocar de app com o dedo no ◀ deixaria o Heitor correndo para sempre.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) soltarTudo();
  });
  window.addEventListener('blur', soltarTudo);

  // --------------------------------------------------------------- desenho --
  function circulo(ctx, b, on) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = on ? 'rgba(255,170,60,0.42)' : 'rgba(24,12,36,0.42)';
    ctx.fill();
    ctx.lineWidth = on ? 3.5 : 2.5;
    ctx.strokeStyle = on ? 'rgba(255,220,150,0.95)' : 'rgba(255,190,90,0.55)';
    ctx.stroke();
  }

  function seta(ctx, b, on) {
    var s = b.r * 0.42, d = b.dir;
    ctx.beginPath();
    ctx.moveTo(b.x + d * s, b.y);
    ctx.lineTo(b.x - d * s * 0.7, b.y - s);
    ctx.lineTo(b.x - d * s * 0.7, b.y + s);
    ctx.closePath();
    ctx.fillStyle = on ? '#fff2d0' : '#ffd870';
    ctx.fill();
  }

  function draw(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < BTNS.length; i++) {
      var b = BTNS[i], on = !!pressed[b.id];
      if (on) { ctx.shadowColor = '#ff9000'; ctx.shadowBlur = 18; } else ctx.shadowBlur = 0;
      circulo(ctx, b, on);
      ctx.shadowBlur = 0;
      if (b.tipo === 'seta') seta(ctx, b, on);
      else {
        ctx.font = 'bold ' + Math.round(b.r * 0.38) + 'px "Trebuchet MS", sans-serif';
        ctx.fillStyle = on ? '#fff2d0' : '#ffd870';
        ctx.fillText(b.label, b.x, b.y + 1);
      }
    }
    ctx.restore();
    if (retrato()) avisoGiro(ctx);
  }

  function retrato() {
    var w = (window.visualViewport && window.visualViewport.width) || window.innerWidth;
    var h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    return h > w;
  }

  // Em pé, o jogo 16:9 cabe numa faixa fina no meio da tela. Não bloqueia nada
  // — só avisa, e some sozinho ao girar.
  function avisoGiro(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var w = 330, h = 34, x = (VIEW_W - w) / 2, y = 8;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8); else ctx.rect(x, y, w, h);
    ctx.fillStyle = 'rgba(24,12,36,0.72)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,190,90,0.45)';
    ctx.stroke();
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#ffd870';
    ctx.fillText('vire o aparelho para a horizontal', VIEW_W / 2, y + h / 2 + 1);
    ctx.restore();
  }
})();
