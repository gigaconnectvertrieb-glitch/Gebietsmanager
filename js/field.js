/** Feldarbeit: Gebiete, Türen, nicht angetroffen, Wochenliste. Angeglichen an EnergyOne src/lib/field.ts. */

export const VISIT_REASONS = [
  "nicht_angetroffen",
  "laufzeit_passt_nicht",
  "termin_vereinbart",
  "kein_zutritt",
  "spaeter",
  "kein_interesse",
  "bereits_kunde",
  "abschluss",
];

export const VISIT_LABELS = {
  nicht_angetroffen: "Nicht angetroffen",
  laufzeit_passt_nicht: "Laufzeit passt nicht",
  termin_vereinbart: "Termin vereinbart",
  kein_zutritt: "Kein Zutritt",
  spaeter: "Später nochmal",
  kein_interesse: "Kein Interesse",
  bereits_kunde: "Bereits Kunde",
  abschluss: "Abschluss",
};

export const FOLLOWUP_REASONS = ["nicht_angetroffen", "laufzeit_passt_nicht", "kein_zutritt", "spaeter"];

export function needsFollowup(reason) {
  return FOLLOWUP_REASONS.includes(reason);
}

export function followupDays(reason) {
  if (reason === "laufzeit_passt_nicht") return 30;
  if (reason === "termin_vereinbart") return 7;
  if (reason === "spaeter") return 3;
  return 7;
}

export function followupOn(reason, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + followupDays(reason));
  return d.toISOString().slice(0, 10);
}

export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function numish(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function parseCsvDoors(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const head = lines[0].split(/[;,]/).map((h) => h.trim().toLowerCase());
  const idx = (name) => head.findIndex((h) => h === name || h.includes(name));
  const iStreet = idx("street") >= 0 ? idx("street") : idx("straße") >= 0 ? idx("straße") : idx("strasse");
  const iHouse = idx("house") >= 0 ? idx("house") : idx("nr");
  const iZip = idx("zip") >= 0 ? idx("zip") : idx("plz");
  const iCity = idx("city") >= 0 ? idx("city") : idx("ort");
  const iLat = idx("lat");
  const iLng = idx("lng") >= 0 ? idx("lng") : idx("lon");
  const iNote = idx("note") >= 0 ? idx("note") : idx("notiz");
  const doors = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(/[;,]/);
    const lat = numish(cols[iLat]);
    const lng = numish(cols[iLng]);
    if (!lat || !lng) continue;
    doors.push({
      street: cols[iStreet] || "",
      house: cols[iHouse] || "",
      zip: cols[iZip] || "",
      city: cols[iCity] || "",
      lat,
      lng,
      note: iNote >= 0 ? cols[iNote] : "",
      status: "offen",
    });
  }
  return doors;
}

export function centroid(pts) {
  const n = pts.length || 1;
  return {
    lat: pts.reduce((s, p) => s + Number(p.lat), 0) / n,
    lng: pts.reduce((s, p) => s + Number(p.lng), 0) / n,
  };
}

export function doorsToGeoJson(doors) {
  return {
    type: "FeatureCollection",
    features: doors.map((d) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [d.lng, d.lat] },
      properties: { street: d.street, house: d.house, zip: d.zip, city: d.city, note: d.note || "" },
    })),
  };
}

function isRecord(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function walkCoords(coords, out) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    out.push({ lng: Number(coords[0]), lat: Number(coords[1]) });
    return;
  }
  for (const c of coords) walkCoords(c, out);
}

export function parseTerritoryFile(filename, text) {
  const name = filename.replace(/\.[^.]+$/, "") || "Gebiet";
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const json = JSON.parse(trimmed);
    const fc = isRecord(json) && json.type === "FeatureCollection" ? json : { type: "FeatureCollection", features: [json] };
    const features = Array.isArray(fc.features) ? fc.features : [];
    const doors = [];
    const pts = [];
    for (const f of features) {
      if (!isRecord(f) || !isRecord(f.geometry)) continue;
      walkCoords(f.geometry.coordinates, pts);
      const props = isRecord(f.properties) ? f.properties : {};
      if (f.geometry.type === "Point" && Array.isArray(f.geometry.coordinates)) {
        const [lng, lat] = f.geometry.coordinates;
        doors.push({
          street: String(props.street || props.strasse || props.name || ""),
          house: String(props.house || props.nr || ""),
          zip: String(props.zip || props.plz || ""),
          city: String(props.city || props.ort || ""),
          lat: Number(lat),
          lng: Number(lng),
          note: String(props.note || props.notiz || ""),
          status: "offen",
        });
      }
    }
    const polygon = features.find((f) => isRecord(f) && isRecord(f.geometry) && String(f.geometry.type).includes("Polygon"));
    return {
      name,
      geojson: fc,
      polygon: polygon ? polygon.geometry : null,
      doors,
      center: pts.length ? centroid(pts) : { lat: 51.16, lng: 10.45 },
    };
  }
  const doors = parseCsvDoors(trimmed);
  if (!doors.length) throw new Error("Keine Koordinaten in der Datei.");
  return { name, geojson: doorsToGeoJson(doors), polygon: null, doors, center: centroid(doors) };
}

export function sortWeekly(rows) {
  const rank = (r) => {
    const i = FOLLOWUP_REASONS.indexOf(r);
    return i < 0 ? 99 : i;
  };
  return [...rows].sort((a, b) => {
    const d = rank(a.reason) - rank(b.reason);
    if (d) return d;
    return (a.follow_up_on || "").localeCompare(b.follow_up_on || "");
  });
}

export function doorStatus(reason) {
  if (reason === "abschluss") return "abschluss";
  if (reason === "kein_interesse" || reason === "bereits_kunde") return "erledigt";
  if (needsFollowup(reason) || reason === "termin_vereinbart") return "nachlauf";
  return "besucht";
}
