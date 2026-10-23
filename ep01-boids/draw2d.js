// Canvas2D drawing helpers for the diagram shots (rules, steering, grid, topology).
export const COL = { sep: '#ff6b6b', ali: '#5ad1ff', coh: '#ffc35a', vel: '#5ad1ff', des: '#ffffff', str: '#ffb35c', boid: '#dfe8f5', dim: 'rgba(223,232,245,0.28)', mint: '#7be3b5' };

export function bg(ctx, clip, kind = 'night', t = 0) {
  const [x0, x1] = clip;
  ctx.save();
  if (kind === 'bats') {
    const g = ctx.createLinearGradient(0, 0, 0, 1080);
    g.addColorStop(0, '#05070f'); g.addColorStop(0.7, '#0d1428'); g.addColorStop(1, '#1a1d33');
    ctx.fillStyle = g; ctx.fillRect(x0, 0, x1 - x0, 1080);
    // moon
    const mx = 1060, my = 300;
    const mg = ctx.createRadialGradient(mx, my, 60, mx, my, 360);
    mg.addColorStop(0, 'rgba(255,240,200,0.35)'); mg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = mg; ctx.fillRect(x0, 0, x1 - x0, 1080);
    ctx.fillStyle = '#f4ecd2'; ctx.beginPath(); ctx.arc(mx, my, 118, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(200,190,160,0.35)';
    for (const [dx, dy, r] of [[-30, -20, 22], [35, 25, 16], [10, 50, 11], [-45, 40, 9]]) { ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, 7); ctx.fill(); }
    // gotham skyline
    ctx.fillStyle = '#04050a';
    let x = x0 - 20, k = 0;
    while (x < x1 + 20) {
      const w = 40 + ((k * 73) % 70), h = 120 + ((k * 137) % 260);
      ctx.fillRect(x, 1080 - h, w, h);
      if (k % 3 === 0) ctx.fillRect(x + w / 2 - 3, 1080 - h - 40, 6, 40);
      x += w + 4; k++;
    }
    ctx.restore(); return;
  }
  const g = ctx.createRadialGradient(1250, 420, 80, 1250, 520, 1300);
  g.addColorStop(0, '#16213a'); g.addColorStop(0.55, '#0c1222'); g.addColorStop(1, '#070a12');
  ctx.fillStyle = g; ctx.fillRect(x0, 0, x1 - x0, 1080);
  // faint dot lattice
  ctx.fillStyle = 'rgba(140,170,220,0.10)';
  for (let y = 30; y < 1080; y += 40) for (let x = 30 + Math.ceil((x0 - 30) / 40) * 40; x < x1; x += 40) ctx.fillRect(x - 1, y - 1, 2, 2);
  ctx.restore();
}

export const view = (ox = 0, oy = 0, s = 1) => ({ ox, oy, s, X: x => x * s + ox, Y: y => y * s + oy });
// zoom view so that world point (fx,fy) lands at screen (sx,sy) with scale s
export const focusView = (fx, fy, sx, sy, s) => view(sx - fx * s, sy - fy * s, s);

export function boids(ctx, sim, v, o = {}) {
  const size = (o.size || 9) * Math.sqrt(v.s), n = o.n ?? sim.n;
  ctx.save();
  ctx.fillStyle = o.color || COL.boid; ctx.globalAlpha = o.alpha ?? 0.9;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    if (o.skip && o.skip.has(i)) continue;
    tri(ctx, v.X(sim.x[i]), v.Y(sim.y[i]), Math.atan2(sim.vy[i], sim.vx[i]), size);
  }
  ctx.fill();
  ctx.restore();
}
export function tri(ctx, x, y, a, s) {
  const c = Math.cos(a), si = Math.sin(a);
  ctx.moveTo(x + c * s, y + si * s);
  ctx.lineTo(x - c * s * 0.65 - si * s * 0.5, y - si * s * 0.65 + c * s * 0.5);
  ctx.lineTo(x - c * s * 0.35, y - si * s * 0.35);
  ctx.lineTo(x - c * s * 0.65 + si * s * 0.5, y - si * s * 0.65 - c * s * 0.5);
  ctx.closePath();
}
export function boid(ctx, x, y, a, s, color, glow = 0) {
  ctx.save();
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.fillStyle = color; ctx.beginPath(); tri(ctx, x, y, a, s); ctx.fill();
  ctx.restore();
}
export function bats(ctx, sim, v, t, o = {}) {
  const s = (o.size || 11) * Math.sqrt(v.s);
  ctx.save(); ctx.fillStyle = o.color || '#020306'; ctx.globalAlpha = o.alpha ?? 1;
  ctx.beginPath();
  for (let i = 0; i < sim.n; i++) {
    const x = v.X(sim.x[i]), y = v.Y(sim.y[i]), a = Math.atan2(sim.vy[i], sim.vx[i]);
    const f = Math.sin(t * 16 + i * 1.7);       // wing beat
    const c = Math.cos(a), si = Math.sin(a);
    const P = (px, py) => [x + (c * px - si * py) * s, y + (si * px + c * py) * s];
    const pts = [[0.55, 0], [0.15, 0.25], [-0.1, 1.15 * (0.4 + 0.6 * Math.abs(f))], [-0.25, 0.55], [-0.5, 0.75 * Math.abs(f) + 0.2], [-0.45, 0],
      [-0.5, -0.75 * Math.abs(f) - 0.2], [-0.25, -0.55], [-0.1, -1.15 * (0.4 + 0.6 * Math.abs(f))], [0.15, -0.25]];
    pts.forEach((p, k) => { const [X, Y] = P(...p); k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.closePath();
  }
  ctx.fill(); ctx.restore();
}

export function arrow(ctx, x0, y0, x1, y1, color, w = 3, head = 12, alpha = 1) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  if (L < 2) return;
  const ux = dx / L, uy = dy / L, h = Math.min(head, L * 0.6);
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * h * 0.8, y1 - uy * h * 0.8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - ux * h - uy * h * 0.5, y1 - uy * h + ux * h * 0.5); ctx.lineTo(x1 - ux * h + uy * h * 0.5, y1 - uy * h - ux * h * 0.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}
export function circle(ctx, x, y, r, o = {}) {
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.fill) { ctx.fillStyle = o.fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  if (o.stroke) {
    ctx.strokeStyle = o.stroke; ctx.lineWidth = o.w || 2; if (o.dash) ctx.setLineDash(o.dash);
    if (o.glow) { ctx.shadowColor = o.stroke; ctx.shadowBlur = o.glow; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
export function lines(ctx, segs, color, w = 1, alpha = 1) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (const [a, b, c, d] of segs) { ctx.moveTo(a, b); ctx.lineTo(c, d); }
  ctx.stroke(); ctx.restore();
}
export function text(ctx, s, x, y, o = {}) {
  ctx.save();
  ctx.font = o.font || '600 18px "PingFang SC", sans-serif';
  ctx.fillStyle = o.color || '#eef2f8'; ctx.globalAlpha = o.alpha ?? 1;
  ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 8;
  ctx.fillText(s, x, y); ctx.restore();
}
export function panel(ctx, x, y, w, h, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(10,14,24,0.78)'; ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 16); ctx.fill(); ctx.stroke();
  ctx.restore();
}
