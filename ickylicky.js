// RayHector: As Aventuras do Menino-gênio — ickylicky.js
// FG.icky: o ICKY LICKY, a salamandra charcoal de manchas amarelas, bocão
// de aro amarelo e o pingente vermelho de risco biológico no pescoço —
// ajudante exclusivo da luta contra o ESBELTINHO OTTON na fase 5.
// Fora dessa luta ele não existe: o botão dele (touch.js) e a tecla B só
// aparecem/respondem com o Otton acordado.
//
// Mesmos moldes do Baba Chops/Allister/Poe/DragoWuggy: sob comando ele
// entra VOANDO com asinhas brancas, dá um SOCO no Otton (POW! — um takeHit
// de verdade, o mesmo dano do soco do jogador) e sai voando. Pode ser
// acionado a cada 30s (restTimer).
//
// Desenhado 100% em canvas, SEM sprite — e com TODOS os membros articulados
// de verdade: braços e pernas giram no ombro/quadril (dedos amarelos em
// bolinha, braço armando e desferindo o soco), a mandíbula do aro amarelo
// abre na dobradiça (ele berra no soco), o rabo de salamandra chicoteia e
// o pingente balança. O desenho local é grande, mas a ESCALA final o deixa
// do porte do jogador (ver SCALE no draw). Conferido em preview Playwright
// contra a arte de referência antes de entrar aqui.
// Nenhuma referência a outros módulos FG no load — só em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  // pool fixa dos "POW!" do soco (coordenadas de mundo)
  var pows = [];
  for (var ni = 0; ni < 4; ni++) pows.push({ x: 0, y: 0, life: 0, max: 1 });
  pows.i = 0;

  // o RAIO do trovão do soco: um relâmpago que cai do céu sobre o chefão no
  // instante do impacto — clarão na tela, zigue-zague, tremor de câmera e o
  // estrondo grave (mesma receita do trovão da mansão, em versão one-shot).
  var raio = { t: 0, x: 0, botY: 0, DUR: 0.3 };

  var icky = {
    // mode: 'fora' (não está em cena) | 'entra' (voando até a Otton) |
    // 'soca' (pairando: arma e desfere o soco) | 'sai' (voando embora)
    mode: 'fora',
    x: 0, y: 0,              // y = linha dos PÉS (pairando, não pisa no chão)
    facing: 1,
    t: 0,                    // relógio do estado corrente
    jaw: 0,                  // 0..1 — abertura do bocão (berro do soco)
    punch: 0,                // 0..1 — braço armado→desferido
    hoverY: 0,               // altura de pairar diante da Otton
    socou: false,            // o takeHit desta visita já disparou?
    restTimer: 0,
    REST_MAX: 30,

    // O Icky só existe na luta do Otton: é isto que o touch.js lê para o
    // botão dele aparecer — e some de novo quando ela morre.
    disponivel: function () {
      if (!FG.level || FG.level.bossId !== 'otton') return false;
      var b = FG.enemies && FG.enemies.boss;
      return !!(b && b.id === 'otton' && b.started && !b.dead);
    },

    podeComandar: function () {
      if (!this.disponivel() || this.mode !== 'fora' || this.restTimer > 0) return false;
      var b = FG.enemies.boss;
      // só depois da intro (active) — soco em chefão ainda berrando não vale
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
      this.punch = 0;
      this.socou = false;
      this.facing = 1;
      // entra voando pelo céu da beirada esquerda (o Otton mora na direita)
      this.x = a.x + 20;
      this.y = fx.groundYAt(a.x + a.w * 0.5, 300) - 320;
      FG.audio.sfx('select');
    },

    // Chamado pelo engine junto com o reset do companion: qualquer reset de
    // fase/checkpoint o tira de cena. A recarga só sobrevive se a visita
    // chegou a ser gasta (socou) — morrer no chefão não devolve o soco.
    reset: function (novoJogo) {
      for (var i = 0; i < pows.length; i++) pows[i].life = 0;
      pows.i = 0;
      raio.t = 0;
      if (novoJogo === true || (this.mode !== 'fora' && !this.socou)) {
        this.restTimer = 0;          // interrompido antes de socar: não gasta
      }
      this.mode = 'fora';
      this.jaw = 0;
      this.punch = 0;
    },

    update: function (dt) {
      if (this.restTimer > 0) this.restTimer = Math.max(0, this.restTimer - dt);

      // envelhece os POW!
      for (var i = 0; i < pows.length; i++) {
        var n = pows[i];
        if (n.life <= 0) continue;
        n.life -= dt;
        n.y -= 46 * dt;
      }

      if (raio.t > 0) raio.t -= dt;

      if (this.mode === 'fora') return;

      var b = FG.enemies && FG.enemies.boss;
      var vivo = b && b.id === 'otton' && b.started && !b.dead;
      var fx = FG.enemies.fx;
      this.t += dt;

      if (this.mode === 'entra') {
        // Otton morreu/sumiu no caminho: meia-volta sem gastar a recarga
        if (!vivo) { this.mode = 'sai'; this.t = 0; return; }
        // paira diante da cara dele, na altura do soco
        var alvoX = b.x - 115;
        var alvoY = fx.groundYAt(b.x, 300) - 130;
        this.hoverY = alvoY;
        this.facing = alvoX >= this.x ? 1 : -1;
        var dx = alvoX - this.x, dy = alvoY - this.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var vel = 560;
        if (dist < vel * dt || this.t > 2.2) {
          this.x = alvoX;
          this.y = alvoY;
          this.mode = 'soca';
          this.t = 0;
        } else {
          this.x += (dx / dist) * vel * dt;
          this.y += (dy / dist) * vel * dt;
        }

      } else if (this.mode === 'soca') {
        if (vivo) this.facing = b.x >= this.x ? 1 : -1;
        // pairando: um bob suave na altura do voo
        this.y = this.hoverY + Math.sin(this.t * 6) * 5;
        // braço: ARMA atrás (0→0.35s), DESFERE (0.35→0.45s), segura esticado
        var k = this.t;
        if (k < 0.35) { this.punch = -Math.min(1, k / 0.3); this.jaw = Math.min(1, k / 0.3); }
        else if (k < 0.45) { this.punch = -1 + (k - 0.35) / 0.1 * 2; }   // -1 → +1, rápido
        else this.punch = 1;
        // o POW!: dispara uma vez, na hora em que o punho estica
        if (!this.socou && k >= 0.43) {
          this.socou = true;
          this.restTimer = this.REST_MAX;      // gasto no ato
          FG.audio.sfx('punch');
          // TROVÃO: o raio cai do céu no ponto do impacto
          raio.t = raio.DUR;
          raio.x = vivo ? b.x : this.x + this.facing * 40;
          raio.botY = this.y - 30;
          FG.audio.sfx('bossRoar');
          if (FG.engine.shakeCamera) FG.engine.shakeCamera(13, 0.5);
          if (vivo && typeof b.takeHit === 'function') b.takeHit();
          var nh = pows[pows.i];
          pows.i = (pows.i + 1) % pows.length;
          nh.x = this.x + this.facing * 32;
          nh.y = this.y - 42;
          nh.max = 0.9;
          nh.life = 0.9;
          // respingos amarelos do impacto
          for (var p = 0; p < 10; p++) {
            fx.spawnParticle(this.x + this.facing * 28, this.y - 32,
              fx.rand(-160, 160), fx.rand(-260, -60), 0.5,
              3 + Math.random() * 4, '#f2d820', 420);
          }
        }
        if (this.t > 0.85) { this.mode = 'sai'; this.t = 0; this.facing = -1; }

      } else if (this.mode === 'sai') {
        // sai voando: sobe em diagonal de volta para o céu da esquerda
        this.jaw = Math.max(0, this.jaw - dt * 5);
        this.punch = Math.max(0, this.punch - dt * 4);
        this.x += this.facing * 480 * dt;
        this.y -= 300 * dt;
        var a = FG.level.arena;
        var teto = fx.groundYAt(a.x + a.w * 0.5, 300) - 560;
        if (this.x < a.x - 80 || this.x > a.x + a.w + 80 ||
            this.y < teto || this.t > 3) {
          this.mode = 'fora';
        }
      }
    },

    draw: function (ctx, cam) {
      // os POW! sobrevivem à saída dele de cena, então desenham sempre
      ctx.save();
      ctx.font = 'bold 24px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f6eaa0';
      ctx.strokeStyle = 'rgba(24,20,10,0.8)';
      ctx.lineWidth = 3;
      for (var i = 0; i < pows.length; i++) {
        var n = pows[i];
        if (n.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, n.life / n.max);
        ctx.strokeText('POW!', n.x - cam.x, n.y - cam.y);
        ctx.fillText('POW!', n.x - cam.x, n.y - cam.y);
      }
      ctx.restore();

      // o RAIO do trovão do soco: clarão + zigue-zague caindo sobre o chefão
      if (raio.t > 0) {
        var ka = raio.t / raio.DUR;          // 1 → 0
        ctx.save();
        // clarão branco na tela inteira, esvaindo rápido
        ctx.globalAlpha = 0.38 * ka * ka;
        ctx.fillStyle = '#eef2ff';
        ctx.fillRect(0, 0, 960, 540);
        // o zigue-zague, do topo da tela até o ponto do impacto
        var rx = raio.x - cam.x, by = raio.botY - cam.y;
        ctx.globalAlpha = Math.min(1, ka * 1.6);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        var segs = 6;
        var pts = [{ x: rx, y: -10 }];
        for (var sg = 1; sg <= segs; sg++) {
          var ff = sg / segs;
          var jag = (sg === segs) ? 0 : ((sg % 2 === 0) ? 1 : -1) * (8 + (sg * 13) % 14);
          pts.push({ x: rx + jag, y: -10 + (by + 10) * ff });
        }
        ctx.shadowColor = '#c8d8ff';
        ctx.shadowBlur = 22;
        ctx.strokeStyle = 'rgba(200,215,255,0.6)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var p1 = 1; p1 < pts.length; p1++) ctx.lineTo(pts[p1].x, pts[p1].y);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fdfeff';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var p2 = 1; p2 < pts.length; p2++) ctx.lineTo(pts[p2].x, pts[p2].y);
        ctx.stroke();
        // clarão radial no impacto
        var gg = ctx.createRadialGradient(rx, by, 0, rx, by, 70);
        gg.addColorStop(0, 'rgba(235,240,255,0.9)');
        gg.addColorStop(1, 'rgba(235,240,255,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(rx, by, 70, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      if (this.mode === 'fora') return;
      var sx = this.x - cam.x, sy = this.y - cam.y;
      if (sx < -160 || sx > 960 + 160 || sy < -220) return;

      var t = FG.engine.time;
      var voando = this.mode === 'entra' || this.mode === 'sai';
      // no voo as pernas penduram e balançam devagar (não há passo)
      var ciclo = Math.sin(t * 5) * 0.45;

      ctx.save();
      ctx.translate(sx, sy);
      // o desenho local tem ~160px de altura; o SCALE o traz para o porte
      // do jogador (30×44)
      var SCALE = 0.3;
      ctx.scale(this.facing * SCALE, SCALE);
      desenharIcky(ctx, t, {
        ciclo: ciclo,
        voando: voando,
        jaw: this.jaw,
        punch: this.punch,
        socando: this.mode === 'soca',
      });
      ctx.restore();
    },
  };

  // ------------------------------------------------------------------
  // O fantoche, em coordenadas locais com origem na linha dos pés, olhando
  // para +x. Cada membro gira no seu próprio pivô (quadril, ombro, raiz do
  // rabo, dobradiça da mandíbula) — "todos os membros movimentáveis".
  // ------------------------------------------------------------------
  // ---- cores da referência ----
  var CORPO = '#4e4450';        // o charcoal arroxeado da salamandra
  var AMARELO = '#f2d820';      // as manchas, o aro do bocão, dedos e dedões
  var TRACO = '#121014';        // contorno quase preto
  var BOCA = '#0a090c';         // interior do bocão
  var LINGUA = '#ef8090';
  var BIO = '#e83418';          // o pingente de risco biológico

  // um membro: cápsula charcoal girada em rot a partir do pivô, com os
  // DEDOS AMARELOS em bolinha na ponta (a marca da salamandra).
  // rot = 0 aponta p/ baixo; positivo = p/ trás, negativo = p/ frente.
  // tipo: 'braco' (3 dedos compridos) | 'perna' (pé com 3 dedões)
  function membro(ctx, px, py, rot, len, grossura, tipo) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = grossura + 5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    ctx.strokeStyle = CORPO;
    ctx.lineWidth = grossura;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    // mancha amarela escorrendo no meio do membro
    ctx.fillStyle = AMARELO;
    ctx.beginPath();
    ctx.ellipse(0, len * 0.45, grossura * 0.34, 9, 0.15, 0, Math.PI * 2);
    ctx.fill();
    if (tipo === 'braco') {
      // mão espalmada: 3 dedos finos terminando em bolinhas amarelas
      for (var g = -1; g <= 1; g++) {
        ctx.strokeStyle = TRACO;
        ctx.lineWidth = 6.5;
        ctx.beginPath();
        ctx.moveTo(0, len);
        ctx.lineTo(g * 7, len + 9);
        ctx.stroke();
        ctx.strokeStyle = CORPO;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, len);
        ctx.lineTo(g * 7, len + 9);
        ctx.stroke();
        ctx.fillStyle = AMARELO;
        ctx.strokeStyle = TRACO;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(g * 8, len + 12, 4.6, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    } else {
      // pezão: sola charcoal com 3 dedões amarelos na frente
      ctx.fillStyle = CORPO;
      ctx.strokeStyle = TRACO;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(3, len + 4, 11, 7.5, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = AMARELO;
      ctx.lineWidth = 2.2;
      for (var d = 0; d < 3; d++) {
        ctx.beginPath();
        ctx.arc(12 - d * 7, len + 8, 4.4, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function desenharIcky(ctx, t, o) {
    var ciclo = o.ciclo, jaw = o.jaw, punch = o.punch || 0;
    // pivôs (origem na linha dos pés): corpo baixinho, cabeçorra enorme
    var QUADRIL_Y = -34, OMBRO_Y = -64, CORPO_Y = -56, CABECA_Y = -104;
    var bob = Math.sin(t * 4) * 2;
    var lean = o.socando ? punch * 0.14 : 0;

    ctx.save();
    if (lean) {
      ctx.translate(0, QUADRIL_Y);
      ctx.rotate(lean);
      ctx.translate(0, -QUADRIL_Y);
    }

    // ----- asinhas brancas nas costas, batendo rápido (o voo dele) -----
    var flap = Math.sin(t * (o.voando ? 30 : 22));
    ctx.save();
    ctx.translate(-14, OMBRO_Y - 4);
    ctx.globalAlpha = 0.85;
    for (var aw = 0; aw < 2; aw++) {
      ctx.save();
      ctx.rotate(-0.5 - aw * 0.4 - flap * 0.45);
      ctx.fillStyle = aw === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(240,238,228,0.8)';
      ctx.strokeStyle = TRACO;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-22, -6, 24, 9, 0.15, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // ----- o rabo de salamandra: cone charcoal com listras amarelas -----
    ctx.save();
    ctx.translate(-16, QUADRIL_Y + 2);
    ctx.rotate(Math.sin(t * 6) * 0.12 + 0.08);
    ctx.fillStyle = CORPO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(4, -10);
    ctx.quadraticCurveTo(-28, -12, -44, 4);
    ctx.quadraticCurveTo(-22, 13, 4, 10);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // listras amarelas do rabo
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(2, -10);
    ctx.quadraticCurveTo(-28, -12, -44, 4);
    ctx.quadraticCurveTo(-22, 13, 2, 10);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = AMARELO;
    for (var ls = 0; ls < 2; ls++) {
      ctx.beginPath();
      ctx.ellipse(-14 - ls * 15, 0, 5, 12, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();

    // ----- membros de TRÁS -----
    var pernaTras = 0.1 + ciclo;
    var bracoTras;
    if (o.socando) bracoTras = 0.45 + punch * 0.4;
    else bracoTras = 0.45 - ciclo * 0.5;
    ctx.globalAlpha = 0.85;
    membro(ctx, -5, QUADRIL_Y, pernaTras, 24, 14, 'perna');
    membro(ctx, -12, OMBRO_Y, bracoTras, 27, 11, 'braco');
    ctx.globalAlpha = 1;

    // ----- corpo: ovo charcoal com a mancha amarela escorrendo + pingente -----
    ctx.save();
    ctx.translate(0, CORPO_Y + bob * 0.4);
    ctx.fillStyle = CORPO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 27, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // a mancha amarela do peito, escorrendo em gotas (como na arte)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 27, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = AMARELO;
    ctx.beginPath();
    ctx.moveTo(-24, -6);
    ctx.quadraticCurveTo(-12, 2, -6, -4);
    ctx.quadraticCurveTo(0, 10, 6, -2);      // gota central descendo
    ctx.quadraticCurveTo(12, 6, 18, -4);
    ctx.quadraticCurveTo(22, 0, 26, -8);
    ctx.lineTo(26, 14);
    ctx.quadraticCurveTo(10, 22, -8, 18);
    ctx.quadraticCurveTo(-20, 14, -24, 8);
    ctx.closePath();
    ctx.fill();
    // e uma manchinha charcoal dentro do amarelo (o respingo invertido)
    ctx.fillStyle = CORPO;
    ctx.beginPath();
    ctx.ellipse(4, 14, 7, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-23, -5);
    ctx.quadraticCurveTo(-12, 3, -6, -3);
    ctx.quadraticCurveTo(0, 11, 6, -1);
    ctx.quadraticCurveTo(12, 7, 18, -3);
    ctx.quadraticCurveTo(22, 1, 24, -7);
    ctx.stroke();

    // ----- o PINGENTE de risco biológico (vermelho, no pescoço) -----
    ctx.save();
    ctx.translate(5, -8);
    ctx.rotate(Math.sin(t * 5) * 0.06);
    ctx.scale(1.5, 1.5);
    ctx.strokeStyle = BIO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-1, -10); ctx.lineTo(0, -4);
    ctx.stroke();
    // trevo do biohazard: 3 argolas vermelhas sobrepostas + miolo
    ctx.fillStyle = BIO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2;
    for (var bz = 0; bz < 3; bz++) {
      var ba = -Math.PI / 2 + bz * (Math.PI * 2 / 3);
      ctx.beginPath();
      ctx.arc(Math.cos(ba) * 4.6, 4 + Math.sin(ba) * 4.6, 5.2, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#7a1408';            // os furos escuros do trevo
    for (var bz2 = 0; bz2 < 3; bz2++) {
      var ba2 = -Math.PI / 2 + bz2 * (Math.PI * 2 / 3);
      ctx.beginPath();
      ctx.arc(Math.cos(ba2) * 5.4, 4 + Math.sin(ba2) * 5.4, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = BIO;
    ctx.beginPath();
    ctx.arc(0, 4, 2.6, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();

    // ----- membros da FRENTE -----
    var pernaFrente = -0.1 - ciclo * 0.9;
    var bracoFrente;
    if (o.socando) {
      // desferido quase na horizontal, abaixo do queixo
      bracoFrente = punch <= 0 ? -0.35 - punch * 1.1
                               : -0.55 - punch * 1.15;
    } else {
      bracoFrente = -0.35 + ciclo * 0.5;
    }
    membro(ctx, 6, QUADRIL_Y, pernaFrente, 26, 15, 'perna');
    membro(ctx, 12, OMBRO_Y, bracoFrente, o.socando && punch > 0 ? 30 + punch * 8 : 30, 12, 'braco');

    // ----- a CABEÇORRA: domo charcoal e o BOCÃO de aro amarelo -----
    ctx.save();
    ctx.translate(2, CABECA_Y + bob);
    ctx.rotate(o.socando ? punch * 0.1 : Math.sin(t * 2.2) * 0.04);

    // domo do crânio
    ctx.fillStyle = CORPO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-42, 2);
    ctx.quadraticCurveTo(-46, -40, -4, -46);
    ctx.quadraticCurveTo(38, -42, 44, -4);
    ctx.quadraticCurveTo(45, 4, 36, 4);
    ctx.lineTo(-36, 4);
    ctx.quadraticCurveTo(-44, 6, -42, 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // sobrancelhas: o aro amarelo descendo bravo por cima dos olhos
    ctx.strokeStyle = AMARELO;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-36, -26);
    ctx.quadraticCurveTo(-20, -38, -4, -30);  // sobrancelha de trás
    ctx.moveTo(4, -32);
    ctx.quadraticCurveTo(22, -40, 40, -26);   // sobrancelha da frente
    ctx.stroke();

    // máscaras pretas rasgadas dos olhos com pupila branca oval
    ctx.fillStyle = BOCA;
    ctx.strokeStyle = 'rgba(150,135,160,0.55)';
    ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(-18, -22); ctx.rotate(0.26);
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(18, -22); ctx.rotate(-0.16);
    ctx.beginPath(); ctx.ellipse(0, 0, 14.5, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-13, -21, 3.6, 5, 0.2, 0, Math.PI * 2);
    ctx.ellipse(23, -21, 4, 5.4, -0.1, 0, Math.PI * 2);
    ctx.fill();
    // o vinquinho bravo entre os olhos
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-3, -28); ctx.lineTo(3, -26);
    ctx.stroke();

    // ----- o BOCÃO: interior preto com o ARO AMARELO grosso (a marca) -----
    // metade de cima fixa
    ctx.fillStyle = BOCA;
    ctx.strokeStyle = AMARELO;
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(-38, -4);
    ctx.quadraticCurveTo(0, -16, 42, -6);     // o lábio de cima sorrindo
    ctx.quadraticCurveTo(36, 10 + jaw * 5, 2, 12 + jaw * 6);
    ctx.quadraticCurveTo(-30, 10 + jaw * 4, -38, -4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // a língua rosa (desce quando o bocão abre)
    ctx.fillStyle = LINGUA;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(4, 7 + jaw * 5, 14, 5.5, 0.1, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // a MANDÍBULA de baixo: o aro amarelo do queixo, na dobradiça com jaw
    ctx.save();
    ctx.translate(-32, 2);
    ctx.rotate(0.05 + jaw * 0.5);
    ctx.fillStyle = BOCA;
    ctx.beginPath();
    ctx.ellipse(36, 7, 36, 6 + jaw * 6, 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = AMARELO;
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(2, 6);
    ctx.quadraticCurveTo(38, 18 + jaw * 5, 72, 2);
    ctx.stroke();
    ctx.restore();

    ctx.restore();   // cabeça
    ctx.restore();   // lean
  }


  FG.icky = icky;
})();
