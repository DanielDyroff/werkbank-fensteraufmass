# Werkbank (PWA)

Web-App zum **Aufmaß von Fenstern per Foto** mit Referenzobjekt (Standard: ein
DIN-A4-Blatt, 210×297 mm). Umsetzung des Konzepts aus
`Fensteraufmass_App_Zusammenfassung.pdf` als installierbare, offline-fähige
Progressive Web App (HTML/CSS/JS, ohne Build-Schritt, ohne externe Abhängigkeiten).

## Funktionen

- **Foto-Aufmaß per manuellem Antippen** (MVP): 4 Ecken des DIN-A4-Blatts und
  4 Fensterecken antippen, Punkte mit Lupe pixelgenau justieren.
- **Maßstabsberechnung** aus dem Referenzobjekt (mm/px), wählbare Referenzen
  (DIN A4, A3, A5, EC-/Kreditkarte).
- **Maße**: Breite, Höhe, beide Diagonalen (Breite/Höhe als Mittel gegenüberliegender
  Kanten → gleicht leichte Perspektive aus).
- **Plausibilitätscheck**: erkennt schräge Aufnahmen (abweichende Diagonalen/Kanten),
  unrealistische Maße, vergibt einen Qualitäts-Score 0–100.
- **Zwei Modi** (laut Konzept):
  - **Profi-Modus** (PIN-geschützt): Projekt-/Kundenverwaltung, mehrere Aufmaße pro
    Projekt, **manuelle Korrektur**, **Export als PDF-Protokoll und CSV**.
  - **Kunden-Modus** (Selbstaufmaß): geführter Ablauf, Neigungsanzeige (Gyroskop) als
    Hilfe, Übermittlung an die Plattform – am Ende **nur eine Erfolgsmeldung**, kein
    Einblick in die Ergebnisse.
- **Zentrale Datenhaltung mit Admin-Zugriff**: alle Aufmaße (auch Kunden-Einreichungen
  im „Eingang“) sind nur nach Admin-Login sicht-/exportierbar.
- **PWA**: installierbar, offline nutzbar (Service Worker).

## Starten

Kamera- und PWA-Funktionen brauchen einen *secure context*. `localhost` zählt als
sicher – ein einfacher lokaler Server genügt:

```bash
cd "Aufmaß App"
python3 -m http.server 8000
```

Dann im Browser öffnen: **http://localhost:8000/**

> Direktes Öffnen per Doppelklick (`file://`) funktioniert nicht (Service Worker /
> Kamera blockiert). Für Tests am Handy: per HTTPS hosten (z. B. GitHub Pages, Netlify,
> Vercel) oder im selben WLAN über die lokale IP mit HTTPS-Tunnel.

### Profi-Login
Standard-PIN beim ersten Start: **`1234`** → unter *Einstellungen* ändern.

## Bedienung (Kurz)

1. Modus wählen (Profi/Kunde).
2. Foto aufnehmen (DIN-A4-Blatt + ganzes Fenster im Bild, Handy gerade halten).
3. **Maßstab**: die 4 Ecken des A4-Blatts antippen.
4. **Fenster**: die 4 Ecken antippen (Reihenfolge egal, werden automatisch sortiert).
5. Ergebnis prüfen → Profi: speichern/korrigieren/exportieren; Kunde: übermitteln.

## Projektstruktur

```
index.html              App-Shell
css/styles.css          Styling (mobile-first)
js/geometry.js          Maßstab, Maße, Plausibilität (DOM-frei, in Node prüfbar)
js/store.js             Datenhaltung + Admin-Gate (localStorage; Backend-Stelle)
js/picker.js            Interaktiver Foto-Picker (Antippen/Ziehen + Lupe)
js/export.js            CSV-Export + druckbares PDF-Protokoll
js/app.js               Screens, Navigation, Mess-Wizard, beide Modi
manifest.webmanifest    PWA-Manifest
sw.js                   Service Worker (Offline-Cache)
icons/                  App-Icons (SVG)
```

## Grenzen & nächste Schritte

Das reine Foto-mit-A4-Blatt-Verfahren ist für eine **Kostenschätzung** geeignet, nicht für
die millimetergenaue Fertigung. Für die finale Bestellung sind laut Konzept sinnvoll:

- **AR-/LiDAR-Tiefenmessung** (ARKit/ARCore) statt reiner 2D-Skalierung.
- **Automatische Erkennung** (OpenCV.js Konturerkennung für das A4-Blatt, Segmentierung für die
  Fensterkontur) – hier bewusst durch zuverlässiges manuelles Antippen ersetzt.
- **Echtes Backend** statt `localStorage`: nur `js/store.js` müsste auf eine zentrale
  API (REST/Firebase/Supabase) umgestellt werden – die übrige App bleibt unverändert.
  Damit echter rollenbasierter Schutz (der aktuelle PIN-Hash ist nur eine Demo-Hürde,
  keine echte Sicherheit).
- **Speicher**: Bilder liegen aktuell als komprimierte JPEGs in `localStorage`
  (Limit ~5 MB). Produktiv: IndexedDB bzw. Server-Upload.
```
