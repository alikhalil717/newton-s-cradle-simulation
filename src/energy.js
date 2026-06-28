/**
 * Energy bookkeeping (report §5)
 *
 * Tracks kinetic, potential, and cumulative dissipated energy over time
 * for a live "energy budget" display.
 *
 * Dissipation components (report §5.1):
 *   ΔE_collision = ½μ·v_rel²·(1-e²)       — tracked by CollisionSystem
 *   P_air = b|v|²                          — tracked by PhysicsEngine
 *   P_friction = μk·m·|v_tangential|²      — tracked by PhysicsEngine
 *
 * Note: the constraint projection (position-based-dynamics) introduces a
 * small amount of numerical energy drift (~5-10% over several seconds),
 * which is normal for real-time physics engines. The dissipation tracking
 * below only counts physical losses (collisions, drag, friction).
 */

export class EnergyTracker {
    constructor() {
        this.history = [];
        this.cumulativeCollisionLoss = 0;
        this.cumulativeAirDragWork = 0;
        this.cumulativeFrictionWork = 0;
        this.maxHistoryLength = 600; // ~10 seconds at 60fps
    }

    /**
     * Record energy state for current frame
     *
     * @param {number} kinetic - Total kinetic energy (J)
     * @param {number} potential - Total potential energy (J)
     * @param {number} collisionLoss - Energy lost to collisions this frame (J)
     * @param {number} airDragWork - Work done by air drag this frame (J)
     * @param {number} frictionWork - Work done by pivot friction this frame (J)
     */
    record(kinetic, potential, collisionLoss, airDragWork, frictionWork) {
        this.cumulativeCollisionLoss += Math.max(0, collisionLoss);
        this.cumulativeAirDragWork += Math.abs(airDragWork);
        this.cumulativeFrictionWork += Math.abs(frictionWork);

        const dissipated = this.cumulativeCollisionLoss + this.cumulativeAirDragWork + this.cumulativeFrictionWork;

        const entry = {
            time: this.history.length > 0
                ? this.history[this.history.length - 1].time + 1/60
                : 0,
            kinetic,
            potential,
            dissipated,
        };

        this.history.push(entry);

        if (this.history.length > this.maxHistoryLength) {
            this.history.shift();
        }
    }

    /** Total energy in the system (mechanical + dissipated) */
    get total() {
        if (this.history.length === 0) return 0;
        const last = this.history[this.history.length - 1];
        return last.kinetic + last.potential + last.dissipated;
    }

    /** Reset all tracking */
    reset() {
        this.history = [];
        this.cumulativeCollisionLoss = 0;
        this.cumulativeAirDragWork = 0;
        this.cumulativeFrictionWork = 0;
    }
}
