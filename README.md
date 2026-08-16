# 🔥 Fagulho: Lendas do Bosque

Um jogo de plataforma 2D em HTML5 inspirado no visual exuberante de **Rayman
Legends** — mundo, chefão e inimigos desenhados em canvas puro. O herói é o
**Heitor**: a **cabeça vem recortada de uma foto real** (embutida em base64
no `assets.js`) e o corpo é um boneco desenhado e animado em canvas, no
estereótipo criança de desenho — cabeçudo, tronco curto e **braços e pernas
compridos e finos**, com luvas de boxe vermelhas.

Envolto numa aura de fagulha, Heitor atravessa um bosque encantado ao
crepúsculo, coletando **lumis** (orbes douradas) até a clareira final, onde o
espera o **Dragomilão** — uma bocarra gigante de dragão vermelho, de dentes
tortos e olhos esbugalhados, que só pensa em comer.

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
jogo.

| tecla | ação |
|---|---|
| ← → ou A D | correr |
| ESPAÇO / Z / ↑ / W | pular (aperte de novo no ar: **pulo duplo**) |
| segurar pulo no ar | **planar** (uma hélice de fogo surge sobre a cabeça) |
| direção contra a parede, no ar | **agarrar** (escorrega devagar) |
| ESPAÇO agarrado | **escalar** — salta na parede e sobe ~90px por salto |
| X / K | **soco** com a luva de boxe |

## O jogo

- **Bosque encantado** com parallax em três camadas, cogumelos gigantes,
  raios de luz e vagalumes — tudo pintado em canvas.
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
- **~100 lumis** para coletar, 3 checkpoints (lanternas que acendem ao passar).
- **Inimigos**: o *espinhoco* (lagarta espinhosa — não pise!), a *voadeira*
  (mariposa em senoide) e o *sapeca* (sapo que pula na sua direção).
- **Chefão Dragomilão** com 4 ataques telegrafados: bocanhada, cuspe de fogo,
  rugido rasteiro e chuva de dentes — acerte o olho na janela em que ele fica
  tonto. Na metade da vida, tudo acelera.
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
| `assets.js` | sprite do Heitor recortado da foto, embutido em base64 |
| `player.js` | física e desenho do herói |
| `level.js` | mundo (7200×720), parallax, lumis, checkpoints |
| `obstacles.js` | plataformas móveis, desmoronamentos, sopros, pêndulos, rolos |
| `enemies.js` | os três inimigos e a máquina de estados do Dragomilão |
| `audio.js` | efeitos e trilhas, tudo sintetizado em WebAudio |

Contratos entre os módulos em `SPEC.md`.

## Testes

```bash
node tests/smoke.js    # joga o jogo inteiro sem navegador (menu → chefão → vitória)
node tests/reach.js    # simula a física do pulo e prova que dá para alcançar tudo
node tests/parede.js   # monta um penhasco de 500px e prova que dá para escalá-lo
node tests/mapa.js > mapa.svg   # desenha o nível inteiro num esquema
```

`reach.js` responde à pergunta "essa plataforma está alta demais?" sem
achismo: reproduz a física do `player.js` sobre a geometria do `level.js`,
percorre o nível em busca larga e reporta o que for inalcançável, o que só é
alcançável com timing perfeito, e o maior degrau vertical que cada plataforma
cobra (referência: pulo simples sobe ~118px, duplo ~236px).
