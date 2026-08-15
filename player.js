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
        if (gliding) { sx = 1.08; sy = 0.94; }                   // aberto, flutuando
        else if (this.vy < 0) { sx = 0.9; sy = 1.12; }           // subindo: estica
        else { sx = 0.96; sy = 1.04; }                           // caindo
      } else if (running) {
        sy = 1 + Math.sin(t * 14) * 0.05;                        // bomba no ritmo
        sx = 1 / sy;
      } else {
        sy = 1 + Math.sin(t * 2.2) * 0.03;                       // respira parado
        sx = 1 / sy;
      }
      const tilt = running ? this.facing * 0.12 : 0;             // inclina na corrida

      // sprite do Heitor: pés na base da hitbox, cabeça um pouco acima dela
      const img = FG.assets && FG.assets.heitor;
      const sh = this.h * 1.3;
      const sw = sh * (FG.assets ? FG.assets.heitorRatio : 0.44);

      ctx.save();
      ctx.translate(cx, bottom);
      ctx.rotate(tilt);
      ctx.scale(this.facing * sx, sy); // espelha pelo facing

      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.shadowColor = '#ff8000';                             // aura de fagulha
        ctx.shadowBlur = 12;
        ctx.drawImage(img, -sw / 2, -sh, sw, sh);
        ctx.restore();
      } else {
        // foto ainda decodificando: chama simples de reserva por 1-2 frames
        const g0 = ctx.createRadialGradient(0, -this.h * 0.5, 2, 0, -this.h * 0.5, this.h * 0.6);
        g0.addColorStop(0, '#ffd040');
        g0.addColorStop(1, '#e03408');
        ctx.fillStyle = g0;
        ctx.beginPath();
        ctx.ellipse(0, -this.h / 2, this.w * 0.55, this.h * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // planando: hélice de fogo girando sobre a cabeça
      if (gliding) {
        ctx.save();
        ctx.translate(0, -sh - 5);
        ctx.rotate(t * 22);
        ctx.fillStyle = 'rgba(255,200,80,0.85)';
        ctx.shadowColor = '#ffb000';
        ctx.shadowBlur = 10;
        for (let i = 0; i < 3; i++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.beginPath();
          ctx.ellipse(11, 0, 12, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = '#fff0b0';
        ctx.beginPath(); ctx.arc(0, -sh - 5, 3.5, 0, Math.PI * 2); ctx.fill();
      }

      ctx.restore();

      // luva extra que dispara durante o soco (mira a hitbox do golpe)
      if (this.attackBox.active) this.drawGlove(ctx, cam, t);
    },

    // luva de boxe vermelha voadora, com rastro de fogo
    drawGlove(ctx, cam, t) {
      const box = this.attackBox;
      const gx = box.x + box.w / 2 - cam.x + this.facing * 4;
      const gy = box.y + box.h / 2 - cam.y;
      ctx.save();
      // rastro de fogo entre o corpo e a luva
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ff9020';
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(gx - this.facing * i * 8, gy + Math.sin(t * 40 + i) * 2, 7 - i, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // punho da luva
      ctx.shadowColor = '#ff5030';
      ctx.shadowBlur = 10;
      const g = ctx.createRadialGradient(gx - this.facing * 3, gy - 3, 2, gx, gy, 11);
      g.addColorStop(0, '#ff7a60');
      g.addColorStop(0.6, '#e83424');
      g.addColorStop(1, '#a01808');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 10, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // polegar
      ctx.beginPath();
      ctx.ellipse(gx - this.facing * 7, gy + 4.5, 4.5, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // pulso preto (manga do casaco)
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#241f24';
      ctx.beginPath();
      ctx.ellipse(gx - this.facing * 12, gy, 4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  };

  FG.player = player;
})();
