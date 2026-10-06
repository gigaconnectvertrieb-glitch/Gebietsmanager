/** Gebiet aus Punkten: Hülle, Puffer, Linie, Selbstschnitt. Punkte {lat, lng}. */

const M_LAT = 110540;

function originOf(points) {
  const n = points.length || 1;
  return {
    lat: points.reduce((s, p) => s + Number(p.lat), 0) / n,
    lng: points.reduce((s, p) => s + Number(p.lng), 0) / n,
  };
}

function project(points) {
  const origin = originOf(points);
  const mLng = 111320 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    origin,
    mLng,
    xy: points.map((p, i) => ({
      i,
      x: (Number(p.lng) - origin.lng) * mLng,
      y: (Number(p.lat) - origin.lat) * M_LAT,
    })),
  };
}

function unproject(xy, origin, mLng) {
  return { lat: origin.lat + xy.y / M_LAT, lng: origin.lng + xy.x / mLng };
}

function hullXY(pts) {
  const uniq = [];
  for (const p of pts) {
    if (!uniq.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.5)) uniq.push(p);
  }
  if (uniq.length < 3) return uniq;
  uniq.sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function expand(ring, meters) {
  if (ring.length < 3) return ring;
  const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p.y, 0) / ring.length;
  return ring.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * meters, y: p.y + (dy / len) * meters };
  });
}

function corridor(points, meters) {
  if (points.length === 1) {
    const p = points[0];
    return [
      { x: p.x - meters, y: p.y - meters },
      { x: p.x + meters, y: p.y - meters },
      { x: p.x + meters, y: p.y + meters },
      { x: p.x - meters, y: p.y + meters },
    ];
  }
  const out = [];
  const back = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * meters;
    const ny = (dx / len) * meters;
    out.push({ x: points[i].x + nx, y: points[i].y + ny });
    back.push({ x: points[i].x - nx, y: points[i].y - ny });
  }
  return out.concat(back.reverse());
}

function segmentsCross(a, b, c, d) {
  const cross = (p, q, r) => (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function selfIntersects(ring) {
  if (ring.length < 4) return false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    for (let j = i + 1; j < ring.length; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === ring.length - 1)) continue;
      const c = ring[j];
      const d = ring[(j + 1) % ring.length];
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

export function convexHull(points) {
  const clean = points.filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  if (clean.length < 3) return clean.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
  const { origin, mLng, xy } = project(clean);
  return hullXY(xy).map((p) => unproject(p, origin, mLng));
}

export function ringFrom(points, mode = "huelle") {
  const clean = points.filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  if (mode === "reihenfolge" && clean.length >= 3) {
    const ring = clean.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
    if (!selfIntersects(ring)) return ring;
  }
  return convexHull(clean);
}

/** Geschlossenes Polygon, 30 m Puffer, Linie wird zum Streifen. */
export function territoryPolygon(points, mode = "huelle", bufferM = 30) {
  const clean = points.filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  if (clean.length < 1) return null;
  const { origin, mLng, xy } = project(clean);
  let ring = mode === "reihenfolge" ? xy : hullXY(xy);
  if (mode === "reihenfolge") {
    const latlng = ring.map((p) => unproject(p, origin, mLng));
    if (selfIntersects(latlng) || ring.length < 3) ring = hullXY(xy);
  }
  if (ring.length < 3) ring = corridor(xy, bufferM);
  else ring = expand(ring, bufferM);
  if (ring.length < 3) return null;
  const coords = ring.map((p) => {
    const ll = unproject(p, origin, mLng);
    return [ll.lng, ll.lat];
  });
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

export function toPolygon(ring) {
  return territoryPolygon(ring, "reihenfolge", 0);
}

export function makeUnits(kind, count) {
  const n = kind === "mfh" ? Math.min(40, Math.max(2, Number(count) || 4)) : 1;
  return Array.from({ length: n }, (_, i) => ({
    id: `u-${i + 1}-${Math.random().toString(36).slice(2, 7)}`,
    label: kind === "efh" ? "Haus" : `WE ${i + 1}`,
    floor: kind === "efh" ? 0 : Math.floor(i / 2),
    status: "offen",
  }));
}
