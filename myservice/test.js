/* End-to-End-Tests der MyService-Engine (node myservice/test.js).
   Deckt alle Facetten der Logik ab: KI-Klassifizierung, Preis, Ranking,
   Treuhand-Happy-Path, Pflicht-Doku, 48h-Autofreigabe, Dispute inkl.
   Nachbesserung + Mediation, Käuferschutz, Bewertungen, Ledger-Summen. */
const E = require("./engine.js");

let ok = 0, fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log("  ✓ " + name); }
  else { fail++; console.error("  ✗ " + name); }
}
function throws(name, fn) {
  try { fn(); fail++; console.error("  ✗ (kein Fehler) " + name); }
  catch { ok++; console.log("  ✓ " + name); }
}

console.log("\n1) KI-Klassifizierung (Text + Bild)");
const k1 = E.klassifiziere({ text: "Mein Abfluss in der Küche ist total verstopft, das Wasser läuft nicht ab" });
check("Text 'Abfluss verstopft' -> rohr_verstopft", k1.problem.id === "rohr_verstopft");
check("Gewerk = Klempner", k1.problem.gewerk === "klempner");
check("Konfidenz > 0.5", k1.konfidenz > 0.5);
const k2 = E.klassifiziere({ text: "Da ist ein Loch", kategorie: "maler", fotoLabels: ["wand", "loch"] });
check("Foto-Labels + Kategorie -> wand_loch", k2.problem.id === "wand_loch");
check("Foto-Treffer erkannt", k2.fotoTreffer.length === 2);
const k3 = E.klassifiziere({ text: "xyz unbekannt", kategorie: "heizung" });
check("Fallback bei unklarem Text: Kategorie-Problem, niedrige Konfidenz", k3.problem.gewerk === "heizung" && k3.konfidenz < 0.5);
check("Kein Ergebnis ohne jedes Signal", E.klassifiziere({ text: "qqq" }) === null);
const k4 = E.klassifiziere({ text: "Die Heizung ist ausgefallen, Fehlercode E133" });
check("Heizungsstörung erkannt", k4.problem.id === "heizung_ausfall");

console.log("\n2) Preis-Kalkulation aus Grundpreisen");
const store = E.createStore();
const b1 = E.findBetrieb(store, "b1");
const p1 = E.preisSchaetzung(b1, "rohr_verstopft");
check("Mittelwert = Grundpreis + Anfahrt (119+25)", p1.mid === 144);
check("Spanne -10 %/+25 % um den Grundpreis", p1.min === Math.round(119 * 0.9 + 25) && p1.max === Math.round(119 * 1.25 + 25));
check("Nicht angebotene Leistung -> null", E.preisSchaetzung(b1, "hecke_schneiden") === null);

console.log("\n3) Ranking (Nähe, Bewertung, Premium)");
const rank = E.sucheBetriebe(store.betriebe, "rohr_verstopft", "klempner", store.userPos);
check("Alle 3 Klempner gefunden", rank.length === 3);
check("Premium-Betrieb b1 rankt vorn", rank[0].betrieb.id === "b1");
check("Score fällt monoton", rank[0].score >= rank[1].score && rank[1].score >= rank[2].score);
check("Distanz berechnet", rank.every((r) => r.dist > 0));

console.log("\n4) Gebühren-Mathematik");
const f = E.gebuehren(200);
check("Kunde zahlt 200 + 2,9 % = 205,80", f.kundeZahlt === 205.8);
check("Betrieb erhält 200 − 10 % = 180", f.betriebErhaelt === 180);
check("Plattform-Umsatz = 25,80", f.plattformUmsatz === 25.8);

console.log("\n5) Happy Path: Anfrage -> Treuhand -> Doku-Pflicht -> Abnahme -> Auszahlung");
const slots = E.freieSlots(store, b1);
const o1 = E.anfrageSenden(store, { betriebId: "b1", problemId: "rohr_verstopft", text: "Abfluss verstopft", slot: slots[0].key, disclaimerAkzeptiert: true });
check("Anfrage anonymisiert (Alias)", /^Kunde #\d+$/.test(o1.alias));
check("Status ANGEFRAGT", o1.status === "ANGEFRAGT");
throws("Ohne Disclaimer keine Anfrage", () => E.anfrageSenden(store, { betriebId: "b1", problemId: "rohr_verstopft", slot: "x", disclaimerAkzeptiert: false }));
throws("Buchen vor Bestätigung unmöglich", () => E.buchen(store, o1, { agbPlattform: true, werkvertrag: true }));
E.anfrageAnnehmen(store, o1);
throws("Zwei-Vertrags-Modell: ohne Werkvertrag-Checkbox keine Buchung", () => E.buchen(store, o1, { agbPlattform: true, werkvertrag: false }));
E.buchen(store, o1, { agbPlattform: true, werkvertrag: true });
check("Geld im Treuhandkonto", o1.escrow.state === "EINGEZAHLT" && o1.escrow.amount === 144);
check("Slot jetzt belegt", E.freieSlots(store, b1)[0].belegt === true);
E.arbeitBeginnen(store, o1);
E.arbeitAbschliessen(store, o1);
throws("Rechnung OHNE Nachher-Foto abgelehnt", () => E.rechnungHochladen(store, o1, { betragBrutto: 144, nachherFoto: null, signaturBetrieb: "sig", signaturKunde: "sig" }));
throws("Rechnung OHNE beide Unterschriften abgelehnt", () => E.rechnungHochladen(store, o1, { betragBrutto: 144, nachherFoto: "img", signaturBetrieb: "sig", signaturKunde: null }));
E.rechnungHochladen(store, o1, { betragBrutto: 144, nachherFoto: "img", signaturBetrieb: "sigB", signaturKunde: "sigK" });
check("48h-Freigabefenster gestartet", o1.status === "PRUEFUNG" && o1.releaseDeadline > E.now(store));
const payout = E.freigeben(store, o1, "manuell");
check("Auszahlung = 144 − 10 % Provision", payout.betriebErhaelt === 129.6);
check("Status ABGESCHLOSSEN", o1.status === "ABGESCHLOSSEN");
E.bewerten(store, o1, 5, "Alles top!");
check("Bewertung fließt ins Rating ein", E.findBetrieb(store, "b1").reviews[0].ausApp === true);
throws("Doppelte Bewertung abgelehnt", () => E.bewerten(store, o1, 5, "nochmal"));

console.log("\n6) 48h-Fenster: automatische Freigabe nach Ablauf");
const o2 = E.anfrageSenden(store, { betriebId: "b2", problemId: "wasserhahn_tropft", text: "Wasserhahn tropft", slot: E.freieSlots(store, E.findBetrieb(store, "b2"))[0].key, disclaimerAkzeptiert: true });
E.anfrageAnnehmen(store, o2); E.buchen(store, o2, { agbPlattform: true, werkvertrag: true });
E.arbeitBeginnen(store, o2); E.arbeitAbschliessen(store, o2);
E.rechnungHochladen(store, o2, { betragBrutto: 98, nachherFoto: "img", signaturBetrieb: "s", signaturKunde: "s" });
E.zeitVorspulen(store, 49);
check("tick() gibt Auto-Freigabe zurück", E.tick(store).includes(o2.id));
check("o2 automatisch abgeschlossen", o2.status === "ABGESCHLOSSEN");

console.log("\n7) Dispute: Problem melden -> Nachbesserung -> 2. Fehlschlag -> Mediation");
const o3 = E.anfrageSenden(store, { betriebId: "b3", problemId: "rohrbruch", text: "Rohrbruch im Bad", slot: E.freieSlots(store, E.findBetrieb(store, "b3"))[0].key, disclaimerAkzeptiert: true });
E.anfrageAnnehmen(store, o3); E.buchen(store, o3, { agbPlattform: true, werkvertrag: true });
E.arbeitBeginnen(store, o3); E.arbeitAbschliessen(store, o3);
E.rechnungHochladen(store, o3, { betragBrutto: 254, nachherFoto: "img", signaturBetrieb: "s", signaturKunde: "s" });
E.problemMelden(store, o3, "Mangelhafte Ausführung", "Es tropft immer noch!");
check("Geld eingefroren", o3.escrow.state === "EINGEFROREN" && o3.status === "PROBLEM");
E.nachbesserungVorschlagen(store, o3, "Mo 08:00");
check("Nachbesserung vereinbart", o3.status === "NACHBESSERUNG");
E.rechnungHochladen(store, o3, { betragBrutto: 254, nachherFoto: "img2", signaturBetrieb: "s", signaturKunde: "s" });
check("Neues Freigabefenster nach Nachbesserung", o3.status === "PRUEFUNG");
E.problemMelden(store, o3, "Mangelhafte Ausführung", "Immer noch undicht – 2. Mal!");
check("2. Fehlschlag -> automatisch MEDIATION", o3.status === "MEDIATION");
E.beweisEinreichen(store, o3, "kunde", "Foto: Wasserfleck 03.07.");
E.beweisEinreichen(store, o3, "betrieb", "Abnahmeprotokoll mit Unterschrift");
check("Beweise beider Parteien gespeichert", o3.dispute.beweise.kunde.length === 1 && o3.dispute.beweise.betrieb.length === 1);
E.mediationEntscheiden(store, o3, "kunde", "Nachbesserung zweimal gescheitert.");
check("Volle Rückerstattung inkl. Servicegebühr", o3.status === "ERSTATTET" && o3.escrow.state === "ERSTATTET");

console.log("\n8) Betrugsfall: gefälschte Unterschrift -> direkt Mediation (keine Nachbesserung)");
const o4 = E.anfrageSenden(store, { betriebId: "b4", problemId: "steckdose_defekt", text: "Steckdose kaputt", slot: E.freieSlots(store, E.findBetrieb(store, "b4"))[0].key, disclaimerAkzeptiert: true });
E.anfrageAnnehmen(store, o4); E.buchen(store, o4, { agbPlattform: true, werkvertrag: true });
E.arbeitBeginnen(store, o4); E.arbeitAbschliessen(store, o4);
E.rechnungHochladen(store, o4, { betragBrutto: 121, nachherFoto: "img", signaturBetrieb: "s", signaturKunde: "s?" });
E.problemMelden(store, o4, "Unterschrift gefälscht / nie geleistet", "Ich habe nie unterschrieben!");
check("Fälschungsverdacht springt direkt in MEDIATION", o4.status === "MEDIATION");
E.mediationEntscheiden(store, o4, "betrieb", "GPS- und Zeitstempel belegen die Abnahme vor Ort.");
check("Mediation kann auch für den Betrieb ausgehen", o4.status === "ABGESCHLOSSEN");

console.log("\n9) Käuferschutz: Betrieb erscheint nicht -> volle Erstattung");
const o5 = E.anfrageSenden(store, { betriebId: "b5", problemId: "lampe_montieren", text: "Lampe anschließen", slot: E.freieSlots(store, E.findBetrieb(store, "b5"))[0].key, disclaimerAkzeptiert: true });
E.anfrageAnnehmen(store, o5); E.buchen(store, o5, { agbPlattform: true, werkvertrag: true });
E.kaeuferschutz(store, o5);
check("Storniert + erstattet inkl. Gebühr", o5.status === "STORNIERT" && o5.escrow.state === "ERSTATTET");

console.log("\n10) Ledger & Plattform-Umsatz konsistent");
const u = E.plattformUmsatz(store);
check("Provision aus 3 Auszahlungen (14,40+9,80+12,10)", u.provision === E.round2(14.4 + 9.8 + 12.1));
check("Servicegebühren aus 5 Buchungen erfasst", u.serviceFee > 0);
check("Kein Geld mehr im Treuhandkonto (alles ausgezahlt/erstattet)", u.imTreuhand === 0);
check("Premium-Umsatz = 4 Abos x 79 €", u.premium === 316);

console.log(`\nErgebnis: ${ok} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
