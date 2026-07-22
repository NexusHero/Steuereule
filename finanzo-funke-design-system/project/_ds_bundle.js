/* @ds-bundle: {"format":4,"namespace":"FinanzoFunkeDesignSystem_7e417e","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"Chip","sourcePath":"components/actions/Chip.jsx"},{"name":"Pill","sourcePath":"components/actions/Pill.jsx"},{"name":"AiChip","sourcePath":"components/ai/AiChip.jsx"},{"name":"BeraterLeiste","sourcePath":"components/ai/BeraterLeiste.jsx"},{"name":"HerkunftsChip","sourcePath":"components/ai/HerkunftsChip.jsx"},{"name":"KiWert","sourcePath":"components/ai/KiWert.jsx"},{"name":"Balken","sourcePath":"components/feedback/Balken.jsx"},{"name":"Banner","sourcePath":"components/feedback/Banner.jsx"},{"name":"Ring","sourcePath":"components/feedback/Ring.jsx"},{"name":"Sticker","sourcePath":"components/feedback/Sticker.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Feld","sourcePath":"components/forms/Feld.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Option","sourcePath":"components/forms/Option.jsx"},{"name":"SchalterZeile","sourcePath":"components/forms/SchalterZeile.jsx"},{"name":"TabBar","sourcePath":"components/navigation/TabBar.jsx"},{"name":"Sheet","sourcePath":"components/overlay/Sheet.jsx"},{"name":"Begriff","sourcePath":"components/wissen/Begriff.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"cd5284795795","components/actions/Chip.jsx":"e98992abcac9","components/actions/Pill.jsx":"3b4570b38cdf","components/ai/AiChip.jsx":"4ac8a95d6399","components/ai/BeraterLeiste.jsx":"d5859c56cba1","components/ai/HerkunftsChip.jsx":"283dbee9ea84","components/ai/KiWert.jsx":"34af813299eb","components/feedback/Balken.jsx":"6693b23cd629","components/feedback/Banner.jsx":"00a43f359591","components/feedback/Ring.jsx":"e175af6d66b2","components/feedback/Sticker.jsx":"ead41b350be1","components/feedback/Toast.jsx":"81e182ee1fb6","components/forms/Feld.jsx":"5e9739072428","components/forms/Input.jsx":"fdce479afa12","components/forms/Option.jsx":"bfe522d13ad7","components/forms/SchalterZeile.jsx":"1bbf3338cde4","components/navigation/TabBar.jsx":"e0403ece68c8","components/overlay/Sheet.jsx":"80ff64df44f5","components/wissen/Begriff.jsx":"a6503ed227ae","ui_kits/app/Abgabe.jsx":"87553eb11fa0","ui_kits/app/Auth.jsx":"f70220682848","ui_kits/app/Belege.jsx":"9e97f741be19","ui_kits/app/Berater.jsx":"694be6332fa1","ui_kits/app/Bescheid.jsx":"cb91d3cde6e9","ui_kits/app/Cockpit.jsx":"6d57017715d4","ui_kits/app/Datenschutz.jsx":"1f3dfd057c01","ui_kits/app/EulenModus.jsx":"79c42349495b","ui_kits/app/GgTracker.jsx":"1ac9cf7c6576","ui_kits/app/Interview.jsx":"dfcfeb0b7970","ui_kits/app/JahrDetail.jsx":"06a7e25cb646","ui_kits/app/JahrTab.jsx":"102418a4c86d","ui_kits/app/Jahre.jsx":"65c85bdb0198","ui_kits/app/Lebenslagen.jsx":"dbec8d0ca03d","ui_kits/app/Onboarding.jsx":"430ce8e4e38d","ui_kits/app/Paywall.jsx":"6b41deb066c4","ui_kits/app/Profil.jsx":"43291a5f10ab","ui_kits/app/Registrierung.jsx":"723e7e5b2949","ui_kits/app/Scan.jsx":"20c4a945e047","ui_kits/app/Statistik.jsx":"8df81f21c190","ui_kits/app/Uebertragen.jsx":"ddf9d89054af","ui_kits/app/Veranlagung.jsx":"a6961bf0ac01","ui_kits/app/demo-daten.js":"a162c7bb4c0a"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.FinanzoFunkeDesignSystem_7e417e = window.FinanzoFunkeDesignSystem_7e417e || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/actions/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Funke-Button — Limette, Tinte-Kontur, harter Schatten. Druck drückt auf den Schatten. */
function Button({
  variante = 'primaer',
  disabled = false,
  onClick,
  style,
  children,
  ...rest
}) {
  const cls = 'fk-btn' + (variante && variante !== 'primaer' ? ' ' + variante : '');
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls,
    disabled: disabled,
    onClick: onClick,
    style: style
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/actions/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Chip — Pille mit Tinte-Kontur. Als <button> wenn onClick gesetzt, sonst <span>. */
function Chip({
  variante = 'standard',
  aktiv = false,
  onClick,
  style,
  children,
  ...rest
}) {
  const cls = 'fk-chip' + (variante !== 'standard' ? ' ' + variante : '');
  if (onClick) {
    return /*#__PURE__*/React.createElement("button", _extends({
      className: cls,
      "aria-pressed": aktiv || undefined,
      onClick: onClick,
      style: style
    }, rest), children);
  }
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls + (aktiv ? ' aktiv' : ''),
    style: style
  }, rest), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Chip.jsx", error: String((e && e.message) || e) }); }

// components/actions/Pill.jsx
try { (() => {
/** Mono-Metadaten-Pille (Steuerjahr, Zähler) — nie interaktiv. */
function Pill({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "fk-pill num",
    style: style
  }, children);
}
Object.assign(__ds_scope, { Pill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Pill.jsx", error: String((e && e.message) || e) }); }

// components/ai/AiChip.jsx
try { (() => {
/** KI-Absender-Chip — Violett-Territorium, immer mit „B"-Punkt gekennzeichnet. */
function AiChip({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "fk-ai-chip",
    "data-ai": "true",
    style: style
  }, /*#__PURE__*/React.createElement("span", {
    className: "fk-ai-dot",
    style: {
      width: 16,
      height: 16,
      fontSize: 10
    },
    "aria-hidden": "true"
  }, "B"), children);
}
Object.assign(__ds_scope, { AiChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ai/AiChip.jsx", error: String((e && e.message) || e) }); }

// components/ai/BeraterLeiste.jsx
try { (() => {
/** Muster B — der Berater ist auf jedem Screen präsent: schmale violette Leiste, nie modal. */
function BeraterLeiste({
  text,
  onOeffnen
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: "fk-ai-bar",
    "data-ai": "true",
    onClick: onOeffnen,
    "aria-label": `Berater: ${text}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "fk-ai-dot",
    "aria-hidden": "true"
  }, "B"), /*#__PURE__*/React.createElement("span", null, text));
}
Object.assign(__ds_scope, { BeraterLeiste });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ai/BeraterLeiste.jsx", error: String((e && e.message) || e) }); }

// components/ai/HerkunftsChip.jsx
try { (() => {
const {
  useState
} = React;
/** Muster A — jede Zahl ist anfassbar: Beleg, Regel, Rechenweg in einem Popover. */
function HerkunftsChip({
  quelle
}) {
  const [offen, setOffen] = useState(false);
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-block'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "fk-chip src",
    onClick: () => setOffen(!offen),
    "aria-expanded": offen,
    style: {
      minHeight: 28,
      fontSize: 12,
      padding: '2px 10px'
    }
  }, "Herkunft"), offen && /*#__PURE__*/React.createElement("span", {
    role: "dialog",
    "aria-label": "Herkunft dieses Werts",
    style: {
      position: 'absolute',
      right: 0,
      top: '115%',
      zIndex: 5,
      width: 240,
      background: 'var(--karte)',
      border: 'var(--kontur) solid var(--tinte)',
      borderRadius: 'var(--radius-s)',
      boxShadow: 'var(--schatten-hart)',
      padding: 12,
      fontSize: 13,
      display: 'block',
      textAlign: 'left'
    }
  }, quelle.beleg && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("b", null, "Beleg:"), " ", quelle.beleg), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("b", null, "Regel:"), " ", /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-mono)',
      fontSize: 12
    }
  }, quelle.regel)), quelle.rechenweg && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("b", null, "Rechenweg:"), " ", /*#__PURE__*/React.createElement("span", {
    className: "num"
  }, quelle.rechenweg))));
}
Object.assign(__ds_scope, { HerkunftsChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ai/HerkunftsChip.jsx", error: String((e && e.message) || e) }); }

// components/ai/KiWert.jsx
try { (() => {
/** Stufe 3 der KI-Kennzeichnung: ein Wert, den der Berater befüllt hat —
    violette Strichel-Linie + B-Punkt. Nach Nutzer-Bestätigung entfernen. */
function KiWert({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "fk-ki-wert num",
    "data-ai": "true",
    style: style
  }, /*#__PURE__*/React.createElement("span", {
    className: "fk-ai-dot",
    style: {
      width: 15,
      height: 15,
      fontSize: 9
    },
    "aria-hidden": "true"
  }, "B"), children);
}
Object.assign(__ds_scope, { KiWert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ai/KiWert.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Balken.jsx
try { (() => {
/** Fortschrittsbalken — chunky, Tinte-Kontur, Limetten-Füllung. */
function Balken({
  pct,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "fk-balken",
    role: "progressbar",
    "aria-valuenow": pct,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    style: {
      display: 'block',
      ...style
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: `${pct}%`
    }
  }));
}
Object.assign(__ds_scope, { Balken });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Balken.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Banner.jsx
try { (() => {
/** Semantisches Banner — für Fakten und Warnungen, NIE für KI-Output. */
function Banner({
  art = 'warnung',
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `fk-banner ${art}`,
    role: "alert"
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, art === 'gefahr' ? '⚠' : '◔'), /*#__PURE__*/React.createElement("span", null, children));
}
Object.assign(__ds_scope, { Banner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Banner.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Ring.jsx
try { (() => {
/** Vollständigkeits-Ring — conic-gradient in Limette, Prozent im Kern. */
function Ring({
  pct
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "fk-ring",
    role: "img",
    "aria-label": `Gesamtfortschritt ${pct} Prozent`,
    style: {
      background: `conic-gradient(var(--funke) 0 ${pct}%, var(--linie-weich) ${pct}% 100%)`
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "num"
  }, pct, " %"));
}
Object.assign(__ds_scope, { Ring });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Ring.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Sticker.jsx
try { (() => {
/** Erfolgs-Sticker — leicht gedreht, poppt federnd auf. Für Deltas und Funde. */
function Sticker({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "fk-sticker num",
    role: "status",
    style: style
  }, children);
}
Object.assign(__ds_scope, { Sticker });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Sticker.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
/** Toast — Nacht-Pille mit Limetten-Schatten, poppt federnd auf.
    Mit `aktion` (z. B. „Rückgängig") wird er zur Handlungs-Pille — dann ~5 s zeigen statt ~1,4 s. */
function Toast({
  text,
  aktion,
  onAktion
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "fk-toast",
    role: "status",
    style: aktion ? {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    } : undefined
  }, text, aktion && /*#__PURE__*/React.createElement("button", {
    onClick: onAktion,
    style: {
      color: 'var(--funke)',
      fontWeight: 800,
      textDecoration: 'underline',
      textUnderlineOffset: 3,
      minHeight: 44,
      padding: '0 2px',
      flex: 'none'
    }
  }, aktion));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Feld.jsx
try { (() => {
/** Beschriftetes Formularfeld mit optionalem Fehlertext. */
function Feld({
  label,
  fehler,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "fk-feld"
  }, /*#__PURE__*/React.createElement("label", null, label), children, fehler && /*#__PURE__*/React.createElement("p", {
    className: "fk-fehler-text"
  }, fehler));
}
Object.assign(__ds_scope, { Feld });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Feld.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Texteingabe — 2px Tinte-Kontur, Fokus bekommt harten Schatten. */
function Input({
  type = 'text',
  value,
  onChange,
  placeholder,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("input", _extends({
    className: "fk-input",
    type: type,
    value: value,
    onChange: onChange ? e => onChange(e.target.value) : undefined,
    placeholder: placeholder,
    style: style
  }, rest));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Option.jsx
try { (() => {
/** Interview-Antwortoption — gewählt = Limette. */
function Option({
  gewaehlt = false,
  onClick,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: "fk-opt",
    "aria-pressed": gewaehlt,
    onClick: onClick,
    style: style
  }, children);
}
Object.assign(__ds_scope, { Option });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Option.jsx", error: String((e && e.message) || e) }); }

// components/forms/SchalterZeile.jsx
try { (() => {
/** Einstellungszeile mit Titel, Detail und Schalter. */
function SchalterZeile({
  titel,
  detail,
  an,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "fk-schalter-zeile"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "tt"
  }, titel), detail && /*#__PURE__*/React.createElement("div", {
    className: "td"
  }, detail)), /*#__PURE__*/React.createElement("button", {
    className: "fk-schalter",
    role: "switch",
    "aria-checked": an,
    "aria-label": titel,
    onClick: () => onChange(!an)
  }, /*#__PURE__*/React.createElement("i", null)));
}
Object.assign(__ds_scope, { SchalterZeile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SchalterZeile.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TabBar.jsx
try { (() => {
/* Vier der fünf Icon-Pfade stammen 1:1 aus frontend/src/App.tsx des Quell-Repos —
   Funke zeichnet sie kräftiger (2.2 statt 1.8); „jahr" (Kalender) ist eine Funke-Ergänzung. */
const ICONS = {
  cockpit: 'M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-16v5h6V4h-6z',
  belege: 'M7 3h7l5 5v13H7V3zm7 0v5h5M9 12h8M9 16h8',
  berater: 'M4 5h16v11H8l-4 4V5z',
  jahr: 'M4 5h16v15H4V5zm0 5h16M8 3v4m8-4v4',
  uebertragen: 'M12 4v12m0-12l-5 5m5-5l5 5M4 20h16',
  profil: 'M12 11a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0'
};

/** Schwebende Pillen-Tab-Bar. tabs: [{id, label, icon?}] — icon ist ein Pfad-String oder einer der Schlüssel oben.
    Die Limetten-Pille gleitet mit --feder hinter den aktiven Tab (Rail: vertikal — gleicher Code). */
function TabBar({
  tabs,
  aktiv,
  onWechsel
}) {
  const innerRef = React.useRef(null);
  const [pille, setPille] = React.useState(null);
  const messen = React.useCallback(() => {
    const inner = innerRef.current;
    const btn = inner && inner.querySelector('[data-tab-aktiv="true"]');
    if (!btn) {
      setPille(null);
      return;
    }
    setPille({
      x: btn.offsetLeft,
      y: btn.offsetTop,
      w: btn.offsetWidth,
      h: btn.offsetHeight
    });
  }, []);
  React.useLayoutEffect(messen, [aktiv, tabs.length, messen]);
  React.useEffect(() => {
    window.addEventListener('resize', messen);
    return () => window.removeEventListener('resize', messen);
  }, [messen]);
  return /*#__PURE__*/React.createElement("nav", {
    className: "fk-tabbar",
    "aria-label": "Hauptnavigation"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fk-tabbar-inner",
    ref: innerRef
  }, pille && /*#__PURE__*/React.createElement("span", {
    className: "fk-tab-pille",
    "aria-hidden": "true",
    style: {
      transform: `translate(${pille.x}px, ${pille.y}px)`,
      width: pille.w,
      height: pille.h
    }
  }), tabs.map(t => {
    const pfad = t.icon || ICONS[t.id];
    const an = aktiv === t.id;
    return /*#__PURE__*/React.createElement("button", {
      key: t.id,
      className: "fk-tab",
      "aria-current": an ? 'page' : undefined,
      "data-tab-aktiv": an ? 'true' : undefined,
      onClick: () => onWechsel(t.id)
    }, pfad && /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2.2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true"
    }, /*#__PURE__*/React.createElement("path", {
      d: pfad
    })), t.label);
  })));
}
Object.assign(__ds_scope, { TabBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TabBar.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Sheet.jsx
try { (() => {
/** Bottom-Sheet / Modal — schließt per Backdrop-Klick und Escape. */
function Sheet({
  titel,
  onClose,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "fk-overlay",
    onClick: e => e.target === e.currentTarget && onClose(),
    onKeyDown: e => e.key === 'Escape' && onClose(),
    role: "presentation"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fk-sheet",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": titel
  }, /*#__PURE__*/React.createElement("div", {
    className: "fk-sheet-grip",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", {
    className: "fk-sheet-kopf"
  }, /*#__PURE__*/React.createElement("h2", null, titel), /*#__PURE__*/React.createElement("button", {
    className: "fk-schliessen",
    "aria-label": "Schlie\xDFen",
    onClick: onClose
  }, "\u2715")), children));
}
Object.assign(__ds_scope, { Sheet });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Sheet.jsx", error: String((e && e.message) || e) }); }

// components/wissen/Begriff.jsx
try { (() => {
/** „Die Eule erklärt's" — nachschlagbarer Begriff im Fließtext.
    Gepunktete Unterstreichung (bewusst anders als die gestrichelte KI-Linie!),
    Tipp öffnet ein Sheet: 3 warme Sätze, ein Beispiel mit Zahl, optional
    „Frag die Eule" in den Berater. Redaktionelle Fakten → NIE Violett.
    Unsichtbar, wenn man's nicht braucht: kein Auto-Popup, keine Tour.
    Self-contained: nutzt die fk-overlay/fk-sheet-Klassen direkt (kein Cross-Import). */
function Begriff({
  titel,
  erklaerung,
  beispiel,
  frage,
  onFrage,
  children
}) {
  const [offen, setOffen] = React.useState(false);
  const t = titel || children;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "fk-begriff",
    onClick: () => setOffen(true),
    "aria-haspopup": "dialog"
  }, children), offen && ReactDOM.createPortal(/*#__PURE__*/React.createElement("div", {
    className: "fk-overlay",
    onClick: e => e.target === e.currentTarget && setOffen(false),
    onKeyDown: e => e.key === 'Escape' && setOffen(false),
    role: "presentation"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fk-sheet",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": typeof t === 'string' ? t : 'Erklärung'
  }, /*#__PURE__*/React.createElement("div", {
    className: "fk-sheet-grip",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", {
    className: "fk-sheet-kopf"
  }, /*#__PURE__*/React.createElement("h2", null, t), /*#__PURE__*/React.createElement("button", {
    className: "fk-schliessen",
    "aria-label": "Schlie\xDFen",
    onClick: () => setOffen(false)
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "fk-begriff-kopf",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 96 96",
    width: "34",
    height: "34"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 36 L30 10 L41 24 Z",
    fill: "var(--tinte)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M76 36 L66 10 L55 24 Z",
    fill: "var(--tinte)"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "20",
    width: "68",
    height: "64",
    rx: "30",
    fill: "var(--tinte)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M48 58 L55 65 L48 74 L41 65 Z",
    fill: "var(--funke)"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "42",
    y: "44",
    width: "12",
    height: "6",
    rx: "3",
    fill: "var(--grund)"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "33",
    cy: "47",
    r: "14",
    fill: "var(--grund)",
    stroke: "var(--funke)",
    strokeWidth: "3.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "63",
    cy: "47",
    r: "14",
    fill: "var(--grund)",
    stroke: "var(--funke)",
    strokeWidth: "3.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "36",
    cy: "45",
    r: "5.5",
    fill: "var(--tinte)"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "66",
    cy: "45",
    r: "5.5",
    fill: "var(--tinte)"
  })), /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, "Die Eule erkl\xE4rt's")), /*#__PURE__*/React.createElement("p", {
    className: "fk-begriff-text"
  }, erklaerung), beispiel && /*#__PURE__*/React.createElement("div", {
    className: "fk-begriff-beispiel"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, "Beispiel"), /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, beispiel)), frage && /*#__PURE__*/React.createElement("button", {
    className: "fk-begriff-frage",
    onClick: () => {
      setOffen(false);
      if (onFrage) onFrage(frage);
    }
  }, "Noch Fragen? Frag die Eule: \u201E", frage, "\" \u2192"))), document.body));
}
Object.assign(__ds_scope, { Begriff });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/wissen/Begriff.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Abgabe.jsx
try { (() => {
/* Abgabe-Abschluss — der emotionale Höhepunkt: alles übertragen, abgeschickt.
   Ein „Zack."-Moment pro Journey: dieser. Danach ehrliche Timeline. */
const {
  Button,
  Pill,
  Sticker,
  HerkunftsChip
} = window.FinanzoFunkeDesignSystem_7e417e;
const SCHRITTE = [{
  wann: 'Heute',
  was: 'In Mein ELSTER abgeschickt — Werte aus SteuerEule, Zeile für Zeile bestätigt.',
  status: 'ok'
}, {
  wann: '4–8 Wochen',
  was: 'Das Finanzamt prüft. Üblich sind 4–8 Wochen — wir können es nicht beschleunigen, ehrlich.',
  status: 'laeuft'
}, {
  wann: 'Danach',
  was: 'Dein Bescheid kommt. Wir vergleichen ihn kostenlos Zeile für Zeile mit deiner Erklärung — bei Abweichung: Einspruchs-Entwurf.',
  status: 'offen'
}];
function FunkeAbgabe({
  onZurueck
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-bau"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '40px 0 8px'
    }
  }, /*#__PURE__*/React.createElement(Sticker, {
    style: {
      fontSize: 16
    }
  }, "2026 erledigt"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 52,
      lineHeight: 1,
      margin: '16px 0 8px'
    }
  }, "Zack.", /*#__PURE__*/React.createElement("br", null), "Dr\xFCben."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 4px',
      color: 'var(--tinte-2)',
      fontSize: 15
    }
  }, "Alle 9 Zeilen \xFCbertragen und in Mein ELSTER abgeschickt.")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte nacht",
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--funke-hell)'
    }
  }, "Eingereicht mit voraussichtlich"), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 48,
      color: 'var(--funke)',
      lineHeight: 1.05,
      margin: '6px 0'
    }
  }, "\u2248 1.517 \u20AC"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: {
      regel: 'SCHÄTZ-01 · Stand Abgabe',
      rechenweg: 'Alle Angaben vollständig — Schätzung auf Basis deiner bestätigten Werte'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      padding: 0,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mono-label",
    style: {
      padding: '12px 16px 4px'
    }
  }, "Wie es weitergeht"), SCHRITTE.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.wann,
    style: {
      display: 'flex',
      gap: 12,
      padding: '12px 16px',
      borderTop: '1.5px solid var(--linie-weich)',
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-mono)',
      fontSize: 11,
      color: s.status === 'ok' ? 'var(--ok)' : 'var(--tinte-2)',
      width: 84,
      flex: 'none',
      fontWeight: s.status === 'ok' ? 700 : 400
    }
  }, s.status === 'ok' ? '✓ ' : '', s.wann), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, s.was)))), /*#__PURE__*/React.createElement(Button, {
    onClick: onZurueck
  }, "Bescheid-W\xE4chter ist aktiv \u2014 zur \xDCbersicht"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      textAlign: 'center'
    }
  }, "Wir melden uns, wenn der Bescheid da ist \u2014 bis dahin ist hier Ruhe. Verdient."));
}
Object.assign(window, {
  FunkeAbgabe
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Abgabe.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Auth.jsx
try { (() => {
/* Login (aus Auth.tsx-Umfang des Quell-Repos, Funke-Kleid) — Google/Apple,
   E-Mail+Passwort, Gast-Modus (#61). Alles Demo: erfolgreicher Login → onFertig. */
const {
  Button,
  Input,
  Feld,
  Chip
} = window.FinanzoFunkeDesignSystem_7e417e;

/* Offizielle Button-Marken der Anbieter (Standard-Pfade der Sign-in-Kits) */
function GoogleG() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 18 18",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    fill: "#4285F4",
    d: "M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "#34A853",
    d: "M9 18a8.6 8.6 0 0 0 5.96-2.18l-2.92-2.26A5.42 5.42 0 0 1 9 14.42a5.4 5.4 0 0 1-5.06-3.7H.93v2.33A9 9 0 0 0 9 18z"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "#FBBC05",
    d: "M3.94 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.93a9 9 0 0 0 0 8.1l3.01-2.33z"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "#EA4335",
    d: "M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.63 8.63 0 0 0 9 0 9 9 0 0 0 .93 4.95l3.01 2.33A5.4 5.4 0 0 1 9 3.58z"
  }));
}
function AppleMark() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 814 1000",
    "aria-hidden": "true",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 71-69 141-43 61-88 122-156 122s-86-40-165-40c-77 0-104 41-167 41s-107-57-157-127C42 787 0 664 0 547c0-187 122-286 242-286 64 0 117 42 157 42 38 0 97-45 170-45 27 0 127 3 219 83zM554 172c32-38 55-90 55-143 0-7-1-15-2-21-52 2-115 35-153 79-29 33-57 86-57 139 0 8 2 16 2 19 3 0 9 1 14 1 47 0 106-31 141-74z"
  }));
}
function FunkeAuth({
  onFertig,
  onGast
}) {
  const [mail, setMail] = React.useState('');
  const [pass, setPass] = React.useState('');
  const [fehler, setFehler] = React.useState('');
  const ok = mail.includes('@') && pass.length >= 6;
  function einloggen() {
    if (!ok) {
      setFehler(mail.includes('@') ? 'Mindestens 6 Zeichen fürs Passwort.' : 'Das sieht noch nicht nach einer E-Mail aus.');
      return;
    }
    setFehler('');
    onFertig();
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      minHeight: '96vh',
      padding: '20px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fx-rein",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/marke-tinte.svg?v=2",
    width: "40",
    height: "40",
    alt: "SteuerEule"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 28,
      letterSpacing: '-0.03em'
    }
  }, "Steuer", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--funke-tinte)'
    }
  }, "Eule"))), /*#__PURE__*/React.createElement("h1", {
    className: "fx-rein",
    style: {
      fontSize: 40,
      fontWeight: 800,
      marginBottom: 8
    }
  }, "Sch\xF6n, dass du ", /*#__PURE__*/React.createElement("em", {
    className: "fx-mark"
  }, "da"), " bist."), /*#__PURE__*/React.createElement("p", {
    className: "fx-rein",
    style: {
      margin: '0 0 24px',
      color: 'var(--tinte-2)'
    }
  }, "Dein Steuerjahr wartet \u2014 weiter, wo du aufgeh\xF6rt hast."), /*#__PURE__*/React.createElement("div", {
    className: "fx-rein",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    onClick: onFertig,
    "aria-label": "Weiter mit Google"
  }, /*#__PURE__*/React.createElement(GoogleG, null), " Weiter mit Google"), /*#__PURE__*/React.createElement(Button, {
    variante: "nacht",
    onClick: onFertig,
    "aria-label": "Weiter mit Apple"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#fff',
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement(AppleMark, null)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#fff'
    }
  }, "Weiter mit Apple"))), /*#__PURE__*/React.createElement("div", {
    className: "fx-rein",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      margin: '20px 0'
    },
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      flex: 1,
      height: 2,
      background: 'var(--linie-weich)',
      borderRadius: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, "oder mit E-Mail"), /*#__PURE__*/React.createElement("i", {
    style: {
      flex: 1,
      height: 2,
      background: 'var(--linie-weich)',
      borderRadius: 1
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "fx-rein"
  }, /*#__PURE__*/React.createElement(Feld, {
    label: "E-Mail"
  }, /*#__PURE__*/React.createElement(Input, {
    type: "email",
    value: mail,
    onChange: setMail,
    placeholder: "du@beispiel.de"
  })), /*#__PURE__*/React.createElement(Feld, {
    label: "Passwort",
    fehler: fehler
  }, /*#__PURE__*/React.createElement(Input, {
    type: "password",
    value: pass,
    onChange: setPass,
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    onKeyDown: e => e.key === 'Enter' && einloggen()
  })), /*#__PURE__*/React.createElement(Button, {
    onClick: einloggen,
    style: {
      marginTop: 6
    }
  }, "Einloggen"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 2px 0',
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault()
  }, "Passwort vergessen?"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault()
  }, "Neu hier? Konto anlegen"))), /*#__PURE__*/React.createElement("div", {
    className: "fx-rein",
    style: {
      textAlign: 'center',
      marginTop: 22
    }
  }, /*#__PURE__*/React.createElement(Chip, {
    onClick: onGast
  }, "Erstmal als Gast umschauen"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      margin: '10px 0 0'
    }
  }, "Gast-Modus: deine Angaben bleiben nur auf diesem Ger\xE4t.")));
}
Object.assign(window, {
  FunkeAuth
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Auth.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Belege.jsx
try { (() => {
/* Belege (F2/F3) — Scannen, Review-Queue, Vorschlag mit Konfidenz und „weil …".
   Skaliert: Suche + zuklappbare Kategorie-Gruppen, Serien-Bestätigung, Duplikat-Erkennung.
   Prinzip: Erledigtes kollabiert, Offenes bleibt sichtbar. */
const {
  Button,
  Chip,
  AiChip,
  HerkunftsChip,
  Input,
  Toast
} = window.FinanzoFunkeDesignSystem_7e417e;
const FUNKE_BELEGE = [{
  id: 1,
  name: 'Lohnsteuerbescheinigung 2026',
  status: 'bestaetigt',
  ziel: 'Anlage N · Zeile 31',
  kat: 'Arbeit & Job'
}, {
  id: 2,
  name: 'Rechnung Fortbildung „TypeScript"',
  status: 'pruefen',
  ziel: 'Anlage N · Zeile 44',
  kat: 'Arbeit & Job',
  konf: 92,
  weil: 'weil die Rechnung eine berufliche Fortbildung ausweist',
  kv: [['Betrag', '890,00 €'], ['Datum', '14.03.2026'], ['Aussteller', 'Workshop GmbH']]
}, {
  id: 3,
  name: 'BahnCard 50',
  status: 'pruefen',
  ziel: 'Anlage N · Zeile 45',
  kat: 'Arbeit & Job',
  konf: 87,
  weil: 'weil sie überwiegend für den Arbeitsweg genutzt wird',
  kv: [['Betrag', '244,00 €'], ['Gültig', '2026']]
}, {
  id: 4,
  name: 'Spendenquittung DRK',
  status: 'bestaetigt',
  ziel: 'Sonderausgaben · Zeile 5',
  kat: 'Spenden & Versicherungen'
}, {
  id: 5,
  name: 'Handwerkerrechnung „Bad-Reparatur"',
  status: 'inbox',
  kat: 'Zuhause',
  hinweis: '§ 35a: bis 20 % der Lohnkosten direkt von der Steuer — wir ordnen sie zu, sobald das Jahr offen ist.'
}, {
  id: 6,
  name: 'Nebenkostenabrechnung 2026',
  status: 'inbox',
  kat: 'Zuhause',
  hinweis: 'Haushaltsnahe Dienstleistungen stecken oft drin — geparkt fürs Steuerjahr.'
}, {
  id: 7,
  name: 'Nebenkostenabrechnung 2026 (2).pdf',
  status: 'inbox',
  kat: 'Zuhause',
  duplikat: 'Bis aufs Dateidatum identisch mit deinem Upload vom 03.05. — vermutlich doppelt.'
}, {
  id: 8,
  name: 'Arbeitsmittel „Monitor"',
  status: 'konflikt',
  ziel: 'Anlage N · Zeile 42',
  kat: 'Arbeit & Job',
  belegWert: '480,00 €',
  eingabeWert: '500,00 €'
}];
function FunkeBelege({
  onBerater
}) {
  const [filter, setFilter] = React.useState('pruefen');
  const [suche, setSuche] = React.useState('');
  const [belege, setBelege] = React.useState(FUNKE_BELEGE);
  const [serie, setSerie] = React.useState('pruefen'); /* 12 gleichartige Tickets als EIN Vorschlag */
  const [manuell, setManuell] = React.useState({}); /* Gruppe → true = offen erzwungen, false = zu */
  const [toast, setToast] = React.useState('');
  const [gelöscht, setGeloescht] = React.useState(null); /* zuletzt gelöschtes Duplikat für Rückgängig */
  const gefiltert = belege.filter(b => filter === 'alle' || b.status === filter).filter(b => !suche || b.name.toLowerCase().includes(suche.toLowerCase()));
  const gruppen = [...new Set(gefiltert.map(b => b.kat))];
  /* Erledigtes kollabiert: Gruppe standardmäßig zu, wenn alles darin bestätigt ist */
  function istZu(g) {
    if (manuell[g] !== undefined) return !manuell[g];
    const items = gefiltert.filter(b => b.kat === g);
    return filter === 'alle' && items.every(b => b.status === 'bestaetigt');
  }
  function serieUebernehmen() {
    setSerie('bestaetigt');
    setBelege(bs => [...bs, {
      id: 99,
      name: 'Deutschlandticket · Serie (12 Belege)',
      status: 'bestaetigt',
      ziel: 'Anlage N · Zeile 45',
      kat: 'Arbeit & Job'
    }]);
    setToast('12 Belege als Serie bestätigt');
    setTimeout(() => setToast(''), 1600);
  }
  function bestaetigen(id) {
    setBelege(belege.map(b => b.id === id ? {
      ...b,
      status: 'bestaetigt'
    } : b));
  }
  /* ADR-008: Konflikt auflösen = eine Quelle wählen; die verworfene bleibt im Verlauf */
  function loeseKonflikt(id, wert, quelle) {
    setBelege(bs => bs.map(b => b.id === id ? {
      ...b,
      status: 'bestaetigt',
      kv: [['Betrag', wert], ['Entschieden', quelle]]
    } : b));
    setToast(`Konflikt gelöst — es zählt: ${quelle} (${wert})`);
    setTimeout(() => setToast(''), 1800);
    if (filter === 'konflikt') setFilter('bestaetigt');
  }
  /* ADR-007: Posteingang-Beleg dem vorgeschlagenen Jahr zuordnen */
  function zuordnen(id) {
    setBelege(bs => bs.map(b => b.id === id ? {
      ...b,
      status: 'bestaetigt',
      ziel: b.ziel || '§ 35a · haushaltsnah',
      hinweis: null
    } : b));
    setToast('Im Steuerjahr 2026 — Zuordnung: Zahlungsdatum');
    setTimeout(() => setToast(''), 1800);
  }
  const konflikte = belege.filter(b => b.status === 'konflikt').length;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "appbar"
  }, /*#__PURE__*/React.createElement("h1", null, "Belege"), /*#__PURE__*/React.createElement(Chip, {
    variante: "src"
  }, belege.filter(b => b.status === 'pruefen').length, " zu pr\xFCfen")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte nacht",
    style: {
      position: 'relative',
      overflow: 'hidden',
      minHeight: 150,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      alignItems: 'flex-start',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      top: 14,
      right: 20,
      bottom: 58,
      width: 120,
      background: '#f4efe2',
      borderRadius: 6,
      transform: 'rotate(3deg)',
      opacity: 0.9,
      padding: 10
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      display: 'block',
      height: 5,
      background: '#c9c2ae',
      margin: '0 0 8px',
      borderRadius: 2
    }
  }), /*#__PURE__*/React.createElement("i", {
    style: {
      display: 'block',
      height: 5,
      background: '#c9c2ae',
      margin: '0 0 8px',
      borderRadius: 2,
      width: '60%'
    }
  }), /*#__PURE__*/React.createElement("i", {
    style: {
      display: 'block',
      height: 5,
      background: '#c9c2ae',
      borderRadius: 2,
      width: '45%'
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--funke-hell)',
      position: 'relative',
      maxWidth: 200
    }
  }, "Wirf alles rein \u2014 wir sortieren"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      position: 'relative',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variante: "nacht",
    style: {
      width: 'auto',
      borderColor: 'var(--funke)'
    },
    onClick: () => {
      window.location.href = 'scan.html';
    }
  }, "Beleg scannen"), /*#__PURE__*/React.createElement(Button, {
    variante: "nacht",
    style: {
      width: 'auto'
    },
    onClick: () => {
      window.location.href = 'scan.html';
    }
  }, "PDF hochladen"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      margin: '4px 0 12px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Chip, {
    aktiv: filter === 'pruefen',
    onClick: () => setFilter('pruefen')
  }, "Zu pr\xFCfen"), konflikte > 0 && /*#__PURE__*/React.createElement(Chip, {
    aktiv: filter === 'konflikt',
    onClick: () => setFilter('konflikt'),
    style: {
      borderColor: 'var(--warn)',
      color: filter === 'konflikt' ? undefined : 'var(--warn)'
    }
  }, "Konflikt (", konflikte, ")"), /*#__PURE__*/React.createElement(Chip, {
    aktiv: filter === 'bestaetigt',
    onClick: () => setFilter('bestaetigt')
  }, "Best\xE4tigt"), /*#__PURE__*/React.createElement(Chip, {
    aktiv: filter === 'inbox',
    onClick: () => setFilter('inbox')
  }, "Inbox"), /*#__PURE__*/React.createElement(Chip, {
    aktiv: filter === 'alle',
    onClick: () => setFilter('alle')
  }, "Alle")), /*#__PURE__*/React.createElement(Input, {
    value: suche,
    onChange: v => setSuche(v),
    placeholder: "Beleg suchen \u2014 Name gen\xFCgt",
    style: {
      marginBottom: 14
    }
  }), filter === 'inbox' && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--tinte-2)',
      margin: '0 0 14px'
    }
  }, "Wirf Belege \xFCbers ganze Jahr rein \u2014 sie warten hier und landen automatisch im richtigen Steuerjahr. Nichts geht verloren, nichts musst du dir merken."), (filter === 'pruefen' || filter === 'alle') && !suche && serie === 'pruefen' && /*#__PURE__*/React.createElement("div", {
    className: "fk-ai-karte",
    "data-ai": "true",
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(AiChip, null, "Serie erkannt \xB7 12 Belege"), /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 14,
      color: 'var(--ki-tinte)'
    }
  }, "Anlage N \xB7 Zeile 45")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 10px',
      fontSize: 13,
      color: 'var(--ki-tinte)'
    }
  }, "12\xD7 Deutschlandticket, Januar\u2013Dezember \u2014 gleicher Aussteller, gleicher Betrag (49,00 \u20AC). Statt 12 Karten: einmal entscheiden."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variante: "leise",
    style: {
      minHeight: 42
    },
    onClick: serieUebernehmen
  }, "Alle 12 \xFCbernehmen"), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      minHeight: 42
    },
    onClick: () => {
      setToast('Demo — Einzelansicht der Serie');
      setTimeout(() => setToast(''), 1400);
    }
  }, "Einzeln ansehen"))), gefiltert.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      textAlign: 'center',
      color: 'var(--tinte-2)',
      fontSize: 14
    }
  }, "Kein Beleg passt", suche ? ` zu „${suche}"` : '', " \u2014 anders suchen oder Filter wechseln."), gruppen.map(g => /*#__PURE__*/React.createElement("div", {
    key: g
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setManuell(m => ({
      ...m,
      [g]: istZu(g)
    })),
    "aria-expanded": !istZu(g),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      textAlign: 'left',
      margin: '2px 0 10px',
      minHeight: 36
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, g, " \xB7 ", gefiltert.filter(b => b.kat === g).length), istZu(g) && gefiltert.filter(b => b.kat === g).every(b => b.status === 'bestaetigt') && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ok)',
      fontWeight: 700,
      fontSize: 12
    }
  }, "alle best\xE4tigt \u2713"), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      marginLeft: 'auto',
      color: 'var(--tinte-2)',
      fontSize: 12
    }
  }, istZu(g) ? '▸' : '▾')), !istZu(g) && /*#__PURE__*/React.createElement("div", {
    className: "bel-grid"
  }, gefiltert.filter(b => b.kat === g).map(b => /*#__PURE__*/React.createElement("div", {
    key: b.id,
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 8,
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 15
    }
  }, b.name), b.status === 'bestaetigt' && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ok)',
      fontWeight: 700,
      fontSize: 13,
      flex: 'none'
    }
  }, "\u2713 best\xE4tigt"), b.status === 'konflikt' && /*#__PURE__*/React.createElement(Chip, {
    variante: "src",
    style: {
      minHeight: 28,
      fontSize: 12,
      flex: 'none',
      borderColor: 'var(--warn)',
      color: 'var(--warn)'
    }
  }, "Konflikt"), b.status === 'inbox' && /*#__PURE__*/React.createElement(Chip, {
    variante: "src",
    style: {
      minHeight: 28,
      fontSize: 12,
      flex: 'none'
    }
  }, "Geparkt")), b.kv && /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '8px 0'
    }
  }, b.kv.map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      borderBottom: '1.5px dashed var(--linie-weich)',
      padding: '5px 0',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--tinte-2)'
    }
  }, k), /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, v)))), b.status === 'konflikt' ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      border: '2px solid var(--warn)',
      borderRadius: 12,
      padding: 12,
      background: 'var(--warn-weich)'
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 13,
      color: 'var(--warn)'
    }
  }, "Zwei Werte f\xFCr einen Posten \u2014 du entscheidest"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 10px',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Der Beleg sagt ", /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, b.belegWert), ", deine Eingabe ", /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, b.eingabeWert), ". Bis das gekl\xE4rt ist, z\xE4hlt der Posten nicht in die Sch\xE4tzung \u2014 und die Abgabe wartet."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variante: "leise",
    style: {
      minHeight: 42,
      width: 'auto'
    },
    onClick: () => loeseKonflikt(b.id, b.belegWert, 'Beleg')
  }, "Belegwert ", b.belegWert), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      minHeight: 42,
      width: 'auto'
    },
    onClick: () => loeseKonflikt(b.id, b.eingabeWert, 'Eingabe')
  }, "Eingabe ", b.eingabeWert))) : b.status === 'pruefen' ? /*#__PURE__*/React.createElement("div", {
    className: "fk-ai-karte",
    "data-ai": "true",
    style: {
      marginBottom: 0,
      marginTop: 10,
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(AiChip, null, "Vorschlag \xB7 ", b.konf, " %"), /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 14,
      color: 'var(--ki-tinte)'
    }
  }, b.ziel)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 10px',
      fontSize: 13,
      color: 'var(--ki-tinte)'
    }
  }, b.weil), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variante: "leise",
    style: {
      minHeight: 42
    },
    onClick: () => bestaetigen(b.id)
  }, "\xDCbernehmen"), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      minHeight: 42
    },
    onClick: onBerater
  }, "\xC4ndern"))) : b.status === 'inbox' && b.duplikat ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 10px',
      fontSize: 13,
      color: 'var(--warn)',
      fontWeight: 700
    }
  }, b.duplikat), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variante: "leise",
    style: {
      minHeight: 42
    },
    onClick: () => {
      setBelege(bs => bs.filter(x => x.id !== b.id));
      setGeloescht(b);
      setToast('Duplikat gelöscht — das Original bleibt');
      setTimeout(() => {
        setToast('');
        setGeloescht(null);
      }, 5000);
    }
  }, "Duplikat l\xF6schen"), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      minHeight: 42
    },
    onClick: () => {
      setBelege(bs => bs.map(x => x.id === b.id ? {
        ...x,
        duplikat: null,
        hinweis: 'Behalten — wir behandeln ihn als eigenen Beleg.'
      } : x));
    }
  }, "Behalten"))) : b.status === 'inbox' ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 10px',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, b.hinweis), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variante: "leise",
    style: {
      minHeight: 38,
      width: 'auto',
      fontSize: 13
    },
    onClick: () => zuordnen(b.id)
  }, "Ins Steuerjahr 2026 \u2192"), /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: {
      regel: 'Vorschlag: Zahlungsdatum 2026'
    }
  }))) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(Chip, {
    variante: "src"
  }, b.ziel), /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: {
      beleg: b.name,
      regel: 'KAT-' + b.id + '0 · Stand 2026'
    }
  }))))))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      textAlign: 'center'
    }
  }, "Vorschl\xE4ge auf Basis deiner Unterlagen \u2014 du entscheidest. Erledigtes klappt zu, Offenes bleibt sichtbar."), toast && (gelöscht ? /*#__PURE__*/React.createElement(Toast, {
    text: toast,
    aktion: "R\xFCckg\xE4ngig",
    onAktion: () => {
      setBelege(bs => [...bs, gelöscht]);
      setGeloescht(null);
      setToast('');
    }
  }) : /*#__PURE__*/React.createElement(Toast, {
    text: toast
  })));
}
Object.assign(window, {
  FunkeBelege
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Belege.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Berater.jsx
try { (() => {
/* Berater (F5) — gegründeter Chat mit Quellen-Chips, Vorschlags-Chips, Quota. */
const {
  Button,
  Chip,
  Pill,
  AiChip,
  Input
} = window.FinanzoFunkeDesignSystem_7e417e;
const FUNKE_VORSCHLAEGE = ['Was fehlt zur Abgabe?', 'Homeoffice erklären', 'Grenzgänger-Status?'];
function FunkeBerater({
  chat,
  onFrage
}) {
  const [text, setText] = React.useState('');
  const [abruf, setAbruf] = React.useState(false);

  /* Eulen-Modus (ADR-037/038): ein Wesen — segmentierte Weiche statt versteckter Chip */
  const eulenZahl = (window.FunkeEulenFunde ? window.FunkeEulenFunde.length : 4) + 1;
  const weiche = /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    "aria-label": "Berater-Modus",
    style: {
      display: 'flex',
      gap: 4,
      border: '1.5px solid var(--linie-weich)',
      borderRadius: 14,
      padding: 4,
      margin: '0 0 14px',
      background: 'var(--flaeche)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    role: "tab",
    "aria-selected": !abruf,
    onClick: () => setAbruf(false),
    style: {
      flex: 1,
      minHeight: 44,
      borderRadius: 10,
      fontWeight: 700,
      fontSize: 14,
      background: !abruf ? 'var(--tinte)' : 'transparent',
      color: !abruf ? 'var(--papier)' : 'var(--tinte-2)'
    }
  }, "Fragen"), /*#__PURE__*/React.createElement("button", {
    role: "tab",
    "aria-selected": abruf,
    onClick: () => {
      if (window.funkeEulenAn && !window.funkeEulenAn()) window.funkeSetEulenAn(true);
      setAbruf(true);
    },
    style: {
      flex: 1,
      minHeight: 44,
      borderRadius: 10,
      fontWeight: 700,
      fontSize: 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      background: abruf ? 'var(--ki)' : 'transparent',
      color: abruf ? '#fff' : 'var(--ki)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 8,
      height: 8,
      borderRadius: 99,
      background: abruf ? '#fff' : 'var(--ki)',
      flex: 'none'
    }
  }), "Eule fragt dich \xB7 ", eulenZahl));
  if (abruf) {
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "appbar"
    }, /*#__PURE__*/React.createElement("h1", null, "Berater"), /*#__PURE__*/React.createElement(Pill, null, "Unbegrenzt \xB7 kostenlos")), weiche, /*#__PURE__*/React.createElement(window.FunkeEulenAbruf, {
      onSchliessen: () => setAbruf(false)
    }));
  }
  function senden(f) {
    const frage = (f || '').trim();
    if (!frage) return;
    onFrage(frage);
    setText('');
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: '70vh'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "appbar"
  }, /*#__PURE__*/React.createElement("h1", null, "Berater"), /*#__PURE__*/React.createElement(Pill, null, "Unbegrenzt \xB7 kostenlos")), weiche, /*#__PURE__*/React.createElement("div", {
    role: "log",
    "aria-live": "polite",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      flex: 1
    }
  }, chat.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "fx-bubble",
    "data-ai": m.rolle === 'assistant' ? 'true' : undefined,
    style: m.rolle === 'user' ? {
      alignSelf: 'flex-end',
      maxWidth: 'min(85%, 480px)',
      background: 'var(--funke)',
      color: '#191b12',
      border: 'var(--kontur) solid var(--tinte)',
      borderRadius: '18px 18px 4px 18px',
      padding: '10px 16px',
      fontSize: 15,
      boxShadow: 'var(--schatten-hart-s)'
    } : {
      alignSelf: 'flex-start',
      maxWidth: 'min(85%, 480px)',
      background: 'var(--ki-weich)',
      border: 'var(--kontur) solid var(--ki)',
      borderRadius: '18px 18px 18px 4px',
      padding: '10px 16px',
      fontSize: 15,
      boxShadow: 'var(--schatten-ki)',
      color: 'var(--ki-tinte)'
    }
  }, m.rolle === 'assistant' && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
      fontSize: 13,
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fk-ai-dot",
    style: {
      width: 18,
      height: 18,
      fontSize: 11
    },
    "aria-hidden": "true"
  }, "B"), "Berater"), m.text, m.quellen && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 8
    }
  }, m.quellen.map(q => /*#__PURE__*/React.createElement(Chip, {
    key: q,
    variante: "src",
    style: {
      minHeight: 28,
      fontSize: 12
    }
  }, q)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      overflowX: 'auto',
      padding: '14px 0 10px',
      scrollbarWidth: 'none'
    }
  }, FUNKE_VORSCHLAEGE.map(v => /*#__PURE__*/React.createElement(Chip, {
    key: v,
    onClick: () => senden(v),
    style: {
      flex: 'none'
    }
  }, v))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Frag zu deinem Steuerjahr \u2026",
    value: text,
    onChange: setText,
    onKeyDown: e => e.key === 'Enter' && senden(text),
    "aria-label": "Frage an den Berater"
  }), /*#__PURE__*/React.createElement(Button, {
    style: {
      width: 'auto',
      flex: 'none',
      padding: '0 22px'
    },
    onClick: () => senden(text),
    "aria-label": "Senden"
  }, "\u2192")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      textAlign: 'center',
      margin: '10px 0 0'
    }
  }, "Vorschl\xE4ge auf Basis deiner Unterlagen \u2014 kein Ersatz f\xFCr Rechts- oder Steuerberatung."));
}
Object.assign(window, {
  FunkeBerater
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Berater.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Bescheid.jsx
try { (() => {
/* Bescheid-Vergleich — der Retention-Moment: Bescheid kam, Zeile für Zeile gegen
   unsere Berechnung. Abweichungen erklärt; Einspruch (1 Monat Frist!) als klarer Weg. */
const {
  Button,
  Chip,
  Pill,
  Banner,
  AiChip,
  HerkunftsChip,
  Sticker,
  Sheet,
  Begriff
} = window.FinanzoFunkeDesignSystem_7e417e;
const ZEILEN = [{
  was: 'Bruttoarbeitslohn',
  wir: '54.320,00 €',
  amt: '54.320,00 €',
  gleich: true
}, {
  was: 'Werbungskosten',
  wir: '3.184,00 €',
  amt: '3.184,00 €',
  gleich: true
}, {
  was: 'Fortbildungskosten',
  wir: '890,00 €',
  amt: '847,00 €',
  gleich: false,
  grund: 'Das Amt hat 43 € Verpflegungspauschale gestrichen — vermutlich fehlte die Abwesenheitsdauer.'
}, {
  was: 'Sonderausgaben',
  wir: '2.150,00 €',
  amt: '2.150,00 €',
  gleich: true
}];
function FunkeBescheid({
  onBerater,
  onZurueck
}) {
  const [detail, setDetail] = React.useState(null);
  const [einspruchOffen, setEinspruchOffen] = React.useState(false);
  const abweichungen = ZEILEN.filter(z => !z.gleich);
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-bau"
  }, /*#__PURE__*/React.createElement("div", {
    className: "appbar"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, onZurueck ? /*#__PURE__*/React.createElement("button", {
    onClick: onZurueck,
    "aria-label": "Zur\xFCck",
    style: {
      width: 44,
      height: 44,
      border: '1.5px solid var(--linie-weich)',
      borderRadius: 999,
      background: 'var(--karte)',
      fontWeight: 800
    }
  }, "\u2190") : /*#__PURE__*/React.createElement("a", {
    href: "index.html",
    "aria-label": "Zur\xFCck zur App",
    style: {
      width: 44,
      height: 44,
      border: '1.5px solid var(--linie-weich)',
      borderRadius: 999,
      background: 'var(--karte)',
      fontWeight: 800,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textDecoration: 'none',
      color: 'inherit'
    }
  }, "\u2190"), /*#__PURE__*/React.createElement("h1", null, "Dein Bescheid")), /*#__PURE__*/React.createElement(Pill, null, window.FunkeDemo.bescheid.jahr)), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte nacht"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--funke-hell)'
    }
  }, "Erstattung laut Bescheid"), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 48,
      color: 'var(--funke)',
      lineHeight: 1.05
    }
  }, window.FunkeDemo.formatEuroCent(window.FunkeDemo.bescheid.betrag)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      margin: '8px 0 0',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      opacity: 0.8
    }
  }, "Wir hatten berechnet: ", /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, window.FunkeDemo.formatEuroCent(window.FunkeDemo.bescheid.berechnet))), /*#__PURE__*/React.createElement("span", {
    className: "fk-sticker num",
    style: {
      background: 'var(--warn-weich)',
      color: 'var(--warn)',
      borderColor: 'var(--warn)',
      boxShadow: '2px 2px 0 var(--warn)',
      fontSize: 13
    }
  }, window.FunkeDemo.bescheid.delta, " \u20AC"))), /*#__PURE__*/React.createElement(Banner, {
    art: "warnung"
  }, "1 Abweichung gefunden. ", /*#__PURE__*/React.createElement(Begriff, {
    titel: "Einspruchsfrist",
    erklaerung: "Ein Monat ab dem Tag, an dem der Bescheid als bekannt gegeben gilt \u2014 danach ist er bestandskr\xE4ftig und l\xE4sst sich kaum noch \xE4ndern. Ein Einspruch kostet nichts und muss nicht perfekt begr\xFCndet sein: fristgerecht einlegen gen\xFCgt, nachbessern geht sp\xE4ter.",
    beispiel: "Bescheid vom 15.07. \u2192 Einspruch bis 18.08."
  }, "Einspruchsfrist"), ": ", /*#__PURE__*/React.createElement("b", null, "bis ", window.FunkeDemo.bescheid.frist), " \u2014 ein Monat ab Bekanntgabe."), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      padding: 0,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mono-label",
    style: {
      padding: '12px 16px 4px'
    }
  }, "Zeile f\xFCr Zeile"), ZEILEN.map(z => /*#__PURE__*/React.createElement("button", {
    key: z.was,
    onClick: () => !z.gleich && setDetail(z),
    "aria-expanded": detail === z,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      textAlign: 'left',
      padding: '12px 16px',
      borderTop: '1.5px solid var(--linie-weich)',
      minHeight: 52,
      cursor: z.gleich ? 'default' : 'pointer',
      background: z.gleich ? 'transparent' : 'var(--warn-weich)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14,
      minWidth: 0
    }
  }, z.was), /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontSize: 13,
      color: 'var(--tinte-2)',
      whiteSpace: 'nowrap'
    }
  }, z.wir), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: 'var(--tinte-2)'
    }
  }, "\u2192"), /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      fontSize: 13,
      whiteSpace: 'nowrap',
      color: z.gleich ? 'var(--ok)' : 'var(--warn)'
    }
  }, z.amt), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      fontWeight: 800,
      width: 18,
      textAlign: 'center',
      color: z.gleich ? 'var(--ok)' : 'var(--warn)'
    }
  }, z.gleich ? '✓' : '!')))), detail && /*#__PURE__*/React.createElement("div", {
    className: "fk-ai-karte",
    "data-ai": "true"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(AiChip, null, "Einsch\xE4tzung"), /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 14,
      color: 'var(--ki-tinte)'
    }
  }, detail.was)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 10px',
      fontSize: 13,
      color: 'var(--ki-tinte)'
    }
  }, detail.grund), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variante: "leise",
    style: {
      minHeight: 42,
      width: 'auto'
    },
    onClick: () => setEinspruchOffen(true)
  }, "Einspruch vorbereiten"), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      minHeight: 42,
      width: 'auto'
    },
    onClick: onBerater
  }, "Berater fragen"))), /*#__PURE__*/React.createElement(Button, {
    onClick: () => setEinspruchOffen(true)
  }, "Einspruch vorbereiten (+43 \u20AC)"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      textAlign: 'center'
    }
  }, "Einsch\xE4tzungen sind kein Ersatz f\xFCr Rechts- oder Steuerberatung."), einspruchOffen && /*#__PURE__*/React.createElement(Sheet, {
    titel: "Einspruch vorbereiten",
    onClose: () => setEinspruchOffen(false)
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 0,
      fontSize: 14
    }
  }, "Wir erstellen ein fertiges Einspruchsschreiben mit Begr\xFCndung und Nachweis (Abwesenheitszeiten der Fortbildung). Du pr\xFCfst, unterschreibst, sendest \u2014 per Post oder Mein ELSTER."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      borderBottom: '1.5px dashed var(--linie-weich)',
      padding: '6px 0',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--tinte-2)'
    }
  }, "Streitwert"), /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, "43,00 \u20AC")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '6px 0 14px',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--tinte-2)'
    }
  }, "Frist"), /*#__PURE__*/React.createElement("b", null, window.FunkeDemo.bescheid.frist)), /*#__PURE__*/React.createElement(Button, {
    onClick: () => setEinspruchOffen(false)
  }, "Schreiben erstellen (PDF)")));
}
Object.assign(window, {
  FunkeBescheid
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Bescheid.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Cockpit.jsx
try { (() => {
/* Cockpit (F4) — Erstattungs-Held, Vollständigkeit, GG-Widget, Fund-Zähler. */
const {
  Button,
  Chip,
  Pill,
  AiChip,
  BeraterLeiste,
  HerkunftsChip,
  Ring,
  Balken,
  Sticker,
  Sheet,
  Banner
} = window.FinanzoFunkeDesignSystem_7e417e;
function FunkeCockpit({
  hinweise,
  onUmsetzen,
  onVerwerfen,
  geheZu,
  delta
}) {
  const [lueckenOffen, setLueckenOffen] = React.useState(false);
  /* Gewerbe-Wartezustand: kein Angestellten-Mock für Selbstständige */
  const [gewerbeWarte, setGewerbeWarte] = React.useState(() => {
    try {
      return localStorage.getItem('funke.gewerbeWarte') === '1';
    } catch (e) {
      return false;
    }
  });
  /* Aufbau: Erstattung zählt hoch, Ring sweept, Balken wachsen — reduced-motion überspringt */
  const ruhig = React.useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [anim, setAnim] = React.useState(ruhig ? 1 : 0);
  React.useEffect(() => {
    if (ruhig) return;
    const start = performance.now();
    const dauer = 950;
    let raf;
    const tick = t => {
      const p = Math.min(1, (t - start) / dauer);
      setAnim(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const offen = hinweise.filter(h => h.status === 'offen');
  /* Interview-Antworten steuern den Grenzgänger-Branch */
  const gg = React.useMemo(() => {
    try {
      const a = JSON.parse(localStorage.getItem('funke.interview')) || {};
      return a.schweiz !== 'Nein';
    } catch (e) {
      return true;
    }
  }, []);
  const partner = React.useMemo(() => {
    try {
      const a = JSON.parse(localStorage.getItem('funke.interview')) || {};
      return a.partner === 'Ja';
    } catch (e) {
      return false;
    }
  }, []);
  const fund = hinweise.filter(h => h.status === 'umgesetzt').reduce((s, h) => s + h.betrag, 122);
  /* M5: Zusatz-Einkünfte aus dem Interview */
  const extra = React.useMemo(() => {
    try {
      const a = JSON.parse(localStorage.getItem('funke.interview')) || {};
      return {
        kap: a.einkuenfte === 'Kapitalerträge' || a.einkuenfte === 'Beides',
        kapAusland: a.kap === 'ausland',
        verm: a.vermietung === 'einfach' || a.vermietung === 'mehrere',
        vermMehrere: a.vermietung === 'mehrere',
        kinder: a.kinder && a.kinder !== 'Nein',
        rente: a.job === 'Rente'
      };
    } catch (e) {
      return {
        kap: false,
        kapAusland: false,
        verm: false,
        vermMehrere: false,
        kinder: false,
        rente: false
      };
    }
  }, []);
  /* M6: Frist-Warnmodus ab 60 Tagen */
  const tageFrist = Math.max(0, Math.ceil((new Date('2027-07-31') - Date.now()) / 86400000));
  /* Fix 2: Vorbereitungs-Modus (Gewerbe fehlt — Erklärung ist unteilbar) */
  const gewVor = React.useMemo(() => {
    try {
      return localStorage.getItem('funke.gewerbeVorbereiten') === '1';
    } catch (e) {
      return false;
    }
  }, []);
  /* Fix 5: Schätzung + Anlage-N-Fortschritt fallen aus dem Interview — kein 1.200-€-Minimum */
  const basis = React.useMemo(() => {
    try {
      const s = parseInt(localStorage.getItem('funke.schaetzung'), 10);
      return Number.isFinite(s) ? s : window.FunkeDemo.schaetzung;
    } catch (e) {
      return window.FunkeDemo.schaetzung;
    }
  }, []);
  const nPct = React.useMemo(() => {
    try {
      const a = JSON.parse(localStorage.getItem('funke.interview')) || {};
      const n = ['homeoffice', 'weg', 'arbeitstage', 'fortbildung'].filter(k => a[k] !== undefined).length;
      return n ? 40 + n * 10 : 80;
    } catch (e) {
      return 80;
    }
  }, []);
  if (gewerbeWarte) {
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "appbar"
    }, /*#__PURE__*/React.createElement("h1", null, "Steuerjahr"), /*#__PURE__*/React.createElement(Pill, null, "2026")), /*#__PURE__*/React.createElement("div", {
      className: "fk-karte nacht"
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono-label",
      style: {
        color: 'var(--funke-hell)'
      }
    }, "Du bist vorgemerkt"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--schrift-display)',
        fontWeight: 800,
        fontSize: 32,
        lineHeight: 1.1,
        margin: '8px 0 6px'
      }
    }, "Gewerbe kommt \u2014 wir melden uns."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: 0,
        fontSize: 14,
        opacity: 0.8
      }
    }, "Sobald E\xDCR, Anlage G/S und Umsatzsteuer sitzen, bekommst du eine Nachricht. Bis dahin bleibt dein Cockpit leer \u2014 ehrlich ist ehrlich.")), /*#__PURE__*/React.createElement(Button, {
      variante: "ghost",
      onClick: () => {
        try {
          localStorage.removeItem('funke.gewerbeWarte');
        } catch (e) {}
        setGewerbeWarte(false);
      }
    }, "Doch als Angestellter starten"));
  }
  const erstattung = basis + fund - 122;
  /* ADR-015: Spanne statt Punktwert — verengt sich pro geklärter Angabe; Konflikt hält sie offen */
  const spanneBreite = window.FunkeDemo.offeneAngaben * 40;
  const konfliktOffen = 1; /* Demo: „Monitor" in Belege (Beleg 480 € ≠ Eingabe 500 €) */
  /* Progressionsvorbehalt (ADR-035): Lohnersatz verschiebt die Spanne sichtbar */
  const lohnersatz = React.useMemo(() => {
    try {
      return localStorage.getItem('funke.lohnersatz') === '1';
    } catch (e) {
      return false;
    }
  }, []);
  const branches = [{
    name: 'Anlage N',
    pct: nPct
  }, {
    name: 'Vorsorge',
    pct: 70
  }, {
    name: 'Sonderausg.',
    pct: 60
  }, ...(extra.rente ? [{
    name: 'Anlage R',
    pct: 55
  }] : []), ...(extra.kinder ? [{
    name: 'Anlage Kind',
    pct: 50
  }] : []), ...(extra.kap ? [{
    name: extra.kapAusland ? 'Anlage KAP (Ausland)' : 'Anlage KAP',
    pct: 35
  }] : []), ...(extra.verm ? [{
    name: extra.vermMehrere ? 'Anlage V (2 Objekte)' : 'Anlage V',
    pct: 25
  }] : []), ...(gg ? [{
    name: 'Grenzgänger',
    pct: 45
  }] : [])];
  const luecken = [{
    br: 'Anlage N',
    was: 'Arbeitstage 2026 bestätigen',
    ziel: 'uebertragen'
  }, {
    br: 'Belege',
    was: 'Beleg „Fortbildung" prüfen',
    ziel: 'belege'
  }, {
    br: 'Stammdaten',
    was: 'IBAN für die Erstattung',
    ziel: 'profil'
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "appbar"
  }, /*#__PURE__*/React.createElement("h1", null, "Steuerjahr"), /*#__PURE__*/React.createElement(Pill, null, "2026")), tageFrist > 60 ? /*#__PURE__*/React.createElement("p", {
    className: "mono-label num",
    style: {
      margin: '-10px 0 14px'
    }
  }, "Abgabe bis 31.07.2027 \xB7 noch ", tageFrist, " Tage") : /*#__PURE__*/React.createElement("button", {
    onClick: () => geheZu('uebertragen'),
    className: "fk-karte",
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      textAlign: 'left',
      background: 'var(--warn-weich)',
      borderColor: 'var(--warn)',
      boxShadow: '3px 3px 0 var(--warn)',
      marginTop: '-4px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--warn)'
    }
  }, "Frist: noch ", tageFrist, " Tage"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Danach mindestens 25 \u20AC Versp\xE4tungszuschlag pro Monat (\xA7 152 AO) \u2014 jetzt \xFCbertragen \u2192"))), gewVor && /*#__PURE__*/React.createElement(Banner, {
    art: "warnung"
  }, /*#__PURE__*/React.createElement("b", null, "Vorbereitungs-Modus:"), " Dein Angestellten-Teil wird komplett \u2014 abgegeben wird erst mit deinem Gewerbe. Eine Erkl\xE4rung ist unteilbar."), /*#__PURE__*/React.createElement("div", {
    className: "ck-grid"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "fk-karte nacht"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--funke-hell)'
    }
  }, "Voraussichtliche Erstattung"), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 44,
      color: 'var(--funke)',
      lineHeight: 1.05,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, Math.round((erstattung - spanneBreite / 2) * anim).toLocaleString('de-DE'), "\u2013", Math.round((erstattung + spanneBreite / 2) * anim).toLocaleString('de-DE'), "\xA0\u20AC", delta > 0 && /*#__PURE__*/React.createElement(Sticker, {
    key: delta + erstattung
  }, "+", delta, " \u20AC")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 10px',
      fontSize: 13,
      color: 'var(--nacht-text)',
      opacity: 0.75
    }
  }, "Die Spanne wird enger, je mehr du kl\xE4rst: ", /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, window.FunkeDemo.offeneAngaben), " Angaben offen \xB7 noch \u2248 ", window.FunkeDemo.minutenOffen, " Minuten.", konfliktOffen > 0 && /*#__PURE__*/React.createElement("button", {
    onClick: () => geheZu('belege'),
    style: {
      display: 'inline',
      color: 'var(--warn)',
      fontWeight: 700,
      textDecoration: 'underline',
      marginLeft: 6
    }
  }, "\xB1 ", konfliktOffen, " Konflikt offen \u2192")), lohnersatz && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '-4px 0 10px',
      fontSize: 13,
      color: 'var(--nacht-text)',
      opacity: 0.75
    }
  }, "Elterngeld eingerechnet: steuerfrei, hebt aber deinen Satz \u2014 die Spanne ber\xFCcksichtigt das schon. Keine \xDCberraschung im Bescheid."), /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: {
      regel: 'SCHÄTZ-01 · Stand 2026',
      rechenweg: 'Spanne = ungeklärte Angaben × 40 €; Grenzsteuersatz 30 % (Näherung), WK-Pauschbetrag 1.230 €'
    }
  })), /*#__PURE__*/React.createElement(window.FunkeEulenEinstieg, {
    onAbruf: () => geheZu('berater')
  }), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Ring, {
    pct: Math.round(68 * anim)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, branches.map(b => /*#__PURE__*/React.createElement("button", {
    key: b.name,
    onClick: () => setLueckenOffen(true),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      padding: '5px 0',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 92,
      fontSize: 13,
      flex: 'none',
      fontWeight: 600
    }
  }, b.name), /*#__PURE__*/React.createElement(Balken, {
    pct: Math.round(b.pct * anim),
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-mono)',
      fontSize: 12,
      width: 30,
      textAlign: 'right'
    }
  }, b.pct))))), /*#__PURE__*/React.createElement(Chip, {
    onClick: () => setLueckenOffen(true),
    style: {
      marginTop: 10
    }
  }, "Was fehlt noch? (", luecken.length, ")")), gg && /*#__PURE__*/React.createElement("button", {
    onClick: () => geheZu('ggtracker'),
    className: "fk-karte",
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", null, "Nichtr\xFCckkehrtage"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Grenzg\xE4nger-Status: sicher \u2014 Tage pflegen \u2192")), /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 28
    }
  }, window.FunkeDemo.gg.stand, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'var(--tinte-2)'
    }
  }, "/", window.FunkeDemo.gg.max))), /*#__PURE__*/React.createElement("button", {
    onClick: () => geheZu('lebenslagen'),
    className: "fk-karte",
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", null, "+ Lebenslage"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Umzug, Abfindung, Elterngeld, Zahnarzt \u2026 \u2014 was sich \xE4ndert, zieht steuerlich mit")), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      fontWeight: 800,
      flex: 'none'
    }
  }, "\u2192")), extra.kap && /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      borderColor: 'var(--warn)',
      boxShadow: '3px 3px 0 var(--warn)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--warn)'
    }
  }, "Kein Freistellungsauftrag hinterlegt"), /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      flex: 'none',
      color: 'var(--warn)'
    }
  }, "+137 \u20AC")), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)',
      margin: '6px 0 10px'
    }
  }, "Deine Bank hat auf 812 \u20AC Zinsen 137 \u20AC Steuer einbehalten, obwohl sie unter dem Sparerpauschbetrag (1.000 \u20AC) liegen. Wir holen sie \xFCber die Anlage KAP zur\xFCck \u2014 dieses Jahr automatisch, f\xFCrs n\xE4chste stell den Freistellungsauftrag bei der Bank."), /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: {
      beleg: 'Jahressteuerbescheinigung Bank',
      regel: 'KAP-SPB-1000',
      rechenweg: '812 € < 1.000 € → Kapitalertragsteuer 137 € erstattungsfähig'
    }
  })), extra.verm && !extra.vermMehrere && /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      textAlign: 'center',
      padding: '22px 16px',
      borderStyle: 'dashed'
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 15
    }
  }, "Noch kein Mietobjekt angelegt"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px auto 12px',
      fontSize: 13,
      color: 'var(--tinte-2)',
      maxWidth: 320
    }
  }, "F\xFCr die Anlage V brauchen wir deine Wohnung: Adresse, Mieteinnahmen, Nebenkosten. F\xFCnf Minuten \u2014 dann rechnen wir Abschreibung und Werbungskosten selbst."), /*#__PURE__*/React.createElement(Button, {
    variante: "leise",
    style: {
      width: 'auto',
      minHeight: 42
    },
    onClick: () => geheZu('lebenslagen')
  }, "Objekt anlegen")), /*#__PURE__*/React.createElement("button", {
    onClick: () => geheZu('bescheid'),
    className: "fk-karte",
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", null, "Dein Bescheid ", window.FunkeDemo.bescheid.jahr, " ist da"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "1 Abweichung \u2014 Einspruch lohnt sich vielleicht \u2192")), /*#__PURE__*/React.createElement("span", {
    className: "fk-sticker num",
    style: {
      background: 'var(--warn-weich)',
      color: 'var(--warn)',
      borderColor: 'var(--warn)',
      boxShadow: '2px 2px 0 var(--warn)',
      fontSize: 13
    }
  }, window.FunkeDemo.bescheid.delta, " \u20AC")), extra.kinder && /*#__PURE__*/React.createElement("div", {
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("b", null, "Kindergeld oder Freibetrag?"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)',
      marginTop: 4
    }
  }, "Musst du nicht entscheiden \u2014 das Finanzamt pr\xFCft automatisch, was mehr bringt. Wir zeigen dir das Ergebnis im Bescheid-Vergleich.")), partner && /*#__PURE__*/React.createElement("button", {
    onClick: () => geheZu('veranlagung'),
    className: "fk-karte",
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", null, "Zusammen oder einzeln veranlagen?"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Beide Wege gerechnet \u2014 aktuell vorn: zusammen \u2192")), /*#__PURE__*/React.createElement("span", {
    className: "fk-sticker num",
    style: {
      fontSize: 13
    }
  }, "+", window.FunkeDemo.veranlagung.zusammen - window.FunkeDemo.veranlagung.einzeln, " \u20AC"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "fk-ai-karte",
    "data-ai": "true"
  }, /*#__PURE__*/React.createElement(AiChip, null, "Berater"), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 28,
      margin: '10px 0 2px',
      color: 'var(--ki-tinte)'
    }
  }, fund, " \u20AC gefunden"), offen.length > 0 ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '2px 0 12px',
      fontSize: 13,
      color: 'var(--ki-tinte)'
    }
  }, offen.length, " Hinweis", offen.length > 1 ? 'e' : '', " offen"), offen.map(h => /*#__PURE__*/React.createElement("div", {
    key: h.id,
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 14
    }
  }, h.titel), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      marginBottom: 8
    }
  }, h.detail), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variante: "leise",
    style: {
      minHeight: 42
    },
    onClick: () => onUmsetzen(h.id)
  }, "\xDCbernehmen (+", h.betrag, " \u20AC)"), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      minHeight: 42
    },
    onClick: () => onVerwerfen(h.id)
  }, "Trifft nicht zu"))))) : /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '2px 0 0',
      fontSize: 13
    }
  }, "Keine offenen Hinweise \u2014 verworfene tauchen nicht wieder auf.")), /*#__PURE__*/React.createElement(Button, {
    onClick: () => geheZu('belege')
  }, "N\xE4chster Schritt: 2 Belege pr\xFCfen"), /*#__PURE__*/React.createElement(BeraterLeiste, {
    text: "Was fehlt noch zur Abgabe? Frag mich.",
    onOeffnen: () => geheZu('berater')
  }))), lueckenOffen && /*#__PURE__*/React.createElement(Sheet, {
    titel: `Lücken-Liste (${luecken.length})`,
    onClose: () => setLueckenOffen(false)
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 0,
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Aus dem Vollst\xE4ndigkeits-Report \u2014 jede Zeile f\xFChrt dich direkt zur L\xF6sung."), luecken.map((l, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    onClick: () => {
      setLueckenOffen(false);
      geheZu(l.ziel);
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      textAlign: 'left',
      borderBottom: '1.5px solid var(--linie-weich)',
      padding: '12px 0',
      minHeight: 52
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--schrift-mono)',
      fontSize: 11,
      color: 'var(--tinte-2)',
      width: 92,
      flex: 'none'
    }
  }, l.br), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14
    }
  }, l.was), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800
    }
  }, "\u2192")))));
}
Object.assign(window, {
  FunkeCockpit
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Cockpit.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Datenschutz.jsx
try { (() => {
/* Datenschutz (DSGVO) — plakativ UND präzise: „Deine Daten. Deine Regeln."
   Kein Marketing-Nebel: jede Behauptung konkret, jedes Recht mit Aktion. */
const {
  Button,
  Chip,
  Pill,
  Sheet,
  Toast
} = window.FinanzoFunkeDesignSystem_7e417e;
const SCHUTZ = [{
  titel: 'Verschlüsselt — immer',
  text: 'TLS beim Übertragen, AES-256 auf dem Server. Belege liegen nie unverschlüsselt.'
}, {
  titel: 'Server in Deutschland',
  text: 'Frankfurt am Main. Keine Drittland-Übermittlung, kein US-Cloud-Zugriff auf Steuerdaten.'
}, {
  titel: 'Nie verkauft, nie beworben',
  text: 'Keine Werbung, kein Tracking-Netzwerk, kein Datenverkauf. Wir verdienen am Abgabe-Paket — sonst nichts.'
}, {
  titel: 'KI ohne Gedächtnis',
  text: 'Der Berater rechnet auf unseren Servern in Deutschland. Deine Unterlagen trainieren keine Modelle.'
}];
const RECHTE = [{
  art: 'Art. 15',
  recht: 'Auskunft',
  aktion: 'Alles exportieren (ZIP)'
}, {
  art: 'Art. 17',
  recht: 'Löschen',
  aktion: 'Konto & Daten löschen — ein Tap'
}, {
  art: 'Art. 16',
  recht: 'Berichtigung',
  aktion: 'Jede Zahl direkt änderbar'
}, {
  art: 'Art. 20',
  recht: 'Übertragbarkeit',
  aktion: 'Export in offenen Formaten'
}];
function FunkeDatenschutz({
  onZurueck,
  geheZu
}) {
  const [toast, setToast] = React.useState('');
  function zeigeToast(t) {
    setToast(t);
    setTimeout(() => setToast(''), 1400);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-bau"
  }, /*#__PURE__*/React.createElement("div", {
    className: "appbar",
    style: {
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onZurueck,
    "aria-label": "Zur\xFCck",
    style: {
      width: 44,
      height: 44,
      border: 'var(--kontur) solid var(--tinte)',
      borderRadius: 999,
      background: 'var(--karte)',
      boxShadow: 'var(--schatten-hart-s)',
      fontWeight: 800,
      flex: 'none'
    }
  }, "\u2190"), /*#__PURE__*/React.createElement("h1", {
    style: {
      marginRight: 'auto'
    }
  }, "Datenschutz"), /*#__PURE__*/React.createElement(Pill, null, "DSGVO")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte nacht"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--funke-hell)'
    }
  }, "Ernst gemeint, nicht kleingedruckt"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 36,
      lineHeight: 1.05,
      margin: '8px 0 6px'
    }
  }, "Deine Daten.", /*#__PURE__*/React.createElement("br", null), "Deine Regeln."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      opacity: 0.8
    }
  }, "Steuerdaten sind das Privateste, was eine App anfassen kann. Deshalb steht hier alles \u2014 kurz, konkret, nachpr\xFCfbar.")), SCHUTZ.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.titel,
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 15
    }
  }, s.titel), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '4px 0 0',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, s.text))), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      padding: 0,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mono-label",
    style: {
      padding: '12px 16px 4px'
    }
  }, "Deine Rechte \u2014 mit einem Tap"), RECHTE.map(r => /*#__PURE__*/React.createElement("button", {
    key: r.art,
    onClick: () => zeigeToast('Demo — im Profil unter „Deine Daten"'),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      textAlign: 'left',
      padding: '12px 16px',
      borderTop: '1.5px solid var(--linie-weich)',
      minHeight: 52,
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-mono)',
      fontSize: 11,
      color: 'var(--tinte-2)',
      width: 52,
      flex: 'none'
    }
  }, r.art), /*#__PURE__*/React.createElement("b", {
    style: {
      width: 110,
      flex: 'none'
    }
  }, r.recht), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      color: 'var(--tinte-2)',
      fontSize: 13
    }
  }, r.aktion), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      fontWeight: 800
    }
  }, "\u2192")))), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 15
    }
  }, "Ehrlich: was wir sehen \u2014 und was nie"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '4px 0 0',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Wir sehen, was du hochl\xE4dst und beantwortest \u2014 daf\xFCr ist die App da. Wir sehen ", /*#__PURE__*/React.createElement("b", null, "nie"), ": dein ELSTER-Passwort, deine Kontobewegungen, dein Adressbuch. Im Gast-Modus verl\xE4sst nichts dein Ger\xE4t.")), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    onClick: () => geheZu ? geheZu('profil') : onZurueck()
  }, "Zu \u201EDeine Daten\" im Profil"), toast && /*#__PURE__*/React.createElement(Toast, {
    text: toast
  }));
}
Object.assign(window, {
  FunkeDatenschutz
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Datenschutz.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/EulenModus.jsx
try { (() => {
/* Eulen-Modus (ADR 037–042) — Fund-Karten + Abruf-Gespräch („Was würdest du mich fragen?").
   Karten neutral, Kern-Aussage violett (--ki), „Stimmt nicht"-Knopf, Rechtsstand-Zeile. */
const {
  Button,
  Chip,
  AiChip
} = window.FinanzoFunkeDesignSystem_7e417e;

/* Die 4 Demo-Funde (R3) — je Persona einer; Reihenfolge nach geschätztem Betrag */
const EULEN_FUNDE = [{
  id: 'zins',
  wer: 'Vermieter',
  kern: 'Deine Zinsbescheinigung fehlt — letztes Jahr waren es 1.900 €.',
  frage: 'Zahlst du den Kredit für die Wohnung noch ab?',
  betrag: '≈ 570 €',
  quelle: 'Vergleich mit deinem Steuerjahr 2025'
}, {
  id: 'ziffer10',
  wer: 'Grenzgänger',
  kern: 'Dein Lohnausweis zeigt Ziffer 10 (Spesen) — die sind bei dir noch nirgends.',
  frage: 'Hast du die Spesen privat verauslagt oder erstattet bekommen?',
  betrag: '≈ 180 €',
  quelle: 'Lohnausweis 2026, Ziffer 10'
}, {
  id: 'homeoffice',
  wer: 'Angestellter',
  kern: 'Homeoffice angegeben, aber keine Arbeitsmittel.',
  frage: 'Stuhl? Monitor? Irgendwas gekauft fürs Arbeiten zu Hause?',
  betrag: '≈ 120 €',
  quelle: 'Lücke im Muster: Homeoffice ohne Arbeitsmittel'
}, {
  id: 'kita',
  wer: 'Eltern',
  kern: 'Kita-Rechnung gefunden — Kinderbetreuung ist noch nicht angelegt.',
  frage: 'Soll ich die Lebenslage Kinderbetreuung für dich anlegen?',
  betrag: '≈ 800 €',
  quelle: 'Beleg „Kita-Rechnung März" im Posteingang'
}];
function eulenAn() {
  try {
    return localStorage.getItem('funke.eulenmodus') === '1';
  } catch (e) {
    return false;
  }
}
function setEulenAn(an) {
  try {
    localStorage.setItem('funke.eulenmodus', an ? '1' : '0');
  } catch (e) {}
}

/* Proaktive Gesetzes-Fund-Karte (nur ≥ 50 €, ADR-038) — fürs Cockpit */
function FunkeGesetzesFund({
  onWeg
}) {
  const [zu, setZu] = React.useState(false);
  if (zu) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    "data-ai": "true",
    style: {
      borderColor: 'var(--ki)',
      boxShadow: '4px 4px 0 var(--ki)',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(AiChip, null, "Eulen-Fund"), /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      color: 'var(--ki)',
      fontSize: 18
    }
  }, "+140 \u20AC")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 4px',
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--ki)'
    }
  }, "Gerichte haben entschieden: Dein Arbeitszimmer z\xE4hlt auch bei zwei Arbeitgebern voll."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 10px',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Betrifft deinen Posten \u201EArbeitszimmer\" \u2014 ich habe nachgerechnet. ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault()
  }, "Zur Quelle")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variante: "leise",
    style: {
      minHeight: 40,
      width: 'auto',
      fontSize: 13
    },
    onClick: () => setZu(true)
  }, "\xDCbernehmen"), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      minHeight: 40,
      width: 'auto',
      fontSize: 13
    },
    onClick: () => {
      setZu(true);
    }
  }, "Stimmt nicht")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      fontSize: 11,
      color: 'var(--tinte-2)'
    }
  }, "Rechtsstand: 22.07.2026"));
}

/* Cockpit-Einstieg: EINE violette Sammelkarte — Fragen + Fund gebündelt (max. 1 violette Karte im Cockpit) */
function FunkeEulenEinstieg({
  onAbruf
}) {
  if (!eulenAn()) return null;
  return /*#__PURE__*/React.createElement("button", {
    onClick: onAbruf,
    className: "fk-karte",
    "data-ai": "true",
    style: {
      width: '100%',
      textAlign: 'left',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 10,
      height: 10,
      borderRadius: 99,
      background: 'var(--ki)',
      flex: 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--ki)'
    }
  }, "Ich h\xE4tte ", EULEN_FUNDE.length, " Fragen \u2014 und einen Fund: +140 \u20AC."), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--tinte-2)'
    }
  }, "Zusammen \u2248 1.810 \u20AC \u2014 zwei Minuten?")), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      fontWeight: 800
    }
  }, "\u2192"));
}

/* Abruf-Gespräch: eine Frage nach der anderen (ADR-038), Leerlauf ehrlich (ADR-039) */
function FunkeEulenAbruf({
  onSchliessen
}) {
  const [i, setI] = React.useState(0);
  const [erledigt, setErledigt] = React.useState({});
  const offene = EULEN_FUNDE.filter(f => !erledigt[f.id]);
  const jetzt = new Date();
  const stand = jetzt.toLocaleDateString('de-DE') + ', ' + jetzt.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  });
  if (offene.length === 0) {
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(FunkeGesetzesFund, null), /*#__PURE__*/React.createElement("div", {
      className: "fk-karte",
      style: {
        textAlign: 'center',
        padding: 24
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        fontSize: 16
      }
    }, "Nichts offen."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '6px 0 14px',
        fontSize: 13,
        color: 'var(--tinte-2)'
      }
    }, "Dein Jahr ist gut gepflegt \u2014 ich melde mich, wenn sich was \xE4ndert."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 14px',
        fontSize: 11,
        color: 'var(--tinte-2)'
      }
    }, "Zuletzt gepr\xFCft: ", stand), onSchliessen && /*#__PURE__*/React.createElement(Button, {
      variante: "ghost",
      style: {
        width: 'auto',
        minHeight: 40
      },
      onClick: onSchliessen
    }, "Zur\xFCck")));
  }
  const f = offene[Math.min(i, offene.length - 1)];
  const antworte = was => {
    setErledigt({
      ...erledigt,
      [f.id]: was
    });
    setI(0);
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(FunkeGesetzesFund, null), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    "data-ai": "true"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(AiChip, null, "Frage ", EULEN_FUNDE.length - offene.length + 1, " von ", EULEN_FUNDE.length), /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      color: 'var(--ki)',
      fontSize: 16
    }
  }, f.betrag)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 2px',
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--ki)'
    }
  }, f.kern), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 10px',
      fontSize: 14
    }
  }, f.frage), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variante: "leise",
    style: {
      minHeight: 42,
      width: 'auto',
      fontSize: 13
    },
    onClick: () => antworte('ja')
  }, "Ja, k\xFCmmern wir uns drum"), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      minHeight: 42,
      width: 'auto',
      fontSize: 13
    },
    onClick: () => antworte('nein')
  }, "Trifft nicht zu"), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      minHeight: 42,
      width: 'auto',
      fontSize: 13
    },
    onClick: () => antworte('falsch')
  }, "Stimmt nicht")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      fontSize: 12,
      color: 'var(--tinte-2)'
    }
  }, "Woher: ", f.quelle)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 11,
      color: 'var(--tinte-2)'
    }
  }, "Rechtsstand: 22.07.2026 \xB7 Verworfenes kommt nur bei neuen Fakten wieder"), offene.length > 1 && /*#__PURE__*/React.createElement(Chip, {
    style: {
      minHeight: 32,
      fontSize: 12
    },
    onClick: () => setI((i + 1) % offene.length)
  }, "N\xE4chste")));
}
Object.assign(window, {
  FunkeEulenAbruf,
  FunkeEulenEinstieg,
  FunkeGesetzesFund,
  FunkeEulenFunde: EULEN_FUNDE,
  funkeEulenAn: eulenAn,
  funkeSetEulenAn: setEulenAn
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/EulenModus.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/GgTracker.jsx
try { (() => {
/* Grenzgänger-Tracker — Nichtrückkehrtage markieren, 60er-Grenze immer sichtbar. */
const {
  Button,
  Chip,
  Pill,
  Banner,
  Balken,
  HerkunftsChip,
  Toast,
  Begriff,
  Sheet,
  Sticker
} = window.FinanzoFunkeDesignSystem_7e417e;
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul'];
function FunkeGgTracker({
  startTage = 52,
  onZurueck
}) {
  /* Juli 2026: 31 Tage, beginnt Mi (Index 2 bei Mo-Start) */
  const [markiert, setMarkiert] = React.useState(() => new Set([2, 3, 9, 16, 22]));
  const [monat, setMonat] = React.useState('Jul');
  const [toast, setToast] = React.useState('');
  const [kursModus, setKursModus] = React.useState('jahr');
  const [kursBeleg, setKursBeleg] = React.useState(false); /* ADR-012: tatsächlicher Kurs nur mit Kontoauszug */
  /* ADR-029/036: Lohnausweis-Maske — CHF führt, EUR daneben; unsichere Felder markiert */
  const [lohnOffen, setLohnOffen] = React.useState(false);
  const [lohnDa, setLohnDa] = React.useState(false);
  const KURS = 1.07;
  const ZIFFERN = [{
    z: '1',
    label: 'Bruttolohn',
    chf: 88400,
    sicher: true
  }, {
    z: '9',
    label: 'Beiträge AHV/IV/ALV',
    chf: 5590,
    sicher: true
  }, {
    z: '10.1',
    label: 'Pensionskasse (2. Säule)',
    chf: 6120,
    sicher: false
  }, {
    z: '12',
    label: 'Quellensteuer',
    chf: 3978,
    sicher: true
  }];
  const vorher = startTage;
  const gesamt = vorher + markiert.size;
  const kritisch = gesamt >= 55;
  const gekippt = gesamt >= 60;
  function toggle(tag) {
    const n = new Set(markiert);
    n.has(tag) ? n.delete(tag) : n.add(tag);
    setMarkiert(n);
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "appbar"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, onZurueck ? /*#__PURE__*/React.createElement("button", {
    onClick: onZurueck,
    "aria-label": "Zur\xFCck",
    style: {
      width: 44,
      height: 44,
      border: '1.5px solid var(--linie-weich)',
      borderRadius: 999,
      background: 'var(--karte)',
      fontWeight: 800
    }
  }, "\u2190") : /*#__PURE__*/React.createElement("a", {
    href: "index.html",
    "aria-label": "Zur\xFCck zur App",
    style: {
      width: 44,
      height: 44,
      border: '1.5px solid var(--linie-weich)',
      borderRadius: 999,
      background: 'var(--karte)',
      fontWeight: 800,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textDecoration: 'none',
      color: 'inherit'
    }
  }, "\u2190"), /*#__PURE__*/React.createElement("h1", null, "Grenzg\xE4nger")), /*#__PURE__*/React.createElement(Pill, null, "DBA Schweiz")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte nacht"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--funke-hell)'
    }
  }, "Schweizer Lohnausweis"), lohnDa && /*#__PURE__*/React.createElement(Sticker, {
    style: {
      fontSize: 13
    }
  }, "\xDCbernommen")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 12px',
      fontSize: 13,
      opacity: 0.8
    }
  }, lohnDa ? 'Ziffern 1–12 sind gemappt — jede Zahl trägt Ziffer und Kurs als Herkunft.' : 'Fotografieren, wir lesen die Ziffern und rechnen um — kein Abtippen. Unsichere Felder zeigen wir dir zum Bestätigen.'), /*#__PURE__*/React.createElement(Button, {
    variante: "nacht",
    style: {
      borderColor: 'var(--funke)',
      width: 'auto'
    },
    onClick: () => setLohnOffen(true)
  }, lohnDa ? 'Ziffern ansehen' : 'Lohnausweis scannen')), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, "Deine CH-Bausteine \u2014 automatisch angesetzt"), [['Quellensteuer 4,5 % wird angerechnet', lohnDa ? '3.978 CHF · ≈ 4.256 €' : 'aus Ziffer 12', {
    regel: 'DBA CH Art. 15a Abs. 3',
    rechenweg: 'Anrechnung auf die deutsche Einkommensteuer'
  }], ['Pensionskasse als Vorsorgeaufwand', lohnDa ? '6.120 CHF · ≈ 6.548 €' : 'aus Ziffer 10.1', {
    regel: 'BMF v. 27.07.2016',
    rechenweg: 'Obligatorium wie gesetzliche RV behandelt'
  }], ['Säule 3a — erfasst, Grenzen ehrlich', 'auf Nachweis', {
    regel: 'begrenzt abziehbar',
    rechenweg: 'privates Vorsorgeprodukt — kein voller Abzug wie in der Schweiz'
  }], ['CH-Krankenkasse als Basisvorsorge', 'aus deinen Prämien', {
    regel: '§ 10 Abs. 1 Nr. 3 EStG',
    rechenweg: 'Grundversicherung wie deutsche Basis-KV'
  }], ['Kinderzulage mit Kindergeld verrechnet', 'aus Ziffer 7', {
    regel: '§ 65 EStG',
    rechenweg: 'CH-Familienzulage mindert deutsches Kindergeld — die Günstigerprüfung rechnet damit'
  }]].map(([t, w, q]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      borderBottom: '1.5px solid var(--linie-weich)',
      padding: '9px 0',
      fontSize: 13,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 160
    }
  }, t), /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      color: 'var(--tinte-2)',
      fontFamily: 'var(--schrift-mono)',
      fontSize: 12
    }
  }, w), /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: q
  }))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      fontSize: 12,
      color: 'var(--tinte-2)'
    }
  }, "Alles kombinierbar \u2014 Kapital, Vermietung, Kinder laufen parallel weiter, nichts bei\xDFt sich.")), /*#__PURE__*/React.createElement("div", {
    className: kritisch ? 'fk-karte' : 'fk-karte nacht',
    style: kritisch ? {
      borderColor: 'var(--fehler)',
      boxShadow: '4px 4px 0 var(--fehler)'
    } : {}
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: kritisch ? 'var(--fehler)' : 'var(--funke-hell)'
    }
  }, "Nichtr\xFCckkehrtage 2026"), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 48,
      lineHeight: 1.05,
      color: kritisch ? 'var(--fehler)' : 'var(--funke)'
    }
  }, gesamt, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 22,
      opacity: 0.7
    }
  }, "/60")), /*#__PURE__*/React.createElement(Balken, {
    pct: Math.min(100, gesamt / 60 * 100),
    style: {
      margin: '10px 0 6px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      opacity: 0.8
    }
  }, Math.max(0, 60 - gesamt), " Tage Puffer"), /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: {
      regel: 'GG-NRT-60 · DBA Schweiz Art. 15a',
      rechenweg: `${vorher} übernommen + ${markiert.size} markiert`
    }
  }))), gekippt ? /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      borderColor: 'var(--fehler)',
      boxShadow: '4px 4px 0 var(--fehler)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--fehler)'
    }
  }, "60 erreicht \u2014 Status gekippt"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 24,
      lineHeight: 1.15,
      margin: '6px 0'
    }
  }, "Ab jetzt besteuert die Schweiz deinen Lohn."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 6px',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Ehrlich: Den gekippten Fall (Quellensteuer, Aufteilung, Ans\xE4ssigkeit) kann SteuerEule noch nicht rechnen \u2014 der geh\xF6rt dieses Jahr in Profi-H\xE4nde. Was jetzt z\xE4hlt:"), ['Markierte Tage prüfen — jeder falsch markierte Tag zählt gegen dich', 'Ansässigkeitsbescheinigung beim Finanzamt anfordern', 'Steuerprofi mit DBA-Schweiz-Erfahrung — nimm deinen Tracker-Export mit'].map((s, n) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'baseline',
      borderBottom: n < 2 ? '1.5px solid var(--linie-weich)' : 'none',
      padding: '8px 0',
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      flex: 'none',
      color: 'var(--fehler)'
    }
  }, n + 1), /*#__PURE__*/React.createElement("span", null, s))), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      marginTop: 8
    },
    onClick: () => {
      setToast('Demo — Tracker-Export (PDF) startet');
      setTimeout(() => setToast(''), 1400);
    }
  }, "Tracker-Export f\xFCr den Profi")) : kritisch ? /*#__PURE__*/React.createElement(Banner, {
    art: "gefahr"
  }, "Nur noch ", 60 - gesamt, " Tage bis zur Grenze \u2014 ab 60 kippt die Besteuerung in die Schweiz.") : null, /*#__PURE__*/React.createElement("div", {
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      overflowX: 'auto',
      marginBottom: 12,
      scrollbarWidth: 'none'
    },
    role: "tablist",
    "aria-label": "Monat w\xE4hlen"
  }, MONATE.map(m => /*#__PURE__*/React.createElement(Chip, {
    key: m,
    aktiv: m === monat,
    onClick: () => setMonat(m),
    style: {
      flex: 'none',
      minHeight: 36
    }
  }, m))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: 6,
      maxWidth: 440
    }
  }, ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(w => /*#__PURE__*/React.createElement("span", {
    key: w,
    className: "mono-label",
    style: {
      textAlign: 'center',
      fontSize: 10
    }
  }, w)), Array.from({
    length: 2
  }).map((x, n) => /*#__PURE__*/React.createElement("i", {
    key: 'l' + n
  })), Array.from({
    length: 31
  }).map((x, n) => {
    const tag = n + 1;
    const an = markiert.has(tag);
    const we = (n + 2) % 7 >= 5;
    return /*#__PURE__*/React.createElement("button", {
      key: tag,
      onClick: () => toggle(tag),
      "aria-pressed": an,
      "aria-label": `${tag}. Juli als Nichtrückkehrtag ${an ? 'entfernen' : 'markieren'}`,
      className: "num fx-tag",
      style: {
        aspectRatio: '1',
        minHeight: 40,
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 700,
        border: an ? 'var(--kontur) solid var(--tinte)' : '1.5px solid var(--linie-weich)',
        background: an ? 'var(--funke)' : we ? 'var(--grund)' : 'var(--karte)',
        boxShadow: an ? 'var(--schatten-hart-s)' : 'none',
        color: we && !an ? 'var(--tinte-2)' : 'var(--tinte)',
        transition: 'all var(--t-schnell) var(--zack)'
      }
    }, tag);
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      margin: '12px 0 0'
    }
  }, "Tippen markiert einen ", /*#__PURE__*/React.createElement(Begriff, {
    titel: "Nichtr\xFCckkehrtag",
    erklaerung: "Ein Arbeitstag, nach dem du aus beruflichen Gr\xFCnden nicht an deinen Wohnort zur\xFCckgekehrt bist \u2014 etwa wegen Montage, Bereitschaft oder sp\xE4ter Schicht mit Hotel. Bleibst du an mehr als 60 solcher Tage weg, gilst du nicht mehr als Grenzg\xE4nger und die Schweiz besteuert deinen Lohn.",
    beispiel: "Projektwoche in Z\xFCrich, Mo\u2013Do im Hotel = 4 Tage"
  }, "Nichtr\xFCckkehrtag"), " \u2014 eine \xDCbernachtung wegen Arbeit nicht zuhause. Wochenenden z\xE4hlen mit, wenn beruflich."), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      marginTop: 12
    },
    onClick: () => {
      setToast('Demo — PDF-Liste aller markierten Tage');
      setTimeout(() => setToast(''), 1400);
    }
  }, "Tage-Liste exportieren (PDF)")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, "Umrechnung CHF \u2192 EUR"), /*#__PURE__*/React.createElement(Pill, null, "Vorl\xE4ufig")), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 26,
      margin: '6px 0 2px'
    }
  }, "1 CHF = 1,07 \u20AC"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      margin: '8px 0',
      flexWrap: 'wrap'
    },
    role: "tablist",
    "aria-label": "Kurs-Modus"
  }, /*#__PURE__*/React.createElement(Chip, {
    aktiv: kursModus === 'jahr',
    onClick: () => setKursModus('jahr'),
    style: {
      minHeight: 32,
      fontSize: 12
    }
  }, "Jahresmittel"), /*#__PURE__*/React.createElement(Chip, {
    aktiv: kursModus === 'monat',
    onClick: () => setKursModus('monat'),
    style: {
      minHeight: 32,
      fontSize: 12
    }
  }, "Monatskurse"), /*#__PURE__*/React.createElement(Chip, {
    aktiv: kursModus === 'echt',
    onClick: () => setKursModus('echt'),
    style: {
      minHeight: 32,
      fontSize: 12
    }
  }, "Tats\xE4chlicher Kurs")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      margin: '0 0 8px'
    }
  }, kursModus === 'jahr' ? 'Du trägst nie einen Kurs ein: aktuell EZB-Jahresmittel — der amtliche Kurs kommt im Januar 2027, wir tauschen ihn automatisch und rechnen neu.' : kursModus === 'monat' ? 'Monatskurse lohnen sich bei stark schwankendem Franken — wir rechnen beide Wege und zeigen dir die Differenz vor der Abgabe.' : 'Dein echter Kurs vom Kontoauszug — zulässig und oft günstiger, aber nur mit Nachweis. Ohne Kontoauszug bleibt der amtliche Kurs.'), kursModus === 'echt' && !kursBeleg && /*#__PURE__*/React.createElement(Button, {
    variante: "leise",
    style: {
      minHeight: 40,
      width: 'auto',
      marginBottom: 8
    },
    onClick: () => setKursBeleg(true)
  }, "Kontoauszug hochladen (Demo)"), kursModus === 'echt' && kursBeleg && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--ok)',
      fontWeight: 700,
      margin: '0 0 8px'
    }
  }, "\u2713 Kontoauszug liegt bei \u2014 dein Kurs gilt f\xFCr Juli."), /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: kursModus === 'echt' && kursBeleg ? {
      beleg: 'Kontoauszug Juli 2026',
      regel: 'GG-KURS-ECHT · belegpflichtig'
    } : {
      regel: 'GG-KURS-2026 · vorläufig',
      rechenweg: 'EZB-Referenzkurse, Jahresmittel Jan–Jul 2026 = 1,07'
    }
  })), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    onClick: () => {
      setToast('Kalender-Import kommt mit 2.0 — Demo');
      setTimeout(() => setToast(''), 1400);
    }
  }, "Tage aus Kalender importieren"), lohnOffen && /*#__PURE__*/React.createElement(Sheet, {
    titel: "Lohnausweis \u2014 Ziffer f\xFCr Ziffer",
    onClose: () => setLohnOffen(false)
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 0,
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Wie auf dem Papier: CHF f\xFChrt, daneben der Euro-Wert (Kurs 1,07 \xB7 Jahresmittel). Gelb markiert = bitte kurz pr\xFCfen."), ZIFFERN.map(x => /*#__PURE__*/React.createElement("div", {
    key: x.z,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      borderBottom: '1.5px solid var(--linie-weich)',
      padding: '10px 0',
      background: x.sicher ? 'transparent' : 'var(--warn-weich)',
      borderRadius: x.sicher ? 0 : 8,
      paddingLeft: x.sicher ? 0 : 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-mono)',
      fontSize: 12,
      color: 'var(--tinte-2)',
      width: 36,
      flex: 'none'
    }
  }, x.z), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14
    }
  }, x.label, !x.sicher && /*#__PURE__*/React.createElement("b", {
    style: {
      display: 'block',
      fontSize: 11,
      color: 'var(--warn)'
    }
  }, "unsicher gelesen \u2014 stimmt das?")), /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      fontSize: 14,
      whiteSpace: 'nowrap'
    }
  }, x.chf.toLocaleString('de-CH'), " CHF"), /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      whiteSpace: 'nowrap'
    }
  }, "\u2248 ", Math.round(x.chf * KURS).toLocaleString('de-DE'), " \u20AC"))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)'
    }
  }, "Das Foto bleibt als Beleg gespeichert \u2014 jede Zeile in \xDCbertragen tr\xE4gt \u201ELohnausweis Ziffer n \xD7 Kurs\" als Herkunft."), /*#__PURE__*/React.createElement(Button, {
    onClick: () => {
      setLohnDa(true);
      setLohnOffen(false);
      setToast('4 Ziffern übernommen — Anlage N-Gre befüllt');
      setTimeout(() => setToast(''), 1800);
    }
  }, lohnDa ? 'Passt weiterhin' : 'Alle Ziffern übernehmen')), toast && /*#__PURE__*/React.createElement(Toast, {
    text: toast
  }));
}
Object.assign(window, {
  FunkeGgTracker
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/GgTracker.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Interview.jsx
try { (() => {
/* Interview (F1) — eine Frage pro Screen, große Optionen, sofortiges Geld-Feedback.
   Antworten landen in localStorage 'funke.interview' — Cockpit/Übertragen lesen sie. */
const {
  Button,
  Input,
  Option,
  Pill,
  Sticker,
  Chip,
  Begriff
} = window.FinanzoFunkeDesignSystem_7e417e;
const FRAGEN = [{
  id: 'job',
  frage: /*#__PURE__*/React.createElement("span", null, "Woher kam dein ", /*#__PURE__*/React.createElement("em", {
    className: "fx-mark"
  }, "Geld"), " 2026?"),
  hilfe: 'Mehrfachjobs? Nimm die Hauptquelle — der Rest kommt später.',
  optionen: ['Angestellt', 'Selbstständig', 'Beides', 'Rente']
}, {
  id: 'partner',
  frage: /*#__PURE__*/React.createElement("span", null, "Verheiratet oder ", /*#__PURE__*/React.createElement("em", {
    className: "fx-mark"
  }, "verpartnert"), "?"),
  hilfe: 'Dann rechnen wir Zusammen- und Einzelveranlagung — und empfehlen, was mehr bringt.',
  optionen: ['Ja', 'Nein']
}, {
  id: 'kinder',
  frage: /*#__PURE__*/React.createElement("span", null, "Hast du ", /*#__PURE__*/React.createElement("em", {
    className: "fx-mark"
  }, "Kinder"), "?"),
  hilfe: 'Kindergeld, Freibeträge, Betreuungskosten — die Günstigerprüfung Kindergeld vs. Freibetrag läuft automatisch.',
  optionen: ['Nein', '1 Kind', '2 oder mehr']
}, {
  id: 'homeoffice',
  frage: /*#__PURE__*/React.createElement("span", null, "Wie oft ", /*#__PURE__*/React.createElement("em", {
    className: "fx-mark"
  }, "Homeoffice"), "?"),
  hilfe: '6 € pro Tag, bis 1.260 € im Jahr.',
  optionen: ['Nie', '1–2 Tage pro Woche', 'Fast immer'],
  impact: [0, 80, 210]
}, {
  id: 'weg',
  frage: /*#__PURE__*/React.createElement("span", null, "Wie weit ist dein ", /*#__PURE__*/React.createElement("em", {
    className: "fx-mark"
  }, "Arbeitsweg"), "?"),
  hilfe: 'Einfache Strecke, in Kilometern — 0,30 €/km ab Tag eins.',
  eingabe: 'km'
}, {
  id: 'tage',
  frage: /*#__PURE__*/React.createElement("span", null, "Wie viele ", /*#__PURE__*/React.createElement("em", {
    className: "fx-mark"
  }, "Arbeitstage"), " 2026?"),
  hilfe: 'Musst du nicht wissen — sag uns Urlaub und Krankheit, den Rest rechnen wir aus dem Kalender 2026.',
  eingabe: 'tage'
}, {
  id: 'fortbildung',
  frage: /*#__PURE__*/React.createElement("span", null, "Selbst f\xFCr ", /*#__PURE__*/React.createElement("em", {
    className: "fx-mark"
  }, "Fortbildung"), " bezahlt?"),
  hilfe: 'Kurse, Fachbücher, Prüfungsgebühren — voll absetzbar.',
  optionen: ['Ja', 'Nein'],
  impact: [120, 0]
}, {
  id: 'einkuenfte',
  frage: /*#__PURE__*/React.createElement("span", null, "Noch andere ", /*#__PURE__*/React.createElement("em", {
    className: "fx-mark"
  }, "Eink\xFCnfte"), "?"),
  hilfe: /*#__PURE__*/React.createElement("span", null, "Kapitalertr\xE4ge bis zum", ' ', /*#__PURE__*/React.createElement(Begriff, {
    titel: "Sparerpauschbetrag",
    erklaerung: "1.000 \u20AC Zinsen und Kursgewinne im Jahr sind steuerfrei \u2014 einfach so, f\xFCr alle. Erst ab dem 1.001sten Euro will das Amt etwas sehen. Mit einem Freistellungsauftrag bei deiner Bank wird gar nicht erst etwas abgezogen.",
    beispiel: "812 \u20AC Ertr\xE4ge \u2192 0 \u20AC Steuer",
    frage: "Was ist der Sparerpauschbetrag?"
  }, "Sparerpauschbetrag"), ' ', "decken wir ab \u2014 Vermietung in einfachen F\xE4llen."),
  optionen: ['Nein', 'Kapitalerträge', 'Vermietung', 'Beides']
}, {
  id: 'schweiz',
  frage: /*#__PURE__*/React.createElement("span", null, "Pendelst du zum Arbeiten ins ", /*#__PURE__*/React.createElement("em", {
    className: "fx-mark"
  }, "Ausland"), "?"),
  hilfe: 'Grenzgänger haben Sonderregeln — in die Schweiz können wir sie komplett, inklusive 60-Tage-Tracking.',
  optionen: ['Ja, in die Schweiz', 'In ein anderes Land', 'Nein']
}];
function FunkeInterview({
  onFertig
}) {
  const [i, setI] = React.useState(0);
  const [antworten, setAntworten] = React.useState({});
  const [km, setKm] = React.useState('');
  const [wochen, setWochen] = React.useState('5');
  const [urlaub, setUrlaub] = React.useState('');
  const [krank, setKrank] = React.useState('');
  const [delta, setDelta] = React.useState(0);

  /* Arbeitstage-Rechner: Werktage 2026 je Wochenmodell − Feiertage (auf Werktage) − Urlaub − Krankheit */
  const WERK = {
    '5': 260,
    '4': 208,
    '3': 156
  };
  const FEI = {
    '5': 9,
    '4': 7,
    '3': 5
  };
  const arbeitstage = Math.max(0, WERK[wochen] - FEI[wochen] - (parseInt(urlaub, 10) || 0) - (parseInt(krank, 10) || 0));
  const f = FRAGEN[i];
  const fertig = i >= FRAGEN.length;
  /* Fix 5: Schätzung fällt aus den Antworten — darf auch ehrlich klein sein */
  const hoImp = {
    'Nie': 0,
    '1–2 Tage pro Woche': 80,
    'Fast immer': 210
  }[antworten.homeoffice] || 0;
  const kmEff = Math.round((parseInt(km, 10) || 0) * (antworten.arbeitstage || 210) * 0.3 * 0.3);
  const schaetzung = 150 + hoImp + kmEff + (antworten.fortbildung === 'Ja' ? 120 : 0);
  React.useEffect(() => {
    if (fertig) {
      try {
        localStorage.setItem('funke.schaetzung', String(schaetzung));
      } catch (e) {}
    }
  }, [fertig, schaetzung]);
  function antworte(idx, wert) {
    const imp = f.impact ? f.impact[idx] : 0;
    const neu = {
      ...antworten,
      [f.id]: wert
    };
    setAntworten(neu);
    try {
      localStorage.setItem('funke.interview', JSON.stringify(neu));
    } catch (e) {}
    /* Gewerbe-Gate: Selbstständig/Beides → ehrliches „noch nicht" statt stillem Durchrutschen */
    if (f.id === 'job' && wert === 'Angestellt') {
      try {
        localStorage.removeItem('funke.gewerbeVorbereiten');
      } catch (e) {}
    }
    if (f.id === 'job' && wert !== 'Angestellt' && wert !== 'Rente') {
      setTimeout(() => setI(-1), 250);
      return;
    }
    /* Vermietungs-Verzweigung (M5) */
    if (f.id === 'einkuenfte' && (wert === 'Vermietung' || wert === 'Beides')) {
      setTimeout(() => setI(-2), 250);
      return;
    }
    /* KAP-Verzweigung (ADR-032): deutsche Depots + ausländische Broker ok, Krypto ehrlich gaten */
    if (f.id === 'einkuenfte' && wert === 'Kapitalerträge') {
      setTimeout(() => setI(-5), 250);
      return;
    }
    /* CH-only-Gate (ADR-013): andere Länder ehrlich abweisen statt halbgar rechnen */
    if (f.id === 'schweiz' && wert === 'In ein anderes Land') {
      setTimeout(() => setI(-4), 250);
      return;
    }
    if (imp > 0) {
      setDelta(imp);
      setTimeout(() => setDelta(0), 1600);
    }
    setTimeout(() => setI(i + 1), imp > 0 ? 550 : 250);
  }
  function kmWeiter() {
    const n = parseInt(km, 10) || 0;
    const neu = {
      ...antworten,
      weg: n
    };
    setAntworten(neu);
    try {
      localStorage.setItem('funke.interview', JSON.stringify(neu));
    } catch (e) {}
    if (n > 5) {
      setDelta(Math.round(n * 210 * 0.3 * 0.3));
      setTimeout(() => setDelta(0), 1600);
    }
    setTimeout(() => setI(i + 1), n > 5 ? 550 : 250);
  }
  function tageWeiter() {
    const neu = {
      ...antworten,
      arbeitstage,
      arbeitstageDetail: {
        wochen,
        urlaub: parseInt(urlaub, 10) || 0,
        krank: parseInt(krank, 10) || 0
      }
    };
    setAntworten(neu);
    try {
      localStorage.setItem('funke.interview', JSON.stringify(neu));
    } catch (e) {}
    setTimeout(() => setI(i + 1), 250);
  }
  function vermWeiter(verm) {
    const neu = {
      ...antworten,
      vermietung: verm
    };
    setAntworten(neu);
    try {
      localStorage.setItem('funke.interview', JSON.stringify(neu));
    } catch (e) {}
    setI(FRAGEN.findIndex(x => x.id === 'einkuenfte') + 1);
  }

  /* Gewerbe-Gate */
  if (i === -1) {
    return /*#__PURE__*/React.createElement("div", {
      className: "fx-schritt",
      key: "gewerbe"
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: 34,
        fontWeight: 800,
        margin: '28px 0 8px'
      }
    }, "Ehrlich: daf\xFCr sind wir ", /*#__PURE__*/React.createElement("em", {
      className: "fx-mark"
    }, "noch"), " nicht gut genug."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 10px',
        color: 'var(--tinte-2)'
      }
    }, "Selbstst\xE4ndige brauchen E\xDCR, Anlage G/S und Umsatzsteuer \u2014 das kann SteuerEule in Version 1 nicht. Halbe Steuererkl\xE4rungen liefern wir nicht."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 22px',
        color: 'var(--tinte-2)'
      }
    }, "Was heute schon geht: ", /*#__PURE__*/React.createElement("b", null, "vorbereiten"), ". Bei \u201EBeides\" sammeln wir deinen Angestellten-Teil komplett ein \u2014 abgegeben wird erst, wenn das Gewerbe drin ist. Eine Steuererkl\xE4rung ist unteilbar."), antworten.job === 'Beides' && /*#__PURE__*/React.createElement(Option, {
      gewaehlt: false,
      onClick: () => {
        try {
          localStorage.removeItem('funke.gewerbeWarte');
          localStorage.setItem('funke.gewerbeVorbereiten', '1');
        } catch (e) {}
        setI(1);
      }
    }, "Angestellten-Teil vorbereiten \u2014 Abgabe erst mit Gewerbe"), /*#__PURE__*/React.createElement(Option, {
      gewaehlt: false,
      onClick: () => {
        try {
          localStorage.setItem('funke.gewerbeWarte', '1');
        } catch (e) {}
        window.location.href = 'index.html';
      }
    }, "Benachrichtigt mich, wenn Gewerbe kommt"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setI(0),
      style: {
        display: 'block',
        margin: '14px auto 0',
        fontSize: 14,
        textDecoration: 'underline',
        minHeight: 44
      }
    }, "Zur\xFCck zur Frage"));
  }

  /* Vermietungs-Verzweigung (M5): einfacher Fall geführt, komplexer ehrlich abgegeben */
  if (i === -2) {
    return /*#__PURE__*/React.createElement("div", {
      className: "fx-schritt",
      key: "vermietung"
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: 34,
        fontWeight: 800,
        margin: '28px 0 8px'
      }
    }, "Wie sieht deine ", /*#__PURE__*/React.createElement("em", {
      className: "fx-mark"
    }, "Vermietung"), " aus?"), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 22px',
        color: 'var(--tinte-2)'
      }
    }, "Einfache und mittlere F\xE4lle f\xFChren wir komplett \u2014 nur Sonderf\xE4lle geben wir ehrlich ab."), /*#__PURE__*/React.createElement(Option, {
      gewaehlt: false,
      onClick: () => vermWeiter('einfach')
    }, "Eine vermietete Wohnung, kein Verkauf"), /*#__PURE__*/React.createElement(Option, {
      gewaehlt: false,
      onClick: () => vermWeiter('mehrere')
    }, "Mehrere Wohnungen, ganzj\xE4hrig vermietet"), /*#__PURE__*/React.createElement(Option, {
      gewaehlt: false,
      onClick: () => setI(-3)
    }, "Verkauf oder m\xF6bliert auf Zeit"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setI(FRAGEN.findIndex(x => x.id === 'einkuenfte')),
      style: {
        display: 'block',
        margin: '14px auto 0',
        fontSize: 14,
        textDecoration: 'underline',
        minHeight: 44
      }
    }, "Zur\xFCck zur Frage"));
  }
  /* KAP-Verzweigung (ADR-032) */
  if (i === -5) {
    const kapWeiter = art => {
      const neu = {
        ...antworten,
        kap: art
      };
      setAntworten(neu);
      try {
        localStorage.setItem('funke.interview', JSON.stringify(neu));
      } catch (e) {}
      setI(FRAGEN.findIndex(x => x.id === 'einkuenfte') + 1);
    };
    return /*#__PURE__*/React.createElement("div", {
      className: "fx-schritt",
      key: "kap"
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: 34,
        fontWeight: 800,
        margin: '28px 0 8px'
      }
    }, "Wo liegt dein ", /*#__PURE__*/React.createElement("em", {
      className: "fx-mark"
    }, "Depot"), "?"), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 22px',
        color: 'var(--tinte-2)'
      }
    }, "Deutsche Broker f\xFChren die Steuer selbst ab \u2014 ausl\xE4ndische nicht, da rechnen wir die Anlage KAP komplett f\xFCr dich. Beides geht."), /*#__PURE__*/React.createElement(Option, {
      gewaehlt: false,
      onClick: () => kapWeiter('de')
    }, "Deutscher Broker (z. B. Trade Republic, ING)"), /*#__PURE__*/React.createElement(Option, {
      gewaehlt: false,
      onClick: () => kapWeiter('ausland')
    }, "Ausl\xE4ndischer Broker (z. B. IBKR, Revolut)"), /*#__PURE__*/React.createElement(Option, {
      gewaehlt: false,
      onClick: () => setI(-6)
    }, "Auch Krypto verkauft"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setI(FRAGEN.findIndex(x => x.id === 'einkuenfte')),
      style: {
        display: 'block',
        margin: '14px auto 0',
        fontSize: 14,
        textDecoration: 'underline',
        minHeight: 44
      }
    }, "Zur\xFCck zur Frage"));
  }
  if (i === -6) {
    const weiterOhne = () => {
      const neu = {
        ...antworten,
        kap: 'de',
        kryptoWunsch: '1'
      };
      setAntworten(neu);
      try {
        localStorage.setItem('funke.interview', JSON.stringify(neu));
      } catch (e) {}
      setI(FRAGEN.findIndex(x => x.id === 'einkuenfte') + 1);
    };
    return /*#__PURE__*/React.createElement("div", {
      className: "fx-schritt",
      key: "krypto"
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: 34,
        fontWeight: 800,
        margin: '28px 0 8px'
      }
    }, "Ehrlich: Krypto k\xF6nnen wir ", /*#__PURE__*/React.createElement("em", {
      className: "fx-mark"
    }, "noch"), " nicht."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 10px',
        color: 'var(--tinte-2)'
      }
    }, "Haltefristen, Anschaffungsreihenfolge, private Ver\xE4u\xDFerungsgesch\xE4fte \u2014 das braucht eine eigene Rechenlogik, und halb gerechnet w\xE4re falsch gerechnet."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 22px',
        color: 'var(--tinte-2)'
      }
    }, "Deine Aktien- und ETF-Ertr\xE4ge nehmen wir trotzdem komplett mit \u2014 nur die Krypto-Verk\xE4ufe geh\xF6ren dieses Jahr in andere H\xE4nde."), /*#__PURE__*/React.createElement(Option, {
      gewaehlt: false,
      onClick: weiterOhne
    }, "Vormerken \u2014 Depot ohne Krypto weitermachen"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setI(-5),
      style: {
        display: 'block',
        margin: '14px auto 0',
        fontSize: 14,
        textDecoration: 'underline',
        minHeight: 44
      }
    }, "Zur\xFCck"));
  }

  /* CH-only-Gate (ADR-013) */
  if (i === -4) {
    const schliesse = vormerken => {
      const neu = {
        ...antworten,
        schweiz: 'Nein',
        auslandWunsch: vormerken ? '1' : ''
      };
      setAntworten(neu);
      try {
        localStorage.setItem('funke.interview', JSON.stringify(neu));
      } catch (e) {}
      setI(FRAGEN.length);
    };
    return /*#__PURE__*/React.createElement("div", {
      className: "fx-schritt",
      key: "ausland"
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: 34,
        fontWeight: 800,
        margin: '28px 0 8px'
      }
    }, "Ehrlich: andere L\xE4nder k\xF6nnen wir ", /*#__PURE__*/React.createElement("em", {
      className: "fx-mark"
    }, "noch"), " nicht."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 10px',
        color: 'var(--tinte-2)'
      }
    }, "Jedes Land hat sein eigenes Abkommen mit eigenen Regeln \u2014 \xD6sterreich und Frankreich mit Grenzzonen, Luxemburg mit Bagatellgrenze. Halb gerechnet w\xE4re falsch gerechnet."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 22px',
        color: 'var(--tinte-2)'
      }
    }, "Was heute geht: die ", /*#__PURE__*/React.createElement("b", null, "Schweiz komplett"), " \u2014 und dein restliches Steuerjahr sowieso. \xD6sterreich, Frankreich und Luxemburg stehen auf der Liste."), /*#__PURE__*/React.createElement(Option, {
      gewaehlt: false,
      onClick: () => schliesse(true)
    }, "Vormerken \u2014 sag mir, wenn mein Land kommt"), /*#__PURE__*/React.createElement(Option, {
      gewaehlt: false,
      onClick: () => schliesse(false)
    }, "Ohne Auslands-Teil weitermachen"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setI(FRAGEN.findIndex(x => x.id === 'schweiz')),
      style: {
        display: 'block',
        margin: '14px auto 0',
        fontSize: 14,
        textDecoration: 'underline',
        minHeight: 44
      }
    }, "Zur\xFCck zur Frage"));
  }
  if (i === -3) {
    return /*#__PURE__*/React.createElement("div", {
      className: "fx-schritt",
      key: "vermgate"
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: 34,
        fontWeight: 800,
        margin: '28px 0 8px'
      }
    }, "Ehrlich: Verkauf und M\xF6bliert-auf-Zeit k\xF6nnen wir ", /*#__PURE__*/React.createElement("em", {
      className: "fx-mark"
    }, "noch"), " nicht."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 10px',
        color: 'var(--tinte-2)'
      }
    }, "Ver\xE4u\xDFerungsgewinne und Sonderf\xE4lle brauchen mehr, als Version 1 kann. Eine halbe Anlage V liefern wir nicht."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 22px',
        color: 'var(--tinte-2)'
      }
    }, "Was heute geht: ", /*#__PURE__*/React.createElement("b", null, "alles andere"), " aus deinem Steuerjahr \u2014 die Vermietung l\xE4sst du dieses Jahr beim Profi."), /*#__PURE__*/React.createElement(Option, {
      gewaehlt: false,
      onClick: () => vermWeiter('gate')
    }, "Ohne Vermietung weitermachen"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setI(-2),
      style: {
        display: 'block',
        margin: '14px auto 0',
        fontSize: 14,
        textDecoration: 'underline',
        minHeight: 44
      }
    }, "Zur\xFCck"));
  }
  if (fertig) {
    const summe = schaetzung;
    return /*#__PURE__*/React.createElement("div", {
      className: "fx-schritt",
      key: "fertig"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        margin: '28px 0 6px'
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: 40,
        fontWeight: 800
      }
    }, "Das war's schon."), /*#__PURE__*/React.createElement(Sticker, {
      style: {
        fontSize: 14
      }
    }, "Profil steht")), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 18px',
        color: 'var(--tinte-2)'
      }
    }, "Ein paar Antworten, und dein Steuerjahr hat eine Richtung."), /*#__PURE__*/React.createElement("div", {
      className: "fk-karte nacht"
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono-label",
      style: {
        color: 'var(--funke-hell)'
      }
    }, "Erste Sch\xE4tzung"), /*#__PURE__*/React.createElement("div", {
      className: "num",
      style: {
        fontFamily: 'var(--schrift-display)',
        fontWeight: 800,
        fontSize: 48,
        color: 'var(--funke)',
        lineHeight: 1.05
      }
    }, "\u2248 ", summe.toLocaleString('de-DE'), " \u20AC"), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '6px 0 0',
        fontSize: 13,
        opacity: 0.75
      }
    }, summe < 300 ? 'Ehrlich: viel ist bei dir nicht zu holen — dafür bist du in Minuten fertig.' : 'Noch grob — jeder Beleg macht sie genauer.')), antworten.eulenOptIn !== '0' && /*#__PURE__*/React.createElement("div", {
      className: "fk-karte",
      "data-ai": "true",
      style: {
        borderColor: 'var(--ki)',
        margin: '0 0 14px',
        textAlign: 'left'
      }
    }, antworten.eulenOptIn === '1' ? /*#__PURE__*/React.createElement("p", {
      style: {
        margin: 0,
        fontSize: 14
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        color: 'var(--ki)'
      }
    }, "Eulen-Modus ist an."), " Ich lese Rechts\xE4nderungen, finde L\xFCcken und frage nach \u2014 du entscheidest immer. Abschalten geht im Profil.") : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 10px',
        fontSize: 14
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        color: 'var(--ki)'
      }
    }, "Soll ich ab jetzt mitdenken?"), " Ich lese Rechts\xE4nderungen, finde L\xFCcken und melde mich, wenn Geld liegen bleibt \u2014 du entscheidest immer."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variante: "leise",
      style: {
        minHeight: 42,
        width: 'auto',
        fontSize: 13
      },
      onClick: () => {
        if (window.funkeSetEulenAn) window.funkeSetEulenAn(true);
        setAntworten({
          ...antworten,
          eulenOptIn: '1'
        });
      }
    }, "Ja, denk mit"), /*#__PURE__*/React.createElement(Button, {
      variante: "ghost",
      style: {
        minHeight: 42,
        width: 'auto',
        fontSize: 13
      },
      onClick: () => setAntworten({
        ...antworten,
        eulenOptIn: '0'
      })
    }, "Sp\xE4ter")))), /*#__PURE__*/React.createElement(Button, {
      onClick: onFertig
    }, "Ins Cockpit \u2192"), /*#__PURE__*/React.createElement(Button, {
      variante: "ghost",
      style: {
        marginTop: 10
      },
      onClick: () => {
        setI(0);
        setAntworten({});
        setKm('');
      }
    }, "Nochmal durchgehen"));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-schritt",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 0 22px'
    }
  }, i > 0 ? /*#__PURE__*/React.createElement("button", {
    onClick: () => setI(i - 1),
    "aria-label": "Zur\xFCck",
    style: {
      width: 44,
      height: 44,
      border: 'var(--kontur) solid var(--tinte)',
      borderRadius: 999,
      background: 'var(--karte)',
      boxShadow: 'var(--schatten-hart-s)',
      fontWeight: 800,
      flex: 'none'
    }
  }, "\u2190") : /*#__PURE__*/React.createElement("img", {
    src: "../../assets/marke-tinte.svg",
    width: "34",
    height: "34",
    alt: "SteuerEule"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flex: 1
    },
    role: "progressbar",
    "aria-valuenow": i + 1,
    "aria-valuemin": 1,
    "aria-valuemax": FRAGEN.length
  }, FRAGEN.map((x, n) => /*#__PURE__*/React.createElement("i", {
    key: n,
    style: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      border: '1.5px solid var(--tinte)',
      background: n <= i ? 'var(--funke)' : 'var(--karte)',
      transition: 'background var(--t-flott)'
    }
  }))), /*#__PURE__*/React.createElement(Pill, null, i + 1, "/", FRAGEN.length)), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 34,
      fontWeight: 800,
      marginBottom: 8
    }
  }, f.frage), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 22px',
      color: 'var(--tinte-2)'
    }
  }, f.hilfe), f.optionen && f.optionen.map((o, idx) => /*#__PURE__*/React.createElement(Option, {
    key: o,
    gewaehlt: antworten[f.id] === o,
    onClick: () => antworte(idx, o)
  }, o)), f.eingabe === 'km' && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    value: km,
    onChange: v => setKm(v.replace(/\D/g, '').slice(0, 3)),
    placeholder: "28",
    inputMode: "numeric",
    autoFocus: true,
    style: {
      fontFamily: 'var(--schrift-mono)',
      fontSize: 26,
      width: 120,
      textAlign: 'center'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 18
    }
  }, "km")), /*#__PURE__*/React.createElement(Button, {
    onClick: kmWeiter,
    disabled: !km,
    style: {
      marginTop: 18
    }
  }, "Weiter")), f.eingabe === 'tage' && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mono-label",
    style: {
      marginBottom: 8
    }
  }, "Deine Woche"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      marginBottom: 16
    }
  }, [['5-Tage-Woche', '5'], ['4-Tage-Woche', '4'], ['3-Tage-Woche', '3']].map(([l, v]) => /*#__PURE__*/React.createElement(Chip, {
    key: v,
    aktiv: wochen === v,
    onClick: () => setWochen(v)
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      display: 'block',
      marginBottom: 6
    }
  }, "Urlaubstage"), /*#__PURE__*/React.createElement(Input, {
    value: urlaub,
    onChange: v => setUrlaub(v.replace(/\D/g, '').slice(0, 2)),
    placeholder: "30",
    inputMode: "numeric",
    autoFocus: true,
    style: {
      fontFamily: 'var(--schrift-mono)',
      fontSize: 22,
      textAlign: 'center',
      width: '100%'
    }
  })), /*#__PURE__*/React.createElement("label", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      display: 'block',
      marginBottom: 6
    }
  }, "Krankheitstage"), /*#__PURE__*/React.createElement(Input, {
    value: krank,
    onChange: v => setKrank(v.replace(/\D/g, '').slice(0, 2)),
    placeholder: "0",
    inputMode: "numeric",
    style: {
      fontFamily: 'var(--schrift-mono)',
      fontSize: 22,
      textAlign: 'center',
      width: '100%'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    "aria-live": "polite"
  }, [['Werktage 2026 (' + wochen + '-Tage-Woche)', WERK[wochen]], ['− Feiertage auf Werktagen', '−' + FEI[wochen]], ['− Urlaub', '−' + (parseInt(urlaub, 10) || 0)], ['− Krankheit', '−' + (parseInt(krank, 10) || 0)]].map(([l, w]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      borderBottom: '1.5px dashed var(--linie-weich)',
      padding: '6px 0',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--tinte-2)'
    }
  }, l), /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, w))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 0 2px'
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 14
    }
  }, "Deine Arbeitstage"), /*#__PURE__*/React.createElement("span", {
    className: "fk-sticker num",
    style: {
      fontSize: 15
    }
  }, arbeitstage)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 0',
      fontSize: 12,
      color: 'var(--tinte-2)'
    }
  }, "Feiertage: bundesweiter Schnitt \u2014 dein Bundesland pr\xE4zisiert das sp\xE4ter im Profil. Jede Zahl bleibt \xE4nderbar.")), /*#__PURE__*/React.createElement(Button, {
    onClick: tageWeiter,
    disabled: urlaub === '',
    style: {
      marginTop: 4
    }
  }, arbeitstage, " Arbeitstage \xFCbernehmen")), delta > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 90,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement(Sticker, {
    key: delta
  }, "\u2248 +", delta, " \u20AC drin")));
}
Object.assign(window, {
  FunkeInterview
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Interview.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/JahrDetail.jsx
try { (() => {
/* Versiegeltes Steuerjahr — eingereicht = Rechtsdokument, nur lesen.
   Muster: bekanntes Übertragen-Layout im Fakten-Modus (Papier-Ton, keine Affordanzen),
   Toast erklärt genau dann, wenn jemand ändern will. Korrektur = neue Fassung, nie Edit. */
const {
  Button,
  Chip,
  Pill,
  HerkunftsChip,
  Sheet,
  Toast,
  Sticker,
  Begriff
} = window.FinanzoFunkeDesignSystem_7e417e;
const JAHR_2025 = {
  jahr: 2025,
  eingereicht: '12.03.2026',
  bescheid: '28.04.2026',
  erstattung: '1.212,00 €',
  zeilen: [{
    anlage: 'Anlage N',
    zeile: '31',
    label: 'Bruttoarbeitslohn',
    wert: '52.100,00 €',
    quelle: {
      beleg: 'Lohnsteuerbescheinigung 2025',
      regel: 'MAP-N-31 · Stand 2025'
    }
  }, {
    anlage: 'Anlage N',
    zeile: '44',
    label: 'Fortbildungskosten',
    wert: '640,00 €',
    quelle: {
      beleg: 'Rechnung Konferenz-Ticket',
      regel: 'WK-FORT-02'
    }
  }, {
    anlage: 'Anlage N',
    zeile: '45',
    label: 'Entfernungspauschale',
    wert: '1.764,00 €',
    quelle: {
      beleg: 'Interview: 210 Arbeitstage',
      regel: 'WK-PENDLER-01',
      rechenweg: '210 × 28 km × 0,30 €'
    }
  }, {
    anlage: 'Anlage N',
    zeile: '46',
    label: 'Homeoffice-Pauschale',
    wert: '624,00 €',
    quelle: {
      regel: 'HO-PAUSCH-25',
      rechenweg: '104 Tage × 6 €'
    }
  }, {
    anlage: 'Vorsorgeaufwand',
    zeile: '4',
    label: 'Kranken-/Pflegeversicherung',
    wert: '5.740,00 €',
    quelle: {
      beleg: 'Lohnsteuerbescheinigung 2025, Zeile 25/26',
      regel: 'VORS-KV-01'
    }
  }, {
    anlage: 'Vorsorgeaufwand',
    zeile: '8',
    label: 'Rentenversicherung',
    wert: '4.846,00 €',
    quelle: {
      beleg: 'Lohnsteuerbescheinigung 2025, Zeile 23',
      regel: 'VORS-RV-01'
    }
  }, {
    anlage: 'Sonderausgaben',
    zeile: '5',
    label: 'Spenden (DRK)',
    wert: '120,00 €',
    quelle: {
      beleg: 'Spendenquittung DRK',
      regel: 'SA-SPENDE-01'
    }
  }, {
    anlage: 'Anlage N-Gre',
    zeile: 'GG-1',
    label: 'Nichtrückkehrtage',
    wert: '9',
    quelle: {
      regel: 'GG-NRT-60 · DBA Schweiz',
      rechenweg: 'Tracker: 9 markierte Tage'
    }
  }, {
    anlage: 'Anlage N-Gre',
    zeile: 'GG-2',
    label: 'Bruttolohn Schweiz',
    wert: '94.146,00 €',
    quelle: {
      beleg: 'Lohnausweis 2025',
      regel: 'GG-KURS-2025 · amtl. Kurs',
      rechenweg: '88.400 CHF × 1,065 (100 CHF = 106,50 €)'
    }
  }],
  belege: [{
    name: 'Lohnsteuerbescheinigung 2025',
    ziel: 'Anlage N · Zeilen 31–46'
  }, {
    name: 'Rechnung Konferenz-Ticket',
    ziel: 'Anlage N · Zeile 44'
  }, {
    name: 'BahnCard 50',
    ziel: 'Anlage N · Zeile 45'
  }, {
    name: 'Spendenquittung DRK',
    ziel: 'Sonderausgaben · Zeile 5'
  }, {
    name: 'GG-Tracker-Export 2025',
    ziel: 'Anlage N-Gre · GG-1'
  }]
};
function FunkeJahrDetail({
  onZurueck,
  onFrage
}) {
  const d = JAHR_2025;
  const [ansicht, setAnsicht] = React.useState('zeilen');
  const anlagen = [...new Set(d.zeilen.map(z => z.anlage))];
  const [anlage, setAnlage] = React.useState(anlagen[0]);
  const [detailZeile, setDetailZeile] = React.useState(null);
  const [korrekturOffen, setKorrekturOffen] = React.useState(false);
  const [toast, setToast] = React.useState('');
  function zeigeToast(t) {
    setToast(t);
    setTimeout(() => setToast(''), 1800);
  }
  function kopieren(wert) {
    try {
      navigator.clipboard.writeText(wert);
    } catch (e) {}
    zeigeToast('Kopiert');
  }
  const sichtbar = d.zeilen.filter(z => z.anlage === anlage);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "appbar",
    style: {
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onZurueck,
    "aria-label": "Zur\xFCck",
    style: {
      width: 44,
      height: 44,
      border: 'var(--kontur) solid var(--tinte)',
      borderRadius: 999,
      background: 'var(--karte)',
      boxShadow: 'var(--schatten-hart-s)',
      fontWeight: 800,
      flex: 'none'
    }
  }, "\u2190"), /*#__PURE__*/React.createElement("h1", {
    className: "num",
    style: {
      marginRight: 'auto'
    }
  }, d.jahr), /*#__PURE__*/React.createElement(Pill, null, "Eingereicht \xB7 ", d.eingereicht)), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      background: 'var(--papier, var(--grund))'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, /*#__PURE__*/React.createElement(Begriff, {
    titel: "Fassung 1",
    erklaerung: "Fassung 1 ist dein Original beim Amt. Stell sie dir wie ein abgeschicktes Paket vor: Du kannst reinschauen, aber nicht mehr umpacken. Willst du etwas \xE4ndern, schicken wir ein zweites Paket hinterher \u2014 Fassung 2. So wei\xDFt du immer, was das Amt wirklich hat.",
    beispiel: "Beleg im November gefunden \u2192 Fassung 2, 5 Minuten",
    frage: "Warum kann ich Fassung 1 nicht \xE4ndern?",
    onFrage: onFrage
  }, "Fassung 1"), ' ', "\u2014 beim Finanzamt"), /*#__PURE__*/React.createElement(Sticker, {
    style: {
      fontSize: 13
    }
  }, "\u2713 ausgezahlt")), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 40,
      lineHeight: 1.1,
      margin: '6px 0 2px'
    }
  }, d.erstattung), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Eingereicht am ", d.eingereicht, " \xB7 Bescheid vom ", d.bescheid, " \u2014 wie berechnet, keine Abweichung.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      margin: '4px 0 16px'
    },
    role: "tablist",
    "aria-label": "Ansicht w\xE4hlen"
  }, /*#__PURE__*/React.createElement(Chip, {
    aktiv: ansicht === 'zeilen',
    onClick: () => setAnsicht('zeilen')
  }, "Zeilen (", d.zeilen.length, ")"), /*#__PURE__*/React.createElement(Chip, {
    aktiv: ansicht === 'belege',
    onClick: () => setAnsicht('belege')
  }, "Belege (", d.belege.length, ")")), ansicht === 'zeilen' && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 16,
      overflowX: 'auto',
      scrollbarWidth: 'none'
    },
    role: "tablist",
    "aria-label": "Anlage w\xE4hlen"
  }, anlagen.map(a => /*#__PURE__*/React.createElement(Chip, {
    key: a,
    aktiv: a === anlage,
    onClick: () => setAnlage(a),
    style: {
      flex: 'none'
    }
  }, a))), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      background: 'var(--papier, var(--grund))'
    }
  }, sichtbar.map(z => /*#__PURE__*/React.createElement("div", {
    key: z.zeile,
    style: {
      borderBottom: '1.5px solid var(--linie-weich)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-mono)',
      fontSize: 12,
      color: 'var(--tinte-2)',
      width: 46,
      flex: 'none'
    }
  }, z.zeile), /*#__PURE__*/React.createElement("button", {
    onClick: () => setDetailZeile(detailZeile === z.zeile ? null : z.zeile),
    "aria-expanded": detailZeile === z.zeile,
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 14,
      textAlign: 'left',
      overflowWrap: 'break-word'
    }
  }, z.label, " ", /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: 'var(--tinte-2)',
      fontSize: 12
    }
  }, detailZeile === z.zeile ? '▾' : '▸')), /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      fontSize: 15,
      whiteSpace: 'nowrap'
    }
  }, z.wert), /*#__PURE__*/React.createElement("button", {
    onClick: () => kopieren(z.wert),
    "aria-label": `${z.label} kopieren`,
    style: {
      width: 42,
      height: 42,
      border: '1.5px solid var(--linie-weich)',
      borderRadius: 12,
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--karte)'
    }
  }, "\u29C9")), detailZeile === z.zeile && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 0 12px 56px'
    }
  }, /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: z.quelle
  })))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      margin: '10px 0 0'
    }
  }, "Alle Werte sind Fakten \u2014 so liegen sie beim Amt. Zeile antippen zeigt die Herkunft, Kopieren geht immer."))), ansicht === 'belege' && /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      padding: 0,
      overflow: 'hidden',
      background: 'var(--papier, var(--grund))'
    }
  }, d.belege.map((b, n) => /*#__PURE__*/React.createElement("button", {
    key: b.name,
    onClick: () => zeigeToast(`${d.jahr} ist eingereicht — Belege nur lesen`),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      textAlign: 'left',
      padding: '12px 16px',
      borderTop: n > 0 ? '1.5px solid var(--linie-weich)' : 'none',
      minHeight: 52
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ok)',
      fontWeight: 800,
      flex: 'none'
    },
    "aria-hidden": "true"
  }, "\u2713"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 14,
      overflowWrap: 'break-word'
    }
  }, b.name), /*#__PURE__*/React.createElement(Chip, {
    variante: "src",
    style: {
      minHeight: 28,
      fontSize: 12,
      flex: 'none'
    }
  }, b.ziel)))), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    onClick: () => setKorrekturOffen(true)
  }, "Nachtr\xE4glich korrigieren"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      textAlign: 'center'
    }
  }, "Eingereicht ist eingereicht \u2014 \xC4nderungen gehen als neue Fassung ans Amt, nie still in die App."), korrekturOffen && /*#__PURE__*/React.createElement(Sheet, {
    titel: "Nachtr\xE4glich korrigieren",
    onClose: () => setKorrekturOffen(false)
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 0,
      fontSize: 14
    }
  }, "Fassung 1 bleibt unver\xE4ndert \u2014 genau so, wie sie beim Finanzamt liegt. Eine Korrektur erzeugt ", /*#__PURE__*/React.createElement("b", null, "Fassung 2"), " mit sichtbarem Unterschied zu Fassung 1."), [['Beleg vergessen?', 'Berichtigung nach § 153 AO — geht formlos ans Finanzamt, wir bereiten sie vor.'], ['Bescheid falsch?', 'Einspruch binnen eines Monats nach Bescheid — den Entwurf schreibt der Bescheid-Vergleich.']].map(([was, wie]) => /*#__PURE__*/React.createElement("div", {
    key: was,
    style: {
      borderBottom: '1.5px solid var(--linie-weich)',
      padding: '10px 0'
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 14
    }
  }, was), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, wie))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)'
    }
  }, "Ehrlich: F\xFCr 2025 ist die Einspruchsfrist vorbei \u2014 es bleibt die Berichtigung, und nur wenn sich wirklich etwas ge\xE4ndert hat."), /*#__PURE__*/React.createElement(Button, {
    onClick: () => {
      setKorrekturOffen(false);
      zeigeToast('Demo — Berichtigung würde Fassung 2 anlegen');
    }
  }, "Berichtigung vorbereiten"), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      marginTop: 10
    },
    onClick: () => setKorrekturOffen(false)
  }, "Abbrechen")), toast && /*#__PURE__*/React.createElement(Toast, {
    text: toast
  }));
}
Object.assign(window, {
  FunkeJahrDetail
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/JahrDetail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/JahrTab.jsx
try { (() => {
/* Jahr-Tab — der Phasen-Ort: Stepper (Interview → Sammeln → Übertragen → Abgegeben → Bescheid),
   Schnellzugriff Statistik/Alle Jahre, darunter der Inhalt der gewählten Phase. */
const {
  Chip,
  Toast
} = window.FinanzoFunkeDesignSystem_7e417e;
const JAHR_PHASEN = [{
  id: 'interview',
  label: 'Interview'
}, {
  id: 'sammeln',
  label: 'Sammeln'
}, {
  id: 'uebertragen',
  label: 'Übertragen'
}, {
  id: 'abgegeben',
  label: 'Abgegeben'
}, {
  id: 'bescheid',
  label: 'Bescheid'
}];
function FunkeJahrTab({
  zeilen,
  onToggle,
  geheZu
}) {
  const [fortschritt, setFortschritt] = React.useState(() => {
    try {
      return localStorage.getItem('funke.jahrPhase') || 'uebertragen';
    } catch (e) {
      return 'uebertragen';
    }
  });
  const [ansicht, setAnsicht] = React.useState(fortschritt === 'abgegeben' ? 'abgegeben' : 'uebertragen');
  const [rueckfrage, setRueckfrage] = React.useState('offen'); /* ADR-018: Rückfrage-Zustand nach Abgabe (Demo) */
  const [hinweis, setHinweis] = React.useState(''); /* Inline statt Toast: Lernstoff darf nicht nach 2 s verschwinden */
  const fIdx = JAHR_PHASEN.findIndex(p => p.id === fortschritt);
  function abgeschickt() {
    setFortschritt('abgegeben');
    setAnsicht('abgegeben');
    try {
      localStorage.setItem('funke.jahrPhase', 'abgegeben');
    } catch (e) {}
  }
  function klick(p, idx) {
    if (idx > fIdx) {
      setHinweis(p.id === 'bescheid' ? 'Der Bescheid kommt in 4–8 Wochen nach der Abgabe — wir vergleichen ihn dann Zeile für Zeile mit deiner Erklärung.' : 'Dieser Schritt öffnet sich nach der Abgabe.');
      return;
    }
    setHinweis('');
    if (p.id === 'interview') {
      window.location.href = 'interview.html';
      return;
    }
    if (p.id === 'sammeln') {
      geheZu('belege');
      return;
    }
    setAnsicht(p.id);
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      padding: '14px 16px 10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, "Steuerjahr 2026"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Chip, {
    onClick: () => geheZu('statistik'),
    style: {
      minHeight: 32,
      fontSize: 12
    }
  }, "Statistik"), /*#__PURE__*/React.createElement(Chip, {
    onClick: () => geheZu('jahre'),
    style: {
      minHeight: 32,
      fontSize: 12
    }
  }, "Alle Jahre"))), /*#__PURE__*/React.createElement("div", {
    className: "fx-stepper",
    role: "tablist",
    "aria-label": "Phasen des Steuerjahrs"
  }, JAHR_PHASEN.map((p, idx) => {
    const done = idx < fIdx;
    const aktuell = idx === fIdx;
    const offen = idx > fIdx;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: p.id
    }, idx > 0 && /*#__PURE__*/React.createElement("span", {
      className: "fx-step-linie",
      "data-offen": idx > fIdx,
      "aria-hidden": "true"
    }), /*#__PURE__*/React.createElement("button", {
      className: "fx-step",
      role: "tab",
      "aria-selected": ansicht === p.id || aktuell && ansicht === 'uebertragen' && p.id === 'uebertragen',
      "aria-disabled": offen,
      onClick: () => klick(p, idx)
    }, /*#__PURE__*/React.createElement("span", {
      className: "fx-step-kreis",
      "data-done": done,
      "data-aktuell": aktuell,
      "data-offen": offen
    }, done ? '✓' : idx + 1), /*#__PURE__*/React.createElement("span", {
      className: "fx-step-label",
      style: {
        fontWeight: aktuell ? 800 : 600,
        color: offen ? 'var(--tinte-2)' : 'var(--tinte)'
      }
    }, p.label)));
  })), hinweis && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'baseline',
      borderTop: '1.5px dashed var(--linie-weich)',
      marginTop: 10,
      padding: '10px 2px 2px',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, hinweis), /*#__PURE__*/React.createElement("button", {
    onClick: () => setHinweis(''),
    "aria-label": "Hinweis schlie\xDFen",
    style: {
      fontWeight: 800,
      color: 'var(--tinte)',
      minHeight: 32,
      padding: '0 6px',
      flex: 'none'
    }
  }, "\xD7"))), ansicht === 'abgegeben' ? /*#__PURE__*/React.createElement("div", null, rueckfrage === 'offen' ? /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      borderColor: 'var(--warn)',
      boxShadow: '4px 4px 0 var(--warn)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--warn)'
    }
  }, "R\xFCckfrage vom Finanzamt"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 22,
      lineHeight: 1.15,
      margin: '6px 0'
    }
  }, "Das Amt will die Fortbildung sehen."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 10px',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Nachweis \u201ERechnung Fortbildung\" (890 \u20AC) nachreichen \xB7 Frist: ", /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, "14 Tage"), ". Ganz normal \u2014 dein Bescheid kommt, sobald der Beleg da ist."), /*#__PURE__*/React.createElement("button", {
    onClick: () => setRueckfrage('erledigt'),
    className: "fk-btn fk-btn-leise",
    style: {
      minHeight: 42,
      width: 'auto',
      padding: '0 16px',
      fontWeight: 700,
      border: 'var(--kontur) solid var(--tinte)',
      borderRadius: 12,
      background: 'var(--funke)',
      boxShadow: 'var(--schatten-hart-s)'
    }
  }, "Beleg nachreichen (liegt schon in Belege)")) : /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ok)',
      fontWeight: 800
    },
    "aria-hidden": "true"
  }, "\u2713"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, "R\xFCckfrage beantwortet \u2014 der Nachweis ist beim Amt, der Bescheid l\xE4uft weiter.")), /*#__PURE__*/React.createElement(FunkeAbgabe, {
    onZurueck: () => setAnsicht('uebertragen')
  })) : /*#__PURE__*/React.createElement(FunkeUebertragen, {
    zeilen: zeilen,
    onToggle: onToggle,
    onAbgabe: abgeschickt
  }));
}
Object.assign(window, {
  FunkeJahrTab
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/JahrTab.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Jahre.jsx
try { (() => {
/* Steuerjahre — Archiv + Vorjahresübernahme + Rückjahre (ADR-021/022) + Extern erledigt (ADR-018). */
const {
  Button,
  Chip,
  Pill,
  Sticker,
  Sheet
} = window.FinanzoFunkeDesignSystem_7e417e;
const ARCHIV_JAHRE = [{
  jahr: 2025,
  status: 'Bescheid da',
  erstattung: '1.212,00 €',
  fertig: true
}, {
  jahr: 2024,
  status: 'Bescheid da',
  erstattung: '987,00 €',
  fertig: true
}, {
  jahr: 2023,
  status: 'Extern erledigt',
  erstattung: '810,00 €',
  extern: true
}, {
  jahr: 2022,
  status: 'Extern erledigt',
  erstattung: '640,00 €',
  extern: true
}];
function FunkeJahre({
  onWeiter,
  onZurueck,
  onJahr
}) {
  const [uebernahmeOffen, setUebernahmeOffen] = React.useState(false);
  const [uebernommen, setUebernommen] = React.useState(false);
  const [vastOffen, setVastOffen] = React.useState(false);
  const [vastStatus, setVastStatus] = React.useState('');
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "appbar"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, onZurueck ? /*#__PURE__*/React.createElement("button", {
    onClick: onZurueck,
    "aria-label": "Zur\xFCck",
    style: {
      width: 44,
      height: 44,
      border: '1.5px solid var(--linie-weich)',
      borderRadius: 999,
      background: 'var(--karte)',
      fontWeight: 800
    }
  }, "\u2190") : /*#__PURE__*/React.createElement("a", {
    href: "index.html",
    "aria-label": "Zur\xFCck zur App",
    style: {
      width: 44,
      height: 44,
      border: '1.5px solid var(--linie-weich)',
      borderRadius: 999,
      background: 'var(--karte)',
      fontWeight: 800,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textDecoration: 'none',
      color: 'inherit'
    }
  }, "\u2190"), /*#__PURE__*/React.createElement("h1", null, "Steuerjahre")), /*#__PURE__*/React.createElement(Pill, null, "5 Jahre")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte nacht"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--funke-hell)'
    }
  }, "Neu: Steuerjahr 2026"), uebernommen && /*#__PURE__*/React.createElement(Sticker, {
    style: {
      fontSize: 13
    }
  }, "80 % vorausgef\xFCllt")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 34,
      lineHeight: 1.1,
      margin: '8px 0 6px',
      color: 'var(--nacht-text)'
    }
  }, uebernommen ? 'Fast fertig, bevor du anfängst.' : 'Alles wie letztes Jahr?'), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 14px',
      fontSize: 14,
      opacity: 0.8
    }
  }, uebernommen ? 'Arbeitgeber, Weg, Homeoffice und Bankverbindung sind übernommen — alles Übernommene ist grau markiert und gilt als unbestätigt, bis du es antippst oder ein Beleg es deckt.' : 'Wir übernehmen Stammdaten, Arbeitsweg, Homeoffice-Muster und wiederkehrende Belege aus 2025 — du bestätigst nur, was sich geändert hat.'), uebernommen ? /*#__PURE__*/React.createElement(Button, {
    onClick: onWeiter
  }, "Weiter im Cockpit \u2192") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    style: {
      width: 'auto'
    },
    onClick: () => setUebernahmeOffen(true)
  }, "Aus 2025 \xFCbernehmen"), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      width: 'auto',
      background: 'transparent',
      borderColor: 'var(--funke)',
      color: 'var(--nacht-text)'
    },
    onClick: onWeiter
  }, "Leer starten"))), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("b", null, "Vorausgef\xFCllte Erkl\xE4rung"), vastStatus ? /*#__PURE__*/React.createElement(Chip, {
    variante: "src"
  }, vastStatus) : /*#__PURE__*/React.createElement(Chip, {
    onClick: () => setVastOffen(true)
  }, "Vom Finanzamt abrufen")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Lohn, Versicherungsbeitr\xE4ge und Lohnersatz direkt aus der Finanzverwaltung \u2014 statt Abtippen.")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("b", null, "Bis zu 4 Jahre r\xFCckwirkend"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--ok)',
      fontWeight: 700
    }
  }, "\u2713 alles drin")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Ohne Abgabepflicht kannst du freiwillig bis 2022 zur\xFCck \u2014 oft mehrere Erstattungen auf einmal. Bei dir: 2022\u20132025 sind erledigt. Jedes Jahr rechnet mit seinen eigenen Pauschalen.")), window.funkeEulenAn && window.funkeEulenAn() && /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    "data-ai": "true",
    style: {
      borderColor: 'var(--ki)',
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 14
    }
  }, "Neues Urteil betrifft dein Jahr 2025"), /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      color: 'var(--ki)',
      flex: 'none'
    }
  }, "+85 \u20AC")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Ein Einspruch ist m\xF6glich. Frist: ", /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, "18.08.2026"), ". Ich habe alles vorbereitet \u2014 du entscheidest. ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault()
  }, "Zur Quelle"))), /*#__PURE__*/React.createElement("div", {
    className: "mono-label",
    style: {
      margin: '6px 0 8px'
    }
  }, "Archiv"), ARCHIV_JAHRE.map(j => j.extern ? /*#__PURE__*/React.createElement("div", {
    key: j.jahr,
    className: "fk-karte",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 24,
      flex: 'none',
      color: 'var(--tinte-2)'
    }
  }, j.jahr), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 14
    }
  }, "Extern erledigt"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Selbst \xFCber ELSTER abgegeben \xB7 Erstattung: ", /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, j.erstattung))), /*#__PURE__*/React.createElement(Chip, {
    variante: "src",
    style: {
      minHeight: 28,
      fontSize: 12,
      flex: 'none'
    }
  }, "Archiv")) : /*#__PURE__*/React.createElement("button", {
    key: j.jahr,
    onClick: () => onJahr ? onJahr(j.jahr) : window.location.href = 'jahr-2025.html',
    className: "fk-karte",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 24,
      flex: 'none'
    }
  }, j.jahr), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 14,
      color: 'var(--ok)'
    }
  }, "\u2713 ", j.status), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Erstattung: ", /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, j.erstattung))), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      fontWeight: 800,
      flex: 'none'
    }
  }, "\u2192"))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      textAlign: 'center'
    }
  }, "Abgeschlossene Jahre sind versiegelt \u2014 lesen, kopieren, exportieren; \xE4ndern nur als Berichtigung."), vastOffen && /*#__PURE__*/React.createElement(Sheet, {
    titel: "Datenabruf beim Finanzamt",
    onClose: () => setVastOffen(false)
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 0,
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Das liefert die Finanzverwaltung automatisch:"), ['Lohnsteuerbescheinigung(en)', 'Kranken-, Pflege- und Rentenbeiträge', 'Lohnersatzleistungen (z. B. Elterngeld)', 'Kirchensteuer'].map(w => /*#__PURE__*/React.createElement("div", {
    key: w,
    style: {
      borderBottom: '1.5px solid var(--linie-weich)',
      padding: '10px 0',
      fontSize: 14
    }
  }, w)), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)'
    }
  }, "Ehrlich: Die Freischaltung dauert einmalig bis zu 2 Wochen \u2014 das Finanzamt schickt dir einen Brief. Danach kommt jedes Jahr alles automatisch."), /*#__PURE__*/React.createElement(Button, {
    onClick: () => {
      setVastStatus('Beantragt — Brief unterwegs (Demo)');
      setVastOffen(false);
    }
  }, "Abruf beantragen")), uebernahmeOffen && /*#__PURE__*/React.createElement(Sheet, {
    titel: "Aus 2025 \xFCbernehmen",
    onClose: () => setUebernahmeOffen(false)
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 0,
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Das \xFCbernehmen wir \u2014 jede Position bleibt einzeln \xE4nderbar:"), [['Stammdaten & IBAN', 'unverändert übernommen'], ['Arbeitgeber + Arbeitsweg (28 km)', 'bestätigen, falls gleich'], ['Homeoffice-Muster (2 Tage/Woche)', 'bestätigen, falls gleich'], ['Wiederkehrende Belege (BahnCard, Spenden)', 'als Erinnerung angelegt']].map(([was, wie]) => /*#__PURE__*/React.createElement("div", {
    key: was,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      borderBottom: '1.5px solid var(--linie-weich)',
      padding: '10px 0',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      minWidth: 0
    }
  }, was), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--tinte-2)',
      flex: 'none'
    }
  }, wie))), /*#__PURE__*/React.createElement(Button, {
    style: {
      marginTop: 14
    },
    onClick: () => {
      setUebernommen(true);
      setUebernahmeOffen(false);
    }
  }, "\xDCbernehmen \u2014 80 % vorausgef\xFCllt")));
}
Object.assign(window, {
  FunkeJahre
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Jahre.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Lebenslagen.jsx
try { (() => {
/* Lebenslagen-Katalog (ADR-031/035/036) — 10 kuratierte Einträge, jeder mit echtem Flow.
   Highlights: Abfindungs-Rechner (Fünftelregelung, Vorher/Nachher) + agB-Live-Schwelle. */
const {
  Button,
  Chip,
  Pill,
  Input,
  Sheet,
  Toast,
  Balken,
  HerkunftsChip,
  Sticker,
  Begriff
} = window.FinanzoFunkeDesignSystem_7e417e;
const LAGEN = [{
  id: 'dhf',
  titel: 'Zwei Wohnungen wegen des Jobs',
  amt: 'Doppelte Haushaltsführung',
  text: 'Miete der Zweitwohnung (bis 1.000 €/Monat), eine Heimfahrt pro Woche, drei Monate Verpflegungspauschale.'
}, {
  id: 'umzug',
  titel: 'Beruflich umgezogen',
  amt: 'Umzugskostenpauschale',
  text: 'Pauschale ohne Einzelbelege — plus Speditions- und Fahrtkosten mit Beleg.'
}, {
  id: 'abfindung',
  titel: 'Abfindung bekommen',
  amt: 'Fünftelregelung · § 34 EStG',
  rechner: 'abfindung',
  text: 'Seit 2025 gibt es die Ermäßigung NUR noch über die Steuererklärung — wer sie verpasst, verschenkt oft vierstellig.'
}, {
  id: 'lohnersatz',
  titel: 'Elterngeld, Kurzarbeit oder Krankengeld',
  amt: 'Progressionsvorbehalt',
  text: 'Steuerfrei — hebt aber deinen Steuersatz. Wir rechnen den Effekt in deine Spanne ein, damit der Bescheid dich nicht überrascht.'
}, {
  id: 'nebenjob',
  titel: 'Nebenjob oder Minijob',
  amt: 'Zweites Arbeitsverhältnis',
  text: 'Minijob (556 €): steuerfrei, taucht nirgends auf — nichts zu tun. Zweitjob auf Klasse 6: Lohnsteuerbescheinigung einfach mit reinwerfen.'
}, {
  id: 'krankheit',
  titel: 'Hohe Krankheitskosten',
  amt: 'Außergewöhnliche Belastung',
  rechner: 'agb',
  text: 'Zahnarzt, Brille, Zuzahlungen — zählt erst über deiner zumutbaren Grenze. Wir zeigen sie dir live.'
}, {
  id: 'pausch',
  titel: 'Behinderung oder Pflege',
  amt: 'Pauschbeträge § 33b EStG',
  text: 'Grad der Behinderung eintragen — der Pauschbetrag (620–7.400 €) kommt ohne Einzelbelege.'
}, {
  id: 'unterhalt',
  titel: 'Unterhalt an Angehörige',
  amt: 'Anlage Unterhalt',
  text: 'Bis 12.096 € je unterstützter Person — eigenes Einkommen der Person wird gegengerechnet.'
}, {
  id: 'riester',
  titel: 'Riester oder Rürup',
  amt: 'Anlage AV / Vorsorgeaufwand',
  text: 'Beiträge aus der Jahresbescheinigung — Zulagen und Sonderausgabenabzug rechnen wir gegeneinander.'
}, {
  id: 'kirche',
  titel: 'Kirchensteuer & große Spenden',
  amt: 'Sonderausgaben + Vortrag',
  text: 'Gezahlte Kirchensteuer voll absetzbar; Spenden über 20 % vom Einkommen wandern automatisch ins nächste Jahr.'
}];
function FunkeLebenslagen({
  onZurueck,
  onBerater
}) {
  const [suche, setSuche] = React.useState('');
  const [offen, setOffen] = React.useState(null);
  const [toast, setToast] = React.useState('');
  const [aktiv, setAktiv] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem('funke.lebenslagen')) || [];
    } catch (e) {
      return [];
    }
  });
  /* Abfindungs-Rechner */
  const [abf, setAbf] = React.useState('24000');
  const abfN = parseInt(abf, 10) || 0;
  const ohne = Math.round(abfN * 0.42);
  const mit = Math.round(abfN * 0.42 - abfN * 0.091);
  /* agB-Live-Schwelle */
  const grenze = 1842; /* 4 % von 46.050 € (1 Kind) — Demo */
  const [agb, setAgb] = React.useState('620');
  const agbN = parseInt(agb, 10) || 0;
  function aktivieren(id) {
    const neu = [...new Set([...aktiv, id])];
    setAktiv(neu);
    try {
      localStorage.setItem('funke.lebenslagen', JSON.stringify(neu));
      if (id === 'lohnersatz') localStorage.setItem('funke.lohnersatz', '1');
    } catch (e) {}
    setOffen(null);
    setToast('Angelegt — du findest es ab jetzt im Cockpit');
    setTimeout(() => setToast(''), 1800);
  }
  const treffer = LAGEN.filter(l => !suche || (l.titel + ' ' + l.amt + ' ' + l.text).toLowerCase().includes(suche.toLowerCase()));
  const lage = LAGEN.find(l => l.id === offen);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "appbar"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, onZurueck ? /*#__PURE__*/React.createElement("button", {
    onClick: onZurueck,
    "aria-label": "Zur\xFCck",
    style: {
      width: 44,
      height: 44,
      border: '1.5px solid var(--linie-weich)',
      borderRadius: 999,
      background: 'var(--karte)',
      fontWeight: 800
    }
  }, "\u2190") : /*#__PURE__*/React.createElement("a", {
    href: "index.html",
    "aria-label": "Zur\xFCck zur App",
    style: {
      width: 44,
      height: 44,
      border: '1.5px solid var(--linie-weich)',
      borderRadius: 999,
      background: 'var(--karte)',
      fontWeight: 800,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textDecoration: 'none',
      color: 'inherit'
    }
  }, "\u2190"), /*#__PURE__*/React.createElement("h1", null, "Lebenslagen")), /*#__PURE__*/React.createElement(Pill, null, aktiv.length, " aktiv")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '-6px 0 14px',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Alles hier funktioniert wirklich \u2014 antippen zeigt, was es bringt."), /*#__PURE__*/React.createElement(Input, {
    value: suche,
    onChange: v => setSuche(v),
    placeholder: "Suchen \u2014 z. B. Umzug, Elterngeld, Zahnarzt",
    style: {
      marginBottom: 14
    }
  }), treffer.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      textAlign: 'center',
      fontSize: 14,
      color: 'var(--tinte-2)'
    }
  }, "Nichts gefunden zu \u201E", suche, "\" \u2014 ", /*#__PURE__*/React.createElement("button", {
    onClick: onBerater,
    style: {
      textDecoration: 'underline',
      fontWeight: 700
    }
  }, "frag den Berater"), ", ob es steuerlich z\xE4hlt."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
      gap: 10
    }
  }, treffer.map(l => /*#__PURE__*/React.createElement("button", {
    key: l.id,
    onClick: () => setOffen(l.id),
    className: "fk-karte",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      textAlign: 'left',
      margin: 0,
      padding: '12px 14px',
      minHeight: 60
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 14,
      lineHeight: 1.25,
      flex: 1,
      minWidth: 0
    }
  }, l.titel), aktiv.includes(l.id) ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ok)',
      fontWeight: 800,
      flex: 'none'
    },
    "aria-hidden": "true"
  }, "\u2713") : /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      fontWeight: 800,
      flex: 'none',
      color: 'var(--tinte-2)'
    }
  }, "\u2192")))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      textAlign: 'center',
      marginTop: 14
    }
  }, "Fehlt was? Kommt \u2014 steht erst hier, wenn es komplett funktioniert."), lage && /*#__PURE__*/React.createElement(Sheet, {
    titel: lage.titel,
    onClose: () => setOffen(null)
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 0,
      fontSize: 12,
      color: 'var(--tinte-2)',
      fontFamily: 'var(--schrift-mono)',
      textTransform: 'uppercase',
      letterSpacing: '0.06em'
    }
  }, lage.amt), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14
    }
  }, lage.text), lage.rechner === 'abfindung' && /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      background: 'var(--funke-weich)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, "Dein F\xFCnftel-Effekt"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      margin: '10px 0'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    value: abf,
    onChange: v => setAbf(v.replace(/\D/g, '').slice(0, 6)),
    inputMode: "numeric",
    style: {
      fontFamily: 'var(--schrift-mono)',
      fontSize: 22,
      width: 130,
      textAlign: 'center'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, "\u20AC Abfindung")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      borderBottom: '1.5px dashed var(--linie-weich)',
      padding: '6px 0',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--tinte-2)'
    }
  }, "Steuer ohne Erm\xE4\xDFigung"), /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, "\u2248 ", ohne.toLocaleString('de-DE'), " \u20AC")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '6px 0',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--tinte-2)'
    }
  }, "Mit ", /*#__PURE__*/React.createElement(Begriff, {
    titel: "F\xFCnftelregelung",
    erklaerung: "Die Abfindung wird rechnerisch auf f\xFCnf Jahre verteilt \u2014 so bleibt dein Steuersatz niedriger, obwohl das Geld auf einmal kommt. Seit 2025 macht das nicht mehr der Arbeitgeber, sondern nur noch deine Steuererkl\xE4rung.",
    beispiel: "24.000 \u20AC Abfindung \u2192 oft \xFCber 2.000 \u20AC weniger Steuer"
  }, "F\xFCnftelregelung")), /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, "\u2248 ", mit.toLocaleString('de-DE'), " \u20AC")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(Sticker, {
    style: {
      fontSize: 14
    }
  }, "\u2212", (ohne - mit).toLocaleString('de-DE'), " \u20AC Steuer"), /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: {
      regel: '§ 34 EStG · Näherung',
      rechenweg: 'Fünftelung bei 42 % Grenzsteuersatz — exakt rechnen wir mit deinen echten Zahlen'
    }
  }))), lage.rechner === 'agb' && /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      background: 'var(--funke-weich)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, "Deine zumutbare Grenze: ", /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, grenze.toLocaleString('de-DE'), " \u20AC")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      margin: '10px 0'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    value: agb,
    onChange: v => setAgb(v.replace(/\D/g, '').slice(0, 6)),
    inputMode: "numeric",
    style: {
      fontFamily: 'var(--schrift-mono)',
      fontSize: 22,
      width: 130,
      textAlign: 'center'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, "\u20AC bisher")), /*#__PURE__*/React.createElement(Balken, {
    pct: Math.min(100, agbN / grenze * 100),
    style: {
      margin: '4px 0 8px'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      color: agbN > grenze ? 'var(--ok)' : 'var(--tinte-2)',
      fontWeight: agbN > grenze ? 700 : 400
    }
  }, agbN > grenze ? `Über der Grenze — ${(agbN - grenze).toLocaleString('de-DE')} € zählen.` : `Ehrlich: erst ab ${grenze.toLocaleString('de-DE')} € wirkt sich das aus — noch ${(grenze - agbN).toLocaleString('de-DE')} € entfernt. Sammeln lohnt trotzdem, das Jahr ist noch nicht rum.`), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: {
      regel: '§ 33 EStG · zumutbare Belastung',
      rechenweg: '4 % von 46.050 € Einkommen (1 Kind) — stufenweise gerechnet'
    }
  }))), /*#__PURE__*/React.createElement(Button, {
    onClick: () => aktivieren(lage.id)
  }, aktiv.includes(lage.id) ? 'Bleibt aktiv' : 'Zu meinem Steuerjahr hinzufügen'), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      marginTop: 10
    },
    onClick: onBerater
  }, "Unsicher? Frag den Berater")), toast && /*#__PURE__*/React.createElement(Toast, {
    text: toast
  }));
}
Object.assign(window, {
  FunkeLebenslagen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Lebenslagen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Onboarding.jsx
try { (() => {
/* Splash (REQ-033-Muster: Marke zeichnet sich, Antippen überspringt) +
   Onboarding: Name → Steuer-ID → Steuernummer → Maske vorgefüllt.
   Angaben bleiben lokal (localStorage 'funke.onboarding.profil'). */
const {
  Button,
  Input,
  Feld,
  Chip,
  Pill,
  Sticker
} = window.FinanzoFunkeDesignSystem_7e417e;
function FunkeSplash({
  onFertig
}) {
  React.useEffect(() => {
    const t = setTimeout(onFertig, 2400);
    return () => clearTimeout(t);
  }, [onFertig]);
  return /*#__PURE__*/React.createElement("button", {
    className: "fx-splash",
    onClick: onFertig,
    "aria-label": "Weiter zur App"
  }, /*#__PURE__*/React.createElement("svg", {
    className: "fx-marke",
    viewBox: "0 0 96 96",
    width: "104",
    height: "104",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("g", {
    className: "au-kopf"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 36 L30 10 L41 24 Z",
    fill: "var(--funke)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M76 36 L66 10 L55 24 Z",
    fill: "var(--funke)"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "20",
    width: "68",
    height: "64",
    rx: "30",
    fill: "var(--funke)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M48 58 L55 65 L48 74 L41 65 Z",
    fill: "var(--nacht)"
  })), /*#__PURE__*/React.createElement("g", {
    className: "au-brille"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "42",
    y: "44",
    width: "12",
    height: "6",
    rx: "3",
    fill: "var(--nacht)"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "33",
    cy: "47",
    r: "14",
    fill: "var(--nacht)"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "63",
    cy: "47",
    r: "14",
    fill: "var(--nacht)"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "36",
    cy: "45",
    r: "5.5",
    fill: "var(--funke)"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "66",
    cy: "45",
    r: "5.5",
    fill: "var(--funke)"
  }), /*#__PURE__*/React.createElement("rect", {
    className: "au-lid",
    x: "19",
    y: "33",
    width: "28",
    height: "28",
    rx: "14",
    fill: "var(--funke)"
  }), /*#__PURE__*/React.createElement("rect", {
    className: "au-lid",
    x: "49",
    y: "33",
    width: "28",
    height: "28",
    rx: "14",
    fill: "var(--funke)"
  }))), /*#__PURE__*/React.createElement("span", {
    className: "fx-wort"
  }, "Steuer", /*#__PURE__*/React.createElement("b", null, "Eule")), /*#__PURE__*/React.createElement("span", {
    className: "fx-claim"
  }, "Steuern? ", /*#__PURE__*/React.createElement("i", null, "Zack,"), " erledigt."), /*#__PURE__*/React.createElement("span", {
    className: "fx-tipp"
  }, "Tippen zum \xDCberspringen"));
}

/* Steuer-ID: 11 Ziffern → "12 345 678 901" */
function formatSteuerId(roh) {
  const z = roh.replace(/\D/g, '').slice(0, 11);
  return z.replace(/^(\d{2})(\d{0,3})(\d{0,3})(\d{0,3}).*$/, (m, a, b, c, d) => [a, b, c, d].filter(Boolean).join(' '));
}
/* Steuernummer (verkürzt, länderabhängig): bis 13 Ziffern → "12/345/67890" */
function formatSteuerNr(roh) {
  const z = roh.replace(/\D/g, '').slice(0, 13);
  return z.replace(/^(\d{2,3})(\d{0,3})(\d{0,5}).*$/, (m, a, b, c) => [a, b, c].filter(Boolean).join('/'));
}
const LEER = {
  vorname: '',
  nachname: '',
  steuerId: '',
  steuerNr: ''
};
function FunkeOnboarding({
  onFertig
}) {
  const [profil, setProfil] = React.useState(() => {
    try {
      return {
        ...LEER,
        ...(JSON.parse(localStorage.getItem('funke.onboarding.profil')) || {})
      };
    } catch (e) {
      return LEER;
    }
  });
  const [schritt, setSchritt] = React.useState(0);
  const set = k => v => setProfil(p => ({
    ...p,
    [k]: v
  }));
  const idZiffern = profil.steuerId.replace(/\D/g, '').length;
  const SCHRITTE = [{
    titel: /*#__PURE__*/React.createElement("span", null, "Wer bist ", /*#__PURE__*/React.createElement("em", {
      className: "fx-mark"
    }, "du"), "?"),
    hilfe: 'Genau wie im Ausweis — damit die Maske exakt stimmt.',
    ok: profil.vorname.trim() && profil.nachname.trim(),
    inhalt: /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Feld, {
      label: "Vorname"
    }, /*#__PURE__*/React.createElement(Input, {
      value: profil.vorname,
      onChange: set('vorname'),
      placeholder: "Kim",
      autoFocus: true
    })), /*#__PURE__*/React.createElement(Feld, {
      label: "Nachname"
    }, /*#__PURE__*/React.createElement(Input, {
      value: profil.nachname,
      onChange: set('nachname'),
      placeholder: "Yilmaz"
    })))
  }, {
    titel: /*#__PURE__*/React.createElement("span", null, "Deine ", /*#__PURE__*/React.createElement("em", {
      className: "fx-mark"
    }, "Steuer-ID")),
    hilfe: '11 Ziffern, lebenslang gleich — steht oben auf jedem Brief vom Finanzamt.',
    ok: idZiffern === 11,
    inhalt: /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Feld, {
      label: "Steuer-Identifikationsnummer"
    }, /*#__PURE__*/React.createElement(Input, {
      value: profil.steuerId,
      onChange: v => set('steuerId')(formatSteuerId(v)),
      placeholder: "12 345 678 901",
      inputMode: "numeric",
      style: {
        fontFamily: 'var(--schrift-mono)',
        fontSize: 22,
        letterSpacing: '0.04em'
      },
      autoFocus: true
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono-label num"
    }, idZiffern, "/11 Ziffern"), idZiffern === 11 && /*#__PURE__*/React.createElement(Sticker, {
      key: "ok",
      style: {
        fontSize: 13
      }
    }, "sitzt \u2713")))
  }, {
    titel: /*#__PURE__*/React.createElement("span", null, "Noch die ", /*#__PURE__*/React.createElement("em", {
      className: "fx-mark"
    }, "Steuernummer")),
    hilfe: 'Steht auf deinem letzten Bescheid. Keinen zur Hand? Später geht auch.',
    ok: true,
    inhalt: /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Feld, {
      label: "Steuernummer (optional)"
    }, /*#__PURE__*/React.createElement(Input, {
      value: profil.steuerNr,
      onChange: v => set('steuerNr')(formatSteuerNr(v)),
      placeholder: "12/345/67890",
      inputMode: "numeric",
      style: {
        fontFamily: 'var(--schrift-mono)',
        fontSize: 22,
        letterSpacing: '0.04em'
      },
      autoFocus: true
    })), /*#__PURE__*/React.createElement(Chip, {
      onClick: () => {
        set('steuerNr')('');
        weiter();
      }
    }, "Hab ich nicht zur Hand \u2014 sp\xE4ter"))
  }];
  function weiter() {
    if (schritt === SCHRITTE.length - 1) {
      try {
        localStorage.setItem('funke.onboarding.profil', JSON.stringify(profil));
      } catch (e) {}
      setSchritt(3);
    } else {
      setSchritt(schritt + 1);
    }
  }
  if (schritt === 3) {
    const zeilen = [['Vorname', profil.vorname], ['Nachname', profil.nachname], ['Steuer-ID', profil.steuerId], ['Steuernummer', profil.steuerNr || 'später']];
    return /*#__PURE__*/React.createElement("div", {
      className: "fx-schritt",
      key: "fertig"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        margin: '28px 0 6px'
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: 40,
        fontWeight: 800
      }
    }, "Zack."), /*#__PURE__*/React.createElement(Sticker, {
      style: {
        fontSize: 14
      }
    }, "vorgef\xFCllt")), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 18px',
        color: 'var(--tinte-2)'
      }
    }, "Deine Maske ist vorbereitet \u2014 jede Angabe kannst du jederzeit \xE4ndern."), /*#__PURE__*/React.createElement("div", {
      className: "fk-karte nacht"
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono-label",
      style: {
        color: 'var(--funke-hell)'
      }
    }, "Deine Maske"), zeilen.map(([k, v]) => /*#__PURE__*/React.createElement("div", {
      key: k,
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        borderBottom: '1.5px solid var(--nacht-karte)',
        padding: '10px 0',
        fontSize: 15
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        opacity: 0.7
      }
    }, k), /*#__PURE__*/React.createElement("b", {
      className: "num",
      style: {
        fontFamily: k.startsWith('Steuer') ? 'var(--schrift-mono)' : 'inherit',
        color: 'var(--funke)'
      }
    }, v)))), /*#__PURE__*/React.createElement(Button, {
      onClick: onFertig
    }, "Weiter zum Interview \u2192"), /*#__PURE__*/React.createElement(Button, {
      variante: "ghost",
      style: {
        marginTop: 10
      },
      onClick: () => setSchritt(0)
    }, "Angaben \xE4ndern"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 12,
        color: 'var(--tinte-2)',
        textAlign: 'center'
      }
    }, "Bleibt auf diesem Ger\xE4t, bis du \xFCbertr\xE4gst."));
  }
  const s = SCHRITTE[schritt];
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-schritt",
    key: schritt
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 0 22px'
    }
  }, schritt > 0 ? /*#__PURE__*/React.createElement("button", {
    onClick: () => setSchritt(schritt - 1),
    "aria-label": "Zur\xFCck",
    style: {
      width: 44,
      height: 44,
      border: 'var(--kontur) solid var(--tinte)',
      borderRadius: 999,
      background: 'var(--karte)',
      boxShadow: 'var(--schatten-hart-s)',
      fontWeight: 800
    }
  }, "\u2190") : /*#__PURE__*/React.createElement("img", {
    src: "../../assets/marke-tinte.svg",
    width: "34",
    height: "34",
    alt: "SteuerEule"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flex: 1
    },
    role: "progressbar",
    "aria-valuenow": schritt + 1,
    "aria-valuemin": 1,
    "aria-valuemax": 3
  }, SCHRITTE.map((x, i) => /*#__PURE__*/React.createElement("i", {
    key: i,
    style: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      border: '1.5px solid var(--tinte)',
      background: i <= schritt ? 'var(--funke)' : 'var(--karte)',
      transition: 'background var(--t-flott)'
    }
  }))), /*#__PURE__*/React.createElement(Pill, null, schritt + 1, "/3")), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 36,
      fontWeight: 800,
      marginBottom: 8
    }
  }, s.titel), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 22px',
      color: 'var(--tinte-2)'
    }
  }, s.hilfe), s.inhalt, /*#__PURE__*/React.createElement(Button, {
    onClick: weiter,
    disabled: !s.ok,
    style: {
      marginTop: 18
    }
  }, "Weiter"));
}
Object.assign(window, {
  FunkeSplash,
  FunkeOnboarding
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Onboarding.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Paywall.jsx
try { (() => {
/* Paywall — Abgabe-Paket mit echtem Kauf-Flow: Angebot → Zahlung (Sheet) → freigeschaltet.
   Fehlerzustand demonstriert: Karte schlägt fehl (Demo), Apple/Google Pay gelingen. */
const {
  Button,
  Chip,
  Pill,
  Sheet,
  Banner,
  Sticker
} = window.FinanzoFunkeDesignSystem_7e417e;
const PRO_PUNKTE = [['Rechnen, Belege & Berater', 'Kostenlos', 'Kostenlos'], ['Übertragungshilfe & Exporte', '—', 'Inklusive'], ['Grenzgänger Kalender-Import', '—', 'Inklusive'], ['ERiC-geprüft übermitteln', '—', 'Kommt (1.x)']];
function FunkePaywall({
  onSchliessen,
  onKaufen
}) {
  const [zahlungOffen, setZahlungOffen] = React.useState(false);
  const [fehler, setFehler] = React.useState(false);
  const [gekauft, setGekauft] = React.useState(false);
  if (gekauft) {
    return /*#__PURE__*/React.createElement("div", {
      className: "fx-bau",
      style: {
        textAlign: 'center',
        paddingTop: 60
      }
    }, /*#__PURE__*/React.createElement(Sticker, {
      style: {
        fontSize: 16
      }
    }, "Abgabe-Paket aktiv"), /*#__PURE__*/React.createElement("h1", {
      style: {
        fontFamily: 'var(--schrift-display)',
        fontWeight: 800,
        fontSize: 44,
        margin: '18px 0 8px'
      }
    }, "Freigeschaltet."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 6px',
        color: 'var(--tinte-2)'
      }
    }, "34,99 \u20AC f\xFCr das Steuerjahr 2026 \u2014 die Rechnung liegt in deinem Profil unter \u201EDeine Daten\"."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 24px',
        color: 'var(--tinte-2)',
        fontSize: 13
      }
    }, "Kein Abo: n\xE4chstes Jahr fragst du uns wieder \u2014 nicht umgekehrt."), /*#__PURE__*/React.createElement(Button, {
      onClick: onKaufen
    }, "Weiter zu \xDCbertragen"));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-bau"
  }, /*#__PURE__*/React.createElement("div", {
    className: "fk-karte nacht",
    style: {
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--funke-hell)'
    }
  }, "Abgabe-Paket"), /*#__PURE__*/React.createElement(Chip, {
    variante: "pro",
    style: {
      minHeight: 28,
      fontSize: 12
    }
  }, "\u221E")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 34,
      lineHeight: 1.1,
      margin: '8px 0 4px',
      color: 'var(--nacht-text)'
    }
  }, "Bereit f\xFCr die Abgabe?"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 4px',
      fontSize: 14,
      opacity: 0.8
    }
  }, "Rechnen, pr\xFCfen, Berater \u2014 alles kostenlos. Du zahlst erst, wenn du abgibst. Unter 50 \u20AC Erstattung: gar nicht."), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 44,
      color: 'var(--funke)',
      margin: '10px 0 2px'
    }
  }, "34,99 \u20AC", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      opacity: 0.8
    }
  }, " / Steuerjahr")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      opacity: 0.7
    }
  }, "Einmal pro Jahr. Kein Abo, keine automatische Verl\xE4ngerung.")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      padding: 0,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.4fr 1fr 1fr',
      padding: '12px 16px 8px',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, "Basis"), /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--funke-tinte)'
    }
  }, "Pro")), PRO_PUNKTE.map(([was, basis, pro]) => /*#__PURE__*/React.createElement("div", {
    key: was,
    style: {
      display: 'grid',
      gridTemplateColumns: '1.4fr 1fr 1fr',
      gap: 8,
      padding: '10px 16px',
      borderTop: '1.5px solid var(--linie-weich)',
      fontSize: 13,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("b", null, was), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--tinte-2)'
    },
    className: "num"
  }, basis), /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      color: 'var(--funke-tinte)'
    }
  }, pro)))), /*#__PURE__*/React.createElement(Button, {
    onClick: () => {
      setFehler(false);
      setZahlungOffen(true);
    }
  }, "Abgabe freischalten \u2014 34,99 \u20AC"), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      marginTop: 10
    },
    onClick: onSchliessen
  }, "Sp\xE4ter \u2014 erstmal weiter rechnen"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      textAlign: 'center'
    }
  }, "Alles Erfasste bleibt \u2014 bezahlt wird nur das Abgeben."), zahlungOffen && /*#__PURE__*/React.createElement(Sheet, {
    titel: "Bezahlen \u2014 34,99 \u20AC",
    onClose: () => setZahlungOffen(false)
  }, fehler && /*#__PURE__*/React.createElement(Banner, {
    art: "gefahr"
  }, /*#__PURE__*/React.createElement("b", null, "Zahlung fehlgeschlagen."), " Deine Bank hat abgelehnt \u2014 es wurde nichts abgebucht. Versuch es mit einem anderen Weg oder sp\xE4ter noch einmal."), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: fehler ? 12 : 0,
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Einmalzahlung f\xFCr Steuerjahr 2026. Kein Abo, keine Verl\xE4ngerung."), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setZahlungOffen(false);
      setGekauft(true);
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      width: '100%',
      minHeight: 52,
      borderRadius: 14,
      background: '#000',
      color: '#fff',
      fontWeight: 700,
      fontSize: 16,
      border: 'var(--kontur) solid var(--tinte)',
      marginBottom: 10
    }
  }, "\uF8FF Pay"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setZahlungOffen(false);
      setGekauft(true);
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      width: '100%',
      minHeight: 52,
      borderRadius: 14,
      background: '#fff',
      fontWeight: 700,
      fontSize: 16,
      border: 'var(--kontur) solid var(--tinte)',
      marginBottom: 10
    }
  }, "Google Pay"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setFehler(true),
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      width: '100%',
      minHeight: 52,
      borderRadius: 14,
      background: 'var(--karte)',
      fontWeight: 700,
      fontSize: 15,
      border: '1.5px solid var(--linie-weich)'
    }
  }, "Mit Karte zahlen (Demo: schl\xE4gt fehl)"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      margin: '12px 0 0'
    }
  }, "Abgewickelt \xFCber den jeweiligen Store \u2014 wir sehen keine Kartendaten.")));
}
Object.assign(window, {
  FunkePaywall
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Paywall.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Profil.jsx
try { (() => {
/* Profil — Konto, Einstellungen (Schalter), Daten (Export/Löschen), Rechtliches. */
const {
  Button,
  Chip,
  Pill,
  SchalterZeile,
  Sheet,
  Toast
} = window.FinanzoFunkeDesignSystem_7e417e;
function FunkeProfil({
  geheZu
}) {
  const profil = React.useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('funke.onboarding.profil')) || {};
    } catch (e) {
      return {};
    }
  }, []);
  const [erinnerung, setErinnerung] = React.useState(true);
  const [saison, setSaison] = React.useState(true);
  const [eulen, setEulen] = React.useState(() => window.funkeEulenAn ? window.funkeEulenAn() : false);
  const [faceId, setFaceId] = React.useState(false);
  const [dunkel, setDunkel] = React.useState(() => {
    try {
      return localStorage.getItem('funke.theme') === 'dunkel';
    } catch (e) {
      return false;
    }
  });
  function themeWechsel(an) {
    setDunkel(an);
    try {
      localStorage.setItem('funke.theme', an ? 'dunkel' : 'hell');
    } catch (e) {}
    if (an) document.documentElement.dataset.theme = 'dunkel';else delete document.documentElement.dataset.theme;
  }
  const [loeschenOffen, setLoeschenOffen] = React.useState(false);
  const [toast, setToast] = React.useState('');
  function zeigeToast(t) {
    setToast(t);
    setTimeout(() => setToast(''), 1400);
  }
  const name = [profil.vorname, profil.nachname].filter(Boolean).join(' ') || 'Gast';
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "appbar"
  }, /*#__PURE__*/React.createElement("h1", null, "Profil"), /*#__PURE__*/React.createElement(Pill, null, "Beta")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 54,
      height: 54,
      borderRadius: 999,
      background: 'var(--funke)',
      color: '#191b12',
      border: 'var(--kontur) solid var(--tinte)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 22,
      flex: 'none'
    }
  }, name[0].toUpperCase()), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 17
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, profil.steuerId ? /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-mono)'
    }
  }, "ID ", profil.steuerId) : 'Gast-Modus — Angaben nur auf diesem Gerät')), /*#__PURE__*/React.createElement(Chip, {
    onClick: () => geheZu && geheZu('cockpit'),
    style: {
      marginLeft: 'auto',
      flex: 'none'
    }
  }, "Bearbeiten")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      paddingTop: 6,
      paddingBottom: 6
    }
  }, /*#__PURE__*/React.createElement(SchalterZeile, {
    titel: "Dunkles Design",
    detail: "Limette bleibt \u2014 Fl\xE4chen tauschen",
    an: dunkel,
    onChange: themeWechsel
  }), /*#__PURE__*/React.createElement(SchalterZeile, {
    titel: "Ereignis-Nachrichten",
    detail: "Bescheid da, R\xFCckfrage vom Amt, Frist unter 30 Tagen \u2014 sonst nichts",
    an: erinnerung,
    onChange: setErinnerung
  }), /*#__PURE__*/React.createElement(SchalterZeile, {
    titel: "Saison-Erinnerung",
    detail: "Einmal pro Steuersaison: deine Belege warten",
    an: saison,
    onChange: setSaison
  }), /*#__PURE__*/React.createElement(SchalterZeile, {
    titel: "Eulen-Modus",
    detail: "Liest Rechts\xE4nderungen, fragt aktiv nach \u2014 du entscheidest immer",
    an: eulen,
    onChange: v => {
      setEulen(v);
      if (window.funkeSetEulenAn) window.funkeSetEulenAn(v);
    }
  }), /*#__PURE__*/React.createElement(SchalterZeile, {
    titel: "Mit Face ID entsperren",
    detail: "Zus\xE4tzlich zur Ger\xE4te-Sperre",
    an: faceId,
    onChange: setFaceId
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      padding: '12px 0',
      borderTop: '1.5px solid var(--linie-weich)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 15
    }
  }, "Schriftgr\xF6\xDFe"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Folgt deiner System-Einstellung \u2014 bis 200 % getestet")), /*#__PURE__*/React.createElement(Pill, null, "System"))), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", null, "Beta \u2014 alles kostenlos"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Kein Preis, keine Schl\xF6sser. Ein Preis kommt erst, wenn wir echt ans Finanzamt \xFCbermitteln k\xF6nnen."))), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      padding: 0,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mono-label",
    style: {
      padding: '12px 16px 4px'
    }
  }, "Deine Daten"), /*#__PURE__*/React.createElement("button", {
    onClick: () => geheZu ? geheZu('datenschutz') : window.location.href = 'datenschutz.html',
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      width: '100%',
      textAlign: 'left',
      padding: '12px 16px',
      borderTop: '1.5px solid var(--linie-weich)',
      minHeight: 52,
      fontSize: 15
    }
  }, /*#__PURE__*/React.createElement("span", null, "So sch\xFCtzen wir deine Daten (DSGVO)"), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u2192")), /*#__PURE__*/React.createElement("button", {
    onClick: () => zeigeToast('Demo — PDF-Bericht + Belege (ZIP) werden vorbereitet'),
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      width: '100%',
      textAlign: 'left',
      padding: '12px 16px',
      borderTop: '1.5px solid var(--linie-weich)',
      minHeight: 52,
      fontSize: 15
    }
  }, /*#__PURE__*/React.createElement("span", null, "Alles exportieren \u2014 PDF-Bericht + Belege (ZIP)"), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u2192")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setLoeschenOffen(true),
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      width: '100%',
      textAlign: 'left',
      padding: '12px 16px',
      borderTop: '1.5px solid var(--linie-weich)',
      minHeight: 52,
      fontSize: 15,
      color: 'var(--fehler)',
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("span", null, "Konto & Daten l\xF6schen"), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u2192")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      padding: '10px 16px',
      borderTop: '1.5px solid var(--linie-weich)',
      fontSize: 12,
      color: 'var(--tinte-2)'
    }
  }, "EU-Server \xB7 verschl\xFCsselt \xB7 kein Verkauf von Daten")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault()
  }, "AGB"), " \xB7 ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      geheZu ? geheZu('datenschutz') : window.location.href = 'datenschutz.html';
    }
  }, "Datenschutz"), " \xB7 ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault()
  }, "Impressum"), " \xB7 Version 0.9 (Beta)"), toast && /*#__PURE__*/React.createElement(Toast, {
    text: toast
  }), loeschenOffen && /*#__PURE__*/React.createElement(Sheet, {
    titel: "Wirklich alles l\xF6schen?",
    onClose: () => setLoeschenOffen(false)
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 0,
      fontSize: 14
    }
  }, "Alle Belege, Antworten und dein Konto werden endg\xFCltig gel\xF6scht \u2014 auch auf unseren Servern. Das l\xE4sst sich ", /*#__PURE__*/React.createElement("b", null, "nicht"), " r\xFCckg\xE4ngig machen."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Wichtig: Damit verlierst du deine Nachweise gegen\xFCber dem Finanzamt. Sichere sie dir vorher."), /*#__PURE__*/React.createElement(Button, {
    variante: "leise",
    onClick: () => {
      setLoeschenOffen(false);
      zeigeToast('Demo — PDF-Bericht + Belege (ZIP) werden vorbereitet');
    }
  }, "Erst exportieren (empfohlen)"), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      marginTop: 10,
      borderColor: 'var(--fehler)',
      color: 'var(--fehler)'
    },
    onClick: () => setLoeschenOffen(false)
  }, "Ohne Export endg\xFCltig l\xF6schen"), /*#__PURE__*/React.createElement(Button, {
    style: {
      marginTop: 10
    },
    onClick: () => setLoeschenOffen(false)
  }, "Abbrechen")));
}
Object.assign(window, {
  FunkeProfil
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Profil.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Registrierung.jsx
try { (() => {
/* Registrierung — Konto anlegen + Code-Verifizierung (Demo-Code 123456, wie im Quell-Repo). */
const {
  Button,
  Input,
  Feld,
  Sticker
} = window.FinanzoFunkeDesignSystem_7e417e;
function FunkeRegistrierung({
  onFertig
}) {
  const [schritt, setSchritt] = React.useState(0);
  const [mail, setMail] = React.useState('');
  const [pass, setPass] = React.useState('');
  const [code, setCode] = React.useState('');
  const [fehler, setFehler] = React.useState('');
  const ok = mail.includes('@') && pass.length >= 6;
  function anlegen() {
    if (!ok) {
      setFehler(mail.includes('@') ? 'Mindestens 6 Zeichen fürs Passwort.' : 'Das sieht noch nicht nach einer E-Mail aus.');
      return;
    }
    setFehler('');
    setSchritt(1);
  }
  function pruefen(v) {
    const z = v.replace(/\D/g, '').slice(0, 6);
    setCode(z);
    if (z.length === 6) {
      if (z === '123456') {
        setFehler('');
        setSchritt(2);
      } else setFehler('Der Code stimmt nicht — schau nochmal in deine Mail.');
    } else setFehler('');
  }
  if (schritt === 2) {
    return /*#__PURE__*/React.createElement("div", {
      className: "fx-schritt",
      key: "fertig",
      style: {
        textAlign: 'center',
        paddingTop: 60
      }
    }, /*#__PURE__*/React.createElement(Sticker, {
      style: {
        fontSize: 16
      }
    }, "Konto steht \u2713"), /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: 36,
        fontWeight: 800,
        margin: '18px 0 8px'
      }
    }, "Willkommen bei SteuerEule."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 24px',
        color: 'var(--tinte-2)'
      }
    }, "Jetzt noch drei Angaben, dann ist deine Maske vorgef\xFCllt."), /*#__PURE__*/React.createElement(Button, {
      onClick: onFertig
    }, "Weiter zum Onboarding \u2192"));
  }
  if (schritt === 1) {
    return /*#__PURE__*/React.createElement("div", {
      className: "fx-schritt",
      key: "code"
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        fontSize: 34,
        fontWeight: 800,
        margin: '28px 0 8px'
      }
    }, "Check deine ", /*#__PURE__*/React.createElement("em", {
      className: "fx-mark"
    }, "Mail"), "."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 22px',
        color: 'var(--tinte-2)'
      }
    }, "Wir haben einen 6-stelligen Code an ", /*#__PURE__*/React.createElement("b", null, mail), " geschickt."), /*#__PURE__*/React.createElement(Feld, {
      label: "Best\xE4tigungscode",
      fehler: fehler
    }, /*#__PURE__*/React.createElement(Input, {
      value: code,
      onChange: pruefen,
      placeholder: "123456",
      inputMode: "numeric",
      autoFocus: true,
      style: {
        fontFamily: 'var(--schrift-mono)',
        fontSize: 30,
        letterSpacing: '0.35em',
        textAlign: 'center'
      }
    })), /*#__PURE__*/React.createElement("p", {
      className: "mono-label",
      style: {
        textAlign: 'center'
      }
    }, "Demo-Code: 123456"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setSchritt(0),
      style: {
        display: 'block',
        margin: '14px auto 0',
        fontSize: 14,
        textDecoration: 'underline',
        minHeight: 44
      }
    }, "Andere E-Mail verwenden"));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-schritt",
    key: "konto"
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 34,
      fontWeight: 800,
      margin: '28px 0 8px'
    }
  }, "Leg dein ", /*#__PURE__*/React.createElement("em", {
    className: "fx-mark"
  }, "Konto"), " an."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 22px',
      color: 'var(--tinte-2)'
    }
  }, "E-Mail und Passwort \u2014 mehr braucht es nicht."), /*#__PURE__*/React.createElement(Feld, {
    label: "E-Mail"
  }, /*#__PURE__*/React.createElement(Input, {
    type: "email",
    value: mail,
    onChange: setMail,
    placeholder: "du@beispiel.de",
    autoFocus: true
  })), /*#__PURE__*/React.createElement(Feld, {
    label: "Passwort",
    fehler: fehler
  }, /*#__PURE__*/React.createElement(Input, {
    type: "password",
    value: pass,
    onChange: setPass,
    placeholder: "Mindestens 6 Zeichen",
    onKeyDown: e => e.key === 'Enter' && anlegen()
  })), /*#__PURE__*/React.createElement(Button, {
    onClick: anlegen,
    style: {
      marginTop: 6
    }
  }, "Konto anlegen"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      textAlign: 'center',
      marginTop: 14
    }
  }, "Mit dem Anlegen akzeptierst du AGB & Datenschutz."));
}
Object.assign(window, {
  FunkeRegistrierung
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Registrierung.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Scan.jsx
try { (() => {
/* Beleg-Scan — Kamera-Mock (Nacht) → Extraktion → KI-Vorschlag (Stufe 2). Alles Demo.
   Zwei Scan-Typen: Beleg und Lohnsteuerbescheinigung (befüllt Anlage N auf einmal). */
const {
  Button,
  Chip,
  AiChip,
  Sticker
} = window.FinanzoFunkeDesignSystem_7e417e;
const SCAN_DATEN = {
  beleg: {
    label: 'Beleg scannen',
    titel: 'Rechnung „Monitor 27″"',
    kv: [['Betrag', '289,00 €'], ['Datum', '02.05.2026'], ['Aussteller', 'Techmarkt GmbH']],
    konf: 94,
    ziel: 'Anlage N · Zeile 42',
    weil: 'weil ein Monitor als Arbeitsmittel zählt — über 800 € würde er abgeschrieben, hier nicht nötig',
    cta: 'Übernehmen (+87 €)',
    sticker: '+87 € drin',
    titelFertig: 'Übernommen.',
    fertigText: 'In der echten App liegt der Beleg jetzt bestätigt in „Belege" — Herkunft inklusive. (Demo: simuliert.)'
  },
  lstb: {
    label: 'Lohnsteuerbescheinigung',
    titel: 'Lohnsteuerbescheinigung 2026',
    kv: [['Bruttoarbeitslohn', '54.320,00 €'], ['Lohnsteuer', '9.184,00 €'], ['Sozialversicherung', '11.240,00 €']],
    konf: 99,
    ziel: 'Anlage N · Zeilen 31–46',
    weil: 'weil eTIN und Arbeitgeber zu deinem Profil passen — 6 Felder werden auf einmal befüllt',
    cta: 'Alle 6 Felder übernehmen',
    sticker: '6 Felder befüllt',
    titelFertig: 'Vorbefüllt.',
    fertigText: 'Anlage N ist vorbefüllt — jede Zeile behält ihre Herkunft und bleibt einzeln änderbar. (Demo: simuliert.)'
  }
};
function FunkeScan({
  onZurueck
}) {
  const [phase, setPhase] = React.useState('kamera'); // kamera → lesen → vorschlag → fertig
  const [typ, setTyp] = React.useState('beleg');
  const [quelle, setQuelle] = React.useState('kamera'); // kamera | datei
  const d = SCAN_DATEN[typ];
  React.useEffect(() => {
    if (phase === 'lesen') {
      const t = setTimeout(() => setPhase('vorschlag'), 1800);
      return () => clearTimeout(t);
    }
  }, [phase]);
  if (phase === 'kamera' || phase === 'lesen') {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'fixed',
        inset: 0,
        background: 'var(--nacht)',
        color: 'var(--nacht-text)',
        display: 'flex',
        flexDirection: 'column'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: onZurueck,
      "aria-label": "Zur\xFCck",
      style: {
        width: 44,
        height: 44,
        border: '2px solid var(--nacht-text)',
        borderRadius: 999,
        color: 'var(--nacht-text)',
        fontWeight: 800
      }
    }, "\u2190"), /*#__PURE__*/React.createElement("span", {
      className: "mono-label",
      style: {
        color: 'var(--funke-hell)'
      }
    }, phase === 'lesen' ? 'Lese Dokument …' : d.label), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 44
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px 24px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        height: '100%',
        maxHeight: 400,
        aspectRatio: typ === 'lstb' ? '3/4.2' : '3/4',
        maxWidth: '100%'
      }
    }, /*#__PURE__*/React.createElement("div", {
      "aria-hidden": "true",
      style: {
        position: 'absolute',
        inset: 18,
        background: '#f4efe2',
        borderRadius: 8,
        transform: phase === 'lesen' ? 'rotate(0deg)' : 'rotate(-2deg)',
        transition: 'transform 0.4s var(--feder)',
        padding: 16
      }
    }, /*#__PURE__*/React.createElement("i", {
      style: {
        display: 'block',
        height: 6,
        background: '#c9c2ae',
        margin: '0 0 10px',
        borderRadius: 3,
        width: '70%'
      }
    }), /*#__PURE__*/React.createElement("i", {
      style: {
        display: 'block',
        height: 6,
        background: '#c9c2ae',
        margin: '0 0 10px',
        borderRadius: 3
      }
    }), /*#__PURE__*/React.createElement("i", {
      style: {
        display: 'block',
        height: 6,
        background: '#c9c2ae',
        margin: '0 0 10px',
        borderRadius: 3,
        width: '55%'
      }
    }), /*#__PURE__*/React.createElement("i", {
      style: {
        display: 'block',
        height: 6,
        background: '#c9c2ae',
        borderRadius: 3,
        width: '40%'
      }
    })), [{
      top: 0,
      left: 0,
      borderWidth: '5px 0 0 5px'
    }, {
      top: 0,
      right: 0,
      borderWidth: '5px 5px 0 0'
    }, {
      bottom: 0,
      left: 0,
      borderWidth: '0 0 5px 5px'
    }, {
      bottom: 0,
      right: 0,
      borderWidth: '0 5px 5px 0'
    }].map((p, n) => /*#__PURE__*/React.createElement("i", {
      key: n,
      "aria-hidden": "true",
      style: {
        position: 'absolute',
        width: 34,
        height: 34,
        borderStyle: 'solid',
        borderColor: 'var(--funke)',
        borderRadius: 4,
        ...p
      }
    })), phase === 'lesen' && /*#__PURE__*/React.createElement("i", {
      "aria-hidden": "true",
      className: "fx-scanlinie"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '0 24px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        flex: 'none'
      }
    }, phase === 'kamera' && /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8
      },
      role: "tablist",
      "aria-label": "Scan-Typ w\xE4hlen"
    }, Object.entries(SCAN_DATEN).map(([k, v]) => /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => setTyp(k),
      "aria-pressed": typ === k,
      style: {
        minHeight: 40,
        padding: '0 16px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        border: '2px solid ' + (typ === k ? 'var(--funke)' : 'var(--nacht-karte)'),
        background: typ === k ? 'var(--funke)' : 'transparent',
        color: typ === k ? '#191b12' : 'var(--nacht-text)'
      }
    }, k === 'beleg' ? 'Beleg' : 'Lohnsteuerbescheinigung'))), phase === 'kamera' ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setPhase('lesen'),
      "aria-label": "Ausl\xF6sen",
      style: {
        width: 64,
        height: 64,
        borderRadius: 999,
        background: 'var(--funke)',
        border: '4px solid var(--nacht-text)',
        boxShadow: '0 0 0 4px var(--funke-tinte)',
        flex: 'none'
      }
    }), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setQuelle('datei');
        setPhase('lesen');
      },
      style: {
        minHeight: 44,
        padding: '0 18px',
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 700,
        border: '2px solid var(--nacht-karte)',
        color: 'var(--nacht-text)',
        background: 'transparent'
      }
    }, "Ohne Kamera: PDF oder Foto hochladen")) : /*#__PURE__*/React.createElement("span", {
      className: "mono-label",
      style: {
        color: 'var(--funke-hell)'
      }
    }, quelle === 'datei' ? 'Lese PDF … ' : '', typ === 'lstb' ? 'Brutto · Lohnsteuer · SV-Beiträge …' : 'Betrag · Datum · Aussteller …'), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        opacity: 0.6,
        textAlign: 'center'
      }
    }, "Verschl\xFCsselt verarbeitet, nur f\xFCr deine Erkl\xE4rung \u2014 l\xF6schbar mit einem Tap. PDF, JPG und PNG \u2014 auch mehrseitig.")));
  }
  if (phase === 'vorschlag') {
    return /*#__PURE__*/React.createElement("div", {
      className: "fx-schritt",
      key: "vorschlag"
    }, /*#__PURE__*/React.createElement("div", {
      className: "appbar"
    }, /*#__PURE__*/React.createElement("h1", null, "Gefunden."), /*#__PURE__*/React.createElement(Sticker, {
      style: {
        fontSize: 13
      }
    }, typ === 'lstb' ? '1 Bescheinigung' : '1 Beleg')), /*#__PURE__*/React.createElement("div", {
      className: "fk-karte"
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        fontSize: 15
      }
    }, d.titel), d.kv.map(([k, v]) => /*#__PURE__*/React.createElement("div", {
      key: k,
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        borderBottom: '1.5px dashed var(--linie-weich)',
        padding: '6px 0',
        fontSize: 13
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--tinte-2)'
      }
    }, k), /*#__PURE__*/React.createElement("b", {
      className: "num"
    }, v))), /*#__PURE__*/React.createElement("div", {
      className: "fk-ai-karte",
      "data-ai": "true",
      style: {
        margin: '12px 0 0',
        padding: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement(AiChip, null, "Vorschlag \xB7 ", d.konf, " %"), /*#__PURE__*/React.createElement("b", {
      style: {
        fontSize: 14,
        color: 'var(--ki-tinte)'
      }
    }, d.ziel)), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '8px 0 10px',
        fontSize: 13,
        color: 'var(--ki-tinte)'
      }
    }, d.weil), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variante: "leise",
      style: {
        minHeight: 42,
        width: 'auto'
      },
      onClick: () => setPhase('fertig')
    }, d.cta), /*#__PURE__*/React.createElement(Button, {
      variante: "ghost",
      style: {
        minHeight: 42,
        width: 'auto'
      },
      onClick: onZurueck
    }, "Trifft nicht zu")))));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-schritt",
    key: "fertig",
    style: {
      textAlign: 'center',
      paddingTop: 60
    }
  }, /*#__PURE__*/React.createElement(Sticker, {
    style: {
      fontSize: 16
    }
  }, d.sticker), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 36,
      fontWeight: 800,
      margin: '18px 0 8px'
    }
  }, d.titelFertig), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 24px',
      color: 'var(--tinte-2)'
    }
  }, d.fertigText), /*#__PURE__*/React.createElement(Button, {
    onClick: () => setPhase('kamera')
  }, "N\xE4chstes Dokument scannen"), /*#__PURE__*/React.createElement(Button, {
    variante: "ghost",
    style: {
      marginTop: 10
    },
    onClick: onZurueck
  }, "Fertig"));
}
Object.assign(window, {
  FunkeScan
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Scan.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Statistik.jsx
try { (() => {
/* Statistik — alles Wichtige über die Jahre, skalierbar:
   feste Slots statt endloser Listen (letzte 5 Jahre als Balken, Rest aggregiert;
   Top-4-Kategorien + Sheet für alle; genau 3 Rekord-Karten). */
const {
  Chip,
  Pill,
  Sticker,
  Sheet,
  HerkunftsChip
} = window.FinanzoFunkeDesignSystem_7e417e;

/* Bundle-sicher: im _ds_bundle wird diese Datei vor demo-daten.js evaluiert — Fallback statt Crash */
const FD = window.FunkeDemo || {
  statistik: {
    jahre: [{
      jahr: 2025,
      erstattung: 0,
      gezahlt: 0
    }],
    aelter: {
      von: 2019,
      bis: 2021,
      summe: 0,
      gezahlt: 0
    }
  },
  formatEuro: n => n.toLocaleString('de-DE') + ' €',
  formatZahl: n => n.toLocaleString('de-DE')
};
const STAT_JAHRE = FD.statistik.jahre;
const STAT_AELTER = FD.statistik.aelter; // aggregiert — skaliert für beliebig viele Jahre
const ANZ_JAHRE = STAT_JAHRE.length + (STAT_AELTER.bis - STAT_AELTER.von + 1);
const LETZTES = STAT_JAHRE[STAT_JAHRE.length - 1].jahr;
const STAT_KATEGORIEN = [{
  name: 'Pendeln & Arbeitsweg',
  summe: 6420
}, {
  name: 'Homeoffice',
  summe: 2890
}, {
  name: 'Fortbildung',
  summe: 2140
}, {
  name: 'Arbeitsmittel',
  summe: 1370
}, {
  name: 'Spenden',
  summe: 780
}, {
  name: 'Versicherungen',
  summe: 640
}, {
  name: 'Umzug',
  summe: 410
}];

/* Bilanz: Jahr vs. Vorjahr je Kategorie — UI zeigt IMMER genau 3 größte Bewegungen
   + „Stabil"-Zeile; vollständige Bilanz im Sheet. Skaliert mit beliebig vielen Kategorien. */
const STAT_BILANZ = [{
  name: 'Fortbildung',
  jetzt: 890,
  vorjahr: 340
}, {
  name: 'Homeoffice',
  jetzt: 480,
  vorjahr: 620
}, {
  name: 'Arbeitsmittel',
  jetzt: 399,
  vorjahr: 180
}, {
  name: 'Pendeln & Arbeitsweg',
  jetzt: 1831,
  vorjahr: 1790
}, {
  name: 'Spenden',
  jetzt: 150,
  vorjahr: 150
}, {
  name: 'Versicherungen',
  jetzt: 84,
  vorjahr: 92
}];
const eur = FD.formatEuro;
function FunkeStatistik({
  onZurueck
}) {
  const ruhig = React.useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [katOffen, setKatOffen] = React.useState(false);
  const [bilanzOffen, setBilanzOffen] = React.useState(false);
  const [metrik, setMetrik] = React.useState('erstattung'); // erstattung | gezahlt
  const [bereit, setBereit] = React.useState(ruhig); // Balken wachsen nach Mount
  const gesamt = STAT_JAHRE.reduce((s, j) => s + j.erstattung, 0) + STAT_AELTER.summe;
  const istGezahlt = metrik === 'gezahlt';
  const wert = j => istGezahlt ? j.gezahlt : j.erstattung;
  const max = Math.max(...STAT_JAHRE.map(wert));
  const aelterWert = istGezahlt ? STAT_AELTER.gezahlt : STAT_AELTER.summe;
  const bester = STAT_JAHRE.reduce((a, b) => b.erstattung > a.erstattung ? b : a);
  const topKat = STAT_KATEGORIEN.slice(0, 4);
  const restKat = STAT_KATEGORIEN.length - 4;
  const maxKat = STAT_KATEGORIEN[0].summe;
  const bilanz = STAT_BILANZ.map(b => ({
    ...b,
    delta: b.jetzt - b.vorjahr,
    pct: b.vorjahr ? Math.round((b.jetzt - b.vorjahr) / b.vorjahr * 100) : 100
  }));
  const bewegt = bilanz.filter(b => Math.abs(b.pct) >= 10).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const topBewegt = bewegt.slice(0, 3);
  const stabil = bilanz.length - topBewegt.length;

  /* Held-Zahl zählt hoch, Balken wachsen aus 0 — bei reduced-motion sofort fertig */
  const [zahl, setZahl] = React.useState(ruhig ? gesamt : 0);
  React.useEffect(() => {
    if (ruhig) return;
    let raf = requestAnimationFrame(() => setBereit(true));
    const start = performance.now();
    const dauer = 1100;
    const tick = t => {
      const p = Math.min(1, (t - start) / dauer);
      setZahl(Math.round(gesamt * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "appbar"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, onZurueck ? /*#__PURE__*/React.createElement("button", {
    onClick: onZurueck,
    "aria-label": "Zur\xFCck",
    style: {
      width: 44,
      height: 44,
      border: '1.5px solid var(--linie-weich)',
      borderRadius: 999,
      background: 'var(--karte)',
      fontWeight: 800
    }
  }, "\u2190") : /*#__PURE__*/React.createElement("a", {
    href: "index.html",
    "aria-label": "Zur\xFCck zur App",
    style: {
      width: 44,
      height: 44,
      border: '1.5px solid var(--linie-weich)',
      borderRadius: 999,
      background: 'var(--karte)',
      fontWeight: 800,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textDecoration: 'none',
      color: 'inherit'
    }
  }, "\u2190"), /*#__PURE__*/React.createElement("h1", null, "Statistik")), /*#__PURE__*/React.createElement(Pill, null, STAT_AELTER.von, "\u2013", LETZTES)), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte nacht"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--funke-hell)'
    }
  }, "Zur\xFCckgeholt insgesamt"), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 52,
      color: 'var(--funke)',
      lineHeight: 1.05,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, eur(zahl), /*#__PURE__*/React.createElement(Sticker, {
    style: {
      fontSize: 13
    }
  }, ANZ_JAHRE, " Jahre")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      opacity: 0.75
    }
  }, "\xD8 ", eur(Math.round(gesamt / ANZ_JAHRE)), " pro Jahr \u2014 Tendenz steigend"), /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: {
      regel: 'STAT-SUM-01',
      rechenweg: `Summe aller Bescheide ${STAT_AELTER.von}–${LETZTES}`
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, istGezahlt ? 'Steuer gezahlt pro Jahr' : 'Erstattung pro Jahr'), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    },
    role: "tablist",
    "aria-label": "Kennzahl w\xE4hlen"
  }, /*#__PURE__*/React.createElement(Chip, {
    aktiv: !istGezahlt,
    onClick: () => setMetrik('erstattung'),
    style: {
      minHeight: 30,
      fontSize: 12
    }
  }, "Erstattung"), /*#__PURE__*/React.createElement(Chip, {
    aktiv: istGezahlt,
    onClick: () => setMetrik('gezahlt'),
    style: {
      minHeight: 30,
      fontSize: 12
    }
  }, "Gezahlt"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 8,
      height: 150
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 0.8,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 6,
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: bereit ? `${aelterWert / 3 / max * 100}%` : '0%',
      minHeight: 10,
      background: 'var(--linie-weich)',
      border: '1.5px dashed var(--tinte-2)',
      borderRadius: '8px 8px 4px 4px',
      transition: 'height var(--t-auftritt) var(--feder)'
    },
    title: `${STAT_AELTER.von}–${STAT_AELTER.bis}: ${eur(aelterWert)}`
  }), /*#__PURE__*/React.createElement("span", {
    className: "mono-label num",
    style: {
      fontSize: 9
    }
  }, String(STAT_AELTER.von).slice(2), "\u2013", String(STAT_AELTER.bis).slice(2))), STAT_JAHRE.map((j, idx) => /*#__PURE__*/React.createElement("div", {
    key: j.jahr,
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 6,
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      fontSize: 10,
      color: !istGezahlt && j.jahr === bester.jahr ? 'var(--funke-tinte)' : 'var(--tinte-2)'
    }
  }, FD.formatZahl(wert(j))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: bereit ? `${wert(j) / max * 100}%` : '0%',
      minHeight: 12,
      background: istGezahlt ? 'var(--karte)' : j.jahr === bester.jahr ? 'var(--funke)' : 'var(--funke-weich)',
      border: 'var(--kontur) solid var(--tinte)',
      borderRadius: '8px 8px 4px 4px',
      boxShadow: !istGezahlt && j.jahr === bester.jahr ? 'var(--schatten-hart-s)' : 'none',
      transition: `height var(--t-auftritt) var(--feder) ${idx * 70}ms`
    },
    title: `${j.jahr}: ${eur(wert(j))}`
  }), /*#__PURE__*/React.createElement("span", {
    className: "mono-label num",
    style: {
      fontSize: 9
    }
  }, "'", String(j.jahr).slice(2))))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      margin: '10px 0 0'
    }
  }, istGezahlt ? `Lohnsteuer laut Bescheinigung — davon hast du dir ${eur(gesamt)} zurückgeholt.` : 'Ältere Jahre laufen links gebündelt zusammen — die Ansicht bleibt gleich groß, egal wie viele Jahre dazukommen.')), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, "Wo dein Geld herkommt"), /*#__PURE__*/React.createElement(Chip, {
    onClick: () => setKatOffen(true),
    style: {
      minHeight: 30,
      fontSize: 12
    }
  }, "Alle ", STAT_KATEGORIEN.length, " \u2192")), topKat.map((k, idx) => /*#__PURE__*/React.createElement("div", {
    key: k.name,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '5px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 150,
      flex: 'none',
      fontSize: 13,
      fontWeight: 600,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, k.name), /*#__PURE__*/React.createElement("span", {
    className: "fk-balken",
    style: {
      flex: 1,
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: bereit ? `${k.summe / maxKat * 100}%` : '0%',
      transition: `width 0.55s var(--zack) ${250 + idx * 90}ms`
    }
  })), /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      width: 64,
      textAlign: 'right',
      fontSize: 13,
      flex: 'none'
    }
  }, eur(k.summe)))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      margin: '8px 0 0'
    }
  }, "Top 4 \xFCber alle Jahre \u2014 ", restKat, " weitere im Detail.")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, "Bilanz \u2014 2026 vs. ", LETZTES), /*#__PURE__*/React.createElement(Chip, {
    onClick: () => setBilanzOffen(true),
    style: {
      minHeight: 30,
      fontSize: 12
    }
  }, "Alle ", bilanz.length, " \u2192")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      margin: '0 0 10px'
    }
  }, "Die drei gr\xF6\xDFten Bewegungen bei deinen Kosten \u2014 der Rest ist stabil."), topBewegt.map(b => /*#__PURE__*/React.createElement("div", {
    key: b.name,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '7px 0',
      borderBottom: '1.5px solid var(--linie-weich)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 26,
      height: 26,
      borderRadius: 8,
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 800,
      fontSize: 14,
      background: b.delta >= 0 ? 'var(--ok-weich)' : 'var(--warn-weich)',
      color: b.delta >= 0 ? 'var(--ok)' : 'var(--warn)',
      border: '1.5px solid currentColor'
    }
  }, b.delta >= 0 ? '↗' : '↘'), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 13,
      display: 'block',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, b.name), /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontSize: 11,
      color: 'var(--tinte-2)'
    }
  }, eur(b.vorjahr), " \u2192 ", eur(b.jetzt))), /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      fontSize: 13,
      flex: 'none',
      color: b.delta >= 0 ? 'var(--ok)' : 'var(--warn)'
    }
  }, b.delta >= 0 ? '+' : '', eur(b.delta)), /*#__PURE__*/React.createElement("span", {
    className: "num mono-label",
    style: {
      fontSize: 10,
      width: 42,
      textAlign: 'right',
      flex: 'none'
    }
  }, b.pct >= 0 ? '+' : '', b.pct, " %"))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      margin: '8px 0 0'
    }
  }, stabil, " Kategorien nahezu unver\xE4ndert (\xB110 %). Mehr absetzbare Kosten hei\xDFt meist: mehr Erstattung.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 10,
      marginBottom: 16
    }
  }, [{
    l: 'Bestes Jahr',
    w: String(bester.jahr),
    d: eur(bester.erstattung)
  }, {
    l: 'Größter Fund',
    w: '+412 €',
    d: 'Umzug 2024'
  }, {
    l: 'Berater-Funde',
    w: '23',
    d: 'übernommen'
  }].map(r => /*#__PURE__*/React.createElement("div", {
    key: r.l,
    style: {
      background: 'var(--karte)',
      border: 'var(--kontur) solid var(--tinte)',
      borderRadius: 'var(--radius-s)',
      boxShadow: 'var(--schatten-hart-s)',
      padding: '12px 10px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      fontSize: 9
    }
  }, r.l), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 22,
      margin: '2px 0'
    }
  }, r.w), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--tinte-2)'
    }
  }, r.d)))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      textAlign: 'center'
    }
  }, "Alle Werte aus deinen Bescheiden \u2014 Herkunft an jeder Zahl."), bilanzOffen && /*#__PURE__*/React.createElement(Sheet, {
    titel: `Bilanz 2026 vs. 2025 (${bilanz.length})`,
    onClose: () => setBilanzOffen(false)
  }, bilanz.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).map(b => /*#__PURE__*/React.createElement("div", {
    key: b.name,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 0',
      borderBottom: '1.5px solid var(--linie-weich)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14,
      minWidth: 0
    }
  }, b.name), /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      flex: 'none'
    }
  }, eur(b.vorjahr), " \u2192 ", eur(b.jetzt)), /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      width: 64,
      textAlign: 'right',
      fontSize: 13,
      flex: 'none',
      color: b.delta > 0 ? 'var(--ok)' : b.delta < 0 ? 'var(--warn)' : 'var(--tinte-2)'
    }
  }, b.delta > 0 ? '+' : '', b.delta === 0 ? '±0' : eur(b.delta)))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      margin: '12px 0 0'
    }
  }, "Gr\xFCn = mehr absetzbar als im Vorjahr, Amber = weniger. Sortiert nach Bewegung.")), katOffen && /*#__PURE__*/React.createElement(Sheet, {
    titel: `Alle Kategorien (${STAT_KATEGORIEN.length})`,
    onClose: () => setKatOffen(false)
  }, STAT_KATEGORIEN.map(k => /*#__PURE__*/React.createElement("div", {
    key: k.name,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 0',
      borderBottom: '1.5px solid var(--linie-weich)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14,
      minWidth: 0
    }
  }, k.name), /*#__PURE__*/React.createElement("span", {
    className: "fk-balken",
    style: {
      width: 110,
      display: 'block',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: `${k.summe / maxKat * 100}%`
    }
  })), /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      width: 64,
      textAlign: 'right',
      fontSize: 13,
      flex: 'none'
    }
  }, eur(k.summe)))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      margin: '12px 0 0'
    }
  }, "Sortiert nach Summe \xFCber alle Jahre.")));
}
Object.assign(window, {
  FunkeStatistik
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Statistik.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Uebertragen.jsx
try { (() => {
/* Übertragen (F6) — Zeile für Zeile mit Copy + Abhaken, Export-Kanäle. Bewusst KI-minimal. */
const {
  Button,
  Chip,
  Pill,
  HerkunftsChip,
  KiWert,
  Sheet,
  Toast,
  Banner
} = window.FinanzoFunkeDesignSystem_7e417e;
function FunkeUebertragen({
  zeilen,
  onToggle,
  onAbgabe
}) {
  const [detailZeile, setDetailZeile] = React.useState(null);
  /* Grenzgänger-Zeilen nur, wenn das Interview „Schweiz: Ja" ergab (Default: zeigen) */
  const gg = React.useMemo(() => {
    try {
      const a = JSON.parse(localStorage.getItem('funke.interview')) || {};
      return a.schweiz !== 'Nein';
    } catch (e) {
      return true;
    }
  }, []);
  const sichtbareZeilenGg = gg ? zeilen : zeilen.filter(z => z.anlage !== 'Anlage N-Gre');
  /* M5: KAP/V-Zeilen nur bei entsprechenden Interview-Angaben */
  const flags = React.useMemo(() => {
    try {
      const a = JSON.parse(localStorage.getItem('funke.interview')) || {};
      return {
        kap: a.einkuenfte === 'Kapitalerträge' || a.einkuenfte === 'Beides',
        verm: a.vermietung === 'einfach' || a.vermietung === 'mehrere',
        kinder: a.kinder && a.kinder !== 'Nein',
        rente: a.job === 'Rente'
      };
    } catch (e) {
      return {
        kap: false,
        verm: false,
        kinder: false,
        rente: false
      };
    }
  }, []);
  const sichtbareZeilen = sichtbareZeilenGg.filter(z => z.anlage === 'Anlage KAP' ? flags.kap : z.anlage === 'Anlage V' ? flags.verm : z.anlage === 'Anlage Kind' ? flags.kinder : z.anlage === 'Anlage R' ? flags.rente : true);
  /* Fix 2: Vorbereitungs-Modus — Abgabe blockiert, solange das Gewerbe fehlt */
  const gewVor = React.useMemo(() => {
    try {
      return localStorage.getItem('funke.gewerbeVorbereiten') === '1';
    } catch (e) {
      return false;
    }
  }, []);
  const anlagen = [...new Set(sichtbareZeilen.map(z => z.anlage))];
  const [anlage, setAnlage] = React.useState(anlagen[0]);
  const [toast, setToast] = React.useState('');
  const [ericOffen, setEricOffen] = React.useState(false);
  const [pruefOffen, setPruefOffen] = React.useState(false);
  const erledigt = sichtbareZeilen.filter(z => z.erledigt).length;
  const sichtbar = sichtbareZeilen.filter(z => z.anlage === anlage);
  /* Erledigtes kollabiert: ab 2 bestätigten Zeilen falten sie zu einer Zeile zusammen */
  const [fertigeOffen, setFertigeOffen] = React.useState(false);
  const fertige = sichtbar.filter(z => z.erledigt);
  const kollabiert = fertige.length >= 2 && !fertigeOffen;
  const zeigeZeilen = kollabiert ? sichtbar.filter(z => !z.erledigt) : sichtbar;
  function kopieren(wert) {
    try {
      navigator.clipboard.writeText(wert);
    } catch (e) {}
    setToast('Kopiert');
    setTimeout(() => setToast(''), 1200);
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "appbar"
  }, /*#__PURE__*/React.createElement("h1", null, "\xDCbertragen"), /*#__PURE__*/React.createElement(Pill, null, erledigt, "/", sichtbareZeilen.length, '\u00A0', "\xFCbertragen")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 16,
      overflowX: 'auto',
      scrollbarWidth: 'none'
    },
    role: "tablist",
    "aria-label": "Anlage w\xE4hlen"
  }, anlagen.map(a => /*#__PURE__*/React.createElement(Chip, {
    key: a,
    aktiv: a === anlage,
    onClick: () => {
      setAnlage(a);
      setFertigeOffen(false);
    },
    style: {
      flex: 'none'
    }
  }, a))), erledigt === sichtbareZeilen.length && sichtbareZeilen.length > 0 && (gewVor ? /*#__PURE__*/React.createElement(Banner, {
    art: "warnung"
  }, /*#__PURE__*/React.createElement("b", null, "Alles vorbereitet \u2014 Abgabe wartet."), " Dein Angestellten-Teil ist komplett. Abgegeben wird erst mit deinem Gewerbe \u2014 eine Erkl\xE4rung ist unteilbar.") : /*#__PURE__*/React.createElement("div", {
    className: "fk-karte nacht"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--funke-hell)'
    }
  }, "Alles best\xE4tigt"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 28,
      lineHeight: 1.1,
      margin: '6px 0 6px'
    }
  }, "Alle Zeilen \xFCbertragen."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 12px',
      fontSize: 13,
      opacity: 0.8
    }
  }, "In Mein ELSTER abgeschickt? Dann mach den Sack zu."), /*#__PURE__*/React.createElement(Button, {
    variante: "nacht",
    style: {
      borderColor: 'var(--funke)'
    },
    onClick: () => onAbgabe ? onAbgabe() : window.location.href = 'abgabe.html'
  }, "Ja, abgeschickt \u2192"))), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte"
  }, kollabiert && /*#__PURE__*/React.createElement("button", {
    onClick: () => setFertigeOffen(true),
    "aria-expanded": "false",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      textAlign: 'left',
      padding: '10px 0',
      borderBottom: '1.5px solid var(--linie-weich)',
      minHeight: 48,
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ok)',
      fontWeight: 800
    },
    "aria-hidden": "true"
  }, "\u2713"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", {
    className: "num"
  }, fertige.length), " best\xE4tigte Zeilen"), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      marginLeft: 'auto',
      color: 'var(--tinte-2)',
      fontSize: 12
    }
  }, "anzeigen \u25B8")), zeigeZeilen.map(z => /*#__PURE__*/React.createElement("div", {
    key: z.zeile,
    style: {
      borderBottom: '1.5px solid var(--linie-weich)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-mono)',
      fontSize: 12,
      color: 'var(--tinte-2)',
      width: 46,
      flex: 'none'
    }
  }, z.zeile), /*#__PURE__*/React.createElement("button", {
    onClick: () => setDetailZeile(detailZeile === z.zeile ? null : z.zeile),
    "aria-expanded": detailZeile === z.zeile,
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 14,
      textAlign: 'left',
      overflowWrap: 'break-word'
    }
  }, z.label, " ", /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: 'var(--tinte-2)',
      fontSize: 12
    }
  }, detailZeile === z.zeile ? '▾' : '▸')), /*#__PURE__*/React.createElement("b", {
    className: "num",
    style: {
      fontSize: 15,
      whiteSpace: 'nowrap'
    }
  }, z.erledigt ? z.wert : /*#__PURE__*/React.createElement(KiWert, null, z.wert)), /*#__PURE__*/React.createElement("button", {
    onClick: () => kopieren(z.wert),
    "aria-label": `${z.label} kopieren`,
    style: {
      width: 42,
      height: 42,
      border: '1.5px solid var(--linie-weich)',
      borderRadius: 12,
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--karte)'
    }
  }, "\u29C9"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onToggle(z.zeile),
    "aria-pressed": z.erledigt,
    "aria-label": `${z.label} als übertragen markieren`,
    className: "fx-check",
    style: {
      width: 28,
      height: 28,
      borderRadius: 8,
      flex: 'none',
      border: 'var(--kontur) solid var(--tinte)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 800,
      background: z.erledigt ? 'var(--funke)' : 'var(--karte)'
    }
  }, z.erledigt ? '✓' : '')), detailZeile === z.zeile && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 0 12px 56px'
    }
  }, /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: z.quelle
  })))), !kollabiert && fertige.length >= 2 && /*#__PURE__*/React.createElement("button", {
    onClick: () => setFertigeOffen(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      textAlign: 'left',
      padding: '10px 0',
      minHeight: 44,
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Best\xE4tigte einklappen ", /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u25BE")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      margin: '10px 0 0'
    }
  }, "Gestrichelte Werte hat der Berater bef\xFCllt \u2014 Abhaken best\xE4tigt sie. Zeile antippen zeigt die Herkunft.")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setPruefOffen(true),
    className: "fk-karte",
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", null, "Pr\xFCfen vor Abgabe"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "1 Konflikt \xB7 ", sichtbareZeilen.length - erledigt, " unbest\xE4tigte Werte \xB7 1 Beleg im Posteingang")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800
    },
    "aria-hidden": "true"
  }, "\u2192")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      padding: 0,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mono-label",
    style: {
      padding: '12px 16px 4px'
    }
  }, "Export"), [{
    l: 'Übertragungshilfe (diese Ansicht)',
    c: 'kostenlos'
  }, {
    l: 'Listen-PDF',
    c: 'kostenlos'
  }, {
    l: 'Amtliche Formulare (PDF)',
    c: 'kostenlos'
  }].map(e => /*#__PURE__*/React.createElement("button", {
    key: e.l,
    onClick: () => {
      setToast(e.l === 'Übertragungshilfe (diese Ansicht)' ? 'Du bist bereits hier' : 'Demo — Export startet');
      setTimeout(() => setToast(''), 1200);
    },
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      textAlign: 'left',
      padding: '12px 16px',
      borderTop: '1.5px solid var(--linie-weich)',
      minHeight: 52,
      fontSize: 15
    }
  }, /*#__PURE__*/React.createElement("span", null, e.l), /*#__PURE__*/React.createElement(Chip, {
    style: {
      minHeight: 28,
      fontSize: 12
    }
  }, e.c))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setEricOffen(true),
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      textAlign: 'left',
      padding: '12px 16px',
      borderTop: '1.5px solid var(--linie-weich)',
      minHeight: 52,
      fontSize: 15
    }
  }, /*#__PURE__*/React.createElement("span", null, "ERiC-gepr\xFCft \xFCbermitteln"), /*#__PURE__*/React.createElement(Chip, {
    style: {
      minHeight: 28,
      fontSize: 12
    }
  }, "Kommt \xB7 2.0"))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)'
    }
  }, "Alle Kan\xE4le nutzen dieselben gepr\xFCften Werte \u2014 du w\xE4hlst nur die Form."), pruefOffen && /*#__PURE__*/React.createElement(Sheet, {
    titel: "Pr\xFCf-Report",
    onClose: () => setPruefOffen(false)
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 0,
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Was wir vor der Abgabe pr\xFCfen \u2014 Stand jetzt:"), [{
    ok: false,
    text: '1 Konflikt: Beleg (480 €) ≠ Eingabe (500 €) bei „Monitor" — auflösen unter Belege, vorher geht nichts raus'
  }, {
    ok: false,
    text: '1 Beleg wartet unzugeordnet im Posteingang — zuordnen oder bewusst übergehen'
  }, {
    ok: true,
    text: 'Aus 2025 Übernommenes ist bestätigt — nichts Graues mehr offen'
  }, {
    ok: true,
    text: 'Keine Widersprüche zwischen den Anlagen'
  }, {
    ok: true,
    text: 'Alle Pflichtfelder haben Werte mit Herkunft'
  }, {
    ok: sichtbareZeilen.length - erledigt === 0,
    text: `${sichtbareZeilen.length - erledigt} gestrichelte Werte unbestätigt — Abhaken bestätigt sie`
  }, {
    ok: false,
    text: 'IBAN für die Erstattung fehlt (Profil → Stammdaten)'
  }, ...(gewVor ? [{
    ok: false,
    text: 'Gewerbe fehlt — eine Erklärung ist unteilbar; Abgabe erst, wenn Anlage G/EÜR drin ist'
  }] : [])].map((c, n) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'baseline',
      borderBottom: '1.5px solid var(--linie-weich)',
      padding: '10px 0',
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800,
      color: c.ok ? 'var(--ok)' : 'var(--warn)',
      flex: 'none'
    }
  }, c.ok ? '✓' : '!'), /*#__PURE__*/React.createElement("span", null, c.text))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Einreichbar, sobald die offenen Punkte erledigt sind \u2014 wir halten nichts zur\xFCck, was du nicht siehst."), /*#__PURE__*/React.createElement(Button, {
    onClick: () => setPruefOffen(false)
  }, "Verstanden")), ericOffen && /*#__PURE__*/React.createElement(Sheet, {
    titel: "ERiC-gepr\xFCft \xFCbermitteln",
    onClose: () => setEricOffen(false)
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 0,
      fontSize: 14
    }
  }, "Deine Werte werden gegen die ", /*#__PURE__*/React.createElement("b", null, "offiziellen Pr\xFCfregeln der Finanzverwaltung"), " validiert \u2014 und sp\xE4ter direkt \xFCbermittelt, ohne Abtippen. Mit ", /*#__PURE__*/React.createElement("b", null, "Hersteller-Zertifikat"), ": einmal identifizieren, nie wieder eine Zertifikatsdatei pflegen. Ehrlich: Unser ELSTER-Zertifikat steht noch aus \u2014 der Kanal kommt mit Version 1.x."), /*#__PURE__*/React.createElement("ul", {
    style: {
      paddingLeft: 18,
      color: 'var(--tinte-2)',
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("li", null, "Gepr\xFCft = nachweislich einreichbar, nicht nur \u201Esieht richtig aus\""), /*#__PURE__*/React.createElement("li", null, "\xDCbermittlung immer nur nach deiner ausdr\xFCcklichen Best\xE4tigung"), /*#__PURE__*/React.createElement("li", null, "Kein Abtippen mehr \u2014 die letzte Meile entf\xE4llt")), /*#__PURE__*/React.createElement(Button, {
    onClick: () => setEricOffen(false)
  }, "Vormerken \u2014 wir sagen Bescheid")), toast && /*#__PURE__*/React.createElement(Toast, {
    text: toast
  }));
}
Object.assign(window, {
  FunkeUebertragen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Uebertragen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Veranlagung.jsx
try { (() => {
/* Günstigerprüfung (M1) — Zusammen vs. Einzeln, zwei Zahlen, klare Empfehlung.
   Beide Tarife voll durchgerechnet — kein KI-Output, daher KEIN Violett. */
const {
  Button,
  Pill,
  Chip,
  HerkunftsChip,
  Sticker,
  Begriff
} = window.FinanzoFunkeDesignSystem_7e417e;
function FunkeVeranlagung({
  onZurueck,
  onFrage
}) {
  const {
    zusammen,
    alex,
    sam,
    einzeln
  } = window.FunkeDemo.veranlagung;
  const [kopplung, setKopplung] = React.useState('offen'); /* ADR-006: offen → eingeladen */
  return /*#__PURE__*/React.createElement("div", {
    className: "fx-bau"
  }, /*#__PURE__*/React.createElement("div", {
    className: "appbar",
    style: {
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onZurueck,
    "aria-label": "Zur\xFCck",
    style: {
      width: 44,
      height: 44,
      border: 'var(--kontur) solid var(--tinte)',
      borderRadius: 999,
      background: 'var(--karte)',
      boxShadow: 'var(--schatten-hart-s)',
      fontWeight: 800,
      flex: 'none'
    }
  }, "\u2190"), /*#__PURE__*/React.createElement("h1", {
    style: {
      marginRight: 'auto'
    }
  }, "Veranlagung"), /*#__PURE__*/React.createElement(Pill, null, "2026")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte nacht"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label",
    style: {
      color: 'var(--funke-hell)'
    }
  }, "Empfehlung \u2014 beide Wege gerechnet"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 34,
      lineHeight: 1.1,
      margin: '8px 0 6px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, "Zusammen veranlagen.", /*#__PURE__*/React.createElement(Sticker, {
    style: {
      fontSize: 14
    }
  }, "+", (zusammen - einzeln).toLocaleString('de-DE'), " \u20AC")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      opacity: 0.8
    }
  }, "Stand heute \u2014 3 Angaben sind noch offen, die Empfehlung rechnet bei jeder \xC4nderung neu.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      marginBottom: 0,
      background: 'var(--funke-weich)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, "Zusammen"), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 30,
      lineHeight: 1.1,
      margin: '6px 0 2px'
    }
  }, zusammen.toLocaleString('de-DE'), " \u20AC"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--ok)',
      fontWeight: 700
    }
  }, "\u2713 empfohlen")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      marginBottom: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono-label"
  }, "Einzeln"), /*#__PURE__*/React.createElement("div", {
    className: "num",
    style: {
      fontFamily: 'var(--schrift-display)',
      fontWeight: 800,
      fontSize: 30,
      lineHeight: 1.1,
      margin: '6px 0 2px',
      color: 'var(--tinte-2)'
    }
  }, einzeln.toLocaleString('de-DE'), " \u20AC"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Alex ", window.FunkeDemo.formatEuro(alex), " \xB7 Sam ", window.FunkeDemo.formatEuro(sam)))), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '14px 0'
    }
  }, /*#__PURE__*/React.createElement(HerkunftsChip, {
    quelle: {
      regel: 'GÜNST-01 · Splitting-/Grundtarif 2026',
      rechenweg: 'Beide Tarife vollständig durchgerechnet — kein Näherungswert'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte",
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 14
    }
  }, "Gemeinsam mit Sam"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, kopplung === 'eingeladen' ? 'Einladung raus — sobald Sam annimmt, sind eure Steuerjahre 2026 gekoppelt.' : 'Zwei Steuerjahre, eine Erklärung: Sam pflegt die eigenen Zahlen selbst — ihr seht nur das gemeinsame Ergebnis.')), kopplung === 'eingeladen' ? /*#__PURE__*/React.createElement(Chip, {
    variante: "src",
    style: {
      flex: 'none'
    }
  }, "Wartet auf Sam") : /*#__PURE__*/React.createElement(Chip, {
    onClick: () => setKopplung('eingeladen'),
    style: {
      flex: 'none'
    }
  }, "Sam einladen")), /*#__PURE__*/React.createElement("div", {
    className: "fk-karte"
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 14
    }
  }, "Warum zusammen?"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      fontSize: 13,
      color: 'var(--tinte-2)'
    }
  }, "Euer Einkommensunterschied ist gro\xDF genug, dass der", ' ', /*#__PURE__*/React.createElement(Begriff, {
    titel: "Splittingtarif",
    erklaerung: "Der Splittingtarif tut so, als h\xE4ttet ihr beide exakt gleich viel verdient \u2014 und besteuert genau das. Klingt unspektakul\xE4r, spart aber richtig Geld, wenn einer von euch mehr verdient. Je gr\xF6\xDFer euer Unterschied, desto gr\xF6\xDFer der Bonus.",
    beispiel: "60.000 \u20AC + 20.000 \u20AC \u2192 oft mehrere hundert Euro weniger",
    frage: "Wie funktioniert der Splittingtarif?",
    onFrage: onFrage
  }, "Splittingtarif"), ' ', "mehr bringt als zwei Grundtarife. Kippt das (z. B. durch Lohnersatz mit Progressionsvorbehalt), sagen wir es dir hier zuerst.")), /*#__PURE__*/React.createElement(Button, {
    onClick: onZurueck
  }, "\xDCbernehmen: zusammen veranlagen"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--tinte-2)',
      textAlign: 'center'
    }
  }, "Ihr gebt trotzdem eine gemeinsame Erkl\xE4rung ab \u2014 die Wahl steht im Hauptvordruck und bleibt bis zum Bescheid \xE4nderbar."));
}
Object.assign(window, {
  FunkeVeranlagung
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Veranlagung.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/demo-daten.js
try { (() => {
/* EINE Quelle für jede Zahl, die auf mehr als einem Screen auftaucht — Regel 10 (guidelines/tech-direktion.md).
   Screens lesen window.FunkeDemo; Formatierung ausschließlich über formatZahl/formatEuro/formatEuroCent. */
window.FunkeDemo = {
  jahr: 2026,
  schaetzung: 1407,
  // Cockpit-Held: Basis vor Berater-Funden
  offeneAngaben: 3,
  // Cockpit + Veranlagung: „3 Angaben offen"
  minutenOffen: 9,
  // ehrliche Restzeit: 3 Lücken × ~3 min
  gg: {
    uebernommen: 7,
    markiert: [2, 3, 9, 16, 22],
    max: 60
  },
  // → 12/60 überall
  veranlagung: {
    zusammen: 2134,
    alex: 1410,
    sam: 312
  },
  // einzeln = alex + sam
  bescheid: {
    jahr: 2025,
    betrag: 1444,
    berechnet: 1487,
    frist: '18. August 2026'
  },
  // delta = betrag − berechnet
  statistik: {
    jahre: [{
      jahr: 2022,
      erstattung: 640,
      gezahlt: 9840
    }, {
      jahr: 2023,
      erstattung: 810,
      gezahlt: 10620
    }, {
      jahr: 2024,
      erstattung: 987,
      gezahlt: 11310
    }],
    aelter: {
      von: 2019,
      bis: 2021,
      summe: 1130,
      gezahlt: 26400
    }
  },
  formatZahl(n) {
    return n.toLocaleString('de-DE');
  },
  formatEuro(n) {
    return n.toLocaleString('de-DE') + ' €';
  },
  formatEuroCent(n) {
    return n.toLocaleString('de-DE', {
      minimumFractionDigits: 2
    }) + ' €';
  }
};
/* Abgeleitet, nie doppelt gepflegt: */
window.FunkeDemo.veranlagung.einzeln = window.FunkeDemo.veranlagung.alex + window.FunkeDemo.veranlagung.sam;
window.FunkeDemo.bescheid.delta = window.FunkeDemo.bescheid.betrag - window.FunkeDemo.bescheid.berechnet;
window.FunkeDemo.gg.stand = window.FunkeDemo.gg.uebernommen + window.FunkeDemo.gg.markiert.length;
window.FunkeDemo.statistik.jahre.push({
  jahr: window.FunkeDemo.bescheid.jahr,
  erstattung: window.FunkeDemo.bescheid.betrag,
  gezahlt: 11980
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/demo-daten.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Pill = __ds_scope.Pill;

__ds_ns.AiChip = __ds_scope.AiChip;

__ds_ns.BeraterLeiste = __ds_scope.BeraterLeiste;

__ds_ns.HerkunftsChip = __ds_scope.HerkunftsChip;

__ds_ns.KiWert = __ds_scope.KiWert;

__ds_ns.Balken = __ds_scope.Balken;

__ds_ns.Banner = __ds_scope.Banner;

__ds_ns.Ring = __ds_scope.Ring;

__ds_ns.Sticker = __ds_scope.Sticker;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Feld = __ds_scope.Feld;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Option = __ds_scope.Option;

__ds_ns.SchalterZeile = __ds_scope.SchalterZeile;

__ds_ns.TabBar = __ds_scope.TabBar;

__ds_ns.Sheet = __ds_scope.Sheet;

__ds_ns.Begriff = __ds_scope.Begriff;

})();
