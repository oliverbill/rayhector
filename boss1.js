// RayHector: As Aventuras do Menino-gênio — boss1.js
// Chefão da fase 1 (Parque do Terror): o ANÃOZINHO HUGO. Um anão de jardim
// zangado, baixinho e atarracado, macacão sobre camisa xadrez vermelha e
// branca, barba e cabelo ruivos cacheados, um braço erguido com um martelo
// enorme. Desenhado 100% em canvas — sem sprite nenhum, ao contrário do
// antigo Dragão Escarlate que morava neste arquivo.
// Arquitetura copiada do LODÃO (boss2.js): máquina de estados, pools de
// projétil pré-alocadas, reset() que limpa tudo, 8 de vida, 4 ataques
// ciclando com telegraph + janela de exposição depois de cada um.
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
  // anão (boss.x) e à linha do corpo (boss.bodyY = chão). x negativo é para
  // a esquerda, na direção do jogador; y negativo é para cima. Sem sprite,
  // sem matriz: um número aqui é o mesmo número no desenho e na hitbox.
  // ==================================================================
  const BODY = { cx: 0, cy: -88, rx: 100, ry: 82 };      // macacão/tronco atarracado
  const HEAD = { cx: -18, cy: -176, rx: 58, ry: 54 };    // cabeçorra redonda, virada p/ o jogador
  const EYE_L = { cx: -46, cy: -186, r: 9 };
  const EYE_R = { cx: -2, cy: -192, r: 9 };

  // Ombro do braço que segura o martelo (o braço direito dele, atrás,
  // erguido acima da cabeça no telegraph da martelada).
  const SHOULDER = { x: 54, y: -184 };
  const ARM_LEN = 92, HAMMER_SHAFT = 96, HAMMER_HEAD_R = 34;

  // Mão de onde as pedras de jardim saem arremessadas.
  const HAND = { x: 44, y: -146 };

  // O ponto fraco: o nariz/bochecha vermelha. Em pé, fica alto (fora de
  // alcance); depois de cada golpe ele arqueja e se curva, e o nariz DESCE
  // até a altura do soco. Os números abaixo são os MESMOS do LODÃO
  // (boss2.js): centro a 100px do chão, caixa de 96 de altura → 52..148
  // acima do chão. O attackBox do player (34x30, no meio de um corpo de 44)
  // cobre [alturaDoPulo+7 .. alturaDoPulo+37] acima do chão, logo qualquer
  // pulo entre ~15px e ~141px acerta: o pulo simples é 118px e o pulo
  // cortado no primeiro frame é ~30px — os dois entram.
  const NOSE_X = -70;
  const NOSE_HIGH = 156;   // altura do nariz em pé, empinado e fora de alcance
  const NOSE_LOW = 100;    // ... e curvado, na janela de dano
  const WEAK_W = 104, WEAK_H = 96;

  // Massas que machucam no contato fora da janela: cabeça e tronco.
  const HEAD_HULL = { x: -92, y: -238, w: 150, h: 122 };
  const BODY_HULL = { x: -112, y: -172, w: 224, h: 172 };

  // ---------- pools do HUGO (pedras, destroços, frutas, ondas) ----------
  // Pré-alocadas: nada de `new` por frame, e o reset() apaga todas — senão
  // sobra pedra em voo quando a fase troca.
  const MAXROCK = 6;
  const rocks = [];
  for (let i = 0; i < MAXROCK; i++) rocks.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0 });

  const MAXDEBRIS = 6;
  const debris = [];
  for (let i = 0; i < MAXDEBRIS; i++) debris.push({ active: false, x: 0, y: 0, w: 74, h: 22, t: 0 });

  const MAXFRUIT = 8;
  const fruits = [];
  for (let i = 0; i < MAXFRUIT; i++) {
    fruits.push({ active: false, state: 'shadow', x: 0, y: 0, w: 24, h: 26, vy: 0, timer: 0, groundY: 0, kind: 0 });
  }

  // Duas ondas de choque fixas: a martelada solta uma para cada lado.
  const waves = [
    { active: false, x: 0, y: 0, w: 70, h: 36, vx: -320 },
    { active: false, x: 0, y: 0, w: 70, h: 36, vx: 320 },
  ];

  // Retângulo de rascunho para testes de sobreposição (círculo → caixa).
  const _rect = { x: 0, y: 0, w: 0, h: 0 };
  function circleRect(cx, cy, r) {
    _rect.x = cx - r; _rect.y = cy - r; _rect.w = r * 2; _rect.h = r * 2;
    return _rect;
  }

  // Caixa local → caixa de mundo.
  function localBox(r, box) {
    box.x = boss.x + r.x;
    box.y = boss.bodyY + r.y;
    box.w = r.w;
    box.h = r.h;
    return box;
  }

  const boss = {
    // --- identidade (o engine lê o nome para a barra de vida) ---
    id: 'hugo',
    nome: 'ANÃOZINHO HUGO',

    // --- contrato lido pelo engine ---
    started: false,
    active: false,
    dead: false,
    hp: 8,
    maxHp: 8,

    // --- geometria (resolvida em runtime, no start/reset) ---
    homeX: 0,        // o posto dele na arena
    x: 0,            // posição atual
    groundY: 0,      // chão da arena
    bodyY: 0,        // linha do corpo (= groundY, ele não pula)

    // --- animação / telegraphs ---
    bent: 0,         // 0..1 — curvado ofegante (a janela de dano)
    raise: 0,        // 0..1 — martelo erguido (telegraph da martelada)
    charge: 0,       // 0..1 — recuo/tensão (telegraph de pedras/investida)
    glow: 0,         // brilho do ponto fraco na janela
    dieScale: 1,      // encolhimento na morte
    poof: 0,          // nuvenzinha de fumaça crescendo na morte

    // --- máquina de estados ---
    state: 'dormant', // dormant|intro|idle|martelada|pedras|investida|chuva|exposto|dying
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
      // Berro de intro + música do boss; 1.2s antes do primeiro ataque.
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
      // Perto da parede direita, deixando o resto da arena livre pro jogador.
      this.homeX = a.x + a.w - 160;
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
      this.bent = 0;
      this.raise = 0;
      this.charge = 0;
      this.glow = 0;
      this.dieScale = 1;
      this.poof = 0;
      this.dieTimer = 0;
      this.victoryFired = false;
      for (let i = 0; i < MAXROCK; i++) rocks[i].active = false;
      for (let i = 0; i < MAXDEBRIS; i++) debris[i].active = false;
      for (let i = 0; i < MAXFRUIT; i++) fruits[i].active = false;
      waves[0].active = false;
      waves[1].active = false;
    },

    isPhase2() { return this.hp <= 3; },

    // Fim de ataque: ele arqueja e se curva, o nariz desce até a altura do
    // soco. Vem depois de TODOS os ataques — é o que dá ritmo à luta.
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
      } else {
        // Levanta o busto, o nariz recolhe
        this.state = 'idle';
        this.timer = this.isPhase2() ? 1.0 : 1.4;
        this.bent = 0;
      }
    },

    // Núcleo da máquina de estados. Fica separado do `update` público porque
    // está cheio de `return` antecipado — e as pedras/frutas do Hugo têm de
    // continuar a andar mesmo nos frames em que o corpo dele não faz nada.
    step(dt) {
      const p = FG.player;
      const ov = FG.engine.rectsOverlap;
      if (this.flash > 0) this.flash -= dt;

      // ---------- morte cinematográfica ----------
      if (this.state === 'dying') {
        this.dieTimer += dt;
        const k = this.dieTimer / 2.5;
        this.dieScale = Math.max(0.05, 1 - k * 0.95);   // encolhe até quase sumir
        this.poof = Math.min(1, k * 1.4);                // nuvem de fumaça cresce
        this.charge = Math.max(0, 0.3 - k);
        this.raise = Math.max(0, this.raise - dt * 2);
        this.bodyY = this.groundY;
        // poeira/confete de abóbora enquanto ele encolhe
        if (Math.random() < 0.6) {
          spawnParticle(this.x + rand(-90, 90), this.groundY - rand(0, 180),
            rand(-140, 140), rand(-260, -60), 0.8, 4 + Math.random() * 5, '#ff9a3c', 300);
        }
        if (this.dieTimer >= 2.5 && !this.victoryFired) {
          this.victoryFired = true;
          goldBurst(this.x - 40, this.groundY - 100, 40, 5); // estouro final + lumis
          FG.audio.sfx('victory');
          FG.engine.setState('victory');
        }
        return;
      }

      if (!this.started) return;

      // ---------- caixas vivas ----------
      // Calculadas antes de qualquer `return` para nunca ficarem velhas: o
      // ponto fraco acompanha o quanto ele está curvado (bent).
      this.bodyY = this.groundY;
      localBox(HEAD_HULL, this.headBox);
      localBox(BODY_HULL, this.bodyBox);
      const noseY = -(NOSE_HIGH - (NOSE_HIGH - NOSE_LOW) * this.bent);
      this.weakBox.x = this.x + NOSE_X - WEAK_W / 2;
      this.weakBox.y = this.bodyY + noseY - WEAK_H / 2;
      this.weakBox.w = WEAK_W;
      this.weakBox.h = WEAK_H;

      // ---------- intro ----------
      if (this.state === 'intro') {
        this.timer -= dt;
        this.charge = 0.5 + Math.sin(FG.engine.time * 8) * 0.2;  // bufando de raiva
        this.raise = 0.3 + Math.sin(FG.engine.time * 6) * 0.2;
        if (this.timer <= 0) {
          this.active = true;
          this.state = 'idle';
          this.timer = 1.0;
          this.charge = 0;
          this.raise = 0;
        }
        return;
      }

      const p2 = this.isPhase2();
      const speedMul = p2 ? 0.85 : 1;   // fase 2: intervalos um pouco menores

      // ---------- máquina de estados ----------
      this.timer -= dt;

      if (this.state === 'idle') {
        // busto erguido, martelo baixo, parado no posto
        this.charge += (0 - this.charge) * Math.min(1, dt * 5);
        this.raise += (0 - this.raise) * Math.min(1, dt * 5);
        this.bent += (0 - this.bent) * Math.min(1, dt * 6);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 4);
        this.glow = 0;
        if (this.timer <= 0) {
          // A martelada abre o ciclo: é o ataque mais legível dos quatro.
          const attacks = ['martelada', 'pedras', 'investida', 'chuva'];
          this.state = attacks[this.attackIndex % 4];
          this.attackIndex++;
          this.phase = 0;
          this.timer = 0;
        }

      } else if (this.state === 'exposto') {
        // arquejando: curvado, nariz vermelho pulsando até levar o soco
        this.bent = Math.min(1, this.bent + dt * 5);
        this.charge += (0 - this.charge) * Math.min(1, dt * 6);
        this.raise += (0 - this.raise) * Math.min(1, dt * 4);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 3);
        this.glow = 0.6 + 0.4 * Math.sin(FG.engine.time * 12);
        // suor/bufos escorrendo enquanto arqueja
        if (Math.random() < 0.35) {
          spawnParticle(this.x + NOSE_X + rand(-20, 20), this.weakBox.y + this.weakBox.h,
            rand(-20, 20), rand(20, 60), 0.45, 3, 'rgba(255,220,180,0.8)', 400);
        }
        // soco no nariz
        if (!this.stunHit && p.attackBox && p.attackBox.active && ov(p.attackBox, this.weakBox)) {
          this.takeHit();
        }
        // pisão no nariz (quica)
        else if (!this.stunHit && p.vy > 0 && ov(p, this.weakBox)) {
          p.vy = -420;
          this.takeHit();
        }
        if (this.timer <= 0 && this.state === 'exposto') {
          this.state = 'idle';
          this.timer = 1.1 * speedMul;
          this.glow = 0;
        }

      } else if (this.state === 'martelada') {
        // ---- 1. MARTELADA ----
        // Telegraph de 0.9s: ergue o martelo bem alto (avisa óbvio) e depois
        // bate no chão, soltando uma onda de choque rasteira pros dois lados
        // — pular por cima.
        if (this.phase === 0) {
          this.phase = 1;
          this.timer = 0.9;
        } else if (this.phase === 1) {
          this.raise = Math.min(1, this.raise + dt * 1.6);
          this.charge = Math.min(1, this.charge + dt * 1.1);
          this.x = this.homeX + Math.sin(FG.engine.time * 30) * 3;
          if (this.timer <= 0) {
            FG.audio.sfx('bossRoar');
            // duas ondas, uma para cada lado, saindo de debaixo dele
            const wv = p2 ? 360 : 320;
            for (let i = 0; i < 2; i++) {
              const w = waves[i];
              w.active = true;
              w.x = this.x - 170 - w.w / 2;
              w.vx = i === 0 ? -wv : wv;
              w.y = groundYAt(w.x + w.w / 2, 300) - w.h;
            }
            for (let k = 0; k < 14; k++) {
              spawnParticle(this.x + rand(-160, 60), this.groundY, rand(-220, 220), rand(-320, -80),
                0.6, 4 + Math.random() * 4, '#8a6a4a', 460);
            }
            this.phase = 2;
            this.timer = 0.5;
          }
        } else if (this.phase === 2) {
          // martelo desce rápido de volta e a poeira baixa
          this.raise = Math.max(0, this.raise - dt * 6);
          this.charge = Math.max(0, this.charge - dt * 3);
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }

      } else if (this.state === 'pedras') {
        // ---- 2. ARREMESSO DE PEDRAS DE JARDIM ----
        // Telegraph de 0.95s: agacha, arranca uma pedra/gnomo do chão e
        // arremessa em arco — cai e deixa um montinho de destroços.
        if (this.phase === 0) {
          this.phase = 1;
          this.timer = 0.95;
        } else if (this.phase === 1) {
          this.charge = Math.min(1, this.charge + dt * 1.3);
          this.x += (this.homeX + 24 - this.x) * Math.min(1, dt * 3);  // recua
          if (Math.random() < 0.3) {
            spawnParticle(this.x + HAND.x, this.bodyY + HAND.y, rand(-30, 30), rand(-60, -10),
              0.35, 3, 'rgba(140,110,80,0.85)', 200);
          }
          if (this.timer <= 0) {
            const n = p2 ? 4 : 3;   // fase 2: uma pedra a mais, o vão aperta
            for (let i = 0; i < n; i++) {
              const s = this.acquireRock();
              if (!s) break;
              s.active = true;
              s.x = this.x + HAND.x;
              s.y = this.bodyY + HAND.y;
              s.px = s.x; s.py = s.y;
              s.vx = ROCK_ARCS[i].vx + rand(-12, 12);
              s.vy = ROCK_ARCS[i].vy;
            }
            FG.audio.sfx('bossSpit');
            this.phase = 2;
            this.timer = 0.7;
          }
        } else if (this.phase === 2) {
          this.charge = Math.max(0, this.charge - dt * 2.5);
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }

      } else if (this.state === 'investida') {
        const a = FG.level.arena;
        // ---- 3. INVESTIDA ----
        // Telegraph de 1.0s: agacha de cabeça baixa. Depois corre atarracado
        // até o outro lado da arena e volta — encostar nele machuca (regra
        // de contato normal, corpo/cabeça não estão na janela de exposição).
        if (this.phase === 0) {
          this.phase = 1;
          this.timer = 1.0;
        } else if (this.phase === 1) {
          this.charge = Math.min(1, this.charge + dt * 1.2);
          this.x = this.homeX + Math.sin(FG.engine.time * 34) * 3;
          if (this.timer <= 0) { this.phase = 2; this.timer = 0.65; }
        } else if (this.phase === 2) {
          const targetX = a.x + 150;
          this.x += (targetX - this.x) * Math.min(1, dt * (p2 ? 6 : 5));
          this.charge = Math.max(0, this.charge - dt * 1.6);
          if (this.timer <= 0) { this.phase = 3; this.timer = 0.5; }
        } else if (this.phase === 3) {
          this.x += (this.homeX - this.x) * Math.min(1, dt * 4);
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }

      } else if (this.state === 'chuva') {
        // ---- 4. CHUVA DE PINHAS E MAÇÃS ----
        // Sombras avisam no chão ~0.8s antes de cada fruto cair — mesmo
        // padrão da antiga chuva de dentes do dragão.
        if (this.phase === 0) {
          const a = FG.level.arena;
          const n = p2 ? 6 : 4;
          const span = a.w - 360;
          let spawned = 0;
          for (let i = 0; i < MAXFRUIT && spawned < n; i++) {
            const f = fruits[i];
            if (f.active) continue;
            f.active = true;
            f.state = 'shadow';
            f.kind = Math.random() < 0.5 ? 0 : 1;   // 0 = pinha, 1 = maçã
            f.w = f.kind === 0 ? 20 : 24;
            f.h = f.kind === 0 ? 30 : 24;
            f.x = a.x + 50 + (spawned / n) * span + rand(-30, 30);
            f.groundY = groundYAt(f.x + f.w / 2, 300);
            f.y = f.groundY - 520;
            f.vy = 0;
            f.timer = 0.8 + spawned * (p2 ? 0.22 : 0.32);
            spawned++;
          }
          this.charge = 0.3;
          this.phase = 1;
          this.timer = 0.8 + n * (p2 ? 0.22 : 0.32) + 0.6;
        } else if (this.phase === 1) {
          // sacode os ombros enquanto os frutos caem
          this.charge = 0.3 + 0.15 * Math.sin(FG.engine.time * 9);
          this.x = this.homeX + Math.sin(FG.engine.time * 14) * 2;
          if (this.timer <= 0) {
            this.x = this.homeX;
            this.expose(2.6 * speedMul);
          }
        }
      }

      // ---------- contato com o HUGO ----------
      // Encostar na cabeça ou no tronco machuca. Assim que ele começa a se
      // curvar (bent), tudo fica inofensivo: é justamente aí que o jogador
      // precisa chegar perto para socar o nariz.
      if (this.bent <= 0.15 && (ov(p, this.headBox) || ov(p, this.bodyBox))) {
        p.hurt(1, this.x - 60);
      }
    },

    // O que o engine chama (via FG.enemies). Corpo primeiro, perigos depois.
    update(dt) {
      this.step(dt);
      // Os perigos continuam vivos durante a morte: uma pedra que já estava
      // no ar não pode evaporar no frame em que o Hugo desaparece na fumaça.
      if (this.started || this.dead) updateBossStuff(dt);
    },

    draw(ctx, cam) {
      drawBoss(ctx, cam);
      drawBossStuff(ctx, cam);
    },

    acquireRock() {
      for (let i = 0; i < MAXROCK; i++) if (!rocks[i].active) return rocks[i];
      return null;
    },
  };

  // Um arco por pedra, e cada uma cai num ponto diferente — os MESMOS quatro
  // arcos usados pelo Dragão Escarlate/LODÃO nesta engine, já validados: com
  // vão de sobra entre pedra e pedra.
  const ROCK_ARCS = [
    { vx: -300, vy: -520 },
    { vx: -190, vy: -430 },
    { vx: -430, vy: -560 },
    { vx: -530, vy: -470 },   // só na fase 2
  ];

  // ---------- pedras / destroços / frutas / ondas ----------
  function updateBossStuff(dt) {
    const p = FG.player;
    const ov = FG.engine.rectsOverlap;
    const a = FG.level.arena;

    // pedras de jardim (arco com gravidade; ao cair viram monte de destroços)
    for (let i = 0; i < MAXROCK; i++) {
      const s = rocks[i];
      if (!s.active) continue;
      s.px = s.x; s.py = s.y;
      s.vy += GRAV * 0.75 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (Math.random() < 0.4) {
        spawnParticle(s.x, s.y, rand(-15, 15), rand(-20, 15), 0.25, 2.5, '#8a7a68', 120);
      }
      const gy = groundYAt(s.x, 300);
      if (s.y >= gy - 8) {
        s.active = false;
        // monte de destroços (1.3s: dá para desviar/esperar sumir)
        for (let k = 0; k < MAXDEBRIS; k++) {
          const q = debris[k];
          if (q.active) continue;
          q.active = true;
          q.x = s.x - q.w / 2;
          q.y = gy - q.h;
          q.t = 1.3;
          break;
        }
      } else if (ov(p, circleRect(s.x, s.y, 12))) {
        s.active = false;
        p.hurt(1, s.x);
      }
      if (s.x < a.x - 120) s.active = false;
    }

    // montes de destroços (pedra + tijolo, machucam por um instante)
    for (let i = 0; i < MAXDEBRIS; i++) {
      const q = debris[i];
      if (!q.active) continue;
      q.t -= dt;
      if (q.t <= 0) { q.active = false; continue; }
      if (Math.random() < 0.25) {
        spawnParticle(q.x + rand(0, q.w), q.y, rand(-15, 15), rand(-60, -20), 0.3, 3, 'rgba(140,120,100,0.8)', 300);
      }
      if (ov(p, q)) p.hurt(1, q.x + q.w / 2);
    }

    // chuva de pinhas/maçãs: sombra → cai → some no chão
    for (let i = 0; i < MAXFRUIT; i++) {
      const f = fruits[i];
      if (!f.active) continue;
      if (f.state === 'shadow') {
        f.timer -= dt;
        if (f.timer <= 0) { f.state = 'fall'; f.vy = 60; }
      } else {
        f.vy += GRAV * 1.05 * dt;
        f.y += f.vy * dt;
        if (ov(p, f)) {
          f.active = false;
          p.hurt(1, f.x + f.w / 2);
          continue;
        }
        if (f.y + f.h >= f.groundY) {
          f.active = false;
          for (let k = 0; k < 4; k++) {
            spawnParticle(f.x + f.w / 2, f.groundY, rand(-70, 70), rand(-120, -30), 0.35, 3.5,
              f.kind === 0 ? 'rgba(120,80,50,0.8)' : 'rgba(200,50,40,0.8)', 400);
          }
        }
      }
    }

    // ondas de choque rasteiras da martelada (pular por cima)
    for (let i = 0; i < 2; i++) {
      const w = waves[i];
      if (!w.active) continue;
      w.x += w.vx * dt;
      w.y = groundYAt(w.x + w.w / 2, 300) - w.h;
      if (Math.random() < 0.5) {
        spawnParticle(w.x + (w.vx < 0 ? 0 : w.w), w.y + w.h, rand(-30, 30), rand(-110, -30),
          0.3, 3.5, 'rgba(150,120,90,0.85)', 320);
      }
      if (ov(p, w)) {
        w.active = false;
        p.hurt(1, w.x + w.w / 2);
      }
      if (w.x + w.w < a.x - 40 || w.x > a.x + a.w + 40) w.active = false;
    }
  }

  // ==================================================================
  // DESENHO — canvas puro, sem asset nenhum. O bicho é um monte de elipses:
  // tronco atarracado com macacão sobre camisa xadrez, cabeçorra redonda com
  // barba e cabelo ruivo cacheado, um braço erguido segurando um martelo.
  // ==================================================================
  function drawBoss(ctx, cam) {
    const VIEW_W = FG.enemies.fx.VIEW_W;
    const a = FG.level.arena;
    if (cam.x + VIEW_W < a.x - 200 || cam.x > a.x + a.w + 200) return;
    if (!boss.started) boss.resolveGeometry();   // dormindo, geometria já certa

    const t = FG.engine.time;
    const p2 = boss.isPhase2();
    const dying = boss.state === 'dying';
    if (dying && boss.dieTimer >= 2.5) return;   // já sumiu na fumaça

    // tremor: fase 2 sempre vibra um pouco; morrendo, muito
    let shX = 0, shY = 0;
    if (dying) { shX = rand(-3, 3); shY = rand(-2, 2); }
    else if (p2 && boss.active) { shX = rand(-1.2, 1.2); shY = rand(-1, 1); }

    // parado, respira: o peito sobe e desce
    const breathe = (boss.active || dying) ? Math.sin(t * 2.4) * 1.6 : Math.sin(t * 1.6) * 3;
    const sc = boss.dieScale;
    const X = boss.x - cam.x + shX;
    const BY = boss.bodyY - cam.y + shY + breathe;
    const GY = boss.groundY - cam.y;

    ctx.save();
    // Nada do Hugo passa da linha do chão.
    ctx.beginPath();
    ctx.rect(-200, -1000, VIEW_W + 400, GY + 30 + 1000);
    ctx.clip();

    // ---- sombra de contato no chão ----
    ctx.fillStyle = 'rgba(10,6,4,0.35)';
    ctx.beginPath();
    ctx.ellipse(X - 10, GY + 4, 118 * sc, 20 * sc, 0, 0, Math.PI * 2);
    ctx.fill();

    // ---- nuvenzinha de fumaça crescendo na morte ----
    if (dying && boss.poof > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, boss.poof);
      const g = ctx.createRadialGradient(X - 20, BY - 80, 4, X - 20, BY - 80, 60 + boss.poof * 140);
      g.addColorStop(0, 'rgba(200,200,210,0.7)');
      g.addColorStop(0.6, 'rgba(150,150,165,0.35)');
      g.addColorStop(1, 'rgba(150,150,165,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(X - 20, BY - 80, 60 + boss.poof * 140, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.translate(X, BY);
    ctx.scale(sc, sc);

    // ---- pernas curtas/botas ----
    ctx.fillStyle = '#241a14';
    ctx.fillRect(-52, -34, 34, 34);
    ctx.fillRect(6, -34, 34, 34);

    // ---- tronco: macacão jeans com peito de camisa xadrez ----
    blob(ctx, BODY.cx, BODY.cy, BODY.rx, BODY.ry, '#1c3350', '#2c4a6b');
    drawPlaid(ctx, -6, BODY.cy - 6, 54, 58);
    // alças do macacão
    ctx.strokeStyle = '#16283f';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-40, BODY.cy + 30);
    ctx.lineTo(-30, BODY.cy - BODY.ry - 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(38, BODY.cy + 30);
    ctx.lineTo(30, BODY.cy - BODY.ry - 4);
    ctx.stroke();
    // botão dourado de cada alça
    ctx.fillStyle = '#e0b84a';
    ctx.beginPath(); ctx.arc(-30, BODY.cy - BODY.ry + 6, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(30, BODY.cy - BODY.ry + 6, 6, 0, Math.PI * 2); ctx.fill();

    // ---- braço parado (esquerdo, do lado do jogador) ----
    ctx.strokeStyle = '#c88a5a';
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-72, BODY.cy - 20);
    ctx.quadraticCurveTo(-104, BODY.cy + 10, -96, BODY.cy + 46);
    ctx.stroke();

    // ---- cabeça ----
    blob(ctx, HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, '#a8613a', '#c88a5a');

    // cabelo/barba ruivos cacheados
    drawHair(ctx, t);

    // ---- olhos zangados ----
    drawEye(ctx, EYE_L, t);
    drawEye(ctx, EYE_R, t);
    // sobrancelhas franzidas
    ctx.strokeStyle = '#6a2a12';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(EYE_L.cx - 14, EYE_L.cy - 14);
    ctx.lineTo(EYE_L.cx + 10, EYE_L.cy - 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(EYE_R.cx - 10, EYE_R.cy - 6);
    ctx.lineTo(EYE_R.cx + 14, EYE_R.cy - 14);
    ctx.stroke();

    // ---- nariz: o ponto fraco ----
    drawNose(ctx, t);

    // ---- braço erguido + martelo ----
    drawArmHammer(ctx, t);

    // flash ao levar dano
    if (boss.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, boss.flash * 4) * 0.5;
      ctx.fillStyle = '#ffe8c0';
      ctx.beginPath();
      ctx.ellipse(BODY.cx, BODY.cy, BODY.rx, BODY.ry, 0, 0, Math.PI * 2);
      ctx.ellipse(HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
    ctx.restore();
  }

  // Elipse com gradiente vertical, usada como o tijolo do corpo/cabeça.
  function blob(ctx, cx, cy, rx, ry, dark, mid) {
    const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    g.addColorStop(0, mid);
    g.addColorStop(0.6, dark);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.2, cy - ry * 0.5, rx * 0.5, ry * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Xadrez vermelho e branco da camisa, espiando por cima do macacão.
  function drawPlaid(ctx, cx, cy, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, w, h, 0, Math.PI, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(cx - w, cy - h, w * 2, h * 2);
    ctx.strokeStyle = '#b81c1c';
    ctx.lineWidth = 6;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - w, cy + i * 14);
      ctx.lineTo(cx + w, cy + i * 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + i * 14, cy - h);
      ctx.lineTo(cx + i * 14, cy + h);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Cabelo e barba ruivos cacheados — uma coroa de cachos em volta da
  // cabeça e uma barbicha farta pendurada no queixo.
  function drawHair(ctx, t) {
    ctx.fillStyle = '#c8481e';
    // cachos em volta da cabeça
    const n = 9;
    for (let i = 0; i < n; i++) {
      const ang = Math.PI * 0.15 + (i / (n - 1)) * Math.PI * 1.05;
      const cx = HEAD.cx + Math.cos(ang) * (HEAD.rx + 6);
      const cy = HEAD.cy - HEAD.ry * 0.25 + Math.sin(ang) * (HEAD.ry + 10);
      const r = 15 + (i % 3) * 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // barba farta cobrindo o queixo e descendo pro peito
    ctx.fillStyle = '#b83e18';
    ctx.beginPath();
    ctx.moveTo(HEAD.cx - HEAD.rx * 0.75, HEAD.cy + HEAD.ry * 0.2);
    ctx.quadraticCurveTo(HEAD.cx - 30, HEAD.cy + HEAD.ry * 1.9, HEAD.cx - 4, HEAD.cy + HEAD.ry * 2.15);
    ctx.quadraticCurveTo(HEAD.cx + 26, HEAD.cy + HEAD.ry * 1.9, HEAD.cx + HEAD.rx * 0.65, HEAD.cy + HEAD.ry * 0.25);
    ctx.quadraticCurveTo(HEAD.cx, HEAD.cy + HEAD.ry * 0.75, HEAD.cx - HEAD.rx * 0.75, HEAD.cy + HEAD.ry * 0.2);
    ctx.closePath();
    ctx.fill();
    // cachinhos na ponta da barba
    ctx.fillStyle = '#c8481e';
    for (let i = 0; i < 3; i++) {
      const bx = HEAD.cx - 18 + i * 18;
      const wob = Math.sin(t * 2 + i) * 2;
      ctx.beginPath();
      ctx.arc(bx + wob, HEAD.cy + HEAD.ry * 2.1, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEye(ctx, e, t) {
    const blink = Math.sin(t * 0.7 + e.cx) > 0.985 ? 0.15 : 1;
    ctx.fillStyle = '#fff2e0';
    ctx.beginPath();
    ctx.ellipse(e.cx, e.cy, e.r, e.r * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1206';
    ctx.beginPath();
    ctx.arc(e.cx, e.cy, e.r * 0.5 * blink, 0, Math.PI * 2);
    ctx.fill();
  }

  // O nariz vermelho e bochechudo — o ponto fraco. Incha e ACENDE na janela
  // de dano, e é isso que ensina o jogador onde bater.
  function drawNose(ctx, t) {
    const cy = -(NOSE_HIGH - (NOSE_HIGH - NOSE_LOW) * boss.bent);
    const r = 20 + 6 * boss.bent;
    ctx.fillStyle = boss.glow > 0 ? '#ff5030' : '#d9563a';
    ctx.beginPath();
    ctx.arc(NOSE_X, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(NOSE_X - r * 0.3, cy - r * 0.3, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // alvo pulsando durante a janela de dano
    if (boss.glow > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rr = r * 2.1 + Math.sin(t * 12) * 4;
      const gg = ctx.createRadialGradient(NOSE_X, cy, rr * 0.2, NOSE_X, cy, rr);
      gg.addColorStop(0, 'rgba(255,170,120,' + (0.55 * boss.glow).toFixed(3) + ')');
      gg.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(NOSE_X, cy, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 14);
      ctx.strokeStyle = '#ffd8a0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(NOSE_X, cy, r * 1.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Braço erguido segurando o martelo: `raise` vai de 0 (descansando ao
  // lado do corpo) a 1 (bem alto acima da cabeça, telegraph da martelada).
  function drawArmHammer(ctx, t) {
    const restAng = 0.62 * Math.PI;    // braço caído, martelo apontando pro chão
    const upAng = -0.58 * Math.PI;     // braço erguido, martelo acima da cabeça
    const ang = restAng + (upAng - restAng) * boss.raise;
    const sx = SHOULDER.x, sy = SHOULDER.y;
    const ex = sx + Math.cos(ang) * ARM_LEN;
    const ey = sy + Math.sin(ang) * ARM_LEN;
    const hx = ex + Math.cos(ang) * HAMMER_SHAFT;
    const hy = ey + Math.sin(ang) * HAMMER_SHAFT;

    // braço
    ctx.strokeStyle = '#c88a5a';
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // cabo do martelo (prateado)
    ctx.strokeStyle = '#c4c8d0';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(hx, hy);
    ctx.stroke();

    // marreta na ponta (vermelha com friso prateado)
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang + Math.PI / 2);
    const hg = ctx.createLinearGradient(-HAMMER_HEAD_R, 0, HAMMER_HEAD_R, 0);
    hg.addColorStop(0, '#8a1616');
    hg.addColorStop(0.5, '#d43030');
    hg.addColorStop(1, '#8a1616');
    ctx.fillStyle = hg;
    ctx.fillRect(-HAMMER_HEAD_R, -18, HAMMER_HEAD_R * 2, 36);
    ctx.strokeStyle = '#c4c8d0';
    ctx.lineWidth = 4;
    ctx.strokeRect(-HAMMER_HEAD_R, -18, HAMMER_HEAD_R * 2, 36);
    ctx.restore();

    // brilho de tensão no cabo quando ele está prestes a bater
    if (boss.charge > 0.3 && boss.raise > 0.7) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4 * boss.charge * Math.abs(Math.sin(t * 16));
      ctx.strokeStyle = '#fff2c0';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBossStuff(ctx, cam) {
    const t = FG.engine.time;

    ctx.save();

    // ---- sombras (telegraph) e frutos caindo ----
    for (let i = 0; i < MAXFRUIT; i++) {
      const f = fruits[i];
      if (!f.active) continue;
      const fx = f.x - cam.x;
      if (f.state === 'shadow') {
        ctx.save();
        const pulse = 0.35 + 0.25 * Math.sin(t * 14 + i);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#100a06';
        ctx.beginPath();
        ctx.ellipse(fx + f.w / 2, f.groundY - cam.y - 4, 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        const fy = f.y - cam.y;
        ctx.save();
        ctx.translate(fx + f.w / 2, fy + f.h / 2);
        if (f.kind === 0) {
          // pinha: oval marrom com escamas
          ctx.fillStyle = '#6b4a2a';
          ctx.beginPath();
          ctx.ellipse(0, 0, f.w / 2, f.h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(40,26,14,0.6)';
          ctx.lineWidth = 1.5;
          for (let k = -1; k <= 1; k++) {
            ctx.beginPath();
            ctx.moveTo(-f.w / 2, k * 6);
            ctx.lineTo(f.w / 2, k * 6);
            ctx.stroke();
          }
        } else {
          // maçã vermelha com cabinho
          ctx.fillStyle = '#c8202a';
          ctx.beginPath();
          ctx.arc(0, 2, f.w / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.beginPath();
          ctx.arc(-f.w * 0.2, -2, f.w * 0.18, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#3a2410';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -f.h / 2 + 2);
          ctx.lineTo(2, -f.h / 2 - 4);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    ctx.globalAlpha = 1;

    // ---- pedras de jardim (com rastro) ----
    for (let i = 0; i < MAXROCK; i++) {
      const s = rocks[i];
      if (!s.active) continue;
      const sx = s.x - cam.x, sy = s.y - cam.y;
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#6b5a48';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.px - cam.x, s.py - cam.y);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#7a6a58';
      ctx.beginPath();
      ctx.arc(sx, sy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(sx - 3, sy - 3, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- montes de destroços ----
    for (let i = 0; i < MAXDEBRIS; i++) {
      const q = debris[i];
      if (!q.active) continue;
      ctx.globalAlpha = Math.min(1, q.t / 0.4);
      const qx = q.x - cam.x, qy = q.y - cam.y;
      ctx.fillStyle = '#5c4c3c';
      ctx.beginPath();
      ctx.moveTo(qx, qy + q.h);
      for (let k = 0; k <= 6; k++) {
        const px = qx + (k / 6) * q.w;
        const ph = q.h * (0.4 + 0.5 * Math.abs(Math.sin(k * 1.9 + i)));
        ctx.lineTo(px, qy + q.h - ph);
      }
      ctx.lineTo(qx + q.w, qy + q.h);
      ctx.closePath();
      ctx.fill();
    }

    // ---- ondas de choque (crista de terra) ----
    ctx.globalAlpha = 0.92;
    for (let i = 0; i < 2; i++) {
      const w = waves[i];
      if (!w.active) continue;
      const wx = w.x - cam.x, wy = w.y - cam.y;
      const g = ctx.createLinearGradient(0, wy, 0, wy + w.h);
      g.addColorStop(0, 'rgba(150,120,90,0.95)');
      g.addColorStop(1, 'rgba(70,54,38,0.7)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(wx, wy + w.h);
      ctx.quadraticCurveTo(wx + w.w * (w.vx < 0 ? 0.2 : 0.8), wy - 8, wx + w.w, wy + w.h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,170,130,0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();
  }

  // Única linha de load deste arquivo: entrega o HUGO ao registro de
  // chefões. Quem escolhe qual entra em cena é FG.enemies.reset(), pelo
  // bossId da fase.
  FG.enemies.registerBoss('hugo', boss);
})();
