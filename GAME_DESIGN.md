# Worldline — Game Design (Draft 1)

A small physics game set in a 1+1 dimensional universe (one space dimension, one time dimension), played directly on a spacetime (Minkowski) diagram. The player steers a worldline through spacetime, and special relativity is the game's rule set.

Design principle: **start tiny, make each mechanic fun on its own, and add one idea at a time.** Every feature should be both a gameplay element and a piece of real physics.

---

## 1. Pitch

You are an unstable particle with a short life. Your internal clock (proper time) is ticking down. To reach the exit far away before you decay, you must move fast, and moving fast makes your clock tick slower. Thread your worldline between obstacles that exist only for a while, using a limited fuel budget, without ever exceeding the speed of light.

It plays like a vertical scroller on the spacetime diagram: time scrolls upward, and you steer left and right.

## 2. The world and its rules

### Diagram
- Horizontal axis: space `s`. Vertical axis: coordinate time `t` (pointing up).
- Units with `c = 1`: light moves along 45° lines.
- The camera follows the player's current `t`, so the diagram scrolls upward as time advances.

### Core physics: steer the rapidity
The player never sets velocity directly. Input changes the **rapidity** `φ`:

- Velocity: `v = tanh(φ)`, which is always in (−1, 1), so the speed of light can never be reached.
- Four-velocity: `(cosh φ, sinh φ)`, which lies on the hyperbola `t² − s² = 1`.
- Proper time: `dτ = dt / cosh φ`, so your clock slows as you speed up.

Thrust is a constant proper acceleration `a`, applied in your own frame:

```
dφ = ±a · dτ = ±a · dt / cosh(φ)
```

### Update loop (fixed coordinate-time step)
```
each frame (dt fixed, e.g. 1/60 in game units):
  thrust = input (-1, 0, +1), only if fuel > 0
  dτ   = dt / cosh(φ)
  φ   += thrust * a * dτ
  fuel -= |thrust| * a * dτ        // fuel is measured as a rapidity budget
  x   += tanh(φ) * dt
  t   += dt
  τ_left -= dτ                    // decay clock
  record (t, x) to the worldline
```

Measuring fuel in rapidity units is physically meaningful: for an ideal rocket, the total Δφ is proportional to the log of the mass ratio. It also makes the cost of braking exactly equal to the cost of speeding up.

## 3. Draft 1 scope

Keep it to **one screen, one mechanic set, five levels.**

### Entities
| Entity | Representation | Behaviour |
|---|---|---|
| Player | Bright worldline trail plus current point | Steered via rapidity |
| Light cone | Two faint 45° lines from the player's current event (future cone) | Shows where you can still go; nothing outside it is reachable |
| Exit | A box in spacetime (an `s` range × a `t` window) | Reach it to win |
| Blocks | Rectangles in spacetime (`s` range × `t` range) | Touching one ends the run |
| Photons | 45° lines from emitters, coloured by their Doppler shift in your frame | Pickup that refills fuel; energy depends on the Doppler shift (see below) |

**Why blocks are spacetime rectangles:** in one dimension you cannot step aside. Anything between you and the goal must be passed, so obstacles have to exist only for a limited time. You avoid them by **timing**: arrive before a block appears, or after it disappears. On the diagram, this looks like threading a path through gaps, with your slope limited by your light cone.

### Doppler colours (the third dimension, via colour)
A photon's colour shows its frequency **as measured by the player right now**. Because the frequency depends on your rapidity, every photon on screen recolours live as you accelerate. Speeding up turns the world ahead blue and the world behind red.

In 1+1D the relativistic Doppler factor is a plain exponential of rapidity:

```
right-moving photon:  D = f_seen / f_emitted = exp(φ_source − φ_player)
left-moving photon:   D = f_seen / f_emitted = exp(φ_player − φ_source)
```

In Draft 1 all emitters are at rest (`φ_source = 0`), so D = e^(−φ) for photons travelling right and D = e^(+φ) for photons travelling left. Running into a photon blueshifts it; running away from it redshifts it.

**Colour mapping:** use `ln D` (a rapidity difference), not D, so the scale is symmetric.
- `ln D = 0`: green (emitted colour)
- `ln D` from −1.5 to +1.5: mapped across the visible spectrum, red → orange → yellow → green → blue → violet
- `ln D < −1.5`: "infrared", drawn as a dim, dark-red dashed line
- `ln D > +1.5`: "ultraviolet/gamma", drawn as a white-violet glowing line

**Gameplay — Doppler fuel:** collecting a photon (crossing its line) adds fuel equal to `baseEnergy × D`, capped at a maximum per pickup. Charging into oncoming photons pays well; chasing photons that run away from you gives almost nothing. The player learns the Doppler effect as a resource decision: heading into the light is profitable, but it also means heading away from where you might want to go.

Draft 1 ignores the momentum kick from absorbing a photon (see roadmap).

### HUD
- Proper time left (the decay clock), shown prominently
- Coordinate time `t`
- Speed `v` (as a fraction of c) and γ = cosh φ
- Fuel bar

### Win and lose conditions
- **Win:** your worldline enters the exit box.
- **Lose:** your decay clock reaches 0, you touch a block, or you leave the level bounds.
- **Score:** proper time remaining at the exit (more is better), shown as stars.

### Controls
- Left/right arrows (or A/D): thrust left/right
- R: restart
- Space: pause

## 4. Level progression (Draft 1)

Each level introduces one idea.

1. **First steps.** The exit is nearby, with a generous clock and no blocks. Learn that thrust changes your slope, and that you can't go past 45°.
2. **Running out of time.** The exit is far away, and the clock is too short to get there slowly. You must go fast to arrive at all, which is the muon effect: time dilation keeps you alive.
3. **Gates.** Blocks appear and disappear. Wait, then dash, or dash, then wait.
4. **Brakes cost fuel.** The exit is a narrow, close-by `t` window. You must speed up and then slow down within the fuel budget.
5. **Headwind.** Too little starting fuel to reach the exit. Photon emitters on both sides fire periodically. Turning toward the oncoming photons blueshifts them into big fuel pickups; the ones you chase are redshifted and nearly worthless.
6. **All together.** A short gauntlet combining the decay clock, gates, fuel and Doppler pickups.

Levels are defined in data (JSON), so new ones are easy to add:

```json
{
  "name": "Running out of time",
  "start": { "x": 0, "t": 0, "phi": 0 },
  "decayClock": 6.0,
  "fuel": 3.0,
  "accel": 1.5,
  "bounds": { "xMin": -2, "xMax": 25, "tMax": 40 },
  "exit": { "x0": 18, "x1": 20, "t0": 0, "t1": 40 },
  "blocks": [ { "x0": 8, "x1": 9, "t0": 5, "t1": 12 } ],
  "emitters": [
    { "x": 24, "direction": -1, "tStart": 2, "period": 3, "baseEnergy": 0.3 }
  ]
}
```

An emitter at rest at position `x` fires a photon in `direction` (−1 = travelling left, +1 = travelling right) every `period` units of coordinate time, starting at `tStart`.

## 5. Tech suggestion

- **TypeScript + Vite + HTML Canvas 2D.** No game engine.
- Structure:
  ```
  src/
    main.ts          // boot, game loop
    physics.ts       // rapidity update, pure functions, unit-testable
    level.ts         // load and validate level JSON
    collision.ts     // worldline segment vs rectangle
    render.ts        // diagram, grid, light cone, HUD
    input.ts
  levels/*.json
  tests/physics.test.ts
  ```
- Keep the physics pure and separate from rendering, so it can be unit-tested. Useful tests:
  - `|v| < 1` always
  - at constant φ, `τ = t / cosh φ`
  - a symmetric speed-up/slow-down burn returns φ to 0 and uses fuel equal to 2Δφ
  - Doppler: for a source at rest, `D(left-moving) × D(right-moving) = 1` at any φ, and `D = 1` at φ = 0
  - the colour mapping is monotonic in `ln D` and symmetric around green

### Draft 1 is done when
- All six levels are playable, with win/lose and restart
- Photons recolour live as the player accelerates, and pickups give Doppler-scaled fuel
- The worldline, light cone and HUD render correctly while scrolling
- The physics tests pass
- A first-time player understands "fast = slower clock" from level 2 without reading anything

## 6. Roadmap (one idea per draft)

**Draft 2 — Anti-you.** After a run, your recorded worldline is replayed in reverse as an antiparticle travelling **down** the diagram from your future. On the next attempt, touching it means annihilation. At a fixed moment, you see it appear as pair creation. You're partly dodging your own previous choices.

**Draft 3 — Flip vertices.** Photon vertices in the level reverse the direction of your worldline in `t` (the Feynman–Stueckelberg picture). One continuous path can cross the same moment three times. Your own proper time keeps increasing throughout.

**Draft 4 — Your own frame.** Toggle between the lab view and your rest frame (a Lorentz boost of the whole diagram). The "now" line tilts, block timings shift, and distant clocks visibly desync. A simultaneity slider lets you play with it.

**Draft 5 — Light-delay vision.** You only see events on your past light cone, so blocks are shown where they *were*. Planning means reasoning about the diagram rather than reacting to the screen.

**Later ideas**
- Photon momentum: absorbing a photon also kicks your rapidity in its direction of travel, so collecting oncoming photons slows you down.
- Gamma hazard: photons blueshifted beyond a threshold damage you instead of fuelling you. More speed means more reward and more danger.
- Moving emitters: sources with their own rapidity, so the colours encode relative motion between two objects.
- Colour as an extra space dimension: a few hue "lanes" on a circular hue wheel, making a curled-up third dimension (Kaluza–Klein style). Moving between lanes costs speed along `s`, and it lifts the 1D rule that you can't step aside.
- Twin race: arrive alongside a stationary clock with as much proper time as possible.
- Charged-pair strings: in 1+1D the force between charges doesn't weaken with distance, so a stretched string snaps into a new pair (a toy version of the Schwinger model).
- 2D black hole: light cones tip toward a horizon. Einstein's equations are empty in 1+1D, so this would be modelled on a dilaton theory (e.g. Jackiw–Teitelboim) or simply drawn as a stretched coordinate grid.

## 7. Physics notes and honest caveats

- The hyperbola `t² − s² = 1` is the normalisation of the four-velocity in flat (special-relativistic) spacetime. It is not a solution of Einstein's equations, which are trivial in 1+1D.
- "Antiparticles go backward in time" is an interpretation that reproduces the observed physics. Nothing carries information into the past.
- Planck-time ticks were considered and dropped: they added decoration but no gameplay or insight.
