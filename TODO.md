# Newton's Cradle — Implementation Steps

## Step 1: Project Scaffolding & Dependencies

- Install lil-gui
- Create file structure (ball.js, physics.js, collisions.js, energy.js, scenarios.js, ui.js)
- Set up scene with renderer, camera, OrbitControls, lighting, ground plane

## Step 2: Spherical Pendulum Ball

- Ball class: position, velocity, pivot point, constraint projection (PBD)
- Single ball swinging under gravity

## Step 3: Chain & Collisions

- N balls in a chain with configurable gap
- Contact detection & impulse-based collision with restitution
- Verify Case 1 (single ball pull, N=5)

## Step 4: Physics Engine & Energy Tracking

- Full physics integrator (gravity, air drag, pivot friction)
- Energy bookkeeping (kinetic, potential, dissipated)
- Fixed-substep animation loop

## Step 5: UI, Presets & Polish

- lil-gui control panel with all parameters
- 9 scenario presets
- Materials, frame/stand mesh, final polish
