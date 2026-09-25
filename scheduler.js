// Basket lineup scheduler — core algorithm, framework-free (usable in browser or Node)
//
// Rules encoded here (see chat/Obsidian matchregler-u13.md for source):
// - Match = `shifts` equal time blocks (default 8 x 4 min = 4x8min periods, byte var 4:e minut)
// - `onCourt` players (default 4, per U13 4-mot-4 regler) on the floor each shift
// - Every selected player should get as equal total playing time as possible over the match
// - Each shift's lineup should have 1 or 2 "low" graded players (level 1-4) mixed with
//   at least 2 "high" graded players (level 5-10) — soft constraint: satisfied whenever
//   possible given who's selected today, otherwise the shift is flagged with a warning
//   instead of silently failing.

function generateSchedule(selectedPlayers, opts) {
  opts = opts || {};
  var shifts = opts.shifts || 8;
  var onCourt = opts.onCourt || 4;
  var attempts = opts.attempts || 300;
  var lowMin = opts.lowMin === undefined ? 1 : opts.lowMin;
  var lowMax = opts.lowMax === undefined ? 2 : opts.lowMax;
  var lowThreshold = opts.lowThreshold === undefined ? 4 : opts.lowThreshold;

  var n = selectedPlayers.length;
  if (n < onCourt) {
    return { ok: false, error: 'Behöver minst ' + onCourt + ' spelare valda, bara ' + n + ' valda.' };
  }

  var isLow = {};
  var levelOf = {};
  selectedPlayers.forEach(function (p) {
    isLow[p.name] = p.level <= lowThreshold;
    levelOf[p.name] = p.level;
  });
  var lowCountTotal = selectedPlayers.filter(function (p) { return p.level <= lowThreshold; }).length;
  var highCountTotal = n - lowCountTotal;

  var precheckWarnings = [];
  if (lowCountTotal === 0) {
    precheckWarnings.push('Inga spelare med gradering 1-4 är valda idag — kan inte blanda in lägre graderade spelare alls.');
  } else if (highCountTotal < onCourt - 2) {
    precheckWarnings.push('Få spelare med gradering 5-10 valda (' + highCountTotal + ') — kan bli svårt att alltid ha minst 2 högre graderade per lag.');
  }

  var totalSlots = shifts * onCourt;
  var base = Math.floor(totalSlots / n);
  var rem = totalSlots % n;

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var names = selectedPlayers.map(function (p) { return p.name; });

  var best = null; // {schedule, warnings, quota}

  for (var attempt = 0; attempt < attempts; attempt++) {
    var rng = mulberry32((opts.seed || 1) * 7919 + attempt * 104729);
    var order = shuffle(names, rng);
    var quota = {};
    names.forEach(function (nm) { quota[nm] = base; });
    order.slice(0, rem).forEach(function (nm) { quota[nm] += 1; });
    var remainingQuota = Object.assign({}, quota);

    var schedule = [];
    var shiftWarnings = [];
    var feasible = true;

    for (var s = 0; s < shifts; s++) {
      var shiftsLeft = shifts - s;
      var available = names.filter(function (nm) { return remainingQuota[nm] > 0; });
      var forced = available.filter(function (nm) { return remainingQuota[nm] >= shiftsLeft; });

      if (forced.length > onCourt) {
        feasible = false;
        break;
      }

      var lineupSet = {};
      forced.forEach(function (nm) { lineupSet[nm] = true; });

      var candidates = available.filter(function (nm) { return !lineupSet[nm]; });
      candidates.sort(function (a, b) {
        var ua = remainingQuota[a] / shiftsLeft;
        var ub = remainingQuota[b] / shiftsLeft;
        if (ub !== ua) return ub - ua;
        return rng() - 0.5;
      });

      var slotsLeft = onCourt - Object.keys(lineupSet).length;
      var curLow = Object.keys(lineupSet).filter(function (nm) { return isLow[nm]; }).length;
      var curHigh = Object.keys(lineupSet).length - curLow;

      // backtracking: try to satisfy 1<=low<=2 strictly
      var solved = backtrack(0, Object.assign({}, lineupSet), curLow, curHigh, slotsLeft, true);
      var relaxedUsed = false;
      if (!solved) {
        // relax: allow any low count, just fill by urgency
        solved = backtrack(0, Object.assign({}, lineupSet), curLow, curHigh, slotsLeft, false);
        relaxedUsed = true;
      }
      if (!solved) {
        feasible = false;
        break;
      }

      var finalLineup = Object.keys(solved);
      var finalLow = finalLineup.filter(function (nm) { return isLow[nm]; }).length;
      if (relaxedUsed || finalLow < lowMin || finalLow > lowMax) {
        shiftWarnings.push({ shift: s + 1, lineup: finalLineup.slice(), lowCount: finalLow });
      }

      finalLineup.forEach(function (nm) { remainingQuota[nm] -= 1; });
      schedule.push(finalLineup.sort());

      function backtrack(idx, curSet, low, high, left, strict) {
        if (left === 0) {
          if (!strict) return curSet;
          if (low >= lowMin && low <= lowMax) return curSet;
          return null;
        }
        if (idx >= candidates.length) return null;
        var nm = candidates[idx];
        // include
        var newLow = low + (isLow[nm] ? 1 : 0);
        var newHigh = high + (isLow[nm] ? 0 : 1);
        if (!strict || newLow <= lowMax) {
          var withInc = Object.assign({}, curSet);
          withInc[nm] = true;
          var res = backtrack(idx + 1, withInc, newLow, newHigh, left - 1, strict);
          if (res) return res;
        }
        // exclude
        return backtrack(idx + 1, curSet, low, high, left, strict);
      }
    }

    if (!feasible) continue;

    if (best === null || shiftWarnings.length < best.warnings.length) {
      best = { schedule: schedule, warnings: shiftWarnings, quota: quota };
      if (shiftWarnings.length === 0) break; // perfect, stop early
    }
  }

  if (best === null) {
    return { ok: false, error: 'Kunde inte hitta ett giltigt schema med de valda spelarna. Prova att välja fler spelare, eller fler med gradering 1-4.' };
  }

  var minutesPerShift = (opts.minutesPerShift || 4);
  var minutesPerPlayer = {};
  names.forEach(function (nm) { minutesPerPlayer[nm] = 0; });
  best.schedule.forEach(function (lineup) {
    lineup.forEach(function (nm) { minutesPerPlayer[nm] += minutesPerShift; });
  });

  return {
    ok: true,
    schedule: best.schedule,
    warnings: precheckWarnings.concat(best.warnings.map(function (w) {
      return 'Byte ' + w.shift + ': kunde inte hålla 1-2 lågt graderade spelare (blev ' + w.lowCount + ') — ' + w.lineup.join(', ');
    })),
    minutesPerPlayer: minutesPerPlayer,
    isLow: isLow,
    levelOf: levelOf
  };
}

if (typeof module !== 'undefined') {
  module.exports = { generateSchedule: generateSchedule };
}
