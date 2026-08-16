// Fagulho: Lendas do Bosque — enemies.js
// FG.enemies: os três bichos do bosque (espinhoco, voadeira, sapeca) e o
// chefão Dragão de Três Cabeças. Os bichos comuns são canvas puro; o dragão é
// o sprite de assets.js, animado por transformação e com fogo procedural nas
// bocas. Nenhuma referência a outros módulos no load — só dentro de funções
// chamadas em runtime.
window.FG = window.FG || {};

(function () {
  'use strict';

  const GRAV = 2200;         // mesma gravidade do player
  const VIEW_W = 960;        // canvas interno (para culling)
  const CULL = 140;          // margem de culling em px

  // ------------------------------------------------------------------
  // Pool de partículas (pufe de fumaça, brasas, ouro da morte do boss).
  // Reuso total: nada de alocar objeto por frame.
  // ------------------------------------------------------------------
  const MAXP = 160;
  const particles = [];
  for (let i = 0; i < MAXP; i++) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 4, color: '#fff', grav: 0 });
  }
  let pNext = 0;

  function spawnParticle(x, y, vx, vy, life, size, color, grav) {
    const p = particles[pNext];
    pNext = (pNext + 1) % MAXP;
    p.active = true;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life;
    p.size = size; p.color = color; p.grav = grav || 0;
  }

  // Pufe de fumaça (morte de inimigo comum)
  function puff(cx, cy) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      spawnParticle(cx, cy, Math.cos(a) * 70 + rand(-20, 20), Math.sin(a) * 70 - 40,
        0.45 + Math.random() * 0.2, 7 + Math.random() * 5, 'rgba(240,235,225,0.9)', -120);
    }
  }

  // Brilho dourado + lumis de bônus
  function goldBurst(cx, cy, n, lumiCount) {
    for (let i = 0; i < n; i++) {
      spawnParticle(cx, cy, rand(-140, 140), rand(-220, -40),
        0.5 + Math.random() * 0.5, 3 + Math.random() * 4, '#ffd870', 500);
    }
    for (let i = 0; i < lumiCount; i++) FG.engine.addLumi();
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function updateParticles(dt) {
    for (let i = 0; i < MAXP; i++) {
      const p = particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function drawParticles(ctx, cam) {
    ctx.save();
    for (let i = 0; i < MAXP; i++) {
      const p = particles[i];
      if (!p.active) continue;
      const sx = p.x - cam.x, sy = p.y - cam.y;
      if (sx < -40 || sx > VIEW_W + 40) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size * (0.4 + 0.6 * (p.life / p.maxLife)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------
  // Chão sob um x (para o boss e projéteis). Considera só pisos abaixo
  // de yMin, para não pegar plataformas flutuantes altas.
  // ------------------------------------------------------------------
  function groundYAt(x, yMin) {
    const solids = FG.level.solids;
    let best = FG.level.H;
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (x >= s.x && x <= s.x + s.w && s.y >= yMin && s.y < best) best = s.y;
    }
    return best;
  }

  // ==================================================================
  // Inimigos comuns
  // ==================================================================
  function makeEnemy(def) {
    const e = {
      type: def.type,
      spawnX: def.x, spawnY: def.y,
      range: def.range || 120,
      x: def.x, y: def.y, vx: 0, vy: 0,
      onGround: false,
      dir: 1,          // sentido de patrulha / pulo
      timer: 0,        // temporizador de estado (sapeca)
      phase: Math.random() * Math.PI * 2, // dessincroniza animações
      dead: false,
    };
    if (e.type === 'espinhoco') { e.w = 48; e.h = 26; }
    else if (e.type === 'voadeira') { e.w = 34; e.h = 26; }
    else { e.w = 38; e.h = 32; } // sapeca
    return e;
  }

  function killEnemy(e) {
    e.dead = true;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    puff(cx, cy);
    goldBurst(cx, cy, 8, 2); // 2 lumis de bônus
    FG.audio.sfx('hitEnemy');
  }

  // Player caindo com os pés acima do topo do inimigo → é pisão
  function isStomp(p, e) {
    return p.vy > 0 && (p.y + p.h) < e.y + e.h * 0.55;
  }

  function updateEnemy(e, dt) {
    const p = FG.player;
    const ov = FG.engine.rectsOverlap;

    // ---------- IA por tipo ----------
    if (e.type === 'espinhoco') {
      // Lagarta espinhosa: rasteja em volta do spawn, vira nas bordas.
      const SPD = 46;
      e.vx = e.dir * SPD;
      e.vy += GRAV * dt;
      const wantVx = e.vx;
      FG.engine.moveAndCollide(e, dt);
      // Bateu na parede ou passou do range → dá meia-volta
      if ((wantVx !== 0 && e.vx === 0) ||
          (e.dir > 0 && e.x > e.spawnX + e.range) ||
          (e.dir < 0 && e.x < e.spawnX - e.range)) {
        e.dir = -e.dir;
      }
    } else if (e.type === 'voadeira') {
      // Mariposa: senoide vertical em torno do y do spawn, vai e volta no range.
      const t = FG.engine.time + e.phase;
      const SPD = 70;
      e.x += e.dir * SPD * dt;
      if (e.dir > 0 && e.x > e.spawnX + e.range) e.dir = -1;
      if (e.dir < 0 && e.x < e.spawnX - e.range) e.dir = 1;
      e.y = e.spawnY + Math.sin(t * 2.4) * 34;
      e.vy = Math.cos(t * 2.4) * 2.4 * 34; // só para leitura visual
    } else if (e.type === 'sapeca') {
      // Sapo: pula em arcos na direção do player quando perto (<400px).
      e.vy += GRAV * dt;
      const dx = (p.x + p.w / 2) - (e.x + e.w / 2);
      if (e.onGround) {
        e.vx *= 0.7; // freia deslize ao pousar
        e.timer -= dt;
        if (Math.abs(dx) < 400 && e.timer <= 0) {
          // agachadinha (telegraph) e pulo
          e.dir = dx >= 0 ? 1 : -1;
          e.vx = e.dir * rand(150, 210);
          e.vy = -rand(460, 560);
          e.timer = rand(0.7, 1.2); // pausa entre pulos
        }
      }
      FG.engine.moveAndCollide(e, dt);
    }

    // ---------- combate ----------
    // 1) Soco: se a hitbox do golpe sobrepõe, morre (qualquer tipo).
    if (p.attackBox && p.attackBox.active && ov(p.attackBox, e)) {
      killEnemy(e);
      return;
    }
    // 2) Contato com o player
    if (ov(p, e)) {
      if (e.type !== 'espinhoco' && isStomp(p, e)) {
        // Pisão: inimigo morre e o player quica.
        killEnemy(e);
        p.vy = -420;
      } else {
        // Espinhoco espeta até quem pisa; os outros machucam de lado.
        p.hurt(1, e.x + e.w / 2);
      }
    }
  }

  // ---------- desenho dos inimigos comuns ----------
  function drawEspinhoco(ctx, e, t) {
    const segs = 4, segR = e.h / 2;
    const cy = e.y + e.h - segR;
    ctx.save();
    for (let i = segs - 1; i >= 0; i--) {
      const sx = e.x + segR + i * ((e.w - segR * 2) / (segs - 1));
      const wob = Math.sin(t * 8 + i * 1.2 + e.phase) * 2;
      // espinhos amarelos do segmento
      ctx.fillStyle = '#ffce3a';
      for (let k = -1; k <= 1; k++) {
        const a = -Math.PI / 2 + k * 0.55 + Math.sin(t * 6 + i) * 0.05;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a - 0.22) * segR, cy + wob + Math.sin(a - 0.22) * segR);
        ctx.lineTo(sx + Math.cos(a) * (segR + 9), cy + wob + Math.sin(a) * (segR + 9));
        ctx.lineTo(sx + Math.cos(a + 0.22) * segR, cy + wob + Math.sin(a + 0.22) * segR);
        ctx.closePath();
        ctx.fill();
      }
      // corpo: bolota roxa com gradiente
      const g = ctx.createRadialGradient(sx - 3, cy + wob - 4, 2, sx, cy + wob, segR + 1);
      g.addColorStop(0, '#b06ae0');
      g.addColorStop(0.7, '#7a2fa8');
      g.addColorStop(1, '#4d1a70');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, cy + wob, segR, 0, Math.PI * 2);
      ctx.fill();
    }
    // cabeça (segmento da frente conforme o sentido)
    const hx = e.dir > 0 ? e.x + e.w - segR : e.x + segR;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hx + e.dir * 4, cy - 5, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20102a';
    ctx.beginPath(); ctx.arc(hx + e.dir * 6, cy - 5, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawVoadeira(ctx, e, t) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const flap = Math.sin(t * 18 + e.phase); // batida de asa
    ctx.save();
    ctx.translate(cx, cy);
    // asas triangulares (escala vertical com a batida)
    ctx.save();
    ctx.scale(1, 0.35 + 0.65 * Math.abs(flap));
    const wg = ctx.createLinearGradient(-26, 0, 26, 0);
    wg.addColorStop(0, 'rgba(190,235,255,0.85)');
    wg.addColorStop(0.5, 'rgba(140,190,255,0.7)');
    wg.addColorStop(1, 'rgba(190,235,255,0.85)');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(-4, 0); ctx.lineTo(-28, -16); ctx.lineTo(-24, 8); ctx.closePath();
    ctx.moveTo(4, 0); ctx.lineTo(28, -16); ctx.lineTo(24, 8); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // corpo felpudo: três bolinhas com gradiente
    for (let i = -1; i <= 1; i++) {
      const g = ctx.createRadialGradient(i * 6 - 2, -2, 1, i * 6, 0, 8);
      g.addColorStop(0, '#e8d8b0');
      g.addColorStop(1, '#8a6a48');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(i * 6, i * i * 2, 8 - Math.abs(i), 0, Math.PI * 2); ctx.fill();
    }
    // olhos e antenas
    ctx.fillStyle = '#2a1a10';
    ctx.beginPath(); ctx.arc(-3, -8, 2, 0, Math.PI * 2); ctx.arc(3, -8, 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6a4a30'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-2, -10); ctx.quadraticCurveTo(-8, -18, -11, -17);
    ctx.moveTo(2, -10); ctx.quadraticCurveTo(8, -18, 11, -17);
    ctx.stroke();
    ctx.restore();
  }

  function drawSapeca(ctx, e, t) {
    const cx = e.x + e.w / 2;
    const squash = e.onGround ? 1 : 0.8; // esticado no ar
    ctx.save();
    ctx.translate(cx, e.y + e.h);
    ctx.scale(1 / squash, squash);
    // corpo verde-limão
    const g = ctx.createRadialGradient(0, -e.h * 0.6, 3, 0, -e.h * 0.5, e.h * 0.8);
    g.addColorStop(0, '#d8ff70');
    g.addColorStop(0.6, '#8ae030');
    g.addColorStop(1, '#3f8a18');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -e.h * 0.5, e.w * 0.5, e.h * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    // perninhas
    ctx.fillStyle = '#54a020';
    ctx.beginPath();
    ctx.ellipse(-e.w * 0.38, -4, 8, 5, 0.4, 0, Math.PI * 2);
    ctx.ellipse(e.w * 0.38, -4, 8, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // olhos saltados (piscam quando parado)
    const blink = e.onGround && (Math.sin(t * 2.2 + e.phase) > 0.94);
    for (let s = -1; s <= 1; s += 2) {
      const ex = s * e.w * 0.26, ey = -e.h * 0.95;
      ctx.fillStyle = '#eaffb0';
      ctx.beginPath(); ctx.arc(ex, ey, 7.5, 0, Math.PI * 2); ctx.fill();
      if (blink) {
        ctx.strokeStyle = '#3f8a18'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ex - 5, ey); ctx.lineTo(ex + 5, ey); ctx.stroke();
      } else {
        ctx.fillStyle = '#1a2408';
        ctx.beginPath();
        ctx.arc(ex + e.dir * 2.4, ey, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // boca
    ctx.strokeStyle = '#2f6a10'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -e.h * 0.45, 8, 0.25, Math.PI - 0.25);
    ctx.stroke();
    ctx.restore();
  }

  // ==================================================================
  // BOSS — DRAGÃO DE TRÊS CABEÇAS
  // O sprite de assets.js ocupa a metade direita da arena, virado para a
  // esquerda (de onde o jogador chega). Máquina de estados com telegraphs,
  // 4 ataques ciclando e uma fase 2 mais nervosa a partir de hp <= 3.
  // Depois de CADA ataque ele fica ofegante e abaixa as cabeças: é a janela
  // de dano, e é ela que faz a luta caber em oito socos.
  // ==================================================================

  // ---------- geometria do sprite (px dentro da imagem de 640x444) ----------
  // Tudo o que o boss precisa apontar — as duas bocas que cospem, o ponto
  // fraco, o eixo da reverência — mora aqui em coordenadas da imagem;
  // sprToWorld() converte para o mundo aplicando a MESMA transformação do
  // desenho, para hitbox nenhuma sair de debaixo do dragão.
  const SPR_W = 640, SPR_H = 444;
  const REACH = 380;                     // do eixo do boss até o focinho da frente
  const SPR_OX = -REACH;                 // canto esquerdo do sprite, no espaço local
  const SPR_OY = 150 - SPR_H;            // canto de cima: as patas pousam no chão
  const BOW_PIVOT = { x: 500, y: 430 };  // pata traseira: eixo da reverência
  // Reverência funda de propósito: é ela que traz a cabeça da frente para
  // ~150px do chão, ao alcance de um pulo simples — inclusive de um pulo
  // cortado. O que sobra do dragão abaixo do piso some no clip do desenho.
  const BOW_MAX = 0.26;                  // radianos de reverência com slump = 1

  // As duas cabeças da frente — é daqui que saem as bolas de fogo.
  const MOUTHS = [{ x: 52, y: 130 }, { x: 20, y: 220 }];
  // Um tiro por cabeça: a de cima faz o arco longo, a da frente o curto. Entre
  // os dois pontos de queda sobra um vão largo, e o vão é a resposta do jogador.
  const SHOTS = [
    { mouth: 0, vx: -430, vy: -420 },
    { mouth: 1, vx: -250, vy: -160 },
  ];
  // Ponto fraco: a cabeça da frente, que a reverência traz para a altura do soco.
  const WEAK = { x: 8, y: 176, w: 108, h: 92 };
  // Massas que machucam no contato: cabeças/pescoços e o corpanzil no chão.
  const HEADS_HULL = { x: 0, y: 100, w: 240, h: 160 };
  const BODY_HULL = { x: 150, y: 300, w: 440, h: 144 };

  // Um ponto do sprite → mundo, já com a reverência e o encolhimento da morte.
  const _pt = { x: 0, y: 0 };
  function sprToWorld(sx, sy, out) {
    out = out || _pt;
    const ang = -boss.slump * BOW_MAX;   // negativo: o focinho desce, a cauda sobe
    const c = Math.cos(ang), s = Math.sin(ang);
    const px = SPR_OX + BOW_PIVOT.x, py = SPR_OY + BOW_PIVOT.y;
    const dx = SPR_OX + sx - px, dy = SPR_OY + sy - py;
    const sc = boss.dieScale;
    out.x = boss.x + (px + dx * c - dy * s) * sc;
    out.y = boss.hingeY + (py + dx * s + dy * c) * sc;
    return out;
  }

  // Retângulo do sprite → caixa alinhada aos eixos. A reverência é pequena
  // (<= BOW_MAX rad), então transformar o centro já põe a caixa no lugar.
  function sprBox(r, box) {
    const p = sprToWorld(r.x + r.w / 2, r.y + r.h / 2, _pt);
    const sc = boss.dieScale;
    box.w = r.w * sc;
    box.h = r.h * sc;
    box.x = p.x - box.w / 2;
    box.y = p.y - box.h / 2;
    return box;
  }

  // Pools do boss (projéteis de fogo, poças, dentes) — tudo reuso.
  const MAXSPIT = 6;
  const spits = [];
  for (let i = 0; i < MAXSPIT; i++) spits.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0 });

  const MAXPOOL = 6;
  const pools = [];
  for (let i = 0; i < MAXPOOL; i++) pools.push({ active: false, x: 0, y: 0, w: 80, h: 26, t: 0 });

  const MAXTEETH = 12;
  const teeth = [];
  for (let i = 0; i < MAXTEETH; i++) {
    teeth.push({ active: false, state: 'shadow', x: 0, y: 0, w: 26, h: 46, vy: 0, timer: 0, groundY: 0 });
  }

  const shockwave = { active: false, x: 0, y: 0, w: 64, h: 34, vx: -270 };

  const boss = {
    // --- contrato lido pelo engine ---
    started: false,
    active: false,
    dead: false,
    hp: 8,
    maxHp: 8,

    // --- geometria (resolvida em runtime, no start/reset) ---
    homeX: 0,        // posto do dragão (lado direito da arena)
    x: 0,            // posição atual
    groundY: 0,      // chão da arena
    hingeY: 0,       // altura de referência do sprite
    charge: 0,       // 0..1 — fogo acumulado nas bocas (telegraph do cuspe)
    slump: 0,        // 0..1 — quanto ele abaixa as cabeças (janela de dano)

    // --- máquina de estados ---
    state: 'dormant', // dormant|intro|idle|bocanhada|cuspe|rugido|dentes|exposto|dying
    phase: 0,         // sub-fase dentro do ataque
    timer: 0,
    attackIndex: 0,   // cicla os 4 ataques
    stunHit: false,   // já apanhou nesta janela?
    flash: 0,         // flash branco ao levar dano
    eyeGlow: 0,       // brilho do ponto fraco na janela de dano
    dieTimer: 0,
    dieScale: 1,
    victoryFired: false,

    // caixas de colisão calculadas por frame
    headBox: { x: 0, y: 0, w: 0, h: 0 },
    bodyBox: { x: 0, y: 0, w: 0, h: 0 },
    eyeBox: { x: 0, y: 0, w: 0, h: 0 },

    start() {
      // Rugido de intro + música do boss; 1.2s de intro antes de atacar.
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
      this.homeX = a.x + a.w - 130;
      this.x = this.homeX;
      // hingeY é a origem local do sprite: o pé do dragão fica 150 abaixo dela
      // (ver SPR_OY), que é exatamente o chão da arena.
      this.hingeY = this.groundY - 150;
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
      this.eyeGlow = 0;
      this.charge = 0;
      this.slump = 0;
      this.dieTimer = 0;
      this.dieScale = 1;
      this.victoryFired = false;
      for (let i = 0; i < MAXSPIT; i++) spits[i].active = false;
      for (let i = 0; i < MAXPOOL; i++) pools[i].active = false;
      for (let i = 0; i < MAXTEETH; i++) teeth[i].active = false;
      shockwave.active = false;
    },

    isPhase2() { return this.hp <= 3; },

    // Fim de ataque: ofegante, cabeças abaixadas, ponto fraco ao alcance do
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
      goldBurst(this.eyeBox.x + this.eyeBox.w / 2, this.eyeBox.y + this.eyeBox.h / 2, 10, 0);
      if (this.hp <= 0) {
        // Morte cinematográfica: dead=true JÁ destranca a arena e some a barra.
        this.dead = true;
        this.state = 'dying';
        this.dieTimer = 0;
        this.timer = 0;
      } else {
        // Levanta as cabeças e volta para o posto
        this.state = 'idle';
        this.timer = this.isPhase2() ? 1.0 : 1.4;
        this.slump = 0;
      }
    },

    update(dt) {
      const p = FG.player;
      const ov = FG.engine.rectsOverlap;
      if (this.flash > 0) this.flash -= dt;

      // ---------- morte cinematográfica ----------
      if (this.state === 'dying') {
        this.dieTimer += dt;
        const k = this.dieTimer / 2.5;
        this.dieScale = Math.max(0.08, 1 - k * 0.9);    // encolhe
        this.charge = Math.max(0, 0.5 - k);             // o fogo das bocas apaga
        this.slump = Math.min(1, this.slump + dt * 2);  // as três cabeças tombam
        // faíscas douradas contínuas
        if (Math.random() < 0.6) {
          spawnParticle(this.x - rand(0, REACH * this.dieScale), this.hingeY + rand(-120, 60),
            rand(-120, 120), rand(-260, -60), 0.8, 4 + Math.random() * 4, '#ffd870', 300);
        }
        if (this.dieTimer >= 2.5 && !this.victoryFired) {
          this.victoryFired = true;
          goldBurst(this.x - 120, this.hingeY, 40, 5); // explosão final + lumis
          FG.audio.sfx('victory');
          FG.engine.setState('victory');
        }
        return;
      }

      if (!this.started) return;

      // ---------- intro ----------
      if (this.state === 'intro') {
        this.timer -= dt;
        this.charge = 0.5 + Math.sin(FG.engine.time * 10) * 0.2; // rugindo, bocas acesas
        if (this.timer <= 0) {
          this.active = true;
          this.state = 'idle';
          this.timer = 1.0;
          this.charge = 0;
        }
        return;
      }

      const p2 = this.isPhase2();
      const speedMul = p2 ? 0.85 : 1; // fase 2: intervalos um pouco menores

      // ---------- caixas vivas ----------
      // Cabeças/pescoços e corpanzil: as duas massas que machucam no contato.
      sprBox(HEADS_HULL, this.headBox);
      sprBox(BODY_HULL, this.bodyBox);
      // Ponto fraco: a cabeça da frente, que a reverência traz para baixo.
      sprBox(WEAK, this.eyeBox);

      // ---------- máquina de estados ----------
      this.timer -= dt;

      if (this.state === 'idle') {
        // levanta as cabeças, apaga o fogo e volta para o posto
        this.charge += (0 - this.charge) * Math.min(1, dt * 5);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 4);
        this.slump += (0 - this.slump) * Math.min(1, dt * 6);
        this.eyeGlow = 0;
        if (this.timer <= 0) {
          // O cuspe abre o ciclo: é a assinatura do bicho de três cabeças.
          const attacks = ['cuspe', 'bocanhada', 'rugido', 'dentes'];
          this.state = attacks[this.attackIndex % 4];
          this.attackIndex++;
          this.phase = 0;
          this.timer = 0;
        }

      } else if (this.state === 'exposto') {
        // ofegante: abaixa as cabeças e acende o alvo até levar o soco
        this.slump = Math.min(1, this.slump + dt * 5);
        this.charge += (0 - this.charge) * Math.min(1, dt * 6);
        this.x += (this.homeX - this.x) * Math.min(1, dt * 3);
        this.eyeGlow = 0.6 + 0.4 * Math.sin(FG.engine.time * 12);
        // soco na cabeça da frente
        if (!this.stunHit && p.attackBox && p.attackBox.active && ov(p.attackBox, this.eyeBox)) {
          this.takeHit();
        }
        // pisão na cabeça da frente (quica)
        else if (!this.stunHit && p.vy > 0 && ov(p, this.eyeBox)) {
          p.vy = -420;
          this.takeHit();
        }
        if (this.timer <= 0 && this.state === 'exposto') {
          this.state = 'idle';
          this.timer = 1.1 * speedMul;
          this.eyeGlow = 0;
        }

      } else if (this.state === 'bocanhada') {
        const a = FG.level.arena;
        if (this.phase === 0) {
          // telegraph longo: recua, arma o corpo e acende as bocas
          this.phase = 1;
          this.timer = 1.0;
        } else if (this.phase === 1) {
          this.x += (this.homeX + 70 - this.x) * Math.min(1, dt * 3);
          this.charge = Math.min(0.6, this.charge + dt * 1.2);
          if (this.timer <= 0) { this.phase = 2; this.timer = 0.6; }
        } else if (this.phase === 2) {
          // investe pela arena com as três cabeças na frente
          const targetX = a.x + REACH + 60;
          this.x += (targetX - this.x) * Math.min(1, dt * 5);
          this.charge = Math.max(0, this.charge - dt * 1.6);
          if (this.timer <= 0) { this.phase = 3; this.timer = 0.5; }
        } else if (this.phase === 3) {
          // volta para o posto e chega ofegante
          this.x += (this.homeX - this.x) * Math.min(1, dt * 4);
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }

      } else if (this.state === 'cuspe') {
        if (this.phase === 0) {
          // telegraph: as duas cabeças da frente inflam e acendem
          this.phase = 1;
          this.timer = 0.85;
        } else if (this.phase === 1) {
          this.charge = Math.min(1, this.charge + dt * 1.4);
          if (this.timer <= 0) {
            // uma bola de fogo por cabeça, cada uma com o seu arco
            for (let i = 0; i < SHOTS.length; i++) {
              const s = this.acquireSpit();
              if (!s) break;
              const m = MOUTHS[SHOTS[i].mouth];
              const o = sprToWorld(m.x, m.y, _pt);
              s.active = true;
              s.x = o.x; s.y = o.y; s.px = o.x; s.py = o.y;
              s.vx = SHOTS[i].vx + rand(-15, 15);
              s.vy = SHOTS[i].vy;
            }
            FG.audio.sfx('bossSpit');
            this.phase = 2;
            this.timer = 0.6;
          }
        } else if (this.phase === 2) {
          this.charge = Math.max(0, this.charge - dt * 2.5);
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }

      } else if (this.state === 'rugido') {
        if (this.phase === 0) {
          // telegraph: enche o peito, as três gargantas brilham
          this.phase = 1;
          this.timer = 0.85;
        } else if (this.phase === 1) {
          this.charge = 0.5 + Math.sin(FG.engine.time * 30) * 0.12;
          if (this.timer <= 0) {
            FG.audio.sfx('bossRoar');
            shockwave.active = true;
            shockwave.x = this.x - REACH;
            shockwave.y = this.groundY - shockwave.h;
            shockwave.vx = p2 ? -320 : -270; // devagar o bastante para pular
            this.phase = 2;
            this.timer = 0.6;
          }
        } else if (this.phase === 2) {
          this.charge = Math.max(0, this.charge - dt * 2);
          if (this.timer <= 0) this.expose(2.6 * speedMul);
        }

      } else if (this.state === 'dentes') {
        const a = FG.level.arena;
        if (this.phase === 0) {
          // sacode as três cabeças e chove presa; sombras ovais avisam ~0.8s antes
          const n = p2 ? 6 : 4;
          let spawned = 0;
          for (let i = 0; i < MAXTEETH && spawned < n; i++) {
            const t0 = teeth[i];
            if (t0.active) continue;
            t0.active = true;
            t0.state = 'shadow';
            // espalha pela metade esquerda/central da arena (onde o player luta)
            t0.x = a.x + 40 + (spawned / n) * (a.w - REACH - 120) + rand(-30, 30);
            t0.groundY = groundYAt(t0.x + t0.w / 2, 300);
            t0.y = t0.groundY - 560;
            t0.vy = 0;
            t0.timer = 0.8 + spawned * (p2 ? 0.24 : 0.34); // caem em sequência
            spawned++;
          }
          this.phase = 1;
          this.timer = 0.8 + n * (p2 ? 0.24 : 0.34) + 0.6;
          this.charge = 0.35;
        } else if (this.phase === 1) {
          // treme enquanto chove presa
          this.x = this.homeX + Math.sin(FG.engine.time * 40) * 3;
          this.charge = Math.max(0, this.charge - dt * 0.5);
          if (this.timer <= 0) {
            this.x = this.homeX;
            this.expose(2.6 * speedMul);
          }
        }
      }

      // ---------- contato com o dragão ----------
      // Encostar nas cabeças ou no corpanzil machuca. Assim que ele começa a
      // reverência (slump), tudo fica inofensivo: é justamente aí que o
      // jogador precisa chegar perto para socar a cabeça da frente.
      if (this.slump <= 0.15 && (ov(p, this.headBox) || ov(p, this.bodyBox))) {
        p.hurt(1, this.x - REACH / 2);
      }
    },

    acquireSpit() {
      for (let i = 0; i < MAXSPIT; i++) if (!spits[i].active) return spits[i];
      return null;
    },
  };

  // ---------- projéteis / poças / dentes / onda ----------
  function updateBossStuff(dt) {
    const p = FG.player;
    const ov = FG.engine.rectsOverlap;

    // cuspes de fogo (arco com gravidade; ao cair viram poça)
    for (let i = 0; i < MAXSPIT; i++) {
      const s = spits[i];
      if (!s.active) continue;
      s.px = s.x; s.py = s.y;
      s.vy += GRAV * 0.75 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      // rastro de brasa
      if (Math.random() < 0.5) {
        spawnParticle(s.x, s.y, rand(-20, 20), rand(-40, 10), 0.3, 3, '#ff9030', 0);
      }
      const gy = groundYAt(s.x, 300);
      if (s.y >= gy - 8) {
        s.active = false;
        // acende a poça de fogo (~1.2s: dá para esperar apagar)
        for (let k = 0; k < MAXPOOL; k++) {
          const q = pools[k];
          if (q.active) continue;
          q.active = true;
          q.x = s.x - q.w / 2;
          q.y = gy - q.h;
          q.t = 1.2;
          break;
        }
      } else if (ov(p, { x: s.x - 10, y: s.y - 10, w: 20, h: 20 })) {
        s.active = false;
        p.hurt(1, s.x);
      }
      if (s.x < FG.level.arena.x - 120) s.active = false;
    }

    // poças de fogo
    for (let i = 0; i < MAXPOOL; i++) {
      const q = pools[i];
      if (!q.active) continue;
      q.t -= dt;
      if (q.t <= 0) { q.active = false; continue; }
      if (Math.random() < 0.35) {
        spawnParticle(q.x + rand(0, q.w), q.y + q.h, rand(-15, 15), rand(-90, -40), 0.35, 3.5, '#ffb040', 0);
      }
      if (ov(p, q)) p.hurt(1, q.x + q.w / 2);
    }

    // chuva de dentes
    for (let i = 0; i < MAXTEETH; i++) {
      const t0 = teeth[i];
      if (!t0.active) continue;
      if (t0.state === 'shadow') {
        t0.timer -= dt;
        if (t0.timer <= 0) { t0.state = 'fall'; t0.vy = 60; }
      } else {
        t0.vy += GRAV * 1.1 * dt;
        t0.y += t0.vy * dt;
        if (ov(p, t0)) {
          t0.active = false;
          p.hurt(1, t0.x + t0.w / 2);
          continue;
        }
        if (t0.y + t0.h >= t0.groundY) {
          t0.active = false;
          // poeirinha do impacto
          for (let k = 0; k < 4; k++) {
            spawnParticle(t0.x + t0.w / 2, t0.groundY, rand(-70, 70), rand(-120, -30), 0.35, 4, 'rgba(230,225,210,0.8)', 400);
          }
        }
      }
    }

    // onda de choque rasteira (pular por cima)
    if (shockwave.active) {
      shockwave.x += shockwave.vx * dt;
      shockwave.y = groundYAt(shockwave.x + shockwave.w / 2, 300) - shockwave.h;
      if (Math.random() < 0.5) {
        spawnParticle(shockwave.x + shockwave.w, shockwave.y + shockwave.h, rand(-20, 40), rand(-100, -30), 0.3, 3.5, 'rgba(255,220,160,0.8)', 300);
      }
      if (ov(p, shockwave)) {
        shockwave.active = false;
        p.hurt(1, shockwave.x + shockwave.w / 2);
      }
      if (shockwave.x + shockwave.w < FG.level.arena.x - 40) shockwave.active = false;
    }
  }

  // ---------- desenho do boss ----------
  // O dragão é o sprite de assets.js; o que anima é a transformação (posto,
  // investida, reverência, tremor, encolhimento da morte) mais os efeitos
  // procedurais por cima: fogo nas bocas e o alvo brilhando no ponto fraco.
  function drawBoss(ctx, cam) {
    // culling: boss vive na arena; só desenha se ela está perto da câmera
    const a = FG.level.arena;
    if (cam.x + VIEW_W < a.x - 200 || cam.x > a.x + a.w + 200) return;
    if (!boss.started) boss.resolveGeometry(); // dormindo, geometria já certa

    const t = FG.engine.time;
    const p2 = boss.isPhase2();
    const dying = boss.state === 'dying';
    const sc = boss.dieScale;
    if (dying && boss.dieTimer >= 2.5) return; // já explodiu

    // tremor: fase 2 sempre treme um pouco; morrendo treme muito
    let shX = 0, shY = 0;
    if (dying) { shX = rand(-5, 5); shY = rand(-5, 5); }
    else if (p2 && boss.active) { shX = rand(-1.6, 1.6); shY = rand(-1.2, 1.2); }

    // parado, respira: sobe e desce de leve
    const breathe = (boss.active || dying) ? 0 : Math.sin(t * 1.6) * 3;

    const X = boss.x - cam.x + shX;
    const HY = boss.hingeY - cam.y + shY + breathe;
    const img = FG.assets && FG.assets.bossDragon;
    const ready = !!(img && img.complete && img.naturalWidth > 0);

    ctx.save();
    // Nada do dragão passa do chão: na reverência ele agacha, e o que sobraria
    // por baixo da linha do piso fica escondido em vez de flutuar.
    ctx.beginPath();
    ctx.rect(-200, -1000, VIEW_W + 400, (boss.groundY - cam.y) + 1000);
    ctx.clip();

    ctx.translate(X, HY);
    ctx.scale(sc, sc);
    // reverência: gira em torno da pata traseira, o focinho desce
    ctx.translate(SPR_OX + BOW_PIVOT.x, SPR_OY + BOW_PIVOT.y);
    ctx.rotate(-boss.slump * BOW_MAX);
    ctx.translate(-(SPR_OX + BOW_PIVOT.x), -(SPR_OY + BOW_PIVOT.y));

    if (ready) {
      ctx.drawImage(img, SPR_OX, SPR_OY, SPR_W, SPR_H);
      // fase 2: o bicho esquenta por dentro
      if (p2 && !dying) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.10 + 0.05 * Math.sin(t * 6);
        ctx.drawImage(img, SPR_OX, SPR_OY, SPR_W, SPR_H);
        ctx.restore();
      }
      // flash ao levar dano: a própria imagem por cima, somando luz — a
      // silhueta fica certa sem precisar de máscara nenhuma
      if (boss.flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, boss.flash * 4) * 0.85;
        ctx.drawImage(img, SPR_OX, SPR_OY, SPR_W, SPR_H);
        ctx.restore();
      }
    } else {
      drawDragonFallback(ctx, p2);
    }

    if (boss.charge > 0.02) drawMouthFire(ctx, boss.charge, t);
    if (boss.eyeGlow > 0) drawWeakGlow(ctx, boss.eyeGlow, t);
    ctx.restore();
  }

  // Silhueta de emergência: só aparece se a imagem ainda não carregou (os
  // primeiros frames, ou um ambiente sem DOM). A luta nunca acontece contra
  // um vazio, e as duas cabeças continuam onde o cuspe sai.
  function drawDragonFallback(ctx, p2) {
    ctx.fillStyle = p2 ? '#1f7a3a' : '#186032';
    ctx.beginPath();
    ctx.ellipse(SPR_OX + 360, SPR_OY + 360, 250, 84, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < MOUTHS.length; i++) {
      const m = MOUTHS[i];
      ctx.beginPath();
      ctx.ellipse(SPR_OX + m.x + 44, SPR_OY + m.y, 58, 34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Fogo carregando nas duas bocas — o telegraph do cuspe, e o que deixa claro
  // de onde as bolas vão sair.
  function drawMouthFire(ctx, k, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MOUTHS.length; i++) {
      const mx = SPR_OX + MOUTHS[i].x, my = SPR_OY + MOUTHS[i].y;
      const r = (10 + 28 * k) * (0.9 + 0.1 * Math.sin(t * 20 + i * 2));
      const g = ctx.createRadialGradient(mx, my, 1, mx, my, r);
      g.addColorStop(0, 'rgba(255,248,200,0.95)');
      g.addColorStop(0.45, 'rgba(255,150,40,0.8)');
      g.addColorStop(1, 'rgba(255,60,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Alvo pulsando na cabeça da frente durante a janela de dano.
  function drawWeakGlow(ctx, glow, t) {
    const cx = SPR_OX + WEAK.x + WEAK.w / 2, cy = SPR_OY + WEAK.y + WEAK.h / 2;
    const r = WEAK.w * 0.62 + Math.sin(t * 12) * 5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, 'rgba(255,240,140,' + (0.55 * glow).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,200,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 14);
    ctx.strokeStyle = '#fff2a0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, WEAK.w * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBossStuff(ctx, cam) {
    const t = FG.engine.time;

    // sombras ovais dos dentes (telegraph) e dentes caindo
    for (let i = 0; i < MAXTEETH; i++) {
      const t0 = teeth[i];
      if (!t0.active) continue;
      const cx = t0.x + t0.w / 2 - cam.x;
      if (t0.state === 'shadow') {
        ctx.save();
        const pulse = 0.35 + 0.25 * Math.sin(t * 14);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#200808';
        ctx.beginPath();
        ctx.ellipse(cx, t0.groundY - cam.y - 4, 22, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(cx, t0.y - cam.y);
        // dente: triângulo marfim com raiz
        const g = ctx.createLinearGradient(0, 0, 0, t0.h);
        g.addColorStop(0, '#fff8e8');
        g.addColorStop(1, '#d8c8a0');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-t0.w / 2, 0);
        ctx.lineTo(t0.w / 2, 0);
        ctx.lineTo(2, t0.h);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,90,50,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }

    // cuspes de fogo (com rastro)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MAXSPIT; i++) {
      const s = spits[i];
      if (!s.active) continue;
      const sx = s.x - cam.x, sy = s.y - cam.y;
      // rastro
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#ff8020';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.px - cam.x, s.py - cam.y);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      // bola de fogo
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, 14);
      g.addColorStop(0, '#fff0b0');
      g.addColorStop(0.5, '#ff9030');
      g.addColorStop(1, 'rgba(255,60,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    // poças de fogo (labaredas oscilando)
    for (let i = 0; i < MAXPOOL; i++) {
      const q = pools[i];
      if (!q.active) continue;
      const alpha = Math.min(1, q.t / 0.4);
      ctx.globalAlpha = alpha;
      const qx = q.x - cam.x, qy = q.y - cam.y;
      const g = ctx.createLinearGradient(0, qy, 0, qy + q.h);
      g.addColorStop(0, 'rgba(255,220,120,0.9)');
      g.addColorStop(1, 'rgba(255,70,10,0.5)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(qx, qy + q.h);
      for (let k = 0; k <= 6; k++) {
        const fx = qx + (k / 6) * q.w;
        const fh = q.h * (0.5 + 0.5 * Math.abs(Math.sin(t * 11 + k * 2 + i)));
        ctx.lineTo(fx, qy + q.h - fh);
      }
      ctx.lineTo(qx + q.w, qy + q.h);
      ctx.closePath();
      ctx.fill();
    }
    // onda de choque (anel rasteiro)
    if (shockwave.active) {
      const wx = shockwave.x - cam.x, wy = shockwave.y - cam.y;
      ctx.globalAlpha = 0.9;
      const g = ctx.createRadialGradient(wx + shockwave.w / 2, wy + shockwave.h, 4, wx + shockwave.w / 2, wy + shockwave.h, shockwave.w);
      g.addColorStop(0, 'rgba(255,240,190,0.9)');
      g.addColorStop(0.6, 'rgba(255,140,50,0.6)');
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(wx + shockwave.w / 2, wy + shockwave.h, shockwave.w * 0.9, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ==================================================================
  // API pública — FG.enemies
  // ==================================================================
  const enemies = {
    list: [],
    boss,

    reset() {
      // Repovoa os inimigos comuns a partir do level e re-arma o boss.
      this.list.length = 0;
      const defs = FG.level.enemyDefs;
      for (let i = 0; i < defs.length; i++) this.list.push(makeEnemy(defs[i]));
      boss.reset();
      // limpa partículas remanescentes
      for (let i = 0; i < MAXP; i++) particles[i].active = false;
    },

    update(dt) {
      // inimigos comuns (remoção in-place, sem alocar array novo)
      const list = this.list;
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        updateEnemy(e, dt);
        if (e.dead) {
          list[i] = list[list.length - 1];
          list.pop();
        }
      }
      // boss + seus perigos
      boss.update(dt);
      if (boss.started || boss.dead) updateBossStuff(dt);
      updateParticles(dt);
    },

    draw(ctx, cam) {
      const t = FG.engine.time;
      // inimigos comuns, com culling (só perto da câmera). As funções de
      // desenho trabalham em coordenadas de mundo — a câmera entra aqui.
      ctx.save();
      ctx.translate(-cam.x, -cam.y);
      const list = this.list;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.x + e.w < cam.x - CULL || e.x > cam.x + VIEW_W + CULL) continue;
        if (e.type === 'espinhoco') drawEspinhoco(ctx, e, t);
        else if (e.type === 'voadeira') drawVoadeira(ctx, e, t);
        else drawSapeca(ctx, e, t);
      }
      ctx.restore();
      drawBoss(ctx, cam);
      drawBossStuff(ctx, cam);
      drawParticles(ctx, cam);
    },
  };

  FG.enemies = enemies;
})();
