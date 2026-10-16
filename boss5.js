// Fagulho: Lendas do Bosque — boss5.js
// Chefão da fase 5, e o ÚLTIMO do jogo: ESBELTINHO OTTON, o mineiro-chefe.
// Comprido e seco (daí o nome): pernas e braços longos de mangueira, tronco
// estreito, capacete amarelo de mineiro com lanterna acesa na testa, camisa
// amarela de manga comprida com suspensórios castanhos cruzando o peito,
// calças cinzentas e botas pesadas. Cara zangada de quem manda: sobrancelhas
// grossas franzidas, boca aberta a gritar ordens. Na mão, a PICARETA — é o
// que ele ergue, o que crava no chão e o que atira no jogador.
// O ponto fraco é a LANTERNA DE PEITO pendurada no suspensório: quando ele
// se ajoelha sem fôlego, ela desce ao alcance de um pulo e acende (mesmo
// contrato dos outros quatro chefões).
// Nenhum sprite: o corpo é montado em canvas puro a partir de uma armação de
// juntas que interpola entre duas poses — de pé e ajoelhado.
// A ÚNICA coisa que este arquivo faz no load é registar-se em FG.enemies
// (enemies.js vem antes no index.html); todo o resto só olha para FG.* dentro
// de funções chamadas em runtime.
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
  const lerp = (a, b, k) => a + (b - a) * k;

  // ==================================================================
  // ARMAÇÃO — as juntas do mineiro
  // Coordenadas locais: x cresce para a direita, y sobe negativo a partir da
  // planta dos pés (que assenta em boss.groundY). Ele encara a ESQUERDA, que
  // é de onde o jogador chega — por isso "front" é o lado dos x negativos, e
  // não existe espelhamento nenhum no desenho.
  // Ele é COMPRIDO: 300px da planta ao alto do capacete, com membros finos.
  // ==================================================================
  const P_STAND = {
    hip:       { x:  -2, y: -126 },
    chest:     { x: -10, y: -196 },   // a lanterna de peito mora aqui
    head:      { x:  -4, y: -288 },
    shBack:    { x:  30, y: -236 },
    shFront:   { x: -42, y: -232 },
    // Braço de trás caído ao lado do corpo; o da frente dobrado, segurando a
    // picareta encostada ao ombro — a pose com que ele entra em cena.
    fistBack:  { x:  48, y: -132 },
    fistFront: { x: -62, y: -186 },
    kneeBack:  { x:  20, y:  -64 },
    kneeFront: { x: -28, y:  -64 },
    footBack:  { x:  22, y:    0 },
    footFront: { x: -38, y:    0 },
  };
  // Ajoelhado, dobrado para a frente, sem fôlego: o peito desce e AVANÇA para
  // fora da massa do corpo, senão o soco bateria no ombro e não na lanterna.
  const P_KNEEL = {
    hip:       { x:  14, y:  -82 },
    chest:     { x: -46, y: -144 },   // <- ~144px do chão. É a medida do contrato.
    head:      { x: -78, y: -186 },
    shBack:    { x:   8, y: -176 },
    shFront:   { x: -86, y: -158 },
    fistBack:  { x: -14, y:  -16 },
    fistFront: { x:-128, y:  -14 },
    kneeBack:  { x:  38, y:  -24 },
    kneeFront: { x: -44, y:  -52 },
    footBack:  { x:  30, y:    0 },
    footFront: { x: -70, y:    0 },
  };
  // Lista fixa de juntas: iterar por ela não aloca (as strings são constantes).
  const JOINTS = ['hip', 'chest', 'head', 'shBack', 'shFront',
    'fistBack', 'fistFront', 'kneeBack', 'kneeFront', 'footBack', 'footFront'];
  const POSE = {};
  for (let i = 0; i < JOINTS.length; i++) POSE[JOINTS[i]] = { x: 0, y: 0 };

  // Caixa do ponto fraco em volta da lanterna de peito. Larga e alta de
  // propósito: o jogador chega nela pulando, e um alvo estreito exigiria
  // acertar o frame do ápice.
  const CORE_W = 100, CORE_H = 100;

  const RUN_SPEED = 620;     // investida com a picareta rente ao chão
  const RUN_LEFT = 440;      // quanto ele avança para a esquerda antes de voltar

  // ---------- pools do chefão (pré-alocadas; reset() apaga todas) ----------
  const MAXPIC = 4;          // picaretas arremessadas, girando no ar
  const pics = [];
  for (let i = 0; i < MAXPIC; i++) {
    pics.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0, spin: 0 });
  }

  const MAXJET = 8;          // grisu: rachadura no chão -> labareda
  const jets = [];
  for (let i = 0; i < MAXJET; i++) {
    jets.push({ active: false, state: 'crack', x: 0, groundY: 0, timer: 0, h: 0, w: 42 });
  }
  const JET_H = 150;         // altura da labareda: não dá para saltar por cima

  const MAXSTAL = 8;         // estalactites arrancadas do teto
  const stals = [];
  for (let i = 0; i < MAXSTAL; i++) {
    stals.push({ active: false, state: 'shadow', x: 0, y: 0, w: 28, h: 62, vy: 0, timer: 0, groundY: 0 });
  }

  const MAXPO = 5;           // entulho fumegante onde a estalactite estoura
  const pos = [];
  for (let i = 0; i < MAXPO; i++) pos.push({ active: false, x: 0, y: 0, w: 90, h: 18, t: 0 });

  const boss = {
    // --- identidade (o engine lê o nome para a barra de vida) ---
    id: 'otton',
    nome: 'ESBELTINHO OTTON',

    // --- contrato lido pelo engine ---
    started: false,
    active: false,
    dead: false,
    hp: 10,
    maxHp: 10,

    // --- geometria (resolvida em runtime, no start/reset) ---
    homeX: 0,        // posto do mineiro (fundo da estação, à direita)
    x: 0,            // posição atual (só muda na investida)
    groundY: 0,      // chão da estação
    kneel: 0,        // 0..1 — de pé -> ajoelhado (a janela de dano)
    lean: 0,         // 0..1 — em pé -> inclinado para a corrida (investida)
    charge: 0,       // 0..1 — brilho da lanterna de peito (telegraph visível)
    armRaise: 0,     // 0..1 — picareta erguida acima da cabeça (desabamento)
    swing: 0,        // 0..1 — picareta no fim do golpe, cravada no chão
    wind: 0,         // 0..1 — braço atrás, preparando o arremesso
    shake: 0,        // tremor do próprio corpo (impacto)

    // --- máquina de estados ---
    state: 'dormant', // dormant|intro|idle|picareta|desabamento|investida|grisu|exposto|dying
    phase: 0,
    timer: 0,
    attackIndex: 0,
    stunHit: false,
    flash: 0,
    eyeGlow: 0,       // brilho da lanterna na janela de dano
    safe: 0,          // carência de contato ao sair da janela (ver takeHit)
    dieTimer: 0,
    dieScale: 1,
    victoryFired: false,
    jogadas: 0,       // picaretas já lançadas na salva corrente

    // caixas calculadas por frame (nunca realocadas)
    coreBox: { x: 0, y: 0, w: CORE_W, h: CORE_H },
    bodyBox: { x: 0, y: 0, w: 0, h: 0 },

    start() {
      // Grito de encarada + música do boss; 1.2s de intro antes do primeiro ataque.
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
      this.groundY = groundYAt(a.x + a.w * 0.9, 300);
      // Fica longe da parede da direita: ajoelhado ele avança o peito para a
      // esquerda, e o jogador precisa de chão dos dois lados da lanterna.
      this.homeX = a.x + a.w - 220;
      this.x = this.homeX;
    },

    reset() {
      // Volta TUDO ao estado inicial (não iniciado), inclusive as pools — uma
      // picareta ou uma labareda deste chefão não pode sobreviver à troca de fase.
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
      this.eyeGlow = 0;
      this.safe = 0;
      this.kneel = 0;
      this.lean = 0;
      this.charge = 0;
      this.armRaise = 0;
      this.swing = 0;
      this.wind = 0;
      this.shake = 0;
      this.dieTimer = 0;
      this.dieScale = 1;
      this.victoryFired = false;
      this.jogadas = 0;
      for (let i = 0; i < MAXPIC; i++) pics[i].active = false;
      for (let i = 0; i < MAXJET; i++) jets[i].active = false;
      for (let i = 0; i < MAXSTAL; i++) stals[i].active = false;
      for (let i = 0; i < MAXPO; i++) pos[i].active = false;
    },

    isPhase2() { return this.hp <= 3; },

    // Recalcula a pose e as caixas. Fica numa função porque o desenho também
    // precisa dela enquanto o mineiro dorme (antes do primeiro update).
    refreshPose() {
      const k = this.kneel;
      for (let i = 0; i < JOINTS.length; i++) {
        const j = JOINTS[i];
        POSE[j].x = lerp(P_STAND[j].x, P_KNEEL[j].x, k);
        POSE[j].y = lerp(P_STAND[j].y, P_KNEEL[j].y, k);
      }
      const sc = this.dieScale;
      // lanterna de peito — o ponto fraco
      const cb = this.coreBox;
      cb.w = CORE_W * sc;
      cb.h = CORE_H * sc;
      cb.x = this.x + POSE.chest.x * sc - cb.w / 2;
      cb.y = this.groundY + POSE.chest.y * sc - cb.h / 2;
      // massa que machuca no contato: do chão até acima do capacete
      const bb = this.bodyBox;
      const cxLo = Math.min(POSE.hip.x, POSE.head.x), cxHi = Math.max(POSE.hip.x, POSE.head.x);
      bb.x = this.x + (cxLo - 62) * sc;
      bb.w = (cxHi - cxLo + 124) * sc;
      bb.y = this.groundY + (POSE.head.y - 34) * sc;
      bb.h = this.groundY - bb.y;
    },

    // Fim de ataque: ele cai de joelhos, sem fôlego, e a lanterna de peito
    // acende. Vem depois de TODOS os ataques — é o que dá ritmo à luta.
    expose(dur) {
      this.state = 'exposto';
      this.timer = dur;
      this.phase = 0;
      this.stunHit = false;
      this.armRaise = 0;
      this.wind = 0;
      this.swing = 0;
      this.lean = 0;
    },

    // Dano na lanterna de peito
    takeHit() {
      this.hp--;
      this.flash = 0.25;
      this.stunHit = true;
      FG.audio.sfx('bossHit');
      goldBurst(this.coreBox.x + this.coreBox.w / 2, this.coreBox.y + this.coreBox.h / 2, 10, 0);
      // cacos de vidro e fagulhas da lanterna partida
      for (let i = 0; i < 8; i++) {
        spawnParticle(this.coreBox.x + this.coreBox.w / 2, this.coreBox.y + this.coreBox.h / 2,
          rand(-220, 120), rand(-260, -40), 0.6, 3 + Math.random() * 4, '#ffd87a', 900);
      }
      if (this.hp <= 0) {
        // Morte cinematográfica: dead=true JÁ destranca a arena e some a barra.
        this.dead = true;
        this.state = 'dying';
        this.dieTimer = 0;
        this.timer = 0;
      } else {
        // Levanta-se e volta a fechar a guarda. O `kneel` NÃO volta a zero de
        // repente: quem acabou de socar está colado no peito dele, e o corpo a
        // materializar-se em cima do jogador seria dano que ele não podia
        // evitar. Sobe interpolado no idle, e a carência abaixo cobre o resto.
        this.state = 'idle';
        this.timer = this.isPhase2() ? 0.6 : 0.85;
        this.safe = 0.6;
      }
    },

    // Núcleo da máquina de estados. Separado do `update` público porque está
    // cheio de `return` antecipado — e as picaretas e estalactites já no ar
    // têm de continuar a andar mesmo nos frames em que o corpo não faz nada.
    step(dt) {
      const p = FG.player;
      const ov = FG.engine.rectsOverlap;
      if (this.flash > 0) this.flash -= dt;
      if (this.safe > 0) this.safe -= dt;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);

      // ---------- morte cinematográfica ----------
      if (this.state === 'dying') {
        this.dieTimer += dt;
        const k = this.dieTimer / 2.5;
        this.dieScale = Math.max(0.1, 1 - k * 0.55);      // desaba e encolhe
        this.kneel = Math.min(1, this.kneel + dt * 2.5);  // tomba de joelhos
        this.charge = Math.max(0, this.charge - dt * 0.5); // a lanterna apaga
        this.shake = 1;
        this.refreshPose();
        // poeira de rocha e fagulhas da lanterna morrendo
        if (Math.random() < 0.9) {
          spawnParticle(this.x + rand(-60, 60), this.groundY - rand(0, 240) * this.dieScale,
            rand(-160, 160), rand(-320, -60), 0.8, 3 + Math.random() * 5,
            Math.random() < 0.5 ? '#9a90a8' : '#ffc46a', 700);
        }
        if (this.dieTimer >= 2.5 && !this.victoryFired) {
          this.victoryFired = true;
          goldBurst(this.x, this.groundY - 120, 40, 5); // a lanterna estoura em lumis
          FG.audio.sfx('victory');
          // A Caverna é a ÚLTIMA fase do jogo: é esta chamada que encerra o
          // jogo com a tela de vitória final. (O chefão não sabe disso — quem
          // traduz vitória-de-fase em vitória-de-jogo é o setState do engine.)
          FG.engine.setState('victory');
        }
        return;
      }

      if (!this.started) return;

      // ---------- intro ----------
      if (this.state === 'intro') {
        this.timer -= dt;
        // encara o jogador e grita: a lanterna de peito pulsa de leve
        this.charge = 0.5 + Math.sin(FG.engine.time * 9) * 0.25;
        this.shake = 0.4;
        this.refreshPose();
        if (this.timer <= 0) {
          this.active = true;
          this.state = 'idle';
          this.timer = 1.0;
          this.charge = 0;
        }
        return;
      }

      const p2 = this.isPhase2();
      // Chefão final: a fase 2 aperta tanto quanto a do Sergiola (0.78).
      const speedMul = p2 ? 0.78 : 1;
      const a = FG.level.arena;

      this.timer -= dt;

      if (this.state === 'idle') {
        // levanta-se, firma a picareta, volta ao posto
        this.kneel += (0 - this.kneel) * Math.min(1, dt * 6);
        this.lean += (0 - this.lean) * Math.min(1, dt * 8);
        this.charge += ((p2 ? 0.25 : 0) - this.charge) * Math.min(1, dt * 4);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 4);
        this.eyeGlow = 0;
        if (this.timer <= 0) {
          // O arremesso de picareta abre o ciclo: é a assinatura do bicho, e
          // a primeira coisa que o jogador tem de aprender a desviar.
          const attacks = ['picareta', 'desabamento', 'investida', 'grisu'];
          this.state = attacks[this.attackIndex % 4];
          this.attackIndex++;
          this.phase = 0;
          this.timer = 0;
        }

      } else if (this.state === 'exposto') {
        // de joelhos, sem fôlego: a lanterna de peito desce e acende
        this.kneel = Math.min(1, this.kneel + dt * 6);
        this.charge += (0 - this.charge) * Math.min(1, dt * 4);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 3);
        this.eyeGlow = 0.6 + 0.4 * Math.sin(FG.engine.time * 12);
        this.refreshPose();
        // pó de carvão subindo do peito arfando
        if (Math.random() < 0.4) {
          spawnParticle(this.coreBox.x + this.coreBox.w / 2 + rand(-16, 16),
            this.coreBox.y + this.coreBox.h / 2, rand(-30, 30), rand(-90, -40),
            0.7, 5 + Math.random() * 4, 'rgba(255,215,140,0.45)', -40);
        }
        // soco na lanterna
        if (!this.stunHit && p.attackBox && p.attackBox.active && ov(p.attackBox, this.coreBox)) {
          this.takeHit();
        }
        // pisão na lanterna (quica)
        else if (!this.stunHit && p.vy > 0 && ov(p, this.coreBox)) {
          p.vy = -420;
          this.takeHit();
        }
        if (this.timer <= 0 && this.state === 'exposto') {
          this.state = 'idle';
          this.timer = 1.0 * speedMul;
          this.eyeGlow = 0;
          this.safe = 0.5;   // mesma carência de quem acertou: dá tempo de sair
        }
        return;   // de joelhos nada machuca no contato: sai antes do teste

      // ================= 1. ARREMESSO DE PICARETA =================
      // "O chefão lança picaretas no jogador": puxa o braço para trás
      // (telegraph), lança uma picareta girando num arco raso e repete. Em
      // fase 2 são três em vez de duas, e mais rápidas.
      } else if (this.state === 'picareta') {
        if (this.phase === 0) {
          this.phase = 1;
          this.timer = 0.75;
          this.jogadas = 0;
          FG.audio.sfx('bossSpit');
        } else if (this.phase === 1) {
          this.wind = Math.min(1, this.wind + dt * 1.6);
          this.charge = Math.min(0.8, this.charge + dt * 1.1);
          // lascas de rocha caindo da picareta erguida
          if (Math.random() < 0.3) {
            spawnParticle(this.x + POSE.fistFront.x + rand(-14, 14), this.groundY - 200,
              rand(-30, 30), rand(-50, -10), 0.4, 2.6, '#b9bec8', 400);
          }
          if (this.timer <= 0) {
            this.throwPicareta(p.x + p.w / 2);
            this.wind = 0;
            this.jogadas++;
            const total = p2 ? 3 : 2;
            if (this.jogadas >= total) { this.phase = 2; this.timer = 0.45; }
            else { this.phase = 1; this.timer = (p2 ? 0.42 : 0.55); }
          }
        } else if (this.phase === 2) {
          this.charge = Math.max(0, this.charge - dt * 2);
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }

      // ================= 2. DESABAMENTO =================
      // Ergue a picareta com as duas mãos e crava-a no chão: o teto da
      // galeria cede e as estalactites caem, cada uma anunciada pela sombra
      // no chão bem antes de chegar.
      } else if (this.state === 'desabamento') {
        if (this.phase === 0) {
          this.phase = 1;
          this.timer = 0.72;
        } else if (this.phase === 1) {
          this.armRaise = Math.min(1, this.armRaise + dt * 1.6);
          this.charge = Math.min(0.8, this.charge + dt * 1.0);
          if (this.timer <= 0) {
            FG.audio.sfx('bossRoar');
            this.armRaise = 0;
            this.swing = 1;
            this.shake = 1;
            FG.engine.shakeCamera(12, 0.45);
            // lascas do impacto da picareta no chão
            for (let i = 0; i < 12; i++) {
              spawnParticle(this.x + rand(-80, 40), this.groundY, rand(-260, 260), rand(-320, -80),
                0.6, 4 + Math.random() * 4, '#8e8698', 900);
            }
            // estalactites: sombra no chão bem antes de cada uma cair. Fase 2
            // manda mais pedaços, em sequência mais apertada.
            const n = p2 ? 7 : 4;
            const stagFall = p2 ? 0.14 : 0.22;
            let spawned = 0;
            for (let i = 0; i < MAXSTAL && spawned < n; i++) {
              const s = stals[i];
              if (s.active) continue;
              s.active = true;
              s.state = 'shadow';
              // espalha pela faixa da arena onde o jogador luta
              // Caem sobre a doca do chefão, a faixa onde o jogador luta de
              // verdade — espalhar pela arena inteira mandaria metade delas
              // para dentro da vala, longe de toda a gente.
              const faixa = Math.max(260, Math.min(a.w - 320, 620));
              s.x = Math.max(a.x + 120, this.x - faixa) + (spawned / n) * faixa + rand(-30, 30);
              s.groundY = groundYAt(s.x + s.w / 2, 300);
              if (Math.abs(s.groundY - this.groundY) > 2) { s.active = false; continue; }
              s.y = s.groundY - 540;
              s.vy = 0;
              s.timer = 0.75 + spawned * stagFall;
              spawned++;
            }
            this.phase = 2;
            this.timer = 0.75 + spawned * stagFall + 0.6;
          }
        } else if (this.phase === 2) {
          this.swing = Math.max(0, this.swing - dt * 2);
          this.charge = Math.max(0, this.charge - dt * 0.8);
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }

      // ================= 3. INVESTIDA =================
      // Baixa o capacete e corre a estação de ponta a ponta com a picareta
      // rente ao chão, levantando faísca nos trilhos.
      } else if (this.state === 'investida') {
        if (this.phase === 0) {
          this.phase = 1;
          this.timer = 0.72;
          FG.audio.sfx('bossSpit');
        } else if (this.phase === 1) {
          this.lean = Math.min(1, this.lean + dt * 1.3);
          this.charge = Math.min(1, this.charge + dt * 1.2);
          if (Math.random() < 0.5) {
            spawnParticle(this.x + rand(-30, 30), this.groundY, rand(-40, 40), rand(-90, -20),
              0.4, 3, 'rgba(180,170,200,0.6)', 700);
          }
          if (this.timer <= 0) { this.phase = 2; this.timer = 0; }
        } else if (this.phase === 2) {
          const runSpd = p2 ? RUN_SPEED * 1.15 : RUN_SPEED;
          this.x -= runSpd * dt;
          this.runDust();
          if (this.x <= Math.max(a.x + 80, this.homeX - RUN_LEFT)) { this.phase = 3; this.timer = 0.22; }
        } else if (this.phase === 3) {
          // crava a picareta para travar e sacode a galeria — a brecha para respirar
          this.runDust();
          if (this.timer <= 0) { this.phase = 4; this.timer = 0; }
        } else if (this.phase === 4) {
          const runSpd = p2 ? RUN_SPEED * 1.15 : RUN_SPEED;
          this.x += runSpd * dt;
          this.runDust();
          if (this.x >= this.homeX) { this.x = this.homeX; this.phase = 5; this.timer = 0.3; }
        } else if (this.phase === 5) {
          this.lean = Math.max(0, this.lean - dt * 3);
          this.charge = Math.max(0, this.charge - dt * 2);
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }

      // ================= 4. GRISU =================
      // Bolsa de gás: as rachaduras do chão acendem em azul ANTES de abrir, e
      // marcham do mineiro para o jogador. Cada labareda tem aviso.
      } else if (this.state === 'grisu') {
        if (this.phase === 0) {
          const n = p2 ? 8 : 4;
          const step = p2 ? 108 : 138;
          const stagger = p2 ? 0.18 : 0.26;
          const CRACK_T = 0.72;
          let spawned = 0;
          for (let i = 0; i < MAXJET && spawned < n; i++) {
            const j = jets[i];
            if (j.active) continue;
            const jx = this.x - 130 - spawned * step + rand(-18, 18);
            if (jx < a.x + 50) break;              // não jorra dentro da parede
            // A marcha das rachaduras para onde o chão dele acaba: a vala da
            // estação fica mais funda que a doca, e um jorro lá no fundo
            // seria perigo invisível, não ataque.
            if (Math.abs(groundYAt(jx, 300) - this.groundY) > 2) break;
            j.active = true;
            j.state = 'crack';
            j.x = jx;
            j.groundY = groundYAt(jx, 300);
            j.timer = CRACK_T + spawned * stagger;
            j.h = 0;
            spawned++;
          }
          this.phase = 1;
          this.timer = CRACK_T + spawned * stagger + 0.45;
          this.charge = 0.6;
        } else if (this.phase === 1) {
          this.kneel = Math.min(0.3, this.kneel + dt * 1.5);   // curvado sobre a fenda
          this.charge = 0.55 + 0.25 * Math.sin(FG.engine.time * 16);
          if (this.timer <= 0) {
            this.kneel = 0.3;
            this.expose(2.6 * speedMul);
          }
        }
      }

      this.refreshPose();

      // ---------- contato com o mineiro ----------
      // Na corrida (lean alto) o ombro é um aríete; de pé, a massa do corpo
      // machuca. Ajoelhado (kneel) fica inofensivo — é aí que o jogador
      // precisa colar no peito para socar a lanterna. E entre um e outro há a
      // carência `safe`, em que ele empurra em vez de machucar: sem isso,
      // quem acerta o soco levava dano de graça só por estar onde o soco exige.
      if (this.safe > 0) {
        if (ov(p, this.bodyBox)) {
          const lado = (p.x + p.w / 2) < this.x ? -1 : 1;
          p.vx = lado * 300;
        }
      } else if (this.kneel <= 0.15 && ov(p, this.bodyBox)) {
        p.hurt(2, this.x);
      }
    },

    // Poeira sob as botas enquanto ele corre.
    runDust() {
      if (Math.random() < 0.8) {
        spawnParticle(this.x + rand(-40, 40), this.groundY, rand(-120, 120), rand(-180, -40),
          0.45, 4 + Math.random() * 3, Math.random() < 0.4 ? '#cfc6dc' : '#6e6680', 700);
      }
    },

    // Picareta arremessada: arco RASO e rápido, mirado na altura do peito do
    // jogador. Dá para saltar por cima ou passar por baixo se ele estiver em
    // cima de um vagão — mas é preciso decidir cedo.
    throwPicareta(targetX) {
      let r = null;
      for (let i = 0; i < MAXPIC; i++) if (!pics[i].active) { r = pics[i]; break; }
      if (!r) return;
      r.active = true;
      r.x = this.x + POSE.fistFront.x;
      r.y = this.groundY + POSE.fistFront.y - 10;
      r.px = r.x; r.py = r.y;
      const dx = Math.min(-80, targetX - r.x);     // sempre para a esquerda
      const T = Math.min(1.1, Math.max(0.45, Math.abs(dx) / 620));
      r.vx = dx / T;
      r.vy = -0.5 * GRAV * 0.45 * T;               // arco raso: cai pouco no caminho
      r.spin = 0;
    },

    // O que o engine chama (via FG.enemies). Corpo primeiro, perigos depois.
    update(dt) {
      this.step(dt);
      // As picaretas e estalactites continuam vivas durante a morte: o que já
      // estava no ar não pode evaporar no frame em que o mineiro desaba.
      if (this.started || this.dead) updateBossStuff(dt);
    },

    draw(ctx, cam) {
      drawOtton(ctx, cam);
      drawBossStuff(ctx, cam);
    },
  };

  // ==================================================================
  // Picaretas, labaredas e estalactites
  // ==================================================================
  // Caixa de rascunho reaproveitada nos testes de colisão: a picareta e a
  // labareda são desenhadas como forma, mas colidem como retângulo — e alocar
  // um objeto por frame para isso é lixo que o coletor teria de varrer.
  const scratch = { x: 0, y: 0, w: 0, h: 0 };

  function updateBossStuff(dt) {
    const p = FG.player;
    const ov = FG.engine.rectsOverlap;
    const a = FG.level.arena;
    // "Nada machuca durante a janela" vale para o chefão INTEIRO, não só para
    // o corpo dele: a picareta ainda no ar e a labareda acesa apagam o dano
    // enquanto ele está de joelhos. Continuam a ser desenhadas: só não ferem.
    const janela = boss.state === 'exposto';

    // ---- picaretas no ar (giram e estouram em lasca) ----
    for (let i = 0; i < MAXPIC; i++) {
      const r = pics[i];
      if (!r.active) continue;
      r.px = r.x; r.py = r.y;
      r.vy += GRAV * 0.45 * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.spin -= dt * 16;
      scratch.x = r.x - 22; scratch.y = r.y - 14; scratch.w = 44; scratch.h = 28;
      const gy = groundYAt(r.x, 300);
      if (!janela && ov(p, scratch)) {
        p.hurt(1, r.x);
        r.active = false;
        burstLasca(r.x, r.y);
        continue;
      }
      if (r.y >= gy || r.x < a.x + 20) {
        r.active = false;
        burstLasca(r.x, Math.min(r.y, gy));
        FG.audio.sfx('hitEnemy');
      }
    }

    // ---- grisu: rachadura acende, labareda sobe, labareda morre ----
    for (let i = 0; i < MAXJET; i++) {
      const j = jets[i];
      if (!j.active) continue;
      j.timer -= dt;
      if (j.state === 'crack') {
        if (j.timer <= 0) { j.state = 'up'; j.timer = 0.75; FG.audio.sfx('bossSpit'); }
      } else if (j.state === 'up') {
        j.h = Math.min(JET_H, j.h + 900 * dt);
        if (j.timer <= 0) { j.state = 'down'; j.timer = 0.3; }
      } else {
        j.h = Math.max(0, j.h - 600 * dt);
        if (j.h <= 0) { j.active = false; continue; }
      }
      if (!janela && j.h > 10) {
        scratch.x = j.x - j.w / 2; scratch.y = j.groundY - j.h;
        scratch.w = j.w; scratch.h = j.h;
        if (ov(p, scratch)) p.hurt(1, j.x);
      }
      if (j.state !== 'crack' && Math.random() < 0.5) {
        spawnParticle(j.x + rand(-14, 14), j.groundY - j.h * rand(0.3, 1),
          rand(-30, 30), rand(-160, -60), 0.5, 3 + Math.random() * 3, '#8fd0ff', -60);
      }
    }

    // ---- estalactites: sombra no chão, queda, estouro ----
    for (let i = 0; i < MAXSTAL; i++) {
      const s = stals[i];
      if (!s.active) continue;
      s.timer -= dt;
      if (s.state === 'shadow') {
        if (s.timer <= 0) { s.state = 'fall'; s.vy = 0; }
      } else {
        s.vy += GRAV * 1.1 * dt;
        s.y += s.vy * dt;
        if (!janela) {
          scratch.x = s.x; scratch.y = s.y; scratch.w = s.w; scratch.h = s.h;
          if (ov(p, scratch)) { p.hurt(1, s.x + s.w / 2); s.active = false; continue; }
        }
        if (s.y + s.h >= s.groundY) {
          s.active = false;
          FG.engine.shakeCamera(7, 0.25);
          burstLasca(s.x + s.w / 2, s.groundY - 8);
          // entulho fumegante onde ela estourou
          for (let k = 0; k < MAXPO; k++) {
            const b = pos[k];
            if (b.active) continue;
            b.active = true; b.x = s.x - 30; b.y = s.groundY - 18; b.w = 90; b.h = 18; b.t = 0.9;
            break;
          }
        }
      }
    }

    // ---- entulho no chão (só decoração, não machuca) ----
    for (let i = 0; i < MAXPO; i++) {
      const b = pos[i];
      if (!b.active) continue;
      b.t -= dt;
      if (b.t <= 0) b.active = false;
    }
  }

  function burstLasca(x, y) {
    for (let i = 0; i < 9; i++) {
      spawnParticle(x, y, rand(-200, 200), rand(-280, -60), 0.55,
        2.5 + Math.random() * 3.5, Math.random() < 0.5 ? '#c9cfdc' : '#7a7288', 900);
    }
  }

  // ==================================================================
  // DESENHO
  // ==================================================================
  // Membro de mangueira: curva grossa sem cotovelo, como o do Heitor — é o
  // traço do jogo, e o mineiro comprido é feito quase só disto.
  function limb(ctx, ax, ay, bx, by, w0, w1) {
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const dx = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const bulge = Math.min(18, len * 0.16);
    ctx.beginPath();
    ctx.moveTo(ax + nx * w0, ay + ny * w0);
    ctx.quadraticCurveTo(mx + nx * (w0 + w1) * 0.5 + nx * bulge, my + ny * (w0 + w1) * 0.5 + ny * bulge,
      bx + nx * w1, by + ny * w1);
    ctx.lineTo(bx - nx * w1, by - ny * w1);
    ctx.quadraticCurveTo(mx - nx * (w0 + w1) * 0.5 + nx * bulge, my - ny * (w0 + w1) * 0.5 + ny * bulge,
      ax - nx * w0, ay - ny * w0);
    ctx.closePath();
    ctx.fill();
  }

  function drawOtton(ctx, cam) {
    if (!boss.started && !boss.dead) return;
    const t = FG.engine.time;
    boss.refreshPose();
    const sc = boss.dieScale;
    const sx = boss.x - cam.x;
    const sy = boss.groundY - cam.y;
    if (sx < -400 || sx > FG.enemies.fx.VIEW_W + 400) return;

    ctx.save();
    ctx.translate(sx, sy);
    if (boss.shake > 0) {
      ctx.translate(rand(-3, 3) * boss.shake, rand(-2, 2) * boss.shake);
    }
    ctx.scale(sc, sc);
    // inclinação da corrida: ele se joga para a frente (que é a esquerda)
    if (boss.lean > 0) ctx.rotate(-boss.lean * 0.16);

    // sombra no chão
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 86, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    drawBody(ctx, t);

    ctx.restore();
  }

  function drawBody(ctx, t) {
    const P = POSE;
    const flash = boss.flash > 0 && Math.floor(boss.flash * 24) % 2 === 0;

    // ---- perna de trás, braço de trás (atrás do tronco) ----
    ctx.fillStyle = '#4a4e5c';                        // calça cinzenta, lado escuro
    limb(ctx, P.hip.x + 8, P.hip.y, P.kneeBack.x, P.kneeBack.y, 13, 10);
    limb(ctx, P.kneeBack.x, P.kneeBack.y, P.footBack.x, P.footBack.y - 10, 10, 8);
    drawBota(ctx, P.footBack.x, P.footBack.y, 0.9);

    ctx.fillStyle = '#c99a12';                        // manga amarela, lado escuro
    limb(ctx, P.shBack.x, P.shBack.y, P.fistBack.x, P.fistBack.y, 11, 8);
    drawMao(ctx, P.fistBack.x, P.fistBack.y, 10);

    // ---- tronco: comprido e estreito, camisa amarela ----
    const g = ctx.createLinearGradient(P.chest.x - 40, P.chest.y - 50, P.chest.x + 40, P.hip.y);
    g.addColorStop(0, '#ffd84a');
    g.addColorStop(0.55, '#eeba1c');
    g.addColorStop(1, '#b98a0c');
    ctx.fillStyle = flash ? '#fff3c0' : g;
    ctx.beginPath();
    ctx.moveTo(P.shFront.x - 4, P.shFront.y);
    ctx.quadraticCurveTo(P.chest.x - 34, P.chest.y, P.hip.x - 22, P.hip.y + 16);
    ctx.lineTo(P.hip.x + 24, P.hip.y + 16);
    ctx.quadraticCurveTo(P.chest.x + 34, P.chest.y, P.shBack.x + 4, P.shBack.y);
    ctx.quadraticCurveTo(P.chest.x, P.shBack.y - 22, P.shFront.x - 4, P.shFront.y);
    ctx.closePath();
    ctx.fill();
    // vincos da camisa
    ctx.strokeStyle = 'rgba(140,100,10,0.4)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const yy = P.chest.y + 10 + i * 22;
      ctx.beginPath();
      ctx.moveTo(P.chest.x - 24, yy);
      ctx.quadraticCurveTo(P.chest.x, yy + 6, P.chest.x + 24, yy - 2);
      ctx.stroke();
    }

    // ---- calças e cinto ----
    ctx.fillStyle = '#5a5f70';
    ctx.beginPath();
    ctx.moveTo(P.hip.x - 24, P.hip.y + 6);
    ctx.lineTo(P.hip.x + 26, P.hip.y + 6);
    ctx.lineTo(P.hip.x + 22, P.hip.y + 34);
    ctx.lineTo(P.hip.x - 22, P.hip.y + 34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(P.hip.x - 26, P.hip.y + 2, 52, 10);
    ctx.fillStyle = '#d8b24a';
    ctx.fillRect(P.hip.x - 6, P.hip.y + 2, 12, 10);

    // ---- suspensórios castanhos cruzando o peito ----
    ctx.strokeStyle = '#6b4526';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(P.shFront.x + 6, P.shFront.y + 6);
    ctx.lineTo(P.hip.x - 14, P.hip.y + 6);
    ctx.moveTo(P.shBack.x - 6, P.shBack.y + 6);
    ctx.lineTo(P.hip.x + 16, P.hip.y + 6);
    ctx.stroke();

    // ---- perna da frente ----
    ctx.fillStyle = '#6a7084';
    limb(ctx, P.hip.x - 6, P.hip.y, P.kneeFront.x, P.kneeFront.y, 14, 11);
    limb(ctx, P.kneeFront.x, P.kneeFront.y, P.footFront.x, P.footFront.y - 10, 11, 9);
    drawBota(ctx, P.footFront.x, P.footFront.y, 1);

    // ---- a lanterna de peito: O PONTO FRACO ----
    drawLanternaPeito(ctx, P.chest.x, P.chest.y, t);

    // ---- cabeça ----
    drawCabeca(ctx, P.head.x, P.head.y, t);

    // ---- braço da frente + picareta (por cima de tudo) ----
    ctx.fillStyle = '#ffd84a';
    const fx = P.fistFront.x, fy = P.fistFront.y;
    limb(ctx, P.shFront.x, P.shFront.y, fx, fy, 12, 9);
    drawPicareta(ctx, fx, fy, t);
    drawMao(ctx, fx, fy, 11);
  }

  // Bota pesada de mineiro, com biqueira de aço.
  function drawBota(ctx, x, y, k) {
    ctx.save();
    ctx.fillStyle = '#4a3220';
    ctx.beginPath();
    ctx.moveTo(x + 12 * k, y - 18);
    ctx.lineTo(x + 14 * k, y - 2);
    ctx.lineTo(x - 26 * k, y - 2);
    ctx.quadraticCurveTo(x - 30 * k, y - 16, x - 12 * k, y - 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#211710';
    ctx.fillRect(x - 28 * k, y - 5, 44 * k, 5);
    ctx.fillStyle = '#9aa0ac';
    ctx.beginPath();
    ctx.ellipse(x - 24 * k, y - 10, 6 * k, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Mão nodosa de mineiro (luva de couro).
  function drawMao(ctx, x, y, r) {
    ctx.save();
    ctx.fillStyle = '#7a5230';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,26,14,0.5)';
    ctx.fillRect(x - r, y - 2, r * 2, 2.5);
    ctx.restore();
  }

  // A picareta: cabo comprido de madeira e cabeça de ferro de dois bicos.
  // A rotação conta o estado — descansada no ombro, puxada atrás no
  // arremesso, acima da cabeça no telegraph, cravada no chão no golpe.
  function drawPicareta(ctx, hx, hy, t) {
    const ang = -0.9
      - boss.armRaise * 1.5        // ergue acima da cabeça
      + boss.swing * 2.3           // crava no chão
      + boss.wind * 1.1            // puxa para trás antes de lançar
      - boss.lean * 0.5;           // baixa rente ao chão na corrida
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    ctx.fillStyle = '#7a5433';
    ctx.fillRect(-5, -12, 10, 120);
    ctx.fillStyle = 'rgba(40,26,14,0.45)';
    ctx.fillRect(-5, 30, 10, 3);
    pickHead(ctx, 0, -12);
    ctx.restore();
  }

  function pickHead(ctx, x, y) {
    const g = ctx.createLinearGradient(x - 50, y, x + 50, y);
    g.addColorStop(0, '#8e95a4');
    g.addColorStop(0.5, '#d8dde8');
    g.addColorStop(1, '#8e95a4');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 52, y + 4);
    ctx.quadraticCurveTo(x - 16, y - 16, x, y - 10);
    ctx.quadraticCurveTo(x + 16, y - 16, x + 52, y + 4);
    ctx.quadraticCurveTo(x + 16, y - 2, x, y + 2);
    ctx.quadraticCurveTo(x - 16, y - 2, x - 52, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x - 46, y - 1, 92, 1.6);
  }

  // Lanterna de peito pendurada no suspensório: vidro redondo com aro de
  // ferro. Fechada e fosca enquanto ele luta; aberta e ACESA na janela de
  // dano, que é o convite a socá-la.
  function drawLanternaPeito(ctx, cx, cy, t) {
    const abre = boss.eyeGlow;                 // 0 fora da janela, pulsa dentro
    const calor = Math.max(boss.charge * 0.5, abre);
    ctx.save();
    ctx.translate(cx, cy);

    if (calor > 0.02) {
      // Na janela de dano este halo tem de GRITAR: é ele que diz "soca aqui",
      // e ele está por cima de uma camisa amarela — glow fraco desaparecia no
      // tecido. Fora da janela (só `charge`), fica discreto.
      const r = 80 * (0.6 + calor);
      const hg = ctx.createRadialGradient(0, 0, 4, 0, 0, r);
      hg.addColorStop(0, 'rgba(255,255,235,' + (0.85 * calor).toFixed(2) + ')');
      hg.addColorStop(0.35, 'rgba(255,225,140,' + (0.55 * calor).toFixed(2) + ')');
      hg.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }
    // anel pulsante só na janela: a marca do alvo, visível mesmo contra o
    // amarelo da camisa
    if (abre > 0.05) {
      ctx.strokeStyle = 'rgba(255,255,220,' + (0.35 + 0.45 * abre).toFixed(2) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 32 + 8 * abre, 0, Math.PI * 2);
      ctx.stroke();
    }

    // aro
    ctx.fillStyle = '#3a3640';
    ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.fill();
    // vidro
    const vg = ctx.createRadialGradient(-5, -5, 2, 0, 0, 20);
    if (abre > 0.05) {
      vg.addColorStop(0, '#fffbe0');
      vg.addColorStop(0.5, 'rgba(255,206,110,' + (0.7 + 0.3 * abre).toFixed(2) + ')');
      vg.addColorStop(1, 'rgba(230,140,40,0.9)');
    } else {
      vg.addColorStop(0, 'rgba(120,120,135,0.9)');
      vg.addColorStop(1, 'rgba(50,50,62,0.95)');
    }
    ctx.fillStyle = vg;
    ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.fill();
    // grade de arame sobre o vidro
    ctx.strokeStyle = 'rgba(30,26,34,0.75)';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-18, i * 8); ctx.lineTo(18, i * 8);
      ctx.stroke();
    }
    // chama dentro, só quando acesa
    if (abre > 0.05) {
      ctx.fillStyle = '#fff6d0';
      ctx.beginPath();
      ctx.ellipse(0, 2, 4, 8 * (0.7 + 0.3 * Math.sin(t * 16)), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Cabeça: cara comprida e zangada, bigode de mineiro, e o capacete amarelo
  // com a lanterna de testa varrendo a escuridão da caverna.
  function drawCabeca(ctx, hx, hy, t) {
    ctx.save();
    ctx.translate(hx, hy);

    // pescoço
    ctx.fillStyle = '#c08a58';
    ctx.fillRect(-9, 14, 18, 24);

    // rosto comprido
    const g = ctx.createLinearGradient(-26, -30, 26, 30);
    g.addColorStop(0, '#e0a470');
    g.addColorStop(1, '#a56c3c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 33, 0, 0, Math.PI * 2);
    ctx.fill();
    // orelha do lado de trás
    ctx.beginPath(); ctx.ellipse(23, 2, 6, 9, 0, 0, Math.PI * 2); ctx.fill();

    // sobrancelhas grossas franzidas
    ctx.strokeStyle = '#2a1c12';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-21, -12); ctx.lineTo(-7, -7);
    ctx.moveTo(-1, -8); ctx.lineTo(13, -13);
    ctx.stroke();
    // olhos zangados
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-14, -1, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(5, -2, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1018';
    ctx.beginPath(); ctx.arc(-16, -1, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -2, 2.8, 0, Math.PI * 2); ctx.fill();

    // nariz adunco
    ctx.fillStyle = '#b5753f';
    ctx.beginPath();
    ctx.moveTo(-10, 2);
    ctx.quadraticCurveTo(-22, 8, -10, 13);
    ctx.closePath();
    ctx.fill();

    // boca aberta gritando ordens, com os dentes quadriculados
    ctx.fillStyle = '#3a1418';
    ctx.beginPath();
    ctx.ellipse(-6, 19, 12, 8 + 2 * Math.sin(t * 7), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2ead8';
    ctx.fillRect(-17, 13, 22, 4);

    // capacete amarelo: casco, aba e a lanterna de testa acesa
    ctx.fillStyle = '#f2c021';
    ctx.beginPath();
    ctx.ellipse(0, -22, 29, 24, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#d8a000';
    ctx.fillRect(-34, -24, 68, 7);
    ctx.fillStyle = '#f2c021';
    ctx.beginPath();
    ctx.moveTo(-34, -24);
    ctx.quadraticCurveTo(-44, -26, -36, -31);
    ctx.lineTo(-30, -28);
    ctx.closePath();
    ctx.fill();
    // crista do capacete
    ctx.fillStyle = 'rgba(255,245,180,0.5)';
    ctx.fillRect(-3, -46, 6, 22);

    // lanterna de testa: vidro + facho varrendo a caverna à frente (esquerda)
    ctx.fillStyle = '#e8edf5';
    ctx.beginPath(); ctx.arc(-18, -28, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9aa2b0';
    ctx.beginPath(); ctx.arc(-18, -28, 7, 0, Math.PI * 2); ctx.stroke();
    const fg = ctx.createLinearGradient(-18, -28, -230, -10);
    fg.addColorStop(0, 'rgba(255,240,180,0.34)');
    fg.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-18, -28);
    ctx.lineTo(-230, -86);
    ctx.lineTo(-230, 64);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ---- picaretas no ar, labaredas de grisu, estalactites e entulho ----
  function drawBossStuff(ctx, cam) {
    const t = FG.engine.time;
    const xMin = cam.x - 260, xMax = cam.x + FG.enemies.fx.VIEW_W + 260;

    ctx.save();

    // ---- rachaduras e labaredas de grisu ----
    for (let i = 0; i < MAXJET; i++) {
      const j = jets[i];
      if (!j.active) continue;
      if (j.x < xMin || j.x > xMax) continue;
      const jx = j.x - cam.x, gy = j.groundY - cam.y;
      if (j.state === 'crack') {
        // aviso: a fenda acende em azul-gás, pulsando mais rápido perto do fim
        const k = 1 - Math.max(0, Math.min(1, j.timer / 0.72));
        ctx.globalAlpha = 0.35 + 0.5 * k * (0.6 + 0.4 * Math.sin(t * (12 + k * 26)));
        ctx.strokeStyle = '#7fd0ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(jx - 26, gy - 2);
        ctx.lineTo(jx - 8, gy - 8);
        ctx.lineTo(jx + 10, gy - 1);
        ctx.lineTo(jx + 26, gy - 7);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (j.h > 2) {
        const g = ctx.createLinearGradient(0, gy, 0, gy - j.h);
        g.addColorStop(0, 'rgba(180,235,255,0.95)');
        g.addColorStop(0.5, 'rgba(110,180,255,0.6)');
        g.addColorStop(1, 'rgba(80,140,255,0.12)');
        ctx.fillStyle = g;
        const w = j.w / 2;
        ctx.beginPath();
        ctx.moveTo(jx - w, gy);
        ctx.lineTo(jx - w * (0.45 + 0.15 * Math.sin(t * 22)), gy - j.h);
        ctx.lineTo(jx + w * (0.45 + 0.15 * Math.cos(t * 19)), gy - j.h);
        ctx.lineTo(jx + w, gy);
        ctx.closePath();
        ctx.fill();
      }
    }

    // ---- estalactites: sombra que cresce no chão, depois a queda ----
    for (let i = 0; i < MAXSTAL; i++) {
      const s = stals[i];
      if (!s.active) continue;
      if (s.x < xMin || s.x > xMax) continue;
      const sx = s.x - cam.x, gy = s.groundY - cam.y;
      if (s.state === 'shadow') {
        const k = 1 - Math.max(0, Math.min(1, s.timer / 0.9));
        ctx.globalAlpha = 0.25 + 0.5 * k;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(sx + s.w / 2, gy - 4, 14 + 16 * k, 5 + 4 * k, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        const sy = s.y - cam.y;
        const g = ctx.createLinearGradient(sx, sy, sx, sy + s.h);
        g.addColorStop(0, '#9aa6c0');
        g.addColorStop(0.5, '#5a5470');
        g.addColorStop(1, '#2a2338');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + s.w, sy);
        ctx.quadraticCurveTo(sx + s.w * 0.6, sy + s.h * 0.6, sx + s.w / 2, sy + s.h);
        ctx.quadraticCurveTo(sx + s.w * 0.4, sy + s.h * 0.6, sx, sy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(220,240,255,0.25)';
        ctx.fillRect(sx + s.w * 0.4, sy + 2, 2.5, s.h * 0.6);
      }
    }

    // ---- picaretas no ar (com rastro) ----
    for (let i = 0; i < MAXPIC; i++) {
      const r = pics[i];
      if (!r.active) continue;
      if (r.x < xMin || r.x > xMax) continue;
      const rx = r.x - cam.x, ry = r.y - cam.y;
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#d8dde8';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r.px - cam.x, r.py - cam.y);
      ctx.lineTo(rx, ry);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(r.spin);
      ctx.fillStyle = '#7a5433';
      ctx.fillRect(-4, -8, 8, 54);
      pickHead(ctx, 0, -8);
      ctx.restore();
    }

    // ---- entulho fumegante no chão ----
    for (let i = 0; i < MAXPO; i++) {
      const b = pos[i];
      if (!b.active) continue;
      if (b.x < xMin || b.x > xMax) continue;
      ctx.globalAlpha = Math.min(1, b.t / 0.4) * 0.8;
      const bx = b.x - cam.x, by = b.y - cam.y;
      const g = ctx.createLinearGradient(0, by, 0, by + b.h);
      g.addColorStop(0, 'rgba(190,195,215,0.8)');
      g.addColorStop(1, 'rgba(90,86,110,0.4)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx, by + b.h);
      for (let k = 0; k <= 6; k++) {
        const fx = bx + (k / 6) * b.w;
        const fh = b.h * (0.5 + 0.5 * Math.abs(Math.sin(t * 10 + k * 2 + i)));
        ctx.lineTo(fx, by + b.h - fh);
      }
      ctx.lineTo(bx + b.w, by + b.h);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  // Única linha de load deste arquivo: entrega o mineiro ao registro de
  // chefões. Quem escolhe qual entra em cena é FG.enemies.reset(), pelo
  // bossId da fase.
  FG.enemies.registerBoss('otton', boss);
})();
