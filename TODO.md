# Newton's Cradle — 3D Physics Simulation

## Build Steps

### Step 1 — Project Scaffolding & Basic Scene

- [ ] Install `lil-gui` dependency
- [ ] Create file structure: `ball.js`, `physics.js`, `collisions.js`, `scenarios.js`, `energy.js`, `ui.js`
- [ ] Set up the 3D scene with renderer, camera, `OrbitControls`, lighting, shadows, ground plane
- [ ] Create a simple frame/stand mesh for the Newton's Cradle

### Step 2 — Spherical Pendulum Ball

- [ ] Implement the `Ball` class with Cartesian state (position, velocity, pivot)
- [ ] Implement constraint projection (enforce string length `L`)
- [ ] Implement gravity force
- [ ] Get a single ball swinging correctly as a spherical pendulum

### Step 3 — Ball Chain & Collisions

- [ ] Create N balls in a chain along the X axis
- [ ] Implement contact detection between adjacent balls (distance check)
- [ ] Implement impulse-based collision resolution with coefficient of restitution `e`
- [ ] Verify basic Newton's Cradle behavior (Case 1: single ball pull)

### Step 4 — Physics Engine & Energy Tracking

- [ ] Complete physics integrator with semi-implicit Euler + fixed substeps
- [ ] Add air drag force (`F_air = -b·v`)
- [ ] Add pivot friction damping
- [ ] Implement energy bookkeeping (kinetic, potential, dissipated)
- [ ] Wire substepped physics loop into the animation frame

### Step 5 — UI, Presets & Polish

- [ ] Build lil-gui control panel with all Table-1 parameters
- [ ] Implement all 9 scenario presets from report §7
- [ ] Realistic metallic materials + scene polish
- [ ] Live energy display / chart
- [ ] Final testing of all presets
