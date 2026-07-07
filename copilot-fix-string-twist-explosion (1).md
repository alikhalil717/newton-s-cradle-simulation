# Copilot Fix Prompt — String "Twist Detection" Explosion Bug

## Context for Copilot

This is a Three.js Newton's Cradle simulation. The string physics (`stringPhysics.js`)
simulates each pendulum string as **two** Verlet-integrated particle chains per ball
(a "two-string" V-shape cradle). At `stringAngle = 0`, `ball.stringHalfSpread` is `0`,
so both strings of a ball share the same anchor point and the same ball-attachment
point (perfectly coincident). At `stringAngle > 0`, the two anchors are offset by
`±stringHalfSpread` in Z, and both strings converge on the same ball — a normal "V"
shape.

## Observed bug (screenshots attached by the user)

1. A single pulled-aside ball's string renders as a jagged zigzag while other strings
   stay straight.
2. At full rest (no balls swinging), **all** strings zigzag.
3. A ball ends up separated from the rest, and a long straight line shoots diagonally
   across the entire scene.
4. Eventually many strings turn red and shoot lines across the whole viewport in every
   direction.

**Follow-up test the user ran, comparing `stringAngle = 0°` vs `stringAngle = 29°`:**

| | 0° two-string angle | 29° two-string angle |
|---|---|---|
| Before start | straight strings | straight strings |
| ~0.1s in, before any collision | strings already zigzag, **grey/white** | strings already zigzag, **magenta/purple**, much denser, covers a wider area |
| ~0.7s, after balls have collided and stopped | still zigzag, grey/white | still zigzag, magenta/purple |

The magenta/purple tint at 29° is important: it exactly matches
`updateStringVisuals()`'s `isTw` branch color (`0xaa44ff`), which only renders when
`isTwisted === true`. This tells us that at 29°, the string-physics code considers the
strings "twisted" **consistently, from the very first frame, before any ball has even
touched another** — this is not random noise, it is a deterministic miscalculation.
At 0° the strings stay the default grey — meaning `isTwisted` is *not* consistently
true there, yet the position is still zigzagged. That distinction is the key to the
real root cause below.

This is one underlying bug cascading through several visible symptoms, not several
unrelated bugs.

## Root cause analysis

### Bug 1 (root cause) — `detectSelfTwist()` measures the wrong quantity
`StringPhysics.detectSelfTwist()`:

```js
const v0 = new THREE.Vector3().copy(sp[0].endParticle.pos).sub(sp[0].anchorParticle.pos); v0.y = 0;
const v1 = new THREE.Vector3().copy(sp[1].endParticle.pos).sub(sp[1].anchorParticle.pos); v1.y = 0;
let ang = 0;
if (v0.length() > 1e-6 && v1.length() > 1e-6) ang = Math.acos(Math.max(-1, Math.min(1, v0.normalize().dot(v1.normalize()))));
sp[0].twistAngleWithNeighbor = ang; sp[1].twistAngleWithNeighbor = ang;
const tw = ang > TWIST_ANGLE_THRESHOLD; // 30°
```

This computes the angle between "anchor → ball" for string 0 and "anchor → ball" for
string 1, and flags a twist whenever that raw angle exceeds a fixed 30°. That is the
wrong quantity to compare against a fixed threshold, for two distinct reasons that
match the two things the screenshots show:

**At `stringAngle > 0` (e.g. 29°, screenshots `72`–`74`):** the two anchors sit on
*opposite* sides of the ball in Z (`+stringHalfSpread` and `-stringHalfSpread`), by
design — that's what makes it a "two-string V" cradle instead of a single string. So
the anchor→ball vector for string 0 and the anchor→ball vector for string 1
*necessarily* point in substantially different — even close to opposite — directions
whenever there is real spread, purely from normal geometry, with **zero actual
twisting**. The bigger the two-string angle, the bigger this "natural" angle gets. A
fixed 30° threshold has no way to tell "this is just the V shape" apart from "this is
actually twisted", so at 29° the code reports `isTwisted = true` **on the very first
frame**, before the balls have even touched — exactly what screenshots `72` and `73`
show (dense magenta zigzag, `isTw` color `0xaa44ff`, present immediately).

**At `stringAngle = 0` (screenshots `61`–`63`):** both anchors coincide exactly
(`stringHalfSpread = 0`), so in a perfect world `v0` and `v1` are always identical and
`ang` stays `0`. But small numerical divergences between the two nominally-identical
strings (introduced elsewhere in the pipeline — e.g. `detectStringCollisions()`
comparing all 4 combinations of `(ball i's string0/1)` × `(ball j's string0/1)` and
applying corrections to each string sequentially and in place, which is a redundant
4x-comparison for what should be one shared line, and desynchronizes the two strings'
particles slightly frame over frame) push `v0`/`v1` just over the `1e-6` guard with an
essentially random direction. This makes `ang` — and therefore `isTwisted` — flicker
unpredictably true/false frame to frame, rather than being consistently true. Because
`resolveTwisting()`'s position offsets partially persist (only slowly relaxed by the
distance/bending constraints) while the *color* has no memory and is recomputed fresh
from the current frame's `isTwisted` value every frame, you get exactly what's in
`61`–`63`: a persistent grey/white zigzag whose color never turns purple, because by
the time the screenshot is taken `isTwisted` has usually flickered back to `false`
again even though the position damage from a moment ago is still visible.

**The fix:** don't compare the raw angle to a fixed threshold at all. Compare the
*current* angle to a **baseline angle recorded once, when the string is first
initialized in its rest configuration** (`StringPhysics.initialize()`), and only flag
a twist when the angle has moved meaningfully *away from that baseline*. A normal V-shape
pendulum's baseline already captures whatever "natural" angle its geometry produces
(0° when spread is 0, something larger when spread is bigger) — genuine twisting is a
*change* from that baseline, not the baseline's absolute value.

### Bug 2 (critical/explosive) — erroneous `* 1000` scale factor
`StringPhysics.resolveTwisting()`:

```js
const fm = rs / Math.max(dist, 0.001);
p0.pos.addScaledVector(dir, -fm * p0.invMass * 1000);
p1.pos.addScaledVector(dir, fm * p1.invMass * 1000);
```

For a `regular` string, `particleMass = 0.001` kg → `invMass = 1000`. This stray
`* 1000` stacked on top of an already-large `invMass` inflates what should be a
millimeter-scale separation correction into a displacement on the order of
**10⁴–10⁶ meters per call**. This is what flings string particles across the entire
scene (the long diagonal lines in screenshots 3 and 4). This fires every time Bug 1
falsely sets `isTwisted = true` — which, being noise-driven, can happen unpredictably
on any ball, any frame.

### Bug 3 (visual signature) — sinusoidal zigzag applied unconditionally
Still inside `resolveTwisting()`:

```js
const phase = (pi / np) * Math.PI * 4, off = sa * Math.sin(phase);
...
p0.pos.addScaledVector(pd, off);
p1.pos.addScaledVector(pd, -off);
```

This applies a literal sine-wave offset along the string's particle chain whenever
`isTwisted` is true. This is exactly the jagged zigzag pattern seen in screenshots 1
and 2 — it's not a rendering artifact, the particles themselves are being pushed into
a wave shape every frame the (false) twist flag is set.

### Bug 4 (secondary/cascading, not a separate root cause)
Once Bug 2 flings particles across the room, they cross paths with other balls'
strings. `detectTangled()` → `_checkCrossed()` then (correctly, given the corrupted
state) reports tangling, and `updateStringVisuals()` colors those strings toward red
(`0xff4444`) proportional to `tangledTimer` severity. This explains why screenshot 4
shows widespread red lines — it's downstream of Bugs 1–3, not an independent issue.

### Bug 5 (minor, separate) — `return` instead of `continue`
`StringPhysics.updateVisuals()`:

```js
if (pos.count !== np) {
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(str.particles.map(p => p.pos.clone()));
    return;   // <-- exits the whole function, skipping every remaining string this frame
}
```

This `return` is inside a nested loop over `(ball, side)` pairs. It should only skip
the *current* string, not abort updating every other ball's strings for the frame.

### Bug 6 (redundancy that doubles the risk of Bugs 1–3)
`detectSelfTwist()` + `resolveTwisting()` are called **twice per rendered frame**:
- Once per physics substep inside `physics.js`'s `step()` (up to 8 times per frame,
  since `dt = 1/600` and `maxSubsteps = 8`).
- Once more in `main.js`'s `animate()` loop, *after* `physics.simulate()` has already
  run all substeps for the frame:

```js
stringPhysics.detectTangled(state.balls);
stringPhysics.detectSelfTwist(state.balls);   // redundant — already done inside physics.js
stringPhysics.resolveTwisting(state.balls);   // redundant — already done inside physics.js
stringPhysics.updateStringVisuals(state.balls);
```

This doesn't cause the bug by itself, but it doubles how often the explosive
correction can fire per rendered frame.

---

## Instructions for Copilot — please make these exact changes

### 1. `stringPhysics.js` — fix false-positive twist detection

In `detectSelfTwist(balls)`, skip twist detection entirely when the ball's two
strings have no meaningful lateral separation to begin with (i.e. `stringHalfSpread`
is ~0), and raise the noise-floor threshold so tiny floating-point vectors can't
produce a spurious angle:

```js
detectSelfTwist(balls) {
    for (let i = 0; i < balls.length; i++) {
        const sp = this.strings[i];
        if (!sp || !sp[0] || !sp[1]) continue;

        // Guard: with stringHalfSpread ~ 0 the two strings are meant to be
        // coincident. There is no meaningful "twist" to detect, and the XZ
        // direction vectors below are pure floating-point noise in that case.
        if (balls[i].stringHalfSpread < 1e-4) {
            sp[0].twistAngleWithNeighbor = 0;
            sp[1].twistAngleWithNeighbor = 0;
            sp[0].isTwisted = false;
            sp[1].isTwisted = false;
            continue;
        }

        const v0 = new THREE.Vector3().copy(sp[0].endParticle.pos).sub(sp[0].anchorParticle.pos); v0.y = 0;
        const v1 = new THREE.Vector3().copy(sp[1].endParticle.pos).sub(sp[1].anchorParticle.pos); v1.y = 0;
        let ang = 0;
        // Require both vectors to have a non-trivial lateral magnitude
        // (relative to the string's half-spread) before trusting their angle.
        const minLen = Math.max(balls[i].stringHalfSpread * 0.1, 1e-3);
        if (v0.length() > minLen && v1.length() > minLen) {
            ang = Math.acos(Math.max(-1, Math.min(1, v0.normalize().dot(v1.normalize()))));
        }
        sp[0].twistAngleWithNeighbor = ang; sp[1].twistAngleWithNeighbor = ang;
        const tw = ang > TWIST_ANGLE_THRESHOLD;
        sp[0].isTwisted = tw; sp[1].isTwisted = tw;
    }
}
```

### 2. `stringPhysics.js` — remove the explosive `* 1000` factor and clamp the correction

In `resolveTwisting(balls)`, remove the stray `* 1000` multiplier and clamp the
maximum per-call displacement so this code path can never again fling a particle
outside the scene, regardless of mass/threshold tuning in the future:

```js
const np = Math.min(sp[0].particles.length, sp[1].particles.length);
const rs = cfg.twistResistance * 0.002;
// Safety clamp: never move a particle more than a small fraction of one
// segment length in a single correction pass.
const maxCorrection = str0SegmentLengthSafe(sp) * 0.25; // see helper below

for (let pi = 1; pi < np - 1; pi++) {
    const p0 = sp[0].particles[pi], p1 = sp[1].particles[pi];
    if (p0.invMass === 0 || p1.invMass === 0) continue;
    const d = new THREE.Vector3().copy(p1.pos).sub(p0.pos);
    const dist = d.length();
    if (dist < 1e-6) continue;
    const dir = d.normalize();
    const fm = rs / Math.max(dist, 0.001);
    const totalInv = p0.invMass + p1.invMass;
    // Mass-weighted correction, clamped — no more stray *1000 scale factor.
    const corr0 = Math.min(fm * (p0.invMass / totalInv), maxCorrection);
    const corr1 = Math.min(fm * (p1.invMass / totalInv), maxCorrection);
    p0.pos.addScaledVector(dir, -corr0);
    p1.pos.addScaledVector(dir, corr1);
}
```

Add a small helper near the top of the class (or inline) to get a safe max-correction
distance from the string's own segment length instead of a magic number:

```js
// Returns a small, bounded distance (a fraction of one string segment) used to
// clamp any positional correction so it can never explode regardless of mass
// or resistance tuning.
function str0SegmentLengthSafe(sp) {
    const segLen = (sp[0] && sp[0].segmentLength) || 0.01;
    return segLen;
}
```

### 3. `stringPhysics.js` — bound the sinusoidal "untwist" offset the same way

In the second half of `resolveTwisting()` (the `cfg.twistResistance < 0.5` branch),
clamp `off` so it can never exceed a small fraction of the segment length:

```js
if (cfg.twistResistance < 0.5 && sp[0].isTwisted) {
    const segLen = sp[0].segmentLength || 0.01;
    const sa = Math.min((1 - cfg.twistResistance) * 0.002, segLen * 0.1);
    for (let pi = 1; pi < np - 1; pi++) {
        const p0 = sp[0].particles[pi], p1 = sp[1].particles[pi];
        if (p0.invMass === 0) continue;
        const phase = (pi / np) * Math.PI * 4, off = sa * Math.sin(phase);
        const sd = new THREE.Vector3().copy(sp[0].endParticle.pos).sub(sp[0].anchorParticle.pos).normalize();
        const perp = new THREE.Vector3(1, 0, 0);
        if (Math.abs(sd.dot(perp)) > 0.9) perp.set(0, 0, 1);
        const pd = new THREE.Vector3().crossVectors(new THREE.Vector3().crossVectors(sd, perp).normalize(), sd).normalize();
        p0.pos.addScaledVector(pd, off);
        p1.pos.addScaledVector(pd, -off);
    }
}
```

(This branch will now also simply never run for coincident-string balls, since Bug 1's
fix keeps `isTwisted` false for them.)

### 4. `stringPhysics.js` — fix `return` → `continue` in `updateVisuals()`

```js
updateVisuals(balls) {
    for (let i = 0; i < this.strings.length && i < balls.length; i++)
        for (let s = 0; s < 2; s++) {
            const str = this.strings[i][s], line = balls[i].stringLines[s];
            if (!str || !line) continue;
            const pos = line.geometry.attributes.position;
            const np = str.particles.length;
            if (pos.count !== np) {
                line.geometry.dispose();
                line.geometry = new THREE.BufferGeometry().setFromPoints(str.particles.map(p => p.pos.clone()));
                continue; // was `return` — that silently skipped every other string this frame
            }
            for (let pi = 0; pi < np; pi++) pos.setXYZ(pi, str.particles[pi].pos.x, str.particles[pi].pos.y, str.particles[pi].pos.z);
            pos.needsUpdate = true;
        }
}
```

### 5. `main.js` — remove the redundant per-frame twist detect/resolve calls

`physics.js` already runs `detectSelfTwist()` + `resolveTwisting()` internally on every
substep (see `PhysicsEngine.step()`, phase 8). Calling them again after
`physics.simulate()` in `main.js` is redundant and doubles exposure to any future
twist-related bug. In the `animate()` function, change:

```js
// Post-step: tangle detection + twisting (Phase 4.2-4.3)
stringPhysics.detectTangled(state.balls);
stringPhysics.detectSelfTwist(state.balls);
stringPhysics.resolveTwisting(state.balls);
stringPhysics.updateStringVisuals(state.balls);
```

to:

```js
// Post-step: tangle detection only. Self-twist detection/resolution already
// runs once per substep inside physics.step() — calling it again here was
// redundant and doubled exposure to twist-resolution corrections per frame.
stringPhysics.detectTangled(state.balls);
stringPhysics.updateStringVisuals(state.balls);
```

### 6. (Defensive, optional but recommended) — sanity-clamp string particle positions

As a last line of defense against any future regression of this kind, add a cheap
per-frame sanity check in `StringPhysics` that snaps back any particle whose distance
from its own ball's pivot exceeds a generous multiple of the string's total length
(e.g. `3x`). This should never trigger in normal operation — it's a safety net, not a
physics feature:

```js
/** Defensive: clamp any particle that has drifted implausibly far from its
 *  own ball's pivot back onto a sane radius. Should never trigger in normal
 *  operation — this only guards against future numerical-explosion bugs. */
sanitizeParticles(balls) {
    for (let i = 0; i < this.strings.length && i < balls.length; i++) {
        const pivot = balls[i].pivot;
        const maxDist = balls[i].length * 3;
        for (const str of this.strings[i]) {
            for (const p of str.particles) {
                if (p.invMass === 0) continue;
                if (!isFinite(p.pos.x) || !isFinite(p.pos.y) || !isFinite(p.pos.z)
                    || p.pos.distanceTo(pivot) > maxDist) {
                    p.pos.copy(pivot);
                    p.prevPos.copy(pivot);
                }
            }
        }
    }
}
```

Call it once per frame in `main.js`, right before `stringPhysics.updateVisuals(state.balls)`.

---

## Validation checklist after the fix

1. Load the default scenario (`Case 1`, `stringAngle = 0`) and let all balls rest —
   every string should render as a straight line, no zigzag.
2. Let the simulation run for 30+ seconds untouched — strings should stay straight;
   no particle should ever appear to shoot off-screen.
3. Increase `stringAngle` (two-string spread) via the GUI and pull a ball — confirm
   genuine string divergence/twisting (if the balls actually cross strings) is *still*
   detected and resolved gently, without exploding.
4. Try `Case 6 — Crossed strings` specifically, since it deliberately offsets ball
   pivots laterally — confirm the twist/tangle visuals (color change) behave sensibly
   and don't explode.
5. Watch the energy HUD (top-right) during steps 1–4 — total energy should stay
   bounded and should not spike or go to `NaN`.
