// RayHector: As Aventuras do Menino-gênio — poe.js
// FG.poe: o POE, o corvo-coruja roxo de máscaras bravas nos olhos, bicão de
// gancho, topete de penas e o pingente de nuvem com raio no peito —
// ajudante exclusivo da luta contra a PATRIÇOLA DRÁCULA na fase 3.
// Fora dessa luta ele não existe: o botão dele (touch.js) e a tecla B só
// aparecem/respondem com a Drácula acordada.
//
// Mesmos moldes do Baba Chops/Allister/DragoWuggy: sob comando ele entra
// VOANDO — com as PRÓPRIAS asas, ele é ave, nada de asinhas postiças — dá
// um SOCO DE ASA na Drácula (POW! — um takeHit de verdade, o mesmo dano do
// soco do jogador) e sai voando. Pode ser acionado a cada 30s (restTimer).
//
// Desenhado 100% em canvas, SEM sprite — e com TODOS os membros articulados
// de verdade: as asas giram no ombro (batida de voo, asa armando e
// desferindo o soco), as pernas compridas de ave balançam no quadril, o
// bico de baixo abre na dobradiça (ele berra no soco), o rabo de penas
// abana e o pingente balança. O desenho local é grande, mas a ESCALA final
// o deixa do porte do jogador (ver SCALE no draw). Desenho aprovado em
// preview fora do jogo antes de entrar aqui.
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

  // o rastro de ESTRELINHAS do voo: pool fixa de brilhos de 4 pontas que
  // nascem atrás dele enquanto voa e se apagam girando (coordenadas de mundo)
  var estrelas = [];
  for (var ei = 0; ei < 14; ei++) estrelas.push({ x: 0, y: 0, life: 0, max: 1, size: 0, rot: 0 });
  estrelas.i = 0;

  var poe = {
    // mode: 'fora' (não está em cena) | 'entra' (voando até a Drácula) |
    // 'soca' (pairando: arma e desfere o soco) | 'sai' (voando embora)
    mode: 'fora',
    x: 0, y: 0,              // y = linha dos PÉS (pairando, não pisa no chão)
    facing: 1,
    t: 0,                    // relógio do estado corrente
    jaw: 0,                  // 0..1 — abertura do bico (berro do soco)
    punch: 0,                // 0..1 — asa armada→desferida
    hoverY: 0,               // altura de pairar diante da Drácula
    socou: false,            // o takeHit desta visita já disparou?
    restTimer: 0,
    REST_MAX: 30,

    // O Poe só existe na luta da Drácula: é isto que o touch.js lê para o
    // botão dele aparecer — e some de novo quando ela morre.
    disponivel: function () {
      if (!FG.level || FG.level.bossId !== 'draculina') return false;
      var b = FG.enemies && FG.enemies.boss;
      return !!(b && b.id === 'draculina' && b.started && !b.dead);
    },

    podeComandar: function () {
      if (!this.disponivel() || this.mode !== 'fora' || this.restTimer > 0) return false;
      var b = FG.enemies.boss;
      // só depois da intro (active) — soco em chefã ainda berrando não vale
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
      // entra voando pelo céu da beirada esquerda (a Drácula mora na direita)
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
      for (var ze = 0; ze < estrelas.length; ze++) estrelas[ze].life = 0;
      estrelas.i = 0;
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

      // envelhece as estrelinhas do rastro (sobem de leve enquanto apagam)
      for (var se = 0; se < estrelas.length; se++) {
        var es2 = estrelas[se];
        if (es2.life <= 0) continue;
        es2.life -= dt;
        es2.y -= 12 * dt;
      }
      if (raio.t > 0) raio.t -= dt;

      if (this.mode === 'fora') return;

      var b = FG.enemies && FG.enemies.boss;
      var vivo = b && b.id === 'draculina' && b.started && !b.dead;
      var fx = FG.enemies.fx;
      this.t += dt;

      // semeia o rastro de estrelinhas enquanto voa
      if (this.mode === 'entra' || this.mode === 'sai') {
        if (Math.random() < dt * 28) {
          var es = estrelas[estrelas.i];
          estrelas.i = (estrelas.i + 1) % estrelas.length;
          es.x = this.x - this.facing * 18 + (Math.random() - 0.5) * 16;
          es.y = this.y - 40 + (Math.random() - 0.5) * 26;
          es.max = 0.6;
          es.life = 0.6;
          es.size = 3 + Math.random() * 3;
          es.rot = Math.random() * Math.PI;
        }
      }

      if (this.mode === 'entra') {
        // Drácula morreu/sumiu no caminho: meia-volta sem gastar a recarga
        if (!vivo) { this.mode = 'sai'; this.t = 0; return; }
        // paira diante da cara dela, na altura do soco
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
        // asa: ARMA atrás (0→0.35s), DESFERE (0.35→0.45s), segura esticada
        var k = this.t;
        if (k < 0.35) { this.punch = -Math.min(1, k / 0.3); this.jaw = Math.min(1, k / 0.3); }
        else if (k < 0.45) { this.punch = -1 + (k - 0.35) / 0.1 * 2; }   // -1 → +1, rápido
        else this.punch = 1;
        // o POW!: dispara uma vez, na hora em que a asa estica
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
          // peninhas lilás voando do impacto
          for (var p = 0; p < 10; p++) {
            fx.spawnParticle(this.x + this.facing * 28, this.y - 32,
              fx.rand(-160, 160), fx.rand(-260, -60), 0.5,
              3 + Math.random() * 4, '#8a7699', 420);
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
      ctx.fillStyle = '#e8d8ff';
      ctx.strokeStyle = 'rgba(20,12,30,0.8)';
      ctx.lineWidth = 3;
      for (var i = 0; i < pows.length; i++) {
        var n = pows[i];
        if (n.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, n.life / n.max);
        ctx.strokeText('POW!', n.x - cam.x, n.y - cam.y);
        ctx.fillText('POW!', n.x - cam.x, n.y - cam.y);
      }
      ctx.restore();

      // o rastro de estrelinhas do voo
      ctx.save();
      ctx.fillStyle = '#ffe9a0';
      for (var se2 = 0; se2 < estrelas.length; se2++) {
        var e4 = estrelas[se2];
        if (e4.life <= 0) continue;
        var esx = e4.x - cam.x, esy = e4.y - cam.y;
        if (esx < -20 || esx > 980) continue;
        var kk = e4.life / e4.max;
        ctx.globalAlpha = kk;
        ctx.save();
        ctx.translate(esx, esy);
        ctx.rotate(e4.rot + (1 - kk) * 2);
        var ss = e4.size * (0.5 + kk * 0.5);
        ctx.beginPath();
        for (var pq = 0; pq < 8; pq++) {
          var ra = (pq % 2 === 0) ? ss : ss * 0.4;
          var aa = (pq / 8) * Math.PI * 2;
          if (pq === 0) ctx.moveTo(Math.cos(aa) * ra, Math.sin(aa) * ra);
          else ctx.lineTo(Math.cos(aa) * ra, Math.sin(aa) * ra);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
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
      desenharPoe(ctx, t, {
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
  // para +x. Pernas compridas de ave, corpo-ovo com o pingente de nuvem e
  // raio, cabeçorra redonda de máscaras pretas e bicão de gancho. Cada
  // membro gira no seu próprio pivô (quadril, ombro, raiz do rabo,
  // dobradiça do bico) — "todos os membros movimentáveis" de verdade.
  // ------------------------------------------------------------------
  var PLUMA = '#4a4160';        // plumagem roxo-escura
  var PLUMA_ESC = '#3a3350';    // sombra das penas / rabo
  var BARRIGA = '#6b5a7e';      // peito/barriga roxo mais claro
  var PERNA = '#8a7699';        // pernas e pés lilás
  var BICO = '#5d5272';         // bico roxo-acinzentado
  var TRACO = '#120e1a';        // contorno quase preto
  var BOCA = '#0e0c14';         // interior do bicão (funde com a máscara)
  var LINGUA = '#e86070';
  var NUVEM = '#bdbdc2';
  var RAIO = '#f2dc2e';

  // perna de ave: fina, lilás, com pé de 3 garras p/ frente e 1 p/ trás.
  // rot = 0 aponta p/ baixo; positivo = p/ trás, negativo = p/ frente.
  function perna(ctx, px, py, rot, len) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    ctx.strokeStyle = PERNA;
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    // pé: 3 dedos-garra p/ frente, 1 p/ trás (contorno primeiro, miolo depois)
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 7.5;
    for (var d = 0; d < 3; d++) {
      ctx.beginPath();
      ctx.moveTo(0, len);
      ctx.quadraticCurveTo(7 + d * 4, len + 3, 10 + d * 5, len + 8 - d * 3);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0, len); ctx.quadraticCurveTo(-7, len + 4, -9, len + 7); ctx.stroke();
    ctx.strokeStyle = PERNA;
    ctx.lineWidth = 4.5;
    for (var d2 = 0; d2 < 3; d2++) {
      ctx.beginPath();
      ctx.moveTo(0, len);
      ctx.quadraticCurveTo(7 + d2 * 4, len + 3, 10 + d2 * 5, len + 8 - d2 * 3);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0, len); ctx.quadraticCurveTo(-7, len + 4, -9, len + 7); ctx.stroke();
    ctx.restore();
  }

  // ASA: o braço dele — leque roxo com penas longas recortadas na ponta e o
  // vinco de pena da referência. rot gira no ombro (0 = pendurada p/ baixo).
  function asa(ctx, px, py, rot, len, aberta) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.fillStyle = PLUMA;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3.5;
    var w = aberta ? 17 : 11;           // meia-largura do leque
    ctx.beginPath();
    ctx.moveTo(-7, 2);
    ctx.quadraticCurveTo(-w, len * 0.55, -w * 0.8, len * 0.92);
    // as 3 penas da ponta, recortadas
    ctx.quadraticCurveTo(-w * 0.45, len * 0.8, -w * 0.3, len + 4);
    ctx.quadraticCurveTo(0, len * 0.84, w * 0.25, len + 2);
    ctx.quadraticCurveTo(w * 0.5, len * 0.82, w * 0.75, len * 0.95);
    ctx.quadraticCurveTo(w, len * 0.5, 7, 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // o vinco de pena (a linha curva da referência)
    ctx.strokeStyle = 'rgba(18,14,26,0.45)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, len * 0.35);
    ctx.quadraticCurveTo(-w * 0.1, len * 0.55, -w * 0.5, len * 0.78);
    ctx.stroke();
    ctx.restore();
  }

  function desenharPoe(ctx, t, o) {
    var ciclo = o.ciclo, jaw = o.jaw, punch = o.punch || 0;
    // pivôs (origem na linha dos pés): pernas compridas de ave, corpo-ovo,
    // cabeçorra redonda colada no corpo
    var QUADRIL_Y = -40, OMBRO_Y = -72, CORPO_Y = -62, CABECA_Y = -112;
    var bob = Math.sin(t * 4) * 2;
    var lean = o.socando ? punch * 0.14 : 0;
    // as asas DELE fazem o voo: batida ampla voando, curta pairando —
    // enviesada para fora, para não varrerem o pingente do peito
    var flap = Math.sin(t * (o.voando ? 22 : 15)) * (o.voando ? 0.55 : 0.3);

    ctx.save();
    if (lean) {
      ctx.translate(0, QUADRIL_Y);
      ctx.rotate(lean);
      ctx.translate(0, -QUADRIL_Y);
    }

    // ----- rabo de penas: 3 penas longas caindo atrás, balançando -----
    ctx.save();
    ctx.translate(-16, QUADRIL_Y - 8);
    ctx.rotate(Math.sin(t * 5) * 0.08 + 0.5);
    ctx.fillStyle = PLUMA_ESC;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    for (var rp = 0; rp < 3; rp++) {
      ctx.save();
      ctx.rotate(-0.22 + rp * 0.22);
      ctx.beginPath();
      ctx.ellipse(0, 24, 6.5, 26, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // ----- asa de TRÁS (gira no ombro) -----
    var asaTras;
    if (o.socando) asaTras = 0.55 + punch * 0.35 + flap * 0.6;   // equilibra atrás
    else asaTras = 1.1 - flap * 0.6;                              // batendo aberta
    ctx.globalAlpha = 0.85;
    asa(ctx, -10, OMBRO_Y, asaTras, 42, o.voando || o.socando);
    ctx.globalAlpha = 1;

    // ----- perna de TRÁS -----
    perna(ctx, -5, QUADRIL_Y, 0.12 + ciclo, 32);

    // ----- corpo: ovo roxo-escuro, peito claro, pingente de nuvem+raio -----
    ctx.save();
    ctx.translate(0, CORPO_Y + bob * 0.4);
    ctx.fillStyle = PLUMA;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 23, 28, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // peito/barriga mais claro
    ctx.fillStyle = BARRIGA;
    ctx.beginPath();
    ctx.ellipse(6, 7, 15, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    // penugem do pescoço: 3 pontinhas na gola
    ctx.fillStyle = PLUMA;
    ctx.beginPath();
    for (var pg = 0; pg < 3; pg++) {
      var gx = -8 + pg * 8;
      ctx.moveTo(gx, -22);
      ctx.lineTo(gx + 4, -14);
      ctx.lineTo(gx + 8, -22);
    }
    ctx.fill();
    // ----- o PINGENTE: nuvem cinza com raio amarelo (a marca do Poe) -----
    ctx.save();
    ctx.translate(6, 3);
    ctx.rotate(Math.sin(t * 5) * 0.06);
    // cordinha amarela
    ctx.strokeStyle = RAIO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-2, -18); ctx.lineTo(0, -8);
    ctx.stroke();
    // a nuvem: três calombos
    ctx.fillStyle = NUVEM;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(-6, -2, 5.5, Math.PI * 0.4, Math.PI * 1.5);
    ctx.arc(-1, -7, 6, Math.PI * 0.9, Math.PI * 1.95);
    ctx.arc(6, -3, 5.5, Math.PI * 1.3, Math.PI * 0.55);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // o raio pendurado embaixo
    ctx.fillStyle = RAIO;
    ctx.beginPath();
    ctx.moveTo(-1, 2);
    ctx.lineTo(5, 2);
    ctx.lineTo(1, 9);
    ctx.lineTo(4, 9);
    ctx.lineTo(-3, 19);
    ctx.lineTo(-1, 11);
    ctx.lineTo(-4, 11);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();

    // ----- perna da FRENTE -----
    perna(ctx, 6, QUADRIL_Y, -0.12 - ciclo * 0.9, 34);

    // ----- asa da FRENTE: é ela que dá o SOCO -----
    var asaFrente;
    if (o.socando) {
      // -1 = armada atrás e erguida; +1 = desferida quase na horizontal,
      // abaixo do bico — não atravessa a cabeça
      asaFrente = punch <= 0 ? -0.35 - punch * 1.1
                             : -0.55 - punch * 1.15;
    } else {
      asaFrente = -1.1 + flap * 0.6;        // batendo aberta, espelhada
    }
    asa(ctx, 10, OMBRO_Y, asaFrente, o.socando && punch > 0 ? 50 : 44, true);

    // ----- a CABEÇORRA redonda -----
    ctx.save();
    ctx.translate(2, CABECA_Y + bob);
    ctx.rotate(o.socando ? punch * 0.1 : Math.sin(t * 2.2) * 0.04);

    // crânio redondo com as bochechas
    ctx.fillStyle = PLUMA;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, -14, 38, 34, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // topete: 3 penas espetadas no topo + tufo da bochecha
    ctx.fillStyle = PLUMA;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14, -44); ctx.quadraticCurveTo(-16, -60, -6, -52);
    ctx.quadraticCurveTo(-2, -62, 6, -52);
    ctx.quadraticCurveTo(14, -58, 12, -46);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-36, -22);
    ctx.quadraticCurveTo(-50, -26, -42, -12);
    ctx.quadraticCurveTo(-48, -6, -36, -8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // o vinco de pena da bochecha
    ctx.strokeStyle = 'rgba(18,14,26,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-26, -18, 7, Math.PI * 1.2, Math.PI * 1.9);
    ctx.stroke();

    // ----- as máscaras PRETAS bravas dos olhos (fundem com o bicão) -----
    ctx.fillStyle = BOCA;
    ctx.save();
    ctx.translate(-13, -28); ctx.rotate(0.22);
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(17, -26); ctx.rotate(-0.14);
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // pupilas brancas ovais
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-9, -27, 3.6, 5, 0.18, 0, Math.PI * 2);
    ctx.ellipse(21, -25, 4, 5.4, -0.1, 0, Math.PI * 2);
    ctx.fill();
    // sobrancelha franzida: o V bravo entre os olhos
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-20, -40); ctx.lineTo(0, -32); ctx.lineTo(24, -40);
    ctx.stroke();

    // ----- o BICÃO: metade de cima fixa (gancho), de baixo articulada -----
    // fundo preto da boca aberta (funde com as máscaras, como na arte);
    // cresce com o jaw
    ctx.fillStyle = BOCA;
    ctx.beginPath();
    ctx.moveTo(-26, -8);
    ctx.quadraticCurveTo(6, -18, 40, -10);
    ctx.quadraticCurveTo(34, 10 + jaw * 6, 2, 13 + jaw * 7);
    ctx.quadraticCurveTo(-22, 10 + jaw * 5, -26, -8);
    ctx.closePath();
    ctx.fill();
    // bico de CIMA: gancho roxo-acinzentado parrudo apontando p/ baixo
    ctx.fillStyle = BICO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.quadraticCurveTo(34, -22, 46, -10);
    ctx.quadraticCurveTo(52, -3, 43, 9);    // a ponta do gancho curvando p/ baixo
    ctx.quadraticCurveTo(38, 1, 26, -2);
    ctx.quadraticCurveTo(10, -6, 0, -20);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // a língua rosa lá dentro (desce quando o bico abre)
    ctx.fillStyle = LINGUA;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(-2, 7 + jaw * 6, 13, 5.5, 0.1, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // bico de BAIXO: gira na dobradiça com `jaw`
    ctx.save();
    ctx.translate(-24, 2);
    ctx.rotate(0.06 + jaw * 0.45);
    ctx.fillStyle = BICO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(2, 4);
    ctx.quadraticCurveTo(30, 16, 58, 6);
    ctx.quadraticCurveTo(32, 22, 4, 12);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.restore();   // cabeça
    ctx.restore();   // lean
  }

  FG.poe = poe;
})();
