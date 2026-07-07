/**
 * String Physics — Verlet-integrated multi-segment rope simulation
 *
 * Each string is a chain of particles with distance constraints (PBD).
 * Handles ball↔string collision, string↔string collision, wrapping,
 * self-twisting, and tangling. All string physics runs INSIDE the
 * physics.js substep loop.
 *
 * String type (regular/steel/elastic) controls constraint iterations,
 * stretch, bending, tangle tendency, wrap friction, twist resistance.
 *
 * Phases implemented:
 *   Phase 1 — StringParticle, PhysicalString, chain initialization, Verlet
 *   Phase 2 — Per-type config, bending constraints, pendulum constraint mod
 *   Phase 3 — Ball↔string collision (segment-sphere) + wrapping
 */

import * as THREE from 'three';

// ============================================================
// Per-type configuration (Phase 2)
// ============================================================
const STRING_TYPE_CONFIG = {
    regular: {
        constraintIterations: 8, bendingIterations: 4,
        stretchable: false, maxStretch: 0, bendingResistance: 0.3,
        particleMass: 0.001, twistResistance: 0.3,
        tangleThreshold: 0.5, wrapFriction: 0.5,
        collisionRestitution: 0.3, collisionFriction: 0.3,
    },
    steel: {
        constraintIterations: 16, bendingIterations: 12,
        stretchable: false, maxStretch: 0, bendingResistance: 0.8,
        particleMass: 0.0025, twistResistance: 0.8,
        tangleThreshold: 0.8, wrapFriction: 0.15,
        collisionRestitution: 0.5, collisionFriction: 0.15,
    },
    elastic: {
        constraintIterations: 4, bendingIterations: 0,
        stretchable: true, maxStretch: 0.20, bendingResistance: 0,
        particleMass: 0.0005, twistResistance: 0.15,
        tangleThreshold: 0.3, wrapFriction: 0.85,
        collisionRestitution: 0.15, collisionFriction: 0.7,
    },
};

const STRING_THICKNESS = 0.001;
const TANGLE_ANGLE_THRESHOLD = Math.PI * 0.85;
const TWIST_ANGLE_THRESHOLD = THREE.MathUtils.degToRad(30);
const WRAP_VELOCITY_DAMP = 0.8;

// ============================================================
// StringParticle — point mass (Phase 1.1)
// ============================================================
class StringParticle {
    constructor(pos, mass, isAnchor = false) {
        this.pos = pos.clone();
        this.prevPos = pos.clone();
        this.mass = mass;
        this.invMass = mass > 0 ? 1 / mass : 0;
        this.isAnchor = isAnchor;
        this.force = new THREE.Vector3();
    }
    get velocity() { return new THREE.Vector3().copy(this.pos).sub(this.prevPos); }
    setVelocity(v) { this.prevPos.copy(this.pos).sub(v); }
}

// ============================================================
// PhysicalString — particle chain (Phase 1.2)
// ============================================================
class PhysicalString {
    constructor(anchorPos, ball, sideIndex, totalLength, numSegments = 8, type = 'regular') {
        this.ball = ball;
        this.sideIndex = sideIndex;
        this.type = type;
        this.config = STRING_TYPE_CONFIG[type] || STRING_TYPE_CONFIG.regular;
        this.segmentLength = totalLength / numSegments;
        this.numParticles = numSegments + 1;
        this.anchorPos = anchorPos.clone();
        this.totalLength = totalLength;
        this.tangleScore = 0;
        this.twistAngleWithNeighbor = 0;
        this.isTwisted = false;
        this.particles = [];
        this._initChain(ball);
    }
    _initChain(ball) {
        const dir = new THREE.Vector3().copy(ball.worldPos).sub(this.anchorPos);
        const totalDist = dir.length();
        dir.normalize();
        for (let i = 0; i < this.numParticles; i++) {
            const t = i / (this.numParticles - 1);
            const pos = new THREE.Vector3().copy(this.anchorPos).addScaledVector(dir, t * totalDist);
            this.particles.push(new StringParticle(pos, i === 0 ? 0 : this.config.particleMass, i === 0));
        }
    }
    get endParticle() { return this.particles[this.particles.length - 1]; }
    get anchorParticle() { return this.particles[0]; }
    get numSegments() { return this.particles.length - 1; }
    get midpoint() {
        const hi = Math.floor(this.particles.length / 2);
        const f = this.particles.length / 2 - hi;
        const m = new THREE.Vector3();
        return f > 0.01 ? m.lerpVectors(this.particles[hi - 1].pos, this.particles[hi].pos, f) : m.copy(this.particles[hi].pos);
    }
    updateAnchorPosition(p) { this.anchorPos.copy(p); this.particles[0].pos.copy(p); this.particles[0].prevPos.copy(p); }
    attachToBall(ball) { this.endParticle.pos.copy(ball.worldPos); }
    getSegment(i) {
        if (i < 0 || i >= this.particles.length - 1) return null;
        return { p0: this.particles[i].pos, p1: this.particles[i + 1].pos };
    }
}

// ============================================================
// StringPhysics — all-string manager (Phases 1.3 + 2 + 3)
// ============================================================
export class StringPhysics {
    constructor() {
        this.type = 'regular';
        this.config = STRING_TYPE_CONFIG.regular;
        this.strings = [];          // strings[ballIdx][side] = PhysicalString
        this.wasTangled = {};
        this.tangledTimer = {};
    }
    _updateConfig() { this.config = STRING_TYPE_CONFIG[this.type] || STRING_TYPE_CONFIG.regular; }

    // ==================== INIT ====================

    initialize(balls) {
        this._updateConfig();
        this.strings = [];
        this.wasTangled = {};
        this.tangledTimer = {};
        for (let i = 0; i < balls.length; i++) {
            const b = balls[i];
            const d = b.stringHalfSpread;
            const p = b.pivot;
            this.strings.push([
                new PhysicalString(new THREE.Vector3(p.x, p.y, p.z - d), b, 0, b.length, 8, this.type),
                new PhysicalString(new THREE.Vector3(p.x, p.y, p.z + d), b, 1, b.length, 8, this.type),
            ]);
            this.wasTangled[i] = false;
            this.tangledTimer[i] = 0;
        }
        this._attachAllToBalls(balls);
    }
    _attachAllToBalls(balls) {
        for (let i = 0; i < this.strings.length && i < balls.length; i++)
            for (let s = 0; s < 2; s++) this.strings[i][s].attachToBall(balls[i]);
    }

    // ==================== VERLET SIMULATE ====================

    simulate(dt, g) {
        this._updateConfig();
        const dt2 = dt * dt;
        for (const pair of this.strings)
            for (const str of pair)
                for (const p of str.particles) {
                    if (p.invMass === 0) continue;
                    const vel = p.velocity;
                    p.prevPos.copy(p.pos);
                    p.pos.add(vel).add(new THREE.Vector3(0, -g * dt2, 0));
                }
    }

    // ==================== DISTANCE CONSTRAINTS ====================

    enforceConstraints(iterations) {
        const cfg = this.config;
        for (const pair of this.strings)
            for (const str of pair) {
                const segLen = str.segmentLength;
                const maxS = cfg.stretchable ? cfg.maxStretch : 0;
                const minL = segLen * (1 - maxS), maxL = segLen * (1 + maxS);
                for (let iter = 0; iter < iterations; iter++)
                    for (let i = 0; i < str.particles.length - 1; i++) {
                        const p0 = str.particles[i], p1 = str.particles[i + 1];
                        const d = new THREE.Vector3().copy(p1.pos).sub(p0.pos);
                        const dist = d.length();
                        if (dist < 1e-10) continue;
                        const target = cfg.stretchable ? THREE.MathUtils.clamp(dist, minL, maxL) : segLen;
                        const corr = (dist - target) / dist;
                        const tim = p0.invMass + p1.invMass;
                        if (tim < 1e-10) continue;
                        const dir = d.normalize();
                        p0.pos.addScaledVector(dir, corr * p0.invMass / tim * dist);
                        p1.pos.addScaledVector(dir, -corr * p1.invMass / tim * dist);
                    }
            }
    }

    // ==================== BENDING CONSTRAINTS ====================

    enforceBendingConstraints() {
        const cfg = this.config;
        if (cfg.bendingResistance <= 0) return;
        for (const pair of this.strings)
            for (const str of pair) {
                const n = str.particles.length;
                if (n < 3) continue;
                for (let iter = 0; iter < cfg.bendingIterations; iter++)
                    for (let i = 1; i < n - 1; i++) {
                        const pp = str.particles[i - 1], pc = str.particles[i], pn = str.particles[i + 1];
                        const v1 = new THREE.Vector3().copy(pc.pos).sub(pp.pos);
                        const v2 = new THREE.Vector3().copy(pn.pos).sub(pc.pos);
                        const l1 = v1.length(), l2 = v2.length();
                        if (l1 < 1e-10 || l2 < 1e-10) continue;
                        const angle = Math.acos(Math.max(-1, Math.min(1, v1.normalize().dot(v2.normalize()))));
                        const diff = angle - Math.PI;
                        if (Math.abs(diff) < 0.001) continue;
                        const ax = new THREE.Vector3().crossVectors(v1, v2);
                        if (ax.length() < 1e-10) continue;
                        ax.normalize();
                        const pd = new THREE.Vector3().crossVectors(v1, ax).normalize();
                        const corr = pd.multiplyScalar(-diff * cfg.bendingResistance * 0.5 * l1 * 0.5);
                        if (pc.invMass > 0) pc.pos.add(corr);
                        if (pp.invMass > 0) pp.pos.sub(corr.clone().multiplyScalar(0.5));
                        if (pn.invMass > 0) pn.pos.sub(corr.clone().multiplyScalar(0.5));
                    }
            }
    }

    // ==================== BALL↔STRING COLLISION ====================

    detectBallCollisions(balls) {
        const cfg = this.config, rest = cfg.collisionRestitution, fric = cfg.collisionFriction;
        for (let bi = 0; bi < balls.length; bi++) {
            const ball = balls[bi], bp = ball.worldPos, R = ball.radius;
            for (let si = 0; si < this.strings.length; si++) {
                if (si === bi) continue;
                for (let s = 0; s < 2; s++) this._resolveBallString(ball, bp, R, rest, fric, this.strings[si][s]);
            }
        }
    }

    _resolveBallString(ball, bp, R, rest, fric, str) {
        if (!str) return;
        for (let si = 0; si < str.numSegments; si++) {
            const seg = str.getSegment(si);
            if (!seg) continue;
            const cp = this._closestPtOnSeg(bp, seg.p0, seg.p1);
            const delta = new THREE.Vector3().copy(bp).sub(cp);
            const dist = delta.length();
            if (dist >= R) continue;
            const nml = delta.normalize(), pen = R - dist;
            const tim = str.particles[si].invMass + str.particles[si + 1].invMass + (1 / ball.mass);
            if (tim < 1e-10) continue;
            const corr = pen / tim;
            str.particles[si].pos.addScaledVector(nml, corr * str.particles[si].invMass);
            str.particles[si + 1].pos.addScaledVector(nml, corr * str.particles[si + 1].invMass);
            ball.pos.addScaledVector(nml, -corr / ball.mass);

            const v0 = str.particles[si].velocity, v1 = str.particles[si + 1].velocity;
            const vAvg = new THREE.Vector3().copy(v0).add(v1).multiplyScalar(0.5);
            const rv = new THREE.Vector3().copy(vAvg).sub(ball.vel);
            const rvn = rv.dot(nml);
            if (rvn > 0) {
                const j = -(1 + rest) * rvn / tim;
                const imp = nml.clone().multiplyScalar(j);
                str.particles[si].setVelocity(v0.addScaledVector(imp, str.particles[si].invMass));
                str.particles[si + 1].setVelocity(v1.addScaledVector(imp, str.particles[si + 1].invMass));
                ball.vel.addScaledVector(imp, -1 / ball.mass);

                const rvt = rv.clone().sub(nml.clone().multiplyScalar(rvn));
                const ts = rvt.length();
                if (ts > 1e-8) {
                    const td = rvt.normalize(), fim = Math.min(fric * Math.abs(j), ts / tim);
                    const fi = td.clone().multiplyScalar(-fim);
                    str.particles[si].setVelocity(str.particles[si].velocity.add(fi.clone().multiplyScalar(str.particles[si].invMass)));
                    str.particles[si + 1].setVelocity(str.particles[si + 1].velocity.add(fi.clone().multiplyScalar(str.particles[si + 1].invMass)));
                    ball.vel.addScaledVector(fi, -1 / ball.mass);
                }
            }
        }
    }

    // ==================== WRAPPING ====================

    resolveWrapping(balls) {
        const wf = this.config.wrapFriction;
        for (let bi = 0; bi < balls.length; bi++) {
            const ball = balls[bi], bp = ball.worldPos, R = ball.radius;
            for (let si = 0; si < this.strings.length; si++) {
                if (si === bi) continue;
                for (let s = 0; s < 2; s++) {
                    const str = this.strings[si][s];
                    if (!str) continue;
                    for (let si2 = 0; si2 < str.numSegments; si2++) {
                        const seg = str.getSegment(si2);
                        if (!seg) continue;
                        const v0 = new THREE.Vector3().copy(seg.p0).sub(bp);
                        const v1 = new THREE.Vector3().copy(seg.p1).sub(bp);
                        const sd = new THREE.Vector3().copy(seg.p1).sub(seg.p0);
                        const sl = sd.length();
                        if (sl < 1e-10) continue;
                        const sn = sd.normalize();
                        const t = -v0.dot(sn) / sl;
                        if (t < 0.05 || t > 0.95) continue;
                        if (new THREE.Vector3().copy(seg.p0).addScaledVector(sn, t * sl).distanceTo(bp) >= R) continue;

                        const sp0 = new THREE.Vector3().copy(bp).addScaledVector(v0.normalize(), R);
                        const sp1 = new THREE.Vector3().copy(bp).addScaledVector(v1.normalize(), R);
                        if (str.particles[si2].invMass > 0) {
                            const sl0 = new THREE.Vector3().copy(sp0).sub(str.particles[si2].pos);
                            str.particles[si2].pos.addScaledVector(sl0, 1 - wf * 0.3);
                        }
                        if (str.particles[si2 + 1].invMass > 0) {
                            const sl1 = new THREE.Vector3().copy(sp1).sub(str.particles[si2 + 1].pos);
                            str.particles[si2 + 1].pos.addScaledVector(sl1, 1 - wf * 0.3);
                        }
                        ball.vel.multiplyScalar(1 - WRAP_VELOCITY_DAMP * wf * 0.01);
                    }
                }
            }
        }
    }

    // ==================== STRING↔STRING COLLISION ====================

    detectStringCollisions() {
        const th = STRING_THICKNESS * 4;
        for (let i = 0; i < this.strings.length; i++)
            for (let j = i + 1; j < this.strings.length; j++)
                for (let si = 0; si < 2; si++)
                    for (let sj = 0; sj < 2; sj++)
                        this._resolveStrStr(this.strings[i][si], this.strings[j][sj], th);
    }

    _resolveStrStr(strA, strB, th) {
        if (!strA || !strB) return;
        for (let sa = 0; sa < strA.numSegments; sa++) {
            const a = strA.getSegment(sa);
            if (!a) continue;
            for (let sb = 0; sb < strB.numSegments; sb++) {
                const b = strB.getSegment(sb);
                if (!b) continue;
                const r = this._segSegDist(a.p0, a.p1, b.p0, b.p1);
                if (r.distance >= th || !r.normal) continue;
                const pen = th - r.distance, nml = r.normal;
                const pA0 = strA.particles[sa], pA1 = strA.particles[sa + 1];
                const pB0 = strB.particles[sb], pB1 = strB.particles[sb + 1];
                const tim = pA0.invMass + pA1.invMass + pB0.invMass + pB1.invMass;
                if (tim < 1e-10) continue;
                const c = pen / tim;
                pA0.pos.addScaledVector(nml, c * pA0.invMass);
                pA1.pos.addScaledVector(nml, c * pA1.invMass);
                pB0.pos.addScaledVector(nml, -c * pB0.invMass);
                pB1.pos.addScaledVector(nml, -c * pB1.invMass);
                const va = new THREE.Vector3().copy(pA0.velocity).add(pA1.velocity).multiplyScalar(0.5);
                const vb = new THREE.Vector3().copy(pB0.velocity).add(pB1.velocity).multiplyScalar(0.5);
                const rv = new THREE.Vector3().copy(va).sub(vb);
                const rvn = rv.dot(nml);
                if (rvn > 0.5) {
                    const j = -0.3 * rvn / tim;
                    const imp = nml.clone().multiplyScalar(j);
                    pA0.setVelocity(pA0.velocity.addScaledVector(imp, pA0.invMass));
                    pA1.setVelocity(pA1.velocity.addScaledVector(imp, pA1.invMass));
                    pB0.setVelocity(pB0.velocity.addScaledVector(imp, -pB0.invMass));
                    pB1.setVelocity(pB1.velocity.addScaledVector(imp, -pB1.invMass));
                }
            }
        }
    }

    // ==================== TANGLE DETECTION ====================

    detectTangled(balls) {
        let any = false;
        for (let i = 0; i < balls.length; i++) {
            const sp = this.strings[i];
            if (!sp) continue;
            const st = this._checkSelfTangle(sp[0], sp[1]);
            let ct = false;
            for (let j = 0; j < balls.length && !ct; j++) {
                if (j === i) continue;
                const op = this.strings[j];
                if (!op) continue;
                for (let s = 0; s < 2 && !ct; s++)
                    for (let os = 0; os < 2 && !ct; os++)
                        if (this._checkCrossed(sp[s], op[os])) ct = true;
            }
            const isT = st || ct;
            if (isT) {
                this.tangledTimer[i] = (this.tangledTimer[i] || 0) + 1;
                this.wasTangled[i] = true;
                any = true;
                for (let s = 0; s < 2; s++) if (sp[s]) sp[s].tangleScore = Math.min(1, (sp[s].tangleScore || 0) + 0.01);
            } else {
                this.tangledTimer[i] = Math.max(0, (this.tangledTimer[i] || 0) - 1);
                this.wasTangled[i] = false;
                for (let s = 0; s < 2; s++) if (sp[s]) sp[s].tangleScore = Math.max(0, (sp[s].tangleScore || 0) - 0.005);
            }
        }
        return any;
    }

    _checkSelfTangle(s0, s1) {
        if (!s0 || !s1 || s0.particles.length < 2 || s1.particles.length < 2) return false;
        const d0 = new THREE.Vector3().copy(s0.endParticle.pos).sub(s0.anchorParticle.pos).normalize();
        const d1 = new THREE.Vector3().copy(s1.endParticle.pos).sub(s1.anchorParticle.pos).normalize();
        return d0.angleTo(d1) > TANGLE_ANGLE_THRESHOLD;
    }

    _checkCrossed(a, b) {
        if (!a || !b) return false;
        if (a.midpoint.distanceTo(b.midpoint) > 0.1) return false;
        const th = STRING_THICKNESS * 6;
        for (let sa = 0; sa < a.numSegments; sa++) {
            const sa_ = a.getSegment(sa); if (!sa_) continue;
            for (let sb = 0; sb < b.numSegments; sb++) {
                const sb_ = b.getSegment(sb); if (!sb_) continue;
                if (this._segSegDist(sa_.p0, sa_.p1, sb_.p0, sb_.p1).distance < th) return true;
            }
        }
        return false;
    }

    // ==================== SELF-TWISTING ====================

    detectSelfTwist(balls) {
        for (let i = 0; i < balls.length; i++) {
            const sp = this.strings[i];
            if (!sp || !sp[0] || !sp[1]) continue;

            // Guard: with stringHalfSpread ~ 0 the two strings are meant to be
            // coincident. There is no meaningful "twist" to detect, and the XZ
            // direction vectors below are pure floating-point noise in that case.
            if (balls[i].stringHalfSpread < 1e-4) {
                sp[0].twistAngleWithNeighbor = 0;
                sp[1].twistAngleWithNeighbor = 0;
                sp[0].isTwisted = false;
                sp[1].isTwisted = false;
                continue;
            }

            const v0 = new THREE.Vector3().copy(sp[0].endParticle.pos).sub(sp[0].anchorParticle.pos); v0.y = 0;
            const v1 = new THREE.Vector3().copy(sp[1].endParticle.pos).sub(sp[1].anchorParticle.pos); v1.y = 0;
            let ang = 0;
            // Require both vectors to have a non-trivial lateral magnitude
            // (relative to the string's half-spread) before trusting their angle.
            const minLen = Math.max(balls[i].stringHalfSpread * 0.1, 1e-3);
            if (v0.length() > minLen && v1.length() > minLen) {
                ang = Math.acos(Math.max(-1, Math.min(1, v0.normalize().dot(v1.normalize()))));
            }
            sp[0].twistAngleWithNeighbor = ang; sp[1].twistAngleWithNeighbor = ang;
            const tw = ang > TWIST_ANGLE_THRESHOLD;
            sp[0].isTwisted = tw; sp[1].isTwisted = tw;
        }
    }

    resolveTwisting(balls) {
        const cfg = this.config, damp = 1 - cfg.twistResistance * 0.1;
        for (let i = 0; i < balls.length; i++) {
            const sp = this.strings[i];
            if (!sp || !sp[0] || !sp[1] || (!sp[0].isTwisted && !sp[1].isTwisted)) continue;
            balls[i].vel.multiplyScalar(damp);

            const np = Math.min(sp[0].particles.length, sp[1].particles.length);
            const rs = cfg.twistResistance * 0.002;
            // Safety clamp: never move a particle more than a small fraction of one
            // segment length in a single correction pass.
            const segLen = sp[0].segmentLength || 0.01;
            const maxCorrection = segLen * 0.25;
            for (let pi = 1; pi < np - 1; pi++) {
                const p0 = sp[0].particles[pi], p1 = sp[1].particles[pi];
                if (p0.invMass === 0 || p1.invMass === 0) continue;
                const d = new THREE.Vector3().copy(p1.pos).sub(p0.pos);
                const dist = d.length();
                if (dist < 1e-6) continue;
                const dir = d.normalize();
                const fm = rs / Math.max(dist, 0.001);
                const totalInv = p0.invMass + p1.invMass;
                // Mass-weighted correction, clamped — no more stray *1000 scale factor.
                const corr0 = Math.min(fm * (p0.invMass / totalInv), maxCorrection);
                const corr1 = Math.min(fm * (p1.invMass / totalInv), maxCorrection);
                p0.pos.addScaledVector(dir, -corr0);
                p1.pos.addScaledVector(dir, corr1);
            }

            if (cfg.twistResistance < 0.5 && sp[0].isTwisted) {
                const segLen = sp[0].segmentLength || 0.01;
                const sa = Math.min((1 - cfg.twistResistance) * 0.002, segLen * 0.1);
                for (let pi = 1; pi < np - 1; pi++) {
                    const p0 = sp[0].particles[pi], p1 = sp[1].particles[pi];
                    if (p0.invMass === 0) continue;
                    const phase = (pi / np) * Math.PI * 4, off = sa * Math.sin(phase);
                    const sd = new THREE.Vector3().copy(sp[0].endParticle.pos).sub(sp[0].anchorParticle.pos).normalize();
                    const perp = new THREE.Vector3(1, 0, 0);
                    if (Math.abs(sd.dot(perp)) > 0.9) perp.set(0, 0, 1);
                    const pd = new THREE.Vector3().crossVectors(new THREE.Vector3().crossVectors(sd, perp).normalize(), sd).normalize();
                    p0.pos.addScaledVector(pd, off);
                    p1.pos.addScaledVector(pd, -off);
                }
            }
        }
    }

    // ==================== VISUAL UPDATES ====================

    /** Defensive: clamp any particle that has drifted implausibly far from its
     *  own ball's pivot back onto a sane radius. Should never trigger in normal
     *  operation — this only guards against future numerical-explosion bugs. */
    sanitizeParticles(balls) {
        for (let i = 0; i < this.strings.length && i < balls.length; i++) {
            const pivot = balls[i].pivot;
            const maxDist = balls[i].length * 3;
            for (const str of this.strings[i]) {
                for (const p of str.particles) {
                    if (p.invMass === 0) continue;
                    if (!isFinite(p.pos.x) || !isFinite(p.pos.y) || !isFinite(p.pos.z)
                        || p.pos.distanceTo(pivot) > maxDist) {
                        p.pos.copy(pivot);
                        p.prevPos.copy(pivot);
                    }
                }
            }
        }
    }

    updateVisuals(balls) {
        for (let i = 0; i < this.strings.length && i < balls.length; i++)
            for (let s = 0; s < 2; s++) {
                const str = this.strings[i][s], line = balls[i].stringLines[s];
                if (!str || !line) continue;
                const pos = line.geometry.attributes.position;
                const np = str.particles.length;
                if (pos.count !== np) {
                    line.geometry.dispose();
                    line.geometry = new THREE.BufferGeometry().setFromPoints(str.particles.map(p => p.pos.clone()));
                    continue; // was `return` — that silently skipped every other string this frame
                }
                for (let pi = 0; pi < np; pi++) pos.setXYZ(pi, str.particles[pi].pos.x, str.particles[pi].pos.y, str.particles[pi].pos.z);
                pos.needsUpdate = true;
            }
    }

    updateStringVisuals(balls) {
        for (let i = 0; i < balls.length; i++) {
            const ball = balls[i], sev = Math.min(1, (this.tangledTimer[i] || 0) / 30);
            const isT = this.wasTangled[i] || false;
            const sp = this.strings[i];
            const isTw = sp && sp[0] && sp[0].isTwisted;
            let bc, bo;
            switch (this.type) {
                case 'steel': bc = new THREE.Color(0x444466); bo = 0.8; break;
                case 'elastic': bc = new THREE.Color(0x66aa66); bo = 0.5; break;
                default: bc = new THREE.Color(0x888888); bo = 0.6; break;
            }
            for (let s = 0; s < 2; s++) {
                const line = ball.stringLines[s];
                if (!line) continue;
                const mat = line.material;
                if (isT || sev > 0) {
                    mat.color.copy(bc.clone().lerp(new THREE.Color(0xff4444), sev));
                    mat.opacity = Math.min(1, bo + sev * 0.3);
                    if (sev > 0.5) { mat.emissive = new THREE.Color(0xff2222); mat.emissiveIntensity = (sev - 0.5) * 0.5; }
                    else { mat.emissive = new THREE.Color(0); mat.emissiveIntensity = 0; }
                } else if (isTw) {
                    mat.color.copy(bc.clone().lerp(new THREE.Color(0xaa44ff), 0.3));
                    mat.opacity = bo;
                } else {
                    mat.color.setHex(bc.getHex()); mat.opacity = bo;
                    mat.emissive = new THREE.Color(0); mat.emissiveIntensity = 0;
                }
            }
        }
    }

    // ==================== MATH HELPERS ====================

    _closestPtOnSeg(target, p1, p2) {
        const s = new THREE.Vector3().copy(p2).sub(p1);
        const sl = s.lengthSq();
        if (sl < 1e-10) return p1.clone();
        const t = Math.max(0, Math.min(1, new THREE.Vector3().copy(target).sub(p1).dot(s) / sl));
        return new THREE.Vector3().copy(p1).addScaledVector(s, t);
    }

    _segSegDist(a1, a2, b1, b2) {
        const u = new THREE.Vector3().copy(a2).sub(a1);
        const v = new THREE.Vector3().copy(b2).sub(b1);
        const w = new THREE.Vector3().copy(a1).sub(b1);
        const a = u.dot(u), b = u.dot(v), c = v.dot(v), d = u.dot(w), e = v.dot(w), D = a * c - b * b;
        let s, t;
        if (Math.abs(D) < 1e-10) { s = 0; t = Math.max(0, Math.min(1, e / c)); }
        else { s = THREE.MathUtils.clamp((b * e - c * d) / D, 0, 1); t = THREE.MathUtils.clamp((a * e - b * d) / D, 0, 1); }
        const pa = new THREE.Vector3().copy(a1).addScaledVector(u, s);
        const pb = new THREE.Vector3().copy(b1).addScaledVector(v, t);
        const dist = pa.distanceTo(pb);
        return { distance: dist, normal: dist > 1e-10 ? new THREE.Vector3().copy(pa).sub(pb).normalize() : null, pointA: pa, pointB: pb };
    }
}
