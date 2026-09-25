const { parseProfixioSquad, diffRosterWithProfixio } = require('./profixio-import.js');
const fs = require('fs');

const sample = `Trupp
Sorting
Ändra vy
AD
9
Adam
Darin
2014-07-09
Ungdom
AAF
18
Albert
Al Fakir
2014-07-10
Ungdom
AGD
21
Alexander
Gahm Dahlquist
2014-04-04
Ungdom
AG
1
Alvar
Grahn
2014-12-17
Ungdom
CVVA
3
Caesar
Valiente Vecchio Amedi
2014-09-30
Ungdom
CHCD
Camilo Hernan
Cadavid Donoso
2014-01-29
Ungdom
CR
22
Charlie
Rrecaj
2014-08-05
Ungdom
EEH
Elis
Eriksson Hising
2014-10-13
Ungdom
FB
2
Frank
Borgudd
2014-07-17
Ungdom
HBF
11
Hennix
Bestelid Filippopoulos
2014-09-27
Ungdom
HNT
10
Hugo
Nordlander Terud
2014-08-07
Ungdom
JI
17
James
Ingram
2014-06-10
Ungdom
LM
20
Lev
Melnyk
2014-07-16
Ungdom
LM
25
Lucas
Marat
2014-07-22
Ungdom
OH
23
Oscar
Hallström
2014-07-15
Ungdom
PE
Philip
Erasmie
2014-05-09
Ungdom
SB
8
Sid
Berry
2014-02-26
Ungdom
TV
Theodoros
Vasilakos
2014-12-18
Ungdom
Ledare
GB
Gustaf
Borgudd
Coach
Easy Basket
1983-11-24`;

const parsed = parseProfixioSquad(sample);
console.log('Parsed count:', parsed.length);
parsed.forEach(p => console.log(' ', p.number, p.firstname, p.lastname, p.birthdate));

// current app roster: mirrors app.js DEFAULT_ROSTER AFTER Caesar was removed
const currentRoster = [
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
  { name: 'Oscar', number: 23, level: 7 },
  { name: 'Philip', number: 17, level: 5 },
  { name: 'Sid', number: 8, level: 4 },
  { name: 'Theodoros', number: 20, level: 5 },
  { name: 'Ghost', number: 99, level: 1 }, // simulate a player who left but wasn't cleaned up
];

const diff = diffRosterWithProfixio(currentRoster, parsed);
console.log('\nToAdd (in Profixio, not in app):', diff.toAdd.map(p => p.firstname));
console.log('ToRemove (in app, not in Profixio):', diff.toRemove.map(p => p.name));
console.log('ToUpdateNumber:', diff.toUpdateNumber);

console.log('\nALL DONE');
