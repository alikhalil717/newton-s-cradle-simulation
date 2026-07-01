/**
 * Collision detection & resolution
 *
 * Uses impulse-based restitution model (report §1.4):
 * - Detect contact each substep via distance check
 * - Resolve with standard 3D restitution impulse along contact normal
 * - Conserves momentum and applies coefficient of restitution e
 *
 * Default method: instantaneous impulse (efficient, matches case studies)
 *
 * NOTE: A Hertzian contact mode (§4.2–4.3, using stiffness H_k from Table 1)
 * is not implemented here — the report uses instantaneous-impulse as its
 * primary model (§1.4) for all case studies in Ch. 7, and describes Hertz
 * contact as an optional higher-fidelity refinement. The instantaneous
 * model is sufficient for the report's validation scope.
 *
 * For unequal masses, the general restitution formulas (correction #6):
 *   v₁' = [(m₁ - e·m₂)v₁ + (1+e)m₂v₂] / (m₁+m₂)
 *   v₂' = [(1+e)m₁v₁ + (m₂ - e·m₁)v₂] / (m₁+m₂)
 */

import * as THREE from 'three';

export class CollisionSystem {
    constructor() {
        // Coefficient of restitution (report: 0.95–0.98)
        this.restitution = 0.97;

        // Per-frame energy loss accumulator
        this._frameEnergyLoss = 0;
    }

    /** Reset frame energy loss accumulator (call before each frame's collision passes) */
    resetFrameEnergyLoss() {
        this._frameEnergyLoss = 0;
    }

    /** Get accumulated energy loss from collisions this frame (J) */
    get frameEnergyLoss() {
        return this._frameEnergyLoss;
    }

    /**
     * Detect and resolve collisions between all ball pairs
     * @param {Ball[]} balls
     */
    resolve(balls) {
        const n = balls.length;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                this.resolvePair(balls[i], balls[j]);
            }
        }
    }

    /**
     * Detect and resolve collision between two balls
     * Only adjacent balls in a Newton's Cradle chain typically collide,
     * but this checks all pairs for generality.
     */
    resolvePair(a, b) {
        // World-space positions
        const posA = a.worldPos;
        const posB = b.worldPos;

        // Vector from A to B
        const delta = new THREE.Vector3().copy(posB).sub(posA);
        const dist = delta.length();

        // Contact threshold: center-to-center distance < sum of radii
        const minDist = a.radius + b.radius;
        const overlap = minDist - dist;

        if (overlap <= 0) return;

        // Contact normal (A → B)
        const normal = delta.clone().normalize();

        // Mark contact
        a.inContact.add(b.index);
        b.inContact.add(a.index);

        // --- Position correction: separate overlapping balls ---
        const correction = normal.clone().multiplyScalar(overlap * 0.5);
        a.pos.sub(correction);
        b.pos.add(correction);

        // Re-project constraints after position correction
        // (handled by the physics engine after collision step)

        // --- Resting contact check: only resolve if approaching ---
        const relVel = new THREE.Vector3().copy(a.vel).sub(b.vel);
        const relVelNormal = relVel.dot(normal);
        if (relVelNormal < 0) return;

        // --- Compute energy lost in this collision (report §5.1.1) ---
        // ΔE = ½μ·v_rel²·(1-e²)
        const e = this.restitution;
        const mu = (a.mass * b.mass) / (a.mass + b.mass); // reduced mass
        this._frameEnergyLoss += 0.5 * mu * relVelNormal * relVelNormal * (1 - e * e);

        // --- Impulse resolution ---
        const m1 = a.mass;
        const m2 = b.mass;

        // Compute impulse magnitude j such that:
        //   v_rel_after = -e · v_rel_before
        // j = -(1+e) · v_rel_normal / (1/m₁ + 1/m₂)
        const invMass1 = 1 / m1;
        const invMass2 = 1 / m2;
        const j = -(1 + e) * relVelNormal / (invMass1 + invMass2);

        const impulse = normal.clone().multiplyScalar(j);

        a.vel.addScaledVector(impulse, invMass1);
        b.vel.addScaledVector(impulse, -invMass2);
    }

    // Note: energyLost() is intentionally omitted — the core dissipation logic
    // is inlined in resolvePair() where it's actually used (this._frameEnergyLoss).
    // The old static helper duplicated that code and was never called externally.
}
