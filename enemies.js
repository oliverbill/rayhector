// Fagulho: Lendas do Bosque — enemies.js
// FG.enemies: os bichos comuns (espinhoco, voadeira, sapeca, peixe, e os da
// gruta submersa do pântano: piranha, carango, jacaré, candiru), as pools de
// partícula e o registro de chefões. Cada chefão mora no seu arquivo
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
      hp: 1,           // vida em golpes (soco ou pisão); a maioria morre no 1º
      dmg: 1,          // dano de contato (fora do pisão) causado ao player
      hitCd: 0,        // janela pós-acerto sem contar de novo o mesmo soco
      dead: false,
    };
    if (e.type === 'espinhoco') { e.w = 48; e.h = 26; }
    else if (e.type === 'voadeira') { e.w = 34; e.h = 26; }
    else if (e.type === 'peixe') { e.w = 46; e.h = 24; } // achatado: é um torpedo
    else if (e.type === 'piranha') { e.w = 36; e.h = 22; } // gruta submersa
    else if (e.type === 'carango') { e.w = 44; e.h = 26; } // leito da gruta
    else if (e.type === 'jacare') { e.w = 78; e.h = 30; e.hp = 3; e.dmg = 2; } // o predador-título do lago
    else if (e.type === 'candiru') { e.w = 14; e.h = 9; e.dmg = 1; } // minúsculo, só ativo na água
    else { e.w = 38; e.h = 32; } // sapeca
    // baseY: linha da patrulha da piranha/jacaré — desliza de volta ao spawnY
    // depois de um bote, para não teleportar na vertical ao retomar a ondulação.
    e.baseY = def.y;
    if (e.type === 'carango') e.timer = rand(1.2, 2.2); // primeira pinçada dessincronizada
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
    } else if (e.type === 'piranha') {
      // Piranha da gruta submersa: patrulha horizontal flutuando (sem
      // gravidade, como a voadeira), com ondulação leve. Perto do player ela
      // se eriça por um instante (telegraph legível) e dá um bote curto na
      // direção dele; depois volta à patrulha.
      const t = FG.engine.time + e.phase;
      const dx = (p.x + p.w / 2) - (e.x + e.w / 2);
      const dy = (p.y + p.h / 2) - (e.y + e.h / 2);
      if (e.st === 'parado') {
        // patrulha
        const SPD = 55;
        e.x += e.dir * SPD * dt;
        if (e.dir > 0 && e.x > e.spawnX + e.range) e.dir = -1;
        if (e.dir < 0 && e.x < e.spawnX - e.range) e.dir = 1;
        // a linha da patrulha volta devagar ao y do spawn após um bote
        e.baseY += (e.spawnY - e.baseY) * Math.min(1, dt * 2.5);
        e.y = e.baseY + Math.sin(t * 2.6) * 6;
        // bolhinhas: estamos debaixo d'água
        if (Math.random() < 0.02) {
          spawnParticle(e.x + e.w * (e.dir > 0 ? 0.85 : 0.15), e.y + e.h * 0.3,
            rand(-8, 8), -30, 0.8, 2.5, 'rgba(200,245,250,0.7)', -40);
        }
        if (dx * dx + dy * dy < 140 * 140 && Math.abs(dy) < 90) {
          e.dir = dx >= 0 ? 1 : -1;
          e.st = 'erica';
          e.timer = 0.25;      // parada, tremendo — o aviso do bote
        }
      } else if (e.st === 'erica') {
        e.timer -= dt;
        // tremida no lugar (o desenho reforça)
        e.y = e.baseY + Math.sin(t * 40) * 1.5;
        if (e.timer <= 0) {
          // mira o player no instante do avanço
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const BOTE = 300;
          e.dir = dx >= 0 ? 1 : -1;
          e.vx = (dx / d) * BOTE;
          e.vy = (dy / d) * BOTE;
          e.st = 'bote';
          e.timer = 0.5;
        }
      } else { // bote
        e.timer -= dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        // rastro de bolhas na arrancada
        if (Math.random() < 0.35) {
          spawnParticle(e.x + e.w * (e.dir > 0 ? 0.1 : 0.9), e.y + e.h * 0.5,
            rand(-20, 20), rand(-40, -10), 0.35, 2 + Math.random() * 2, 'rgba(200,245,250,0.75)', -50);
        }
        if (e.timer <= 0) {
          e.st = 'parado';
          e.baseY = e.y;       // retoma a patrulha de onde parou, sem salto
          e.vx = 0; e.vy = 0;
        }
      }
    } else if (e.type === 'carango') {
      // Carango do fundo: anda devagar no leito (gravidade + colisão, como o
      // espinhoco) e, de tempos em tempos, telegrafa e dá um pulinho de pinça
      // para cima. O corpo sobe junto — o contato genérico já machuca.
      e.vy += GRAV * dt;
      if (e.st === 'parado') {
        const SPD = 30;
        e.vx = e.dir * SPD;
        const wantVx = e.vx;
        FG.engine.moveAndCollide(e, dt);
        if ((wantVx !== 0 && e.vx === 0) ||
            (e.dir > 0 && e.x > e.spawnX + e.range) ||
            (e.dir < 0 && e.x < e.spawnX - e.range)) {
          e.dir = -e.dir;
        }
        if (Math.random() < 0.015) {
          spawnParticle(e.x + e.w / 2 + rand(-8, 8), e.y,
            rand(-6, 6), -26, 0.9, 2.5, 'rgba(200,245,250,0.7)', -35);
        }
        e.timer -= dt;
        if (e.onGround && e.timer <= 0) {
          e.st = 'tele';       // levanta as pinças e treme
          e.timer = 0.5;
        }
      } else if (e.st === 'tele') {
        e.vx = 0;
        FG.engine.moveAndCollide(e, dt);
        e.timer -= dt;
        if (e.timer <= 0) {
          e.st = 'bote';
          e.vy = -630;         // sqrt(2*GRAV*90) ≈ 90px de subida
        }
      } else { // bote: sobe com as pinças abertas e cai de volta
        e.vx = 0;
        FG.engine.moveAndCollide(e, dt);
        if (e.onGround && e.vy >= 0) {
          e.st = 'parado';
          e.timer = rand(1.8, 2.6);   // ~2.2s até a próxima pinçada
        }
      }
    } else if (e.type === 'jacare') {
      // Jacaré: o predador do lago. Patrulha quase parado, boiando rente ao
      // leito com só as costas e os olhos de fora, e dá uma dentada de longo
      // alcance — bem maior que a da piranha — quando o jogador entra na água
      // perto dele ou pisa na beirada. Mais lento para atacar (telegraph
      // maior), mas a mordida dói o dobro e ele aguenta 3 golpes.
      const t = FG.engine.time + e.phase;
      const dx = (p.x + p.w / 2) - (e.x + e.w / 2);
      const dy = (p.y + p.h / 2) - (e.y + e.h / 2);
      if (e.st === 'parado') {
        const SPD = 26;
        e.x += e.dir * SPD * dt;
        if (e.dir > 0 && e.x > e.spawnX + e.range) e.dir = -1;
        if (e.dir < 0 && e.x < e.spawnX - e.range) e.dir = 1;
        e.baseY += (e.spawnY - e.baseY) * Math.min(1, dt * 2);
        e.y = e.baseY + Math.sin(t * 1.1) * 4;   // quase parado boiando
        if (Math.random() < 0.015) {
          spawnParticle(e.x + e.w * (e.dir > 0 ? 0.9 : 0.1), e.y + e.h * 0.2,
            rand(-6, 6), -24, 0.9, 2.5, 'rgba(200,245,250,0.7)', -30);
        }
        // alcance de detecção bem maior que o da piranha
        if (dx * dx + dy * dy < 230 * 230 && Math.abs(dy) < 130) {
          e.dir = dx >= 0 ? 1 : -1;
          e.st = 'erica';
          e.timer = 0.32;      // telegraph mais longo: dá tempo de reagir
        }
      } else if (e.st === 'erica') {
        e.timer -= dt;
        e.y = e.baseY + Math.sin(t * 26) * 2;
        if (e.timer <= 0) {
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const BOTE = 260;
          e.dir = dx >= 0 ? 1 : -1;
          e.vx = (dx / d) * BOTE;
          e.vy = (dy / d) * BOTE;
          e.st = 'bote';
          e.timer = 0.55;
        }
      } else { // bote
        e.timer -= dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (Math.random() < 0.4) {
          spawnParticle(e.x + e.w * (e.dir > 0 ? 0.1 : 0.9), e.y + e.h * 0.5,
            rand(-24, 24), rand(-45, -10), 0.4, 2.5 + Math.random() * 2, 'rgba(200,245,250,0.75)', -50);
        }
        if (e.timer <= 0) {
          e.st = 'parado';
          e.baseY = e.y;
          e.vx = 0; e.vy = 0;
        }
      }
    } else if (e.type === 'candiru') {
      // Candiru: some enquanto o jogador está seco (não ameaça de fora
      // d'água) e vira uma flecha minúscula e insistente assim que ele
      // mergulha — mordida fraca, mas persiste enquanto o jogador continuar
      // molhado por perto.
      if (!p.inWater) {
        e.st = 'dormente';
        e.x = e.spawnX + Math.sin((FG.engine.time + e.phase) * 1.4) * 5;
        e.y = e.spawnY + Math.sin((FG.engine.time + e.phase) * 1.9) * 4;
        e.vx = 0; e.vy = 0;
      } else {
        e.st = 'ativo';
        const dx2 = (p.x + p.w / 2) - (e.x + e.w / 2);
        const dy2 = (p.y + p.h / 2) - (e.y + e.h / 2);
        const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
        const SPD = 220;
        e.dir = dx2 >= 0 ? 1 : -1;
        e.x += (dx2 / d2) * SPD * dt;
        e.y += (dy2 / d2) * SPD * dt;
        if (Math.random() < 0.3) {
          spawnParticle(e.x + e.w * 0.5, e.y + e.h * 0.5, rand(-10, 10), rand(-20, -4),
            0.3, 1.5, 'rgba(200,245,250,0.8)', -30);
        }
      }
    }

    // ---------- combate ----------
    if (e.hitCd > 0) e.hitCd -= dt;

    // 1) Soco: se a hitbox do golpe sobrepõe e não está na janela de
    // cooldown do acerto, desconta 1 de vida. A maioria morre no 1º golpe;
    // o jacaré aguenta 3.
    if (p.attackBox && p.attackBox.active && e.hitCd <= 0 && ov(p.attackBox, e)) {
      e.hp -= 1;
      e.hitCd = 0.3;
      if (e.hp <= 0) { killEnemy(e); return; }
      FG.audio.sfx('hitEnemy');
      return;
    }
    // 2) Contato com o player
    if (ov(p, e)) {
      if (e.type !== 'espinhoco' && isStomp(p, e)) {
        // Pisão: desconta vida (a maioria já zera) e o player quica.
        if (e.hitCd <= 0) { e.hp -= 1; e.hitCd = 0.3; }
        p.vy = -420;
        if (e.hp <= 0) { killEnemy(e); return; }
      } else if (e.type === 'candiru' && !p.inWater) {
        // dormente fora d'água: contato não machuca
      } else {
        // Espinhoco espeta até quem pisa; os outros machucam de lado.
        p.hurt(e.dmg || 1, e.x + e.w / 2);
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

  function drawPiranha(ctx, e, t) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const ericada = e.st === 'erica';
    const dando = e.st === 'bote';
    // cauda bate sempre; freneticamente quando eriçada ou no bote
    const wob = Math.sin(t * (ericada || dando ? 26 : 8) + e.phase) * (dando ? 5 : 3);
    ctx.save();
    ctx.translate(cx + (ericada ? Math.sin(t * 60) * 1.5 : 0), cy);
    ctx.scale(e.dir, 1);                        // olha para onde vai
    if (dando) ctx.scale(1.15, 0.9);            // esticada no avanço

    // caudinha em leque, atrás
    ctx.fillStyle = '#7a4a3a';
    ctx.beginPath();
    ctx.moveTo(-e.w * 0.28, 0);
    ctx.lineTo(-e.w * 0.60, -8 + wob);
    ctx.lineTo(-e.w * 0.48, 0);
    ctx.lineTo(-e.w * 0.60, 8 + wob);
    ctx.closePath();
    ctx.fill();
    // nadadeira dorsal
    ctx.fillStyle = '#5f6a4a';
    ctx.beginPath();
    ctx.moveTo(-6, -e.h * 0.34);
    ctx.quadraticCurveTo(0, -e.h * 0.85 - wob * 0.4, 9, -e.h * 0.3);
    ctx.closePath(); ctx.fill();

    // corpo oval: dorso cinza-esverdeado, flanco vermelho-acastanhado (tons do
    // pântano ocre)
    const g = ctx.createRadialGradient(-2, -3, 2, 0, 0, e.w * 0.5);
    g.addColorStop(0, '#8a9468');
    g.addColorStop(0.5, '#6d6248');
    g.addColorStop(1, '#7a3a2a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.w * 0.46, e.h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // barriga clara
    ctx.fillStyle = 'rgba(230,214,180,0.85)';
    ctx.beginPath();
    ctx.ellipse(1, e.h * 0.24, e.w * 0.34, e.h * 0.2, 0.08, 0, Math.PI * 2);
    ctx.fill();

    // boca aberta com dentinhos triangulares brancos — a assinatura
    const abre = dando || ericada ? 5.5 : 3.5 + Math.sin(t * 5 + e.phase) * 1.2;
    ctx.fillStyle = '#5a1616';
    ctx.beginPath();
    ctx.moveTo(e.w * 0.46, 0);
    ctx.lineTo(e.w * 0.16, -abre);
    ctx.lineTo(e.w * 0.16, abre);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) {
      const tx = e.w * (0.20 + i * 0.08);
      const th = abre * (1 - i * 0.22);
      // dente de cima
      ctx.beginPath();
      ctx.moveTo(tx, -th); ctx.lineTo(tx + 3, -th); ctx.lineTo(tx + 1.5, -th + 3);
      ctx.closePath(); ctx.fill();
      // dente de baixo
      ctx.beginPath();
      ctx.moveTo(tx + 3, th); ctx.lineTo(tx + 6, th); ctx.lineTo(tx + 4.5, th - 3);
      ctx.closePath(); ctx.fill();
    }

    // olho raivoso: sobrancelha caída sobre olho amarelo
    const ex = e.w * 0.18, ey = -e.h * 0.2;
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath(); ctx.arc(ex, ey, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a0d08';
    ctx.beginPath(); ctx.arc(ex + 1.4, ey + 0.6, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex - 5, ey - 6); ctx.lineTo(ex + 5, ey - 2.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawCarango(ctx, e, t) {
    const cx = e.x + e.w / 2;
    const tele = e.st === 'tele';
    const bote = e.st === 'bote';
    const andando = e.st === 'parado';
    const passo = Math.sin(t * 10 + e.phase);   // ritmo das perninhas
    // pinças: abrem/fecham devagar andando; erguidas e escancaradas no bote
    const abre = bote ? 0.9 : tele ? 0.5 : 0.3 + Math.abs(Math.sin(t * 3 + e.phase)) * 0.25;
    const ergue = (tele || bote) ? 1 : 0;       // pinças para cima
    ctx.save();
    ctx.translate(cx + (tele ? Math.sin(t * 50) * 1.5 : 0), e.y + e.h);
    ctx.scale(e.dir, 1);

    // perninhas dos lados (3 de cada), mexem ao andar
    ctx.strokeStyle = '#6a2a1a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const lx = -e.w * 0.32 + i * e.w * 0.18;
      const lw = andando ? passo * 3 * (i % 2 === 0 ? 1 : -1) : 0;
      ctx.beginPath();
      ctx.moveTo(lx, -e.h * 0.3);
      ctx.lineTo(lx - 5 + lw, -1);
      ctx.moveTo(-lx - e.w * 0.05, -e.h * 0.3);
      ctx.lineTo(-lx - e.w * 0.05 + 5 - lw, -1);
      ctx.stroke();
    }

    // pinças na frente: dois braços com garras que abrem/fecham
    for (let s = 0; s < 2; s++) {
      const px = e.w * (0.30 + s * 0.12);
      const py = ergue ? -e.h * (0.9 + s * 0.15) : -e.h * 0.30;
      ctx.strokeStyle = '#8a3a22'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(e.w * 0.22, -e.h * 0.35);
      ctx.quadraticCurveTo(px, ergue ? -e.h * 0.7 : -e.h * 0.2, px, py);
      ctx.stroke();
      // garra: duas meias-luas que se afastam com "abre"
      ctx.fillStyle = '#a04828';
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ergue ? -0.5 : 0.15);
      ctx.beginPath();
      ctx.ellipse(2, -3 - abre * 4, 6, 3.4, -0.5 - abre * 0.6, 0, Math.PI * 2);
      ctx.ellipse(2, 3 + abre * 4, 6, 3.4, 0.5 + abre * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // casco oval avermelhado-lamacento
    const g = ctx.createRadialGradient(-3, -e.h * 0.6, 3, 0, -e.h * 0.45, e.w * 0.55);
    g.addColorStop(0, '#b8623a');
    g.addColorStop(0.6, '#8a3a22');
    g.addColorStop(1, '#5a2414');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -e.h * 0.42, e.w * 0.46, e.h * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();
    // textura do casco: sulcos e pintas de lama
    ctx.strokeStyle = 'rgba(60,24,12,0.45)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, -e.h * 0.42, e.w * 0.3, -2.6, -0.55);
    ctx.moveTo(-e.w * 0.18, -e.h * 0.62); ctx.lineTo(-e.w * 0.1, -e.h * 0.3);
    ctx.stroke();
    ctx.fillStyle = 'rgba(90,74,40,0.5)';
    ctx.beginPath();
    ctx.arc(-e.w * 0.22, -e.h * 0.5, 2.2, 0, Math.PI * 2);
    ctx.arc(e.w * 0.1, -e.h * 0.64, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // olhinhos em pedúnculo, em cima
    for (let s = -1; s <= 1; s += 2) {
      const ox = s * e.w * 0.12 + e.w * 0.08;
      ctx.strokeStyle = '#6a2a1a'; ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(ox, -e.h * 0.78);
      ctx.lineTo(ox + 1.5, -e.h * 1.05);
      ctx.stroke();
      ctx.fillStyle = '#f2e8d0';
      ctx.beginPath(); ctx.arc(ox + 1.5, -e.h * 1.12, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a0d08';
      ctx.beginPath(); ctx.arc(ox + 2.4, -e.h * 1.12, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawJacare(ctx, e, t) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const ericada = e.st === 'erica';
    const dando = e.st === 'bote';
    const wob = Math.sin(t * (ericada || dando ? 20 : 5) + e.phase) * (dando ? 6 : 3);
    ctx.save();
    ctx.translate(cx + (ericada ? Math.sin(t * 46) * 1.2 : 0), cy);
    ctx.scale(e.dir, 1);
    if (dando) ctx.scale(1.12, 0.9);

    // cauda comprida, ondulando
    ctx.fillStyle = '#3c4a22';
    ctx.beginPath();
    ctx.moveTo(-e.w * 0.32, 0);
    ctx.lineTo(-e.w * 0.7, -9 + wob);
    ctx.lineTo(-e.w * 0.58, 0);
    ctx.lineTo(-e.w * 0.7, 9 + wob);
    ctx.closePath();
    ctx.fill();
    // cristas dorsais, três triângulos ao longo do dorso
    ctx.fillStyle = '#2c3a18';
    for (let i = 0; i < 3; i++) {
      const bx = -e.w * 0.18 + i * e.w * 0.16;
      ctx.beginPath();
      ctx.moveTo(bx - 5, -e.h * 0.4);
      ctx.lineTo(bx, -e.h * 0.7 - wob * 0.2);
      ctx.lineTo(bx + 5, -e.h * 0.4);
      ctx.closePath();
      ctx.fill();
    }

    // corpo grosso, couraça verde-oliva
    const g = ctx.createRadialGradient(-4, -e.h * 0.1, 2, 0, 0, e.w * 0.5);
    g.addColorStop(0, '#6a7a3c');
    g.addColorStop(0.55, '#4a5a26');
    g.addColorStop(1, '#2c3814');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.w * 0.46, e.h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // barriga clara, só a fatia de baixo
    ctx.fillStyle = 'rgba(214,208,164,0.65)';
    ctx.beginPath();
    ctx.ellipse(0, e.h * 0.28, e.w * 0.36, e.h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // placas do couro
    ctx.fillStyle = 'rgba(28,36,14,0.35)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(-e.w * 0.2 + i * e.w * 0.14, -e.h * 0.06, 4, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // focinho longo, achatado, na frente
    ctx.fillStyle = '#3c4a20';
    ctx.beginPath();
    ctx.moveTo(e.w * 0.3, -e.h * 0.22);
    ctx.lineTo(e.w * 0.62, -e.h * 0.1);
    ctx.lineTo(e.w * 0.62, e.h * 0.1);
    ctx.lineTo(e.w * 0.3, e.h * 0.22);
    ctx.closePath();
    ctx.fill();
    // mordida: dentinhos brancos só aparecem eriçado/atacando
    if (ericada || dando) {
      ctx.fillStyle = '#f2ead0';
      const nD = 4;
      for (let i = 0; i < nD; i++) {
        const tx = e.w * (0.34 + i * 0.07);
        ctx.beginPath();
        ctx.moveTo(tx, -e.h * 0.14); ctx.lineTo(tx + 2.4, -e.h * 0.14); ctx.lineTo(tx + 1.2, -e.h * 0.06);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tx, e.h * 0.14); ctx.lineTo(tx + 2.4, e.h * 0.14); ctx.lineTo(tx + 1.2, e.h * 0.06);
        ctx.closePath(); ctx.fill();
      }
    }

    // olhos em bossa no alto da cabeça — o que se vê de fora quando ele
    // finge só boiar
    for (let s = -1; s <= 1; s += 2) {
      const ex = e.w * 0.14, ey = s * e.h * 0.3 - e.h * 0.02;
      ctx.fillStyle = '#3c4a20';
      ctx.beginPath(); ctx.arc(ex, ey, 4.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath(); ctx.arc(ex + 1, ey, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a0d08';
      ctx.beginPath(); ctx.arc(ex + 1.8, ey, 1.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawCandiru(ctx, e, t) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const ativo = e.st === 'ativo';
    const wob = Math.sin(t * (ativo ? 24 : 6) + e.phase) * (ativo ? 3 : 1.4);
    ctx.save();
    ctx.globalAlpha = ativo ? 0.95 : 0.35; // dormente: quase invisível, escondido no lodo
    ctx.translate(cx, cy);
    ctx.scale(e.dir, 1);
    // corpo filiforme, um traço fino com cauda
    ctx.strokeStyle = '#d8c8a8';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-e.w * 0.5, wob * 0.5);
    ctx.quadraticCurveTo(0, -wob, e.w * 0.5, 0);
    ctx.stroke();
    // cabecinha com boquinha
    ctx.fillStyle = '#c8b898';
    ctx.beginPath();
    ctx.arc(e.w * 0.46, 0, 2.4, 0, Math.PI * 2);
    ctx.fill();
    if (ativo) {
      ctx.fillStyle = '#5a1616';
      ctx.beginPath();
      ctx.arc(e.w * 0.52, 0, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
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

    // Some inteiro o elenco comum no instante em que o chefão começa: a luta
    // é só dele, sem espinhoco/voadeira/sapeca sobrando de fundo. Diferente
    // de reset(), não mexe no boss nem nas lumis — é só esta lista.
    clearRegulares() {
      this.list.length = 0;
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
        else if (e.type === 'piranha') drawPiranha(ctx, e, t);
        else if (e.type === 'carango') drawCarango(ctx, e, t);
        else if (e.type === 'jacare') drawJacare(ctx, e, t);
        else if (e.type === 'candiru') drawCandiru(ctx, e, t);
        else drawSapeca(ctx, e, t);
      }
      ctx.restore();
      if (this.boss) this.boss.draw(ctx, cam);
      drawParticles(ctx, cam);
    },
  };

  FG.enemies = enemies;
})();
