// Fagulho: Lendas do Bosque — boss8.js
// Chefa da fase 8 (As Terras de Lava): BUJÃOZINHO VEROLA.
// Mulher gordinha e baixinha de COROA dourada, capa azul com barra roxa e
// botas azuis, que comanda o Nether tocando um BERRANTE de chifre de cabra
// (curvo, listrado em arcos marrom/creme). Veio direto do desenho de
// referência: ela grandona, brava, soprando o berrante com as bochechas
// infladas, cercada de piglins e ghasts que obedecem ao toque.
// QUATRO ataques, todos tocados no berrante:
//   - berrante: enche o peito e sopra uma ONDA SONORA visível (anéis
//     concêntricos) que atravessa a arena na altura dela — 2 de dano e um
//     empurrão forte; pula-se por cima;
//   - convoca: toque curto pro CÉU e 3 bolas de fogo de ghast caem do alto,
//     cada uma com a sombra/alvo pulsando no chão ~0.8s antes do impacto
//     (respingo de lava, 2 de dano no raio);
//   - pisao: ela pula e cai de bunda — tremor de câmera e DUAS ondas de
//     choque de lava correndo pelo chão, uma pra cada lado (1 de dano,
//     saltáveis);
//   - rebanho: toque grave e 4 CABRITINHAS DE FOGO atravessam a arena em
//     fila na direção do jogador (1 de dano cada, pulam-se).
// Ela é chefã TERRESTRE (fica de pé no chão de pedra da arena, sobre o mar
// de lava) — a gravidade só entra no pulo do pisão, o resto é pose.
// Mesma arquitetura dos outros chefões: máquina de estados, pools de
// projétil pré-alocadas, reset() que limpa tudo, janela 'exposto' de ~2.6s
// depois de CADA ataque (ela senta tonta, a coroa escorrega e a cabeça desce
// a ~150px do chão), e fase 2 a partir de hp<=4 (intervalos ×0.85 e
// projéteis um pouco mais rápidos).
// A ÚNICA coisa que este arquivo faz no load é registar-se em FG.enemies
// (enemies.js vem antes no index.html); todo o resto só olha para FG.*
// dentro de funções chamadas em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  const GRAV = 2200;         // mesma gravidade do player (usada no pulo do pisão)

  // Atalhos para os efeitos partilhados de enemies.js — criados uma vez e só
  // tocam em FG.enemies quando chamados (regra de load do projeto).
  const spawnParticle = (x, y, vx, vy, life, size, color, grav) =>
    FG.enemies.fx.spawnParticle(x, y, vx, vy, life, size, color, grav);
  const goldBurst = (cx, cy, n, lumiCount) => FG.enemies.fx.goldBurst(cx, cy, n, lumiCount);
  const groundYAt = (x, yMin) => FG.enemies.fx.groundYAt(x, yMin);
  const rand = (a, b) => FG.enemies.fx.rand(a, b);
  const lerp = (a, b, k) => a + (b - a) * k;

  // ==================================================================
  // MEDIDAS — corpo em pera: baixinha e larga. Desenhada encarando +x e
  // espelhada por `dir` (como o Francisco); dir=-1 é de olho na esquerda,
  // de onde o jogador chega.
  // ==================================================================
  const V_W = 104;           // largura do corpo (a saia é quase isso tudo)
  const V_H = 148;           // altura em pé, do chão ao topo da cabeça

  // Cabeça/coroa — o ponto fraco. Em pé ela vive lá no alto; na janela a
  // Verola cai sentada e a cabeça desce a ~150px do chão (a medida do
  // contrato: um pulo simples alcança, mesmo cortado).
  const HEAD_UP = { x: 2, y: -(V_H - 10) };  // centro da cabeça, em pé
  const HEAD_DN = { x: 10, y: -150 };        // sentada, tonta (janela)
  const CORE_W = 58, CORE_H = 56;

  // ---------- pools do chefão (pré-alocadas; reset() apaga todas) ----------
  // Onda sonora do berrante: uma parede de som que atravessa a arena rente
  // ao chão. SOM_H baixa o bastante para um pulo duplo passar folgado por
  // cima — a esquiva do ataque é essa.
  const MAXSOM = 2;
  const SOM_SPEED = 520;
  const SOM_W = 72;          // espessura da faixa que machuca
  const SOM_H = 118;         // altura da faixa, do chão para cima
  const sons = [];
  for (let i = 0; i < MAXSOM; i++) {
    sons.push({ active: false, x: 0, dir: 1, groundY: 0, idade: 0 });
  }

  // Bolas de fogo de ghast: sombra/alvo pulsante no chão, depois a bola cai.
  const MAXBOLA = 6;
  const BOLA_R = 20;
  const BOLA_IMPACTO_R = 58; // raio do respingo de lava (dano no impacto)
  const bolas = [];
  for (let i = 0; i < MAXBOLA; i++) {
    bolas.push({ active: false, state: 'sombra', x: 0, y: 0, vy: 0, timer: 0, groundY: 0, r: BOLA_R });
  }

  // Ondas de choque de lava do pisão: retângulos baixos incandescentes que
  // correm pelo chão — 40px de altura, qualquer pulo passa.
  const MAXCHOQUE = 4;
  const CHOQUE_SPEED = 470;
  const choques = [];
  for (let i = 0; i < MAXCHOQUE; i++) {
    choques.push({ active: false, x: 0, dir: 1, groundY: 0, w: 70, h: 40 });
  }

  // Cabritinhas de fogo: bichinhos de lava chifrudos que correm em fila.
  const MAXCABRA = 8;
  const CABRA_SPEED = 410;
  const cabras = [];
  for (let i = 0; i < MAXCABRA; i++) {
    cabras.push({ active: false, x: 0, y: 0, vx: 0, dir: 1, groundY: 0, w: 38, h: 30, phase: 0 });
  }

  // O berrante voando na morte — não é pool, é UM objeto da cinemática.
  const hornFly = { active: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vrot: 0 };

  const boss = {
    id: 'verola',
    nome: 'BUJÃOZINHO VEROLA',

    // --- contrato lido pelo engine ---
    started: false,
    active: false,
    dead: false,
    hp: 10,
    maxHp: 10,

    // --- geometria (resolvida em runtime) ---
    homeX: 0,
    x: 0, y: 0,      // y é o offset do PULO do pisão (0 = pé no chão)
    groundY: 0,

    // --- pose (0..1, interpoladas; o desenho lê daqui) ---
    sopro: 0,        // berrante erguido à boca, bochechas inflando
    armCeu: 0,       // berrante apontado pro céu (convoca)
    crouch: 0,       // agachada (telegraph do pisão)
    sit: 0,          // caída sentada, tonta (janela e morte)
    charge: 0,       // brilho crescente na boca do chifre (telegraphs de sopro)
    shake: 0,
    flash: 0,

    // --- máquina de estados ---
    state: 'dormant', // dormant|intro|idle|berrante|convoca|pisao|rebanho|exposto|dying
    phase: 0,
    timer: 0,
    attackIndex: 0,
    stunHit: false,
    safe: 0,
    dieTimer: 0,
    victoryFired: false,

    dir: -1,         // de olho na esquerda, como os outros chefões de arena
    vy: 0,           // velocidade do pulo do pisão
    spawnLeft: 0,    // rebanho: cabritinhas que ainda faltam sair
    spawnTimer: 0,   // rebanho: intervalo até a próxima

    coreBox: { x: 0, y: 0, w: CORE_W, h: CORE_H },
    bodyBox: { x: 0, y: 0, w: 0, h: 0 },

    start() {
      if (this.started) return;
      this.started = true;
      this.resolveGeometry();
      this.state = 'intro';
      this.timer = 1.3;
      FG.audio.sfx('bossRoar');
      FG.audio.music('boss8');
    },

    resolveGeometry() {
      const a = FG.level.arena;
      this.groundY = groundYAt(a.x + a.w * 0.7, 300);
      // longe da parede da direita: sentada na janela a cabeça avança um
      // pouco, e o jogador precisa de chão dos dois lados do ponto fraco
      this.homeX = a.x + a.w - 230;
      this.x = this.homeX;
      this.y = 0;
    },

    reset() {
      // Volta TUDO ao estado inicial, inclusive as pools — uma bola de ghast
      // desta chefa não pode sobreviver à troca de fase.
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
      this.sopro = 0;
      this.armCeu = 0;
      this.crouch = 0;
      this.sit = 0;
      this.charge = 0;
      this.shake = 0;
      this.flash = 0;
      this.dieTimer = 0;
      this.victoryFired = false;
      this.dir = -1;
      this.vy = 0;
      this.y = 0;
      this.spawnLeft = 0;
      this.spawnTimer = 0;
      for (let i = 0; i < MAXSOM; i++) sons[i].active = false;
      for (let i = 0; i < MAXBOLA; i++) bolas[i].active = false;
      for (let i = 0; i < MAXCHOQUE; i++) choques[i].active = false;
      for (let i = 0; i < MAXCABRA; i++) cabras[i].active = false;
      hornFly.active = false;
    },

    // Fase 2 a partir de hp<=4: intervalos ×0.85 e projéteis um pouco mais
    // rápidos. Os TELEGRAPHS não encurtam — 0.85s é piso da forma comum.
    isPhase2() { return this.hp <= 4; },

    // Recalcula as caixas. Em função porque o desenho também precisa dela
    // enquanto a chefa dorme (antes do primeiro update).
    refreshPose() {
      const k = this.sit;
      const cb = this.coreBox;
      cb.w = CORE_W; cb.h = CORE_H;
      cb.x = this.x + this.dir * lerp(HEAD_UP.x, HEAD_DN.x, k) - cb.w / 2;
      cb.y = this.groundY + this.y + lerp(HEAD_UP.y, HEAD_DN.y, k) - cb.h / 2;

      // massa que machuca no contato: o corpo inteiro. Sentada (janela) a
      // caixa encolhe junto, mas nem importa — exposto nada machuca.
      const alto = V_H * lerp(1, 0.68, Math.max(k, this.crouch * 0.4));
      const bb = this.bodyBox;
      bb.w = V_W + 18;
      bb.h = alto;
      bb.x = this.x - bb.w / 2;
      bb.y = this.groundY + this.y - alto;
    },

    // Fim de ataque: ela senta no chão tonta, a coroa escorrega e a cabeça
    // desce ao alcance do pulo. Vem depois de TODOS os ataques.
    expose() {
      this.state = 'exposto';
      this.timer = 2.6; // janela padrão dos chefões de ataque único
      this.phase = 0;
      this.stunHit = false;
      this.sopro = 0;
      this.armCeu = 0;
      this.crouch = 0;
      this.charge = 0;
      this.y = 0;
      this.vy = 0;
    },

    // Janela FORÇADA pelas cócegas do MurphOliver (botão B). Interrompe
    // qualquer ataque em curso e derruba a Verola sentada na hora, com uma
    // janela de 2.2s — é a recompensa de gastar a cóceja, que custa 30s de
    // descanso do sapinho (ver companion.js). Retorna false se não havia o
    // que expor (ainda não começou, já morta, ou já exposta/intro).
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
      // fagulhas de brasa saltando da coroa
      for (let i = 0; i < 8; i++) {
        spawnParticle(this.coreBox.x + this.coreBox.w / 2, this.coreBox.y + this.coreBox.h / 2,
          rand(-200, 200), rand(-260, -60), 0.6, 3 + Math.random() * 4, '#ffd24a', 800);
      }
      if (this.hp <= 0) {
        // Morte cinematográfica: dead=true JÁ destranca a arena e some a barra.
        this.dead = true;
        this.state = 'dying';
        this.dieTimer = 0;
        this.timer = 0;
        // o berrante voa pelos ares — ela caiu sentada e largou tudo
        hornFly.active = true;
        hornFly.x = this.x + this.dir * V_W * 0.4;
        hornFly.y = this.groundY - V_H * 0.7;
        hornFly.vx = -this.dir * rand(120, 200);
        hornFly.vy = -rand(420, 520);
        hornFly.rot = 0;
        hornFly.vrot = rand(6, 10) * (Math.random() < 0.5 ? -1 : 1);
      } else {
        // Ela se levanta. O `sit` NÃO volta a zero de repente: quem acabou de
        // socar está colado nela, e o corpo a se erguer em cima do jogador
        // seria dano inevitável. Sobe interpolado no idle, e a carência
        // `safe` cobre o resto.
        this.state = 'idle';
        this.timer = this.isPhase2() ? 0.7 : 0.85;
        this.safe = 0.6;
      }
    },

    // Núcleo da máquina de estados. Separado do `update` público porque está
    // cheio de `return` antecipado — e as bolas e cabritinhas já no mundo têm
    // de continuar a andar mesmo nos frames em que o corpo dela não faz nada.
    step(dt) {
      const p = FG.player;
      const ov = FG.engine.rectsOverlap;
      if (this.flash > 0) this.flash -= dt;
      if (this.safe > 0) this.safe -= dt;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);

      // ---------- morte cinematográfica: cai sentada, o berrante voa ----------
      if (this.state === 'dying') {
        this.dieTimer += dt;
        this.sit = Math.min(1, this.sit + dt * 2.2);
        this.y = 0;
        this.shake = 0.5;
        this.refreshPose();
        // confete dourado espirrando enquanto ela esperneia no chão
        if (Math.random() < 0.5) {
          goldBurst(this.x + rand(-V_W, V_W), this.groundY - rand(20, V_H), 2, 0);
        }
        if (Math.random() < 0.7) {
          spawnParticle(this.x + rand(-V_W * 0.6, V_W * 0.6), this.groundY - rand(0, 40),
            rand(-120, 120), rand(-240, -60), 0.6, 3 + Math.random() * 4,
            Math.random() < 0.5 ? '#ff8c3a' : '#ffd24a', 800);
        }
        if (this.dieTimer >= 2.5 && !this.victoryFired) {
          this.victoryFired = true;
          goldBurst(this.x, this.groundY - V_H * 0.5, 40, 5);
          FG.audio.sfx('victory');
          FG.engine.setState('victory');
        }
        return;
      }

      if (!this.started) return;

      // ---------- intro: ela infla o peito e berra pro jogador ----------
      if (this.state === 'intro') {
        this.timer -= dt;
        this.sopro = Math.min(1, this.sopro + dt * 1.8);
        this.charge = 0.4 + Math.sin(FG.engine.time * 8) * 0.2;
        this.shake = 0.25;
        this.refreshPose();
        if (this.timer <= 0) {
          this.active = true;
          this.state = 'idle';
          this.timer = 0.9;
          this.sopro = 0;
          this.charge = 0;
        }
        return;
      }

      const p2 = this.isPhase2();
      const speedMul = p2 ? 0.85 : 1;  // fase 2: intervalos ×0.85
      const projMul = p2 ? 1.15 : 1;   // fase 2: projéteis um pouco mais rápidos
      const a = FG.level.arena;

      this.timer -= dt;

      if (this.state === 'idle') {
        // se endireita e volta ao posto
        this.sit += (0 - this.sit) * Math.min(1, dt * 6);
        this.crouch += (0 - this.crouch) * Math.min(1, dt * 6);
        this.sopro += (0 - this.sopro) * Math.min(1, dt * 5);
        this.armCeu += (0 - this.armCeu) * Math.min(1, dt * 5);
        this.charge = Math.max(0, this.charge - dt * 2);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 4);
        // sempre de olho no jogador — brava, acompanhando
        this.dir = (p.x + p.w / 2) < this.x ? -1 : 1;
        if (this.timer <= 0) {
          // o berrante abre o ciclo: o sopro é a assinatura dela
          const attacks = ['berrante', 'convoca', 'pisao', 'rebanho'];
          this.state = attacks[this.attackIndex % 4];
          this.attackIndex++;
          this.phase = 0;
          this.timer = 0;
        }

      } else if (this.state === 'exposto') {
        // sentada no chão, tonta: a coroa escorrega e a cabeça fica à mostra
        this.sit = Math.min(1, this.sit + dt * 6);
        this.crouch += (0 - this.crouch) * Math.min(1, dt * 6);
        this.sopro += (0 - this.sopro) * Math.min(1, dt * 6);
        this.armCeu += (0 - this.armCeu) * Math.min(1, dt * 6);
        this.refreshPose();
        // estrelinhas rodando em volta da cabeça tonta
        if (Math.random() < 0.3) {
          spawnParticle(this.coreBox.x + this.coreBox.w / 2 + rand(-24, 24),
            this.coreBox.y + rand(-10, 10), rand(-30, 30), rand(-60, -20),
            0.6, 2.5 + Math.random() * 2.5, '#ffe88a', -40);
        }
        // soco na cabeça/coroa
        if (!this.stunHit && p.attackBox && p.attackBox.active && ov(p.attackBox, this.coreBox)) {
          this.takeHit();
        }
        // pisão na cabeça (quica)
        else if (!this.stunHit && p.vy > 0 && ov(p, this.coreBox)) {
          p.vy = -420;
          this.takeHit();
        }
        if (this.timer <= 0 && this.state === 'exposto') {
          this.state = 'idle';
          this.timer = 0.9 * speedMul;
          this.safe = 0.5;   // carência: dá tempo de sair de perto dela
        }
        return;   // exposto nada machuca no contato — sai antes do teste

      // ================= 1. BERRANTE (onda sonora) =================
      } else if (this.state === 'berrante') {
        if (this.phase === 0) {
          // telegraph: ergue o berrante à boca e ENCHE o peito — 0.9s de
          // bochecha inflando e brilho crescendo na boca do chifre
          this.phase = 1;
          this.timer = 0.9;
          this.dir = (p.x + p.w / 2) < this.x ? -1 : 1;
        } else if (this.phase === 1) {
          this.sopro = Math.min(1, this.sopro + dt * 2.2);
          this.charge = Math.min(1, this.charge + dt * 1.2);
          if (this.timer <= 0) {
            // o SOPRO: a onda nasce na boca do chifre e atravessa a arena
            FG.audio.sfx('bossRoar');
            this.shake = 0.7;
            this.spawnSom(this.x + this.dir * V_W * 0.7, this.dir);
            // respingo de ar/poeira saindo do chifre
            for (let i = 0; i < 10; i++) {
              spawnParticle(this.x + this.dir * V_W * 0.7, this.groundY - V_H * 0.62,
                this.dir * rand(180, 420), rand(-80, 80), 0.5, 3 + Math.random() * 3,
                'rgba(255,230,170,0.8)', 0);
            }
            this.charge = 0;
            this.phase = 2;
            this.timer = 0.8;
          }
        } else if (this.phase === 2) {
          this.sopro = Math.max(0, this.sopro - dt * 2.5);
          if (this.timer <= 0) this.expose();
        }

      // ================= 2. CONVOCA (bolas de fogo de ghast) =================
      } else if (this.state === 'convoca') {
        if (this.phase === 0) {
          // telegraph: toque curto do berrante pro CÉU — 0.85s
          this.phase = 1;
          this.timer = 0.85;
          FG.audio.sfx('bossSpit');
        } else if (this.phase === 1) {
          this.armCeu = Math.min(1, this.armCeu + dt * 2.4);
          this.charge = Math.min(0.8, this.charge + dt * 1.4);
          if (this.timer <= 0) {
            FG.audio.sfx('bossRoar');
            this.armCeu = 0;
            this.charge = 0;
            this.shake = 0.5;
            // 3 alvos marcados no chão: um no jogador, dois espalhados —
            // cada sombra pulsa ~0.8s antes da bola cair
            this.spawnBola(p.x + p.w / 2, 0.8);
            this.spawnBola(p.x + p.w / 2 + rand(120, 220) * (Math.random() < 0.5 ? -1 : 1), 1.05);
            this.spawnBola(a.x + 120 + Math.random() * (a.w - 420), 1.3);
            this.phase = 2;
            this.timer = 2.4;
          }
        } else if (this.phase === 2) {
          if (this.timer <= 0) this.expose();
        }

      // ================= 3. PISÃO (cai de bunda, ondas de choque) =================
      } else if (this.state === 'pisao') {
        if (this.phase === 0) {
          // telegraph: agacha, juntando força — 0.85s
          this.phase = 1;
          this.timer = 0.85;
          FG.audio.sfx('bossRoar');
        } else if (this.phase === 1) {
          this.crouch = Math.min(1, this.crouch + dt * 2.2);
          this.shake = 0.2;
          if (this.timer <= 0) {
            // o PULO: gravidade de verdade — sobe, e a queda é de bunda
            this.vy = -860;
            this.crouch = 0;
            this.phase = 2;
          }
        } else if (this.phase === 2) {
          this.vy += GRAV * dt;
          this.y += this.vy * dt;
          if (this.vy > 0) this.sit = Math.min(1, this.sit + dt * 5); // já desce de bunda
          if (this.y >= 0 && this.vy > 0) {
            // ATERRISSOU: tremor de câmera e as duas ondas de choque
            this.y = 0;
            this.vy = 0;
            FG.engine.shakeCamera(10, 0.5);
            this.shake = 1;
            this.spawnChoque(-1);
            this.spawnChoque(1);
            // respingos de lava decorativos saltando do chão
            for (let i = 0; i < 14; i++) {
              spawnParticle(this.x + rand(-V_W, V_W), this.groundY - 4,
                rand(-260, 260), rand(-420, -120), 0.6, 3 + Math.random() * 5,
                Math.random() < 0.5 ? '#ff8c3a' : '#ffd24a', 900);
            }
            this.phase = 3;
            this.timer = 0.45;
          }
        } else if (this.phase === 3) {
          if (this.timer <= 0) this.expose();
        }

      // ================= 4. REBANHO (cabritinhas de fogo) =================
      } else if (this.state === 'rebanho') {
        if (this.phase === 0) {
          // telegraph: toque GRAVE, berrante baixo apontado pro chão — 0.9s
          this.phase = 1;
          this.timer = 0.9;
          this.dir = (p.x + p.w / 2) < this.x ? -1 : 1;
          FG.audio.sfx('bossSpit');
        } else if (this.phase === 1) {
          this.sopro = Math.min(1, this.sopro + dt * 2.2);
          this.charge = Math.min(0.9, this.charge + dt * 1.3);
          if (this.timer <= 0) {
            FG.audio.sfx('bossRoar');
            this.shake = 0.4;
            this.charge = 0;
            // as cabritinhas saem EM FILA: uma a cada 0.3s, 4 ao todo
            this.spawnLeft = 4;
            this.spawnTimer = 0;
            this.phase = 2;
          }
        } else if (this.phase === 2) {
          this.sopro = Math.max(0.4, this.sopro - dt);
          this.spawnTimer -= dt;
          if (this.spawnTimer <= 0 && this.spawnLeft > 0) {
            this.spawnCabra(this.dir, projMul);
            this.spawnLeft--;
            this.spawnTimer = 0.3;
          }
          if (this.spawnLeft <= 0 && this.spawnTimer <= 0) {
            this.phase = 3;
            this.timer = 0.6;
          }
        } else if (this.phase === 3) {
          this.sopro = Math.max(0, this.sopro - dt * 2.5);
          if (this.timer <= 0) this.expose();
        }
      }

      this.refreshPose();

      // ---------- contato com o corpo da Verola ----------
      // O corpo machuca no contato, exceto na carência `safe` — em que ela
      // EMPURRA em vez de machucar (quem acabou de acertar o soco não pode
      // ser punido pelo corpo dela se rematerializando por cima).
      if (this.safe > 0) {
        if (ov(p, this.bodyBox)) {
          const lado = (p.x + p.w / 2) < this.x ? -1 : 1;
          p.vx = lado * 300;
        }
      } else if (ov(p, this.bodyBox)) {
        p.hurt(2, this.x);
      }
    },

    // Sopra a onda sonora a partir da boca do chifre.
    spawnSom(x, dir) {
      for (let i = 0; i < MAXSOM; i++) {
        const s = sons[i];
        if (s.active) continue;
        s.active = true;
        s.x = x;
        s.dir = dir;
        s.groundY = this.groundY;
        s.idade = 0;
        return;
      }
    },

    // Marca um alvo no chão em `x`; a bola de ghast cai `warn` segundos depois.
    spawnBola(x, warn) {
      const a = FG.level.arena;
      const xx = Math.max(a.x + 60, Math.min(a.x + a.w - 60, x));
      for (let i = 0; i < MAXBOLA; i++) {
        const b = bolas[i];
        if (b.active) continue;
        b.active = true;
        b.state = 'sombra';
        b.x = xx;
        b.groundY = groundYAt(xx, 300);
        b.y = b.groundY - 560;  // cai "do alto" — acima de qualquer pulo
        b.vy = 0;
        b.timer = warn;
        b.r = BOLA_R;
        return;
      }
    },

    spawnChoque(dir) {
      for (let i = 0; i < MAXCHOQUE; i++) {
        const o = choques[i];
        if (o.active) continue;
        o.active = true;
        o.dir = dir;
        o.x = this.x + dir * (V_W * 0.6 + 10);
        o.groundY = this.groundY;
        return;
      }
    },

    spawnCabra(dir, projMul) {
      for (let i = 0; i < MAXCABRA; i++) {
        const c = cabras[i];
        if (c.active) continue;
        c.active = true;
        c.dir = dir;
        // nasce atrás do berrante, já correndo
        c.x = this.x + dir * V_W * 0.5;
        c.groundY = groundYAt(this.x, 300);
        c.y = c.groundY - c.h;
        c.phase = Math.random() * Math.PI * 2;
        c.vx = dir * CABRA_SPEED * projMul;
        return;
      }
    },

    // O que o engine chama (via FG.enemies). Corpo primeiro, perigos depois.
    update(dt) {
      this.step(dt);
      // Bolas, ondas e cabritinhas continuam vivas durante a morte: o que já
      // estava no mundo não evapora no frame em que ela cai sentada.
      if (this.started || this.dead) updateBossStuff(dt);
    },

    draw(ctx, cam) {
      drawVerola(ctx, cam);
      drawBossStuff(ctx, cam);
    },
  };

  // ==================================================================
  // Ondas sonoras, bolas de ghast, ondas de choque e cabritinhas
  // ==================================================================
  // Caixa de rascunho reaproveitada nos testes de colisão (nada de alocar
  // objeto por frame).
  const scratch = { x: 0, y: 0, w: 0, h: 0 };

  function updateBossStuff(dt) {
    const p = FG.player;
    const ov = FG.engine.rectsOverlap;
    const a = FG.level.arena;
    const projMul = boss.isPhase2() ? 1.15 : 1;
    // "Nada machuca durante a janela" vale para a chefa INTEIRA: a onda
    // sonora no ar, a bola ainda caindo e a cabritinha correndo apagam o
    // dano enquanto ela está sentada. Continuam a ser desenhadas: só não ferem.
    const janela = boss.state === 'exposto';

    // ---- onda sonora do berrante (2 de dano + EMPURRÃO forte) ----
    for (let i = 0; i < MAXSOM; i++) {
      const s = sons[i];
      if (!s.active) continue;
      s.idade += dt;
      s.x += s.dir * SOM_SPEED * projMul * dt;
      // faísca de poeira na beira da onda: o som passando levanta o chão
      if (Math.random() < 0.5) {
        spawnParticle(s.x + rand(-SOM_W / 2, SOM_W / 2), s.groundY - rand(0, SOM_H),
          s.dir * rand(60, 160), rand(-60, 20), 0.35, 2 + Math.random() * 2.5,
          'rgba(255,220,150,0.6)', 0);
      }
      scratch.x = s.x - SOM_W / 2; scratch.y = s.groundY - SOM_H;
      scratch.w = SOM_W; scratch.h = SOM_H;
      if (!janela && ov(p, scratch)) {
        // dano + empurrão MAIS forte que o knockback padrão do hurt: a onda
        // carrega o jogador junto (hurt já respeita invuln — sem dano duplo)
        p.hurt(2, s.x - s.dir * 10);
        p.vx = s.dir * 640;
        p.vy = Math.min(p.vy, -240);
      }
      if (s.x < a.x - 120 || s.x > a.x + a.w + 120) s.active = false;
    }

    // ---- bolas de fogo de ghast (sombra avisa, bola cai, respingo no impacto) ----
    for (let i = 0; i < MAXBOLA; i++) {
      const b = bolas[i];
      if (!b.active) continue;
      if (b.state === 'sombra') {
        b.timer -= dt;
        if (b.timer <= 0) { b.state = 'cai'; b.vy = 160 * projMul; }
      } else {
        b.vy += GRAV * 1.05 * projMul * dt;
        b.y += b.vy * dt;
        // rastro de fogo da bola caindo
        if (Math.random() < 0.7) {
          spawnParticle(b.x + rand(-8, 8), b.y - b.r, rand(-30, 30), rand(-80, -20),
            0.4, 3 + Math.random() * 3, Math.random() < 0.5 ? '#ff8c3a' : '#ffd24a', -60);
        }
        scratch.x = b.x - b.r; scratch.y = b.y - b.r; scratch.w = b.r * 2; scratch.h = b.r * 2;
        if (!janela && ov(p, scratch)) {
          b.active = false;
          p.hurt(2, b.x);
          burstLava(b.x, b.y);
          continue;
        }
        if (b.y + b.r >= b.groundY) {
          // IMPACTO: respingo de lava e dano 2 no raio — o alvo avisou onde
          b.active = false;
          burstLava(b.x, b.groundY);
          scratch.x = b.x - BOLA_IMPACTO_R; scratch.y = b.groundY - BOLA_IMPACTO_R;
          scratch.w = BOLA_IMPACTO_R * 2; scratch.h = BOLA_IMPACTO_R;
          if (!janela && ov(p, scratch)) p.hurt(2, b.x);
        }
      }
    }

    // ---- ondas de choque de lava do pisão (1 de dano, rasteiras) ----
    for (let i = 0; i < MAXCHOQUE; i++) {
      const o = choques[i];
      if (!o.active) continue;
      o.x += o.dir * CHOQUE_SPEED * projMul * dt;
      if (Math.random() < 0.6) {
        spawnParticle(o.x + rand(-20, 20), o.groundY - rand(0, o.h), rand(-40, 40), rand(-160, -40),
          0.4, 3 + Math.random() * 2.5, Math.random() < 0.5 ? '#ff8c3a' : '#ffb24a', 600);
      }
      scratch.x = o.x - o.w / 2; scratch.y = o.groundY - o.h; scratch.w = o.w; scratch.h = o.h;
      if (!janela && ov(p, scratch)) p.hurt(1, o.x);
      if (o.x < a.x - 80 || o.x > a.x + a.w + 80) o.active = false;
    }

    // ---- cabritinhas de fogo (1 de dano cada; somem na borda) ----
    for (let i = 0; i < MAXCABRA; i++) {
      const c = cabras[i];
      if (!c.active) continue;
      c.x += c.vx * dt;
      c.phase += dt * 14;
      // galopam: as patinhas de lava pingam brasa
      if (Math.random() < 0.5) {
        spawnParticle(c.x + rand(-c.w / 2, c.w / 2), c.groundY - 4, rand(-40, 40), rand(-120, -30),
          0.4, 2.5 + Math.random() * 2.5, '#ff9a3a', 700);
      }
      scratch.x = c.x - c.w / 2; scratch.y = c.groundY - c.h; scratch.w = c.w; scratch.h = c.h;
      if (!janela && ov(p, scratch)) p.hurt(1, c.x);
      if (c.x < a.x - 100 || c.x > a.x + a.w + 100) c.active = false;
    }

    // ---- o berrante voando na morte (só visual) ----
    if (hornFly.active) {
      hornFly.vy += GRAV * 0.7 * dt;
      hornFly.x += hornFly.vx * dt;
      hornFly.y += hornFly.vy * dt;
      hornFly.rot += hornFly.vrot * dt;
      if (hornFly.y > FG.level.H + 100) hornFly.active = false;
    }
  }

  // Respingo de lava: gotas quentes pra todo lado, como as bolas do Nether
  function burstLava(x, y) {
    for (let i = 0; i < 12; i++) {
      spawnParticle(x, y - 6, rand(-240, 240), rand(-320, -80), 0.55, 3 + Math.random() * 4,
        Math.random() < 0.5 ? '#ff8c3a' : '#ffd24a', 900);
    }
  }

  // ==================================================================
  // DESENHO — tudo canvas puro, mesmo estilo pintado dos outros chefões.
  // A Verola é desenhada encarando +x e espelhada por `dir`.
  // ==================================================================

  function drawVerola(ctx, cam) {
    const VIEW_W = FG.enemies.fx.VIEW_W;
    const a = FG.level.arena;
    if (cam.x + VIEW_W < a.x - 200 || cam.x > a.x + a.w + 200) return;
    // dormindo na arena antes do gatilho: resolve a geometria só para o desenho
    if (!boss.started && !boss.dead) {
      boss.resolveGeometry();
      boss.refreshPose();
    }

    const b = boss;
    const t = FG.engine.time;
    const dying = b.state === 'dying';
    const exposto = b.state === 'exposto';
    const sit = b.sit;
    const sh = b.shake > 0 ? Math.sin(t * 50) * 4 * b.shake : 0;

    const sx = b.x - cam.x + sh;
    const gy = b.groundY + b.y - cam.y;   // o pé dela (b.y = offset do pulo)

    ctx.save();
    ctx.translate(sx, gy);
    ctx.scale(b.dir, 1);

    // sombra no chão de pedra (fica no groundY mesmo quando ela pula)
    ctx.save();
    ctx.translate(0, -b.y);
    ctx.fillStyle = 'rgba(30,5,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 4, V_W * 0.55, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // tudo encolhe/afunda com o sit: sentada o corpo baixa e se espalha
    const squash = lerp(1, 0.66, sit);     // altura
    const spread = lerp(1, 1.18, sit);     // largura (se esparrama sentada)
    const crov = b.crouch * 0.3;           // agachada: um pouco mais baixa
    const H = V_H * (squash - crov);

    // ---------- CAPA AZUL com barra roxa (atrás do corpo) ----------
    // ondula por senoide no tempo; sentada ela se amontoa no chão
    const capaTopo = -H * 0.86;
    ctx.beginPath();
    ctx.moveTo(-V_W * 0.26, capaTopo);
    ctx.lineTo(V_W * 0.2, capaTopo);
    const capaBaixo = -2 - sit * 2;
    const ondu1 = Math.sin(t * 2.4) * 9 * (1 - sit);
    const ondu2 = Math.sin(t * 2.4 + 1.8) * 11 * (1 - sit);
    ctx.quadraticCurveTo(V_W * 0.4 + ondu1, -H * 0.4, V_W * 0.34 + ondu2, capaBaixo);
    ctx.lineTo(-V_W * 0.62 - ondu2, capaBaixo);
    ctx.quadraticCurveTo(-V_W * 0.6 - ondu1, -H * 0.45, -V_W * 0.26, capaTopo);
    ctx.closePath();
    const gCapa = ctx.createLinearGradient(0, capaTopo, 0, 0);
    gCapa.addColorStop(0, '#2f5fd4');
    gCapa.addColorStop(0.8, '#2448a8');
    gCapa.addColorStop(1, '#1c3a8c');
    ctx.fillStyle = gCapa;
    ctx.fill();
    // barra roxa na bainha, acompanhando a mesma ondulação
    ctx.beginPath();
    ctx.moveTo(-V_W * 0.62 - ondu2, capaBaixo);
    ctx.lineTo(V_W * 0.34 + ondu2, capaBaixo);
    ctx.lineTo(V_W * 0.33 + ondu2 * 0.8, capaBaixo - 13);
    ctx.lineTo(-V_W * 0.6 - ondu2 * 0.8, capaBaixo - 13);
    ctx.closePath();
    ctx.fillStyle = '#7a3fb8';
    ctx.fill();

    // ---------- BOTAS AZUIS (aparecem sob a saia; sentada, esticadas) ----------
    ctx.fillStyle = '#2a52c0';
    if (sit > 0.4) {
      // pernas esticadas pra frente, batendo o pé, frustrada/tonta
      const chute = Math.sin(t * 9) * 5 * (exposto || dying ? 1 : 0);
      ctx.save();
      ctx.translate(V_W * 0.3, -12);
      ctx.rotate(-0.12);
      ctx.fillRect(0, -8 - chute, 34, 15);
      ctx.beginPath(); ctx.ellipse(34, -1 - chute, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(V_W * 0.14, -8);
      ctx.fillRect(0, -8 + chute, 30, 14);
      ctx.beginPath(); ctx.ellipse(30, -1 + chute, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillRect(-V_W * 0.2, -20, 17, 20);
      ctx.fillRect(V_W * 0.04, -20, 17, 20);
      ctx.beginPath(); ctx.ellipse(-V_W * 0.2 + 12, -3, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(V_W * 0.04 + 12, -3, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
    }

    // ---------- CORPO EM PERA: saia/vestido claro, largo embaixo ----------
    ctx.beginPath();
    ctx.moveTo(-V_W * 0.52 * spread, -14);
    ctx.quadraticCurveTo(-V_W * 0.56 * spread, -H * 0.42, -V_W * 0.24, -H * 0.72);
    ctx.quadraticCurveTo(0, -H * 0.82, V_W * 0.24, -H * 0.72);
    ctx.quadraticCurveTo(V_W * 0.56 * spread, -H * 0.42, V_W * 0.52 * spread, -14);
    ctx.quadraticCurveTo(0, -2, -V_W * 0.52 * spread, -14);
    ctx.closePath();
    const gVest = ctx.createLinearGradient(0, -H * 0.82, 0, 0);
    gVest.addColorStop(0, '#f4e6d2');
    gVest.addColorStop(0.6, '#e8d2b4');
    gVest.addColorStop(1, '#cfb28c');
    ctx.fillStyle = gVest;
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,30,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // corpete: faixa mais escura apertando a cintura (o que faz a pera)
    ctx.fillStyle = '#b8855a';
    ctx.beginPath();
    ctx.moveTo(-V_W * 0.3, -H * 0.56);
    ctx.quadraticCurveTo(0, -H * 0.5, V_W * 0.3, -H * 0.56);
    ctx.lineTo(V_W * 0.26, -H * 0.7);
    ctx.quadraticCurveTo(0, -H * 0.78, -V_W * 0.26, -H * 0.7);
    ctx.closePath();
    ctx.fill();
    // cordinha do corpete
    ctx.strokeStyle = '#6a4424'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-8, -H * 0.72); ctx.lineTo(8, -H * 0.66);
    ctx.moveTo(8, -H * 0.72); ctx.lineTo(-8, -H * 0.66);
    ctx.stroke();

    // broche da capa no peito
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(0, -H * 0.76, 5, 0, Math.PI * 2); ctx.fill();

    // ---------- BRAÇOS e o BERRANTE ----------
    // O braço do berrante interpola entre: descansando (baixo), erguido à
    // boca (sopro) e apontado pro céu (armCeu).
    const skin = '#f0b990';
    ctx.strokeStyle = skin; ctx.lineWidth = 11; ctx.lineCap = 'round';
    const ombroX = V_W * 0.2, ombroY = -H * 0.72;
    // mão: três alvos possíveis da interpolação
    const maoBaixoX = V_W * 0.42, maoBaixoY = -H * 0.42;
    const maoBocaX = V_W * 0.3, maoBocaY = -H * 0.95;
    const maoCeuX = V_W * 0.3, maoCeuY = -H * 1.18;
    let maoX = lerp(maoBaixoX, maoBocaX, b.sopro);
    let maoY = lerp(maoBaixoY, maoBocaY, b.sopro);
    maoX = lerp(maoX, maoCeuX, b.armCeu);
    maoY = lerp(maoY, maoCeuY, b.armCeu);
    if (!dying) {   // morrendo o berrante já voou da mão (hornFly)
      ctx.beginPath();
      ctx.moveTo(ombroX, ombroY);
      ctx.lineTo(maoX, maoY);
      ctx.stroke();
    }
    // o outro braço: fechado no quadril (brava) ou esticado no chão (sentada)
    ctx.beginPath();
    ctx.moveTo(-V_W * 0.2, ombroY);
    if (sit > 0.4) ctx.lineTo(-V_W * 0.52, -10);
    else ctx.lineTo(-V_W * 0.42, -H * 0.5);
    ctx.stroke();

    // o BERRANTE na mão (fora da morte): chifre de cabra curvo e listrado,
    // erguido à boca no sopro, pro céu no convoca
    if (!dying) {
      const angH = lerp(0.5, -0.15, b.sopro) + lerp(0, -1.1, b.armCeu);
      drawBerrante(ctx, maoX, maoY, angH, b.charge, t);
    }

    // ---------- CABEÇA ----------
    // sentada, a cabeça pende pra frente (é o ponto fraco descendo)
    const headX = lerp(HEAD_UP.x, HEAD_DN.x, sit);
    // headY relativo ao pé: HEAD_* é relativo a groundY, e aqui a origem já
    // está em groundY+b.y — como b.y entra no translate, basta o offset local
    const headY = lerp(HEAD_UP.y, HEAD_DN.y, sit);
    const rH = 30;   // raio da cabeça (bochechuda)
    const balanco = (exposto || dying) ? Math.sin(t * 5) * 0.14 : 0;

    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(balanco);

    // cabelo castanho na altura do ombro (atrás do rosto)
    ctx.fillStyle = '#6a4226';
    ctx.beginPath();
    ctx.ellipse(-3, 4, rH * 1.2, rH * 1.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // rosto redondo, bochechudo; soprando, as bochechas INFLAM
    const inflar = 1 + b.sopro * 0.22;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(2, 0, rH * inflar, rH * 0.94 * inflar, 0, 0, Math.PI * 2);
    ctx.fill();

    // franja por cima da testa
    ctx.fillStyle = '#6a4226';
    ctx.beginPath();
    ctx.ellipse(0, -rH * 0.62, rH * 0.95, rH * 0.5, 0, Math.PI, 0);
    ctx.fill();

    // bochechas rosadas — maiores e mais vermelhas inflando
    ctx.fillStyle = 'rgba(235,110,100,' + (0.45 + b.sopro * 0.3).toFixed(2) + ')';
    ctx.beginPath(); ctx.ellipse(-rH * 0.45, rH * 0.26, 8 + b.sopro * 6, 6 + b.sopro * 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(rH * 0.62, rH * 0.26, 8 + b.sopro * 6, 6 + b.sopro * 5, 0, 0, Math.PI * 2); ctx.fill();

    if (exposto || dying) {
      // cara TONTA: olhos espiralados e boca molenga
      ctx.strokeStyle = '#3a2214'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      for (let e = 0; e < 2; e++) {
        const ex = e === 0 ? -rH * 0.26 : rH * 0.4;
        ctx.save();
        ctx.translate(ex, -rH * 0.1);
        ctx.rotate(t * (e === 0 ? 6 : -6));   // a espiral RODA — tonta de verdade
        ctx.beginPath();
        for (let s2 = 0; s2 <= 14; s2++) {
          const f = s2 / 14;
          const ang = f * Math.PI * 3.4;
          const rr = 1.2 + f * 5.6;
          const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
          if (s2 === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = '#7a3028'; ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-rH * 0.1, rH * 0.5);
      ctx.quadraticCurveTo(rH * 0.14, rH * 0.62 + Math.sin(t * 8) * 2, rH * 0.38, rH * 0.5);
      ctx.stroke();
    } else {
      // cara BRAVA: sobrancelhas em V, olhos apertados
      ctx.strokeStyle = '#4a2a14'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-rH * 0.48, -rH * 0.34); ctx.lineTo(-rH * 0.08, -rH * 0.16);
      ctx.moveTo(rH * 0.62, -rH * 0.34); ctx.lineTo(rH * 0.2, -rH * 0.16);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(-rH * 0.26, -rH * 0.02, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(rH * 0.4, -rH * 0.02, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a1a0e';
      ctx.beginPath(); ctx.arc(-rH * 0.22, -rH * 0.02, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rH * 0.44, -rH * 0.02, 2.6, 0, Math.PI * 2); ctx.fill();
      if (b.sopro > 0.3) {
        // boca em bico, colada no berrante
        ctx.fillStyle = '#b05a48';
        ctx.beginPath(); ctx.ellipse(rH * 0.9, rH * 0.2, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        // boca franzida de brava
        ctx.strokeStyle = '#7a3028'; ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-rH * 0.06, rH * 0.52);
        ctx.quadraticCurveTo(rH * 0.16, rH * 0.4, rH * 0.4, rH * 0.52);
        ctx.stroke();
      }
    }

    // ---------- COROA dourada de pontas com bolinhas ----------
    // na janela/morte ela ESCORREGA: desce e gira de lado — o sinal visível
    // de que o ponto fraco está servido
    ctx.save();
    const slip = (exposto || dying) ? 1 : 0;
    ctx.translate(lerp(0, rH * 0.55, slip * sit), lerp(-rH * 0.94, -rH * 0.52, slip * sit));
    ctx.rotate(lerp(0, 0.55, slip * sit));
    const CW = rH * 0.92, CH = 15;
    const gCor = ctx.createLinearGradient(0, -CH - 8, 0, 0);
    gCor.addColorStop(0, '#ffe88a');
    gCor.addColorStop(1, '#d9a620');
    ctx.fillStyle = gCor;
    ctx.beginPath();
    ctx.moveTo(-CW, 0);
    // quatro pontas com vales — a silhueta clássica de coroa
    for (let i = 0; i < 4; i++) {
      const x0 = -CW + (i / 4) * (CW * 2);
      const x1 = -CW + ((i + 0.5) / 4) * (CW * 2);
      const x2 = -CW + ((i + 1) / 4) * (CW * 2);
      ctx.lineTo(x0, 0);
      ctx.lineTo(x1, -CH - 7);
      ctx.lineTo(x2, 0);
    }
    ctx.lineTo(CW, 8); ctx.lineTo(-CW, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8a6210'; ctx.lineWidth = 1.4; ctx.stroke();
    // as bolinhas nas pontas
    ctx.fillStyle = '#ffe88a';
    for (let i = 0; i < 4; i++) {
      const x1 = -CW + ((i + 0.5) / 4) * (CW * 2);
      ctx.beginPath(); ctx.arc(x1, -CH - 8, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    // joia vermelha no meio da faixa
    ctx.fillStyle = '#d83a3a';
    ctx.beginPath(); ctx.arc(0, 3, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // anel pulsante no ponto fraco durante a janela — sem ele a cabeça some
    // contra o fundo escuro do Nether
    if (exposto && !b.stunHit) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.35 * Math.sin(t * 10);
      ctx.strokeStyle = '#ffe88a';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ffd24a';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(2, 0, rH * 1.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // cabeça

    // flash branco ao levar dano
    if (b.flash > 0) {
      ctx.save();
      ctx.globalAlpha = b.flash / 0.25 * 0.6;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(0, -H * 0.5, V_W * 0.7, H * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // O BERRANTE: chifre de cabra curvo com listras em arcos (marrom/creme).
  // `charge` acende um brilho crescente na boca larga do chifre — é o
  // telegraph legível de que vem sopro.
  function drawBerrante(ctx, x, y, ang, charge, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);

    // corpo do chifre: curva que engrossa da ponta (bocal) à boca larga.
    // Duas quadráticas formando a "banana" do chifre de cabra.
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.quadraticCurveTo(26, -16, 52, -8);   // dorso
    ctx.quadraticCurveTo(58, -2, 54, 8);     // boca larga
    ctx.quadraticCurveTo(28, 2, 2, 5);       // barriga
    ctx.closePath();
    const gB = ctx.createLinearGradient(0, -14, 56, 10);
    gB.addColorStop(0, '#8a5a30');
    gB.addColorStop(1, '#5e3a1c');
    ctx.fillStyle = gB;
    ctx.fill();
    ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 1.6; ctx.stroke();

    // as LISTRAS em arcos, alternando creme — a marca do chifre de cabra
    ctx.strokeStyle = '#e8d2a8';
    ctx.lineCap = 'round';
    for (let i = 1; i <= 4; i++) {
      const f = i / 5;
      ctx.lineWidth = 2 + f * 2.4;
      ctx.beginPath();
      // cada listra é um arquinho transversal, acompanhando a curvatura
      const lx = f * 50;
      ctx.moveTo(lx, -12 * (0.4 + f * 0.7));
      ctx.quadraticCurveTo(lx + 4, -2, lx - 1, 7 * (0.3 + f * 0.8));
      ctx.stroke();
    }

    // aro dourado na boca do chifre
    ctx.strokeStyle = '#d9a620'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(55, 0, 4, 9, 0.18, 0, Math.PI * 2);
    ctx.stroke();

    // brilho crescente na boca enquanto carrega o sopro
    if (charge > 0.05) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, charge) * (0.7 + 0.3 * Math.sin(t * 14));
      ctx.fillStyle = '#ffe88a';
      ctx.shadowColor = '#ffd24a';
      ctx.shadowBlur = 16 * charge;
      ctx.beginPath();
      ctx.ellipse(56, 0, 4 + charge * 8, 8 + charge * 10, 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawBossStuff(ctx, cam) {
    const t = FG.engine.time;
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // ---- ONDA SONORA: anéis concêntricos expandindo na horizontal ----
    for (let i = 0; i < MAXSOM; i++) {
      const s = sons[i];
      if (!s.active) continue;
      const cy = s.groundY - SOM_H * 0.5;
      ctx.save();
      // a faixa translúcida que de fato machuca — o "corpo" da onda
      const g = ctx.createLinearGradient(s.x - SOM_W, 0, s.x + SOM_W, 0);
      g.addColorStop(0, 'rgba(255,220,140,0)');
      g.addColorStop(0.5, 'rgba(255,220,140,0.28)');
      g.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - SOM_W, s.groundY - SOM_H, SOM_W * 2, SOM_H);
      // os anéis: arcos abertos na direção do movimento, pulsando
      ctx.strokeStyle = '#ffdf8a';
      ctx.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        const f = ((s.idade * 2.2 + k / 4) % 1);
        const rr = 14 + f * SOM_H * 0.62;
        ctx.globalAlpha = (1 - f) * 0.75;
        ctx.lineWidth = 3.5 - f * 1.6;
        ctx.beginPath();
        // arco de ~100° apontando pra onde a onda vai
        const base = s.dir > 0 ? 0 : Math.PI;
        ctx.arc(s.x - s.dir * 16, cy, rr, base - 0.9, base + 0.9);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---- BOLAS DE GHAST: alvo pulsante no chão, depois a bola de fogo ----
    for (let i = 0; i < MAXBOLA; i++) {
      const b = bolas[i];
      if (!b.active) continue;
      if (b.state === 'sombra') {
        // alvo: elipse + anel pulsando mais rápido perto do impacto
        const urg = 1 - Math.min(1, b.timer / 0.8);
        const pulso = 0.5 + 0.5 * Math.abs(Math.sin(t * (6 + urg * 8)));
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.4 * pulso;
        ctx.fillStyle = '#ff5a2a';
        ctx.beginPath();
        ctx.ellipse(b.x, b.groundY - 3, 26 * (0.6 + urg * 0.5), 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffb24a';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.ellipse(b.x, b.groundY - 3, 36 * pulso, 10 * pulso, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        // a bola de fogo caindo: núcleo branco, casca laranja, rabo de chama
        ctx.save();
        ctx.translate(b.x, b.y);
        const gF = ctx.createRadialGradient(0, 0, 2, 0, 0, b.r * 1.3);
        gF.addColorStop(0, '#fff6d8');
        gF.addColorStop(0.4, '#ffd24a');
        gF.addColorStop(0.75, '#ff7a2a');
        gF.addColorStop(1, 'rgba(200,40,10,0.15)');
        ctx.fillStyle = gF;
        ctx.beginPath(); ctx.arc(0, 0, b.r * 1.3, 0, Math.PI * 2); ctx.fill();
        // rabo pra cima (ela cai): três lambidas de chama
        ctx.fillStyle = 'rgba(255,150,60,0.6)';
        for (let k = 0; k < 3; k++) {
          const lx = (k - 1) * b.r * 0.5;
          ctx.beginPath();
          ctx.moveTo(lx - 4, -b.r * 0.6);
          ctx.quadraticCurveTo(lx + Math.sin(t * 12 + k) * 5, -b.r * 2.2, lx + 4, -b.r * 0.6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // ---- ONDAS DE CHOQUE: retângulos baixos incandescentes ----
    for (let i = 0; i < MAXCHOQUE; i++) {
      const o = choques[i];
      if (!o.active) continue;
      ctx.save();
      const gC = ctx.createLinearGradient(0, o.groundY - o.h, 0, o.groundY);
      gC.addColorStop(0, 'rgba(255,220,120,0)');
      gC.addColorStop(0.5, 'rgba(255,140,50,0.65)');
      gC.addColorStop(1, 'rgba(255,230,150,0.9)');
      ctx.fillStyle = gC;
      // crista dianteira mais alta — dá direção à onda
      ctx.beginPath();
      ctx.moveTo(o.x - o.dir * o.w / 2, o.groundY);
      ctx.quadraticCurveTo(o.x, o.groundY - o.h * 1.25,
        o.x + o.dir * o.w * 0.55, o.groundY - o.h * 0.5);
      ctx.quadraticCurveTo(o.x + o.dir * o.w * 0.4, o.groundY - 3, o.x + o.dir * o.w / 2, o.groundY);
      ctx.closePath();
      ctx.fill();
      // miolo incandescente
      ctx.fillStyle = 'rgba(255,245,200,0.8)';
      ctx.beginPath();
      ctx.ellipse(o.x, o.groundY - 6, o.w * 0.3, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- CABRITINHAS DE FOGO: bichinhos de lava chifrudos ----
    for (let i = 0; i < MAXCABRA; i++) {
      const c = cabras[i];
      if (!c.active) continue;
      const bob = Math.abs(Math.sin(c.phase)) * 6;  // galope
      ctx.save();
      ctx.translate(c.x, c.groundY - c.h / 2 - bob);
      ctx.scale(c.dir, 1);

      // corpo: gota de lava com gradiente quente
      const gG = ctx.createRadialGradient(2, -3, 2, 0, 0, c.w * 0.62);
      gG.addColorStop(0, '#ffe08a');
      gG.addColorStop(0.5, '#ff9a3a');
      gG.addColorStop(1, '#c84a14');
      ctx.fillStyle = gG;
      ctx.beginPath();
      ctx.ellipse(0, 0, c.w * 0.52, c.h * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();
      // rachaduras escuras de crosta (é lava, não pelúcia)
      ctx.strokeStyle = 'rgba(90,20,0,0.55)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-c.w * 0.3, -2); ctx.lineTo(-c.w * 0.1, 3);
      ctx.moveTo(c.w * 0.05, -c.h * 0.26); ctx.lineTo(c.w * 0.2, -c.h * 0.08);
      ctx.stroke();

      // patinhas galopando (alternadas pelo mesmo phase)
      ctx.strokeStyle = '#c84a14'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      const pA = Math.sin(c.phase) * 6, pB = -pA;
      ctx.beginPath();
      ctx.moveTo(-c.w * 0.28, c.h * 0.3); ctx.lineTo(-c.w * 0.28 + pA, c.h * 0.52 + bob);
      ctx.moveTo(c.w * 0.2, c.h * 0.3); ctx.lineTo(c.w * 0.2 + pB, c.h * 0.52 + bob);
      ctx.stroke();

      // cabecinha com os CHIFRINHOS curvos
      ctx.fillStyle = '#ff9a3a';
      ctx.beginPath(); ctx.arc(c.w * 0.44, -c.h * 0.3, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e8d2a8'; ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(c.w * 0.42, -c.h * 0.5);
      ctx.quadraticCurveTo(c.w * 0.3, -c.h * 0.78, c.w * 0.18, -c.h * 0.66);
      ctx.moveTo(c.w * 0.52, -c.h * 0.5);
      ctx.quadraticCurveTo(c.w * 0.44, -c.h * 0.82, c.w * 0.32, -c.h * 0.76);
      ctx.stroke();
      // olhinho bravo (cabra de fogo também tem opinião)
      ctx.fillStyle = '#3a1000';
      ctx.beginPath(); ctx.arc(c.w * 0.5, -c.h * 0.32, 1.8, 0, Math.PI * 2); ctx.fill();

      ctx.restore();
    }

    // ---- o berrante voando na morte ----
    if (hornFly.active) {
      drawBerrante(ctx, hornFly.x, hornFly.y, hornFly.rot, 0, t);
    }

    ctx.restore();
  }

  FG.enemies.registerBoss('verola', boss);
})();
