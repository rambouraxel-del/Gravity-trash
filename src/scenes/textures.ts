// Textures procédurales (Canvas 2D, dessinées à 2× pour la netteté).
// Chaque asset est une source séparée : pour le remplacer par une image, charger une texture
// portant la même clé (voir README) — `ensure` ne dessine que si la clé n'existe pas déjà.
import Phaser from 'phaser';
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

function drawFragment(ctx: CanvasRenderingContext2D, variant: number): void {
  const palettes = [
    ['#e9eefb', '#b4bfd6', '#8591ab'],
    ['#f3e7d2', '#c9b79a', '#9a8a70'],
    ['#dcecf5', '#a9c0d1', '#7b93a8'],
  ][variant];
  const glow = ctx.createRadialGradient(9, 9, 1, 9, 9, 9);
  glow.addColorStop(0, 'rgba(180,230,255,0.35)');
  glow.addColorStop(1, 'rgba(180,230,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 18, 18);
  const pts = [[9, 2], [15.5, 6.5], [13.5, 14.5], [5.5, 15.5], [2.5, 7.5]];
  poly(ctx, pts);
  ctx.fillStyle = palettes[1];
  ctx.fill();
  poly(ctx, [[9, 2], [15.5, 6.5], [9, 9.5]]);
  ctx.fillStyle = palettes[0];
  ctx.fill();
  poly(ctx, [[9, 9.5], [13.5, 14.5], [5.5, 15.5]]);
  ctx.fillStyle = palettes[2];
  ctx.fill();
  poly(ctx, pts);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
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

/** Gisement exploitable : roche ronde et bosselée, veines et cristaux cyan. */
function drawDeposit(ctx: CanvasRenderingContext2D, variant: number): void {
  const rng = mulberry32(900 + variant * 13);
  const c = 32;
  const halo = ctx.createRadialGradient(c, c, 14, c, c, 32);
  halo.addColorStop(0, 'rgba(62,230,240,0.0)');
  halo.addColorStop(0.75, 'rgba(62,230,240,0.16)');
  halo.addColorStop(1, 'rgba(62,230,240,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 64, 64);
  lumpyPath(ctx, rng, c, c, 25, 11, 0.13);
  const g = ctx.createRadialGradient(24, 22, 3, c, c, 30);
  g.addColorStop(0, '#7b8196');
  g.addColorStop(1, '#3a3f54');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#9aa3bd';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // veines
  ctx.strokeStyle = 'rgba(62,230,240,0.55)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    let x = 14 + rng() * 10;
    let y = 14 + rng() * 10;
    ctx.moveTo(x, y);
    for (let s = 0; s < 3; s++) {
      x += 6 + rng() * 6;
      y += 5 + rng() * 7;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // cristaux
  const crystals = 4 + (variant % 2);
  for (let i = 0; i < crystals; i++) {
    const a = rng() * Math.PI * 2;
    const d = 6 + rng() * 14;
    const x = c + Math.cos(a) * d;
    const y = c + Math.sin(a) * d;
    const s = 3 + rng() * 2.5;
    const rot = rng() * Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    poly(ctx, [[0, -s * 1.6], [s * 0.8, 0], [0, s * 1.2], [-s * 0.8, 0]]);
    ctx.fillStyle = '#7ff3f8';
    ctx.fill();
    ctx.strokeStyle = '#e6feff';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.restore();
  }
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

export function generateTextures(scene: Phaser.Scene): void {
  ensure(scene, 'ship', 40, 48, (ctx) => drawShip(ctx));
  ensure(scene, 'station', 100, 100, (ctx, w) => drawStation(ctx, w));
  for (let v = 0; v < 3; v++) {
    ensure(scene, `frag${v}`, 18, 18, (ctx) => drawFragment(ctx, v));
    ensure(scene, `dep${v}`, 64, 64, (ctx) => drawDeposit(ctx, v));
    ensure(scene, `obs${v}`, 100, 100, (ctx) => drawObstacle(ctx, v));
  }
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
