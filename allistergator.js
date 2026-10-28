// RayHector: As Aventuras do Menino-gênio — allistergator.js
// FG.allister: o ALLISTER GATOR, o jacaré verde de macacão remendado, floco
// de neve no peito, barriga segmentada e um bocão de dentes afiados —
// ajudante exclusivo da luta contra a SANDROLA BAFO DE SAPO na fase 2.
// Fora dessa luta ele não existe: o botão dele (touch.js) e a tecla B só
// aparecem/respondem com a Sandrola acordada.
//
// Mesmos moldes do Baba Chops (babachops.js): sob comando, ele entra VOANDO
// pelo céu da arena com asinhas brancas, dá um SOCO na Sandrola (POW! — um
// takeHit de verdade, o mesmo dano do soco do jogador) e sai voando para
// longe. Pode ser acionado a cada 30s (restTimer).
//
// Desenhado 100% em canvas, SEM sprite — e com TODOS os membros articulados
// de verdade: braços e pernas giram no ombro/quadril (perninhas balançando
// no voo, braço armando e desferindo o soco), a MANDÍBULA do focinho abre
// e fecha na dobradiça (ele berra no soco), o calombo dos olhos franze, o
// caudão de jacaré chicoteia e as asinhas batem. O desenho local é grande,
// mas a ESCALA final o deixa do tamanho do jogador (ver SCALE no draw).
// Nenhuma referência a outros módulos FG no load — só em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  // pool fixa dos "POW!" do soco (coordenadas de mundo)
  var pows = [];
  for (var ni = 0; ni < 4; ni++) pows.push({ x: 0, y: 0, life: 0, max: 1 });
  pows.i = 0;

  var gator = {
    // mode: 'fora' (não está em cena) | 'entra' (voando até a Sandrola) |
    // 'soca' (pairando: arma e desfere o soco) | 'sai' (voando embora)
    mode: 'fora',
    x: 0, y: 0,              // y = linha dos PÉS (pairando, não pisa no chão)
    facing: 1,
    t: 0,                    // relógio do estado corrente
    jaw: 0,                  // 0..1 — abertura da mandíbula (berro do soco)
    punch: 0,                // 0..1 — braço armado→desferido
    hoverY: 0,               // altura de pairar diante da Sandrola
    socou: false,            // o takeHit desta visita já disparou?
    restTimer: 0,
    REST_MAX: 30,

    // O Allister só existe na luta da Sandrola: é isto que o touch.js lê
    // para o botão dele aparecer — e some de novo quando ela morre.
    disponivel: function () {
      if (!FG.level || FG.level.bossId !== 'sandrola') return false;
      var b = FG.enemies && FG.enemies.boss;
      return !!(b && b.id === 'sandrola' && b.started && !b.dead);
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
      // entra voando pelo céu da beirada esquerda (a Sandrola mora na direita)
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

      if (this.mode === 'fora') return;

      var b = FG.enemies && FG.enemies.boss;
      var vivo = b && b.id === 'sandrola' && b.started && !b.dead;
      var fx = FG.enemies.fx;
      this.t += dt;

      if (this.mode === 'entra') {
        // Sandrola morreu/sumiu no caminho: meia-volta sem gastar a recarga
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
              3 + Math.random() * 4, '#bfe88a', 420);
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
      ctx.fillStyle = '#d0ffa0';
      ctx.strokeStyle = 'rgba(10,30,8,0.8)';
      ctx.lineWidth = 3;
      for (var i = 0; i < pows.length; i++) {
        var n = pows[i];
        if (n.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, n.life / n.max);
        ctx.strokeText('POW!', n.x - cam.x, n.y - cam.y);
        ctx.fillText('POW!', n.x - cam.x, n.y - cam.y);
      }
      ctx.restore();

      if (this.mode === 'fora') return;
      var sx = this.x - cam.x, sy = this.y - cam.y;
      if (sx < -160 || sx > 960 + 160 || sy < -220) return;

      var t = FG.engine.time;
      var voando = this.mode === 'entra' || this.mode === 'sai';
      // no voo as perninhas penduram e balançam devagar (não há passo)
      var ciclo = Math.sin(t * 5) * 0.45;

      ctx.save();
      ctx.translate(sx, sy);
      // o desenho local tem ~160px de altura; o SCALE o traz para o porte
      // do jogador (30×44)
      var SCALE = 0.3;
      ctx.scale(this.facing * SCALE, SCALE);
      desenharGator(ctx, t, {
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
  // para +x. Cada membro é desenhado girado no seu próprio pivô (quadril,
  // ombro, raiz do caudão, dobradiça da mandíbula) — é isso que faz "todos
  // os membros movimentáveis" de verdade.
  // ------------------------------------------------------------------
  var VERDE = '#52b23c';        // o macacão/pele verde
  var VERDE_ESC = '#2f7a22';    // remendos, escamas do caudão, sombras
  var BARRIGA = '#cde8a6';      // painel claro da barriga
  var TRACO = '#14320e';        // contorno verde-escuro
  var BOCA = '#5a1020';         // interior do bocão
  var LINGUA = '#e86a8a';

  // um membro: cápsula verde girada em `rot` a partir do pivô, com a patona
  // na ponta — braços e pernas usam o mesmo desenho.
  // rot = 0 aponta para baixo; positivo = p/ trás, negativo = p/ frente.
  function membro(ctx, px, py, rot, len, grossura, pataR) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.strokeStyle = VERDE;
    ctx.lineWidth = grossura;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, len);
    ctx.stroke();
    // remendo costurado no meio do membro
    ctx.fillStyle = VERDE_ESC;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-grossura * 0.36, len * 0.38, grossura * 0.72, 10, 3);
    else ctx.rect(-grossura * 0.36, len * 0.38, grossura * 0.72, 10);
    ctx.fill();
    // a patona na ponta
    ctx.fillStyle = VERDE;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, len + pataR * 0.3, pataR, pataR * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // garrinhas brancas
    ctx.fillStyle = '#ffffff';
    for (var g = -1; g <= 1; g++) {
      ctx.beginPath();
      ctx.moveTo(g * pataR * 0.45 - 2, len + pataR * 1.1);
      ctx.lineTo(g * pataR * 0.45, len + pataR * 1.55);
      ctx.lineTo(g * pataR * 0.45 + 2, len + pataR * 1.1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function desenharGator(ctx, t, o) {
    var ciclo = o.ciclo, jaw = o.jaw, punch = o.punch || 0;
    // pivôs (origem na linha dos pés): quadril, ombro, corpo, cabeça
    var QUADRIL_Y = -46, OMBRO_Y = -74, CORPO_Y = -60, CABECA_Y = -116;
    var bob = Math.sin(t * 4) * 2;
    // no soco o tronco inclina junto com o braço (arma atrás, projeta à frente)
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
    ctx.translate(-16, OMBRO_Y - 6);
    ctx.globalAlpha = 0.85;
    for (var aw = 0; aw < 2; aw++) {
      ctx.save();
      ctx.rotate(-0.5 - aw * 0.4 - flap * 0.45);
      ctx.fillStyle = aw === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(235,242,232,0.8)';
      ctx.strokeStyle = TRACO;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-22, -6, 24, 9, 0.15, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // ----- o caudão de jacaré: chicoteia na raiz, escamas em cima -----
    ctx.save();
    ctx.translate(-22, QUADRIL_Y - 4);
    ctx.rotate(Math.sin(t * 6) * 0.14 + 0.1);
    ctx.fillStyle = VERDE;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();                       // cone deitado afinando p/ trás
    ctx.moveTo(2, -12);
    ctx.quadraticCurveTo(-34, -16, -52, 2);
    ctx.quadraticCurveTo(-34, 14, 2, 12);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = VERDE_ESC;             // escamas (scutes) no dorso
    for (var e = 0; e < 3; e++) {
      var ex = -8 - e * 14;
      ctx.beginPath();
      ctx.moveTo(ex, -10 + e * 2);
      ctx.lineTo(ex - 5, -17 + e * 2.4);
      ctx.lineTo(ex - 10, -9 + e * 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // ----- membros de TRÁS (lado longe da câmera) -----
    // perna: pendura do quadril balançando no voo; braço no contratempo
    var pernaTras = 0.1 + ciclo;
    var bracoTras;
    if (o.socando) bracoTras = 0.25 + punch * 0.5;          // equilibra o golpe (vai p/ trás)
    else bracoTras = 0.25 - ciclo * 0.6;
    ctx.globalAlpha = 0.88;
    membro(ctx, -6, QUADRIL_Y, pernaTras, 36, 15, 8.5);
    membro(ctx, -8, OMBRO_Y, bracoTras, 32, 13, 8);
    ctx.globalAlpha = 1;

    // ----- corpo: o macacão verde com a barriga clara segmentada -----
    ctx.save();
    ctx.translate(0, CORPO_Y + bob * 0.4);
    ctx.fillStyle = VERDE;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 32, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // barriga: painel claro com as linhas de segmento
    ctx.fillStyle = BARRIGA;
    ctx.beginPath();
    ctx.ellipse(6, 8, 16, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,120,40,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var sgi = -1; sgi <= 1; sgi++) {
      ctx.moveTo(-6, 8 + sgi * 9);
      ctx.quadraticCurveTo(6, 11 + sgi * 9, 18, 8 + sgi * 9);
    }
    ctx.stroke();
    // remendo escuro no quadril
    ctx.fillStyle = VERDE_ESC;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-22, 10, 13, 9, 3); else ctx.rect(-22, 10, 13, 9);
    ctx.fill();
    // ----- o floco de neve branco no peito -----
    ctx.save();
    ctx.translate(2, -16);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var fl = 0; fl < 6; fl++) {
      var fa = (fl / 6) * Math.PI * 2;
      var cx2 = Math.cos(fa), sy2 = Math.sin(fa);
      ctx.moveTo(0, 0);
      ctx.lineTo(cx2 * 9, sy2 * 9);
      // os galhinhos do floco
      ctx.moveTo(cx2 * 5.5 - sy2 * 2.6, sy2 * 5.5 + cx2 * 2.6);
      ctx.lineTo(cx2 * 7.5, sy2 * 7.5);
      ctx.lineTo(cx2 * 5.5 + sy2 * 2.6, sy2 * 5.5 - cx2 * 2.6);
    }
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // ----- membros da FRENTE -----
    var pernaFrente = -0.1 - ciclo * 0.9;
    var bracoFrente;
    if (o.socando) {
      // o braço do soco (rot 0 = p/ baixo; positivo = p/ trás, negativo =
      // p/ frente): punch -1 = armado atrás e erguido; +1 = desferido na
      // diagonal de cima, direto na cara da Sandrola
      bracoFrente = punch <= 0 ? 0.32 - punch * 0.9    // armando: gira p/ trás
                               : -0.6 - punch * 1.75;  // desferido à frente
    } else {
      bracoFrente = 0.32 + ciclo * 0.6;
    }
    membro(ctx, 7, QUADRIL_Y, pernaFrente, 38, 16, 9);
    membro(ctx, 9, OMBRO_Y, bracoFrente, o.socando && punch > 0 ? 34 + punch * 10 : 34, 14, 8.5);

    // ----- a cabeça de jacaré: crânio + focinho comprido, mandíbula -----
    ctx.save();
    ctx.translate(0, CABECA_Y + bob);
    ctx.rotate(o.socando ? punch * 0.1 : Math.sin(t * 2.2) * 0.04);

    // crânio verde
    ctx.fillStyle = VERDE;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(-2, -12, 24, 20, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // o focinho de CIMA, comprido para a frente, com narina na ponta
    ctx.fillStyle = VERDE;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(4, -14, 44, 18, 7); else ctx.rect(4, -14, 44, 18);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = VERDE_ESC;             // narina
    ctx.beginPath();
    ctx.ellipse(42, -10, 2.6, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // dentes de cima: triângulos brancos pendurados da beirada do focinho
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 1.6;
    for (var dc = 0; dc < 4; dc++) {
      var dx1 = 10 + dc * 10;
      ctx.beginPath();
      ctx.moveTo(dx1, 3);
      ctx.lineTo(dx1 + 4, 13 + jaw * 2);
      ctx.lineTo(dx1 + 8, 3);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // calombos dos olhos no topo, franzidos de raiva
    for (var ol = 0; ol < 2; ol++) {
      var ox = -10 + ol * 20;
      ctx.fillStyle = VERDE;
      ctx.strokeStyle = TRACO;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(ox, -28, 10, 9, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // olho preto com o quadradinho branco descentrado (estilo da referência)
      ctx.fillStyle = '#0c0c0e';
      ctx.beginPath();
      ctx.ellipse(ox + 2, -27, 6, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 3, -29, 3, 3);
      // sobrancelha brava
      ctx.strokeStyle = TRACO;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(ox - 7, -35);
      ctx.lineTo(ox + 8, -30);
      ctx.stroke();
    }

    // a MANDÍBULA de baixo: gira na dobradiça (atrás do focinho) com `jaw`
    ctx.save();
    ctx.translate(-4, 2);                  // a dobradiça
    ctx.rotate(0.1 + jaw * 0.8);
    // interior do bocão + língua
    ctx.fillStyle = BOCA;
    ctx.beginPath();
    ctx.ellipse(24, 4, 26, 9 + jaw * 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = LINGUA;
    ctx.beginPath();
    ctx.ellipse(22, 7 + jaw * 5, 13, 5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // o queixo verde (a borda da mandíbula)
    ctx.fillStyle = VERDE;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(24, 10 + jaw * 7, 27, 6, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // dentes de baixo: triângulos apontando para cima, saindo do queixo
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 1.6;
    for (var db = 0; db < 3; db++) {
      var dx2 = 12 + db * 12;
      ctx.beginPath();
      ctx.moveTo(dx2, 9 + jaw * 6);
      ctx.lineTo(dx2 + 4, -1 + jaw * 3);
      ctx.lineTo(dx2 + 8, 9 + jaw * 6);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    ctx.restore();   // cabeça
    ctx.restore();   // lean do tronco
  }

  FG.allister = gator;
})();
