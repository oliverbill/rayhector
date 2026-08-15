// Fagulho: Lendas do Bosque — player.js: o Fagulho (física, combate e pintura em canvas).
window.FG = window.FG || {};

(function () {
  // ---------- constantes de movimento ----------
  const ACCEL = 2400;        // aceleração horizontal (px/s²)
  const FRICTION = 2000;     // atrito quando não há input (px/s²)
  const MAX_VX = 340;        // velocidade horizontal máxima
  const GRAVITY = 2200;      // gravidade (px/s²)
  const JUMP_VY = -720;      // impulso do pulo
  const COYOTE = 0.1;        // tempo de coyote após sair da borda
  const BUFFER = 0.12;       // buffer de input do pulo
  const GLIDE_FALL = 90;     // queda máxima planando (px/s)
  const MAX_FALL = 1100;     // queda terminal normal
  const ATTACK_TIME = 0.22;  // duração da hitbox do soco
  const ATTACK_CD = 0.35;    // cooldown entre socos
  const KNOCKBACK = 260;     // empurrão horizontal ao levar dano

  // ---------- pool de faíscas (sem alocação por frame) ----------
  const SPARKS = 28;
  const sparks = [];
  for (let i = 0; i < SPARKS; i++) sparks.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 2 });
  let sparkCursor = 0;

  function emitSpark(x, y, vx, vy, life, r) {
    const s = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % SPARKS;
    s.x = x; s.y = y; s.vx = vx; s.vy = vy;
    s.life = life; s.max = life; s.r = r;
  }

  // ---------- estado interno (não faz parte do contrato) ----------
  let coyoteTimer = 0;       // tempo desde que deixou o chão
  let jumpBuffer = 0;        // tempo restante do input buffer
  let jumpsUsed = 0;         // 0 no chão, 1 após 1º pulo, 2 após duplo
  let jumpCut = false;       // já cortou o pulo ao soltar o botão?
  let gliding = false;       // planando neste frame?
  let attackTimer = 0;       // tempo restante da hitbox ativa
  let attackCooldown = 0;    // tempo até poder socar de novo
  let sparkAccum = 0;        // acumulador de emissão de faíscas
  // mãos-brasas: posição com atraso (seguem o corpo suavemente)
  const handL = { x: 0, y: 0 };
  const handR = { x: 0, y: 0 };

  const player = {
    // ---------- campos do contrato ----------
    x: 0, y: 0, w: 30, h: 44,
    vx: 0, vy: 0,
    hp: 6, maxHp: 6,
    facing: 1,
    onGround: false,
    attackBox: { x: 0, y: 0, w: 34, h: 30, active: false },
    invuln: 0,

    // ---------- lógica ----------
    update(dt) {
      const input = FG.input;

      // corrida: aceleração com input, atrito sem
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (dir !== 0) {
        this.vx += dir * ACCEL * dt;
        this.facing = dir;
      } else if (this.vx !== 0) {
        const drop = FRICTION * dt;
        if (Math.abs(this.vx) <= drop) this.vx = 0;
        else this.vx -= Math.sign(this.vx) * drop;
      }
      if (this.vx > MAX_VX) this.vx = MAX_VX;
      if (this.vx < -MAX_VX) this.vx = -MAX_VX;

      // timers de pulo
      coyoteTimer = this.onGround ? 0 : coyoteTimer + dt;
      if (input.jumpPressed) jumpBuffer = BUFFER;
      else if (jumpBuffer > 0) jumpBuffer -= dt;

      // pulo (com coyote + buffer) e pulo duplo
      if (jumpBuffer > 0) {
        if (jumpsUsed === 0 && (this.onGround || coyoteTimer <= COYOTE)) {
          this.vy = JUMP_VY;
          jumpsUsed = 1; jumpBuffer = 0; jumpCut = false;
          FG.audio.sfx('jump');
          this.spawnBurst(4);
        } else if (jumpsUsed === 1) {
          this.vy = JUMP_VY;
          jumpsUsed = 2; jumpBuffer = 0; jumpCut = false;
          FG.audio.sfx('doublejump');
          this.spawnBurst(6);
        }
      }
      // pulo mais curto: soltou o botão subindo → corta vy pela metade
      if (!input.jump && this.vy < 0 && !jumpCut) {
        this.vy *= 0.5;
        jumpCut = true;
      }

      // planar: segurando jump, caindo, depois do pulo duplo
      const wantGlide = input.jump && !this.onGround && jumpsUsed >= 2 && this.vy > 0;
      if (wantGlide && !gliding) FG.audio.sfx('glide');
      gliding = wantGlide;

      // gravidade (limitada pelo planar)
      this.vy += GRAVITY * dt;
      const cap = gliding ? GLIDE_FALL : MAX_FALL;
      if (this.vy > cap) this.vy = cap;

      // soco
      if (attackCooldown > 0) attackCooldown -= dt;
      if (input.attackPressed && attackCooldown <= 0) {
        attackTimer = ATTACK_TIME;
        attackCooldown = ATTACK_CD;
        FG.audio.sfx('punch');
      }
      if (attackTimer > 0) attackTimer -= dt;
      const box = this.attackBox;
      box.active = attackTimer > 0;
      if (box.active) {
        box.x = this.facing > 0 ? this.x + this.w : this.x - box.w;
        box.y = this.y + this.h / 2 - box.h / 2;
      }

      // física + colisão (o engine seta onGround)
      FG.engine.moveAndCollide(this, dt);
      if (this.onGround) { jumpsUsed = 0; jumpCut = false; gliding = false; }

      // invulnerabilidade pós-dano
      if (this.invuln > 0) this.invuln -= dt;

      // faíscas ao correr / no ar
      const running = this.onGround && Math.abs(this.vx) > 60;
      sparkAccum += dt * (running ? 14 : (!this.onGround ? 6 : 2));
      while (sparkAccum >= 1) {
        sparkAccum -= 1;
        emitSpark(
          this.x + this.w / 2 + (Math.random() - 0.5) * this.w,
          this.y + this.h - 6 + Math.random() * 6,
          -this.vx * 0.15 + (Math.random() - 0.5) * 40,
          20 + Math.random() * 60,
          0.35 + Math.random() * 0.3,
          1.5 + Math.random() * 1.5
        );
      }
      // integra o pool inteiro (barato, tamanho fixo)
      for (let i = 0; i < SPARKS; i++) {
        const s = sparks[i];
        if (s.life <= 0) continue;
        s.life -= dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 300 * dt;
      }

      // mãos-brasas seguem o corpo com atraso e bobbing
      const t = FG.engine.time;
      const cx = this.x + this.w / 2, cy = this.y + this.h * 0.55;
      const runPhase = Math.sin(t * 14) * (running ? 7 : 0);
      let txL = cx - this.w * 0.75, tyL = cy + Math.sin(t * 3) * 3 + runPhase;
      let txR = cx + this.w * 0.75, tyR = cy + Math.sin(t * 3 + 1.7) * 3 - runPhase;
      // soco: a mão da frente dispara para a hitbox
      if (box.active) {
        const punchX = this.facing > 0 ? box.x + box.w * 0.7 : box.x + box.w * 0.3;
        if (this.facing > 0) { txR = punchX; tyR = cy; }
        else { txL = punchX; tyL = cy; }
      }
      const k = 1 - Math.pow(0.000001, dt); // suavização independente de fps
      handL.x += (txL - handL.x) * k; handL.y += (tyL - handL.y) * k;
      handR.x += (txR - handR.x) * k; handR.y += (tyR - handR.y) * k;
    },

    // rajada de faíscas (pulos, dano)
    spawnBurst(n) {
      for (let i = 0; i < n; i++) {
        emitSpark(
          this.x + this.w / 2 + (Math.random() - 0.5) * this.w,
          this.y + this.h - 4,
          (Math.random() - 0.5) * 180,
          -60 - Math.random() * 120,
          0.4 + Math.random() * 0.3,
          2 + Math.random() * 1.5
        );
      }
    },

    hurt(dmg, fromX) {
      if (this.invuln > 0) return;
      this.hp -= dmg;
      this.invuln = 1.2;
      // knockback na direção oposta à origem do dano
      const away = (this.x + this.w / 2) < fromX ? -1 : 1;
      this.vx = away * KNOCKBACK;
      this.vy = -300;
      FG.audio.sfx('hurt');
      this.spawnBurst(8);
      if (this.hp <= 0) FG.engine.setState('dead');
    },

    respawn(x, y) {
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.hp = this.maxHp;
      this.invuln = 0;
      this.onGround = false;
      this.attackBox.active = false;
      coyoteTimer = 0; jumpBuffer = 0; jumpsUsed = 0; jumpCut = false;
      gliding = false; attackTimer = 0; attackCooldown = 0;
      handL.x = x; handL.y = y + this.h / 2;
      handR.x = x + this.w; handR.y = y + this.h / 2;
      for (let i = 0; i < SPARKS; i++) sparks[i].life = 0;
    },

    // ---------- pintura ----------
    draw(ctx, cam) {
      const t = FG.engine.time;

      // faíscas primeiro (ficam atrás do corpo)
      ctx.save();
      for (let i = 0; i < SPARKS; i++) {
        const s = sparks[i];
        if (s.life <= 0) continue;
        const a = s.life / s.max;
        ctx.globalAlpha = a * 0.85;
        ctx.fillStyle = a > 0.5 ? '#ffd860' : '#ff7030';
        ctx.beginPath();
        ctx.arc(s.x - cam.x, s.y - cam.y, s.r * a + 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // dano: pisca alternando visibilidade
      if (this.invuln > 0 && Math.floor(t * 16) % 2 === 0) return;

      const cx = this.x + this.w / 2 - cam.x;
      const bottom = this.y + this.h - cam.y;
      const running = this.onGround && Math.abs(this.vx) > 60;

      // esticar/achatar conforme o estado
      let sx = 1, sy = 1;
      if (!this.onGround) {
        if (gliding) { sx = 1.12; sy = 0.9; }                    // aberto, flutuando
        else if (this.vy < 0) { sx = 0.85; sy = 1.18; }          // subindo: estica
        else { sx = 0.95; sy = 1.05; }                           // caindo
      } else if (running) {
        sy = 1 + Math.sin(t * 14) * 0.06;                        // bomba no ritmo
        sx = 1 / sy;
      } else {
        sy = 1 + Math.sin(t * 2.2) * 0.035;                      // respira parado
        sx = 1 / sy;
      }
      const tilt = running ? this.facing * 0.12 : 0;             // inclina na corrida

      // mão de trás (atrás do corpo)
      this.drawHand(ctx, cam, this.facing > 0 ? handL : handR, t, false);

      ctx.save();
      ctx.translate(cx, bottom);
      ctx.rotate(tilt);
      ctx.scale(sx, sy);

      const bw = this.w * 1.15, bh = this.h; // corpo um pouco mais gordo que a hitbox

      // topete de fogo (tremula com o tempo)
      ctx.save();
      ctx.translate(0, -bh);
      if (gliding) {
        // planando: topete vira hélice girando
        ctx.save();
        ctx.rotate(t * 22);
        ctx.fillStyle = 'rgba(255,200,80,0.85)';
        ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 10;
        for (let i = 0; i < 3; i++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.beginPath();
          ctx.ellipse(11, 0, 12, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = '#fff0b0';
        ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
      } else {
        const wob = Math.sin(t * 9) * 3 + Math.sin(t * 23) * 1.5; // tremulação
        const g = ctx.createLinearGradient(0, 4, wob, -20);
        g.addColorStop(0, '#ffdf70'); g.addColorStop(1, '#ff5010');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-7, 3);
        ctx.quadraticCurveTo(-6 + wob * 0.5, -12, wob, -19 - Math.sin(t * 13) * 2);
        ctx.quadraticCurveTo(6 + wob * 0.5, -10, 7, 3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // corpo-gota: gradiente radial branco-amarelo → laranja → vermelho
      const grad = ctx.createRadialGradient(0, -bh * 0.58, 2, 0, -bh * 0.5, bh * 0.62);
      grad.addColorStop(0, '#fff8d8');
      grad.addColorStop(0.35, '#ffd040');
      grad.addColorStop(0.72, '#ff7818');
      grad.addColorStop(1, '#e03408');
      ctx.save();
      ctx.shadowColor = '#ff8000';
      ctx.shadowBlur = 14;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, -bh);                                        // ponta da gota
      ctx.bezierCurveTo(bw * 0.62, -bh * 0.82, bw * 0.58, -bh * 0.12, 0, 0);
      ctx.bezierCurveTo(-bw * 0.58, -bh * 0.12, -bw * 0.62, -bh * 0.82, 0, -bh);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // olhos grandes e expressivos, pupilas na direção do movimento
      const lookX = Math.max(-1, Math.min(1, this.vx / MAX_VX)) * 2.5 + this.facing * 1.5;
      const lookY = Math.max(-1, Math.min(1, this.vy / 700)) * 2;
      const eyeY = -bh * 0.62;
      for (const ex of [-6.5, 6.5]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, 5.5, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a1408';
        ctx.beginPath();
        ctx.arc(ex + lookX, eyeY + lookY, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';                 // brilho da pupila
        ctx.beginPath();
        ctx.arc(ex + lookX - 1, eyeY + lookY - 1, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // boca: sorriso simples (aberta se planando)
      ctx.strokeStyle = '#7a1c00';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (gliding) ctx.arc(0, -bh * 0.4, 3.5, 0, Math.PI);
      else ctx.arc(0, -bh * 0.44, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();

      ctx.restore();

      // mão da frente (na frente do corpo), com rastro se socando
      this.drawHand(ctx, cam, this.facing > 0 ? handR : handL, t, this.attackBox.active);
    },

    // uma mão-brasa: esfera laranja com glow, sem braço
    drawHand(ctx, cam, hand, t, punching) {
      const hx = hand.x - cam.x, hy = hand.y - cam.y;
      ctx.save();
      // rastro de fogo durante o soco
      if (punching) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ff9020';
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.arc(hx - this.facing * i * 7, hy + Math.sin(t * 40 + i) * 2, 6 - i, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const g = ctx.createRadialGradient(hx, hy, 1, hx, hy, 8);
      g.addColorStop(0, '#ffe8a0');
      g.addColorStop(0.6, '#ff9020');
      g.addColorStop(1, '#e04808');
      ctx.shadowColor = '#ff7000';
      ctx.shadowBlur = punching ? 16 : 8;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hx, hy, punching ? 8 : 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  };

  FG.player = player;
})();
