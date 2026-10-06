import {
  VISIT_LABELS,
  VISIT_REASONS,
  doorStatus,
  followupOn,
  parseTerritoryFile,
  sortWeekly,
  weekKey,
  doorsToGeoJson,
} from "./field.js";
import { findByPlz, findInPolygon } from "./plz.js";

const KEY = "gm.v2";
const TEAM = [
  { id: "demo-vt-keller", name: "Luca Keller", role: "Vertrieb" },
  { id: "mira-hoffmann", name: "Mira Hoffmann", role: "Vertrieb" },
  { id: "jonas-berg", name: "Jonas Berg", role: "Gebietsleitung" },
];

const today = new Date().toISOString().slice(0, 10);
const plus = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function seed() {
  return {
    me: "jonas-berg",
    team: TEAM,
    territories: [
      {
        id: "ter-berlin-prenzl",
        name: "Berlin Prenzlauer Berg",
        zip: "10435",
        city: "Berlin",
        active: true,
        center: { lat: 52.54, lng: 13.415 },
        polygon: {
          type: "Polygon",
          coordinates: [[[13.401, 52.532], [13.428, 52.532], [13.428, 52.548], [13.401, 52.548], [13.401, 52.532]]],
        },
        members: [
          { user_id: "demo-vt-keller", accepted_at: today },
          { user_id: "mira-hoffmann", accepted_at: null },
        ],
        doors: [
          door("door-1", "Kastanienallee", "12", "10435", "Berlin", 52.5389, 13.4094, "EG links", "offen", "mfh", 6),
          door("door-2", "Kastanienallee", "28", "10435", "Berlin", 52.5394, 13.4101, "", "nachlauf", "mfh", 8),
          door("door-3", "Oderberger Straße", "15", "10435", "Berlin", 52.5408, 13.4099, "3. OG", "offen", "mfh", 4),
          door("door-4", "Schönhauser Allee", "70", "10437", "Berlin", 52.5419, 13.4122, "", "nachlauf", "mfh", 10),
          door("door-5", "Danziger Straße", "9", "10435", "Berlin", 52.5391, 13.4184, "Hinterhaus", "offen", "efh", 1),
          door("door-6", "Kollwitzstraße", "52", "10405", "Berlin", 52.5368, 13.4189, "", "nachlauf", "mfh", 5),
          door("door-7", "Prenzlauer Allee", "33", "10405", "Berlin", 52.5349, 13.4198, "", "offen", "mfh", 6),
          door("door-8", "Helmholtzstraße", "2", "10407", "Berlin", 52.5432, 13.4211, "Nicht klingeln vor 16 Uhr", "offen", "efh", 1),
        ],
      },
      {
        id: "ter-leipzig-sued",
        name: "Leipzig Südvorstadt",
        zip: "04275",
        city: "Leipzig",
        active: true,
        center: { lat: 51.32, lng: 12.37 },
        polygon: {
          type: "Polygon",
          coordinates: [[[12.36, 51.314], [12.385, 51.314], [12.385, 51.328], [12.36, 51.328], [12.36, 51.314]]],
        },
        members: [{ user_id: "jonas-berg", accepted_at: today }],
        doors: [
          door("door-l1", "Karl-Liebknecht-Straße", "44", "04275", "Leipzig", 51.3221, 12.3734, "", "offen", "mfh", 4),
          door("door-l2", "Kochstraße", "18", "04275", "Leipzig", 51.3194, 12.3688, "Hof", "abschluss", "efh", 1),
          door("door-l3", "Alfred-Kästner-Straße", "7", "04275", "Leipzig", 51.3178, 12.3762, "", "offen", "efh", 1),
        ],
      },
    ],
    visits: [
      { id: "vis-1", door_id: "door-2", territory_id: "ter-berlin-prenzl", user_id: "demo-vt-keller", reason: "nicht_angetroffen", note: "Niemand da, Briefkasten voll", street: "Kastanienallee", house: "28", zip: "10435", city: "Berlin", follow_up_on: plus(2), week_key: weekKey(), list_status: "offen" },
      { id: "vis-2", door_id: "door-4", territory_id: "ter-berlin-prenzl", user_id: "demo-vt-keller", reason: "laufzeit_passt_nicht", note: "Vertrag läuft noch bis November", street: "Schönhauser Allee", house: "70", zip: "10437", city: "Berlin", follow_up_on: plus(20), week_key: weekKey(), list_status: "offen" },
      { id: "vis-3", door_id: "door-6", territory_id: "ter-berlin-prenzl", user_id: "demo-vt-keller", reason: "nicht_angetroffen", note: "Nur Kind zu Hause", street: "Kollwitzstraße", house: "52", zip: "10405", city: "Berlin", follow_up_on: plus(1), week_key: weekKey(), list_status: "offen" },
      { id: "vis-4", door_id: "door-l2", territory_id: "ter-leipzig-sued", user_id: "jonas-berg", reason: "abschluss", note: "Strom + Gas", street: "Kochstraße", house: "18", zip: "04275", city: "Leipzig", follow_up_on: null, week_key: weekKey(), list_status: "erledigt" },
    ],
    plan: { active: false, mode: "huelle", points: [] },
  };
}

function door(id, street, house, zip, city, lat, lng, note, status, kind, units) {
  return { id, street, house, zip, city, lat, lng, note, status, kind, units: makeUnits(kind, units).map((u, i) => ({ ...u, id: `${id}-u${i + 1}`, status: i === 0 ? status : "offen" })) };
}

function migrate(state) {
  state.plan = state.plan || { active: false, mode: "huelle", points: [] };
  for (const t of state.territories || []) {
    for (const d of t.doors || []) {
      if (!d.kind) d.kind = "efh";
      if (!Array.isArray(d.units) || !d.units.length) d.units = makeUnits(d.kind, d.kind === "mfh" ? 4 : 1);
    }
  }
  return state;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem("gm.v1");
    if (!raw) return seed();
    return migrate(JSON.parse(raw));
  } catch {
    return seed();
  }
}

let state = load();
let selected = state.territories[0]?.id || null;
let tab = "doors";
let query = "";
let planning = false;
let lastFocus = null;
let pointerDown = null;

const map = L.map("map", { zoomControl: false }).setView([51.2, 10.4], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap",
}).addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);
const planLayer = L.layerGroup().addTo(map);
const layers = L.layerGroup().addTo(map);
function addPlanPoint(latlng) {
  const dup = state.plan.points.some((p) => latlng.distanceTo(L.latLng(p.lat, p.lng)) < 6);
  if (dup) return;
  state.plan.points.push({
    id: uid("pt"),
    lat: Number(latlng.lat.toFixed(6)),
    lng: Number(latlng.lng.toFixed(6)),
    kind: "efh",
    unitCount: 1,
    street: "",
    house: "",
  });
  save();
  render();
}
document.getElementById("plan-add").onclick = () => {
  if (!planning) return;
  if (map.getZoom() < 16) {
    document.getElementById("plan-count").textContent = "Näher zoomen, sonst trifft der Punkt nicht die Straße";
    map.setZoom(16);
    return;
  }
  addPlanPoint(map.getCenter());
};

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}
function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
function person(id) {
  return state.team.find((t) => t.id === id)?.name || id;
}
function territory(id) {
  return state.territories.find((t) => t.id === id);
}

function openUnits(t) {
  return t.doors.reduce((n, d) => n + (d.units || []).filter((u) => u.status === "offen" || u.status === "nachlauf").length, 0);
}

function renderStats() {
  const doors = state.territories.flatMap((t) => t.doors);
  const units = doors.reduce((n, d) => n + (d.units?.length || 1), 0);
  const open = state.visits.filter((v) => v.list_status === "offen" && v.week_key === weekKey()).length;
  document.getElementById("stats").innerHTML = [
    ["Gebiete", state.territories.length],
    ["Gebäude", doors.length],
    ["Wohneinheiten", units],
    ["Woche", open],
  ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join("");
}

function renderList() {
  const q = query.toLowerCase();
  const rows = state.territories.filter((t) => {
    const blob = `${t.name} ${t.zip} ${t.city} ${t.members.map((m) => person(m.user_id)).join(" ")}`.toLowerCase();
    return blob.includes(q);
  });
  document.getElementById("list").innerHTML = rows.map((t) => {
    const accepted = t.members.filter((m) => m.accepted_at).length;
    const pill = accepted ? `<span class="pill ok">${accepted} aktiv</span>` : `<span class="pill wait">offen</span>`;
    return `<button class="card ${t.id === selected ? "active" : ""}" data-id="${t.id}">
      <div class="row"><strong>${t.name}</strong>${pill}</div>
      <small>${t.zip} ${t.city} · ${openUnits(t)} WE offen · ${t.doors.length} Gebäude</small>
    </button>`;
  }).join("") || `<p class="empty">Kein Gebiet.</p>`;
}

function color(status) {
  if (status === "abschluss") return "#3dd68c";
  if (status === "nachlauf") return "#e6b35a";
  if (status === "erledigt") return "#e06a6a";
  return "#7eb6ff";
}

function renderMap() {
  layers.clearLayers();
  planLayer.clearLayers();
  const t = territory(selected);
  const focus = planning ? [] : t ? [t] : state.territories;
  for (const area of focus) {
    if (area.polygon) {
      L.geoJSON({ type: "Feature", geometry: area.polygon, properties: { name: area.name } }, {
        style: { color: "#3dd68c", weight: 2, fillColor: "#3dd68c", fillOpacity: 0.12 },
      }).addTo(layers);
    }
    for (const d of area.doors) {
      const marker = L.circleMarker([d.lat, d.lng], {
        radius: d.kind === "mfh" ? 8 : 6,
        color: color(d.status),
        fillColor: color(d.status),
        fillOpacity: 0.9,
        weight: 1,
      });
      marker.bindPopup(`<b>${d.street} ${d.house}</b><br>${d.kind === "mfh" ? "Mehrfamilien" : "Einfamilien"} · ${(d.units || []).length} WE`);
      marker.on("click", () => openVisit(area.id, d.id));
      marker.addTo(layers);
    }
  }
  const pts = state.plan.points;
  if (planning && pts.length) {
    pts.forEach((p, i) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 7,
        color: p.kind === "mfh" ? "#e6b35a" : "#7eb6ff",
        fillOpacity: 0.95,
      }).bindTooltip(String(i + 1), { permanent: true, direction: "center", className: "plan-tip" }).addTo(planLayer);
    });
    const ring = ringFrom(pts, state.plan.mode);
    const poly = territoryPolygon(pts, state.plan.mode);
    if (poly) {
      L.geoJSON(poly, { style: { color: "#3dd68c", weight: 2, fillColor: "#3dd68c", fillOpacity: 0.18 } }).addTo(planLayer);
    } else if (ring.length >= 2) {
      L.polyline(ring.map((p) => [p.lat, p.lng]), { color: "#3dd68c", weight: 2, dashArray: "6 4" }).addTo(planLayer);
    }
  }
  if (!planning && t && lastFocus !== t.id) {
    lastFocus = t.id;
    map.flyTo([t.center.lat, t.center.lng], Math.max(map.getZoom(), 14), { duration: 0.45 });
  }
  const bar = document.getElementById("plan-bar");
  bar.classList.toggle("show", planning);
  document.getElementById("crosshair").classList.toggle("show", planning);
  const ready = pts.length >= 3;
  document.getElementById("plan-count").textContent = ready ? `${pts.length} Punkte · Grenze bereit` : `${pts.length} Punkte`;
  document.getElementById("plan-btn").classList.toggle("primary", planning);
}

function renderDetail() {
  const root = document.getElementById("detail");
  const t = territory(selected);
  if (tab === "plan") {
    const pts = state.plan?.points || [];
    root.innerHTML = `<div class="meta">
      <div><span>Planung</span><b>${pts.length} Punkte</b></div>
      <div><span>Verbinden</span><b>${state.plan.mode === "huelle" ? "Hülle" : "Reihenfolge"}</b></div>
    </div>
    <p class="empty">Punkte setzen, sie werden zur Grenze verbunden. Danach liest das System Straße, Hausnummer, Einfamilie oder Mehrfamilie und die Wohneinheiten in dieser Fläche.</p>
    <div class="form">
      <select id="plan-mode">
        <option value="huelle" ${state.plan.mode === "huelle" ? "selected" : ""}>Automatisch: Punkte zur Hülle verbinden</option>
        <option value="reihenfolge" ${state.plan.mode === "reihenfolge" ? "selected" : ""}>In Klickreihenfolge, sonst Hülle</option>
      </select>
    </div>
    ${pts.map((p, i) => `<div class="door">
      <i class="dot ${p.kind === "mfh" ? "nachlauf" : "offen"}"></i>
      <div><b>Punkt ${i + 1}</b><br><small>${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}</small></div>
      <select data-kind="${p.id}">
        <option value="efh" ${p.kind === "efh" ? "selected" : ""}>Einfamilie</option>
        <option value="mfh" ${p.kind === "mfh" ? "selected" : ""}>Mehrfamilie</option>
      </select>
      <input data-we="${p.id}" type="number" min="1" max="40" value="${p.unitCount || 1}" style="width:64px" ${p.kind === "efh" ? "disabled" : ""} />
    </div>`).join("")}
    <button class="btn primary" id="plan-build-side" type="button">Gebiet auslesen</button>`;
    return;
  }
  if (!t) {
    root.innerHTML = `<p class="empty">Gebiet wählen oder anlegen.</p>`;
    return;
  }
  const head = `<div class="meta">
    <div><span>Gebiet</span><b>${t.name}</b></div>
    <div><span>PLZ</span><b>${t.zip} ${t.city}</b></div>
  </div>`;
  if (tab === "team") {
    const chips = t.members.map((m) => `<span class="chip">${person(m.user_id)} · ${m.accepted_at ? "angenommen" : "wartet"}</span>`).join("");
    const options = state.team.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
    root.innerHTML = `${head}
      <div class="members">${chips || `<span class="empty">Niemand zugewiesen.</span>`}</div>
      <form class="form" id="assign">
        <select name="user">${options}</select>
        <button class="btn" type="submit">Zuweisen</button>
      </form>
      <button class="btn primary" id="accept" type="button">Als ${person(state.me)} annehmen</button>
      <p class="empty">Annahme setzt accepted_at, wie territory_members in EnergyOne.</p>`;
    return;
  }
  if (tab === "week") {
    const rows = sortWeekly(state.visits.filter((v) => v.territory_id === t.id && v.list_status === "offen"));
    root.innerHTML = `${head}${rows.map((v) => `<div class="door">
      <i class="dot nachlauf"></i>
      <div><b>${v.street} ${v.house}</b><br><small>${VISIT_LABELS[v.reason] || v.reason} · ${v.follow_up_on || "—"} · ${person(v.user_id)}</small></div>
      <button class="btn" data-done="${v.id}" type="button">Erledigt</button>
    </div>`).join("") || `<p class="empty">Wochenliste leer.</p>`}
    <button class="btn" id="export" type="button">GeoJSON exportieren</button>`;
    return;
  }
  if (tab === "plan") return;
  root.innerHTML = `${head}<div class="meta"><div><span>Wohneinheiten</span><b>${t.doors.reduce((n, d) => n + (d.units?.length || 0), 0)}</b></div><div><span>Mehrfamilie</span><b>${t.doors.filter((d) => d.kind === "mfh").length}</b></div></div>
  ${t.doors.map((d) => `<div class="door">
    <i class="dot ${d.status}"></i>
    <div><b>${d.street} ${d.house}</b><br><small><span class="kind ${d.kind}">${d.kind === "mfh" ? "Mehrfamilie" : "Einfamilie"}</span> · ${(d.units || []).length} WE${d.note ? " · " + d.note : ""}</small></div>
    <button class="btn" data-visit="${d.id}" type="button">Besuch</button>
  </div>`).join("")}
  <button class="btn" id="export" type="button">GeoJSON exportieren</button>`;
}

function render() {
  renderStats();
  renderList();
  renderMap();
  renderDetail();
}

function openModal(html) {
  const modal = document.getElementById("modal");
  document.getElementById("dialog").innerHTML = html;
  modal.classList.add("show");
}
function closeModal() {
  document.getElementById("modal").classList.remove("show");
}

function openVisit(territoryId, doorId) {
  selected = territoryId;
  const d = territory(territoryId).doors.find((x) => x.id === doorId);
  const options = VISIT_REASONS.map((r) => `<option value="${r}">${VISIT_LABELS[r]}</option>`).join("");
  openModal(`<h3>${d.street} ${d.house}</h3>
    <p class="empty">${d.zip} ${d.city}${d.note ? " · " + d.note : ""}</p>
    <div class="form">
      <select name="reason">${options}</select>
      <textarea name="note" rows="3" placeholder="Notiz"></textarea>
      <button class="btn primary" type="submit">Eintragen</button>
      <button class="btn ghost" type="button" id="cancel">Abbrechen</button>
    </div>`);
  document.getElementById("dialog").onsubmit = (e) => {
    e.preventDefault();
    const reason = new FormData(e.target).get("reason");
    const note = new FormData(e.target).get("note");
    const follow = followupOn(reason);
    state.visits.unshift({
      id: uid("vis"),
      door_id: d.id,
      territory_id: territoryId,
      user_id: state.me,
      reason,
      note,
      street: d.street,
      house: d.house,
      zip: d.zip,
      city: d.city,
      follow_up_on: reason === "abschluss" || reason === "kein_interesse" || reason === "bereits_kunde" ? null : follow,
      week_key: weekKey(),
      list_status: reason === "abschluss" || reason === "kein_interesse" || reason === "bereits_kunde" ? "erledigt" : "offen",
    });
    d.status = doorStatus(reason);
    save();
    closeModal();
    render();
  };
}

document.getElementById("list").onclick = (e) => {
  const btn = e.target.closest("[data-id]");
  if (!btn) return;
  selected = btn.dataset.id;
  render();
};
document.getElementById("q").oninput = (e) => {
  query = e.target.value;
  renderList();
};
document.querySelector(".tabs").onclick = (e) => {
  const b = e.target.closest("[data-tab]");
  if (!b) return;
  tab = b.dataset.tab;
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  renderDetail();
};
document.getElementById("detail").onclick = (e) => {
  const visit = e.target.closest("[data-visit]");
  if (visit) return openVisit(selected, visit.dataset.visit);
  const done = e.target.closest("[data-done]");
  if (done) {
    const v = state.visits.find((x) => x.id === done.dataset.done);
    if (v) v.list_status = "erledigt";
    const door = territory(v.territory_id)?.doors.find((d) => d.id === v.door_id);
    if (door && door.status === "nachlauf") door.status = "erledigt";
    save();
    render();
  }
  if (e.target.id === "export") exportGeo();
  if (e.target.id === "plan-build-side") buildFromPoints();
  if (e.target.id === "accept") {
    const t = territory(selected);
    let m = t.members.find((x) => x.user_id === state.me);
    if (!m) {
      m = { user_id: state.me, accepted_at: today };
      t.members.push(m);
    }
    m.accepted_at = today;
    save();
    render();
  }
};
document.getElementById("detail").onsubmit = (e) => {
  if (e.target.id !== "assign") return;
  e.preventDefault();
  const user = new FormData(e.target).get("user");
  const t = territory(selected);
  if (!t.members.some((m) => m.user_id === user)) t.members.push({ user_id: user, accepted_at: null });
  save();
  render();
};

document.getElementById("new-btn").onclick = () => document.querySelector("#plz-form [name=plz]").focus();

async function searchPlz(plz, kind) {
  const status = document.getElementById("plz-status");
  status.textContent = `Suche ${kind === "mfh" ? "Mehrfamilie" : "Einfamilie"} in ${plz} …`;
  const found = await findByPlz(plz, kind);
  const polygon = territoryPolygon(found.buildings, "huelle", 40);
  const id = uid("ter");
  const doors = found.buildings.map((p) => door(
    uid("door"),
    p.street || "Gebäude",
    p.house || String(p.order),
    p.zip,
    p.city,
    p.lat,
    p.lng,
    `Lauf ${p.order}`,
    "offen",
    p.kind,
    p.unitCount,
  ));
  const center = {
    lat: doors.reduce((s, d) => s + d.lat, 0) / doors.length,
    lng: doors.reduce((s, d) => s + d.lng, 0) / doors.length,
  };
  state.territories.unshift({
    id,
    name: `${found.zip} ${found.city} · ${kind === "mfh" ? "Mehrfamilie" : "Einfamilie"}`,
    zip: found.zip,
    city: found.city,
    active: true,
    center,
    polygon,
    members: [],
    doors,
  });
  selected = id;
  lastFocus = id;
  tab = "doors";
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === "doors"));
  save();
  render();
  if (polygon) map.fitBounds(polygon.coordinates[0].map(([lng, lat]) => [lat, lng]), { padding: [24, 24], maxZoom: 16 });
  status.textContent = `${doors.length} Gebäude, geordnet nach Straße und Hausnummer${found.truncated ? " (erste 300)" : ""}.`;
}

document.getElementById("plz-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const button = e.target.querySelector("button");
  button.disabled = true;
  try {
    await searchPlz(String(f.get("plz")), String(f.get("kind")));
  } catch (err) {
    document.getElementById("plz-status").textContent = err.message || "Suche fehlgeschlagen";
  } finally {
    button.disabled = false;
  }
};

document.getElementById("import-btn").onclick = () => document.getElementById("file").click();
document.getElementById("file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const parsed = parseTerritoryFile(file.name, await file.text());
    const id = uid("ter");
    state.territories.unshift({
      id,
      name: parsed.name,
      zip: parsed.doors[0]?.zip || "",
      city: parsed.doors[0]?.city || "",
      active: true,
      center: parsed.center,
      polygon: parsed.polygon,
      members: [],
      doors: parsed.doors.map((d) => ({ ...d, id: uid("door") })),
    });
    selected = id;
    save();
    render();
  } catch (err) {
    alert(err.message || "Import fehlgeschlagen");
  }
  e.target.value = "";
};

document.getElementById("modal").onclick = (e) => {
  if (e.target.id === "modal" || e.target.id === "cancel") closeModal();
};

function exportGeo() {
  const t = territory(selected);
  const blob = new Blob([JSON.stringify({ name: t.name, ...doorsToGeoJson(t.doors), polygon: t.polygon }, null, 2)], { type: "application/geo+json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${t.name}.geojson`;
  a.click();
}

async function buildFromPoints() {
  const pts = state.plan.points;
  if (pts.length < 3) {
    alert("Mindestens 3 Punkte setzen, damit das Gebiet geschlossen ist.");
    return;
  }
  const polygon = territoryPolygon(pts, state.plan.mode, 20);
  if (!polygon) {
    alert("Aus diesen Punkten lässt sich kein Gebiet bauen.");
    return;
  }
  const status = document.getElementById("plan-count");
  status.textContent = "Grenze steht, Straßen und Haustypen werden gelesen …";
  document.getElementById("plan-build").disabled = true;
  try {
    const found = await findInPolygon(polygon);
    const id = uid("ter");
    const doors = found.buildings.map((p) => door(
      uid("door"),
      p.street || "Ohne Straße",
      p.house || "?",
      p.zip,
      p.city,
      p.lat,
      p.lng,
      `Lauf ${p.order} · ${p.unitCount} WE`,
      "offen",
      p.kind,
      p.unitCount,
    ));
    const center = {
      lat: doors.reduce((s, d) => s + d.lat, 0) / doors.length,
      lng: doors.reduce((s, d) => s + d.lng, 0) / doors.length,
    };
    const efh = doors.filter((d) => d.kind === "efh").length;
    state.territories.unshift({
      id,
      name: `Gebiet ${new Date().toLocaleDateString("de-DE")} · ${doors.length} Häuser`,
      zip: doors.find((d) => d.zip)?.zip || "",
      city: doors.find((d) => d.city)?.city || "",
      active: true,
      center,
      polygon,
      members: [],
      doors,
    });
    selected = id;
    lastFocus = id;
    planning = false;
    state.plan.points = [];
    tab = "doors";
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === "doors"));
    save();
    render();
    map.fitBounds(polygon.coordinates[0].map(([lng, lat]) => [lat, lng]), { padding: [24, 24], maxZoom: 17 });
    document.getElementById("plz-status").textContent = `${doors.length} Gebäude im Gebiet: ${efh} Einfamilie, ${doors.length - efh} Mehrfamilie, geordnet nach Straße und Hausnummer.`;
  } catch (err) {
    status.textContent = err.message || "Auslesen fehlgeschlagen";
  } finally {
    document.getElementById("plan-build").disabled = false;
  }
}

document.getElementById("plan-btn").onclick = () => {
  planning = !planning;
  tab = planning ? "plan" : "doors";
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === tab));
  if (planning && map.getZoom() < 16) map.setView(map.getCenter(), 16);
  if (planning && navigator.geolocation && !state.plan.points.length) {
    navigator.geolocation.getCurrentPosition((pos) => {
      if (planning) map.setView([pos.coords.latitude, pos.coords.longitude], 17);
    });
  }
  render();
};
document.getElementById("plan-undo").onclick = () => {
  state.plan.points.pop();
  save();
  render();
};
document.getElementById("plan-clear").onclick = () => {
  state.plan.points = [];
  save();
  render();
};
document.getElementById("plan-build").onclick = buildFromPoints;
document.getElementById("detail").addEventListener("change", (e) => {
  if (e.target.id === "plan-mode") {
    state.plan.mode = e.target.value;
    save();
    renderMap();
    return;
  }
  const kind = e.target.closest("[data-kind]");
  if (kind) {
    const p = state.plan.points.find((x) => x.id === kind.dataset.kind);
    if (p) {
      p.kind = kind.value;
      p.unitCount = p.kind === "efh" ? 1 : Math.max(2, Number(p.unitCount) || 4);
    }
    save();
    render();
  }
  const we = e.target.closest("[data-we]");
  if (we) {
    const p = state.plan.points.find((x) => x.id === we.dataset.we);
    if (p) p.unitCount = Math.max(1, Number(we.value) || 1);
    save();
  }
});

render();
