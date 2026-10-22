# Worldline

A small physics game played on a 1+1D spacetime diagram. Steer your worldline by changing your rapidity, outrun your decay clock with time dilation, slip through gates in spacetime, and refuel from Doppler-shifted photons. See [GAME_DESIGN.md](GAME_DESIGN.md).

```sh
npm install
npm run dev     # play at http://localhost:5173
npm test        # physics, collision, level and solvability tests
npm run build
```

Controls: ←/→ or A/D to thrust, Space to pause, R to restart, Enter for the next level, Esc for the level menu, 1–6 to jump to a level. On touch screens, hold the left or right half of the screen.

Levels live in `levels/*.json` and are listed in `src/levels.ts`.

## Hosting

`.github/workflows/deploy.yml` builds, tests and publishes the game to GitHub Pages on every push to `main`. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**. The game is then served at `https://<owner>.github.io/<repo>/`.
