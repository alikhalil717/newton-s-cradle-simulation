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
    constructor({ index, pivot, mass = 0.065, radius = 0.0125, length = 0.30 }) {
        this.index = index;
        this.pivot = pivot.clone();
        this.mass = mass;
        this.radius = radius;
        this.length = length;

        // Cartesian state (relative to pivot)
        this.pos = new THREE.Vector3(0, -length, 0); // hanging straight down
        this.vel = new THREE.Vector3(0, 0, 0);
        this.acc = new THREE.Vector3(0, 0, 0);

        // Accumulated forces this timestep (N)
        this.force = new THREE.Vector3(0, 0, 0);

        // Contact state
        this.inContact = new Set(); // indices of balls currently touching this one

        // Three.js visuals (created by createMesh / createString)
        this.mesh = null;
        this.stringLine = null;
    }

    /** World-space position = pivot + local pos */
    get worldPos() {
        return new THREE.Vector3().copy(this.pivot).add(this.pos);
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
        // Lowest point is at y = -length below pivot
        const lowestY = this.pivot.y - this.length;
        const currentY = this.pivot.y + this.pos.y;
        return this.mass * g * (currentY - lowestY);
    }

    /** Reset to hanging straight down with zero velocity */
    reset() {
        this.pos.set(0, -this.length, 0);
        this.vel.set(0, 0, 0);
        this.acc.set(0, 0, 0);
        this.force.set(0, 0, 0);
        this.inContact.clear();
    }

    /** Set initial angular state (θ, φ) with optional angular velocities */
    setAngularState(theta, phi, thetaDot = 0, phiDot = 0) {
        // Position from spherical coords
        this.pos.x = this.length * Math.sin(theta) * Math.cos(phi);
        this.pos.y = -this.length * Math.cos(theta);
        this.pos.z = this.length * Math.sin(theta) * Math.sin(phi);

        // Velocity from angular velocities (tangent basis)
        // θ̂ direction: d/dθ of position
        const eTheta = new THREE.Vector3(
            this.length * Math.cos(theta) * Math.cos(phi),
            this.length * Math.sin(theta),
            this.length * Math.cos(theta) * Math.sin(phi)
        );
        // φ̂ direction: d/dφ of position
        const ePhi = new THREE.Vector3(
            -this.length * Math.sin(theta) * Math.sin(phi),
            0,
            this.length * Math.sin(theta) * Math.cos(phi)
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
     * Create the string line from pivot to ball
     * @param {THREE.Scene} scene
     * @returns {THREE.Line}
     */
    createString(scene) {
        const points = [
            this.pivot.clone(),
            this.worldPos.clone(),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.6,
        });
        this.stringLine = new THREE.Line(geo, mat);
        scene.add(this.stringLine);
        return this.stringLine;
    }

    /**
     * Update mesh position and string geometry to match current physics state
     */
    updateVisuals() {
        if (this.mesh) {
            this.mesh.position.copy(this.worldPos);
        }
        if (this.stringLine) {
            const positions = this.stringLine.geometry.attributes.position;
            const wp = this.worldPos;
            positions.setXYZ(0, this.pivot.x, this.pivot.y, this.pivot.z);
            positions.setXYZ(1, wp.x, wp.y, wp.z);
            positions.needsUpdate = true;
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
        if (this.stringLine) {
            scene.remove(this.stringLine);
            this.stringLine.geometry.dispose();
            this.stringLine.material.dispose();
            this.stringLine = null;
        }
    }
}
