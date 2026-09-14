/*
 * typenmatrix.js — Fenster-Typen-Matrix: Crosswalk zwischen der Fenstertyp-
 * Hauptklasse (Form, Ebenen A–E, siehe Konzept_Fensterart-und-Fenstertyp-
 * Erkennung.md Abschnitt 4) und den Herstellertyp-IDs einer Preisliste, je
 * Fensterart (Werkstoff). Keine DOM-Abhängigkeit, in Node prüfbar
 * (module.exports am Ende) — gleiches Prinzip wie geometry.js/visualize.js.
 *
 * Phase 1 des konsolidierten Phasenplans (Konzept, Abschnitt 10): reine
 * Struktur, damit weitere Fensterarten später ohne Schema-Bruch ergänzt
 * werden können. Die Zuordnung selbst ist für 'kunststoff' bewusst nur ein
 * exemplarischer Pilot-Ausschnitt (Typen 100/101/102/111, siehe
 * Plan_Kalkulation-Angebotserstellung.md Abschnitt 4 + Empfehlung Abschnitt 8)
 * — die vollständige Zuordnung aller ~50 Schweiker-Typen erfordert die
 * Digitalisierung von `preiskufe_5_2026.pdf` (eigene, große Datenarbeit,
 * nicht Teil dieser Phase) und ergänzt hier nur die Liste je Hauptklasse.
 */
(function (global) {
  'use strict';

  var Typenmatrix = {};

  // 15 Hauptklassen aus dem Konzept (Abschnitt 4), werkstoffunabhängig —
  // dieselbe Form gibt es in jedem Material. `key` ist der stabile Bezeichner
  // fürs Datenmodell (z. B. windowFields.fenstertypHauptklasse).
  Typenmatrix.HAUPTKLASSEN = [
    { id: 1, key: 'einfluegelig', label: 'Einflügeliges Fenster' },
    { id: 2, key: 'zweifluegelig', label: 'Zweiflügeliges Fenster' },
    { id: 3, key: 'dreifluegelig', label: 'Dreiflügeliges Fenster' },
    { id: 4, key: 'mehrfluegelig', label: 'Mehrflügeliges Fenster' },
    { id: 5, key: 'festverglasung', label: 'Festverglasung' },
    { id: 6, key: 'fenster-festes-element', label: 'Fenster + festes Element' },
    { id: 7, key: 'mit-oberlicht', label: 'Mit Oberlicht' },
    { id: 8, key: 'mit-unterlicht', label: 'Mit Unterlicht' },
    { id: 9, key: 'mit-ober-unterlicht', label: 'Mit Ober- und Unterlicht' },
    { id: 10, key: 'bodentief', label: 'Bodentief' },
    { id: 11, key: 'balkontuer', label: 'Balkontür' },
    { id: 12, key: 'terrassentuer', label: 'Terrassentür' },
    { id: 13, key: 'fenster-tuer-kombination', label: 'Fenster-Tür-Kombination' },
    { id: 14, key: 'sonderform', label: 'Sonderform' },
    { id: 15, key: 'nicht-eindeutig', label: 'Nicht eindeutig erkennbar' }
  ];

  function findHauptklasse(key) {
    for (var i = 0; i < Typenmatrix.HAUPTKLASSEN.length; i++) {
      if (Typenmatrix.HAUPTKLASSEN[i].key === key) return Typenmatrix.HAUPTKLASSEN[i];
    }
    return null;
  }
  Typenmatrix.findHauptklasse = findHauptklasse;

  // Crosswalk je Fensterart. Struktur bewusst gleich für jede Fensterart
  // (Hauptklasse-Key → Array von Herstellertyp-Einträgen), damit eine neue
  // Fensterart nur einen neuen Top-Level-Eintrag braucht, ohne dass sich das
  // Schema oder der Lookup-Code ändert.
  //
  // `vollstaendig: false` markiert, dass für diese Hauptklasse bislang nur
  // ein exemplarischer Ausschnitt (Pilot) hinterlegt ist, nicht die
  // vollständige Preisliste — siehe Dateikopf-Kommentar.
  Typenmatrix.CROSSWALK = {
    kunststoff: {
      einfluegelig: {
        vollstaendig: false,
        typen: [
          { typId: '100', kuerzel: 'KF', bezeichnung: 'Kunststofffenster, einflügelig, Dreh-Kipp' },
          { typId: '101', kuerzel: 'DKF/FEFL', bezeichnung: 'Dreh-Kipp-Fenster mit festem Flügel' },
          { typId: '102', kuerzel: 'FEST', bezeichnung: 'Festverglasung, einflügelig' },
          { typId: '111', kuerzel: 'DKT', bezeichnung: 'Dreh-Kipp-Fenster, Sonderausführung' }
        ]
      },
      zweifluegelig: {
        vollstaendig: false,
        typen: [
          { typId: '201-214', kuerzel: 'DKF/DF, FEST/DKF, FEST/FEST', bezeichnung: 'Zweiflügelige Kombinationen (Typenbereich, noch nicht einzeln digitalisiert)' }
        ]
      },
      dreifluegelig: {
        vollstaendig: false,
        typen: [
          { typId: '301-324', kuerzel: null, bezeichnung: 'Dreiflügelige Kombinationen (Typenbereich, noch nicht einzeln digitalisiert)' }
        ]
      },
      mehrfluegelig: {
        vollstaendig: false,
        typen: [
          { typId: '317', kuerzel: null, bezeichnung: 'Mehrflügelige Kombination' },
          { typId: '815', kuerzel: null, bezeichnung: 'Mehrflügelige Kombination' }
        ]
      },
      balkontuer: {
        vollstaendig: false,
        typen: [
          { typId: '713-716', kuerzel: 'HST', bezeichnung: 'Hebe-Schiebe-Tür (Typenbereich)' },
          { typId: '220/224/225', kuerzel: 'PSKT', bezeichnung: 'Parallel-Schiebekipp-Tür' }
        ]
      },
      terrassentuer: {
        vollstaendig: false,
        typen: [
          { typId: '00404-00807', kuerzel: 'HST', bezeichnung: 'Hebe-Schiebe-Tür (Typenbereich)' }
        ]
      },
      bodentief: {
        vollstaendig: false,
        typen: [
          { typId: '713-716', kuerzel: 'HST', bezeichnung: 'Hebe-Schiebe-Tür (Typenbereich, wie Balkontür)' },
          // Bestätigt bei der Preisdigitalisierung für js/calculation.js (Phase 7):
          // Typ 111 ist laut Original-Preisliste explizit die "Französisches
          // Fenster (ohne Trittschutz)"-Ausführung, also bodentief.
          { typId: '111', kuerzel: 'DKT', bezeichnung: 'Bodentiefes Dreh-Kipp-Fenster (Französisches Fenster, ohne Trittschutz)' }
        ]
      },
      // Bestätigt bei der Preisdigitalisierung für js/calculation.js (Phase 7):
      // Typ 102 ist im Original-Preisliste-Index direkt als "FEST" geführt.
      festverglasung: {
        vollstaendig: false,
        typen: [
          { typId: '102', kuerzel: 'FEST', bezeichnung: 'Festverglasung, einflügelig' }
        ]
      }
      // fenster-festes-element, mit-oberlicht, mit-unterlicht,
      // mit-ober-unterlicht, fenster-tuer-kombination, sonderform,
      // nicht-eindeutig: bislang kein Eintrag. Laut Kalkulationsplan
      // (Abschnitt 4) ist Ober-/Unterlicht insbesondere nicht über eine
      // eigene Typnummer, sondern über Elementkopplung + Zusatzposition
      // abgebildet — eigene Modellierung, kein einfacher ID-Lookup.
    }
    // holz, holz-alu, aluminium, stahl, sonstige: bewusst (noch) ohne
    // Eintrag — für diese Fensterarten existiert laut Konzept (Abschnitt 8)
    // keine digitalisierte Preisliste. hasPreisliste() liefert dafür false,
    // ohne dass der Aufrufer den Unterschied zu einer leeren Hauptklasse
    // kennen muss.
  };

  /** Existiert für diese Fensterart überhaupt ein (Teil-)Crosswalk? */
  Typenmatrix.hasPreisliste = function (fensterart) {
    return !!Typenmatrix.CROSSWALK[fensterart];
  };

  /**
   * Liefert die hinterlegten Herstellertyp-Einträge für eine Fensterart +
   * Hauptklasse, oder null, wenn (noch) keine Preisliste bzw. kein Eintrag
   * für diese Kombination existiert. `vollstaendig: false` im Ergebnis zeigt
   * an, dass es sich um einen Pilot-/Teilausschnitt handelt.
   */
  Typenmatrix.getHerstellerTypen = function (fensterart, hauptklasseKey) {
    var perArt = Typenmatrix.CROSSWALK[fensterart];
    if (!perArt) return null;
    var eintrag = perArt[hauptklasseKey];
    if (!eintrag) return null;
    return { vollstaendig: !!eintrag.vollstaendig, typen: eintrag.typen.slice() };
  };

  global.Typenmatrix = Typenmatrix;
  if (typeof module !== 'undefined' && module.exports) module.exports = Typenmatrix;
})(typeof window !== 'undefined' ? window : this);
