// Fagulho: Lendas do Bosque — FG.audio: todo o áudio do jogo, 100% WebAudio
// procedural (osciladores, ruído gerado, filtros). Zero arquivos de áudio.
//
// Contrato (ver SPEC.md):
//   FG.audio.init()      — cria/resume o AudioContext (engine chama no 1º gesto)
//   FG.audio.sfx(name)   — efeitos; nome desconhecido = silêncio, nunca throw
//   FG.audio.music(name) — 'overworld'|'boss'|'pantano'|'mansao'|'coliseu'|null;
//                          troca com fade ~0.4s
//
// Nada aqui pode derrubar o jogo: tudo que toca WebAudio está em try/catch e
// vira no-op silencioso se o init ainda não rodou ou o contexto não roda.
window.FG = window.FG || {};

(function () {
  'use strict';

  // ---------------------------------------------------------------- estado --
  var actx = null;      // AudioContext (criado no init)
  var master = null;    // ganho mestre (~0.5)
  var comp = null;      // compressor no fim da cadeia, contra clipping
  var noiseBuf = null;  // 1s de ruído branco, gerado uma única vez

  var FLOOR = 0.0001;   // nunca rampar para 0 — piso dos envelopes exponenciais

  function init() {
    try {
      if (!actx) {
        // O áudio de página no iOS nasce na categoria "ambient", que é a que o
        // botão de silencioso do iPhone cala — o jogo roda inteiro, com o
        // contexto em 'running', e não sai som nenhum. 'playback' é a
        // categoria de mídia: toca com o silencioso ligado, como um tocador de
        // música. (AudioSession API, Safari 16.4+; onde não existe, é no-op.)
        try {
          if (window.navigator && window.navigator.audioSession) {
            window.navigator.audioSession.type = 'playback';
          }
        } catch (e) { /* categoria é um extra, não um requisito */ }

        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return; // navegador sem WebAudio: jogo segue mudo
        actx = new AC();

        // cadeia final: master(0.5) -> compressor -> saída
        comp = actx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 24;
        comp.ratio.value = 8;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
        comp.connect(actx.destination);

        master = actx.createGain();
        master.gain.value = 0.5;
        master.connect(comp);

        // buffer de ruído branco (1s), reusado por todos os sons de ruído
        var len = actx.sampleRate;
        noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
        var data = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      // 'suspended' é quem nunca foi destravado. O Safari tem TAMBÉM o estado
      // 'interrupted' (ligação, Siri, outro app tomando o áudio), e desse o
      // contexto não sai sozinho: checar só por 'suspended' deixava o jogo mudo
      // para sempre depois de uma interrupção. Resume de tudo que não é
      // 'running' — em contexto já rodando, resume() é no-op.
      if (actx.state !== 'running') actx.resume();
    } catch (e) { /* áudio quebrado não derruba o jogo */ }
  }

  // Voltar do segundo plano: o iOS suspende o contexto sem avisar ninguém, e
  // sem isto o jogo continua rodando mudo até o próximo gesto do usuário.
  try {
    if (document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) init();
      });
    }
  } catch (e) { /* sem document utilizável: segue sem o reparo automático */ }

  // Pronto para tocar AGORA (sfx exige isso; a música tolera 'suspended'
  // porque o resume() do init é assíncrono e o engine pede música no mesmo
  // keydown — o scheduler só agenda quando o contexto estiver 'running').
  function running() { return !!(actx && actx.state === 'running'); }

  // ------------------------------------------------------------- utilitários --
  // nota MIDI -> frequência em Hz (69 = A4 = 440 Hz)
  function nf(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Oscilador com envelope percussivo (ataque curto + decay exponencial).
  // o: { t, dur, vol, type, freq, freqEnd?, detune?, attack?, dest?,
  //      filtro?: {type, f0, f1?, q?} }
  function tone(o) {
    var osc = actx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.freq), o.t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), o.t + o.dur);
    if (o.detune) osc.detune.setValueAtTime(o.detune, o.t);

    var g = actx.createGain();
    var at = o.attack || 0.008;
    g.gain.setValueAtTime(FLOOR, o.t);
    g.gain.exponentialRampToValueAtTime(Math.max(FLOOR, o.vol), o.t + at);
    g.gain.exponentialRampToValueAtTime(FLOOR, o.t + o.dur);

    var head = osc;
    if (o.filtro) {
      var f = actx.createBiquadFilter();
      f.type = o.filtro.type || 'lowpass';
      f.frequency.setValueAtTime(Math.max(10, o.filtro.f0), o.t);
      if (o.filtro.f1) f.frequency.exponentialRampToValueAtTime(Math.max(10, o.filtro.f1), o.t + o.dur);
      f.Q.value = o.filtro.q || 1;
      osc.connect(f);
      head = f;
    }
    head.connect(g);
    g.connect(o.dest || master);
    osc.start(o.t);
    osc.stop(o.t + o.dur + 0.05);
  }

  // Rajada de ruído filtrado com envelope.
  // o: { t, dur, vol, ftype?, f0, f1?, q?, attack?, dest? }
  function ruido(o) {
    var src = actx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.loopEnd = noiseBuf.duration;

    var f = actx.createBiquadFilter();
    f.type = o.ftype || 'bandpass';
    f.frequency.setValueAtTime(Math.max(10, o.f0), o.t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), o.t + o.dur);
    f.Q.value = o.q || 1;

    var g = actx.createGain();
    var at = o.attack || 0.005;
    g.gain.setValueAtTime(FLOOR, o.t);
    g.gain.exponentialRampToValueAtTime(Math.max(FLOOR, o.vol), o.t + at);
    g.gain.exponentialRampToValueAtTime(FLOOR, o.t + o.dur);

    src.connect(f); f.connect(g); g.connect(o.dest || master);
    src.start(o.t, Math.random() * 0.5); // offset aleatório: rajadas não soam iguais
    src.stop(o.t + o.dur + 0.05);
  }

  // ------------------------------------------------------------------- SFX --
  // Cada efeito é uma função curta; a tabela despacha pelo nome.
  var SFX = {
    // blip que sobe — pulo
    jump: function (t) {
      tone({ t: t, dur: 0.14, vol: 0.22, type: 'square', freq: 320, freqEnd: 640,
             filtro: { type: 'lowpass', f0: 2200 } });
    },
    // dois blips rápidos, mais agudos — pulo duplo
    doublejump: function (t) {
      tone({ t: t, dur: 0.09, vol: 0.2, type: 'square', freq: 520, freqEnd: 780,
             filtro: { type: 'lowpass', f0: 2600 } });
      tone({ t: t + 0.07, dur: 0.11, vol: 0.2, type: 'square', freq: 700, freqEnd: 1100,
             filtro: { type: 'lowpass', f0: 3000 } });
    },
    // sopro suave de ruído filtrado — planar
    glide: function (t) {
      ruido({ t: t, dur: 0.4, vol: 0.09, ftype: 'bandpass', f0: 900, f1: 600, q: 1.2,
              attack: 0.08 });
    },
    // raspão surdo — encostou na parede e agarrou
    wallgrab: function (t) {
      ruido({ t: t, dur: 0.18, vol: 0.11, ftype: 'bandpass', f0: 1400, f1: 500, q: 1.1 });
    },
    // impulso da parede: blip subindo + raspão de saída
    walljump: function (t) {
      tone({ t: t, dur: 0.15, vol: 0.2, type: 'square', freq: 380, freqEnd: 720,
             filtro: { type: 'lowpass', f0: 2400 } });
      ruido({ t: t, dur: 0.12, vol: 0.12, ftype: 'bandpass', f0: 900, f1: 2200, q: 1.4 });
    },
    // whoosh grave e curto — soco
    punch: function (t) {
      ruido({ t: t, dur: 0.14, vol: 0.2, ftype: 'lowpass', f0: 900, f1: 200, q: 0.8 });
      tone({ t: t, dur: 0.12, vol: 0.22, type: 'sine', freq: 180, freqEnd: 60 });
    },
    // pop + chiado descendente — inimigo atingido
    hitEnemy: function (t) {
      tone({ t: t, dur: 0.08, vol: 0.28, type: 'sine', freq: 300, freqEnd: 140 });
      ruido({ t: t + 0.02, dur: 0.22, vol: 0.14, ftype: 'highpass', f0: 3500, f1: 700, q: 0.7 });
    },
    // descida dissonante (dois osciladores desafinados) — dano no player
    hurt: function (t) {
      tone({ t: t, dur: 0.28, vol: 0.16, type: 'sawtooth', freq: 420, freqEnd: 150,
             filtro: { type: 'lowpass', f0: 1600, f1: 500 } });
      tone({ t: t, dur: 0.28, vol: 0.12, type: 'sawtooth', freq: 445, freqEnd: 175, detune: 35,
             filtro: { type: 'lowpass', f0: 1600, f1: 500 } });
    },
    // sininho pentatônico brilhante — nota sorteada num acorde para não enjoar
    lumi: function (t) {
      var acorde = [84, 88, 91, 93]; // C6 E6 G6 A6 (Cmaj add6, pentatônico)
      var m = acorde[(Math.random() * acorde.length) | 0];
      tone({ t: t, dur: 0.45, vol: 0.14, type: 'sine', freq: nf(m), attack: 0.004 });
      tone({ t: t, dur: 0.3, vol: 0.05, type: 'sine', freq: nf(m) * 2, attack: 0.004 }); // harmônico
    },
    // arpejo maior ascendente — checkpoint
    checkpoint: function (t) {
      var arp = [72, 76, 79, 84]; // C5 E5 G5 C6
      for (var i = 0; i < arp.length; i++) {
        tone({ t: t + i * 0.09, dur: 0.3, vol: 0.14, type: 'triangle', freq: nf(arp[i]) });
      }
    },
    // descida longa e triste — morte
    death: function (t) {
      tone({ t: t, dur: 1.3, vol: 0.16, type: 'triangle', freq: nf(69), freqEnd: nf(52),
             attack: 0.02 });
      tone({ t: t, dur: 1.3, vol: 0.1, type: 'sine', freq: nf(65), freqEnd: nf(48),
             attack: 0.02 }); // segunda voz, intervalo que fecha escuro
      ruido({ t: t + 0.3, dur: 1.0, vol: 0.05, ftype: 'lowpass', f0: 800, f1: 150, attack: 0.2 });
    },
    // rugido ~1s: ruído grave + osciladores detunados com pitch caindo
    bossRoar: function (t) {
      ruido({ t: t, dur: 1.0, vol: 0.24, ftype: 'lowpass', f0: 500, f1: 120, q: 1.2, attack: 0.03 });
      tone({ t: t, dur: 1.0, vol: 0.18, type: 'sawtooth', freq: 130, freqEnd: 45,
             filtro: { type: 'lowpass', f0: 700, f1: 200 } });
      tone({ t: t, dur: 1.0, vol: 0.14, type: 'sawtooth', freq: 138, freqEnd: 50, detune: -40,
             filtro: { type: 'lowpass', f0: 700, f1: 200 } });
    },
    // impacto metálico + nota de recompensa — dano no boss
    bossHit: function (t) {
      // duas parciais inarmônicas curtas = "clang" metálico
      tone({ t: t, dur: 0.16, vol: 0.2, type: 'square', freq: 720, freqEnd: 500 });
      tone({ t: t, dur: 0.16, vol: 0.14, type: 'square', freq: 720 * 1.414, freqEnd: 500 * 1.414 });
      ruido({ t: t, dur: 0.1, vol: 0.12, ftype: 'highpass', f0: 4000, q: 0.7 });
      // recompensa: blip brilhante logo depois
      tone({ t: t + 0.09, dur: 0.28, vol: 0.13, type: 'sine', freq: nf(88), attack: 0.004 }); // E6
    },
    // cuspe: ruído curto com filtro subindo
    bossSpit: function (t) {
      ruido({ t: t, dur: 0.22, vol: 0.16, ftype: 'bandpass', f0: 300, f1: 2600, q: 2 });
    },
    // fanfarra maior de ~2s — vitória (C maior: dó–sol–dó–mi–sol agudo)
    victory: function (t) {
      var seq = [
        { m: 72, at: 0.0, dur: 0.22 },  // C5
        { m: 79, at: 0.22, dur: 0.22 }, // G5
        { m: 84, at: 0.44, dur: 0.22 }, // C6
        { m: 88, at: 0.66, dur: 0.3 },  // E6
        { m: 91, at: 1.0, dur: 1.0 },   // G6, nota final longa
      ];
      for (var i = 0; i < seq.length; i++) {
        var n = seq[i];
        tone({ t: t + n.at, dur: n.dur, vol: 0.16, type: 'triangle', freq: nf(n.m) });
        tone({ t: t + n.at, dur: n.dur, vol: 0.07, type: 'square', freq: nf(n.m - 12),
               filtro: { type: 'lowpass', f0: 1200 } });
      }
      // acorde de apoio embaixo da nota final (C maior)
      var acorde = [60, 64, 67];
      for (var j = 0; j < acorde.length; j++) {
        tone({ t: t + 1.0, dur: 1.0, vol: 0.06, type: 'triangle', freq: nf(acorde[j]), attack: 0.04 });
      }
    },
    // três blips subindo em arpejo — embarque na montanha-russa
    coasterGo: function (t) {
      var arp = [64, 68, 71]; // E4 G#4 B4
      for (var i = 0; i < arp.length; i++) {
        tone({ t: t + i * 0.06, dur: 0.14, vol: 0.16, type: 'square', freq: nf(arp[i]),
               filtro: { type: 'lowpass', f0: 2400 } });
      }
      ruido({ t: t, dur: 0.3, vol: 0.08, ftype: 'bandpass', f0: 700, f1: 1600, q: 1.2 });
    },
    // mastigada curta (dois "crunch" de ruído) + gole satisfeito — cachorro-quente
    eatHotdog: function (t) {
      ruido({ t: t, dur: 0.09, vol: 0.14, ftype: 'lowpass', f0: 1200, f1: 500, q: 0.9 });
      ruido({ t: t + 0.12, dur: 0.09, vol: 0.14, ftype: 'lowpass', f0: 1200, f1: 500, q: 0.9 });
      tone({ t: t + 0.24, dur: 0.16, vol: 0.12, type: 'sine', freq: 260, freqEnd: 340 });
    },
    // acorde maior sustentado e brilhante — chegou ao topo da roda-gigante
    ferrisTopo: function (t) {
      var acorde = [79, 84, 88]; // G5 C6 E6
      for (var i = 0; i < acorde.length; i++) {
        tone({ t: t, dur: 1.1, vol: 0.1, type: 'triangle', freq: nf(acorde[i]), attack: 0.06 });
      }
    },
    // sucção grave e pastosa — entrou na areia movediça
    sinking: function (t) {
      ruido({ t: t, dur: 0.5, vol: 0.14, ftype: 'lowpass', f0: 700, f1: 160, q: 1.0, attack: 0.03 });
      tone({ t: t, dur: 0.4, vol: 0.12, type: 'sine', freq: 140, freqEnd: 60, attack: 0.02 });
    },
    // blip de menu
    select: function (t) {
      tone({ t: t, dur: 0.09, vol: 0.16, type: 'square', freq: 660, freqEnd: 880,
             filtro: { type: 'lowpass', f0: 2800 } });
    },
  };

  function sfx(name) {
    try {
      if (!running()) return;
      var fn = SFX[name];
      if (!fn) return; // nome desconhecido: silêncio, sem throw
      fn(actx.currentTime);
    } catch (e) { /* silêncio */ }
  }

  // ---------------------------------------------------------------- MÚSICA --
  // Scheduler com lookahead: um setInterval de 50ms agenda tudo que cai nos
  // próximos ~0.15s no relógio do AudioContext. Cada música tem um "bus" de
  // ganho próprio ligado ao master — trocar de música = fade out do bus antigo
  // (~0.4s) + bus novo com fade in curto.
  var TICK_MS = 50;      // período do setInterval
  var LOOKAHEAD = 0.15;  // segundos agendados à frente
  var FADE = 0.4;        // fade out ao trocar/parar

  // ---- composição: OVERWORLD — saltitante e encantado, dó maior, 104 BPM ----
  // Grade de colcheias: 8 compassos de 4/4 = 64 passos por volta.
  // Progressão (1 compasso cada): C | Am | F | G | C | F | Dm | G
  // 0 = pausa; números = nota MIDI (72 = C5).

  // Melodia A — a frase "de praça", pulinhos dentro do acorde
  var OV_MEL_A = [
    76, 79, 0, 76, 72, 0, 76, 79,   // C:  mi sol . mi | dó . mi sol
    81, 0, 79, 76, 74, 76, 0, 0,    // Am: lá . sol mi | ré mi . .
    77, 81, 0, 77, 72, 0, 74, 76,   // F:  fá lá . fá | dó . ré mi
    74, 0, 71, 74, 79, 0, 0, 0,     // G:  ré . si ré | sol . . .
    79, 84, 0, 79, 76, 0, 72, 76,   // C:  sol dó' . sol | mi . dó mi
    81, 0, 77, 81, 84, 0, 81, 79,   // F:  lá . fá lá | dó' . lá sol
    77, 74, 0, 77, 81, 79, 77, 76,  // Dm: desce e sobe correndo
    74, 0, 76, 74, 72, 0, 0, 0,     // G:  cadência de volta ao dó
  ];

  // Melodia B — variação com mais saltos, alterna com a A a cada volta
  var OV_MEL_B = [
    72, 76, 79, 84, 0, 79, 76, 0,   // C:  arpejo subindo e caindo
    76, 0, 81, 0, 84, 81, 79, 0,    // Am: saltos largos
    81, 77, 0, 72, 77, 0, 81, 0,    // F
    83, 0, 79, 0, 74, 0, 79, 0,     // G:  si insinuando a sensível
    84, 0, 79, 76, 79, 0, 84, 0,    // C
    81, 84, 0, 81, 77, 0, 74, 0,    // F
    74, 77, 81, 0, 77, 74, 0, 72,   // Dm
    74, 76, 0, 71, 74, 0, 0, 0,     // G:  fecho leve
  ];

  // Contramelodia — terças longas dos acordes, uma oitava abaixo; toca só nas
  // voltas ímpares para dar respiração ao arranjo.
  var OV_CONTRA = [
    64, 0, 0, 0, 67, 0, 0, 0,   // C:  mi4 / sol4
    60, 0, 0, 0, 64, 0, 0, 0,   // Am: dó4 / mi4
    65, 0, 0, 0, 69, 0, 0, 0,   // F:  fá4 / lá4
    62, 0, 0, 0, 67, 0, 0, 0,   // G:  ré4 / sol4
    64, 0, 0, 0, 72, 0, 0, 0,   // C
    65, 0, 0, 0, 69, 0, 0, 0,   // F
    62, 0, 0, 0, 65, 0, 0, 0,   // Dm
    59, 0, 0, 0, 62, 0, 0, 0,   // G
  ];

  // Baixo "em bomba" (oom-pah): fundamental nos tempos 1 e 3, quinta nos 2 e 4.
  var OV_RAIZ = [36, 33, 41, 43, 36, 41, 38, 43]; // C2 A1 F2 G2 C2 F2 D2 G2, 1 por compasso

  // ---- composição: BOSS — tenso, lá menor (harmônica), 140 BPM ----
  // Grade de colcheias: 8 compassos = 64 passos por volta.

  // Ostinato grave insistente (padrões de 1 compasso; o G# é a sensível que
  // deixa tudo pontudo). Sequência de padrões por compasso logo abaixo.
  var BS_OST_A = [33, 33, 45, 33, 33, 33, 44, 33]; // lá lá lá' lá | lá lá sol#' lá
  var BS_OST_B = [33, 33, 45, 33, 36, 36, 32, 32]; // ... dó dó sol#1 sol#1
  var BS_OST_C = [33, 36, 38, 39, 40, 39, 38, 32]; // subida cromática de fim de volta
  var BS_OST_SEQ = [BS_OST_A, BS_OST_A, BS_OST_B, BS_OST_A,
                    BS_OST_A, BS_OST_B, BS_OST_A, BS_OST_C];

  // Melodia pontuda em lá menor harmônica (80 = G#5, a nota que morde).
  // Entra só a partir da segunda volta do loop, para a tensão crescer.
  var BS_MEL = [
    0, 0, 0, 0, 0, 0, 0, 0,          // compasso 1: só o ostinato
    81, 0, 80, 81, 0, 0, 84, 0,      // lá . sol# lá . . dó' .
    0, 0, 0, 0, 0, 0, 0, 0,
    88, 86, 84, 83, 81, 0, 80, 0,    // descida cortante mi'-ré'-dó'-si-lá … sol#
    81, 81, 0, 84, 0, 83, 0, 80,     // stabs sincopados
    81, 0, 88, 0, 86, 0, 84, 0,      // saltos de oitava
    89, 88, 86, 84, 83, 81, 80, 76,  // fá'' correndo até o mi
    81, 0, 0, 0, 0, 0, 0, 0,         // aterrissa no lá e respira
  ];

  // ---- composição: PÂNTANO — morosa, ré menor natural, 68 BPM ----
  // "Morosa" é o tempo lento e o portamento afundando, não a grade vazia — a
  // 1ª versão espaçava as notas de menos em menos e soava como se faltasse
  // alguma coisa. Aqui a melodia cobre metade da grade (nota sim, nota não,
  // em colcheias), sempre dentro do arpejo do acorde do compasso, e o drone
  // ganha a 3ª e a 5ª por cima da fundamental — vira pad, não só baixo.
  // Progressão i–VI–III–VII (D–Bb–F–C) repetida com desvio pro iv (Gm) no
  // compasso 6, típica de modo menor natural sem sensível puxando de volta.
  var PT_RAIZ = [38, 34, 41, 36, 38, 43, 36, 38]; // D2 Bb1 F2 C2 D2 G2 C2 D2, 1 por compasso

  // Arpejo do acorde de cada compasso, sempre em colcheias pares — com
  // portamento descendente no agendador (nota "afunda" em vez de só parar).
  var PT_MEL = [
    62, 0, 65, 0, 69, 0, 65, 0,   // Dm:  ré fá lá fá
    58, 0, 62, 0, 65, 0, 62, 0,   // Bb:  sib ré fá ré
    65, 0, 69, 0, 72, 0, 69, 0,   // F:   fá lá dó' lá
    60, 0, 64, 0, 67, 0, 64, 0,   // C:   dó mi sol mi
    69, 0, 65, 0, 62, 0, 65, 0,   // Dm:  variação descendo
    55, 0, 58, 0, 62, 0, 58, 0,   // Gm:  sol sib ré sib
    67, 0, 64, 0, 60, 0, 64, 0,   // C:   descendo de volta
    62, 0, 58, 0, 55, 0, 50, 0,   // Dm:  afunda até o ré grave — fecho
  ];

  // ---- composição: MANSÃO — sombria, dó menor harmônico, 72 BPM ----
  // Em vez de banda tocando junto (overworld/boss), aqui é o sino de caixinha
  // de música (sine com ataque lento) tocando um arpejo constante — a 1ª
  // versão isolava só 1-2 sinos por compasso e soava com buracos demais.
  // Agora é arpejo em colcheias pares o loop inteiro, mais um pad de tríade
  // sustentada por baixo (renovado a cada 4 compassos) e o drone de trítono
  // (dó/fá#, ideia do pedal de ré# do boss) preenchendo o fundo — a
  // dissonância e a atmosfera continuam no fundo, só que agora sem silêncio.
  // A 2ª aumentada láb–si (característica do menor harmônico) aparece nos
  // compassos 4-5 de propósito: é o intervalo mais "torto" da escala.
  var MN_SINO = [
    84, 0, 79, 0, 75, 0, 72, 0,   // C6 sol5 mib5 dó5 — desce
    75, 0, 79, 0, 84, 0, 79, 0,   // sobe de volta
    72, 0, 75, 0, 79, 0, 84, 0,   // sobe de novo, mais alto
    79, 0, 84, 0, 87, 0, 84, 0,   // sol5 dó6 mib6 dó6 — pico
    84, 0, 80, 0, 84, 0, 80, 0,   // dó6/láb5 — prepara a 2ª aumentada
    83, 0, 79, 0, 83, 0, 79, 0,   // si5/sol5 — resolve a 2ª aumentada Ab-B
    75, 0, 72, 0, 75, 0, 72, 0,   // desce de volta
    72, 0, 77, 0, 72, 0, 68, 0,   // dó5 fá5 dó5 láb4 — fecho, sem resolver de verdade
  ];

  // ---- composição: COLISEU — marcial e tenso, mi frígio, 132 BPM ----
  // Frígio (2º grau abaixado, aqui fá natural sobre mi) dá o sabor "arena
  // romana" sem copiar o lá-menor-harmônico do boss. BPM fica entre a
  // overworld (104) e o boss (140): mais urgente que explorar, mas ainda não
  // é a luta final — o bII (Fá maior, compasso 7) é o acorde frígio por
  // excelência, entra só uma vez por volta como um lampejo de perigo.
  var CL_RAIZ = [40, 38, 36, 33, 40, 38, 41, 40]; // Em D C Am Em D F Em, 1 por compasso

  var CL_MEL = [
    64, 0, 67, 64, 0, 67, 71, 0,   // Em: mi sol . mi | . sol si .
    62, 0, 65, 62, 0, 64, 0, 0,    // D:  ré fá . ré | . mi . .
    60, 0, 64, 60, 0, 62, 64, 0,   // C:  dó mi . dó | . ré mi .
    57, 0, 60, 57, 0, 60, 64, 0,   // Am: lá dó . lá | . dó mi .
    64, 0, 67, 71, 0, 67, 64, 0,   // Em: variação com o si mais cedo
    62, 65, 0, 62, 67, 0, 65, 0,   // D:  sol grave escapando pro fá
    65, 0, 69, 65, 0, 64, 60, 0,   // F:  fá lá . fá | . mi dó — o bII frígio
    64, 60, 57, 55, 52, 0, 64, 0,  // Em: corrida descendente, cadência final
  ];

  var SONGS = {
    overworld: {
      bpm: 104,
      stepDur: 60 / 104 / 2, // colcheia
      steps: 64,
      agenda: agendaOverworld,
    },
    boss: {
      bpm: 140,
      stepDur: 60 / 140 / 2, // colcheia
      steps: 64,
      agenda: agendaBoss,
    },
    pantano: {
      bpm: 68,
      stepDur: 60 / 68 / 2, // colcheia
      steps: 64,
      agenda: agendaPantano,
    },
    mansao: {
      bpm: 72,
      stepDur: 60 / 72 / 2, // colcheia
      steps: 64,
      agenda: agendaMansao,
    },
    coliseu: {
      bpm: 132,
      stepDur: 60 / 132 / 2, // colcheia
      steps: 64,
      agenda: agendaColiseu,
    },
  };

  // -- instrumentos da trilha (tudo relativo ao bus da música) --

  // chimbal: sopro curto de ruído agudo
  function hihat(t, vol, dest) {
    ruido({ t: t, dur: 0.045, vol: vol, ftype: 'highpass', f0: 6500, q: 0.7, dest: dest });
  }
  // bumbo surdo: seno com pitch despencando
  function kick(t, dest) {
    tone({ t: t, dur: 0.13, vol: 0.4, type: 'sine', freq: 120, freqEnd: 42, attack: 0.004, dest: dest });
  }
  // caixa (só no boss): ruído médio com corpo
  function snare(t, dest) {
    ruido({ t: t, dur: 0.12, vol: 0.14, ftype: 'bandpass', f0: 1900, q: 0.9, dest: dest });
    tone({ t: t, dur: 0.06, vol: 0.1, type: 'triangle', freq: 210, freqEnd: 150, dest: dest });
  }
  // baixo: quadrada filtrada, curto e redondo
  function bassNote(t, midi, dur, dest) {
    tone({ t: t, dur: dur, vol: 0.2, type: 'square', freq: nf(midi),
           filtro: { type: 'lowpass', f0: 320, q: 1.1 }, dest: dest });
  }

  // bumbo abafado do pântano: nada de estalo — ruído passa-baixa bem grave
  // junto de um seno caindo devagar, o mais perto que dá de um "baque" de
  // bota afundando em lama, sem o ataque seco do kick() de praça.
  function bumboLama(t, dest) {
    ruido({ t: t, dur: 0.34, vol: 0.16, ftype: 'lowpass', f0: 260, f1: 55, q: 0.9, attack: 0.02, dest: dest });
    tone({ t: t, dur: 0.3, vol: 0.14, type: 'sine', freq: 65, freqEnd: 28, attack: 0.015, dest: dest });
  }

  // rangido esparso da mansão: sopro estreito de ruído, como madeira velha
  // se ajeitando — nunca ritmo, só atmosfera de longe em longe.
  function rangido(t, dest) {
    ruido({ t: t, dur: 0.5, vol: 0.045, ftype: 'bandpass', f0: 700, f1: 420, q: 3, attack: 0.15, dest: dest });
  }

  // -- agendadores por música: recebem o passo global e o instante 't' --

  function agendaOverworld(step, t, dest) {
    var s = step % 64;                 // posição dentro da volta
    var volta = Math.floor(step / 64); // quantas voltas completas já rodaram
    var compasso = Math.floor(s / 8);  // 0..7
    var dentro = s % 8;                // colcheia dentro do compasso
    var dur = SONGS.overworld.stepDur;

    // melodia principal (triangle, "flauta de praça") — alterna A/B por volta
    var mel = (volta % 2 === 0) ? OV_MEL_A : OV_MEL_B;
    if (mel[s]) {
      tone({ t: t, dur: dur * 1.8, vol: 0.15, type: 'triangle', freq: nf(mel[s]),
             attack: 0.01, dest: dest });
    }

    // contramelodia ocasional (voltas ímpares), suave e comprida
    if (volta % 2 === 1 && OV_CONTRA[s]) {
      tone({ t: t, dur: dur * 3.5, vol: 0.06, type: 'sine', freq: nf(OV_CONTRA[s]),
             attack: 0.04, dest: dest });
    }

    // baixo em bomba: fundamental nos tempos 1/3, quinta nos 2/4
    if (dentro % 2 === 0) {
      var raiz = OV_RAIZ[compasso];
      var midi = (dentro === 0 || dentro === 4) ? raiz : raiz + 7;
      bassNote(t, midi, dur * 1.6, dest);
    }

    // percussão: chimbal em todas as colcheias (contratempo mais forte),
    // bumbo surdo nos tempos 1 e 3
    hihat(t, (dentro % 2 === 1) ? 0.055 : 0.035, dest);
    if (dentro === 0 || dentro === 4) kick(t, dest);
  }

  function agendaBoss(step, t, dest) {
    var s = step % 64;
    var volta = Math.floor(step / 64);
    var compasso = Math.floor(s / 8);
    var dentro = s % 8;
    var dur = SONGS.boss.stepDur;

    // ostinato grave insistente — serra filtrada, toda colcheia
    var ost = BS_OST_SEQ[compasso][dentro];
    tone({ t: t, dur: dur * 1.1, vol: 0.17, type: 'sawtooth', freq: nf(ost),
           filtro: { type: 'lowpass', f0: 420, q: 1.4 }, attack: 0.004, dest: dest });

    // pedal dissonante: drone de trítono (ré#) sob o lá, renovado a cada
    // 2 compassos, bem baixo na mixagem — o desconforto vem daqui
    if (s % 16 === 0) {
      tone({ t: t, dur: dur * 16, vol: 0.04, type: 'sawtooth', freq: nf(39), // D#2
             filtro: { type: 'lowpass', f0: 300 }, attack: 0.3, dest: dest });
    }

    // melodia menor-harmônica pontuda (entra da 2ª volta em diante)
    if (volta >= 1 && BS_MEL[s]) {
      tone({ t: t, dur: dur * 1.4, vol: 0.12, type: 'square', freq: nf(BS_MEL[s]),
             attack: 0.006, filtro: { type: 'lowpass', f0: 2400 }, dest: dest });
    }

    // percussão pesada: bumbo sincopado (1, "e" do 2, 3), caixa nos 2 e 4,
    // chimbal cerrado em todas as colcheias
    if (dentro === 0 || dentro === 3 || dentro === 4) kick(t, dest);
    if (dentro === 2 || dentro === 6) snare(t, dest);
    hihat(t, (dentro % 2 === 0) ? 0.05 : 0.035, dest);
  }

  function agendaPantano(step, t, dest) {
    var s = step % 64;
    var compasso = Math.floor(s / 8);
    var dentro = s % 8;
    var dur = SONGS.pantano.stepDur;

    // pad sustentado o compasso inteiro: fundamental + 3ª + 5ª (uma oitava
    // acima, mais fracas) — vira cama harmônica, não só um baixo solitário
    if (dentro === 0) {
      var raiz = PT_RAIZ[compasso];
      tone({ t: t, dur: dur * 8, vol: 0.05, type: 'sawtooth', freq: nf(raiz),
             filtro: { type: 'lowpass', f0: 260 }, attack: 0.25, dest: dest });
      tone({ t: t, dur: dur * 8, vol: 0.03, type: 'sine', freq: nf(raiz + 3 + 12),
             attack: 0.3, dest: dest });
      tone({ t: t, dur: dur * 8, vol: 0.03, type: 'sine', freq: nf(raiz + 7 + 12),
             attack: 0.3, dest: dest });
    }

    // arpejo do acorde em colcheias pares, com portamento descendente de um
    // tom — cada nota "afunda" em vez de só parar, o que dá o ar "morosa"
    // mesmo com a grade metade preenchida (achado bom, não fica vazia)
    if (PT_MEL[s]) {
      tone({ t: t, dur: dur * 3, vol: 0.13, type: 'triangle', freq: nf(PT_MEL[s]),
             freqEnd: nf(PT_MEL[s] - 2), attack: 0.05, dest: dest });
    }

    // percussão: baque abafado nos tempos 1 e 3 — passo lento de duas patas
    // na lama, não um só baque solitário por compasso
    if (dentro === 0 || dentro === 4) bumboLama(t, dest);
  }

  function agendaMansao(step, t, dest) {
    var s = step % 64;
    var volta = Math.floor(step / 64);
    var dur = SONGS.mansao.stepDur;

    // drone de trítono (dó/fá#), renovado a cada 2 compassos, quase inaudível
    // — mesma ideia do pedal de ré# do boss, mas sustentado e bem mais baixo,
    // pra incomodar sem nunca se anunciar
    if (s % 16 === 0) {
      var raizDrone = (s % 32 === 0) ? 36 : 42; // alterna dó2 / fá#2 a cada 2 compassos
      tone({ t: t, dur: dur * 16, vol: 0.035, type: 'sine', freq: nf(raizDrone),
             filtro: { type: 'lowpass', f0: 300 }, attack: 0.6, dest: dest });
    }

    // pad de tríade sustentada (dó menor), renovado a cada 4 compassos e bem
    // baixo na mixagem — preenche o fundo pra não sobrar silêncio entre um
    // sino e outro, sem competir com o drone de trítono nem com o sino
    if (s % 32 === 0) {
      tone({ t: t, dur: dur * 32, vol: 0.025, type: 'sine', freq: nf(48), attack: 1.2, dest: dest });
      tone({ t: t, dur: dur * 32, vol: 0.02, type: 'sine', freq: nf(51), attack: 1.2, dest: dest });
      tone({ t: t, dur: dur * 32, vol: 0.02, type: 'sine', freq: nf(55), attack: 1.2, dest: dest });
    }

    // sino de caixinha de música: ataque lento, harmônico fraco por cima
    // (mesmo truque do SFX "lumi") — agora em arpejo constante (colcheias
    // pares), não mais isolado a 1-2 toques soltos por compasso
    if (MN_SINO[s]) {
      var f = nf(MN_SINO[s]);
      tone({ t: t, dur: dur * 6, vol: 0.1, type: 'sine', freq: f, attack: 0.05, dest: dest });
      tone({ t: t, dur: dur * 4, vol: 0.035, type: 'sine', freq: f * 2, attack: 0.05, dest: dest });
    }

    // rangido de madeira, bem de longe em longe (uma vez a cada 2 voltas) —
    // só pra lembrar que a casa está "viva", nunca virar ritmo
    if (volta % 2 === 0 && s === 40) rangido(t, dest);
  }

  function agendaColiseu(step, t, dest) {
    var s = step % 64;
    var compasso = Math.floor(s / 8);
    var dentro = s % 8;
    var dur = SONGS.coliseu.stepDur;

    // melodia marcial: serra filtrada como um metal de fanfarra grave, não a
    // flauta triangular da overworld nem a quadrada pontuda do boss
    if (CL_MEL[s]) {
      tone({ t: t, dur: dur * 1.3, vol: 0.14, type: 'sawtooth', freq: nf(CL_MEL[s]),
             filtro: { type: 'lowpass', f0: 1800 }, attack: 0.008, dest: dest });
    }

    // baixo andando, raiz nos tempos 1/3, quinta nos 2/4 — igual esqueleto
    // do "oom-pah" da overworld, mas mais curto e seco: aqui é marcha, não
    // valsinha de praça
    if (dentro % 2 === 0) {
      var raiz = CL_RAIZ[compasso];
      var midi = (dentro === 0 || dentro === 4) ? raiz : raiz + 7;
      bassNote(t, midi, dur * 1.1, dest);
    }

    // bateria de tambor de guerra: bumbo em galope (1, "e" do 2, 3, "e" do 4)
    // e caixa firme nos contratempos — mais insistente que a overworld, mas
    // sem a síncope caótica do boss, porque a luta final ainda não começou
    if (dentro === 0 || dentro === 3 || dentro === 4 || dentro === 7) kick(t, dest);
    if (dentro === 2 || dentro === 6) snare(t, dest);
    hihat(t, (dentro % 2 === 1) ? 0.045 : 0.03, dest);
  }

  // -- máquina do scheduler --
  var mus = {
    name: null,     // música pedida ('overworld' | 'boss' | null)
    timer: null,    // id do setInterval
    bus: null,      // GainNode da música atual (alvo dos fades)
    step: 0,        // passo global (nunca reseta dentro da mesma música)
    nextTime: 0,    // instante (relógio do AudioContext) do próximo passo
    started: false, // nextTime já foi ancorado no relógio?
  };

  function pararMusica() {
    if (mus.timer) { clearInterval(mus.timer); mus.timer = null; }
    if (mus.bus) {
      var bus = mus.bus;
      mus.bus = null;
      try {
        var t = actx.currentTime;
        bus.gain.cancelScheduledValues(t);
        bus.gain.setValueAtTime(Math.max(FLOOR, bus.gain.value), t);
        bus.gain.exponentialRampToValueAtTime(FLOOR, t + FADE); // fade out ~0.4s
        setTimeout(function () {
          try { bus.disconnect(); } catch (e) {}
        }, (FADE + 0.15) * 1000);
      } catch (e) {
        try { bus.disconnect(); } catch (e2) {}
      }
    }
    mus.name = null;
    mus.started = false;
    mus.step = 0;
  }

  function tickMusica() {
    try {
      var song = SONGS[mus.name];
      if (!song || !mus.bus) return;
      // o resume() do init é assíncrono: enquanto o contexto não roda,
      // não agenda nada (e não ancora o relógio)
      if (!running()) { mus.started = false; return; }
      var now = actx.currentTime;
      if (!mus.started || mus.nextTime < now - 0.1) {
        // primeira vez, ou a aba dormiu: re-ancora sem despejar passos atrasados
        mus.nextTime = now + 0.06;
        mus.started = true;
      }
      while (mus.nextTime < now + LOOKAHEAD) {
        song.agenda(mus.step, mus.nextTime, mus.bus);
        mus.step++;
        mus.nextTime += song.stepDur;
      }
    } catch (e) { /* um tick ruim não mata a trilha nem o jogo */ }
  }

  function music(name) {
    try {
      if (!actx) return;                    // init ainda não rodou: no-op
      if (name === mus.name) return;        // mesma música: não reinicia
      pararMusica();                        // fade out do que tocava (se algo)
      if (!name || !SONGS[name]) return;    // music(null) ou nome desconhecido: só para

      mus.name = name;
      mus.step = 0;
      mus.started = false;

      // bus próprio com fade in curto, ligado ao master
      var bus = actx.createGain();
      bus.gain.setValueAtTime(FLOOR, actx.currentTime);
      bus.gain.exponentialRampToValueAtTime(1, actx.currentTime + 0.25);
      bus.connect(master);
      mus.bus = bus;

      mus.timer = setInterval(tickMusica, TICK_MS);
      tickMusica(); // primeiro agendamento sem esperar 50ms
    } catch (e) { /* silêncio */ }
  }

  // ------------------------------------------------------------------ API --
  // ativo(): o contexto está mesmo tocando? É o que deixa o HUD dizer "mudo"
  // em vez de o jogador ficar adivinhando se o som quebrou ou se é o aparelho.
  // Atenção: 'running' quer dizer que o WebAudio está tocando, não que sai som
  // pelo alto-falante — o botão de silencioso do iPhone corta depois disto.
  FG.audio = { init: init, sfx: sfx, music: music, ativo: running };
})();
