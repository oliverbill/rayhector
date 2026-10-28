// RayHector: As Aventuras do Menino-gênio — babachops.js
// FG.babachops: o BABA CHOPS, a ovelha negra de lã encaracolada, colar de
// caveira e um BOCÃO de dentuço — ajudante exclusivo da luta contra o
// ANÃOZINHO HUGO na fase 1. Fora dessa luta ele não existe: o botão dele
// (touch.js) e a tecla B só aparecem/respondem com o Hugo acordado.
//
// Sob comando, ele entra correndo pela beirada da arena, dá um SOCO no Hugo
// (POW! — um takeHit de verdade, o mesmo dano do soco do jogador) e SOME
// numa nuvenzinha de lã. Pode ser acionado a cada 30s (restTimer).
//
// Desenhado 100% em canvas, SEM sprite, como os chefões — e com TODOS os
// membros articulados de verdade: braços e pernas giram no ombro/quadril
// (ciclo de corrida, braço armando e desferindo o soco), a mandíbula abre
// e fecha (ele berra no soco), as orelhas balançam, o rabinho sacode e a
// cabeça quica no passo.
// Nenhuma referência a outros módulos FG no load — só em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  // pool fixa dos "POW!" do soco (coordenadas de mundo)
  var pows = [];
  for (var ni = 0; ni < 4; ni++) pows.push({ x: 0, y: 0, life: 0, max: 1 });
  pows.i = 0;

  var baba = {
    // mode: 'fora' (não está em cena) | 'entra' (correndo até o Hugo) |
    // 'soca' (arma e desfere o soco) | 'some' (sumindo na nuvem de lã)
    mode: 'fora',
    x: 0, y: 0,              // y = linha do CHÃO sob os pés
    facing: 1,
    t: 0,                    // relógio do estado corrente
    jaw: 0,                  // 0..1 — abertura da mandíbula (berro do soco)
    punch: 0,                // 0..1 — braço armado→desferido
    fade: 1,                 // escala/alpha do sumiço
    socou: false,            // o takeHit desta visita já disparou?
    restTimer: 0,
    REST_MAX: 30,

    // O Baba Chops só existe na luta do Hugo: é isto que o touch.js lê para
    // o botão dele aparecer — e some de novo quando o Hugo morre.
    disponivel: function () {
      if (!FG.level || FG.level.bossId !== 'hugo') return false;
      var b = FG.enemies && FG.enemies.boss;
      return !!(b && b.id === 'hugo' && b.started && !b.dead);
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
      this.fade = 1;
      this.socou = false;
      this.facing = 1;
      // entra pela beirada esquerda da arena (o Hugo mora na direita)
      this.x = a.x + 30;
      this.y = fx.groundYAt(this.x, 300);
      FG.audio.sfx('select');
    },

    // Chamado pelo engine junto com o reset do companion: qualquer reset de
    // fase/checkpoint tira o Baba de cena. A recarga só sobrevive se a visita
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
      this.fade = 1;
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
      var vivo = b && b.id === 'hugo' && b.started && !b.dead;
      var fx = FG.enemies.fx;
      this.t += dt;

      if (this.mode === 'entra') {
        // Hugo morreu/sumiu no caminho: some sem gastar a recarga
        if (!vivo) { this.mode = 'some'; this.t = 0; return; }
        var alvoX = b.x - 150;       // para diante do Hugo, fora do corpo dele
        this.facing = alvoX >= this.x ? 1 : -1;
        var vel = 560;
        if (Math.abs(alvoX - this.x) < vel * dt || this.t > 2.2) {
          this.x = alvoX;
          this.mode = 'soca';
          this.t = 0;
        } else {
          this.x += this.facing * vel * dt;
        }
        this.y = fx.groundYAt(this.x, 300);

      } else if (this.mode === 'soca') {
        if (vivo) this.facing = b.x >= this.x ? 1 : -1;
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
          nh.x = this.x + this.facing * 80;
          nh.y = this.y - 110;
          nh.max = 0.9;
          nh.life = 0.9;
          for (var p = 0; p < 10; p++) {
            fx.spawnParticle(this.x + this.facing * 70, this.y - 80,
              fx.rand(-160, 160), fx.rand(-260, -60), 0.5,
              3 + Math.random() * 4, '#f4f0e6', 420);
          }
        }
        if (this.t > 0.85) { this.mode = 'some'; this.t = 0; }

      } else if (this.mode === 'some') {
        // encolhe e esvai numa nuvenzinha de lã — "deu o soco e sumiu"
        this.fade = Math.max(0, 1 - this.t / 0.45);
        this.jaw = Math.max(0, this.jaw - dt * 5);
        this.punch = Math.max(0, this.punch - dt * 4);
        if (Math.random() < 0.5) {
          fx.spawnParticle(this.x + fx.rand(-26, 26), this.y - fx.rand(20, 110),
            fx.rand(-60, 60), fx.rand(-120, -30), 0.5,
            4 + Math.random() * 5, 'rgba(60,58,66,0.9)', 60);
        }
        if (this.t > 0.45) this.mode = 'fora';
      }
    },

    draw: function (ctx, cam) {
      // os POW! sobrevivem à saída dele de cena, então desenham sempre
      ctx.save();
      ctx.font = 'bold 24px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe9a0';
      ctx.strokeStyle = 'rgba(30,20,10,0.8)';
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
      if (sx < -160 || sx > 960 + 160) return;

      var t = FG.engine.time;
      var correndo = this.mode === 'entra';
      // fase do ciclo de corrida: pernas alternadas, braços no contratempo
      var ciclo = correndo ? Math.sin(t * 13) : 0;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(this.facing, 1);
      if (this.fade < 1) {
        ctx.globalAlpha = this.fade;
        ctx.translate(0, -60 * (1 - this.fade));
        ctx.scale(this.fade, this.fade);
        ctx.translate(0, 60 * (1 - this.fade));
      }
      desenharBaba(ctx, t, {
        ciclo: ciclo,
        correndo: correndo,
        jaw: this.jaw,
        punch: this.punch,
        socando: this.mode === 'soca',
      });
      ctx.restore();
    },
  };

  // ------------------------------------------------------------------
  // O fantoche, em coordenadas locais com origem no CHÃO, entre os pés,
  // olhando para +x. Cada membro é desenhado girado no seu próprio pivô
  // (quadril, ombro, base da orelha, raiz do rabo, dobradiça da mandíbula)
  // — é isso que faz "todos os membros movimentáveis" de verdade.
  // ------------------------------------------------------------------
  var LA = '#17161a';          // lã preta
  var LA_CLARA = '#2b2a30';    // cachos iluminados
  var PELE = '#f3efe6';        // focinho/mãos/pés cor de creme
  var TRACO = '#0a0a0c';       // contorno

  // um membro: cápsula escura girada em `rot` a partir do pivô, com a
  // ponta (mão/pata) clara — braços e pernas usam o mesmo desenho.
  // rot = 0 aponta para BAIXO; positivo gira para a frente (+x).
  function membro(ctx, px, py, rot, len, grossura, pataR) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.strokeStyle = LA;
    ctx.lineWidth = grossura;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, len);
    ctx.stroke();
    // a pata/mão branca na ponta
    ctx.fillStyle = PELE;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, len + pataR * 0.3, pataR, pataR * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // nuvem de lã: anel de bolotas em volta de um centro
  function fofura(ctx, cx, cy, r, bolotas, seed) {
    ctx.beginPath();
    for (var i = 0; i < bolotas; i++) {
      var ang = (i / bolotas) * Math.PI * 2 + seed;
      var br = r * (0.42 + 0.1 * Math.sin(seed * 3 + i * 2.7));
      ctx.moveTo(cx + Math.cos(ang) * r + br, cy + Math.sin(ang) * r);
      ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, br, 0, Math.PI * 2);
    }
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function desenharBaba(ctx, t, o) {
    var ciclo = o.ciclo, jaw = o.jaw, punch = o.punch || 0;
    // pivôs (origem no chão): quadril, ombro, centro do corpo, da cabeça
    var QUADRIL_Y = -46, OMBRO_Y = -72, CORPO_Y = -62, CABECA_Y = -118;
    var bob = o.correndo ? Math.sin(t * 26) * 2.5 : Math.sin(t * 3) * 1.5;
    // no soco o tronco inclina junto com o braço (arma atrás, projeta à frente)
    var lean = o.socando ? punch * 0.14 : 0;

    ctx.save();
    if (lean) {
      ctx.translate(0, QUADRIL_Y);
      ctx.rotate(lean);
      ctx.translate(0, -QUADRIL_Y);
    }

    // ----- rabinho: bolota de lã sacudindo na raiz -----
    ctx.save();
    ctx.translate(-30, -58);
    ctx.rotate(Math.sin(t * 9) * 0.35 - 0.2);
    ctx.fillStyle = LA;
    fofura(ctx, -8, 0, 7, 5, 1.7);
    ctx.restore();

    // ----- membros de TRÁS (lado longe da câmera) -----
    // perna: gira no quadril; braço: gira no ombro, em contratempo
    var pernaTras = o.correndo ? ciclo * 0.8 : 0.06;
    var bracoTras;
    if (o.socando) bracoTras = 0.25 + punch * 0.5;          // equilibra o golpe (vai p/ trás)
    else bracoTras = o.correndo ? -ciclo * 0.9 + 0.3 : 0.25;
    ctx.globalAlpha = 0.88;
    membro(ctx, -6, QUADRIL_Y, pernaTras, 36, 15, 8.5);
    membro(ctx, -8, OMBRO_Y, bracoTras, 32, 13, 8);
    ctx.globalAlpha = 1;

    // ----- corpo: oval de lã preta -----
    ctx.fillStyle = LA;
    ctx.save();
    ctx.translate(0, CORPO_Y + bob * 0.4);
    fofura(ctx, 0, 0, 24, 9, 0.4);
    // cachos iluminados
    ctx.fillStyle = LA_CLARA;
    ctx.beginPath();
    ctx.arc(8, -12, 7, 0, Math.PI * 2);
    ctx.arc(-6, -16, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ----- colar de caveira no peito -----
    ctx.save();
    ctx.translate(10, CORPO_Y - 4 + bob * 0.4);
    ctx.rotate(Math.sin(t * 5) * 0.08);
    ctx.strokeStyle = 'rgba(240,238,230,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -14, 12, 0.5, Math.PI - 0.5);
    ctx.stroke();
    ctx.fillStyle = PELE;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2;
    ctx.beginPath();                        // crânio
    ctx.ellipse(0, 0, 7.5, 7, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();                        // queixo da caveira
    ctx.rect(-4, 5, 8, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = TRACO;
    ctx.beginPath();                        // órbitas + nariz
    ctx.arc(-3, -1, 2.2, 0, Math.PI * 2);
    ctx.arc(3, -1, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 2.4); ctx.lineTo(-1.4, 4.6); ctx.lineTo(1.4, 4.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ----- membros da FRENTE -----
    var pernaFrente = o.correndo ? -ciclo * 0.8 : -0.06;
    var bracoFrente;
    if (o.socando) {
      // o braço do soco (rot 0 = p/ baixo; positivo = p/ trás, negativo =
      // p/ frente): punch -1 = armado atrás e erguido; +1 = desferido na
      // diagonal de cima, direto na cara do Hugo
      bracoFrente = punch <= 0 ? 0.32 - punch * 0.9    // armando: gira p/ trás
                               : -0.6 - punch * 1.75;  // desferido à frente
    } else {
      bracoFrente = o.correndo ? ciclo * 0.9 + 0.3 : 0.32;
    }
    membro(ctx, 7, QUADRIL_Y, pernaFrente, 38, 16, 9);
    membro(ctx, 9, OMBRO_Y, bracoFrente, o.socando && punch > 0 ? 34 + punch * 10 : 34, 14, 8.5);

    // ----- cabeça: nuvem de lã ENORME, quicando no passo -----
    ctx.save();
    ctx.translate(4, CABECA_Y + bob);
    ctx.rotate(o.socando ? punch * 0.1 : Math.sin(t * 2.2) * 0.04);

    // orelhas cor de creme, uma de cada lado, balançando na base
    for (var s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.translate(s * 34, -10);
      ctx.rotate(s * (0.5 + Math.sin(t * 4 + s) * 0.14));
      ctx.fillStyle = PELE;
      ctx.strokeStyle = TRACO;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(s * 8, 0, 13, 7.5, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // a juba de cachos pretos
    ctx.fillStyle = LA;
    fofura(ctx, 0, -6, 32, 11, 2.1);
    ctx.fillStyle = LA_CLARA;
    ctx.beginPath();
    ctx.arc(-12, -26, 8, 0, Math.PI * 2);
    ctx.arc(8, -32, 6.5, 0, Math.PI * 2);
    ctx.arc(22, -18, 6, 0, Math.PI * 2);
    ctx.fill();

    // ----- o rosto: focinho branco com o BOCÃO articulado -----
    // maxilar de cima (fixo na cabeça): placa branca com os olhos
    ctx.fillStyle = PELE;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(10, 2, 26, 15, 0, Math.PI, 0);   // meia-elipse de cima
    ctx.lineTo(36, 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // olhos: meia-pálpebra marota por baixo da juba
    ctx.fillStyle = TRACO;
    ctx.beginPath();
    ctx.ellipse(2, -5, 7.5, 6.5, 0, 0, Math.PI * 2);
    ctx.ellipse(21, -6, 7, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4, -7, 2, 0, Math.PI * 2);
    ctx.arc(23, -8, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // a mandíbula de BAIXO: gira na dobradiça (atrás do focinho) com `jaw`
    ctx.save();
    ctx.translate(-12, 4);                       // a dobradiça
    ctx.rotate(0.12 + jaw * 0.85);
    // interior da boca + língua
    ctx.fillStyle = '#121014';
    ctx.beginPath();
    ctx.ellipse(22, 4, 24, 10 + jaw * 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8506a';
    ctx.beginPath();
    ctx.ellipse(20, 7 + jaw * 5, 13, 5.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // o queixo branco (a borda da mandíbula)
    ctx.fillStyle = PELE;
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(22, 11 + jaw * 7, 25, 6, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // os dois dentões pendurados no maxilar de cima, por cima da boca aberta
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = TRACO;
    ctx.lineWidth = 2.5;
    for (var d = 0; d < 2; d++) {
      ctx.beginPath();
      var dx = 8 + d * 11;
      if (ctx.roundRect) ctx.roundRect(dx, 2, 9, 11 + jaw * 2, 3);
      else ctx.rect(dx, 2, 9, 11 + jaw * 2);
      ctx.fill(); ctx.stroke();
    }

    ctx.restore();   // cabeça
    ctx.restore();   // lean do tronco
  }

  FG.babachops = baba;
})();
