export class PhysicsEngine {
    constructor() {
        this.g = 9.81;
        this.b = 0.003;
        this.muK = 0.02;
        this.dt = 1 / 600;
        this.maxSubsteps = 8;
        this.collisionSystem = null;
        this._dragWork = 0;
        this._frictionWork = 0;
        this._collisionLoss = 0;
    }

    _resetEnergyAccumulators() {
        this._dragWork = 0;
        this._frictionWork = 0;
        this._collisionLoss = 0;
        if (this.collisionSystem) {
            this.collisionSystem.resetFrameEnergyLoss();
        }
    }

    step(balls) {
        for (const ball of balls) {
            this.computeForces(ball);
            const v2 = ball.vel.lengthSq();
            this._dragWork += this.b * v2 * this.dt;
            const N_pivot = ball._lastNpivot || 0;
            const tangentialSpeed = ball._lastTangentialSpeed || 0;
            if (N_pivot > 0 && tangentialSpeed > 0) {
                this._frictionWork += this.muK * N_pivot * tangentialSpeed * this.dt;
            }
        }

        for (const ball of balls) {
            ball.acc.copy(ball.force).divideScalar(ball.mass);
            ball.vel.addScaledVector(ball.acc, this.dt);
            ball.pos.addScaledVector(ball.vel, this.dt);
        }

        if (this.collisionSystem) {
            this.collisionSystem.resolve(balls);
            this._collisionLoss += this.collisionSystem.frameEnergyLoss;
            this.collisionSystem.resetFrameEnergyLoss();
        }

        for (const ball of balls) {
            this.projectConstraint(ball);
        }

        for (const ball of balls) {
            ball.force.set(0, 0, 0);
            ball.inContact.clear();
        }
    }

    computeForces(ball) {
        const gDir = ball.gravityDir;
        ball.force.addScaledVector(gDir, ball.mass * this.g);

        ball.force.x -= this.b * ball.vel.x;
        ball.force.y -= this.b * ball.vel.y;
        ball.force.z -= this.b * ball.vel.z;

        const radialDir = ball.pos.clone().normalize();
        const vRadial = radialDir.clone().multiplyScalar(ball.vel.dot(radialDir));
        const vTangential = ball.vel.clone().sub(vRadial);
        const tangentialSpeed = vTangential.length();
        const EPS = 1e-5;
        if (tangentialSpeed > EPS) {
            const N_pivot = ball.getTension(this.g);
            ball._lastNpivot = N_pivot;
            ball._lastTangentialSpeed = tangentialSpeed;
            const frictionDir = vTangential.clone().divideScalar(tangentialSpeed);
            ball.force.addScaledVector(frictionDir, -this.muK * N_pivot);
        } else {
            ball._lastNpivot = 0;
            ball._lastTangentialSpeed = 0;
        }
    }

    projectConstraint(ball) {
        const L = ball.effectiveLength;
        const pos = ball.pos;
        const r = pos.length();

        if (r < 1e-10) {
            pos.set(0, -L, 0);
            return;
        }

        if (isNaN(r) || !isFinite(r)) {
            pos.set(0, -L, 0);
            ball.vel.set(0, 0, 0);
            return;
        }

        const scale = Math.min(10, Math.max(0.1, L / r));
        pos.multiplyScalar(scale);

        const radialDir = pos.clone().normalize();
        const vRadial = radialDir.clone().multiplyScalar(ball.vel.dot(radialDir));
        ball.vel.sub(vRadial);
    }

    setInitialEnergy(initialTotal) {
        this._initialEnergy = initialTotal;
        this._cumulativeDissipated = 0;
    }

    simulate(balls, deltaTime) {
        this._resetEnergyAccumulators();

        const clampedDt = Math.min(deltaTime, this.dt * this.maxSubsteps);

        let remaining = clampedDt;
        while (remaining > 1e-8) {
            const substep = Math.min(this.dt, remaining);
            this.step(balls);
            remaining -= substep;
        }

        let ke = 0, pe = 0;
        for (const ball of balls) {
            ke += ball.kineticEnergy;
            pe += ball.getPotentialEnergy(this.g);
        }
        const mechNow = ke + pe;

        if (this._initialEnergy !== undefined) {
            if (mechNow > this._initialEnergy + 1e-9) {
                const excess = mechNow - this._initialEnergy;
                if (ke > 1e-12) {
                    const scale = Math.sqrt(Math.max(0, (ke - excess) / ke));
                    for (const ball of balls) {
                        ball.vel.multiplyScalar(scale);
                    }
                    this._totalLoss = excess;
                } else {
                    this._totalLoss = 0;
                }
                ke = 0; pe = 0;
                for (const ball of balls) {
                    ke += ball.kineticEnergy;
                    pe += ball.getPotentialEnergy(this.g);
                }
                this._mechAfter = ke + pe;
            } else {
                this._mechAfter = mechNow;
                const mechAfter = mechNow + (this._cumulativeDissipated || 0);
                this._totalLoss = Math.max(0, this._initialEnergy - mechAfter);
            }
        } else {
            this._mechAfter = mechNow;
            this._totalLoss = 0;
        }

        this._cumulativeDissipated = (this._cumulativeDissipated || 0) + (this._totalLoss || 0);
    }

    getFrameEnergyLosses() {
        return {
            collision: this._collisionLoss || 0,
            drag: this._dragWork || 0,
            friction: this._frictionWork || 0,
        };
    }

    getMechanicalEnergy(balls) {
        let ke = 0, pe = 0;
        for (const ball of balls) {
            ke += ball.kineticEnergy;
            pe += ball.getPotentialEnergy(this.g);
        }
        return { ke, pe, total: ke + pe };
    }
}
