import * as THREE from 'three';
import { Ball } from './ball.js';

export class ScenarioManager {
    constructor() {
        this.scenarios = {
            'Case 1 — Single ball pull, N=5': this.case1.bind(this),
            'Case 2 — Two balls pulled, N=5': this.case2.bind(this),
            'Case 3 — N=7 chain': this.case3.bind(this),
            'Case 4 — One string longer': this.case4.bind(this),
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

    get selectableNames() {
        return [
            'Case 1 — Single ball pull, N=5',
            'Case 2 — Two balls pulled, N=5',
            'Case 3 — N=7 chain',
            'Case 6 — Crossed strings',
            'Case 8 — Gaps between balls',
            'Case 9 — Fully inelastic (e≈0)',
            'Custom',
        ];
    }

    apply(name, params = {}) {
        const fn = this.scenarios[name];
        if (!fn) throw new Error(`Unknown scenario: ${name}`);
        this.currentName = name;
        return fn(params);
    }

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

    case1(params = {}) {
        const N = params.N || 5;
        const e = params.e !== undefined ? params.e : 0.97;
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);

        const balls = this.createChain(N, params);
        balls[0].setAngularState(theta0, Math.PI);

        return { balls, params: { restitution: e } };
    }

    case2(params = {}) {
        const N = params.N || 5;
        const e = params.e !== undefined ? params.e : 0.97;
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);

        const balls = this.createChain(N, params);
        balls[0].setAngularState(theta0, Math.PI);
        balls[1].setAngularState(theta0, Math.PI);

        return { balls, params: { restitution: e } };
    }

    case3(params = {}) {
        const N = params.N || 7;
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);

        const balls = this.createChain(N, params);
        balls[0].setAngularState(theta0, Math.PI);


        return { balls, params: { restitution: 0.97 } };
    }

    case4(params = {}) {
        const N = params.N || 5;
        const deltaL = params.deltaL || 0.05;
        const baseL = params.length ?? params.L ?? 0.30;
        const Ls = Array(N).fill(baseL);
        Ls[Math.floor(N / 2)] += deltaL;
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);
        const balls = this.createChain(N, { ...params, L: Ls });
        balls[0].setAngularState(theta0, Math.PI);
        return { balls, params: { restitution: 0.97 } };
    }

    case6(params = {}) {
        const N = params.N || 5;
        const balls = this.createChain(N, params);
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 20);
        const R = Array.isArray(params.radius)
            ? (params.radius[0] ?? params.radius[params.radius.length - 1])
            : (params.radius ?? 0.0125);
        for (let i = 0; i < N; i++) {
            if (i === 0) {
                balls[i].setAngularState(theta0, Math.PI);
            } else if (i % 2 === 1) {
                balls[i].pivot.z += 0.3 * R;
            }
        }
        return { balls, params: { restitution: 0.95 } };
    }

    case7(params = {}) {
        const N = params.N || 5;
        const massPattern = params.massPattern || 'increasing';
        let masses;
        if (massPattern === 'increasing') {
            masses = Array.from({ length: N }, (_, i) => 0.1 + i * (0.9 / Math.max(N - 1, 1)));
        } else {
            masses = Array(N).fill(0.065);
        }
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);
        const balls = this.createChain(N, { ...params, mass: masses });
        balls[0].setAngularState(theta0, Math.PI);
        return { balls, params: { restitution: 0.97 } };
    }

    case8(params = {}) {
        const N = params.N || 5;
        const gap = params.gap !== undefined ? params.gap : 0.01;
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);
        const balls = this.createChain(N, { ...params, gap });
        balls[0].setAngularState(theta0, Math.PI);
        return { balls, params: { restitution: 0.97 } };
    }

    case9(params = {}) {
        const N = params.N || 5;
        const theta0 = THREE.MathUtils.degToRad(params.thetaDeg || 30);
        const balls = this.createChain(N, params);
        balls[0].setAngularState(theta0, Math.PI);
        return { balls, params: { restitution: 0.01 } };
    }

    custom(params = {}) {
        const N = params.N || 5;
        const balls = this.createChain(N, params);
        return { balls, params: {} };
    }
}
