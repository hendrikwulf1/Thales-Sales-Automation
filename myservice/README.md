# MyService – „Das Doctolib für alle Dienstleistungen“

Voll funktionsfähiger Demo-Prototyp der Plattform-Idee: KI-gestützte Vermittlung
und Abwicklung handwerklicher Dienstleistungen – ohne Anrufe, mit Preistransparenz,
Treuhand-Zahlung und Konflikt-Management.

## Starten

Kein Build nötig – statische Website:

```bash
cd myservice
python3 -m http.server 8080
# -> http://localhost:8080
```

## Logik-Tests

Die gesamte Geschäftslogik liegt UI-frei in `engine.js` und ist mit Node testbar:

```bash
node myservice/test.js   # 47 Checks über alle Facetten
```

## Dateien

| Datei | Inhalt |
|---|---|
| `data.js` | Gewerke, Problem-Katalog (KI-Wissensbasis), 13 Betriebe mit Grundpreisen, Gebührenmodell |
| `engine.js` | KI-Klassifizierung, Preis-Kalkulation, Ranking, Treuhand-Zustandsmaschine, Ledger |
| `app.js` | UI: Wizard, Karte, Auftrags-Pipeline, Signatur-Pads, Betriebs-Cockpit, Charts |
| `test.js` | End-to-End-Tests der Engine |
| `index.html`, `styles.css` | Shell & Design (validierte Dataviz-Palette, Light + Dark Mode) |

## Was funktioniert (echte Logik, nicht nur Kulisse)

**Kunde (B2C):**
- Kategorie + Text-Prompt + Foto → Keyword-/Label-basierte **Klassifizierung** mit
  Konfidenz, erkannten Begriffen und korrigierbaren Alternativen
  (in Produktion: ML-Klassifikator bzw. multimodales LLM – die Schnittstelle ist identisch)
- **KI-Preisvorschlag je Betrieb** = hinterlegter Grundpreis + Anfahrt, Spanne −10 %/+25 %
- Karte + Liste, **Ranking** aus Bewertung − Distanzmalus + Premium-Boost
  (Premium immer sichtbar gekennzeichnet); Klick auf die Karte verschiebt den Standort und
  sortiert live neu
- **Live-Kalender**: nur freie Slots buchbar, gebuchte Slots sind sofort überall blockiert
- **Transparenz-Disclaimer** als Pflicht-Popup vor jeder Anfrage
- Anfrage **anonymisiert** (Alias „Kunde #…“), asynchroner Chat statt Telefonat

**Buchung & Treuhand (Escrow):**
- Zwei-Vertrags-Modell: Buchung nur mit **beiden Checkboxen**
  (Nutzungsvertrag Plattform + Werkvertrag mit dem Betrieb inkl. dessen AGB)
- Kunde zahlt Auftragswert + 2,9 % Servicegebühr **ins Treuhandkonto**
- Rechnung ist nur hochladbar mit **Nachher-Foto + digitalen Unterschriften beider
  Parteien** (Prävention: Vorher-/Nachher-Doku, digitale Abnahme)
- **48h-Freigabefenster**: Kunde gibt frei (Unterschrift auf Signatur-Pad, unwiderruflich)
  oder das Fenster läuft ab → automatische Freigabe (simulierte Zeit: „+12 h“-Button)
- Auszahlung an den Betrieb = Rechnungsbetrag − 10 % Provision; Abweichungen zwischen
  Schätzung und Rechnung werden als Nachzahlung/Teilerstattung verbucht

**Konflikt-Prozess:**
- „Problem melden“ friert das Geld sofort ein → Konflikt-Chat
- Betrieb hat **Recht auf Nachbesserung** (kostenloser Termin), danach neues Freigabefenster
- 2. Fehlschlag oder Verdacht „Unterschrift gefälscht“ → **Mediation**: beide Parteien
  reichen Beweise ein, die Plattform entscheidet (volle Rückerstattung inkl. Gebühr
  oder Auszahlung)
- **Käuferschutz**: keine Leistung/keine Rechnung → Geld vollständig zurück

**Betrieb (B2B):**
- Grundpreis-Datenbank editieren → wirkt **sofort** auf die KI-Schätzungen der Kunden
- Kalender-Zeitfenster live schalten/entfernen
- Anfragen annehmen/ablehnen, Aufträge abwickeln, Rechnungen mit Pflicht-Doku stellen
- Schnittstellen-Wahl: **CRM-Webhook (JSON-Vorschau), Excel/CSV-Export (echter Download),
  E-Mail (Vorschau)**
- Premium-Ranking buchbar/kündbar, Statistik mit Umsatz-Chart

**Plattform (Betreiber-Sicht):**
- Treuhand-Ledger mit jedem Geldfluss, Umsatzströme (Provision/Servicegebühr/Premium)
  live visualisiert, Mediations-Warteschlange mit Entscheidungsfunktion

**Bewertungen:** Nach Abschluss bewertet der Kunde; die Bewertung erscheint als
„verifizierter App-Auftrag“ im Profil und verändert Rating **und Ranking** sofort.

Der Demo-Zustand liegt in `localStorage` („Reset“-Button oben rechts setzt alles zurück).
Die „🤖 Demo“-Buttons simulieren jeweils die Gegenseite, damit sich der komplette
Ablauf auch allein durchspielen lässt.
