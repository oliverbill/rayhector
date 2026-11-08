// RayHector: As Aventuras do Menino-gênio — maggiemako.js
// FG.maggie: a MAGGIE MAKO, a tubarona teal da linha Nightmare Critters
// (mesma família do Baba Chops/Icky Licky/Rabie Baby) — barriga clara,
// barbatana dorsal na cabeça, rabo de tubarão, sorriso ENORME de dentes
// triangulares, olhos bravos puxados e o colar com o DENTE DE TUBARÃO
// dourado no peito. Ajudante exclusiva da luta contra o BUJÃOZINHO VEROLA
// na fase 8 (a arena fica sobre um mar de LAVA). Fora dessa luta ela não
// existe: o botão dela (touch.js) e a tecla B só respondem com a Verola
// acordada.
//
// Mesmos moldes dos outros ajudantes, com a entrada temática dela: sob
// comando ela SALTA DA LAVA como um tubarão saltando da água — surge num
// arco vindo de fora da arena por baixo/esquerda, com respingos de lava e
// um rastro de gotículas incandescentes — dá uma DENTADA (CHOMP! em vez de
// POW!) na Verola (um takeHit de verdade, o mesmo dano do soco do jogador)
// e mergulha de volta na lava saindo de cena. Pode ser acionada a cada 30s
// (restTimer).
//
// Desenhada 100% em canvas, SEM sprite — e com TODOS os membros articulados
// de verdade: o rabo bate na base (senoide de nado no voo), as barbatanas
// laterais remam no ombro, a dorsal da cabeça balança, a MANDÍBULA abre na
// dobradiça (o bocão arma a dentada e fecha com força) e o colar de dente
// balança no fio. O desenho local é grande, mas a ESCALA final a deixa do
// porte dos outros ajudantes (~2x o jogador — ver SCALE no draw).
// Nenhuma referência a outros módulos FG no load — só em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  // pool fixa dos "CHOMP!" da dentada (coordenadas de mundo)
  var chomps = [];
  for (var ni = 0; ni < 4; ni++) chomps.push({ x: 0, y: 0, life: 0, max: 1 });
  chomps.i = 0;

  // o CLARÃO dourado do colar: no instante da dentada o dente de tubarão
  // brilha num flash radial dourado (versão "tesouro" do raio do Rabie)
  var clarao = { t: 0, x: 0, y: 0, DUR: 0.35 };

  // o rastro de GOTÍCULAS incandescentes do salto: pool fixa de pingos de
  // lava que nascem atrás dela no voo e caem apagando (coordenadas de mundo)
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

  var maggie = {
    // mode: 'fora' (no fundo da lava) | 'entra' (o salto em arco até a
    // Verola) | 'soca' (a dentada: arma o bocão e fecha) | 'sai' (mergulho
    // de volta na lava)
    mode: 'fora',
    x: 0, y: 0,              // y = linha da base do corpo (ela paira, não pisa)
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

    // A Maggie só existe na luta da Verola: é isto que o touch.js lê para o
    // botão dela aparecer — e some de novo quando a chefa morre.
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
      // o respingo da decolagem: a lava abre quando ela rompe a superfície
      respingo(fx, this.sx0 + 30, this.sy0 - 100, true);
      FG.audio.sfx('select');
    },

    // Chamado pelo engine junto com o reset do companion: qualquer reset de
    // fase/checkpoint a tira de cena. A recarga só sobrevive se a visita
    // chegou a ser gasta (socou) — morrer na chefa não devolve a dentada.
    reset: function (novoJogo) {
      for (var i = 0; i < chomps.length; i++) chomps[i].life = 0;
      chomps.i = 0;
      clarao.t = 0;
      for (var zg = 0; zg < gotas.length; zg++) gotas[zg].life = 0;
      gotas.i = 0;
      if (novoJogo === true || (this.mode !== 'fora' && !this.socou)) {
        this.restTimer = 0;          // interrompida antes de morder: não gasta
      }
      this.mode = 'fora';
      this.jaw = 0;
      this.chomp = 0;
      this.tilt = 0;
    },

    update: function (dt) {
      if (this.restTimer > 0) this.restTimer = Math.max(0, this.restTimer - dt);

      // envelhece os CHOMP!
      for (var i = 0; i < chomps.length; i++) {
        var n = chomps[i];
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
        // é o que dá a silhueta de tubarão saltando da água
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
        // o CHOMP!: dispara uma vez, na hora em que os dentes se encontram
        if (!this.socou && k2 >= 0.43) {
          this.socou = true;
          this.restTimer = this.REST_MAX;      // gasto no ato
          FG.audio.sfx('punch');
          // o colar acende: clarão dourado radial no dente de tubarão
          clarao.t = clarao.DUR;
          clarao.x = this.x + this.facing * 4;
          clarao.y = this.y - 56;
          FG.audio.sfx('bossRoar');
          if (FG.engine.shakeCamera) FG.engine.shakeCamera(13, 0.5);
          if (vivo && typeof b.takeHit === 'function') b.takeHit();
          var nh = chomps[chomps.i];
          chomps.i = (chomps.i + 1) % chomps.length;
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
          // o respingo do mergulho: a lava fecha em cima dela
          respingo(fx, this.x, Math.min(this.y, lavaY + 10) - 20, false);
          this.mode = 'fora';
        }
      }
    },

    draw: function (ctx, cam) {
      // os CHOMP! sobrevivem à saída dela de cena, então desenham sempre
      ctx.save();
      ctx.font = 'bold 24px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd890';
      ctx.strokeStyle = 'rgba(30,12,8,0.8)';
      ctx.lineWidth = 3;
      for (var i = 0; i < chomps.length; i++) {
        var n = chomps[i];
        if (n.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, n.life / n.max);
        ctx.strokeText('CHOMP!', n.x - cam.x, n.y - cam.y);
        ctx.fillText('CHOMP!', n.x - cam.x, n.y - cam.y);
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

      // o CLARÃO dourado do colar na dentada: flash radial + raios curtos
      if (clarao.t > 0) {
        var ka = clarao.t / clarao.DUR;      // 1 → 0
        var cx2 = clarao.x - cam.x, cy2 = clarao.y - cam.y;
        ctx.save();
        ctx.globalAlpha = Math.min(1, ka * 1.4);
        var gg = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, 90);
        gg.addColorStop(0, 'rgba(255,236,170,0.95)');
        gg.addColorStop(0.4, 'rgba(232,178,58,0.55)');
        gg.addColorStop(1, 'rgba(232,178,58,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(cx2, cy2, 90, 0, Math.PI * 2); ctx.fill();
        // raios de estrela saindo do dente
        ctx.strokeStyle = 'rgba(255,240,190,0.9)';
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
      // no voo o corpo ONDULA: o rabo bate forte (nado), as barbatanas remam
      var nado = Math.sin(t * (voando ? 16 : 6)) * (voando ? 1 : 0.35);

      ctx.save();
      ctx.translate(sx, sy);
      // o desenho local tem ~160px de altura; o SCALE a traz para o DOBRO
      // do porte do jogador (30×44) — ajudante parruda, bem visível
      var SCALE = 0.6;
      ctx.scale(this.facing * SCALE, SCALE);
      ctx.rotate(this.tilt);                 // inclinação do salto/mergulho
      desenharMaggie(ctx, t, {
        nado: nado,
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
  // para +x. Tubarona-mascote de pé: rabo de tubarão na base, corpo teal de
  // barriga clara com o colar de dente dourado, barbatanas laterais nos
  // ombros, cabeçorra com a dorsal em cima, olhos BRAVOS puxados e o bocão
  // de dentes triangulares com a mandíbula articulada na dobradiça — todos
  // os membros giram no seu próprio pivô.
  // ------------------------------------------------------------------
  // ---- cores da referência ----
  var TEAL = '#2aa6ad';         // pele azul-petróleo do corpo/cabeça
  var TEAL_ESC = '#1b747c';     // sombra da pele e miolo das barbatanas
  var BARRIGA = '#e8f0ea';      // barriga/focinho claros
  var TRACO = '#0b2326';        // contorno quase preto
  var BOCA = '#5e1420';         // interior do bocão
  var GENGIVA = '#a62838';      // gengiva atrás dos dentes
  var DENTE = '#ffffff';
  var OURO = '#e8b23a';         // o dente de tubarão do colar
  var FIO = '#4a3420';          // o fio do colar

  // barbatana lateral: o "braço" dela — triângulo de ponta caída que rema.
  // rot gira no ombro (0 = pendurada p/ baixo; negativo = p/ frente).
  function barbatana(ctx, px, py, rot, len) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.fillStyle = TEAL;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(14, len * 0.45, 6, len);          // borda da frente
    ctx.quadraticCurveTo(-6, len * 0.8, -10, len * 0.3);   // borda de trás
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // o vinco escuro da barbatana
    ctx.strokeStyle = TEAL_ESC;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.quadraticCurveTo(4, len * 0.5, 1, len * 0.82);
    ctx.stroke();
    ctx.restore();
  }

  function desenharMaggie(ctx, t, o) {
    var nado = o.nado, jaw = o.jaw, chomp = o.chomp || 0;
    // pivôs (origem na linha da base): rabo embaixo-atrás, corpo robusto,
    // cabeçorra de bocão em cima
    var RABO_Y = -30, OMBRO_Y = -72, CORPO_Y = -56, CABECA_Y = -108;
    var bob = Math.sin(t * 4) * 2;
    // o bote da dentada: o corpo inteiro avança junto com a mandíbula
    var lean = o.socando ? chomp * 0.16 : 0;

    ctx.save();
    if (lean) {
      ctx.translate(0, RABO_Y);
      ctx.rotate(lean);
      ctx.translate(0, -RABO_Y);
    }

    // ----- o RABO de tubarão (gira na base, é ele que "nada") -----
    ctx.save();
    ctx.translate(-16, RABO_Y);
    ctx.rotate(0.5 + nado * 0.5);            // batida da cauda
    ctx.fillStyle = TEAL;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3.5;
    // pedúnculo
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.quadraticCurveTo(-20, -4, -32, 2);
    ctx.quadraticCurveTo(-20, 8, 0, 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // a caudal em meia-lua: lóbulo de cima maior que o de baixo
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.quadraticCurveTo(-52, -18, -48, -34);  // lóbulo de cima
    ctx.quadraticCurveTo(-36, -16, -30, -4);
    ctx.quadraticCurveTo(-40, 8, -44, 22);     // lóbulo de baixo
    ctx.quadraticCurveTo(-34, 12, -26, 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // ----- barbatana de TRÁS (rema no ombro) -----
    var remoTras = o.socando ? 0.9 + chomp * 0.3 : 0.9 - nado * 0.45;
    ctx.globalAlpha = 0.85;
    barbatana(ctx, -12, OMBRO_Y, remoTras, 44);
    ctx.globalAlpha = 1;

    // ----- corpo: torpedo teal com a barriga clara e o COLAR -----
    ctx.save();
    ctx.translate(0, CORPO_Y + bob * 0.4);
    ctx.fillStyle = TEAL;
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
    ctx.strokeStyle = TEAL_ESC;
    ctx.lineWidth = 2;
    ctx.stroke();
    // guelras: três riscos na lateral
    ctx.strokeStyle = TEAL_ESC;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (var gl = 0; gl < 3; gl++) {
      ctx.moveTo(-16 + gl * 5, -12);
      ctx.quadraticCurveTo(-18 + gl * 5, -4, -16 + gl * 5, 2);
    }
    ctx.stroke();
    // ----- o COLAR: fio no pescoço com o dente de tubarão DOURADO -----
    ctx.save();
    ctx.translate(2, -14);
    ctx.rotate(Math.sin(t * 5) * 0.07);      // o pingente balança no fio
    ctx.strokeStyle = FIO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-16, -8);
    ctx.quadraticCurveTo(0, 4, 17, -9);      // a curva do fio no peito
    ctx.stroke();
    // o DENTE dourado: triângulo curvo com a base engastada
    ctx.fillStyle = OURO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.quadraticCurveTo(-7, 8, -2, 18);     // lado de trás do dente
    ctx.quadraticCurveTo(5, 10, 6, 2);       // lado da frente
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b9832a';               // o engaste
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-6, -1, 12, 4, 2); else ctx.rect(-6, -1, 12, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,245,210,0.7)'; // o brilho do ouro
    ctx.beginPath();
    ctx.ellipse(-2, 8, 1.6, 4, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // ----- barbatana da FRENTE (rema em contratempo) -----
    var remoFrente = o.socando ? -0.5 - chomp * 0.7 : -0.9 + nado * 0.45;
    barbatana(ctx, 12, OMBRO_Y, remoFrente, 46);

    // ----- a CABEÇORRA com a dorsal e o bocão -----
    ctx.save();
    ctx.translate(2, CABECA_Y + bob);
    ctx.rotate(o.socando ? chomp * 0.12 : Math.sin(t * 2.2) * 0.04);

    // a DORSAL na cabeça: triângulo curvo que balança na base
    ctx.save();
    ctx.translate(-6, -38);
    ctx.rotate(-0.12 + Math.sin(t * 3.4) * 0.08 + nado * 0.06);
    ctx.fillStyle = TEAL;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-14, 8);
    ctx.quadraticCurveTo(-10, -26, 6, -34);  // borda da frente, em foice
    ctx.quadraticCurveTo(2, -14, 12, 8);     // borda de trás, côncava
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = TEAL_ESC;              // o vinco
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.quadraticCurveTo(-3, -16, 4, -26);
    ctx.stroke();
    ctx.restore();

    // crânio: domo teal largo com o focinho claro
    ctx.fillStyle = TEAL;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, -12, 38, 32, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // o focinho claro: mancha na frente, por cima do bocão
    ctx.fillStyle = BARRIGA;
    ctx.beginPath();
    ctx.ellipse(16, -2, 18, 14, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = TEAL_ESC;
    ctx.lineWidth = 2;
    ctx.stroke();
    // narinas
    ctx.fillStyle = TRACO;
    ctx.beginPath();
    ctx.ellipse(24, -8, 2, 1.4, 0.3, 0, Math.PI * 2);
    ctx.ellipse(16, -10, 2, 1.4, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // ----- olhos BRAVOS puxados, com as sobrancelhas em V -----
    for (var m = 0; m < 2; m++) {
      var ox = m === 0 ? -14 : 14, oy = m === 0 ? -26 : -24;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(m === 0 ? 0.26 : -0.2);     // puxados: bravos
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = TRACO;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 6.5, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = TRACO;                 // pupila
      ctx.beginPath();
      ctx.arc(m === 0 ? 2 : -2, 0.5, 3.2, 0, Math.PI * 2);
      ctx.fill();
      // a pálpebra teal caída por cima: metade do olho coberta
      ctx.fillStyle = TEAL;
      ctx.beginPath();
      ctx.ellipse(0, -5, 11, 5, 0, 0, Math.PI, true);
      ctx.fill();
      ctx.restore();
    }
    // sobrancelha franzida: o V bravo
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-24, -40); ctx.lineTo(0, -31); ctx.lineTo(25, -39);
    ctx.stroke();

    // ----- o BOCÃO: maxilar de cima fixo, mandíbula na DOBRADIÇA -----
    // fundo do bocão (cresce com o jaw — é o escuro que aparece ao abrir)
    ctx.fillStyle = BOCA;
    ctx.beginPath();
    ctx.moveTo(-30, -6);
    ctx.quadraticCurveTo(4, -14, 36, -4);
    ctx.quadraticCurveTo(32, 12 + jaw * 14, 2, 15 + jaw * 16);
    ctx.quadraticCurveTo(-26, 12 + jaw * 12, -30, -6);
    ctx.closePath();
    ctx.fill();
    // a língua lá dentro (desce quando a boca abre)
    ctx.fillStyle = '#d4556a';
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-2, 8 + jaw * 12, 13, 5.5, 0.08, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // a fileira de DENTES triangulares do maxilar de CIMA — o sorriso enorme
    ctx.fillStyle = GENGIVA;
    ctx.beginPath();
    ctx.moveTo(-30, -6);
    ctx.quadraticCurveTo(4, -14, 36, -4);
    ctx.quadraticCurveTo(20, -4, 2, -5);
    ctx.quadraticCurveTo(-16, -6, -30, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = DENTE;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 1.8;
    for (var dc = 0; dc < 6; dc++) {
      var dx1 = -26 + dc * 10.5;
      var topoY = -7 - dc * 0.6;             // acompanha a curva do maxilar
      ctx.beginPath();
      ctx.moveTo(dx1, topoY);
      ctx.lineTo(dx1 + 4.5, topoY + 9 + (dc % 2));  // a ponta do triângulo
      ctx.lineTo(dx1 + 9, topoY + 0.5);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // a MANDÍBULA: gira na dobradiça (atrás, à esquerda) com o `jaw`,
    // com a fileira de dentes de baixo apontando para cima
    ctx.save();
    ctx.translate(-28, 4);
    ctx.rotate(0.04 + jaw * 0.55);
    // o queixo teal com o lábio claro
    ctx.fillStyle = TEAL;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(30, 16, 60, 4);
    ctx.quadraticCurveTo(32, 24, 2, 12);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = BARRIGA;                 // o lábio/queixo claro
    ctx.beginPath();
    ctx.moveTo(8, 10);
    ctx.quadraticCurveTo(30, 19, 52, 8);
    ctx.quadraticCurveTo(30, 16, 8, 10);
    ctx.closePath();
    ctx.fill();
    // dentes de baixo: triângulos menores, para cima
    ctx.fillStyle = DENTE;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 1.6;
    for (var db = 0; db < 5; db++) {
      var bx1 = 8 + db * 10;
      var baseY = 7 + Math.sin(db * 1.1) * 1.5;
      ctx.beginPath();
      ctx.moveTo(bx1 - 3.5, baseY);
      ctx.lineTo(bx1, baseY - 8);
      ctx.lineTo(bx1 + 3.5, baseY + 0.5);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    ctx.restore();   // cabeça
    ctx.restore();   // lean
  }

  FG.maggie = maggie;
})();
