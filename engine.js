// Fagulho: Lendas do Bosque — engine: loop, input, câmera, colisão, HUD, estados.
window.FG = window.FG || {};

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VIEW_W = canvas.width, VIEW_H = canvas.height;

  // ---------- input ----------
  const input = {
    left: false, right: false, down: false, jump: false, attack: false, interact: false,
    jumpPressed: false, attackPressed: false, interactPressed: false,
  };
  FG.input = input;

  const KEYS = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    down: ['ArrowDown', 'KeyS'],
    jump: ['Space', 'KeyZ', 'ArrowUp', 'KeyW'],
    attack: ['KeyX', 'KeyK'],
    interact: ['KeyE', 'KeyF'],
  };
  const keyToAction = {};
  for (const action in KEYS) for (const code of KEYS[action]) keyToAction[code] = action;

  const pressBuffer = { jump: false, attack: false, interact: false };

  // Senha do "Pular Fase" no menu de pausa: o próprio #pularSenhaInput
  // (definido mais abaixo) é a ÚNICA fonte de verdade do que foi digitado —
  // nada de buffer paralelo. Backspace e digitação normal já funcionam
  // sozinhos porque é um <input> de verdade e de fato focado; confirmarSenhaPular
  // lê senhaInput.value direto na hora do Enter/toque em "Confirmar".
  const SENHA_PULAR = '%Baleia302%';
  let senhaErro = false;

  // Um único caminho de entrada para teclado e toque: quem manda ação é sempre
  // daqui para baixo, então o touch.js não precisa saber nada de pressBuffer
  // nem das transições de estado das telas.
  function setAction(action, down) {
    if (!(action in input)) return;
    if (!down) { input[action] = false; return; }
    if (!input[action]) {
      if (action === 'jump') pressBuffer.jump = true;
      if (action === 'attack') pressBuffer.attack = true;
      if (action === 'interact') pressBuffer.interact = true;
    }
    input[action] = true;
    if (engine.state === 'menu' && (action === 'jump' || action === 'attack')) startGame();
    else if (engine.state === 'victory' && action === 'jump') startGame();
    else if (engine.state === 'fase' && action === 'jump') nextLevel();
  }

  // Todo gesto do usuário passa por aqui: o iOS só deixa o AudioContext sair de
  // 'suspended' dentro de um handler de gesto, e ele volta a suspender sozinho
  // (troca de app, chamada, botão de silencioso) — por isso init() a cada
  // gesto, e não só no primeiro. init() é idempotente e barato.
  function gesture() { FG.audio.init(); }

  window.addEventListener('keydown', (e) => {
    // Com o popup de senha aberto, o #pularSenhaInput está focado de verdade:
    // nada de action key aqui pode chamar preventDefault (KeyA vira "esquerda"
    // e bloquearia o "a" de "Baleia" chegando no campo), então a digitação
    // normal sai deste bloco antes de tocar no funil de ações do jogo.
    if (engine.state === 'pularSenha') {
      if (e.code === 'Escape') { e.preventDefault(); engine.cancelPularSenha(); }
      else if (e.code === 'Enter') { e.preventDefault(); engine.confirmarSenhaPular(); }
      // qualquer outra tecla (letras, dígitos, %, Backspace) cai sozinha no
      // <input> focado — é ele quem guarda o valor, não um buffer à parte
      return;
    }

    const action = keyToAction[e.code];
    if (action) e.preventDefault();
    gesture();
    if (action) setAction(action, true);

    if (e.code === 'Escape') {
      if (engine.state === 'playing') engine.togglePause();
      else if (engine.state === 'paused') engine.resumeGame();
    } else if (engine.state === 'paused') {
      if (e.code === 'Digit1') engine.resumeGame();
      else if (e.code === 'Digit2') engine.requestSkipFase();
      else if (e.code === 'Digit3') engine.quitToMenu();
    }
  });
  window.addEventListener('keyup', (e) => {
    const action = keyToAction[e.code];
    if (action) setAction(action, false);
  });

  // Campo escondido do popup de senha: iPad não tem teclado físico, então o
  // keydown acima nunca dispara lá — só um <input> de verdade focado por um
  // toque genuíno abre o teclado do iOS sobre o canvas. Cobre só a caixinha
  // de pontinhos (SENHA_INPUT_BOX), não o card inteiro — sobra espaço pro
  // botão "Confirmar" ser de fato tocável, e não engolido pelo input.
  const senhaInput = document.getElementById('pularSenhaInput');
  if (senhaInput) {
    senhaInput.addEventListener('input', () => { senhaErro = false; });
  }
  // Alinha o campo escondido em cima da caixinha de pontinhos na tela
  // (coordenadas de canvas -> coordenadas de página, via getBoundingClientRect,
  // o mesmo cálculo que resize() já faz para a escala do canvas). Chamado ao
  // entrar em 'pularSenha' e a cada resize/giro, senão desalinha do popup.
  function posicionarSenhaInput() {
    if (!senhaInput) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const s = rect.width / VIEW_W;
    const c = SENHA_INPUT_BOX;
    senhaInput.style.left = (rect.left + c.x * s) + 'px';
    senhaInput.style.top = (rect.top + c.y * s) + 'px';
    senhaInput.style.width = (c.w * s) + 'px';
    senhaInput.style.height = (c.h * s) + 'px';
  }

  // ---------- helpers ----------
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Integra posição e resolve contra FG.level.solids, eixo a eixo.
  // Além de e.onGround, publica e.wallDir: +1 se travou numa parede à direita,
  // -1 se à esquerda, 0 se livre — é o que sustenta a escalada de penhasco.
  function moveAndCollide(e, dt) {
    const solids = FG.level.solids;
    e.wallDir = 0;
    e.x += e.vx * dt;
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (!rectsOverlap(e, s)) continue;
      if (e.vx > 0) { e.x = s.x - e.w; e.wallDir = 1; }
      else if (e.vx < 0) { e.x = s.x + s.w; e.wallDir = -1; }
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
    // Zoom da câmera: 1 = normal. Quem pede um zoom-out (ex. o topo da roda-
    // gigante em FG.obstacles) só escreve camZoomTarget — updateCamera faz a
    // interpolação suave e o draw() aplica o ctx.scale.
    camZoom: 1,
    camZoomTarget: 1,
    state: 'menu',
    time: 0,
    lumis: 0,
    levelIndex: 0,               // fase corrente dentro de FG.levels
    checkpoint: { x: 0, y: 0 },
    rectsOverlap, moveAndCollide,
    setAction, gesture,
    addLumi(n) { engine.lumis += (n || 1); },
    setState(s) {
      // Chefão derrotado com fase na fila não é vitória do JOGO, é fim de fase.
      // Os chefões não sabem em que fase vivem — quem sabe é aqui, e é por isso
      // que a decisão mora no setState e não em cada um deles.
      if (s === 'victory' && FG.levels && engine.levelIndex < FG.levels.length - 1) s = 'fase';
      engine.state = s;
      // #pularSenhaInput só aceita toque em 'pularSenha' — fora dali não pode
      // roubar nenhum gesto do jogo (ver ehPularSenhaInput em touch.js).
      if (senhaInput) {
        senhaInput.style.pointerEvents = (s === 'pularSenha') ? 'auto' : 'none';
        if (s === 'pularSenha') {
          senhaErro = false;
          senhaInput.value = '';
          posicionarSenhaInput();
          senhaInput.focus();
        } else {
          senhaInput.value = '';
          senhaInput.blur();
        }
      }
      if (s === 'fase') faseTimer = 0;
      if (s === 'dead') {
        deadTimer = 0;
        FG.audio.sfx('death');
        FG.audio.music(null);
      } else if (s === 'victory' || s === 'fase') {
        FG.audio.music(null);
      }
    },
  };
  FG.engine = engine;

  let deadTimer = 0;
  let arenaLocked = false;
  let playStart = 0;   // engine.time em que a partida começou (fade do tooltip)
  let faseTimer = 0;   // animação da tela de fase completa

  // ---------- sólidos vivos = geometria fixa + plataformas móveis ----------
  // FG.level.solids passa a ser um array mantido aqui: a base imutável do nível
  // mais o que FG.obstacles estiver movendo neste frame. Assim a colisão de
  // plataforma móvel sai de graça para player e inimigos.
  let baseSolids = null;
  const liveSolids = [];

  function syncSolids() {
    if (!baseSolids) return;
    liveSolids.length = 0;
    for (let i = 0; i < baseSolids.length; i++) liveSolids.push(baseSolids[i]);
    const movers = FG.obstacles && FG.obstacles.movers;
    if (movers) for (let i = 0; i < movers.length; i++) liveSolids.push(movers[i]);
    FG.level.solids = liveSolids;
  }

  // A base de sólidos é POR FASE: guardá-la uma vez só (como era com um nível
  // único) faria a fase 2 colidir com a geometria da fase 1.
  function captureBaseSolids() {
    baseSolids = FG.level.solids.slice();
  }

  // ---------- fases ----------
  // FG.levels é preenchido no load pelos level*.js, na ordem do index.html.
  // FG.level é sempre a fase corrente, e quem a troca é só esta função.
  function loadLevel(i) {
    engine.levelIndex = i;
    FG.level = FG.levels[i];
    baseSolids = null;
    captureBaseSolids();
    FG.level.reset();
    engine.checkpoint = { x: FG.level.playerStart.x, y: FG.level.playerStart.y };
    FG.player.respawn(FG.level.playerStart.x, FG.level.playerStart.y);
    if (FG.obstacles) FG.obstacles.reset();
    syncSolids();
    FG.enemies.reset();
    arenaLocked = false;
    engine.camZoom = 1; engine.camZoomTarget = 1;
    // Atalho de teste (?chefe=1): pinga o jogador em cima do gatilho do
    // chefão, bem acima do chão, e deixa a gravidade normal do jogo assentar
    // — sem isso testar um chefão exige atravessar a fase inteira toda vez.
    if (chefeInicial()) {
      FG.player.x = FG.level.bossTriggerX + 10;
      FG.player.y = -200;
      FG.player.vx = 0;
      FG.player.vy = 0;
      engine.checkpoint = { x: FG.player.x, y: FG.player.y };
      engine.cam.x = Math.max(0, Math.min(FG.player.x + FG.player.w / 2 - VIEW_W / 2, FG.level.W - VIEW_W));
    }
    // câmera direto no lugar: um lerp desde a fase anterior atravessaria o
    // mundo inteiro em cima do jogador
    engine.cam.x = Math.max(0, Math.min(FG.player.x + FG.player.w / 2 - VIEW_W / 2, FG.level.W - VIEW_W));
    engine.cam.y = Math.max(0, Math.min(FG.player.y + FG.player.h / 2 - VIEW_H / 2, FG.level.H - VIEW_H));
    engine.setState('playing');
    FG.audio.music(FG.level.musica || 'overworld');
  }

  // Atalho de teste: abrir index.html?fase=N começa direto na fase N
  // (1-based, como o HUD mostra). Sem o parâmetro, fase 1 como sempre.
  function faseInicial() {
    try {
      if (typeof location === 'undefined') return 0;
      const q = new URLSearchParams(location.search).get('fase');
      if (!q) return 0;
      const n = (parseInt(q, 10) || 1) - 1;
      return Math.max(0, Math.min(FG.levels.length - 1, n));
    } catch (e) { return 0; }
  }

  // Atalho de teste: ?chefe=1 junto de ?fase=N já solta o jogador em cima do
  // gatilho do chefão daquela fase, sem precisar atravessá-la de novo.
  function chefeInicial() {
    try {
      if (typeof location === 'undefined') return false;
      return new URLSearchParams(location.search).get('chefe') === '1';
    } catch (e) { return false; }
  }

  function startGame() {
    playStart = engine.time;
    engine.lumis = 0;       // as lumis só zeram em jogo novo; entre fases acumulam
    loadLevel(faseInicial());
    FG.audio.sfx('select');
  }

  function nextLevel() {
    const i = engine.levelIndex + 1;
    if (i >= FG.levels.length) { startGame(); return; }
    loadLevel(i);
    FG.audio.sfx('select');
  }

  // Menu de pausa: único funil de transição para as 3 ações, usado tanto
  // pelo keydown (Escape/1/2/3) quanto pelos toques do touch.js — nenhum dos
  // dois deve saber de setState/nextLevel por conta própria.
  function pauseGame() {
    // solta o que estava segurado: sem isto o Heitor continua andando/socando
    // um frame depois de retomar, porque o dedo/tecla nunca soltou de verdade.
    input.left = input.right = input.down = input.jump = input.attack = input.interact = false;
    engine.setState('paused');
  }
  function resumeGame() { engine.setState('playing'); }
  function skipFase() { nextLevel(); }
  function quitToMenu() { FG.audio.music(null); engine.setState('menu'); }
  function togglePause() {
    if (engine.state === 'playing') pauseGame();
    else if (engine.state === 'paused') resumeGame();
  }
  // "Pular Fase" é a única opção do menu de pausa que pede senha (cheat de
  // debug) — Continuar/Sair continuam instantâneos. requestSkipFase só abre
  // o popup; confirmarSenhaPular lê o valor do #pularSenhaInput na hora do
  // Enter/toque em "Confirmar" — só ele chama skipFase() de verdade.
  function requestSkipFase() { engine.setState('pularSenha'); }
  function cancelPularSenha() { engine.setState('paused'); }
  function confirmarSenhaPular() {
    if (!senhaInput) return;
    if (senhaInput.value === SENHA_PULAR) { senhaInput.value = ''; skipFase(); }
    else { senhaInput.value = ''; senhaErro = true; senhaInput.focus(); }
  }
  engine.togglePause = togglePause;
  engine.resumeGame = resumeGame;
  engine.skipFase = skipFase;
  engine.quitToMenu = quitToMenu;
  engine.requestSkipFase = requestSkipFase;
  engine.cancelPularSenha = cancelPularSenha;
  engine.confirmarSenhaPular = confirmarSenhaPular;

  function respawnFromCheckpoint() {
    FG.player.respawn(engine.checkpoint.x, engine.checkpoint.y);
    if (FG.obstacles) FG.obstacles.reset();
    syncSolids();
    FG.enemies.reset();
    arenaLocked = false;
    engine.camZoom = 1; engine.camZoomTarget = 1;
    engine.setState('playing');
    FG.audio.music(FG.level.musica || 'overworld');
  }

  // ---------- update ----------
  function update(dt) {
    engine.time += dt;
    input.jumpPressed = pressBuffer.jump; pressBuffer.jump = false;
    input.attackPressed = pressBuffer.attack; pressBuffer.attack = false;
    input.interactPressed = pressBuffer.interact; pressBuffer.interact = false;

    if (engine.state === 'playing') {
      const p = FG.player;
      FG.level.update(dt);
      // obstáculos primeiro: movem as plataformas e arrastam quem está em cima;
      // syncSolids deixa a colisão do frame já com as peças na posição nova
      if (FG.obstacles) FG.obstacles.update(dt);
      syncSolids();
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
      // gatilho e tranca da arena do boss: sempre entra com os 6 corações
      // cheios, e o checkpoint vira este ponto — morrer no chefão reinicia
      // direto nele, sem voltar nada da fase.
      const boss = FG.enemies.boss;
      if (!boss.started && p.x > FG.level.bossTriggerX) {
        boss.start();
        FG.enemies.clearRegulares(); // luta é só do chefão, sem bicho comum sobrando na arena
        p.hp = p.maxHp;
        engine.checkpoint = { x: p.x, y: p.y };
      }
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
    } else if (engine.state === 'fase') {
      faseTimer += dt;
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

    // zoom: mesma suavização independente de fps, mais lenta pra ficar
    // perceptível (o zoom-out do topo da roda-gigante precisa DAR pra ver)
    const zk = 1 - Math.pow(0.02, dt);
    engine.camZoom += (engine.camZoomTarget - engine.camZoom) * zk;
  }

  // ---------- draw ----------
  function draw() {
    const cam = engine.cam;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    if (engine.state === 'menu') { drawMenu(); drawTouch(); return; }

    // zoom-out (roda-gigante): escala tudo em torno do centro da tela, com a
    // câmera ainda mandando na posição — é só uma lente, o mundo continua no
    // mesmo lugar. HUD e overlays ficam FORA disto, sempre em tamanho normal.
    const zoom = engine.camZoom;
    const zoomed = Math.abs(zoom - 1) > 0.001;
    if (zoomed) {
      ctx.save();
      ctx.translate(VIEW_W / 2, VIEW_H / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-VIEW_W / 2, -VIEW_H / 2);
    }
    FG.level.drawBack(ctx, cam);
    FG.level.drawSolids(ctx, cam);
    if (FG.obstacles) FG.obstacles.drawBehind(ctx, cam);
    FG.enemies.draw(ctx, cam);
    FG.player.draw(ctx, cam);
    if (FG.obstacles) FG.obstacles.drawFront(ctx, cam);
    FG.level.drawFront(ctx, cam);
    if (zoomed) ctx.restore();

    drawHUD();
    if (engine.state === 'playing' && FG.obstacles && FG.obstacles.activePrompt) {
      drawInteractPrompt(FG.obstacles.activePrompt.text);
    }

    if (engine.state === 'dead') drawDeadOverlay();
    if (engine.state === 'fase') drawFaseCompleta();
    if (engine.state === 'victory') drawVictory();
    if (engine.state === 'paused') drawPausedOverlay();
    if (engine.state === 'pularSenha') drawPularSenhaOverlay();
    drawTouch();
  }

  // Prompt de interação genérico ("aperte E para..."/"toque em AÇÃO para...")
  // — reaproveita painel()/botao() e fica sempre fixo na tela (nunca sob o
  // zoom da câmera), pertinho de baixo, pra não brigar com o HUD de cima.
  function drawInteractPrompt(texto) {
    const w = Math.min(560, 60 + texto.length * 11), h = 44;
    const x = VIEW_W / 2 - w / 2, y = VIEW_H - 92;
    ctx.save();
    painel(x, y, w, h, 'rgba(20,10,30,0.78)', 'rgba(255,190,90,0.8)');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe8b0';
    ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
    ctx.fillText(botao('aperte E para ' + texto, 'toque em AÇÃO para ' + texto),
                 x + w / 2, y + h / 2 + 6);
    ctx.restore();
  }

  // Os botões de toque são desenhados por último, por cima de tudo (inclusive
  // das telas de fase/vitória), porque é por eles que se sai dessas telas.
  function drawTouch() {
    if (FG.touch && FG.touch.active) FG.touch.draw(ctx);
  }

  // Em qualquer texto de tela: no toque não existe ESPAÇO.
  function botao(tecla, toque) {
    return (FG.touch && FG.touch.active) ? toque : tecla;
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
    ctx.fillText('RAYHECTOR', VIEW_W / 2, 200 + Math.sin(t * 1.5) * 6);
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffe8b0';
    ctx.font = 'bold 28px "Trebuchet MS", sans-serif';
    ctx.fillText('As Aventuras do Menino-gênio', VIEW_W / 2, 248 + Math.sin(t * 1.5) * 6);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.6 + 0.4 * Math.sin(t * 3)) + ')';
    ctx.font = '22px "Trebuchet MS", sans-serif';
    ctx.fillText(botao('aperte ESPAÇO para acender a lenda',
                       'toque em PULO para acender a lenda'), VIEW_W / 2, 360);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '16px "Trebuchet MS", sans-serif';
    ctx.fillText(botao('setas / WASD para mover · ESPAÇO pula (2x; segure para planar) · X soca',
                       '◀ ▶ para mover · PULO pula (2x; segure para planar) · SOCO soca'),
                 VIEW_W / 2, 400);
    ctx.restore();
  }

  // Botão de pausa visível, sempre no ar durante o jogo — geometria também
  // usada pelo touch.js para o hit-test (ver PAUSE_BTN em touch.js), já que
  // não existe canal para os dois arquivos combinarem coordenadas em runtime.
  function drawPauseButton() {
    const x = VIEW_W / 2, y = 26, r = 19;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(x, y - 6, 2, x, y, r);
    g.addColorStop(0, 'rgba(60,32,80,0.7)'); g.addColorStop(1, 'rgba(24,12,36,0.6)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,190,90,0.7)';
    ctx.stroke();
    ctx.fillStyle = '#ffd870';
    ctx.fillRect(x - 6, y - 8, 4, 16);
    ctx.fillRect(x + 2, y - 8, 4, 16);
    ctx.restore();
  }

  // Painel arredondado genérico (roundRect com fallback pra rect, igual ao
  // TIP de drawControls) — base visual compartilhada pelos popups de pausa e
  // de senha, pra não duplicar a mesma sequência de beginPath/fill/stroke.
  function painel(x, y, w, h, fill, stroke) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 14);
    else ctx.rect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  // Tela de pausa: o mundo continua desenhado por baixo (nada anima porque
  // update() pula os estados 'paused'/'pularSenha'), com um painel central
  // (gradiente plum + borda âmbar + filete interno, igual ao vocabulário de
  // drawDeadOverlay/drawFaseCompleta) e as 3 opções como botões de verdade —
  // fundo, borda e um acento colorido, não só texto flutuando. Geometria
  // também usada pelo touch.js para o hit-test (PAUSE_ITEMS/PAUSE_BTN_*) —
  // mexeu aqui, mexe lá.
  const PAUSE_CARD = { x: VIEW_W / 2 - 190, y: 90, w: 380, h: 330 };
  const PAUSE_BTN_W = 300, PAUSE_BTN_H = 54;
  const PAUSE_ITENS = [
    { y: 222, label: 'Continuar', tecla: '1', cor: '#8fe89a', acao: 'resumeGame' },
    { y: 294, label: 'Pular Fase', tecla: '2', cor: '#ffd870', acao: 'requestSkipFase' },
    { y: 366, label: 'Sair', tecla: '3', cor: '#ff8a80', acao: 'quitToMenu' },
  ];
  function drawPausedOverlay() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const c = PAUSE_CARD;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
    const g = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
    g.addColorStop(0, '#2a1445'); g.addColorStop(1, '#1a1030');
    painel(c.x, c.y, c.w, c.h, g, 'rgba(255,190,90,0.55)');
    ctx.restore();
    // filete interno mais fino: moldura dupla, sem depender de imagem nenhuma
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(c.x + 6, c.y + 6, c.w - 12, c.h - 12, 10);
    else ctx.rect(c.x + 6, c.y + 6, c.w - 12, c.h - 12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd870';
    ctx.shadowColor = '#ff9000'; ctx.shadowBlur = 20;
    ctx.font = 'bold 38px "Trebuchet MS", sans-serif';
    ctx.fillText('PAUSADO', VIEW_W / 2, c.y + 55);
    ctx.shadowBlur = 0;

    for (let i = 0; i < PAUSE_ITENS.length; i++) {
      const it = PAUSE_ITENS[i];
      const bx = VIEW_W / 2 - PAUSE_BTN_W / 2, by = it.y - PAUSE_BTN_H / 2;
      painel(bx, by, PAUSE_BTN_W, PAUSE_BTN_H, 'rgba(255,255,255,0.06)', 'rgba(255,190,90,0.35)');
      // acento colorido à esquerda: o "ícone" de cada botão, sem depender de glifo
      ctx.fillStyle = it.cor;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx + 10, by + 10, 8, PAUSE_BTN_H - 20, 4);
      else ctx.rect(bx + 10, by + 10, 8, PAUSE_BTN_H - 20);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.font = 'bold 24px "Trebuchet MS", sans-serif';
      ctx.fillText(it.label, bx + 32, it.y + 8);

      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '18px "Trebuchet MS", sans-serif';
      ctx.fillText(botao(it.tecla, ''), bx + PAUSE_BTN_W - 16, it.y + 6);
    }
    ctx.textAlign = 'center';
    ctx.restore();
  }

  // Popup pequeno de senha — só o "Pular Fase" pede, o resto do menu de
  // pausa continua livre. Mesmo vocabulário do painel de pausa, em tamanho
  // reduzido. Os pontinhos vêm do próprio #pularSenhaInput.value (fonte única
  // de verdade, ver confirmarSenhaPular). Três geometrias, todas duplicadas em
  // touch.js pro hit-test — mexeu aqui, mexe lá:
  //   SENHA_CARD        — área do painel inteiro; toque fora dela cancela.
  //   SENHA_INPUT_BOX    — só a caixinha de pontinhos; é onde o <input> de
  //                        verdade fica posicionado (posicionarSenhaInput).
  //   SENHA_CONFIRM_BTN  — botão "Confirmar"; tocar nele chama confirmarSenhaPular.
  const SENHA_CARD = { x: VIEW_W / 2 - 220, y: 170, w: 440, h: 220 };
  const SENHA_INPUT_BOX = { x: VIEW_W / 2 - 130, y: SENHA_CARD.y + 90, w: 260, h: 40 };
  const SENHA_CONFIRM_BTN = { x: VIEW_W / 2 - 110, y: SENHA_CARD.y + 140, w: 220, h: 42 };
  function drawPularSenhaOverlay() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const c = SENHA_CARD;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
    const g = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
    g.addColorStop(0, '#2a1445'); g.addColorStop(1, '#1a1030');
    painel(c.x, c.y, c.w, c.h, g, 'rgba(255,190,90,0.55)');
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd870';
    ctx.shadowColor = '#ff9000'; ctx.shadowBlur = 16;
    ctx.font = 'bold 26px "Trebuchet MS", sans-serif';
    ctx.fillText('PULAR FASE', VIEW_W / 2, c.y + 44);
    ctx.shadowBlur = 0;

    ctx.fillStyle = senhaErro ? '#ff8a80' : 'rgba(255,255,255,0.75)';
    ctx.font = '16px "Trebuchet MS", sans-serif';
    ctx.fillText(senhaErro ? 'senha errada — tente de novo'
                            : botao('digite a senha', 'toque aqui e digite a senha'),
                 VIEW_W / 2, c.y + 74);

    const b = SENHA_INPUT_BOX;
    const dots = senhaInput ? Math.min(senhaInput.value.length, SENHA_PULAR.length) : 0;
    painel(b.x, b.y, b.w, b.h, 'rgba(0,0,0,0.3)', 'rgba(255,190,90,0.4)');
    ctx.fillStyle = '#ffe8b0';
    ctx.font = 'bold 22px "Trebuchet MS", sans-serif';
    let pontos = '';
    for (let i = 0; i < dots; i++) pontos += '•';
    ctx.fillText(pontos || ' ', VIEW_W / 2, b.y + b.h / 2 + 7);

    const cb = SENHA_CONFIRM_BTN;
    painel(cb.x, cb.y, cb.w, cb.h, 'rgba(143,232,154,0.16)', 'rgba(143,232,154,0.6)');
    ctx.fillStyle = '#c8f7c5';
    ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
    ctx.fillText(botao('Confirmar (Enter)', 'Confirmar'), VIEW_W / 2, cb.y + cb.h / 2 + 7);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px "Trebuchet MS", sans-serif';
    ctx.fillText(botao('ESC cancela', 'toque fora do painel cancela'), VIEW_W / 2, c.y + c.h - 16);
    ctx.restore();
  }

  function drawHUD() {
    if (engine.state === 'playing') drawPauseButton();
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
    drawMudo();
    drawControls();
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
      ctx.fillText(boss.nome || 'CHEFÃO', VIEW_W / 2, by - 10);
      ctx.restore();
    }
    // nome da fase, discreto, no canto de baixo à esquerda
    if (FG.level && FG.level.nome) {
      ctx.save();
      ctx.textAlign = 'left';
      ctx.font = '13px "Trebuchet MS", sans-serif';
      ctx.fillStyle = 'rgba(255,240,210,0.5)';
      ctx.fillText((engine.levelIndex + 1) + '/' + FG.levels.length + '  ' + FG.level.nome, 22, VIEW_H - 16);
      ctx.restore();
    }
  }

  // Tooltip de comandos, no canto superior direito logo abaixo das lumis.
  // Fica sempre visível (é o que ensina o pulo duplo e a planagem), mas
  // esmaece um pouco depois dos primeiros segundos para não roubar a cena.
  const CONTROLS_TECLADO = [
    { key: '← →', desc: 'correr' },
    { key: 'ESPAÇO', desc: 'pular' },
    { key: 'ESPAÇO ×2', desc: 'pulo duplo' },
    { key: 'segurar ESPAÇO', desc: 'planar' },
    { key: '→ na parede', desc: 'agarrar' },
    { key: 'ESPAÇO na parede', desc: 'escalar' },
    { key: 'X', desc: 'socar' },
  ];
  // No toque o quadro ensina os mesmos truques com os nomes dos botões da tela.
  const CONTROLS_TOQUE = [
    { key: '◀ ▶', desc: 'correr' },
    { key: 'PULO', desc: 'pular' },
    { key: 'PULO ×2', desc: 'pulo duplo' },
    { key: 'segurar PULO', desc: 'planar' },
    { key: '▶ na parede', desc: 'agarrar' },
    { key: 'PULO na parede', desc: 'escalar' },
    { key: 'SOCO', desc: 'socar' },
  ];
  const TIP = { x: VIEW_W - 226, y: 58, w: 206, rowH: 21, padY: 12 };

  function drawControls() {
    const lista = (FG.touch && FG.touch.active) ? CONTROLS_TOQUE : CONTROLS_TECLADO;
    const h = TIP.padY * 2 + lista.length * TIP.rowH;
    // esmaece de 1 para 0.55 entre 8s e 12s DEPOIS de começar a jogar
    const elapsed = engine.time - playStart;
    const fade = Math.max(0.55, Math.min(1, 1 - (elapsed - 8) / 4 * 0.45));
    ctx.save();
    ctx.globalAlpha = fade;

    // caixa arredondada com borda âmbar
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(TIP.x, TIP.y, TIP.w, h, 10);
    else ctx.rect(TIP.x, TIP.y, TIP.w, h);
    ctx.fillStyle = 'rgba(24,12,36,0.62)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,190,90,0.4)';
    ctx.stroke();

    for (let i = 0; i < lista.length; i++) {
      const y = TIP.y + TIP.padY + i * TIP.rowH + 14;
      ctx.textAlign = 'left';
      ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
      ctx.fillStyle = '#ffd870';
      ctx.fillText(lista[i].key, TIP.x + 12, y);
      ctx.textAlign = 'right';
      ctx.font = '13px "Trebuchet MS", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.fillText(lista[i].desc, TIP.x + TIP.w - 12, y);
    }
    ctx.restore();
  }

  // Alto-falante cortado, ao lado das lumis, enquanto o WebAudio não estiver
  // tocando. Só aparece quando o contexto NÃO está em 'running' — ou seja,
  // quando o áudio de fato não destravou. Se o jogo estiver mudo e este ícone
  // não estiver aqui, o som está saindo do navegador e quem cortou foi o
  // aparelho: no iPhone, o botão de silencioso ou o volume.
  function drawMudo() {
    if (!FG.audio || !FG.audio.ativo || FG.audio.ativo()) return;
    const x = VIEW_W - 152, y = 34;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ffd0c0';
    ctx.beginPath();               // caixinha + cone do alto-falante
    ctx.moveTo(x - 8, y - 3); ctx.lineTo(x - 4, y - 3); ctx.lineTo(x + 1, y - 8);
    ctx.lineTo(x + 1, y + 8); ctx.lineTo(x - 4, y + 3); ctx.lineTo(x - 8, y + 3);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2;             // o corte
    ctx.strokeStyle = '#ff6050';
    ctx.beginPath();
    ctx.moveTo(x + 4, y - 6); ctx.lineTo(x + 12, y + 6);
    ctx.moveTo(x + 12, y - 6); ctx.lineTo(x + 4, y + 6);
    ctx.stroke();
    ctx.restore();
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

  // Fim de fase (não de jogo): mostra a que caiu, a que vem, e as lumis
  // acumuladas — que atravessam as fases e só zeram em jogo novo.
  function drawFaseCompleta() {
    const t = engine.time;
    const k = Math.min(1, faseTimer * 1.6);
    const atual = FG.levels[engine.levelIndex];
    const proxima = FG.levels[engine.levelIndex + 1];
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(14,8,22,0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';

    ctx.fillStyle = '#ffd870';
    ctx.shadowColor = '#ff9000'; ctx.shadowBlur = 25;
    ctx.font = 'bold 46px "Trebuchet MS", sans-serif';
    ctx.fillText('FASE COMPLETA', VIEW_W / 2, 170 + Math.sin(t * 2) * 4);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '24px "Trebuchet MS", sans-serif';
    ctx.fillText(atual.nome, VIEW_W / 2, 218);

    ctx.fillStyle = '#ffd870';
    ctx.font = '22px "Trebuchet MS", sans-serif';
    ctx.fillText('lumis até aqui: ' + engine.lumis, VIEW_W / 2, 274);

    if (proxima) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '16px "Trebuchet MS", sans-serif';
      ctx.fillText('a seguir', VIEW_W / 2, 330);
      ctx.fillStyle = '#ffb830';
      ctx.font = 'bold 30px "Trebuchet MS", sans-serif';
      ctx.fillText(proxima.nome, VIEW_W / 2, 364);
    }

    ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.4 * Math.sin(t * 3)) + ')';
    ctx.font = '20px "Trebuchet MS", sans-serif';
    ctx.fillText(botao('ESPAÇO para seguir', 'toque em PULO para seguir'), VIEW_W / 2, 432);
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
    ctx.fillText('parque, pântano, mansão e coliseu — os quatro vencidos', VIEW_W / 2, 270);
    ctx.fillStyle = '#ffd870';
    ctx.fillText('lumis coletadas: ' + engine.lumis, VIEW_W / 2, 320);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.4 * Math.sin(t * 3)) + ')';
    ctx.font = '20px "Trebuchet MS", sans-serif';
    ctx.fillText(botao('ESPAÇO para reacender', 'toque em PULO para reacender'), VIEW_W / 2, 390);
    ctx.restore();
  }

  // ---------- redimensionamento ----------
  // No Safari do iOS a janela muda de tamanho sozinha (barra de endereço que
  // some ao rolar, teclado, giro do aparelho) e o innerHeight só é confiável
  // depois que a mudança assenta — daí o visualViewport quando existe e o
  // reajuste atrasado no orientationchange, que dispara ANTES do layout girar.
  function resize() {
    const vv = window.visualViewport;
    const w = (vv && vv.width) || window.innerWidth;
    const h = (vv && vv.height) || window.innerHeight;
    const scale = Math.min(w / VIEW_W, h / VIEW_H);
    canvas.style.width = Math.floor(VIEW_W * scale) + 'px';
    canvas.style.height = Math.floor(VIEW_H * scale) + 'px';
    // giro/redimensionamento com o popup de senha aberto não pode desalinhar
    // o <input> escondido do painel visível por baixo dele
    if (engine.state === 'pularSenha') posicionarSenhaInput();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => {
    resize();
    setTimeout(resize, 300);
  });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  // ?chefe=1 pula até o toque no menu: começa sozinho, já em cima do gatilho
  // do chefão (ver chefeInicial() dentro de loadLevel).
  if (chefeInicial()) startGame();

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
