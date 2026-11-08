// RayHector: As Aventuras do Menino-gênio — touille.js
// FG.touille: o TOUILLE, o ratinho cinza da linha Nightmare Critters (mesma
// família do Baba Chops/Icky Licky/Rabie Baby/Maggie Mako) — orelhonas
// redondas de miolo rosa, barriga clara, sorriso ENORME de boca escancarada
// com DOIS DENTÕES quadrados, olhos bravos em máscaras pretas, rabo comprido
// rosa de anéis e o colar com a ESPINHA DE PEIXE azul no peito. Ajudante
// exclusivo da luta contra o BUJÃOZINHO VEROLA na fase 8 (a arena fica sobre
// um mar de LAVA). Fora dessa luta ele não existe: o botão dele (touch.js) e
// a tecla B só respondem com a Verola acordada.
//
// Mesmos moldes dos outros ajudantes, com a entrada temática dele: sob
// comando ele SALTA DA LAVA — surge num arco vindo de fora da arena por
// baixo/esquerda, com respingos de lava e um rastro de gotículas
// incandescentes — dá uma DENTADA de dentões (NHAC! em vez de POW!) na
// Verola (um takeHit de verdade, o mesmo dano do soco do jogador) e mergulha
// de volta na lava saindo de cena. Pode ser acionado a cada 30s (restTimer).
//
// Desenhado 100% em canvas, SEM sprite — e com TODOS os membros articulados
// de verdade: o rabo de anéis chicoteia na base (senoide no voo), os bracinhos
// remam no ombro, as orelhonas abanam, a MANDÍBULA abre na dobradiça (o bocão
// arma a dentada e os dentões fecham com força) e a espinha de peixe balança
// no fio. O desenho local é grande, mas a ESCALA final o deixa do porte dos
// outros ajudantes (~2x o jogador — ver SCALE no draw).
// Nenhuma referência a outros módulos FG no load — só em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  // pool fixa dos "NHAC!" da dentada (coordenadas de mundo)
  var nhacs = [];
  for (var ni = 0; ni < 4; ni++) nhacs.push({ x: 0, y: 0, life: 0, max: 1 });
  nhacs.i = 0;

  // o CLARÃO azul do colar: no instante da dentada a espinha de peixe
  // brilha num flash radial azul (versão "peixe" do clarão da Maggie)
  var clarao = { t: 0, x: 0, y: 0, DUR: 0.35 };

  // o rastro de GOTÍCULAS incandescentes do salto: pool fixa de pingos de
  // lava que nascem atrás dele no voo e caem apagando (coordenadas de mundo)
  var gotas = [];
  for (var gi = 0; gi < 16; gi++) gotas.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 0 });
  gotas.i = 0;

  // respingo de lava: usado na decolagem e no mergulho de volta — um leque
  // de partículas laranja via fx.spawnParticle (a pool de partículas é do
  // enemies.js, aqui só se semeia)
  function respingo(fx, x, y, forte) {
    var n = forte ? 14 : 9;
    for (var p = 0; p < n; p++) {
      var quente = Math.random() < 0.5;
      fx.spawnParticle(x + fx.rand(-16, 16), y,
        fx.rand(-170, 170), fx.rand(-320, -90), 0.5 + Math.random() * 0.25,
        3 + Math.random() * 5, quente ? '#ff9a3c' : '#ffd24a', 520);
    }
  }

  var touille = {
    // mode: 'fora' (no fundo da lava) | 'entra' (o salto em arco até a
    // Verola) | 'soca' (a dentada: arma o bocão e fecha) | 'sai' (mergulho
    // de volta na lava)
    mode: 'fora',
    x: 0, y: 0,              // y = linha da base do corpo (ele paira, não pisa)
    facing: 1,
    t: 0,                    // relógio do estado corrente
    jaw: 0,                  // 0..1 — abertura da mandíbula na dobradiça
    chomp: 0,                // 0..1 — força do fechamento (lunge da dentada)
    tilt: 0,                 // inclinação do corpo no voo (nariz p/ cima/baixo)
    hoverY: 0,               // altura de pairar diante da Verola
    sx0: 0, sy0: 0,          // ponto de decolagem (dentro da lava)
    alvoX: 0, alvoY: 0,      // onde o arco do salto termina
    socou: false,            // o takeHit desta visita já disparou?
    restTimer: 0,
    REST_MAX: 30,

    // O Touille só existe na luta da Verola: é isto que o touch.js lê para o
    // botão dele aparecer — e some de novo quando a chefa morre.
    disponivel: function () {
      if (!FG.level || FG.level.bossId !== 'verola') return false;
      var b = FG.enemies && FG.enemies.boss;
      return !!(b && b.id === 'verola' && b.started && !b.dead);
    },

    podeComandar: function () {
      if (!this.disponivel() || this.mode !== 'fora' || this.restTimer > 0) return false;
      var b = FG.enemies.boss;
      // só depois da intro (active) — dentada em chefã ainda berrando não vale
      return !!(b.active && typeof b.takeHit === 'function');
    },

    // Borda de subida do botão/tecla B (o engine chama). No-op fora das
    // condições — botão desabilitado não responde.
    command: function () {
      if (!this.podeComandar()) return;
      var a = FG.level.arena;
      var fx = FG.enemies.fx;
      this.mode = 'entra';
      this.t = 0;
      this.jaw = 0;
      this.chomp = 0;
      this.socou = false;
      this.facing = 1;
      // decola de DENTRO da lava, fora da arena pela esquerda, por baixo —
      // a Verola mora na direita, então o arco atravessa a arena subindo
      this.sx0 = a.x - 60;
      this.sy0 = fx.groundYAt(a.x + 40, 300) + 120;
      this.x = this.sx0;
      this.y = this.sy0;
      this.tilt = -0.5;                       // nariz para cima na decolagem
      // o respingo da decolagem: a lava abre quando ele rompe a superfície
      respingo(fx, this.sx0 + 30, this.sy0 - 100, true);
      FG.audio.sfx('select');
    },

    // Chamado pelo engine junto com o reset do companion: qualquer reset de
    // fase/checkpoint o tira de cena. A recarga só sobrevive se a visita
    // chegou a ser gasta (socou) — morrer na chefa não devolve a dentada.
    reset: function (novoJogo) {
      for (var i = 0; i < nhacs.length; i++) nhacs[i].life = 0;
      nhacs.i = 0;
      clarao.t = 0;
      for (var zg = 0; zg < gotas.length; zg++) gotas[zg].life = 0;
      gotas.i = 0;
      if (novoJogo === true || (this.mode !== 'fora' && !this.socou)) {
        this.restTimer = 0;          // interrompido antes de morder: não gasta
      }
      this.mode = 'fora';
      this.jaw = 0;
      this.chomp = 0;
      this.tilt = 0;
    },

    update: function (dt) {
      if (this.restTimer > 0) this.restTimer = Math.max(0, this.restTimer - dt);

      // envelhece os NHAC!
      for (var i = 0; i < nhacs.length; i++) {
        var n = nhacs[i];
        if (n.life <= 0) continue;
        n.life -= dt;
        n.y -= 46 * dt;
      }

      // envelhece as gotículas de lava do rastro (caem como pingos de verdade)
      for (var gq = 0; gq < gotas.length; gq++) {
        var g2 = gotas[gq];
        if (g2.life <= 0) continue;
        g2.life -= dt;
        g2.vy += 620 * dt;           // gravidade: gota de lava cai
        g2.x += g2.vx * dt;
        g2.y += g2.vy * dt;
      }
      if (clarao.t > 0) clarao.t -= dt;

      if (this.mode === 'fora') return;

      var b = FG.enemies && FG.enemies.boss;
      var vivo = b && b.id === 'verola' && b.started && !b.dead;
      var fx = FG.enemies.fx;
      this.t += dt;

      // semeia o rastro incandescente enquanto voa (salto e mergulho)
      if (this.mode === 'entra' || this.mode === 'sai') {
        if (Math.random() < dt * 30) {
          var gt = gotas[gotas.i];
          gotas.i = (gotas.i + 1) % gotas.length;
          gt.x = this.x - this.facing * 20 + (Math.random() - 0.5) * 18;
          gt.y = this.y - 50 + (Math.random() - 0.5) * 30;
          gt.vx = (Math.random() - 0.5) * 50;
          gt.vy = -30 - Math.random() * 40;
          gt.max = 0.55;
          gt.life = 0.55;
          gt.size = 2.5 + Math.random() * 3;
        }
      }

      if (this.mode === 'entra') {
        // Verola morreu/sumiu no meio do salto: mergulha de volta sem gastar
        if (!vivo) { this.mode = 'sai'; this.t = 0; return; }
        // o arco mira a cara dela, na altura da dentada
        this.alvoX = b.x - 120;
        this.alvoY = fx.groundYAt(b.x, 300) - 130;
        this.hoverY = this.alvoY;
        this.facing = this.alvoX >= this.sx0 ? 1 : -1;
        var DUR = 0.9;
        var k = Math.min(1, this.t / DUR);
        // trajeto balístico desenhado à mão: lerp + barriga de seno por cima —
        // o salto de rato saindo da lava como se fosse um bueiro fervendo
        this.x = this.sx0 + (this.alvoX - this.sx0) * k;
        this.y = this.sy0 + (this.alvoY - this.sy0) * k - Math.sin(k * Math.PI) * 170;
        // nariz acompanha o arco: sobe apontando p/ cima, chega nivelando
        this.tilt = -0.5 + k * 0.6;
        if (k >= 1) {
          this.x = this.alvoX;
          this.y = this.alvoY;
          this.mode = 'soca';
          this.t = 0;
        }

      } else if (this.mode === 'soca') {
        if (vivo) this.facing = b.x >= this.x ? 1 : -1;
        // pairando: um bob suave na altura do bote
        this.y = this.hoverY + Math.sin(this.t * 6) * 5;
        this.tilt += (0 - this.tilt) * Math.min(1, dt * 8);
        // mandíbula: ESCANCARA (0→0.35s), FECHA com força (0.35→0.45s)
        var k2 = this.t;
        if (k2 < 0.35) { this.jaw = Math.min(1, k2 / 0.3); this.chomp = 0; }
        else if (k2 < 0.45) {
          var f = (k2 - 0.35) / 0.1;
          this.jaw = 1 - f;                   // fecha rápido: a dentada
          this.chomp = f;                     // e o corpo dá o bote junto
        } else { this.jaw = 0; this.chomp = 1; }
        // o NHAC!: dispara uma vez, na hora em que os dentões se encontram
        if (!this.socou && k2 >= 0.43) {
          this.socou = true;
          this.restTimer = this.REST_MAX;      // gasto no ato
          FG.audio.sfx('punch');
          // o colar acende: clarão azul radial na espinha de peixe
          clarao.t = clarao.DUR;
          clarao.x = this.x + this.facing * 4;
          clarao.y = this.y - 56;
          FG.audio.sfx('bossRoar');
          if (FG.engine.shakeCamera) FG.engine.shakeCamera(13, 0.5);
          if (vivo && typeof b.takeHit === 'function') b.takeHit();
          var nh = nhacs[nhacs.i];
          nhacs.i = (nhacs.i + 1) % nhacs.length;
          nh.x = this.x + this.facing * 36;
          nh.y = this.y - 46;
          nh.max = 0.9;
          nh.life = 0.9;
          // faíscas de lava voando da mordida
          for (var p = 0; p < 10; p++) {
            fx.spawnParticle(this.x + this.facing * 30, this.y - 36,
              fx.rand(-160, 160), fx.rand(-260, -60), 0.5,
              3 + Math.random() * 4, '#ff9a3c', 420);
          }
        }
        if (this.t > 0.85) { this.mode = 'sai'; this.t = 0; this.facing = -1; }

      } else if (this.mode === 'sai') {
        // mergulha de volta: nariz para baixo, acelerando rumo à lava
        this.jaw = Math.max(0, this.jaw - dt * 5);
        this.chomp = Math.max(0, this.chomp - dt * 4);
        this.tilt += (0.7 - this.tilt) * Math.min(1, dt * 5);
        this.x += this.facing * 420 * dt;
        this.y += (160 + this.t * 700) * dt;
        var a = FG.level.arena;
        var lavaY = fx.groundYAt(a.x + a.w * 0.5, 300);
        if (this.y > lavaY + 110 || this.x < a.x - 120 ||
            this.x > a.x + a.w + 120 || this.t > 3) {
          // o respingo do mergulho: a lava fecha em cima dele
          respingo(fx, this.x, Math.min(this.y, lavaY + 10) - 20, false);
          this.mode = 'fora';
        }
      }
    },

    draw: function (ctx, cam) {
      // os NHAC! sobrevivem à saída dele de cena, então desenham sempre
      ctx.save();
      ctx.font = 'bold 24px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#bfe2ff';
      ctx.strokeStyle = 'rgba(10,18,30,0.8)';
      ctx.lineWidth = 3;
      for (var i = 0; i < nhacs.length; i++) {
        var n = nhacs[i];
        if (n.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, n.life / n.max);
        ctx.strokeText('NHAC!', n.x - cam.x, n.y - cam.y);
        ctx.fillText('NHAC!', n.x - cam.x, n.y - cam.y);
      }
      ctx.restore();

      // o rastro de gotículas incandescentes
      ctx.save();
      for (var gq = 0; gq < gotas.length; gq++) {
        var g3 = gotas[gq];
        if (g3.life <= 0) continue;
        var gx = g3.x - cam.x, gy = g3.y - cam.y;
        if (gx < -20 || gx > 980) continue;
        var kk = g3.life / g3.max;
        ctx.globalAlpha = kk;
        // miolo amarelo com casca laranja: pingo de lava viva
        ctx.fillStyle = '#ff8a2a';
        ctx.beginPath();
        ctx.arc(gx, gy, g3.size * (0.6 + kk * 0.4), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath();
        ctx.arc(gx, gy, g3.size * 0.45 * kk, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // o CLARÃO azul do colar na dentada: flash radial + raios curtos
      if (clarao.t > 0) {
        var ka = clarao.t / clarao.DUR;      // 1 → 0
        var cx2 = clarao.x - cam.x, cy2 = clarao.y - cam.y;
        ctx.save();
        ctx.globalAlpha = Math.min(1, ka * 1.4);
        var gg = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, 90);
        gg.addColorStop(0, 'rgba(200,236,255,0.95)');
        gg.addColorStop(0.4, 'rgba(46,134,212,0.55)');
        gg.addColorStop(1, 'rgba(46,134,212,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(cx2, cy2, 90, 0, Math.PI * 2); ctx.fill();
        // raios de estrela saindo da espinha
        ctx.strokeStyle = 'rgba(205,235,255,0.9)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (var rr = 0; rr < 6; rr++) {
          var aa = rr * Math.PI / 3 + (1 - ka) * 0.6;
          var r1 = 16, r2 = 16 + 44 * ka;
          ctx.moveTo(cx2 + Math.cos(aa) * r1, cy2 + Math.sin(aa) * r1);
          ctx.lineTo(cx2 + Math.cos(aa) * r2, cy2 + Math.sin(aa) * r2);
        }
        ctx.stroke();
        ctx.restore();
      }

      if (this.mode === 'fora') return;
      var sx = this.x - cam.x, sy = this.y - cam.y;
      if (sx < -160 || sx > 960 + 160 || sy < -220 || sy > 540 + 260) return;

      var t = FG.engine.time;
      var voando = this.mode === 'entra' || this.mode === 'sai';
      // no voo o corpo se agita: o rabo chicoteia, os bracinhos remam
      var agito = Math.sin(t * (voando ? 16 : 6)) * (voando ? 1 : 0.35);

      ctx.save();
      ctx.translate(sx, sy);
      // o desenho local tem ~160px de altura; o SCALE o traz para o DOBRO
      // do porte do jogador (30×44) — ajudante parrudo, bem visível
      var SCALE = 0.6;
      ctx.scale(this.facing * SCALE, SCALE);
      ctx.rotate(this.tilt);                 // inclinação do salto/mergulho
      desenharTouille(ctx, t, {
        agito: agito,
        voando: voando,
        jaw: this.jaw,
        chomp: this.chomp,
        socando: this.mode === 'soca',
      });
      ctx.restore();
    },
  };

  // ------------------------------------------------------------------
  // O fantoche, em coordenadas locais com origem na linha da base, olhando
  // para +x. Rato-mascote de pé: rabo rosa de anéis na base, corpo cinza de
  // barriga clara com o colar de espinha de peixe azul, bracinhos de mãos
  // escuras nos ombros, cabeçorra com as ORELHONAS redondas em cima, olhos
  // BRAVOS em máscaras pretas e o bocão escancarado com os DOIS DENTÕES e a
  // mandíbula articulada na dobradiça — todos os membros giram no seu
  // próprio pivô.
  // ------------------------------------------------------------------
  // ---- cores da referência ----
  var CINZA = '#6b6f73';        // pele cinza do corpo/cabeça
  var CINZA_ESC = '#45494d';    // sombra da pele, mãos e pés
  var BARRIGA = '#d7dad6';      // barriga/máscara do focinho claras
  var TRACO = '#16181a';        // contorno quase preto
  var BOCA = '#17090d';         // interior do bocão
  var LINGUA = '#e0556a';
  var DENTE = '#ffffff';
  var ORELHA = '#f5847c';       // miolo rosa das orelhonas
  var RABO = '#f0938c';         // o rabo rosa pelado
  var RABO_ESC = '#cf6f6a';     // os anéis do rabo
  var ESPINHA = '#2e86d4';      // a espinha de peixe do colar
  var FIO = '#1f3346';          // o fio do colar

  // bracinho: o "remo" dele — tubinho cinza com a mão escura de 4 dedos.
  // rot gira no ombro (0 = pendurado p/ baixo; negativo = p/ frente).
  function bracinho(ctx, px, py, rot, len) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.strokeStyle = TRACO;
    ctx.fillStyle = CINZA;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(10, len * 0.5, 4, len);
    ctx.quadraticCurveTo(-6, len * 0.7, -8, len * 0.25);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // a mão escura espalmada na ponta, com os dedinhos
    ctx.fillStyle = CINZA_ESC;
    ctx.beginPath();
    ctx.ellipse(0, len + 4, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var dd = -1; dd <= 1; dd++) {
      ctx.moveTo(dd * 4, len + 6);
      ctx.lineTo(dd * 5, len + 12);
    }
    ctx.stroke();
    ctx.restore();
  }

  function desenharTouille(ctx, t, o) {
    var agito = o.agito, jaw = o.jaw, chomp = o.chomp || 0;
    // pivôs (origem na linha da base): rabo embaixo-atrás, corpo em pêra,
    // cabeçorra de bocão em cima
    var RABO_Y = -22, OMBRO_Y = -70, CORPO_Y = -54, CABECA_Y = -106;
    var bob = Math.sin(t * 4) * 2;
    // o bote da dentada: o corpo inteiro avança junto com a mandíbula
    var lean = o.socando ? chomp * 0.16 : 0;

    ctx.save();
    if (lean) {
      ctx.translate(0, RABO_Y);
      ctx.rotate(lean);
      ctx.translate(0, -RABO_Y);
    }

    // ----- o RABO rosa de anéis (gira na base, é ele que chicoteia) -----
    ctx.save();
    ctx.translate(-14, RABO_Y);
    ctx.rotate(0.2 + agito * 0.35);
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    // o S do rabo: traço grosso escuro por baixo (o contorno)...
    var ponta = Math.sin(t * 5) * 8 + agito * 10;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-28, 10, -48, -6, -54, -30 + ponta * 0.4);
    ctx.stroke();
    // ...e o miolo rosa por cima
    ctx.strokeStyle = RABO;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-28, 10, -48, -6, -54, -30 + ponta * 0.4);
    ctx.stroke();
    // os anéis: risquinhos transversais ao longo do rabo
    ctx.strokeStyle = RABO_ESC;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (var an = 1; an <= 5; an++) {
      var ak = an / 6;
      // pontos aproximados sobre a bezier (bom o bastante para risquinhos)
      var axp = -54 * ak * ak * ak - 3 * -48 * ak * ak * (ak - 1) + 3 * -28 * ak * (ak - 1) * (ak - 1);
      var ayp = (-30 + ponta * 0.4) * ak * ak * ak + 3 * 6 * ak * ak * (ak - 1) - 3 * 10 * ak * (ak - 1) * (ak - 1);
      ctx.moveTo(axp - 3, ayp - 4);
      ctx.lineTo(axp + 3, ayp + 4);
    }
    ctx.stroke();
    ctx.restore();

    // ----- bracinho de TRÁS (rema no ombro) -----
    var remoTras = o.socando ? 0.9 + chomp * 0.3 : 0.9 - agito * 0.45;
    ctx.globalAlpha = 0.85;
    bracinho(ctx, -12, OMBRO_Y, remoTras, 40);
    ctx.globalAlpha = 1;

    // ----- corpo: pêra cinza com a barriga clara e o COLAR -----
    ctx.save();
    ctx.translate(0, CORPO_Y + bob * 0.4);
    ctx.fillStyle = CINZA;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(0, 2, 24, 30, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // a barriga clara: painel oval na frente
    ctx.fillStyle = BARRIGA;
    ctx.beginPath();
    ctx.ellipse(7, 7, 14, 22, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CINZA_ESC;
    ctx.lineWidth = 2;
    ctx.stroke();
    // os pezões escuros na base
    ctx.fillStyle = CINZA_ESC;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(-6, 32, 10, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(12, 32, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // ----- o COLAR: fio no pescoço com a ESPINHA DE PEIXE azul -----
    ctx.save();
    ctx.translate(2, -14);
    ctx.rotate(Math.sin(t * 5) * 0.07);      // o pingente balança no fio
    ctx.strokeStyle = FIO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-16, -8);
    ctx.quadraticCurveTo(0, 4, 17, -9);      // a curva do fio no peito
    ctx.stroke();
    // a ESPINHA: cabeça de peixe pra cima, coluna com as costelinhas e o
    // rabinho em V na ponta — tudo azul
    ctx.strokeStyle = TRACO;
    ctx.fillStyle = ESPINHA;
    ctx.lineWidth = 2;
    // a cabecinha triangular do peixe (com o olhinho)
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.quadraticCurveTo(0, -4, 5, 0);
    ctx.lineTo(3, 6); ctx.lineTo(-3, 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // a coluna
    ctx.strokeStyle = ESPINHA;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 6); ctx.lineTo(0, 22);
    ctx.stroke();
    // as costelinhas
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (var cs = 0; cs < 3; cs++) {
      var cy = 9 + cs * 4.5;
      ctx.moveTo(-5 + cs, cy); ctx.lineTo(5 - cs, cy);
    }
    ctx.stroke();
    // o rabinho em V
    ctx.beginPath();
    ctx.moveTo(-4, 26); ctx.lineTo(0, 21); ctx.lineTo(4, 26);
    ctx.stroke();
    // o olhinho da cabeça
    ctx.fillStyle = TRACO;
    ctx.beginPath();
    ctx.arc(2, 2, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // ----- bracinho da FRENTE (rema em contratempo) -----
    var remoFrente = o.socando ? -0.5 - chomp * 0.7 : -0.9 + agito * 0.45;
    bracinho(ctx, 12, OMBRO_Y, remoFrente, 42);

    // ----- a CABEÇORRA com as orelhonas e o bocão -----
    ctx.save();
    ctx.translate(2, CABECA_Y + bob);
    ctx.rotate(o.socando ? chomp * 0.12 : Math.sin(t * 2.2) * 0.04);

    // as ORELHONAS redondas: abanam na base, miolo rosa
    for (var or = 0; or < 2; or++) {
      var lado = or === 0 ? -1 : 1;
      ctx.save();
      ctx.translate(lado * 26, -34);
      ctx.rotate(lado * (0.25 + Math.sin(t * 3.4 + or) * 0.06 + agito * 0.05));
      ctx.fillStyle = CINZA;
      ctx.strokeStyle = TRACO;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(0, -14, 17, 20, lado * 0.2, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = ORELHA;
      ctx.beginPath();
      ctx.ellipse(0, -13, 11, 14, lado * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = CINZA_ESC;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // crânio: domo cinza largo com o tufinho rebelde no topo
    ctx.fillStyle = CINZA;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, -12, 38, 32, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // o tufinho de pelo no topo (três pontas)
    ctx.fillStyle = CINZA;
    ctx.beginPath();
    ctx.moveTo(-8, -40);
    ctx.quadraticCurveTo(-4, -52, 2, -46);
    ctx.quadraticCurveTo(6, -54, 10, -45);
    ctx.quadraticCurveTo(14, -50, 14, -41);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // ----- olhos BRAVOS em máscaras pretas (como na referência) -----
    for (var m = 0; m < 2; m++) {
      var ox = m === 0 ? -15 : 15, oy = m === 0 ? -26 : -24;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(m === 0 ? 0.22 : -0.18);    // puxados: bravos
      // a máscara preta em volta do olho
      ctx.fillStyle = TRACO;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      // o olho branco pequeno lá dentro
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(m === 0 ? 2 : -2, 0.5, 4.5, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // a pálpebra cinza caída por cima: o olhar bravo
      ctx.fillStyle = CINZA;
      ctx.beginPath();
      ctx.ellipse(0, -6, 13, 6, 0, 0, Math.PI, true);
      ctx.fill();
      ctx.restore();
    }
    // sobrancelha franzida: o V bravo
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-25, -40); ctx.lineTo(0, -31); ctx.lineTo(26, -39);
    ctx.stroke();

    // ----- a MÁSCARA clara do focinho em volta do bocão -----
    ctx.fillStyle = BARRIGA;
    ctx.strokeStyle = CINZA_ESC;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(2, 0, 34, 20, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // o NARIZ rosa na ponta do focinho, com os bigodes
    ctx.fillStyle = ORELHA;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(32, -8, 6, 4.5, 0.3, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(30, -2); ctx.lineTo(44, -4);
    ctx.moveTo(29, 1); ctx.lineTo(43, 3);
    ctx.stroke();

    // ----- o BOCÃO: maxilar de cima fixo, mandíbula na DOBRADIÇA -----
    // fundo do bocão (cresce com o jaw — é o escuro que aparece ao abrir)
    ctx.fillStyle = BOCA;
    ctx.beginPath();
    ctx.moveTo(-28, -5);
    ctx.quadraticCurveTo(4, -13, 34, -3);
    ctx.quadraticCurveTo(30, 12 + jaw * 14, 2, 15 + jaw * 16);
    ctx.quadraticCurveTo(-24, 12 + jaw * 12, -28, -5);
    ctx.closePath();
    ctx.fill();
    // a língua lá dentro (desce quando a boca abre)
    ctx.fillStyle = LINGUA;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-2, 8 + jaw * 12, 13, 5.5, 0.08, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // os DOIS DENTÕES quadrados do maxilar de CIMA — a marca do Touille
    ctx.fillStyle = DENTE;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.2;
    for (var dz = 0; dz < 2; dz++) {
      var dx1 = 2 + dz * 12;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(dx1, -7, 10.5, 15, 2.5);
      else ctx.rect(dx1, -7, 10.5, 15);
      ctx.fill(); ctx.stroke();
    }

    // a MANDÍBULA: gira na dobradiça (atrás, à esquerda) com o `jaw`
    ctx.save();
    ctx.translate(-26, 5);
    ctx.rotate(0.04 + jaw * 0.55);
    // o queixo cinza com o lábio claro
    ctx.fillStyle = CINZA;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(28, 15, 56, 3);
    ctx.quadraticCurveTo(30, 23, 2, 12);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = BARRIGA;                 // o lábio/queixo claro
    ctx.beginPath();
    ctx.moveTo(8, 10);
    ctx.quadraticCurveTo(28, 18, 48, 7);
    ctx.quadraticCurveTo(28, 15, 8, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();   // cabeça
    ctx.restore();   // lean
  }

  FG.touille = touille;
})();
