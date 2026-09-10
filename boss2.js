// Fagulho: Lendas do Bosque — boss2.js
// Chefão da fase 2: SANDROLA BAFO DE SAPO. Reconstruída do zero para deixar
// de parecer o antigo LODÃO deitado/atolado (uma corcova de lesma e uma
// cabeçorra lado a lado, na mesma altura) e virar uma figura HUMANOIDE EM PÉ,
// fiel à referência: zumbi loira de frente, pernas retas, tronco ereto,
// cabeça no topo do pescoço, braços caídos ao lado do corpo. Pele pálida,
// olhos pretos quadrados de estática com quadradinho branco descentralizado,
// boca aberta com dentes em grade + toque vermelho no canto, cabelo liso
// amarelo-ouro repartido no meio caindo dos dois lados até o peito, gola alta
// verde-escura, casaco/blusa teal de manga comprida com 2 botões, calça jeans
// azul, botas azuis. Ela continua com os pés na lama do pântano — isso é
// tema, não postura.
//
// A técnica de corpo é a MESMA do boss3.js (Patriçola): um RIG DE JUNTAS com
// duas poses (P_STAND ereta, P_KNEEL curvada/exposta) interpoladas por lerp,
// membros desenhados como troncos de cone entre juntas (shapeLimb). A ÚNICA
// diferença deliberada é o tronco: em vez da silhueta facetada tipo pedra
// (shapeBlob/"jags", que lê como armadura de cristal), o casaco dela usa a
// elipse LISA com gradiente (`blob()`, o mesmo tijolo do boss1.js) — pano de
// zumbi, não rocha.
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
  const lerp = (a, b, k) => a + (b - a) * k;

  // ==================================================================
  // ARMAÇÃO — as juntas da zumbi, EM PÉ. Coordenadas locais: x cresce para a
  // direita, y sobe negativo a partir da planta dos pés (que assenta em
  // boss.groundY). Ela encara a ESQUERDA, de onde o jogador chega — "front" é
  // o lado dos x negativos, sem espelhamento nenhum no desenho. Mesma técnica
  // de rig do boss3.js (duas poses, lerp), números próprios desta figura.
  // ==================================================================
  const P_STAND = {
    hip:       { x:   0, y: -110 },
    chest:     { x:  -6, y: -200 },   // base do pescoço/gola — perto da papada
    head:      { x: -10, y: -290 },
    shBack:    { x:  46, y: -240 },
    shFront:   { x: -58, y: -236 },
    handBack:  { x:  50, y: -108 },
    handFront: { x: -62, y: -106 },
    kneeBack:  { x:  24, y:  -56 },
    kneeFront: { x: -30, y:  -56 },
    footBack:  { x:  26, y:    0 },
    footFront: { x: -34, y:    0 },
  };
  // Curvada para a frente, ofegante: pescoço/peito avançam e descem, expondo
  // a bolsa de garganta na altura do soco — mesma lógica do coração do
  // boss3.js, só que aqui é a papada.
  const P_KNEEL = {
    hip:       { x:  12, y:  -82 },
    chest:     { x: -40, y: -156 },   // <- perto de 156px do chão, o contrato.
    head:      { x: -78, y: -202 },
    shBack:    { x:  16, y: -190 },
    shFront:   { x: -82, y: -172 },
    handBack:  { x: -12, y:  -28 },
    handFront: { x:-118, y:  -24 },
    kneeBack:  { x:  40, y:  -30 },
    kneeFront: { x: -40, y:  -56 },
    footBack:  { x:  36, y:    0 },
    footFront: { x: -68, y:    0 },
  };
  const JOINTS = ['hip', 'chest', 'head', 'shBack', 'shFront',
    'handBack', 'handFront', 'kneeBack', 'kneeFront', 'footBack', 'footFront'];
  const POSE = {};
  for (let i = 0; i < JOINTS.length; i++) POSE[JOINTS[i]] = { x: 0, y: 0 };

  // O ponto fraco: a bolsa de garganta pendurada sob o queixo (o "bafo de
  // sapo" que ela solta, mesmo sem cara de sapo mais). Na janela de dano ela
  // incha de veneno e AFUNDA — é isso que a traz para a altura do soco. Os
  // dois números abaixo são o coração do balanceamento e estão medidos, não
  // chutados — MANTIDOS iguais ao antigo LODÃO para não desbalancear a luta:
  //   centro a 100px do chão, caixa de 96 de altura  →  52..148 acima do chão.
  // O attackBox do player (34x30, no meio de um corpo de 44) cobre
  // [alturaDoPulo+7 .. alturaDoPulo+37] acima do chão, logo qualquer pulo
  // entre ~15px e ~141px acerta: o pulo simples é 118px e o pulo cortado no
  // primeiro frame é ~30px — os dois entram, que é o que o contrato exige.
  // Diferente do LODÃO: em vez de fixa num x deslocado do rosto, ela agora
  // acompanha o x do peito/pescoço da pose (POSE.chest.x), centrada na
  // figura em pé — não mais jogada para o lado.
  const PAPADA_HIGH = 156;   // altura do centro com a bolsa recolhida
  const PAPADA_LOW = 100;    // ... e com ela pendurada na janela de dano
  const WEAK_W = 104, WEAK_H = 96;

  // Massas que machucam no contato fora da janela, calculadas por frame a
  // partir da pose atual (ver refreshPose): dos pés até acima da cabeça.
  const HEAD_HULL_W = 168, HEAD_HULL_H = 150;   // em volta da cabeça
  const BODY_HULL_PAD = 66;                     // folga lateral do tronco/braços

  const TONGUE_H = 30;       // língua rasteira: topo a 38px do chão
  const TONGUE_Y = 38;
  const TONGUE_REACH = 780;  // atravessa a arena inteira até o lado do jogador

  // ---------- pools da SANDROLA (jorros, poças, bolhas, ondas) ----------
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

  const boss = {
    // --- identidade (o engine lê o nome para a barra de vida) ---
    id: 'sandrola',
    nome: 'SANDROLA BAFO DE SAPO',

    // --- contrato lido pelo engine ---
    started: false,
    active: false,
    dead: false,
    hp: 8,
    maxHp: 8,

    // --- geometria (resolvida em runtime, no start/reset) ---
    homeX: 0,        // o atoleiro dela, no fundo da arena
    x: 0,            // posição atual
    groundY: 0,      // chão da arena
    bodyY: 0,        // linha do corpo = groundY - hop (sobe quando ela salta)
    hop: 0,          // altura do salto do baque de cajado
    hopV: 0,

    // --- animação / telegraphs ---
    kneel: 0,        // 0..1 — ereta -> curvada (interpola P_STAND -> P_KNEEL)
    sag: 0,          // 0..1 — bolsa de garganta pendurada (a janela de dano)
    puff: 0,         // 0..1 — bolsa inflada (telegraph da língua)
    charge: 0,       // 0..1 — goela acesa de veneno (telegraph do bafo)
    squash: 0,       // 0..1 — agachada (telegraph do baque de cajado)
    glow: 0,         // brilho do ponto fraco na janela
    melt: 0,         // 0..1 — derretimento da morte

    // --- máquina de estados ---
    state: 'dormant', // dormant|intro|idle|bafo|lingua|baque|bolhas|exposto|dying
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
      // Coaxo-cacarejo de intro + música do boss; 1.2s antes do primeiro ataque.
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
      // Atolada no fundo: o eixo dela fica a 230px da parede direita, o que
      // deixa a bolsa de garganta por volta de x-260 e a metade esquerda da
      // arena livre para o jogador desviar.
      this.homeX = a.x + a.w - 230;
      this.x = this.homeX;
      this.bodyY = this.groundY;
      this.refreshPose();
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
      this.kneel = 0;
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

    // Recalcula a pose (P_STAND <-> P_KNEEL por `kneel`) e as caixas vivas.
    // Fica numa função porque o desenho também precisa dela enquanto a
    // SANDROLA dorme (antes do primeiro update).
    refreshPose() {
      const k = this.kneel;
      for (let i = 0; i < JOINTS.length; i++) {
        const j = JOINTS[i];
        POSE[j].x = lerp(P_STAND[j].x, P_KNEEL[j].x, k);
        POSE[j].y = lerp(P_STAND[j].y, P_KNEEL[j].y, k);
      }
      // cabeça: caixa de contato em volta da cabeça da pose atual
      const hb = this.headBox;
      hb.w = HEAD_HULL_W; hb.h = HEAD_HULL_H;
      hb.x = this.x + POSE.head.x - hb.w / 2;
      hb.y = this.bodyY + POSE.head.y - hb.h * 0.55;
      // corpo: do quadril até acima da cabeça, com folga lateral pros braços
      const bb = this.bodyBox;
      const xLo = Math.min(POSE.hip.x, POSE.head.x, POSE.handFront.x) - BODY_HULL_PAD;
      const xHi = Math.max(POSE.hip.x, POSE.head.x, POSE.handBack.x) + BODY_HULL_PAD;
      bb.x = this.x + xLo;
      bb.w = xHi - xLo;
      bb.y = this.bodyY + POSE.head.y - 30;
      bb.h = this.bodyY - bb.y;
      // ponto fraco: acompanha o x do peito/pescoço, sobe e desce com sag
      const papadaY = this.bodyY - (PAPADA_HIGH - (PAPADA_HIGH - PAPADA_LOW) * this.sag);
      this.weakBox.x = this.x + POSE.chest.x - WEAK_W / 2;
      this.weakBox.y = papadaY - WEAK_H / 2;
      this.weakBox.w = WEAK_W;
      this.weakBox.h = WEAK_H;
    },

    // Fim de ataque: ela arqueja, a bolsa de garganta incha de veneno e desce
    // até a altura do soco. Vem depois de TODOS os ataques — é o que dá ritmo
    // à luta.
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
        // Recolhe a bolsa de garganta e volta a se acomodar no atoleiro
        this.state = 'idle';
        this.timer = this.isPhase2() ? 1.0 : 1.4;
        this.sag = 0;
      }
    },

    // Núcleo da máquina de estados. Fica separado do `update` público porque
    // está cheio de `return` antecipado — e os jorros e bolhas da SANDROLA têm
    // de continuar a andar mesmo nos frames em que o corpo dela não faz nada.
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
        this.kneel = Math.min(1, this.kneel + dt * 1.6);
        this.bodyY = this.groundY;
        this.refreshPose();
        // lodo do robe espirrando enquanto ela desmancha
        if (Math.random() < 0.6) {
          spawnParticle(this.x + rand(-140, 100), this.groundY - rand(0, 260),
            rand(-140, 140), rand(-280, -60), 0.8, 4 + Math.random() * 5, '#9fbf3a', 340);
        }
        if (this.dieTimer >= 2.5 && !this.victoryFired) {
          this.victoryFired = true;
          goldBurst(this.x - 40, this.groundY - 150, 40, 5); // estouro final + lumis
          FG.audio.sfx('victory');
          FG.engine.setState('victory');
        }
        return;
      }

      if (!this.started) return;

      // ---------- caixas vivas ----------
      // Calculadas antes de qualquer `return` para nunca ficarem velhas: o
      // ponto fraco acompanha a bolsa de garganta, e ela acompanha sag/salto.
      this.bodyY = this.groundY - this.hop;
      this.refreshPose();

      // ---------- intro ----------
      if (this.state === 'intro') {
        this.timer -= dt;
        this.charge = 0.5 + Math.sin(FG.engine.time * 8) * 0.2;  // engasgando de veneno
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
        // fica em pé no atoleiro: bolsa recolhida, goela apagada
        this.charge += (0 - this.charge) * Math.min(1, dt * 5);
        this.puff += (0 - this.puff) * Math.min(1, dt * 5);
        this.squash += (0 - this.squash) * Math.min(1, dt * 6);
        this.sag += (0 - this.sag) * Math.min(1, dt * 6);
        this.kneel += (0 - this.kneel) * Math.min(1, dt * 6);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 4);
        this.glow = 0;
        if (this.timer <= 0) {
          // O bafo venenoso abre o ciclo: é o ataque mais legível dos quatro.
          const attacks = ['bafo', 'lingua', 'baque', 'bolhas'];
          this.state = attacks[this.attackIndex % 4];
          this.attackIndex++;
          this.phase = 0;
          this.timer = 0;
        }

      } else if (this.state === 'exposto') {
        // arquejando, curvada para a frente: a bolsa de garganta enche de
        // veneno, desce e acende até levar o soco
        this.kneel = Math.min(1, this.kneel + dt * 6);
        this.sag = Math.min(1, this.sag + dt * 5);
        this.charge += (0 - this.charge) * Math.min(1, dt * 6);
        this.puff += (0 - this.puff) * Math.min(1, dt * 4);
        this.squash += (0 - this.squash) * Math.min(1, dt * 6);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 3);
        this.glow = 0.6 + 0.4 * Math.sin(FG.engine.time * 12);
        this.refreshPose();
        // gotas escorrendo da bolsa, para o alvo saltar aos olhos
        if (Math.random() < 0.4) {
          spawnParticle(this.weakBox.x + this.weakBox.w / 2 + rand(-40, 40), this.weakBox.y + this.weakBox.h,
            rand(-20, 20), rand(20, 70), 0.5, 3.5, '#c8e86a', 500);
        }
        // soco na bolsa de garganta
        if (!this.stunHit && p.attackBox && p.attackBox.active && ov(p.attackBox, this.weakBox)) {
          this.takeHit();
        }
        // pisão na bolsa de garganta (quica)
        else if (!this.stunHit && p.vy > 0 && ov(p, this.weakBox)) {
          p.vy = -420;
          this.takeHit();
        }
        if (this.timer <= 0 && this.state === 'exposto') {
          this.state = 'idle';
          this.timer = 1.1 * speedMul;
          this.glow = 0;
        }
        return;   // curvada nada machuca no contato: sai antes do teste

      } else if (this.state === 'bafo') {
        // ---- 1. BAFO VENENOSO ----
        // Telegraph de 0.95s: recua a cabeça, a goela acende e ela engasga.
        // Depois solta jorros de bafo em arco que deixam poça ácida onde
        // caem — as poças ficam espaçadas de propósito, e o vão entre elas
        // é a resposta.
        if (this.phase === 0) {
          this.phase = 1;
          this.timer = 0.95;
        } else if (this.phase === 1) {
          this.charge = Math.min(1, this.charge + dt * 1.3);
          this.x += (this.homeX + 26 - this.x) * Math.min(1, dt * 3);  // recua
          if (Math.random() < 0.35) {
            spawnParticle(this.x + POSE.head.x - 30, this.bodyY + POSE.head.y + 30, rand(-40, 10), rand(-70, -20),
              0.4, 3, 'rgba(190,230,90,0.85)', 200);
          }
          if (this.timer <= 0) {
            const n = p2 ? 4 : 3;   // fase 2: um jorro a mais, o vão aperta
            const mx = this.x + POSE.head.x - 30, my = this.bodyY + POSE.head.y + 30;
            for (let i = 0; i < n; i++) {
              const s = this.acquireSpit();
              if (!s) break;
              s.active = true;
              s.x = mx;
              s.y = my;
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
        // Telegraph de 0.95s: ela INCHA A BOLSA DE GARGANTA e treme. A
        // língua de sapo sai reta e rasteira, e o topo dela fica a 38px do
        // chão: qualquer pulo passa por cima, mas ficar parado no chão não
        // passa.
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
          // desenrola e recolhe; a bolsa de garganta esvazia junto com o disparo
          const outV = p2 ? 2500 : 2200;
          tongue.x = this.x + POSE.head.x - 30;
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
          tongue.x = this.x + POSE.head.x - 30;
          tongue.y = this.bodyY - TONGUE_Y;
          if (this.timer <= 0) { tongue.out = false; this.phase = 4; this.timer = 1.0; }
        } else if (this.phase === 4) {
          tongue.x = this.x + POSE.head.x - 30;
          tongue.y = this.bodyY - TONGUE_Y;
          tongue.len -= (p2 ? 2200 : 2000) * dt;
          if (tongue.len <= 0) {
            tongue.len = 0;
            tongue.active = false;
            this.expose(2.6 * speedMul);
          }
        }

      } else if (this.state === 'baque') {
        // ---- 3. BAQUE DE CAJADO ----
        // Telegraph de 0.9s: AGACHA E TREME. Depois salta ~160px e cai
        // batendo os pés no chão; o impacto solta duas ondas rasteiras, uma
        // para cada lado.
        if (this.phase === 0) {
          this.phase = 1;
          this.timer = 0.9;
        } else if (this.phase === 1) {
          this.squash = Math.min(1, this.squash + dt * 2);
          this.x = this.homeX + Math.sin(FG.engine.time * 46) * 4;
          if (Math.random() < 0.3) {
            spawnParticle(this.x + rand(-80, 60), this.groundY, rand(-60, 60), rand(-90, -20),
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
            // duas ondas, uma para cada lado, saindo de debaixo dos pés
            const wv = p2 ? 340 : 300;
            for (let i = 0; i < 2; i++) {
              const w = waves[i];
              w.active = true;
              w.x = this.x - 36 - w.w / 2;
              w.vx = i === 0 ? -wv : wv;
              w.y = groundYAt(w.x + w.w / 2, 300) - w.h;
            }
            for (let k = 0; k < 14; k++) {
              spawnParticle(this.x + rand(-80, 60), this.groundY, rand(-220, 220), rand(-320, -80),
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
          // ela borbulha pela boca enquanto o pântano ferve
          this.charge = 0.3 + 0.15 * Math.sin(FG.engine.time * 9);
          this.x = this.homeX + Math.sin(FG.engine.time * 12) * 2;
          if (this.timer <= 0) {
            this.x = this.homeX;
            this.expose(2.6 * speedMul);
          }
        }
      }

      // ---------- contato com a SANDROLA ----------
      // Encostar na cabeça ou no corpo machuca. Assim que a bolsa de garganta
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
      // ar não pode evaporar no frame em que a SANDROLA desmancha.
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
  // DESENHO — canvas puro, sem asset nenhum. A ordem de desenho segue a
  // mesma lógica de profundidade do boss3.js: perna de trás, pernas, tronco/
  // blusa, cabeça, braço da frente — o que dá volume sem sombra falsa.
  // ==================================================================

  // Membro: um tronco de cone entre duas juntas — braço, perna. Mesma função
  // do boss3.js: suave, sem vértices pontudos.
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

  // Elipse com gradiente vertical: escura embaixo, clara em cima. É o tijolo
  // do casaco/cabeça inteiros — LISO, de propósito (ver nota no topo do
  // arquivo: nada de silhueta facetada tipo pedra para o tronco dela).
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

  function drawBoss(ctx, cam) {
    const VIEW_W = FG.enemies.fx.VIEW_W;
    const a = FG.level.arena;
    if (cam.x + VIEW_W < a.x - 200 || cam.x > a.x + a.w + 200) return;
    if (!boss.started) { boss.resolveGeometry(); }   // dormindo, geometria já certa
    boss.refreshPose();

    const t = FG.engine.time;
    const p2 = boss.isPhase2();
    const dying = boss.state === 'dying';
    if (dying && boss.dieTimer >= 2.5) return;   // já desmanchou

    // tremor: fase 2 sempre vibra um pouco; morrendo, muito
    let shX = 0, shY = 0;
    if (dying) { shX = rand(-4, 4); shY = rand(-3, 3); }
    else if (p2 && boss.active) { shX = rand(-1.4, 1.4); shY = rand(-1, 1); }

    // parada, respira: o peito sobe e desce
    const breathe = (boss.active || dying) ? Math.sin(t * 2.2) * 2 : Math.sin(t * 1.5) * 4;
    const melt = boss.melt;
    const X = boss.x - cam.x + shX;
    const BY = boss.bodyY - cam.y + shY + melt * 74;
    const GY = boss.groundY - cam.y;

    // agacha no telegraph do baque; afunda ao derreter
    const sqz = 1 - 0.12 * boss.squash - 0.6 * melt;
    const wide = 1 + 0.08 * boss.squash + 0.22 * melt;

    ctx.save();
    // Nada da SANDROLA passa da linha do lodo: ela está com os pés atolados,
    // e o que sobraria por baixo do chão fica escondido em vez de flutuar.
    ctx.beginPath();
    ctx.rect(-200, -1000, VIEW_W + 400, GY + 30 + 1000);
    ctx.clip();

    // ---- o atoleiro: poça de lodo em que os pés dela estão enfiados ----
    ctx.fillStyle = '#3b4416';
    ctx.beginPath();
    ctx.ellipse(X - 6, GY + 4, 150, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,172,60,0.35)';
    ctx.beginPath();
    ctx.ellipse(X - 6, GY - 2 + Math.sin(t * 2) * 2, 132, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(X, BY);
    ctx.scale(wide, sqz);

    // casaco teal, mais escuro e frio na fase 2
    const jacketDark = p2 ? '#123a30' : '#1c5346';
    const jacketMid = p2 ? '#1f6d5a' : '#2f8a72';
    const jacketHigh = p2 ? '#0c2a22' : '#153f34';   // gola alta, mais escura
    // pele pálida/creme — uniforme, sem manchas de sapo
    const skinDark = p2 ? '#d8c1a8' : '#e7cdb2';
    const skinMid = p2 ? '#efdcc6' : '#f6e4cd';
    const lit = p2 ? '#f0b0a4' : '#f6c4b6';
    // jeans azul e botas
    const jeansMid = '#3f5fb0', jeansDark = '#2c4488';
    const bootDark = '#1c2a58';

    const hip = POSE.hip, chest = POSE.chest, head = POSE.head;
    const shB = POSE.shBack, shF = POSE.shFront;
    const handB = POSE.handBack, handF = POSE.handFront;
    const kneeB = POSE.kneeBack, kneeF = POSE.kneeFront;
    const footB = POSE.footBack, footF = POSE.footFront;

    // ---- perna de trás primeiro (fica atrás de tudo) ----
    ctx.fillStyle = jeansDark;
    shapeLimb(ctx, hip.x + 10, hip.y, kneeB.x, kneeB.y, 22, 19);
    ctx.fill();
    shapeLimb(ctx, kneeB.x, kneeB.y, footB.x, footB.y, 19, 17);
    ctx.fill();
    ctx.fillStyle = bootDark;
    ctx.beginPath();
    ctx.ellipse(footB.x + 6, footB.y - 6, 22, 14, 0.15, 0, Math.PI * 2);
    ctx.fill();

    // ---- perna da frente ----
    ctx.fillStyle = jeansMid;
    shapeLimb(ctx, hip.x - 10, hip.y, kneeF.x, kneeF.y, 24, 20);
    ctx.fill();
    shapeLimb(ctx, kneeF.x, kneeF.y, footF.x, footF.y, 20, 18);
    ctx.fill();
    // costura central das calças
    ctx.strokeStyle = 'rgba(15,25,60,0.4)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(hip.x - 10, hip.y + 10);
    ctx.lineTo(kneeF.x, kneeF.y);
    ctx.lineTo(footF.x, footF.y - 4);
    ctx.stroke();
    ctx.fillStyle = bootDark;
    ctx.beginPath();
    ctx.ellipse(footF.x - 6, footF.y - 7, 24, 15, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // ---- braço de trás (atrás do tronco) ----
    ctx.fillStyle = jacketDark;
    shapeLimb(ctx, shB.x, shB.y + breathe, handB.x, handB.y, 20, 15);
    ctx.fill();
    ctx.fillStyle = skinMid;
    ctx.beginPath();
    ctx.ellipse(handB.x, handB.y, 15, 12, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // ---- tronco/blusa: elipse LISA com gradiente (ver blob()) ----
    const tcx = lerp(hip.x, chest.x, 0.55);
    const tcy = lerp(hip.y, chest.y, 0.55) + breathe;
    const trx = 78, tryy = 108;
    blob(ctx, tcx, tcy, trx, tryy, jacketDark, jacketMid);
    // costura central do casaco + 2 botões escuros descendo pela frente
    ctx.strokeStyle = 'rgba(10,20,16,0.45)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tcx - trx * 0.05, tcy - tryy * 0.72);
    ctx.lineTo(tcx - trx * 0.05, tcy + tryy * 0.78);
    ctx.stroke();
    // curva decorativa tipo bolso, como na referência
    ctx.beginPath();
    ctx.arc(tcx + trx * 0.16, tcy - tryy * 0.1, trx * 0.22, 0.3, Math.PI - 0.5);
    ctx.stroke();
    ctx.fillStyle = p2 ? '#0c1a16' : '#122824';
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(tcx - trx * 0.05, tcy - tryy * 0.05 + i * tryy * 0.42, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    // ombreiras do casaco
    ctx.fillStyle = jacketDark;
    ctx.beginPath();
    ctx.ellipse(shB.x, shB.y + breathe, 30, 24, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(shF.x, shF.y + breathe, 32, 26, -0.6, 0, Math.PI * 2);
    ctx.fill();
    // gola alta, teal escuro, subindo do casaco até a base do pescoço
    ctx.fillStyle = jacketHigh;
    ctx.beginPath();
    ctx.moveTo(head.x - 34, head.y + 90);
    ctx.lineTo(head.x + 40, head.y + 78);
    ctx.lineTo(chest.x + trx * 0.3, chest.y - tryy * 0.3);
    ctx.lineTo(chest.x - trx * 0.35, chest.y - tryy * 0.1);
    ctx.closePath();
    ctx.fill();

    // ---- cabelo liso amarelo-ouro, calota de trás (por trás da cabeça) ----
    const hairLit = '#f6d33a', hairDark = '#d9ad0e';
    ctx.fillStyle = hairDark;
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - 30, 82, 66, 0, Math.PI, 0, false);
    ctx.fill();

    // ---- cabeça: pele pálida uniforme ----
    blob(ctx, head.x, head.y, 66, 78, skinDark, skinMid);

    // duas cortinas lisas de cabelo, uma de cada lado do rosto, até o peito —
    // desenhadas DEPOIS da cabeça para caírem por cima, como na referência
    ctx.fillStyle = hairLit;
    for (const side of [-1, 1]) {
      const sway = Math.sin(t * 0.9 + side) * 3;
      const bx = head.x + side * 62;
      const by = head.y - 20;
      ctx.beginPath();
      ctx.moveTo(bx - side * 14, by - 14);
      ctx.quadraticCurveTo(bx + side * (20 + sway), by + 90, bx + side * (8 + sway), by + 200);
      ctx.lineTo(bx - side * (20 + sway), by + 196);
      ctx.quadraticCurveTo(bx - side * (26 + sway), by + 82, bx - side * 24, by - 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,120,4,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + side * (12 + sway), by + 96, bx + side * 5, by + 184);
      ctx.stroke();
    }
    // repartição central do cabelo, por cima da testa
    ctx.fillStyle = hairDark;
    ctx.beginPath();
    ctx.moveTo(head.x - 3, head.y - 68);
    ctx.lineTo(head.x + 3, head.y - 68);
    ctx.lineTo(head.x + 2, head.y - 30);
    ctx.lineTo(head.x - 2, head.y - 30);
    ctx.closePath();
    ctx.fill();

    // sobrancelhas finas arqueadas
    ctx.strokeStyle = 'rgba(70,50,20,0.7)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(head.x - 20, head.y - 22, 22, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(head.x + 22, head.y - 24, 22, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // ---- boca aberta com dentes brancos em grade + canto vermelho ----
    drawMouth(ctx, head, t);
    // goela acesa: telegraph do bafo e das bolhas, por trás dos dentes
    if (boss.charge > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(head.x, head.y + 26, 2, head.x, head.y + 26, 60 + 40 * boss.charge);
      g.addColorStop(0, 'rgba(220,255,150,0.9)');
      g.addColorStop(0.5, 'rgba(150,220,60,0.55)');
      g.addColorStop(1, 'rgba(90,160,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(head.x, head.y + 26, 60 + 40 * boss.charge, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- olhos pretos quadrados de estática, com quadradinho branco ----
    // Antes ficavam a só 42px uma da outra com r=30/32 (lado do quadrado =
    // r*1.8 ≈ 54-58px) — as duas se fundiam numa barra preta única. Agora
    // separadas o bastante (72px) e um pouco menores pra caber dentro da
    // cabeça sem se tocar.
    drawEye(ctx, head.x - 30, head.y - 8, 22, t, p2, 0);
    drawEye(ctx, head.x + 26, head.y - 10, 23, t, p2, 1.7);

    // ---- bolsa de garganta: o ponto fraco, agora centrada no peito/pescoço ----
    drawPapada(ctx, chest, t, lit);

    // ---- braço da frente (por cima do tronco) ----
    ctx.fillStyle = jacketMid;
    shapeLimb(ctx, shF.x, shF.y + breathe, handF.x, handF.y, 22, 16);
    ctx.fill();
    ctx.fillStyle = skinMid;
    ctx.beginPath();
    ctx.ellipse(handF.x, handF.y, 16, 13, -0.3, 0, Math.PI * 2);
    ctx.fill();
    for (let f = -1; f <= 1; f++) {
      ctx.beginPath();
      ctx.ellipse(handF.x + f * 8, handF.y - 12, 4.5, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- baba/veneno escorrendo do queixo e da barra do casaco ----
    ctx.fillStyle = 'rgba(200,235,120,0.4)';
    for (let i = 0; i < 4; i++) {
      const dx = tcx - trx * 0.7 + i * (trx * 1.4 / 3);
      const dy = Math.abs(Math.sin(t * 1.3 + i * 1.7)) * 20;
      ctx.beginPath();
      ctx.ellipse(dx, tcy + tryy * 0.85 + dy, 5, 8 + dy * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // flash ao levar dano: clarão por cima do tronco e da cabeça
    if (boss.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, boss.flash * 4) * 0.5;
      ctx.fillStyle = '#e8ffb0';
      ctx.beginPath();
      ctx.ellipse(tcx, tcy, trx, tryy, 0, 0, Math.PI * 2);
      ctx.ellipse(head.x, head.y, 66, 78, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // Boca aberta com dentes brancos em grade (cima e embaixo) e um toque de
  // vermelho de gengiva/língua no canto — a mesma leitura da referência.
  function drawMouth(ctx, head, t) {
    const cx = head.x, cy = head.y + 30;
    const x0 = cx - 46, x1 = cx + 46;
    const yTop = cy - 22, yBot = cy + 18;
    // cavidade da boca
    ctx.fillStyle = '#2a1414';
    ctx.beginPath();
    ctx.moveTo(x0, cy - 6);
    ctx.quadraticCurveTo(cx, yTop, x1, cy - 8);
    ctx.lineTo(x1, cy + 6);
    ctx.quadraticCurveTo(cx, yBot, x0, cy + 10);
    ctx.closePath();
    ctx.fill();
    // grade de dentes brancos, fileira de cima e de baixo
    const cols = 6;
    const span = x1 - x0 - 10;
    const toothW = span / cols;
    ctx.fillStyle = '#f4f1e6';
    for (let i = 0; i < cols; i++) {
      const tx = x0 + 6 + i * toothW;
      ctx.fillRect(tx, yTop + 2, toothW - 3, 14);
      ctx.fillRect(tx, yBot - 14, toothW - 3, 14);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= cols; i++) {
      const tx = x0 + 6 + i * toothW;
      ctx.beginPath();
      ctx.moveTo(tx, yTop + 2);
      ctx.lineTo(tx, yTop + 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tx, yBot - 14);
      ctx.lineTo(tx, yBot);
      ctx.stroke();
    }
    // gengiva/língua vermelha no canto aberto
    ctx.fillStyle = '#c23a2e';
    ctx.beginPath();
    ctx.ellipse(x1 - 12, cy + 2, 15, 10, 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  // A bolsa de garganta. Ela infla no telegraph da língua e AFUNDA na janela
  // de dano — as duas coisas são o mesmo saco, e é isso que ensina o jogador
  // onde bater. Agora centrada no x do peito/pescoço (chest), não mais jogada
  // para o lado do rosto.
  function drawPapada(ctx, chest, t, lit) {
    const cx = chest.x;
    const cy = -(PAPADA_HIGH - (PAPADA_HIGH - PAPADA_LOW) * boss.sag);
    const rx = 44 + 14 * boss.puff + 8 * boss.sag;
    const ry = 34 + 13 * boss.puff + 10 * boss.sag;
    const wobble = Math.sin(t * (boss.puff > 0.2 ? 22 : 4)) * (1 + 2 * boss.puff);

    const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    g.addColorStop(0, lit);
    g.addColorStop(1, '#c76a5c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy + wobble, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // pregas da papada inchada
    ctx.strokeStyle = 'rgba(120,50,40,0.35)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy + wobble - ry * 0.3, rx * (0.45 + i * 0.22), 0.5, Math.PI - 0.5);
      ctx.stroke();
    }
    // alvo pulsando durante a janela de dano
    if (boss.glow > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const r = rx * 1.25 + Math.sin(t * 12) * 5;
      const gg = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      gg.addColorStop(0, 'rgba(240,255,160,' + (0.55 * boss.glow).toFixed(3) + ')');
      gg.addColorStop(1, 'rgba(180,255,60,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 14);
      ctx.strokeStyle = '#f2ffb0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, rx * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Olho preto quadrado/blocado, tipo estática de TV, com um quadradinho
  // branco descentralizado dentro — o efeito "olhos de zumbi/glitch" da
  // referência. Na fase 2 o quadradinho pisca vermelho de vez em quando, o
  // único aviso visual de que ela acelerou.
  function drawEye(ctx, ex, ey, r, t, p2, off) {
    const blink = Math.sin(t * 0.8 + off) > 0.985 ? 0.12 : 1;
    const side = r * 1.8;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(1, blink);
    // quadrado preto
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(-side / 2, -side / 2, side, side);
    // quadradinho branco descentralizado, dá o efeito de estática/glitch
    const glitch = p2 && Math.sin(t * 20 + off * 3) > 0.92;
    const wsize = side * 0.34;
    const wx = -side * 0.16 + Math.sin(t * 3 + off) * side * 0.06;
    const wy = -side * 0.12;
    ctx.fillStyle = glitch ? '#e03a2a' : '#f4f1e6';
    ctx.fillRect(wx - wsize / 2, wy - wsize / 2, wsize, wsize);
    ctx.restore();
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

  // Única linha de load deste arquivo: entrega a SANDROLA ao registro de
  // chefões. Quem escolhe qual entra em cena é FG.enemies.reset(), pelo
  // bossId da fase.
  FG.enemies.registerBoss('sandrola', boss);
})();
