const { generateSchedule } = require('./scheduler.js');

const fullRoster = [
  { name: 'Adam', level: 3 }, { name: 'Albert', level: 3 }, { name: 'Alexander', level: 4 },
  { name: 'Alvar', level: 4 }, { name: 'Camilo', level: 7 }, { name: 'Caesar', level: 5 },
  { name: 'Charlie', level: 6 }, { name: 'Elis', level: 7 }, { name: 'Frank', level: 7 },
  { name: 'Hennix', level: 7 }, { name: 'Hugo', level: 4 }, { name: 'James', level: 7 },
  { name: 'Lev', level: 7 }, { name: 'Lucas', level: 6 }, { name: 'Oscar', level: 6 },
  { name: 'Philip', level: 5 }, { name: 'Sid', level: 4 }, { name: 'Theodoros', level: 5 },
];

function checkResult(sel, res) {
  if (!res.ok) { console.log('  FAILED:', res.error); return; }
  const level = {}; sel.forEach(p => level[p.name] = p.level);
  res.schedule.forEach((lineup, i) => {
    if (lineup.length !== 4) throw new Error('bad lineup size at shift ' + i);
  });
  const mins = Object.values(res.minutesPerPlayer);
  console.log('  OK. minutes range:', Math.min(...mins), '-', Math.max(...mins), 'warnings:', res.warnings.length);
  if (res.warnings.length) res.warnings.forEach(w => console.log('    WARN:', w));
}

// realistic case: coach calls 9 players for a match (as recommended in matchregler-u13.md)
function sample(arr, n, seedOffset) {
  const a = arr.slice();
  let seed = 12345 + seedOffset;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

for (const n of [4,5,6,7,8,9,10,11,12,18]) {
  console.log('n=' + n);
  const sel = sample(fullRoster, n, n);
  const res = generateSchedule(sel, { shifts: 8, onCourt: 4, minutesPerShift: 4, seed: n });
  console.log('  selected:', sel.map(p => p.name + '(' + p.level + ')').join(', '));
  checkResult(sel, res);
}

// edge case explicitly: only 1 low player selected (known-infeasible strict case)
console.log('edge: 1 low + 4 high');
const edgeSel = [
  { name: 'Adam', level: 3 }, { name: 'Frank', level: 7 }, { name: 'Camilo', level: 7 },
  { name: 'Elis', level: 7 }, { name: 'Lev', level: 7 },
];
const edgeRes = generateSchedule(edgeSel, { shifts: 8, onCourt: 4, minutesPerShift: 4, seed: 1 });
checkResult(edgeSel, edgeRes);
console.log(JSON.stringify(edgeRes.schedule));

console.log('ALL DONE');
