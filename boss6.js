// Fagulho: Lendas do Bosque — boss6.js
// Chefã da fase 6 (A Floresta): DALILESMA SLIME.
// Menina mandona de vestido azul e cabelo castanho cacheado, MONTADA numa
// lesma gigante de slime verde translúcido que cospe bolas de gosma. Veio
// direto do desenho de referência: a lesma ondula, pinga, e a Dalilesma
// aponta e dá ordens lá de cima.
// É a chefã mais dura do jogo — o DOBRO do Esbeltinho Otton (fase 5):
// 14 de vida (vs 10), telegraphs de 0.6–0.7s (vs 0.85), janela de dano de
// 1.9s (vs 2.6, e 1.6 na fase 2) e ataques que deixam RESTOS no chão
// (o rastro de gosma da investida fica ~3s). A forma comum dos chefões se
// mantém intacta: todo ataque termina em janela, e durante a janela NADA
// machuca — nem o corpo, nem rastro, nem bola ainda no ar.
// Mesma técnica de corpo dos outros chefões sem sprite: canvas puro, poses
// interpoladas por `lerp`, pools pré-alocadas, culling.
// A ÚNICA coisa que este arquivo faz no load é registar-se em FG.enemies
// (enemies.js vem antes no index.html); todo o resto só olha para FG.* dentro
// de funções chamadas em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  const GRAV = 2200;         // mesma gravidade do player

  // Atalhos para os efeitos partilhados de enemies.js — criados uma vez e só
  // tocam em FG.enemies quando chamados (regra de load do projeto).
  const spawnParticle = (x, y, vx, vy, life, size, color, grav) =>
    FG.enemies.fx.spawnParticle(x, y, vx, vy, life, size, color, grav);
  const goldBurst = (cx, cy, n, lumiCount) => FG.enemies.fx.goldBurst(cx, cy, n, lumiCount);
  const groundYAt = (x, yMin) => FG.enemies.fx.groundYAt(x, yMin);
  const rand = (a, b) => FG.enemies.fx.rand(a, b);
  const lerp = (a, b, k) => a + (b - a) * k;

  // ==================================================================
  // MEDIDAS — a lesma encara a ESQUERDA (de onde o jogador chega), como os
  // outros chefões de chão; "frente" é x negativo e não há espelhamento.
  // ==================================================================
  const SLUG_W = 150;        // meia-largura do corpo da lesma
  const SLUG_H = 148;        // altura do lombo (onde a Dalilesma senta)
  const DASH_SPEED = 600;    // investida: rápida, mas achatada e saltável
  const DASH_LEFT = 460;     // quanto a investida avança antes de voltar

  // Peito/laço da Dalilesma — o ponto fraco. Montada, ele vive no alto do
  // lombo; na janela ela se debruça pelo pescoço da lesma e o laço desce a
  // ~150px do chão (a medida do contrato: um pulo simples alcança, um pulo
  // cortado ainda pega a borda de baixo da caixa).
  const CHEST_UP = { x: -14, y: -(SLUG_H + 56) };   // montada
  const CHEST_DN = { x: -92, y: -150 };             // debruçada (janela)
  const CORE_W = 104, CORE_H = 104;

  // ---------- pools do chefão (pré-alocadas; reset() apaga todas) ----------
  const MAXBOLA = 14;        // bolas de slime (rajada + chuva usam a mesma pool de voo? não: rajada)
  const bolas = [];
  for (let i = 0; i < MAXBOLA; i++) {
    bolas.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, r: 16, bounced: false });
  }

  const MAXRASTRO = 18;      // rastro de gosma da investida (fica no chão)
  const rastros = [];
  for (let i = 0; i < MAXRASTRO; i++) {
    rastros.push({ active: false, x: 0, y: 0, w: 92, h: 18, t: 0, max: 3 });
  }

  const MAXCHUVA = 10;       // chuva de slime: sombra no chão -> bola caindo
  const chuvas = [];
  for (let i = 0; i < MAXCHUVA; i++) {
    chuvas.push({ active: false, state: 'sombra', x: 0, y: 0, vy: 0, timer: 0, groundY: 0, r: 18 });
  }

  const MAXONDA = 4;         // onda rasteira de gosma (uma para cada lado)
  const ondas = [];
  for (let i = 0; i < MAXONDA; i++) {
    ondas.push({ active: false, x: 0, dir: 1, groundY: 0, w: 64, h: 46 });
  }

  const boss = {
    // --- identidade (o engine lê o nome para a barra de vida) ---
    id: 'dalilesma',
    nome: 'DALILESMA SLIME',

    // --- contrato lido pelo engine ---
    started: false,
    active: false,
    dead: false,
    hp: 14,
    maxHp: 14,

    // --- geometria (resolvida em runtime, no start/reset) ---
    homeX: 0,        // posto da lesma (lado direito da arena)
    x: 0,            // posição atual (muda na investida)
    groundY: 0,      // chão da arena
    lean: 0,         // 0..1 — montada -> debruçada (a janela de dano)
    duck: 0,         // 0..1 — lesma achatada para a investida (fica saltável)
    rear: 0,         // 0..1 — lesma empinada (telegraph da rajada)
    pulse: 0,        // 0..1 — lesma inchando (telegraph da onda)
    armUp: 0,        // 0..1 — braço da Dalilesma apontando pro céu (chuva)
    charge: 0,       // 0..1 — brilho de gosma carregando (telegraph visível)
    shake: 0,        // tremor de impacto
    slugMelt: 0,     // 0..1 — morte: a lesma derrete numa poça
    sitK: 0,         // 0..1 — morte: a Dalilesma cai sentada no chão

    // --- máquina de estados ---
    state: 'dormant', // dormant|intro|idle|rajada|investida|chuva|onda|exposto|dying
    phase: 0,
    timer: 0,
    attackIndex: 0,
    stunHit: false,
    flash: 0,
    eyeGlow: 0,       // brilho do laço na janela de dano
    tickle: 0,        // >0: janela FORÇADA pelas cócegas do MurphOliver (riso)
    safe: 0,          // carência de contato ao sair da janela (ver takeHit)
    dieTimer: 0,
    dieScale: 1,
    victoryFired: false,

    // caixas calculadas por frame (nunca realocadas)
    coreBox: { x: 0, y: 0, w: CORE_W, h: CORE_H },
    bodyBox: { x: 0, y: 0, w: 0, h: 0 },

    start() {
      if (this.started) return;
      this.started = true;
      this.resolveGeometry();
      this.state = 'intro';
      this.timer = 1.4;      // um pouco mais longa: dá tempo de ler o balão
      FG.audio.sfx('bossRoar');
      FG.audio.music('boss');
    },

    resolveGeometry() {
      const a = FG.level.arena;
      this.groundY = groundYAt(a.x + a.w * 0.75, 300);
      // Longe da parede da direita: debruçada ela avança o laço ~90px para a
      // esquerda, e o jogador precisa de chão dos dois lados do ponto fraco.
      this.homeX = a.x + a.w - 240;
      this.x = this.homeX;
    },

    reset() {
      // Volta TUDO ao estado inicial, inclusive as pools — uma bola ou um
      // rastro desta chefã não pode sobreviver à troca de fase.
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
      this.lean = 0;
      this.duck = 0;
      this.rear = 0;
      this.pulse = 0;
      this.armUp = 0;
      this.charge = 0;
      this.shake = 0;
      this.slugMelt = 0;
      this.sitK = 0;
      this.dieTimer = 0;
      this.dieScale = 1;
      this.victoryFired = false;
      this.phase2Wave = -1;
      this.tickle = 0;
      for (let i = 0; i < MAXBOLA; i++) bolas[i].active = false;
      for (let i = 0; i < MAXRASTRO; i++) rastros[i].active = false;
      for (let i = 0; i < MAXCHUVA; i++) chuvas[i].active = false;
      for (let i = 0; i < MAXONDA; i++) ondas[i].active = false;
    },

    // Fase 2 na METADE da vida (os outros viram aos 3 de 10; ela é o dobro
    // de chefã, o segundo tempo chega mais cedo e dura mais).
    isPhase2() { return this.hp <= 7; },

    // Recalcula as caixas. Em função porque o desenho também precisa dela
    // enquanto a chefã dorme (antes do primeiro update).
    refreshPose() {
      const sc = this.dieScale;
      const k = this.lean;
      // laço do peito — o ponto fraco
      const cb = this.coreBox;
      cb.w = CORE_W * sc;
      cb.h = CORE_H * sc;
      cb.x = this.x + lerp(CHEST_UP.x, CHEST_DN.x, k) * sc - cb.w / 2;
      cb.y = this.groundY + lerp(CHEST_UP.y, CHEST_DN.y, k) * sc - cb.h / 2;
      // massa que machuca no contato: a lesma inteira + a cavaleira.
      // A investida ACHATA a lesma (duck): o corpo cai para ~90px de altura
      // e passa a ser saltável — é essa a esquiva do ataque.
      const squish = 1 - this.duck * 0.62;
      const bb = this.bodyBox;
      bb.x = this.x + (-SLUG_W - 14) * sc;
      bb.w = (SLUG_W * 2 + 40) * sc;
      const alto = (SLUG_H + 86) * squish * sc;
      bb.y = this.groundY - alto;
      bb.h = alto;
    },

    // Fim de ataque: a Dalilesma se debruça pelo pescoço da lesma, ofegante,
    // e o laço do peito acende. Vem depois de TODOS os ataques.
    expose() {
      this.state = 'exposto';
      // Janela mais curta que o padrão 2.6s dos outros chefões — é aqui que
      // mora metade do "2x mais difícil": 1.9s, e 1.6s na fase 2.
      this.timer = this.isPhase2() ? 1.6 : 1.9;
      this.phase = 0;
      this.stunHit = false;
      this.rear = 0;
      this.pulse = 0;
      this.armUp = 0;
    },

    // Janela FORÇADA pelas cócegas do MurphOliver. Interrompe o ataque
    // corrente com os mesmos desarmes da janela normal (o estado `exposto` já
    // neutraliza bolas, rastros, chuvas e ondas pela flag `janela`), mas com
    // a duração GENEROSA dos outros chefões (2.6s) — é a recompensa de gastar
    // a cóceja, que custa 60s de descanso do sapinho. Durante ela, a Dalilesma
    // e a lesma se contorcem de rir. Retorna false se não havia o que expor.
    forceExpose() {
      if (!this.started || this.dead) return false;
      if (this.state === 'exposto' || this.state === 'dying' ||
          this.state === 'intro' || this.state === 'dormant') return false;
      this.expose();
      this.timer = 2.6;
      this.tickle = 2.6;
      this.shake = 0.6;
      FG.audio.sfx('bossHit');
      return true;
    },

    // Dano no laço
    takeHit() {
      this.hp--;
      this.flash = 0.25;
      this.stunHit = true;
      FG.audio.sfx('bossHit');
      goldBurst(this.coreBox.x + this.coreBox.w / 2, this.coreBox.y + this.coreBox.h / 2, 10, 0);
      // gosma salta do peito
      for (let i = 0; i < 8; i++) {
        spawnParticle(this.coreBox.x + this.coreBox.w / 2, this.coreBox.y + this.coreBox.h / 2,
          rand(-220, 120), rand(-260, -40), 0.6, 3 + Math.random() * 4, '#4fae3a', 900);
      }
      if (this.hp <= 0) {
        // Morte cinematográfica: dead=true JÁ destranca a arena e some a barra.
        this.dead = true;
        this.state = 'dying';
        this.dieTimer = 0;
        this.timer = 0;
      } else {
        // Ela se endireita na sela. O `lean` NÃO volta a zero de repente:
        // quem acabou de socar está colado no peito dela, e o corpo a
        // rematerializar em cima do jogador seria dano inevitável. Sobe
        // interpolado no idle, e a carência `safe` cobre o resto.
        this.state = 'idle';
        this.timer = this.isPhase2() ? 0.55 : 0.7;
        this.safe = 0.6;
      }
    },

    // Núcleo da máquina de estados. Separado do `update` público porque está
    // cheio de `return` antecipado — e as bolas e rastros já no mundo têm de
    // continuar a andar mesmo nos frames em que o corpo dela não faz nada.
    step(dt) {
      const p = FG.player;
      const ov = FG.engine.rectsOverlap;
      if (this.flash > 0) this.flash -= dt;
      if (this.tickle > 0) this.tickle -= dt;
      if (this.safe > 0) this.safe -= dt;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);

      // ---------- morte cinematográfica ----------
      if (this.state === 'dying') {
        this.dieTimer += dt;
        // a lesma derrete numa poça; a Dalilesma escorrega e cai sentada,
        // batendo o pé no chão, frustrada
        this.slugMelt = Math.min(1, this.slugMelt + dt * 0.8);
        this.sitK = Math.min(1, Math.max(0, (this.dieTimer - 0.7) / 0.6));
        this.lean = Math.max(0, this.lean - dt * 2);
        this.duck = 0;
        this.shake = 0.6;
        this.refreshPose();
        // gotas de slime espirrando da poça que se forma
        if (Math.random() < 0.9) {
          spawnParticle(this.x + rand(-SLUG_W, SLUG_W), this.groundY - rand(0, 60),
            rand(-160, 160), rand(-300, -60), 0.7, 3 + Math.random() * 5,
            Math.random() < 0.6 ? '#4fae3a' : '#8de06a', 700);
        }
        if (this.dieTimer >= 2.5 && !this.victoryFired) {
          this.victoryFired = true;
          goldBurst(this.x, this.groundY - 100, 40, 5);
          FG.audio.sfx('victory');
          FG.engine.setState('victory');
        }
        return;
      }

      if (!this.started) return;

      // ---------- intro: ela aponta para o jogador e a lesma ruge ----------
      if (this.state === 'intro') {
        this.timer -= dt;
        this.armUp = Math.min(1, this.armUp + dt * 2);   // reaproveitado: braço apontando
        this.charge = 0.4 + Math.sin(FG.engine.time * 8) * 0.2;
        this.shake = 0.3;
        this.refreshPose();
        if (this.timer <= 0) {
          this.active = true;
          this.state = 'idle';
          this.timer = 0.9;
          this.armUp = 0;
          this.charge = 0;
        }
        return;
      }

      const p2 = this.isPhase2();
      const speedMul = p2 ? 0.8 : 1;   // fase 2: intervalos ×0.8
      const a = FG.level.arena;

      this.timer -= dt;

      if (this.state === 'idle') {
        // endireita-se na sela e volta ao posto
        this.lean += (0 - this.lean) * Math.min(1, dt * 6);
        this.duck += (0 - this.duck) * Math.min(1, dt * 6);
        this.charge += ((p2 ? 0.25 : 0) - this.charge) * Math.min(1, dt * 4);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 4);
        this.eyeGlow = 0;
        if (this.timer <= 0) {
          // A rajada abre o ciclo: bolas de slime são a assinatura dela.
          const attacks = ['rajada', 'investida', 'chuva', 'onda'];
          this.state = attacks[this.attackIndex % 4];
          this.attackIndex++;
          this.phase = 0;
          this.timer = 0;
        }

      } else if (this.state === 'exposto') {
        // debruçada pelo pescoço da lesma: o laço do peito desce e acende
        this.lean = Math.min(1, this.lean + dt * 6);
        this.duck += (0 - this.duck) * Math.min(1, dt * 6);
        this.charge += (0 - this.charge) * Math.min(1, dt * 4);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 3);
        this.eyeGlow = 0.6 + 0.4 * Math.sin(FG.engine.time * 12);
        // cócegas: as duas se contorcem de rir (tremida contínua)
        if (this.tickle > 0) this.shake = Math.max(this.shake, 0.3);
        this.refreshPose();
        // gotinhas de slime pingando do laço aceso
        if (Math.random() < 0.4) {
          spawnParticle(this.coreBox.x + this.coreBox.w / 2 + rand(-16, 16),
            this.coreBox.y + this.coreBox.h / 2, rand(-30, 30), rand(-90, -40),
            0.7, 5 + Math.random() * 4, 'rgba(160,240,120,0.6)', -40);
        }
        // soco no laço
        if (!this.stunHit && p.attackBox && p.attackBox.active && ov(p.attackBox, this.coreBox)) {
          this.takeHit();
        }
        // pisão no laço (quica)
        else if (!this.stunHit && p.vy > 0 && ov(p, this.coreBox)) {
          p.vy = -420;
          this.takeHit();
        }
        if (this.timer <= 0 && this.state === 'exposto') {
          this.state = 'idle';
          this.timer = 0.9 * speedMul;
          this.eyeGlow = 0;
          this.safe = 0.5;   // mesma carência de quem acertou: dá tempo de sair
        }
        return;   // debruçada nada machuca no contato: sai antes do teste

      // ================= 1. RAJADA DE BOLAS DE SLIME =================
      } else if (this.state === 'rajada') {
        if (this.phase === 0) {
          // telegraph: a lesma empina e infla as bochechas — 0.65s (o padrão
          // dos outros chefões é 0.85; aqui é mais curto, nunca abaixo de 0.6)
          this.phase = 1;
          this.timer = 0.65;
          FG.audio.sfx('bossSpit');
        } else if (this.phase === 1) {
          this.rear = Math.min(1, this.rear + dt * 2.2);
          this.charge = Math.min(1, this.charge + dt * 1.6);
          if (Math.random() < 0.5) {
            spawnParticle(this.x - SLUG_W + rand(-20, 20), this.groundY - SLUG_H - rand(0, 40),
              rand(-40, 40), rand(-100, -30), 0.4, 3, '#8de06a', -60);
          }
          if (this.timer <= 0) {
            // leque de bolas que quicam UMA vez: a primeira leva do chão é
            // onde o jogador aprende a passar por baixo do segundo arco
            const n = p2 ? 7 : 5;
            for (let i = 0; i < n; i++) {
              this.spitBall(
                this.x - SLUG_W + 10,
                this.groundY - SLUG_H - 30,
                -(180 + i * (p2 ? 85 : 110)) + rand(-20, 20),
                -(520 + rand(-40, 80))
              );
            }
            FG.audio.sfx('bossSpit');
            this.phase = 2;
            this.timer = 1.0;
          }
        } else if (this.phase === 2) {
          this.rear = Math.max(0, this.rear - dt * 2.5);
          this.charge = Math.max(0, this.charge - dt * 2);
          if (this.timer <= 0) this.expose();
        }

      // ================= 2. INVESTIDA (rastro de gosma) =================
      } else if (this.state === 'investida') {
        if (this.phase === 0) {
          // telegraph: a Dalilesma se abaixa na sela e a lesma se comprime
          // feito mola — 0.7s para ler que vem o atropelo
          this.phase = 1;
          this.timer = 0.7;
          FG.audio.sfx('bossRoar');
        } else if (this.phase === 1) {
          this.duck = Math.min(1, this.duck + dt * 2.2);
          this.charge = Math.min(0.8, this.charge + dt * 1.4);
          if (this.timer <= 0) {
            this.phase = 2;
            this.timer = 0;
            // fase 2: a investida parte com chuva ainda caindo — os ataques
            // combinam restos, e o chão e o céu apertam ao mesmo tempo
            if (p2) this.spawnChuva(3, 0.55, 0.3);
          }
        } else if (this.phase === 2) {
          // atravessa a arena achatada, deixando gosma pelo caminho
          const v = p2 ? DASH_SPEED * 1.12 : DASH_SPEED;
          this.x -= v * dt;
          this.dropRastro(p2);
          this.dashDust();
          if (this.x <= Math.max(a.x + 90, this.homeX - DASH_LEFT)) { this.phase = 3; this.timer = 0.2; }
        } else if (this.phase === 3) {
          this.dashDust();
          if (this.timer <= 0) { this.phase = 4; this.timer = 0; }
        } else if (this.phase === 4) {
          const v = p2 ? DASH_SPEED * 1.12 : DASH_SPEED;
          this.x += v * dt;
          this.dropRastro(p2);
          this.dashDust();
          if (this.x >= this.homeX) { this.x = this.homeX; this.phase = 5; this.timer = 0.25; }
        } else if (this.phase === 5) {
          this.duck = Math.max(0, this.duck - dt * 3);
          this.charge = Math.max(0, this.charge - dt * 2);
          if (this.timer <= 0) this.expose();
        }

      // ================= 3. CHUVA DE SLIME (sombras no chão) =================
      } else if (this.state === 'chuva') {
        if (this.phase === 0) {
          // telegraph: a Dalilesma ergue o braço e a lesma lança bolas para o
          // alto — cada ponto de queda é marcado por uma sombra ANTES da bola
          this.phase = 1;
          this.timer = 0.6;
        } else if (this.phase === 1) {
          this.armUp = Math.min(1, this.armUp + dt * 2.4);
          this.charge = Math.min(0.8, this.charge + dt * 1.4);
          if (this.timer <= 0) {
            FG.audio.sfx('bossSpit');
            this.armUp = 0;
            this.shake = 0.8;
            // jorro visível subindo (as bolas "de verdade" caem das sombras)
            for (let i = 0; i < 10; i++) {
              spawnParticle(this.x - SLUG_W + rand(-20, 20), this.groundY - SLUG_H - 40,
                rand(-120, -20), rand(-520, -300), 0.7, 5, '#5fc248', 600);
            }
            const n = p2 ? 8 : 6;
            const gap = p2 ? 0.16 : 0.2;
            this.spawnChuva(n, 0.7, gap);
            this.phase = 2;
            this.timer = 0.7 + n * gap + 0.7;
          }
        } else if (this.phase === 2) {
          this.charge = Math.max(0, this.charge - dt * 0.8);
          if (this.timer <= 0) this.expose();
        }

      // ================= 4. ONDA DE GOSMA (rasteira, dois lados) =================
      } else if (this.state === 'onda') {
        if (this.phase === 0) {
          // telegraph: a lesma incha feito balão — 0.65s
          this.phase = 1;
          this.timer = 0.65;
        } else if (this.phase === 1) {
          this.pulse = Math.min(1, this.pulse + dt * 2.2);
          this.charge = Math.min(1, this.charge + dt * 1.6);
          if (this.timer <= 0) {
            FG.audio.sfx('bossRoar');
            this.pulse = 0;
            this.shake = 1;
            // a onda nasce dos dois lados da lesma e corre rente ao chão:
            // 46px de altura — passa por baixo de qualquer pulo
            this.spawnOnda(-1);
            this.spawnOnda(1);
            // fase 2: segunda leva atrasada, para o pulo não resolver os
            // dois lados com um salto só
            this.phase = 2;
            this.timer = p2 ? 0.55 : 1.4;
          }
        } else if (this.phase === 2) {
          this.charge = Math.max(0, this.charge - dt * 1.2);
          if (this.timer <= 0) {
            if (p2 && this.phase2Wave !== this.attackIndex) {
              this.phase2Wave = this.attackIndex;
              this.spawnOnda(-1);
              this.spawnOnda(1);
              this.timer = 1.2;
            } else {
              this.expose();
            }
          }
        }
      }

      this.refreshPose();

      // ---------- contato com a lesma ----------
      // A massa da lesma (e a cavaleira) machucam no contato, exceto
      // debruçada (lean), na carência `safe` — em que ela EMPURRA em vez de
      // machucar — e claro, morta.
      if (this.safe > 0) {
        if (ov(p, this.bodyBox)) {
          const lado = (p.x + p.w / 2) < this.x ? -1 : 1;
          p.vx = lado * 300;
        }
      } else if (this.lean <= 0.15 && ov(p, this.bodyBox)) {
        p.hurt(2, this.x);
      }
    },

    // marca de fase-2 da onda (ver ataque 4); vive no objeto para o reset
    // não precisar conhecê-la — attackIndex muda a cada ciclo de qualquer jeito
    phase2Wave: -1,

    // Gosma espirrando sob a lesma achatada enquanto ela corre.
    dashDust() {
      if (Math.random() < 0.8) {
        spawnParticle(this.x + rand(-SLUG_W, SLUG_W), this.groundY, rand(-120, 120), rand(-200, -40),
          0.45, 4 + Math.random() * 3, Math.random() < 0.5 ? '#4fae3a' : '#2e6b24', 700);
      }
    },

    // Cospe uma bola de slime da boca da lesma.
    spitBall(x, y, vx, vy) {
      for (let i = 0; i < MAXBOLA; i++) {
        const b = bolas[i];
        if (b.active) continue;
        b.active = true;
        b.x = x; b.y = y;
        b.vx = vx; b.vy = vy;
        b.r = 16;
        b.bounced = false;
        return;
      }
    },

    // Deixa um tapete de gosma onde a lesma passou. Espaçado por distância
    // (não por tempo) para o tapete sair uniforme nas duas pernadas.
    dropRastro(p2) {
      // só solta se o último segmento vivo estiver a mais de ~70px
      let nearest = 1e9;
      for (let i = 0; i < MAXRASTRO; i++) {
        const r = rastros[i];
        if (!r.active) continue;
        const d = Math.abs((r.x + r.w / 2) - this.x);
        if (d < nearest) nearest = d;
      }
      if (nearest < 74) return;
      for (let i = 0; i < MAXRASTRO; i++) {
        const r = rastros[i];
        if (r.active) continue;
        r.active = true;
        r.w = 92;
        r.h = 18;
        r.x = this.x - r.w / 2;
        r.y = groundYAt(this.x, 300) - r.h;
        // fase 2: o rastro fica mais tempo no chão (4.5s vs 3s) — o tabuleiro
        // envenenado é o que obriga o jogador a lutar no ar
        r.max = p2 ? 4.5 : 3;
        r.t = r.max;
        return;
      }
    },

    // Agenda `n` bolas de chuva: sombra no chão por `warn`+i*gap, depois cai.
    spawnChuva(n, warn, gap) {
      const a = FG.level.arena;
      let spawned = 0;
      for (let i = 0; i < MAXCHUVA && spawned < n; i++) {
        const c = chuvas[i];
        if (c.active) continue;
        c.active = true;
        c.state = 'sombra';
        // espalha pela faixa onde o jogador luta, com jitter
        c.x = a.x + 80 + (spawned / n) * (a.w - 300) + rand(-26, 26);
        c.groundY = groundYAt(c.x, 300);
        c.y = c.groundY - 560;
        c.vy = 0;
        c.timer = warn + spawned * gap;
        c.r = 18;
        spawned++;
      }
    },

    spawnOnda(dir) {
      for (let i = 0; i < MAXONDA; i++) {
        const o = ondas[i];
        if (o.active) continue;
        o.active = true;
        o.dir = dir;
        o.x = this.x + dir * (SLUG_W + 10);
        o.groundY = this.groundY;
        return;
      }
    },

    // O que o engine chama (via FG.enemies). Corpo primeiro, perigos depois.
    update(dt) {
      this.step(dt);
      // Bolas, rastros e ondas continuam vivos durante a morte: o que já
      // estava no mundo não evapora no frame em que a lesma derrete.
      if (this.started || this.dead) updateBossStuff(dt);
    },

    draw(ctx, cam) {
      drawDalilesma(ctx, cam);
      drawBossStuff(ctx, cam);
    },
  };

  // ==================================================================
  // Bolas, rastros, chuva e ondas
  // ==================================================================
  // Caixa de rascunho reaproveitada nos testes de colisão (nada de alocar
  // objeto por frame).
  const scratch = { x: 0, y: 0, w: 0, h: 0 };

  function updateBossStuff(dt) {
    const p = FG.player;
    const ov = FG.engine.rectsOverlap;
    const a = FG.level.arena;
    // "Nada machuca durante a janela" vale para a chefã INTEIRA: a bola ainda
    // no ar, o rastro no chão e a onda a correr apagam o dano enquanto ela
    // está debruçada. Continuam a ser desenhados: só não ferem.
    const janela = boss.state === 'exposto';

    // ---- bolas de slime (quicam UMA vez, estouram na segunda) ----
    for (let i = 0; i < MAXBOLA; i++) {
      const b = bolas[i];
      if (!b.active) continue;
      b.vy += GRAV * 0.8 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (Math.random() < 0.4) {
        spawnParticle(b.x, b.y, rand(-20, 20), rand(-30, 20), 0.3, 2.6, '#8de06a', 0);
      }
      const gy = groundYAt(b.x, 300);
      scratch.x = b.x - b.r; scratch.y = b.y - b.r; scratch.w = b.r * 2; scratch.h = b.r * 2;
      if (b.y + b.r >= gy) {
        if (!b.bounced) {
          // primeiro quique: perde força, respinga e segue
          b.bounced = true;
          b.y = gy - b.r;
          b.vy = -Math.abs(b.vy) * 0.55;
          b.vx *= 0.85;
          for (let k = 0; k < 4; k++) {
            spawnParticle(b.x, gy - 4, rand(-90, 90), rand(-150, -40), 0.4, 3, '#5fc248', 700);
          }
        } else {
          b.active = false;
          burstSlime(b.x, gy);
        }
      } else if (!janela && ov(p, scratch)) {
        b.active = false;
        p.hurt(2, b.x);
        burstSlime(b.x, gy);
      }
      if (b.x < a.x - 140 || b.x > a.x + a.w + 140) b.active = false;
    }

    // ---- rastro de gosma (fica no chão; pisar dói) ----
    for (let i = 0; i < MAXRASTRO; i++) {
      const r = rastros[i];
      if (!r.active) continue;
      r.t -= dt;
      if (r.t <= 0) { r.active = false; continue; }
      if (Math.random() < 0.15) {
        spawnParticle(r.x + rand(0, r.w), r.y + r.h, rand(-15, 15), rand(-70, -30), 0.5, 3, '#5fc248', 0);
      }
      // rastro é perigo de piso: 1 de dano, como os hazards do cenário
      if (!janela && ov(p, r)) p.hurt(1, r.x + r.w / 2);
    }

    // ---- chuva de slime (sombra avisa, bola cai) ----
    for (let i = 0; i < MAXCHUVA; i++) {
      const c = chuvas[i];
      if (!c.active) continue;
      if (c.state === 'sombra') {
        c.timer -= dt;
        if (c.timer <= 0) { c.state = 'cai'; c.vy = 120; }
      } else {
        c.vy += GRAV * 1.05 * dt;
        c.y += c.vy * dt;
        scratch.x = c.x - c.r; scratch.y = c.y - c.r; scratch.w = c.r * 2; scratch.h = c.r * 2;
        if (!janela && ov(p, scratch)) {
          c.active = false;
          p.hurt(2, c.x);
          burstSlime(c.x, c.groundY);
          continue;
        }
        if (c.y + c.r >= c.groundY) {
          c.active = false;
          burstSlime(c.x, c.groundY);
        }
      }
    }

    // ---- ondas rasteiras ----
    for (let i = 0; i < MAXONDA; i++) {
      const o = ondas[i];
      if (!o.active) continue;
      const v = boss.isPhase2() ? 480 : 410;
      o.x += o.dir * v * dt;
      if (Math.random() < 0.6) {
        spawnParticle(o.x + rand(-20, 20), o.groundY - rand(0, o.h), rand(-40, 40), rand(-140, -40),
          0.4, 3.5, '#6fd84f', 500);
      }
      scratch.x = o.x - o.w / 2; scratch.y = o.groundY - o.h; scratch.w = o.w; scratch.h = o.h;
      if (!janela && ov(p, scratch)) p.hurt(1, o.x);
      if (o.x < a.x - 80 || o.x > a.x + a.w + 80) o.active = false;
    }
  }

  // Bola estourando: respingo verde + gotas
  function burstSlime(x, gy) {
    for (let i = 0; i < 9; i++) {
      spawnParticle(x, gy - 6, rand(-200, 200), rand(-280, -60), 0.55, 3 + Math.random() * 4,
        Math.random() < 0.5 ? '#8de06a' : '#3a8a2c', 900);
    }
  }

  // ==================================================================
  // DESENHO — tudo canvas puro
  // ==================================================================

  // Silhueta gosmenta: polígono irregular com tabela FIXA de variações para
  // o corpo não ferver de frame em frame; a ondulação viva vem de `t`.
  const BLOB_N = 10;
  const BLOB_JAG = [1.0, 0.94, 1.06, 0.96, 1.05, 0.92, 1.07, 0.95, 1.02, 0.97];
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

  function drawDalilesma(ctx, cam) {
    const VIEW_W = FG.enemies.fx.VIEW_W;
    const a = FG.level.arena;
    if (cam.x + VIEW_W < a.x - 200 || cam.x > a.x + a.w + 200) return;
    if (!boss.started && !boss.dead) {
      boss.resolveGeometry();
      boss.refreshPose();
    }

    const t = FG.engine.time;
    const dying = boss.state === 'dying';
    if (dying && boss.dieTimer >= 2.6) return;

    const sh = boss.shake * (dying ? 4 : 3);
    const X = boss.x - cam.x + (sh > 0 ? rand(-sh, sh) : 0);
    const GY = boss.groundY - cam.y + (sh > 0 ? rand(-sh * 0.5, sh * 0.5) : 0);
    const p2 = boss.isPhase2();
    const heat = Math.min(1, boss.charge + (p2 ? 0.25 : 0));

    ctx.save();
    ctx.translate(X, GY);

    // sombra no chão
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#0a1406';
    ctx.beginPath();
    ctx.ellipse(0, -2, (SLUG_W + 20) * (1 - boss.slugMelt * 0.2), 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawSlug(ctx, t, heat, dying);
    drawGirl(ctx, t, heat, dying);

    // balão de fala da intro: a ordem dela, curta e mandona — e a gargalhada
    // involuntária quando o MurphOliver faz cócegas
    if (boss.state === 'intro') {
      drawBalao(ctx, -40, -(SLUG_H + 190), 'Você não passa!');
    } else if (boss.tickle > 0 && boss.state === 'exposto') {
      drawBalao(ctx, -40, -(SLUG_H + 190), 'HAHAHA! Para!');
    }

    ctx.restore();
  }

  // ---- a lesma de slime ----
  function drawSlug(ctx, t, heat, dying) {
    // respiração gosmenta: o corpo ondula devagar; empinar/achatar/inchar
    // entram como escalas sobre a mesma massa
    const wob = Math.sin(t * 2.4) * 0.03;
    const melt = boss.slugMelt;
    const squishY = (1 - boss.duck * 0.6) * (1 + boss.pulse * 0.22 + wob) * (1 - melt * 0.82);
    const squishX = (1 + boss.duck * 0.35) * (1 + boss.pulse * 0.12 - wob * 0.5) * (1 + melt * 0.5);
    const rear = boss.rear;

    ctx.save();
    ctx.scale(squishX, squishY);
    if (rear > 0) ctx.rotate(-rear * 0.12);   // empina a frente para cuspir

    // corpo translúcido: duas camadas — miolo escuro e pele clara por cima
    const corpo = ctx.createLinearGradient(0, -SLUG_H - 40, 0, 0);
    corpo.addColorStop(0, 'rgba(141,224,106,0.92)');
    corpo.addColorStop(0.5, 'rgba(79,174,58,0.9)');
    corpo.addColorStop(1, 'rgba(42,110,30,0.95)');
    ctx.fillStyle = corpo;
    // massa principal: blob largo com cauda subindo à direita
    shapeBlob(ctx, 10, -SLUG_H * 0.52, SLUG_W, SLUG_H * 0.56, t * 0.15);
    ctx.fill();
    // cauda enrolada atrás
    shapeBlob(ctx, SLUG_W * 0.86, -SLUG_H * 0.78, 46, 40, 1.2 + t * 0.1);
    ctx.fill();
    // cabeça à frente (de onde saem as antenas e a boca)
    shapeBlob(ctx, -SLUG_W * 0.82, -SLUG_H * 0.6 - rear * 26, 58, 52, 0.4 - t * 0.12);
    ctx.fill();

    // brilho interno (gosma acesa no telegraph)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 + heat * 0.3;
    const gl = ctx.createRadialGradient(-20, -SLUG_H * 0.5, 8, -20, -SLUG_H * 0.5, SLUG_W);
    gl.addColorStop(0, '#c8ff9a');
    gl.addColorStop(1, 'rgba(200,255,154,0)');
    ctx.fillStyle = gl;
    shapeBlob(ctx, 10, -SLUG_H * 0.52, SLUG_W * 0.9, SLUG_H * 0.5, t * 0.15);
    ctx.fill();
    ctx.restore();

    // reflexo de superfície molhada
    ctx.fillStyle = 'rgba(240,255,220,0.35)';
    ctx.beginPath();
    ctx.ellipse(-30, -SLUG_H * 0.86, SLUG_W * 0.42, 16, -0.15, 0, Math.PI * 2);
    ctx.fill();

    // gotas pingando da barriga (sempre as mesmas 4 posições, fase anima)
    ctx.fillStyle = 'rgba(95,194,72,0.8)';
    for (let i = 0; i < 4; i++) {
      const gx = -SLUG_W + 50 + i * 70;
      const k = (t * 0.9 + i * 0.37) % 1;
      ctx.beginPath();
      ctx.ellipse(gx, -10 + k * 14, 4.5, 6 + k * 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // antenas com olhos: duas hastes saindo da cabeça, olhos grandes no topo
    const hx = -SLUG_W * 0.82, hy = -SLUG_H * 0.6 - rear * 26;
    for (let s = -1; s <= 1; s += 2) {
      const ax = hx + s * 16, tipx = hx + s * 26 - 8, tipy = hy - 78 - s * 6 + Math.sin(t * 3 + s) * 4;
      ctx.strokeStyle = 'rgba(79,174,58,0.95)';
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, hy - 20);
      ctx.quadraticCurveTo(ax - 6, hy - 55, tipx, tipy);
      ctx.stroke();
      // globo ocular
      ctx.fillStyle = '#f4fbe8';
      ctx.beginPath();
      ctx.arc(tipx, tipy - 8, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1c2a12';
      ctx.beginPath();
      ctx.arc(tipx - 4, tipy - 8, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // boca da lesma: abre no telegraph da rajada
    const abre = 4 + rear * 16 + boss.pulse * 8;
    ctx.fillStyle = '#1e4a16';
    ctx.beginPath();
    ctx.ellipse(hx - 24, hy + 18, 16, abre, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // poça de morte: cresce enquanto a lesma derrete
    if (melt > 0.02) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(79,174,58,0.9)';
      ctx.beginPath();
      ctx.ellipse(0, -8, (SLUG_W + 30) * (0.3 + melt * 0.8), 16 + melt * 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---- a Dalilesma, montada (ou caída, na morte) ----
  function drawGirl(ctx, t, heat, dying) {
    const k = boss.lean;             // 0 montada -> 1 debruçada
    const melt = boss.slugMelt;
    const sit = boss.sitK;

    // âncoras: sela no lombo; debruçada ela desce pelo pescoço da lesma
    let cx = lerp(CHEST_UP.x, CHEST_DN.x, k);
    let cy = lerp(CHEST_UP.y, CHEST_DN.y, k);
    // morte: escorrega da lesma que derrete e cai sentada no chão
    if (dying) {
      cx = lerp(cx, -30, sit);
      cy = lerp(cy * (1 - melt * 0.7), -64, sit);
    }
    const duckDrop = boss.duck * 54;  // abaixada na sela durante a investida
    cy += duckDrop;

    const bob = Math.sin(t * 2.4) * 3 * (1 - k);
    const hx = cx - 10 - k * 18, hy = cy - 52 + bob;   // cabeça
    const inclina = k * 0.5;                            // debruçada inclina o tronco

    ctx.save();
    ctx.translate(0, bob);

    // ---- perna de cá (aparece montada na lateral da lesma) ----
    if (sit < 0.5) {
      ctx.strokeStyle = '#e8b88a';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + 8, cy + 34);
      ctx.quadraticCurveTo(cx + 18, cy + 72, cx + 8, cy + 98 - boss.duck * 30);
      ctx.stroke();
      // sapatinho
      ctx.fillStyle = '#5a2e18';
      ctx.beginPath();
      ctx.ellipse(cx + 4, cy + 102 - boss.duck * 30, 14, 8, 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // sentada no chão, pernas à frente; o pé da frente BATE no chão
      const stomp = Math.abs(Math.sin(t * 7)) * 14;
      ctx.strokeStyle = '#e8b88a';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy + 30);
      ctx.lineTo(cx - 48, cy + 58);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 6, cy + 30);
      ctx.lineTo(cx - 40, cy + 58 - stomp);
      ctx.stroke();
      ctx.fillStyle = '#5a2e18';
      ctx.beginPath();
      ctx.ellipse(cx - 46, cy + 58 - stomp, 13, 8, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - 54, cy + 60, 13, 8, -0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- vestido azul: trapézio que abre na saia ----
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(inclina);
    const vest = ctx.createLinearGradient(0, -36, 0, 54);
    vest.addColorStop(0, '#6aa8e8');
    vest.addColorStop(0.55, '#3f7cd0');
    vest.addColorStop(1, '#2a56a0');
    ctx.fillStyle = vest;
    ctx.beginPath();
    ctx.moveTo(-20, -34);
    ctx.lineTo(20, -34);
    ctx.quadraticCurveTo(30, 10, 42, 52);
    ctx.lineTo(-42, 52);
    ctx.quadraticCurveTo(-30, 10, -20, -34);
    ctx.closePath();
    ctx.fill();
    // barra da saia
    ctx.strokeStyle = 'rgba(220,236,255,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-42, 50);
    ctx.quadraticCurveTo(0, 58, 42, 50);
    ctx.stroke();

    // ---- O LAÇO DO PEITO — o ponto fraco. Na janela, GRITA: coração
    // rosa com anel pulsante, visível contra o vestido azul. ----
    const eg = boss.eyeGlow;
    ctx.save();
    if (eg > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      // anel pulsante: a marca do alvo
      ctx.strokeStyle = 'rgba(255,120,180,' + (0.5 + eg * 0.5).toFixed(3) + ')';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -10, 26 + eg * 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    // coração/laço
    ctx.fillStyle = eg > 0.02 ? '#ff7ab4' : '#e05a94';
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.bezierCurveTo(-16, -22, -30, -2, 0, 16);
    ctx.bezierCurveTo(30, -2, 16, -22, 0, -2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // ---- braços ----
    const point = Math.max(boss.armUp, boss.state === 'intro' ? 1 : 0);
    ctx.strokeStyle = '#e8b88a';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    // braço de trás segura a "rédea" (uma antena imaginária): curva à frente
    ctx.beginPath();
    ctx.moveTo(cx + 12, cy - 20);
    ctx.quadraticCurveTo(cx - 20, cy - 2, cx - 44 - k * 30, cy + 10 + k * 10);
    ctx.stroke();
    // braço da frente: aponta (intro/chuva) ou segura junto
    ctx.beginPath();
    if (point > 0.1) {
      const px2 = cx - 26 - point * 44, py2 = cy - 26 - point * (boss.state === 'chuva' ? 54 : 10);
      ctx.moveTo(cx - 10, cy - 22);
      ctx.quadraticCurveTo(cx - 24, cy - 30, px2, py2);
    } else {
      ctx.moveTo(cx - 10, cy - 22);
      ctx.quadraticCurveTo(cx - 34, cy - 6, cx - 50 - k * 34, cy + 8 + k * 12);
    }
    ctx.stroke();

    // ---- cabeça: rosto + cabelão cacheado castanho ----
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(inclina * 0.7);
    // cachos: coroa de círculos castanhos em volta do rosto (tabela fixa)
    ctx.fillStyle = '#5a3a22';
    for (let i = 0; i < 9; i++) {
      const ang = -Math.PI * 0.95 + (i / 8) * Math.PI * 1.35;
      const rr = 13 + (i % 3) * 3;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * 24, Math.sin(ang) * 22 - 4, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    // volume extra caindo nos ombros
    ctx.beginPath();
    ctx.arc(22, 16, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-24, 14, 13, 0, Math.PI * 2);
    ctx.fill();
    // rosto
    ctx.fillStyle = '#f2cfa0';
    ctx.beginPath();
    ctx.ellipse(-2, 2, 19, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    // franja
    ctx.fillStyle = '#5a3a22';
    ctx.beginPath();
    ctx.ellipse(-2, -11, 19, 10, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    // olhos — mandona: sobrancelhas em V
    ctx.strokeStyle = '#3a2414';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-14, -5); ctx.lineTo(-5, -2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -5); ctx.lineTo(2, -2); ctx.stroke();
    ctx.fillStyle = '#241408';
    ctx.beginPath(); ctx.arc(-9, 3, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6, 3, 3.4, 0, Math.PI * 2); ctx.fill();
    // boca: bico de ordem (ou aberta gritando na intro)
    ctx.strokeStyle = '#8a3a30';
    ctx.lineWidth = 2.4;
    if (boss.state === 'intro' || boss.armUp > 0.5) {
      ctx.fillStyle = '#8a3a30';
      ctx.beginPath(); ctx.ellipse(-3, 12, 5, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(-3, 12, 4.5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    }
    // lacinho no cabelo (combina com o ponto fraco)
    ctx.fillStyle = '#ff7ab4';
    ctx.beginPath();
    ctx.moveTo(10, -24); ctx.lineTo(24, -32); ctx.lineTo(22, -18); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(10, -24); ctx.lineTo(0, -34); ctx.lineTo(2, -18); ctx.closePath();
    ctx.fill();
    ctx.restore();

    // flash de dano por cima de tudo
    if (boss.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = boss.flash * 2.2;
      ctx.fillStyle = '#fff2f8';
      ctx.beginPath();
      ctx.arc(cx, cy - 10, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // Balão de fala simples, com rabicho apontando para baixo.
  function drawBalao(ctx, bx, by, texto) {
    ctx.save();
    ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
    const w = ctx.measureText(texto).width + 28;
    const h = 38;
    ctx.fillStyle = 'rgba(255,252,240,0.95)';
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    // retângulo arredondado à mão (sem depender de roundRect)
    const r = 12, x0 = bx - w / 2, y0 = by - h;
    ctx.moveTo(x0 + r, y0);
    ctx.lineTo(x0 + w - r, y0);
    ctx.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    ctx.lineTo(x0 + w, y0 + h - r);
    ctx.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    ctx.lineTo(bx + 18, y0 + h);
    ctx.lineTo(bx + 4, y0 + h + 16);    // rabicho
    ctx.lineTo(bx - 4, y0 + h);
    ctx.lineTo(x0 + r, y0 + h);
    ctx.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    ctx.lineTo(x0, y0 + r);
    ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3a2a1a';
    ctx.textAlign = 'center';
    ctx.fillText(texto, bx, by - 12);
    ctx.restore();
  }

  // ---- bolas, rastros, sombras e ondas ----
  function drawBossStuff(ctx, cam) {
    const t = FG.engine.time;
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // rastro de gosma no chão (pisca quando está acabando)
    for (let i = 0; i < MAXRASTRO; i++) {
      const r = rastros[i];
      if (!r.active) continue;
      const fade = r.t < 0.8 ? (Math.sin(t * 18) > 0 ? 0.45 : 0.85) : 1;
      ctx.save();
      ctx.globalAlpha = 0.85 * fade;
      const gr = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      gr.addColorStop(0, '#8de06a');
      gr.addColorStop(1, '#2e6b24');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2, r.y + r.h, r.w / 2, r.h, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      // bolhinhas na superfície
      ctx.fillStyle = 'rgba(220,255,190,0.5)';
      ctx.beginPath();
      ctx.arc(r.x + r.w * 0.3, r.y + 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(r.x + r.w * 0.7, r.y + 6, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // bolas de slime voando
    for (let i = 0; i < MAXBOLA; i++) {
      const b = bolas[i];
      if (!b.active) continue;
      ctx.save();
      const gr = ctx.createRadialGradient(b.x - 5, b.y - 5, 2, b.x, b.y, b.r + 4);
      gr.addColorStop(0, '#d2f7b0');
      gr.addColorStop(0.5, '#6fd84f');
      gr.addColorStop(1, 'rgba(46,107,36,0.85)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      // levemente oval na direção do voo
      const ang = Math.atan2(b.vy, b.vx);
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      ctx.scale(1.15, 0.9);
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // chuva: sombra que cresce no chão, depois a bola caindo
    for (let i = 0; i < MAXCHUVA; i++) {
      const c = chuvas[i];
      if (!c.active) continue;
      if (c.state === 'sombra') {
        const k = Math.max(0.2, 1 - c.timer / 0.9);
        ctx.save();
        ctx.globalAlpha = 0.5 * k + 0.2 * Math.sin(t * 14);
        ctx.fillStyle = '#1c3a10';
        ctx.beginPath();
        ctx.ellipse(c.x, c.groundY - 4, 26 * k, 7 * k, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        const gr = ctx.createRadialGradient(c.x - 5, c.y - 5, 2, c.x, c.y, c.r + 4);
        gr.addColorStop(0, '#d2f7b0');
        gr.addColorStop(0.5, '#6fd84f');
        gr.addColorStop(1, 'rgba(46,107,36,0.85)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.r * 0.9, c.r * 1.15, 0, 0, Math.PI * 2);
        ctx.fill();
        // sombra embaixo enquanto cai
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#1c3a10';
        ctx.beginPath();
        ctx.ellipse(c.x, c.groundY - 4, 22, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ondas rasteiras: cristas de gosma correndo
    for (let i = 0; i < MAXONDA; i++) {
      const o = ondas[i];
      if (!o.active) continue;
      ctx.save();
      const gr = ctx.createLinearGradient(0, o.groundY - o.h, 0, o.groundY);
      gr.addColorStop(0, '#a8ec84');
      gr.addColorStop(1, '#2e6b24');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(o.x - o.w / 2, o.groundY);
      // crista curvada na direção do movimento
      ctx.quadraticCurveTo(o.x - o.dir * 10, o.groundY - o.h * 1.3,
        o.x + o.dir * o.w * 0.55, o.groundY - o.h * 0.5);
      ctx.quadraticCurveTo(o.x + o.dir * o.w * 0.4, o.groundY - 4, o.x + o.w / 2, o.groundY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  FG.enemies.registerBoss('dalilesma', boss);
})();
