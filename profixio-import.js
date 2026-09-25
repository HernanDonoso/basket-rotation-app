// Parses text pasted from a Profixio team "Trupp" (squad) page into a list
// of players. Profixio's card view renders each player as a short block of
// lines (when copy-pasted as plain text) shaped like:
//
//   AD          <- initials (2-6 uppercase letters/Å/Ä/Ö)
//   9           <- jersey number (optional — some players have none listed)
//   Adam        <- first name
//   Darin       <- last name
//   2014-07-09  <- birthdate (YYYY-MM-DD)
//   Ungdom      <- category marker, confirms this is a player block
//
// A "Ledare" (staff) section follows the players and is ignored.
//
// Framework-free so it can run in the browser (script tag) or Node (tests).

function parseProfixioSquad(text) {
  var rawLines = text.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
  var players = [];
  var i = 0;
  var n = rawLines.length;
  var initialsRe = /^[A-ZÅÄÖ]{2,6}$/;
  var numberRe = /^\d{1,2}$/;
  var dateRe = /^\d{4}-\d{2}-\d{2}$/;

  while (i < n) {
    if (rawLines[i] === 'Ledare') break; // staff section starts here, stop
    if (!initialsRe.test(rawLines[i])) { i++; continue; }

    var j = i + 1;
    var number = null;
    if (j < n && numberRe.test(rawLines[j])) {
      number = parseInt(rawLines[j], 10);
      j++;
    }
    if (j + 2 < n) {
      var firstname = rawLines[j];
      var lastname = rawLines[j + 1];
      var birthdate = rawLines[j + 2];
      var marker = rawLines[j + 3];
      if (dateRe.test(birthdate) && marker === 'Ungdom') {
        players.push({
          initials: rawLines[i],
          number: number,
          firstname: firstname,
          lastname: lastname,
          birthdate: birthdate,
          fullname: firstname // roster uses first name only as the display/lookup name
        });
        i = j + 4;
        continue;
      }
    }
    i++;
  }
  return players;
}

// Computes a diff between the app's current roster (array of {name, number, level})
// and a freshly parsed Profixio squad. Matches players primarily by first name
// (case-insensitive), since that's what the rest of the app uses as the player key.
function diffRosterWithProfixio(currentRoster, profixioPlayers) {
  var byNameCurrent = {};
  currentRoster.forEach(function (p) { byNameCurrent[p.name.toLowerCase()] = p; });
  var byNameProfixio = {};
  profixioPlayers.forEach(function (p) {
    // Profixio sometimes lists a player's full legal first name (e.g. "Camilo
    // Hernan") while the app/coach commonly uses just the first token
    // ("Camilo"). Index under both so matching works either way.
    var firstToken = p.firstname.split(' ')[0];
    byNameProfixio[p.firstname.toLowerCase()] = p;
    byNameProfixio[firstToken.toLowerCase()] = p;
  });

  function lookupProfixio(name) {
    var key = name.toLowerCase();
    if (byNameProfixio[key]) return byNameProfixio[key];
    var firstToken = name.split(' ')[0].toLowerCase();
    return byNameProfixio[firstToken] || null;
  }
  function lookupCurrent(firstname) {
    var key = firstname.toLowerCase();
    if (byNameCurrent[key]) return byNameCurrent[key];
    var firstToken = firstname.split(' ')[0].toLowerCase();
    return byNameCurrent[firstToken] || null;
  }

  var toAdd = [];       // in Profixio, not in app
  var toRemove = [];    // in app, not in Profixio
  var toUpdateNumber = []; // in both, but jersey number differs

  profixioPlayers.forEach(function (pp) {
    var existing = lookupCurrent(pp.firstname);
    if (!existing) {
      toAdd.push(pp);
    } else if (pp.number !== null && existing.number !== pp.number) {
      toUpdateNumber.push({ name: existing.name, oldNumber: existing.number, newNumber: pp.number });
    }
  });

  currentRoster.forEach(function (p) {
    if (!lookupProfixio(p.name)) {
      toRemove.push(p);
    }
  });

  return { toAdd: toAdd, toRemove: toRemove, toUpdateNumber: toUpdateNumber };
}

if (typeof module !== 'undefined') {
  module.exports = { parseProfixioSquad: parseProfixioSquad, diffRosterWithProfixio: diffRosterWithProfixio };
}
