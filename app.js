(function () {
  'use strict';

  var DEFAULT_ROSTER = [
    { name: 'Adam', number: 9, level: 3 },
    { name: 'Albert', number: 18, level: 3 },
    { name: 'Alexander', number: 21, level: 4 },
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
    { name: 'Oscar', number: 23, level: 6 },
    { name: 'Philip', number: 17, level: 5 },
    { name: 'Sid', number: 8, level: 4 },
    { name: 'Theodoros', number: 20, level: 5 }
  ];

  var DEFAULT_SETTINGS = {
    shifts: 8,
    onCourt: 4,
    minutesPerShift: 4,
    lowMax: 2,
    levelSplit: 4
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
    var res = generateSchedule(selectedPlayers, {
      shifts: state.settings.shifts,
      onCourt: state.settings.onCourt,
      minutesPerShift: state.settings.minutesPerShift,
      lowThreshold: levelOverride,
      lowMax: state.settings.lowMax,
      lowMin: 1,
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
    document.getElementById('set-lowmax').value = state.settings.lowMax;
    document.getElementById('set-levelsplit').value = state.settings.levelSplit;
  }

  document.getElementById('save-settings-btn').addEventListener('click', function () {
    state.settings.shifts = clampInt(document.getElementById('set-shifts').value, 1, 20, 8);
    state.settings.onCourt = clampInt(document.getElementById('set-oncourt').value, 2, 10, 4);
    state.settings.minutesPerShift = clampInt(document.getElementById('set-minutes').value, 1, 20, 4);
    state.settings.lowMax = clampInt(document.getElementById('set-lowmax').value, 0, 4, 2);
    state.settings.levelSplit = clampInt(document.getElementById('set-levelsplit').value, 1, 9, 4);
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

  // ---------- Init ----------
  renderSquad();
  renderMatchday();
  renderSettings();
  persistAll();

  // Register service worker for offline use (best effort, ignore failures)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
