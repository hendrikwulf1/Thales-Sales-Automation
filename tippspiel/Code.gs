// ============================================================
// Code.gs – Tippspiel Deutschland vs. Curaçao
// ============================================================

var SHEET_FORM    = "Formularantworten 1";
var SHEET_CONFIG  = "Einstellungen";
var EINSATZ       = 5;

// Trage hier die ID deiner Google-Tabelle ein.
// Du findest sie in der URL deiner Tabelle:
// https://docs.google.com/spreadsheets/d/DIESE_ID_HIER/edit
var SPREADSHEET_ID = "1ZP1TGAPDy23wZDAYPJ2jOh7GGfu46A7Mi-mh6MhAFxI";

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// ------------------------------------------------------------
// Web-App Entry Point
// ------------------------------------------------------------
function doGet(e) {
  return HtmlService
    .createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Tippspiel: Deutschland vs. Curaçao")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ------------------------------------------------------------
// Hilfsfunktion: HTML-Includes (für <?!= include() ?>)
// ------------------------------------------------------------
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ------------------------------------------------------------
// Ergebnis aus "Einstellungen"-Blatt lesen
// ------------------------------------------------------------
function getActualScore() {
  var ss     = getSpreadsheet();
  var sheet  = ss.getSheetByName(SHEET_CONFIG);
  var toreDE = parseInt(sheet.getRange("B1").getValue()) || 0;
  var toreCU = parseInt(sheet.getRange("B2").getValue()) || 0;
  return { de: toreDE, cu: toreCU };
}

// ------------------------------------------------------------
// Punkteberechnung für einen einzelnen Tipp
// ------------------------------------------------------------
function calcPoints(tippDE, tippCU, actualDE, actualCU) {
  tippDE   = parseInt(tippDE)   || 0;
  tippCU   = parseInt(tippCU)   || 0;
  actualDE = parseInt(actualDE) || 0;
  actualCU = parseInt(actualCU) || 0;

  // Exaktes Ergebnis
  if (tippDE === actualDE && tippCU === actualCU) return { points: 3, exact: true };

  // Richtige Tordifferenz
  if ((tippDE - tippCU) === (actualDE - actualCU)) return { points: 2, exact: false };

  // Richtige Tendenz (Sieg DE / Sieg CU / Unentschieden)
  var tippTendenz   = Math.sign(tippDE   - tippCU);
  var actualTendenz = Math.sign(actualDE - actualCU);
  if (tippTendenz === actualTendenz) return { points: 1, exact: false };

  return { points: 0, exact: false };
}

// ------------------------------------------------------------
// Alle Tipps laden, Punkte berechnen, sortieren
// ------------------------------------------------------------
function getLeaderboard() {
  var ss        = getSpreadsheet();
  var formSheet = ss.getSheetByName(SHEET_FORM);

  if (!formSheet) {
    var allNames = ss.getSheets().map(function(s) { return '"' + s.getName() + '"'; });
    throw new Error('Blatt "' + SHEET_FORM + '" nicht gefunden. Vorhandene Blätter: ' + allNames.join(", "));
  }

  var lastRow = formSheet.getLastRow();
  var score   = getActualScore();
  var players = [];

  if (lastRow < 2) return { players: [], score: score, pot: 0, prizes: [] };

  var data = formSheet.getRange(2, 1, lastRow - 1, 4).getValues();

  data.forEach(function(row) {
    if (!row[1]) return; // Leerzeilen überspringen
    var name    = String(row[1]).trim();
    var tippDE  = parseInt(row[2]) || 0;
    var tippCU  = parseInt(row[3]) || 0;
    var result  = calcPoints(tippDE, tippCU, score.de, score.cu);
    players.push({
      name:   name,
      tippDE: tippDE,
      tippCU: tippCU,
      points: result.points,
      exact:  result.exact ? 1 : 0
    });
  });

  // Sortierung: Punkte absteigend, dann exakte Treffer absteigend
  players.sort(function(a, b) {
    if (b.points !== a.points) return b.points - a.points;
    return b.exact - a.exact;
  });

  // Ränge vergeben (mit Gleichstand-Logik für Rang-Bestimmung)
  var ranked = assignRanks(players);

  // Pot & Grundpreisgelder berechnen
  var numPlayers = players.length;
  var pot        = numPlayers * EINSATZ;
  var basePrizes = [
    { rank: 1, pct: 0.50 },
    { rank: 2, pct: 0.30 },
    { rank: 3, pct: 0.20 }
  ];

  // Dead-Heat-Verteilung berechnen
  var prizes = calcDeadHeat(ranked, pot, basePrizes);

  return {
    players: ranked,
    score:   score,
    pot:     pot,
    prizes:  prizes
  };
}

// ------------------------------------------------------------
// Ränge vergeben (Gleichstand → gleicher Rang)
// ------------------------------------------------------------
function assignRanks(players) {
  var result = [];
  var rank   = 1;
  var i      = 0;
  while (i < players.length) {
    var j = i;
    // Alle Spieler mit identischen Punkten UND exakten Treffern finden
    while (
      j < players.length &&
      players[j].points === players[i].points &&
      players[j].exact  === players[i].exact
    ) {
      j++;
    }
    for (var k = i; k < j; k++) {
      result.push(Object.assign({}, players[k], { rank: rank }));
    }
    rank = j + 1; // Nächster Rang überspringt die Gleichstand-Plätze
    i    = j;
  }
  return result;
}

// ------------------------------------------------------------
// Dead-Heat-Verteilung berechnen
// ------------------------------------------------------------
function calcDeadHeat(ranked, pot, basePrizes) {
  // Gebaut als Map: Rang → Preisgeld
  var prizeMap = {};
  basePrizes.forEach(function(bp) { prizeMap[bp.rank] = bp.pct * pot; });

  // Für jeden eindeutigen Rang: prüfen ob mehrere Spieler denselben haben
  var rankGroups = {};
  ranked.forEach(function(p) {
    if (!rankGroups[p.rank]) rankGroups[p.rank] = [];
    rankGroups[p.rank].push(p.name);
  });

  // Gewinne je Spieler ermitteln
  var playerPrize = {};
  Object.keys(rankGroups).forEach(function(r) {
    var rankNum = parseInt(r);
    var names   = rankGroups[r];
    var count   = names.length;

    // Alle Preisgelder, die durch diesen Gleichstand "verbraucht" werden, summieren
    var totalPrize = 0;
    for (var pos = rankNum; pos < rankNum + count; pos++) {
      if (prizeMap[pos]) totalPrize += prizeMap[pos];
    }

    var share = count > 0 ? totalPrize / count : 0;
    names.forEach(function(name) { playerPrize[name] = share; });
  });

  // Ergebnis-Array für die Anzeige (nur Plätze 1–3 mit Gewinn > 0)
  var summary = [];
  ranked.forEach(function(p) {
    var prize = playerPrize[p.name] || 0;
    if (prize > 0) {
      // Nur einmal pro Name einfügen
      var already = summary.some(function(s) { return s.name === p.name; });
      if (!already) {
        summary.push({ rank: p.rank, name: p.name, prize: prize });
      }
    }
  });

  // Für die Box "Gewinnverteilung": Gruppen zusammenfassen
  var groups = {};
  summary.forEach(function(s) {
    var key = s.rank + "_" + s.prize.toFixed(2);
    if (!groups[key]) groups[key] = { rank: s.rank, names: [], prize: s.prize };
    groups[key].names.push(s.name);
  });

  return Object.values(groups).sort(function(a, b) { return a.rank - b.rank; });
}

// ------------------------------------------------------------
// JSON-Endpunkt für das Frontend (via ?action=data)
// ------------------------------------------------------------
function getData() {
  return JSON.stringify(getLeaderboard());
}
