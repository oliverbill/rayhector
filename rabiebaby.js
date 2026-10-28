// RayHector: As Aventuras do Menino-gênio — rabiebaby.js
// FG.rabie: o RABIE BABY, o morcego-vampiro branco e rosa de orelhões,
// máscaras de aro magenta, presas compridas e o pingente de gota de sangue —
// ajudante exclusivo da luta contra a ESBELTINHO OTTON na fase 5.
// Fora dessa luta ele não existe: o botão dele (touch.js) e a tecla B só
// aparecem/respondem com o Otton acordado.
//
// Mesmos moldes do dos outros ajudantes: sob comando ele entra
// VOANDO — com as PRÓPRIAS asas, ele é morcego, nada de asinhas postiças — dá
// um SOCO DE ASA no Otton (POW! — um takeHit de verdade, o mesmo dano do
// soco do jogador) e sai voando. Pode ser acionado a cada 30s (restTimer).
//
// Desenhado 100% em canvas, SEM sprite — e com TODOS os membros articulados
// de verdade: as asas giram no ombro (batida de voo, asa armando e
// desferindo o soco), as perninhas fofas balançam no quadril, o
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

  var rabie = {
    // mode: 'fora' (não está em cena) | 'entra' (voando até o Otton) |
    // 'soca' (pairando: arma e desfere o soco) | 'sai' (voando embora)
    mode: 'fora',
    x: 0, y: 0,              // y = linha dos PÉS (pairando, não pisa no chão)
    facing: 1,
    t: 0,                    // relógio do estado corrente
    jaw: 0,                  // 0..1 — abertura do bico (berro do soco)
    punch: 0,                // 0..1 — asa armada→desferida
    hoverY: 0,               // altura de pairar diante do Otton
    socou: false,            // o takeHit desta visita já disparou?
    restTimer: 0,
    REST_MAX: 30,

    // O Poe só existe na luta do Otton: é isto que o touch.js lê para o
    // botão dele aparecer — e some de novo quando ele morre.
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
      var vivo = b && b.id === 'otton' && b.started && !b.dead;
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
          // pelinhos rosa voando do impacto
          for (var p = 0; p < 10; p++) {
            fx.spawnParticle(this.x + this.facing * 28, this.y - 32,
              fx.rand(-160, 160), fx.rand(-260, -60), 0.5,
              3 + Math.random() * 4, '#f08cc0', 420);
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
      desenharRabie(ctx, t, {
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
  // para +x. Perninhas rosa fofas, corpo-pelúcia branco com o pingente de
  // gota de sangue, cabeçorra de orelhões e bocão de presas. Cada membro
  // gira no seu próprio pivô (quadril, ombro, base da orelha, dobradiça do
  // queixo) — "todos os membros movimentáveis" de verdade.
  // ------------------------------------------------------------------
  // ---- cores da referência ----
  var BRANCO = '#f6f3f0';       // pelagem branca da cabeça/peito
  var ROSA = '#f08cc0';         // orelhas, pernas, membrana das asas
  var ROSA_ESC = '#c2357e';     // aros dos olhos, bordas das asas, pés
  var TRACO = '#160a12';        // contorno quase preto
  var BOCA = '#0e0a10';         // interior do bocão (funde com as máscaras)
  var LINGUA = '#e8607a';
  var SANGUE = '#cc1818';       // a gota do pingente

  // perna rosa fofinha: cápsula com tufo e patinha rosa-escura.
  // rot = 0 aponta p/ baixo; positivo = p/ trás, negativo = p/ frente.
  function perna(ctx, px, py, rot, len) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    ctx.strokeStyle = ROSA;
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    // tufo de pelo no meio da perna
    ctx.fillStyle = ROSA;
    ctx.beginPath();
    ctx.moveTo(-7, len * 0.45);
    ctx.lineTo(-11, len * 0.6);
    ctx.lineTo(-5, len * 0.58);
    ctx.closePath();
    ctx.fill();
    // patinha rosa-escura
    ctx.fillStyle = ROSA_ESC;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(1, len + 5, 10, 7.5, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ASA DE MORCEGO: o braço dele — membrana rosa com borda magenta, dois
  // dedos-espeto no topo e barra recortada (festonada) embaixo.
  // rot gira no ombro (0 = pendurada p/ baixo).
  function asa(ctx, px, py, rot, len) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    // braço/dedo principal da asa
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    ctx.strokeStyle = ROSA_ESC;
    ctx.lineWidth = 5.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    // a membrana: leque do braço para trás, com a borda em dois arcos côncavos
    ctx.fillStyle = ROSA;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.quadraticCurveTo(-len * 0.72, len * 0.1, -len * 0.78, len * 0.62);  // dedo de trás
    ctx.quadraticCurveTo(-len * 0.5, len * 0.52, -len * 0.38, len * 0.8);   // festão 1
    ctx.quadraticCurveTo(-len * 0.2, len * 0.72, -len * 0.04, len * 0.98);  // festão 2
    ctx.lineTo(0, len);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // nervuras da membrana
    ctx.strokeStyle = 'rgba(194,53,126,0.7)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 6); ctx.quadraticCurveTo(-len * 0.3, len * 0.3, -len * 0.42, len * 0.72);
    ctx.moveTo(0, 6); ctx.quadraticCurveTo(-len * 0.14, len * 0.4, -len * 0.1, len * 0.9);
    ctx.stroke();
    // o polegarzinho na dobra
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, len * 0.06);
    ctx.lineTo(8, len * 0.14);
    ctx.stroke();
    ctx.restore();
  }

  function desenharRabie(ctx, t, o) {
    var ciclo = o.ciclo, jaw = o.jaw, punch = o.punch || 0;
    // pivôs (origem na linha dos pés): perninhas curtas, corpo-pelúcia,
    // cabeçorra ENORME de orelhões
    var QUADRIL_Y = -34, OMBRO_Y = -66, CORPO_Y = -56, CABECA_Y = -104;
    var bob = Math.sin(t * 4) * 2;
    var lean = o.socando ? punch * 0.14 : 0;
    // as asas DELE fazem o voo: batida ampla voando, curta pairando —
    // enviesada p/ fora para não varrer o pingente
    var flap = Math.sin(t * (o.voando ? 24 : 15)) * (o.voando ? 0.55 : 0.3);

    ctx.save();
    if (lean) {
      ctx.translate(0, QUADRIL_Y);
      ctx.rotate(lean);
      ctx.translate(0, -QUADRIL_Y);
    }

    // ----- asa de TRÁS (gira no ombro) -----
    var asaTras;
    if (o.socando) asaTras = 0.55 + punch * 0.35 + flap * 0.6;
    else asaTras = 1.15 - flap * 0.6;
    ctx.globalAlpha = 0.85;
    asa(ctx, -10, OMBRO_Y, asaTras, 46);
    ctx.globalAlpha = 1;

    // ----- perna de TRÁS -----
    perna(ctx, -6, QUADRIL_Y, 0.12 + ciclo, 26);

    // ----- corpo: pelúcia branca com o peito fofo e o pingente de gota -----
    ctx.save();
    ctx.translate(0, CORPO_Y + bob * 0.4);
    ctx.fillStyle = BRANCO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(0, 2, 22, 26, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // o colarinho fofo: tufos de pelo branco na gola
    ctx.fillStyle = BRANCO;
    ctx.beginPath();
    for (var tf = 0; tf < 4; tf++) {
      var tx = -14 + tf * 9;
      ctx.moveTo(tx, -18);
      ctx.lineTo(tx + 3, -28 - (tf % 2) * 3);
      ctx.lineTo(tx + 7, -18);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // ----- o PINGENTE: gota de sangue vermelha com a presilha prateada -----
    ctx.save();
    ctx.translate(2, 0);
    ctx.rotate(Math.sin(t * 5) * 0.06);
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -14); ctx.lineTo(0, -8);
    ctx.moveTo(8, -15); ctx.lineTo(0, -8);
    ctx.stroke();
    ctx.fillStyle = '#c8c8cc';                 // a presilha
    ctx.strokeStyle = TRACO;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-3, -10, 6, 5, 1.5); else ctx.rect(-3, -10, 6, 5);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = SANGUE;                    // a gota
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.quadraticCurveTo(9, 4, 7, 11);
    ctx.quadraticCurveTo(4, 19, 0, 19);
    ctx.quadraticCurveTo(-4, 19, -7, 11);
    ctx.quadraticCurveTo(-9, 4, 0, -6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';  // o brilho da gota
    ctx.beginPath();
    ctx.ellipse(-2.5, 8, 1.8, 3.4, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // ----- perna da FRENTE -----
    perna(ctx, 6, QUADRIL_Y, -0.12 - ciclo * 0.9, 28);

    // ----- asa da FRENTE: é ela que dá o SOCO -----
    var asaFrente;
    if (o.socando) {
      asaFrente = punch <= 0 ? -0.35 - punch * 1.1
                             : -0.55 - punch * 1.15;
    } else {
      asaFrente = -1.15 + flap * 0.6;
    }
    asa(ctx, 10, OMBRO_Y, asaFrente, o.socando && punch > 0 ? 52 : 46);

    // ----- a CABEÇORRA branca de orelhões -----
    ctx.save();
    ctx.translate(2, CABECA_Y + bob);
    ctx.rotate(o.socando ? punch * 0.1 : Math.sin(t * 2.2) * 0.04);

    // ORELHÕES rosa: triângulos altos de ponta arredondada, miolo rosa-escuro,
    // balançando na base
    for (var s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.translate(s * 20, -36);
      ctx.rotate(s * (0.34 + Math.sin(t * 4 + s) * 0.06));
      ctx.fillStyle = ROSA;
      ctx.strokeStyle = TRACO;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-13, 10);
      ctx.quadraticCurveTo(-14, -26, 0, -34);
      ctx.quadraticCurveTo(13, -26, 13, 10);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(194,53,126,0.55)';   // o miolo
      ctx.beginPath();
      ctx.moveTo(-6, 6);
      ctx.quadraticCurveTo(-7, -18, 1, -24);
      ctx.quadraticCurveTo(8, -18, 7, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // crânio: bola branca felpuda com tufos nas bordas
    ctx.fillStyle = BRANCO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, -12, 36, 32, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // tufos de pelo: topo e bochechas
    ctx.fillStyle = BRANCO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, -42); ctx.lineTo(-6, -50) ; ctx.lineTo(-2, -42);
    ctx.moveTo(2, -43); ctx.lineTo(8, -50); ctx.lineTo(12, -41);
    ctx.moveTo(-36, -2); ctx.lineTo(-44, 4); ctx.lineTo(-34, 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // ----- as máscaras PRETAS bravas com ARO MAGENTA -----
    for (var m = 0; m < 2; m++) {
      var mx = m === 0 ? -14 : 16, my = m === 0 ? -26 : -24;
      var mr = m === 0 ? 0.3 : -0.16;
      ctx.save();
      ctx.translate(mx, my); ctx.rotate(mr);
      ctx.fillStyle = ROSA_ESC;                  // o aro
      ctx.beginPath(); ctx.ellipse(0, 0, 15.5, 11.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = BOCA;                      // a máscara
      ctx.beginPath(); ctx.ellipse(0, 0.5, 13, 9.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // pupilas brancas ovais
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-10, -25, 3.6, 5, 0.18, 0, Math.PI * 2);
    ctx.ellipse(20, -23, 4, 5.4, -0.1, 0, Math.PI * 2);
    ctx.fill();
    // sobrancelha franzida: o V bravo
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-22, -38); ctx.lineTo(1, -30); ctx.lineTo(25, -37);
    ctx.stroke();

    // ----- o BOCÃO preto com o focinho branco por cima -----
    // fundo preto da boca aberta, crescendo com o jaw
    ctx.fillStyle = BOCA;
    ctx.beginPath();
    ctx.moveTo(-28, -8);
    ctx.quadraticCurveTo(4, -16, 36, -8);
    ctx.quadraticCurveTo(32, 10 + jaw * 6, 2, 13 + jaw * 7);
    ctx.quadraticCurveTo(-24, 10 + jaw * 5, -28, -8);
    ctx.closePath();
    ctx.fill();
    // o focinho branco: plaquinha sobre o topo da boca, com a narina
    ctx.fillStyle = BRANCO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-4, -14);
    ctx.quadraticCurveTo(22, -16, 34, -6);
    ctx.quadraticCurveTo(30, 0, 18, -2);
    ctx.quadraticCurveTo(4, -6, -4, -14);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = TRACO;                      // a narina
    ctx.beginPath();
    ctx.ellipse(26, -8, 2, 1.5, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // as duas PRESAS compridas caindo do maxilar
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2;
    for (var pr = 0; pr < 2; pr++) {
      var px1 = -12 + pr * 22;
      ctx.beginPath();
      ctx.moveTo(px1 - 4, -8 + pr * 2);
      ctx.quadraticCurveTo(px1, 14 + pr * 2, px1 + 4, -6 + pr * 2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // a língua rosa lá dentro (desce quando a boca abre)
    ctx.fillStyle = LINGUA;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(-2, 7 + jaw * 6, 12, 5, 0.1, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // o QUEIXO de baixo: aro branco articulado na dobradiça com `jaw`,
    // com as presinhas de baixo apontando para cima
    ctx.save();
    ctx.translate(-26, 2);
    ctx.rotate(0.06 + jaw * 0.4);
    ctx.fillStyle = BRANCO;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(2, 4);
    ctx.quadraticCurveTo(28, 15, 54, 5);
    ctx.quadraticCurveTo(30, 21, 4, 12);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // presinhas de baixo
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    for (var pb = 0; pb < 2; pb++) {
      var bx1 = 14 + pb * 20;
      ctx.beginPath();
      ctx.moveTo(bx1 - 3, 9);
      ctx.lineTo(bx1, 1);
      ctx.lineTo(bx1 + 3, 9);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    ctx.restore();   // cabeça
    ctx.restore();   // lean
  }

  FG.rabie = rabie;
})();
