// 2D plan minimap: zones, walls, glazing, you-are-here; click to teleport.
const ZONE_FILL = { indoor: '#f2c9a5', smoking: '#dcb8ea', outdoor: '#b9d3ec', beach_deck: '#c2dfae' };

export class Minimap {
  constructor(canvas, V, venue, onPick, north = 0) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.V = V; this.venue = venue; this.north = north;
    this._layout();
    addEventListener('resize', () => this._layout());
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const p = this.toPlan(e.clientX - r.left, e.clientY - r.top);
      if (venue.floorAt(p[0], p[1]) !== null) onPick(p);
    });
  }
  _layout() {
    const canvas = this.c; const dpr = Math.min(devicePixelRatio, 2);
    this.w = canvas.clientWidth; this.h = canvas.clientHeight;
    if (!this.w || !this.h) { this.base = null; return; }      // hidden (narrow layout)
    canvas.width = this.w * dpr; canvas.height = this.h * dpr;
    this.bounds = [-34, -24, 30, 25];                       // plan window (m)
    const [x0, y0, x1, y1] = this.bounds;
    this.s = Math.min(this.w / (x1 - x0), this.h / (y1 - y0));
    this.ox = (this.w - (x1 - x0) * this.s) / 2; this.oy = (this.h - (y1 - y0) * this.s) / 2;
    this.g.setTransform(1, 0, 0, 1, 0, 0); this.g.scale(dpr, dpr);
    this.base = this._renderBase();
  }
  toPx(p) { return [this.ox + (p[0] - this.bounds[0]) * this.s, this.oy + (this.bounds[3] - p[1]) * this.s]; }
  toPlan(x, y) { return [(x - this.ox) / this.s + this.bounds[0], this.bounds[3] - (y - this.oy) / this.s]; }
  _renderBase() {
    const off = document.createElement('canvas'); const dpr = Math.min(devicePixelRatio, 2);
    off.width = this.w * dpr; off.height = this.h * dpr; const g = off.getContext('2d'); g.scale(dpr, dpr);
    const path = (ring, close = true) => { g.beginPath(); ring.forEach((p, i) => { const [x, y] = this.toPx(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); if (close) g.closePath(); };
    g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, this.w, this.h);
    if (this.venue.shore) { path([...this.venue.shore, [600, this.venue.shore.at(-1)[1]], [600, 600], [-600, 600], [-600, this.venue.shore[0][1]]]); g.fillStyle = '#8fcbd3'; g.fill(); }
    for (const p of this.V.context.pool) { path(p); g.fillStyle = '#7fd6e2'; g.fill(); }
    for (const z of this.V.zones) { path(z.outer); g.fillStyle = ZONE_FILL[z.zone]; g.fill(); }
    g.fillStyle = '#3b3b3b';
    for (const s of this.V.solids) { if (['kerb', 'sill'].includes(s.kind)) continue; path(s.outer); g.fill(); }
    g.strokeStyle = '#3b3b3b'; g.lineWidth = 1.5;
    for (const w of this.V.gen_walls) { path(w.path, false); g.stroke(); }
    g.strokeStyle = '#2b7fb8'; g.lineWidth = 1.2;
    for (const r of this.V.glazing) { path(r.path, false); g.stroke(); }
    const P = this.V.features.platform; const [px, py] = this.toPx(P.center);
    g.beginPath(); g.arc(px, py, P.radius * this.s, 0, 7); g.fillStyle = '#c99a6b'; g.fill();
    // true-north arrow (the drawing grid is rotated vs north)
    const nx = Math.sin(this.north), ny = -Math.cos(this.north), cx = this.w - 22, cy = 24;
    g.save(); g.translate(cx, cy); g.rotate(Math.atan2(nx, -ny));
    g.fillStyle = '#222'; g.beginPath(); g.moveTo(0, -13); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill();
    g.restore(); g.fillStyle = '#222'; g.font = '600 10px Inter, system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText('N', cx + nx * 22, cy + ny * 22 + 4);
    return off;
  }
  setRoute(path, stops) { this.route = path; this.routeStops = stops; }
  draw(pos, yaw) {
    if (!this.base) return;
    const g = this.g; g.clearRect(0, 0, this.w, this.h);
    g.drawImage(this.base, 0, 0, this.w, this.h);
    if (this.route) {
      g.save(); g.strokeStyle = 'rgba(255,138,61,0.9)'; g.lineWidth = 2; g.setLineDash([5, 4]);
      g.beginPath(); this.route.forEach((p, i) => { const [x, y] = this.toPx(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      g.setLineDash([]); g.font = '600 9px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      this.routeStops.forEach((p, k) => { const [x, y] = this.toPx(p); g.fillStyle = '#ff8a3d'; g.beginPath(); g.arc(x, y, 6.5, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillText(String(k + 1), x, y + 0.5); });
      g.restore();
    }
    const [x, y] = this.toPx(pos);
    const fx = -Math.sin(yaw), fy = Math.cos(yaw);         // plan forward
    const a = Math.atan2(-fy, fx);                          // screen angle
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(255,120,40,0.25)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 34, a - 0.55, a + 0.55); g.closePath(); g.fill();
    g.fillStyle = '#ff6a1a'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill(); g.stroke();
    g.restore();
  }
}
