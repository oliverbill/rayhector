// Fagulho: Lendas do Bosque — companion.js
// FG.companion: o MurphOliver, o sapinho voador resgatado da jaula do caçador
// na fase da floresta. Depois do resgate ele acompanha o Heitor pelo resto da
// partida (persiste entre fases; só zera em jogo novo), voando com asinhas de
// libélula sempre um pouco atrás e acima. É puramente cosmético: não colide,
// não machuca, não morre — mas reage (comemora o soco, se entristece quando a
// fagulha apaga).
//
// O rosto é a foto real (FG.assets.murphHead, embutida em assets.js como a do
// Heitor), recortada em elipse sobre o corpo de sapo verde de sorriso enorme;
// enquanto a imagem não decodifica, um rosto cartoon simples segura o lugar.
// Nenhuma referência a outros módulos FG no load — só em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  var W = 44, H = 48;          // caixa visual (não há hitbox: nada colide)

  var comp = {
    active: false,             // resgatado nesta partida?
    x: 0, y: 0,
    facing: 1,
    vx: 0, vy: 0,              // mola: velocidade do seguimento

    // reações
    cheer: 0,                  // >0: comemorando o soco (pulinho)
    prevAttack: false,         // borda de subida do soco do player

    // Resgate: a fase chama quando a jaula quebra. Nasce no lugar da jaula e
    // a mola o leva até o posto atrás do jogador.
    rescue: function (x, y) {
      this.active = true;
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.cheer = 1.2;        // sai da jaula comemorando
    },

    // Chamado pelo engine: novoJogo === true desativa (jogo novo zera o
    // resgate, como as lumis); troca de fase só reposiciona perto do início,
    // para ele não atravessar o mundo voando atrás do jogador.
    reset: function (novoJogo) {
      if (novoJogo === true) { this.active = false; return; }
      if (!this.active) return;
      var st = FG.level && FG.level.playerStart;
      if (st) { this.x = st.x - 50; this.y = st.y - 40; }
      this.vx = 0; this.vy = 0;
      this.cheer = 0;
    },

    update: function (dt) {
      var p = FG.player;
      if (!p) return;
      this.facing = p.facing || 1;

      // posto: ~70px atrás e ~40px acima do jogador, com bob senoidal
      var t = FG.engine.time;
      var alvoX = p.x + p.w / 2 - this.facing * 70;
      var alvoY = p.y - 40 + Math.sin(t * 2.6) * 7;

      // mola suave (crítico-amortecida na prática: constante alta de
      // amortecimento), independente de fps
      var K = 26, D = 7.5;
      this.vx += ((alvoX - this.x) * K - this.vx * D) * dt;
      this.vy += ((alvoY - this.y) * K - this.vy * D) * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // comemora a borda de subida do soco
      var atk = !!(p.attackBox && p.attackBox.active);
      if (atk && !this.prevAttack) this.cheer = 0.5;
      this.prevAttack = atk;
      if (this.cheer > 0) this.cheer -= dt;
    },

    draw: function (ctx, cam) {
      var sx = this.x - cam.x, sy = this.y - cam.y;
      if (sx < -120 || sx > 960 + 120 || sy < -140 || sy > 540 + 140) return;
      var t = FG.engine.time;
      var triste = FG.engine.state === 'dead';
      var pulo = this.cheer > 0 ? Math.sin(this.cheer * Math.PI * 4) * 6 : 0;
      var bob = Math.sin(t * 2.6) * 0.04;
      ctx.save();
      ctx.translate(sx, sy - pulo);
      ctx.scale(this.facing, 1);
      ctx.scale(1 + bob, 1 - bob);             // squash no ritmo do bob
      desenharMurph(ctx, t, { voando: true, triste: triste, cheer: this.cheer > 0 });
      ctx.restore();
    },

    // Versão presa: sentado e encolhido dentro da jaula, olhos tristes, sem
    // asas abertas. A fase desenha no lugar da jaula (coordenadas de mundo,
    // ctx já transladado). x,y = centro do sapinho.
    drawCaged: function (ctx, x, y) {
      var t = FG.engine.time;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(0.85, 0.78);                   // encolhido
      desenharMurph(ctx, t, { voando: false, triste: true, cheer: false });
      ctx.restore();
    },
  };

  // ------------------------------------------------------------------
  // O desenho em si, em coordenadas locais com origem no CENTRO do corpo.
  // Corpo de sapo verde cartoon: cabeça-corpo são uma coisa só, sorriso
  // ENORME de dentes brancos ocupando a metade de baixo, camiseta verde com
  // detalhes laranja, mãos e pés de 3 dedos, asinhas de libélula. O rosto da
  // criança (FG.assets.murphHead) entra recortado em elipse na metade de
  // cima, com o laço prateado no topo.
  // ------------------------------------------------------------------
  function desenharMurph(ctx, t, opts) {
    var voando = opts.voando, triste = opts.triste;

    // asinhas de libélula atrás: duas de cada lado, batendo rápido (o borrão
    // vem do alpha e da escala pela batida). Presa na jaula: caídas, paradas.
    var flap = voando ? Math.sin(t * 34) : -0.6;
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (var s = -1; s <= 1; s += 2) {
      for (var i = 0; i < 2; i++) {
        ctx.save();
        ctx.translate(-W * 0.2, -H * 0.05 + i * 7);
        ctx.rotate(s * (0.5 + i * 0.35) * (0.4 + 0.6 * Math.abs(flap)) * (voando ? 1 : 0.3) - (voando ? 0 : 0.5));
        var wg = ctx.createLinearGradient(0, 0, -30, 0);
        wg.addColorStop(0, 'rgba(210,245,255,0.9)');
        wg.addColorStop(1, 'rgba(160,210,255,0.25)');
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.ellipse(-16, s * -3, 17, 5.5, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
        // nervura
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-2, s * -1); ctx.lineTo(-30, s * -4);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();

    // pés verdes de 3 dedos, balançando no voo (juntos e quietos na jaula)
    var kick = voando ? Math.sin(t * 5) * 3 : 0;
    ctx.fillStyle = '#5ab42a';
    for (var f = -1; f <= 1; f += 2) {
      ctx.save();
      ctx.translate(f * 8, H * 0.42 + (voando ? f * kick : 2));
      for (var d = -1; d <= 1; d++) {
        ctx.beginPath();
        ctx.ellipse(d * 3.2, 2, 2.2, 4.4, d * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // camiseta: trapézio verde-escuro com barra e punhos laranja
    var tg = ctx.createLinearGradient(0, H * 0.02, 0, H * 0.42);
    tg.addColorStop(0, '#2e8a30');
    tg.addColorStop(1, '#1d6020');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(-W * 0.3, H * 0.06);
    ctx.quadraticCurveTo(0, H * 0.14, W * 0.3, H * 0.06);
    ctx.lineTo(W * 0.36, H * 0.4);
    ctx.quadraticCurveTo(0, H * 0.48, -W * 0.36, H * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e88020';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-W * 0.35, H * 0.385);
    ctx.quadraticCurveTo(0, H * 0.46, W * 0.35, H * 0.385);
    ctx.stroke();
    // medalhinha vermelha no peito (como na referência)
    ctx.fillStyle = '#c03048';
    ctx.beginPath(); ctx.arc(0, H * 0.22, 2.6, 0, Math.PI * 2); ctx.fill();

    // mãos verdes de 3 dedos: abertas comemorando, caídas quando triste
    var bracoY = opts.cheer ? -H * 0.1 : (triste ? H * 0.3 : H * 0.12);
    ctx.fillStyle = '#6ac832';
    for (var m = -1; m <= 1; m += 2) {
      ctx.save();
      ctx.translate(m * W * 0.46, bracoY + (voando ? Math.sin(t * 5 + m) * 2 : 0));
      ctx.rotate(m * (opts.cheer ? -0.7 : 0.25));
      for (var d2 = -1; d2 <= 1; d2++) {
        ctx.beginPath();
        ctx.ellipse(d2 * 3, -2, 2, 4.2, d2 * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // cabeça-corpo: a grande bolota verde (mais larga que alta, como o sapo
    // da referência), com gradiente e pintinhas
    var g = ctx.createRadialGradient(-4, -H * 0.22, 3, 0, -H * 0.1, W * 0.62);
    g.addColorStop(0, '#a8e050');
    g.addColorStop(0.55, '#74c030');
    g.addColorStop(1, '#3e7a1a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -H * 0.1, W * 0.52, H * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(46,96,20,0.5)';
    ctx.beginPath();
    ctx.arc(-W * 0.3, -H * 0.3, 1.6, 0, Math.PI * 2);
    ctx.arc(-W * 0.18, -H * 0.38, 1.2, 0, Math.PI * 2);
    ctx.arc(W * 0.3, -H * 0.32, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // sorriso ENORME: crescente branco de dentes ocupando a metade de baixo
    // da bolota (triste: boquinha pequena virada para baixo)
    if (triste) {
      ctx.strokeStyle = '#2e5a14';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(2, H * 0.12, 6, Math.PI + 0.5, -0.5);
      ctx.stroke();
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(1, H * 0.02, W * 0.46, H * 0.22, 0.04, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#f4f0e4';
      ctx.beginPath();
      ctx.ellipse(1, -H * 0.04, W * 0.46, H * 0.24, 0.04, 0, Math.PI);
      ctx.fill();
      // grade dos dentes
      ctx.strokeStyle = 'rgba(150,140,120,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (var k = -2; k <= 2; k++) {
        ctx.moveTo(1 + k * 7, -H * 0.02);
        ctx.lineTo(1 + k * 8, H * 0.2);
      }
      ctx.moveTo(-W * 0.42, H * 0.05);
      ctx.quadraticCurveTo(1, H * 0.12, W * 0.44, H * 0.05);
      ctx.stroke();
      ctx.restore();
      // lábio: contorno do sorriso
      ctx.strokeStyle = '#2e5a14';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(1, -H * 0.04, W * 0.46, H * 0.24, 0.04, 0.08, Math.PI - 0.08);
      ctx.stroke();
    }

    // o rosto real: FG.assets.murphHead recortado em elipse na metade de
    // cima da bolota (cabelo castanho de franja incluído na própria foto).
    // Fallback cartoon enquanto não decodificou.
    var img = FG.assets && FG.assets.murphHead;
    var fw = W * 0.56, fh = H * 0.42;          // elipse do rosto
    var fx = 2, fy = -H * 0.3;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(fx, fy, fw / 2, fh / 2, 0, 0, Math.PI * 2);
      ctx.clip();
      // a foto é retrato (mais alta que larga): cobre a elipse pela largura
      var ar = img.naturalWidth / img.naturalHeight;
      var dw = fw * 1.15, dh = dw / ar;
      ctx.drawImage(img, fx - dw / 2, fy - dh * 0.42, dw, dh);
      ctx.restore();
      // aro suave para o recorte assentar no verde
      ctx.strokeStyle = 'rgba(46,96,20,0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(fx, fy, fw / 2, fh / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // fallback: carinha cartoon (olhos grandes + franja castanha)
      ctx.fillStyle = '#e8c49a';
      ctx.beginPath();
      ctx.ellipse(fx, fy, fw / 2, fh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6a4826';
      ctx.beginPath();
      ctx.ellipse(fx, fy - fh * 0.3, fw * 0.52, fh * 0.26, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#2a1a10';
      ctx.beginPath();
      ctx.arc(fx - 4.5, fy + 1, 1.8, 0, Math.PI * 2);
      ctx.arc(fx + 4.5, fy + 1, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // laço prateado brilhante no topo: dois triângulos com gradiente prata,
    // nó no meio e pontinhos de brilho que piscam
    ctx.save();
    ctx.translate(fx + 3, fy - fh * 0.62);
    ctx.rotate(-0.12);
    var lg = ctx.createLinearGradient(-10, -6, 10, 6);
    lg.addColorStop(0, '#f2f4f8');
    lg.addColorStop(0.5, '#b8c0cc');
    lg.addColorStop(1, '#e8ecf2');
    ctx.fillStyle = lg;
    ctx.beginPath();                            // asa esquerda do laço
    ctx.moveTo(0, 0);
    ctx.lineTo(-11, -6.5);
    ctx.quadraticCurveTo(-13, -2, -10, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();                            // asa direita
    ctx.moveTo(0, 0);
    ctx.lineTo(11, -6.5);
    ctx.quadraticCurveTo(13, -2, 10, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d8dde6';
    ctx.beginPath(); ctx.arc(0, -1, 2.6, 0, Math.PI * 2); ctx.fill();  // nó
    // brilhos
    ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * Math.sin(t * 5)) + ')';
    ctx.beginPath();
    ctx.arc(-6, -3, 1, 0, Math.PI * 2);
    ctx.arc(7, -2, 0.9, 0, Math.PI * 2);
    ctx.arc(1, -4.5, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // lágrima quando triste (na jaula ou com a fagulha apagada)
    if (triste) {
      ctx.fillStyle = 'rgba(150,210,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(fx - fw * 0.34, fy + fh * 0.4 + (Math.sin(t * 2) + 1) * 2, 1.6, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  FG.companion = comp;
})();
