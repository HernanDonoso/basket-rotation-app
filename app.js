(function () {
  'use strict';

  // Bump this on every deploy (kept in sync with sw.js CACHE version).
  // Used to detect when the running page is stale compared to what's
  // published on GitHub Pages — see checkForUpdate() below.
  var APP_VERSION = '10';

  var DEFAULT_ROSTER = [
    { name: 'Adam', number: 9, level: 3 },
    { name: 'Albert', number: 18, level: 3 },
    { name: 'Alexander', number: 21, level: 5 },
    { name: 'Alvar', number: 1, level: 4 },
    { name: 'Camilo', number: 18, level: 7 },
    { name: 'Charlie', number: 22, level: 6 },
    { name: 'Elis', number: 21, level: 7 },
    { name: 'Frank', number: 2, level: 7 },
    { name: 'Hennix', number: 11, level: 7 },
    { name: 'Hugo', number: 10, level: 4 },
    { name: 'James', number: 17, level: 7 },
    { name: 'Lev', number: 20, level: 7 },
    { name: 'Lucas', number: 25, level: 6 },
    { name: 'Oscar', number: 23, level: 7 },
    { name: 'Philip', number: 17, level: 5 },
    { name: 'Sid', number: 8, level: 4 },
    { name: 'Theodoros', number: 20, level: 5 }
  ];

  var DEFAULT_SETTINGS = {
    shifts: 8,
    onCourt: 4,
    minutesPerShift: 4,
    periodMinutes: 8,
    lowMax: 2,
    levelSplit: 4,
    weightThreshold: 5,
    weightBonusPercent: 0,
    rollingEnabled: false,
    rollingInterval: 2
  };

  var LS_ROSTER = 'basketRotation.roster.v1';
  var LS_SELECTED = 'basketRotation.selected.v1';
  var LS_SETTINGS = 'basketRotation.settings.v1';

  function loadRoster() {
    try {
      var raw = localStorage.getItem(LS_ROSTER);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return DEFAULT_ROSTER.slice();
  }
  function saveRoster(roster) {
    localStorage.setItem(LS_ROSTER, JSON.stringify(roster));
  }
  function loadSelected() {
    try {
      var raw = localStorage.getItem(LS_SELECTED);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }
  function saveSelected(names) {
    localStorage.setItem(LS_SELECTED, JSON.stringify(names));
  }
  function loadSettings() {
    try {
      var raw = localStorage.getItem(LS_SETTINGS);
      if (raw) return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) {}
    return Object.assign({}, DEFAULT_SETTINGS);
  }
  function saveSettings(s) {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
  }

  var state = {
    roster: loadRoster(),
    selected: loadSelected(),
    settings: loadSettings()
  };
  if (state.selected === null) {
    state.selected = state.roster.map(function (p) { return p.name; });
  }

  function persistAll() {
    saveRoster(state.roster);
    saveSelected(state.selected);
    saveSettings(state.settings);
  }

  // ---------- Tabs ----------
  var tabButtons = document.querySelectorAll('nav.tabs button');
  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabButtons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
      document.getElementById('view-' + btn.dataset.view).classList.add('active');
    });
  });

  // ---------- Squad tab ----------
  function renderSquad() {
    var list = document.getElementById('squad-list');
    list.innerHTML = '';
    state.roster
      .slice()
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'sv'); })
      .forEach(function (p) {
        var row = document.createElement('div');
        row.className = 'row';

        var numSpan = document.createElement('span');
        numSpan.className = 'num';
        numSpan.textContent = p.number ? '#' + p.number : '';

        var nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = p.name;

        var levelInput = document.createElement('input');
        levelInput.type = 'number';
        levelInput.className = 'level';
        levelInput.min = 1; levelInput.max = 10;
        levelInput.value = p.level;
        levelInput.addEventListener('change', function () {
          var v = parseInt(levelInput.value, 10);
          if (isNaN(v) || v < 1) v = 1;
          if (v > 10) v = 10;
          p.level = v;
          levelInput.value = v;
          persistAll();
        });

        var delBtn = document.createElement('button');
        delBtn.className = 'icon-btn';
        delBtn.textContent = '✕';
        delBtn.title = 'Ta bort spelare';
        delBtn.addEventListener('click', function () {
          if (!confirm('Ta bort ' + p.name + ' ur truppen?')) return;
          state.roster = state.roster.filter(function (x) { return x !== p; });
          state.selected = state.selected.filter(function (nm) { return nm !== p.name; });
          persistAll();
          renderSquad();
          renderMatchday();
        });

        row.appendChild(numSpan);
        row.appendChild(nameSpan);
        row.appendChild(levelInput);
        row.appendChild(delBtn);
        list.appendChild(row);
      });
  }

  document.getElementById('add-player-btn').addEventListener('click', function () {
    var nameInput = document.getElementById('new-name');
    var levelInput = document.getElementById('new-level');
    var name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    var level = parseInt(levelInput.value, 10);
    if (isNaN(level)) level = 5;
    if (level < 1) level = 1;
    if (level > 10) level = 10;
    if (state.roster.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); })) {
      alert('En spelare med det namnet finns redan.');
      return;
    }
    state.roster.push({ name: name, number: null, level: level });
    state.selected.push(name);
    persistAll();
    nameInput.value = '';
    levelInput.value = 5;
    renderSquad();
    renderMatchday();
  });

  // ---------- Matchday tab ----------
  function renderMatchday() {
    var list = document.getElementById('matchday-list');
    list.innerHTML = '';
    state.roster
      .slice()
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'sv'); })
      .forEach(function (p) {
        var row = document.createElement('label');
        row.className = 'checkbox-row';

        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = state.selected.indexOf(p.name) !== -1;
        cb.addEventListener('change', function () {
          if (cb.checked) {
            if (state.selected.indexOf(p.name) === -1) state.selected.push(p.name);
          } else {
            state.selected = state.selected.filter(function (nm) { return nm !== p.name; });
          }
          persistAll();
          updateSelectedCount();
        });

        var nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = (p.number ? '#' + p.number + ' ' : '') + p.name;

        var levelBadge = document.createElement('span');
        var isLow = p.level <= state.settings.levelSplit;
        levelBadge.className = 'level-badge ' + (isLow ? 'level-low' : 'level-high');
        levelBadge.textContent = p.level;

        row.appendChild(cb);
        row.appendChild(nameSpan);
        row.appendChild(levelBadge);
        list.appendChild(row);
      });
    updateSelectedCount();
  }

  function updateSelectedCount() {
    document.getElementById('selected-count').textContent = state.selected.length + ' valda';
  }

  document.getElementById('generate-btn').addEventListener('click', function () {
    var resultArea = document.getElementById('result-area');
    var selectedPlayers = state.roster.filter(function (p) {
      return state.selected.indexOf(p.name) !== -1;
    }).map(function (p) {
      return { name: p.name, level: p.level, number: p.number };
    });

    if (selectedPlayers.length < state.settings.onCourt) {
      resultArea.innerHTML = '<div class="error-box">Välj minst ' + state.settings.onCourt + ' spelare för matchen.</div>';
      return;
    }

    var levelOverride = state.settings.levelSplit;
    var seed = Date.now() % 100000;

    if (state.settings.rollingEnabled) {
      var totalMinutes = state.settings.shifts * state.settings.minutesPerShift;
      var res = generateRollingSchedule(selectedPlayers, {
        totalMinutes: totalMinutes,
        onCourt: state.settings.onCourt,
        checkInterval: state.settings.rollingInterval,
        lowThreshold: levelOverride,
        lowMax: state.settings.lowMax,
        lowMin: 1,
        weightThreshold: state.settings.weightThreshold,
        weightBonusPercent: state.settings.weightBonusPercent,
        seed: seed,
        attempts: 60
      });
      renderRollingResult(res, selectedPlayers);
      return;
    }

    var res = generateSchedule(selectedPlayers, {
      shifts: state.settings.shifts,
      onCourt: state.settings.onCourt,
      minutesPerShift: state.settings.minutesPerShift,
      shiftsPerPeriod: Math.max(1, Math.round(state.settings.periodMinutes / state.settings.minutesPerShift)),
      lowThreshold: levelOverride,
      lowMax: state.settings.lowMax,
      lowMin: 1,
      weightThreshold: state.settings.weightThreshold,
      weightBonusPercent: state.settings.weightBonusPercent,
      seed: seed,
      attempts: 400
    });

    renderResult(res, selectedPlayers);
  });

  function renderResult(res, selectedPlayers) {
    var resultArea = document.getElementById('result-area');
    resultArea.innerHTML = '';

    if (!res.ok) {
      var err = document.createElement('div');
      err.className = 'error-box';
      err.textContent = res.error;
      resultArea.appendChild(err);
      return;
    }

    var levelByName = {};
    selectedPlayers.forEach(function (p) { levelByName[p.name] = p.level; });
    var lowSplit = state.settings.levelSplit;

    if (state.settings.weightBonusPercent > 0) {
      var bonusBox = document.createElement('div');
      bonusBox.className = 'warn-box';
      bonusBox.style.color = 'var(--accent2)';
      bonusBox.style.borderColor = 'rgba(251,146,60,0.35)';
      bonusBox.style.background = 'rgba(251,146,60,0.12)';
      bonusBox.textContent = 'Speltidsbonus aktiv: spelare med coachbetyg över ' +
        state.settings.weightThreshold + ' får ~' + state.settings.weightBonusPercent +
        '% mer speltid än övriga (avviker från helt jämn fördelning).';
      resultArea.appendChild(bonusBox);
    }

    if (res.warnings && res.warnings.length) {
      var warnBox = document.createElement('div');
      warnBox.className = 'warn-box';
      warnBox.innerHTML = '<strong>Obs:</strong><br>' + res.warnings.map(function (w) {
        return '• ' + escapeHtml(w);
      }).join('<br>');
      resultArea.appendChild(warnBox);
    }

    var minutesPerShift = state.settings.minutesPerShift;
    res.schedule.forEach(function (lineup, i) {
      var card = document.createElement('div');
      card.className = 'shift-card';

      var title = document.createElement('div');
      title.className = 'shift-title';
      var startMin = i * minutesPerShift;
      var endMin = (i + 1) * minutesPerShift;
      title.innerHTML = '<span>Byte ' + (i + 1) + '</span><span>' + startMin + '–' + endMin + ' min</span>';
      card.appendChild(title);

      var grid = document.createElement('div');
      grid.className = 'lineup-grid';
      lineup.forEach(function (name) {
        var lvl = levelByName[name];
        var isLow = lvl <= lowSplit;
        var pdiv = document.createElement('div');
        pdiv.className = 'lineup-player';
        var nameSpan = document.createElement('span');
        nameSpan.textContent = name;
        var badge = document.createElement('span');
        badge.className = 'level-badge ' + (isLow ? 'level-low' : 'level-high');
        badge.textContent = lvl;
        pdiv.appendChild(nameSpan);
        pdiv.appendChild(badge);
        grid.appendChild(pdiv);
      });
      card.appendChild(grid);
      resultArea.appendChild(card);
    });

    // Summary table
    var summaryCard = document.createElement('div');
    summaryCard.className = 'card';
    var h2 = document.createElement('h2');
    h2.textContent = 'Speltid per spelare';
    summaryCard.appendChild(h2);

    var table = document.createElement('table');
    table.className = 'summary';
    var thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Spelare</th><th>Grad</th><th>Byten</th><th>Minuter</th></tr>';
    table.appendChild(thead);
    var tbody = document.createElement('tbody');

    var names = Object.keys(res.minutesPerPlayer).sort(function (a, b) {
      return res.minutesPerPlayer[b] - res.minutesPerPlayer[a];
    });
    names.forEach(function (nm) {
      var tr = document.createElement('tr');
      var shiftsPlayed = res.minutesPerPlayer[nm] / minutesPerShift;
      tr.innerHTML = '<td>' + escapeHtml(nm) + '</td>' +
        '<td>' + levelByName[nm] + '</td>' +
        '<td>' + shiftsPlayed + '</td>' +
        '<td>' + res.minutesPerPlayer[nm] + ' min</td>';
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    summaryCard.appendChild(table);
    resultArea.appendChild(summaryCard);
  }

  function renderRollingResult(res, selectedPlayers) {
    var resultArea = document.getElementById('result-area');
    resultArea.innerHTML = '';

    if (!res.ok) {
      var err = document.createElement('div');
      err.className = 'error-box';
      err.textContent = res.error;
      resultArea.appendChild(err);
      return;
    }

    var levelByName = {};
    selectedPlayers.forEach(function (p) { levelByName[p.name] = p.level; });
    var lowSplit = state.settings.levelSplit;

    var infoBox = document.createElement('div');
    infoBox.className = 'warn-box';
    infoBox.style.color = 'var(--accent2)';
    infoBox.style.borderColor = 'rgba(251,146,60,0.35)';
    infoBox.style.background = 'rgba(251,146,60,0.12)';
    infoBox.textContent = 'Rullande byten aktiva: bara spelare som ligger efter sitt mål byts ut, ' +
      'kontroll var ' + state.settings.rollingInterval + ':e minut. Spridning i speltid: ' +
      res.spread + ' min mellan mest och minst spelad.';
    resultArea.appendChild(infoBox);

    if (state.settings.weightBonusPercent > 0) {
      var bonusBox = document.createElement('div');
      bonusBox.className = 'warn-box';
      bonusBox.style.color = 'var(--accent2)';
      bonusBox.style.borderColor = 'rgba(251,146,60,0.35)';
      bonusBox.style.background = 'rgba(251,146,60,0.12)';
      bonusBox.textContent = 'Speltidsbonus aktiv: spelare med coachbetyg över ' +
        state.settings.weightThreshold + ' får ~' + state.settings.weightBonusPercent +
        '% mer speltid än övriga (avviker från helt jämn fördelning).';
      resultArea.appendChild(bonusBox);
    }

    if (res.warnings && res.warnings.length) {
      var warnBox = document.createElement('div');
      warnBox.className = 'warn-box';
      warnBox.innerHTML = '<strong>Obs:</strong><br>' + res.warnings.map(function (w) {
        return '• ' + escapeHtml(w);
      }).join('<br>');
      resultArea.appendChild(warnBox);
    }

    // Substitution events timeline
    var eventsCard = document.createElement('div');
    eventsCard.className = 'card';
    var eh2 = document.createElement('h2');
    eh2.textContent = 'Byten under matchen';
    eventsCard.appendChild(eh2);
    if (res.events.length === 0) {
      var noEv = document.createElement('p');
      noEv.className = 'muted';
      noEv.textContent = 'Inga byten behövdes — samma startfem spelar hela matchen.';
      eventsCard.appendChild(noEv);
    } else {
      res.events.forEach(function (ev) {
        var row = document.createElement('div');
        row.className = 'row';
        var span = document.createElement('span');
        span.className = 'name';
        span.textContent = 'Min ' + ev.atMinute + ': UT ' + ev.out.join(', ') + '  →  IN ' + ev.in.join(', ');
        row.appendChild(span);
        eventsCard.appendChild(row);
      });
    }
    resultArea.appendChild(eventsCard);

    // Full lineup timeline
    res.segments.forEach(function (seg) {
      var card = document.createElement('div');
      card.className = 'shift-card';

      var title = document.createElement('div');
      title.className = 'shift-title';
      title.innerHTML = '<span>Period</span><span>' + seg.startMin + '–' + seg.endMin + ' min</span>';
      card.appendChild(title);

      var grid = document.createElement('div');
      grid.className = 'lineup-grid';
      seg.lineup.forEach(function (name) {
        var lvl = levelByName[name];
        var isLow = lvl <= lowSplit;
        var pdiv = document.createElement('div');
        pdiv.className = 'lineup-player';
        var nameSpan = document.createElement('span');
        nameSpan.textContent = name;
        var badge = document.createElement('span');
        badge.className = 'level-badge ' + (isLow ? 'level-low' : 'level-high');
        badge.textContent = lvl;
        pdiv.appendChild(nameSpan);
        pdiv.appendChild(badge);
        grid.appendChild(pdiv);
      });
      card.appendChild(grid);
      resultArea.appendChild(card);
    });

    // Summary table
    var summaryCard = document.createElement('div');
    summaryCard.className = 'card';
    var h2 = document.createElement('h2');
    h2.textContent = 'Speltid per spelare';
    summaryCard.appendChild(h2);

    var table = document.createElement('table');
    table.className = 'summary';
    var thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Spelare</th><th>Grad</th><th>Minuter</th></tr>';
    table.appendChild(thead);
    var tbody = document.createElement('tbody');

    var names = Object.keys(res.minutesPerPlayer).sort(function (a, b) {
      return res.minutesPerPlayer[b] - res.minutesPerPlayer[a];
    });
    names.forEach(function (nm) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + escapeHtml(nm) + '</td>' +
        '<td>' + levelByName[nm] + '</td>' +
        '<td>' + res.minutesPerPlayer[nm] + ' min</td>';
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    summaryCard.appendChild(table);
    resultArea.appendChild(summaryCard);
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ---------- Settings tab ----------
  function renderSettings() {
    document.getElementById('set-shifts').value = state.settings.shifts;
    document.getElementById('set-oncourt').value = state.settings.onCourt;
    document.getElementById('set-minutes').value = state.settings.minutesPerShift;
    document.getElementById('set-period-minutes').value = state.settings.periodMinutes;
    document.getElementById('set-lowmax').value = state.settings.lowMax;
    document.getElementById('set-levelsplit').value = state.settings.levelSplit;
    document.getElementById('set-weight-threshold').value = state.settings.weightThreshold;
    document.getElementById('set-weight-bonus').value = state.settings.weightBonusPercent;
    document.getElementById('set-rolling-enabled').checked = state.settings.rollingEnabled;
    document.getElementById('set-rolling-interval').value = state.settings.rollingInterval;
  }

  document.getElementById('save-settings-btn').addEventListener('click', function () {
    state.settings.shifts = clampInt(document.getElementById('set-shifts').value, 1, 20, 8);
    state.settings.onCourt = clampInt(document.getElementById('set-oncourt').value, 2, 10, 4);
    state.settings.minutesPerShift = clampInt(document.getElementById('set-minutes').value, 1, 20, 4);
    state.settings.periodMinutes = clampInt(document.getElementById('set-period-minutes').value, 1, 40, 8);
    state.settings.lowMax = clampInt(document.getElementById('set-lowmax').value, 0, 4, 2);
    state.settings.levelSplit = clampInt(document.getElementById('set-levelsplit').value, 1, 9, 4);
    state.settings.weightThreshold = clampInt(document.getElementById('set-weight-threshold').value, 1, 10, 5);
    state.settings.weightBonusPercent = clampInt(document.getElementById('set-weight-bonus').value, 0, 100, 0);
    state.settings.rollingEnabled = document.getElementById('set-rolling-enabled').checked;
    state.settings.rollingInterval = clampInt(document.getElementById('set-rolling-interval').value, 1, 8, 2);
    persistAll();
    renderSettings();
    renderMatchday();
    alert('Inställningar sparade.');
  });

  function clampInt(v, min, max, fallback) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  document.getElementById('reset-btn').addEventListener('click', function () {
    if (!confirm('Återställa truppen till standardlistan? Dina ändringar av namn/grader försvinner.')) return;
    state.roster = DEFAULT_ROSTER.map(function (p) { return Object.assign({}, p); });
    state.selected = state.roster.map(function (p) { return p.name; });
    persistAll();
    renderSquad();
    renderMatchday();
  });

  // ---------- Profixio import ----------
  document.getElementById('profixio-parse-btn').addEventListener('click', function () {
    var text = document.getElementById('profixio-paste').value;
    var resultBox = document.getElementById('profixio-result');
    resultBox.innerHTML = '';

    if (!text || !text.trim()) {
      resultBox.innerHTML = '<div class="error-box">Klistra in text från Profixios Trupp-sida först.</div>';
      return;
    }

    var parsed;
    try {
      parsed = parseProfixioSquad(text);
    } catch (e) {
      resultBox.innerHTML = '<div class="error-box">Kunde inte tolka texten: ' + escapeHtml(String(e)) + '</div>';
      return;
    }

    if (parsed.length === 0) {
      resultBox.innerHTML = '<div class="error-box">Hittade inga spelare i den inklistrade texten. ' +
        'Kontrollera att du kopierade från Profixios Trupp-flik (kortvyn med namn, nummer och födelsedatum).</div>';
      return;
    }

    var diff = diffRosterWithProfixio(state.roster, parsed);

    if (diff.toAdd.length === 0 && diff.toRemove.length === 0 && diff.toUpdateNumber.length === 0) {
      resultBox.innerHTML = '<div class="warn-box">Tolkade ' + parsed.length + ' spelare från Profixio — ' +
        'truppen i appen stämmer redan överens, inga ändringar behövs.</div>';
      return;
    }

    renderProfixioDiff(diff, parsed);
  });

  function renderProfixioDiff(diff, parsedPlayers) {
    var resultBox = document.getElementById('profixio-result');
    resultBox.innerHTML = '';

    var info = document.createElement('p');
    info.className = 'muted';
    info.textContent = 'Tolkade ' + parsedPlayers.length + ' spelare från Profixio. Kryssa i vad du vill tillämpa:';
    resultBox.appendChild(info);

    var checkboxRefs = { add: [], remove: [], updateNumber: [] };

    if (diff.toAdd.length) {
      var addSection = document.createElement('div');
      addSection.className = 'diff-section';
      addSection.innerHTML = '<h3>Nya spelare i Profixio (inte i appen)</h3>';
      diff.toAdd.forEach(function (pp) {
        var item = document.createElement('div');
        item.className = 'diff-item add';
        var label = document.createElement('label');
        label.className = 'diff-check';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        checkboxRefs.add.push({ cb: cb, player: pp });
        var span = document.createElement('span');
        span.style.flex = '1';
        span.textContent = (pp.number ? '#' + pp.number + ' ' : '') + pp.firstname + ' ' + pp.lastname;
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'LÄGG TILL';
        label.appendChild(cb);
        label.appendChild(span);
        label.appendChild(tag);
        item.appendChild(label);
        addSection.appendChild(item);
      });
      resultBox.appendChild(addSection);
    }

    if (diff.toRemove.length) {
      var removeSection = document.createElement('div');
      removeSection.className = 'diff-section';
      removeSection.innerHTML = '<h3>I appen men inte i Profixio (troligen slutat/borttagen)</h3>';
      diff.toRemove.forEach(function (p) {
        var item = document.createElement('div');
        item.className = 'diff-item remove';
        var label = document.createElement('label');
        label.className = 'diff-check';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        checkboxRefs.remove.push({ cb: cb, player: p });
        var span = document.createElement('span');
        span.style.flex = '1';
        span.textContent = (p.number ? '#' + p.number + ' ' : '') + p.name;
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'TA BORT';
        label.appendChild(cb);
        label.appendChild(span);
        label.appendChild(tag);
        item.appendChild(label);
        removeSection.appendChild(item);
      });
      resultBox.appendChild(removeSection);
    }

    if (diff.toUpdateNumber.length) {
      var numSection = document.createElement('div');
      numSection.className = 'diff-section';
      numSection.innerHTML = '<h3>Tröjnummer skiljer sig</h3>';
      diff.toUpdateNumber.forEach(function (u) {
        var item = document.createElement('div');
        item.className = 'diff-item change';
        var label = document.createElement('label');
        label.className = 'diff-check';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        checkboxRefs.updateNumber.push({ cb: cb, update: u });
        var span = document.createElement('span');
        span.style.flex = '1';
        span.textContent = u.name + ': #' + (u.oldNumber || '–') + ' → #' + u.newNumber;
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'UPPDATERA';
        label.appendChild(cb);
        label.appendChild(span);
        label.appendChild(tag);
        item.appendChild(label);
        numSection.appendChild(item);
      });
      resultBox.appendChild(numSection);
    }

    var applyBtn = document.createElement('button');
    applyBtn.className = 'btn';
    applyBtn.style.marginTop = '8px';
    applyBtn.textContent = 'Tillämpa valda ändringar';
    applyBtn.addEventListener('click', function () {
      var addedNames = [];
      var removedNames = [];

      checkboxRefs.add.forEach(function (ref) {
        if (!ref.cb.checked) return;
        var name = ref.player.firstname.split(' ')[0];
        if (state.roster.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); })) return;
        state.roster.push({ name: name, number: ref.player.number, level: 5 });
        state.selected.push(name);
        addedNames.push(name);
      });

      checkboxRefs.remove.forEach(function (ref) {
        if (!ref.cb.checked) return;
        state.roster = state.roster.filter(function (p) { return p !== ref.player; });
        state.selected = state.selected.filter(function (nm) { return nm !== ref.player.name; });
        removedNames.push(ref.player.name);
      });

      checkboxRefs.updateNumber.forEach(function (ref) {
        if (!ref.cb.checked) return;
        var p = state.roster.find(function (x) { return x.name === ref.update.name; });
        if (p) p.number = ref.update.newNumber;
      });

      persistAll();
      renderSquad();
      renderMatchday();

      var summary = [];
      if (addedNames.length) summary.push('Tillagda: ' + addedNames.join(', '));
      if (removedNames.length) summary.push('Borttagna: ' + removedNames.join(', '));
      resultBox.innerHTML = '<div class="warn-box" style="color:var(--high);border-color:rgba(74,222,128,0.35);background:rgba(74,222,128,0.12);">' +
        'Klart! ' + (summary.length ? escapeHtml(summary.join(' | ')) : 'Inga ändringar tillämpades.') + '</div>';
      document.getElementById('profixio-paste').value = '';
    });
    resultBox.appendChild(applyBtn);
  }

  // ---------- Matchday attendance import (from Profixio match page) ----------
  document.getElementById('matchday-parse-btn').addEventListener('click', function () {
    var text = document.getElementById('matchday-paste').value;
    var resultBox = document.getElementById('matchday-import-result');
    resultBox.innerHTML = '';

    if (!text || !text.trim()) {
      resultBox.innerHTML = '<div class="error-box">Klistra in text från matchens Profixio-sida först.</div>';
      return;
    }

    var parsed;
    try {
      parsed = parseProfixioMatchday(text);
    } catch (e) {
      resultBox.innerHTML = '<div class="error-box">Kunde inte tolka texten: ' + escapeHtml(String(e)) + '</div>';
      return;
    }

    if (parsed.length === 0) {
      resultBox.innerHTML = '<div class="error-box">Hittade inga spelare i den inklistrade texten. ' +
        'Kontrollera att du kopierade lagpanelen från matchens sida (inloggad vy med anmälda spelare).</div>';
      return;
    }

    var sel = matchSelectionWithRoster(state.roster, parsed);
    renderMatchdayImportResult(sel, parsed);
  });

  function renderMatchdayImportResult(sel, parsedPlayers) {
    var resultBox = document.getElementById('matchday-import-result');
    resultBox.innerHTML = '';

    var info = document.createElement('p');
    info.className = 'muted';
    info.textContent = 'Tolkade ' + parsedPlayers.length + ' anmälda spelare från Profixio.';
    resultBox.appendChild(info);

    if (sel.matchedNames.length) {
      var matchedSection = document.createElement('div');
      matchedSection.className = 'diff-section';
      matchedSection.innerHTML = '<h3>Kommer väljas (anmälda till matchen)</h3>';
      sel.matchedNames.forEach(function (nm) {
        var item = document.createElement('div');
        item.className = 'diff-item add';
        item.innerHTML = '<span>' + escapeHtml(nm) + '</span><span class="tag">ANMÄLD</span>';
        matchedSection.appendChild(item);
      });
      resultBox.appendChild(matchedSection);
    }

    if (sel.notSelected.length) {
      var notSection = document.createElement('div');
      notSection.className = 'diff-section';
      notSection.innerHTML = '<h3>Kommer avmarkeras (finns i truppen, inte anmälda till denna match)</h3>';
      sel.notSelected.forEach(function (nm) {
        var item = document.createElement('div');
        item.className = 'diff-item remove';
        item.innerHTML = '<span>' + escapeHtml(nm) + '</span><span class="tag">EJ ANMÄLD</span>';
        notSection.appendChild(item);
      });
      resultBox.appendChild(notSection);
    }

    if (sel.unmatched.length) {
      var warnBox = document.createElement('div');
      warnBox.className = 'warn-box';
      warnBox.innerHTML = '<strong>Kunde inte matcha mot truppen:</strong><br>' +
        sel.unmatched.map(function (nm) { return '• ' + escapeHtml(nm); }).join('<br>') +
        '<br>Dessa ignoreras — lägg till dem manuellt i Trupp om de saknas.';
      resultBox.appendChild(warnBox);
    }

    var applyBtn = document.createElement('button');
    applyBtn.className = 'btn';
    applyBtn.style.marginTop = '8px';
    applyBtn.textContent = 'Sätt matchdagsval efter detta';
    applyBtn.addEventListener('click', function () {
      state.selected = sel.matchedNames.slice();
      persistAll();
      renderMatchday();
      resultBox.innerHTML = '<div class="warn-box" style="color:var(--high);border-color:rgba(74,222,128,0.35);background:rgba(74,222,128,0.12);">' +
        'Klart! ' + sel.matchedNames.length + ' spelare valda för matchen.</div>';
      document.getElementById('matchday-paste').value = '';
    });
    resultBox.appendChild(applyBtn);
  }

  // ---------- Init ----------
  renderSquad();
  renderMatchday();
  renderSettings();
  persistAll();

  var versionDisplay = document.getElementById('app-version-display');
  if (versionDisplay) versionDisplay.textContent = APP_VERSION;

  // ---------- Update detection ----------
  // version.json is fetched with cache-busting so it always reflects what's
  // actually published on GitHub Pages, even if the service worker or the
  // browser's own HTTP cache is stubbornly holding onto old app.js/index.html.
  // If the deployed version differs from what's currently running, show a
  // banner rather than silently forcing a reload (avoids yanking the rug out
  // from under a coach mid-match).
  function checkForUpdate() {
    fetch('version.json?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && String(data.version) !== String(APP_VERSION)) {
          var banner = document.getElementById('update-banner');
          if (banner) banner.style.display = 'block';
        }
      })
      .catch(function () { /* offline or blocked — ignore, not critical */ });
  }

  function forceUpdate() {
    var doReload = function () {
      // Cache-bust the navigation itself so the browser can't serve a
      // cached index.html even if the service worker is misbehaving.
      window.location.href = window.location.pathname + '?_fresh=' + Date.now();
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(function (regs) { return Promise.all(regs.map(function (r) { return r.unregister(); })); })
        .then(function () { return 'caches' in window ? caches.keys() : []; })
        .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
        .then(doReload)
        .catch(doReload);
    } else {
      doReload();
    }
  }

  var updateBanner = document.getElementById('update-banner');
  if (updateBanner) updateBanner.addEventListener('click', forceUpdate);
  var forceUpdateBtn = document.getElementById('force-update-btn');
  if (forceUpdateBtn) forceUpdateBtn.addEventListener('click', forceUpdate);

  checkForUpdate();
  setInterval(checkForUpdate, 5 * 60 * 1000); // re-check every 5 min while the app is open

  // Register service worker for offline use (best effort, ignore failures).
  // updateViaCache: 'none' stops the browser's own HTTP cache from serving a
  // stale sw.js — otherwise the service worker itself could never notice a
  // new version was deployed, defeating the whole update-check mechanism.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () {});
    });
  }
})();
