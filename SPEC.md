# Fagulho: Lendas do Bosque — especificação técnica

Jogo de plataforma 2D em HTML5 canvas, inspirado no visual exuberante de Rayman
Legends (SEM usar personagens, nomes ou arte da Ubisoft — tudo original).
Sem build, sem dependências, roda por `file://`. Canvas interno **960×540**,
escalado por CSS para caber na janela.

## Personagens e tema

- **Fagulho** — o herói: uma fagulha viva, corpo-chama laranja/amarelo com
  olhos grandes, sem braços desenhados (mãos-brasas flutuantes), topete de fogo.
  Corre, pula duplo, plana (topete vira hélice) e dá soco com a mão-brasa.
- **Lumis** — orbes douradas flutuantes que se coletam (equivalente aos lums).
- **Inimigos** do bosque encantado: `espinhoco` (lagarta espinhosa que patrulha),
  `voadeira` (mariposa que voa em senoide), `sapeca` (sapo que pula em arcos).
- **Chefão: Dragomilão** — bocarra gigante de dragão vermelho que domina a arena
  final (como a capa que inspirou o jogo): mandíbula enorme, dentes tortos,
  olhos esbugalhados, penas/escamas vermelhas.

## Arquivos e quem os escreve

| arquivo      | conteúdo |
|--------------|----------|
| `index.html` | shell, carrega scripts na ordem: audio.js, level.js, player.js, enemies.js, engine.js |
| `engine.js`  | loop, input, câmera, colisão, estados de jogo, HUD, menu/vitória (JÁ ESCRITO — ler antes de codar) |
| `player.js`  | `FG.player` |
| `level.js`   | `FG.level` |
| `enemies.js` | `FG.enemies` (inclui o boss) |
| `audio.js`   | `FG.audio` (WebAudio procedural, zero assets) |

Namespace global único: `window.FG = window.FG || {}`. Cada arquivo só adiciona
a sua chave. **Nenhum arquivo referencia outro no load** (só dentro de funções
chamadas em runtime), porque a ordem de load não garante nada além do engine
ser o último.

## Contratos (obrigatórios, exatamente estes nomes)

### FG.engine (fornecido)

- `FG.engine.state` — `'menu' | 'playing' | 'dead' | 'victory'`
- `FG.engine.setState(s)`
- `FG.engine.cam` — `{x, y}` topo-esquerda da câmera em px do mundo
- `FG.engine.time` — segundos desde o início (float, sempre crescente)
- `FG.engine.moveAndCollide(e, dt)` — integra `e.x/e.y` por `e.vx/e.vy`,
  resolve contra `FG.level.solids`, zera velocidade no eixo bloqueado e seta
  `e.onGround` (true só se apoiado neste frame). `e` precisa de `x,y,w,h,vx,vy`.
- `FG.engine.rectsOverlap(a, b)` — AABB `{x,y,w,h}`
- `FG.engine.addLumi()` — incrementa contador do HUD (o level chama ao coletar)
- `FG.engine.lumis` — total coletado (leitura)
- `FG.engine.checkpoint` — `{x,y}` do último checkpoint ativado (leitura)

### FG.input (fornecido pelo engine)

`{ left, right, down, jump, attack }` booleans (segurando) e
`{ jumpPressed, attackPressed }` (borda de subida, válido só no frame).

### FG.player (player.js)

- Campos: `x, y, w, h, vx, vy, hp, maxHp (=6, meio coração = 1), facing (±1),
  onGround, attackBox` (`{x,y,w,h,active}` — ativo só durante o golpe),
  `invuln` (segundos restantes de invulnerabilidade pós-dano).
- `update(dt)` — lê `FG.input`, física via `FG.engine.moveAndCollide`.
  Movimento: correr (aceleração + atrito), pulo com coyote-time (~0.1s) e
  input-buffer (~0.12s), **pulo duplo**, **planar** segurando jump no ar
  (queda lenta, após o duplo), soco (0.22s de hitbox à frente, cooldown 0.35s).
  Gravidade ~2200 px/s², pulo ~-720 px/s, velocidade máx ~340 px/s.
- `draw(ctx, cam)` — desenha o Fagulho em canvas puro (formas + gradientes +
  glow), animado por `FG.engine.time` (corrida bombeia, chama tremula, hélice
  ao planar). Nada de sprites externos.
- `hurt(dmg, fromX)` — aplica dano se `invuln <= 0`, knockback na direção
  oposta a `fromX`, seta `invuln = 1.2`, chama `FG.audio.sfx('hurt')`.
  Se `hp <= 0` chama `FG.engine.setState('dead')`.
- `respawn(x, y)` — reposiciona, `hp = maxHp`, zera velocidades.

### FG.level (level.js)

- `W, H` — mundo em px: **W = 7200, H = 720** (câmera clampa nisso).
- `playerStart` — `{x, y}`
- `solids` — array `{x,y,w,h}` (chão, plataformas; TODAS sólidas dos 4 lados)
- `hazards` — array `{x,y,w,h}` (espinhos/poça venenosa — 1 de dano)
- `checkpoints` — array `{x,y}` (3 ao longo do nível)
- `lumis` — gerado internamente; coleta é do level: no `update`, se o player
  encosta, some com brilho, `FG.engine.addLumi()` + `FG.audio.sfx('lumi')`.
- `enemyDefs` — array `{type:'espinhoco'|'voadeira'|'sapeca', x, y, range?}`
  (~12 inimigos espalhados)
- `bossTriggerX` — x que dispara o boss (perto do fim)
- `arena` — `{x, w}` limites da arena do boss (o engine tranca a câmera/player)
- `goal` — nada: vencer = matar o boss.
- `update(dt)` — anima lumis, coleta, partículas ambiente.
- `drawBack(ctx, cam)` — céu + 3 camadas de parallax pintadas (bosque
  encantado: árvores retorcidas, cogumelos gigantes, raios de luz, vagalumes).
  Estilo pintura vibrante: gradientes, glow, silhuetas — nada de tile quadrado.
- `drawSolids(ctx, cam)` — plataformas orgânicas (topo com musgo/grama, corpo
  de terra/raiz), hazards visíveis (espinhos).
- `drawFront(ctx, cam)` — camada de primeiro plano (folhagens escuras nas
  bordas, vinheta leve) para profundidade.
- Layout: ~7200px com ritmo: tutorial → plataformas sobre poço venenoso →
  subida vertical → descida com voadeiras → clareira do boss no fim.
  Culling: só desenhar o que está a até ~1 tela da câmera.

### FG.enemies (enemies.js)

- `list` — array de inimigos vivos
- `reset()` — repovoa `list` a partir de `FG.level.enemyDefs` e re-arma o boss
  (chamado pelo engine ao respawnar e ao iniciar o jogo)
- `update(dt)` — IA de cada tipo; contato com player → `FG.player.hurt(1, ex)`;
  se `FG.player.attackBox.active` sobrepõe → inimigo morre (pufe de fumaça +
  `FG.audio.sfx('hitEnemy')`); pulo em cima (vy>0 vindo de cima) → morre e
  player quica (`FG.player.vy = -420`).
- `draw(ctx, cam)` — canvas puro, mesmo estilo pintado, com culling.
- `boss` — objeto:
  - `started, active, hp, maxHp (=12)`
  - `start()` — intro (rugido, `FG.audio.sfx('bossRoar')`, música
    `FG.audio.music('boss')`), depois `active = true`
  - `reset()` — volta ao estado inicial (não iniciado)
  - máquina de estados INÉDITA, mínimo 4 ataques ciclando com telegraph:
    1. **Bocanhada** — a bocarra avança da direita e fecha; telegraph: recua e
       abre devagar. Depois fica 2s com o **olho** exposto (janela de dano —
       soco ou pulo no olho tira 1).
    2. **Cuspe de fogo** — 3 projéteis em arco que deixam poça breve no chão.
    3. **Rugido** — onda de choque rasteira que atravessa a arena (pular).
    4. **Chuva de dentes** — dentes caem do alto em posições telegrafadas por
       sombras (a partir de hp <= 6, fica mais denso).
  - `hp <= 0` → morte cinematográfica (treme, engole a própria língua, some em
    partículas douradas), `FG.audio.sfx('victory')`, `FG.engine.setState('victory')`.
  - `draw` — a bocarra ocupa a metade direita da arena: mandíbulas serrilhadas,
    língua, olhos esbugalhados (um é o ponto fraco e brilha na janela de dano),
    plumagem vermelha. Barra de HP é o engine que desenha.

### FG.audio (audio.js)

- Tudo WebAudio procedural (osciladores/ruído), zero arquivos.
- `init()` — cria/resume o AudioContext (engine chama no primeiro gesto).
- `sfx(name)` — `'jump','doublejump','glide','punch','hitEnemy','hurt','lumi',
  'checkpoint','death','bossRoar','bossHit','bossSpit','victory','select'`.
  Nomes desconhecidos: silêncio, sem throw.
- `music(name)` — `'overworld' | 'boss' | null` (para). Loops agendados por
  scheduler (lookahead ~0.1s): overworld = tema saltitante em maior (melodia +
  baixo + percussão de ruído); boss = tema tenso em menor, mais rápido.
  Trocar de música faz fade curto. Chamar com o mesmo nome não reinicia.
- Volumes comedidos (master ~0.5), nada de clipping.

## Regras de estilo

- Visual "pintado": gradientes, sombras, glow (`shadowBlur` com parcimônia —
  cachear em offscreen canvas o que for caro), paleta quente e saturada.
- Todo texto do jogo em português.
- `ctx.save()/restore()` sempre que mexer em transform/alpha/shadow.
- 60fps: nada de alocar arrays/objetos grandes por frame; culling sempre.
