// MODULE ALIASES (Shortcuts for Matter.js)
const Engine = Matter.Engine,
      Render = Matter.Render,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Body = Matter.Body,
      Composite = Matter.Composite,
      Constraint = Matter.Constraint,
      Events = Matter.Events,
      Vector = Matter.Vector;

// GAME STATE
let engine, render, runner;
let playerCar;
let gameRunning = false;
let startTime = 0;
let waterLevel = 0;
let bladeBody = null;
let selectedCarType = 'buggy';
let selectedMapType = 'bowl';

// CONFIGURATION
const width = window.innerWidth;
const height = window.innerHeight;
const CATEGORY_CAR = 0x0001;
const CATEGORY_TERRAIN = 0x0002;
const CATEGORY_HAZARD = 0x0004;

// --- SETUP & UTILS ---

function selectCar(type) {
    selectedCarType = type;
    document.querySelectorAll('#car-select .btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}

function selectMap(type) {
    selectedMapType = type;
    document.querySelectorAll('#map-select .btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}

function initGame() {
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-hud').style.display = 'block';
    
    // 1. Setup Engine
    engine = Engine.create();
    engine.world.gravity.y = 1; // Standard gravity

    // 2. Setup Renderer
    render = Render.create({
        element: document.body,
        engine: engine,
        options: {
            width: width,
            height: height,
            wireframes: false, // Set to false for solid colors
            background: '#1a1a1a'
        }
    });

    // 3. Create World
    createMap(selectedMapType);
    playerCar = createCar(width / 2, height / 2 - 100, selectedCarType);
    
    // 4. Run
    Render.run(render);
    runner = Runner.create();
    Runner.run(runner, engine);
    
    gameRunning = true;
    startTime = Date.now();
    
    // 5. Game Loop (Logic that Matter.js doesn't handle)
    Events.on(engine, 'beforeUpdate', gameLoop);
    
    // 6. Collision Detection (Head hits ground)
    Events.on(engine, 'collisionStart', handleCollisions);
}

// --- CAR FACTORY ---
// Builds complex cars using constraints (springs) for suspension
function createCar(x, y, type) {
    const group = Body.nextGroup(true);
    let chassis, w1, w2;
    let speed = 0.05;

    // Car Specs
    const specs = {
        buggy: { w: 140, h: 30, color: '#00ffcc', wheelSize: 25, speed: 0.004 },
        tank:  { w: 160, h: 50, color: '#556655', wheelSize: 35, speed: 0.002 },
        dragster: { w: 160, h: 20, color: '#ff0055', wheelSize: 30, speed: 0.006 }
    };
    const s = specs[type];

    // Chassis (The Body)
    chassis = Bodies.rectangle(x, y, s.w, s.h, { 
        collisionFilter: { group: group },
        density: 0.002,
        render: { fillStyle: s.color }
    });

    // The "Head" (Vulnerable Point) - Fixed on top of chassis
    const head = Bodies.circle(x, y - s.h, 15, {
        collisionFilter: { group: group },
        density: 0.001,
        render: { fillStyle: '#ffffff' },
        label: 'head'
    });
    
    // Wheels
    w1 = Bodies.circle(x - s.w/2 + 10, y + s.h, s.wheelSize, { 
        collisionFilter: { group: group },
        friction: 0.9, // High friction for grip
        density: 0.01,
        render: { fillStyle: '#222', strokeStyle: '#555', lineWidth: 3 }
    });
    
    w2 = Bodies.circle(x + s.w/2 - 10, y + s.h, s.wheelSize, { 
        collisionFilter: { group: group },
        friction: 0.9,
        density: 0.01,
        render: { fillStyle: '#222', strokeStyle: '#555', lineWidth: 3 }
    });

    // Suspension (Constraints connecting wheels to body)
    const axelA = Constraint.create({
        bodyA: chassis, pointA: { x: -s.w/2 + 10, y: s.h/2 },
        bodyB: w1, pointB: { x: 0, y: 0 },
        stiffness: 0.2, damping: 0.1, length: s.wheelSize + 5
    });

    const axelB = Constraint.create({
        bodyA: chassis, pointA: { x: s.w/2 - 10, y: s.h/2 },
        bodyB: w2, pointB: { x: 0, y: 0 },
        stiffness: 0.2, damping: 0.1, length: s.wheelSize + 5
    });

    // Attach Head to Body rigidly
    const headMount = Constraint.create({
        bodyA: chassis, pointA: { x: -10, y: -s.h/2 - 5 },
        bodyB: head, pointB: { x: 0, y: 0 },
        stiffness: 1, length: 0
    });

    Composite.add(engine.world, [chassis, head, w1, w2, axelA, axelB, headMount]);

    return { body: chassis, w1: w1, w2: w2, speed: s.speed };
}

// --- MAP FACTORY ---
function createMap(type) {
    const wallOpts = { isStatic: true, render: { fillStyle: '#444' } };
    const walls = [
        Bodies.rectangle(width/2, height + 50, width, 100, wallOpts), // Floor
        Bodies.rectangle(-50, height/2, 100, height, wallOpts), // Left Wall
        Bodies.rectangle(width + 50, height/2, 100, height, wallOpts) // Right Wall
    ];

    if (type === 'bowl') {
        walls.push(Bodies.rectangle(100, height - 100, 400, 20, { isStatic: true, angle: 0.5, render: {fillStyle:'#666'} }));
        walls.push(Bodies.rectangle(width - 100, height - 100, 400, 20, { isStatic: true, angle: -0.5, render: {fillStyle:'#666'} }));
    } else if (type === 'ramps') {
        walls.push(Bodies.rectangle(width/2, height - 200, 200, 20, wallOpts));
        walls.push(Bodies.rectangle(200, height - 100, 200, 20, {isStatic:true, angle: -0.3, render:{fillStyle:'#666'}}));
    }

    Composite.add(engine.world, walls);
}

// --- HAZARDS ---
function spawnBlade() {
    if (bladeBody) return;
    
    bladeBody = Bodies.rectangle(width/2, -200, 600, 40, {
        isStatic: false, // Can move but we control velocity manually
        isSensor: true, // Passes through but detects collision? No, we want it to crush.
        mass: 10000,
        render: { fillStyle: '#ff0000' },
        label: 'blade'
    });
    // Another cross piece for the blade
    const bladeCross = Bodies.rectangle(width/2, -200, 40, 600, {
        render: { fillStyle: '#ff0000' }
    });
    
    // Combine into one body? For simplicity, just one bar spinning
    Composite.add(engine.world, bladeBody);
    
    document.getElementById('hazard-warning').style.opacity = 1;
}

// --- GAME LOOP ---
function gameLoop() {
    if (!gameRunning) return;

    // 1. Controls (Apply Force)
    // Left/Right arrows or A/D
    const keys = keysDown;
    if (keys['ArrowRight'] || keys['KeyD']) {
        Body.setAngularVelocity(playerCar.w1, 0.4);
        Body.setAngularVelocity(playerCar.w2, 0.4);
        // Add slight forward force to chassis for air control
        Body.applyForce(playerCar.body, playerCar.body.position, { x: playerCar.speed, y: 0 });
    }
    if (keys['ArrowLeft'] || keys['KeyA']) {
        Body.setAngularVelocity(playerCar.w1, -0.4);
        Body.setAngularVelocity(playerCar.w2, -0.4);
        Body.applyForce(playerCar.body, playerCar.body.position, { x: -playerCar.speed, y: 0 });
    }

    // 2. Rising Water Logic
    const timeAlive = (Date.now() - startTime) / 1000;
    document.getElementById('timer').innerText = `Time: ${timeAlive.toFixed(1)}s`;

    // Render Water Overlay
    waterLevel += 0.2; // Pixels per frame
    const ctx = render.context;
    ctx.fillStyle = 'rgba(0, 150, 255, 0.4)';
    ctx.fillRect(0, height - waterLevel, width, waterLevel);
    
    // Water Death Check
    if (playerCar.body.position.y > height - waterLevel) {
        endGame("Drowned!");
    }

    // 3. Blade Logic (Spawns after 10 seconds)
    if (timeAlive > 10 && !bladeBody) {
        spawnBlade();
    }
    if (bladeBody) {
        Body.setPosition(bladeBody, { x: width/2, y: bladeBody.position.y + 1 });
        Body.setAngularVelocity(bladeBody, 0.1);
        // Blade collision check
        if (Matter.Collision.collides(playerCar.body, bladeBody) != null) {
            // physics will handle crush, but we can force kill
        }
    }
}

// --- INPUT HANDLING ---
const keysDown = {};
window.addEventListener('keydown', e => keysDown[e.code] = true);
window.addEventListener('keyup', e => keysDown[e.code] = false);

// --- COLLISION LOGIC ---
function handleCollisions(event) {
    const pairs = event.pairs;
    
    for (let i = 0; i < pairs.length; i++) {
        const bodyA = pairs[i].bodyA;
        const bodyB = pairs[i].bodyB;

        // Check if 'head' touched anything that isn't its own car parts
        // Note: In a complex setup, we'd use collisionFilters, but simple label check works for now
        if (bodyA.label === 'head' || bodyB.label === 'head') {
            const other = (bodyA.label === 'head') ? bodyB : bodyA;
            
            // If head touches ground, blade, or walls (but not own car parts if filtered correctly)
            // For this demo, assuming other parts are safe via group filter, except ground/blade
            if (!other.isSensor) {
                endGame("Head Trauma!");
            }
        }
    }
}

function endGame(reason) {
    gameRunning = false;
    Runner.stop(runner);
    document.getElementById('game-hud').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'block';
    document.getElementById('go-reason').innerText = reason;
    document.getElementById('go-title').innerText = "WASTED";
}
