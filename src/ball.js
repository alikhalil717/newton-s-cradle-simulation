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
     */
    constructor({ index, pivot, mass = 0.5, radius = 0.0125, length = 0.30, stringAngle = 0, pivotTilt = 0 }) {
        this.index = index;
        this.pivot = pivot.clone();
        this.mass = mass;
        this.radius = radius;
        this.length = length;           // physical string length (each of the two strings)
        this.stringAngle = stringAngle; // angle between the two strings (degrees)
        this.pivotTilt = pivotTilt;     // radians — tilt of local gravity direction (Case 5)

        // Two-string derived geometry
        this.effectiveLength = length;  // effective pendulum length L_eff = L * cos(α/2)
        this.stringHalfSpread = 0;      // half the top separation d = L * sin(α/2)
        this.updateEffectiveLength();

        // Cartesian state (relative to pivot — midpoint of the two string anchors)
        this.pos = new THREE.Vector3(0, -this.effectiveLength, 0);
        this.vel = new THREE.Vector3(0, 0, 0);
        this.acc = new THREE.Vector3(0, 0, 0);

        // Accumulated forces this timestep (N)
        this.force = new THREE.Vector3(0, 0, 0);

        // Contact state
        this.inContact = new Set();

        // Three.js visuals (created by createMesh / createString)
        this.mesh = null;
        this.strings = [null, null];               // two Line objects for the two strings
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
     * Create two string lines from the two pivot points to the ball.
     * When stringAngle = 0 they overlap (single-string behavior).
     * @param {THREE.Scene} scene
     */
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

    /**
     * Update mesh position and both string geometries to match current physics state
     */
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

    /** Remove visuals from scene and dispose geometry/material */
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
