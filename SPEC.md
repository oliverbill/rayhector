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
- **Três fases**, cada uma 7200x720 e terminando num chefão próprio:
  `bosque` (Dragão Escarlate) → `pantano` (O Lodão) → `vulcao` (O Coração
  de Magma). O dragão vem de um sprite embutido em `assets.js` (640x444); os
  outros dois são canvas puro.

## Arquivos e quem os escreve

| arquivo      | conteúdo |
|--------------|----------|
| `index.html` | shell, carrega na ordem: assets.js, audio.js, level.js, obstacles.js, player.js, enemies.js, engine.js, touch.js |
| `obstacles.js` | `FG.obstacles` — perigos e plataformas dinâmicas do cenário |
| `engine.js`  | loop, input, câmera, colisão, estados de jogo, HUD, menu/vitória (JÁ ESCRITO — ler antes de codar) |
| `player.js`  | `FG.player` |
| `level.js`   | `FG.level` |
| `levelkit.js` | `FG.levelkit` — ferramentas comuns às fases |
| `level2.js` `level3.js` | fases 2 e 3; empurram em `FG.levels` como o `level.js` |
| `enemies.js` | `FG.enemies` — bichos comuns, registro de chefões e `fx` |
| `boss1/2/3.js` | um chefão por arquivo; registram-se via `FG.enemies.registerBoss` |
| `audio.js`   | `FG.audio` (WebAudio procedural, zero assets) |
| `touch.js`   | `FG.touch` — controles de toque; carrega **depois** do engine |

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

- `FG.engine.setAction(action, down)` — porta única de entrada do input:
  `action` é uma chave de `FG.input`, `down` é o estado do botão. Cuida da
  borda de subida (`jumpPressed`/`attackPressed`) e das transições de tela
  (menu/fase/vitória). Teclado e toque passam os dois por aqui.
- `FG.engine.gesture()` — avisa que houve gesto do usuário; destrava o áudio.
  O iOS só sai de `suspended` dentro do handler do gesto, e volta a suspender
  sozinho, então chame a cada gesto (é idempotente), não só no primeiro.

### FG.input (fornecido pelo engine)

`{ left, right, down, jump, attack }` booleans (segurando) e
`{ jumpPressed, attackPressed }` (borda de subida, válido só no frame).

### FG.touch (touch.js)

- `FG.touch.active` — leitura. `true` em aparelho de ponteiro grosso (celular,
  tablet) já no load, ou depois do primeiro toque em qualquer outro. Quem
  escreve texto de tela troca a legenda por ele (não existe ESPAÇO no toque).
- `FG.touch.draw(ctx)` — desenha os botões em coordenadas do canvas (960×540).
  O engine chama por último, por cima de tudo, inclusive das telas de fase e
  vitória — é por esses botões que se sai delas.
- Os botões são pintados no canvas, não em DOM: assim acompanham de graça o
  letterbox e a escala. A conversão dedo → jogo sai de um único
  `getBoundingClientRect` do canvas, e o estado é **recalculado do zero** a
  cada evento a partir de `e.touches` — é o que faz arrastar o dedo entre os
  botões e soltar dois de uma vez caírem certo.

### FG.player (player.js)

- Campos: `x, y, w, h, vx, vy, hp, maxHp (=6, meio coração = 1), facing (±1),
  onGround, wallDir` (parede colada: +1 direita, −1 esquerda, 0 livre — o engine
  preenche em `moveAndCollide`), `attackBox` (`{x,y,w,h,active}` — ativo só
  durante o golpe), `invuln` (segundos de invulnerabilidade pós-dano).
- **Escalada de penhasco**: no ar, caindo, empurrando contra a parede, o player
  se agarra — a queda cai para 130 px/s e o pulo é devolvido. Saltar agarrado
  dá impulso para cima e para longe (com 0.15s sem poder voltar a colar), então
  dá para subir uma parede alta alternando agarrar → saltar. Vale planar de
  novo depois de soltar.
- `update(dt)` — lê `FG.input`, física via `FG.engine.moveAndCollide`.
  Movimento: correr (aceleração + atrito), pulo com coyote-time (~0.1s) e
  input-buffer (~0.12s), **pulo duplo**, **planar** segurando jump no ar
  (queda lenta, após o duplo), soco (0.22s de hitbox à frente, cooldown 0.35s).
  Gravidade ~2200 px/s², pulo ~-720 px/s, velocidade máx ~340 px/s.
  Planar tem crédito de **1s por ida ao ar** (`GLIDE_TIME`), gasto só enquanto
  plana e recarregado ao tocar o chão ou agarrar a parede — soltar e reapertar
  o botão não renova nada. `tests/reach.js` espelha esse limite; se ele mudar
  aqui, tem de mudar lá, senão o teste passa a dar por alcançável um vão que a
  planagem só cobre se durar para sempre.
- `draw(ctx, cam)` — desenha o herói como boneco articulado no estereótipo
  criança de desenho: cabeça GRANDE (foto real, `FG.assets.heitorHead`,
  embutida em base64 no `assets.js`, carregado antes de todos), tronco curto
  de casaco preto e **braços e pernas compridos e finos** estilo mangueira de
  borracha (curvas sem cotovelo/joelho), terminando em luvas de boxe
  vermelhas e tênis. Poses por estado: guarda de boxe parado, passada larga
  com braços bombeando na corrida, braços pro alto no pulo, abertos como asas
  ao planar (com hélice de fogo sobre a cabeça); no soco o braço da frente
  estica até a `attackBox` com rastro de fogo. Espelhado pelo `facing`,
  squash/stretch por transformação, pisca no invuln, aura de fagulha.
  Fallback: rosto simples enquanto a foto não decodificou.
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
- `enemyDefs` — array `{type, x, y, range?}` (~12 inimigos espalhados). Tipos
  comuns: `espinhoco`, `voadeira`, `sapeca` (bosque) e os próprios de cada
  fase depois dela — entre eles `aranha` (caverna: ancorada no teto por um fio,
  desce em quem passa por baixo; `y` é a altura da ancoragem) e `morcego`
  (caverna: dorme no teto e acorda em voo perseguindo o jogador).
- `obstacleDefs` — array com os obstáculos dinâmicos (ver `FG.obstacles`).
- **Sem cogumelos-plataforma**: eram repetitivos demais. O relevo agora se faz
  de penhascos escaláveis (paredes altas), patamares em vários níveis, bocas de
  caverna, saliências estreitas e ilhas flutuantes de pedra.
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

### FG.obstacles (obstacles.js)

Perigos e plataformas dinâmicas — é o que dá ritmo ao nível (o terreno parado
só faz o chão). O engine chama `reset()`, `update(dt)` e os dois `draw`.

- `reset()` — repovoa tudo a partir de `FG.level.obstacleDefs`.
- `update(dt)` — move as peças e resolve efeito sobre `FG.player`.
- `drawBehind(ctx, cam)` / `drawFront(ctx, cam)` — antes e depois do player.
- `movers` — array de plataformas móveis vivas. **O engine injeta essas
  plataformas em `FG.level.solids` enquanto existem**, então a colisão sai de
  graça; o obstáculo só atualiza `x/y` e **arrasta o player junto** quando ele
  está apoiado (compara `player.onGround` e a posição do frame anterior).

Tipos em `FG.level.obstacleDefs` (`{type, x, y, ...}`):

1. `plataforma` — plataforma que vai e volta. `{x, y, w, dx, dy, period, phase}`
   (movimento senoidal entre `(x,y)` e `(x+dx, y+dy)`). Sólida, carrega o player.
2. `desmorona` — saliência que cai quando pisada. `{x, y, w}`: treme 0.45s ao
   receber peso, cai, some, e **volta 3s depois** no lugar. Sólida enquanto viva.
3. `sopro` — coluna de ar quente ascendente. `{x, y, w, h}`: dentro dela o
   player ganha aceleração para cima (a queda vira subida lenta) e planar dentro
   dela sobe de verdade. Não é sólida; é o que permite ganhar altura sem plataforma.
4. `pendulo` — corrente com bola de ferro balançando. `{x, y, len, arc, period}`:
   a bola machuca (1 de dano) e a **corrente é sólida** — dá para pousar nela.
5. `espinhorolo` — rolo de espinhos que corre num trilho. `{x, y, w, range, speed}`:
   machuca ao encostar, obriga a pular ou a subir na parede.
6. `locomotiva` — o **comboio desgovernado** (fase 5, só na arena do chefão).
   `{x, groundY, vagoes, interval, vmax}`: está parado nos carris até alguém
   pôr um pé nele; aí o travão cede, acelera até `vmax` (~1100 px/s) e **nunca
   mais para**, sempre em frente. A máquina e os vagões são **sólidos** (entram
   em `movers`) e são a arena da luta: salta-se de teto em teto — os vãos entre
   vagões têm de ser saltados — até ao tejadilho da cabine. Cada vagão leva uma
   topeira ajudante do chefão que ergue a picareta (telegraph ~0.5s) e dá a
   picaretada — 1 de dano; só **uma bate de cada vez** no comboio todo (a mais
   próxima), com recarga entre golpes, e o arco morre à altura do telhado,
   então saltar o golpe funciona. As topeiras não morrem. Cair para o balastro
   custa 1 de dano por segundo até se voltar a subir. Com o chefão morto o
   comboio continua a correr mas deixa de magoar.

   **Como um comboio a 1100 px/s cabe num mundo finito:** ele não anda. Fica
   parado em coordenadas de mundo e publica a distância percorrida — o
   obstáculo escreve em `FG.obstacles.scroll` (px), `velTrem` (px/s) e
   `correndo` (bool), e quem pinta o mundo soma isso ao x da câmera. O level5
   corre com isso as camadas de parallax, o balastro, as lâmpadas do teto e os
   riscos de vento. A física fica estável (é o que torna a luta jogável) e a
   tela mostra um comboio a toda a velocidade. O obstáculo publica ainda
   `cabine` (`{x,y}` do tejadilho — o posto do chefão), `comboio` (a própria
   peça, para quem precisar da geometria) e `luzes` (`[{x,y,r}]`, as luzes que
   o comboio leva consigo, que a camada de breu do level5 recorta).

7. `herobrine` — o vulto de olhos brancos que anda pelas PAREDES da galeria
   (fase 5, só na luta do chefão). `{x, w, margem, altoY, baixoY, interval}`:
   caminha pelo perímetro aberto de um retângulo — parede esquerda, teto,
   parede direita, nunca o chão, que é do comboio — sempre com os pés colados
   à rocha, e persegue a projeção do jogador nesse caminho (com o vertical a
   pesar menos, para preferir o teto). De tempos a tempos trava, os olhos
   acendem (telegraph ~0.85s, e eles próprios são uma luz declarada em
   `luzes`) e dispara um raio reto, mirado no instante do tiro e sem correção
   depois — sair da linha é o que o torna justo. 1 de dano, não é sólido e não
   morre. **Segura o tiro na janela de exposição do chefão**: aquele é o único
   momento em que o jogador pode colar no ponto fraco, e o jogo inteiro ensina
   que ali nada magoa.
   O retângulo acompanha a CÂMERA (`segueCamera`, com as folgas em
   coordenadas de tela): num mundo em que é o cenário que corre, uma parede
   fixa em coordenadas de mundo ficaria para trás em dois segundos. O raio
   continua a ser calculado em coordenadas de mundo, como tudo o resto.

(os demais tipos — `cipo`, `disco`, `tronco`, `brasa`, `cachorroquente`,
`montanharussa`, `rodagigante`, `trovao`, `plateia` — estão documentados no
cabeçalho do `obstacles.js`, que é a fonte de verdade.)

Regras: todo perigo dá 1 de dano via `FG.player.hurt(1, xOrigem)`. Nada de
alocar por frame (pools). Culling de ~1 tela em todo desenho. Visual pintado no
mesmo padrão do resto (gradientes, glow), 100% canvas.

### FG.levels e FG.level (level*.js + engine)

`FG.levels` é um array preenchido no **load**, na ordem do `index.html`: cada
`level*.js` faz `FG.levels.push({...})` e nunca escreve em `FG.level`. Quem
publica a fase corrente é o engine, no `loadLevel(i)` — que também recaptura a
base de sólidos (ela é **por fase**), chama `FG.level.reset()`, `FG.obstacles
.reset()` e `FG.enemies.reset()`, e recoloca a câmera sem lerp.

Superfície de uma fase: `id, nome, W, H, playerStart, solids, hazards,
checkpoints, enemyDefs, obstacleDefs, ninhos?, bossId, bossTriggerX, arena,
reset(), update(dt), drawBack/drawSolids/drawFront(ctx, cam)`.

`reset()` é a fase quem implementa e o engine quem chama — reacende lumis e
ninhos. Nenhuma fase pode reacender sozinha olhando `FG.engine.lumis`: o
contador **não** zera entre fases, só em jogo novo.

Chefão derrotado com fase na fila vira o estado `'fase'` (tela de FASE
COMPLETA) em vez de `'victory'`. A decisão mora no `setState` do engine, porque
os chefões não sabem em que fase vivem.

### FG.enemies (enemies.js)

- `list` — array de inimigos vivos
- `reset()` — repovoa `list` a partir de `FG.level.enemyDefs` e re-arma o boss
  (chamado pelo engine ao respawnar e ao iniciar o jogo)
- `update(dt)` — IA de cada tipo; contato com player → `FG.player.hurt(1, ex)`;
  se `FG.player.attackBox.active` sobrepõe → inimigo morre (pufe de fumaça +
  `FG.audio.sfx('hitEnemy')`); pulo em cima (vy>0 vindo de cima) → morre e
  player quica (`FG.player.vy = -420`).
- `draw(ctx, cam)` — canvas puro, mesmo estilo pintado, com culling.
- `registerBoss(id, boss)` — cada `bossN.js` se registra no load. `reset()`
  reseta **todos** os registrados (o chefão da fase anterior pode ter deixado
  projétil no ar, e a pool só se apaga pelo `reset()` do dono) e publica em
  `FG.enemies.boss` o que a fase pediu por `bossId`. Id desconhecido cai no
  primeiro registrado — ficar sem chefão trancaria o jogador na arena.
- `fx` — `{spawnParticle, goldBurst, groundYAt, rand, VIEW_W}`, consumido pelos
  `bossN.js` **em runtime**. As pools de partícula moram no `enemies.js`.
- `boss` — o chefão da fase corrente. Superfície:
  `id, nome, started, active, dead, hp, maxHp (=8), start(), reset(),
  update(dt), draw(ctx, cam), takeHit()`.

#### A forma comum dos três chefões

É o que faz a luta ser justa, e vale para todos:

- 8 de vida; fase 2 a partir de 3 (intervalos ×0.85).
- 4 ataques ciclando, telegraph de **0.85s ou mais** em cada um.
- Depois de **cada** ataque, o estado `exposto` (~2.6s): o ponto fraco acende e
  desce a **~150px do chão** — ao alcance de um pulo simples, inclusive de um
  pulo cortado. O dragão faz reverência, o Lodão incha e afunda a papada, o
  golem ajoelha.
- Durante a janela **nada machuca no contato** — nem o corpo, nem os restos do
  ataque anterior (pedra no ar, jato, poça). Sem isso, quem corre para socar
  apanha do ataque que já esquivou.
- Dano: soco (`p.attackBox`) ou pisão (`p.vy > 0`, quica com `p.vy = -420`).
- `hp <= 0` → morte cinematográfica de ~2.5s, `FG.audio.sfx('victory')` e
  `FG.engine.setState('victory')`. O chefão **não** sabe se aquilo é fim de
  fase ou fim de jogo — quem traduz é o engine.
- Referência medida, num bot que nunca desvia: ~30s de luta, 8 janelas, 8 socos,
  6 a 9 de dano levado, **zero** dentro da janela.

A boca do dragão **abre** (`boss.gape`, 0..1) por recorte, não por desenho: a
arte vem em três camadas do mesmo quadro (`assets.js`) — o corpo com a boca
vazada, a mandíbula com o interior da boca, e o remendo do focinho. A ordem
corpo → mandíbula girada na dobradiça → focinho faz a mandíbula deslizar para
TRÁS do focinho ao fechar, como animação de cutout. A referência veio de boca
aberta, então `gape = 1` é a arte original e fechar é girar `JAW_FECHO` rad
para cima. Escancara no telegraph do cuspe, no rugido e na intro.

Só o dragão (`boss1.js`) usa sprite: `FG.assets.bossDragon/Jaw/Snout`
(542x500, mesmo quadro), desenhados com a mesma transformação que posiciona
as hitboxes (`sprToWorld`/`sprBox`). Os pontos notáveis (boca, dobradiça,
ponto fraco, eixo da reverência, cascos de colisão) são constantes em px do
quadro, no topo do arquivo. Barra de HP é o engine que desenha, lendo
`boss.nome`.

### FG.audio (audio.js)

- Tudo WebAudio procedural (osciladores/ruído), zero arquivos.
- `init()` — cria/resume o AudioContext (engine chama no primeiro gesto).
- `sfx(name)` — `'jump','doublejump','glide','punch','hitEnemy','hurt','lumi',
  'checkpoint','death','bossRoar','bossHit','bossSpit','victory','select'`.
  Nomes desconhecidos: silêncio, sem throw.
- `music(name)` — `'overworld' | 'boss' | 'pantano' | 'mansao' | 'coliseu' |
  'caverna' | null` (para). Cada fase pede a sua em `FG.level.musica`. Loops agendados por
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

## Fase 5 — A Caverna (o escuro como mecânica)

`level5.js` é a única fase sem luz ambiente. O contrato novo é um só, e mora
dentro da própria fase: além dos campos de sempre, ela publica `lanternas` —
um array `{x, y, r}` de lampiões de mineração. O `drawFront` pinta uma camada
quase preta sobre a tela inteira e **recorta** nela (composite
`destination-out`) um buraco de luz por lanterna visível, mais um em volta do
jogador (ele é uma fagulha e carrega o próprio halo). Nenhum outro módulo
precisa saber disso: para o engine, `drawFront` é só mais um desenho.

Consequência de desenho a respeitar: as lanternas são, ao mesmo tempo,
iluminação e mapa. Trecho sem lanterna é trecho que o jogador atravessa só com
o halo próprio — use isso como ritmo (a travessia do veio de cristal é escura
de propósito), nunca como armadilha num salto cego.

O combate final é **em cima do comboio desgovernado**. O jogador chega ao cais,
sobe para o último vagão e o travão cede: dali em diante o comboio só acelera,
sempre em frente, por um trilho que não acaba. A arena é o próprio comboio —
saltar de vagão em vagão, por cima das topeiras, até ao tejadilho da cabine,
que o maquinista abandonou para lutar. Cair para o balastro dói e obriga a
voltar a subir.

O chefão é **Esbeltinho Otton** (`boss5.js`), mineiro comprido de capacete
amarelo: 10 de vida e os 4 ataques da forma comum — arremesso de picaretas,
desabamento de estalactites sobre o comboio, investida pelos tetos (salta da
cabine, corre os vagões e volta a trepar) e vapor a escapar das válvulas. Ele
não sabe o que é um comboio: pede o posto a `FG.obstacles.cabine` e o "chão"
dele é o teto que estiver debaixo dos pés (`tetoEm`), interpolado — é isso que
faz a descida para os vagões parecer um salto. Sem comboio nenhum, cai no chão
da arena como os outros quatro chefões. O ponto fraco é a **lanterna de
peito**, que desce a ~144px do piso dele na janela e acende com um anel
pulsante — sem esse anel ela sumia contra a camisa amarela.
