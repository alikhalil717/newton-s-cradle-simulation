/**
 * Ball class — spherical pendulum state + Three.js mesh
 *
 * Each ball hangs from a pivot point and its position is constrained
 * to a sphere of radius L (string length) around that pivot.
 *
 * Coordinates: position is relative to the pivot:
 *   x = L sinθ cosφ
 *   y = -L cosθ      (downward from pivot)
 *   z = L sinθ sinφ
 *
 * Constraint: |r|² = L²  (report §1.3, holonomic constraint)
 */

import * as THREE from 'three';

export class Ball {
    /**
     * @param {Object} params
     * @param {number} params.index - Ball index in the chain
     * @param {THREE.Vector3} params.pivot - Pivot point in world space
     * @param {number} params.mass - Ball mass (kg)
     * @param {number} params.radius - Ball radius (m)
     * @param {number} params.length - String length (m)
     * @param {number} params.stringAngle - Angle between the two strings (degrees)
     * @param {number} params.pivotTilt - Tilt of local gravity direction (radians)
     */
    constructor({ index, pivot, mass = 0.5, radius = 0.0125, length = 0.30, stringAngle = 0, pivotTilt = 0 }) {
        this.index = index;
        this.pivot = pivot.clone();
        this.mass = mass;
        this.radius = radius;
        this.length = length;
        this.stringAngle = stringAngle;
        this.pivotTilt = pivotTilt;

        // Two-string derived geometry
        this.effectiveLength = length;
        this.stringHalfSpread = 0;
        this.updateEffectiveLength();

        // Cartesian state (relative to pivot)
        this.pos = new THREE.Vector3(0, -this.effectiveLength, 0);
        this.vel = new THREE.Vector3(0, 0, 0);
        this.acc = new THREE.Vector3(0, 0, 0);
        this.force = new THREE.Vector3(0, 0, 0);
        this.inContact = new Set();

        // Three.js visuals
        this.mesh = null;
        this.stringLines = [null, null];  // multi-segment line strips (9 vertices each)
        this.stringPivots = [new THREE.Vector3(), new THREE.Vector3()];
    }

    /** Recompute effective length and half-spread from string length and angle */
    updateEffectiveLength() {
        const halfAngleRad = THREE.MathUtils.degToRad(this.stringAngle / 2);
        this.effectiveLength = this.length * Math.cos(halfAngleRad);
        this.stringHalfSpread = this.length * Math.sin(halfAngleRad);
    }

    /** Local "down" direction, tilted by pivotTilt around Z axis.
     *  When pivotTilt = 0, returns (0, -1, 0) — standard vertical gravity.
     *  Used by physics.js to apply gravity along the tilted direction. */
    get gravityDir() {
        return new THREE.Vector3(
            Math.sin(this.pivotTilt),
            -Math.cos(this.pivotTilt),
            0
        );
    }

    /** World-space position = pivot center + local pos */
    get worldPos() {
        return new THREE.Vector3().copy(this.pivot).add(this.pos);
    }

    /** Full string length (each of the two strings), considering spread */
    get actualStringLength() {
        return this.length;
    }

    /** Speed magnitude (m/s) */
    get speed() {
        return this.vel.length();
    }

    /** Kinetic energy (J) */
    get kineticEnergy() {
        return 0.5 * this.mass * this.speed * this.speed;
    }

    /** Potential energy relative to lowest point (J) */
    getPotentialEnergy(g) {
        // Lowest point is at y = -effectiveLength below pivot
        const lowestY = this.pivot.y - this.effectiveLength;
        const currentY = this.pivot.y + this.pos.y;
        return this.mass * g * (currentY - lowestY);
    }

    /**
     * Current string tension (≈ pivot normal force), report eq. T = mg·cos(θ) + mL·θ̇²
     * Computed in Cartesian form: radial component of gravity + centripetal term.
     * @param {number} g - Gravitational acceleration (m/s²)
     * @returns {number} Tension force magnitude (N)
     */
    getTension(g) {
        const L = this.effectiveLength;
        const radialDir = this.pos.clone().normalize();
        const gravityForce = this.gravityDir.clone().multiplyScalar(this.mass * g);
        const radialGravity = gravityForce.dot(radialDir); // ≈ m g cosθ
        const vRadial = radialDir.clone().multiplyScalar(this.vel.dot(radialDir));
        const vTangential = this.vel.clone().sub(vRadial);
        const centripetal = this.mass * vTangential.lengthSq() / L; // m L θ̇² in tangential-speed form
        return Math.max(0, radialGravity + centripetal);
    }

    /** Reset to hanging straight down with zero velocity */
    reset() {
        this.pos.set(0, -this.effectiveLength, 0);
        this.vel.set(0, 0, 0);
        this.acc.set(0, 0, 0);
        this.force.set(0, 0, 0);
        this.inContact.clear();
    }

    /** Set initial angular state (θ, φ) with optional angular velocities */
    setAngularState(theta, phi, thetaDot = 0, phiDot = 0) {
        const L = this.effectiveLength;
        // Position from spherical coords
        this.pos.x = L * Math.sin(theta) * Math.cos(phi);
        this.pos.y = -L * Math.cos(theta);
        this.pos.z = L * Math.sin(theta) * Math.sin(phi);

        // Velocity from angular velocities (tangent basis)
        // θ̂ direction: d/dθ of position
        const eTheta = new THREE.Vector3(
            L * Math.cos(theta) * Math.cos(phi),
            L * Math.sin(theta),
            L * Math.cos(theta) * Math.sin(phi)
        );
        // φ̂ direction: d/dφ of position
        const ePhi = new THREE.Vector3(
            -L * Math.sin(theta) * Math.sin(phi),
            0,
            L * Math.sin(theta) * Math.cos(phi)
        );

        this.vel.copy(eTheta.multiplyScalar(thetaDot).add(ePhi.multiplyScalar(phiDot)));
    }

    // ----- Three.js visual helpers -----

    /**
     * Create the sphere mesh and add it to the scene
     * @param {THREE.Scene} scene
     * @returns {THREE.Mesh}
     */
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

        // Position at world-space location
        this.mesh.position.copy(this.worldPos);
        scene.add(this.mesh);
        return this.mesh;
    }

    /**
     * Update string pivot positions based on current stringHalfSpread.
     * The pivots are at Z = ±stringHalfSpread from the ball's pivot center.
     */
    updateStringPivots() {
        const d = this.stringHalfSpread;
        const pm = this.pivot;
        this.stringPivots[0].set(pm.x, pm.y, pm.z - d);
        this.stringPivots[1].set(pm.x, pm.y, pm.z + d);
    }

    /**
     * Create two multi-segment string lines from pivot anchors to ball.
     * Each string has 8 segments → 9 vertices. Positions are updated
     * by stringPhysics.updateVisuals() each frame.
     * @param {THREE.Scene} scene
     */
    createString(scene) {
        this.updateStringPivots();

        for (let i = 0; i < 2; i++) {
            // Create a straight chain of 9 points from pivot to ball
            const pts = [];
            const dir = new THREE.Vector3().copy(this.worldPos).sub(this.stringPivots[i]);
            const len = dir.length();
            dir.normalize();
            for (let j = 0; j < 9; j++) {
                const t = j / 8;
                const p = new THREE.Vector3().copy(this.stringPivots[i]).addScaledVector(dir, t * len);
                pts.push(p);
            }
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const mat = new THREE.LineBasicMaterial({
                color: 0x888888,
                transparent: true,
                opacity: 0.6,
            });
            this.stringLines[i] = new THREE.Line(geo, mat);
            scene.add(this.stringLines[i]);
        }
    }

    /**
     * Update mesh position. String line positions are managed by
     * stringPhysics.updateVisuals() — this method only updates the ball mesh.
     */
    updateVisuals() {
        if (this.mesh) {
            this.mesh.position.copy(this.worldPos);
        }
    }

    /** Remove visuals from scene and dispose geometry/material */
    dispose(scene) {
        if (this.mesh) {
            scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }
        for (let i = 0; i < 2; i++) {
            if (this.stringLines[i]) {
                scene.remove(this.stringLines[i]);
                this.stringLines[i].geometry.dispose();
                this.stringLines[i].material.dispose();
                this.stringLines[i] = null;
            }
        }
    }
}
