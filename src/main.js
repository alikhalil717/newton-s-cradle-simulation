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
function buildCradleFrame(barWidth = 0.35) {
    const group = new THREE.Group();

    const barMat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 0.7,
        roughness: 0.3,
    });

    // Top horizontal bar — width adapts to ball chain
    const barGeo = new THREE.BoxGeometry(Math.max(barWidth, 0.15), 0.015, 0.015);
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.y = 0.5;
    bar.castShadow = true;
    group.add(bar);

    // Vertical posts
    const postGeo = new THREE.BoxGeometry(0.012, 0.8, 0.012);
    const postMat = new THREE.MeshStandardMaterial({
        color: 0x666666,
        metalness: 0.5,
        roughness: 0.4,
    });

    const halfSpan = barGeo.parameters.width / 2 - 0.02;
    const leftPost = new THREE.Mesh(postGeo, postMat);
    leftPost.position.set(-halfSpan, 0.1, 0);
    leftPost.castShadow = true;
    group.add(leftPost);

    const rightPost = new THREE.Mesh(postGeo, postMat);
    rightPost.position.set(halfSpan, 0.1, 0);
    rightPost.castShadow = true;
    group.add(rightPost);

    // Base
    const baseGeo = new THREE.BoxGeometry(barWidth + 0.05, 0.025, 0.12);
    const base = new THREE.Mesh(baseGeo, barMat);
    base.position.y = -0.3;
    base.receiveShadow = true;
    group.add(base);

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
    radius: 0.0125,
    length: 0.30,
    gravity: 9.81,
    restitution: 0.97,
    airDrag: 0.003,
    pivotFriction: 0.02,
    N: 5,
    thetaDeg: 30,
    gap: 0,

    // Scenario
    scenario: 'Case 1 — Single ball pull, N=5',
    scenarioNames: scenarioManager.names,

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

let frame = buildCradleFrame(getFrameWidth());
scene.add(frame);

function rebuildFrame() {
    scene.remove(frame);
    frame.traverse(child => {
        if (child.isMesh) {
            child.geometry.dispose();
            child.material.dispose();
        }
    });
    frame = buildCradleFrame(getFrameWidth());
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

    // Build params from current state
    const params = {
        N: state.N,
        mass: state.mass,
        radius: state.radius,
        length: state.length,
        thetaDeg: state.thetaDeg,
        gap: state.gap,
        e: state.restitution,
    };

    // Generate scenario
    const result = scenarioManager.apply(scenarioName, params);
    const balls = result.balls;
    if (result.params.restitution !== undefined) {
        collisionSystem.restitution = result.params.restitution;
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
        setupScenario(value);
    },
    onParamChange: () => {
        setupScenario(state.scenario);
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

