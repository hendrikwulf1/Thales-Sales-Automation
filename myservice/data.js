/* MyService – Stammdaten: Gewerke, Problem-Katalog (KI-Wissensbasis), Betriebe.
   Die Grundpreise der Betriebe sind das Fundament der KI-Preisschätzung:
   Klassifiziertes Problem -> prices[problemId] je Betrieb. */

const GEWERKE = {
  klempner:   { label: "Klempner / Sanitär", icon: "🔧" },
  elektriker: { label: "Elektriker",         icon: "⚡" },
  maler:      { label: "Maler & Trockenbau", icon: "🎨" },
  tischler:   { label: "Tischler",           icon: "🪚" },
  gaertner:   { label: "Gärtner",            icon: "🌿" },
  heizung:    { label: "Heizung & Klima",    icon: "🔥" },
};

/* Problem-Katalog = das "Klassifizierungsmodell" der Demo.
   keywords werden gegen den Text-Prompt gematcht, fotoLabels gegen die
   (simulierte) Bildanalyse. richtpreis dient nur als Fallback-Anzeige. */
const PROBLEME = [
  { id: "rohr_verstopft", gewerk: "klempner", label: "Abfluss / Rohr verstopft",
    keywords: ["verstopft", "abfluss", "verstopfung", "gluckert", "läuft nicht ab", "laeuft nicht ab", "rohr frei", "siphon", "stau im rohr"],
    fotoLabels: ["abfluss", "rohr", "siphon", "spüle"], dauer: "1–2 Std.", richtpreis: 120 },
  { id: "wasserhahn_tropft", gewerk: "klempner", label: "Wasserhahn tropft / defekt",
    keywords: ["wasserhahn", "tropft", "armatur", "mischbatterie", "hahn", "tropfen"],
    fotoLabels: ["wasserhahn", "armatur"], dauer: "ca. 1 Std.", richtpreis: 90 },
  { id: "rohrbruch", gewerk: "klempner", label: "Rohrbruch / Leitung undicht",
    keywords: ["rohrbruch", "undicht", "leck", "wasserschaden", "leitung kaputt", "wasser tritt aus", "nass"],
    fotoLabels: ["rohrbruch", "wasserfleck", "leck"], dauer: "2–4 Std.", richtpreis: 260 },
  { id: "steckdose_defekt", gewerk: "elektriker", label: "Steckdose / Schalter defekt",
    keywords: ["steckdose", "schalter", "kein strom", "funkt", "strom weg", "wackelkontakt"],
    fotoLabels: ["steckdose", "schalter"], dauer: "ca. 1 Std.", richtpreis: 95 },
  { id: "lampe_montieren", gewerk: "elektriker", label: "Lampe / Leuchte montieren",
    keywords: ["lampe", "leuchte", "deckenlampe", "anschließen", "anschliessen", "montieren licht"],
    fotoLabels: ["lampe", "decke"], dauer: "ca. 1 Std.", richtpreis: 70 },
  { id: "sicherung_fehler", gewerk: "elektriker", label: "Sicherung fliegt raus / Fehlersuche",
    keywords: ["sicherung", "fi", "fliegt raus", "kurzschluss", "fehlerstrom", "verteilerkasten"],
    fotoLabels: ["sicherungskasten", "verteiler"], dauer: "1–3 Std.", richtpreis: 130 },
  { id: "wand_loch", gewerk: "maler", label: "Loch / Riss in der Wand reparieren",
    keywords: ["loch in der wand", "loch", "riss", "dübel", "duebel", "spachteln", "putz", "bohrloch"],
    fotoLabels: ["wand", "loch", "riss"], dauer: "1–2 Std.", richtpreis: 110 },
  { id: "waende_streichen", gewerk: "maler", label: "Wände streichen (pro Raum)",
    keywords: ["streichen", "wandfarbe", "weißeln", "weisseln", "anstrich", "malern", "tapezieren"],
    fotoLabels: ["wand", "raum", "farbe"], dauer: "0,5–1 Tag", richtpreis: 320 },
  { id: "schimmel", gewerk: "maler", label: "Schimmel entfernen & sanieren",
    keywords: ["schimmel", "schwarze flecken", "feuchte wand", "stockflecken"],
    fotoLabels: ["schimmel", "flecken"], dauer: "2–4 Std.", richtpreis: 180 },
  { id: "tuer_klemmt", gewerk: "tischler", label: "Tür klemmt / schließt nicht",
    keywords: ["tür klemmt", "tuer klemmt", "tür schließt", "tuer schliesst", "zarge", "tür", "tuer", "scharnier"],
    fotoLabels: ["tür", "zarge"], dauer: "ca. 1 Std.", richtpreis: 85 },
  { id: "moebel_montage", gewerk: "tischler", label: "Möbel montieren / aufbauen",
    keywords: ["möbel", "moebel", "aufbauen", "schrank", "regal", "montage", "küche aufbauen", "kueche aufbauen"],
    fotoLabels: ["schrank", "regal", "karton"], dauer: "1–3 Std.", richtpreis: 110 },
  { id: "parkett_reparatur", gewerk: "tischler", label: "Parkett / Dielen reparieren",
    keywords: ["parkett", "diele", "holzboden", "kratzer im boden", "knarrt"],
    fotoLabels: ["parkett", "boden"], dauer: "2–4 Std.", richtpreis: 210 },
  { id: "hecke_schneiden", gewerk: "gaertner", label: "Hecke schneiden",
    keywords: ["hecke", "heckenschnitt", "schneiden", "buchsbaum", "thuja"],
    fotoLabels: ["hecke", "garten"], dauer: "2–3 Std.", richtpreis: 140 },
  { id: "rasen_maehen", gewerk: "gaertner", label: "Rasen mähen / Gartenpflege",
    keywords: ["rasen", "mähen", "maehen", "gartenpflege", "unkraut", "vertikutieren"],
    fotoLabels: ["rasen", "garten"], dauer: "1–2 Std.", richtpreis: 60 },
  { id: "baum_faellen", gewerk: "gaertner", label: "Baum fällen / stutzen",
    keywords: ["baum", "fällen", "faellen", "äste", "aeste", "stutzen", "sturmschaden"],
    fotoLabels: ["baum", "äste"], dauer: "0,5–1 Tag", richtpreis: 380 },
  { id: "heizung_ausfall", gewerk: "heizung", label: "Heizung ausgefallen / Störung",
    keywords: ["heizung kalt", "heizung ausgefallen", "heizung", "kein warmwasser", "therme", "störung", "stoerung", "fehlercode"],
    fotoLabels: ["heizung", "therme", "kessel"], dauer: "1–3 Std.", richtpreis: 190 },
  { id: "heizkoerper_entlueften", gewerk: "heizung", label: "Heizkörper entlüften / gluckert",
    keywords: ["entlüften", "entlueften", "heizkörper gluckert", "heizkoerper", "wird nicht warm"],
    fotoLabels: ["heizkörper"], dauer: "ca. 1 Std.", richtpreis: 75 },
  { id: "thermostat_wechsel", gewerk: "heizung", label: "Thermostat tauschen",
    keywords: ["thermostat", "regler", "smartes thermostat", "ventil"],
    fotoLabels: ["thermostat", "heizkörper"], dauer: "ca. 1 Std.", richtpreis: 120 },
];

/* Beispiel-Fotos für die Demo der Bilderkennung (deterministisch). */
const DEMO_FOTOS = [
  { id: "foto_rohr",   label: "Kaputtes Rohr unter der Spüle", vision: ["rohr", "siphon", "leck"], emoji: "🚰" },
  { id: "foto_wand",   label: "Loch in der Wand",              vision: ["wand", "loch"], emoji: "🧱" },
  { id: "foto_heizung",label: "Heizung mit Fehlercode",        vision: ["heizung", "therme"], emoji: "🌡️" },
  { id: "foto_hecke",  label: "Verwilderte Hecke",             vision: ["hecke", "garten"], emoji: "🌳" },
];

/* Betriebe. pos = Koordinaten in km auf der Stadtkarte (0–10).
   prices = Grundpreise (Fundament der KI-Schätzung), anfahrt = Pauschale.
   interface = gewünschter Anfrage-Kanal des Betriebs. */
const BETRIEBE_SEED = [
  { id: "b1", name: "Rohrfrei Muster GmbH", gewerk: "klempner", gegruendet: 2004,
    pos: { x: 3.4, y: 4.1 }, premium: true, anfahrt: 25, interface: "crm",
    rating: 4.8, slotsProTag: ["08:00", "10:30", "14:00"],
    agb: "Es gelten die Ausführungsbedingungen der Rohrfrei Muster GmbH: Anfahrt wird pauschal berechnet, Gewährleistung 24 Monate auf Arbeitsleistung.",
    prices: { rohr_verstopft: 119, wasserhahn_tropft: 89, rohrbruch: 249 },
    reviews: [
      { autor: "S. Krüger", sterne: 5, text: "Abfluss in 40 Minuten frei, Preis wie in der App geschätzt." },
      { autor: "M. Yilmaz", sterne: 5, text: "Pünktlich, sauber, faire Rechnung über die Plattform." },
      { autor: "T. Behrens", sterne: 4, text: "Gute Arbeit, Termin musste einmal verschoben werden." },
    ] },
  { id: "b2", name: "Sanitär Petersen & Sohn", gewerk: "klempner", gegruendet: 1988,
    pos: { x: 6.8, y: 6.2 }, premium: false, anfahrt: 19, interface: "email",
    rating: 4.6, slotsProTag: ["09:00", "13:00", "16:30"],
    agb: "Standard-AGB Sanitär Petersen & Sohn: Zahlung über Plattform-Treuhand, Nachbesserung innerhalb von 14 Tagen kostenlos.",
    prices: { rohr_verstopft: 135, wasserhahn_tropft: 79, rohrbruch: 289 },
    reviews: [
      { autor: "A. Novak", sterne: 5, text: "Familienbetrieb, sehr gründlich." },
      { autor: "J. Peters", sterne: 4, text: "Etwas teurer, aber top Qualität." },
    ] },
  { id: "b3", name: "Blitz-Klempner 24", gewerk: "klempner", gegruendet: 2019,
    pos: { x: 5.1, y: 2.3 }, premium: false, anfahrt: 35, interface: "excel",
    rating: 4.1, slotsProTag: ["07:30", "11:00", "15:00", "18:00"],
    agb: "AGB Blitz-Klempner 24: Notdienstzuschläge nach Preisliste, Abnahme per digitaler Unterschrift.",
    prices: { rohr_verstopft: 99, wasserhahn_tropft: 95, rohrbruch: 219 },
    reviews: [
      { autor: "K. Lorenz", sterne: 4, text: "Schnell da, Preis okay." },
      { autor: "R. Adam", sterne: 4, text: "Gut erreichbar über die App, keine Anrufe nötig – super." },
      { autor: "B. Stein", sterne: 4, text: "Solide, Anfahrt etwas teuer." },
    ] },
  { id: "b4", name: "Elektro Fuchs Meisterbetrieb", gewerk: "elektriker", gegruendet: 1999,
    pos: { x: 2.2, y: 6.9 }, premium: true, anfahrt: 29, interface: "crm",
    rating: 4.9, slotsProTag: ["08:30", "12:00", "15:30"],
    agb: "AGB Elektro Fuchs: Arbeiten nach VDE, E-Check-Protokoll inklusive, 24 Monate Gewährleistung.",
    prices: { steckdose_defekt: 92, lampe_montieren: 69, sicherung_fehler: 125 },
    reviews: [
      { autor: "L. Hoffmann", sterne: 5, text: "FI-Fehler in einer Stunde gefunden. Sehr professionell." },
      { autor: "D. Wagner", sterne: 5, text: "Digitale Abnahme direkt auf dem Tablet, alles transparent." },
    ] },
  { id: "b5", name: "StromWerk City", gewerk: "elektriker", gegruendet: 2015,
    pos: { x: 7.6, y: 3.8 }, premium: false, anfahrt: 22, interface: "email",
    rating: 4.4, slotsProTag: ["09:30", "14:30", "17:00"],
    agb: "AGB StromWerk City: Kleinmaterial nach Aufwand, Terminfenster 60 Minuten.",
    prices: { steckdose_defekt: 85, lampe_montieren: 59, sicherung_fehler: 140 },
    reviews: [
      { autor: "P. Schulz", sterne: 4, text: "Lampen fix montiert, freundlich." },
      { autor: "H. Braun", sterne: 5, text: "Kam sogar früher als geplant." },
    ] },
  { id: "b6", name: "Farbklang Malerei", gewerk: "maler", gegruendet: 2010,
    pos: { x: 4.9, y: 7.4 }, premium: false, anfahrt: 15, interface: "email",
    rating: 4.7, slotsProTag: ["08:00", "13:30"],
    agb: "AGB Farbklang Malerei: Farbmaterial nach Absprache, Abdeckung und Reinigung inklusive.",
    prices: { wand_loch: 105, waende_streichen: 299, schimmel: 175 },
    reviews: [
      { autor: "E. Winter", sterne: 5, text: "Loch in der Wand unsichtbar verspachtelt." },
      { autor: "C. Albrecht", sterne: 5, text: "Sauberste Malerarbeit, die ich je hatte." },
      { autor: "F. Kaya", sterne: 4, text: "Sehr ordentlich, kleine Verzögerung beim Start." },
    ] },
  { id: "b7", name: "Maler Janßen & Partner", gewerk: "maler", gegruendet: 1995,
    pos: { x: 8.4, y: 7.9 }, premium: true, anfahrt: 20, interface: "crm",
    rating: 4.5, slotsProTag: ["07:30", "12:30", "16:00"],
    agb: "AGB Janßen & Partner: Festpreise je Raumgröße, Gerüst nach Aufwand.",
    prices: { wand_loch: 119, waende_streichen: 345, schimmel: 199 },
    reviews: [
      { autor: "N. Vogel", sterne: 5, text: "Schimmelsanierung inkl. Ursachenanalyse – stark." },
      { autor: "G. Roth", sterne: 4, text: "Gute Beratung zur Farbe." },
    ] },
  { id: "b8", name: "Holz & Hand Tischlerei", gewerk: "tischler", gegruendet: 2007,
    pos: { x: 1.8, y: 2.8 }, premium: false, anfahrt: 24, interface: "excel",
    rating: 4.8, slotsProTag: ["09:00", "14:00"],
    agb: "AGB Holz & Hand: Maßanfertigungen nach Angebot, Kleinreparaturen zum Grundpreis.",
    prices: { tuer_klemmt: 82, moebel_montage: 99, parkett_reparatur: 205 },
    reviews: [
      { autor: "O. Neumann", sterne: 5, text: "Tür schließt wieder perfekt, faire 80 Euro." },
      { autor: "I. Sommer", sterne: 5, text: "Parkett sieht aus wie neu." },
    ] },
  { id: "b9", name: "Montage-Profis Nord", gewerk: "tischler", gegruendet: 2018,
    pos: { x: 6.1, y: 8.6 }, premium: false, anfahrt: 18, interface: "email",
    rating: 4.2, slotsProTag: ["10:00", "13:00", "17:30"],
    agb: "AGB Montage-Profis Nord: Aufbau nach Herstelleranleitung, Entsorgung der Verpackung optional.",
    prices: { tuer_klemmt: 95, moebel_montage: 89, parkett_reparatur: 235 },
    reviews: [
      { autor: "U. Franke", sterne: 4, text: "Schrank stand in 90 Minuten." },
      { autor: "W. Busch", sterne: 4, text: "Unkompliziert über die App gebucht." },
    ] },
  { id: "b10", name: "Grünzeit Gartenservice", gewerk: "gaertner", gegruendet: 2012,
    pos: { x: 8.9, y: 1.6 }, premium: false, anfahrt: 12, interface: "email",
    rating: 4.6, slotsProTag: ["08:00", "11:30", "15:00"],
    agb: "AGB Grünzeit: Grünschnitt-Entsorgung inklusive bis 2 m³, Witterungsvorbehalt.",
    prices: { hecke_schneiden: 129, rasen_maehen: 55, baum_faellen: 349 },
    reviews: [
      { autor: "M. Ehlers", sterne: 5, text: "Hecke top in Form, Schnittgut mitgenommen." },
      { autor: "S. Otto", sterne: 4, text: "Zuverlässig jede zweite Woche." },
    ] },
  { id: "b11", name: "GartenMeister Grün & Co", gewerk: "gaertner", gegruendet: 2001,
    pos: { x: 2.9, y: 9.1 }, premium: true, anfahrt: 16, interface: "crm",
    rating: 4.7, slotsProTag: ["07:00", "10:00", "14:30"],
    agb: "AGB GartenMeister: Baumarbeiten mit Seilklettertechnik, Versicherungsnachweis vorhanden.",
    prices: { hecke_schneiden: 149, rasen_maehen: 65, baum_faellen: 399 },
    reviews: [
      { autor: "V. Lindner", sterne: 5, text: "Baum fachgerecht gefällt, alles abgesichert." },
      { autor: "Z. Karim", sterne: 5, text: "Sehr professionelles Team." },
      { autor: "Q. Weber", sterne: 4, text: "Etwas höherer Preis, aber Meisterqualität." },
    ] },
  { id: "b12", name: "Wärme+ Haustechnik", gewerk: "heizung", gegruendet: 2009,
    pos: { x: 5.7, y: 5.0 }, premium: false, anfahrt: 28, interface: "crm",
    rating: 4.5, slotsProTag: ["08:00", "12:00", "16:00"],
    agb: "AGB Wärme+: Störungsdiagnose zum Grundpreis, Ersatzteile nach Herstellerliste.",
    prices: { heizung_ausfall: 185, heizkoerper_entlueften: 69, thermostat_wechsel: 115 },
    reviews: [
      { autor: "R. Sander", sterne: 5, text: "Heizung lief noch am selben Abend wieder." },
      { autor: "T. Mielke", sterne: 4, text: "Transparente Rechnung über die App." },
    ] },
  { id: "b13", name: "ThermoTec Service", gewerk: "heizung", gegruendet: 2016,
    pos: { x: 9.2, y: 5.9 }, premium: false, anfahrt: 32, interface: "excel",
    rating: 4.3, slotsProTag: ["09:00", "13:30", "17:00"],
    agb: "AGB ThermoTec: Wartungsverträge optional, Anfahrt außerhalb der Stadt nach km.",
    prices: { heizung_ausfall: 205, heizkoerper_entlueften: 79, thermostat_wechsel: 129 },
    reviews: [
      { autor: "Y. Brandt", sterne: 4, text: "Fehlercode schnell behoben." },
      { autor: "L. Petrova", sterne: 4, text: "Guter Service, App-Chat sehr praktisch." },
    ] },
];

/* Gebührenmodell der Plattform (Monetarisierung). */
const FEES = {
  serviceFeeRate: 0.029,   // Käuferschutz-/Servicegebühr, zahlt der Kunde on top
  commissionRate: 0.10,    // Provision, wird von der Auszahlung an den Betrieb abgezogen
  premiumMonat: 79,        // Premium-Ranking, monatlich je Betrieb
  mwst: 0.19,
  freigabeFensterStunden: 48,
};

if (typeof module !== "undefined") {
  module.exports = { GEWERKE, PROBLEME, DEMO_FOTOS, BETRIEBE_SEED, FEES };
} else {
  Object.assign(globalThis, { GEWERKE, PROBLEME, DEMO_FOTOS, BETRIEBE_SEED, FEES });
}
