import { convexHull, selfIntersects, territoryPolygon } from "./geo.js";

function area(poly) {
  const ring = poly.coordinates[0];
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
}

const square = [
  { lat: 52.5, lng: 13.4 },
  { lat: 52.5, lng: 13.41 },
  { lat: 52.51, lng: 13.41 },
  { lat: 52.51, lng: 13.4 },
];
const hull = convexHull(square);
if (hull.length !== 4) throw new Error("Hülle sollte 4 Ecken haben");

const line = [
  { lat: 52.5, lng: 13.4 },
  { lat: 52.501, lng: 13.401 },
  { lat: 52.502, lng: 13.402 },
];
const linePoly = territoryPolygon(line, "huelle");
if (!linePoly || linePoly.coordinates[0].length < 4) throw new Error("Linie muss ein Gebiet ergeben");
if (area(linePoly) <= 0) throw new Error("Linien-Gebiet ohne Fläche");

const crossed = [
  { lat: 52.5, lng: 13.4 },
  { lat: 52.51, lng: 13.41 },
  { lat: 52.5, lng: 13.41 },
  { lat: 52.51, lng: 13.4 },
];
if (!selfIntersects(crossed)) throw new Error("Kreuz erwartet");
const fixed = territoryPolygon(crossed, "reihenfolge");
if (!fixed || area(fixed) <= 0) throw new Error("Kreuz muss auf Hülle zurückfallen");

console.log("geo ok", { hull: hull.length, line: linePoly.coordinates[0].length, fixed: fixed.coordinates[0].length });
