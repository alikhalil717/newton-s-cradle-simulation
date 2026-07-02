/**
 * String Physics module — visual + detection only (no force hacking)
 *
 * The string collision/tangling logic caused random explosive movements
 * because it modified ball.vel and ball.pos outside the main physics
 * substep loop, bypassing constraint projection and energy conservation.
 *
 * This rewrite is a clean, safe version:
 * - Tangle detection via angle check (self-tangle only)
 * - Visual feedback: string color shifts toward red when tangled
 * - No position/velocity modification — physics stays in physics.js
 * - Reset button for manual untangling
 *
 * String types affect visual appearance only:
 *   'regular' — gray, semi-transparent
 *   'steel'   — darker, more opaque
 *   'elastic' — greenish, more transparent
 */

import * as THREE from 'three';

const TANGLE_ANGLE_THRESHOLD = Math.PI * 0.85; // ~153°

export class StringPhysics {
    constructor() {
        this.type = 'regular';

        // Per-ball tangle state
        this.wasTangled = {};      // { ballIndex: boolean }
        this.tangledTimer = {};    // { ballIndex: count } — how long tangled
    }

    // ============================================================
    //  Public API
    // ============================================================

    /**
     * Detect tangling (read-only). Returns true if any ball is tangled.
     * @param {Ball[]} balls
     * @returns {boolean}
     */
    detectTangled(balls) {
        let anyTangled = false;

        for (let i = 0; i < balls.length; i++) {
            const ball = balls[i];

            // Only check self-tangle (two strings of same ball crossing)
            const isTangled = this._checkSelfTangle(ball);

            if (isTangled) {
                this.tangledTimer[i] = (this.tangledTimer[i] || 0) + 1;
                this.wasTangled[i] = true;
                anyTangled = true;
            } else {
                this.tangledTimer[i] = Math.max(0, (this.tangledTimer[i] || 0) - 1);
                this.wasTangled[i] = false;
            }
        }

        return anyTangled;
    }

    /**
     * Update string visual appearance based on tangling state.
     * @param {Ball[]} balls
     */
    updateStringVisuals(balls) {
        for (const ball of balls) {
            const index = ball.index;
            const severity = Math.min(1, (this.tangledTimer[index] || 0) / 10);
            const isTangled = this.wasTangled[index] || false;

            let baseColor, baseOpacity;
            switch (this.type) {
                case 'steel':
                    baseColor = new THREE.Color(0x444466);
                    baseOpacity = 0.8;
                    break;
                case 'elastic':
                    baseColor = new THREE.Color(0x66aa66);
                    baseOpacity = 0.5;
                    break;
                case 'regular':
                default:
                    baseColor = new THREE.Color(0x888888);
                    baseOpacity = 0.6;
                    break;
            }

            for (const str of ball.strings) {
                if (!str) continue;
                const mat = str.material;

                if (isTangled || severity > 0) {
                    const warnColor = new THREE.Color(0xff4444);
                    baseColor.clone().lerp(warnColor, severity);
                    mat.color.copy(baseColor.lerp(warnColor, severity));
                    mat.opacity = baseOpacity + severity * 0.3;
                } else {
                    mat.color.setHex(baseColor.getHex());
                    mat.opacity = baseOpacity;
                }
            }
        }
    }

    /** Stub — no force application anymore */
    resolveTangled(_balls) {
        // Physics-only tangling resolution was removed because it caused
        // random explosive motion. Use the Reset button to untangle.
    }

    // ============================================================
    //  Detection helpers (read-only)
    // ============================================================

    /**
     * Check if the ball's two strings cross each other (self-tangle).
     * This is the only tangle mode that makes physical sense for a
     * Newton's Cradle with two-string V-shaped suspensions.
     */
    _checkSelfTangle(ball) {
        // Only meaningful when there's a non-zero string spread
        if (ball.stringHalfSpread < 0.002) return false;

        const d = ball.stringHalfSpread;
        const pm = ball.pivot;
        const wp = ball.worldPos;

        const p0 = new THREE.Vector3(pm.x, pm.y, pm.z - d);
        const p1 = new THREE.Vector3(pm.x, pm.y, pm.z + d);

        // Vectors from each pivot anchor to the ball
        const v0 = new THREE.Vector3().copy(wp).sub(p0).normalize();
        const v1 = new THREE.Vector3().copy(wp).sub(p1).normalize();

        // Angle between the two strings. At rest they form a V.
        // If the ball swings far enough, the strings cross → angle
        // between v0 and v1 approaches π (180°).
        const angle = v0.angleTo(v1);
        return angle > TANGLE_ANGLE_THRESHOLD;
    }
}
