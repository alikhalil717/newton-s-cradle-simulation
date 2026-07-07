import * as THREE from 'three';

export class Ball {
    constructor({ index, pivot, mass = 0.5, radius = 0.0125, length = 0.30, stringAngle = 0, pivotTilt = 0 }) {
        this.index = index;
        this.pivot = pivot.clone();
        this.mass = mass;
        this.radius = radius;
        this.length = length;
        this.stringAngle = stringAngle;
        this.pivotTilt = pivotTilt;

        this.effectiveLength = length;
        this.stringHalfSpread = 0;
        this.updateEffectiveLength();

        this.pos = new THREE.Vector3(0, -this.effectiveLength, 0);
        this.vel = new THREE.Vector3(0, 0, 0);
        this.acc = new THREE.Vector3(0, 0, 0);
        this.force = new THREE.Vector3(0, 0, 0);
        this.inContact = new Set();

        this.mesh = null;
        this.strings = [null, null];
        this.stringPivots = [new THREE.Vector3(), new THREE.Vector3()];
    }

    updateEffectiveLength() {
        const halfAngleRad = THREE.MathUtils.degToRad(this.stringAngle / 2);
        this.effectiveLength = this.length * Math.cos(halfAngleRad);
        this.stringHalfSpread = this.length * Math.sin(halfAngleRad);
    }

    get gravityDir() {
        return new THREE.Vector3(
            Math.sin(this.pivotTilt),
            -Math.cos(this.pivotTilt),
            0
        );
    }

    get worldPos() {
        return new THREE.Vector3().copy(this.pivot).add(this.pos);
    }

    get actualStringLength() {
        return this.length;
    }

    get speed() {
        return this.vel.length();
    }

    get kineticEnergy() {
        return 0.5 * this.mass * this.speed * this.speed;
    }

    getPotentialEnergy(g) {
        const lowestY = this.pivot.y - this.effectiveLength;
        const currentY = this.pivot.y + this.pos.y;
        return this.mass * g * (currentY - lowestY);
    }

    getTension(g) {
        const L = this.effectiveLength;
        const radialDir = this.pos.clone().normalize();
        const gravityForce = this.gravityDir.clone().multiplyScalar(this.mass * g);
        const radialGravity = gravityForce.dot(radialDir);
        const vRadial = radialDir.clone().multiplyScalar(this.vel.dot(radialDir));
        const vTangential = this.vel.clone().sub(vRadial);
        const centripetal = this.mass * vTangential.lengthSq() / L;
        return Math.max(0, radialGravity + centripetal);
    }

    reset() {
        this.pos.set(0, -this.effectiveLength, 0);
        this.vel.set(0, 0, 0);
        this.acc.set(0, 0, 0);
        this.force.set(0, 0, 0);
        this.inContact.clear();
    }

    setAngularState(theta, phi, thetaDot = 0, phiDot = 0) {
        const L = this.effectiveLength;
        this.pos.x = L * Math.sin(theta) * Math.cos(phi);
        this.pos.y = -L * Math.cos(theta);
        this.pos.z = L * Math.sin(theta) * Math.sin(phi);

        const eTheta = new THREE.Vector3(
            L * Math.cos(theta) * Math.cos(phi),
            L * Math.sin(theta),
            L * Math.cos(theta) * Math.sin(phi)
        );
        const ePhi = new THREE.Vector3(
            -L * Math.sin(theta) * Math.sin(phi),
            0,
            L * Math.sin(theta) * Math.cos(phi)
        );

        this.vel.copy(eTheta.multiplyScalar(thetaDot).add(ePhi.multiplyScalar(phiDot)));
    }

    createMesh(scene) {
        const geo = new THREE.SphereGeometry(this.radius, 32, 32);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 0.8,
            roughness: 0.2,
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.position.copy(this.worldPos);
        scene.add(this.mesh);
        return this.mesh;
    }

    updateStringPivots() {
        const d = this.stringHalfSpread;
        const pm = this.pivot;
        this.stringPivots[0].set(pm.x, pm.y, pm.z - d);
        this.stringPivots[1].set(pm.x, pm.y, pm.z + d);
    }

    createString(scene) {
        this.updateStringPivots();

        const wp = this.worldPos;
        const mat = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.6,
        });

        for (let i = 0; i < 2; i++) {
            const pts = [this.stringPivots[i].clone(), wp.clone()];
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            this.strings[i] = new THREE.Line(geo, mat.clone());
            scene.add(this.strings[i]);
        }
    }

    updateVisuals() {
        if (this.mesh) {
            this.mesh.position.copy(this.worldPos);
        }
        const wp = this.worldPos;
        for (let i = 0; i < 2; i++) {
            if (this.strings[i]) {
                const pos = this.strings[i].geometry.attributes.position;
                pos.setXYZ(0, this.stringPivots[i].x, this.stringPivots[i].y, this.stringPivots[i].z);
                pos.setXYZ(1, wp.x, wp.y, wp.z);
                pos.needsUpdate = true;
            }
        }
    }

    dispose(scene) {
        if (this.mesh) {
            scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }
        for (let i = 0; i < 2; i++) {
            if (this.strings[i]) {
                scene.remove(this.strings[i]);
                this.strings[i].geometry.dispose();
                this.strings[i].material.dispose();
                this.strings[i] = null;
            }
        }
    }
}
