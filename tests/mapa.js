// Desenha a fase inteira num SVG esquemático — o jeito rápido de olhar o
// traçado sem jogar: relevo, perigos, lumis, checkpoints, inimigos e os
// obstáculos dinâmicos, tudo em escala.
//
// Uso: node tests/mapa.js [fase] > mapa.svg   — fase = índice em FG.levels (default 0)
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');

// levelkit.js vem antes: é a única dependência de load do projeto (kit → fase).
// As fases entram na ordem do index.html e se registram em FG.levels; as que
// ainda não existem no disco são simplesmente puladas.
const win = { FG: {} };
const doc = { createElement: () => ({ getContext: () => ({}) }), getElementById: () => null };
const ARQS = ['levelkit.js', 'level.js', 'level2.js', 'level3.js'];
for (const f of ARQS) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) continue;
  new Function('window', 'document', 'FG', fs.readFileSync(p, 'utf8'))(win, doc, win.FG);
}
const FASE = Number(process.argv[2] || 0);
const levels = win.FG.levels || [];
const L = levels[FASE];
if (!L) {
  console.error('fase %s não existe — carregadas %d: [%s]',
    process.argv[2], levels.length, levels.map((l, i) => i + '=' + l.id).join(', '));
  process.exit(1);
}

const SC = 0.28;                       // escala do desenho
const W = Math.round(L.W * SC), H = Math.round(L.H * SC) + 46;
const CORES = {
  g: '#5b3a22', r: '#5d5348', c: '#6b7280', i: '#4a6b52', h: '#2a2a2a',
};
const NOMES = {
  g: 'terra', r: 'pedra', c: 'penhasco', i: 'ilha flutuante', h: 'piso oculto',
};

const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
out.push(`<rect width="${W}" height="${H}" fill="#1a1228"/>`);

// grade a cada 500px de mundo
for (let x = 0; x <= L.W; x += 500) {
  const sx = x * SC;
  out.push(`<line x1="${sx}" y1="0" x2="${sx}" y2="${L.H * SC}" stroke="#ffffff14"/>`);
  out.push(`<text x="${sx + 2}" y="10" fill="#ffffff55" font-size="9" font-family="monospace">${x}</text>`);
}

// sólidos
for (const s of L.solids) {
  const cor = CORES[s.k] || '#888';
  const op = s.k === 'h' ? 0.35 : 1;
  out.push(`<rect x="${s.x * SC}" y="${s.y * SC}" width="${s.w * SC}" height="${s.h * SC}" fill="${cor}" opacity="${op}"/>`);
}
// perigos
for (const hz of L.hazards) {
  const cor = hz.t === 'p' ? '#4ade4a' : '#e0e0c0';
  out.push(`<rect x="${hz.x * SC}" y="${hz.y * SC}" width="${hz.w * SC}" height="${hz.h * SC}" fill="${cor}" opacity="0.85"/>`);
}
// lumis (o level não expõe; recontamos pelo padrão de coleta se existir)
// checkpoints
for (const c of L.checkpoints) {
  out.push(`<circle cx="${c.x * SC}" cy="${c.y * SC}" r="4" fill="#ffd870"/>`);
  out.push(`<line x1="${c.x * SC}" y1="${c.y * SC}" x2="${c.x * SC}" y2="${(c.y - 90) * SC}" stroke="#ffd870" stroke-width="1.5"/>`);
}
// inimigos
for (const e of L.enemyDefs || []) {
  const cor = e.type === 'espinhoco' ? '#a855f7' : e.type === 'voadeira' ? '#93c5fd' : '#a3e635';
  out.push(`<circle cx="${e.x * SC}" cy="${e.y * SC}" r="3.5" fill="${cor}"/>`);
}
// obstáculos
const OB = {
  plataforma: '#38bdf8', desmorona: '#f59e0b', sopro: '#fb923c',
  pendulo: '#e879f9', espinhorolo: '#ef4444',
};
for (const o of L.obstacleDefs || []) {
  const cor = OB[o.type] || '#fff';
  const x = o.x * SC, y = o.y * SC;
  if (o.type === 'sopro') {
    out.push(`<rect x="${x}" y="${y * 1}" width="${(o.w || 60) * SC}" height="${(o.h || 200) * SC}" fill="${cor}" opacity="0.3"/>`);
  } else if (o.type === 'plataforma') {
    out.push(`<line x1="${x}" y1="${y}" x2="${(o.x + (o.dx || 0)) * SC}" y2="${(o.y + (o.dy || 0)) * SC}" stroke="${cor}" stroke-width="1.5" stroke-dasharray="3,2"/>`);
    out.push(`<rect x="${x}" y="${y - 2}" width="${(o.w || 100) * SC}" height="4" fill="${cor}"/>`);
  } else if (o.type === 'pendulo') {
    out.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${(o.y + (o.len || 150)) * SC}" stroke="${cor}" stroke-width="1"/>`);
    out.push(`<circle cx="${x}" cy="${(o.y + (o.len || 150)) * SC}" r="4" fill="${cor}"/>`);
  } else {
    out.push(`<rect x="${x}" y="${y - 3}" width="${Math.max(6, (o.w || 40) * SC)}" height="6" fill="${cor}"/>`);
  }
}
// início e gatilho do chefão
out.push(`<circle cx="${L.playerStart.x * SC}" cy="${L.playerStart.y * SC}" r="5" fill="#fff"/>`);
out.push(`<line x1="${L.bossTriggerX * SC}" y1="0" x2="${L.bossTriggerX * SC}" y2="${L.H * SC}" stroke="#ef4444" stroke-width="2"/>`);

// legenda
let lx = 6;
const legenda = [];
for (const k of Object.keys(NOMES)) if (L.solids.some((s) => s.k === k)) legenda.push([NOMES[k], CORES[k]]);
for (const t of Object.keys(OB)) if ((L.obstacleDefs || []).some((o) => o.type === t)) legenda.push([t, OB[t]]);
const ly = L.H * SC + 18;
for (const [nome, cor] of legenda) {
  out.push(`<rect x="${lx}" y="${ly}" width="10" height="10" fill="${cor}"/>`);
  out.push(`<text x="${lx + 14}" y="${ly + 9}" fill="#ddd" font-size="11" font-family="sans-serif">${nome}</text>`);
  lx += 26 + nome.length * 7;
}
out.push(`<text x="6" y="${ly + 28}" fill="#888" font-size="11" font-family="sans-serif">mundo ${L.W}x${L.H} · ${L.solids.length} sólidos · ${(L.obstacleDefs || []).length} obstáculos · ${(L.enemyDefs || []).length} inimigos</text>`);
out.push('</svg>');
process.stdout.write(out.join('\n'));
