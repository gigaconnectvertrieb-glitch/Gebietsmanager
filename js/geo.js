/** Monotone-chain convex hull. Points are {lat, lng}. */

export function convexHull(points) {
  const pts = points
    .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const uniq = [];
  const seen = new Set();
  for (const p of pts) {
    const k = `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(p);
  }
  if (uniq.length < 3) return uniq;
  uniq.sort((a, b) => a.lng - b.lng || a.lat - b.lat);
  const cross = (o, a, b) => (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
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

export function ringFrom(points, mode) {
  if (mode === "reihenfolge") {
    return points.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
  }
  return convexHull(points);
}

export function toPolygon(ring) {
  if (ring.length < 3) return null;
  const coords = ring.map((p) => [Number(p.lng), Number(p.lat)]);
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
  return { type: "Polygon", coordinates: [coords] };
}

export function makeUnits(kind, count) {
  const n = kind === "mfh" ? Math.max(2, Number(count) || 4) : 1;
  return Array.from({ length: n }, (_, i) => ({
    id: `u-${Math.random().toString(36).slice(2, 8)}`,
    label: kind === "efh" ? "Haus" : `WE ${i + 1}`,
    floor: kind === "efh" ? 0 : Math.floor(i / 2),
    status: "offen",
  }));
}
