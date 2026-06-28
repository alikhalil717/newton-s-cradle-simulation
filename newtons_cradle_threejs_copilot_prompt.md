# Newton's Cradle — 3D Physics Simulation Build Prompt (for GitHub Copilot in VS Code)

**How to use this file:** Open a new empty folder in VS Code, open Copilot Chat in **Agent mode**, paste this entire document as your first message, and also attach/drag in the Word file (`الفصل_الأول.docx`) for extra context. Then let it scaffold the project. If Copilot can't parse the .docx directly, that's fine — every formula it needs is already transcribed below.

---

## 0. Role & context

You are helping build a graded university physics-engineering project: a **3D Newton's Cradle simulation in Three.js** that visually and numerically reproduces the physics derived in an academic report (Chapter 1, "الدراسة الفيزيائية", University of Damascus, Faculty of Computer Engineering). The simulation's job is to *demonstrate* the report's physics — momentum/energy conservation, Hertzian contact, the 3D spherical-pendulum model, energy dissipation, and the report's 9 "success/failure" case studies — interactively, with adjustable parameters.

Treat the equations in Section 3 below as the authoritative spec. A handful of them have been corrected from the original draft — those are flagged `⚠️ CORRECTED` with an explanation. Implement the corrected versions, not the original ones; do not silently "fix" anything else without flagging it back to me.

---

## 1. Project goal

Build an interactive, browser-based 3D Newton's Cradle where:
- N steel balls hang from two-string pivots, swinging as **spherical pendulums** (not flat 2D pendulums) — lateral/out-of-plane motion must be physically possible, since several required scenarios depend on it.
- Collisions between adjacent balls are resolved with a configurable **coefficient of restitution**.
- Energy dissipation (air drag being the dominant continuous loss, inelastic collision loss being the dominant impulsive loss) is tracked and can be displayed live.
- All physical parameters from Table 1 of the report are exposed as live-adjustable controls.
- The 9 case studies from report §7 are selectable presets that reproduce the described behavior.

---

## 2. Tech stack & project structure

- **Three.js** (latest), **Vite** as the dev server/bundler (`npm create vite@latest` → vanilla JS template).
- **lil-gui** for the parameter/scenario control panel.
- `OrbitControls` for camera.
- Plain JavaScript (ES modules) is fine — no TypeScript needed unless you want it.

Suggested file layout:
```
/src
  main.js          // scene, renderer, camera, loop
  physics.js       // integrator, forces, constraint projection
  collisions.js    // contact detection + impulse resolution
  ball.js          // Ball class (state + Three.js mesh)
  scenarios.js      // the 9 case-study presets + custom config
  energy.js        // energy bookkeeping / live chart data
  ui.js            // lil-gui panel wiring
index.html
```

---

## 3. Physical model (use the report's derivation, with corrections applied)

### 3.1 Setup
Each ball `i` hangs from a pivot point spaced along a horizontal bar. At rest, balls touch their neighbors (center-to-center spacing = `2R`). Each ball's position is constrained to a sphere of radius `L` (string length) around its own pivot — a **spherical pendulum**, report §1.3:

```
x = L sinθ cosφ
y = -L cosθ          (measured downward from the pivot)
z = L sinθ sinφ
constraint: x² + y² + z² = L²        (report §1.3, holonomic constraint)
```

`θ` = polar angle from vertical, `φ` = azimuthal angle (out-of-plane swing).

### 3.2 Implementation strategy: Cartesian + constraint projection (not raw θ/φ ODEs)

The report derives the governing equations two equivalent ways: (a) Lagrangian ODEs in `(θ, φ)` (report §1.1.3–2.3), and (b) a Cartesian per-ball formulation with the string as a holonomic constraint (report §5.4):

```
m ẍᵢ = -T(xᵢ/L) + Σⱼ F_contact,ij·n̂ᵢⱼₓ + F_air,x
m ÿᵢ = -T(yᵢ/L) - mg + Σⱼ F_contact,ij·n̂ᵢⱼᵥ + F_air,y
m z̈ᵢ = -T(zᵢ/L) + Σⱼ F_contact,ij·n̂ᵢⱼᵤ + F_air,z
subject to: xᵢ² + yᵢ² + zᵢ² = L²
```

**Use formulation (b).** It is mathematically equivalent to (a) but far simpler and more numerically robust to implement in a real-time engine, and it avoids the coordinate singularity at θ=0. Concretely, each timestep:
1. Compute Cartesian forces on each ball: gravity, air drag, contact/collision forces (Section 3.4).
2. Integrate velocity and position (semi-implicit Euler or RK4 — RK4 is preferable given the stiff contact forces; use a fixed small substep, e.g. `dt ≈ 1/240`–`1/600 s`, possibly with multiple substeps per render frame).
3. **Constraint projection** ("string is inextensible"): after integrating, rescale each ball's position vector (relative to its own pivot) back to length `L`, and remove the radial component of velocity so the ball's velocity stays tangent to the sphere. This implicitly enforces the same constraint as the tension term `T` above, without ever needing to compute `T` explicitly (standard position-based-dynamics technique for pendulums/ropes).

This lets one general engine handle every case in §7 (different `L`, different pivot offsets, different `m`, tilted attachment points, gaps) just by changing per-ball parameters — no special-casing.

### 3.3 Forces

**Gravity:** `F_g = (0, -mg, 0)`.

**Air drag** (report §2.1.3-c) — implement the linear model as default (matches the report's dominant-dissipation ranking, Table 2):
```
F_air = -b · v⃗        (v⃗ = ball's Cartesian velocity)
```
Optionally expose a quadratic-drag toggle: `F_air = -½ Cd ρ A |v| v⃗` for users who want it.

**Pivot friction** (report §2.1.3-d): small secondary effect (report's own Table 2 ranks it "small/cumulative", well below collision loss and air drag). Implement simply as a velocity-proportional damping on the ball's tangential speed scaled by `μk`; treat it as optional/cosmetic, not load-bearing for the visible dynamics.

**Tension/constraint force:** handled implicitly via the position/velocity projection in §3.2 — do not compute it as an explicit spring force (that would reintroduce stiffness/instability).

### 3.4 Collision model

Two adjacent balls are in contact when `δᵢⱼ = max(0, 2R - |rᵢ - rⱼ|) > 0` (report §5.4).

**Default / primary method — impulse-based, using the restitution coefficient `e` directly** (this is exactly the report's own "instantaneous collision model", §1.4):
- Detect contact each substep (distance check between neighboring — and, for generality, all — ball pairs).
- Resolve with a standard 3D restitution impulse along the contact normal `n̂ᵢⱼ = (rᵢ-rⱼ)/|rᵢ-rⱼ|`, conserving momentum and applying `e` to the normal relative velocity. For unequal masses, the general two-body restitution formulas are (⚠️ see correction #6 below):
```
v₁' = [(m₁ - e·m₂)v₁ + (1+e)m₂v₂] / (m₁+m₂)
v₂' = [(1+e)m₁v₁ + (m₂ - e·m₁)v₂] / (m₁+m₂)
```
This is robust, fast, and matches everything the report's case studies (§7) describe.

**Optional / advanced mode (stretch goal):** a continuous Hertzian-contact force `F_contact = k_H·δ^(3/2)` (report §2.4) with a damping term, for users who want to see the short-duration contact deformation explicitly rather than an instantaneous impulse. Keep this as a separate toggle — it's far more expensive (needs very small substeps, `Δt ≈ 5×10⁻⁵ s` contact duration per report §2.4) and isn't needed for correct visible behavior.

### 3.5 Energy bookkeeping (report §5) — for an optional live "energy budget" panel

```
E_total(t) = E_kinetic(t) + E_potential(t) + E_dissipated(t)
E_kinetic  = Σᵢ ½ m|vᵢ|²
E_potential = Σᵢ mg·(yᵢ - y_min,i)          (per-ball height above its own lowest point)
ΔE_collision = ½μv²_rel(1-e²),  μ = m₁m₂/(m₁+m₂)   (report §5.1.1 — energy lost per collision)
```
Track cumulative collision loss + cumulative air-drag work (`P_air = b|v|²`, report §5.1.2) to plot a running energy-dissipation breakdown. This is a nice, easy way to visually connect the simulation back to report Chapter/§5 for the write-up.

### 3.6 Parameter table (report Table 1 — ⚠️ one value corrected, see #5 below)

| Parameter | Symbol | Default | Unit | Adjustable |
|---|---|---|---|---|
| Ball mass | m | 0.065 | kg | yes |
| Ball radius | R | **0.0125** ⚠️corrected (report said 0.02) | m | yes |
| String length | L | 0.30 | m | yes |
| Gravity | g | 9.81 (9.79 at Damascus) | m/s² | yes |
| Restitution | e | 0.95–0.98 | – | yes |
| Air drag coeff. | b | 0.002–0.005 | N·s/m | yes |
| Pivot friction coeff. | μk | 0.01–0.05 | – | yes |
| Ball count | N | 5 | int | yes |
| Hertz contact constant | k_H | material-dependent | N/m^1.5 | yes (advanced mode only) |

---

## 4. Corrections applied to the source study — please implement these, not the originals

The report is mostly correct and internally consistent, but contains the following issues. Use the corrected version in every case:

1. **Sign error in potential energy (§1.1.3).** The draft states `U = -mgL(1-cosθ)`, but then correctly uses `L = T - mgL(1-cosθ)` one line later, and §3.3 elsewhere in the same report correctly states `U(θ) = +mgL(1-cosθ)`. The correct potential energy (zero at the lowest point) is **`U(θ) = +mgL(1-cosθ)`**. (This didn't break the report's final equations of motion, which were already derived correctly — just the standalone `U=` line had a stray minus sign.)

2. **Terminology: "Coriolis" vs. "centrifugal" (§1.1.3).** The term `mL² sinθcosθ·φ̇²` in the θ-equation is mislabeled "Coriolis force." It depends on `φ̇²` (a square of one velocity) and arises from azimuthal rotation pushing the ball outward — this is the **centrifugal term**, standard terminology for spherical pendulums. The actual coupling term `2mL²sinθcosθ·θ̇φ̇` in the φ-equation (depending on the *product* of two different velocities) is the one that's structurally Coriolis-like. Use "centrifugal term" / "θ-φ coupling term" in code comments, not "Coriolis," since this is a Lagrangian (inertial-frame) derivation, where "Coriolis force" strictly refers to a rotating-frame fictitious force.

3. **Duplicated/garbled initial conditions (§1.2).** The draft lists `θᵢ(0)=θᵢ₀` twice and `θ̇ᵢ(0)=ωᵢ₀` twice with mismatched labels (clearly a copy-paste slip where `φ` should have appeared). The correct, non-redundant set is:
```
θᵢ(0) = θᵢ,0      initial polar angle
φᵢ(0) = φᵢ,0      initial azimuthal angle
θ̇ᵢ(0) = ωθ,ᵢ,0    initial polar angular velocity
φ̇ᵢ(0) = ωφ,ᵢ,0    initial azimuthal angular velocity
```

4. **Unjustified/unused inertia term (§1.1.3).** `I_eff,θ = mL² + (2/5)mR²` mixes the ball's own spin moment of inertia into the orbital pendulum inertia. These are independent degrees of freedom (this model doesn't couple ball spin to swing), and the report's own final equations of motion never actually use this expression — they correctly use plain `mL²` throughout. **Drop this term**; use `I = mL²` for swing dynamics.

5. **Parameter inconsistency: ball radius vs. mass (Table 1).** With `m = 0.065 kg` and `R = 0.02 m`, the implied density is `ρ = m/((4/3)πR³) ≈ 1940 kg/m³` — far too low for the stated material (steel, ρ ≈ 7800–8000 kg/m³). For a steel ball of mass 0.065 kg, consistent radius is **`R ≈ 0.0125 m`** (≈25 mm diameter — the actual size of a standard commercial Newton's-cradle ball, which also weighs about this much). Use `R = 0.0125 m`, not `0.02 m`, so the Hertz-stiffness and contact-time formulas (which depend on `R`) stay physically consistent.

6. **Unequal-mass collision formulas assume `e=1` (§7, case 7).** The draft's `v₁' = ((m₁-m₂)/(m₁+m₂))v₁` etc. are the perfectly-elastic special case. Since the rest of the report uses `e = 0.95–0.98`, implement the general restitution formulas given in §3.4 above (they reduce to the report's formulas exactly when `e=1`).

7. **Minor: contact-damping↔restitution formula mismatch (§3.4/2.4).** `e = exp(-πβ/ωₙ)` is the standard result for a *linear* spring-damper contact, but the report's own contact force model is the *nonlinear* Hertzian one (`F = k_Hδ^1.5 + cδ̇`), for which this exact formula doesn't strictly apply. This is why the default implementation should use the impulse/restitution method directly (Section 3.4) rather than trying to back out `c` from this formula — it sidesteps the mismatch entirely and is also far more efficient for real-time rendering.

(Everything else — the Lagrangian derivation, the final θ/φ equations of motion, the Hertz contact-stiffness scaling `k_H ∝ √R*`, the local-gravity formula and Damascus value `g≈9.79 m/s²`, the energy-loss-per-collision formula, the fully-inelastic case-9 derivation, and the case-7 velocity-ratio table — checked out correctly and should be used as-is.)

---

## 5. Scenario presets (report §7) — implement as selectable presets in the UI

1. **Case 1 — single ball pull, N=5:** `θ₁(0)=30°`, rest at equilibrium, `e=0.97`. Expect: ball 5 ejects at ~entry speed, balls 2–4 stay nearly still.
2. **Case 2 — two balls pulled, N=5:** `θ₁(0)=θ₂(0)=30°`. Expect: two balls eject from the far side together.
3. **Case 3 — N=7:** same single-pull setup, larger chain, pattern should still hold.
4. **Case 4 — one string longer/shorter:** give one ball `L₃ = L+ΔL`. Expect visible lateral/out-of-plane deviation — this is exactly why the spherical (not flat) pendulum model from §3.1 is required.
5. **Case 5 — tilted pivots:** offset one pivot by angle `α` so its equilibrium `x_eq = L sin α ≠ 0`. Expect non-parallel impact velocities → sideways drift.
6. **Case 6 — crossed/irregular strings:** vary each ball's swing-plane orientation; expect off-axis "glancing" collisions and visible energy/momentum loss into rotation/scatter.
7. **Case 7 — unequal masses:** vary `mᵢ`; use the general restitution formulas (correction #6) and let the user see asymmetric velocity transfer (the "tsunami" amplification case when masses increase monotonically along the chain).
8. **Case 8 — gaps between balls:** introduce `Δx` between rest positions; ball accelerates across the gap before impact (`v_impact ≈ √(v₀² + 2g·Δx/L)`), increasing impact energy.
9. **Case 9 — fully inelastic (`e≈0`):** balls stick on contact; verify the simulation reproduces `v_final = v₁/N` and energy loss fraction `(N-1)/N` after the first collision cascade.

---

## 6. UI / controls

- lil-gui panel with: ball count `N`, mass `m`, radius `R`, string length `L`, gravity `g` (with a Damascus-value quick button), restitution `e`, air-drag `b`, pivot friction `μk`, gap `Δx`, scenario dropdown (the 9 cases + "custom"), play/pause/reset, and a "Hertz contact mode (advanced)" toggle.
- Optional live chart (small canvas overlay or a lightweight chart lib) showing kinetic / potential / cumulative-dissipated energy over time, per Section 3.5.
- OrbitControls camera, realistic-looking metallic spheres (`MeshStandardMaterial`, high metalness/low roughness), a simple frame/stand mesh, shadows, and a ground plane.

---

## 7. Acceptance checklist

- [ ] Each ball is a true spherical pendulum (3D `θ, φ`), not constrained to a single 2D plane.
- [ ] Default scenario (Case 1) visually reproduces the classic Newton's Cradle behavior.
- [ ] All 9 presets from Section 5 are selectable and behave as described.
- [ ] All Table-1 parameters are live-adjustable and immediately affect the simulation.
- [ ] Energy is visibly dissipated over time (oscillation amplitude decays); at `e=1, b=0, μk=0` the system stays (numerically) energy-conserving for sanity-checking.
- [ ] Code comments reference the report section numbers (e.g. `// report §2.1.3 - air drag`) so this stays traceable back to Chapter 1 of the write-up.
- [ ] The 7 corrections in Section 4 are implemented as described, not the original draft formulas.

---

Build this step by step: scaffold the Vite + Three.js project first, get a single static spherical-pendulum ball rendering and swinging correctly under gravity + constraint projection, then add the full chain, then collisions, then the GUI/scenarios/energy panel last.
