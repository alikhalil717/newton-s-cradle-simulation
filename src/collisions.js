import * as THREE from 'three';

export class CollisionSystem {
    constructor() {
        this.restitution = 0.97;
        this._frameEnergyLoss = 0;
    }

    resetFrameEnergyLoss() {
        this._frameEnergyLoss = 0;
    }

    get frameEnergyLoss() {
        return this._frameEnergyLoss;
    }

    resolve(balls) {
        const n = balls.length;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                this.resolvePair(balls[i], balls[j]);
            }
        }
    }

    resolvePair(a, b) {
        const posA = a.worldPos;
        const posB = b.worldPos;

        const delta = new THREE.Vector3().copy(posB).sub(posA);
        const dist = delta.length();

        const minDist = a.radius + b.radius;
        const overlap = minDist - dist;

        if (overlap <= 0) return;

        const normal = delta.clone().normalize();

        a.inContact.add(b.index);
        b.inContact.add(a.index);

        const correction = normal.clone().multiplyScalar(overlap * 0.5);
        a.pos.sub(correction);
        b.pos.add(correction);

        const relVel = new THREE.Vector3().copy(a.vel).sub(b.vel);
        const relVelNormal = relVel.dot(normal);
        if (relVelNormal < 0) return;

        const e = this.restitution;
        const mu = (a.mass * b.mass) / (a.mass + b.mass);
        this._frameEnergyLoss += 0.5 * mu * relVelNormal * relVelNormal * (1 - e * e);

        const m1 = a.mass;
        const m2 = b.mass;

        const invMass1 = 1 / m1;
        const invMass2 = 1 / m2;
        const j = -(1 + e) * relVelNormal / (invMass1 + invMass2);

        const impulse = normal.clone().multiplyScalar(j);

        a.vel.addScaledVector(impulse, invMass1);
        b.vel.addScaledVector(impulse, -invMass2);
    }
}
