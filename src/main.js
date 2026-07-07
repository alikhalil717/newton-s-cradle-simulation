
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Ball } from './ball.js';
import { PhysicsEngine } from './physics.js';
import { CollisionSystem } from './collisions.js';
import { EnergyTracker } from './energy.js';
import { ScenarioManager } from './scenarios.js';
import { UIManager } from './ui.js';
import { RoomBuilder } from './room.js';


const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 10);
camera.position.set(1.5, 1.0, 2.2);
camera.lookAt(0, 0.1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.bias = -0.0005;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);


const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.15, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.4;
controls.maxDistance = 2.8;
controls.update();


const physics = new PhysicsEngine();
const collisionSystem = new CollisionSystem();
const energyTracker = new EnergyTracker();
const scenarioManager = new ScenarioManager();

physics.collisionSystem = collisionSystem;


export const state = {
    scene, camera, renderer, controls,

    mass: 0.065,
    massPerBall: [],
    radius: 0.02,
    radiusPerBall: [],
    length: 0.30,
    lengthPerBall: [],
    stringAngle: 0,
    gravity: 9.81,
    restitution: 0.97,
    airDrag: 0.003,
    pivotFriction: 0.02,
    N: 5,
    thetaDeg: 30,
    gap: 0,

    scenario: 'Case 1 — Single ball pull, N=5',
    scenarioNames: scenarioManager.selectableNames,

    playing: true,
    balls: [],
    ballMeshes: [],

    showEnergy: false,

    stringType: 'regular',
    stringTypes: ['regular', 'steel', 'elastic'],
};


const roomBuilder = new RoomBuilder(scene);
roomBuilder.build();


const BRASS = { color: 0xc8a050, metalness: 0.8, roughness: 0.25 };
const STEEL = { color: 0x909090, metalness: 0.7, roughness: 0.3 };
const DARK = { color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 };

function buildCradleFrame(barWidth = 0.35, stringHalfSpread = 0) {
    const group = new THREE.Group();
    const barMat = new THREE.MeshStandardMaterial(STEEL);
    const brassMat = new THREE.MeshStandardMaterial(BRASS);
    const darkMat = new THREE.MeshStandardMaterial(DARK);

    const width = Math.max(barWidth, 0.15);
    const spread = Math.max(stringHalfSpread, 0.02);
    const halfW = width / 2;


    const basePlate = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.06, 0.012, spread * 2 + 0.06),
        darkMat
    );
    basePlate.position.set(0, -0.3 + 0.26 + 0.04 + 0.006, 0);
    basePlate.receiveShadow = true;
    group.add(basePlate);


    const postGeo = new THREE.CylinderGeometry(0.006, 0.008, 0.78, 8);
    const postPositions = [
        [-halfW, 0.1 + 0.01, -spread], [halfW, 0.1 + 0.01, -spread],
        [-halfW, 0.1 + 0.01, spread],  [halfW, 0.1 + 0.01, spread],
    ];
    for (const pp of postPositions) {
        const p = new THREE.Mesh(postGeo, brassMat);
        p.position.set(pp[0], pp[1], pp[2]);
        p.castShadow = true;
        group.add(p);
    }


    const beamGeo = new THREE.BoxGeometry(width, 0.012, 0.008);
    const frontBeam = new THREE.Mesh(beamGeo, barMat);
    frontBeam.position.set(0, 0.5 + 0.01, -spread);
    frontBeam.castShadow = true;
    group.add(frontBeam);

    const backBeam = new THREE.Mesh(beamGeo, barMat);
    backBeam.position.set(0, 0.5 + 0.01, spread);
    backBeam.castShadow = true;
    group.add(backBeam);


    const crossGeo = new THREE.BoxGeometry(0.008, 0.012, spread * 2);
    for (const xSign of [-1, 1]) {
        const cross = new THREE.Mesh(crossGeo, barMat);
        cross.position.set(xSign * halfW, 0.5 + 0.01, 0);
        cross.castShadow = true;
        group.add(cross);
    }


    const finialGeo = new THREE.SphereGeometry(0.008, 8, 8);
    for (const pp of postPositions) {
        const fin = new THREE.Mesh(finialGeo, brassMat);
        fin.position.set(pp[0], 0.5 + 0.01 + 0.012, pp[2]);
        fin.castShadow = true;
        group.add(fin);
    }


    const plateMat = new THREE.MeshStandardMaterial({
        color: 0xbba060,
        metalness: 0.7,
        roughness: 0.3,
    });
    const nameplate = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.004, 0.025),
        plateMat
    );
    nameplate.position.set(0, 0.18, -spread - 0.006);
    group.add(nameplate);

    return group;
}

function getFrameWidth() {
    const spacing = 2 * state.radius + state.gap;
    return (state.N - 1) * spacing + 0.15;
}

function getStringHalfSpread() {
    const halfAngleRad = THREE.MathUtils.degToRad(state.stringAngle / 2);
    return state.length * Math.sin(halfAngleRad);
}

const PEDESTAL_TOP_Y = -0.33 + 0.04 + 0.55 + 0.02;
const FRAME_BASE_Y = PEDESTAL_TOP_Y;

const PIVOT_Y = FRAME_BASE_Y + 0.5;

let frame = buildCradleFrame(getFrameWidth(), getStringHalfSpread());
frame.position.y = FRAME_BASE_Y;
scene.add(frame);

function rebuildFrame() {
    scene.remove(frame);
    frame.traverse(child => {
        if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); }
    });
    frame = buildCradleFrame(getFrameWidth(), getStringHalfSpread());
    frame.position.y = FRAME_BASE_Y;
    scene.add(frame);
}


const keys = { w: false, a: false, s: false, d: false };
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) { keys[key] = true; e.preventDefault(); }
});
document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) { keys[key] = false; e.preventDefault(); }
});

function updateWASDCamera(delta) {
    const speed = 0.6 * delta;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const move = new THREE.Vector3();
    if (keys.w) move.add(forward);
    if (keys.s) move.sub(forward);
    if (keys.a) move.sub(right);
    if (keys.d) move.add(right);

    if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed);
        controls.target.add(move);
        camera.position.add(move);
        controls.update();
    }
}


let dragState = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function getPointerNDC(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
}

function getIntersectedBall(event) {
    const ndc = getPointerNDC(event);
    raycaster.setFromCamera(ndc, camera);
    const meshes = state.ballMeshes.filter(m => m !== null);
    const intersects = raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        const idx = state.ballMeshes.indexOf(hitMesh);
        if (idx >= 0 && idx < state.balls.length) {
            return { ball: state.balls[idx], mesh: hitMesh, point: intersects[0].point };
        }
    }
    return null;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const hit = getIntersectedBall(event);
    if (hit) {
        controls.enabled = false;
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, hit.ball.worldPos);
        dragState = {
            ball: hit.ball,
            plane,
            offset: new THREE.Vector3().copy(hit.ball.worldPos).sub(hit.point),
            mouseWorld: hit.point.clone(),
        };
        renderer.domElement.style.cursor = 'grabbing';
    }
});

renderer.domElement.addEventListener('pointermove', (event) => {
    if (dragState) {
        const ndc = getPointerNDC(event);
        raycaster.setFromCamera(ndc, camera);
        const intersectPt = new THREE.Vector3();
        const hit = raycaster.ray.intersectPlane(dragState.plane, intersectPt);
        if (hit) {
            const desiredWorld = intersectPt.clone().add(dragState.offset);
            const localPos = desiredWorld.sub(dragState.ball.pivot);
            const L = dragState.ball.effectiveLength;
            if (localPos.length() > 0) {
                localPos.normalize().multiplyScalar(L);
            }
            dragState.ball.pos.copy(localPos);
            dragState.ball.vel.set(0, 0, 0);
        }
    }
});

window.addEventListener('pointerup', () => {
    if (dragState) {
        dragState = null;
        controls.enabled = true;
        renderer.domElement.style.cursor = 'default';
    }
});


function setupScenario(scenarioName) {
    for (const ball of state.balls) {
        ball.dispose(scene);
    }
    state.balls = [];
    state.ballMeshes = [];

    while (state.massPerBall.length < state.N) {
        const lastMass = state.massPerBall.length > 0 ? state.massPerBall[state.massPerBall.length - 1] : state.mass;
        const lastRadius = state.radiusPerBall.length > 0 ? state.radiusPerBall[state.radiusPerBall.length - 1] : state.radius;
        const lastLength = state.lengthPerBall.length > 0 ? state.lengthPerBall[state.lengthPerBall.length - 1] : state.length;
        state.massPerBall.push(lastMass);
        state.radiusPerBall.push(lastRadius);
        state.lengthPerBall.push(lastLength);
    }
    if (state.massPerBall.length > state.N) {
        state.massPerBall.length = state.N;
        state.radiusPerBall.length = state.N;
        state.lengthPerBall.length = state.N;
    }

    const params = {
        N: state.N,
        mass: state.massPerBall,
        radius: state.radiusPerBall,
        length: state.lengthPerBall,
        thetaDeg: state.thetaDeg,
        gap: state.gap,
        e: state.restitution,
        stringAngle: state.stringAngle,
        pivotY: PIVOT_Y,
    };

    const result = scenarioManager.apply(scenarioName, params);
    const balls = result.balls;

    if (result.params.restitution !== undefined) {
        collisionSystem.restitution = result.params.restitution;
        state.restitution = result.params.restitution;
    }
    if (result.params.N !== undefined) {
        state.N = result.params.N;
    }

    for (const ball of balls) {
        ball.createMesh(scene);
        ball.createString(scene);
    }

    state.balls = balls;
    state.ballMeshes = balls.map(b => b.mesh);

    rebuildFrame();
    energyTracker.reset();


    const initial = computeMechanicalEnergy(balls, state.gravity);
    state._initialEnergy = initial.total;
}

function onParamChange() {
    setupScenario(state.scenario);
    ui && ui.rebuildPerBall();
}


const energyHud = document.createElement('div');
energyHud.id = 'energy-hud';
energyHud.style.cssText = `
    position: absolute; top: 12px; right: 12px;
    color: #aaa; font-family: monospace; font-size: 11px;
    background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 4px;
    line-height: 1.6; pointer-events: none; user-select: none;
`;
document.body.appendChild(energyHud);

function updateEnergyHud() {
    if (energyTracker.history.length === 0) {
        energyHud.textContent = 'Energy: —';
        return;
    }
    const last = energyTracker.history[energyTracker.history.length - 1];
    const total = last.kinetic + last.potential + last.dissipated;
    energyHud.innerHTML =
        `KE: ${last.kinetic.toFixed(4)} J<br>` +
        `PE: ${last.potential.toFixed(4)} J<br>` +
        `Dissipated: ${last.dissipated.toFixed(4)} J<br>` +
        `Total: ${total.toFixed(4)} J`;
}


setupScenario(state.scenario);

const ui = new UIManager(state, {
    onScenarioChange: (value) => {
        state.scenario = value;
        if (value === 'Case 8 — Gaps between balls') state.gap = 0.01;
        else state.gap = 0;
        if (value === 'Case 9 — Fully inelastic (e≈0)') state.restitution = 0.01;
        else state.restitution = 0.97;
        setupScenario(value);
    },
    onParamChange: () => onParamChange(),
    onReset: () => setupScenario(state.scenario),
});


function syncPhysicsParams() {
    physics.g = state.gravity;
    physics.b = state.airDrag;
    physics.muK = state.pivotFriction;
    collisionSystem.restitution = state.restitution;
}

function computeMechanicalEnergy(balls, g) {
    let ke = 0, pe = 0;
    for (const ball of balls) {
        ke += ball.kineticEnergy;
        pe += ball.getPotentialEnergy(g);
    }
    return { ke, pe, total: ke + pe };
}


let lastTime = performance.now();
let frameCount = 0;

function animate() {
    requestAnimationFrame(animate);
    frameCount++;

    const now = performance.now();
    const deltaTime = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    updateWASDCamera(deltaTime);

    if (state.playing && state.balls.length > 0) {
        syncPhysicsParams();


        physics.stringType = state.stringType;

        physics.simulate(state.balls, deltaTime);


        for (const ball of state.balls) {
            ball.updateStringPivots();
            ball.updateVisuals();
        }


        const losses = physics.getFrameEnergyLosses();
        const after = computeMechanicalEnergy(state.balls, state.gravity);
        energyTracker.record(after.ke, after.pe,
            losses.collision || 0,
            losses.drag || 0,
            losses.friction || 0
        );

        for (const ball of state.balls) {
            ball.updateVisuals();
        }
    }

    if (frameCount % 10 === 0 || frameCount === 1) {
        try { updateEnergyHud(); } catch (e) { /* ignore */ }
    }

    controls.update();
    renderer.render(scene, camera);
}

animate();


window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
