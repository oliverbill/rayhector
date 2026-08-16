// Fagulho: Lendas do Bosque — enemies.js
// FG.enemies: os bichos comuns (espinhoco, voadeira, sapeca, peixe), as pools
// de partícula e o registro de chefões. Cada chefão mora no seu arquivo
// (boss1.js, boss2.js, boss3.js) e regista-se aqui no load; enemies.js só
// escolhe qual deles entra em cena, pelo bossId da fase. Nenhuma referência a
// outros módulos no load — só dentro de funções chamadas em runtime.
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
      timer: 0,        // temporizador de estado (sapeca, peixe)
      phase: Math.random() * Math.PI * 2, // dessincroniza animações
      st: 'parado',    // sub-estado (peixe: parado|disparo|sumido)
      speed: def.speed || 560, // velocidade do disparo do peixe
      dead: false,
    };
    if (e.type === 'espinhoco') { e.w = 48; e.h = 26; }
    else if (e.type === 'voadeira') { e.w = 34; e.h = 26; }
    else if (e.type === 'peixe') { e.w = 46; e.h = 24; } // achatado: é um torpedo
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
    } else if (e.type === 'peixe') {
      // Peixe voador: fica no lugar bufando até o jogador entrar no alcance,
      // e então dispara na horizontal como um torpedo. Não persegue e não cai
      // — a graça é ler o momento de passar por baixo ou pular por cima.
      if (e.st === 'parado') {
        e.x = e.spawnX;
        e.y = e.spawnY + Math.sin((FG.engine.time + e.phase) * 3) * 5; // boiando
        // bolha de vez em quando: é o que avisa que o bicho está vivo
        if (Math.random() < 0.02) {
          spawnParticle(e.x + e.w * (e.dir > 0 ? 0.9 : 0.1), e.y + e.h * 0.35,
            rand(-8, 8), -34, 0.7, 3, 'rgba(190,250,255,0.75)', -40);
        }
        const dx = (p.x + p.w / 2) - (e.x + e.w / 2);
        const dy = (p.y + p.h / 2) - (e.y + e.h / 2);
        // O gatilho é o alcance horizontal; a faixa vertical só evita que ele
        // gaste o disparo com um jogador dois patamares abaixo, fora da rota.
        if (Math.abs(dx) < e.range && Math.abs(dy) < 120) {
          e.dir = dx >= 0 ? 1 : -1;
          e.st = 'disparo';
          e.vx = e.dir * e.speed;
        }
      } else if (e.st === 'disparo') {
        e.x += e.dir * e.speed * dt;
        e.y = e.spawnY;                 // reto: o disparo é sempre horizontal
        // rastro de bolhas atrás da cauda
        spawnParticle(e.x + e.w * (e.dir > 0 ? 0.05 : 0.95), e.y + e.h * (0.3 + Math.random() * 0.4),
          rand(-30, 30), rand(-50, -10), 0.35, 2 + Math.random() * 3, 'rgba(200,250,255,0.8)', -60);
        // Some ao sair de vista. A distância do spawn é a rede de segurança
        // para quando a câmera está noutro canto do mundo.
        const cam = FG.engine.cam;
        if (e.x + e.w < cam.x - CULL || e.x > cam.x + VIEW_W + CULL ||
            Math.abs(e.x - e.spawnX) > VIEW_W + 240) {
          e.st = 'sumido';
          e.timer = 2.5;                // volta ao posto depois deste tempo
        }
      } else {
        // sumido: fora do mundo, sem colisão nenhuma, só contando o tempo
        e.timer -= dt;
        if (e.timer <= 0) {
          e.st = 'parado';
          e.x = e.spawnX;
          e.y = e.spawnY;
        }
        return;
      }
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

  function drawPeixe(ctx, e, t) {
    if (e.st === 'sumido') return;      // já saiu de cena; volta no lugar dele
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const dando = e.st === 'disparo';
    // Nadadeiras tremem sempre; no disparo tremem muito mais rápido — o
    // borrão é o que diz de longe que ele já saiu do lugar.
    const wob = Math.sin(t * (dando ? 30 : 7) + e.phase) * (dando ? 5 : 2.5);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(e.dir, 1);                          // olha sempre para onde vai
    ctx.scale(dando ? 1.22 : 1, dando ? 0.86 : 1); // esticado quando dispara

    // cauda em leque, atrás
    ctx.fillStyle = '#1aa9b8';
    ctx.beginPath();
    ctx.moveTo(-e.w * 0.30, 0);
    ctx.lineTo(-e.w * 0.62, -10 + wob);
    ctx.lineTo(-e.w * 0.50, 0);
    ctx.lineTo(-e.w * 0.62, 10 + wob);
    ctx.closePath();
    ctx.fill();
    // nadadeiras de cima e de baixo, membranosas
    ctx.fillStyle = 'rgba(150,240,245,0.85)';
    ctx.beginPath();
    ctx.moveTo(-4, -e.h * 0.34); ctx.quadraticCurveTo(2, -e.h * 0.95 - wob, 12, -e.h * 0.30);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4, e.h * 0.34); ctx.quadraticCurveTo(2, e.h * 0.92 + wob, 12, e.h * 0.30);
    ctx.closePath(); ctx.fill();

    // corpo achatado azul-turquesa
    const g = ctx.createRadialGradient(-2, -4, 2, 0, 0, e.w * 0.52);
    g.addColorStop(0, '#a8f6f0');
    g.addColorStop(0.55, '#28c4cc');
    g.addColorStop(1, '#0c6f8c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.w * 0.44, e.h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // brilho de escama nas costas
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-2, -e.h * 0.22, e.w * 0.24, e.h * 0.12, -0.15, 0, Math.PI * 2);
    ctx.fill();
    // guelra
    ctx.strokeStyle = 'rgba(10,80,100,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.w * 0.06, 0, e.h * 0.42, -1.0, 1.0);
    ctx.stroke();

    // cara boba: olho enorme e boca de "ó" bufando
    const ex = e.w * 0.24;
    ctx.fillStyle = '#fdfffe';
    ctx.beginPath(); ctx.arc(ex, -e.h * 0.14, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0d2430';
    ctx.beginPath(); ctx.arc(ex + 2.2, -e.h * 0.14, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ex + 3.4, -e.h * 0.22, 1.3, 0, Math.PI * 2); ctx.fill();
    // a boca abre e fecha parado (bufando) e fica arregalada no disparo
    const bocaR = dando ? 4.2 : 2.6 + Math.sin(t * 6 + e.phase) * 1.2;
    ctx.fillStyle = '#0a5a70';
    ctx.beginPath(); ctx.ellipse(e.w * 0.44, e.h * 0.16, bocaR, bocaR * 1.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ==================================================================
  // Registro de chefões
  // Cada boss vive no seu arquivo (boss1.js, boss2.js, boss3.js) e regista-se
  // aqui no load. enemies.js não conhece nenhum deles pelo nome: quem escolhe
  // é o bossId da fase, lido em reset().
  // ==================================================================
  const bossList = [];                    // ordem de registro (index.html)
  const bossById = Object.create(null);

  function registerBoss(id, b) {
    if (bossById[id]) return;             // registro repetido é ruído, ignora
    bossById[id] = b;
    bossList.push(b);
    // O engine lê FG.enemies.boss desde o primeiro frame; deixar o primeiro
    // registrado já publicado evita um buraco entre o load e o reset().
    if (!enemies.boss) enemies.boss = b;
  }

  // ==================================================================
  // API pública — FG.enemies
  // ==================================================================
  const enemies = {
    list: [],
    boss: null,          // o chefão da fase corrente; reset() é quem escolhe

    registerBoss,

    // Efeitos e utilitários que os bossN.js consomem em runtime. As pools de
    // partícula continuam aqui — um só lugar a limpar quando a fase troca.
    fx: { spawnParticle, goldBurst, groundYAt, rand, VIEW_W },

    reset() {
      // Repovoa os inimigos comuns a partir do level e re-arma o boss.
      this.list.length = 0;
      const defs = FG.level.enemyDefs;
      for (let i = 0; i < defs.length; i++) this.list.push(makeEnemy(defs[i]));
      // Reseta TODOS os registrados, não só o da fase que entra: o chefão da
      // fase anterior pode ter deixado cuspe ou dente no ar, e essas pools só
      // se apagam pelo reset() do dono.
      for (let i = 0; i < bossList.length; i++) bossList[i].reset();
      // Id desconhecido cai no primeiro registrado — ficar sem chefão trancaria
      // o jogador na arena para sempre, o que é pior do que o chefão errado.
      this.boss = bossById[FG.level.bossId] || bossList[0] || null;
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
      // boss da fase (ele mesmo cuida dos próprios projéteis)
      if (this.boss) this.boss.update(dt);
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
        else if (e.type === 'peixe') drawPeixe(ctx, e, t);
        else drawSapeca(ctx, e, t);
      }
      ctx.restore();
      if (this.boss) this.boss.draw(ctx, cam);
      drawParticles(ctx, cam);
    },
  };

  FG.enemies = enemies;
})();
