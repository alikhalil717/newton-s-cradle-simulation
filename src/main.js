import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Ball } from './ball.js';
import { PhysicsEngine } from './physics.js';
import { CollisionSystem } from './collisions.js';
import { EnergyTracker } from './energy.js';
import { ScenarioManager } from './scenarios.js';
import { UIManager } from './ui.js';

// --- Scene ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
scene.fog = new THREE.Fog(0x1a1a1a, 5, 15);

// --- Camera ---
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(1.2, 0.8, 1.8);
camera.lookAt(0, 0, 0);

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.15, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.3;
controls.maxDistance = 5;
controls.update();

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 2.0);
mainLight.position.set(2, 4, 3);
mainLight.castShadow = true;
mainLight.shadow.mapSize.width = 1024;
mainLight.shadow.mapSize.height = 1024;
mainLight.shadow.camera.near = 0.1;
mainLight.shadow.camera.far = 10;
mainLight.shadow.camera.left = -2;
mainLight.shadow.camera.right = 2;
mainLight.shadow.camera.top = 2;
mainLight.shadow.camera.bottom = -2;
scene.add(mainLight);

const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
fillLight.position.set(-2, 1, -2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
rimLight.position.set(-1, 0.5, 2);
scene.add(rimLight);

// --- Ground ---
const groundGeo = new THREE.PlaneGeometry(6, 6);
const groundMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.8,
    metalness: 0.2,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.3;
ground.receiveShadow = true;
scene.add(ground);

// --- Newton's Cradle Frame / Stand ---
// Builds a complete stand: table → base plate → vertical posts → two top beams
// The top beams spread apart in Z based on the string angle (stringHalfSpread)
function buildCradleFrame(barWidth = 0.35, stringHalfSpread = 0) {
    const group = new THREE.Group();

    const barMat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 0.7,
        roughness: 0.3,
    });

    const postMat = new THREE.MeshStandardMaterial({
        color: 0x666666,
        metalness: 0.5,
        roughness: 0.4,
    });

    const woodMat = new THREE.MeshStandardMaterial({
        color: 0x5c3a1e,
        roughness: 0.9,
        metalness: 0.0,
    });

    const width = Math.max(barWidth, 0.15);
    const spread = Math.max(stringHalfSpread, 0.02); // minimum 2cm separation
    const halfW = width / 2;

    // --- Table surface ---
    const tableGeo = new THREE.BoxGeometry(width + 0.2, 0.03, spread * 2 + 0.15);
    const table = new THREE.Mesh(tableGeo, woodMat);
    table.position.y = -0.3;
    table.receiveShadow = true;
    group.add(table);

    // --- Base plate (metal) on top of table ---
    const baseGeo = new THREE.BoxGeometry(width + 0.05, 0.025, spread * 2 + 0.08);
    const base = new THREE.Mesh(baseGeo, barMat);
    base.position.y = -0.28;
    base.receiveShadow = true;
    group.add(base);

    // --- Vertical posts (4 corners) ---
    const postGeo = new THREE.BoxGeometry(0.012, 0.78, 0.012);
    const postPositions = [
        [-halfW, 0.1, -spread],  // front-left
        [halfW, 0.1, -spread],   // front-right
        [-halfW, 0.1, spread],   // back-left
        [halfW, 0.1, spread],    // back-right
    ];
    for (const pp of postPositions) {
        const p = new THREE.Mesh(postGeo, postMat);
        p.position.set(pp[0], pp[1], pp[2]);
        p.castShadow = true;
        group.add(p);
    }

    // --- Two parallel top beams (عارضتين) at Y = pivot height ---
    // Position matches where the string tops attach
    const beamGeo = new THREE.BoxGeometry(width, 0.015, 0.012);
    const frontBeam = new THREE.Mesh(beamGeo, barMat);
    frontBeam.position.set(0, 0.5, -spread);
    frontBeam.castShadow = true;
    group.add(frontBeam);

    const backBeam = new THREE.Mesh(beamGeo, barMat);
    backBeam.position.set(0, 0.5, spread);
    backBeam.castShadow = true;
    group.add(backBeam);

    // --- Cross braces at top ends to connect the two beams ---
    const crossGeo = new THREE.BoxGeometry(0.012, 0.015, spread * 2);
    for (const xSign of [-1, 1]) {
        const cross = new THREE.Mesh(crossGeo, barMat);
        cross.position.set(xSign * halfW, 0.5, 0);
        cross.castShadow = true;
        group.add(cross);
    }

    return group;
}

// --- Physics engine ---
const physics = new PhysicsEngine();
const collisionSystem = new CollisionSystem();
const energyTracker = new EnergyTracker();
const scenarioManager = new ScenarioManager();

// --- Global state (shared across modules) ---
export const state = {
    // Scene objects
    scene,
    camera,
    renderer,
    controls,

    // Physics parameters (Table 1)
    mass: 0.5,
    massPerBall: [],        // per-ball masses (auto-filled)
    radius: 0.0125,
    radiusPerBall: [],      // per-ball radii
    length: 0.30,
    lengthPerBall: [],      // per-ball string lengths
    stringAngle: 0,          // angle between the two strings (degrees); 0 = single string
    gravity: 9.81,
    restitution: 0.97,
    airDrag: 0.003,
    pivotFriction: 0.02,
    N: 5,
    thetaDeg: 30,
    gap: 0,

    // Scenario
    scenario: 'Case 1 — Single ball pull, N=5',
    scenarioNames: scenarioManager.selectableNames,

    // Simulation state
    playing: true,
    balls: [],
    ballMeshes: [],

    // Energy
    showEnergy: false,
};

// --- Build frame (after state is initialized) ---
function getFrameWidth() {
    const spacing = 2 * state.radius + state.gap;
    const chainSpan = (state.N - 1) * spacing;
    return chainSpan + 0.15;
}

function getStringHalfSpread() {
    // Match the ball's computation: halfSpread = length * sin(stringAngle/2)
    const halfAngleRad = (state.stringAngle / 2) * Math.PI / 180;
    return state.length * Math.sin(halfAngleRad);
}

let frame = buildCradleFrame(getFrameWidth(), getStringHalfSpread());
scene.add(frame);

function rebuildFrame() {
    scene.remove(frame);
    frame.traverse(child => {
        if (child.isMesh) {
            child.geometry.dispose();
            child.material.dispose();
        }
    });
    frame = buildCradleFrame(getFrameWidth(), getStringHalfSpread());
    scene.add(frame);
}

// --- Timing ---
let lastTime = performance.now();
let frameCount = 0;

// --- Wire collision system into physics engine ---
physics.collisionSystem = collisionSystem;

// --- Scenario setup ---
function setupScenario(scenarioName) {
    // Clear existing balls
    for (const ball of state.balls) {
        ball.dispose(scene);
    }
    state.balls = [];
    state.ballMeshes = [];

    // Preserve per-ball values: extend arrays if N grew, otherwise truncate
    while (state.massPerBall.length < state.N) {
        // Extend with the last ball's value (or global default if empty)
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

    // Build params from current state
    const params = {
        N: state.N,
        mass: state.massPerBall,
        radius: state.radiusPerBall,
        length: state.lengthPerBall,
        thetaDeg: state.thetaDeg,
        gap: state.gap,
        e: state.restitution,
        stringAngle: state.stringAngle,
    };

    // Generate scenario
    const result = scenarioManager.apply(scenarioName, params);
    const balls = result.balls;
    if (result.params.restitution !== undefined) {
        collisionSystem.restitution = result.params.restitution;
        state.restitution = result.params.restitution; // sync so syncPhysicsParams doesn't override
    }
    if (result.params.N !== undefined) {
        state.N = result.params.N;
    }

    // Create Three.js visuals for each ball
    for (const ball of balls) {
        ball.createMesh(scene);
        ball.createString(scene);
    }

    state.balls = balls;
    state.ballMeshes = balls.map(b => b.mesh);

    // Rebuild frame to match new ball count / spacing
    rebuildFrame();

    // Reset energy tracking for new scenario
    energyTracker.reset();
}

// Rebuild per-ball UI and frame when N or params change
function onParamChange() {
    setupScenario(state.scenario);
    ui.rebuildPerBall();
}

// --- Energy HUD ---
const energyHud = document.createElement('div');
energyHud.id = 'energy-hud';
energyHud.style.cssText = `
    position: absolute; top: 12px; right: 12px;
    color: #aaa; font-family: monospace; font-size: 11px;
    background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 4px;
    line-height: 1.6; pointer-events: none; user-select: none;
    -webkit-user-select: none;
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

// --- Initial setup ---
setupScenario(state.scenario);

// --- UI panel ---
const ui = new UIManager(state, {
    onScenarioChange: (value) => {
        state.scenario = value;
        // Case 3 starts at N=7 — set it once before setupScenario reads state.N
        // Restore default params for base cases
        if (value !== 'Case 3 — N=7 chain' && state.N === 7 && state.scenario === 'Case 3 — N=7 chain') {
            state.N = 5;
        }
        // Case 8 sets gap=0.01; any other scenario resets gap to 0
        if (value === 'Case 8 — Gaps between balls') {
            state.gap = 0.01;
        } else {
            state.gap = 0;
        }
        // Case 9 sets e≈0; any other scenario resets to 0.97
        if (value === 'Case 9 — Fully inelastic (e≈0)') {
            state.restitution = 0.01;
        } else {
            state.restitution = 0.97;
        }
        setupScenario(value);
    },
    onParamChange: () => {
        onParamChange();
    },
    onReset: () => {
        setupScenario(state.scenario);
    },
});

// --- Sync physics params from state to engine ---
function syncPhysicsParams() {
    physics.g = state.gravity;
    physics.b = state.airDrag;
    physics.muK = state.pivotFriction;
    collisionSystem.restitution = state.restitution;
}

/**
 * Compute total mechanical energy (KE + PE) for all balls
 */
function computeMechanicalEnergy(balls, g) {
    let ke = 0, pe = 0;
    for (const ball of balls) {
        ke += ball.kineticEnergy;
        pe += ball.getPotentialEnergy(g);
    }
    return { ke, pe, total: ke + pe };
}

// --- Animation loop ---
function animate() {
    requestAnimationFrame(animate);
    frameCount++;

    const now = performance.now();
    const deltaTime = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
    lastTime = now;

    // Run physics (collision system is called internally per substep)
    if (state.playing && state.balls.length > 0) {
        syncPhysicsParams();

        physics.simulate(state.balls, deltaTime);

        // Get energy losses from physics engine + collision system
        const losses = physics.getFrameEnergyLosses();

        // Compute current mechanical energy
        const after = computeMechanicalEnergy(state.balls, state.gravity);

        // Record energy state with component breakdown
        energyTracker.record(after.ke, after.pe, losses.collision, losses.drag, losses.friction);

        // Update visuals to match physics state
        for (const ball of state.balls) {
            ball.updateVisuals();
        }
    }

    // Update HUD every 10 frames to reduce overhead
    if (frameCount % 10 === 0 || frameCount === 1) {
        try {
            updateEnergyHud();
        } catch (e) {
            console.error('HUD error:', e);
        }
    }

    // Update controls and render
    controls.update();
    renderer.render(scene, camera);
}

animate();

// --- Resize ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

