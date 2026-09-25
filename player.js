// Fagulho: Lendas do Bosque — player.js: o Fagulho (física, combate e pintura em canvas).
window.FG = window.FG || {};

(function () {
  // ---------- constantes de movimento ----------
  const ACCEL = 2400;        // aceleração horizontal (px/s²)
  const FRICTION = 2000;     // atrito quando não há input (px/s²)
  const MAX_VX = 340;        // velocidade horizontal máxima
  const GRAVITY = 2200;      // gravidade (px/s²)
  const JUMP_VY = -720;      // impulso do pulo
  const COYOTE = 0.1;        // tempo de coyote após sair da borda
  const BUFFER = 0.12;       // buffer de input do pulo
  const GLIDE_FALL = 90;     // queda máxima planando (px/s)
  const GLIDE_TIME = 1.0;    // segundos de planagem por ida ao ar (recarrega no chão)
  const MAX_FALL = 1100;     // queda terminal normal
  const ATTACK_TIME = 0.22;  // duração da hitbox do soco
  const ATTACK_CD = 0.35;    // cooldown entre socos
  const KNOCKBACK = 260;     // empurrão horizontal ao levar dano
  // parede: agarrar de leve e saltar para escalar penhascos
  const WALL_SLIDE = 130;    // queda máxima agarrado na parede (px/s)
  const WALL_JUMP_VY = -690; // impulso vertical do salto de parede
  const WALL_JUMP_VX = 240;  // empurrão para longe da parede (baixo: dá para voltar a colar)
  const WALL_LOCK = 0.12;    // tempo sem poder voltar a colar na parede
  const WALL_COYOTE = 0.1;   // tolerância após desencostar

  // areia movediça: gravidade normal fica suspensa e vira uma "gravidade"
  // densa que puxa qualquer impulso de volta para o afundamento — cada
  // aperto de PULO (mash) dá o impulso normal de pulo (reaproveitado, ver
  // jumpsUsed resetado a cada frame lá embaixo), mas ele morre rápido se não
  // vier outro aperto logo atrás.
  const QUICKSAND_PULL = 3400;  // "gravidade" da areia (px/s²) — bem mais forte que a
                                 // normal, e mais forte que antes: puxa de volta rápido
                                 // demais pro mash sozinho vencer, precisa ser insistente
  const QUICKSAND_SINK = 150;   // velocidade terminal de afundamento sem apertar nada (px/s) —
                                 // rápido o bastante pra cobrar mash de verdade: sem apertar
                                 // nada, afunda até a falha bem antes de atravessar o poço
                                 // andando (ver simulação em level4.js/tests, poço de 540px)
  const QUICKSAND_JUMP_SCALE = 0.68; // cada aperto de pulo dentro da areia sobe menos que
                                      // um pulo normal — a areia PRENDE: escapar custa mais
                                      // apertos, não é só repetir o pulo de sempre mais rápido
  const QUICKSAND_FAIL_DEPTH = 130; // px afundados desde a entrada = falha (engine.js aplica dano/respawn)

  // ---------- pool de faíscas (sem alocação por frame) ----------
  const SPARKS = 28;
  const sparks = [];
  for (let i = 0; i < SPARKS; i++) sparks.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 2 });
  let sparkCursor = 0;

  function emitSpark(x, y, vx, vy, life, r) {
    const s = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % SPARKS;
    s.x = x; s.y = y; s.vx = vx; s.vy = vy;
    s.life = life; s.max = life; s.r = r;
  }

  // ---------- estado interno (não faz parte do contrato) ----------
  let coyoteTimer = 0;       // tempo desde que deixou o chão
  let jumpBuffer = 0;        // tempo restante do input buffer
  let jumpsUsed = 0;         // 0 no chão, 1 após 1º pulo, 2 após duplo
  let jumpCut = false;       // já cortou o pulo ao soltar o botão?
  let gliding = false;       // planando neste frame?
  let glideLeft = GLIDE_TIME; // crédito de planagem que ainda resta
  let attackTimer = 0;       // tempo restante da hitbox ativa
  let attackCooldown = 0;    // tempo até poder socar de novo
  let sparkAccum = 0;        // acumulador de emissão de faíscas
  let wallLock = 0;          // trava de input horizontal logo após saltar da parede
  let wallCoyote = 0;        // tempo restante para ainda contar como "na parede"
  let lastWallDir = 0;       // lado da última parede tocada (+1 direita, -1 esquerda)
  let clinging = false;      // agarrado na parede neste frame?
  let scrapeAccum = 0;       // acumulador de faíscas do atrito na parede
  // nado (só desenho — a física da água vive no update e não muda aqui)
  let swimBlend = 0;         // 0 em pé ↔ 1 deitado nadando (persegue inWater)
  let swimPhase = 0;         // fase acumulada da braçada (rápida subindo, lenta boiando)
  let bubbleAccum = 0;       // acumulador de bolhinhas saindo da boca

  // ---------- helpers de desenho do boneco (coordenadas locais, +x = frente) ----------
  // membro "mangueira de borracha": curva do ponto A ao B, sem cotovelo/joelho,
  // com uma barriga (bow) perpendicular para não parecer um palito rígido
  function limb(ctx, x0, y0, x1, y1, bow, width, color) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const mx = (x0 + x1) / 2 - (dy / len) * bow;
    const my = (y0 + y1) / 2 + (dx / len) * bow;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
  }

  // luva de boxe vermelha na ponta do braço; punching liga o rastro de fogo
  function gloveAt(ctx, x, y, r, punching, t) {
    ctx.save();
    if (punching) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ff9020';
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(x - i * 8, y + Math.sin(t * 40 + i) * 2, 7 - i, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = '#ff5030';
      ctx.shadowBlur = 10;
    }
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r + 1);
    g.addColorStop(0, '#ff7a60');
    g.addColorStop(0.6, '#e83424');
    g.addColorStop(1, '#a01808');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    // polegar
    ctx.beginPath();
    ctx.ellipse(x - r * 0.7, y + r * 0.45, r * 0.45, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // tênis escuro com sola clara e detalhe vermelho
  function sneaker(ctx, x, y, dir) {
    ctx.fillStyle = '#2c2a30';
    ctx.beginPath();
    ctx.ellipse(x + dir * 1.5, y - 2, 5.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(240,238,232,0.9)';
    ctx.fillRect(x - 4 + dir * 1.5, y - 0.5, 8, 1.6);
    ctx.fillStyle = '#e03030';
    ctx.beginPath();
    ctx.arc(x + dir * 3.5, y - 2.5, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  const player = {
    // ---------- campos do contrato ----------
    x: 0, y: 0, w: 30, h: 44,
    vx: 0, vy: 0,
    hp: 12, maxHp: 12,
    facing: 1,
    onGround: false,
    wallDir: 0,               // preenchido pelo engine: parede à direita (+1) / esquerda (-1)
    attackBox: { x: 0, y: 0, w: 34, h: 30, active: false },
    invuln: 0,
    // Pendurado num cipó: null quando livre. Quem escreve é o FG.obstacles —
    // enquanto não for null, é ELE que manda na posição, e este update pula
    // corrida, pulo, gravidade e colisão. O soco continua valendo, porque
    // dependurado ainda dá para socar quem vem.
    hang: null,
    // Passageiro de uma atração (hoje só a montanha-russa): null quando livre.
    // Mesmo contrato do hang — enquanto não for null, é o FG.obstacles dono
    // do objeto (ex. FG.obstacles's montanharussa) que escreve p.x/p.y todo
    // frame, e este update só mantém soco e timers vivos.
    ride: null,
    // Areia movediça: null quando fora. Enquanto dentro (ver FG.level.quicksand),
    // o afundamento é controlado por este mesmo update (ver update()) — quem
    // decide a falha (afundou demais) é o engine, olhando inQuicksand/qsEntryY.
    inQuicksand: false,
    qsEntryY: 0,

    // ---------- lógica ----------
    update(dt) {
      const input = FG.input;

      // ---------- passageiro de atração: mesmo tratamento do cipó ----------
      if (this.ride) {
        clinging = false; gliding = false;
        this.clinging = false;
        wallLock = 0; wallCoyote = 0; lastWallDir = 0; this.wallDir = 0;
        jumpsUsed = 0; jumpCut = false; jumpBuffer = 0; coyoteTimer = 0;
        this.jumpsUsed = 0; this.wallCoyote = 0;
        this.onGround = false;

        swimBlend += (0 - swimBlend) * Math.min(1, dt * 9);
        this.updateAttack(dt, input);
        if (this.invuln > 0) this.invuln -= dt;
        this.updateSparks(dt, false);
        return;
      }

      // ---------- dependurado: só o soco e os timers ----------
      if (this.hang) {
        // zera o que só faz sentido com física: senão, ao soltar, o player
        // herda um estado de parede ou de planagem que não existe mais.
        clinging = false; gliding = false;
        this.clinging = false;
        wallLock = 0; wallCoyote = 0; lastWallDir = 0; this.wallDir = 0;
        // solta com os dois pulos na mão — o cipó é um recomeço, não um castigo
        jumpsUsed = 0; jumpCut = false; jumpBuffer = 0; coyoteTimer = 0;
        this.jumpsUsed = 0; this.wallCoyote = 0;
        this.onGround = false;

        swimBlend += (0 - swimBlend) * Math.min(1, dt * 9);  // no cipó, sai da pose de nado
        this.updateAttack(dt, input);
        if (this.invuln > 0) this.invuln -= dt;
        this.updateSparks(dt, false);
        return;
      }

      // ---------- parede: quem está encostado e de que lado ----------
      // wallDir vem do moveAndCollide do frame anterior (1 frame de latência).
      if (this.wallDir && !this.onGround) { lastWallDir = this.wallDir; wallCoyote = WALL_COYOTE; }
      else if (wallCoyote > 0) wallCoyote -= dt;
      if (this.onGround) { wallCoyote = 0; lastWallDir = 0; }
      if (wallLock > 0) wallLock -= dt;

      // corrida: aceleração com input, atrito sem.
      // Durante o wallLock, o input de volta para a parede é ignorado — senão
      // o salto de parede morre colado nela e não se sobe penhasco nenhum.
      // Dentro da areia movediça (flag do frame anterior — a detecção em si
      // roda mais abaixo, mas um frame de atraso não muda nada em regime
      // permanente) a areia agarra o corpo inteiro, não só a queda: menos
      // aceleração, atrito bem mais forte e um teto de velocidade baixo —
      // reforça a sensação de estar PRESO, não só afundando.
      const naAreia = this.inQuicksand;
      let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (wallLock > 0 && dir === lastWallDir) dir = 0;
      if (dir !== 0) {
        this.vx += dir * (naAreia ? ACCEL * 0.35 : ACCEL) * dt;
        this.facing = dir;
      } else if (this.vx !== 0) {
        const drop = (naAreia ? FRICTION * 2.4 : FRICTION) * dt;
        if (Math.abs(this.vx) <= drop) this.vx = 0;
        else this.vx -= Math.sign(this.vx) * drop;
      }
      const vxCap = naAreia ? MAX_VX * 0.45 : MAX_VX;
      if (this.vx > vxCap) this.vx = vxCap;
      if (this.vx < -vxCap) this.vx = -vxCap;

      // agarrar: no ar, caindo, com parede do lado e empurrando contra ela
      const pushingWall = lastWallDir !== 0 && wallCoyote > 0 &&
        ((lastWallDir > 0 && input.right) || (lastWallDir < 0 && input.left));
      const wasClinging = clinging;
      clinging = !this.onGround && this.vy > 0 && pushingWall && wallLock <= 0;
      if (clinging) {
        this.facing = lastWallDir;    // olha para a parede em que se apoia
        jumpsUsed = 0;                // encostar devolve o pulo: dá para escalar
        glideLeft = GLIDE_TIME;       // e devolve o planar, pela mesma razão
        if (!wasClinging) FG.audio.sfx('wallgrab');
      }
      // espelhados para inspeção externa (testes/diagnóstico)
      this.clinging = clinging;
      this.jumpsUsed = jumpsUsed;
      this.wallCoyote = wallCoyote;

      // ---------- água mergulhável (FG.level.waters, opcional por fase) ----------
      // Dentro d'água a física troca: gravidade fraca (afunda devagar), segurar
      // PULO nada para cima, e os créditos de pulo/planagem ficam sempre cheios
      // — sair pela superfície com um pulo inteiro é o que faz a saída da água
      // nunca virar armadilha. O ponto testado é o meio do peito: os pés
      // molhados na beirada não contam como mergulho.
      let inWater = false;
      let waterTop = 0;   // linha da superfície da água em que está
      const _ws = FG.level.waters;
      if (_ws) {
        const wcx = this.x + this.w / 2, wcy = this.y + this.h * 0.55;
        for (let i = 0; i < _ws.length; i++) {
          const wz = _ws[i];
          if (wcx >= wz.x && wcx <= wz.x + wz.w && wcy >= wz.y && wcy <= wz.y + wz.h) {
            inWater = true;
            waterTop = wz.y;
            break;
          }
        }
      }
      if (inWater) {
        jumpsUsed = 0;
        glideLeft = GLIDE_TIME;
        coyoteTimer = 0;   // emergir conta como "chão fresco": o pulo sai na hora
      }
      this.inWater = inWater;

      // ---------- areia movediça (FG.level.quicksand, opcional por fase) ----------
      // Mesmo ponto testado da água (meio do peito): pés na beirada não contam
      // como ter entrado. jumpsUsed resetado a cada frame aqui dentro é o que
      // permite reaproveitar o pulo normal (mais abaixo) como o "mash" de
      // escapar — cada aperto dá o mesmo impulso de sempre, e a gravidade da
      // areia (ver bloco de física mais abaixo) puxa de volta rápido.
      let inQuicksand = false;
      const _qs = FG.level.quicksand;
      if (_qs) {
        const scx = this.x + this.w / 2, scy = this.y + this.h * 0.55;
        for (let i = 0; i < _qs.length; i++) {
          const qz = _qs[i];
          if (scx >= qz.x && scx <= qz.x + qz.w && scy >= qz.y && scy <= qz.y + qz.h) { inQuicksand = true; break; }
        }
      }
      if (inQuicksand && !this.inQuicksand) { this.qsEntryY = this.y; FG.audio.sfx('sinking'); }
      this.inQuicksand = inQuicksand;
      if (inQuicksand) { jumpsUsed = 0; glideLeft = GLIDE_TIME; coyoteTimer = 0; }

      // pose de nado: o blend persegue inWater (deita/levanta sem pular de pose)
      swimBlend += ((inWater ? 1 : 0) - swimBlend) * Math.min(1, dt * 9);
      if (inWater) {
        // braçada de crawl: gira rápido enquanto sobe nadando, lenta boiando
        swimPhase += dt * (this.vy < 0 ? 11 : 4.5);
        // bolhinhas ocasionais saindo da boca (cor da aura, o pool é o mesmo)
        bubbleAccum += dt * (this.vy < 0 ? 4 : 1.6);
        while (bubbleAccum >= 1) {
          bubbleAccum -= 1;
          emitSpark(
            this.x + this.w / 2 + this.facing * (10 + Math.random() * 6),
            this.y + 4 + Math.random() * 6,
            this.facing * (10 + Math.random() * 20),
            -50 - Math.random() * 60,
            0.35 + Math.random() * 0.3,
            1 + Math.random()
          );
        }
      } else bubbleAccum = 0;

      // timers de pulo
      if (!inWater) coyoteTimer = this.onGround ? 0 : coyoteTimer + dt;
      if (input.jumpPressed) jumpBuffer = BUFFER;
      else if (jumpBuffer > 0) jumpBuffer -= dt;

      // Salto de parede tem precedência sobre o pulo duplo, e vale sempre que
      // houver contato recente com a parede empurrando contra ela — não só
      // agarrado. Sem isso, apertar pulo um instante antes de reencostar gasta
      // o pulo do ar e a escalada despenca.
      const podeSaltarParede = !this.onGround && wallLock <= 0 &&
        lastWallDir !== 0 && wallCoyote > 0 && (clinging || pushingWall);

      // pulo: salto de parede, depois chão/coyote, depois duplo
      if (jumpBuffer > 0) {
        if (podeSaltarParede) {
          this.vy = WALL_JUMP_VY;
          this.vx = -lastWallDir * WALL_JUMP_VX;
          this.facing = -lastWallDir;
          wallLock = WALL_LOCK;
          clinging = false;
          jumpsUsed = 1;              // ainda sobra o pulo duplo no ar
          jumpBuffer = 0;
          // altura FIXA: escalar é tocar o botão em sequência, e o corte de
          // pulo transformaria cada salto num pulinho de 20px
          jumpCut = true;
          FG.audio.sfx('walljump');
          this.spawnBurst(7);
        } else if (jumpsUsed === 0 && (this.onGround || coyoteTimer <= COYOTE)) {
          // dentro da areia, cada aperto sobe menos que um pulo normal — é
          // isso que faz a areia PRENDER: precisa de mash de verdade, não só
          // repetir o pulo comum
          this.vy = inQuicksand ? JUMP_VY * QUICKSAND_JUMP_SCALE : JUMP_VY;
          jumpsUsed = 1; jumpBuffer = 0; jumpCut = false;
          FG.audio.sfx('jump');
          this.spawnBurst(4);
        } else if (jumpsUsed === 1) {
          this.vy = JUMP_VY;
          jumpsUsed = 2; jumpBuffer = 0; jumpCut = false;
          FG.audio.sfx('doublejump');
          this.spawnBurst(6);
        }
      }
      // pulo mais curto: soltou o botão subindo → corta vy pela metade
      if (!input.jump && this.vy < 0 && !jumpCut) {
        this.vy *= 0.5;
        jumpCut = true;
      }

      // planar: segurando jump, caindo, depois do pulo duplo — e por no MÁXIMO
      // GLIDE_TIME de voo. O crédito é gasto enquanto plana e só volta ao tocar
      // o chão ou agarrar a parede: sem isso, soltar e reapertar o botão daria
      // planagem infinita e todo vão do jogo viraria travessia de graça.
      const wantGlide = input.jump && !this.onGround && !clinging &&
        jumpsUsed >= 2 && this.vy > 0 && glideLeft > 0;
      if (wantGlide && !gliding) FG.audio.sfx('glide');
      gliding = wantGlide;
      if (gliding) glideLeft = Math.max(0, glideLeft - dt);
      this.glideLeft = glideLeft;   // espelhado para os testes e para o desenho

      // gravidade (limitada pelo planar ou pelo atrito na parede) — ou, dentro
      // d'água, o nado: segurar PULO sobe, soltar afunda devagar, tudo em
      // velocidades curtas para a água parecer densa e não um céu de cabeça
      // para baixo.
      if (inWater) {
        if (input.jump) this.vy -= 1500 * dt;   // braçada contínua para cima
        else this.vy += 520 * dt;               // afunda devagar
        // Perto da superfície o cap de subida NÃO se aplica: o pulo que o
        // coyote-de-água libera (vy -720) passa inteiro e o salto para a
        // margem sai de verdade. Sem esta exceção o cap de -280 engolia o
        // pulo e a saída da água virava um quicar infinito na linha d'água.
        const pertoDaSuperficie = (this.y + this.h * 0.55) < waterTop + 70;
        if (!pertoDaSuperficie && this.vy < -280) this.vy = -280;
        if (this.vy > 220) this.vy = 220;
        // a água também segura a corrida
        if (this.vx > 240) this.vx = 240;
        if (this.vx < -240) this.vx = -240;
        gliding = false;
        jumpCut = true;   // nado não é pulo: nada de corte de altura ao soltar
      } else if (inQuicksand) {
        // gravidade normal suspensa: o impulso do pulo (aplicado acima, igual
        // ao pulo em terra firme) já deu a subida deste frame — aqui só cabe
        // puxar de volta rápido para o afundamento, até bater no teto de
        // velocidade terminal quando não há impulso nenhum brigando contra.
        this.vy += QUICKSAND_PULL * dt;
        if (this.vy > QUICKSAND_SINK) this.vy = QUICKSAND_SINK;
        gliding = false;
      } else {
        this.vy += GRAVITY * dt;
        const cap = clinging ? WALL_SLIDE : (gliding ? GLIDE_FALL : MAX_FALL);
        if (this.vy > cap) this.vy = cap;
      }

      // faíscas do atrito ao escorregar na parede
      if (clinging) {
        scrapeAccum += dt * 22;
        while (scrapeAccum >= 1) {
          scrapeAccum -= 1;
          emitSpark(
            this.x + (lastWallDir > 0 ? this.w : 0),
            this.y + this.h * (0.3 + Math.random() * 0.6),
            -lastWallDir * (30 + Math.random() * 60),
            -20 - Math.random() * 60,
            0.3 + Math.random() * 0.25,
            1.5 + Math.random()
          );
        }
      } else scrapeAccum = 0;

      this.updateAttack(dt, input);

      // física + colisão (o engine seta onGround)
      FG.engine.moveAndCollide(this, dt);
      if (this.onGround) { jumpsUsed = 0; jumpCut = false; gliding = false; glideLeft = GLIDE_TIME; }

      // invulnerabilidade pós-dano
      if (this.invuln > 0) this.invuln -= dt;

      this.updateSparks(dt, true);
    },

    // Soco — extraído do update porque dependurado no cipó ele continua
    // valendo, e é a única coisa daquele bloco que continua.
    updateAttack(dt, input) {
      if (attackCooldown > 0) attackCooldown -= dt;
      if (input.attackPressed && attackCooldown <= 0) {
        attackTimer = ATTACK_TIME;
        attackCooldown = ATTACK_CD;
        FG.audio.sfx('punch');
      }
      if (attackTimer > 0) attackTimer -= dt;
      const box = this.attackBox;
      box.active = attackTimer > 0;
      if (box.active) {
        box.x = this.facing > 0 ? this.x + this.w : this.x - box.w;
        box.y = this.y + this.h / 2 - box.h / 2;
      }
    },

    // Faíscas da aura. `emitir` desliga só a emissão (dependurado ele não
    // rasteja faísca pelo chão), mas o pool continua integrando: as faíscas
    // que já estavam no ar precisam terminar de cair.
    updateSparks(dt, emitir) {
      if (emitir) {
        const running = this.onGround && Math.abs(this.vx) > 60;
        sparkAccum += dt * (running ? 14 : (!this.onGround ? 6 : 2));
        while (sparkAccum >= 1) {
          sparkAccum -= 1;
          emitSpark(
            this.x + this.w / 2 + (Math.random() - 0.5) * this.w,
            this.y + this.h - 6 + Math.random() * 6,
            -this.vx * 0.15 + (Math.random() - 0.5) * 40,
            20 + Math.random() * 60,
            0.35 + Math.random() * 0.3,
            1.5 + Math.random() * 1.5
          );
        }
      }
      // integra o pool inteiro (barato, tamanho fixo)
      for (let i = 0; i < SPARKS; i++) {
        const s = sparks[i];
        if (s.life <= 0) continue;
        s.life -= dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 300 * dt;
      }
    },

    // rajada de faíscas (pulos, dano)
    spawnBurst(n) {
      for (let i = 0; i < n; i++) {
        emitSpark(
          this.x + this.w / 2 + (Math.random() - 0.5) * this.w,
          this.y + this.h - 4,
          (Math.random() - 0.5) * 180,
          -60 - Math.random() * 120,
          0.4 + Math.random() * 0.3,
          2 + Math.random() * 1.5
        );
      }
    },

    hurt(dmg, fromX) {
      // passageiro de uma atração (ex. montanha-russa): imune por enquanto
      // durar o passeio — não faz sentido levar dano de espinho/trovão numa
      // cutscene onde o jogador não tem controle nenhum sobre a posição.
      if (this.ride) return;
      if (this.invuln > 0) return;
      this.hp -= dmg;
      this.invuln = 1.2;
      // knockback na direção oposta à origem do dano
      const away = (this.x + this.w / 2) < fromX ? -1 : 1;
      this.vx = away * KNOCKBACK;
      this.vy = -300;
      FG.audio.sfx('hurt');
      this.spawnBurst(8);
      if (this.hp <= 0) FG.engine.setState('dead');
    },

    respawn(x, y) {
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.hp = this.maxHp;
      this.invuln = 0;
      this.onGround = false;
      this.hang = null;         // nunca renascer ainda pendurado num cipó
      this.ride = null;         // nem no meio de um passeio de atração
      this.attackBox.active = false;
      coyoteTimer = 0; jumpBuffer = 0; jumpsUsed = 0; jumpCut = false;
      gliding = false; glideLeft = GLIDE_TIME; attackTimer = 0; attackCooldown = 0;
      wallLock = 0; wallCoyote = 0; lastWallDir = 0; clinging = false; scrapeAccum = 0;
      swimBlend = 0; swimPhase = 0; bubbleAccum = 0; this.inWater = false;
      this.inQuicksand = false; this.qsEntryY = 0;
      this.wallDir = 0;
      for (let i = 0; i < SPARKS; i++) sparks[i].life = 0;
    },

    // ---------- pintura ----------
    draw(ctx, cam) {
      const t = FG.engine.time;

      // faíscas primeiro (ficam atrás do corpo)
      ctx.save();
      for (let i = 0; i < SPARKS; i++) {
        const s = sparks[i];
        if (s.life <= 0) continue;
        const a = s.life / s.max;
        ctx.globalAlpha = a * 0.85;
        ctx.fillStyle = a > 0.5 ? '#ffd860' : '#ff7030';
        ctx.beginPath();
        ctx.arc(s.x - cam.x, s.y - cam.y, s.r * a + 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // dano: pisca alternando visibilidade
      if (this.invuln > 0 && Math.floor(t * 16) % 2 === 0) return;

      const cx = this.x + this.w / 2 - cam.x;
      const bottom = this.y + this.h - cam.y;
      const running = this.onGround && Math.abs(this.vx) > 60;

      // esticar/achatar conforme o estado
      let sx = 1, sy = 1;
      if (!this.onGround) {
        if (clinging) { sx = 0.94; sy = 1.06; }                  // colado na parede
        else if (gliding) { sx = 1.08; sy = 0.94; }              // aberto, flutuando
        else if (this.vy < 0) { sx = 0.9; sy = 1.12; }           // subindo: estica
        else { sx = 0.96; sy = 1.04; }                           // caindo
      } else if (running) {
        sy = 1 + Math.sin(t * 14) * 0.05;                        // bomba no ritmo
        sx = 1 / sy;
      } else {
        sy = 1 + Math.sin(t * 2.2) * 0.03;                       // respira parado
        sx = 1 / sy;
      }
      const tilt = running ? this.facing * 0.12 : 0;             // inclina na corrida

      // ---- boneco: cabeça da foto + corpo desenhado ----
      // Estereótipo criança: cabeça GRANDE (40% da altura), tronco curto,
      // braços e pernas compridos e finos, estilo "mangueira de borracha".
      const img = FG.assets && FG.assets.heitorHead;
      const SH = 60;                                             // altura visual (hitbox segue 30×44)
      const HEAD_H = 24;
      const HEAD_W = HEAD_H * (FG.assets ? FG.assets.headRatio : 0.7);
      const SKIN = '#d9a67e';                                    // pele (pernas)
      const COAT = '#1c1a20';                                    // casaco preto
      const COAT2 = '#16141a';                                   // manga de trás, mais escura

      // nadando: o esticar/achatar de ar não combina com o corpo deitado
      sx += (1 - sx) * swimBlend;
      sy += (1 - sy) * swimBlend;

      ctx.save();
      ctx.translate(cx, bottom);
      ctx.rotate(tilt);
      ctx.scale(this.facing * sx, sy);                           // espelha pelo facing; +x = frente

      // ---- pose de nado: corpo deitado, barriga para baixo ----
      // Gira o boneco inteiro em torno do meio do corpo. No espaço local já
      // espelhado, +x é a frente: rodar ~90° põe a cabeça na direção do facing
      // e a barriga (lado das luvas) para baixo. O swimBlend faz o deitar e o
      // levantar serem contínuos, e o seno dá a ondulação leve de quem nada.
      if (swimBlend > 0.001) {
        const wob = Math.sin(t * 3.2) * 0.065 * swimBlend;       // ±3.7° de gingado
        ctx.translate(0, -SH * 0.45);
        ctx.rotate(swimBlend * 1.38 + wob);                      // ~79°: deitado, nariz um tico pra baixo
        ctx.translate(0, SH * 0.45);
      }

      const stride = Math.min(1, Math.abs(this.vx) / MAX_VX);
      const phase = t * 14;                                      // sincronizado com a "bomba" do sy
      const swing = Math.sin(phase) * 10 * stride;

      // ---- pés: posição por estado ----
      let f1x, f1y, f2x, f2y;                                    // 1 = perna da frente, 2 = de trás
      if (!this.onGround) {
        if (this.hang) {                                         // pendurado: pernas soltas balançando
          const sw = Math.sin(t * 2.4) * 3;
          f1x = 3 + sw; f1y = 2;
          f2x = -3 + sw; f2y = 3;
        } else if (clinging) {                                   // pés apoiados na parede
          f1x = 8; f1y = -14;
          f2x = 6; f2y = -2;
        } else if (gliding) {                                    // balançam pendurados
          f1x = 4 + Math.sin(t * 3) * 2; f1y = -5;
          f2x = -3 - Math.sin(t * 3) * 2; f2y = -3;
        } else if (this.vy < 0) { f1x = 5; f1y = -9; f2x = -4; f2y = -3; }  // subindo: encolhe
        else { f1x = 6; f1y = -2; f2x = -6; f2y = -6; }                     // caindo: abre
      } else if (stride > 0.15) {                                // corrida: passada larga
        f1x = swing; f1y = -Math.max(0, Math.sin(phase)) * 5 * stride;
        f2x = -swing; f2y = -Math.max(0, -Math.sin(phase)) * 5 * stride;
      } else {                                                   // parado: base de boxe
        f1x = 5; f1y = 0; f2x = -4.5; f2y = 0;
      }

      // nadando: pernas esticadas para trás batendo tesourinha. Com o corpo
      // deitado, o eixo local x virou o vertical do mundo — a oscilação em x
      // é o bater de pés para cima/baixo, alternado entre as duas pernas.
      if (swimBlend > 0.001) {
        const kick = Math.sin(t * 9) * 4.5 * swimBlend;
        f1x += (( 2.5 + kick) - f1x) * swimBlend;
        f1y += (-1 - f1y) * swimBlend;
        f2x += ((-2.5 - kick) - f2x) * swimBlend;
        f2y += (-3 - f2y) * swimBlend;
      }

      // ---- pernas compridas (quadril em -20) + tênis ----
      limb(ctx, -2.5, -20, f2x, f2y - 2, -2.5, 3.8, SKIN);       // perna de trás
      sneaker(ctx, f2x, f2y, -1);
      limb(ctx, 2.5, -20, f1x, f1y - 2, 3, 4, SKIN);             // perna da frente
      sneaker(ctx, f1x, f1y, 1);

      // ---- shorts bege + tronco de casaco preto (curto) ----
      ctx.fillStyle = '#e8dcc0';
      ctx.beginPath();
      ctx.ellipse(0, -21, 7, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = '#ff8000';                               // aura de fagulha no corpo
      ctx.shadowBlur = 9;
      ctx.fillStyle = COAT;
      ctx.beginPath();
      ctx.ellipse(0, -30, 7.5, 7.5, 0, 0, Math.PI * 2);          // peito
      ctx.fill();
      ctx.fillRect(-7, -30, 14, 7);                              // barriga do casaco
      ctx.restore();
      ctx.strokeStyle = '#4a4650';                               // zíper
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(1, -35);
      ctx.lineTo(1, -24);
      ctx.stroke();

      // ---- cabeça da foto (grande, leve bob próprio) ----
      const headBob = this.onGround && stride > 0.15 ? Math.sin(phase * 2) * 0.8 : 0;
      ctx.save();
      ctx.shadowColor = '#ff8000';
      ctx.shadowBlur = 10;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 1 - HEAD_W / 2, -SH + headBob, HEAD_W, HEAD_H);
      } else {
        // foto ainda decodificando: rosto simples de reserva
        ctx.fillStyle = SKIN;
        ctx.beginPath();
        ctx.arc(1, -SH + HEAD_H / 2, HEAD_H / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a1a10';                               // franja
        ctx.beginPath();
        ctx.arc(1, -SH + HEAD_H / 2, HEAD_H / 2, Math.PI * 1.05, Math.PI * 1.95);
        ctx.fill();
      }
      ctx.restore();

      // ---- braços compridos + luvas de boxe ----
      const punching = this.attackBox.active;
      let gF, gB;                                                // luva da frente / de trás
      if (punching) {
        // a luva da frente vai até a hitbox do golpe (braço estica de verdade)
        const box = this.attackBox;
        gF = {
          x: this.facing * ((box.x + box.w / 2) - (this.x + this.w / 2)) + 2,
          y: (box.y + box.h / 2) - (this.y + this.h),
        };
        gB = { x: 2, y: -28 };                                   // a outra protege o queixo
      } else if (this.hang) {
        // dependurado no cipó: as duas luvas para cima, agarradas na corda,
        // e o corpo balançando por baixo delas
        gF = { x: 5, y: -58 };
        gB = { x: -6, y: -58 };
      } else if (clinging) {
        // uma luva firma em cima na parede, a outra escora embaixo
        gF = { x: 11, y: -46 };
        gB = { x: 9, y: -24 };
      } else if (gliding) {
        gF = { x: 15, y: -34 + Math.sin(t * 3) * 2 };            // abertos como asas
        gB = { x: -14, y: -34 - Math.sin(t * 3) * 2 };
      } else if (!this.onGround) {
        gF = { x: 12, y: -48 }; gB = { x: -10, y: -50 };         // braços pro alto, ao lado da cabeça
      } else if (stride > 0.15) {
        gF = { x: 7 - swing * 0.5, y: -28 + Math.cos(phase) * 2 };  // bombeiam na corrida
        gB = { x: 3 + swing * 0.5, y: -27 - Math.cos(phase) * 2 };
      } else {
        const bob = Math.sin(t * 2.2) * 1.2;                     // guarda de boxe, respirando
        gF = { x: 10, y: -31 + bob };
        gB = { x: 4, y: -27 + bob * 0.7 };
      }

      // nadando: braçada de crawl — cada luva gira em círculo contínuo em
      // torno do ombro, meia-volta defasada da outra (swimPhase acelera no
      // update quando ele está subindo com o botão de pulo). O soco continua
      // mandando na luva da frente: o braço do golpe interrompe a braçada.
      if (swimBlend > 0.001 && !punching) {
        gF.x += ((4.5 + Math.cos(swimPhase) * 13) - gF.x) * swimBlend;
        gF.y += ((-33 + Math.sin(swimPhase) * 11) - gF.y) * swimBlend;
        gB.x += ((-4.5 + Math.cos(swimPhase + Math.PI) * 12) - gB.x) * swimBlend;
        gB.y += ((-33 + Math.sin(swimPhase + Math.PI) * 10) - gB.y) * swimBlend;
      } else if (swimBlend > 0.001) {
        // socando: só o braço de trás segue remando
        gB.x += ((-4.5 + Math.cos(swimPhase + Math.PI) * 12) - gB.x) * swimBlend;
        gB.y += ((-33 + Math.sin(swimPhase + Math.PI) * 10) - gB.y) * swimBlend;
      }
      limb(ctx, -4.5, -33, gB.x, gB.y, -3, 3.8, COAT2);          // braço de trás
      gloveAt(ctx, gB.x, gB.y, 4.8, false, t);
      limb(ctx, 4.5, -33, gF.x, gF.y, 4, 4.2, COAT);             // braço da frente
      gloveAt(ctx, gF.x, gF.y, punching ? 6.5 : 5.2, punching, t);

      // ---- planando: hélice de fogo girando sobre a cabeça ----
      if (gliding) {
        ctx.save();
        ctx.translate(0, -SH - 4);
        ctx.rotate(t * 22);
        ctx.fillStyle = 'rgba(255,200,80,0.85)';
        ctx.shadowColor = '#ffb000';
        ctx.shadowBlur = 10;
        for (let i = 0; i < 3; i++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.beginPath();
          ctx.ellipse(11, 0, 12, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = '#fff0b0';
        ctx.beginPath(); ctx.arc(0, -SH - 4, 3.5, 0, Math.PI * 2); ctx.fill();
      }

      ctx.restore();
    },
  };

  // exposto para o engine, que decide a falha (afundou demais) fora daqui —
  // mesmo padrão da queda no vazio, olhando um campo do player.
  player.QUICKSAND_FAIL_DEPTH = QUICKSAND_FAIL_DEPTH;

  FG.player = player;
})();
