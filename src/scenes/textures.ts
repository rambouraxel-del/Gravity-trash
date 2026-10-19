// Textures procédurales (Canvas 2D, dessinées à 2× pour la netteté).
// Chaque asset est une source séparée : pour le remplacer par une image, charger une texture
// portant la même clé (voir README) — `ensure` ne dessine que si la clé n'existe pas déjà.
import Phaser from 'phaser';
import { ITEM_INFO, type ResourceId } from '../config/items';
import { mulberry32 } from '../logic/rng';

const TEX = 2;

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function ensure(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w * TEX, h * TEX);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.scale(TEX, TEX);
  draw(ctx, w, h);
  tex.refresh();
}

function poly(ctx: CanvasRenderingContext2D, pts: number[][]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

function drawShip(ctx: CanvasRenderingContext2D): void {
  // propulseurs
  for (const x of [11, 23]) {
    ctx.fillStyle = '#7a3b0e';
    ctx.fillRect(x, 39, 6, 6);
    ctx.fillStyle = '#ff9a3c';
    ctx.fillRect(x + 1, 43, 4, 2);
  }
  // branches d'aimant
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#c9d3e8';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(10.5, 25); ctx.lineTo(6.5, 19); ctx.lineTo(5.5, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(29.5, 25); ctx.lineTo(33.5, 19); ctx.lineTo(34.5, 7); ctx.stroke();
  for (const x of [5.5, 34.5]) {
    const g = ctx.createRadialGradient(x, 5, 0, x, 5, 6);
    g.addColorStop(0, 'rgba(160,250,255,1)');
    g.addColorStop(1, 'rgba(62,230,240,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, 5, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3ee6f0';
    ctx.beginPath(); ctx.arc(x, 5, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  // coque
  const body = new Path2D('M20 8 C27 8 30.5 16 30.5 26 L30.5 38 Q30.5 41 27.5 41 L12.5 41 Q9.5 41 9.5 38 L9.5 26 C9.5 16 13 8 20 8 Z');
  const g = ctx.createLinearGradient(9, 0, 31, 0);
  g.addColorStop(0, '#d9c9a6');
  g.addColorStop(0.45, '#f8ecd2');
  g.addColorStop(1, '#cdbb96');
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = '#ff9a3c';
  ctx.fillRect(8, 31, 24, 4.5);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(8, 36, 24, 6);
  ctx.restore();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(70,50,20,0.55)';
  ctx.stroke(body);
  // cockpit
  ctx.fillStyle = '#143556';
  ctx.beginPath(); ctx.ellipse(20, 19.5, 4.8, 6.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(150,220,255,0.7)';
  ctx.beginPath(); ctx.ellipse(18.6, 17.2, 1.6, 2.6, -0.2, 0, Math.PI * 2); ctx.fill();
}

function drawStation(ctx: CanvasRenderingContext2D, w: number): void {
  const c = w / 2;
  const oct = (r: number, rot = Math.PI / 8) => {
    const pts: number[][] = [];
    for (let i = 0; i < 8; i++) pts.push([c + Math.cos(rot + (i * Math.PI) / 4) * r, c + Math.sin(rot + (i * Math.PI) / 4) * r]);
    return pts;
  };
  // panneaux
  ctx.fillStyle = '#243a6b';
  for (const [x, y, ww, hh] of [[c - 5, 4, 10, 16], [c - 5, w - 20, 10, 16], [4, c - 5, 16, 10], [w - 20, c - 5, 16, 10]]) {
    ctx.fillRect(x, y, ww, hh);
    ctx.strokeStyle = '#4c6aa8';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1);
  }
  const g = ctx.createRadialGradient(c, c, 4, c, c, 48);
  g.addColorStop(0, '#2a3f6e');
  g.addColorStop(1, '#141f3c');
  poly(ctx, oct(46));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#5a7bc0';
  ctx.stroke();
  poly(ctx, oct(33, 0));
  ctx.fillStyle = '#0d1630';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#3d5a99';
  ctx.stroke();
  // feux
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x = c + Math.cos(a) * 40;
    const y = c + Math.sin(a) * 40;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, 5);
    rg.addColorStop(0, 'rgba(160,250,255,1)');
    rg.addColorStop(1, 'rgba(62,230,240,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  }
  // quai central
  ctx.fillStyle = '#16264a';
  ctx.beginPath(); ctx.arc(c, c, 17, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ff9a3c';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.arc(c, c, 12, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
}

function lumpyPath(ctx: CanvasRenderingContext2D, rng: () => number, cx: number, cy: number, r: number, n: number, amp: number): void {
  const pts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - amp + rng() * amp * 2);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  ctx.beginPath();
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  ctx.closePath();
}

/** Obstacle stérile : roche sombre à pointes, contour corail et hachures. */
function drawObstacle(ctx: CanvasRenderingContext2D, variant: number): void {
  const rng = mulberry32(300 + variant * 29);
  const c = 50;
  const spikes = 11 + variant;
  const pts: number[][] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const outer = i % 2 === 0;
    const rr = outer ? 44 + rng() * 4 : 31 + rng() * 5;
    pts.push([c + Math.cos(a) * rr, c + Math.sin(a) * rr]);
  }
  const g = ctx.createRadialGradient(c - 8, c - 8, 4, c, c, 48);
  g.addColorStop(0, '#2b2540');
  g.addColorStop(1, '#120f1f');
  poly(ctx, pts);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ff6b5e';
  ctx.stroke();
  // hachures de danger
  ctx.save();
  poly(ctx, pts);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,107,94,0.32)';
  ctx.lineWidth = 3;
  for (let x = -60; x < 160; x += 14) {
    ctx.beginPath(); ctx.moveTo(x, 100); ctx.lineTo(x + 70, 30); ctx.stroke();
  }
  ctx.restore();
  // marque centrale
  ctx.strokeStyle = '#ff6b5e';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(c - 9, c - 9); ctx.lineTo(c + 9, c + 9); ctx.moveTo(c + 9, c - 9); ctx.lineTo(c - 9, c + 9); ctx.stroke();
}

function drawStars(ctx: CanvasRenderingContext2D, seed: number, count: number, maxR: number): void {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = rng() * 256;
    const y = rng() * 256;
    const r = 0.5 + rng() * maxR;
    const hue = rng();
    const col = hue < 0.7 ? '255,255,255' : hue < 0.85 ? '170,200,255' : '255,220,180';
    ctx.fillStyle = `rgba(${col},${0.35 + rng() * 0.6})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

const css = (c: number) => '#' + c.toString(16).padStart(6, '0');
const lighten = (c: number, f: number) => {
  const r = Math.min(255, ((c >> 16) & 255) + 255 * f);
  const g = Math.min(255, ((c >> 8) & 255) + 255 * f);
  const b = Math.min(255, (c & 255) + 255 * f);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
};
const darken = (c: number, f: number) => `rgb(${(((c >> 16) & 255) * (1 - f)) | 0},${(((c >> 8) & 255) * (1 - f)) | 0},${((c & 255) * (1 - f)) | 0})`;

/** Fragment libre : une silhouette propre à chaque matière (forme, pas seulement couleur). */
function drawFragment(ctx: CanvasRenderingContext2D, res: ResourceId, variant: number): void {
  const col = ITEM_INFO[res].color;
  const rng = mulberry32(res.length * 31 + variant * 7 + 3);
  const c = 9;
  const glow = ctx.createRadialGradient(c, c, 1, c, c, 9);
  glow.addColorStop(0, `rgba(${(col >> 16) & 255},${(col >> 8) & 255},${col & 255},0.38)`);
  glow.addColorStop(1, `rgba(${(col >> 16) & 255},${(col >> 8) & 255},${col & 255},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 18, 18);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.9;
  const stroke = 'rgba(255,255,255,0.6)';
  switch (res) {
    case 'rock': {
      lumpyPath(ctx, rng, c, c, 6, 7, 0.22);
      ctx.fillStyle = css(col);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(7, 7, 2.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'scrap': {
      poly(ctx, [[3, 5], [13, 3], [16, 11], [7, 15], [2, 11]]);
      ctx.fillStyle = css(col);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,30,10,0.55)';
      ctx.beginPath(); ctx.arc(6.5, 8.5, 1.3, 0, Math.PI * 2); ctx.arc(12, 7, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,190,0.7)';
      ctx.beginPath(); ctx.moveTo(4, 6); ctx.lineTo(12, 4.4); ctx.stroke();
      break;
    }
    case 'ice': {
      poly(ctx, [[9, 1.5], [15, 5], [15, 12], [9, 16.5], [3, 12], [3, 5]]);
      ctx.fillStyle = css(col);
      ctx.fill();
      poly(ctx, [[9, 1.5], [15, 5], [9, 9]]);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fill();
      break;
    }
    case 'crystal': {
      for (const [x, y, w, h, rot] of [[9, 9, 3.4, 9, 0], [5.5, 11, 2.4, 6, -0.5], [12.5, 11, 2.4, 6, 0.5]]) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        poly(ctx, [[0, -h], [w, 0], [0, h * 0.6], [-w, 0]]);
        ctx.fillStyle = lighten(col, 0.05);
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'circuits': {
      ctx.fillStyle = darken(col, 0.55);
      ctx.fillRect(3, 3, 12, 12);
      ctx.strokeStyle = css(col);
      ctx.lineWidth = 1.1;
      ctx.strokeRect(3.5, 3.5, 11, 11);
      ctx.beginPath();
      ctx.moveTo(5, 9); ctx.lineTo(8, 9); ctx.lineTo(9, 6); ctx.lineTo(13, 6);
      ctx.moveTo(5, 12); ctx.lineTo(11, 12); ctx.lineTo(13, 10);
      ctx.stroke();
      ctx.fillStyle = css(col);
      for (const x of [5, 8, 11, 14]) ctx.fillRect(x - 0.5, 1.5, 1, 2);
      break;
    }
    case 'cores': {
      const g = ctx.createRadialGradient(9, 9, 1, 9, 9, 6.5);
      g.addColorStop(0, '#fff6d8');
      g.addColorStop(0.5, css(col));
      g.addColorStop(1, darken(col, 0.4));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(9, 9, 6.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,200,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(9, 9, 8, 3, 0.5, 0, Math.PI * 2); ctx.stroke();
      break;
    }
  }
}

/** Gisement : masse bosselée, teintée selon la matière, avec des repères de forme propres. */
function drawDeposit(ctx: CanvasRenderingContext2D, res: ResourceId, variant: number): void {
  const col = ITEM_INFO[res].color;
  const rng = mulberry32(900 + variant * 13 + res.length * 17);
  const c = 32;
  const halo = ctx.createRadialGradient(c, c, 14, c, c, 32);
  halo.addColorStop(0, `rgba(${(col >> 16) & 255},${(col >> 8) & 255},${col & 255},0)`);
  halo.addColorStop(0.75, `rgba(${(col >> 16) & 255},${(col >> 8) & 255},${col & 255},0.2)`);
  halo.addColorStop(1, `rgba(${(col >> 16) & 255},${(col >> 8) & 255},${col & 255},0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 64, 64);
  lumpyPath(ctx, rng, c, c, 25, 11, 0.13);
  const g = ctx.createRadialGradient(24, 22, 3, c, c, 30);
  g.addColorStop(0, res === 'scrap' ? '#7a5a40' : res === 'ice' ? '#7aa4c0' : '#7b8196');
  g.addColorStop(1, res === 'scrap' ? '#3a2a22' : res === 'ice' ? '#2c4a68' : '#3a3f54');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(210,220,240,0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  const mark = (x: number, y: number, s: number, rot: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (res === 'rock') {
      poly(ctx, [[-s, s * 0.4], [-s * 0.3, -s], [s, -s * 0.2], [s * 0.4, s]]);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
    } else if (res === 'scrap') {
      ctx.fillStyle = css(col);
      ctx.fillRect(-s, -s * 0.5, s * 2, s);
      ctx.strokeStyle = 'rgba(40,20,10,0.7)';
      ctx.strokeRect(-s, -s * 0.5, s * 2, s);
    } else if (res === 'ice') {
      poly(ctx, [[0, -s * 1.5], [s * 0.9, 0], [0, s * 1.1], [-s * 0.9, 0]]);
      ctx.fillStyle = 'rgba(210,245,255,0.85)';
      ctx.fill();
    } else if (res === 'crystal') {
      poly(ctx, [[0, -s * 1.7], [s * 0.8, 0], [0, s * 1.2], [-s * 0.8, 0]]);
      ctx.fillStyle = css(col);
      ctx.fill();
      ctx.strokeStyle = '#f0e6ff';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    } else if (res === 'circuits') {
      ctx.fillStyle = darken(col, 0.55);
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.strokeStyle = css(col);
      ctx.lineWidth = 0.9;
      ctx.strokeRect(-s, -s, s * 2, s * 2);
    } else {
      const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.4);
      gg.addColorStop(0, '#fff6d8');
      gg.addColorStop(1, css(col));
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(0, 0, s * 1.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };
  const n = 4 + (variant % 2);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = 5 + rng() * 14;
    mark(c + Math.cos(a) * d, c + Math.sin(a) * d, 2.6 + rng() * 2, rng() * Math.PI);
  }
}

/** Grande épave : coque brisée, plaques rouillées, hublots allumés. */
function drawWreck(ctx: CanvasRenderingContext2D, variant: number): void {
  const rng = mulberry32(555 + variant * 41);
  const w = 140;
  const h = 140;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.4 + variant * 0.5);
  const hull = new Path2D('M-52 -10 L-30 -22 L26 -20 L52 -6 L52 8 L30 20 L-34 20 L-52 8 Z');
  const g = ctx.createLinearGradient(0, -22, 0, 22);
  g.addColorStop(0, '#5a5f78');
  g.addColorStop(1, '#2a2d3e');
  ctx.fillStyle = g;
  ctx.fill(hull);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#ff9a3c';
  ctx.stroke(hull);
  ctx.fillStyle = 'rgba(120,70,40,0.55)';
  for (let i = 0; i < 6; i++) ctx.fillRect(-48 + rng() * 90, -16 + rng() * 26, 8 + rng() * 14, 4 + rng() * 6);
  // déchirure
  ctx.fillStyle = '#0a0a12';
  poly(ctx, [[-6, -22], [8, -4], [2, 6], [14, 20], [-12, 20], [-14, 0]]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,154,60,0.8)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // hublots
  for (let i = 0; i < 5; i++) {
    const x = -42 + i * 9 + (i > 2 ? 28 : 0);
    ctx.fillStyle = rng() < 0.5 ? '#ffd27a' : '#2a2d3e';
    ctx.beginPath(); ctx.arc(x, -6, 2, 0, Math.PI * 2); ctx.fill();
  }
  // aileron cassé
  ctx.fillStyle = '#3a3e55';
  poly(ctx, [[-30, 20], [-52, 40], [-22, 36], [-12, 20]]);
  ctx.fill();
  ctx.strokeStyle = '#ff9a3c';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

/** Objet lourd : conteneur à bandes de sécurité. */
function drawContainer(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, 50);
  g.addColorStop(0, '#6a7090');
  g.addColorStop(1, '#3a3f58');
  ctx.fillStyle = g;
  ctx.fillRect(8, 8, 44, 34);
  ctx.strokeStyle = '#ffd27a';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, 44, 34);
  ctx.save();
  ctx.beginPath(); ctx.rect(8, 8, 44, 34); ctx.clip();
  ctx.strokeStyle = 'rgba(255,210,122,0.8)';
  ctx.lineWidth = 4;
  for (let x = -10; x < 70; x += 12) { ctx.beginPath(); ctx.moveTo(x, 44); ctx.lineTo(x + 24, 6); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = '#3ee6f0';
  ctx.beginPath(); ctx.arc(14, 14, 2.2, 0, Math.PI * 2); ctx.arc(46, 36, 2.2, 0, Math.PI * 2); ctx.fill();
}

function drawDrone(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(14, 13, 1, 14, 14, 12);
  g.addColorStop(0, '#fff0d0');
  g.addColorStop(1, '#c9b48a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(14, 14, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3ee6f0';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(3, 14); ctx.lineTo(8, 14); ctx.moveTo(20, 14); ctx.lineTo(25, 14); ctx.stroke();
  ctx.fillStyle = '#3ee6f0';
  ctx.beginPath(); ctx.arc(3, 14, 2, 0, Math.PI * 2); ctx.arc(25, 14, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#143556';
  ctx.beginPath(); ctx.arc(14, 13, 2.6, 0, Math.PI * 2); ctx.fill();
}

/** Module de la station : le niveau (1-3) ajoute des éléments visibles. */
function drawModule(ctx: CanvasRenderingContext2D, id: string, lvl: number): void {
  const W = 130;
  const cx = W / 2;
  const edge = '#5a7bc0';
  const lights = (pts: number[][]) => {
    for (const [x, y] of pts) {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, 5);
      rg.addColorStop(0, 'rgba(160,250,255,1)');
      rg.addColorStop(1, 'rgba(62,230,240,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
  };
  ctx.lineJoin = 'round';
  const plate = (x: number, y: number, w: number, h: number, fill = '#1d2c52') => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x + 0.8, y + 0.8, w - 1.6, h - 1.6);
  };
  switch (id) {
    case 'workshop': {
      plate(cx - 40, 46, 80, 40, '#243a6b');
      ctx.fillStyle = '#2d4a85';
      ctx.beginPath(); ctx.arc(cx, 46, 26, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = edge; ctx.stroke();
      ctx.strokeStyle = '#ff9a3c';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx + 18, 40); ctx.lineTo(cx + 44, 20); ctx.lineTo(cx + 54, 28); ctx.stroke();
      if (lvl >= 2) { plate(cx - 62, 56, 22, 26); plate(cx + 40, 56, 22, 26); }
      if (lvl >= 3) { ctx.strokeStyle = '#7ff3f8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 20, 20); ctx.lineTo(cx - 20, 40); ctx.moveTo(cx - 28, 24); ctx.lineTo(cx - 12, 24); ctx.stroke(); }
      lights([[cx - 28, 66], [cx, 66], [cx + 28, 66], ...(lvl >= 2 ? [[cx - 52, 66], [cx + 52, 66]] : [])]);
      break;
    }
    case 'warehouse': {
      const rows = lvl;
      for (let r = 0; r < rows; r++) {
        plate(cx - 44 + r * 6, 78 - r * 22, 88 - r * 12, 20, r % 2 ? '#24407a' : '#1d2c52');
        ctx.strokeStyle = '#ffd27a';
        ctx.lineWidth = 2;
        for (let x = cx - 36 + r * 6; x < cx + 36; x += 16) { ctx.beginPath(); ctx.moveTo(x, 80 - r * 22); ctx.lineTo(x + 8, 96 - r * 22); ctx.stroke(); }
      }
      lights([[cx - 40, 92], [cx + 40, 92]]);
      break;
    }
    case 'refinery': {
      const tanks = lvl + 1;
      for (let i = 0; i < tanks; i++) {
        const x = tanks === 1 ? cx : cx - 40 + i * (80 / (tanks - 1));
        plate(x - 12, 44, 24, 46, '#2a3f6e');
        ctx.fillStyle = '#ff9a3c';
        ctx.fillRect(x - 12, 60 + (i % 2) * 6, 24, 4);
      }
      plate(cx - 10, 24, 20, 20, '#3a4f80');
      const glow = ctx.createRadialGradient(cx, 20, 0, cx, 20, 14);
      glow.addColorStop(0, 'rgba(255,154,60,0.9)');
      glow.addColorStop(1, 'rgba(255,154,60,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(cx, 20, 14, 0, Math.PI * 2); ctx.fill();
      lights([[cx - 30, 94], [cx + 30, 94]]);
      break;
    }
    case 'office': {
      const floors = 1 + lvl;
      for (let f = 0; f < floors; f++) plate(cx - 28, 86 - (f + 1) * 20, 56, 20, '#24407a');
      ctx.fillStyle = 'rgba(160,230,255,0.75)';
      for (let f = 0; f < floors; f++) for (let k = 0; k < 4; k++) ctx.fillRect(cx - 22 + k * 13, 86 - (f + 1) * 20 + 6, 8, 8);
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 2;
      const top = 86 - floors * 20;
      ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, top - 14); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx + 10, top - 12, 12, 5, -0.5, 0, Math.PI * 2); ctx.stroke();
      lights([[cx - 28, 86], [cx + 28, 86]]);
      break;
    }
    case 'hangar': {
      plate(cx - 52, 52, 104, 38, '#1d2c52');
      ctx.fillStyle = '#0a1430';
      ctx.beginPath(); ctx.arc(cx, 90, 26, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#7ff3f8';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (lvl >= 2) { plate(cx - 62, 44, 14, 46); plate(cx + 48, 44, 14, 46); }
      if (lvl >= 3) { ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 40, 52); ctx.lineTo(cx - 40, 30); ctx.lineTo(cx + 40, 30); ctx.lineTo(cx + 40, 52); ctx.stroke(); }
      lights([[cx - 44, 62], [cx + 44, 62], [cx, 60]]);
      break;
    }
  }
}

function drawEmptySlot(ctx: CanvasRenderingContext2D): void {
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = 'rgba(62,230,240,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 36, 98, 58);
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(62,230,240,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(65, 54); ctx.lineTo(65, 76); ctx.moveTo(54, 65); ctx.lineTo(76, 65); ctx.stroke();
}

function drawRelay(ctx: CanvasRenderingContext2D, built: boolean): void {
  const cx = 70;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = built ? '#ffd27a' : 'rgba(142,160,196,0.5)';
  ctx.lineWidth = built ? 3 : 1.5;
  if (!built) ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(cx - 30, 120); ctx.lineTo(cx, 20); ctx.lineTo(cx + 30, 120); ctx.moveTo(cx - 18, 80); ctx.lineTo(cx + 18, 80); ctx.moveTo(cx - 10, 50); ctx.lineTo(cx + 10, 50); ctx.stroke();
  ctx.setLineDash([]);
  if (built) {
    const g = ctx.createRadialGradient(cx, 20, 0, cx, 20, 18);
    g.addColorStop(0, '#fff6d8');
    g.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, 20, 18, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3ee6f0';
    ctx.lineWidth = 2;
    for (const r of [12, 20, 28]) { ctx.beginPath(); ctx.arc(cx, 20, r, -2.2, -0.9); ctx.stroke(); }
  }
}

export function generateTextures(scene: Phaser.Scene): void {
  ensure(scene, 'ship', 40, 48, (ctx) => drawShip(ctx));
  ensure(scene, 'station', 100, 100, (ctx, w) => drawStation(ctx, w));
  for (const res of ['rock', 'scrap', 'ice', 'crystal', 'circuits', 'cores'] as ResourceId[]) {
    for (let v = 0; v < 3; v++) ensure(scene, `frag_${res}_${v}`, 18, 18, (ctx) => drawFragment(ctx, res, v));
    for (let v = 0; v < 2; v++) ensure(scene, `dep_${res}_${v}`, 64, 64, (ctx) => drawDeposit(ctx, res, v));
  }
  for (let v = 0; v < 3; v++) {
    ensure(scene, `obs${v}`, 100, 100, (ctx) => drawObstacle(ctx, v));
    ensure(scene, `wreck${v}`, 140, 140, (ctx) => drawWreck(ctx, v));
  }
  ensure(scene, 'container', 60, 50, (ctx) => drawContainer(ctx));
  ensure(scene, 'drone', 28, 28, (ctx) => drawDrone(ctx));
  for (const id of ['workshop', 'warehouse', 'refinery', 'office', 'hangar']) {
    for (let l = 1; l <= 3; l++) ensure(scene, `mod_${id}_${l}`, 130, 110, (ctx) => drawModule(ctx, id, l));
  }
  ensure(scene, 'slot_empty', 130, 110, (ctx) => drawEmptySlot(ctx));
  ensure(scene, 'relay_scaffold', 140, 130, (ctx) => drawRelay(ctx, false));
  ensure(scene, 'relay_built', 140, 130, (ctx) => drawRelay(ctx, true));
  ensure(scene, 'stars1', 256, 256, (ctx) => drawStars(ctx, 11, 70, 0.9));
  ensure(scene, 'stars2', 256, 256, (ctx) => drawStars(ctx, 29, 28, 1.5));
  ensure(scene, 'glow', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  ensure(scene, 'spark', 16, 16, (ctx) => {
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 16);
  });
}
