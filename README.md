# Matchrotation — Fryshuset Eriksdal U13

Enkel mobilanpassad webbapp för att skapa rättvisa och blandade laguppsättningar
inför en basketmatch (4×8 min, 4 mot 4, U13-regler).

## Funktioner
1. Spelartrupp med gradering 1-10 per spelare
2. Kryssa i vilka spelare som är kallade till dagens match
3. Genererar automatiskt 8 byten (var 4:e minut) så alla spelade spelare får
   ungefär lika mycket total speltid
4. Varje byte blandas så att 1-2 lägre graderade spelare (1-4) alltid spelar
   ihop med minst 2 högre graderade (5-10)

All data sparas lokalt i webbläsaren (localStorage) — ingen inloggning,
ingen server, ingen molnlagring.

Live: https://hernandonoso.github.io/basket-rotation-app/
