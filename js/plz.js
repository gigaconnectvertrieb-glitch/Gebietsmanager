/** PLZ + Einfamilie/Mehrfamilie → Gebäude aus OpenStreetMap, nach Straße und Hausnummer geordnet. */

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

export function classifyBuilding(tags = {}) {
  const building = String(tags.building || "");
  const flats = Number(tags["building:flats"] || tags["addr:flats"] || 0);
  const levels = Number(tags["building:levels"] || 0);
  if (["commercial", "industrial", "retail", "warehouse", "office", "garage", "shed", "church", "school", "hospital"].includes(building)) return null;
  if (["apartments", "residential", "dormitory"].includes(building) || flats > 1 || levels >= 4) return "mfh";
  if (["house", "detached", "semidetached_house", "terrace", "bungalow", "farm"].includes(building)) return "efh";
  if (building === "yes" && levels >= 3) return "mfh";
  if (building === "yes" || building === "static_caravan") return "efh";
  return null;
}

function houseKey(house) {
  const text = String(house || "");
  const n = text.match(/\d+/);
  return [n ? Number(n[0]) : 99999, text];
}

export function orderBuildings(rows) {
  const streets = new Map();
  for (const row of rows) {
    const key = row.street || "Ohne Straße";
    if (!streets.has(key)) streets.set(key, []);
    streets.get(key).push(row);
  }
  const groups = [...streets.entries()].map(([street, items]) => {
    items.sort((a, b) => {
      const [an, as] = houseKey(a.house);
      const [bn, bs] = houseKey(b.house);
      return an - bn || as.localeCompare(bs, "de");
    });
    const lat = items.reduce((s, p) => s + p.lat, 0) / items.length;
    const lng = items.reduce((s, p) => s + p.lng, 0) / items.length;
    return { street, items, lat, lng };
  });
  groups.sort((a, b) => a.street.localeCompare(b.street, "de"));
  const ordered = [];
  const pending = [...groups];
  let cursor = pending.length ? { lat: pending[0].lat, lng: pending[0].lng } : { lat: 0, lng: 0 };
  while (pending.length) {
    let best = 0;
    let bestD = Infinity;
    pending.forEach((g, i) => {
      const d = (g.lat - cursor.lat) ** 2 + (g.lng - cursor.lng) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const next = pending.splice(best, 1)[0];
    ordered.push(...next.items);
    const last = next.items[next.items.length - 1];
    cursor = { lat: last.lat, lng: last.lng };
  }
  return ordered.map((row, i) => ({ ...row, order: i + 1 }));
}

async function overpass(query) {
  let last = "Overpass nicht erreichbar";
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) {
        last = `Overpass ${res.status}`;
        continue;
      }
      return await res.json();
    } catch (err) {
      last = err.message || last;
    }
  }
  throw new Error(last);
}

export function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1];
    const xi = ring[i][0];
    const yj = ring[j][1];
    const xj = ring[j][0];
    const hit = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export async function findInPolygon(polygon) {
  const ring = polygon?.coordinates?.[0];
  if (!ring || ring.length < 4) throw new Error("Gebiet ist noch keine Fläche.");
  const lats = ring.map((p) => p[1]);
  const lngs = ring.map((p) => p[0]);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  if ((north - south) * (east - west) > 0.08) throw new Error("Gebiet ist zu groß. Näher zoomen und nur einen Block eingrenzen.");
  const query = `[out:json][timeout:25];
(
  way["building"](${south},${west},${north},${east});
  node["building"](${south},${west},${north},${east});
);
out center tags;`;
  const data = await overpass(query);
  const rows = [];
  for (const el of data.elements || []) {
    const tags = el.tags || {};
    const kind = classifyBuilding(tags);
    if (!kind) continue;
    const lat = el.lat || el.center?.lat;
    const lng = el.lon || el.center?.lon;
    if (!lat || !lng || !pointInRing(lat, lng, ring)) continue;
    const flats = Number(tags["building:flats"] || tags["addr:flats"] || 0);
    const levels = Number(tags["building:levels"] || 0);
    rows.push({
      street: tags["addr:street"] || "",
      house: tags["addr:housenumber"] || "",
      zip: tags["addr:postcode"] || "",
      city: tags["addr:city"] || tags["addr:suburb"] || "",
      lat,
      lng,
      kind,
      unitCount: kind === "mfh" ? Math.min(40, Math.max(2, flats || (levels > 1 ? levels * 2 : 4))) : 1,
    });
  }
  const ordered = orderBuildings(rows).slice(0, 400);
  if (!ordered.length) throw new Error("In der Fläche keine Wohngebäude. Fadenkreuz auf die Straße, drei Ecken um den Block, dann nochmal auslesen.");
  return { buildings: ordered, truncated: rows.length > ordered.length };
}
export async function findByPlz(plz, kind) {
  const zip = String(plz || "").trim();
  if (!/^\d{5}$/.test(zip)) throw new Error("PLZ muss 5 Ziffern haben.");
  if (kind !== "efh" && kind !== "mfh") throw new Error("Typ fehlt.");
  const query = `[out:json][timeout:40];
area["postal_code"="${zip}"]["boundary"="postal_code"]->.a;
(
  way["building"](area.a);
  node["building"](area.a);
);
out center tags 250;`;
  const data = await overpass(query);
  const rows = [];
  for (const el of data.elements || []) {
    const tags = el.tags || {};
    const found = classifyBuilding(tags);
    if (found !== kind) continue;
    const lat = el.lat || el.center?.lat;
    const lng = el.lon || el.center?.lon;
    if (!lat || !lng) continue;
    const flats = Number(tags["building:flats"] || tags["addr:flats"] || 0);
    const levels = Number(tags["building:levels"] || 0);
    rows.push({
      street: tags["addr:street"] || "",
      house: tags["addr:housenumber"] || "",
      zip: tags["addr:postcode"] || zip,
      city: tags["addr:city"] || tags["addr:suburb"] || "",
      lat,
      lng,
      kind,
      unitCount: kind === "mfh" ? Math.min(40, Math.max(2, flats || levels * 2 || 4)) : 1,
    });
  }
  const ordered = orderBuildings(rows).slice(0, 300);
  if (!ordered.length) throw new Error(`Keine ${kind === "mfh" ? "Mehrfamilienhäuser" : "Einfamilienhäuser"} in ${zip} gefunden.`);
  return {
    zip,
    city: ordered.find((r) => r.city)?.city || "",
    kind,
    buildings: ordered,
    truncated: rows.length > ordered.length,
  };
}
