// Fagulho: Lendas do Bosque — boss7.js
// Chefão da fase 7 (A Praia): TORPEDÃO FRANCISCO.
// Mergulhador veterano em roupa de mergulho preta, capacete igual ao do
// jogador (ele também é gente da superfície, só que virou o guarda do
// recife) e uma BAZUCA enorme que atira peixe morto em vez de foguete.
// QUATRO ataques, dois deles de peixe morto:
//   - bazuca: fluxo mirado de 8 peixes, cada um perseguindo a posição do
//     jogador no instante do próprio disparo (intervalo curto — é um fio
//     contínuo de peixe, não tiro-a-tiro espaçado);
//   - cardume: leque largo de 11 peixes, mirado UMA vez no disparo e cobrindo
//     uma área inteira de uma vez — obriga a sair de cima da linha de fogo,
//     não só desviar de um projétil por vez;
//   - torpedo: ele mesmo vira o projétil, arrancada de ombro em linha reta de
//     ponta a ponta da arena;
//   - minas: três cargas que ele solta boiando, armam depois de um instante
//     e detonam num raio bem maior que o próprio corpo (MINA_BLAST_R), com
//     um anel tracejado avisando até onde não chegar.
// Flutua livre — sem gravidade, como todo bicho desta fase — em vez de ficar
// preso a um chão, porque ele está debaixo d'água como tudo o mais aqui.
// Mesma arquitetura dos outros chefões: máquina de estados, pools de
// projétil pré-alocadas, reset() que limpa tudo. Só um ciclo de ataques (sem
// fase 2) — não é o chefão mais duro do jogo, é o mais novo.
// A ÚNICA coisa que este arquivo faz no load é registar-se em FG.enemies
// (enemies.js vem antes no index.html); todo o resto só olha para FG.*
// dentro de funções chamadas em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  const GRAV = 2200; // só usada (bem reduzida) nos projéteis — ele mesmo não cai

  const spawnParticle = (x, y, vx, vy, life, size, color, grav) =>
    FG.enemies.fx.spawnParticle(x, y, vx, vy, life, size, color, grav);
  const goldBurst = (cx, cy, n, lumiCount) => FG.enemies.fx.goldBurst(cx, cy, n, lumiCount);
  const groundYAt = (x, yMin) => FG.enemies.fx.groundYAt(x, yMin);
  const rand = (a, b) => FG.enemies.fx.rand(a, b);

  // ==================================================================
  // MEDIDAS
  // ==================================================================
  const DIVER_W = 64, DIVER_H = 110;
  const CORE_W = 50, CORE_H = 46;         // o rosto, só vulnerável exposto
  const TORPEDO_SPEED = 760;
  const TORPEDO_MAX_T = 0.85;             // teto de tempo da arrancada (ou bate na parede antes)
  const MINA_BLAST_R = 52;                // raio de dano da mina armada — bem maior que o corpo dela (m.r=15)

  // ---------- pools do chefão (pré-alocadas; reset() apaga todas) ----------
  const MAXPEIXE = 28;                    // dava 14; dobrado pro fluxo de peixes (bazuca + cardume)
  const peixes = [];
  for (let i = 0; i < MAXPEIXE; i++) {
    peixes.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, w: 22, h: 13, rot: 0 });
  }

  const MAXMINA = 8;
  const minas = [];
  for (let i = 0; i < MAXMINA; i++) {
    minas.push({ active: false, state: 'voando', x: 0, y: 0, vx: 0, vy: 0, targetY: 0, timer: 0, r: 15 });
  }

  const boss = {
    id: 'francisco',
    nome: 'TORPEDÃO FRANCISCO',

    // --- contrato lido pelo engine ---
    started: false,
    active: false,
    dead: false,
    hp: 8,
    maxHp: 8,

    // --- geometria (resolvida em runtime) ---
    homeX: 0, homeY: 0,
    x: 0, y: 0,
    groundY: 0,

    // --- pose ---
    aim: 0,          // 0..1 — bazuca erguida (telegraph)
    tuck: 0,          // 0..1 — encolhido pra virar torpedo (telegraph)
    mascara: 0,       // 0..1 — máscara erguida (0 = fechada/segura, 1 = exposto)
    shake: 0,
    flash: 0,

    // --- máquina de estados ---
    state: 'dormant', // dormant|intro|idle|bazuca|torpedo|minas|exposto|dying
    phase: 0,
    timer: 0,
    attackIndex: 0,
    stunHit: false,
    safe: 0,
    dieTimer: 0,
    sinkY: 0,
    victoryFired: false,

    dir: -1, // de olho na esquerda (de onde o jogador vem), como os outros chefões de arena
    shotsLeft: 0,    // bazuca/cardume: disparos que ainda faltam na rajada atual
    shotTimer: 0,    // bazuca/cardume: intervalo até o próximo disparo
    tvy: 0,          // torpedo: componente vertical mirada no instante do arranque
    cardumeAngs: [], // cardume: ângulos do leque, mirados uma vez no disparo

    coreBox: { x: 0, y: 0, w: CORE_W, h: CORE_H },
    bodyBox: { x: 0, y: 0, w: 0, h: 0 },

    start() {
      if (this.started) return;
      this.started = true;
      this.resolveGeometry();
      this.state = 'intro';
      this.timer = 1.2;
      FG.audio.sfx('bossRoar');
      FG.audio.music('boss');
    },

    resolveGeometry() {
      const a = FG.level.arena;
      this.groundY = groundYAt(a.x + a.w * 0.7, 300);
      this.homeX = a.x + a.w - 220;
      this.homeY = this.groundY - 190; // flutua, não fica no chão
      this.x = this.homeX;
      this.y = this.homeY;
    },

    reset() {
      this.started = false;
      this.active = false;
      this.dead = false;
      this.hp = this.maxHp;
      this.state = 'dormant';
      this.phase = 0;
      this.timer = 0;
      this.attackIndex = 0;
      this.stunHit = false;
      this.safe = 0;
      this.aim = 0;
      this.tuck = 0;
      this.mascara = 0;
      this.shake = 0;
      this.flash = 0;
      this.dieTimer = 0;
      this.sinkY = 0;
      this.victoryFired = false;
      this.shotsLeft = 0;
      this.shotTimer = 0;
      this.tvy = 0;
      this.cardumeAngs = [];
      for (let i = 0; i < MAXPEIXE; i++) peixes[i].active = false;
      for (let i = 0; i < MAXMINA; i++) minas[i].active = false;
    },

    refreshPose() {
      const cb = this.coreBox;
      cb.w = CORE_W; cb.h = CORE_H;
      cb.x = this.x + this.dir * (DIVER_W * 0.2) - cb.w / 2;
      cb.y = this.y - DIVER_H * 0.62 - cb.h / 2;

      const bb = this.bodyBox;
      bb.w = DIVER_W + 40;
      bb.h = DIVER_H;
      bb.x = this.x - bb.w / 2;
      bb.y = this.y - DIVER_H * 0.9;
    },

    expose() {
      this.state = 'exposto';
      this.timer = 2.6; // janela padrão dos chefões de ataque único
      this.phase = 0;
      this.stunHit = false;
      this.aim = 0;
      this.tuck = 0;
    },

    // Janela FORÇADA pelas cócegas do MurphOliver (botão B). Interrompe
    // qualquer ataque em curso e expõe o rosto na hora, com uma janela mais
    // generosa (2.2s) que a exposição normal — é a recompensa de gastar a
    // cóceja, que custa 30s de descanso do sapinho (ver companion.js).
    // Retorna false se não havia o que expor (chefão ainda não começou, já
    // morto, ou já exposto/intro).
    forceExpose() {
      if (!this.started || this.dead) return false;
      if (this.state === 'exposto' || this.state === 'dying' ||
          this.state === 'intro' || this.state === 'dormant') return false;
      this.expose();
      this.timer = 2.2;
      this.shake = 0.6;
      FG.audio.sfx('bossHit');
      return true;
    },

    takeHit() {
      this.hp--;
      this.flash = 0.25;
      this.stunHit = true;
      FG.audio.sfx('bossHit');
      goldBurst(this.coreBox.x + this.coreBox.w / 2, this.coreBox.y + this.coreBox.h / 2, 10, 0);
      for (let i = 0; i < 8; i++) {
        spawnParticle(this.coreBox.x + this.coreBox.w / 2, this.coreBox.y + this.coreBox.h / 2,
          rand(-180, 180), rand(-160, 40), 0.6, 3 + Math.random() * 4, 'rgba(210,245,255,0.8)', -60);
      }
      if (this.hp <= 0) {
        this.dead = true;
        this.state = 'dying';
        this.dieTimer = 0;
        this.timer = 0;
      } else {
        this.state = 'idle';
        this.timer = 0.8;
        this.safe = 0.6;
        this.mascara = 0;
      }
    },

    step(dt) {
      const p = FG.player;
      const ov = FG.engine.rectsOverlap;
      if (this.flash > 0) this.flash -= dt;
      if (this.safe > 0) this.safe -= dt;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);

      // ---------- morte cinematográfica: afunda soltando bolhas e o peso-chumbo ----------
      if (this.state === 'dying') {
        this.dieTimer += dt;
        this.sinkY = Math.min(140, this.sinkY + dt * 60);
        this.y = this.homeY + this.sinkY;
        if (Math.random() < 0.8) {
          spawnParticle(this.x + rand(-DIVER_W * 0.4, DIVER_W * 0.4), this.y - DIVER_H * 0.5,
            rand(-40, 40), rand(-160, -60), 0.7, 3 + Math.random() * 4, 'rgba(220,245,255,0.7)', -30);
        }
        this.refreshPose();
        if (this.dieTimer >= 2.4 && !this.victoryFired) {
          this.victoryFired = true;
          goldBurst(this.x, this.y - DIVER_H * 0.5, 40, 5);
          FG.audio.sfx('victory');
          FG.engine.setState('victory');
        }
        return;
      }

      if (!this.started) return;

      if (this.state === 'intro') {
        this.timer -= dt;
        this.aim = Math.min(1, this.aim + dt * 1.6);
        this.shake = 0.25;
        this.refreshPose();
        if (this.timer <= 0) {
          this.active = true;
          this.state = 'idle';
          this.timer = 0.8;
          this.aim = 0;
        }
        return;
      }

      const a = FG.level.arena;
      this.timer -= dt;

      if (this.state === 'idle') {
        this.x += (this.homeX - this.x) * Math.min(1, dt * 3.4);
        this.y += (this.homeY - this.y) * Math.min(1, dt * 3.4);
        this.mascara += (0 - this.mascara) * Math.min(1, dt * 6);
        if (this.timer <= 0) {
          const attacks = ['bazuca', 'torpedo', 'minas', 'cardume'];
          this.state = attacks[this.attackIndex % attacks.length];
          this.attackIndex++;
          this.phase = 0;
          this.timer = 0;
        }

      } else if (this.state === 'exposto') {
        // boia de barriga para cima, meio grogue, máscara erguida — o rosto fica à mostra
        this.mascara = Math.min(1, this.mascara + dt * 6);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 2.4);
        this.y += (this.homeY - this.y) * Math.min(1, dt * 2.4);
        this.refreshPose();
        if (Math.random() < 0.3) {
          spawnParticle(this.coreBox.x + this.coreBox.w / 2 + rand(-10, 10),
            this.coreBox.y, rand(-14, 14), rand(-70, -30), 0.6, 2.5 + Math.random() * 2.5,
            'rgba(210,245,255,0.7)', -40);
        }
        if (!this.stunHit && p.attackBox && p.attackBox.active && ov(p.attackBox, this.coreBox)) {
          this.takeHit();
        } else if (!this.stunHit && p.vy > 0 && ov(p, this.coreBox)) {
          p.vy = -420;
          this.takeHit();
        }
        if (this.timer <= 0 && this.state === 'exposto') {
          this.state = 'idle';
          this.timer = 0.9;
          this.mascara = 0;
          this.safe = 0.5;
        }
        return; // exposto nunca machuca de corpo — sai antes do teste de contato

      // ================= 1. BAZUCA DE PEIXE MORTO (fluxo mirado) =================
      } else if (this.state === 'bazuca') {
        if (this.phase === 0) {
          // telegraph: ergue a bazuca e mira — 0.6s
          this.phase = 1;
          this.timer = 0.6;
          this.shotsLeft = 8; // era 4 — fluxo de verdade, não um tiro ou outro
          this.shotTimer = 0;
        } else if (this.phase === 1) {
          this.aim = Math.min(1, this.aim + dt * 3.2);
          if (this.timer <= 0) {
            this.phase = 2;
            this.timer = 0; // controlado pelo shotTimer, não por este
          }
        } else if (this.phase === 2) {
          // disparos em fluxo contínuo, cada um mirado de novo no instante do
          // tiro — intervalo bem mais curto que antes (era 0.22s)
          this.shotTimer -= dt;
          if (this.shotTimer <= 0 && this.shotsLeft > 0) {
            FG.audio.sfx('bossSpit');
            this.shake = 0.3;
            const mx = this.x + this.dir * DIVER_W * 0.7, my = this.y - DIVER_H * 0.55;
            const dx = (p.x + p.w / 2) - mx, dy = (p.y + p.h / 2) - my;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const SPD = 560;
            this.spitFish(mx, my, (dx / d) * SPD, (dy / d) * SPD * 0.5);
            this.shotsLeft--;
            this.shotTimer = 0.13;
          }
          if (this.shotsLeft <= 0 && this.shotTimer <= 0) {
            this.aim = 0;
            this.phase = 3;
            this.timer = 0.4;
          }
        } else if (this.phase === 3) {
          if (this.timer <= 0) this.expose();
        }

      // ================= 2. TORPEDO (arrancada de ombro) =================
      } else if (this.state === 'torpedo') {
        if (this.phase === 0) {
          // telegraph: encolhe feito torpedo — 0.55s
          this.phase = 1;
          this.timer = 0.55;
          FG.audio.sfx('bossRoar');
        } else if (this.phase === 1) {
          this.tuck = Math.min(1, this.tuck + dt * 3.2);
          this.shake = 0.2;
          if (this.timer <= 0) {
            // mira UMA vez, no instante do arranque — sair da linha depois vale
            const dx = (p.y + p.h / 2) - this.y;
            this.tvy = Math.max(-260, Math.min(260, dx * 1.4));
            this.dir = (p.x + p.w / 2) < this.x ? -1 : 1;
            this.phase = 2;
            this.timer = TORPEDO_MAX_T;
          }
        } else if (this.phase === 2) {
          this.x += this.dir * TORPEDO_SPEED * dt;
          this.y += this.tvy * dt * 0.4;
          this.shake = 0.6;
          if (Math.random() < 0.7) {
            spawnParticle(this.x - this.dir * DIVER_W * 0.5, this.y, rand(-30, 30), rand(-40, -10),
              0.4, 3 + Math.random() * 3, 'rgba(220,245,255,0.75)', -40);
          }
          const bateu = this.x < a.x + 60 || this.x > a.x + a.w - 60;
          if (bateu) this.x = Math.max(a.x + 60, Math.min(a.x + a.w - 60, this.x));
          if (!this.stunHit && ov(p, this.bodyBox)) {
            p.hurt(2, this.x);
          }
          if (bateu || this.timer <= 0) {
            this.tuck = 0;
            this.phase = 3;
            this.timer = 0.5;
          }
        } else if (this.phase === 3) {
          this.x += (this.homeX - this.x) * Math.min(1, dt * 3);
          this.y += (this.homeY - this.y) * Math.min(1, dt * 3);
          if (this.timer <= 0) this.expose();
        }

      // ================= 3. MINAS BOIANDO =================
      } else if (this.state === 'minas') {
        if (this.phase === 0) {
          // telegraph: puxa as cargas do cinto, mostra pro jogador — 0.6s
          this.phase = 1;
          this.timer = 0.6;
          FG.audio.sfx('bossRoar');
        } else if (this.phase === 1) {
          this.aim = Math.min(1, this.aim + dt * 2.4);
          if (this.timer <= 0) {
            FG.audio.sfx('bossSpit');
            this.shake = 0.5;
            for (let i = 0; i < 3; i++) {
              const ang = -0.5 + i * 0.5;
              this.spawnMina(this.x, this.y - DIVER_H * 0.4,
                this.dir * (160 + i * 30), -220 + ang * 60,
                this.groundY - rand(50, 230));
            }
            this.aim = 0;
            this.phase = 2;
            this.timer = 1.1;
          }
        } else if (this.phase === 2) {
          if (this.timer <= 0) this.expose();
        }

      // ================= 4. CARDUME (leque largo, muito peixe de uma vez) =================
      // O segundo ataque de peixe morto pedido: em vez do fluxo mirado da
      // bazuca (que persegue a posição do jogador tiro a tiro), o cardume é
      // um leque FIXO, mirado uma única vez no instante do disparo — cobre
      // uma área larga de uma vez, obrigando a sair da frente dele em vez de
      // só desviar de um fio fino de tiros.
      } else if (this.state === 'cardume') {
        if (this.phase === 0) {
          // telegraph: aponta a bazuca reto pro jogador — 0.5s
          this.phase = 1;
          this.timer = 0.5;
          this.dir = (p.x + p.w / 2) < this.x ? -1 : 1;
          FG.audio.sfx('bossRoar');
        } else if (this.phase === 1) {
          this.aim = Math.min(1, this.aim + dt * 4);
          if (this.timer <= 0) {
            // mira UMA vez, no instante do disparo — um leque de 11 peixes,
            // -0.45..+0.45 rad em torno da direção do jogador
            const mx = this.x + this.dir * DIVER_W * 0.7, my = this.y - DIVER_H * 0.55;
            const dx = (p.x + p.w / 2) - mx, dy = (p.y + p.h / 2) - my;
            const baseAng = Math.atan2(dy, dx);
            this.cardumeAngs = [];
            const N = 11;
            for (let i = 0; i < N; i++) this.cardumeAngs.push(baseAng + (i / (N - 1) - 0.5) * 0.9);
            this.shotsLeft = N;
            this.shotTimer = 0;
            this.phase = 2;
            this.timer = 0;
          }
        } else if (this.phase === 2) {
          this.shotTimer -= dt;
          if (this.shotTimer <= 0 && this.shotsLeft > 0) {
            FG.audio.sfx('bossSpit');
            this.shake = 0.25;
            const mx = this.x + this.dir * DIVER_W * 0.7, my = this.y - DIVER_H * 0.55;
            const ang = this.cardumeAngs[this.cardumeAngs.length - this.shotsLeft];
            const SPD = 540;
            this.spitFish(mx, my, Math.cos(ang) * SPD, Math.sin(ang) * SPD);
            this.shotsLeft--;
            this.shotTimer = 0.07;
          }
          if (this.shotsLeft <= 0 && this.shotTimer <= 0) {
            this.aim = 0;
            this.phase = 3;
            this.timer = 0.4;
          }
        } else if (this.phase === 3) {
          if (this.timer <= 0) this.expose();
        }
      }

      this.refreshPose();

      // ---------- contato com o corpo do mergulhador ----------
      if (this.safe > 0) {
        if (ov(p, this.bodyBox)) {
          const lado = (p.x + p.w / 2) < this.x ? -1 : 1;
          p.vx = lado * 260;
        }
      } else if (this.state !== 'torpedo' && ov(p, this.bodyBox)) {
        p.hurt(2, this.x);
      }
    },

    spitFish(x, y, vx, vy) {
      for (let i = 0; i < MAXPEIXE; i++) {
        const f = peixes[i];
        if (f.active) continue;
        f.active = true;
        f.x = x; f.y = y;
        f.vx = vx; f.vy = vy;
        f.rot = Math.atan2(vy, vx);
        return;
      }
    },

    spawnMina(x, y, vx, vy, targetY) {
      for (let i = 0; i < MAXMINA; i++) {
        const m = minas[i];
        if (m.active) continue;
        m.active = true;
        m.state = 'voando';
        m.x = x; m.y = y;
        m.vx = vx; m.vy = vy;
        m.targetY = targetY;
        m.timer = 3.4; // tempo armada, depois de pousar
        return;
      }
    },

    update(dt) {
      this.step(dt);
      if (this.started || this.dead) updateBossStuff(dt);
    },

    draw(ctx, cam) {
      drawFrancisco(ctx, cam);
      drawBossStuff(ctx, cam);
    },
  };

  // ==================================================================
  // Peixes mortos e minas
  // ==================================================================
  const scratch = { x: 0, y: 0, w: 0, h: 0 };

  function updateBossStuff(dt) {
    const p = FG.player;
    const ov = FG.engine.rectsOverlap;
    const a = FG.level.arena;
    const janela = boss.state === 'exposto';

    for (let i = 0; i < MAXPEIXE; i++) {
      const f = peixes[i];
      if (!f.active) continue;
      f.vy += GRAV * 0.12 * dt; // peixe morto afunda devagar, não despenca
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot = Math.atan2(f.vy, f.vx);
      scratch.x = f.x - f.w; scratch.y = f.y - f.h; scratch.w = f.w * 2; scratch.h = f.h * 2;
      if (!janela && ov(p, scratch)) {
        f.active = false;
        p.hurt(2, f.x);
        continue;
      }
      if (f.x < a.x - 160 || f.x > a.x + a.w + 160 || f.y > FG.level.H + 80) f.active = false;
    }

    for (let i = 0; i < MAXMINA; i++) {
      const m = minas[i];
      if (!m.active) continue;
      if (m.state === 'voando') {
        m.vy += GRAV * 0.1 * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.vx *= Math.max(0, 1 - dt * 1.2);
        if (m.y >= m.targetY) {
          m.y = m.targetY;
          m.vx = 0; m.vy = 0;
          m.state = 'armando';
          m.timer = 0.5;
        }
      } else if (m.state === 'armando') {
        m.timer -= dt;
        if (m.timer <= 0) { m.state = 'armada'; m.timer = 3.4; }
      } else { // armada
        m.timer -= dt;
        m.y += Math.sin(FG.engine.time * 2 + m.x) * 4 * dt; // bob leve
        scratch.x = m.x - MINA_BLAST_R; scratch.y = m.y - MINA_BLAST_R;
        scratch.w = MINA_BLAST_R * 2; scratch.h = MINA_BLAST_R * 2;
        if (!janela && ov(p, scratch)) {
          p.hurt(2, m.x);
          m.active = false;
          burstMina(m.x, m.y);
          continue;
        }
        if (m.timer <= 0) { m.active = false; burstMina(m.x, m.y); }
      }
    }
  }

  function burstMina(x, y) {
    // raio do estouro visível bate com MINA_BLAST_R: a faísca mais longe
    // chega perto da borda real do dano, não só perto do corpo da mina
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const v = MINA_BLAST_R * (3.2 + Math.random() * 1.2);
      spawnParticle(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.45, 4 + Math.random() * 4,
        'rgba(255,200,120,0.85)', 0);
    }
  }

  // ==================================================================
  // DESENHO — Torpedão Francisco: roupa de mergulho preta, capacete de
  // vidro igual ao do jogador, nadadeiras vermelhas, bazuca cinza enorme
  // apoiada no ombro. Máscara/rosto só aparece exposto, grogue.
  // ==================================================================
  function drawFrancisco(ctx, cam) {
    const b = boss;
    if (!b.started && b.state === 'dormant') return;
    const sx = b.x - cam.x, sy = b.y - cam.y;
    if (sx < -260 || sx > FG.levelkit.VIEW_W + 260) return;

    const shakeX = b.shake > 0 ? Math.sin(FG.engine.time * 50) * 4 * b.shake : 0;
    const exposto = b.state === 'exposto';
    const bob = Math.sin(FG.engine.time * 1.6) * 5;

    ctx.save();
    ctx.translate(sx + shakeX, sy + bob);
    ctx.scale(b.dir, 1);

    // sombra difusa embaixo
    ctx.fillStyle = 'rgba(0,0,10,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, DIVER_H * 0.55, DIVER_W * 0.6, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // nadadeiras (pés), vermelhas, longas
    ctx.fillStyle = '#c23a30';
    ctx.beginPath();
    ctx.moveTo(-DIVER_W * 0.18, DIVER_H * 0.42);
    ctx.lineTo(-DIVER_W * 0.5, DIVER_H * 0.56);
    ctx.lineTo(-DIVER_W * 0.12, DIVER_H * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(DIVER_W * 0.06, DIVER_H * 0.42);
    ctx.lineTo(DIVER_W * 0.42, DIVER_H * 0.58);
    ctx.lineTo(DIVER_W * 0.1, DIVER_H * 0.48);
    ctx.closePath(); ctx.fill();

    // pernas da roupa de mergulho (preta, com faixa cinza no joelho)
    ctx.fillStyle = '#1a1c20';
    ctx.fillRect(-DIVER_W * 0.22, DIVER_H * 0.02, DIVER_W * 0.2, DIVER_H * 0.42);
    ctx.fillRect(DIVER_W * 0.02, DIVER_H * 0.02, DIVER_W * 0.2, DIVER_H * 0.42);
    ctx.fillStyle = '#3a3e44';
    ctx.fillRect(-DIVER_W * 0.22, DIVER_H * 0.2, DIVER_W * 0.2, 6);
    ctx.fillRect(DIVER_W * 0.02, DIVER_H * 0.2, DIVER_W * 0.2, 6);

    // torso: roupa de mergulho preta com o cinto de peso e o tanque atrás
    ctx.fillStyle = '#2a4a1c'; // tanque de oxigênio verde-musgo, atrás do corpo
    ctx.fillRect(-DIVER_W * 0.12, -DIVER_H * 0.55, DIVER_W * 0.22, DIVER_H * 0.56);
    ctx.fillStyle = '#16181c';
    ctx.beginPath();
    ctx.moveTo(-DIVER_W * 0.32, DIVER_H * 0.04);
    ctx.lineTo(DIVER_W * 0.32, DIVER_H * 0.04);
    ctx.lineTo(DIVER_W * 0.28, -DIVER_H * 0.5);
    ctx.lineTo(-DIVER_W * 0.28, -DIVER_H * 0.5);
    ctx.closePath();
    ctx.fill();
    // cinto de peso
    ctx.fillStyle = '#4a3420';
    ctx.fillRect(-DIVER_W * 0.3, DIVER_H * 0.0, DIVER_W * 0.6, 8);
    for (let i = -2; i <= 2; i++) {
      ctx.fillStyle = '#8a8070';
      ctx.fillRect(i * DIVER_W * 0.11 - 3, DIVER_H * 0.0, 6, 8);
    }

    // BAZUCA — cano cinza grosso apoiado no ombro, apontando pra frente;
    // ergue um pouco mais quando mira (aim)
    const gy0 = -DIVER_H * 0.42 - b.aim * 8;
    ctx.strokeStyle = '#5a5e64'; ctx.lineWidth = 11; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(DIVER_W * 0.1, gy0);
    ctx.lineTo(DIVER_W * 1.05, gy0 - b.aim * 14);
    ctx.stroke();
    ctx.strokeStyle = '#2a2c30'; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(DIVER_W * 0.1, gy0);
    ctx.lineTo(DIVER_W * 1.05, gy0 - b.aim * 14);
    ctx.stroke();
    // boca do cano
    ctx.fillStyle = '#16171a';
    ctx.beginPath();
    ctx.arc(DIVER_W * 1.05, gy0 - b.aim * 14, 7, 0, Math.PI * 2);
    ctx.fill();
    // corpo/mira da bazuca
    ctx.fillStyle = '#4a4e54';
    ctx.fillRect(DIVER_W * 0.28, gy0 - 8 - b.aim * 10, DIVER_W * 0.3, 16);
    // brilho de mira quando carrega
    if (b.aim > 0.6) {
      ctx.save();
      ctx.globalAlpha = (b.aim - 0.6) * 2.5;
      ctx.fillStyle = '#ffd880';
      ctx.shadowColor = '#ffd880';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(DIVER_W * 1.05, gy0 - b.aim * 14, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // braço segurando a coronha da bazuca
    ctx.strokeStyle = '#1a1c20'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(DIVER_W * 0.1, -DIVER_H * 0.3);
    ctx.lineTo(DIVER_W * 0.42, gy0 - 2 - b.aim * 10);
    ctx.stroke();

    // CABEÇA com capacete de mergulho — igual ao do jogador, só maior
    const hx = 0, hy = -DIVER_H * 0.78;
    // mangueira
    ctx.strokeStyle = 'rgba(200,200,205,0.7)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx + 12, hy - 4);
    ctx.quadraticCurveTo(hx + 26, hy - 20, hx + 16, hy - 34);
    ctx.stroke();
    // cúpula
    const rC = DIVER_W * 0.42;
    const gC = ctx.createRadialGradient(hx - rC * 0.3, hy - rC * 0.3, 1, hx, hy, rC);
    gC.addColorStop(0, 'rgba(255,255,255,0.4)');
    gC.addColorStop(0.5, 'rgba(200,235,240,0.2)');
    gC.addColorStop(1, 'rgba(150,195,205,0.12)');
    ctx.fillStyle = gC;
    ctx.beginPath(); ctx.arc(hx, hy, rC, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(230,240,245,0.5)'; ctx.lineWidth = 1.6; ctx.stroke();
    // aro com rebites
    ctx.fillStyle = '#7a8088';
    ctx.beginPath();
    ctx.ellipse(hx, hy + rC * 0.78, rC * 0.95, rC * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    // o ROSTO: só visível (máscara erguida) durante a janela exposta —
    // careca grisalho, olhos arregalados e tontos, boca aberta ofegando
    if (b.mascara > 0.05) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.mascara * 1.6);
      ctx.fillStyle = '#d8a878';
      ctx.beginPath(); ctx.arc(hx, hy, rC * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c8c0b0'; // cabelo grisalho rareando
      ctx.beginPath(); ctx.arc(hx, hy - rC * 0.3, rC * 0.5, Math.PI, 0); ctx.fill();
      // olhos tontos (um semicerrado, um arregalado — grogue)
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(hx - rC * 0.22, hy - rC * 0.06, 6, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx + rC * 0.24, hy - rC * 0.06, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a1c14';
      ctx.beginPath(); ctx.arc(hx - rC * 0.2, hy - rC * 0.04, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + rC * 0.24, hy - rC * 0.06, 1.8, 0, Math.PI * 2); ctx.fill();
      // bigode grisalho e boca ofegando
      ctx.fillStyle = '#d8d0c0';
      ctx.fillRect(hx - rC * 0.26, hy + rC * 0.14, rC * 0.5, 4);
      ctx.fillStyle = '#5a2c24';
      ctx.beginPath(); ctx.ellipse(hx, hy + rC * 0.3, 5, 4 + Math.sin(FG.engine.time * 10) * 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // flash branco ao levar dano
    if (b.flash > 0) {
      ctx.save();
      ctx.globalAlpha = b.flash / 0.25 * 0.6;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, -DIVER_H * 0.3, DIVER_W * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawBossStuff(ctx, cam) {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // peixes mortos em voo: barriga estufada verde-acinzentada (decomposto,
    // não fresco), olhos em X (a assinatura clássica de peixe morto), boca
    // frouxa entreaberta, nadadeiras moles arrastando, rastro de bolhas pútridas.
    for (let i = 0; i < MAXPEIXE; i++) {
      const f = peixes[i];
      if (!f.active) continue;
      // rastro de bolhas, antes do peixe (fica atrás dele no desenho)
      if (Math.random() < 0.6) {
        spawnParticle(f.x - f.vx * 0.02, f.y - f.vy * 0.02, rand(-16, 16), rand(-40, -10),
          0.35, 1.6 + Math.random() * 1.8, 'rgba(150,200,160,0.55)', -30);
      }
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);

      // nadadeira dorsal molenga
      ctx.fillStyle = '#5a6a4a';
      ctx.beginPath();
      ctx.moveTo(-f.w * 0.1, -f.h * 0.7);
      ctx.quadraticCurveTo(f.w * 0.15, -f.h * 1.5, f.w * 0.35, -f.h * 0.6);
      ctx.closePath();
      ctx.fill();

      // cauda em farrapo, torta — morta, sem força nenhuma
      ctx.fillStyle = '#5e6e50';
      ctx.beginPath();
      ctx.moveTo(-f.w, f.h * 0.1);
      ctx.quadraticCurveTo(-f.w * 1.3, -f.h * 0.6, -f.w * 1.55, -f.h * 0.75);
      ctx.lineTo(-f.w * 1.15, f.h * 0.05);
      ctx.quadraticCurveTo(-f.w * 1.35, f.h * 0.55, -f.w * 1.6, f.h * 0.85);
      ctx.closePath();
      ctx.fill();

      // corpo: barriga estufada, verde-acinzentado doentio com manchas escuras
      const g = ctx.createRadialGradient(f.w * 0.1, -f.h * 0.3, 1, 0, 0, f.w * 1.1);
      g.addColorStop(0, '#9aae7a');
      g.addColorStop(0.55, '#74865c');
      g.addColorStop(1, '#4e5a3e');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, f.w, f.h * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(40,46,30,0.4)';
      ctx.beginPath(); ctx.ellipse(-f.w * 0.2, f.h * 0.3, f.w * 0.3, f.h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(f.w * 0.3, -f.h * 0.1, f.w * 0.22, f.h * 0.22, 0, 0, Math.PI * 2); ctx.fill();

      // boca frouxa, entreaberta, pendendo
      ctx.strokeStyle = '#2a2e1e'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(f.w * 0.78, -f.h * 0.05);
      ctx.quadraticCurveTo(f.w * 0.9, f.h * 0.18, f.w * 0.76, f.h * 0.3);
      ctx.stroke();

      // OS OLHOS EM X — a assinatura: dois tracinhos cruzados de cada lado
      ctx.strokeStyle = '#1a1c14'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      const ex = f.w * 0.42, ey = -f.h * 0.25, er = 3;
      ctx.beginPath();
      ctx.moveTo(ex - er, ey - er); ctx.lineTo(ex + er, ey + er);
      ctx.moveTo(ex - er, ey + er); ctx.lineTo(ex + er, ey - er);
      ctx.stroke();

      ctx.restore();
    }

    // minas: cone de metal escuro com espigões, piscando vermelho quando armadas
    for (let i = 0; i < MAXMINA; i++) {
      const m = minas[i];
      if (!m.active) continue;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.fillStyle = '#2c2e32';
      ctx.beginPath();
      ctx.arc(0, 0, m.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#17181a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * m.r, Math.sin(ang) * m.r);
        ctx.lineTo(Math.cos(ang) * (m.r + 7), Math.sin(ang) * (m.r + 7));
        ctx.stroke();
      }
      if (m.state === 'armada') {
        const pulso = 0.4 + 0.6 * Math.abs(Math.sin(FG.engine.time * 6));
        ctx.save();
        ctx.globalAlpha = pulso;
        ctx.fillStyle = '#ff4030';
        ctx.shadowColor = '#ff4030';
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // anel do raio de dano de verdade — o estouro é bem maior que o
        // corpo da mina, então o anel é o que avisa até onde não chegar
        ctx.save();
        ctx.globalAlpha = 0.22 + 0.14 * pulso;
        ctx.strokeStyle = '#ff5a40';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 7]);
        ctx.beginPath();
        ctx.arc(0, 0, MINA_BLAST_R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = '#ffd880';
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  FG.enemies.registerBoss('francisco', boss);
})();
