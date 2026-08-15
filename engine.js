// Fagulho: Lendas do Bosque — engine: loop, input, câmera, colisão, HUD, estados.
window.FG = window.FG || {};

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VIEW_W = canvas.width, VIEW_H = canvas.height;

  // ---------- input ----------
  const input = {
    left: false, right: false, down: false, jump: false, attack: false,
    jumpPressed: false, attackPressed: false,
  };
  FG.input = input;

  const KEYS = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    down: ['ArrowDown', 'KeyS'],
    jump: ['Space', 'KeyZ', 'ArrowUp', 'KeyW'],
    attack: ['KeyX', 'KeyK'],
  };
  const keyToAction = {};
  for (const action in KEYS) for (const code of KEYS[action]) keyToAction[code] = action;

  let firstGesture = false;
  window.addEventListener('keydown', (e) => {
    const action = keyToAction[e.code];
    if (action) e.preventDefault();
    if (!firstGesture) { firstGesture = true; FG.audio.init(); }
    if (!action) return;
    if (!input[action]) {
      if (action === 'jump') pressBuffer.jump = true;
      if (action === 'attack') pressBuffer.attack = true;
    }
    input[action] = true;
    if (engine.state === 'menu' && (action === 'jump' || action === 'attack')) startGame();
    if (engine.state === 'victory' && action === 'jump') startGame();
  });
  window.addEventListener('keyup', (e) => {
    const action = keyToAction[e.code];
    if (action) input[action] = false;
  });
  const pressBuffer = { jump: false, attack: false };

  // ---------- helpers ----------
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Integra posição e resolve contra FG.level.solids, eixo a eixo.
  function moveAndCollide(e, dt) {
    const solids = FG.level.solids;
    e.x += e.vx * dt;
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (!rectsOverlap(e, s)) continue;
      if (e.vx > 0) e.x = s.x - e.w;
      else if (e.vx < 0) e.x = s.x + s.w;
      e.vx = 0;
    }
    e.onGround = false;
    e.y += e.vy * dt;
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (!rectsOverlap(e, s)) continue;
      if (e.vy > 0) { e.y = s.y - e.h; e.onGround = true; }
      else if (e.vy < 0) e.y = s.y + s.h;
      e.vy = 0;
    }
  }

  // ---------- engine ----------
  const engine = {
    canvas, ctx, cam: { x: 0, y: 0 },
    state: 'menu',
    time: 0,
    lumis: 0,
    checkpoint: { x: 0, y: 0 },
    rectsOverlap, moveAndCollide,
    addLumi() { engine.lumis++; },
    setState(s) {
      engine.state = s;
      if (s === 'dead') {
        deadTimer = 0;
        FG.audio.sfx('death');
        FG.audio.music(null);
      } else if (s === 'victory') {
        FG.audio.music(null);
      }
    },
  };
  FG.engine = engine;

  let deadTimer = 0;
  let arenaLocked = false;

  function startGame() {
    engine.lumis = 0;
    engine.checkpoint = { x: FG.level.playerStart.x, y: FG.level.playerStart.y };
    FG.player.respawn(FG.level.playerStart.x, FG.level.playerStart.y);
    FG.enemies.reset();
    arenaLocked = false;
    engine.setState('playing');
    FG.audio.sfx('select');
    FG.audio.music('overworld');
  }

  function respawnFromCheckpoint() {
    FG.player.respawn(engine.checkpoint.x, engine.checkpoint.y);
    FG.enemies.reset();
    arenaLocked = false;
    engine.setState('playing');
    FG.audio.music('overworld');
  }

  // ---------- update ----------
  function update(dt) {
    engine.time += dt;
    input.jumpPressed = pressBuffer.jump; pressBuffer.jump = false;
    input.attackPressed = pressBuffer.attack; pressBuffer.attack = false;

    if (engine.state === 'playing') {
      const p = FG.player;
      FG.level.update(dt);
      p.update(dt);
      FG.enemies.update(dt);

      // hazards
      for (const hz of FG.level.hazards) {
        if (rectsOverlap(p, hz)) { p.hurt(1, hz.x + hz.w / 2); break; }
      }
      // queda no vazio
      if (p.y > FG.level.H + 120) {
        p.hurt(2, p.x);
        if (p.hp > 0) p.respawn(engine.checkpoint.x, engine.checkpoint.y);
      }
      // checkpoints
      for (const c of FG.level.checkpoints) {
        if (Math.abs(p.x + p.w / 2 - c.x) < 40 && Math.abs(p.y + p.h - c.y) < 80) {
          if (engine.checkpoint.x !== c.x) {
            engine.checkpoint = { x: c.x, y: c.y - p.h - 2 };
            FG.audio.sfx('checkpoint');
          }
        }
      }
      // gatilho e tranca da arena do boss
      const boss = FG.enemies.boss;
      if (!boss.started && p.x > FG.level.bossTriggerX) boss.start();
      if (boss.started && !boss.dead) {
        arenaLocked = true;
        const a = FG.level.arena;
        if (p.x < a.x) { p.x = a.x; if (p.vx < 0) p.vx = 0; }
        if (p.x + p.w > a.x + a.w) { p.x = a.x + a.w - p.w; if (p.vx > 0) p.vx = 0; }
      }
      // limites do mundo
      if (p.x < 0) { p.x = 0; if (p.vx < 0) p.vx = 0; }
      if (p.x + p.w > FG.level.W) { p.x = FG.level.W - p.w; if (p.vx > 0) p.vx = 0; }

      updateCamera(dt);
    } else if (engine.state === 'dead') {
      deadTimer += dt;
      if (deadTimer > 1.6) respawnFromCheckpoint();
    }
  }

  function updateCamera(dt) {
    const p = FG.player, cam = engine.cam;
    let targetX = p.x + p.w / 2 - VIEW_W / 2 + p.facing * 60;
    let targetY = p.y + p.h / 2 - VIEW_H / 2 - 40;
    if (arenaLocked) {
      const a = FG.level.arena;
      targetX = Math.max(a.x, Math.min(targetX, a.x + a.w - VIEW_W));
    }
    targetX = Math.max(0, Math.min(targetX, FG.level.W - VIEW_W));
    targetY = Math.max(0, Math.min(targetY, FG.level.H - VIEW_H));
    const k = 1 - Math.pow(0.001, dt); // suavização independente de fps
    cam.x += (targetX - cam.x) * k;
    cam.y += (targetY - cam.y) * k;
  }

  // ---------- draw ----------
  function draw() {
    const cam = engine.cam;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    if (engine.state === 'menu') { drawMenu(); return; }

    FG.level.drawBack(ctx, cam);
    FG.level.drawSolids(ctx, cam);
    FG.enemies.draw(ctx, cam);
    FG.player.draw(ctx, cam);
    FG.level.drawFront(ctx, cam);
    drawHUD();

    if (engine.state === 'dead') drawDeadOverlay();
    if (engine.state === 'victory') drawVictory();
  }

  function drawMenu() {
    const t = engine.time;
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#2a1445'); g.addColorStop(0.6, '#4a1e50'); g.addColorStop(1, '#1a2e1a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // vagalumes do menu
    for (let i = 0; i < 24; i++) {
      const fx = (i * 397 + Math.sin(t * 0.4 + i) * 60) % VIEW_W;
      const fy = (i * 211 + Math.cos(t * 0.3 + i * 2) * 40) % VIEW_H;
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 2 + i);
      ctx.fillStyle = '#ffd870';
      ctx.beginPath(); ctx.arc(fx, fy, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb830';
    ctx.shadowColor = '#ff8000'; ctx.shadowBlur = 30;
    ctx.font = 'bold 64px "Trebuchet MS", sans-serif';
    ctx.fillText('FAGULHO', VIEW_W / 2, 200 + Math.sin(t * 1.5) * 6);
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffe8b0';
    ctx.font = 'bold 28px "Trebuchet MS", sans-serif';
    ctx.fillText('Lendas do Bosque', VIEW_W / 2, 248 + Math.sin(t * 1.5) * 6);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.6 + 0.4 * Math.sin(t * 3)) + ')';
    ctx.font = '22px "Trebuchet MS", sans-serif';
    ctx.fillText('aperte ESPAÇO para acender a lenda', VIEW_W / 2, 360);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '16px "Trebuchet MS", sans-serif';
    ctx.fillText('setas / WASD para mover · ESPAÇO pula (2x; segure para planar) · X soca', VIEW_W / 2, 400);
    ctx.restore();
  }

  function drawHUD() {
    ctx.save();
    // corações (hp em metades)
    const hp = FG.player.hp, max = FG.player.maxHp;
    for (let i = 0; i < max / 2; i++) {
      const x = 24 + i * 34, y = 22;
      const filled = hp - i * 2; // 2 = cheio, 1 = metade, <=0 vazio
      drawHeart(x, y, filled >= 2 ? 1 : filled === 1 ? 0.5 : 0);
    }
    // lumis
    ctx.textAlign = 'right';
    ctx.font = 'bold 24px "Trebuchet MS", sans-serif';
    ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffd870';
    ctx.beginPath(); ctx.arc(VIEW_W - 90, 34, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff2d0';
    ctx.fillText(String(engine.lumis), VIEW_W - 30, 42);
    ctx.restore();
    // barra do boss
    const boss = FG.enemies.boss;
    if (boss.started && !boss.dead && boss.hp > 0) {
      ctx.save();
      const bw = 420, bx = (VIEW_W - bw) / 2, by = VIEW_H - 44;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx - 4, by - 4, bw + 8, 22);
      ctx.fillStyle = '#5a1010';
      ctx.fillRect(bx, by, bw, 14);
      ctx.fillStyle = '#e83030';
      ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), 14);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd0d0';
      ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
      ctx.fillText('DRAGOMILÃO', VIEW_W / 2, by - 10);
      ctx.restore();
    }
  }

  function drawHeart(x, y, fill) {
    ctx.save();
    ctx.translate(x, y);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-14, -8, -2, -16, 0, -6);
      ctx.bezierCurveTo(2, -16, 14, -8, 0, 6);
      ctx.closePath();
    };
    ctx.scale(1.15, 1.15);
    path();
    ctx.fillStyle = 'rgba(30,10,20,0.75)';
    ctx.fill();
    if (fill > 0) {
      ctx.save();
      path(); ctx.clip();
      ctx.fillStyle = '#ff4060';
      ctx.fillRect(-14, -16, 28 * fill, 28);
      ctx.restore();
    }
    path();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
    ctx.restore();
  }

  function drawDeadOverlay() {
    ctx.save();
    ctx.globalAlpha = Math.min(1, deadTimer * 1.2) * 0.65;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = Math.min(1, deadTimer * 1.5);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff9060';
    ctx.font = 'bold 40px "Trebuchet MS", sans-serif';
    ctx.fillText('a fagulha apagou…', VIEW_W / 2, VIEW_H / 2);
    ctx.restore();
  }

  function drawVictory() {
    const t = engine.time;
    ctx.save();
    ctx.fillStyle = 'rgba(20,8,30,0.78)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd870';
    ctx.shadowColor = '#ff9000'; ctx.shadowBlur = 25;
    ctx.font = 'bold 52px "Trebuchet MS", sans-serif';
    ctx.fillText('LENDA ACESA!', VIEW_W / 2, 210 + Math.sin(t * 2) * 5);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = '26px "Trebuchet MS", sans-serif';
    ctx.fillText('o Dragomilão engoliu o próprio apetite', VIEW_W / 2, 270);
    ctx.fillStyle = '#ffd870';
    ctx.fillText('lumis coletadas: ' + engine.lumis, VIEW_W / 2, 320);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.4 * Math.sin(t * 3)) + ')';
    ctx.font = '20px "Trebuchet MS", sans-serif';
    ctx.fillText('ESPAÇO para reacender', VIEW_W / 2, 390);
    ctx.restore();
  }

  // ---------- redimensionamento ----------
  function resize() {
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    canvas.style.width = Math.floor(VIEW_W * scale) + 'px';
    canvas.style.height = Math.floor(VIEW_H * scale) + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // pausa de aba não vira teleporte
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
