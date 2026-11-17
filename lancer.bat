@echo off
rem Double-clique pour lancer le jeu dans ton navigateur.
rem Garde cette fenetre ouverte pendant que tu joues; ferme-la pour arreter le jeu.
title Ligue Boreale - serveur du jeu (ferme cette fenetre pour arreter)
cd /d "%~dp0"
python serveur.py --ouvrir
if errorlevel 1 pause
