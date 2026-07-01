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
     * Order: forces → integrate → collisions → constraint projection → clear
     * @param {Ball[]} balls
     */
    step(balls) {
        // 1. Compute forces (and track drag/friction power)
        for (const ball of balls) {
            this.computeForces(ball);

            // Track air drag power: P_air = b·|v|²  (report §5.1.2)
            const v2 = ball.vel.lengthSq();
            this._dragWork += this.b * v2 * this.dt;

            // Track friction power: P_friction = μk · N_pivot · |v_tangential|  (report §2.1.3-d)
            // N_pivot was computed and cached in computeForces() above — reuse it.
            const N_pivot = ball._lastNpivot || 0;
            const tangentialSpeed = ball._lastTangentialSpeed || 0;
            if (N_pivot > 0 && tangentialSpeed > 0) {
                this._frictionWork += this.muK * N_pivot * tangentialSpeed * this.dt;
            }
        }

        // 2. Integrate (semi-implicit Euler)
        for (const ball of balls) {
            // a = F / m
            ball.acc.copy(ball.force).divideScalar(ball.mass);

            // v += a * dt
            ball.vel.addScaledVector(ball.acc, this.dt);

            // x += v * dt
            ball.pos.addScaledVector(ball.vel, this.dt);
        }

        // 3. Collision resolution (impulse + position correction)
        // Must happen before constraint projection so position corrections
        // from overlap are then projected back onto the constraint sphere.
        if (this.collisionSystem) {
            this.collisionSystem.resolve(balls);
        }

        // 4. Constraint projection — enforce |pos| = L
        for (const ball of balls) {
            this.projectConstraint(ball);
        }

        // 5. Clear accumulated forces for next step
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
    projectConstraint(ball) {
        const L = ball.effectiveLength;
        const pos = ball.pos;

        const r = pos.length();

        if (r === 0) {
            // Degenerate case — ball at pivot, push downward
            pos.y = -L;
            return;
        }

        // Rescale position to effective length L (a fraction of the full string length)
        pos.multiplyScalar(L / r);

        // Remove radial velocity component (keep velocity tangent to sphere)
        const radialDir = pos.clone().normalize();
        const vRadial = radialDir.clone().multiplyScalar(ball.vel.dot(radialDir));
        ball.vel.sub(vRadial);
    }

    /**
     * Run physics for one render frame, splitting into fixed substeps
     * @param {Ball[]} balls
     * @param {number} deltaTime - Elapsed time since last frame (seconds)
     */
    simulate(balls, deltaTime) {
        // Reset energy accumulators for this frame
        this._resetEnergyAccumulators();

        // Clamp delta to prevent spiral-of-death
        const clampedDt = Math.min(deltaTime, this.dt * this.maxSubsteps);

        let remaining = clampedDt;
        while (remaining > 1e-8) {
            const substep = Math.min(this.dt, remaining);
            this.step(balls);
            remaining -= substep;
        }
    }

    /**
     * Get energy lost this frame (call after simulate())
     * @returns {{ collision: number, drag: number, friction: number }}
     */
    getFrameEnergyLosses() {
        return {
            collision: this.collisionSystem ? this.collisionSystem.frameEnergyLoss : this._collisionLoss,
            drag: this._dragWork,
            friction: this._frictionWork,
        };
    }
}
