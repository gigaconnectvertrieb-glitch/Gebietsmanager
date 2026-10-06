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

const KEY = "gm.v1";
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
          { id: "door-1", street: "Kastanienallee", house: "12", zip: "10435", city: "Berlin", lat: 52.5389, lng: 13.4094, note: "EG links", status: "offen" },
          { id: "door-2", street: "Kastanienallee", house: "28", zip: "10435", city: "Berlin", lat: 52.5394, lng: 13.4101, note: "", status: "nachlauf" },
          { id: "door-3", street: "Oderberger Straße", house: "15", zip: "10435", city: "Berlin", lat: 52.5408, lng: 13.4099, note: "3. OG", status: "offen" },
          { id: "door-4", street: "Schönhauser Allee", house: "70", zip: "10437", city: "Berlin", lat: 52.5419, lng: 13.4122, note: "", status: "nachlauf" },
          { id: "door-5", street: "Danziger Straße", house: "9", zip: "10435", city: "Berlin", lat: 52.5391, lng: 13.4184, note: "Hinterhaus", status: "offen" },
          { id: "door-6", street: "Kollwitzstraße", house: "52", zip: "10405", city: "Berlin", lat: 52.5368, lng: 13.4189, note: "", status: "nachlauf" },
          { id: "door-7", street: "Prenzlauer Allee", house: "33", zip: "10405", city: "Berlin", lat: 52.5349, lng: 13.4198, note: "", status: "offen" },
          { id: "door-8", street: "Helmholtzstraße", house: "2", zip: "10407", city: "Berlin", lat: 52.5432, lng: 13.4211, note: "Nicht klingeln vor 16 Uhr", status: "offen" },
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
          { id: "door-l1", street: "Karl-Liebknecht-Straße", house: "44", zip: "04275", city: "Leipzig", lat: 51.3221, lng: 12.3734, note: "", status: "offen" },
          { id: "door-l2", street: "Kochstraße", house: "18", zip: "04275", city: "Leipzig", lat: 51.3194, lng: 12.3688, note: "Hof", status: "abschluss" },
          { id: "door-l3", street: "Alfred-Kästner-Straße", house: "7", zip: "04275", city: "Leipzig", lat: 51.3178, lng: 12.3762, note: "", status: "offen" },
        ],
      },
    ],
    visits: [
      { id: "vis-1", door_id: "door-2", territory_id: "ter-berlin-prenzl", user_id: "demo-vt-keller", reason: "nicht_angetroffen", note: "Niemand da, Briefkasten voll", street: "Kastanienallee", house: "28", zip: "10435", city: "Berlin", follow_up_on: plus(2), week_key: weekKey(), list_status: "offen" },
      { id: "vis-2", door_id: "door-4", territory_id: "ter-berlin-prenzl", user_id: "demo-vt-keller", reason: "laufzeit_passt_nicht", note: "Vertrag läuft noch bis November", street: "Schönhauser Allee", house: "70", zip: "10437", city: "Berlin", follow_up_on: plus(20), week_key: weekKey(), list_status: "offen" },
      { id: "vis-3", door_id: "door-6", territory_id: "ter-berlin-prenzl", user_id: "demo-vt-keller", reason: "nicht_angetroffen", note: "Nur Kind zu Hause", street: "Kollwitzstraße", house: "52", zip: "10405", city: "Berlin", follow_up_on: plus(1), week_key: weekKey(), list_status: "offen" },
      { id: "vis-4", door_id: "door-l2", territory_id: "ter-leipzig-sued", user_id: "jonas-berg", reason: "abschluss", note: "Strom + Gas", street: "Kochstraße", house: "18", zip: "04275", city: "Leipzig", follow_up_on: null, week_key: weekKey(), list_status: "erledigt" },
    ],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    return JSON.parse(raw);
  } catch {
    return seed();
  }
}

let state = load();
let selected = state.territories[0]?.id || null;
let tab = "doors";
let query = "";

const map = L.map("map", { zoomControl: false }).setView([51.2, 10.4], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap",
}).addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);
const layers = L.layerGroup().addTo(map);

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

function openDoors(t) {
  return t.doors.filter((d) => d.status === "offen" || d.status === "nachlauf").length;
}

function renderStats() {
  const doors = state.territories.flatMap((t) => t.doors);
  const open = state.visits.filter((v) => v.list_status === "offen" && v.week_key === weekKey()).length;
  const done = doors.filter((d) => d.status === "abschluss").length;
  document.getElementById("stats").innerHTML = [
    ["Gebiete", state.territories.length],
    ["Offene Türen", doors.filter((d) => d.status === "offen" || d.status === "nachlauf").length],
    ["Woche", open],
    ["Abschlüsse", done],
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
      <small>${t.zip} ${t.city} · ${openDoors(t)} offen · ${t.doors.length} Türen</small>
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
  const t = territory(selected);
  const focus = t ? [t] : state.territories;
  for (const area of focus) {
    if (area.polygon) {
      L.geoJSON({ type: "Feature", geometry: area.polygon, properties: { name: area.name } }, {
        style: { color: "#3dd68c", weight: 2, fillColor: "#3dd68c", fillOpacity: 0.12 },
      }).addTo(layers);
    }
    for (const d of area.doors) {
      const marker = L.circleMarker([d.lat, d.lng], {
        radius: 7,
        color: color(d.status),
        fillColor: color(d.status),
        fillOpacity: 0.9,
        weight: 1,
      });
      marker.bindPopup(`<b>${d.street} ${d.house}</b><br>${d.zip} ${d.city}<br>${d.note || d.status}`);
      marker.on("click", () => openVisit(area.id, d.id));
      marker.addTo(layers);
    }
  }
  if (t) map.flyTo([t.center.lat, t.center.lng], 15, { duration: 0.6 });
}

function renderDetail() {
  const root = document.getElementById("detail");
  const t = territory(selected);
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
  root.innerHTML = `${head}${t.doors.map((d) => `<div class="door">
    <i class="dot ${d.status}"></i>
    <div><b>${d.street} ${d.house}</b><br><small>${d.zip} ${d.city}${d.note ? " · " + d.note : ""}</small></div>
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

document.getElementById("new-btn").onclick = () => {
  openModal(`<h3>Gebiet anlegen</h3>
    <div class="form">
      <input name="name" placeholder="Name, z. B. Köln Ehrenfeld" required />
      <input name="zip" placeholder="PLZ" required />
      <input name="city" placeholder="Ort" required />
      <input name="lat" placeholder="Breite" value="50.95" required />
      <input name="lng" placeholder="Länge" value="6.92" required />
      <button class="btn primary" type="submit">Speichern</button>
      <button class="btn ghost" type="button" id="cancel">Abbrechen</button>
    </div>`);
  document.getElementById("dialog").onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const lat = Number(f.lat);
    const lng = Number(f.lng);
    const id = uid("ter");
    state.territories.unshift({
      id,
      name: f.name,
      zip: f.zip,
      city: f.city,
      active: true,
      center: { lat, lng },
      polygon: {
        type: "Polygon",
        coordinates: [[[lng - 0.012, lat - 0.008], [lng + 0.012, lat - 0.008], [lng + 0.012, lat + 0.008], [lng - 0.012, lat + 0.008], [lng - 0.012, lat - 0.008]]],
      },
      members: [],
      doors: [],
    });
    selected = id;
    save();
    closeModal();
    render();
  };
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

render();
