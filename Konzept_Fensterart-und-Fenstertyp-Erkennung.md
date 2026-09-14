# Konzept: Fensterart (Werkstoff) & automatische Fenstertyp-Erkennung

Überarbeitete, konsolidierte Fassung der bisherigen Fenstertyp-Konzeptpapiere
(`Fensteraufmass_App_Zusammenfassung.pdf`, `Konzept_Fenstertyp-Fotoerkennung.pdf`,
`Fenstertyp-Klassifikation_Fotoerkennung_2026-08-03.pdf`) plus Anschluss an
`Plan_Kalkulation-Angebotserstellung.md` und `Erweiterungsplan_Visualisierung_Neubau.pdf`.
Neu eingearbeitet: **Fensterart (Werkstoff) als eigenes, vom Menschen gewähltes Merkmal**
und **Fenstertyp-Erkennung aus zwei Quellen — Foto UND Plan**.

## 1. Warum diese Überarbeitung

Die drei bisherigen Konzeptpapiere behandeln ausschließlich die *Form* eines Fensters
(einflügelig, zweiflügelig, mit Oberlicht, Balkontür …) und leiten ihr Klassifikationsmodell
vollständig vom Kömmerling-70-AD-System ab — einem **Kunststoff**-Profilsystem. Werkstoff
war dort nie eine eigene Dimension, sondern implizit immer „Kunststoff". Gleichzeitig ist die
einzige bislang digitalisierte Preisliste (`preiskufe_5_2026.pdf`, Schweiker) ebenfalls reine
Kunststoff-Ware. Beides zusammen hat die Konzeptpapiere unbemerkt auf ein Ein-Werkstoff-Modell
festgelegt.

Zwei konkrete Lücken werden mit diesem Dokument geschlossen:

1. **Fensterart** (Kunststoff, Metall/Aluminium, Holz, Holz-Aluminium, Stahl …) soll als
   eigenes Merkmal **manuell vom Kunden/Menschen** gewählt werden — unabhängig von der
   Fenster-*Form*.
2. **Fenstertyp** (die Form-Klassifikation aus den bisherigen Papieren) soll **automatisch**
   erkannt werden — und zwar sowohl aus einem **Foto** als auch aus einem **Plan**
   (Grundriss/Bauplan), nicht nur aus dem Foto wie bisher konzipiert.

## 2. Begriffsklärung (behebt eine bestehende Terminologie-Kollision)

Der Begriff „Fenstertyp" wurde bisher für zwei verschiedene Dinge verwendet: die Schweiker-
Bestellnummer (`Plan_Kalkulation-Angebotserstellung.md`, z. B. „Typ 100") und die Form-Klasse
aus den Fotoerkennungs-Konzepten (z. B. „einflügeliges Fenster"). Ab jetzt gilt folgende
Trennung:

| Begriff | Bedeutung | Beispiele | Bestimmt durch |
|---|---|---|---|
| **Fensterart** | Werkstoff/Material des Rahmens | Kunststoff, Holz, Holz-Aluminium, Aluminium, Stahl | **Mensch** (Pflicht-Auswahlfeld) |
| **Fenstertyp** | Geometrische Konfiguration (Ebenen A–E, siehe Abschnitt 4) | einflügelig, zweiflügelig mit Oberlicht, Balkontür, Festverglasung | **KI-Vorschlag** aus Foto/Plan, vom Menschen bestätigt |
| **Herstellertyp-ID** | Bestellnummer einer konkreten Preisliste | Schweiker Typ 100, 101, 201 … | **System**, per Crosswalk aus Fensterart + Fenstertyp abgeleitet — existiert bislang nur für Fensterart = Kunststoff |

Die beiden erstgenannten Merkmale sind **orthogonal**: Ein zweiflügeliges Fenster mit
Oberlicht kann aus Kunststoff, Holz oder Aluminium gefertigt sein — der Fenstertyp ändert sich
dadurch nicht, wohl aber die anwendbare Preisliste und die Herstellertyp-ID.

## 3. Status quo in der App (Code-Stand, nicht nur Konzept)

Damit diese Überarbeitung nicht wieder am bestehenden Code vorbeiplant, hier der verifizierte
Ist-Zustand:

- **`objectType: 'window'|'door'`** existiert bereits auf Messungs-Ebene.
- **`windowFields`** (`sashCount`, `openingType`, `hingeSide`, `handleSide`, `mullions`)
  existiert bereits — wird aber **ausschließlich manuell** über Dropdowns befüllt
  (`windowFieldsHtml`/`readWindowFields` in `js/app.js`). Es gibt aktuell **keine** automatische
  Erkennung dieser Werte aus einem Bild — die Fotoerkennungs-Konzeptpapiere sind bislang
  0 % implementiert.
- **`captureMode`** (`foto`/`manual`/`plan`) ist laut `Erweiterungsplan_Visualisierung_Neubau.pdf`
  als Phase 1b geplant, aber laut `Umsetzungsstatus_Visualisierung.pdf` (Stand 24.08.2026)
  **noch nicht begonnen** (Schritte 6–7 offen). Wichtig für dieses Konzept: „Plan" ist dort
  bereits als Eingabequelle vorgesehen — allerdings nur, um mehrere **noch nicht gebaute**
  Fenster auf einem Grundriss **manuell** zu vermessen (Ecken antippen, `windowFields` per
  Dropdown wählen). Eine automatische Typ-*Erkennung* aus dem Plan ist dort nicht vorgesehen.
- **Kalkulation/Preisliste**: `Plan_Kalkulation-Angebotserstellung.md` beschreibt ein noch
  ungebautes `calculation.js`. Digitalisiert ist bislang ausschließlich die Schweiker-
  Kunststoff-Preisliste; für Holz/Alu/Stahl existiert im Projekt **keine** Preisgrundlage.
- **Es gibt bislang kein Feld für Werkstoff/Fensterart** irgendwo im Datenmodell oder in der UI.

Kurz: Die App kennt heute *eine* Fensterart implizit (Kunststoff, über die Preisliste) und
erfasst die Form komplett manuell. Beides ändert dieses Konzept.

## 4. Fenstertyp-Klassifikation (Ebenen A–E) — unverändert gültig

Das 5-Ebenen-Modell aus den bisherigen Konzeptpapieren bleibt inhaltlich bestehen, da es
werkstoffunabhängig ist (dieselbe Form gibt es in jedem Material):

| Ebene | Merkmal | Beispiele | Foto-Erkennbarkeit |
|---|---|---|---|
| A | Grundform | rechteckig, quadratisch, bodentief, Rundbogen | sehr einfach bis schwierig (A1–A5 zuerst) |
| B | Anzahl Elemente | ein-/zwei-/drei-/mehrteilig | wichtigste Ebene, gut erkennbar |
| C | Öffnungsart | fest, Dreh, Dreh-Kipp, Kipp, Schwing | **eingeschränkt** — Dreh vs. Dreh-Kipp im Ruhezustand oft nicht unterscheidbar |
| D | Ober-/Unterlicht | ohne, mit Oberlicht, mit Unterlicht, mit beidem | gut erkennbar |
| E | Fenster-/Türvariante | normales Fenster, bodentief, Balkontür, Terrassentür | gut erkennbar |

Daraus abgeleitet die **10–15 Hauptklassen für Version 1** (unverändert aus den
Konzeptpapieren): einflügelig, zweiflügelig, dreiflügelig, mehrflügelig, Festverglasung,
Fenster + festes Element, mit Oberlicht, mit Unterlicht, mit Ober-/Unterlicht, bodentief,
Balkontür, Terrassentür, Fenster-Tür-Kombination, Sonderform, nicht eindeutig erkennbar.

**Wichtig, unverändert aus den Konzeptpapieren:** Öffnungsart (Ebene C), Verglasungsart und
Profildetails bleiben KI-unsicher und sollten hybrid per Nutzer-Rückfrage abgesichert werden
(„Ist das ein Dreh-Kipp-Fenster? Ja/Nein/Weiß nicht"), nicht rein automatisch bestimmt werden.

## 5. Fensterart: bewusst kein KI-Merkmal

Die bisherigen Konzeptpapiere ordnen „Profil/Material" bereits in ihrer eigenen
Zuständigkeits-Tabelle der Spalte „Nutzer" zu, nicht „KI" — diese Einschätzung wird hier
übernommen und zur festen Regel gemacht:

- **Werkstoffe sehen sich auf Fotos oft ähnlich** — foliertes/dekorfoliertes PVC in
  Holzoptik ist von echtem Holz oder von Aluminium aus normaler Fotodistanz nicht
  zuverlässig unterscheidbar.
- **Die Fensterart ist die Grundlage der Preisliste.** Eine Fehlklassifikation hier wirkt sich
  direkt auf die Kalkulation aus (Abschnitt 7) — deutlich kritischer als eine falsch erkannte
  Sprossenzahl.
- Konsequenz: Fensterart wird **nicht** von der Bilderkennung geschätzt, auch nicht als
  Vorschlag mit Rückfrage. Es ist ein **Pflicht-Auswahlfeld**, das der Nutzer vor oder
  parallel zur automatischen Fenstertyp-Erkennung ausfüllt.

Vorgeschlagener Wertebereich (erweiterbar):

```
fensterart: 'kunststoff' | 'holz' | 'holz-alu' | 'aluminium' | 'stahl' | 'sonstige'
```

## 6. Fenstertyp-Erkennung aus zwei Quellen: Foto und Plan

Die bisherigen Konzeptpapiere beschreiben ausschließlich die Erkennung aus einem **realen
Fassadenfoto**. Die neue Anforderung — Erkennung auch aus einem **Plan** — ist technisch eine
andere Aufgabe und wird hier als zweiter, gleichberechtigter Pfad ergänzt. Beide Pfade liefern
am Ende dasselbe Zielschema (Abschnitt 8), damit der restliche App-Flow (Wizard, Speicherung,
Export, Kalkulation) pfadunabhängig bleibt.

### 6.1 Pfad Foto (wie in den bisherigen Konzeptpapieren)

Dreistufige Pipeline, unverändert übernommen:

1. **Lokalisierung** — Object-Detection/Segmentierung findet und zählt alle Fenster-/
   Türelemente im Bild.
2. **Geometrieanalyse** — pro Element Breite/Höhe-Verhältnis, Teilungen, Ober-/Unterlicht.
3. **Klassifikation** — Zusammenführung zu Hauptklasse + Confidence-Wert.

### 6.2 Pfad Plan (neu — knüpft an `captureMode: 'plan'` aus dem Erweiterungsplan an)

Der Plan-Modus existiert im bestehenden Erweiterungsplan bereits als Eingabequelle, dort aber
nur für **manuelle** Maßerfassung mehrerer noch nicht gebauter Fenster (Ecken antippen,
`windowFields` per Dropdown). Für die automatische Fenstertyp-Erkennung ist das eine andere
Teilaufgabe, weil Baupläne strukturell anders aufgebaut sind als Fotos:

- Pläne enthalten häufig bereits **Text/Symbole** mit der Typ-Information (z. B.
  Fensterkürzel „F1", „DKF", Maßangaben, eine Fensterliste/Legende auf demselben oder einem
  beiliegenden Blatt) — teils genügt **Texterkennung (OCR) und Legenden-Parsing** statt
  echter Bilderkennung.
- Wo kein Kürzel vorhanden ist, liefert die **Grundriss-Symbolik** selbst Hinweise
  (Fensteröffnung in der Wand, Schwenkbogen-Symbol für die Öffnungsart, Breite direkt aus der
  Planbemaßung ablesbar) — das ist Symbolerkennung in einer 2D-Vektor-/Strichzeichnung, nicht
  Objekterkennung in einem Realfoto.
- Der bestehende `Geo.REFERENCES.custom`-Mechanismus (freie Maßstabseingabe für Pläne) liefert
  bereits die Maßstabsgrundlage; die neue Aufgabe ergänzt nur die *Typ*-Erkennung, nicht die
  *Maß*-Erkennung.

**Empfehlung:** eigene, schlanke Pipeline für den Plan-Pfad (OCR + Legenden-Abgleich +
einfache Symbolheuristik), die in dasselbe Zielschema wie der Foto-Pfad mündet — kein
gemeinsames Bilderkennungsmodell für beide Quellen, da die Eingabedaten zu unterschiedlich
sind (Foto: Fotorealismus, Perspektive, Licht/Material-Varianz · Plan: saubere Linien, Text,
genormte Symbole, aber teils handschriftlich/gescannt und in wechselnder Qualität).

### 6.3 Hybrides Prinzip bleibt in beiden Pfaden

Wie in den bisherigen Konzeptpapieren: Merkmale mit geringer Erkennungssicherheit (Öffnungsart,
Verglasung) werden nicht automatisch gesetzt, sondern nur bei ausreichender Confidence
übernommen — darunter fragt die App gezielt nach. Das gilt für Foto- und Plan-Pfad gleichermaßen.

## 7. Erweitertes Datenmodell

Ergänzung zum bestehenden `windowFields`-Objekt (`js/app.js`), rückwärtskompatibel nach dem
gleichen Prinzip wie bisher (fehlende Felder ⇒ keine Anzeige, keine erfundenen Defaults):

```js
windowFields: {
  // bestehend, unverändert:
  sashCount, openingType, hingeSide, handleSide, mullions,

  // neu — Fensterart, Pflichtfeld, ausschließlich manuell:
  fensterart: 'kunststoff', // 'kunststoff'|'holz'|'holz-alu'|'aluminium'|'stahl'|'sonstige'

  // neu — Fenstertyp-Klassifikation (Ebenen A–E / Hauptklasse 1–15):
  fenstertypHauptklasse: 2,       // 1–15, siehe Abschnitt 4
  fenstertypSource: 'auto-foto',  // 'manual' | 'auto-foto' | 'auto-plan' | 'confirmed'
  fenstertypConfidence: 0.87,     // nur gesetzt bei 'auto-foto'/'auto-plan', vor Bestätigung

  // neu — nur befüllbar, wenn eine Preisliste für die gewählte Fensterart existiert:
  herstellerTypId: null // z. B. Schweiker "100" — aktuell nur bei fensterart='kunststoff'
}
```

`fenstertypSource`/`fenstertypConfidence` machen sichtbar, ob ein Wert von der KI vorgeschlagen,
vom Menschen bestätigt oder komplett manuell erfasst wurde — wichtig sowohl für die
Rückfrage-UI (Abschnitt 6.3) als auch später für die Nachjustierung der Erkennungsqualität
anhand echter Daten.

## 8. Auswirkung auf die Kalkulation (`Plan_Kalkulation-Angebotserstellung.md`)

Der bestehende Kalkulationsplan ging implizit von genau einer Fensterart (Kunststoff) aus. Mit
Fensterart als explizitem Feld wird daraus korrekt ein **datengetriebenes Mapping je
Fensterart**:

- Jede Fensterart bräuchte perspektivisch ihre eigene Preisliste/Matrix + eigenen Crosswalk
  (der bestehende Schweiker-Crosswalk aus `Plan_Kalkulation-Angebotserstellung.md` Abschnitt 4
  gilt nur für `fensterart = 'kunststoff'`).
- **Aktuell ist nur eine Preisliste digitalisiert.** Für Holz, Aluminium, Stahl fehlt die
  Datengrundlage vollständig — das ist keine Programmierfrage, sondern eine Beschaffungsfrage
  (Preisliste vom jeweiligen Hersteller/Lieferanten besorgen).
- Bis weitere Preislisten vorliegen: Kalkulation nur für `fensterart = 'kunststoff'` möglich;
  für alle anderen Fensterarten bleibt die App bei reinem Aufmaß + „Preis auf Anfrage" stehen.
  Das ist kein Show-Stopper — das Aufmaß- und Erkennungs-Feature bleibt für alle Fensterarten
  nutzbar, nur die automatische Preisberechnung ist vorerst auf Kunststoff beschränkt.

## 9. Vorgeschlagener Wizard-Ablauf (aktualisiert)

Ergänzung des bestehenden Ablaufs um Schritt 2 (neu) und die Erkennungs-Logik in Schritt 5:

1. Objekttyp wählen (Fenster/Tür) — **bestehend, unverändert**.
2. **Neu: Fensterart wählen** (Kunststoff/Holz/Holz-Alu/Aluminium/Stahl/Sonstige) —
   Pflichtfeld, direkt nach der Objekttyp-Wahl, vor Foto/Plan.
3. Eingabequelle wählen: Foto aufnehmen **oder** Plan hochladen — Plan-Pfad knüpft an
   `captureMode: 'plan'` aus dem Erweiterungsplan an.
4. Maßstab kalibrieren — Referenzobjekt bei Foto, `Geo.REFERENCES.custom` bei Plan (beides
   bereits konzipiert/teilweise vorhanden).
5. **Fenstertyp wird automatisch vorgeschlagen** (Hauptklasse + Ebenen A–E, Confidence,
   Pfad-abhängig: Foto- oder Plan-Erkennung aus Abschnitt 6).
6. Nutzer bestätigt/korrigiert den Vorschlag im bereits vorhandenen `windowFields`-Formular
   (Formular bleibt identisch, wird aber künftig vorausgefüllt statt leer präsentiert; bei
   niedriger Confidence gezielte Rückfrage statt automatischer Übernahme).
7. Ergebnis speichern → Kalkulation nur, wenn für die gewählte Fensterart eine Preisliste
   vorliegt (Abschnitt 8), sonst reines Aufmaß-Protokoll wie heute.

## 10. Konsolidierter Phasenplan

Führt die bisherigen drei separaten Pläne (Fototyperkennung, Kalkulation, Neubau/Plan-Modus)
zu einer Reihenfolge zusammen. Jede Phase liefert eigenständigen Nutzen.

| Phase | Inhalt | Abhängigkeit |
|---|---|---|
| **0 — Fensterart-Feld** | `fensterart` als Pflicht-Dropdown in Wizard + Datenmodell + Export einführen. Reine UI-/Datenarbeit, kein KI-Aufwand, sofort umsetzbar. | keine |
| **1 — Fenster-Typen-Matrix** | Bereits vorhanden für Kunststoff (Schweiker-Crosswalk aus `Plan_Kalkulation-Angebotserstellung.md`). Struktur so anlegen, dass weitere Fensterarten später ergänzbar sind, ohne Schema-Bruch. | Phase 0 |
| **2 — Neubau-Modus Pfad (a)+(b)** | Aus dem Erweiterungsplan: manuelle Maßeingabe ohne Foto, Planfoto mit mehreren Fenstern (`captureMode: 'plan'`) — bislang rein manuelle Erfassung. Schafft die Dateneingangsfläche „Plan", bevor eine automatische Plan-Erkennung sinnvoll aufsetzt. | Phase 0 |
| **3 — Foto-Pfad: Lokalisierung & Zählung** | Object-Detection auf Fassadenfotos, optionaler Schritt vor dem bestehenden Aufmaß-Flow. | Phase 1 |
| **4 — Foto-Pfad: Geometrieanalyse** | Breite/Höhe-Verhältnis, Teilungen, Ober-/Unterlicht je Element, kompatibel zum bestehenden Mess-Datenmodell. | Phase 3 |
| **5 — Foto-Pfad: Klassifikation & Hybrid-Rückfragen** | Zusammenführung zu Hauptklasse 1–15 + Confidence-UI. | Phase 4 |
| **6 — Plan-Pfad: OCR & Symbolerkennung** *(neu)* | Texterkennung für Fensterkürzel/Legenden, einfache Symbolheuristik für Öffnungsart-Hinweise auf Grundrissen — eigene, leichtgewichtige Pipeline, mündet im selben Zielschema wie Phase 5. | Phase 2 |
| **7 — Kalkulationsmodul** | `calculation.js` aus `Plan_Kalkulation-Angebotserstellung.md`, zunächst nur `fensterart = 'kunststoff'`. | Phase 0, 1 |
| **8 — Konfigurator-UI + Angebots-PDF** | Live-Preisanzeige, Angebotsbündelung, PDF-Export. | Phase 7 |
| **9 — Weitere Fensterarten** | Sobald Preislisten für Holz/Alu/Stahl beschafft sind: Kalkulation darauf erweitern (Phase 7/8 wiederholen), Merkmalskombinatorik der Fototyperkennung ausbauen (Ebene A6–A8, Ebene-C-Detailtiefe). | Phase 7, externe Beschaffung |

**Empfehlung für den nächsten Schritt:** Phase 0 (Fensterart-Feld) — sie ist unabhängig von
allem anderen, in wenigen Stunden umsetzbar und schafft die Voraussetzung, damit Phase 7
(Kalkulation) überhaupt weiß, welche Preisliste anzuwenden ist.

## 11. Offene Fragen

- **Preislisten für Holz/Aluminium/Stahl**: Von welchem Hersteller/Lieferanten, ab wann
  verfügbar? Ohne diese Daten bleibt Kalkulation dauerhaft auf Kunststoff beschränkt.
- **Typische Planformate**: Liegen meist saubere Architekten-PDFs mit Fensterliste vor, oder
  eher handschriftliche Skizzen/Fotos von Plänen? Bestimmt, ob reine Textextraktion reicht
  oder robustere Bild-OCR nötig ist.
- **Soll Fensterart *optional* doch als KI-Hinweis ergänzt werden** (z. B. „sichtbares
  Holzdekor erkannt, bitte bestätigen"), statt strikt reines Pflichtfeld zu bleiben? Empfehlung
  aus Abschnitt 5: vorerst nein, da Fehlklassifikation hier die Kalkulationsbasis verfälscht.
- **Reihenfolge Foto- vs. Plan-Pfad**: Welcher Pfad zuerst ausbauen? Foto passt besser zum
  bestehenden Selbstaufmaß-Kunden-Modus (Bestandsfenster), Plan passt besser zum
  Neubau/Anbau-Modus (Profi-Modus, siehe Erweiterungsplan). Sollte sich nach dem tatsächlichen
  Bedarf im Familienbetrieb richten (Bestandssanierung vs. Neubau-Projekte).
- **MVP-Zuschnitt für Phase 6 (Plan-OCR)**: Reicht ein Pilot mit einem festen, bekannten
  Plan-Format (z. B. nur maschinengesetzte PDF-Baupläne mit Fensterliste), bevor
  handschriftliche/gescannte Pläne unterstützt werden?
