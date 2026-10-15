# Multiplayer Game Hub

## Overview
A real-time multiplayer gaming platform with four games: Blackjack, Imposter, Yon, and Yonopoly. Uses Socket.io for real-time communication.

## Games
- **Blackjack**: Casino card game, 1-5 players, bet and beat the dealer
- **Imposter**: Social deduction game, 3-8 players, find who doesn't know the word
- **Yon**: UNO-style card game, 2-8 players, match colors/numbers
- **Yonopoly**: Monopoly clone with Yon cards, 2-4 players, buy properties and use cards to steal!

## Tech Stack
- Node.js + Express
- Socket.io for real-time multiplayer
- Vanilla JS frontend

## Structure
- `server.js` - Main game server with all game logic
- `public/` - Static frontend files
  - `home.html` - Game hub homepage
  - `index.html` - Blackjack game
  - `imposter.html/js/css` - Imposter game
  - `yon.html/js/css` - Yon card game
  - `yonopoly.html/js/css` - Yonopoly board game

## Running
Server runs on port 5000. Players join via lobby codes.

## Yon Cheats
- Press 'Y' key during Yon game to transform a random card into a +4
