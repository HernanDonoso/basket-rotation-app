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
  // Three-tier speltid system: BONUS (level > weightThreshold) plays more
  // than MID (floorThreshold < level <= weightThreshold), which plays more
  // than GOLV/floor (level <= floorThreshold). Auto-fixed if misconfigured
  // (floorThreshold must be strictly below weightThreshold).
  var floorThreshold = opts.floorThreshold === undefined ? 3 : opts.floorThreshold;
  if (floorThreshold >= weightThreshold) floorThreshold = weightThreshold - 1;
  // Number of shifts that make up one match period (e.g. 2 shifts of 4 min
  // = one 8-min period). "Avoid repeat" only applies WITHIN a period — a
  // player who closes period 1 is free to open period 2 immediately, since
  // that's a real, visible substitution break for the coach/players, not a
  // same-period leave-and-return. Set to 1 to disable the rule entirely.
  var shiftsPerPeriod = opts.shiftsPerPeriod || 2;

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
  var tierOf = {}; // 'bonus' | 'mid' | 'floor'
  names.forEach(function (nm) {
    var lvl = selectedPlayers.filter(function (p) { return p.name === nm; })[0].level;
    if (lvl > weightThreshold) {
      tierOf[nm] = 'bonus';
      weightOf[nm] = 1.0 + weightBonusPercent / 100.0;
    } else if (lvl <= floorThreshold) {
      tierOf[nm] = 'floor';
      weightOf[nm] = 1.0;
    } else {
      tierOf[nm] = 'mid';
      weightOf[nm] = 1.0;
    }
  });
  var totalWeight = names.reduce(function (sum, nm) { return sum + weightOf[nm]; }, 0);
  var bonusNames = names.filter(function (nm) { return tierOf[nm] === 'bonus'; });
  var floorNames = names.filter(function (nm) { return tierOf[nm] === 'floor'; });

  // Hard guarantee (only meaningful when both a bonus and a floor player are
  // selected today): every bonus-tier player must end up with STRICTLY more
  // shifts than every floor-tier player — a proportional weight alone can
  // still tie or invert this in edge cases (see matchrotation-app.md), so we
  // repair the quota directly after the proportional pass. Moves the minimum
  // number of shifts from the floor player(s) sitting on the tier's current
  // max down to the bonus player(s) sitting on the tier's current min, one
  // shift at a time, until min(bonus) > max(floor) or no further move is
  // possible (floor player already at 0) — the latter is flagged as a
  // warning rather than silently left unresolved.
  function enforceBonusAboveFloor(quota) {
    if (weightBonusPercent <= 0) return { quota: quota, unresolved: false };
    if (bonusNames.length === 0 || floorNames.length === 0) return { quota: quota, unresolved: false };
    var guard = 0;
    while (guard++ < totalSlots * 2) {
      var minBonus = Math.min.apply(null, bonusNames.map(function (nm) { return quota[nm]; }));
      var maxFloor = Math.max.apply(null, floorNames.map(function (nm) { return quota[nm]; }));
      if (minBonus > maxFloor) break;
      var floorPick = floorNames.filter(function (nm) { return quota[nm] === maxFloor; }).sort()[0];
      var bonusPick = bonusNames.filter(function (nm) { return quota[nm] === minBonus; }).sort()[0];
      if (quota[floorPick] <= 0) return { quota: quota, unresolved: true }; // can't take any more from floor
      quota[floorPick] -= 1;
      quota[bonusPick] += 1;
    }
    var stillBad = Math.min.apply(null, bonusNames.map(function (nm) { return quota[nm]; })) <=
      Math.max.apply(null, floorNames.map(function (nm) { return quota[nm]; }));
    // A floor-tier player reduced all the way to zero playing time is a real
    // problem worth surfacing on its own, even though the strict bonus>floor
    // inequality technically still holds (0 minutes counts as "resolved").
    var zeroedFloor = floorNames.filter(function (nm) { return quota[nm] === 0; });
    return { quota: quota, unresolved: stillBad, zeroedFloor: zeroedFloor };
  }

  function computeQuota(rng) {
    var ideal = {};
    names.forEach(function (nm) { ideal[nm] = totalSlots * weightOf[nm] / totalWeight; });
    var floorQ = {};
    names.forEach(function (nm) { floorQ[nm] = Math.floor(ideal[nm]); });
    var assigned = names.reduce(function (sum, nm) { return sum + floorQ[nm]; }, 0);
    var remainder = totalSlots - assigned;
    // Sort by fractional remainder desc. When players are tied on the
    // fractional remainder (typical: they share the same weight class,
    // e.g. all above the coachbetyg threshold), break the tie by actual
    // level (higher level wins the "extra" slot first) instead of pure
    // randomness — otherwise a level-5 player could beat a level-7 player
    // to a bonus slot purely by luck, undermining the whole point of the
    // speltidsbonus. Only fall back to rng when levels are ALSO tied.
    var order = names.slice().sort(function (a, b) {
      var diff = (ideal[b] - floorQ[b]) - (ideal[a] - floorQ[a]);
      if (Math.abs(diff) > 1e-9) return diff;
      var levelDiff = levelOf[b] - levelOf[a];
      if (levelDiff !== 0) return levelDiff;
      return rng() - 0.5;
    });
    for (var i = 0; i < remainder; i++) {
      floorQ[order[i]] += 1;
    }
    return enforceBonusAboveFloor(floorQ);
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
    var quotaResult = computeQuota(rng);
    var quota = quotaResult.quota;
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

      // Avoid playing the same player twice within the same match period
      // (e.g. both 4-min shifts inside one 8-min period) when possible —
      // prefer candidates who haven't played yet THIS period; a repeat
      // across a period boundary (last shift of period N, first of N+1) is
      // fine and not restricted. Only fall back to allowing a same-period
      // repeat if no valid lineup can otherwise meet the speltidsmål.
      var periodStart = Math.floor(s / shiftsPerPeriod) * shiftsPerPeriod;
      var prevSet = {};
      for (var pi = periodStart; pi < s; pi++) {
        schedule[pi].forEach(function (nm) { prevSet[nm] = true; });
      }

      var remainingCandidates = available.filter(function (nm) { return !lineupSet[nm]; });
      remainingCandidates.sort(function (a, b) {
        var ua = remainingQuota[a] / shiftsLeft;
        var ub = remainingQuota[b] / shiftsLeft;
        if (ub !== ua) return ub - ua;
        return rng() - 0.5;
      });
      var preferredCandidates = remainingCandidates.filter(function (nm) { return !prevSet[nm]; });

      var slotsLeft = onCourt - Object.keys(lineupSet).length;
      var curLow = Object.keys(lineupSet).filter(function (nm) { return isLow[nm]; }).length;
      var curHigh = Object.keys(lineupSet).length - curLow;

      function backtrackWith(candList, strictLowHigh) {
        function bt(idx, curSet, low, high, left) {
          if (left === 0) {
            if (!strictLowHigh) return curSet;
            if (low >= lowMin && low <= lowMax) return curSet;
            return null;
          }
          if (idx >= candList.length) return null;
          var nm = candList[idx];
          var newLow = low + (isLow[nm] ? 1 : 0);
          var newHigh = high + (isLow[nm] ? 0 : 1);
          if (!strictLowHigh || newLow <= lowMax) {
            var withInc = Object.assign({}, curSet);
            withInc[nm] = true;
            var res = bt(idx + 1, withInc, newLow, newHigh, left - 1);
            if (res) return res;
          }
          return bt(idx + 1, curSet, low, high, left);
        }
        return bt(0, Object.assign({}, lineupSet), curLow, curHigh, slotsLeft);
      }

      // Priority order when constraints conflict: avoiding a player playing
      // two shifts in a row matters more to the coach than the low/high mix
      // (mix violations are still flagged, just tolerated further down the
      // list). Pass order:
      //   1. no repeat,    strict mix
      //   2. no repeat,    relaxed mix   <- prefer no-repeat over strict mix
      //   3. repeat OK,    strict mix
      //   4. repeat OK,    relaxed mix   (last resort, always succeeds if any exists)
      var solved = backtrackWith(preferredCandidates, true);
      var relaxedUsed = false;
      if (!solved) {
        solved = backtrackWith(preferredCandidates, false);
        relaxedUsed = !!solved;
      }
      if (!solved) solved = backtrackWith(remainingCandidates, true);
      if (!solved) {
        solved = backtrackWith(remainingCandidates, false);
        relaxedUsed = true;
      }
      if (!solved) {
        feasible = false;
        break;
      }

      var finalLineup = Object.keys(solved);
      var finalLow = finalLineup.filter(function (nm) { return isLow[nm]; }).length;
      var repeats = finalLineup.filter(function (nm) { return prevSet[nm]; });
      if (relaxedUsed || finalLow < lowMin || finalLow > lowMax) {
        shiftWarnings.push({ shift: s + 1, lineup: finalLineup.slice(), lowCount: finalLow, type: 'lowhigh' });
      }
      if (repeats.length > 0) {
        shiftWarnings.push({ shift: s + 1, lineup: finalLineup.slice(), repeats: repeats, type: 'consecutive' });
      }

      finalLineup.forEach(function (nm) { remainingQuota[nm] -= 1; });
      schedule.push(finalLineup.sort());
    }

    if (!feasible) continue;

    if (best === null || shiftWarnings.length < best.warnings.length) {
      best = { schedule: schedule, warnings: shiftWarnings, quota: quota, quotaResult: quotaResult };
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

  var finalWarnings = precheckWarnings.concat(best.warnings.map(function (w) {
    if (w.type === 'consecutive') {
      return 'Byte ' + w.shift + ': ' + w.repeats.join(', ') + ' spelar två byten i samma period (kunde inte undvikas givet speltidsmålen).';
    }
    return 'Byte ' + w.shift + ': kunde inte hålla ' + lowMin + '-' + lowMax + ' lågt graderade spelare (blev ' + w.lowCount + ') — ' + w.lineup.join(', ');
  }));
  if (best.quotaResult.unresolved) {
    finalWarnings.push('Kunde inte garantera att alla bonusspelare (betyg > ' + weightThreshold +
      ') fick mer speltid än alla golv-spelare (betyg ≤ ' + floorThreshold +
      ') — för få byten totalt för antalet spelare i de grupperna.');
  }
  if (best.quotaResult.zeroedFloor && best.quotaResult.zeroedFloor.length) {
    finalWarnings.push('Golv-spelare fick 0 minuter för att garantera bonusspelarna mer speltid: ' +
      best.quotaResult.zeroedFloor.join(', ') + ' — överväg lägre bonus-% eller färre bonusspelare valda.');
  }
  return {
    ok: true,
    schedule: best.schedule,
    warnings: finalWarnings,
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
