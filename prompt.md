# Fix pivot friction: replace viscous damping with Coulomb (dry) friction per spec §2.1.3-d

## Problem

The report defines pivot/joint friction as **Coulomb (dry) friction**:

```
τ_pivot = μk · N_pivot · sign(θ̇)
```

- Constant magnitude (`μk · N_pivot`), independent of speed.
- `N_pivot` is the normal/reaction force at the joint, which the report computes from the string tension: `T = mg·cos(θ) + mL·θ̇²`.
- Direction always opposes the current angular velocity (`sign(θ̇)`), via the `sign(θ̇/|θ̇|)` term.
- Energy dissipated by this term: `W_pivot = ∫ τ_pivot dθ = μk·N_pivot ∫|dθ|`, i.e. `ΔE_pivot/cycle ≈ 4·μk·N_pivot·θ_max`.

`physics.js` currently implements **viscous (linear) friction** instead:

```js
// computeForces(ball) — current (incorrect) implementation
const radialDir = ball.pos.clone().normalize();
const vRadial = radialDir.clone().multiplyScalar(ball.vel.dot(radialDir));
const vTangential = ball.vel.clone().sub(vRadial);
ball.force.addScaledVector(vTangential, -this.muK * ball.mass);
```

This force is proportional to `m·v_tangential`, which is a different physical law entirely (viscous drag, not dry friction), and it never references `N_pivot`/tension at all. The `_frictionWork` energy accumulator in `step()` has the same problem — it integrates `vt²` (consistent with a viscous law) rather than `N_pivot·|v_tangential|` (consistent with Coulomb friction).

## Fix

### 1. Add a tension/normal-force helper

In `ball.js`, add a method to compute the current string tension (this is also generally useful, and matches the report's tension formula `T = mg cosθ + mLθ̇²` extended to the Cartesian/3D formulation already used elsewhere in this codebase):

```js
/**
 * Current string tension (≈ pivot normal force), report eq. T = mg·cos(θ) + mL·θ̇²
 * Computed in Cartesian form: radial component of gravity + centripetal term.
 */
getTension(g) {
    const L = this.effectiveLength;
    const radialDir = this.pos.clone().normalize();
    const gravityForce = this.gravityDir.clone().multiplyScalar(this.mass * g);
    const radialGravity = gravityForce.dot(radialDir); // ≈ m g cosθ
    const vRadial = radialDir.clone().multiplyScalar(this.vel.dot(radialDir));
    const vTangential = this.vel.clone().sub(vRadial);
    const centripetal = this.mass * vTangential.lengthSq() / L; // m L θ̇² in tangential-speed form
    return Math.max(0, radialGravity + centripetal);
}
```

### 2. Replace the viscous friction force with Coulomb friction in `physics.js`

In `computeForces(ball)`, replace:

```js
const radialDir = ball.pos.clone().normalize();
const vRadial = radialDir.clone().multiplyScalar(ball.vel.dot(radialDir));
const vTangential = ball.vel.clone().sub(vRadial);
ball.force.addScaledVector(vTangential, -this.muK * ball.mass);
```

with:

```js
const radialDir = ball.pos.clone().normalize();
const vRadial = radialDir.clone().multiplyScalar(ball.vel.dot(radialDir));
const vTangential = ball.vel.clone().sub(vRadial);
const tangentialSpeed = vTangential.length();

// Coulomb (dry) pivot friction: τ_pivot = μk · N_pivot · sign(θ̇)  (report §2.1.3-d)
// Constant magnitude, opposing the direction of tangential motion.
// Below a small speed threshold, skip to avoid divide-by-zero / force chatter at rest.
const EPS = 1e-5;
if (tangentialSpeed > EPS) {
  const N_pivot = ball.getTension(this.g);
  const frictionDir = vTangential.clone().divideScalar(tangentialSpeed); // unit vector, opposes motion when negated
  ball.force.addScaledVector(frictionDir, -this.muK * N_pivot);
}
```

### 3. Fix the friction energy accumulator in `step()`

Replace:

```js
const radialDir = ball.pos.clone().normalize();
const vRadial = radialDir.clone().multiplyScalar(ball.vel.dot(radialDir));
const vTangential = ball.vel.clone().sub(vRadial);
const vt2 = vTangential.lengthSq();
this._frictionWork += this.muK * ball.mass * vt2 * this.dt;
```

with power = force · velocity for the new Coulomb model (`P = μk·N_pivot·|v_tangential|`, matching the report's `W_pivot = μk·N_pivot·∫|dθ|` form):

```js
const radialDir = ball.pos.clone().normalize();
const vRadial = radialDir.clone().multiplyScalar(ball.vel.dot(radialDir));
const vTangential = ball.vel.clone().sub(vRadial);
const tangentialSpeed = vTangential.length();
if (tangentialSpeed > 1e-5) {
  const N_pivot = ball.getTension(this.g);
  this._frictionWork += this.muK * N_pivot * tangentialSpeed * this.dt;
}
```

(Compute `N_pivot` once per ball per substep and reuse it between the force step and the energy-tracking step rather than calling `getTension()` twice — e.g. cache it in a local variable inside the same loop iteration in `step()`.)

### 4. Regression-check

- With `μk` in its existing range (0.01–0.05) the new Coulomb model should still produce gradual, visible damping of the oscillation amplitude over many swings — but the _shape_ of the decay will now be closer to linear amplitude loss per cycle rather than a pure exponential, since dry friction (unlike viscous drag) doesn't decay exponentially on its own. Combined with the (still viscous, and correctly-modeled) air drag term, you should still see the overall system settle within the same rough number of oscillations as before — confirm this stays visually reasonable; if `μk` needs retuning to keep total settle time comparable, it's fine to do so, since the report only gives the typical range, not an exact value.
- Confirm balls still come to rest (no perpetual jitter) — since the new model is now a true constant-direction-opposing force, make sure the `EPS` velocity threshold prevents force direction from flipping rapidly at near-zero tangential speed (this is a classic Coulomb-friction implementation pitfall — "infinite stiffness" oscillation at v≈0). If chatter appears, increase `EPS` slightly or add a simple velocity-based blending near zero (e.g. ramp the friction magnitude down linearly for `tangentialSpeed < EPS`).
- No other files need to change — collisions, restitution, energy bookkeeping for collision/drag, and all 7 selectable scenario setups are already correct and require no modification.

## Out of scope (confirmed correct, no action needed)

For context — these were checked against the report and require **no changes**:

- Gravity, linear air drag, and their respective energy-tracking terms.
- Impulse-based collision resolution and the general unequal-mass restitution formulas.
- Collision energy-loss formula (`ΔE = ½μv_rel,normal²(1−e²)`).
- The decision to use instantaneous-impulse collisions rather than Hertzian contact mechanics — this matches the report's own primary model (§1.4), which is what its case studies (Ch. 7) are analyzed under. Hertz contact (§2.4) is presented as an optional higher-fidelity refinement, not a requirement.
- Case 5's tilted-pivot equilibrium (`x_eq = L sin α`), already fixed in a prior pass.
