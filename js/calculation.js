/*
 * calculation.js — Kalkulationsmodul (Phase 7 des konsolidierten Phasenplans,
 * siehe Konzept_Fensterart-und-Fenstertyp-Erkennung.md Abschnitt 10). DOM-frei
 * und in Node prüfbar (module.exports am Ende) — gleiches Prinzip wie
 * geometry.js/typenmatrix.js.
 *
 * Pilot-Umfang gemäß Plan_Kalkulation-Angebotserstellung.md Abschnitt 8:
 * nur die vier einflügeligen Kunststoff-Typen 100/101/102/111, nur Farbklasse
 * PG1 (weiß, Standardausführung), keine Aufpreise (Farbe/Glas/Sicherheit/
 * Sprossen/Rollladen/Kopplung — das sind eigene, spätere Ebenen laut Plan
 * Abschnitt 3, hier bewusst noch nicht abgebildet). Ziel dieser Phase ist,
 * den Weg Aufmaß → Typ → Preis einmal durchzuspielen und Datenmodell/Logik
 * zu validieren, nicht den vollständigen ~50-Typen-Katalog abzudecken.
 *
 * Datenquelle: preiskufe_5_2026.pdf ("Preisliste Kunststoff-Fenster · gültig
 * ab 01.04.2024"), Profilsystem "Life". Werte wurden per Skript aus den
 * Wortpositionen der PDF-Seiten 7–10 rekonstruiert (nicht per einfacher
 * Texkopie, da die Rasterzellen im PDF nicht in Lesereihenfolge liegen).
 * Trotzdem gilt: vor Verwendung für ein echtes Kundenangebot stichprobenartig
 * gegen das Original-PDF verifizieren (siehe Plan Abschnitt 7, offene Frage
 * zur Datenextraktion) — bei Typ 100 ist eine Zelle (86,5×211,5cm: 544)
 * niedriger als die Nachbarzelle bei 224cm (539), obwohl die Preise sonst mit
 * der Breite steigen; das steht so im Original und wurde bewusst nicht
 * "korrigiert", könnte aber ein Druckfehler der Preisliste sein.
 *
 * `null` in pricesEUR bedeutet: diese Breite/Höhe-Kombination wird laut
 * Preisliste für diesen Typ nicht angeboten (nicht "Preis unbekannt").
 */
(function (global) {
  'use strict';

  var Calc = {};

  Calc.RASTER = {
    '100': {
      bestellnummer: '00101', kuerzel: 'KF',
      bezeichnung: 'Kunststofffenster, einflügelig, Dreh-Kipp',
      widthsCm: [49, 61.5, 74, 86.5, 99, 111.5, 124, 136.5, 149, 161.5, 174, 186.5, 199, 211.5, 224, 236.5],
      heightsCm: [49, 61.5, 74, 86.5, 99, 111.5],
      pricesEUR: [
        [293, 302, 309, 313, 319, 350, 393, 398, 409, 419, 430, 439, 449, 459, 468, 480],
        [297, 306, 311, 317, 323, 361, 403, 414, 424, 438, 448, 459, 471, 482, 492, 503],
        [302, 309, 316, 322, 328, 370, 419, 433, 445, 455, 467, 480, 491, 503, 515, 528],
        [308, 313, 321, 327, 332, 380, 435, 449, 460, 475, 487, 500, 513, 544, 539, 550],
        [313, 321, 327, 332, 339, 419, 450, 465, 478, 492, 506, 521, 534, 547, 562, 576],
        [333, 341, 376, 380, 387, 452, 466, 482, 496, 510, 525, 540, 556, 570, 584, null]
      ]
    },
    '101': {
      bestellnummer: '00101', kuerzel: 'DKF/FEFL',
      bezeichnung: 'Dreh-Kipp-Fenster mit festem Flügel, einflügelig',
      widthsCm: [49, 61.5, 74, 86.5, 99, 111.5, 124, 136.5, 149],
      heightsCm: [49, 61.5, 74, 86.5, 99, 111.5],
      pricesEUR: [
        [293, 302, 309, 313, 319, 350, 393, 398, 409],
        [297, 306, 311, 317, 323, 361, 403, 414, 424],
        [302, 309, 316, 322, 328, 370, 419, 433, 445],
        [308, 313, 321, 327, 332, 380, 435, 449, 460],
        [313, 321, 327, 332, 339, 419, 450, 465, 478],
        [333, 341, 376, 380, 387, 452, 466, 482, 496]
      ]
    },
    '102': {
      bestellnummer: '00105', kuerzel: 'FEST',
      bezeichnung: 'Festverglasung, einflügelig',
      widthsCm: [49, 61.5, 74, 86.5, 99, 111.5, 124, 136.5, 149, 161.5, 174, 186.5, 199, 211.5, 224, 236.5, 249, 261.5, 274, 286.5, 299, 311.5],
      heightsCm: [49, 61.5, 74, 86.5, 99, 111.5, 124, 136.5, 149, 161.5, 174, 186.5, 199, 211.5, 224, 236.5, 249, 261.5],
      pricesEUR: [
        [194, 199, 203, 207, 212, 217, 224, 233, 259, 270, 277, 287, 295, 304, 313, 323, 332, 383, 397, 407, 418, 431],
        [199, 203, 207, 213, 221, 231, 239, 248, 279, 290, 301, 311, 322, 332, 343, 355, 365, 431, 443, 456, 471, 483],
        [203, 207, 214, 222, 233, 242, 252, 260, 300, 312, 323, 335, 349, 361, 370, 383, 397, 476, 491, 506, 523, 538],
        [207, 213, 222, 235, 243, 254, 266, 276, 321, 333, 345, 361, 375, 386, 401, 414, 427, 523, 539, 557, 573, 592],
        [213, 221, 233, 243, 255, 269, 277, 290, 340, 356, 369, 385, 399, 414, 430, 445, 457, 567, 586, 605, 626, 646],
        [217, 231, 242, 254, 269, 279, 292, 304, 361, 377, 393, 411, 424, 441, 457, 475, 491, 614, 636, 655, 677, 699],
        [224, 239, 252, 266, 277, 292, 304, 319, 380, 399, 416, 434, 452, 468, 487, 504, 523, 658, 683, 706, 730, 753],
        [233, 248, 260, 276, 290, 304, 319, 332, 402, 420, 439, 457, 477, 496, 515, 534, 555, 705, 730, 757, 780, 809],
        [240, 255, 272, 286, 301, 317, 330, 345, 422, 443, 463, 483, 503, 524, 544, 566, 584, 749, 778, 806, 833, 859],
        [249, 264, 282, 296, 312, 328, 344, 361, 443, 465, 487, 507, 529, 550, 573, 595, 616, 796, 826, 856, 886, 914],
        [255, 274, 290, 308, 323, 340, 358, 375, 463, 487, 509, 532, 557, 578, 602, 624, 648, 842, 874, 905, 937, 969],
        [264, 284, 300, 317, 335, 353, 370, 387, 483, 507, 532, 557, 581, 605, 630, 655, 678, 889, 922, 955, 990, 1021],
        [272, 290, 309, 328, 345, 365, 383, 402, 503, 529, 557, 581, 608, 635, 658, 685, 710, 934, 969, 1005, 1039, 1075],
        [279, 300, 319, 339, 358, 377, 398, 416, 524, 550, 578, 605, 635, 659, 688, 713, 742, 980, 1017, 1054, 1093, 1130],
        [287, 308, 328, 349, 369, 391, 411, 431, 544, 573, 602, 630, 658, 688, 717, 745, 774, 1026, 1065, null, null, null],
        [295, 317, 338, 359, 380, 402, 422, 445, 566, 595, 624, 655, 685, 713, 745, 775, null, null, null, null, null, null],
        [302, 324, 349, 369, 392, 414, 436, 457, 584, 616, 648, 678, 710, 742, null, null, null, null, null, null, null, null],
        [311, 333, 358, 380, 403, 424, 449, 472, 605, 639, 671, 704, 737, 772, null, null, null, null, null, null, null, null]
      ]
    },
    '111': {
      bestellnummer: '00101', kuerzel: 'DKT',
      bezeichnung: 'Bodentiefes Dreh-Kipp-Fenster („Französisches Fenster", ohne Trittschutz)',
      widthsCm: [74, 86.5, 99, 111.5, 124],
      heightsCm: [186.5, 199, 211.5, 224, 236.5, 249, 261.5, 274],
      pricesEUR: [
        [492, 514, 536, 558, 578],
        [504, 526, 549, 572, 594],
        [518, 540, 563, 586, 610],
        [529, 555, 578, 602, 626],
        [541, 567, 592, 616, 640],
        [555, 579, 605, 630, 655],
        [566, 592, 619, 655, 683],
        [578, 605, null, null, null]
      ]
    }
  };

  /** Existiert für diesen Herstellertyp ein Preisraster (aktuell: 100/101/102/111)? */
  Calc.hasPreis = function (typId) {
    return !!Calc.RASTER[typId];
  };

  /**
   * Rundet einen cm-Wert auf die nächstgrößere vorhandene Rasterstufe auf
   * (Plan_Kalkulation-Angebotserstellung.md Abschnitt 3: „Zwischenmaße runden
   * auf das nächstgrößere Rasterfeld auf – zentrale Regel"). stepsCm muss
   * aufsteigend sortiert sein. Liefert null, wenn valueCm über der größten
   * Rasterstufe liegt.
   */
  function roundUpToGrid(valueCm, stepsCm) {
    for (var i = 0; i < stepsCm.length; i++) {
      if (stepsCm[i] >= valueCm - 1e-6) return { valueCm: stepsCm[i], index: i };
    }
    return null;
  }
  Calc.roundUpToGrid = roundUpToGrid;

  /**
   * Matrix-Lookup: rundet Breite/Höhe unabhängig voneinander auf die
   * Rasterstufen auf und liest den Basispreis (PG1/weiß) der resultierenden
   * Zelle. Liefert bei Erfolg {ok:true, priceEUR, roundedWidthCm,
   * roundedHeightCm, typId, kuerzel, bezeichnung, bestellnummer}, sonst
   * {ok:false, reason, message} — reason ist einer von 'kein-preis'
   * (Typ ohne Preisraster), 'ausserhalb-raster' (Maß größer als angeboten)
   * oder 'kombination-nicht-verfuegbar' (diese Breite×Höhe-Kombination
   * fehlt in der Preisliste, z. B. wegen maximaler Flügelgröße).
   */
  Calc.lookupBasePrice = function (typId, widthMm, heightMm) {
    var t = Calc.RASTER[typId];
    if (!t) {
      return { ok: false, reason: 'kein-preis', message: 'Für diesen Herstellertyp liegt (noch) keine Preisliste vor.' };
    }
    var w = roundUpToGrid(widthMm / 10, t.widthsCm);
    var h = roundUpToGrid(heightMm / 10, t.heightsCm);
    if (!w || !h) {
      return { ok: false, reason: 'ausserhalb-raster', message: 'Maß liegt außerhalb der für diesen Typ verfügbaren Breite/Höhe.' };
    }
    var price = t.pricesEUR[h.index][w.index];
    if (price == null) {
      return { ok: false, reason: 'kombination-nicht-verfuegbar', message: 'Diese Breite/Höhe-Kombination wird für diesen Typ laut Preisliste nicht angeboten.' };
    }
    return {
      ok: true, priceEUR: price,
      roundedWidthCm: w.valueCm, roundedHeightCm: h.valueCm,
      typId: typId, kuerzel: t.kuerzel, bezeichnung: t.bezeichnung, bestellnummer: t.bestellnummer
    };
  };

  /**
   * Baut aus einem Lookup eine vollständige Angebotsposition (Basispreis ×
   * Menge). Aufpreise (Farbe/Glas/Sicherheit/Sprossen/Rollladen/Kopplung)
   * sind in dieser Pilot-Phase noch nicht enthalten — totalEUR entspricht
   * also dem Basispreis, nicht dem vollständigen späteren Angebotspreis.
   */
  Calc.calculatePosition = function (typId, widthMm, heightMm, quantity) {
    quantity = (quantity && quantity > 0) ? quantity : 1;
    var base = Calc.lookupBasePrice(typId, widthMm, heightMm);
    if (!base.ok) return base;
    var totalEUR = Math.round(base.priceEUR * quantity * 100) / 100;
    return {
      ok: true, priceEUR: base.priceEUR, quantity: quantity, totalEUR: totalEUR,
      roundedWidthCm: base.roundedWidthCm, roundedHeightCm: base.roundedHeightCm,
      typId: typId, kuerzel: base.kuerzel, bezeichnung: base.bezeichnung, bestellnummer: base.bestellnummer
    };
  };

  /** Summiert mehrere Positionen (Array von calculatePosition-Ergebnissen) zu einer Angebotssumme. Ignoriert nicht-erfolgreiche Positionen. */
  Calc.sumPositions = function (positions) {
    return (positions || []).reduce(function (sum, p) { return p && p.ok ? sum + p.totalEUR : sum; }, 0);
  };

  global.Calc = Calc;
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
})(typeof window !== 'undefined' ? window : this);
