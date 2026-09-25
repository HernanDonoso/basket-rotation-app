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
  var weightThreshold = opts.weightThreshold === undefined ? 5 : opts.weightThreshold;
  var weightBonusPercent = opts.weightBonusPercent === undefined ? 0 : opts.weightBonusPercent;

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
  var names = selectedPlayers.map(function (p) { return p.name; });

  // Weighted quota: players above weightThreshold get weightBonusPercent extra
  // playing time. Uses largest-remainder (Hamilton) apportionment so the
  // integer quotas always sum exactly to totalSlots. With weightBonusPercent=0
  // this reduces to equal weights (the original fair-rotation behaviour).
  var weightOf = {};
  names.forEach(function (nm) {
    var lvl = selectedPlayers.filter(function (p) { return p.name === nm; })[0].level;
    weightOf[nm] = 1.0 + (lvl > weightThreshold ? weightBonusPercent / 100.0 : 0.0);
  });
  var totalWeight = names.reduce(function (sum, nm) { return sum + weightOf[nm]; }, 0);

  function computeQuota(rng) {
    var ideal = {};
    names.forEach(function (nm) { ideal[nm] = totalSlots * weightOf[nm] / totalWeight; });
    var floorQ = {};
    names.forEach(function (nm) { floorQ[nm] = Math.floor(ideal[nm]); });
    var assigned = names.reduce(function (sum, nm) { return sum + floorQ[nm]; }, 0);
    var remainder = totalSlots - assigned;
    // sort by fractional remainder desc, tie-break with rng for variety across matches
    var order = names.slice().sort(function (a, b) {
      var diff = (ideal[b] - floorQ[b]) - (ideal[a] - floorQ[a]);
      if (Math.abs(diff) > 1e-9) return diff;
      return rng() - 0.5;
    });
    for (var i = 0; i < remainder; i++) {
      floorQ[order[i]] += 1;
    }
    return floorQ;
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var best = null; // {schedule, warnings, quota}

  for (var attempt = 0; attempt < attempts; attempt++) {
    var rng = mulberry32((opts.seed || 1) * 7919 + attempt * 104729);
    var quota = computeQuota(rng);
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

// Rolling substitution scheduler — instead of fixed all-4-swap shifts,
// checks every `checkInterval` minutes whether individual players should
// be swapped (only those "behind schedule" come off), to minimise the
// spread in total playing time. Especially useful with a speltidsbonus,
// where fixed 4-min shifts can only distribute bonus minutes in coarse
// 4-min chunks (see matchrotation-app.md for background).
function generateRollingSchedule(selectedPlayers, opts) {
  opts = opts || {};
  var totalMinutes = opts.totalMinutes || 32;
  var onCourt = opts.onCourt || 4;
  var checkInterval = opts.checkInterval || 2;
  var margin = opts.margin === undefined ? 0.75 : opts.margin;
  var lowThreshold = opts.lowThreshold === undefined ? 4 : opts.lowThreshold;
  var lowMin = opts.lowMin === undefined ? 1 : opts.lowMin;
  var lowMax = opts.lowMax === undefined ? 2 : opts.lowMax;
  var weightThreshold = opts.weightThreshold === undefined ? 5 : opts.weightThreshold;
  var weightBonusPercent = opts.weightBonusPercent === undefined ? 0 : opts.weightBonusPercent;
  var attempts = opts.attempts || 60;

  var n = selectedPlayers.length;
  if (n < onCourt) {
    return { ok: false, error: 'Behöver minst ' + onCourt + ' spelare valda, bara ' + n + ' valda.' };
  }

  var names = selectedPlayers.map(function (p) { return p.name; });
  var isLow = {}, levelOf = {};
  selectedPlayers.forEach(function (p) { isLow[p.name] = p.level <= lowThreshold; levelOf[p.name] = p.level; });

  var lowCountTotal = selectedPlayers.filter(function (p) { return p.level <= lowThreshold; }).length;
  var highCountTotal = n - lowCountTotal;
  var precheckWarnings = [];
  if (lowCountTotal === 0) {
    precheckWarnings.push('Inga spelare med gradering 1-4 är valda idag — kan inte blanda in lägre graderade spelare alls.');
  } else if (highCountTotal < onCourt - 2) {
    precheckWarnings.push('Få spelare med gradering 5-10 valda (' + highCountTotal + ') — kan bli svårt att alltid ha minst 2 högre graderade per lag.');
  }

  var weightOf = {}, totalWeight = 0;
  names.forEach(function (nm) {
    var lvl = levelOf[nm];
    weightOf[nm] = 1.0 + (lvl > weightThreshold ? weightBonusPercent / 100.0 : 0.0);
    totalWeight += weightOf[nm];
  });
  var totalPlayerMinutes = onCourt * totalMinutes;
  var targetMin = {};
  names.forEach(function (nm) { targetMin[nm] = totalPlayerMinutes * weightOf[nm] / totalWeight; });

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Initial lineup: fill greedily by target minutes (most-owed first),
  // respecting the low/high balance constraint from the start.
  function pickInitialLineup(rng) {
    var pool = names.slice().sort(function (a, b) {
      var diff = targetMin[b] - targetMin[a];
      if (Math.abs(diff) > 1e-9) return diff;
      return rng() - 0.5;
    });
    var lineup = [], low = 0;
    for (var i = 0; i < pool.length && lineup.length < onCourt; i++) {
      var nm = pool[i];
      var wouldBeLow = low + (isLow[nm] ? 1 : 0);
      var slotsLeft = onCourt - lineup.length - 1;
      // only take if it doesn't make low-count unreachable-in-range
      if (isLow[nm] && wouldBeLow > lowMax) continue;
      if (!isLow[nm] && (lineup.length - low) + 1 > (onCourt - lowMin)) continue;
      lineup.push(nm);
      if (isLow[nm]) low++;
    }
    if (lineup.length < onCourt) {
      // relaxed fallback: just take the top N by target minutes
      lineup = pool.slice(0, onCourt);
    }
    return lineup;
  }

  var best = null;

  for (var attempt = 0; attempt < attempts; attempt++) {
    var rng = mulberry32((opts.seed || 1) * 7919 + attempt * 104729);

    var played = {}, stint = {};
    names.forEach(function (nm) { played[nm] = 0; stint[nm] = 0; });

    var onCourtSet = pickInitialLineup(rng);
    onCourtSet.forEach(function (nm) { stint[nm] = 0; });

    var segments = [];
    var events = [];
    var warnings = [];
    var t = 0;
    var minStint = Math.max(checkInterval, opts.minStint || checkInterval);

    while (t < totalMinutes) {
      var segLen = Math.min(checkInterval, totalMinutes - t);
      segments.push({ startMin: t, endMin: t + segLen, lineup: onCourtSet.slice().sort() });
      onCourtSet.forEach(function (nm) { played[nm] += segLen; stint[nm] += segLen; });

      var lowCount = onCourtSet.filter(function (nm) { return isLow[nm]; }).length;
      if (lowCount < lowMin || lowCount > lowMax) {
        warnings.push('Min ' + t + '\u2013' + (t + segLen) + ': ' + lowCount +
          ' lågt graderade på plan (mål ' + lowMin + '-' + lowMax + ') \u2014 ' + onCourtSet.slice().sort().join(', '));
      }

      t += segLen;
      if (t >= totalMinutes) break;

      var remaining = totalMinutes - t;
      var deficit = {};
      names.forEach(function (nm) { deficit[nm] = targetMin[nm] - played[nm]; });

      // Greedy 1-for-1 swaps: swap the on-court player furthest ahead of
      // schedule for the bench player furthest behind, as long as the gap
      // clears `margin`, the on-court player has had a minimum stint, and
      // the swap keeps the low/high balance intact.
      var bench = names.filter(function (nm) { return onCourtSet.indexOf(nm) === -1; });
      var curOnCourt = onCourtSet.slice();
      var swapOut = [], swapIn = [];
      var madeSwap = true;
      while (madeSwap) {
        madeSwap = false;
        var eligibleOn = curOnCourt.filter(function (nm) { return stint[nm] >= minStint; });
        var onSorted = eligibleOn.slice().sort(function (a, b) {
          var diff = deficit[a] - deficit[b];
          if (Math.abs(diff) > 1e-9) return diff;
          return rng() - 0.5;
        });
        var benchSorted = bench.slice().sort(function (a, b) {
          var diff = deficit[b] - deficit[a];
          if (Math.abs(diff) > 1e-9) return diff;
          return rng() - 0.5;
        });
        for (var oi = 0; oi < onSorted.length; oi++) {
          var worstOn = onSorted[oi];
          var picked = null;
          for (var bi = 0; bi < benchSorted.length; bi++) {
            var cand = benchSorted[bi];
            if ((deficit[cand] - deficit[worstOn]) <= margin) break;
            var trialLow = curOnCourt.filter(function (nm) { return nm !== worstOn && isLow[nm]; }).length + (isLow[cand] ? 1 : 0);
            if (trialLow >= lowMin && trialLow <= lowMax) { picked = cand; break; }
          }
          if (picked) {
            curOnCourt[curOnCourt.indexOf(worstOn)] = picked;
            bench[bench.indexOf(picked)] = worstOn;
            stint[picked] = 0;
            swapOut.push(worstOn);
            swapIn.push(picked);
            madeSwap = true;
            break;
          }
        }
      }

      if (swapOut.length) {
        events.push({ atMinute: t, out: swapOut, in: swapIn });
      }
      onCourtSet = curOnCourt;
    }

    var vals = names.map(function (nm) { return played[nm]; });
    var spread = Math.max.apply(null, vals) - Math.min.apply(null, vals);
    var score = spread * 1000 + warnings.length;

    if (best === null || score < best.score) {
      best = { segments: segments, events: events, played: played, warnings: warnings, spread: spread, score: score };
      if (spread <= 1 && warnings.length === 0) break;
    }
  }

  return {
    ok: true,
    segments: best.segments,
    events: best.events,
    minutesPerPlayer: best.played,
    warnings: precheckWarnings.concat(best.warnings),
    spread: best.spread,
    isLow: isLow,
    levelOf: levelOf
  };
}

if (typeof module !== 'undefined') {
  module.exports = { generateSchedule: generateSchedule, generateRollingSchedule: generateRollingSchedule };
}
