// Fagulho: Lendas do Bosque — boss2.js
// Chefão da fase 2: O LODÃO. Sapo-lesma gigante de lodo, atolado na poça do
// fundo da arena e virado para a esquerda (de onde o jogador chega).
// A forma vem inteira do boss1.js — 8 de vida, 4 ataques ciclando, telegraph
// longo em todos e uma janela de dano depois de CADA um. O que muda são os
// ataques e o desenho: aqui não há sprite nenhum, tudo é canvas puro.
// A ÚNICA coisa que este arquivo faz no load é registar-se em FG.enemies
// (enemies.js vem antes no index.html); todo o resto olha para FG.* apenas
// dentro de funções chamadas em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  const GRAV = 2200;         // mesma gravidade do player

  // Efeitos e utilitários partilhados moram em enemies.js (as pools de
  // partícula são de lá). Estes atalhos são criados uma vez e só tocam em
  // FG.enemies quando chamados, para não ferir a regra de load do projeto.
  const spawnParticle = (x, y, vx, vy, life, size, color, grav) =>
    FG.enemies.fx.spawnParticle(x, y, vx, vy, life, size, color, grav);
  const goldBurst = (cx, cy, n, lumiCount) => FG.enemies.fx.goldBurst(cx, cy, n, lumiCount);
  const groundYAt = (x, yMin) => FG.enemies.fx.groundYAt(x, yMin);
  const rand = (a, b) => FG.enemies.fx.rand(a, b);

  // ==================================================================
  // GEOMETRIA — tudo em coordenadas locais, em px, relativas ao eixo do
  // bicho (boss.x) e à linha do corpo (boss.bodyY, que é o chão menos o
  // salto). x negativo é para a esquerda, na direção do jogador; y negativo
  // é para cima. Sem sprite, sem matriz: um número aqui é o mesmo número no
  // desenho e na hitbox, e por isso caixa nenhuma escapa de debaixo do bicho.
  // ==================================================================
  const BODY = { cx: 10, cy: -104, rx: 198, ry: 116 };   // corcova de lesma
  const HEAD = { cx: -196, cy: -138, rx: 126, ry: 98 };  // cabeçorra de sapo
  const EYE_L = { cx: -258, cy: -226, r: 30 };           // olho da frente
  const EYE_R = { cx: -158, cy: -244, r: 32 };           // olho de trás
  const MOUTH = { x: -300, y: -74 };                     // canto da boca

  // O ponto fraco: a papada sob o queixo. Na janela de dano ela incha de lodo
  // e AFUNDA — é isso que a traz para a altura do soco. Os dois números abaixo
  // são o coração do balanceamento e estão medidos, não chutados:
  //   centro a 100px do chão, caixa de 96 de altura  →  52..148 acima do chão.
  // O attackBox do player (34x30, no meio de um corpo de 44) cobre
  // [alturaDoPulo+7 .. alturaDoPulo+37] acima do chão, logo qualquer pulo
  // entre ~15px e ~141px acerta: o pulo simples é 118px e o pulo cortado no
  // primeiro frame é ~30px — os dois entram, que é o que o contrato exige.
  const PAPADA_X = -214;
  const PAPADA_HIGH = 156;   // altura do centro com a papada recolhida
  const PAPADA_LOW = 100;    // ... e com ela pendurada na janela de dano
  const WEAK_W = 104, WEAK_H = 96;

  // Massas que machucam no contato fora da janela. Repare que a caixa da
  // cabeça começa 60px acima do chão: o vão debaixo do queixo é de propósito,
  // é onde o jogador se planta para socar a papada.
  const HEAD_HULL = { x: -322, y: -246, w: 252, h: 186 };
  const BODY_HULL = { x: -170, y: -220, w: 380, h: 220 };

  const TONGUE_H = 30;       // língua rasteira: topo a 38px do chão
  const TONGUE_Y = 38;
  const TONGUE_REACH = 780;  // atravessa a arena inteira até o lado do jogador

  // ---------- pools do LODÃO (jorros, poças, bolhas, ondas) ----------
  // Pré-alocadas: nada de `new` por frame, e o reset() apaga todas — senão
  // sobra jorro do pântano em cena quando a fase troca.
  const MAXSPIT = 6;
  const spits = [];
  for (let i = 0; i < MAXSPIT; i++) spits.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0 });

  const MAXPOOL = 6;
  const pools = [];
  for (let i = 0; i < MAXPOOL; i++) pools.push({ active: false, x: 0, y: 0, w: 76, h: 22, t: 0 });

  const MAXBOLHA = 10;
  const bolhas = [];
  for (let i = 0; i < MAXBOLHA; i++) {
    bolhas.push({ active: false, state: 'marca', x: 0, y: 0, r: 0, groundY: 0, timer: 0, life: 0, wob: 0 });
  }

  // Duas ondas fixas: o baque solta uma para cada lado, nunca mais que isso.
  const waves = [
    { active: false, x: 0, y: 0, w: 72, h: 40, vx: -300 },
    { active: false, x: 0, y: 0, w: 72, h: 40, vx: 300 },
  ];

  const tongue = { active: false, len: 0, out: true, x: 0, y: 0 };

  // Retângulo de rascunho para testes de sobreposição (círculo → caixa).
  const _rect = { x: 0, y: 0, w: 0, h: 0 };
  function circleRect(cx, cy, r) {
    _rect.x = cx - r; _rect.y = cy - r; _rect.w = r * 2; _rect.h = r * 2;
    return _rect;
  }

  // Caixa local → caixa de mundo. `hop` já está embutido em bodyY.
  function localBox(r, box) {
    box.x = boss.x + r.x;
    box.y = boss.bodyY + r.y;
    box.w = r.w;
    box.h = r.h;
    return box;
  }

  const boss = {
    // --- identidade (o engine lê o nome para a barra de vida) ---
    id: 'lodo',
    nome: 'O LODÃO',

    // --- contrato lido pelo engine ---
    started: false,
    active: false,
    dead: false,
    hp: 8,
    maxHp: 8,

    // --- geometria (resolvida em runtime, no start/reset) ---
    homeX: 0,        // o atoleiro dele, no fundo da arena
    x: 0,            // posição atual
    groundY: 0,      // chão da arena
    bodyY: 0,        // linha do corpo = groundY - hop (sobe quando ele salta)
    hop: 0,          // altura do salto do baque
    hopV: 0,

    // --- animação / telegraphs ---
    sag: 0,          // 0..1 — papada pendurada (a janela de dano)
    puff: 0,         // 0..1 — papada inflada (telegraph da língua)
    charge: 0,       // 0..1 — goela acesa (telegraph da cusparada)
    squash: 0,       // 0..1 — agachado (telegraph do baque)
    glow: 0,         // brilho do ponto fraco na janela
    melt: 0,         // 0..1 — derretimento da morte

    // --- máquina de estados ---
    state: 'dormant', // dormant|intro|idle|cusparada|lingua|baque|bolhas|exposto|dying
    phase: 0,
    timer: 0,
    attackIndex: 0,
    stunHit: false,
    flash: 0,
    dieTimer: 0,
    victoryFired: false,

    // caixas de colisão calculadas por frame
    headBox: { x: 0, y: 0, w: 0, h: 0 },
    bodyBox: { x: 0, y: 0, w: 0, h: 0 },
    weakBox: { x: 0, y: 0, w: 0, h: 0 },

    start() {
      // Coaxo de intro + música do boss; 1.2s antes do primeiro ataque.
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
      this.groundY = groundYAt(a.x + a.w * 0.75, 300);
      // Atolado no fundo: o eixo dele fica a 230px da parede direita, o que
      // deixa a papada por volta de x-214 e a metade esquerda da arena livre
      // para o jogador desviar.
      this.homeX = a.x + a.w - 230;
      this.x = this.homeX;
      this.bodyY = this.groundY;
    },

    reset() {
      // Volta TUDO ao estado inicial (não iniciado), inclusive pools.
      this.started = false;
      this.active = false;
      this.dead = false;
      this.hp = this.maxHp;
      this.state = 'dormant';
      this.phase = 0;
      this.timer = 0;
      this.attackIndex = 0;
      this.stunHit = false;
      this.flash = 0;
      this.sag = 0;
      this.puff = 0;
      this.charge = 0;
      this.squash = 0;
      this.glow = 0;
      this.melt = 0;
      this.hop = 0;
      this.hopV = 0;
      this.dieTimer = 0;
      this.victoryFired = false;
      for (let i = 0; i < MAXSPIT; i++) spits[i].active = false;
      for (let i = 0; i < MAXPOOL; i++) pools[i].active = false;
      for (let i = 0; i < MAXBOLHA; i++) bolhas[i].active = false;
      waves[0].active = false;
      waves[1].active = false;
      tongue.active = false;
      tongue.len = 0;
    },

    isPhase2() { return this.hp <= 3; },

    // Fim de ataque: ele arqueja, a papada incha de lodo e desce até a altura
    // do soco. Vem depois de TODOS os ataques — é o que dá ritmo à luta.
    expose(dur) {
      this.state = 'exposto';
      this.timer = dur;
      this.phase = 0;
      this.stunHit = false;
    },

    // Dano no ponto fraco
    takeHit() {
      this.hp--;
      this.flash = 0.25;
      this.stunHit = true;
      FG.audio.sfx('bossHit');
      goldBurst(this.weakBox.x + this.weakBox.w / 2, this.weakBox.y + this.weakBox.h / 2, 10, 0);
      if (this.hp <= 0) {
        // Morte cinematográfica: dead=true JÁ destranca a arena e some a barra.
        this.dead = true;
        this.state = 'dying';
        this.dieTimer = 0;
        this.timer = 0;
        tongue.active = false;
      } else {
        // Recolhe a papada e volta a se acomodar no atoleiro
        this.state = 'idle';
        this.timer = this.isPhase2() ? 1.0 : 1.4;
        this.sag = 0;
      }
    },

    // Núcleo da máquina de estados. Fica separado do `update` público porque
    // está cheio de `return` antecipado — e os jorros e bolhas do LODÃO têm de
    // continuar a andar mesmo nos frames em que o corpo dele não faz nada.
    step(dt) {
      const p = FG.player;
      const ov = FG.engine.rectsOverlap;
      if (this.flash > 0) this.flash -= dt;

      // ---------- morte cinematográfica ----------
      if (this.state === 'dying') {
        this.dieTimer += dt;
        const k = this.dieTimer / 2.5;
        this.melt = Math.min(1, k);          // derrete e afunda no próprio lodo
        this.charge = Math.max(0, 0.4 - k);
        this.sag = Math.min(1, this.sag + dt * 2);
        this.puff = Math.max(0, this.puff - dt);
        this.bodyY = this.groundY;
        // lodo espirrando enquanto o bicho desmancha
        if (Math.random() < 0.6) {
          spawnParticle(this.x + rand(-260, 180), this.groundY - rand(0, 200),
            rand(-140, 140), rand(-280, -60), 0.8, 4 + Math.random() * 5, '#9fbf3a', 340);
        }
        if (this.dieTimer >= 2.5 && !this.victoryFired) {
          this.victoryFired = true;
          goldBurst(this.x - 120, this.groundY - 120, 40, 5); // estouro final + lumis
          FG.audio.sfx('victory');
          FG.engine.setState('victory');
        }
        return;
      }

      if (!this.started) return;

      // ---------- caixas vivas ----------
      // Calculadas antes de qualquer `return` para nunca ficarem velhas: o
      // ponto fraco acompanha a papada, e a papada acompanha sag/salto.
      this.bodyY = this.groundY - this.hop;
      localBox(HEAD_HULL, this.headBox);
      localBox(BODY_HULL, this.bodyBox);
      const papadaY = this.bodyY - (PAPADA_HIGH - (PAPADA_HIGH - PAPADA_LOW) * this.sag);
      this.weakBox.x = this.x + PAPADA_X - WEAK_W / 2;
      this.weakBox.y = papadaY - WEAK_H / 2;
      this.weakBox.w = WEAK_W;
      this.weakBox.h = WEAK_H;

      // ---------- intro ----------
      if (this.state === 'intro') {
        this.timer -= dt;
        this.charge = 0.5 + Math.sin(FG.engine.time * 8) * 0.2;  // coaxando
        this.puff = 0.35 + Math.sin(FG.engine.time * 8) * 0.25;
        if (this.timer <= 0) {
          this.active = true;
          this.state = 'idle';
          this.timer = 1.0;
          this.charge = 0;
          this.puff = 0;
        }
        return;
      }

      const p2 = this.isPhase2();
      const speedMul = p2 ? 0.85 : 1;   // fase 2: intervalos um pouco menores

      // ---------- máquina de estados ----------
      this.timer -= dt;

      if (this.state === 'idle') {
        // acomoda-se no atoleiro: papada recolhida, goela apagada
        this.charge += (0 - this.charge) * Math.min(1, dt * 5);
        this.puff += (0 - this.puff) * Math.min(1, dt * 5);
        this.squash += (0 - this.squash) * Math.min(1, dt * 6);
        this.sag += (0 - this.sag) * Math.min(1, dt * 6);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 4);
        this.glow = 0;
        if (this.timer <= 0) {
          // A cusparada abre o ciclo: é o ataque mais legível dos quatro.
          const attacks = ['cusparada', 'lingua', 'baque', 'bolhas'];
          this.state = attacks[this.attackIndex % 4];
          this.attackIndex++;
          this.phase = 0;
          this.timer = 0;
        }

      } else if (this.state === 'exposto') {
        // arquejando: a papada enche de lodo, desce e acende até levar o soco
        this.sag = Math.min(1, this.sag + dt * 5);
        this.charge += (0 - this.charge) * Math.min(1, dt * 6);
        this.puff += (0 - this.puff) * Math.min(1, dt * 4);
        this.squash += (0 - this.squash) * Math.min(1, dt * 6);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 3);
        this.glow = 0.6 + 0.4 * Math.sin(FG.engine.time * 12);
        // gotas escorrendo da papada, para o alvo saltar aos olhos
        if (Math.random() < 0.4) {
          spawnParticle(this.x + PAPADA_X + rand(-40, 40), this.weakBox.y + this.weakBox.h,
            rand(-20, 20), rand(20, 70), 0.5, 3.5, '#c8e86a', 500);
        }
        // soco na papada
        if (!this.stunHit && p.attackBox && p.attackBox.active && ov(p.attackBox, this.weakBox)) {
          this.takeHit();
        }
        // pisão na papada (quica)
        else if (!this.stunHit && p.vy > 0 && ov(p, this.weakBox)) {
          p.vy = -420;
          this.takeHit();
        }
        if (this.timer <= 0 && this.state === 'exposto') {
          this.state = 'idle';
          this.timer = 1.1 * speedMul;
          this.glow = 0;
        }

      } else if (this.state === 'cusparada') {
        // ---- 1. CUSPARADA DE LODO ----
        // Telegraph de 0.95s: recua a cabeça, a goela acende e ele engasga.
        // Depois solta jorros em arco que deixam poça ácida onde caem — as
        // poças ficam espaçadas de propósito, e o vão entre elas é a resposta.
        if (this.phase === 0) {
          this.phase = 1;
          this.timer = 0.95;
        } else if (this.phase === 1) {
          this.charge = Math.min(1, this.charge + dt * 1.3);
          this.x += (this.homeX + 26 - this.x) * Math.min(1, dt * 3);  // recua
          if (Math.random() < 0.35) {
            spawnParticle(this.x + MOUTH.x, this.bodyY + MOUTH.y, rand(-40, 10), rand(-70, -20),
              0.4, 3, 'rgba(190,230,90,0.85)', 200);
          }
          if (this.timer <= 0) {
            const n = p2 ? 4 : 3;   // fase 2: um jorro a mais, o vão aperta
            for (let i = 0; i < n; i++) {
              const s = this.acquireSpit();
              if (!s) break;
              s.active = true;
              s.x = this.x + MOUTH.x;
              s.y = this.bodyY + MOUTH.y;
              s.px = s.x; s.py = s.y;
              s.vx = SPITS[i].vx + rand(-12, 12);
              s.vy = SPITS[i].vy;
            }
            FG.audio.sfx('bossSpit');
            this.phase = 2;
            this.timer = 0.7;
          }
        } else if (this.phase === 2) {
          this.charge = Math.max(0, this.charge - dt * 2.5);
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }

      } else if (this.state === 'lingua') {
        // ---- 2. LAMBADA DE LÍNGUA ----
        // Telegraph de 0.95s: ele INCHA A PAPADA e treme. A língua sai reta e
        // rasteira, e o topo dela fica a 38px do chão: qualquer pulo passa por
        // cima, mas ficar parado no chão não passa.
        if (this.phase === 0) {
          this.phase = 1;
          this.timer = 0.95;
        } else if (this.phase === 1) {
          this.puff = Math.min(1, this.puff + dt * 1.5);
          this.x = this.homeX + Math.sin(FG.engine.time * 34) * 3;
          if (this.timer <= 0) {
            FG.audio.sfx('bossRoar');
            tongue.active = true;
            tongue.out = true;
            tongue.len = 0;
            this.phase = 2;
            this.timer = 2.0;   // teto de segurança; quem manda é o tongue.len
          }
        } else if (this.phase === 2) {
          // desenrola e recolhe; a papada esvazia junto com o disparo
          const outV = p2 ? 2500 : 2200;
          const inV = p2 ? 2200 : 2000;
          tongue.x = this.x + MOUTH.x;
          tongue.y = this.bodyY - TONGUE_Y;
          if (tongue.out) {
            tongue.len += outV * dt;
            this.puff = Math.max(0, this.puff - dt * 2.5);
            if (tongue.len >= TONGUE_REACH) {
              tongue.len = TONGUE_REACH;
              this.phase = 3;
              this.timer = 0.10;   // segura a língua esticada um instante
            }
          }
        } else if (this.phase === 3) {
          tongue.x = this.x + MOUTH.x;
          tongue.y = this.bodyY - TONGUE_Y;
          if (this.timer <= 0) { tongue.out = false; this.phase = 4; this.timer = 1.0; }
        } else if (this.phase === 4) {
          tongue.x = this.x + MOUTH.x;
          tongue.y = this.bodyY - TONGUE_Y;
          tongue.len -= (p2 ? 2200 : 2000) * dt;
          if (tongue.len <= 0) {
            tongue.len = 0;
            tongue.active = false;
            this.expose(2.6 * speedMul);
          }
        }

      } else if (this.state === 'baque') {
        // ---- 3. BAQUE ----
        // Telegraph de 0.9s: AGACHA E TREME. Depois salta ~160px e cai; o
        // impacto solta duas ondas rasteiras, uma para cada lado.
        if (this.phase === 0) {
          this.phase = 1;
          this.timer = 0.9;
        } else if (this.phase === 1) {
          this.squash = Math.min(1, this.squash + dt * 2);
          this.x = this.homeX + Math.sin(FG.engine.time * 46) * 4;
          if (Math.random() < 0.3) {
            spawnParticle(this.x + rand(-200, 160), this.groundY, rand(-60, 60), rand(-90, -20),
              0.35, 3.5, 'rgba(150,180,70,0.8)', 400);
          }
          if (this.timer <= 0) {
            this.x = this.homeX;
            this.hopV = 900;         // ~160px de altura, ~0.7s no ar
            this.hop = 0.01;
            this.squash = 0;
            this.phase = 2;
            this.timer = 2.0;        // teto de segurança
          }
        } else if (this.phase === 2) {
          this.hopV -= GRAV * 1.15 * dt;
          this.hop += this.hopV * dt;
          if (this.hop <= 0) {
            this.hop = 0;
            this.hopV = 0;
            FG.audio.sfx('bossRoar');
            // duas ondas, uma para cada lado, saindo de debaixo do corpanzil
            const wv = p2 ? 340 : 300;
            for (let i = 0; i < 2; i++) {
              const w = waves[i];
              w.active = true;
              w.x = this.x - 200 - w.w / 2;
              w.vx = i === 0 ? -wv : wv;
              w.y = groundYAt(w.x + w.w / 2, 300) - w.h;
            }
            for (let k = 0; k < 14; k++) {
              spawnParticle(this.x + rand(-240, 200), this.groundY, rand(-220, 220), rand(-320, -80),
                0.6, 4 + Math.random() * 4, '#8fae35', 460);
            }
            this.phase = 3;
            this.timer = 0.5;
          }
        } else if (this.phase === 3) {
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }

      } else if (this.state === 'bolhas') {
        // ---- 4. CHUVA DE BOLHAS ----
        // Telegraph: uma marca borbulhando no chão 0.9s antes de cada bolha
        // subir. Elas sobem, estouram no alto e o estouro ainda espirra.
        if (this.phase === 0) {
          const a = FG.level.arena;
          const n = p2 ? 6 : 4;
          const span = a.w - 380;    // só a metade em que o jogador se mexe
          let spawned = 0;
          for (let i = 0; i < MAXBOLHA && spawned < n; i++) {
            const b = bolhas[i];
            if (b.active) continue;
            b.active = true;
            b.state = 'marca';
            b.x = a.x + 60 + (spawned / n) * span + rand(-30, 30);
            b.groundY = groundYAt(b.x, 300);
            b.y = b.groundY;
            b.r = 26;
            b.wob = rand(0, 6.28);
            b.life = 0;
            b.timer = 0.9 + spawned * (p2 ? 0.22 : 0.30);
            spawned++;
          }
          this.charge = 0.3;
          this.phase = 1;
          this.timer = 0.9 + n * (p2 ? 0.22 : 0.30) + 0.7;
        } else if (this.phase === 1) {
          // ele borbulha pela boca enquanto o pântano ferve
          this.charge = 0.3 + 0.15 * Math.sin(FG.engine.time * 9);
          this.x = this.homeX + Math.sin(FG.engine.time * 12) * 2;
          if (this.timer <= 0) {
            this.x = this.homeX;
            this.expose(2.6 * speedMul);
          }
        }
      }

      // ---------- contato com o LODÃO ----------
      // Encostar na cabeçorra ou no corpanzil machuca. Assim que a papada
      // começa a descer (sag), tudo fica inofensivo: é justamente aí que o
      // jogador precisa se plantar debaixo do queixo para socar.
      if (this.sag <= 0.15 && (ov(p, this.headBox) || ov(p, this.bodyBox))) {
        p.hurt(1, this.x - 100);
      }
    },

    // O que o engine chama (via FG.enemies). Corpo primeiro, perigos depois.
    update(dt) {
      this.step(dt);
      // Os perigos continuam vivos durante a morte: a bolha que já estava no
      // ar não pode evaporar no frame em que o LODÃO desmancha.
      if (this.started || this.dead) updateBossStuff(dt);
    },

    draw(ctx, cam) {
      drawBoss(ctx, cam);
      drawBossStuff(ctx, cam);
    },

    acquireSpit() {
      for (let i = 0; i < MAXSPIT; i++) if (!spits[i].active) return spits[i];
      return null;
    },
  };

  // Um arco por jorro, e cada um cai num ponto diferente: com a boca a ~74px
  // do chão e gravidade de 0.75G nos jorros, estes três pousam espalhados por
  // ~250px de arena, deixando vão de sobra entre poça e poça.
  const SPITS = [
    { vx: -300, vy: -520 },
    { vx: -190, vy: -430 },
    { vx: -430, vy: -560 },
    { vx: -530, vy: -470 },   // só na fase 2
  ];

  // ---------- jorros / poças / bolhas / ondas / língua ----------
  function updateBossStuff(dt) {
    const p = FG.player;
    const ov = FG.engine.rectsOverlap;
    const a = FG.level.arena;

    // jorros de lodo (arco com gravidade; ao cair viram poça ácida)
    for (let i = 0; i < MAXSPIT; i++) {
      const s = spits[i];
      if (!s.active) continue;
      s.px = s.x; s.py = s.y;
      s.vy += GRAV * 0.75 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (Math.random() < 0.5) {
        spawnParticle(s.x, s.y, rand(-20, 20), rand(-30, 20), 0.3, 3, '#b8dc55', 120);
      }
      const gy = groundYAt(s.x, 300);
      if (s.y >= gy - 8) {
        s.active = false;
        // acende a poça ácida (1.4s: dá para esperar secar)
        for (let k = 0; k < MAXPOOL; k++) {
          const q = pools[k];
          if (q.active) continue;
          q.active = true;
          q.x = s.x - q.w / 2;
          q.y = gy - q.h;
          q.t = 1.4;
          break;
        }
      } else if (ov(p, circleRect(s.x, s.y, 11))) {
        s.active = false;
        p.hurt(1, s.x);
      }
      if (s.x < a.x - 120) s.active = false;
    }

    // poças ácidas
    for (let i = 0; i < MAXPOOL; i++) {
      const q = pools[i];
      if (!q.active) continue;
      q.t -= dt;
      if (q.t <= 0) { q.active = false; continue; }
      if (Math.random() < 0.35) {
        spawnParticle(q.x + rand(0, q.w), q.y + q.h, rand(-15, 15), rand(-80, -30), 0.35, 3.5, '#c6ee66', 0);
      }
      if (ov(p, q)) p.hurt(1, q.x + q.w / 2);
    }

    // bolhas venenosas: marca no chão → sobe → estoura
    for (let i = 0; i < MAXBOLHA; i++) {
      const b = bolhas[i];
      if (!b.active) continue;
      if (b.state === 'marca') {
        b.timer -= dt;
        if (b.timer <= 0) { b.state = 'sobe'; b.life = 2.4; b.y = b.groundY - 10; }
      } else if (b.state === 'sobe') {
        b.life -= dt;
        b.wob += dt * 3;
        b.y -= 128 * dt;
        b.x += Math.sin(b.wob) * 26 * dt;
        if (Math.random() < 0.2) {
          spawnParticle(b.x + rand(-10, 10), b.y + b.r, rand(-15, 15), rand(10, 40), 0.3, 2.5, 'rgba(190,240,110,0.7)', 0);
        }
        if (ov(p, circleRect(b.x, b.y, b.r * 0.86))) {
          b.state = 'pop'; b.timer = 0.2;
          p.hurt(1, b.x);
        } else if (b.life <= 0 || b.y < b.groundY - 300) {
          b.state = 'pop';
          b.timer = 0.2;
          for (let k = 0; k < 7; k++) {
            spawnParticle(b.x, b.y, rand(-140, 140), rand(-120, 60), 0.5, 3.5, '#b6e85a', 380);
          }
        }
      } else {
        // estouro: o respingo ainda machuca por um instante
        b.timer -= dt;
        if (b.timer <= 0) { b.active = false; continue; }
        if (ov(p, circleRect(b.x, b.y, b.r * 1.25))) p.hurt(1, b.x);
      }
    }

    // ondas rasteiras do baque (pular por cima)
    for (let i = 0; i < 2; i++) {
      const w = waves[i];
      if (!w.active) continue;
      w.x += w.vx * dt;
      w.y = groundYAt(w.x + w.w / 2, 300) - w.h;
      if (Math.random() < 0.5) {
        spawnParticle(w.x + (w.vx < 0 ? 0 : w.w), w.y + w.h, rand(-30, 30), rand(-110, -30),
          0.3, 3.5, 'rgba(170,205,80,0.85)', 320);
      }
      if (ov(p, w)) {
        w.active = false;
        p.hurt(1, w.x + w.w / 2);
      }
      if (w.x + w.w < a.x - 40 || w.x > a.x + a.w + 40) w.active = false;
    }

    // língua rasteira
    if (tongue.active && tongue.len > 4) {
      _rect.x = tongue.x - tongue.len;
      _rect.y = tongue.y - TONGUE_H / 2;
      _rect.w = tongue.len;
      _rect.h = TONGUE_H;
      if (ov(p, _rect)) p.hurt(1, tongue.x);
    }
  }

  // ==================================================================
  // DESENHO — canvas puro, sem asset nenhum. O bicho é um monte de elipses
  // de lodo: corcova de lesma atrás, cabeçorra de sapo à frente, a papada
  // pendurada sob o queixo e dois olhos bulbosos em cima.
  // ==================================================================
  function drawBoss(ctx, cam) {
    const VIEW_W = FG.enemies.fx.VIEW_W;
    const a = FG.level.arena;
    if (cam.x + VIEW_W < a.x - 200 || cam.x > a.x + a.w + 200) return;
    if (!boss.started) boss.resolveGeometry();   // dormindo, geometria já certa

    const t = FG.engine.time;
    const p2 = boss.isPhase2();
    const dying = boss.state === 'dying';
    if (dying && boss.dieTimer >= 2.5) return;   // já desmanchou

    // tremor: fase 2 sempre vibra um pouco; morrendo, muito
    let shX = 0, shY = 0;
    if (dying) { shX = rand(-4, 4); shY = rand(-3, 3); }
    else if (p2 && boss.active) { shX = rand(-1.4, 1.4); shY = rand(-1, 1); }

    // parado, respira: a corcova sobe e desce
    const breathe = (boss.active || dying) ? Math.sin(t * 2.2) * 2 : Math.sin(t * 1.5) * 4;
    const melt = boss.melt;
    const X = boss.x - cam.x + shX;
    const BY = boss.bodyY - cam.y + shY + breathe + melt * 74;
    const GY = boss.groundY - cam.y;

    // achata e alarga ao derreter; agacha no telegraph do baque
    const sqz = 1 - 0.2 * boss.squash - 0.72 * melt;
    const wide = 1 + 0.12 * boss.squash + 0.3 * melt;

    ctx.save();
    // Nada do LODÃO passa da linha do lodo: ele está ATOLADO, e o que sobraria
    // por baixo do chão fica escondido em vez de flutuar.
    ctx.beginPath();
    ctx.rect(-200, -1000, VIEW_W + 400, GY + 30 + 1000);
    ctx.clip();

    // ---- o atoleiro: poça de lodo em que ele está enfiado ----
    ctx.fillStyle = '#3b4416';
    ctx.beginPath();
    ctx.ellipse(X - 30, GY + 4, 300, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,172,60,0.35)';
    ctx.beginPath();
    ctx.ellipse(X - 30, GY - 2 + Math.sin(t * 2) * 2, 274, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(X, BY);
    ctx.scale(wide, sqz);

    const dark = p2 ? '#3c4c14' : '#4a5f22';
    const mid = p2 ? '#6f8a26' : '#7d9331';
    const lit = p2 ? '#a8c246' : '#9fb845';

    // ---- corcova de lesma (o corpanzil atrás) ----
    blob(ctx, BODY.cx, BODY.cy, BODY.rx, BODY.ry, dark, mid);
    // verrugas do lombo
    ctx.fillStyle = 'rgba(40,54,12,0.55)';
    for (let i = 0; i < 6; i++) {
      const ang = -2.5 + i * 0.36;
      ctx.beginPath();
      ctx.ellipse(BODY.cx + Math.cos(ang) * BODY.rx * 0.72,
        BODY.cy + Math.sin(ang) * BODY.ry * 0.78, 13, 9, ang, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- cabeçorra ----
    blob(ctx, HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, dark, mid);

    // ---- boca larga, atravessando a frente da cabeça ----
    ctx.strokeStyle = '#241a10';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(MOUTH.x, MOUTH.y);
    ctx.quadraticCurveTo(-220, MOUTH.y + 26, -110, MOUTH.y - 6);
    ctx.stroke();
    // goela acesa: telegraph da cusparada e das bolhas
    if (boss.charge > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(-220, MOUTH.y + 8, 2, -220, MOUTH.y + 8, 60 + 40 * boss.charge);
      g.addColorStop(0, 'rgba(220,255,150,0.9)');
      g.addColorStop(0.5, 'rgba(150,220,60,0.55)');
      g.addColorStop(1, 'rgba(90,160,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(-220, MOUTH.y + 8, 60 + 40 * boss.charge, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- papada: o ponto fraco ----
    drawPapada(ctx, t, lit);

    // ---- olhos bulbosos ----
    drawEye(ctx, EYE_L, t, p2, 0);
    drawEye(ctx, EYE_R, t, p2, 1.7);

    // ---- baba escorrendo do queixo e do lombo ----
    ctx.fillStyle = 'rgba(200,235,120,0.4)';
    for (let i = 0; i < 5; i++) {
      const dx = -300 + i * 70;
      const dy = Math.abs(Math.sin(t * 1.3 + i * 1.7)) * 26;
      ctx.beginPath();
      ctx.ellipse(dx, -34 + dy, 5, 9 + dy * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // flash ao levar dano: clarão por cima das duas massas
    if (boss.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, boss.flash * 4) * 0.5;
      ctx.fillStyle = '#e8ffb0';
      ctx.beginPath();
      ctx.ellipse(BODY.cx, BODY.cy, BODY.rx, BODY.ry, 0, 0, Math.PI * 2);
      ctx.ellipse(HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // Elipse com gradiente vertical: escura embaixo (dentro do lodo), clara em
  // cima (onde bate a luz coada do pântano). É o tijolo do bicho inteiro.
  function blob(ctx, cx, cy, rx, ry, dark, mid) {
    const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    g.addColorStop(0, mid);
    g.addColorStop(0.55, dark);
    g.addColorStop(1, '#2c360f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // brilho de lodo no alto
    ctx.fillStyle = 'rgba(210,240,140,0.16)';
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.15, cy - ry * 0.55, rx * 0.6, ry * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // A papada. Ela infla no telegraph da língua e AFUNDA na janela de dano —
  // as duas coisas são o mesmo saco, e é isso que ensina o jogador onde bater.
  function drawPapada(ctx, t, lit) {
    const cy = -(PAPADA_HIGH - (PAPADA_HIGH - PAPADA_LOW) * boss.sag);
    const rx = 56 + 16 * boss.puff + 10 * boss.sag;
    const ry = 42 + 15 * boss.puff + 12 * boss.sag;
    const wobble = Math.sin(t * (boss.puff > 0.2 ? 22 : 4)) * (1 + 2 * boss.puff);

    const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    g.addColorStop(0, lit);
    g.addColorStop(1, '#c8dc70');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(PAPADA_X, cy + wobble, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // pregas da papada
    ctx.strokeStyle = 'rgba(70,90,20,0.35)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(PAPADA_X, cy + wobble - ry * 0.3, rx * (0.45 + i * 0.22), 0.5, Math.PI - 0.5);
      ctx.stroke();
    }
    // alvo pulsando durante a janela de dano
    if (boss.glow > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const r = rx * 1.25 + Math.sin(t * 12) * 5;
      const gg = ctx.createRadialGradient(PAPADA_X, cy, r * 0.2, PAPADA_X, cy, r);
      gg.addColorStop(0, 'rgba(240,255,160,' + (0.55 * boss.glow).toFixed(3) + ')');
      gg.addColorStop(1, 'rgba(180,255,60,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(PAPADA_X, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 14);
      ctx.strokeStyle = '#f2ffb0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(PAPADA_X, cy, rx * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Olho bulboso com pupila horizontal de sapo. Na fase 2 fica alaranjado —
  // é o único aviso visual de que o bicho acelerou.
  function drawEye(ctx, e, t, p2, off) {
    const blink = Math.sin(t * 0.8 + off) > 0.985 ? 0.15 : 1;
    ctx.fillStyle = '#5d7522';
    ctx.beginPath();
    ctx.ellipse(e.cx, e.cy + 6, e.r * 1.1, e.r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p2 ? '#ffb04a' : '#ffe08a';
    ctx.beginPath();
    ctx.ellipse(e.cx, e.cy, e.r, e.r * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1206';
    ctx.beginPath();
    ctx.ellipse(e.cx - e.r * 0.2, e.cy, e.r * 0.62, e.r * 0.24 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(e.cx - e.r * 0.35, e.cy - e.r * 0.4, e.r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBossStuff(ctx, cam) {
    const t = FG.engine.time;

    // ---- língua rasteira ----
    if (tongue.active && tongue.len > 2) {
      const tx = tongue.x - cam.x, ty = tongue.y - cam.y;
      ctx.save();
      ctx.strokeStyle = '#c8506a';
      ctx.lineWidth = TONGUE_H - 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - tongue.len, ty + Math.sin(t * 30) * 3);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,170,190,0.5)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 6);
      ctx.lineTo(tx - tongue.len, ty - 6);
      ctx.stroke();
      // ponta bulbosa e babada
      ctx.fillStyle = '#e2708a';
      ctx.beginPath();
      ctx.ellipse(tx - tongue.len, ty, 18, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();

    // ---- marcas e bolhas ----
    for (let i = 0; i < MAXBOLHA; i++) {
      const b = bolhas[i];
      if (!b.active) continue;
      const bx = b.x - cam.x;
      if (b.state === 'marca') {
        // telegraph: o lodo ferve no ponto de onde a bolha vai sair
        ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 15 + i);
        ctx.fillStyle = '#2e3a0e';
        ctx.beginPath();
        ctx.ellipse(bx, b.groundY - cam.y - 4, 26, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#b6e85a';
        for (let k = 0; k < 3; k++) {
          const ph = (t * 2 + k * 0.33 + i) % 1;
          ctx.beginPath();
          ctx.arc(bx + (k - 1) * 9, b.groundY - cam.y - 4 - ph * 14, 3 * (1 - ph * 0.6), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const by = b.y - cam.y;
        const r = b.state === 'pop' ? b.r * (1.25 + (0.2 - b.timer) * 2) : b.r;
        ctx.globalAlpha = b.state === 'pop' ? Math.max(0, b.timer / 0.2) * 0.7 : 0.75;
        const g = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.3, r * 0.1, bx, by, r);
        g.addColorStop(0, 'rgba(230,255,180,0.85)');
        g.addColorStop(0.6, 'rgba(150,225,70,0.45)');
        g.addColorStop(1, 'rgba(90,160,20,0.65)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(220,255,160,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by, r * 0.98, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;

    // ---- jorros de lodo (com rastro) ----
    for (let i = 0; i < MAXSPIT; i++) {
      const s = spits[i];
      if (!s.active) continue;
      const sx = s.x - cam.x, sy = s.y - cam.y;
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#8fb92e';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.px - cam.x, s.py - cam.y);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(sx - 3, sy - 3, 2, sx, sy, 14);
      g.addColorStop(0, '#e8ffa8');
      g.addColorStop(0.6, '#9ed03a');
      g.addColorStop(1, 'rgba(80,140,20,0.7)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 13, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- poças ácidas (borbulham e secam) ----
    for (let i = 0; i < MAXPOOL; i++) {
      const q = pools[i];
      if (!q.active) continue;
      ctx.globalAlpha = Math.min(1, q.t / 0.4);
      const qx = q.x - cam.x, qy = q.y - cam.y;
      const g = ctx.createLinearGradient(0, qy, 0, qy + q.h);
      g.addColorStop(0, 'rgba(200,250,110,0.9)');
      g.addColorStop(1, 'rgba(90,150,20,0.6)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(qx, qy + q.h);
      for (let k = 0; k <= 6; k++) {
        const fx = qx + (k / 6) * q.w;
        const fh = q.h * (0.45 + 0.55 * Math.abs(Math.sin(t * 8 + k * 1.7 + i)));
        ctx.lineTo(fx, qy + q.h - fh);
      }
      ctx.lineTo(qx + q.w, qy + q.h);
      ctx.closePath();
      ctx.fill();
    }

    // ---- ondas rasteiras (crista de lodo) ----
    ctx.globalAlpha = 0.92;
    for (let i = 0; i < 2; i++) {
      const w = waves[i];
      if (!w.active) continue;
      const wx = w.x - cam.x, wy = w.y - cam.y;
      const g = ctx.createLinearGradient(0, wy, 0, wy + w.h);
      g.addColorStop(0, 'rgba(210,245,130,0.95)');
      g.addColorStop(1, 'rgba(80,120,20,0.7)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(wx, wy + w.h);
      ctx.quadraticCurveTo(wx + w.w * (w.vx < 0 ? 0.2 : 0.8), wy - 8, wx + w.w, wy + w.h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(240,255,190,0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();
  }

  // Única linha de load deste arquivo: entrega o LODÃO ao registro de chefões.
  // Quem escolhe qual entra em cena é FG.enemies.reset(), pelo bossId da fase.
  FG.enemies.registerBoss('lodo', boss);
})();
