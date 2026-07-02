/**
 * Scenario presets (report §7)
 *
 * Each preset defines initial conditions and parameter overrides
 * for the 9 case studies described in the report.
 */

import * as THREE from 'three';
import { Ball } from './ball.js';

export class ScenarioManager {
    constructor() {
        this.scenarios = {
            'Case 1 — Single ball pull, N=5': this.case1.bind(this),
            'Case 2 — Two balls pulled, N=5': this.case2.bind(this),
            'Case 3 — N=7 chain': this.case3.bind(this),
            'Case 4 — One string longer': this.case4.bind(this),
            'Case 5 — Tilted pivots': this.case5.bind(this),
            'Case 6 — Crossed strings': this.case6.bind(this),
            'Case 7 — Unequal masses': this.case7.bind(this),
            'Case 8 — Gaps between balls': this.case8.bind(this),
            'Case 9 — Fully inelastic (e≈0)': this.case9.bind(this),
            'Custom': this.custom.bind(this),
        };

        this.currentName = 'Case 1 — Single ball pull, N=5';
    }

    get names() {
        return Object.keys(this.scenarios);
    }

    /** Keys exposed in the UI dropdown (excludes Case 4 and Case 7) */
    get selectableNames() {
        return [
            'Case 1 — Single ball pull, N=5',
            'Case 2 — Two balls pulled, N=5',
            'Case 3 — N=7 chain',
            'Case 5 — Tilted pivots',
            'Case 6 — Crossed strings',
            'Case 8 — Gaps between balls',
            'Case 9 — Fully inelastic (e≈0)',
            'Custom',
        ];
    }

    /**
     * Apply a scenario preset and return configuration
     * @param {string} name - Scenario name
     * @returns {Object} { balls: Ball[], params: Object }
     */
    apply(name, params = {}) {
        const fn = this.scenarios[name];
        if (!fn) throw new Error(`Unknown scenario: ${name}`);
        this.currentName = name;
        return fn(params);
    }

    /**
     * Helper: create a chain of N balls with given parameters.
     * Now supports per-ball arrays and stringAngle (two-string cradle).
     */
    createChain(N, ballParams = {}) {
        const R = ballParams.radius ?? ballParams.R ?? 0.0125;
        const L = ballParams.L ?? ballParams.length ?? 0.30;
        const mass = ballParams.mass ?? 0.5;
        const gap = ballParams.gap ?? 0;
        const stringAngle = ballParams.stringAngle ?? 0;
        const pivotY = ballParams.pivotY ?? 0.5;
        const balls = [];
        const spacing = 2 * (Array.isArray(R) ? Math.max(...R) : R) + gap;

        for (let i = 0; i < N; i++) {
            const pivot = new THREE.Vector3(
                (i - (N - 1) / 2) * spacing,
                pivotY,
                0
            );
            const ball = new Ball({
                index: i,
                pivot,
                mass: Array.isArray(mass) ? (mass[i] ?? mass[mass.length - 1]) : mass,
                radius: Array.isArray(R) ? (R[i] ?? R[R.length - 1]) : R,
                length: Array.isArray(L) ? (L[i] ?? L[L.length - 1]) : L,
                stringAngle,
                pivotTilt: ballParams.pivotTilt ?? 0,
            });
            balls.push(ball);
        }
        return balls;
    }

    // --- Case 1 — Single ball pull, N=5 (report §7, case 1) ---
    // θ₁(0) = 30°, rest at equilibrium, e = 0.97
    // Expect: ball 5 ejects at ~entry speed, balls 2–4 stay nearly still
    case1(params = {}) {
        const N = params.N || 5;
        const e = params.e !== undefined ? params.e : 0.97;
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);

        const balls = this.createChain(N, params);
        balls[0].setAngularState(theta0, Math.PI);

        return { balls, params: { restitution: e } };
    }

    // --- Case 2 — Two balls pulled, N=5 (report §7, case 2) ---
    // θ₁(0) = θ₂(0) = 30°
    // Expect: two balls eject from far side together
    case2(params = {}) {
        const N = params.N || 5;
        const e = params.e !== undefined ? params.e : 0.97;
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);

        const balls = this.createChain(N, params);
        balls[0].setAngularState(theta0, Math.PI);
        balls[1].setAngularState(theta0, Math.PI);

        return { balls, params: { restitution: e } };
    }

    // --- Case 3 — N=7 chain (report §7, case 3) ---
    // Same single-pull setup, larger chain
    // Initial N=7 is set in main.js's onScenarioChange — after that,
    // the GUI slider controls N freely.
    case3(params = {}) {
        const N = params.N || 7;
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);

        const balls = this.createChain(N, params);
        balls[0].setAngularState(theta0, Math.PI);

        // Do NOT return N:7 here — that would overwrite state.N on every param change.
        return { balls, params: { restitution: 0.97 } };
    }

    // --- Case 4 — One string longer/shorter (report §7, case 4) ---
    // Give ball 3 a different string length
    // Expect visible lateral/out-of-plane deviation
    case4(params = {}) {
        const N = params.N || 5;
        const deltaL = params.deltaL || 0.05;

        const baseL = params.length ?? params.L ?? 0.30;
        const Ls = Array(N).fill(baseL);
        Ls[Math.floor(N / 2)] += deltaL; // middle ball

        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);

        const balls = this.createChain(N, { ...params, L: Ls });
        balls[0].setAngularState(theta0, Math.PI);

        return { balls, params: { restitution: 0.97 } };
    }

    // --- Case 5 — Tilted pivots (report §7, case 5) ---
    // Tilt the middle ball's local gravity direction by angle α.
    // This produces a non-vertical equilibrium position and out-of-plane
    // collision velocities (genuine 3D motion).
    //
    // FIXED: The equilibrium position for a ball with pivotTilt > 0
    // must be along its tilted gravity direction, not straight down.
    // Previously the tilted ball was reset to (0, -L, 0) — straight down
    // in local coords — which is NOT the equilibrium when gravity is
    // tilted. This caused the ball to swing from an incorrect rest
    // position, pushing neighbors and creating the "tilted at equilibrium" bug.
    case5(params = {}) {
        const N = params.N || 5;
        const alpha = THREE.MathUtils.degToRad(params.alphaDeg || 10);

        const balls = this.createChain(N, params);
        const midIdx = Math.floor(N / 2);

        // Set tilt on the middle ball
        balls[midIdx].pivotTilt = alpha;

        // The equilibrium position for a tilted ball is along its
        // gravityDir = (sin(α), -cos(α), 0), at distance L from pivot
        const L = balls[midIdx].effectiveLength;
        const gDir = balls[midIdx].gravityDir;
        balls[midIdx].pos.set(
            gDir.x * L,
            gDir.y * L,
            gDir.z * L
        );

        // Pull the first ball as usual
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);
        balls[0].setAngularState(theta0, Math.PI);

        return { balls, params: { restitution: 0.97 } };
    }

    // --- Case 6 — Crossed/irregular strings (report §7, case 6) ---
    // Vary each ball's swing-plane orientation
    // Expect off-axis glancing collisions
    case6(params = {}) {
        const N = params.N || 5;

        const balls = this.createChain(N, params);
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 20);

        // Get radius for scaling the out-of-plane offset
        const R = Array.isArray(params.radius)
            ? (params.radius[0] ?? params.radius[params.radius.length - 1])
            : (params.radius ?? 0.0125);

        // Give alternating balls an out-of-plane pivot offset scaled to radius
        // (setAngularState with theta=0 gives no displacement regardless of phi)
        for (let i = 0; i < N; i++) {
            if (i === 0) {
                balls[i].setAngularState(theta0, Math.PI);
            } else if (i % 2 === 1) {
                balls[i].pivot.z += 0.3 * R; // ~30% of radius, visibly off-axis
            }
        }

        return { balls, params: { restitution: 0.95 } };
    }

    // --- Case 7 — Unequal masses (report §7, case 7) ---
    // Vary masses along the chain
    // Use general restitution formulas (correction #6)
    case7(params = {}) {
        const N = params.N || 5;
        const massPattern = params.massPattern || 'increasing';

        let masses;
        if (massPattern === 'increasing') {
            // Masses increase monotonically along chain
            masses = Array.from({ length: N }, (_, i) => 0.1 + i * (0.9 / Math.max(N - 1, 1)));
        } else {
            masses = Array(N).fill(0.065);
        }

        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);

        const balls = this.createChain(N, { ...params, mass: masses });
        balls[0].setAngularState(theta0, Math.PI);

        return { balls, params: { restitution: 0.97 } };
    }

    // --- Case 8 — Gaps between balls (report §7, case 8) ---
    // Introduce Δx between rest positions
    // Ball accelerates across gap before impact
    case8(params = {}) {
        const N = params.N || 5;
        const gap = params.gap !== undefined ? params.gap : 0.01;

        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);

        const balls = this.createChain(N, { ...params, gap });
        balls[0].setAngularState(theta0, Math.PI);

        return { balls, params: { restitution: 0.97 } };
    }

    // --- Case 9 — Fully inelastic (e≈0) (report §7, case 9) ---
    // Balls stick on contact
    // Verify: v_final = v₁/N, energy loss = (N-1)/N
    case9(params = {}) {
        const N = params.N || 5;
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);

        const balls = this.createChain(N, params);
        balls[0].setAngularState(theta0, Math.PI);

        return { balls, params: { restitution: 0.01 } };
    }

    // --- Custom ---
    custom(params = {}) {
        const N = params.N || 5;
        const balls = this.createChain(N, params);
        return { balls, params: {} };
    }
}
