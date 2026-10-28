// RayHector: As Aventuras do Menino-gênio — simon.js
// FG.simon: o SIMON, o dragãozinho vermelho de chifres amarelos,
// topete de cachos, colar de CIFRÃO dourado, barriga branca e um bocão de
// dentes triangulares — ajudante exclusivo da luta contra o SERGIOLA
// MUTANTE na fase 4 (Coliseu). Fora dessa luta ele não existe: o botão
// dele (touch.js) e a tecla B só aparecem/respondem com o Sergiola acordado.
//
// Mesmos moldes do Baba Chops/Allister Gator: sob comando, ele entra
// VOANDO pela arena com as asinhas de dragão, dá um SOCO no Sergiola
// (POW! — um takeHit de verdade, o mesmo dano do soco do jogador) e sai
// voando para longe. Pode ser acionado a cada 30s (restTimer).
//
// Desenhado 100% em canvas, SEM sprite — e com TODOS os membros
// articulados: braços e pernas giram no ombro/quadril, a mandíbula do
// bocão abre na dobradiça, o brinco e o cifrão balançam, a cauda
// chicoteia e as asas de morcego batem. O desenho local é grande, mas a
// ESCALA final o deixa do tamanho do jogador (ver SCALE no draw).
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

  var simon = {
    // mode: 'fora' (não está em cena) | 'entra' (voando até a Sergiola) |
    // 'soca' (pairando: arma e desfere o soco) | 'sai' (voando embora)
    mode: 'fora',
    x: 0, y: 0,              // y = linha dos PÉS (pairando, não pisa no chão)
    facing: 1,
    t: 0,                    // relógio do estado corrente
    jaw: 0,                  // 0..1 — abertura da mandíbula (berro do soco)
    punch: 0,                // 0..1 — braço armado→desferido
    hoverY: 0,               // altura de pairar diante da Sergiola
    socou: false,            // o takeHit desta visita já disparou?
    restTimer: 0,
    REST_MAX: 30,

    // O Simon só existe na luta do Sergiola: é isto que o touch.js lê
    // para o botão dele aparecer — e some de novo quando ele morre.
    disponivel: function () {
      if (!FG.level || FG.level.bossId !== 'sergiola') return false;
      var b = FG.enemies && FG.enemies.boss;
      return !!(b && b.id === 'sergiola' && b.started && !b.dead);
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
      // entra voando pelo céu da beirada esquerda (o Sergiola mora na direita)
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
      var vivo = b && b.id === 'sergiola' && b.started && !b.dead;
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
        // Sergiola morreu/sumiu no caminho: meia-volta sem gastar a recarga
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
          for (var p = 0; p < 10; p++) {
            fx.spawnParticle(this.x + this.facing * 28, this.y - 32,
              fx.rand(-160, 160), fx.rand(-260, -60), 0.5,
              3 + Math.random() * 4, '#f8d0a0', 420);
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
      ctx.fillStyle = '#ffe28a';
      ctx.strokeStyle = 'rgba(40,10,8,0.8)';
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
      // no voo as perninhas penduram e balançam devagar (não há passo)
      var ciclo = Math.sin(t * 5) * 0.45;

      ctx.save();
      ctx.translate(sx, sy);
      // o desenho local tem ~160px de altura; o SCALE o traz para o
      // DOBRO do porte do jogador (30×44) — ajudante parrudo, bem visível
      var SCALE = 0.6;
      ctx.scale(this.facing * SCALE, SCALE);
      desenharSimon(ctx, t, {
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
  // para +x. Proporções da arte de referência: cabeça enorme com topete de
  // cachos e chifres amarelos, bocão preto de dentes triangulares com o
  // queixo branco, cifrão dourado no peito, barriga branca hachurada,
  // brinco na orelha, cauda de barriga clara com espinhos e asas de
  // morcego. Cada membro gira no seu próprio pivô (quadril, ombro, raiz da
  // cauda, dobradiça da mandíbula, argola do brinco) — é isso que faz
  // "todos os membros movimentáveis" de verdade. Conferido em preview
  // contra a referência antes de entrar aqui.
  // ------------------------------------------------------------------
  // ---- cores da referência ----
  var VERMELHO = '#e23b2e';      // pele/corpo
  var VERM_ESC = '#a81f18';      // topete de cachos, patas, espinhos
  var AMARELO = '#f2e23a';       // chifres e o cifrão
  var BRANCO = '#f6f3ec';        // barriga, queixo, orelha, brinco
  var TRACO = '#1a0a08';         // contorno grosso
  var BOCA = '#0e0a0c';          // interior do bocão

  // um membro: cápsula vermelha girada em rot a partir do pivô.
  // rot = 0 aponta p/ baixo; positivo = p/ trás, negativo = p/ frente.
  // tipo: 'perna' (pezão vinho) | 'braco' (patinha-luva vinho de 3 dedos)
  function membro(ctx, px, py, rot, len, grossura, tipo) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = grossura + 5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    ctx.strokeStyle = VERMELHO;
    ctx.lineWidth = grossura;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    if (tipo === 'braco') {
      // patinha-luva vinho com 3 dedinhos rombudos
      ctx.fillStyle = VERM_ESC;
      ctx.strokeStyle = TRACO;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, len + 5, 10, 11, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      for (var g = -1; g <= 1; g++) {
        ctx.beginPath();
        ctx.ellipse(g * 5.6, len + 13, 3.4, 5, g * 0.2, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    } else {
      // pezão vinho arredondado
      ctx.fillStyle = VERM_ESC;
      ctx.strokeStyle = TRACO;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(3, len + 5, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = TRACO;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6, len + 1); ctx.lineTo(6, len + 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  function desenharSimon(ctx, t, o) {
    var ciclo = o.ciclo, jaw = o.jaw, punch = o.punch || 0;
    var QUADRIL_Y = -34, OMBRO_Y = -64, CORPO_Y = -56, CABECA_Y = -103;
    var bob = Math.sin(t * 4) * 2;
    var lean = o.socando ? punch * 0.14 : 0;

    ctx.save();
    if (lean) {
      ctx.translate(0, QUADRIL_Y);
      ctx.rotate(lean);
      ctx.translate(0, -QUADRIL_Y);
    }

    // ----- asas de DRAGÃO nas costas, batendo (o voo dele) -----
    var flap = Math.sin(t * (o.voando ? 26 : 18));
    ctx.save();
    ctx.translate(-14, OMBRO_Y - 6);
    for (var aw = 0; aw < 2; aw++) {
      ctx.save();
      ctx.rotate(-0.45 - aw * 0.38 - flap * 0.4);
      ctx.fillStyle = aw === 0 ? VERM_ESC : '#872018';
      ctx.strokeStyle = TRACO;
      ctx.lineWidth = 2.5;
      // asa de morcego: membrana de dois arcos
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-18, -16, -34, -10);
      ctx.quadraticCurveTo(-26, -2, -30, 4);
      ctx.quadraticCurveTo(-18, 2, -12, 7);
      ctx.quadraticCurveTo(-6, 4, 0, 0);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // ----- a cauda: vermelha, barriga clara listrada, espinhos vinho -----
    ctx.save();
    ctx.translate(-16, QUADRIL_Y + 2);
    ctx.rotate(Math.sin(t * 6) * 0.1 + 0.06);
    ctx.fillStyle = VERMELHO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(4, -11);
    ctx.quadraticCurveTo(-26, -13, -40, 8);
    ctx.quadraticCurveTo(-20, 15, 4, 11);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(2, -11);
    ctx.quadraticCurveTo(-26, -13, -40, 8);
    ctx.quadraticCurveTo(-20, 15, 2, 11);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = BRANCO;
    ctx.beginPath();
    ctx.moveTo(4, 14);
    ctx.quadraticCurveTo(-22, 17, -40, 10);
    ctx.quadraticCurveTo(-22, 5, 4, 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,70,60,0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (var gm = 0; gm < 3; gm++) {
      ctx.moveTo(-6 - gm * 10, 13);
      ctx.lineTo(-9 - gm * 10, 3);
    }
    ctx.stroke();
    ctx.restore();
    // espinhos vinho do dorso da cauda
    ctx.fillStyle = VERM_ESC;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2;
    for (var e = 0; e < 3; e++) {
      var ex = -9 - e * 10, ey = -10 + e * 3;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 5, ey - 6 + e);
      ctx.lineTo(ex - 9, ey + 2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // ----- membros de TRÁS -----
    var pernaTras = 0.1 + ciclo;
    var bracoTras;
    if (o.socando) bracoTras = 0.45 + punch * 0.4;
    else bracoTras = 0.45 - ciclo * 0.5;
    ctx.globalAlpha = 0.85;
    membro(ctx, -5, QUADRIL_Y, pernaTras, 24, 15, 'perna');
    membro(ctx, -12, OMBRO_Y, bracoTras, 26, 13, 'braco');
    ctx.globalAlpha = 1;

    // ----- corpo: vermelho, barriga branca hachurada + o colar de CIFRÃO -----
    ctx.save();
    ctx.translate(0, CORPO_Y + bob * 0.4);
    ctx.fillStyle = VERMELHO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 27, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // barriga branca com gomos horizontais e a hachura da referência
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(7, 5, 17, 20, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = BRANCO;
    ctx.fillRect(-12, -16, 40, 42);
    ctx.strokeStyle = 'rgba(120,70,60,0.5)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (var sgi = 0; sgi < 4; sgi++) {
      ctx.moveTo(-10, -8 + sgi * 8);
      ctx.lineTo(26, -8 + sgi * 8);
    }
    for (var hh = 0; hh < 5; hh++) {
      ctx.moveTo(-2 + hh * 6, 10);
      ctx.lineTo(-8 + hh * 6, 26);
    }
    ctx.stroke();
    ctx.restore();
    // o colar: cordão escuro + CIFRÃO amarelo balançando
    ctx.save();
    ctx.translate(4, -2);
    ctx.rotate(Math.sin(t * 5) * 0.08);
    ctx.strokeStyle = 'rgba(40,20,16,0.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, -16, 14, 0.4, Math.PI - 0.4);
    ctx.stroke();
    ctx.font = 'bold 26px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = TRACO;
    ctx.strokeText('$', 0, 2);
    ctx.fillStyle = AMARELO;
    ctx.fillText('$', 0, 2);
    ctx.restore();
    ctx.restore();

    // ----- membros da FRENTE -----
    var pernaFrente = -0.1 - ciclo * 0.9;
    var bracoFrente;
    if (o.socando) {
      bracoFrente = punch <= 0 ? -0.35 - punch * 1.1
                               : -0.55 - punch * 1.15;
    } else {
      bracoFrente = -0.35 + ciclo * 0.5;
    }
    membro(ctx, 6, QUADRIL_Y, pernaFrente, 26, 16, 'perna');
    membro(ctx, 12, OMBRO_Y, bracoFrente, o.socando && punch > 0 ? 28 + punch * 8 : 28, 14, 'braco');

    // ----- a CABEÇA: topete de cachos, chifres amarelos, brinco, bocão -----
    ctx.save();
    ctx.translate(2, CABECA_Y + bob);
    ctx.rotate(o.socando ? punch * 0.1 : Math.sin(t * 2.2) * 0.04);

    // topete: cachos vinho atrás do crânio (desenhados antes, ficam por trás)
    ctx.fillStyle = VERM_ESC;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (var ck = 0; ck < 4; ck++) {
      var ca = -2.4 + ck * 0.5;
      var cxx = -6 + Math.cos(ca) * 38, cyy = -26 + Math.sin(ca) * 26;
      ctx.moveTo(cxx + 11, cyy);
      ctx.arc(cxx, cyy, 11, 0, Math.PI * 2);
    }
    ctx.fill(); ctx.stroke();

    // crânio: feijão grande vermelho
    ctx.fillStyle = VERMELHO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-40, -6);
    ctx.quadraticCurveTo(-44, -46, -6, -50);
    ctx.quadraticCurveTo(30, -52, 40, -28);
    ctx.quadraticCurveTo(52, -16, 50, -6);
    ctx.quadraticCurveTo(48, 2, 36, 2);
    ctx.lineTo(-34, 2);
    ctx.quadraticCurveTo(-42, 2, -40, -6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // os dois chifres AMARELOS saindo por cima do topete (depois do crânio,
    // para as bases assentarem visíveis no topo)
    ctx.fillStyle = AMARELO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();                       // chifre da frente, curvando p/ cima
    ctx.moveTo(8, -46);
    ctx.quadraticCurveTo(16, -64, 30, -66);
    ctx.quadraticCurveTo(21, -54, 23, -43);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();                       // chifre de trás, menor
    ctx.moveTo(-12, -46);
    ctx.quadraticCurveTo(-18, -64, -30, -66);
    ctx.quadraticCurveTo(-22, -54, -22, -42);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // orelha branca redonda atrás + BRINCO branco pendurado (balança!)
    ctx.fillStyle = BRANCO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(-34, -26, 7.5, 9, 0.2, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.translate(-36, -17);
    ctx.rotate(Math.sin(t * 5.5 + 1) * 0.22);
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 6); ctx.stroke();
    ctx.fillStyle = BRANCO;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-2.6, 6, 5.2, 9, 2.4); else ctx.rect(-2.6, 6, 5.2, 9);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // narinas: dois pontinhos no focinho
    ctx.fillStyle = TRACO;
    ctx.beginPath();
    ctx.ellipse(40, -14, 2.2, 1.6, 0.3, 0, Math.PI * 2);
    ctx.ellipse(33, -17, 2, 1.5, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // olhos: máscaras pretas bravas com pupila branca oval
    ctx.fillStyle = '#0c0c0e';
    ctx.save();
    ctx.translate(-14, -30); ctx.rotate(0.24);
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 8.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(17, -28); ctx.rotate(-0.12);
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-10, -29, 3.4, 4.6, 0.2, 0, Math.PI * 2);
    ctx.ellipse(21, -27, 3.8, 5, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // ----- o BOCÃO: sorriso preto com dentes triangulares, contido na cabeça -----
    ctx.fillStyle = BOCA;
    ctx.beginPath();
    ctx.moveTo(-36, -2);
    ctx.quadraticCurveTo(0, -14, 46, -4);
    ctx.quadraticCurveTo(34, 10, 4, 12);
    ctx.quadraticCurveTo(-28, 10, -36, -2);
    ctx.closePath();
    ctx.fill();
    // dentes de cima: triângulos brancos pendurados do beiço (como na arte)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2;
    for (var dc = 0; dc < 4; dc++) {
      var dx1 = -28 + dc * 13;
      ctx.beginPath();
      ctx.moveTo(dx1, -5 - dc * 1.2);
      ctx.lineTo(dx1 + 5, 6 - dc * 1.2);
      ctx.lineTo(dx1 + 10, -5 - dc * 1.2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // a MANDÍBULA de baixo: dobradiça no fundo, queixo BRANCO (como na arte)
    ctx.save();
    ctx.translate(-32, 2);
    ctx.rotate(0.04 + jaw * 0.32);
    ctx.fillStyle = BOCA;
    ctx.beginPath();
    ctx.ellipse(36, 6, 36, 7 + jaw * 7, 0.06, 0, Math.PI * 2);
    ctx.fill();
    // o queixo branco largo, COLADO no lábio de baixo do bocão
    ctx.fillStyle = BRANCO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(2, 6 + jaw * 4);
    ctx.quadraticCurveTo(38, 15 + jaw * 6, 70, 2 + jaw * 3);
    ctx.quadraticCurveTo(40, 21 + jaw * 6, 4, 12 + jaw * 5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // dentinho de baixo apontando para cima
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(48, 9 + jaw * 2);
    ctx.lineTo(52, -3 + jaw * 2);
    ctx.lineTo(56, 8 + jaw * 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.restore();   // cabeça
    ctx.restore();   // lean
  }

  FG.simon = simon;
})();
