# 🔥 Fagulho: Lendas do Bosque

Um jogo de plataforma 2D em HTML5 inspirado no visual exuberante de **Rayman
Legends** — mas com mundo, personagens e arte 100% originais, desenhados em
canvas puro, sem um único asset externo.

**Fagulho** é uma fagulha viva que atravessa um bosque encantado ao
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
| segurar pulo no ar | **planar** (o topete vira hélice) |
| X / K | **soco** com a mão-brasa |

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

## Arquitetura

| arquivo | papel |
|---|---|
| `engine.js` | loop, input, câmera, colisão, HUD e estados de jogo |
| `player.js` | física e desenho do Fagulho |
| `level.js` | mundo (7200×720), parallax, lumis, checkpoints |
| `enemies.js` | os três inimigos e a máquina de estados do Dragomilão |
| `audio.js` | efeitos e trilhas, tudo sintetizado em WebAudio |

Contratos entre os módulos em `SPEC.md`.
