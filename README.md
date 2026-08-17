# 🔥 Rayhector

Um jogo de plataforma 2D em HTML5 inspirado no visual exuberante de **Rayman
Legends** — mundo e inimigos desenhados em canvas puro. O herói é o
**Heitor**: a **cabeça vem recortada de uma foto real** (embutida em base64
no `assets.js`) e o corpo é um boneco desenhado e animado em canvas, no
estereótipo criança de desenho — cabeçudo, tronco curto e **braços e pernas
compridos e finos**, com luvas de boxe vermelhas.

Envolto numa aura de fagulha, Heitor atravessa **três fases** coletando
**lumis** (orbes douradas), e cada uma termina num chefão próprio:

| # | fase | chefão |
|---|---|---|
| 1 | **O Bosque Crepuscular** — roxo e laranja, ao anoitecer | **Dragão Escarlate** |
| 2 | **O Pântano Venenoso** — bruma ocre, bambus e lodo | **O Lodão** |
| 3 | **A Encosta do Vulcão** — rocha preta e lava, a luz vindo de baixo | **O Coração de Magma** |

As lumis atravessam as fases: o contador só zera em jogo novo. O dragão é o
único que vem de arte bitmap — três camadas de recorte embutidas em base64 no
`assets.js` (corpo, mandíbula e focinho), e a boca abre girando a mandíbula na
dobradiça, que desliza para trás do focinho ao fechar. Os outros dois chefões
são desenhados em canvas, como o resto do jogo.

## 🎮 Jogar agora

**https://oliverbill.github.io/rayhector/**

Publicado automaticamente pelo GitHub Pages a cada push na `main`
(`.github/workflows/pages.yml`) — é um site estático, sem build.

Localmente, **basta dar duplo-clique em `index.html`** — abre em qualquer
navegador moderno, sem servidor e sem dependências. Tudo (gráficos, música e
efeitos sonoros) é gerado por código em tempo real.

Se preferir, também funciona por HTTP local:

```bash
python3 -m http.server 8000   # acesse http://localhost:8000
```

## Controles

Os comandos também aparecem num quadro no canto superior direito, durante o
jogo — no celular ele já vem escrito com o nome dos botões da tela.

| tecla | toque | ação |
|---|---|---|
| ← → ou A D | ◀ ▶ | correr |
| ESPAÇO / Z / ↑ / W | PULO | pular (aperte de novo no ar: **pulo duplo**) |
| segurar pulo no ar | segurar PULO | **planar** (uma hélice de fogo surge sobre a cabeça) |
| direção contra a parede, no ar | ◀ ▶ contra a parede | **agarrar** (escorrega devagar) |
| ESPAÇO agarrado | PULO agarrado | **escalar** — salta na parede e sobe ~90px por salto |
| X / K | SOCO | **soco** com a luva de boxe |

### No iPhone, iPad e Android

Basta abrir o link no navegador: em aparelho de toque os botões aparecem
sozinhos na tela e o menu já convida a tocar, em vez de pedir uma tecla que
não existe ali. Vale **virar o aparelho para a horizontal** — o jogo é 16:9, e
em pé ele fica numa faixa fina (o próprio jogo avisa). Os botões são
desenhados no canvas, como o resto, então acompanham a escala da tela; o
multi-toque funciona (dá para pular e socar ao mesmo tempo) e arrastar o dedo
de ◀ para ▶ troca a direção sem soltar. Teclado e toque convivem: num iPad com
teclado, os dois funcionam ao mesmo tempo.

## O jogo

- **Três mundos** com parallax próprio, todos pintados em canvas: o bosque ao
  crepúsculo (cogumelos gigantes, raios de luz, vagalumes), o pântano na bruma
  ocre (bambuzal, lodo, taboa) e a encosta do vulcão (rocha preta, rio de lava,
  brasa subindo — e a luz vindo de baixo, ao contrário das outras duas).
- **Planar tem crédito**: segurando o pulo depois do duplo, o Heitor plana por
  no máximo **1 segundo**, e o crédito só volta ao tocar o chão ou agarrar a
  parede. Sem isso, soltar e reapertar o botão daria planagem infinita e todo
  vão do jogo viraria travessia de graça.
- **Escalada de penhasco**: encostando na parede em queda, o Heitor se apoia
  nela e escorrega devagar; saltando dali sobe ~90px por vez. É assim que se
  vence a chaminé do desfiladeiro — uma parede de 400px, em cinco saltos.
- **Terreno em vários níveis**: degraus e mesas, maciços de pedra com bocas de
  caverna, ilhas flutuantes sobre o abismo e fendas verticais. Sem plataformas
  de cogumelo repetidas.
- **Obstáculos dinâmicos**: plataformas que vão e voltam (e levam você junto),
  saliências que desmoronam quando pisadas e voltam depois, colunas de ar
  quente que empurram para cima, pêndulos de bola de ferro em corrente — onde
  a corrente é sólida e dá para pousar — e rolos de espinhos em trilhos.
- **Cipós em arco** pendurados entre dois postes: você os agarra no ar, anda
  ao longo deles com as setas e solta com ESPAÇO, ganhando impulso. No vulcão
  são correntes de ferro sobre a caldeira. É o elemento que mais muda o jogo.
- **Troncos que afundam** enquanto você pisa neles e voltam quando você sai,
  **discos de âmbar** que flutuam sobre a lava e **chuva de brasa** em rajadas
  telegrafadas por sombras no chão.
- **Lumis** para coletar em todas as fases — o contador atravessa as fases e só
  zera em jogo novo — mais **ninhos com casulo**, que valem 5 de uma vez.
- **Inimigos**: o *espinhoco* (lagarta espinhosa — não pise!), a *voadeira*
  (mariposa em senoide), o *sapeca* (sapo que pula na sua direção) e o *peixe*
  voador, que fica bufando parado e dispara na horizontal quando você chega.
- **Três chefões**, um por fase, todos com 8 de vida e 4 ataques telegrafados:
  o **Dragão Escarlate** (duas bolas de fogo em arcos diferentes, investida,
  rugido rasteiro, chuva de presas), **O Lodão** (cusparada, lambada de língua,
  baque com ondas, chuva de bolhas) e **O Coração de Magma** (rolar, arremesso,
  jatos de lava, tremor com estalactites).
  Os três seguem a mesma regra, que é o que faz a luta ser justa: depois de
  **cada** ataque o bicho fica ofegante e abaixa o ponto fraco à altura de um
  pulo simples — é a janela de dano, e é ela que dá o ritmo. Nada machuca no
  contato enquanto a janela está aberta, nem os restos do ataque anterior. A
  partir de 3 de vida todos esquentam e aceleram um pouco.
- **Música procedural** (WebAudio): tema saltitante no bosque, tema tenso no
  chefão — nenhum arquivo de áudio no projeto.
- **Boneco articulado**: pernas com passada larga na corrida, braços em
  guarda de boxe parado, bombeando ao correr, esticados para o alto no pulo e
  abertos como asas ao planar; no soco, o braço da frente **estica de
  verdade** até a hitbox do golpe, com rastro de fogo na luva. A cabeça (da
  foto) faz um bob próprio na corrida, e tudo pisca ao levar dano.

## Arquitetura

| arquivo | papel |
|---|---|
| `engine.js` | loop, input, câmera, colisão, HUD e estados de jogo |
| `assets.js` | sprites em base64: a foto recortada do Heitor e o dragão |
| `player.js` | física e desenho do herói |
| `levelkit.js` | ferramentas comuns às fases: sólido, RNG, lumis, offscreen, culling |
| `level.js` `level2.js` `level3.js` | as três fases (7200×720 cada), com parallax e pintura próprios |
| `obstacles.js` | plataformas móveis, desmoronamentos, sopros, pêndulos, rolos, **cipós, discos, troncos e chuva de brasa** |
| `enemies.js` | os quatro inimigos comuns e o registro de chefões |
| `boss1.js` `boss2.js` `boss3.js` | um chefão por arquivo, cada um com a sua máquina de estados |
| `audio.js` | efeitos e trilhas, tudo sintetizado em WebAudio |
| `touch.js` | controles de toque desenhados no canvas (iPhone, iPad, Android) |

Contratos entre os módulos em `SPEC.md`.

## Testes

```bash
node tests/smoke.js    # joga o jogo inteiro sem navegador (menu → chefão → vitória)
node tests/toque.js    # finge um iPhone e joga só com o dedo (ver abaixo)
node tests/reach.js    # simula a física do pulo e prova que dá para alcançar tudo
node tests/reach.js 1  # a mesma prova para a fase 2 (0 = bosque, 1 = pântano, 2 = vulcão)
node tests/parede.js   # monta um penhasco de 500px e prova que dá para escalá-lo
node tests/mapa.js > mapa.svg   # desenha o nível inteiro num esquema
```

`reach.js` responde à pergunta "essa plataforma está alta demais?" sem
achismo: reproduz a física do `player.js` sobre a geometria do `level.js`,
percorre o nível em busca larga e reporta o que for inalcançável, o que só é
alcançável com timing perfeito, e o maior degrau vertical que cada plataforma
cobra (referência: pulo simples sobe ~118px, duplo ~236px).

`toque.js` monta um DOM que se comporta como aparelho de toque — com o canvas
deslocado e escalado na página, como fica de verdade no letterbox — e dirige o
jogo só com o dedo: sai do menu, corre, arrasta o dedo entre os botões, pula e
soca ao mesmo tempo, e confere que ir para segundo plano com o dedo no botão
não deixa o Heitor correndo sozinho. É o que substitui ter um iPhone na mão.

`reach.js` tem um ponto cego que vale conhecer: enxerga cada plataforma **na posição de
repouso**. Onde o chão se mexe — o tronco que afunda 70px, o disco que oscila —
a conta tem de ser feita à mão, a partir do **pior caso**. Foi assim que se
achou um salto do pântano que não fechava nem com pulo duplo depois do tronco
afundar, e um par de discos do vulcão que só fechava com os dois no mesmo
ponto da oscilação.
