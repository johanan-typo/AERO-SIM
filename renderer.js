import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Global Simulation Variables ---
let scene, camera, renderer, controls;
let clock = new THREE.Clock();

// Drones
let drone1, drone2, drone3;

// Telemetry & UI Cached Elements
const elAlt = document.getElementById('drone1-alt');
const elSpeed = document.getElementById('drone1-speed');
const elPitch = document.getElementById('drone1-pitch');
const elRoll = document.getElementById('drone1-roll');
const elYaw = document.getElementById('drone1-yaw');
const elX = document.getElementById('drone1-x');
const elY = document.getElementById('drone1-y');
const elZ = document.getElementById('drone1-z');
const elInputDevice = document.getElementById('active-input-device');
const elFps = document.getElementById('fps-counter');

const elTrackD1 = document.getElementById('tracker-d1-pos');
const elTrackD2 = document.getElementById('tracker-d2-pos');
const elTrackD3 = document.getElementById('tracker-d3-pos');

// Buttons & Inputs
const btnCamOrbit = document.getElementById('cam-orbit');
const btnCamChase = document.getElementById('cam-chase');
const btnCamFpv = document.getElementById('cam-fpv');
const chkGrid = document.getElementById('setting-grid');
const sliderAiSpeed = document.getElementById('setting-ai-speed');

// Gamepad Debug UI Elements
const gamepadStatus = document.getElementById('gamepad-status-display');
const gamepadDebugMeters = document.getElementById('gamepad-debug-meters');
const lStickDot = document.getElementById('l-stick-dot');
const rStickDot = document.getElementById('r-stick-dot');

// Control Modes
let cameraMode = 'orbit'; // 'orbit', 'chase', 'fpv'
let gridHelpers = [];
let aiSpeedMultiplier = 1.0;

// FPS calculation
let lastFpsUpdate = 0;
let framesCount = 0;

// --- Drone 1 (Manual) Physics State ---
const drone1State = {
  position: new THREE.Vector3(0, 0.25, 0),
  velocity: new THREE.Vector3(0, 0, 0),
  yaw: 0,        // Yaw angle in radians (Y-axis rotation)
  pitch: 0,      // Pitch angle in radians (X-axis tilt, forward/back)
  roll: 0,       // Roll angle in radians (Z-axis tilt, left/right)
  
  // Physics Configurations
  maxPitch: THREE.MathUtils.degToRad(22),  // Max manual tilt
  maxRoll: THREE.MathUtils.degToRad(22),
  pitchSpeed: 3.5,        // Tilt speed responsiveness
  rollSpeed: 3.5,
  yawSpeed: 2.2,          // Rotation speed responsiveness
  thrust: 14.0,           // Altitude force scaling
  tiltForce: 16.0,        // Lateral movement acceleration scaling
  drag: 3.0,              // Horizontal drag factor
  verticalDrag: 4.0,      // Vertical drag factor
  gravity: 9.81
};

// Keyboard state map
const keysPressed = {};

// Gamepad state
let activeGamepadIndex = null;

// --- 1. Initialize Scene & Three.js ---
function init() {
  const container = document.getElementById('canvas-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060608);
  // Elegant dark blue fog to make the grid fade into the horizon
  scene.fog = new THREE.FogExp2(0x060608, 0.015);

  // Camera
  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(0, 15, 30);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Orbit Controls (Default Camera Mode)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.01; // Prevent going underground
  controls.minDistance = 2;
  controls.maxDistance = 150;
  controls.target.set(0, 1, 0);

  // Lighting
  setupLighting();

  // Grids
  setupGrids();

  // Create Drones
  drone1 = createDroneMesh(0x00f2fe); // Cyan
  drone2 = createDroneMesh(0xff4949); // Red
  drone3 = createDroneMesh(0x39ff14); // Green

  scene.add(drone1);
  scene.add(drone2);
  scene.add(drone3);

  // Set initial drone heights
  drone1.position.copy(drone1State.position);
  drone2.position.set(15, 8, 15);
  drone3.position.set(-15, 12, -15);

  // Attach spotlights under drones to project neon cones on the ground
  attachDroneSpotlights();

  // --- Listeners ---
  window.addEventListener('resize', onWindowResize);
  setupControlListeners();

  // Start loop
  animate();
}

// --- 2. Lighting Setup ---
function setupLighting() {
  // Ambient sky light
  const ambientLight = new THREE.AmbientLight(0x0c0d14, 0.8);
  scene.add(ambientLight);

  // Main directional light (simulated sun)
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(30, 60, 20);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 150;
  
  const d = 40;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  dirLight.shadow.bias = -0.0005;

  scene.add(dirLight);

  // Accent Blue Hemisphere light
  const hemiLight = new THREE.HemisphereLight(0x0a1020, 0x020205, 0.4);
  scene.add(hemiLight);
}

// --- 3. Double-Grid System Setup ---
function setupGrids() {
  // Primary dark gray grid
  const gridHelper1 = new THREE.GridHelper(300, 150, 0x1a1a24, 0x111116);
  gridHelper1.position.y = 0;
  scene.add(gridHelper1);
  gridHelpers.push(gridHelper1);

  // Secondary glowing cyan-blue grid for technical simulation theme
  const gridHelper2 = new THREE.GridHelper(300, 30, 0x00f2fe, 0x0a4a60);
  gridHelper2.position.y = -0.02; // Prevent z-fighting
  gridHelper2.material.opacity = 0.25;
  gridHelper2.material.transparent = true;
  scene.add(gridHelper2);
  gridHelpers.push(gridHelper2);
  
  // Outer runway boundaries
  const boundaryGeo = new THREE.RingGeometry(148, 150, 64);
  const boundaryMat = new THREE.MeshBasicMaterial({ color: 0x151d2a, side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
  const boundary = new THREE.Mesh(boundaryGeo, boundaryMat);
  boundary.rotation.x = Math.PI / 2;
  boundary.position.y = 0.01;
  scene.add(boundary);
  gridHelpers.push(boundary);
}

// --- 4. Drone Mesh Generator (Primitives) ---
function createDroneMesh(colorHex) {
  const droneGroup = new THREE.Group();
  droneGroup.castShadow = true;
  droneGroup.receiveShadow = true;

  // Material System
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0x1f232d,
    metalness: 0.9,
    roughness: 0.15
  });

  const neonMaterial = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 2.0,
    metalness: 0.1,
    roughness: 0.1
  });

  // Central Body (Fuselage)
  const bodyGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.25, 8);
  const body = new THREE.Mesh(bodyGeo, metalMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  droneGroup.add(body);

  // Glowing Core Dome
  const domeGeo = new THREE.SphereGeometry(0.22, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, neonMaterial);
  dome.position.y = 0.125;
  dome.castShadow = true;
  droneGroup.add(dome);

  // 4 Arms (X Config)
  const armLength = 0.8;
  const armRadius = 0.04;
  const armGeo = new THREE.CylinderGeometry(armRadius, armRadius, armLength, 8);
  armGeo.rotateX(Math.PI / 2); // Orient cylinders horizontally

  const angles = [Math.PI/4, 3*Math.PI/4, -Math.PI/4, -3*Math.PI/4];
  const armMeshGroup = new THREE.Group();

  angles.forEach(angle => {
    const arm = new THREE.Mesh(armGeo, metalMaterial);
    arm.position.x = Math.sin(angle) * (armLength / 2);
    arm.position.z = Math.cos(angle) * (armLength / 2);
    arm.rotation.y = angle;
    arm.castShadow = true;
    armMeshGroup.add(arm);

    // Motor Hubs at ends of arms
    const motorGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8);
    const motor = new THREE.Mesh(motorGeo, metalMaterial);
    motor.position.set(Math.sin(angle) * armLength, 0.05, Math.cos(angle) * armLength);
    motor.castShadow = true;
    armMeshGroup.add(motor);

    // Dynamic rotors list container for animation
    if (!droneGroup.userData.rotors) droneGroup.userData.rotors = [];

    // Rotor blades (Thin boxes)
    const rotorGeo = new THREE.BoxGeometry(0.5, 0.008, 0.03);
    const rotor = new THREE.Mesh(rotorGeo, neonMaterial);
    rotor.position.set(Math.sin(angle) * armLength, 0.11, Math.cos(angle) * armLength);
    rotor.castShadow = true;
    
    armMeshGroup.add(rotor);
    droneGroup.userData.rotors.push(rotor);
  });

  droneGroup.add(armMeshGroup);

  // Forward Heading Indicator (Nose Cone)
  const noseGeo = new THREE.ConeGeometry(0.1, 0.25, 4);
  noseGeo.rotateX(Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, neonMaterial);
  nose.position.set(0, 0, 0.5);
  droneGroup.add(nose);

  // Landing skids
  const skidLegGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8);
  skidLegGeo.rotateX(Math.PI/6);
  const skidRailGeo = new THREE.BoxGeometry(0.03, 0.02, 0.9);
  
  const skidLeft = new THREE.Group();
  const legFL = new THREE.Mesh(skidLegGeo, metalMaterial);
  legFL.position.set(-0.25, -0.1, 0.2);
  const legBL = new THREE.Mesh(skidLegGeo, metalMaterial);
  legBL.position.set(-0.25, -0.1, -0.2);
  const railL = new THREE.Mesh(skidRailGeo, metalMaterial);
  railL.position.set(-0.25, -0.2, 0);
  skidLeft.add(legFL, legBL, railL);

  const skidRight = skidLeft.clone();
  skidRight.position.x = 0.5; // Offset to the right
  
  droneGroup.add(skidLeft);
  droneGroup.add(skidRight);

  return droneGroup;
}

// --- 5. Spotlights Below Drones ---
function attachDroneSpotlights() {
  const createLight = (colorHex) => {
    const lightGroup = new THREE.Group();
    // Dynamic SpotLight
    const spotlight = new THREE.SpotLight(colorHex, 6.0, 15, Math.PI / 4, 0.5, 1);
    spotlight.position.set(0, -0.2, 0);
    spotlight.castShadow = true;
    spotlight.shadow.mapSize.width = 512;
    spotlight.shadow.mapSize.height = 512;
    
    // Light target moves with the group
    const targetObj = new THREE.Object3D();
    targetObj.position.set(0, -10, 0);
    
    lightGroup.add(spotlight);
    lightGroup.add(targetObj);
    spotlight.target = targetObj;

    return lightGroup;
  };

  drone1.add(createLight(0x00f2fe));
  drone2.add(createLight(0xff4949));
  drone3.add(createLight(0x39ff14));
}

// --- 6. Event Listeners & UI Controls ---
function setupControlListeners() {
  // Keyboard Listeners
  window.addEventListener('keydown', e => {
    keysPressed[e.code] = true;
    elInputDevice.innerText = 'KEYBOARD';
    elInputDevice.className = 'value text-warning';
  });
  window.addEventListener('keyup', e => {
    keysPressed[e.code] = false;
  });

  // Gamepad API connection listeners
  window.addEventListener('gamepadconnected', e => {
    activeGamepadIndex = e.gamepad.index;
    updateGamepadUI(true, e.gamepad.id);
  });

  window.addEventListener('gamepaddisconnected', e => {
    if (activeGamepadIndex === e.gamepad.index) {
      activeGamepadIndex = null;
      updateGamepadUI(false);
    }
  });

  // Camera Selector Buttons
  btnCamOrbit.addEventListener('click', () => setCameraMode('orbit'));
  btnCamChase.addEventListener('click', () => setCameraMode('chase'));
  btnCamFpv.addEventListener('click', () => setCameraMode('fpv'));

  // Settings Toggles
  chkGrid.addEventListener('change', e => {
    gridHelpers.forEach(grid => grid.visible = e.target.checked);
  });

  sliderAiSpeed.addEventListener('input', e => {
    aiSpeedMultiplier = parseFloat(e.target.value);
  });
}

function setCameraMode(mode) {
  cameraMode = mode;
  btnCamOrbit.classList.remove('active');
  btnCamChase.classList.remove('active');
  btnCamFpv.classList.remove('active');

  if (mode === 'orbit') {
    btnCamOrbit.classList.add('active');
    controls.enabled = true;
  } else {
    controls.enabled = false; // Disable OrbitControls for chase/FPV follow
    if (mode === 'chase') btnCamChase.classList.add('active');
    if (mode === 'fpv') btnCamFpv.classList.add('active');
  }
}

function updateGamepadUI(connected, idStr = '') {
  if (connected) {
    gamepadStatus.className = 'gamepad-connected';
    // Shorten gamepad ID name for UI cleanliness
    const nameStr = idStr.includes('(') ? idStr.split('(')[0].trim() : idStr.substring(0, 16);
    gamepadStatus.querySelector('.status-text').innerText = `CONNECTED: ${nameStr.toUpperCase()}`;
    gamepadDebugMeters.classList.remove('hidden');
    elInputDevice.innerText = 'GAMEPAD';
    elInputDevice.className = 'value green-text';
  } else {
    gamepadStatus.className = 'gamepad-disconnected';
    gamepadStatus.querySelector('.status-text').innerText = 'NO GAMEPAD CONNECTED';
    gamepadDebugMeters.classList.add('hidden');
    elInputDevice.innerText = 'KEYBOARD';
    elInputDevice.className = 'value text-warning';
  }
}

function onWindowResize() {
  const container = document.getElementById('canvas-container');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

// --- 7. Gamepad Inputs Polling (Mode 2) ---
function pollGamepadInputs() {
  if (activeGamepadIndex === null) return null;

  const gamepads = navigator.getGamepads();
  const gp = gamepads[activeGamepadIndex];
  if (!gp) return null;

  // Apply a deadzone to prevent stick drift
  const applyDeadzone = (val, threshold = 0.08) => {
    return Math.abs(val) > threshold ? val : 0;
  };

  // Mode 2 Standard mapping:
  // Left Stick: Yaw (X) & Throttle/Altitude (Y)
  // Right Stick: Roll (X) & Pitch (Y)
  const leftX = applyDeadzone(gp.axes[0]);
  const leftY = -applyDeadzone(gp.axes[1]); // Invert so pushing up goes up
  const rightX = applyDeadzone(gp.axes[2]);
  const rightY = -applyDeadzone(gp.axes[3]); // Invert so pushing forward tilts forward

  // Update UI visualizer diagnostic meters
  lStickDot.style.transform = `translate(${leftX * 22}px, ${-leftY * 22}px)`;
  rStickDot.style.transform = `translate(${rightX * 22}px, ${-rightY * 22}px)`;

  return {
    throttle: leftY,
    yaw: leftX,
    roll: rightX,
    pitch: rightY
  };
}

// --- 8. Flight Simulation Physics (Drone 1) ---
function updateDrone1Physics(dt) {
  const state = drone1State;
  
  // Read controller inputs
  const gpInput = pollGamepadInputs();
  
  let targetPitchInput = 0;
  let targetRollInput = 0;
  let targetYawInput = 0;
  let targetThrottleInput = 0;

  if (gpInput) {
    // Gamepad input scaling
    targetPitchInput = gpInput.pitch * state.maxPitch;
    targetRollInput = gpInput.roll * state.maxRoll;
    targetYawInput = gpInput.yaw;
    targetThrottleInput = gpInput.throttle;
  } else {
    // Keyboard input mapping
    if (keysPressed['KeyW']) targetPitchInput = state.maxPitch;  // Pitch Fwd (Tilt forward)
    if (keysPressed['KeyS']) targetPitchInput = -state.maxPitch; // Pitch Bwd (Tilt backward)
    if (keysPressed['KeyA']) targetRollInput = -state.maxRoll;   // Roll Left (Tilt Left)
    if (keysPressed['KeyD']) targetRollInput = state.maxRoll;    // Roll Right (Tilt Right)

    if (keysPressed['ArrowLeft']) targetYawInput = -1.0;
    if (keysPressed['ArrowRight']) targetYawInput = 1.0;
    if (keysPressed['ArrowUp']) targetThrottleInput = 1.0;
    if (keysPressed['ArrowDown']) targetThrottleInput = -1.0;
  }

  // Smoothly interpolate Pitch and Roll (simulating gyros & inertia)
  state.pitch = THREE.MathUtils.lerp(state.pitch, targetPitchInput, state.pitchSpeed * dt);
  state.roll = THREE.MathUtils.lerp(state.roll, targetRollInput, state.rollSpeed * dt);

  // Update Yaw (angle of rotation around vertical axis)
  state.yaw += -targetYawInput * state.yawSpeed * dt;

  // --- Compute Forces & Velocities ---
  
  // Gravity
  const gravityAcc = new THREE.Vector3(0, -state.gravity, 0);
  
  // Thrust Vector (local vertical axis of the drone)
  // Perfect 3D physics extraction: thrust acts perpendicular to the drone frame
  const thrustDirection = new THREE.Vector3(0, 1, 0);
  
  // Rotate local thrust vector according to drone's orientation (pitch & roll, then yaw)
  const orientationEuler = new THREE.Euler(state.pitch, state.yaw, state.roll, 'YXZ');
  thrustDirection.applyEuler(orientationEuler);
  
  // Base throttle value (counteracts gravity + vertical input)
  const verticalInputForce = targetThrottleInput * state.thrust;
  const baseThrust = state.gravity + verticalInputForce;
  
  const totalThrustAcc = thrustDirection.multiplyScalar(baseThrust);
  
  // Sum accelerations
  const acceleration = new THREE.Vector3()
    .copy(gravityAcc)
    .add(totalThrustAcc);
  
  // Drag forces (dampening)
  const horizontalDrag = new THREE.Vector3(-state.velocity.x * state.drag, 0, -state.velocity.z * state.drag);
  const verticalDrag = new THREE.Vector3(0, -state.velocity.y * state.verticalDrag, 0);
  
  acceleration.add(horizontalDrag).add(verticalDrag);
  
  // Update Velocity
  state.velocity.addScaledVector(acceleration, dt);
  
  // Update Position
  state.position.addScaledVector(state.velocity, dt);

  // Collision with ground boundary
  if (state.position.y < 0.25) {
    state.position.y = 0.25;
    state.velocity.set(0, 0, 0);
    // Level out tilts on landing
    state.pitch = THREE.MathUtils.lerp(state.pitch, 0, 10 * dt);
    state.roll = THREE.MathUtils.lerp(state.roll, 0, 10 * dt);
  }

  // Update Three.js drone object
  drone1.position.copy(state.position);
  drone1.rotation.copy(orientationEuler);

  // Animate rotors spinning based on thrust and vertical speed
  const rotorSpeed = 25 + Math.abs(state.velocity.y) * 15 + (targetThrottleInput > 0 ? 15 : 0);
  animateRotors(drone1, rotorSpeed, dt);

  // Update UI Telemetry Data
  updateTelemetryUI(dt);
}

// --- 9. AI Patrol Paths (Drones 2 & 3) ---
function updateAiPatrols(time, dt) {
  const scaledTime = time * aiSpeedMultiplier;

  // --- Drone 2: Circular Orbit Path ---
  const d2Radius = 25;
  const d2Speed = 0.4;
  const d2Alt = 7.0;

  // Current circular coordinates
  const d2X = Math.cos(scaledTime * d2Speed) * d2Radius;
  const d2Z = Math.sin(scaledTime * d2Speed) * d2Radius;
  // Bobbing altitude effect
  const d2Y = d2Alt + Math.sin(scaledTime * 1.5) * 1.0;
  
  const d2Pos = new THREE.Vector3(d2X, d2Y, d2Z);

  // Compute direction to look at (tangent on the circle, looking ahead)
  const d2NextX = Math.cos((scaledTime + 0.05) * d2Speed) * d2Radius;
  const d2NextZ = Math.sin((scaledTime + 0.05) * d2Speed) * d2Radius;
  const d2NextY = d2Alt + Math.sin((scaledTime + 0.05) * 1.5) * 1.0;
  const d2Target = new THREE.Vector3(d2NextX, d2NextY, d2NextZ);

  // Tilt inwards (roll) during the turn
  const d2Forward = new THREE.Vector3().subVectors(d2Target, d2Pos).normalize();
  drone2.position.copy(d2Pos);
  drone2.lookAt(d2Target);
  // Add a slight banking tilt
  drone2.rotateZ(-0.25 * aiSpeedMultiplier);

  // Spin rotors
  animateRotors(drone2, 35, dt);

  // --- Drone 3: Figure-8 (Lemniscate of Bernoulli) Path ---
  const d3Speed = 0.3;
  const d3Scale = 28;
  const d3Alt = 11.0;

  // Lemniscate parametric equations:
  // x = a * cos(t) / (1 + sin^2(t))
  // z = a * sin(t)*cos(t) / (1 + sin^2(t))
  const getLemniscatePos = (t) => {
    const denom = 1 + Math.sin(t) * Math.sin(t);
    const x = (d3Scale * Math.cos(t)) / denom;
    const z = (d3Scale * Math.sin(t) * Math.cos(t)) / denom;
    const y = d3Alt + Math.cos(t * 2.0) * 1.8;
    return new THREE.Vector3(x, y, z);
  };

  const tVal = scaledTime * d3Speed;
  const d3Pos = getLemniscatePos(tVal);
  const d3Target = getLemniscatePos(tVal + 0.04); // Position shortly ahead

  drone3.position.copy(d3Pos);
  drone3.lookAt(d3Target);
  
  // Bank (tilt) into curves based on rate of yaw change (estimated by path curvature)
  const d3Heading = new THREE.Vector3().subVectors(d3Target, d3Pos).normalize();
  const bankFactor = Math.sin(tVal * 2) * 0.3; // Lean left and right matching figure-8 loops
  drone3.rotateZ(bankFactor * aiSpeedMultiplier);
  drone3.rotateX(0.05); // Subtle forward pitch

  // Spin rotors
  animateRotors(drone3, 35, dt);

  // --- Update Systems Tracker Positions ---
  elTrackD1.innerText = `${drone1State.position.x.toFixed(1)}, ${drone1State.position.y.toFixed(1)}, ${drone1State.position.z.toFixed(1)}`;
  elTrackD2.innerText = `${drone2.position.x.toFixed(1)}, ${drone2.position.y.toFixed(1)}, ${drone2.position.z.toFixed(1)}`;
  elTrackD3.innerText = `${drone3.position.x.toFixed(1)}, ${drone3.position.y.toFixed(1)}, ${drone3.position.z.toFixed(1)}`;
}

// --- 10. Rotate Rotor meshes helper ---
function animateRotors(droneMesh, speed, dt) {
  if (droneMesh.userData.rotors) {
    droneMesh.userData.rotors.forEach((rotor, idx) => {
      // Alternate direction of rotations (CW / CCW) for realism
      const direction = (idx % 2 === 0) ? 1 : -1;
      rotor.rotation.y += direction * speed * dt;
    });
  }
}

// --- 11. Camera System Update ---
function updateCamera() {
  if (cameraMode === 'orbit') {
    controls.update();
  } else if (cameraMode === 'chase') {
    // Position camera behind player drone in world space
    const relativeOffset = new THREE.Vector3(0, 3, -6.5);
    const cameraOffset = relativeOffset.applyEuler(drone1.rotation);
    const targetCameraPos = new THREE.Vector3()
      .copy(drone1.position)
      .add(cameraOffset);

    // Smooth camera follow (lerp)
    camera.position.lerp(targetCameraPos, 0.08);
    // Smoothly focus camera at a target point slightly above the drone
    const lookTarget = new THREE.Vector3().copy(drone1.position).add(new THREE.Vector3(0, 0.5, 0));
    camera.lookAt(lookTarget);
  } else if (cameraMode === 'fpv') {
    // Position camera inside cockpit at nose front
    const relativeOffset = new THREE.Vector3(0, 0.35, 0.55);
    const cameraOffset = relativeOffset.applyEuler(drone1.rotation);
    const targetCameraPos = new THREE.Vector3()
      .copy(drone1.position)
      .add(cameraOffset);

    camera.position.copy(targetCameraPos);

    // Look forward relative to drone direction
    const forwardDirection = new THREE.Vector3(0, 0, 1).applyEuler(drone1.rotation);
    const lookTarget = new THREE.Vector3().copy(camera.position).add(forwardDirection);
    camera.lookAt(lookTarget);
  }
}

// --- 12. UI Telemetry Refresher ---
function updateTelemetryUI(dt) {
  // Convert radians to degrees
  const radToDeg = (rad) => Math.round(THREE.MathUtils.radToDeg(rad));
  
  elAlt.innerText = drone1State.position.y.toFixed(2);
  
  // Speed is horizontal speed (X-Z planes)
  const speedHz = Math.sqrt(drone1State.velocity.x**2 + drone1State.velocity.z**2);
  elSpeed.innerText = speedHz.toFixed(2);

  // Pitch is inverted so pitching down/forward shows negative or positive based on pilot perspective
  elPitch.innerText = `${radToDeg(drone1State.pitch)}°`;
  elRoll.innerText = `${radToDeg(drone1State.roll)}°`;
  
  // Format Yaw to standard 0-360 compass degrees
  let yawDeg = radToDeg(drone1State.yaw) % 360;
  if (yawDeg < 0) yawDeg += 360;
  elYaw.innerText = `${yawDeg}°`;

  elX.innerText = drone1State.position.x.toFixed(1);
  elY.innerText = drone1State.position.y.toFixed(1);
  elZ.innerText = drone1State.position.z.toFixed(1);
}

// --- 13. Render Loop ---
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1); // Cap delta to prevent physics explosion on lag spikes
  const time = clock.getElapsedTime();

  // 1. Update Physics / Player flight
  updateDrone1Physics(dt);

  // 2. Update AI Patrolling loops
  updateAiPatrols(time, dt);

  // 3. Update Camera position
  updateCamera();

  // 4. Render Scene
  renderer.render(scene, camera);

  // FPS Counter calculation
  framesCount++;
  if (time - lastFpsUpdate > 1.0) {
    elFps.innerText = `${Math.round(framesCount / (time - lastFpsUpdate))} FPS`;
    framesCount = 0;
    lastFpsUpdate = time;
  }
}

// Start simulation on load
window.addEventListener('DOMContentLoaded', init);
