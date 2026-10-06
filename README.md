# Gebietsmanager

Feld-App für E1 Direktvertrieb: Gebiete aufspielen, Mitarbeitern zuweisen, Türen abgehen, Nachlauf in der Wochenliste.

Passt zum Datenmodell aus [EnergyOne](https://github.com/gigaconnectvertrieb-glitch/EnergyOne) (`territories`, `field_doors`, `field_visits`, `territory_members`).

## Start

Die App ist statisch. Datei `index.html` im Browser öffnen, oder:

```bash
npx serve .
```

Daten liegen im Browser (`localStorage`, Schlüssel `gm.v1`). Demo-Gebiet: Berlin Prenzlauer Berg, wie in EnergyOne.

## Funktionen

- Punkte auf der Karte setzen. Die Verbindung ist die Gebietsgrenze. Darin werden Straße, Hausnummer, Einfamilie/Mehrfamilie und Wohneinheiten aus OpenStreetMap gelesen und nach Straße sortiert.
- Gebäude als Einfamilienhaus (1 Wohneinheit) oder Mehrfamilienhaus (mehrere Wohneinheiten)
- Gebiet anlegen, GeoJSON oder CSV importieren (`street,house,zip,city,lat,lng`)
- Mitarbeiter zuweisen und Gebiet annehmen
- Besuch eintragen: nicht angetroffen, Laufzeit, Termin, kein Interesse, Abschluss
- Wochenliste, sortiert nach Grund und Nachlaufdatum
- Export als GeoJSON

## EnergyOne

Besuchsgründe und Nachlauf-Tage entsprechen `src/lib/field.ts`:

| Grund | Nachlauf |
| --- | --- |
| nicht angetroffen | 7 Tage |
| Laufzeit passt nicht | 30 Tage |
| Termin vereinbart | 7 Tage |
| später nochmal | 3 Tage |
