/* MyService Engine – die komplette Geschäftslogik ohne UI:
   1) KI-Klassifizierung (Text + Bild -> Problem -> Gewerk)
   2) Preis-Kalkulation (Problem x Grundpreis des Betriebs)
   3) Ranking (Nähe, Bewertung, Premium)
   4) Auftrags-Zustandsmaschine inkl. Treuhand (Escrow), 48h-Freigabefenster,
      Problem melden -> Nachbesserung -> Mediation, Käuferschutz
   5) Ledger (alle Geldflüsse) + Plattform-Umsatzströme

   Läuft im Browser (globals) und in Node (require) – deshalb testbar. */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    const data = require("./data.js");
    module.exports = factory(data);
  } else {
    root.Engine = factory({
      GEWERKE: root.GEWERKE, PROBLEME: root.PROBLEME,
      DEMO_FOTOS: root.DEMO_FOTOS, BETRIEBE_SEED: root.BETRIEBE_SEED, FEES: root.FEES,
    });
  }
})(typeof self !== "undefined" ? self : this, function ({ GEWERKE, PROBLEME, DEMO_FOTOS, BETRIEBE_SEED, FEES }) {

  /* ---------- Hilfen ---------- */
  const round2 = (n) => Math.round(n * 100) / 100;
  const euro = (n) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const norm = (s) => (s || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

  /* =========================================================
     1) KI-ENGINE: Bild- & Texterkennung + Klassifizierung
     Score je Problem = Keyword-Treffer (länger = spezifischer = mehr Gewicht)
       + Treffer der Bildanalyse-Labels + Boost bei passender Kategorie.
     ========================================================= */
  function klassifiziere({ text, kategorie, fotoLabels }) {
    const t = norm(text);
    const labels = (fotoLabels || []).map(norm);
    const scores = PROBLEME.map((p) => {
      let score = 0;
      const treffer = [];
      for (const kw of p.keywords) {
        if (t.includes(norm(kw))) { score += 1 + norm(kw).length / 10; treffer.push(kw); }
      }
      let fotoTreffer = [];
      for (const fl of p.fotoLabels) {
        if (labels.includes(norm(fl))) { score += 1.4; fotoTreffer.push(fl); }
      }
      if (kategorie && p.gewerk === kategorie) score *= 1.5;
      if (kategorie && p.gewerk !== kategorie) score *= 0.35;
      return { problem: p, score, treffer, fotoTreffer };
    }).filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!scores.length) {
      // Fallback: nur Kategorie gewählt -> häufigstes Problem des Gewerks, geringe Konfidenz
      if (kategorie) {
        const p = PROBLEME.find((x) => x.gewerk === kategorie);
        return { problem: p, konfidenz: 0.35, treffer: [], fotoTreffer: [], alternativen: PROBLEME.filter((x) => x.gewerk === kategorie).slice(1, 4).map((x) => x) };
      }
      return null;
    }
    const top = scores[0];
    const summe = scores.slice(0, 3).reduce((a, s) => a + s.score, 0);
    const konfidenz = Math.min(0.98, round2(top.score / summe * (labels.length ? 1.05 : 1)));
    return {
      problem: top.problem,
      konfidenz,
      treffer: top.treffer,
      fotoTreffer: top.fotoTreffer,
      alternativen: scores.slice(1, 4).map((s) => s.problem),
    };
  }

  /* =========================================================
     2) PREIS-KALKULATION
     Grundpreis des Betriebs für das klassifizierte Problem + Anfahrt.
     Spanne: -10 % / +25 % (unvorhergesehene Umstände -> Disclaimer!).
     ========================================================= */
  function preisSchaetzung(betrieb, problemId) {
    const base = betrieb.prices[problemId];
    if (base == null) return null; // Betrieb bietet diese Leistung nicht an
    const mid = base + betrieb.anfahrt;
    return {
      base, anfahrt: betrieb.anfahrt,
      min: Math.round((base * 0.9 + betrieb.anfahrt)),
      mid: Math.round(mid),
      max: Math.round((base * 1.25 + betrieb.anfahrt)),
    };
  }

  /* =========================================================
     3) SUCHE & RANKING
     Score = Bewertung (0–5) − Distanzmalus (0.35/km) + Premium-Boost (+1.2).
     Premium wird im UI immer als "Premium" gekennzeichnet (Transparenz).
     ========================================================= */
  function distanzKm(a, b) {
    return round2(Math.hypot(a.x - b.x, a.y - b.y));
  }
  function sucheBetriebe(betriebe, problemId, gewerk, userPos) {
    return betriebe
      .filter((b) => b.gewerk === gewerk && b.prices[problemId] != null)
      .map((b) => {
        const dist = distanzKm(b.pos, userPos);
        const preis = preisSchaetzung(b, problemId);
        const score = round2(b.rating - dist * 0.35 + (b.premium ? 1.2 : 0));
        return { betrieb: b, dist, preis, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  /* =========================================================
     Gebühren-Mathematik (Monetarisierung)
     Kunde zahlt: Auftragswert + Servicegebühr (Käuferschutz).
     Betrieb erhält: Auftragswert − Provision.
     ========================================================= */
  function gebuehren(brutto) {
    const serviceFee = round2(brutto * FEES.serviceFeeRate);
    const provision = round2(brutto * FEES.commissionRate);
    return {
      brutto: round2(brutto),
      serviceFee,
      kundeZahlt: round2(brutto + serviceFee),
      provision,
      betriebErhaelt: round2(brutto - provision),
      plattformUmsatz: round2(serviceFee + provision),
    };
  }

  /* =========================================================
     4) AUFTRAGS-ZUSTANDSMASCHINE
     ANGEFRAGT -> ANGENOMMEN -> BEZAHLT(Treuhand) -> IN_ARBEIT -> DOKU
       -> PRUEFUNG(48h) -> ABGESCHLOSSEN (Auszahlung)
     Abzweige: ABGELEHNT, STORNIERT(Käuferschutz-Erstattung),
       PROBLEM(eingefroren) -> NACHBESSERUNG -> PRUEFUNG (Runde 2)
       -> MEDIATION -> ABGESCHLOSSEN | ERSTATTET
     ========================================================= */
  const STATUS = {
    ANGEFRAGT: "ANGEFRAGT", ANGENOMMEN: "ANGENOMMEN", ABGELEHNT: "ABGELEHNT",
    BEZAHLT: "BEZAHLT", IN_ARBEIT: "IN_ARBEIT", DOKU: "DOKU",
    PRUEFUNG: "PRUEFUNG", PROBLEM: "PROBLEM", NACHBESSERUNG: "NACHBESSERUNG",
    MEDIATION: "MEDIATION", ABGESCHLOSSEN: "ABGESCHLOSSEN",
    ERSTATTET: "ERSTATTET", STORNIERT: "STORNIERT",
  };

  const STATUS_LABEL = {
    ANGEFRAGT: "Angefragt (anonym)", ANGENOMMEN: "Termin bestätigt – Buchung offen",
    ABGELEHNT: "Vom Betrieb abgelehnt", BEZAHLT: "Bezahlt – Geld im Treuhandkonto",
    IN_ARBEIT: "Handwerker vor Ort", DOKU: "Dokumentation & Rechnung ausstehend",
    PRUEFUNG: "48h-Freigabefenster läuft", PROBLEM: "Problem gemeldet – Geld eingefroren",
    NACHBESSERUNG: "Nachbesserung vereinbart", MEDIATION: "Mediation durch Plattform",
    ABGESCHLOSSEN: "Abgeschlossen – Betrieb ausgezahlt", ERSTATTET: "Erstattet (Käuferschutz)",
    STORNIERT: "Storniert – Geld zurück (Käuferschutz)",
  };

  function createStore() {
    return {
      clockOffsetMs: 0,
      userPos: { x: 4.6, y: 5.2 },
      betriebe: JSON.parse(JSON.stringify(BETRIEBE_SEED)),
      orders: [],
      ledger: [],
      premiumAbos: BETRIEBE_SEED.filter((b) => b.premium).length,
      seq: 1000,
      aliasSeq: 4821,
    };
  }

  const now = (store) => Date.now() + store.clockOffsetMs;
  const zeitVorspulen = (store, stunden) => { store.clockOffsetMs += stunden * 3600 * 1000; };

  function ledgerEintrag(store, order, typ, betrag, wer, notiz) {
    store.ledger.push({ ts: now(store), orderId: order ? order.id : null, typ, betrag: round2(betrag), wer, notiz });
  }
  function log(store, order, status, notiz) {
    order.status = status;
    order.history.push({ ts: now(store), status, notiz });
    chat(store, order, "system", notiz || STATUS_LABEL[status]);
  }
  function chat(store, order, von, text) {
    order.chat.push({ ts: now(store), von, text });
  }

  function findBetrieb(store, id) { return store.betriebe.find((b) => b.id === id); }
  function findProblem(id) { return PROBLEME.find((p) => p.id === id); }

  /* --- Schritt 1: anonymisierte Anfrage (kein Anruf nötig) --- */
  function anfrageSenden(store, { betriebId, problemId, text, fotoLabel, slot, disclaimerAkzeptiert }) {
    if (!disclaimerAkzeptiert) throw new Error("Der Transparenz-Disclaimer muss bestätigt werden.");
    const betrieb = findBetrieb(store, betriebId);
    const preis = preisSchaetzung(betrieb, problemId);
    if (!preis) throw new Error("Der Betrieb bietet diese Leistung nicht an.");
    const order = {
      id: "A-" + (++store.seq),
      alias: "Kunde #" + (++store.aliasSeq), // Anonymisierung bis zum Vertragsschluss
      betriebId, problemId, text: text || "", fotoLabel: fotoLabel || null,
      slot, estimate: preis,
      status: null, history: [], chat: [],
      escrow: { amount: 0, serviceFee: 0, state: "OFFEN" },
      invoice: null, releaseDeadline: null,
      dispute: null, checkboxes: null, rated: false,
      createdAt: now(store),
    };
    store.orders.push(order);
    log(store, order, STATUS.ANGEFRAGT,
      `Anonyme Anfrage über die Plattform gesendet (Wunschtermin ${slot}). Geschätzter Preis: ${euro(preis.min)}–${euro(preis.max)}.`);
    chat(store, order, "kunde", text || "(Beschreibung siehe Anfrage)");
    return order;
  }

  /* --- Schritt 2: Betrieb nimmt an / lehnt ab --- */
  function anfrageAnnehmen(store, order) {
    if (order.status !== STATUS.ANGEFRAGT) throw new Error("Anfrage ist nicht mehr offen.");
    log(store, order, STATUS.ANGENOMMEN, "Der Betrieb hat den Termin bestätigt. Der Kunde kann jetzt verbindlich buchen.");
    chat(store, order, "betrieb", "Wir haben Ihre Anfrage geprüft und bestätigen den Termin. Buchen Sie verbindlich, um den Termin zu fixieren.");
  }
  function anfrageAblehnen(store, order, grund) {
    if (order.status !== STATUS.ANGEFRAGT) throw new Error("Anfrage ist nicht mehr offen.");
    log(store, order, STATUS.ABGELEHNT, "Der Betrieb hat die Anfrage abgelehnt" + (grund ? ": " + grund : "."));
  }

  /* --- Schritt 3: verbindliche Buchung (Zwei-Vertrags-Modell) + Treuhand-Einzahlung --- */
  function buchen(store, order, { agbPlattform, werkvertrag }) {
    if (order.status !== STATUS.ANGENOMMEN) throw new Error("Buchung erst möglich, wenn der Betrieb den Termin bestätigt hat.");
    if (!agbPlattform) throw new Error("Checkbox 1 fehlt: Nutzungsbedingungen der Plattform (Vertrag 1: Nutzungsvertrag).");
    if (!werkvertrag) throw new Error("Checkbox 2 fehlt: Werkvertrag mit dem Betrieb (Vertrag 2).");
    order.checkboxes = { agbPlattform: true, werkvertrag: true, ts: now(store) };
    const f = gebuehren(order.estimate.mid);
    order.escrow = { amount: f.brutto, serviceFee: f.serviceFee, state: "EINGEZAHLT" };
    ledgerEintrag(store, order, "EINZAHLUNG", f.brutto, "kunde", "Auftragswert ins Treuhandkonto eingezahlt");
    ledgerEintrag(store, order, "SERVICEGEBUEHR", f.serviceFee, "kunde", "Servicegebühr / Käuferschutz (" + (FEES.serviceFeeRate * 100).toFixed(1) + " %)");
    log(store, order, STATUS.BEZAHLT,
      `Verbindlich gebucht. ${euro(f.kundeZahlt)} eingezahlt (davon ${euro(f.serviceFee)} Servicegebühr). Das Geld liegt im Treuhandkonto – der Betrieb wird erst nach Abnahme bezahlt.`);
    return f;
  }

  /* --- Schritt 4: Arbeit beginnt --- */
  function arbeitBeginnen(store, order) {
    if (order.status !== STATUS.BEZAHLT) throw new Error("Arbeit kann erst nach Bezahlung beginnen.");
    log(store, order, STATUS.IN_ARBEIT, "Der Handwerker ist vor Ort und hat mit der Arbeit begonnen.");
  }

  /* --- Schritt 5: Doku-Pflicht: Rechnung NUR mit Nachher-Foto + beiden Unterschriften --- */
  function arbeitAbschliessen(store, order) {
    if (order.status !== STATUS.IN_ARBEIT) throw new Error("Es läuft keine Arbeit.");
    log(store, order, STATUS.DOKU, "Arbeit gemeldet als fertig. Jetzt Pflicht: Nachher-Foto, Rechnung und digitale Unterschriften beider Parteien.");
  }
  function rechnungHochladen(store, order, { betragBrutto, nachherFoto, signaturBetrieb, signaturKunde, positionen }) {
    if (order.status !== STATUS.DOKU && order.status !== STATUS.NACHBESSERUNG)
      throw new Error("Rechnung kann nur nach Abschluss der Arbeit hochgeladen werden.");
    if (!nachherFoto) throw new Error("Pflichtfeld: Nachher-Foto der reparierten Stelle (Beweissicherung).");
    if (!signaturBetrieb || !signaturKunde) throw new Error("Beide digitalen Unterschriften (Betrieb + Kunde) sind Pflicht.");
    const brutto = round2(betragBrutto);
    const netto = round2(brutto / (1 + FEES.mwst));
    order.invoice = {
      nr: "R-" + order.id + "-" + (order.dispute && order.dispute.runde ? 2 : 1),
      positionen: positionen || [{ text: findProblem(order.problemId).label, betrag: brutto }],
      netto, mwst: round2(brutto - netto), brutto,
      nachherFoto, signaturBetrieb, signaturKunde, ts: now(store),
    };
    order.releaseDeadline = now(store) + FEES.freigabeFensterStunden * 3600 * 1000;
    log(store, order, STATUS.PRUEFUNG,
      `Rechnung ${order.invoice.nr} über ${euro(brutto)} mit Nachher-Foto und Unterschriften hochgeladen. Der Kunde hat ${FEES.freigabeFensterStunden} Stunden Zeit für Freigabe oder "Problem melden".`);
  }

  /* --- Schritt 6a: Freigabe (digitale Abnahme) -> Auszahlung minus Provision --- */
  function freigeben(store, order, quelle) {
    if (order.status !== STATUS.PRUEFUNG) throw new Error("Es gibt nichts freizugeben.");
    const brutto = order.invoice.brutto;
    // Rechnungsbetrag kann von der Schätzung abweichen -> Differenz wird verrechnet
    const diff = round2(brutto - order.escrow.amount);
    if (diff > 0) ledgerEintrag(store, order, "NACHZAHLUNG", diff, "kunde", "Differenz Rechnung > Schätzung nacherhoben");
    if (diff < 0) ledgerEintrag(store, order, "TEILERSTATTUNG", -diff, "plattform", "Differenz Schätzung > Rechnung an Kunden erstattet");
    const f = gebuehren(brutto);
    order.escrow.state = "AUSGEZAHLT";
    ledgerEintrag(store, order, "AUSZAHLUNG", f.betriebErhaelt, "plattform", "Auszahlung an Betrieb nach Abnahme");
    ledgerEintrag(store, order, "PROVISION", f.provision, "plattform", "Provision (" + (FEES.commissionRate * 100).toFixed(0) + " %) einbehalten");
    log(store, order, STATUS.ABGESCHLOSSEN,
      (quelle === "auto"
        ? `48h-Fenster ohne Einspruch abgelaufen – automatische Freigabe. `
        : `Digitale Abnahme unterschrieben – Freigabe ist unwiderruflich. `)
      + `${euro(f.betriebErhaelt)} an den Betrieb ausgezahlt (Provision ${euro(f.provision)}).`);
    return f;
  }

  /* --- Schritt 6b: Problem melden -> Geld sofort eingefroren --- */
  function problemMelden(store, order, grund, beschreibung) {
    if (order.status !== STATUS.PRUEFUNG) throw new Error("Problem melden geht nur im Freigabefenster.");
    order.escrow.state = "EINGEFROREN";
    order.dispute = {
      grund, beschreibung, runde: (order.dispute ? order.dispute.runde : 0) + 1,
      beweise: { kunde: [], betrieb: [] }, nachbesserungSlot: null,
    };
    log(store, order, STATUS.PROBLEM,
      `Problem gemeldet („${grund}“). Das Treuhandgeld ist eingefroren. Der Betrieb hat das Recht auf Nachbesserung (Nacherfüllung, deutsches Werkvertragsrecht).`);
    chat(store, order, "kunde", beschreibung || grund);
    // Verdacht auf gefälschte Unterschrift -> direkt Mediation, keine Nachbesserung sinnvoll
    if (grund === "Unterschrift gefälscht / nie geleistet" || order.dispute.runde >= 2) {
      eskalieren(store, order);
    } else {
      chat(store, order, "plattform", "Konflikt-Chat geöffnet. Betrieb: Bitte schlagen Sie einen kostenlosen Nachbesserungstermin vor.");
    }
  }

  /* --- Schritt 7: Nachbesserung (Recht auf Nacherfüllung) --- */
  function nachbesserungVorschlagen(store, order, slot) {
    if (order.status !== STATUS.PROBLEM) throw new Error("Keine offene Problemmeldung.");
    order.dispute.nachbesserungSlot = slot;
    log(store, order, STATUS.NACHBESSERUNG, `Kostenloser Nachbesserungstermin vereinbart: ${slot}.`);
    chat(store, order, "betrieb", `Wir bessern selbstverständlich kostenlos nach. Terminvorschlag: ${slot}.`);
  }
  function nachbesserungDurchfuehren(store, order) {
    if (order.status !== STATUS.NACHBESSERUNG) throw new Error("Keine Nachbesserung vereinbart.");
    // Nach der Nachbesserung: erneute Doku-Pflicht -> zurück in DOKU-artigen Zustand
    order.status = STATUS.NACHBESSERUNG; // bleibt, Rechnung Runde 2 folgt
    chat(store, order, "system", "Nachbesserung durchgeführt. Der Betrieb lädt erneut Nachher-Foto + Rechnung hoch, danach startet ein neues Freigabefenster.");
  }

  /* --- Schritt 8: Eskalation -> Mediation (Schiedsstelle der Plattform) --- */
  function eskalieren(store, order) {
    order.escrow.state = "EINGEFROREN";
    log(store, order, STATUS.MEDIATION,
      "Eskalation: Die Plattform übernimmt die Mediation. Beide Parteien reichen Beweise ein (Fotos, Chatverlauf, Abnahmeprotokoll).");
  }
  function beweisEinreichen(store, order, partei, beweis) {
    if (order.status !== STATUS.MEDIATION) throw new Error("Keine Mediation aktiv.");
    order.dispute.beweise[partei].push({ ts: now(store), text: beweis });
    chat(store, order, partei, "📎 Beweis eingereicht: " + beweis);
  }
  function mediationEntscheiden(store, order, gewinner, begruendung) {
    if (order.status !== STATUS.MEDIATION) throw new Error("Keine Mediation aktiv.");
    if (gewinner === "kunde") {
      order.escrow.state = "ERSTATTET";
      const zurueck = round2(order.escrow.amount + order.escrow.serviceFee);
      ledgerEintrag(store, order, "RUECKERSTATTUNG", zurueck, "plattform", "Mediation: Rückerstattung an Kunden inkl. Servicegebühr (Käuferschutz)");
      log(store, order, STATUS.ERSTATTET, `Mediation entschieden für den Kunden: ${begruendung} ${euro(zurueck)} wurden vollständig zurückerstattet.`);
    } else {
      const f = gebuehren(order.invoice ? order.invoice.brutto : order.escrow.amount);
      order.escrow.state = "AUSGEZAHLT";
      ledgerEintrag(store, order, "AUSZAHLUNG", f.betriebErhaelt, "plattform", "Mediation: Auszahlung an Betrieb");
      ledgerEintrag(store, order, "PROVISION", f.provision, "plattform", "Provision einbehalten");
      log(store, order, STATUS.ABGESCHLOSSEN, `Mediation entschieden für den Betrieb: ${begruendung} ${euro(f.betriebErhaelt)} ausgezahlt.`);
    }
  }

  /* --- Käuferschutz: keine Leistung / keine Rechnung -> Geld zurück --- */
  function kaeuferschutz(store, order) {
    if (order.status !== STATUS.BEZAHLT && order.status !== STATUS.IN_ARBEIT && order.status !== STATUS.DOKU)
      throw new Error("Käuferschutz greift nur, solange keine Rechnung freigegeben wurde.");
    order.escrow.state = "ERSTATTET";
    const zurueck = round2(order.escrow.amount + order.escrow.serviceFee);
    ledgerEintrag(store, order, "RUECKERSTATTUNG", zurueck, "plattform", "Käuferschutz: keine Leistung / keine Rechnung");
    log(store, order, STATUS.STORNIERT, `Käuferschutz ausgelöst: ${euro(zurueck)} vollständig an den Kunden zurückerstattet.`);
  }

  /* --- Automatik: 48h ohne Einspruch -> automatische Freigabe --- */
  function tick(store) {
    const ereignisse = [];
    for (const order of store.orders) {
      if (order.status === STATUS.PRUEFUNG && order.releaseDeadline && now(store) > order.releaseDeadline) {
        freigeben(store, order, "auto");
        ereignisse.push(order.id);
      }
    }
    return ereignisse;
  }

  /* --- Bewertung nach Abschluss (speist die "echten Bewertungen") --- */
  function bewerten(store, order, sterne, text) {
    if (order.status !== STATUS.ABGESCHLOSSEN) throw new Error("Bewertung erst nach Abschluss möglich.");
    if (order.rated) throw new Error("Bereits bewertet.");
    const b = findBetrieb(store, order.betriebId);
    b.reviews.unshift({ autor: order.alias, sterne, text, ausApp: true });
    const alle = b.reviews.map((r) => r.sterne);
    b.rating = round2(alle.reduce((a, s) => a + s, 0) / alle.length);
    order.rated = true;
    chat(store, order, "system", `Bewertung abgegeben: ${"★".repeat(sterne)} – fließt sofort ins Ranking ein.`);
  }

  /* --- Plattform-Umsatzströme aus dem Ledger (für die Visualisierung) --- */
  function plattformUmsatz(store) {
    const sum = (typ) => round2(store.ledger.filter((l) => l.typ === typ).reduce((a, l) => a + l.betrag, 0));
    return {
      provision: sum("PROVISION"),
      serviceFee: sum("SERVICEGEBUEHR"),
      premium: round2(store.premiumAbos * FEES.premiumMonat),
      erstattet: sum("RUECKERSTATTUNG"),
      ausgezahlt: sum("AUSZAHLUNG"),
      imTreuhand: round2(store.orders
        .filter((o) => o.escrow.state === "EINGEZAHLT" || o.escrow.state === "EINGEFROREN")
        .reduce((a, o) => a + o.escrow.amount + o.escrow.serviceFee, 0)),
    };
  }

  /* --- Kalender: Betriebe laden ihre freien Termine live hoch --- */
  function freieSlots(store, betrieb, tage = 5) {
    const out = [];
    const start = new Date(now(store));
    for (let d = 1; d <= tage; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
      for (const uhr of betrieb.slotsProTag) {
        const key = day.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) + " " + uhr;
        const belegt = store.orders.some((o) => o.betriebId === betrieb.id && o.slot === key &&
          ![STATUS.ABGELEHNT, STATUS.STORNIERT, STATUS.ERSTATTET].includes(o.status));
        out.push({ key, belegt });
      }
    }
    return out;
  }

  return {
    GEWERKE, PROBLEME, DEMO_FOTOS, FEES, STATUS, STATUS_LABEL,
    euro, round2, norm,
    klassifiziere, preisSchaetzung, sucheBetriebe, distanzKm, gebuehren,
    createStore, now, zeitVorspulen, tick, chat,
    anfrageSenden, anfrageAnnehmen, anfrageAblehnen, buchen,
    arbeitBeginnen, arbeitAbschliessen, rechnungHochladen,
    freigeben, problemMelden, nachbesserungVorschlagen, nachbesserungDurchfuehren,
    eskalieren, beweisEinreichen, mediationEntscheiden, kaeuferschutz,
    bewerten, plattformUmsatz, freieSlots, findBetrieb: findBetrieb, findProblem,
  };
});
