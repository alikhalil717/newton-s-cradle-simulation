# Fix scenario menu + Case 5 (tilted pivots) + related bugs

Apply the following fixes to the Newton's Cradle simulation. Work through them in order. Do not rename files or restructure modules beyond what's described.

## 1. Restrict the selectable scenarios to Cases 1, 2, 3, 5, 6, 8, 9 — keep their exact numbering

The report defines 9 case studies, but only Cases **1, 2, 3, 5, 6, 8, 9** should appear in the UI dropdown. Cases 4 and 7 must be removed from the selectable list, but their numbering must NOT shift (e.g. Case 5 must stay "Case 5", it must not become "Case 4").

In `scenarios.js`:

- Keep `case4` and `case7` implemented as methods (don't delete the functions — they may be reused later for ball-vs-string collision testing), but **do not expose them in the public scenario list**.
- Add a `selectableNames` getter (or similar) that returns only the keys for Cases 1, 2, 3, 5, 6, 8, 9 plus `'Custom'`, in this exact order:
  ```
  'Case 1 — Single ball pull, N=5'
  'Case 2 — Two balls pulled, N=5'
  'Case 3 — N=7 chain'
  'Case 5 — Tilted pivots'
  'Case 6 — Crossed strings'
  'Case 8 — Gaps between balls'
  'Case 9 — Fully inelastic (e≈0)'
  'Custom'
  ```
- The existing `names` getter currently returns `Object.keys(this.scenarios)`, which includes Case 4 and Case 7 — this is what's populating the dropdown today. Replace its use in the UI with the new restricted list (or change `names` itself to return the restricted list, and add an internal `allNames` if all 9 are still needed anywhere).
- `apply(name, params)` must keep working for ALL scenario keys (including case4/case7) in case they're invoked programmatically later — only the **menu list** should be restricted, not the lookup table.

In `main.js`:

- `state.scenarioNames: scenarioManager.names` must end up populated with the restricted 7-case + Custom list, not all 9.

In `ui.js`:

- No changes needed if `state.scenarioNames` is already correct — the dropdown is built from `this.state.scenarioNames`.

## 2. Fix Case 5 — Tilted pivots (currently broken)

**Problem:** The current `case5()` implementation just translates the middle ball's pivot sideways by `L * sin(α)`:

```js
balls[midIdx].pivot.x += L * Math.sin(alpha);
```

This only shifts _where_ the pendulum hangs from — it does NOT tilt the string itself. Since gravity still pulls straight down (`-y`) in `physics.js`, the ball still settles directly under its (now-shifted) pivot with the string vertical. This produces a uniform lateral offset of one ball in the chain, not the physics described in the report: a string that is tilted by angle α from vertical at equilibrium, with:

- equilibrium displaced to `x_eq = L sin(α)` measured from the pivot's own local vertical (not from the world frame),
- a tangential restoring force component that no longer points purely in-plane,
- non-parallel collision velocities between neighboring balls, producing genuine out-of-plane / 3D motion.

**Fix:** Model the tilt as a per-ball tilted "local down" (gravity) direction, not a translated pivot.

In `ball.js`:

- Add a `pivotTiltDeg` (or `tiltAngle`) parameter to the constructor, default `0`. Store it as `this.pivotTilt` (radians).
- Add a getter `gravityDir` that returns the local "down" unit vector for this ball, tilted by `this.pivotTilt` around the Z axis (the axis perpendicular to the cradle's swing plane):
  ```js
  get gravityDir() {
      return new THREE.Vector3(
          Math.sin(this.pivotTilt),
          -Math.cos(this.pivotTilt),
          0
      );
  }
  ```
  (this makes the equilibrium position `pos_eq = L * gravityDir = (L sin α, -L cos α, 0)`, matching `x_eq = L sin(α)` from the report for small α)

In `physics.js`:

- In `computeForces(ball)`, replace the hardcoded `ball.force.y -= ball.mass * this.g;` with a force along the ball's own gravity direction:
  ```js
  const gDir = ball.gravityDir; // (0,-1,0) when untilted — must match existing behavior exactly
  ball.force.addScaledVector(gDir, ball.mass * this.g);
  ```
  Verify this produces identical results to the old code when `pivotTilt === 0` (regression check — all other 6 selectable cases must be bit-for-bit unaffected).

In `scenarios.js`, rewrite `case5()`:

- Do NOT move `balls[midIdx].pivot`. Instead, set `balls[midIdx].pivotTilt = alpha` (radians) when constructing that ball (pass `pivotTiltDeg` / tilt through `createChain`'s `ballParams`, applied only to the middle index).
- Also fix the existing hardcoded string length bug in this case: it currently uses `params.length ?? params.L ?? 0.30` only to compute the tilt offset, but doesn't need that anymore since the tilt is now an angle, not a length-based offset — just make sure the chain itself still respects `params.length` (it already does, via `createChain`).
- Keep `theta0` pull-angle logic on ball 0 as-is.

After this fix, Case 5 should show the middle ball hanging at a visibly tilted angle at rest (not vertical), and its collisions with neighbors should impart a small out-of-plane velocity component to adjacent balls, consistent with the report's described 3D drift.

## 3. Fix Case 3 — N=7 chain (hardcoded N, ignores GUI)

In `scenarios.js`, `case3()` currently does `const N = 7;`, ignoring `params.N` entirely, so changing the "Ball count" slider after selecting Case 3 has no effect and the GUI desyncs. Change to:

```js
case3(params = {}) {
    const N = 7; // Case 3 always starts at N=7 by definition...
```

Instead, on selection it should **initialize** N to 7 (already done via the returned `params.N: 7`, which `main.js` uses to set `state.N = result.params.N`), but afterward, if the user changes the N slider and `onParamChange` re-runs `setupScenario('Case 3 — N=7 chain', ...)`, it must use `params.N` (the now-updated value), not force back to 7. Fix:

```js
case3(params = {}) {
    const N = params.N || 7;
    const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);
    const balls = this.createChain(N, params);
    balls[0].setAngularState(theta0, Math.PI);
    // Only force N=7 in the returned params on first selection, not on every param change.
    return { balls, params: { restitution: 0.97 } };
}
```

Remove the `N: 7` from the returned params object so it stops overwriting `state.N` on every GUI tweak — the initial N=7 should instead be set once in `main.js`'s `onScenarioChange` callback when `value === 'Case 3 — N=7 chain'` (set `state.N = 7` there before calling `setupScenario`).

## 4. Fix Case 6 — Crossed strings (theta=0 has no positional effect)

In `scenarios.js`, `case6()` sets `balls[i].pivot.z += 0.005` for odd-indexed balls, but those balls are otherwise left at their default `setAngularState`-free rest position (theta=0). Confirm this still produces a visible swing-plane offset (it does, since it's a pivot offset, not a `setAngularState` call — this part is fine). However, verify that `theta0` for ball 0 is reasonable (currently defaults to 20° vs 30° elsewhere) and that the out-of-plane pivot offset (0.005 m) is large enough relative to ball radius to cause a visible glancing collision instead of being imperceptible. Increase the offset to scale with ball radius, e.g.:

```js
balls[i].pivot.z += 0.3 * state_radius; // ~30% of radius, visibly off-axis but still colliding
```

(pass radius through `params.radius` rather than a fixed constant, taking the first element if it's an array).

## 5. Sanity-check the remaining selectable cases

- **Case 1, Case 2:** No known bugs — just confirm they still work after the gravity-direction refactor in step 2 (regression test with `pivotTilt = 0` for all balls).
- **Case 8 (gaps):** Confirm `gap` is correctly passed through `createChain` and produces a real spacing change — no known bug, just verify after the other edits.
- **Case 9 (fully inelastic):** Confirm `restitution: 0.01` plus the collision resolution fix already applied (`if (relVelNormal < 0) return;` in `collisions.js`) produces the expected near-total momentum transfer / single final velocity behavior.

## 6. Default mass should respect the 0.1–1 kg range

In `scenarios.js`, `createChain()` still falls back to `const mass = ballParams.mass ?? 0.065;` and `ball.js`'s constructor default is `mass = 0.065`. Both are outside the project's target mass range (0.1–1 kg). Update both fallback defaults to `0.5` (mid-range) so any code path that omits an explicit mass still produces a physically valid ball.

## Acceptance criteria

- The scenario dropdown shows exactly: Case 1, Case 2, Case 3, Case 5, Case 6, Case 8, Case 9, Custom — in that order, with no renumbering.
- Selecting Case 5 shows a visibly tilted string at rest and produces measurable out-of-plane motion after collision, without changing the pivot's world position.
- Case 3's ball-count slider correctly updates the chain length away from 7 after initial selection.
- Case 6 produces a visible glancing/off-axis collision.
- Cases 1, 2, 8, 9 are unaffected (regression-checked) by the gravity-direction refactor.
- No default ball mass falls outside 0.1–1 kg.
