// Fagulho: Lendas do Bosque — boss3.js
// Chefão da fase 3, e o último do jogo: PATRIÇOLA DRÁCULA.
// Vampira esguia de capa vermelha comprida, cabelo preto espetado, olhos
// vermelhos brilhantes e garras longas. Não tem sprite nenhum (só o dragão
// tem): o corpo é montado em canvas puro a partir de uma armação de juntas
// que interpola entre duas poses — de pé (altiva, capa fechada) e curvada
// (ofegante, capa aberta, peito exposto). Esta é a MESMA técnica de rig do
// antigo golem de magma que esta fase substituiu: duas poses, membros como
// troncos de cone entre juntas, `lerp` fazendo a transição.
// A pose curvada não é enfeite: é ela que traz o coração do peito para
// ~150px do chão na janela de dano, que é o que faz a luta caber em oito
// socos.
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
  // ARMAÇÃO — as juntas da vampira
  // Coordenadas locais: x cresce para a direita, y sobe negativo a partir da
  // planta dos pés (que assenta em boss.groundY). Ela encara a ESQUERDA, que
  // é de onde o jogador chega — por isso "front" é o lado dos x negativos, e
  // não existe espelhamento nenhum no desenho.
  // Os números são os MESMOS do golem que ela substituiu: são a medida do
  // contrato de alcance (o soco/pisão precisa achar o peito nesta altura), e
  // trocar de corpo não é motivo para reabrir essa conta.
  // ==================================================================
  const P_STAND = {
    hip:       { x:  -6, y: -112 },
    chest:     { x: -14, y: -196 },   // centro do coração
    head:      { x:  -4, y: -286 },
    shBack:    { x:  50, y: -238 },
    shFront:   { x: -62, y: -232 },
    handBack:  { x:  98, y: -140 },
    handFront: { x:-114, y: -130 },
    kneeBack:  { x:  32, y:  -58 },
    kneeFront: { x: -42, y:  -58 },
    footBack:  { x:  34, y:    0 },
    footFront: { x: -52, y:    0 },
  };
  // Curvada para a frente, ofegante: o peito desce e avança para fora da
  // massa do corpo, senão o soco bateria no ombro e não no coração.
  const P_KNEEL = {
    hip:       { x:  14, y:  -76 },
    chest:     { x: -46, y: -150 },   // <- 150px do chão. É a medida do contrato.
    head:      { x: -78, y: -196 },
    shBack:    { x:  12, y: -186 },
    shFront:   { x: -92, y: -168 },
    handBack:  { x: -18, y:  -22 },
    handFront: { x:-140, y:  -20 },
    kneeBack:  { x:  44, y:  -24 },
    kneeFront: { x: -48, y:  -50 },
    footBack:  { x:  38, y:    0 },
    footFront: { x: -76, y:    0 },
  };
  // Lista fixa de juntas: iterar por ela não aloca (as strings são constantes).
  const JOINTS = ['hip', 'chest', 'head', 'shBack', 'shFront',
    'handBack', 'handFront', 'kneeBack', 'kneeFront', 'footBack', 'footFront'];
  const POSE = {};
  for (let i = 0; i < JOINTS.length; i++) POSE[JOINTS[i]] = { x: 0, y: 0 };

  // Caixa do ponto fraco em volta do coração. Larga e alta de propósito: o
  // jogador chega nela pulando, e um alvo estreito exigiria acertar o frame do
  // ápice. Centrada nos 150px do contrato, ela desce até 96px do chão — é essa
  // borda de baixo que faz o pulo CORTADO ainda alcançar o coração.
  const CORE_W = 108, CORE_H = 108;

  const BALL_R = 40;         // raio do rodopio de capa/morcegos (80px de
                             // altura: passa por baixo de um pulo simples de
                             // 118px com folga)
  const ROLL_SPEED = 560;    // rápida, mas telegrafada por quase um segundo
  const ROLL_LEFT = 440;     // quanto ela avança para a esquerda antes de voltar

  // ---------- pools do chefão (pré-alocadas; reset() apaga todas) ----------
  const MAXGARRA = 4;        // garras arremessadas
  const garras = [];
  for (let i = 0; i < MAXGARRA; i++) {
    garras.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0, spin: 0, r: 20 });
  }

  const MAXSPLASH = 5;       // respingo sombrio que sobra onde a garra estoura
  const splashes = [];
  for (let i = 0; i < MAXSPLASH; i++) splashes.push({ active: false, x: 0, y: 0, w: 96, h: 22, t: 0 });

  const MAXFENDA = 8;        // fendas de energia sombria (rachadura -> jorro)
  const fendas = [];
  for (let i = 0; i < MAXFENDA; i++) {
    fendas.push({ active: false, state: 'crack', x: 0, groundY: 0, timer: 0, h: 0, w: 44 });
  }
  const FENDA_H = 150;       // altura do jorro: não dá para pular por cima, dá para sair de perto

  const MAXCACO = 8;         // cacos de lustre/gárgula do grito
  const cacos = [];
  for (let i = 0; i < MAXCACO; i++) {
    cacos.push({ active: false, state: 'shadow', x: 0, y: 0, w: 28, h: 52, vy: 0, timer: 0, groundY: 0 });
  }

  const boss = {
    // --- identidade (o engine lê o nome para a barra de vida) ---
    id: 'draculina',
    nome: 'PATRIÇOLA DRÁCULA',

    // --- contrato lido pelo engine ---
    started: false,
    active: false,
    dead: false,
    hp: 8,
    maxHp: 8,

    // --- geometria (resolvida em runtime, no start/reset) ---
    homeX: 0,        // posto da vampira (lado direito da arena)
    x: 0,            // posição atual (só muda no rodopio)
    groundY: 0,      // chão da arena
    kneel: 0,        // 0..1 — altiva -> curvada (a janela de dano)
    curl: 0,         // 0..1 — corpo -> rodopio de capa/morcegos
    ballSpin: 0,     // rotação do rodopio enquanto avança
    charge: 0,       // 0..1 — brilho sombrio (telegraph visível)
    armRaise: 0,     // 0..1 — braços erguidos antes do grito
    holdRock: 0,     // 0..1 — garra arrancada da sombra e segura antes do arremesso
    shake: 0,        // tremor do próprio corpo (impacto)

    // --- máquina de estados ---
    state: 'dormant', // dormant|intro|idle|giro|arremesso|fenda|grito|exposto|dying
    phase: 0,
    timer: 0,
    attackIndex: 0,
    stunHit: false,
    flash: 0,
    eyeGlow: 0,       // brilho do coração na janela de dano
    safe: 0,          // carência de contato ao sair da janela (ver takeHit)
    dieTimer: 0,
    dieScale: 1,
    victoryFired: false,

    // caixas calculadas por frame (nunca realocadas)
    coreBox: { x: 0, y: 0, w: CORE_W, h: CORE_H },
    bodyBox: { x: 0, y: 0, w: 0, h: 0 },
    ballBox: { x: 0, y: 0, w: BALL_R * 2, h: BALL_R * 2 },

    start() {
      // Grito de vampira + música do boss; 1.2s de intro antes do primeiro ataque.
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
      // Fica longe da parede da direita: curvada ela avança o peito ~90px
      // para a esquerda, e o jogador precisa de chão dos dois lados do coração.
      this.homeX = a.x + a.w - 220;
      this.x = this.homeX;
    },

    reset() {
      // Volta TUDO ao estado inicial (não iniciado), inclusive as pools — uma
      // fenda ou um caco deste chefão não pode sobreviver à troca de fase.
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
      this.curl = 0;
      this.ballSpin = 0;
      this.charge = 0;
      this.armRaise = 0;
      this.holdRock = 0;
      this.shake = 0;
      this.dieTimer = 0;
      this.dieScale = 1;
      this.victoryFired = false;
      for (let i = 0; i < MAXGARRA; i++) garras[i].active = false;
      for (let i = 0; i < MAXSPLASH; i++) splashes[i].active = false;
      for (let i = 0; i < MAXFENDA; i++) fendas[i].active = false;
      for (let i = 0; i < MAXCACO; i++) cacos[i].active = false;
    },

    isPhase2() { return this.hp <= 3; },

    // Recalcula a pose e as caixas. Fica numa função porque o desenho também
    // precisa dela enquanto a vampira dorme (antes do primeiro update).
    refreshPose() {
      const k = this.kneel;
      for (let i = 0; i < JOINTS.length; i++) {
        const j = JOINTS[i];
        POSE[j].x = lerp(P_STAND[j].x, P_KNEEL[j].x, k);
        POSE[j].y = lerp(P_STAND[j].y, P_KNEEL[j].y, k);
      }
      const sc = this.dieScale;
      // coração do peito — o ponto fraco
      const cb = this.coreBox;
      cb.w = CORE_W * sc;
      cb.h = CORE_H * sc;
      cb.x = this.x + POSE.chest.x * sc - cb.w / 2;
      cb.y = this.groundY + POSE.chest.y * sc - cb.h / 2;
      // massa que machuca no contato: do chão até acima da cabeça
      const bb = this.bodyBox;
      const cxLo = Math.min(POSE.hip.x, POSE.head.x), cxHi = Math.max(POSE.hip.x, POSE.head.x);
      bb.x = this.x + (cxLo - 78) * sc;
      bb.w = (cxHi - cxLo + 156) * sc;
      bb.y = this.groundY + (POSE.head.y - 34) * sc;
      bb.h = this.groundY - bb.y;
      // rodopio de capa/morcegos (só vale enquanto ela está enrolada nele)
      const lb = this.ballBox;
      lb.w = BALL_R * 2; lb.h = BALL_R * 2;
      lb.x = this.x - BALL_R;
      lb.y = this.groundY - BALL_R * 2;
    },

    // Fim de ataque: ela cai curvada, ofegante, e a capa se abre no peito.
    // Vem depois de TODOS os ataques — é o que dá ritmo à luta.
    expose(dur) {
      this.state = 'exposto';
      this.timer = dur;
      this.phase = 0;
      this.stunHit = false;
      this.armRaise = 0;
      this.holdRock = 0;
    },

    // Dano no coração
    takeHit() {
      this.hp--;
      this.flash = 0.25;
      this.stunHit = true;
      FG.audio.sfx('bossHit');
      goldBurst(this.coreBox.x + this.coreBox.w / 2, this.coreBox.y + this.coreBox.h / 2, 10, 0);
      // gotas escuras saltam do peito
      for (let i = 0; i < 8; i++) {
        spawnParticle(this.coreBox.x + this.coreBox.w / 2, this.coreBox.y + this.coreBox.h / 2,
          rand(-220, 120), rand(-260, -40), 0.6, 3 + Math.random() * 4, '#5a1420', 900);
      }
      if (this.hp <= 0) {
        // Morte cinematográfica: dead=true JÁ destranca a arena e some a barra.
        this.dead = true;
        this.state = 'dying';
        this.dieTimer = 0;
        this.timer = 0;
      } else {
        // Levanta-se e volta a fechar a capa. O `kneel` NÃO volta a zero de
        // repente: quem acabou de socar está colado no peito dela, e o corpo a
        // materializar-se em cima do jogador seria dano que ele não podia
        // evitar. Sobe interpolado no idle, e a carência abaixo cobre o resto.
        this.state = 'idle';
        this.timer = this.isPhase2() ? 0.7 : 0.85;
        this.safe = 0.6;
      }
    },

    // Núcleo da máquina de estados. Separado do `update` público porque está
    // cheio de `return` antecipado — e as garras e cacos já no ar têm de
    // continuar a andar mesmo nos frames em que o corpo dela não faz nada.
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
        this.dieScale = Math.max(0.1, 1 - k * 0.55);      // afunda e desfaz-se
        this.kneel = Math.min(1, this.kneel + dt * 2.5);  // tomba curvada
        this.curl = Math.max(0, this.curl - dt * 3);      // se estava em rodopio, desfaz
        this.charge = Math.min(1, this.charge + dt * 0.8); // o coração descontrola
        this.shake = 1;
        this.refreshPose();
        // o corpo se desfaz em morcegos e névoa
        if (Math.random() < 0.9) {
          spawnParticle(this.x + rand(-70, 70), this.groundY - rand(0, 240) * this.dieScale,
            rand(-160, 160), rand(-320, -60), 0.8, 3 + Math.random() * 5,
            Math.random() < 0.5 ? '#241016' : '#ff2d3a', 700);
        }
        if (this.dieTimer >= 2.5 && !this.victoryFired) {
          this.victoryFired = true;
          goldBurst(this.x, this.groundY - 120, 40, 5); // o coração estoura em lumis
          FG.audio.sfx('victory');
          FG.engine.setState('victory');
        }
        return;
      }

      if (!this.started) return;

      // ---------- intro ----------
      if (this.state === 'intro') {
        this.timer -= dt;
        // acorda: a capa se agita em pulso e ela treme de leve
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
      const speedMul = p2 ? 0.85 : 1;   // fase 2: intervalos um pouco menores
      const a = FG.level.arena;

      this.timer -= dt;

      if (this.state === 'idle') {
        // levanta-se, fecha a capa, volta ao posto
        this.kneel += (0 - this.kneel) * Math.min(1, dt * 6);
        this.curl += (0 - this.curl) * Math.min(1, dt * 8);
        this.charge += ((p2 ? 0.25 : 0) - this.charge) * Math.min(1, dt * 4);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 4);
        this.eyeGlow = 0;
        if (this.timer <= 0) {
          // O giro abre o ciclo: é a assinatura dela, e a primeira coisa
          // que o jogador tem de aprender a saltar.
          const attacks = ['giro', 'arremesso', 'fenda', 'grito'];
          this.state = attacks[this.attackIndex % 4];
          this.attackIndex++;
          this.phase = 0;
          this.timer = 0;
        }

      } else if (this.state === 'exposto') {
        // ofegante, curvada: a capa se abre e o coração brilha em vermelho vivo
        this.kneel = Math.min(1, this.kneel + dt * 6);
        this.charge += (0 - this.charge) * Math.min(1, dt * 4);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 3);
        this.eyeGlow = 0.6 + 0.4 * Math.sin(FG.engine.time * 12);
        this.refreshPose();
        // névoa fria saindo do peito aberto
        if (Math.random() < 0.4) {
          spawnParticle(this.coreBox.x + this.coreBox.w / 2 + rand(-16, 16),
            this.coreBox.y + this.coreBox.h / 2, rand(-30, 30), rand(-90, -40),
            0.7, 5 + Math.random() * 4, 'rgba(200,180,210,0.5)', -40);
        }
        // soco no coração
        if (!this.stunHit && p.attackBox && p.attackBox.active && ov(p.attackBox, this.coreBox)) {
          this.takeHit();
        }
        // pisão no coração (quica)
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
        return;   // curvada nada machuca no contato: sai antes do teste

      // ================= 1. GIRO (rodopio de capa/morcegos) =================
      } else if (this.state === 'giro') {
        if (this.phase === 0) {
          // telegraph: recolhe-se num rodopio e sibila
          this.phase = 1;
          this.timer = 0.9;
          FG.audio.sfx('bossSpit');
        } else if (this.phase === 1) {
          this.curl = Math.min(1, this.curl + dt * 1.25);
          this.charge = Math.min(1, this.charge + dt * 1.2);
          // morcegos escapando da capa enquanto ela se recolhe
          if (Math.random() < 0.5) {
            spawnParticle(this.x + rand(-50, 50), this.groundY - rand(10, 120),
              rand(-60, 60), rand(-120, -40), 0.5, 4, 'rgba(20,10,16,0.6)', -60);
          }
          if (this.timer <= 0) { this.curl = 1; this.phase = 2; this.timer = 0; }
        } else if (this.phase === 2) {
          // atravessa a arena para a esquerda
          this.x -= ROLL_SPEED * dt;
          this.ballSpin -= (ROLL_SPEED / BALL_R) * dt;
          this.rollDust();
          if (this.x <= Math.max(a.x + 80, this.homeX - ROLL_LEFT)) { this.phase = 3; this.timer = 0.22; }
        } else if (this.phase === 3) {
          // bate, sibila e inverte — o intervalo é a brecha para respirar
          this.rollDust();
          if (this.timer <= 0) { this.phase = 4; this.timer = 0; }
        } else if (this.phase === 4) {
          this.x += ROLL_SPEED * dt;
          this.ballSpin += (ROLL_SPEED / BALL_R) * dt;
          this.rollDust();
          if (this.x >= this.homeX) { this.x = this.homeX; this.phase = 5; this.timer = 0.3; }
        } else if (this.phase === 5) {
          // desenrola e chega ofegante
          this.curl = Math.max(0, this.curl - dt * 3);
          this.charge = Math.max(0, this.charge - dt * 2);
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }

      // ================= 2. ARREMESSO (garras/morcegos) =================
      } else if (this.state === 'arremesso') {
        if (this.phase === 0) {
          // telegraph: agacha e arranca uma garra de sombra com a mão da frente
          this.phase = 1;
          this.timer = 0.9;
        } else if (this.phase === 1) {
          this.kneel = Math.min(0.35, this.kneel + dt * 1.2);   // agacha (sem expor)
          this.holdRock = Math.min(1, this.holdRock + dt * 1.6);
          this.charge = Math.min(0.7, this.charge + dt * 1.0);
          // fiapos de sombra saltando de onde ela arranca a garra
          if (Math.random() < 0.6) {
            const fx = this.x + POSE.handFront.x;
            spawnParticle(fx + rand(-24, 24), this.groundY, rand(-90, 90), rand(-220, -60),
              0.5, 3 + Math.random() * 3, '#3a0f18', 900);
          }
          if (this.timer <= 0) {
            this.throwRock(p.x + p.w / 2);
            if (p2) this.throwRock(p.x + p.w / 2 - 150);  // fase 2: duas garras
            FG.audio.sfx('bossSpit');
            this.holdRock = 0;
            this.phase = 2;
            this.timer = 0.35;
          }
        } else if (this.phase === 2) {
          this.kneel += (0 - this.kneel) * Math.min(1, dt * 5);
          this.charge = Math.max(0, this.charge - dt * 2);
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }

      // ================= 3. FENDA DE ENERGIA SOMBRIA =================
      } else if (this.state === 'fenda') {
        if (this.phase === 0) {
          // Espeta as duas garras no chão e as fendas acendem ANTES de abrir:
          // cada jorro tem 0.9s de aviso, e elas marcham dela até o jogador.
          const n = p2 ? 6 : 4;
          const step = 140;
          let spawned = 0;
          for (let i = 0; i < MAXFENDA && spawned < n; i++) {
            const j = fendas[i];
            if (j.active) continue;
            const jx = this.x - 130 - spawned * step + rand(-18, 18);
            if (jx < a.x + 50) break;              // não jorra dentro da parede
            j.active = true;
            j.state = 'crack';
            j.x = jx;
            j.groundY = groundYAt(jx, 300);
            j.timer = 0.9 + spawned * 0.26;
            j.h = 0;
            spawned++;
          }
          this.phase = 1;
          this.timer = 0.9 + spawned * 0.26 + 0.45;
          this.charge = 0.6;
        } else if (this.phase === 1) {
          this.kneel = Math.min(0.3, this.kneel + dt * 1.5);   // curvada, garras no chão
          this.charge = 0.55 + 0.25 * Math.sin(FG.engine.time * 16);
          if (this.timer <= 0) {
            this.kneel = 0.3;
            this.expose(2.6 * speedMul);
          }
        }

      // ================= 4. GRITO (chandelier / gárgulas) =================
      } else if (this.state === 'grito') {
        if (this.phase === 0) {
          // telegraph: ergue os dois braços por cima da cabeça
          this.phase = 1;
          this.timer = 0.85;
        } else if (this.phase === 1) {
          this.armRaise = Math.min(1, this.armRaise + dt * 1.6);
          this.charge = Math.min(0.8, this.charge + dt * 1.0);
          if (this.timer <= 0) {
            FG.audio.sfx('bossRoar');
            this.armRaise = 0;
            this.shake = 1;
            // onda de névoa dos dois lados do grito
            for (let i = 0; i < 12; i++) {
              spawnParticle(this.x + rand(-90, 90), this.groundY, rand(-260, 260), rand(-320, -80),
                0.6, 4 + Math.random() * 4, '#2a0f18', 900);
            }
            // cacos: sombra no chão bem antes de cada um cair
            const n = p2 ? 5 : 3;
            let spawned = 0;
            for (let i = 0; i < MAXCACO && spawned < n; i++) {
              const s = cacos[i];
              if (s.active) continue;
              s.active = true;
              s.state = 'shadow';
              // espalha pela faixa da arena onde o jogador luta
              s.x = a.x + 90 + (spawned / n) * (a.w - 260) + rand(-30, 30);
              s.groundY = groundYAt(s.x + s.w / 2, 300);
              s.y = s.groundY - 520;
              s.vy = 0;
              s.timer = 0.75 + spawned * 0.2;
              spawned++;
            }
            this.phase = 2;
            this.timer = 0.75 + spawned * 0.2 + 0.65;
          }
        } else if (this.phase === 2) {
          this.charge = Math.max(0, this.charge - dt * 0.8);
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }
      }

      this.refreshPose();

      // ---------- contato com a vampira ----------
      // Enrolada em rodopio ela é um turbilhão; de pé, a massa do corpo/capa
      // machuca. Curvada (kneel) fica inofensiva — é aí que o jogador precisa
      // colar no peito para socar o coração. E entre um e outro há a carência
      // `safe`, em que ela empurra em vez de machucar: sem isso, quem acerta o
      // soco levava dano de graça só por estar onde o soco exige estar.
      if (this.curl > 0.9) {
        if (ov(p, this.ballBox)) p.hurt(1, this.x);
      } else if (this.safe > 0) {
        // Levantando-se: quem acabou de socar o coração está colado no peito
        // dela. Em vez de o esmagar, ela EMPURRA — acertar o ponto fraco não
        // pode custar dano, e um empurrão devolve o jogador ao chão firme sem
        // lhe tirar o controlo (é só velocidade, ninguém é teleportado).
        if (ov(p, this.bodyBox)) {
          const lado = (p.x + p.w / 2) < this.x ? -1 : 1;
          p.vx = lado * 300;
        }
      } else if (this.kneel <= 0.15 && ov(p, this.bodyBox)) {
        p.hurt(1, this.x);
      }
    },

    // Poeira sombria sob o rodopio enquanto ele avança.
    rollDust() {
      if (Math.random() < 0.8) {
        spawnParticle(this.x + rand(-BALL_R, BALL_R), this.groundY, rand(-120, 120), rand(-180, -40),
          0.45, 4 + Math.random() * 3, Math.random() < 0.4 ? '#ff2d3a' : '#2a0f18', 700);
      }
    },

    // Arco alto mirado num x: sobe muito e cai quase na vertical, para o
    // jogador ler a sombra e sair de baixo a tempo.
    throwRock(targetX) {
      let r = null;
      for (let i = 0; i < MAXGARRA; i++) if (!garras[i].active) { r = garras[i]; break; }
      if (!r) return;
      const g = GRAV * 0.85;
      const vy = -720;
      const tFly = (-2 * vy) / g;              // tempo até voltar à altura de saída
      r.active = true;
      r.x = this.x + POSE.handFront.x;
      r.y = this.groundY + POSE.handFront.y - 20;
      r.px = r.x; r.py = r.y;
      r.vx = Math.max(-560, Math.min(160, (targetX - r.x) / tFly));
      r.vy = vy;
      r.spin = 0;
      r.r = 20;
    },

    // O que o engine chama (via FG.enemies). Corpo primeiro, perigos depois.
    update(dt) {
      this.step(dt);
      // As garras e cacos continuam vivos durante a morte: o que já estava no
      // ar não pode evaporar no frame em que a vampira se desfaz.
      if (this.started || this.dead) updateBossStuff(dt);
    },

    draw(ctx, cam) {
      drawVampira(ctx, cam);
      drawBossStuff(ctx, cam);
    },
  };

  // ==================================================================
  // Garras, respingos, fendas e cacos
  // ==================================================================
  // Caixa de rascunho reaproveitada nos testes de colisão: garra e fenda são
  // desenhados como círculo/coluna, mas colidem como retângulo — e alocar um
  // objeto por frame para isso é lixo que o coletor teria de varrer.
  const scratch = { x: 0, y: 0, w: 0, h: 0 };

  function updateBossStuff(dt) {
    const p = FG.player;
    const ov = FG.engine.rectsOverlap;
    const a = FG.level.arena;
    // "Nada machuca durante a janela" vale para o chefão INTEIRO, não só para
    // o corpo dela: a garra ainda no ar e o respingo que sobrou no chão apagam
    // o dano enquanto ela está curvada. Sem isto, o jogador que corre para
    // socar o coração apanha do ataque que acabou de esquivar — e a janela
    // deixa de ser janela. Continuam a ser desenhadas: só não ferem.
    const janela = boss.state === 'exposto';

    // ---- garras arremessadas (arco alto, estouram em respingo sombrio) ----
    for (let i = 0; i < MAXGARRA; i++) {
      const r = garras[i];
      if (!r.active) continue;
      r.px = r.x; r.py = r.y;
      r.vy += GRAV * 0.85 * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.spin += dt * 6;
      if (Math.random() < 0.5) {
        spawnParticle(r.x, r.y, rand(-30, 30), rand(-40, 20), 0.35, 3, '#ff2d3a', 0);
      }
      const gy = groundYAt(r.x, 300);
      scratch.x = r.x - r.r; scratch.y = r.y - r.r; scratch.w = r.r * 2; scratch.h = r.r * 2;
      if (r.y + r.r >= gy) {
        r.active = false;
        burstRock(r.x, gy);
      } else if (!janela && ov(p, scratch)) {
        r.active = false;
        p.hurt(1, r.x);
        burstRock(r.x, gy);
      }
      if (r.x < a.x - 120 || r.x > a.x + a.w + 120) r.active = false;
    }

    // ---- respingo sombrio deixado pelas garras ----
    for (let i = 0; i < MAXSPLASH; i++) {
      const b = splashes[i];
      if (!b.active) continue;
      b.t -= dt;
      if (b.t <= 0) { b.active = false; continue; }
      if (Math.random() < 0.4) {
        spawnParticle(b.x + rand(0, b.w), b.y + b.h, rand(-20, 20), rand(-110, -50), 0.4, 3.5, '#8a1030', 0);
      }
      if (!janela && ov(p, b)) p.hurt(1, b.x + b.w / 2);
    }

    // ---- fendas de energia sombria (rachadura acende, depois jorra) ----
    for (let i = 0; i < MAXFENDA; i++) {
      const j = fendas[i];
      if (!j.active) continue;
      j.timer -= dt;
      if (j.state === 'crack') {
        // faísca roxa escapando da rachadura: o aviso é visual e sonoro-visual
        if (Math.random() < 0.35) {
          spawnParticle(j.x + rand(-18, 18), j.groundY - 2, rand(-25, 25), rand(-90, -30),
            0.4, 3, '#a020ff', 200);
        }
        if (j.timer <= 0) {
          j.state = 'up';
          j.timer = 0.55;
          j.h = 20;
          FG.audio.sfx('bossSpit');
        }
      } else {
        // sobe rápido, segura e afunda
        const k = 1 - Math.max(0, j.timer) / 0.55;
        j.h = FENDA_H * (k < 0.25 ? k / 0.25 : (k > 0.75 ? (1 - k) / 0.25 : 1));
        if (Math.random() < 0.7) {
          spawnParticle(j.x + rand(-14, 14), j.groundY - j.h, rand(-50, 50), rand(-180, -60),
            0.5, 4, '#c060ff', 500);
        }
        scratch.x = j.x - j.w / 2; scratch.y = j.groundY - j.h; scratch.w = j.w; scratch.h = j.h;
        if (!janela && j.h > 12 && ov(p, scratch)) p.hurt(1, j.x);
        if (j.timer <= 0) j.active = false;
      }
    }

    // ---- cacos de lustre/gárgula (sombra antes de cair) ----
    for (let i = 0; i < MAXCACO; i++) {
      const s = cacos[i];
      if (!s.active) continue;
      if (s.state === 'shadow') {
        s.timer -= dt;
        if (s.timer <= 0) { s.state = 'fall'; s.vy = 80; }
      } else {
        s.vy += GRAV * 1.1 * dt;
        s.y += s.vy * dt;
        if (!janela && ov(p, s)) {
          s.active = false;
          p.hurt(1, s.x + s.w / 2);
          continue;
        }
        if (s.y + s.h >= s.groundY) {
          s.active = false;
          for (let k = 0; k < 5; k++) {
            spawnParticle(s.x + s.w / 2, s.groundY, rand(-90, 90), rand(-160, -40),
              0.4, 4, 'rgba(180,150,190,0.85)', 500);
          }
        }
      }
    }
  }

  // Garra batendo no chão: estilhaço + poça de respingo sombrio curta.
  function burstRock(x, gy) {
    for (let i = 0; i < 10; i++) {
      spawnParticle(x, gy - 6, rand(-220, 220), rand(-300, -60), 0.6, 3 + Math.random() * 4,
        Math.random() < 0.5 ? '#ff2d3a' : '#2a0f18', 900);
    }
    for (let i = 0; i < MAXSPLASH; i++) {
      const b = splashes[i];
      if (b.active) continue;
      b.active = true;
      b.x = x - b.w / 2;
      b.y = gy - b.h;
      b.t = 1.1;
      break;
    }
  }

  // ==================================================================
  // DESENHO — tudo canvas puro
  // ==================================================================

  // Silhueta orgânica: polígono irregular com uma tabela FIXA de variações,
  // para a capa/corpo não ferver de frame em frame. Ondulações mais suaves
  // que a pedra do golem — é pano, não rocha.
  const BLOB_N = 9;
  const BLOB_JAG = [1.0, 0.9, 1.06, 0.94, 1.04, 0.9, 1.08, 0.95, 1.0];
  function shapeBlob(ctx, cx, cy, rx, ry, rot) {
    ctx.beginPath();
    for (let i = 0; i < BLOB_N; i++) {
      const ang = rot + (i / BLOB_N) * Math.PI * 2;
      const j = BLOB_JAG[i];
      const x = cx + Math.cos(ang) * rx * j;
      const y = cy + Math.sin(ang) * ry * j;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // Membro: um tronco de cone entre duas juntas — braço, perna, dobra de capa.
  function shapeLimb(ctx, ax, ay, bx, by, w0, w1) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(ax + nx * w0, ay + ny * w0);
    ctx.lineTo(bx + nx * w1, by + ny * w1);
    ctx.lineTo(bx - nx * w1, by - ny * w1);
    ctx.lineTo(ax - nx * w0, ay - ny * w0);
    ctx.closePath();
  }

  // Dobras da capa, em unidades do próprio tronco (-1..1). Constantes:
  // desenhar sempre as mesmas é o que faz o pano parecer pano, e não ruído.
  const DOBRAS = [
    [-0.55, -0.75, -0.22, -0.3, -0.5, 0.1, -0.2, 0.62],
    [0.5, -0.72, 0.22, -0.26, 0.48, 0.2, 0.18, 0.7],
    [-0.85, 0.08, -0.34, 0.02, 0.14, 0.34],
    [0.2, -0.9, 0.05, -0.5],
  ];

  function drawVampira(ctx, cam) {
    // culling: a vampira vive na arena; só desenha se ela está perto da câmera
    const VIEW_W = FG.enemies.fx.VIEW_W;
    const a = FG.level.arena;
    if (cam.x + VIEW_W < a.x - 200 || cam.x > a.x + a.w + 200) return;
    if (!boss.started && !boss.dead) {
      // dormindo: o update ainda não correu, mas a pose tem de existir
      boss.resolveGeometry();
      boss.refreshPose();
    }

    const t = FG.engine.time;
    const dying = boss.state === 'dying';
    if (dying && boss.dieTimer >= 2.5) return;   // já se desfez

    const sh = boss.shake * (dying ? 5 : 3);
    const X = boss.x - cam.x + (sh > 0 ? rand(-sh, sh) : 0);
    const GY = boss.groundY - cam.y + (sh > 0 ? rand(-sh * 0.5, sh * 0.5) : 0);
    const p2 = boss.isPhase2();
    // fúria global: fase 2 acende a vampira toda, e o telegraph acende mais
    const heat = Math.min(1, boss.charge + (p2 ? 0.3 : 0) + (dying ? 0.6 : 0));

    ctx.save();
    ctx.translate(X, GY);

    // sombra no chão (some quando ela se recolhe no rodopio)
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#0a0308';
    ctx.beginPath();
    ctx.ellipse(0, -3, 96 * boss.dieScale, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.scale(boss.dieScale, boss.dieScale);

    if (boss.curl < 0.985) {
      ctx.save();
      ctx.globalAlpha = 1 - boss.curl;
      // recolher para o rodopio: espremido na horizontal e achatado
      const sq = 1 - boss.curl * 0.45;
      ctx.scale(sq, sq);
      drawBody(ctx, t, heat, dying);
      ctx.restore();
    }
    if (boss.curl > 0.02) drawBall(ctx, t, heat);

    ctx.restore();
  }

  // O corpo montado a partir da pose. A ordem importa: braço de trás, pernas,
  // capa/tronco, cabeça, braço da frente — é o que dá profundidade sem sombra
  // falsa.
  function drawBody(ctx, t, heat, dying) {
    const breathe = boss.active && !dying ? Math.sin(t * 2.2) * 2 : 0;
    const rise = boss.armRaise;   // braços por cima da cabeça (telegraph do grito)

    // ombros e mãos: o grito ergue os dois braços
    const shB = POSE.shBack, shF = POSE.shFront;
    const handBx = lerp(POSE.handBack.x, shB.x + 26, rise);
    const handBy = lerp(POSE.handBack.y, shB.y - 92, rise);
    const handFx = lerp(POSE.handFront.x, shF.x - 20, rise);
    const handFy = lerp(POSE.handFront.y, shF.y - 100, rise);

    // pele pálida para braços/pernas/cabeça
    const pele = ctx.createLinearGradient(0, -300, 0, 0);
    pele.addColorStop(0, '#e6d6d2');
    pele.addColorStop(0.55, '#cbb4b2');
    pele.addColorStop(1, '#8f6e6e');

    // capa vermelha: a massa visual principal, ocupa o lugar da armadura do golem
    const capa = ctx.createLinearGradient(0, -300, 0, 0);
    capa.addColorStop(0, '#a41326');
    capa.addColorStop(0.55, '#7a0c1c');
    capa.addColorStop(1, '#3d0510');

    // ---- braço de trás (pele fina, garra comprida) ----
    ctx.fillStyle = pele;
    shapeLimb(ctx, shB.x, shB.y + breathe, handBx, handBy, 13, 9);
    ctx.fill();
    drawClaw(ctx, handBx, handBy, 0.55, false);

    // ---- pernas (magras, botas escuras) ----
    ctx.fillStyle = pele;
    shapeLimb(ctx, POSE.hip.x + 12, POSE.hip.y, POSE.kneeBack.x, POSE.kneeBack.y, 15, 12);
    ctx.fill();
    shapeLimb(ctx, POSE.hip.x - 12, POSE.hip.y, POSE.kneeFront.x, POSE.kneeFront.y, 16, 13);
    ctx.fill();
    ctx.fillStyle = '#180a10';
    shapeLimb(ctx, POSE.kneeBack.x, POSE.kneeBack.y, POSE.footBack.x, POSE.footBack.y, 12, 15);
    ctx.fill();
    shapeLimb(ctx, POSE.kneeFront.x, POSE.kneeFront.y, POSE.footFront.x, POSE.footFront.y, 13, 16);
    ctx.fill();
    // botas: bico fino
    shapeBlob(ctx, POSE.footBack.x, POSE.footBack.y - 8, 20, 10, 0.2);
    ctx.fill();
    shapeBlob(ctx, POSE.footFront.x, POSE.footFront.y - 8, 22, 11, 1.1);
    ctx.fill();

    // ---- capa: a massa principal do tronco, fluida e comprida ----
    const tcx = lerp(POSE.hip.x, POSE.chest.x, 0.55);
    const tcy = lerp(POSE.hip.y, POSE.chest.y, 0.55) + breathe;
    const trx = 68, tryy = 92;
    ctx.fillStyle = capa;
    shapeBlob(ctx, tcx, tcy, trx, tryy, 0.35);
    ctx.fill();
    // forro escarlate mais claro por dentro, onde a capa se abre
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#e02540';
    shapeBlob(ctx, tcx - 6, tcy - 14, trx * 0.68, tryy * 0.58, 0.35);
    ctx.fill();
    ctx.restore();

    // veias sombrias pulsando pelo peito (equivalente das rachaduras acesas)
    drawVeins(ctx, tcx, tcy, trx, tryy, heat, t);

    // ---- ombreiras da capa (gola alta) ----
    ctx.fillStyle = capa;
    shapeBlob(ctx, shB.x, shB.y + breathe, 26, 22, 0.9);
    ctx.fill();
    shapeBlob(ctx, shF.x, shF.y + breathe, 28, 24, 2.1);
    ctx.fill();

    // ---- cabeça: pele pálida, cabelo preto espetado, olhos vermelhos, boca
    // aberta rosnando com presas à mostra ----
    const hx = POSE.head.x, hy = POSE.head.y + breathe;
    ctx.fillStyle = pele;
    shapeBlob(ctx, hx, hy, 26, 27, 0.4);
    ctx.fill();
    // queixo/maxilar aberto, saliente para a frente
    ctx.beginPath();
    ctx.moveTo(hx - 24, hy + 6);
    ctx.lineTo(hx + 10, hy + 8);
    ctx.lineTo(hx + 6, hy + 24);
    ctx.lineTo(hx - 20, hy + 22);
    ctx.closePath();
    ctx.fill();
    // boca escancarada rosnando: fenda escura com presas brancas
    ctx.fillStyle = '#180509';
    ctx.beginPath();
    ctx.moveTo(hx - 18, hy + 12);
    ctx.lineTo(hx + 4, hy + 13);
    ctx.lineTo(hx + 2, hy + 21);
    ctx.lineTo(hx - 15, hy + 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff8ee';
    ctx.beginPath();
    ctx.moveTo(hx - 14, hy + 13);
    ctx.lineTo(hx - 10, hy + 13);
    ctx.lineTo(hx - 12, hy + 19);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx - 2, hy + 13.5);
    ctx.lineTo(hx + 2, hy + 13.5);
    ctx.lineTo(hx, hy + 19.5);
    ctx.closePath();
    ctx.fill();
    // cabelo preto espetado/desgrenhado: mechas triangulares por cima da cabeça
    ctx.fillStyle = '#0c0710';
    const nMechas = 6;
    for (let i = 0; i < nMechas; i++) {
      const ang = -Math.PI * 0.72 + (i / (nMechas - 1)) * Math.PI * 0.62;
      const bx = hx + Math.cos(ang) * 6, by = hy - 6 + Math.sin(ang) * 6;
      const tipx = hx + Math.cos(ang) * (30 + (i % 2) * 10);
      const tipy = hy - 6 + Math.sin(ang) * (30 + (i % 2) * 10) - 8;
      ctx.beginPath();
      ctx.moveTo(bx - 5, by);
      ctx.lineTo(tipx, tipy);
      ctx.lineTo(bx + 5, by);
      ctx.closePath();
      ctx.fill();
    }
    // olhos: fendas de brasa vermelha viva, sempre acesos (não só no heat)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const eg = 0.7 + 0.3 * heat;
    ctx.fillStyle = 'rgba(255,20,40,' + eg.toFixed(3) + ')';
    ctx.fillRect(hx - 20, hy - 5, 13, 5);
    ctx.fillRect(hx - 2, hy - 4, 11, 4.5);
    ctx.restore();

    // ---- braço da frente (por cima do tronco), garra comprida e afiada ----
    ctx.fillStyle = pele;
    shapeLimb(ctx, shF.x, shF.y + breathe, handFx, handFy, 15, 10);
    ctx.fill();
    drawClaw(ctx, handFx, handFy, 1.7, true);
    // a garra arrancada da sombra, presa na mão da frente
    if (boss.holdRock > 0.02) {
      const k = boss.holdRock;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = '#2a0f18';
      shapeBlob(ctx, handFx - 6, handFy - 26 * k, 18 * k, 16 * k, 0.8);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,20,40,0.35)';
      shapeBlob(ctx, handFx - 6, handFy - 26 * k, 12 * k, 10 * k, 2.0);
      ctx.fill();
      ctx.restore();
    }

    // ---- o coração do peito: o ponto fraco ----
    drawCore(ctx, POSE.chest.x, POSE.chest.y + breathe, t, heat);

    // flash branco ao levar dano (por cima de tudo, na silhueta da capa)
    if (boss.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, boss.flash * 4) * 0.5;
      ctx.fillStyle = '#fff';
      shapeBlob(ctx, tcx, tcy, trx, tryy, 0.35);
      ctx.fill();
      ctx.restore();
    }
  }

  // Mão com garras longas e afiadas na ponta.
  function drawClaw(ctx, x, y, rot, front) {
    ctx.save();
    ctx.fillStyle = front ? '#dcc8c4' : '#c8b0ac';
    ctx.beginPath();
    ctx.arc(x, y, front ? 14 : 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4ece6';
    const n = 4;
    for (let i = 0; i < n; i++) {
      const ang = rot + (i / (n - 1) - 0.5) * 1.1;
      const bx = x + Math.cos(ang) * 6, by = y + Math.sin(ang) * 6;
      const len = front ? 22 : 17;
      const tipx = x + Math.cos(ang) * (6 + len), tipy = y + Math.sin(ang) * (6 + len);
      const nx = -Math.sin(ang) * 2.2, ny = Math.cos(ang) * 2.2;
      ctx.beginPath();
      ctx.moveTo(bx + nx, by + ny);
      ctx.lineTo(tipx, tipy);
      ctx.lineTo(bx - nx, by - ny);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVeins(ctx, cx, cy, rx, ry, heat, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.35 + 0.65 * heat * (0.75 + 0.25 * Math.sin(t * 7));
    ctx.strokeStyle = 'rgba(255,20,50,' + pulse.toFixed(3) + ')';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < DOBRAS.length; i++) {
      const c = DOBRAS[i];
      ctx.beginPath();
      for (let k = 0; k < c.length; k += 2) {
        const x = cx + c[k] * rx, y = cy + c[k + 1] * ry;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // veio mais fino por dentro
    ctx.strokeStyle = 'rgba(255,180,190,' + (pulse * 0.5).toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < DOBRAS.length; i++) {
      const c = DOBRAS[i];
      ctx.beginPath();
      for (let k = 0; k < c.length; k += 2) {
        const x = cx + c[k] * rx, y = cy + c[k + 1] * ry;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // O coração: fechado é uma fresta entre as pregas da capa; na janela de dano
  // as pregas deslizam e o coração fica à mostra, vermelho vivo e pulsando.
  function drawCore(ctx, cx, cy, t, heat) {
    const open = boss.kneel;                  // abre junto com o curvar-se
    const glow = boss.eyeGlow;
    const r = 20 + 12 * open;

    // pregas da capa, afastando-se ao abrir
    ctx.save();
    ctx.fillStyle = '#2a0d16';
    const off = 6 + 16 * open;
    ctx.beginPath();
    ctx.moveTo(cx - 46, cy - 30 - off * 0.4);
    ctx.lineTo(cx + 4, cy - 40 - off);
    ctx.lineTo(cx + 30, cy - 12 - off);
    ctx.lineTo(cx - 26, cy - 6 - off * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 46, cy + 30 + off * 0.4);
    ctx.lineTo(cx + 6, cy + 40 + off);
    ctx.lineTo(cx + 30, cy + 12 + off);
    ctx.lineTo(cx - 26, cy + 6 + off * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // o coração
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beat = 1 + 0.08 * Math.sin(t * (open > 0.5 ? 9 : 5));
    const rr = r * beat;
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rr * 2.4);
    // fechado é vermelho-rosado; aberto na janela ele acende para vermelho vivo
    g.addColorStop(0, open > 0.5 ? 'rgba(255,220,225,0.95)' : 'rgba(255,200,205,0.9)');
    g.addColorStop(0.35, open > 0.5 ? 'rgba(255,20,45,0.85)' : 'rgba(230,30,60,0.75)');
    g.addColorStop(1, 'rgba(200,10,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // anel de alvo pulsando: só na janela, e é o convite para socar
    if (glow > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 14);
      ctx.strokeStyle = '#ffb0c0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, CORE_W * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // O rodopio de capa/morcegos do ataque de giro: uma massa turbilhonante,
  // vermelha por fora e escura por dentro, com "asas" de morcego riscando.
  function drawBall(ctx, t, heat) {
    const R = BALL_R * boss.curl;
    const cy = -BALL_R;
    ctx.save();
    ctx.translate(0, cy);
    ctx.rotate(boss.ballSpin);
    const g = ctx.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.15, 0, 0, R);
    g.addColorStop(0, '#9c1428');
    g.addColorStop(0.7, '#42081a');
    g.addColorStop(1, '#140208');
    ctx.fillStyle = g;
    shapeBlob(ctx, 0, 0, R, R, 0);
    ctx.fill();
    // recortes de asa de morcego girando com o rodopio
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,20,50,' + (0.5 + 0.5 * heat).toFixed(3) + ')';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.66, 0.3, 2.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.9, 3.5, 5.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-R * 0.8, R * 0.2);
    ctx.lineTo(R * 0.3, -R * 0.5);
    ctx.stroke();
    // silhuetas de morcego pontuais na borda
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0c0308';
    for (let i = 0; i < 3; i++) {
      const ang = i * 2.1;
      const bx = Math.cos(ang) * R * 0.75, by = Math.sin(ang) * R * 0.75;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(-2, -4);
      ctx.lineTo(0, -1);
      ctx.lineTo(2, -4);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawBossStuff(ctx, cam) {
    const t = FG.engine.time;
    const VIEW_W = FG.enemies.fx.VIEW_W;
    const xMin = cam.x - 120, xMax = cam.x + VIEW_W + 120;

    // ---- sombras e cacos de lustre/gárgula ----
    for (let i = 0; i < MAXCACO; i++) {
      const s = cacos[i];
      if (!s.active) continue;
      if (s.x < xMin || s.x > xMax) continue;
      const cx = s.x + s.w / 2 - cam.x;
      if (s.state === 'shadow') {
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.25 * Math.sin(t * 14);
        ctx.fillStyle = '#0a0612';
        ctx.beginPath();
        ctx.ellipse(cx, s.groundY - cam.y - 4, 24, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(cx, s.y - cam.y);
        const g = ctx.createLinearGradient(0, 0, 0, s.h);
        g.addColorStop(0, '#4a3f4c');
        g.addColorStop(1, '#180f1c');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-s.w / 2, 0);
        ctx.lineTo(s.w / 2, 0);
        ctx.lineTo(1, s.h);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(200,60,140,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-4, 4);
        ctx.lineTo(2, s.h * 0.7);
        ctx.stroke();
        ctx.restore();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // ---- fendas e jorros de energia sombria ----
    for (let i = 0; i < MAXFENDA; i++) {
      const j = fendas[i];
      if (!j.active) continue;
      if (j.x < xMin || j.x > xMax) continue;
      const jx = j.x - cam.x, gy = j.groundY - cam.y;
      if (j.state === 'crack') {
        // a rachadura acende antes de abrir — este é o telegraph do ataque
        const k = Math.max(0, 1 - j.timer / 0.9);
        ctx.globalAlpha = 0.35 + 0.65 * k * (0.7 + 0.3 * Math.sin(t * 18));
        const g = ctx.createRadialGradient(jx, gy - 2, 2, jx, gy - 2, 40);
        g.addColorStop(0, 'rgba(230,180,255,0.95)');
        g.addColorStop(0.5, 'rgba(160,30,220,0.6)');
        g.addColorStop(1, 'rgba(90,10,150,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(jx, gy - 2, 34 * (0.5 + 0.5 * k), 9, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = 1;
        const g = ctx.createLinearGradient(0, gy, 0, gy - j.h);
        g.addColorStop(0, 'rgba(230,190,255,0.95)');
        g.addColorStop(0.5, 'rgba(180,40,230,0.85)');
        g.addColorStop(1, 'rgba(120,10,180,0.15)');
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

    // ---- garras no ar (com rastro) ----
    for (let i = 0; i < MAXGARRA; i++) {
      const r = garras[i];
      if (!r.active) continue;
      if (r.x < xMin || r.x > xMax) continue;
      const rx = r.x - cam.x, ry = r.y - cam.y;
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#ff2d50';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r.px - cam.x, r.py - cam.y);
      ctx.lineTo(rx, ry);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(rx, ry, 2, rx, ry, r.r * 1.6);
      g.addColorStop(0, 'rgba(255,80,110,0.55)');
      g.addColorStop(1, 'rgba(200,10,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(rx, ry, r.r * 1.6, 0, Math.PI * 2);
      ctx.fill();
      // a garra em si é opaca: sai do modo aditivo por um instante
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(rx, ry);
      ctx.rotate(r.spin);
      ctx.fillStyle = '#e8dcd8';
      shapeBlob(ctx, 0, 0, r.r * 0.7, r.r * 0.5, 0);
      ctx.fill();
      ctx.fillStyle = '#f4ece6';
      for (let k = 0; k < 3; k++) {
        const ang = (k / 2 - 0.5) * 1.1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * 4, Math.sin(ang) * 4);
        ctx.lineTo(Math.cos(ang) * r.r, Math.sin(ang) * r.r);
        ctx.lineTo(Math.cos(ang + 0.15) * 4, Math.sin(ang + 0.15) * 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // ---- respingo sombrio no chão ----
    for (let i = 0; i < MAXSPLASH; i++) {
      const b = splashes[i];
      if (!b.active) continue;
      if (b.x < xMin || b.x > xMax) continue;
      ctx.globalAlpha = Math.min(1, b.t / 0.4);
      const bx = b.x - cam.x, by = b.y - cam.y;
      const g = ctx.createLinearGradient(0, by, 0, by + b.h);
      g.addColorStop(0, 'rgba(220,40,80,0.9)');
      g.addColorStop(1, 'rgba(120,10,40,0.45)');
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

  // Única linha de load deste arquivo: entrega a vampira ao registro de
  // chefões. Quem escolhe qual entra em cena é FG.enemies.reset(), pelo
  // bossId da fase.
  FG.enemies.registerBoss('draculina', boss);
})();
