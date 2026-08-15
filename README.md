# 🔥 Fagulho: Lendas do Bosque

Um jogo de plataforma 2D em HTML5 inspirado no visual exuberante de **Rayman
Legends** — mundo, chefão e inimigos desenhados em canvas puro, e o herói
**recortado diretamente de uma foto**: o **Heitor**, de luvas de boxe
vermelhas, pronto para socar tudo que se mexer no bosque. O sprite vem
embutido em base64 (`assets.js`), então continua sem nenhum arquivo externo.

Envolto numa aura de fagulha, Heitor atravessa um bosque encantado ao
crepúsculo, coletando **lumis** (orbes douradas) até a clareira final, onde o
espera o **Dragomilão** — uma bocarra gigante de dragão vermelho, de dentes
tortos e olhos esbugalhados, que só pensa em comer.

## 🎮 Jogar

**Basta dar duplo-clique em `index.html`** — abre em qualquer navegador
moderno, sem servidor, sem build e sem dependências. Tudo (gráficos, música e
efeitos sonoros) é gerado por código em tempo real.

Se preferir, também funciona por HTTP local:

```bash
python3 -m http.server 8000   # acesse http://localhost:8000
```

## Controles

| tecla | ação |
|---|---|
| ← → ou A D | correr |
| ESPAÇO / Z / ↑ / W | pular (aperte de novo no ar: **pulo duplo**) |
| segurar pulo no ar | **planar** (uma hélice de fogo surge sobre a cabeça) |
| X / K | **soco** com a luva de boxe |

## O jogo

- **Bosque encantado** com parallax em três camadas, cogumelos gigantes,
  raios de luz e vagalumes — tudo pintado em canvas.
- **~90 lumis** para coletar, 3 checkpoints (lanternas que acendem ao passar).
- **Inimigos**: o *espinhoco* (lagarta espinhosa — não pise!), a *voadeira*
  (mariposa em senoide) e o *sapeca* (sapo que pula na sua direção).
- **Chefão Dragomilão** com 4 ataques telegrafados: bocanhada, cuspe de fogo,
  rugido rasteiro e chuva de dentes — acerte o olho na janela em que ele fica
  tonto. Na metade da vida, tudo acelera.
- **Música procedural** (WebAudio): tema saltitante no bosque, tema tenso no
  chefão — nenhum arquivo de áudio no projeto.
- **Herói de foto**: o sprite do Heitor mantém as animações do jogo por
  transformação (inclina na corrida, estica no pulo, pisca ao levar dano) e
  ganha uma luva de boxe voadora com rastro de fogo a cada soco.

## Arquitetura

| arquivo | papel |
|---|---|
| `engine.js` | loop, input, câmera, colisão, HUD e estados de jogo |
| `assets.js` | sprite do Heitor recortado da foto, embutido em base64 |
| `player.js` | física e desenho do herói |
| `level.js` | mundo (7200×720), parallax, lumis, checkpoints |
| `enemies.js` | os três inimigos e a máquina de estados do Dragomilão |
| `audio.js` | efeitos e trilhas, tudo sintetizado em WebAudio |

Contratos entre os módulos em `SPEC.md`.
