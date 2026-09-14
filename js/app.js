/*
 * app.js — App-Steuerung: Screens, Navigation, Mess-Wizard, beide Modi.
 * Hängt von Geo (geometry.js), Store (store.js), Picker (picker.js),
 * Exporter (export.js) ab.
 */
(function (global) {
  'use strict';

  var App = {};
  var view, header;

  App.state = {
    stack: [],
    wiz: null,      // aktueller Mess-Vorgang
    picker: null,   // aktuelle Picker-Instanz
    levelStop: null // Aufräumfunktion für Neigungsanzeige
  };

  App.DEFAULT_OBJECT_TYPE = 'window';

  /* ----------------- Helfer ----------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtMm(v) { return (v == null || isNaN(v)) ? '–' : Math.round(v) + ' mm'; }
  function fmtCm(v) { return (v == null || isNaN(v)) ? '–' : (Math.round(v) / 10).toFixed(1) + ' cm'; }

  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 2600);
  }

  function cleanup() {
    if (App.state.levelStop) { App.state.levelStop(); App.state.levelStop = null; }
    App.state.picker = null;
  }

  /** Leichtgewichtige ID, u. a. für planGroupId (Gruppierung Neubau-Pfad b). */
  function uid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * Schneidet aus dem Picker-Canvas (Foto + eingezeichnete Ecken) nur den
   * Bereich um die vier Ecken aus (statt das komplette Planfoto je Fenster
   * erneut zu speichern) — schont das 5-MB-localStorage-Limit beim Neubau-
   * Pfad (b), wo mehrere Fenster auf demselben Planfoto markiert werden.
   * corners sind Bildpixel-Koordinaten (wie von Picker geliefert); scale
   * rechnet sie in Canvas-Pixel um (Picker.view.scale).
   */
  function cropCompositeFromCanvas(cv, corners, scale, marginPx) {
    marginPx = marginPx == null ? 40 : marginPx;
    var xs = corners.map(function (p) { return p.x * scale; });
    var ys = corners.map(function (p) { return p.y * scale; });
    var minX = Math.max(0, Math.min.apply(null, xs) - marginPx);
    var minY = Math.max(0, Math.min.apply(null, ys) - marginPx);
    var maxX = Math.min(cv.width, Math.max.apply(null, xs) + marginPx);
    var maxY = Math.min(cv.height, Math.max.apply(null, ys) + marginPx);
    var w = Math.max(1, Math.round(maxX - minX));
    var h = Math.max(1, Math.round(maxY - minY));
    var out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(cv, minX, minY, w, h, 0, 0, w, h);
    return out.toDataURL('image/jpeg', 0.72);
  }

  /* ----------------- Navigation ----------------- */

  App.go = function (screen, params, opts) {
    opts = opts || {};
    cleanup();
    if (opts.replace && App.state.stack.length) App.state.stack.pop();
    if (!opts.noPush) App.state.stack.push({ screen: screen, params: params || {} });
    render(screen, params || {});
  };

  App.back = function () {
    cleanup();
    App.state.stack.pop();
    var top = App.state.stack[App.state.stack.length - 1];
    if (!top) { App.go('home', {}, { noPush: true }); return; }
    render(top.screen, top.params);
  };

  App.home = function () {
    cleanup();
    App.state.stack = [{ screen: 'home', params: {} }];
    render('home', {});
  };

  function render(screen, params) {
    var def = Screens[screen];
    if (!def) { console.error('Unbekannter Screen', screen); return; }
    var canBack = App.state.stack.length > 1;
    header.innerHTML =
      (canBack ? '<button class="icon-btn" id="backBtn" aria-label="Zurück">‹</button>' : '<span class="logo-dot"></span>') +
      '<h1>' + esc(def.title ? def.title(params) : 'Werkbank') + '</h1>' +
      (Store.isAdmin() ? '<button class="badge admin" id="adminBadge" title="Admin angemeldet">Admin</button>' : '<span class="hspacer"></span>');
    view.innerHTML = def.html(params);
    view.scrollTop = 0;
    var bb = document.getElementById('backBtn');
    if (bb) bb.onclick = App.back;
    var ab = document.getElementById('adminBadge');
    if (ab) ab.onclick = function () { App.go('dashboard'); };
    if (def.mount) def.mount(params);
  }

  /* ----------------- Bild laden (mit Downscale) ----------------- */

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var im = new Image();
      im.onload = function () {
        var max = 1400;
        var w = im.naturalWidth, h = im.naturalHeight;
        var scale = Math.min(1, max / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        cv.getContext('2d').drawImage(im, 0, 0, cw, ch);
        var dataUrl = cv.toDataURL('image/jpeg', 0.82);
        URL.revokeObjectURL(url);
        var out = new Image();
        out.onload = function () { resolve(out); };
        out.onerror = reject;
        out.src = dataUrl;
      };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht geladen werden')); };
      im.src = url;
    });
  }

  /* ----------------- Neigungsanzeige (Gyroskop-Führung) ----------------- */

  function startLevel(bubbleEl, textEl) {
    function onOrient(e) {
      var beta = e.beta || 0;   // Vor/Zurück-Neigung
      var gamma = e.gamma || 0; // Seitneigung
      var offB = Math.max(-1, Math.min(1, beta / 30));
      var offG = Math.max(-1, Math.min(1, gamma / 30));
      bubbleEl.style.transform = 'translate(' + (offG * 40) + 'px,' + (offB * 40) + 'px)';
      var level = Math.abs(beta) < 6 && Math.abs(gamma) < 6;
      bubbleEl.classList.toggle('ok', level);
      if (textEl) textEl.textContent = level ? 'Gut – Handy ist parallel' : 'Handy parallel zur Fensterfläche halten';
    }
    global.addEventListener('deviceorientation', onOrient);
    App.state.levelStop = function () { global.removeEventListener('deviceorientation', onOrient); };
  }

  /* ----------------- Mess-Wizard ----------------- */

  function newWiz(target) {
    App.state.wiz = {
      target: target,                 // {mode:'kunde'|'pro', projectId}
      objectType: App.DEFAULT_OBJECT_TYPE,
      fensterart: null,               // nur bei Fenstern: 'kunststoff'|'holz'|... (Pflichtfeld, Mensch)
      // 'foto' (Standard, wie bisher) | null (Sentinel: Neubau-Wahl noch offen,
      // siehe Screens.buildMode) | 'manual' (Pfad a) | 'plan' (Pfad b) —
      // orthogonal zu objectType/target.mode, siehe Erweiterungsplan Phase 1b.
      captureMode: 'foto',
      planGroupId: null, planCount: 0, // nur Pfad (b): gemeinsame Gruppe je Planfoto-Session
      img: null,
      referenceKey: Geo.DEFAULT_REFERENCE,
      refPts: [], mmPerPx: null, customRefMm: null,
      corners: [], result: null, composite: null,
      imgW: null, imgH: null
    };
  }

  // mmPerPx & referenceLabel werden bereits im Kalibrier-Schritt gesetzt.
  function computeResult() {
    var w = App.state.wiz;
    w.result = Geo.measure(w.corners, w.mmPerPx);
    return w.result;
  }

  /* ===================================================================== */
  /* SCREENS                                                               */
  /* ===================================================================== */

  var OBJECT_TYPE_TEXT = {
    window: {
      label: 'Fenster',
      cardIcon: '🪟',
      cardDesc: 'Fensteröffnung mit Referenzobjekt aufmessen.',
      introSteps: [
        '<b>Referenz platzieren:</b> Klebe ein DIN-A4-Blatt flach und sichtbar auf die Scheibe oder den Rahmen.',
        '<b>Gerade halten:</b> Halte das Handy möglichst parallel zur Fensterfläche.',
        '<b>Alles im Bild:</b> Das ganze Fenster und das Referenzobjekt müssen aufs Foto.',
        '<b>Markieren:</b> Anschließend Referenzobjekt und Fensterecken antippen.'
      ],
      stepTitle: 'Fenster (2/2)',
      instruct: 'Tippe die <b>4 Ecken</b> der Fensteröffnung an – Reihenfolge egal. Punkte lassen sich verschieben.',
      cornerLabels: ['1 Oben-L', '2 Oben-R', '3 Unten-R', '4 Unten-L']
    },
    door: {
      label: 'Tür',
      cardIcon: '🚪',
      cardDesc: 'Türöffnung mit Referenzobjekt aufmessen.',
      introSteps: [
        '<b>Referenz platzieren:</b> Klebe ein DIN-A4-Blatt flach und sichtbar auf oder neben die Tür.',
        '<b>Gerade halten:</b> Halte das Handy möglichst parallel zur Türfläche.',
        '<b>Alles im Bild:</b> Die ganze Türöffnung und das Referenzobjekt müssen aufs Foto.',
        '<b>Markieren:</b> Anschließend Referenzobjekt und Türecken antippen.'
      ],
      stepTitle: 'Tür (2/2)',
      instruct: 'Tippe die <b>4 Ecken</b> der Türöffnung an – Reihenfolge egal. Punkte lassen sich verschieben.',
      cornerLabels: ['1 Oben-L', '2 Oben-R', '3 Unten-R (Schwelle)', '4 Unten-L (Schwelle)']
    }
  };

  /**
   * Fensterart (Werkstoff): bewusst kein KI-Merkmal, immer manuelle Auswahl
   * (siehe Konzept_Fensterart-und-Fenstertyp-Erkennung.md, Abschnitt 5) —
   * Werkstoffe sind auf Fotos oft nicht zuverlässig unterscheidbar und die
   * Fensterart ist Grundlage der späteren Kalkulation/Preisliste.
   */
  var FENSTERART_OPTIONS = {
    kunststoff: { label: 'Kunststoff', desc: 'Preisliste vorhanden.' },
    holz: { label: 'Holz', desc: 'Preisliste noch nicht digitalisiert.' },
    'holz-alu': { label: 'Holz-Aluminium', desc: 'Preisliste noch nicht digitalisiert.' },
    aluminium: { label: 'Aluminium', desc: 'Preisliste noch nicht digitalisiert.' },
    stahl: { label: 'Stahl', desc: 'Preisliste noch nicht digitalisiert.' },
    sonstige: { label: 'Sonstige', desc: '' }
  };
  App.DEFAULT_FENSTERART = 'kunststoff';

  /** Formularblock für türspezifische Zusatzfelder (Anschlag, Schwelle, Zargentiefe, DIN-Richtung). */
  function doorFieldsHtml(prefix) {
    return '' +
      '<div class="meta-form">' +
        '<div class="two">' +
          '<label class="field"><span>Anschlag</span><select id="' + prefix + 'Hinge">' +
            '<option value="links">Links</option><option value="rechts">Rechts</option>' +
          '</select></label>' +
          '<label class="field"><span>DIN-Richtung</span><select id="' + prefix + 'Din">' +
            '<option value="DIN-links">DIN-links</option><option value="DIN-rechts">DIN-rechts</option>' +
          '</select></label>' +
        '</div>' +
        '<div class="two">' +
          '<label class="field checkbox"><input id="' + prefix + 'Threshold" type="checkbox"> <span>Schwelle vorhanden</span></label>' +
          '<label class="field"><span>Zargentiefe (mm)</span><input id="' + prefix + 'FrameDepth" type="number" placeholder="z. B. 80"></label>' +
        '</div>' +
      '</div>';
  }

  /** Liest die Werte des obigen Formularblocks aus. */
  function readDoorFields(prefix) {
    var frameDepth = parseFloat(document.getElementById(prefix + 'FrameDepth').value);
    return {
      hinge: document.getElementById(prefix + 'Hinge').value,
      dinDirection: document.getElementById(prefix + 'Din').value,
      threshold: document.getElementById(prefix + 'Threshold').checked,
      frameDepthMm: isNaN(frameDepth) ? null : frameDepth
    };
  }

  /**
   * Formularblock für fensterspezifische Merkmale (Öffnungsart, Bänder-/
   * Griffseite, Sprossen). wf (optional) füllt die Felder mit bereits
   * gespeicherten Werten vor (z. B. beim nachträglichen Bearbeiten in
   * Screens.measurement); ohne wf gelten die Defaults aus visualize.js.
   */
  function windowFieldsHtml(prefix, wf) {
    wf = wf || Visualize.DEFAULT_WINDOW_FIELDS;
    // Fensterart: bereits auf dem eigenen Auswahlscreen gewählt (App.state.wiz.fensterart);
    // beim nachträglichen Bearbeiten (wf.fensterart) hat der gespeicherte Wert Vorrang.
    var currentFensterart = wf.fensterart || (App.state.wiz && App.state.wiz.fensterart) || App.DEFAULT_FENSTERART;
    var fensterartOpts = Object.keys(FENSTERART_OPTIONS).map(function (k) {
      var sel = k === currentFensterart ? ' selected' : '';
      return '<option value="' + k + '"' + sel + '>' + esc(FENSTERART_OPTIONS[k].label) + '</option>';
    }).join('');
    var openingOpts = Object.keys(Visualize.OPENING_TYPES).map(function (k) {
      var sel = k === wf.openingType ? ' selected' : '';
      return '<option value="' + k + '"' + sel + '>' + esc(Visualize.OPENING_TYPES[k].label) + '</option>';
    }).join('');
    var sashOpts = [1, 2, 3].map(function (n) {
      return '<option value="' + n + '"' + (n === wf.sashCount ? ' selected' : '') + '>' + n + '</option>';
    }).join('');
    var hingeL = wf.hingeSide === 'links' ? ' selected' : '', hingeR = wf.hingeSide === 'rechts' ? ' selected' : '';
    var handleR = wf.handleSide === 'rechts' ? ' selected' : '', handleL = wf.handleSide === 'links' ? ' selected' : '';
    var mullH = (wf.mullions && wf.mullions.h) || 0, mullV = (wf.mullions && wf.mullions.v) || 0;
    return '' +
      '<div class="meta-form window-fields">' +
        '<label class="field"><span>Fensterart</span><select id="' + prefix + 'WMaterial">' + fensterartOpts + '</select></label>' +
        '<div class="two">' +
          '<label class="field"><span>Öffnungsart</span><select id="' + prefix + 'WOpening">' + openingOpts + '</select></label>' +
          '<label class="field"><span>Flügelzahl</span><select id="' + prefix + 'WSash">' + sashOpts + '</select></label>' +
        '</div>' +
        '<div class="two">' +
          '<label class="field" id="' + prefix + 'WHingeWrap"><span>Bänderseite</span><select id="' + prefix + 'WHinge">' +
            '<option value="links"' + hingeL + '>Links</option><option value="rechts"' + hingeR + '>Rechts</option>' +
          '</select></label>' +
          '<label class="field"><span>Griffseite</span><select id="' + prefix + 'WHandle">' +
            '<option value="rechts"' + handleR + '>Rechts</option><option value="links"' + handleL + '>Links</option>' +
          '</select></label>' +
        '</div>' +
        '<div class="two">' +
          '<label class="field"><span>Sprossen horizontal</span><input id="' + prefix + 'WMullH" type="number" min="0" max="6" value="' + mullH + '"></label>' +
          '<label class="field"><span>Sprossen vertikal</span><input id="' + prefix + 'WMullV" type="number" min="0" max="6" value="' + mullV + '"></label>' +
        '</div>' +
      '</div>';
  }

  /** Liest die Werte des obigen Fenster-Formularblocks aus. */
  function readWindowFields(prefix) {
    var mullH = parseInt(document.getElementById(prefix + 'WMullH').value, 10);
    var mullV = parseInt(document.getElementById(prefix + 'WMullV').value, 10);
    return {
      fensterart: document.getElementById(prefix + 'WMaterial').value,
      sashCount: parseInt(document.getElementById(prefix + 'WSash').value, 10) || 1,
      openingType: document.getElementById(prefix + 'WOpening').value,
      hingeSide: document.getElementById(prefix + 'WHinge').value,
      handleSide: document.getElementById(prefix + 'WHandle').value,
      mullions: { h: isNaN(mullH) ? 0 : mullH, v: isNaN(mullV) ? 0 : mullV }
    };
  }

  /**
   * Verdrahtet den Fenster-Formularblock: blendet die Bänderseite bei
   * Öffnungsarten ohne Seiten-Scharnier aus und zeichnet bei jeder Änderung
   * die Foto-Overlay-Vorschau (falls ein #<prefix>Overlay-Container existiert)
   * neu. ctx ist optional {imgW, imgH, orderedCorners, objectType}; ohne ctx
   * wird der aktuelle Wizard-Zustand (App.state.wiz) verwendet — so
   * funktioniert derselbe Helper sowohl im Mess-Wizard als auch beim
   * nachträglichen Bearbeiten eines bereits gespeicherten Aufmaßes.
   */
  function bindWindowFields(prefix, ctx) {
    var openingSel = document.getElementById(prefix + 'WOpening');
    var hingeWrap = document.getElementById(prefix + 'WHingeWrap');
    var suffixes = ['WOpening', 'WSash', 'WHinge', 'WHandle', 'WMullH', 'WMullV'];
    function update() {
      if (openingSel && hingeWrap) {
        var hide = ['kipp', 'schiebe', 'hebeschiebe', 'fest'].indexOf(openingSel.value) >= 0;
        hingeWrap.style.display = hide ? 'none' : '';
      }
      renderWindowOverlay(prefix, ctx);
    }
    suffixes.forEach(function (suffix) {
      var el = document.getElementById(prefix + suffix);
      if (el) el.addEventListener('input', update);
    });
    update();
  }

  /** Zeichnet die Foto-Overlay-Vorschau (nur Linien/Punkte) in #<prefix>Overlay, falls vorhanden. */
  function renderWindowOverlay(prefix, ctx) {
    var target = document.getElementById(prefix + 'Overlay');
    if (!target) return;
    if (!ctx) {
      var w = App.state.wiz;
      ctx = w && { imgW: w.imgW, imgH: w.imgH, orderedCorners: w.result && w.result.orderedCorners, objectType: w.objectType };
    }
    if (!ctx || ctx.objectType !== 'window' || !ctx.imgW || !ctx.orderedCorners) { target.innerHTML = ''; return; }
    target.innerHTML = Visualize.renderPhotoOverlaySvg(ctx.imgW, ctx.imgH, ctx.orderedCorners, readWindowFields(prefix));
  }

  var Screens = {};

  /* -------- Startseite / Moduswahl -------- */
  Screens.home = {
    title: function () { return 'Werkbank'; },
    html: function () {
      return '' +
        '<div class="hero">' +
          '<h2>Fenster oder Tür aufmessen per Foto</h2>' +
          '<p>Lege ein Referenzobjekt (z. B. ein DIN-A4-Blatt) ins Bild – die App berechnet daraus die Maße.</p>' +
        '</div>' +
        '<div class="cards">' +
          '<button class="card mode" data-mode="pro">' +
            '<span class="card-ic">🛠️</span><span class="card-t">Profi-Modus</span>' +
            '<span class="card-d">Projekte &amp; Kunden verwalten, Maße prüfen, als PDF/CSV exportieren.</span>' +
          '</button>' +
          '<button class="card mode" data-mode="kunde">' +
            '<span class="card-ic">📷</span><span class="card-t">Kunden-Modus</span>' +
            '<span class="card-d">Geführtes Selbstaufmaß. Daten werden übermittelt – am Ende nur eine Bestätigung.</span>' +
          '</button>' +
        '</div>' +
        '<p class="fineprint">Foto-Aufmaß eignet sich für die Kostenschätzung. Für die Fertigung wird ein abgesichertes Aufmaß empfohlen.</p>';
    },
    mount: function () {
      view.querySelectorAll('.mode').forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.mode === 'kunde') {
            newWiz({ mode: 'kunde', projectId: null });
            App.go('objectType');
          }
          else App.go(Store.isAdmin() ? 'dashboard' : 'proLogin');
        };
      });
    }
  };

  /* -------- Objekttyp wählen (beide Modi) -------- */
  Screens.objectType = {
    title: function () { return 'Was möchtest du aufmessen?'; },
    html: function () {
      return '' +
        '<div class="cards">' +
          Object.keys(OBJECT_TYPE_TEXT).map(function (key) {
            var t = OBJECT_TYPE_TEXT[key];
            return '<button class="card mode" data-type="' + key + '">' +
              '<span class="card-ic">' + t.cardIcon + '</span><span class="card-t">' + esc(t.label) + '</span>' +
              '<span class="card-d">' + esc(t.cardDesc) + '</span>' +
            '</button>';
          }).join('') +
        '</div>';
    },
    mount: function () {
      view.querySelectorAll('.mode').forEach(function (b) {
        b.onclick = function () {
          var w = App.state.wiz;
          w.objectType = b.dataset.type;
          if (b.dataset.type === 'window') { App.go('fensterart'); return; }
          if (w.captureMode === null) { App.go('buildMode'); return; }
          App.go(w.target.mode === 'kunde' ? 'kundeIntro' : 'capture');
        };
      });
    }
  };

  /* -------- Fensterart wählen (nur bei Fenstern, Pflichtfeld, immer Mensch) -------- */
  Screens.fensterart = {
    title: function () { return 'Welche Fensterart?'; },
    html: function () {
      return '' +
        '<p class="instruct">Der Werkstoff bestimmt die spätere Preisliste – bitte auswählen. ' +
          'Das kann die App nicht zuverlässig aus einem Foto erkennen.</p>' +
        '<div class="cards">' +
          Object.keys(FENSTERART_OPTIONS).map(function (key) {
            var t = FENSTERART_OPTIONS[key];
            return '<button class="card mode" data-fensterart="' + key + '">' +
              '<span class="card-t">' + esc(t.label) + '</span>' +
              (t.desc ? '<span class="card-d">' + esc(t.desc) + '</span>' : '') +
            '</button>';
          }).join('') +
        '</div>';
    },
    mount: function () {
      view.querySelectorAll('.mode').forEach(function (b) {
        b.onclick = function () {
          var w = App.state.wiz;
          w.fensterart = b.dataset.fensterart;
          if (w.captureMode === null) { App.go('buildMode'); return; }
          App.go(w.target.mode === 'kunde' ? 'kundeIntro' : 'capture');
        };
      });
    }
  };

  /**
   * -------- Neubau/Anbau: Weg wählen (nur Profi-Modus, siehe Screens.project) --------
   * Erreicht nur, wenn wiz.captureMode === null (Sentinel), gesetzt vom
   * „+ Neubau/Planung"-Button statt dem normalen „+ Aufmaß"-Button.
   */
  Screens.buildMode = {
    title: function () { return 'Neubau/Planung'; },
    html: function () {
      return '' +
        '<p class="instruct">Noch kein Fenster/keine Tür vorhanden? Für Neubau oder Anbau lassen sich ' +
          'Maße auch ohne Foto erfassen.</p>' +
        '<div class="cards">' +
          '<button class="card mode" data-build="manual">' +
            '<span class="card-ic">⌨️</span><span class="card-t">Maße manuell eingeben</span>' +
            '<span class="card-d">Breite/Höhe direkt eintragen, ohne Foto oder Referenzobjekt.</span>' +
          '</button>' +
          '<button class="card mode" data-build="plan">' +
            '<span class="card-ic">📐</span><span class="card-t">Grundriss-/Planfoto</span>' +
            '<span class="card-d">Ein Planfoto hochladen und mehrere Fenster/Türen darauf markieren.</span>' +
          '</button>' +
        '</div>';
    },
    mount: function () {
      view.querySelectorAll('.mode').forEach(function (b) {
        b.onclick = function () {
          var w = App.state.wiz;
          if (b.dataset.build === 'manual') {
            w.captureMode = 'manual';
            App.go('manualMeasure');
          } else {
            w.captureMode = 'plan';
            w.planGroupId = uid();
            w.planCount = 0;
            App.go('capture');
          }
        };
      });
    }
  };

  /** -------- Neubau Pfad (a): Maße manuell eingeben, ganz ohne Foto -------- */
  Screens.manualMeasure = {
    title: function () { return 'Maße manuell eingeben'; },
    html: function () {
      var w = App.state.wiz;
      var proj = Store.getProject(w.target.projectId);
      var nextNum = proj ? proj.measurements.length + 1 : 1;
      return '' +
        '<p class="instruct">Kein Foto vorhanden (Neubau/Anbau) – Maße direkt eintragen. ' +
          'Ein Plausibilitätscheck anhand einer Aufnahme entfällt dadurch.</p>' +
        '<div class="two">' +
          '<label class="field"><span>Breite (mm) *</span><input id="manW" type="number" min="1" placeholder="z. B. 1200"></label>' +
          '<label class="field"><span>Höhe (mm) *</span><input id="manH" type="number" min="1" placeholder="z. B. 1400"></label>' +
        '</div>' +
        '<div class="meta-form">' +
          '<label class="field"><span>Bezeichnung</span><input id="manLabel" type="text" value="' + esc(OBJECT_TYPE_TEXT[w.objectType].label) + ' ' + nextNum + '"></label>' +
          '<div class="two">' +
            '<label class="field"><span>Raum</span><input id="manRoom" type="text" placeholder="z. B. Bad"></label>' +
            '<label class="field"><span>Position</span><input id="manPos" type="text" placeholder="z. B. EG links"></label>' +
          '</div>' +
          '<label class="field"><span>Notiz</span><textarea id="manNote" rows="2"></textarea></label>' +
        '</div>' +
        (w.objectType === 'door' ? doorFieldsHtml('man') : '') +
        (w.objectType === 'window' ? windowFieldsHtml('man') : '') +
        '<button class="btn primary big" id="manSaveBtn">Aufmaß speichern</button>';
    },
    mount: function () {
      var w = App.state.wiz;
      if (w.objectType === 'window') bindWindowFields('man');
      document.getElementById('manSaveBtn').onclick = function () {
        var widthMm = parseFloat(document.getElementById('manW').value);
        var heightMm = parseFloat(document.getElementById('manH').value);
        if (!widthMm || !heightMm || widthMm <= 0 || heightMm <= 0) {
          toast('Bitte Breite und Höhe eingeben', 'error');
          return;
        }
        Store.addMeasurement(w.target.projectId, {
          source: 'pro',
          objectType: w.objectType,
          captureMode: 'manual',
          label: document.getElementById('manLabel').value || 'Aufmaß',
          room: document.getElementById('manRoom').value || '',
          position: document.getElementById('manPos').value || '',
          note: document.getElementById('manNote').value || '',
          referenceKey: null, referenceLabel: null,
          mmPerPx: null, refPts: [], corners: [],
          result: { widthMm: widthMm, heightMm: heightMm, diag1Mm: null, diag2Mm: null, synthetic: true },
          manualOverride: null,
          imageDataUrl: null,
          imgW: null, imgH: null,
          doorFields: w.objectType === 'door' ? readDoorFields('man') : null,
          windowFields: w.objectType === 'window' ? readWindowFields('man') : null
        });
        toast('Aufmaß gespeichert', 'success');
        App.state.wiz = null;
        App.go('project', { id: w.target.projectId }, { replace: true });
      };
    }
  };

  /* -------- Kunde: Einführung -------- */
  Screens.kundeIntro = {
    title: function () { return 'Selbstaufmaß'; },
    html: function () {
      var t = OBJECT_TYPE_TEXT[App.state.wiz.objectType];
      return '' +
        '<div class="steps-intro">' +
          '<h2>So funktioniert\'s</h2>' +
          '<ol class="howto">' +
            t.introSteps.map(function (s) { return '<li>' + s + '</li>'; }).join('') +
          '</ol>' +
        '</div>' +
        '<button class="btn primary big" id="startCap">Los geht\'s</button>';
    },
    mount: function () {
      document.getElementById('startCap').onclick = function () { App.go('capture'); };
    }
  };

  /* -------- Foto aufnehmen (beide Modi) -------- */
  Screens.capture = {
    title: function () { return 'Foto aufnehmen'; },
    html: function () {
      return '' +
        '<div class="level-wrap">' +
          '<div class="level"><div class="level-ring"></div><div class="bubble" id="bubble"></div></div>' +
          '<p class="level-text" id="levelText">Neigungsanzeige optional aktivieren</p>' +
          '<button class="btn ghost sm" id="enableLevel">Neigungsanzeige aktivieren</button>' +
        '</div>' +
        '<p class="hint">Tipp: A4-Blatt flach &amp; sichtbar platzieren, ganzes Fenster aufs Bild, Handy gerade halten.</p>' +
        '<label class="btn primary big filelabel">📷 Foto aufnehmen / auswählen' +
          '<input type="file" id="fileInput" accept="image/*" capture="environment" hidden>' +
        '</label>';
    },
    mount: function () {
      var input = document.getElementById('fileInput');
      input.onchange = function () {
        if (!input.files || !input.files[0]) return;
        var lbl = view.querySelector('.filelabel');
        lbl.textContent = 'Bild wird geladen …';
        loadImageFromFile(input.files[0]).then(function (img) {
          App.state.wiz.img = img;
          App.go('calibrate');
        }).catch(function () {
          toast('Bild konnte nicht geladen werden', 'error');
          App.go('capture', {}, { replace: true });
        });
      };
      document.getElementById('enableLevel').onclick = function () {
        function go() { startLevel(document.getElementById('bubble'), document.getElementById('levelText')); }
        if (global.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
          DeviceOrientationEvent.requestPermission().then(function (s) {
            if (s === 'granted') go(); else toast('Zugriff auf Sensoren abgelehnt');
          }).catch(function () { toast('Neigungsanzeige nicht verfügbar'); });
        } else if (global.DeviceOrientationEvent) { go(); }
        else { toast('Gerät unterstützt keine Neigungsanzeige'); }
      };
    }
  };

  /* -------- Schritt: Maßstab kalibrieren (A4-Blatt oder Strecke) -------- */
  function refNeeds(refKey) { return Geo.REFERENCES[refKey].type === 'rect' ? 4 : 2; }

  /** customMm wird nur für Referenzen ohne festes r.mm gebraucht (aktuell nur 'custom'). */
  function calcMmPerPx(refKey, pts, customMm) {
    var r = Geo.REFERENCES[refKey];
    if (r.type === 'rect') return Geo.mmPerPxFromRect(pts, r.dims);
    var mmVal = r.mm != null ? r.mm : customMm;
    if (!mmVal || mmVal <= 0) return null;
    return Geo.mmPerPx(pts[0], pts[1], mmVal);
  }

  Screens.calibrate = {
    title: function () { return 'Maßstab (1/2)'; },
    html: function () {
      var w = App.state.wiz;
      var opts = Object.keys(Geo.REFERENCES).map(function (k) {
        var sel = k === w.referenceKey ? ' selected' : '';
        return '<option value="' + k + '"' + sel + '>' + esc(Geo.REFERENCES[k].label) + '</option>';
      }).join('');
      return '' +
        '<p class="instruct" id="refHint"></p>' +
        '<label class="field"><span>Referenzobjekt</span><select id="refSel">' + opts + '</select></label>' +
        '<label class="field" id="customRefWrap"><span>Bekannte Länge (mm)</span>' +
          '<input id="customRefMm" type="number" min="1" placeholder="z. B. 1000" value="' + (w.customRefMm || '') + '"></label>' +
        '<div class="canvas-wrap"><canvas id="cv"></canvas></div>' +
        '<div class="readout" id="readout">Noch keine Punkte gesetzt</div>' +
        '<div class="actionbar">' +
          '<button class="btn ghost" id="undoBtn">Letzten Punkt zurück</button>' +
          '<button class="btn primary" id="nextBtn" disabled>Weiter ›</button>' +
        '</div>';
    },
    mount: function () {
      var w = App.state.wiz;
      var cv = document.getElementById('cv');
      var readout = document.getElementById('readout');
      var nextBtn = document.getElementById('nextBtn');
      var refHint = document.getElementById('refHint');
      var customWrap = document.getElementById('customRefWrap');
      var customInput = document.getElementById('customRefMm');

      function currentCustomMm() {
        var v = parseFloat(customInput.value);
        return isNaN(v) ? null : v;
      }

      function onChange(pts) {
        w.refPts = pts;
        var need = refNeeds(w.referenceKey);
        if (pts.length === need) {
          var mpp = calcMmPerPx(w.referenceKey, pts, currentCustomMm());
          readout.innerHTML = 'Maßstab: <b>' + (mpp ? mpp.toFixed(4) : '–') + ' mm/px</b>';
          nextBtn.disabled = !mpp;
        } else {
          readout.textContent = pts.length + ' / ' + need + ' Punkten gesetzt';
          nextBtn.disabled = true;
        }
      }

      var picker = new Picker(cv, { maxPoints: refNeeds(w.referenceKey), mode: 'line', color: '#f59e0b', onChange: onChange });
      App.state.picker = picker;
      picker.setImage(w.img);

      function applyRef() {
        var r = Geo.REFERENCES[w.referenceKey];
        var isRect = r.type === 'rect';
        var isCustom = w.referenceKey === 'custom';
        customWrap.hidden = !isCustom;
        refHint.innerHTML = isRect
          ? 'Tippe die <b>4 Ecken des A4-Blatts</b> an (Reihenfolge egal). Punkte lassen sich verschieben.'
          : isCustom
            ? 'Trage die <b>bekannte Länge</b> ein (z. B. eine bemaßte Strecke auf dem Plan) und markiere ihre <b>beiden Endpunkte</b>. Punkte lassen sich verschieben.'
            : 'Markiere <b>zwei Punkte</b> entlang der bekannten Länge (z. B. Kartenlänge). Punkte lassen sich verschieben.';
        picker.configure({
          maxPoints: isRect ? 4 : 2,
          mode: isRect ? 'window' : 'line',
          labels: isRect ? ['1', '2', '3', '4'] : ['A', 'B']
        });
      }
      applyRef();
      // Bereits gesetzte Punkte wiederherstellen (z. B. nach „Zurück")
      if (w.refPts && w.refPts.length === refNeeds(w.referenceKey)) {
        picker.points = w.refPts.slice(); picker.draw(); picker.onChange(picker.points);
      }

      document.getElementById('refSel').onchange = function (e) {
        w.referenceKey = e.target.value;
        w.refPts = [];
        applyRef();
      };
      customInput.oninput = function () {
        w.customRefMm = currentCustomMm();
        if (w.refPts.length === refNeeds(w.referenceKey)) onChange(w.refPts);
      };
      document.getElementById('undoBtn').onclick = function () { picker.undo(); };
      nextBtn.onclick = function () {
        if (!picker.isComplete()) return;
        var r = Geo.REFERENCES[w.referenceKey];
        var customMm = currentCustomMm();
        w.mmPerPx = calcMmPerPx(w.referenceKey, w.refPts, customMm);
        w.customRefMm = customMm;
        w.referenceLabel = r.label + (w.referenceKey === 'custom' && customMm ? ' (' + customMm + ' mm)' : '');
        App.go(w.captureMode === 'plan' ? 'planWindow' : 'window');
      };
    }
  };

  /* -------- Schritt: Fensterecken markieren -------- */
  Screens.window = {
    title: function () { return OBJECT_TYPE_TEXT[App.state.wiz.objectType].stepTitle; },
    html: function () {
      var t = OBJECT_TYPE_TEXT[App.state.wiz.objectType];
      return '' +
        '<p class="instruct">' + t.instruct + '</p>' +
        '<div class="canvas-wrap"><canvas id="cv"></canvas></div>' +
        '<div class="readout" id="readout">0 / 4 Ecken</div>' +
        '<div class="actionbar">' +
          '<button class="btn ghost" id="undoBtn">Letzten Punkt zurück</button>' +
          '<button class="btn primary" id="doneBtn" disabled>Fertig ›</button>' +
        '</div>';
    },
    mount: function () {
      var w = App.state.wiz;
      var cv = document.getElementById('cv');
      var readout = document.getElementById('readout');
      var doneBtn = document.getElementById('doneBtn');
      var picker = new Picker(cv, {
        maxPoints: 4, mode: 'window', color: '#a472f0',
        labels: OBJECT_TYPE_TEXT[w.objectType].cornerLabels,
        onChange: function (pts) {
          w.corners = pts;
          if (pts.length === 4) {
            var m = Geo.measure(pts, w.mmPerPx);
            readout.innerHTML = 'Breite ≈ <b>' + fmtMm(m.widthMm) + '</b> · Höhe ≈ <b>' + fmtMm(m.heightMm) + '</b>';
            doneBtn.disabled = false;
          } else {
            readout.textContent = pts.length + ' / 4 Ecken';
            doneBtn.disabled = true;
          }
        }
      });
      App.state.picker = picker;
      picker.setImage(w.img);
      if (w.corners.length) { picker.points = w.corners.slice(); picker.draw(); picker.onChange(picker.points); }
      document.getElementById('undoBtn').onclick = function () { picker.undo(); };
      doneBtn.onclick = function () {
        if (!picker.isComplete()) return;
        computeResult();
        // Bildpixel-Maße merken (nötig für die Foto-Overlay-viewBox der Visualisierung)
        w.imgW = w.img.naturalWidth;
        w.imgH = w.img.naturalHeight;
        // Komposit-Bild (Foto + Markierungen) für Anzeige/Protokoll sichern
        w.composite = cv.toDataURL('image/jpeg', 0.72);
        if (w.target.mode === 'kunde') App.go('kundeForm');
        else App.go('result');
      };
    }
  };

  /**
   * -------- Neubau Pfad (b): Planfoto, mehrere Fenster/Türen nacheinander --------
   * Ersetzt für captureMode==='plan' den Einzel-Screen Screens.window: Ecken
   * markieren → Merkmale inline ausfüllen → „Speichern & nächstes" (Picker
   * setzt zurück, derselbe Screen bleibt offen) oder „Fertig". Jedes
   * gespeicherte Element bekommt dieselbe wiz.planGroupId (siehe Screens.
   * buildMode) und ein zugeschnittenes Composite (cropCompositeFromCanvas),
   * damit nicht bei jedem Fenster erneut das komplette Planfoto im
   * localStorage landet.
   */
  Screens.planWindow = {
    title: function () { return 'Plan: Elemente markieren'; },
    html: function () {
      var w = App.state.wiz;
      var t = OBJECT_TYPE_TEXT[w.objectType];
      return '' +
        '<p class="instruct" id="planInstruct">' + t.instruct + '</p>' +
        '<div class="canvas-wrap"><canvas id="cv"></canvas></div>' +
        '<div class="readout" id="readout">0 / 4 Ecken</div>' +
        '<div class="actionbar">' +
          '<button class="btn ghost" id="undoBtn">Letzten Punkt zurück</button>' +
          '<button class="btn primary" id="doneBtn" disabled>Maße übernehmen ›</button>' +
        '</div>' +
        '<div id="planFieldsWrap" hidden>' +
          (w.objectType === 'door' ? doorFieldsHtml('p') : windowFieldsHtml('p')) +
          '<div class="meta-form">' +
            '<label class="field"><span>Bezeichnung</span><input id="pLabel" type="text" value="' + esc(t.label) + ' ' + (w.planCount + 1) + '"></label>' +
            '<div class="two">' +
              '<label class="field"><span>Raum</span><input id="pRoom" type="text"></label>' +
              '<label class="field"><span>Position</span><input id="pPos" type="text"></label>' +
            '</div>' +
          '</div>' +
          '<button class="btn primary big" id="saveNextBtn">Speichern &amp; nächstes Element markieren</button>' +
        '</div>' +
        '<p class="hint" id="planCountText">' + w.planCount + ' Element(e) auf diesem Plan bereits erfasst.</p>' +
        '<button class="btn ghost" id="finishBtn">Fertig – zurück zum Projekt</button>';
    },
    mount: function () {
      var w = App.state.wiz;
      var t = OBJECT_TYPE_TEXT[w.objectType];
      var cv = document.getElementById('cv');
      var readout = document.getElementById('readout');
      var doneBtn = document.getElementById('doneBtn');
      var fieldsWrap = document.getElementById('planFieldsWrap');
      var countText = document.getElementById('planCountText');

      w.imgW = w.img.naturalWidth;
      w.imgH = w.img.naturalHeight;

      var picker = new Picker(cv, {
        maxPoints: 4, mode: 'window', color: '#a472f0',
        labels: t.cornerLabels,
        onChange: function (pts) {
          w.corners = pts;
          if (pts.length === 4) {
            var m = Geo.measure(pts, w.mmPerPx);
            readout.innerHTML = 'Breite ≈ <b>' + fmtMm(m.widthMm) + '</b> · Höhe ≈ <b>' + fmtMm(m.heightMm) + '</b>';
            doneBtn.disabled = false;
          } else {
            readout.textContent = pts.length + ' / 4 Ecken';
            doneBtn.disabled = true;
          }
        }
      });
      App.state.picker = picker;
      picker.setImage(w.img);
      if (w.objectType === 'window') bindWindowFields('p');

      document.getElementById('undoBtn').onclick = function () { picker.undo(); };

      doneBtn.onclick = function () {
        if (!picker.isComplete()) return;
        fieldsWrap.hidden = false;
      };

      document.getElementById('saveNextBtn').onclick = function () {
        if (!picker.isComplete()) { toast('Bitte zuerst 4 Ecken markieren', 'error'); return; }
        var result = Geo.measure(w.corners, w.mmPerPx);
        var composite = cropCompositeFromCanvas(cv, w.corners, picker.view.scale, 40);
        var label = document.getElementById('pLabel').value || (t.label + ' ' + (w.planCount + 1));
        Store.addMeasurement(w.target.projectId, {
          source: 'pro',
          objectType: w.objectType,
          captureMode: 'plan',
          planGroupId: w.planGroupId,
          label: label,
          room: document.getElementById('pRoom').value || '',
          position: document.getElementById('pPos').value || '',
          note: '',
          referenceKey: w.referenceKey, referenceLabel: w.referenceLabel,
          mmPerPx: w.mmPerPx, refPts: w.refPts, corners: w.corners,
          result: result, manualOverride: null,
          // Zugeschnittenes Composite ≠ Koordinatenraum von result.orderedCorners
          // (die beziehen sich auf das volle Planfoto) — Foto-Overlay bewusst
          // deaktiviert (imgW/imgH null), statt es falsch auszurichten.
          imageDataUrl: composite,
          imgW: null, imgH: null,
          doorFields: w.objectType === 'door' ? readDoorFields('p') : null,
          windowFields: w.objectType === 'window' ? readWindowFields('p') : null
        });
        w.planCount++;
        toast('Element gespeichert – nächstes markieren', 'success');
        picker.reset();
        fieldsWrap.hidden = true;
        doneBtn.disabled = true;
        countText.textContent = w.planCount + ' Element(e) auf diesem Plan bereits erfasst.';
        var labelInput = document.getElementById('pLabel');
        if (labelInput) labelInput.value = t.label + ' ' + (w.planCount + 1);
      };

      document.getElementById('finishBtn').onclick = function () {
        App.state.wiz = null;
        App.go('project', { id: w.target.projectId }, { replace: true });
      };
    }
  };

  /* -------- Kunde: optionale Kontaktdaten, dann Übermittlung -------- */
  Screens.kundeForm = {
    title: function () { return 'Daten übermitteln' ; },
    html: function () {
      var w = App.state.wiz;
      return '' +
        '<p class="instruct">Optional: Damit der Fachbetrieb dein Aufmaß zuordnen kann.</p>' +
        (w.objectType === 'window' ?
          '<div class="result-img photo-overlay-wrap"><img src="' + w.composite + '" alt="Vorschau"><div class="photo-overlay" id="kOverlay"></div></div>' : '') +
        '<label class="field"><span>Name</span><input id="kName" type="text" placeholder="Vor- und Nachname"></label>' +
        '<label class="field"><span>Adresse / Ort</span><input id="kAddr" type="text" placeholder="Straße, PLZ Ort"></label>' +
        '<label class="field"><span>Bezeichnung ' + esc(OBJECT_TYPE_TEXT[w.objectType].label) + '</span><input id="kLabel" type="text" placeholder="z. B. Wohnzimmer links"></label>' +
        '<label class="field"><span>Notiz</span><textarea id="kNote" rows="2" placeholder="Anmerkungen"></textarea></label>' +
        (w.objectType === 'door' ? doorFieldsHtml('k') : '') +
        (w.objectType === 'window' ? windowFieldsHtml('k') : '') +
        '<button class="btn primary big" id="submitBtn">Aufmaß übermitteln</button>';
    },
    mount: function () {
      var w = App.state.wiz;
      if (w.objectType === 'window') bindWindowFields('k');
      document.getElementById('submitBtn').onclick = function () {
        Store.addMeasurement(null, {
          source: 'kunde',
          objectType: w.objectType,
          label: document.getElementById('kLabel').value || 'Selbstaufmaß',
          room: '', position: '',
          note: document.getElementById('kNote').value || '',
          customerName: document.getElementById('kName').value || '',
          customerAddress: document.getElementById('kAddr').value || '',
          referenceKey: w.referenceKey, referenceLabel: w.referenceLabel,
          mmPerPx: w.mmPerPx, refPts: w.refPts, corners: w.corners,
          result: w.result, manualOverride: null,
          imageDataUrl: w.composite,
          imgW: w.imgW, imgH: w.imgH,
          doorFields: w.objectType === 'door' ? readDoorFields('k') : null,
          windowFields: w.objectType === 'window' ? readWindowFields('k') : null
        });
        App.go('done', {}, { replace: true });
      };
    }
  };

  /* -------- Kunde: Erfolgsmeldung (kein Datenzugriff!) -------- */
  Screens.done = {
    title: function () { return 'Erledigt'; },
    html: function () {
      return '' +
        '<div class="success">' +
          '<div class="success-ic">✓</div>' +
          '<h2>Aufmaß erfolgreich übermittelt</h2>' +
          '<p>Vielen Dank! Deine Daten wurden an den Fachbetrieb übermittelt. Dieser meldet sich mit den Ergebnissen bei dir.</p>' +
        '</div>' +
        '<button class="btn primary big" id="homeBtn">Fertig</button>';
    },
    mount: function () {
      App.state.wiz = null;
      document.getElementById('homeBtn').onclick = function () { App.home(); };
    }
  };

  /* -------- Profi: Ergebnis prüfen / korrigieren / speichern -------- */
  Screens.result = {
    title: function () { return 'Ergebnis prüfen'; },
    html: function () {
      var w = App.state.wiz;
      var m = w.result;
      var check = Geo.checkPlausibility(m, w.objectType);
      var issues = check.issues.length
        ? check.issues.map(function (i) { return '<li class="' + i.level + '">' + esc(i.msg) + '</li>'; }).join('')
        : '<li class="ok">Keine Auffälligkeiten – Aufnahme wirkt plausibel.</li>';
      var proj = Store.getProject(w.target.projectId);
      var nextNum = proj ? (proj.measurements.length + 1) : 1;
      return '' +
        '<div class="result-img photo-overlay-wrap"><img src="' + w.composite + '" alt="Aufmaß">' +
          (w.objectType === 'window' ? '<div class="photo-overlay" id="mOverlay"></div>' : '') +
        '</div>' +
        '<div class="quality q' + (check.score >= 80 ? 'good' : check.score >= 55 ? 'mid' : 'bad') + '">' +
          'Qualität: <b>' + check.score + ' / 100</b></div>' +
        '<div class="measures">' +
          '<div class="measure"><span>Breite</span><b>' + fmtMm(m.widthMm) + '</b><i>' + fmtCm(m.widthMm) + '</i></div>' +
          '<div class="measure"><span>Höhe</span><b>' + fmtMm(m.heightMm) + '</b><i>' + fmtCm(m.heightMm) + '</i></div>' +
          '<div class="measure"><span>Diagonale 1</span><b>' + fmtMm(m.diag1Mm) + '</b></div>' +
          '<div class="measure"><span>Diagonale 2</span><b>' + fmtMm(m.diag2Mm) + '</b></div>' +
        '</div>' +
        '<ul class="issues">' + issues + '</ul>' +
        '<details class="correct"><summary>Manuelle Korrektur</summary>' +
          '<div class="two">' +
            '<label class="field"><span>Breite (mm)</span><input id="ovW" type="number" value="' + Math.round(m.widthMm) + '"></label>' +
            '<label class="field"><span>Höhe (mm)</span><input id="ovH" type="number" value="' + Math.round(m.heightMm) + '"></label>' +
          '</div>' +
        '</details>' +
        '<div class="meta-form">' +
          '<label class="field"><span>Bezeichnung</span><input id="mLabel" type="text" value="' + esc(OBJECT_TYPE_TEXT[w.objectType].label) + ' ' + nextNum + '"></label>' +
          '<div class="two">' +
            '<label class="field"><span>Raum</span><input id="mRoom" type="text" placeholder="z. B. Bad"></label>' +
            '<label class="field"><span>Position</span><input id="mPos" type="text" placeholder="z. B. EG links"></label>' +
          '</div>' +
          '<label class="field"><span>Notiz</span><textarea id="mNote" rows="2"></textarea></label>' +
        '</div>' +
        (w.objectType === 'door' ? doorFieldsHtml('m') : '') +
        (w.objectType === 'window' ? windowFieldsHtml('m') : '') +
        '<button class="btn primary big" id="saveBtn">Aufmaß speichern</button>';
    },
    mount: function () {
      var w0 = App.state.wiz;
      if (w0.objectType === 'window') bindWindowFields('m');
      document.getElementById('saveBtn').onclick = function () {
        var w = App.state.wiz;
        var ov = null;
        var ovW = parseFloat(document.getElementById('ovW').value);
        var ovH = parseFloat(document.getElementById('ovH').value);
        if ((!isNaN(ovW) && Math.round(ovW) !== Math.round(w.result.widthMm)) ||
            (!isNaN(ovH) && Math.round(ovH) !== Math.round(w.result.heightMm))) {
          ov = { widthMm: ovW, heightMm: ovH };
        }
        Store.addMeasurement(w.target.projectId, {
          source: 'pro',
          objectType: w.objectType,
          label: document.getElementById('mLabel').value || 'Aufmaß',
          room: document.getElementById('mRoom').value || '',
          position: document.getElementById('mPos').value || '',
          note: document.getElementById('mNote').value || '',
          referenceKey: w.referenceKey, referenceLabel: w.referenceLabel,
          mmPerPx: w.mmPerPx, refPts: w.refPts, corners: w.corners,
          result: w.result, manualOverride: ov,
          imageDataUrl: w.composite,
          imgW: w.imgW, imgH: w.imgH,
          doorFields: w.objectType === 'door' ? readDoorFields('m') : null,
          windowFields: w.objectType === 'window' ? readWindowFields('m') : null
        });
        toast('Aufmaß gespeichert', 'success');
        App.state.wiz = null;
        App.go('project', { id: w.target.projectId }, { replace: true });
      };
    }
  };

  /* -------- Profi: Login -------- */
  Screens.proLogin = {
    title: function () { return 'Profi-Login'; },
    html: function () {
      var hint = Store.isDefaultPin() ? '<p class="hint">Standard-PIN beim ersten Start: <b>1234</b> (später unter Einstellungen ändern).</p>' : '';
      return '' +
        '<div class="login">' +
          '<div class="login-ic">🔒</div>' +
          '<h2>Admin-Zugang</h2>' +
          '<p>Nur der Fachbetrieb sieht die erfassten Aufmaße.</p>' +
          '<input id="pin" type="password" inputmode="numeric" placeholder="PIN" autocomplete="off">' +
          '<button class="btn primary big" id="loginBtn">Anmelden</button>' +
          hint +
        '</div>';
    },
    mount: function () {
      var pin = document.getElementById('pin');
      function doLogin() {
        if (Store.login(pin.value)) { App.go('dashboard', {}, { replace: true }); }
        else { toast('Falsche PIN', 'error'); pin.value = ''; pin.focus(); }
      }
      document.getElementById('loginBtn').onclick = doLogin;
      pin.onkeydown = function (e) { if (e.key === 'Enter') doLogin(); };
      pin.focus();
    }
  };

  /* -------- Profi: Dashboard -------- */
  Screens.dashboard = {
    title: function () { return 'Projekte'; },
    html: function () {
      if (!Store.isAdmin()) return '<p class="instruct">Bitte zuerst anmelden.</p>';
      var inbox = Store.getInbox();
      var projects = Store.listProjects();
      var inboxHtml = inbox.length
        ? '<div class="section"><h3>Eingang (Kunden-Aufmaße) <span class="count">' + inbox.length + '</span></h3>' +
            inbox.map(function (m) {
              return '<div class="row inbox" data-id="' + m.id + '">' +
                (m.imageDataUrl ? '<img class="thumb" src="' + m.imageDataUrl + '">' : '<div class="thumb"></div>') +
                '<div class="row-main"><b>' + esc(m.label || 'Selbstaufmaß') + '</b>' +
                  '<span>' + esc(m.customerName || 'ohne Name') + ' · ' + fmtMm(eff(m).w) + ' × ' + fmtMm(eff(m).h) + '</span></div>' +
                '<button class="btn sm assign" data-id="' + m.id + '">Zuordnen</button>' +
              '</div>';
            }).join('') +
          '</div>'
        : '';
      var projHtml = projects.length
        ? projects.map(function (p) {
            return '<button class="card proj" data-id="' + p.id + '">' +
              '<span class="card-t">' + esc(p.name) + '</span>' +
              '<span class="card-d">' + esc(p.customer && p.customer.name || 'ohne Kunde') + '</span>' +
              '<span class="pill">' + p.measurements.length + ' Aufmaß(e)</span>' +
            '</button>';
          }).join('')
        : '<p class="empty">Noch keine Projekte. Lege das erste an.</p>';
      return '' +
        '<div class="toolbar">' +
          '<button class="btn primary" id="newProj">+ Neues Projekt</button>' +
          '<button class="btn ghost" id="exportAll">CSV gesamt</button>' +
          '<button class="btn ghost" id="settings">Einstellungen</button>' +
          '<button class="btn ghost" id="logout">Abmelden</button>' +
        '</div>' +
        inboxHtml +
        '<div class="section"><h3>Projekte</h3><div class="cards">' + projHtml + '</div></div>';
    },
    mount: function () {
      if (!Store.isAdmin()) { App.go('proLogin', {}, { replace: true }); return; }
      document.getElementById('newProj').onclick = function () { App.go('projectNew'); };
      document.getElementById('logout').onclick = function () { Store.logout(); App.home(); };
      document.getElementById('settings').onclick = function () { App.go('settings'); };
      document.getElementById('exportAll').onclick = function () {
        var rows = Store.allMeasurements();
        if (!rows.length) { toast('Keine Daten zum Export'); return; }
        Exporter.download('aufmasse_gesamt.csv', Exporter.toCsv(rows));
      };
      view.querySelectorAll('.proj').forEach(function (b) {
        b.onclick = function () { App.go('project', { id: b.dataset.id }); };
      });
      view.querySelectorAll('.row.inbox .assign').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          assignInbox(b.dataset.id);
        };
      });
    }
  };

  function eff(m) {
    return {
      w: (m.manualOverride && m.manualOverride.widthMm) || m.result.widthMm,
      h: (m.manualOverride && m.manualOverride.heightMm) || m.result.heightMm
    };
  }

  function assignInbox(measurementId) {
    var projects = Store.listProjects();
    if (!projects.length) { toast('Erst ein Projekt anlegen'); return; }
    var names = projects.map(function (p, i) { return (i + 1) + ') ' + p.name; }).join('\n');
    var pick = prompt('In welches Projekt verschieben?\n' + names + '\n\nNummer eingeben:');
    var idx = parseInt(pick, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= projects.length) return;
    Store.assignInboxToProject(measurementId, projects[idx].id);
    toast('Verschoben nach „' + projects[idx].name + '“', 'success');
    App.go('dashboard', {}, { replace: true });
  }

  /* -------- Profi: Neues Projekt -------- */
  Screens.projectNew = {
    title: function () { return 'Neues Projekt'; },
    html: function () {
      return '' +
        '<label class="field"><span>Projektname *</span><input id="pName" type="text" placeholder="z. B. Sanierung Musterstraße 1"></label>' +
        '<label class="field"><span>Kunde</span><input id="cName" type="text" placeholder="Name"></label>' +
        '<label class="field"><span>Adresse</span><input id="cAddr" type="text"></label>' +
        '<div class="two">' +
          '<label class="field"><span>Telefon</span><input id="cPhone" type="text"></label>' +
          '<label class="field"><span>E-Mail</span><input id="cMail" type="text"></label>' +
        '</div>' +
        '<label class="field"><span>Notiz</span><textarea id="pNote" rows="2"></textarea></label>' +
        '<button class="btn primary big" id="createBtn">Projekt anlegen</button>';
    },
    mount: function () {
      document.getElementById('createBtn').onclick = function () {
        var name = document.getElementById('pName').value.trim();
        if (!name) { toast('Bitte Projektname eingeben', 'error'); return; }
        var p = Store.addProject({
          name: name,
          customer: {
            name: document.getElementById('cName').value,
            address: document.getElementById('cAddr').value,
            phone: document.getElementById('cPhone').value,
            email: document.getElementById('cMail').value
          },
          note: document.getElementById('pNote').value
        });
        App.go('project', { id: p.id }, { replace: true });
      };
    }
  };

  /* -------- Profi: Projektdetail -------- */
  Screens.project = {
    title: function (p) { var pr = Store.getProject(p.id); return pr ? pr.name : 'Projekt'; },
    html: function (params) {
      var p = Store.getProject(params.id);
      if (!p) return '<p class="empty">Projekt nicht gefunden.</p>';
      var cust = p.customer || {};
      var list = p.measurements.length
        ? p.measurements.map(function (m) {
            var e = eff(m);
            var check = Geo.checkPlausibility(m.result, m.objectType);
            var badge = m.source === 'kunde' ? '<span class="src kunde">Kunde</span>' : '';
            var typeBadge = '<span class="src type">' + esc(OBJECT_TYPE_TEXT[m.objectType || 'window'].label) + '</span>';
            var materialKey = m.windowFields && m.windowFields.fensterart;
            var materialBadge = materialKey ? '<span class="src type">' + esc(FENSTERART_OPTIONS[materialKey] ? FENSTERART_OPTIONS[materialKey].label : materialKey) + '</span>' : '';
            // Neubau-Pfade (a)/(b): eigene Badge, da ohne bzw. mit anderem Foto
            // erfasst als der normale Foto-Flow (siehe Screens.buildMode).
            var modeBadge = m.captureMode === 'manual' ? '<span class="src type">✎ Manuell</span>'
              : m.captureMode === 'plan' ? '<span class="src type">📐 Plan</span>' : '';
            return '<div class="row meas" data-id="' + m.id + '">' +
              (m.imageDataUrl ? '<img class="thumb" src="' + m.imageDataUrl + '">' : '<div class="thumb"></div>') +
              '<div class="row-main"><b>' + esc(m.label) + ' ' + typeBadge + ' ' + materialBadge + ' ' + modeBadge + ' ' + badge + '</b>' +
                '<span>' + fmtMm(e.w) + ' × ' + fmtMm(e.h) + (m.manualOverride ? ' · korrigiert' : '') +
                ' · Q' + check.score + '</span></div>' +
              '<span class="chev">›</span>' +
            '</div>';
          }).join('')
        : '<p class="empty">Noch kein Aufmaß. Starte das erste.</p>';
      return '' +
        '<div class="cust-card">' +
          '<div><b>' + esc(cust.name || 'ohne Kunde') + '</b></div>' +
          (cust.address ? '<div class="muted">' + esc(cust.address) + '</div>' : '') +
          (cust.phone ? '<div class="muted">' + esc(cust.phone) + '</div>' : '') +
        '</div>' +
        '<div class="toolbar">' +
          '<button class="btn primary" id="newMeas">+ Aufmaß</button>' +
          '<button class="btn ghost" id="newBuild">+ Neubau/Planung</button>' +
          '<button class="btn ghost" id="pdfBtn">PDF-Protokoll</button>' +
          '<button class="btn ghost" id="csvBtn">CSV</button>' +
          '<button class="btn ghost danger" id="delProj">Löschen</button>' +
        '</div>' +
        '<div class="section"><h3>Aufmaße <span class="count">' + p.measurements.length + '</span></h3>' + list + '</div>';
    },
    mount: function (params) {
      var p = Store.getProject(params.id);
      if (!p) return;
      document.getElementById('newMeas').onclick = function () {
        newWiz({ mode: 'pro', projectId: p.id });
        App.go('objectType');
      };
      document.getElementById('newBuild').onclick = function () {
        newWiz({ mode: 'pro', projectId: p.id });
        App.state.wiz.captureMode = null; // Sentinel: Screens.objectType/.fensterart verzweigen zu buildMode
        App.go('objectType');
      };
      document.getElementById('pdfBtn').onclick = function () {
        if (!p.measurements.length) { toast('Kein Aufmaß vorhanden'); return; }
        Exporter.printProtocol(p, p.measurements, Store.getCompany());
      };
      document.getElementById('csvBtn').onclick = function () {
        if (!p.measurements.length) { toast('Kein Aufmaß vorhanden'); return; }
        var rows = p.measurements.map(function (m) { return { project: p, measurement: m }; });
        Exporter.download('aufmass_' + p.name.replace(/\W+/g, '_') + '.csv', Exporter.toCsv(rows));
      };
      document.getElementById('delProj').onclick = function () {
        if (confirm('Projekt „' + p.name + '“ inklusive aller Aufmaße löschen?')) {
          Store.deleteProject(p.id);
          App.go('dashboard', {}, { replace: true });
        }
      };
      view.querySelectorAll('.row.meas').forEach(function (r) {
        r.onclick = function () { App.go('measurement', { projectId: p.id, id: r.dataset.id }); };
      });
    }
  };

  /* -------- Profi: Aufmaß-Detail (anzeigen/korrigieren) -------- */
  Screens.measurement = {
    title: function () { return 'Aufmaß'; },
    html: function (params) {
      var p = Store.getProject(params.projectId);
      var m = (p ? p.measurements : []).filter(function (x) { return x.id === params.id; })[0];
      if (!m) return '<p class="empty">Aufmaß nicht gefunden.</p>';
      var r = m.result, e = eff(m);
      var check = Geo.checkPlausibility(r, m.objectType);
      var issues = check.issues.length
        ? check.issues.map(function (i) { return '<li class="' + i.level + '">' + esc(i.msg) + '</li>'; }).join('')
        : '<li class="ok">Keine Auffälligkeiten.</li>';
      var isWindow = m.objectType === 'window';
      // Neubau Pfad (b): das gespeicherte Foto ist ein Ausschnitt des
      // Planfotos (siehe cropCompositeFromCanvas), dessen Koordinatenraum
      // nicht mehr zu result.orderedCorners passt — Overlay bewusst
      // ausgeblendet statt falsch ausgerichtet zu zeichnen. Pfad (a) hat
      // ohnehin kein Foto (imageDataUrl null).
      var showOverlay = isWindow && m.captureMode !== 'plan';
      return '' +
        (m.imageDataUrl
          ? '<div class="result-img photo-overlay-wrap">' +
              '<img id="dPhoto" src="' + m.imageDataUrl + '" alt="Aufmaß">' +
              (showOverlay ? '<div class="photo-overlay" id="dOverlay"></div>' : '') +
            '</div>'
          : '<p class="hint">Kein Foto (manuell erfasst, Neubau-Pfad).</p>') +
        '<div class="measures">' +
          '<div class="measure"><span>Breite</span><b>' + fmtMm(e.w) + '</b><i>' + fmtCm(e.w) + '</i></div>' +
          '<div class="measure"><span>Höhe</span><b>' + fmtMm(e.h) + '</b><i>' + fmtCm(e.h) + '</i></div>' +
          '<div class="measure"><span>Diagonale 1</span><b>' + fmtMm(r.diag1Mm) + '</b></div>' +
          '<div class="measure"><span>Diagonale 2</span><b>' + fmtMm(r.diag2Mm) + '</b></div>' +
        '</div>' +
        '<ul class="issues">' + issues + '</ul>' +
        '<details class="correct"' + (m.manualOverride ? ' open' : '') + '><summary>Maße korrigieren</summary>' +
          '<div class="two">' +
            '<label class="field"><span>Breite (mm)</span><input id="ovW" type="number" value="' + Math.round(e.w) + '"></label>' +
            '<label class="field"><span>Höhe (mm)</span><input id="ovH" type="number" value="' + Math.round(e.h) + '"></label>' +
          '</div>' +
          '<label class="field"><span>Bezeichnung</span><input id="mLabel" type="text" value="' + esc(m.label) + '"></label>' +
          '<label class="field"><span>Notiz</span><textarea id="mNote" rows="2">' + esc(m.note || '') + '</textarea></label>' +
          '<button class="btn primary" id="saveEdit">Änderungen speichern</button>' +
        '</details>' +
        (isWindow ?
          '<details class="correct"' + (m.windowFields ? ' open' : '') + '><summary>Fenster-Merkmale bearbeiten</summary>' +
            windowFieldsHtml('d', m.windowFields) +
            '<button class="btn primary" id="saveWindowFields">Merkmale speichern</button>' +
          '</details>' : '') +
        '<div class="toolbar">' +
          '<button class="btn ghost" id="pdfOne">PDF-Protokoll</button>' +
          '<button class="btn ghost danger" id="delMeas">Aufmaß löschen</button>' +
        '</div>';
    },
    mount: function (params) {
      var p = Store.getProject(params.projectId);
      var m = p.measurements.filter(function (x) { return x.id === params.id; })[0];
      document.getElementById('saveEdit').onclick = function () {
        var ovW = parseFloat(document.getElementById('ovW').value);
        var ovH = parseFloat(document.getElementById('ovH').value);
        var ov = null;
        if ((!isNaN(ovW) && Math.round(ovW) !== Math.round(m.result.widthMm)) ||
            (!isNaN(ovH) && Math.round(ovH) !== Math.round(m.result.heightMm))) {
          ov = { widthMm: ovW, heightMm: ovH };
        }
        Store.updateMeasurement(params.projectId, params.id, {
          manualOverride: ov,
          label: document.getElementById('mLabel').value || m.label,
          note: document.getElementById('mNote').value
        });
        toast('Gespeichert', 'success');
        App.go('measurement', params, { replace: true });
      };
      if (m.objectType === 'window') {
        var photo = document.getElementById('dPhoto');
        if (photo && m.captureMode !== 'plan') {
          var ctx = { objectType: 'window', orderedCorners: m.result && m.result.orderedCorners };
          var setupOverlay = function () {
            // Alte Aufmaße ohne gespeicherte imgW/imgH: die Bildpixel-Maße des
            // Komposit-Fotos entsprechen denen, gegen die die Ecken gemessen wurden.
            ctx.imgW = m.imgW || photo.naturalWidth;
            ctx.imgH = m.imgH || photo.naturalHeight;
            bindWindowFields('d', ctx);
          };
          if (photo.complete && photo.naturalWidth) setupOverlay(); else photo.onload = setupOverlay;
        } else {
          // Kein Foto (Pfad a) oder Overlay bewusst deaktiviert (Pfad b, s. o.) —
          // Fenster-Merkmale-Formular trotzdem verdrahten (Öffnungsart-Toggle etc.).
          bindWindowFields('d', { objectType: 'window' });
        }
        document.getElementById('saveWindowFields').onclick = function () {
          Store.updateMeasurement(params.projectId, params.id, { windowFields: readWindowFields('d') });
          toast('Merkmale gespeichert', 'success');
          App.go('measurement', params, { replace: true });
        };
      }
      document.getElementById('pdfOne').onclick = function () {
        Exporter.printProtocol(p, [m], Store.getCompany());
      };
      document.getElementById('delMeas').onclick = function () {
        if (confirm('Dieses Aufmaß löschen?')) {
          Store.deleteMeasurement(params.projectId, params.id);
          App.go('project', { id: params.projectId }, { replace: true });
        }
      };
    }
  };

  /* -------- Profi: Einstellungen -------- */
  Screens.settings = {
    title: function () { return 'Einstellungen'; },
    html: function () {
      var c = Store.getCompany();
      return '' +
        '<div class="section"><h3>Firma (für Protokoll)</h3>' +
          '<label class="field"><span>Firmenname</span><input id="coName" type="text" value="' + esc(c.name || '') + '"></label>' +
          '<label class="field"><span>Kontakt (Adresse/Tel.)</span><input id="coContact" type="text" value="' + esc(c.contact || '') + '"></label>' +
          '<button class="btn primary" id="saveCo">Speichern</button>' +
        '</div>' +
        '<div class="section"><h3>Admin-PIN ändern</h3>' +
          '<label class="field"><span>Neue PIN</span><input id="newPin" type="password" inputmode="numeric"></label>' +
          '<button class="btn primary" id="savePin">PIN ändern</button>' +
        '</div>' +
        '<div class="section"><h3>Daten</h3>' +
          '<button class="btn ghost danger" id="resetAll">Alle Daten zurücksetzen</button>' +
        '</div>';
    },
    mount: function () {
      document.getElementById('saveCo').onclick = function () {
        Store.setCompany({ name: document.getElementById('coName').value, contact: document.getElementById('coContact').value });
        toast('Firmendaten gespeichert', 'success');
      };
      document.getElementById('savePin').onclick = function () {
        var v = document.getElementById('newPin').value.trim();
        if (v.length < 4) { toast('Mindestens 4 Zeichen', 'error'); return; }
        Store.changePin(v);
        toast('PIN geändert', 'success');
        document.getElementById('newPin').value = '';
      };
      document.getElementById('resetAll').onclick = function () {
        if (confirm('Wirklich ALLE Projekte, Aufmaße und Einstellungen löschen?')) {
          Store.resetAll();
          toast('Zurückgesetzt');
          App.go('dashboard', {}, { replace: true });
        }
      };
    }
  };

  /* ----------------- Start ----------------- */

  App.init = function () {
    view = document.getElementById('view');
    header = document.getElementById('appHeader');
    Store.load();
    App.home();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  };

  global.App = App;
  document.addEventListener('DOMContentLoaded', App.init);
})(window);
