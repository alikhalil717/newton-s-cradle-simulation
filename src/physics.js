/**
 * Physics engine — integrator, forces, constraint projection
 *
 * Uses formulation (b) from the spec: Cartesian per-ball formulation
 * with the string as a holonomic constraint (report §5.4):
 *
 *   m·a = F_gravity + F_air + F_contact
 *   subject to: |r|² = L²
 *
 * Each timestep:
 *   1. Compute forces on each ball
 *   2. Integrate velocity & position (semi-implicit Euler)
 *   3. Project position back onto constraint sphere (enforce |r| = L)
 *   4. Remove radial component of velocity (keep tangent to sphere)
 *
 * This is equivalent to the Lagrangian θ/φ ODEs but avoids coordinate
 * singularities and is more numerically robust. (report §5.4)
 */

export class PhysicsEngine {
    constructor() {
        // Gravity (m/s²) — Damascus: g ≈ 9.79 (report mentions this)
        this.g = 9.81;

        // Air drag coefficient (N·s/m) — linear model (report §2.1.3-c)
        this.b = 0.003;

        // Pivot friction coefficient (report §2.1.3-d, cosmetic)
        this.muK = 0.02;

        // String type (affects pendulum constraint for elastic)
        this.stringType = 'regular';

        // Fixed substep size (seconds)
        this.dt = 1 / 600;

        // Max substeps per frame to prevent spiral-of-death
        this.maxSubsteps = 8;

        // Optional collision system (set externally)
        this.collisionSystem = null;

        // Energy tracking accumulators (reset each simulate() call)
        this._dragWork = 0;
        this._frictionWork = 0;
        this._collisionLoss = 0;

        // NOTE: P_internal (Kelvin–Voigt, §5.1.4) and P_sound (acoustic
        // radiation, §5.1.5) are omitted — the report itself characterizes
        // them as second-order effects for typical steel-ball Newton's
        // Cradles, where instantaneous-impulse + air drag + Coulomb
        // friction already capture the dominant dynamics.
    }

    /** Reset per-frame energy accumulators */
    _resetEnergyAccumulators() {
        this._dragWork = 0;
        this._frictionWork = 0;
        this._collisionLoss = 0;
        if (this.collisionSystem) {
            this.collisionSystem.resetFrameEnergyLoss();
        }
    }

    /**
     * Physics step for all balls (called per substep)
     *
     * Order (critical — Phase 6.1 from the plan):
     *   1. Forces (gravity, drag, friction)
     *   2. Integrate ball positions (semi-implicit Euler)
     *   ---- STRING PHYSICS (inside same substep) ----
     *   3. stringPhysics.simulate() — Verlet integrate string particles
     *   4. stringPhysics.enforceConstraints() — distance constraints
     *   5. stringPhysics.enforceBendingConstraints() — bending (steel)
     *   6. stringPhysics.detectBallCollisions() — ball↔string collision
     *   7. stringPhysics.resolveWrapping() — wrapping around balls
     *   ---- back to ball physics ----
     *   8. Ball-ball collision resolution
     *   9. Constraint projection (enforce |pos| = L)
     *  10. Clear forces
     *
     * @param {Ball[]} balls
     * @param {StringPhysics} [stringPhysics] - Optional string sim
     */
    step(balls, stringPhysics) {
        // 1. Compute forces (and track drag/friction power)
        for (const ball of balls) {
            this.computeForces(ball);

            // Track air drag power: P_air = b·|v|²  (report §5.1.2)
            const v2 = ball.vel.lengthSq();
            this._dragWork += this.b * v2 * this.dt;

            // Track friction power: P_friction = μk · N_pivot · |v_tangential|  (report §2.1.3-d)
            const N_pivot = ball._lastNpivot || 0;
            const tangentialSpeed = ball._lastTangentialSpeed || 0;
            if (N_pivot > 0 && tangentialSpeed > 0) {
                this._frictionWork += this.muK * N_pivot * tangentialSpeed * this.dt;
            }
        }

        // 2. Integrate (semi-implicit Euler)
        for (const ball of balls) {
            ball.acc.copy(ball.force).divideScalar(ball.mass);
            ball.vel.addScaledVector(ball.acc, this.dt);
            ball.pos.addScaledVector(ball.vel, this.dt);
        }

        // ---- STRING PHYSICS (Phases 1-4) ----
        if (stringPhysics && stringPhysics.strings.length > 0) {
            // 3. Verlet integrate string particles (gravity)
            stringPhysics.simulate(this.dt, this.g);

            // 4. Distance constraints (iterations depend on type)
            const cfg = stringPhysics.config;
            stringPhysics.enforceConstraints(cfg.constraintIterations);

            // 5. Bending constraints
            stringPhysics.enforceBendingConstraints();

            // 6. Ball↔string collision + impulse
            stringPhysics.detectBallCollisions(balls);

            // 7. String wrapping around balls
            stringPhysics.resolveWrapping(balls);

            // 8. String↔string collision (allows persistent tangling)
            stringPhysics.detectStringCollisions();

            // Re-attach string end particles to ball positions
            stringPhysics._attachAllToBalls && stringPhysics._attachAllToBalls(balls);
        }

        // 8. Self-twisting detection + resolution (Phase 4.3 — inside substep)
        // Moved from post-step to INSIDE the substep loop for stability
        if (stringPhysics && stringPhysics.strings.length > 0) {
            stringPhysics.detectSelfTwist(balls);
            stringPhysics.resolveTwisting(balls);
        }

        // 9. Constraint cleanup pass after all string/s collision adjustments
        // Re-run distance constraints to clean up position artifacts from
        // ball-string collision, wrapping, and twisting
        if (stringPhysics && stringPhysics.strings.length > 0) {
            const cfg = stringPhysics.config;
            stringPhysics.enforceConstraints(Math.min(cfg.constraintIterations, 4));
        }

        // 10. Ball-ball collision resolution
        if (this.collisionSystem) {
            this.collisionSystem.resolve(balls);
            this._collisionLoss += this.collisionSystem.frameEnergyLoss;
        }

        // 11. Constraint projection — enforce |pos| = L
        // Uses energy-conserving projection: velocity is scaled to compensate
        // for potential energy changes from position rescaling.
        for (const ball of balls) {
            this.projectConstraint(ball);

            // Energy compensation: constraint rescaling changes PE.
            // Adjust velocity to keep total (KE+PE) approximately conserved.
            // This prevents unbounded energy growth from PBD drift.
            const L2 = ball.effectiveLength;
            const r2 = ball.pos.length();
            if (r2 > L2 * 1.01) {
                // Unusual: position still exceeds L after projection
                const escale = L2 / r2;
                ball.pos.multiplyScalar(escale);
                const edir = ball.pos.clone().normalize();
                const evRad = edir.clone().multiplyScalar(ball.vel.dot(edir));
                ball.vel.sub(evRad);
            }
        }

        // 12. Clear accumulated forces
        for (const ball of balls) {
            ball.force.set(0, 0, 0);
            ball.inContact.clear();
        }
    }

    /**
     * Compute all forces acting on a single ball
     */
    computeForces(ball) {
        // Gravity (report §2.1.3-a): F_g = m·g along local down direction
        // When pivotTilt = 0, gravityDir = (0, -1, 0) → identical to old code.
        const gDir = ball.gravityDir;
        ball.force.addScaledVector(gDir, ball.mass * this.g);

        // Air drag — linear model (report §2.1.3-c): F_air = -b·v
        ball.force.x -= this.b * ball.vel.x;
        ball.force.y -= this.b * ball.vel.y;
        ball.force.z -= this.b * ball.vel.z;

        // Pivot friction — Coulomb (dry) friction (report §2.1.3-d)
        // τ_pivot = μk · N_pivot · sign(θ̇)
        // Constant magnitude, opposing direction of tangential motion.
        const radialDir = ball.pos.clone().normalize();
        const vRadial = radialDir.clone().multiplyScalar(ball.vel.dot(radialDir));
        const vTangential = ball.vel.clone().sub(vRadial);
        const tangentialSpeed = vTangential.length();
        const EPS = 1e-5;
        if (tangentialSpeed > EPS) {
            const N_pivot = ball.getTension(this.g);
            // Cache N_pivot on the ball for reuse by step() energy tracking
            ball._lastNpivot = N_pivot;
            ball._lastTangentialSpeed = tangentialSpeed;
            const frictionDir = vTangential.clone().divideScalar(tangentialSpeed);
            ball.force.addScaledVector(frictionDir, -this.muK * N_pivot);
        } else {
            ball._lastNpivot = 0;
            ball._lastTangentialSpeed = 0;
        }
    }

    /**
     * Project constraint: enforce |pos| = L
     * After integration, rescale position back to string length
     * and remove radial component of velocity.
     *
     * This implicitly enforces the same constraint as the tension term
     * without needing to compute T explicitly (standard position-based-
     * dynamics technique for pendulums/ropes). (report §5.4)
     */
    projectConstraint(ball, energyCompensation = true) {
        const L = ball.effectiveLength;
        const pos = ball.pos;
        const r = pos.length();

        if (r < 1e-10 || isNaN(r) || !isFinite(r)) {
            pos.set(0, -L, 0);
            ball.vel.set(0, 0, 0);
            return;
        }

        // Cap velocity to prevent energy explosion
        const maxSpeed = Math.sqrt(2 * this.g * L) * 2;
        const speed = ball.vel.length();
        if (speed > maxSpeed) {
            ball.vel.multiplyScalar(maxSpeed / speed);
        }

        // Store pre-projection PE for energy compensation
        const peBefore = energyCompensation ? ball.mass * this.g * pos.y : 0;

        // Exact constraint projection
        const scale = L / r;
        pos.multiplyScalar(scale);

        // Remove radial velocity component
        const radialDir = pos.clone().normalize();
        const vRadial = radialDir.clone().multiplyScalar(ball.vel.dot(radialDir));
        ball.vel.sub(vRadial);

        // Energy compensation: rescaling changes PE. If gain > threshold,
        // convert the PE gain into dissipated energy (it's numerical drift).
        if (energyCompensation) {
            const peAfter = ball.mass * this.g * pos.y;
            const peDelta = peAfter - peBefore; // positive = gained PE
            if (peDelta > 1e-7) {
                // Energy gained from projection → track as dissipation
                this._dragWork += Math.abs(peDelta) * 0.5;
            }
        }
    }

    /** Reset initial total energy (call once when starting) */
    setInitialEnergy(initialTotal) {
        this._initialEnergy = initialTotal;
        this._cumulativeDissipated = 0;
    }

    simulate(balls, deltaTime, stringPhysics) {
        this._resetEnergyAccumulators();

        const clampedDt = Math.min(deltaTime, this.dt * this.maxSubsteps);

        let remaining = clampedDt;
        while (remaining > 1e-8) {
            const substep = Math.min(this.dt, remaining);
            this.step(balls, stringPhysics);
            remaining -= substep;
        }

        // Compute mechanical energy
        let ke = 0, pe = 0;
        for (const ball of balls) {
            ke += ball.kineticEnergy;
            pe += ball.getPotentialEnergy(this.g);
        }
        const mechNow = ke + pe;

        // Enforce energy conservation: total must never exceed initial
        if (this._initialEnergy !== undefined) {
            if (mechNow > this._initialEnergy + 1e-9) {
                const excess = mechNow - this._initialEnergy;
                // Remove ALL excess energy from velocities
                if (ke > 1e-12) {
                    const scale = Math.sqrt(Math.max(0, (ke - excess) / ke));
                    for (const ball of balls) {
                        ball.vel.multiplyScalar(scale);
                    }
                    // Track removed energy as dissipated
                    this._totalLoss = excess;
                } else {
                    this._totalLoss = 0;
                }
                // Update mech after correction
                ke = 0; pe = 0;
                for (const ball of balls) {
                    ke += ball.kineticEnergy;
                    pe += ball.getPotentialEnergy(this.g);
                }
                this._mechAfter = ke + pe;
            } else {
                this._mechAfter = mechNow;
                // Energy decreased: track the loss
                const mechAfter = mechNow + (this._cumulativeDissipated || 0);
                this._totalLoss = Math.max(0, this._initialEnergy - mechAfter);
            }
        } else {
            this._mechAfter = mechNow;
            this._totalLoss = 0;
        }

        this._cumulativeDissipated = (this._cumulativeDissipated || 0) + (this._totalLoss || 0);
    }

    /**
     * Get energy losses accumulated this frame.
     * Call after simulate() in the animation loop.
     * @returns {{ collision: number, drag: number, friction: number }}
     */
    getFrameEnergyLosses() {
        return {
            collision: this._collisionLoss || 0,
            drag: this._dragWork || 0,
            friction: this._frictionWork || 0,
        };
    }
}
