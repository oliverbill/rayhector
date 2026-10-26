// Fagulho: Lendas do Bosque — companion.js
// FG.companion: o MurphOliver, o sapinho voador resgatado da jaula do caçador
// na fase da floresta. Depois do resgate ele acompanha o Heitor pelo resto da
// partida (persiste entre fases; só zera em jogo novo), voando com asinhas de
// libélula sempre um pouco atrás e acima. Não colide, não machuca, não morre —
// mas reage (comemora o soco, se entristece quando a fagulha apaga) e ajuda de
// DUAS maneiras:
//  1. Na fase, por conta própria: conta os inimigos que chegam perto do
//     jogador e, a cada 10, voa até o mais próximo e o elimina (uma bordoada,
//     morte pelo caminho normal do enemies.js). Só 1 em cada 10 — quem limpa
//     a fase continua sendo o jogador.
//  2. Na luta de chefão, sob comando (botão próprio, fiação no engine/touch):
//     voa até o chefão e faz CÓCEGAS nele, forçando a janela de
//     vulnerabilidade (boss.forceExpose). Custa caro: depois ele descansa 30s
//     dormindo no posto. Fora da luta o botão fica desabilitado
//     (podeComandar() é o critério — o touch.js o lê para apagar o botão).
//
// A cabeça é a foto real INTEIRA (FG.assets.murphHead, embutida em assets.js
// com cabelo e laço prateado), desenhada grande sobre o corpinho de sapo verde
// — o mesmo padrão do herói com FG.assets.heitorHead. Enquanto a imagem não
// decodifica, uma cabeça cartoon de sapo segura o lugar.
// Nenhuma referência a outros módulos FG no load — só em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  var W = 44, H = 48;          // caixa visual (não há hitbox: nada colide)

  // pool fixa dos "hihihi" das cócegas (coordenadas de mundo)
  var giggles = [];
  for (var gi = 0; gi < 8; gi++) giggles.push({ x: 0, y: 0, life: 0, max: 1 });
  giggles.i = 0;

  var comp = {
    active: false,             // resgatado nesta partida?
    x: 0, y: 0,
    facing: 1,
    vx: 0, vy: 0,              // mola: velocidade do seguimento

    // reações
    cheer: 0,                  // >0: comemorando o soco (pulinho)
    prevAttack: false,         // borda de subida do soco do player

    // --- a habilidade de cócegas ---
    // mode: 'segue' (posto normal) | 'cocegas' (voo + cócegas no chefão) |
    // 'descansa' (dormindo 30s atrás do jogador — o cooldown É o descanso) |
    // 'ataca' (a ajuda automática: voo + bordoada num inimigo comum).
    mode: 'segue',
    cocegasFase: 0,            // 0 = voando até o chefão, 1 = fazendo cócegas
    cocegasT: 0,
    restTimer: 0,              // segundos de descanso restantes (0 = pronto)
    REST_MAX: 30,

    // --- a ajuda automática (1 inimigo a cada 10) ---
    vistos: 0,                 // inimigos que já entraram no raio do jogador
    AJUDA_CADA: 10,
    alvo: null,                // o inimigo da bordoada corrente
    ataqueFase: 0,             // 0 = voando até o alvo, 1 = bordoada
    ataqueT: 0,

    // Resgate: a fase chama quando a jaula quebra. Nasce no lugar da jaula e
    // a mola o leva até o posto atrás do jogador.
    rescue: function (x, y) {
      this.active = true;
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.cheer = 1.2;        // sai da jaula comemorando
      this.mode = 'segue';
      this.restTimer = 0;
      this.vistos = 0;
      this.alvo = null;
    },

    // Chamado pelo engine: novoJogo === true desativa (jogo novo zera o
    // resgate, como as lumis); troca de fase só reposiciona perto do início.
    // O descanso zera na troca — EXCETO se a troca o pegou no meio das
    // cócegas: a cóceja foi gasta, o descanso vale mesmo assim.
    reset: function (novoJogo) {
      apagarGiggles();
      // a contagem da ajuda zera junto com a lista de inimigos (as marcas
      // _murphVisto morrem com os objetos repovoados pelo enemies.reset)
      this.vistos = 0;
      this.alvo = null;
      if (novoJogo === true) {
        this.active = false;
        this.mode = 'segue';
        this.restTimer = 0;
        return;
      }
      if (!this.active) return;
      var st = FG.level && FG.level.playerStart;
      if (st) { this.x = st.x - 50; this.y = st.y - 40; }
      this.vx = 0; this.vy = 0;
      this.cheer = 0;
      if (this.mode === 'ataca') this.mode = 'segue';
      if (this.mode === 'cocegas') {
        this.mode = 'descansa';
        this.restTimer = this.REST_MAX;
      } else {
        this.mode = 'segue';
        this.restTimer = 0;
      }
    },

    // O comando só existe na luta de chefão: fora dela o botão fica
    // desabilitado (o touch.js desenha apagado lendo este critério) e a
    // tecla não faz nada. Descansando, idem — mas aí o visual é o de recarga.
    podeComandar: function () {
      if (!this.active || this.mode !== 'segue' || this.restTimer > 0) return false;
      var b = FG.enemies && FG.enemies.boss;
      return !!(b && b.started && !b.dead && typeof b.forceExpose === 'function');
    },

    // Borda de subida do botão de comando (o engine chama). No-op total fora
    // das condições de podeComandar() — nada de pulinho: botão desabilitado
    // não responde.
    command: function () {
      if (!this.podeComandar()) return;
      this.mode = 'cocegas';
      this.cocegasFase = 0;
      this.cocegasT = 0;
      this.vx = 0; this.vy = 0;
    },

    update: function (dt) {
      var p = FG.player;
      if (!p) return;

      // descanso corre sempre, até dormindo em fase nova
      if (this.restTimer > 0) {
        this.restTimer -= dt;
        if (this.restTimer <= 0) {
          this.restTimer = 0;
          if (this.mode === 'descansa') this.mode = 'segue';
        }
      }

      // envelhece os hihihi
      for (var i = 0; i < giggles.length; i++) {
        var g = giggles[i];
        if (g.life <= 0) continue;
        g.life -= dt;
        g.y -= 34 * dt;
      }

      if (this.mode === 'cocegas') { this.updateCocegas(dt); return; }
      if (this.mode === 'ataca') { this.updateAtaque(dt); return; }

      // a ajuda automática só arma seguindo, acordado e fora de luta de
      // chefão (na luta o elenco comum nem existe — clearRegulares)
      if (this.mode === 'segue') this.contarInimigos(p);

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

      // comemora a borda de subida do soco (dormindo, nem percebe)
      var atk = !!(p.attackBox && p.attackBox.active);
      if (atk && !this.prevAttack && this.mode === 'segue') this.cheer = 0.5;
      this.prevAttack = atk;
      if (this.cheer > 0) this.cheer -= dt;
    },

    // O voo até o chefão e as cócegas em si. O alvo é o ponto fraco
    // (boss.coreBox, recalculado por frame pelo próprio chefão), então o
    // MurphOliver acompanha a Dalilesma se debruçando. Se o chefão morrer ou
    // sumir no meio, volta ao posto — com o descanso valendo (cóceja gasta).
    updateCocegas: function (dt) {
      var b = FG.enemies && FG.enemies.boss;
      var vivo = b && b.started && !b.dead && typeof b.forceExpose === 'function';
      if (!vivo && this.cocegasFase === 1) {
        this.mode = 'descansa';           // restTimer já está correndo
        return;
      }
      if (!vivo) {                        // morreu antes de chegar: gasta mesmo assim
        this.mode = 'descansa';
        this.restTimer = this.REST_MAX;
        return;
      }

      var tx, ty;
      if (b.coreBox) {
        tx = b.coreBox.x + b.coreBox.w / 2 - 30;
        ty = b.coreBox.y - 10;
      } else {
        tx = b.x - 60; ty = (b.groundY || this.y) - 160;
      }
      this.facing = tx >= this.x ? 1 : -1;

      if (this.cocegasFase === 0) {
        // voo rápido e direto (~0.5s para distâncias de arena)
        this.cocegasT += dt;
        var dx = tx - this.x, dy = ty - this.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var vel = 1100;
        if (dist < vel * dt || this.cocegasT > 0.9) {
          this.x = tx; this.y = ty;
          this.cocegasFase = 1;
          this.cocegasT = 1.2;            // duração das cócegas
          this.restTimer = this.REST_MAX; // gasto no ato
          b.forceExpose();
          FG.audio.sfx('lumi');
        } else {
          this.x += (dx / dist) * vel * dt;
          this.y += (dy / dist) * vel * dt;
        }
      } else {
        // cócegas: colado no ponto fraco, mãozinhas tremendo, hihihi subindo
        this.cocegasT -= dt;
        this.x += (tx - this.x) * Math.min(1, dt * 10);
        this.y += (ty - this.y) * Math.min(1, dt * 10);
        if (Math.random() < dt * 7) {
          var gg = giggles[giggles.i];
          giggles.i = (giggles.i + 1) % giggles.length;
          gg.x = this.x + (Math.random() - 0.5) * 30;
          gg.y = this.y - 16;
          gg.max = 0.8;
          gg.life = 0.8;
        }
        if (this.cocegasT <= 0) this.mode = 'descansa';
      }
    },

    // ---- a ajuda automática: 1 inimigo a cada 10 ----
    // Conta cada inimigo vivo que ENTRA no raio de 300px do jogador (a marca
    // _murphVisto vive no próprio objeto do inimigo e morre com ele no
    // repovoamento do enemies.reset). No décimo, parte para a bordoada no
    // inimigo contado mais próximo — e SÓ nesse: o contador zera no ato,
    // então ele nunca limpa a fase sozinho.
    contarInimigos: function (p) {
      var en = FG.enemies;
      if (!en || !en.list || typeof en.kill !== 'function') return;
      var b = en.boss;
      if (b && b.started && !b.dead) return;   // luta de chefão: ajuda de fase não age
      var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      var list = en.list;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e.dead || e._murphVisto) continue;
        var dx = e.x + e.w / 2 - cx, dy = e.y + e.h / 2 - cy;
        if (dx * dx + dy * dy < 300 * 300) {
          e._murphVisto = true;
          this.vistos++;
        }
      }
      if (this.vistos < this.AJUDA_CADA) return;

      // escolhe o contado vivo mais próximo do jogador
      var alvo = null, melhor = Infinity;
      for (var j = 0; j < list.length; j++) {
        var c = list[j];
        if (c.dead || !c._murphVisto) continue;
        var ddx = c.x + c.w / 2 - cx, ddy = c.y + c.h / 2 - cy;
        var d2 = ddx * ddx + ddy * ddy;
        if (d2 < melhor) { melhor = d2; alvo = c; }
      }
      this.vistos = 0;                         // gasto, com ou sem alvo
      if (!alvo) return;
      this.alvo = alvo;
      this.mode = 'ataca';
      this.ataqueFase = 0;
      this.ataqueT = 0;
    },

    // O voo e a bordoada. Alvo que morrer antes de ele chegar aborta a ida —
    // a ajuda foi gasta de qualquer jeito (o contador já zerou no disparo).
    updateAtaque: function (dt) {
      var a = this.alvo;
      if (!a || a.dead) { this.alvo = null; this.mode = 'segue'; return; }
      var tx = a.x + a.w / 2, ty = a.y - 14;
      this.facing = tx >= this.x ? 1 : -1;

      if (this.ataqueFase === 0) {
        this.ataqueT += dt;
        var dx = tx - this.x, dy = ty - this.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var vel = 900;
        if (dist < vel * dt || this.ataqueT > 0.9) {
          this.x = tx; this.y = ty;
          this.ataqueFase = 1;
          this.ataqueT = 0.4;                  // duração da bordoada
        } else {
          this.x += (dx / dist) * vel * dt;
          this.y += (dy / dist) * vel * dt;
        }
      } else {
        this.ataqueT -= dt;
        this.x += (tx - this.x) * Math.min(1, dt * 10);
        this.y += (ty - this.y) * Math.min(1, dt * 10);
        if (this.ataqueT <= 0) {
          if (!a.dead) FG.enemies.kill(a);     // pufe + sfx, o caminho normal
          this.alvo = null;
          this.cheer = 0.6;
          this.mode = 'segue';
        }
      }
    },

    draw: function (ctx, cam) {
      var sx = this.x - cam.x, sy = this.y - cam.y;
      if (sx < -120 || sx > 960 + 120 || sy < -140 || sy > 540 + 140) return;
      var t = FG.engine.time;
      var triste = FG.engine.state === 'dead';
      var dormindo = this.mode === 'descansa';
      var cocegando = (this.mode === 'cocegas' && this.cocegasFase === 1) ||
                      (this.mode === 'ataca' && this.ataqueFase === 1);
      var pulo = this.cheer > 0 ? Math.sin(this.cheer * Math.PI * 4) * 6 : 0;
      var bob = Math.sin(t * (dormindo ? 1.4 : 2.6)) * 0.04;
      ctx.save();
      ctx.translate(sx, sy - pulo);
      ctx.scale(this.facing, 1);
      ctx.scale(1 + bob, 1 - bob);             // squash no ritmo do bob
      desenharMurph(ctx, t, {
        voando: true, triste: triste, cheer: this.cheer > 0,
        dormindo: dormindo, cocegas: cocegando,
      });
      ctx.restore();

      // zzz do descanso, subindo devagar acima da cabeça
      if (dormindo && !triste) {
        ctx.save();
        ctx.fillStyle = 'rgba(200,220,255,0.85)';
        ctx.textAlign = 'center';
        for (var z = 0; z < 2; z++) {
          var zt = (t * 0.6 + z * 0.5) % 1;
          ctx.globalAlpha = (1 - zt) * 0.85;
          ctx.font = 'bold ' + (10 + z * 4 + zt * 6) + 'px "Trebuchet MS", sans-serif';
          ctx.fillText('z', sx + 14 + z * 10 + zt * 8, sy - 34 - zt * 22);
        }
        ctx.restore();
      }

      // hihihi das cócegas
      ctx.save();
      ctx.fillStyle = '#ffe9a0';
      ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      for (var i = 0; i < giggles.length; i++) {
        var g = giggles[i];
        if (g.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, g.life / g.max);
        ctx.fillText('hihihi', g.x - cam.x, g.y - cam.y);
      }
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

  function apagarGiggles() {
    for (var i = 0; i < giggles.length; i++) giggles[i].life = 0;
    giggles.i = 0;
  }

  // ------------------------------------------------------------------
  // O desenho em si, em coordenadas locais com origem no CENTRO do corpo.
  // Corpinho de sapo verde cartoon (camiseta verde com barra laranja, mãos e
  // pés de 3 dedos, asinhas de libélula) com a CABEÇA INTEIRA sendo a foto
  // real da criança (FG.assets.murphHead — cabelo, rosto e laço prateado já
  // vêm na própria foto), desenhada grande como a do herói. Fallback: cabeça
  // de sapo cartoon enquanto a foto não decodificou.
  // ------------------------------------------------------------------
  function desenharMurph(ctx, t, opts) {
    var voando = opts.voando, triste = opts.triste;
    var dormindo = !!opts.dormindo, cocegas = !!opts.cocegas;

    // asinhas de libélula atrás: duas de cada lado, batendo rápido (o borrão
    // vem do alpha e da escala pela batida). Dormindo: devagar; presa na
    // jaula: caídas, paradas; nas cócegas: frenéticas.
    var freq = cocegas ? 46 : (dormindo ? 8 : 34);
    var flap = voando ? Math.sin(t * freq) * (dormindo ? 0.5 : 1) : -0.6;
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

    // mãos verdes de 3 dedos: abertas comemorando, caídas quando triste,
    // tremendo feito doido nas cócegas
    var bracoY = opts.cheer ? -H * 0.1 : (triste ? H * 0.3 : H * 0.12);
    var wiggle = cocegas ? Math.sin(t * 30) : 0;
    if (cocegas) bracoY = -H * 0.02 + wiggle * 3;
    ctx.fillStyle = '#6ac832';
    for (var m = -1; m <= 1; m += 2) {
      ctx.save();
      ctx.translate(m * W * 0.46, bracoY + (voando ? Math.sin(t * 5 + m) * 2 : 0));
      ctx.rotate(m * (opts.cheer ? -0.7 : 0.25) + wiggle * m * 0.5);
      for (var d2 = -1; d2 <= 1; d2++) {
        ctx.beginPath();
        ctx.ellipse(d2 * 3, -2, 2, 4.2, d2 * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ---- a cabeça: a foto INTEIRA da criança, grande como a do herói ----
    // (cabelo, rosto e laço prateado já vêm na foto; nada é desenhado por
    // cima). O queixo assenta sobre a gola da camiseta.
    var img = FG.assets && FG.assets.murphHead;
    if (img && img.complete && img.naturalWidth > 0) {
      var HEAD_H = 34;
      var ratio = (FG.assets && FG.assets.murphHeadRatio) ||
                  (img.naturalWidth / img.naturalHeight) || 0.875;
      var HEAD_W = HEAD_H * ratio;
      ctx.save();
      ctx.shadowColor = 'rgba(120,210,70,0.9)';   // halo verde de sapinho
      ctx.shadowBlur = 9;
      ctx.drawImage(img, -HEAD_W / 2, -H * 0.56, HEAD_W, HEAD_H);
      ctx.restore();
      // lágrima quando triste (escorre do canto da foto)
      if (triste) {
        ctx.fillStyle = 'rgba(150,210,255,0.85)';
        ctx.beginPath();
        ctx.ellipse(-HEAD_W * 0.3, -H * 0.56 + HEAD_H * 0.8 + (Math.sin(t * 2) + 1) * 2,
          1.6, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // ---- fallback: cabeça de sapo cartoon enquanto a foto não decodifica ----
    var g = ctx.createRadialGradient(-4, -H * 0.22, 3, 0, -H * 0.1, W * 0.62);
    g.addColorStop(0, '#a8e050');
    g.addColorStop(0.55, '#74c030');
    g.addColorStop(1, '#3e7a1a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -H * 0.1, W * 0.52, H * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // sorriso ENORME (triste: boquinha virada para baixo)
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
      ctx.strokeStyle = 'rgba(150,140,120,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (var k = -2; k <= 2; k++) {
        ctx.moveTo(1 + k * 7, -H * 0.02);
        ctx.lineTo(1 + k * 8, H * 0.2);
      }
      ctx.stroke();
      ctx.restore();
    }

    // carinha cartoon (olhos grandes + franja castanha) + laço simples
    var fw = W * 0.56, fh = H * 0.42, fx = 2, fy = -H * 0.3;
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
    ctx.fillStyle = '#d8dde6';
    ctx.beginPath();
    ctx.moveTo(fx + 3, fy - fh * 0.62);
    ctx.lineTo(fx - 8, fy - fh * 0.62 - 6);
    ctx.lineTo(fx + 14, fy - fh * 0.62 - 6);
    ctx.closePath();
    ctx.fill();
  }

  FG.companion = comp;
})();
