const { Engine, Render, Runner, Bodies, Body, Composite, Constraint, Events, Vector } = Matter;

// --- CONFIGURATION ---
const CAT_DEFAULT = 0x0001;
const CAT_P1 = 0x0002; // Player 1 parts
const CAT_P2 = 0x0004; // Player 2 parts
const CAT_WALL = 0x0008;

const width = window.innerWidth;
const height = window.innerHeight;

let engine, render, runner;
let p1, p2; // Car objects
let scores = { p1: 0, p2: 0 };
let gameActive = false;
let roundStartTime = 0;
let waterLevel = 0;
let waterRising = false;

let config = {
    p1Car: 'racer',
    p2Car: 'racer',
    map: 'stadium'
};

// --- INITIALIZATION ---

function setCar(player, type) {
    if(player === 1) config.p1Car = type;
    else config.p2Car = type;
    
    // UI Update
    const parent = player === 1 ? '#p1-select' : '#p2-select';
    document.querySelectorAll(`${parent} .btn`).forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}

function setMap(type) {
    config.map = type;
    document.querySelectorAll('#map-select .btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}

function startGame() {
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-hud').style.display = 'block';
    
    // Setup Engine
    engine = Engine.create();
    engine.world.gravity.y = 0.9; // Arcade gravity

    render = Render.create({
        element: document.body,
        engine: engine,
        options: {
            width, height,
            wireframes: false,
            background: '#1a1a24'
        }
    });

    // Custom Render Loop for Water
    Events.on(render, 'afterRender', drawWater);

    // Collision Event
    Events.on(engine, 'collisionStart', handle collisions);

    // Run
    Render.run(render);
    runner = Runner.create();
    Runner.run(runner, engine);

    startRound();
    
    // Input Loop
    Events.on(engine, 'beforeUpdate', gameLoop);
}

function startRound() {
    Composite.clear(engine.world);
    Engine.clear(engine);
    
    gameActive = true;
    waterLevel = 0;
    waterRising = false;
    roundStartTime = Date.now();
    document.getElementById('sudden-death').style.display = 'none';
    document.getElementById('round-screen').style.display = 'none';

    createMap(config.map);
    
    // Spawn Players (Left and Right sides)
    p1 = createCar(width * 0.2, height * 0.5, config.p1Car, 1);
    p2 = createCar(width * 0.8, height * 0.5, config.p2Car, 2);
}

function nextRound() {
    startRound();
}

// --- CAR FACTORY (POLISHED MODELS) ---

function createCar(x, y, type, playerID) {
    const isP1 = playerID === 1;
    const color = isP1 ? '#00f3ff' : '#ff0055'; // Cyan vs Pink
    const group = Body.nextGroup(true); // Self-collision ignore
    const category = isP1 ? CAT_P1 : CAT_P2;
    const mask = CAT_WALL | (isP1 ? CAT_P2 : CAT_P1); // Collide with walls and ENEMY

    let chassisParts = [];
    let wheelOffsets = [];
    let wheelSize = 20;
    let speed = 0.005;

    // --- MODEL DESIGN ---
    if (type === 'racer') {
        // F1 Style
        speed = 0.008;
        wheelSize = 22;
        wheelOffsets = [-50, 50];
        
        const base = Bodies.rectangle(x, y, 140, 20, { render: { fillStyle: color } });
        const cockpit = Bodies.trapezoid(x - 10, y - 20, 50, 30, 0.4, { render: { fillStyle: '#333' } });
        const spoilerV = Bodies.rectangle(x - 60, y - 20, 5, 30, { render: { fillStyle: '#fff' } });
        const spoilerH = Bodies.rectangle(x - 60, y - 35, 40, 5, { render: { fillStyle: '#fff' } });
        const nose = Bodies.polygon(x + 70, y + 5, 3, 15, { angle: Math.PI/2, render: { fillStyle: color } });
        
        chassisParts = [base, cockpit, spoilerV, spoilerH, nose];
    } 
    else if (type === 'truck') {
        // Monster Truck
        speed = 0.005;
        wheelSize = 35;
        wheelOffsets = [-55, 55];

        const base = Bodies.rectangle(x, y, 130, 30, { render: { fillStyle: '#444' } });
        const body = Bodies.rectangle(x - 10, y - 25, 140, 40, { render: { fillStyle: color } });
        const roof = Bodies.trapezoid(x - 15, y - 55, 90, 30, 0.3, { render: { fillStyle: color } });
        const rollbar = Bodies.rectangle(x + 40, y - 50, 10, 50, { render: { fillStyle: '#999' } });
        
        chassisParts = [base, body, roof, rollbar];
    }
    else if (type === 'tank') {
        // Tank
        speed = 0.004;
        wheelSize = 24;
        wheelOffsets = [-40, 0, 40]; // 3 Wheels!

        const hull = Bodies.trapezoid(x, y, 140, 50, 0.2, { render: { fillStyle: '#556' } });
        const turret = Bodies.circle(x, y - 35, 25, { render: { fillStyle: color } });
        const barrel = Bodies.rectangle(x + 50, y - 35, 70, 12, { render: { fillStyle: '#888' } });
        
        chassisParts = [hull, turret, barrel];
    }

    // 1. Create Chassis
    const chassis = Body.create({
        parts: chassisParts,
        collisionFilter: { group, category, mask }
    });

    // 2. Create Head (The Weak Point)
    // Attached rigidly to the center-top of the car
    const head = Bodies.circle(x, y - 50, 14, {
        density: 0.001,
        label: `head_${playerID}`,
        render: { fillStyle: '#ffeaa7', strokeStyle: '#000', lineWidth: 2 },
        collisionFilter: { group, category, mask }
    });

    const headMount = Constraint.create({
        bodyA: chassis, bodyB: head,
        pointA: { x: -10, y: -40 }, pointB: { x: 0, y: 0 },
        stiffness: 1, length: 0, render: { visible: false }
    });

    // 3. Create Wheels & Suspension
    let wheels = [];
    let constraints = [];

    wheelOffsets.forEach(offsetX => {
        const w = Bodies.circle(x + offsetX, y + 20, wheelSize, {
            friction: 1, density: 0.02,
            collisionFilter: { group, category, mask },
            render: { fillStyle: '#111', strokeStyle: '#555', lineWidth: 3 }
        });
        
        const shock = Constraint.create({
            bodyA: chassis, bodyB: w,
            pointA: { x: offsetX, y: 10 }, pointB: { x: 0, y: 0 },
            stiffness: 0.4, damping: 0.2, length: 0,
            render: { visible: false }
        });

        wheels.push(w);
        constraints.push(shock);
    });

    Composite.add(engine.world, [chassis, head, headMount, ...wheels, ...constraints]);

    return { body: chassis, wheels, speed, head };
}

// --- MAP BUILDER ---

function createMap(type) {
    const wallStyle = { fillStyle: '#2d3436' };
    const walls = [];

    // Boundaries
    walls.push(Bodies.rectangle(width/2, height + 60, width, 120, { isStatic: true, render: wallStyle, label: 'ground' })); // Floor
    walls.push(Bodies.rectangle(-60, height/2, 120, height*3, { isStatic: true, render: wallStyle })); // Left
    walls.push(Bodies.rectangle(width+60, height/2, 120, height*3, { isStatic: true, render: wallStyle })); // Right
    walls.push(Bodies.rectangle(width/2, -500, width, 100, { isStatic: true })); // Ceiling

    if (type === 'stadium') {
        // Classic U-Shape
        walls.push(Bodies.rectangle(100, height-100, 400, 30, { isStatic: true, angle: 0.4, render: wallStyle }));
        walls.push(Bodies.rectangle(width-100, height-100, 400, 30, { isStatic: true, angle: -0.4, render: wallStyle }));
    }
    else if (type === 'seesaw') {
        // Center Pivot
        const pivot = Bodies.rectangle(width/2, height-50, 20, 100, { isStatic: true, render: { fillStyle: '#7f8c8d' } });
        const plank = Bodies.rectangle(width/2, height-150, 700, 20, { 
            render: { fillStyle: '#e67e22' }, density: 0.005 
        });
        const joint = Constraint.create({
            bodyA: pivot, bodyB: plank,
            pointA: { x: 0, y: -50 }, pointB: { x: 0, y: 0 },
            stiffness: 1, length: 0, render: { visible: false }
        });
        Composite.add(engine.world, [pivot, plank, joint]);
    }
    else if (type === 'ufo') {
        // Floating platforms
        walls.push(Bodies.rectangle(width/2, height-250, 300, 40, { isStatic: true, render: { fillStyle: '#8e44ad' } }));
        walls.push(Bodies.rectangle(150, height-400, 200, 20, { isStatic: true, render: { fillStyle: '#9b59b6' } }));
        walls.push(Bodies.rectangle(width-150, height-400, 200, 20, { isStatic: true, render: { fillStyle: '#9b59b6' } }));
    }

    Composite.add(engine.world, walls);
}

// --- GAME LOGIC ---

const keys = {};
window.onkeydown = e => keys[e.code] = true;
window.onkeyup = e => keys[e.code] = false;

function gameLoop() {
    if (!gameActive) return;

    // --- SUDDEN DEATH ---
    if (!waterRising && (Date.now() - roundStartTime > 15000)) { // 15 seconds
        waterRising = true;
        document.getElementById('sudden-death').style.display = 'block';
    }
    if (waterRising) waterLevel += 0.8;

    // --- CONTROLS ---
    
    // Player 1 (A/D)
    if (keys['KeyD']) applyDrive(p1, 1);
    if (keys['KeyA']) applyDrive(p1, -1);

    // Player 2 (Arrows)
    if (keys['ArrowRight']) applyDrive(p2, 1);
    if (keys['ArrowLeft']) applyDrive(p2, -1);

    // Water Death Check
    if (p1.head.position.y > height - waterLevel) endRound(2, "DROWNED");
    if (p2.head.position.y > height - waterLevel) endRound(1, "DROWNED");
}

function applyDrive(car, dir) {
    const force = car.speed * dir;
    // Apply angular velocity to wheels for grip
    car.wheels.forEach(w => Body.setAngularVelocity(w, 0.4 * dir));
    // Apply vector force to body for air control
    Body.applyForce(car.body, car.body.position, { x: force, y: 0 });
}

function drawWater() {
    if (waterLevel <= 0) return;
    const ctx = render.context;
    ctx.fillStyle = 'rgba(0, 150, 255, 0.6)';
    ctx.fillRect(0, height - waterLevel, width, waterLevel);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, height - waterLevel, width, 5); // Foam line
}

function handlecollisions(event) {
    if (!gameActive) return;

    event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        const labelA = bodyA.label || '';
        const labelB = bodyB.label || '';

        // Check Heads
        if (labelA.includes('head_')) checkHeadHit(labelA, bodyB);
        if (labelB.includes('head_')) checkHeadHit(labelB, bodyA);
    });
}

function checkHeadHit(headLabel, otherBody) {
    // Extract player ID from label "head_1" or "head_2"
    const victimID = parseInt(headLabel.split('_')[1]);
    const killerID = victimID === 1 ? 2 : 1;

    // Ignore collisions with own car parts (filtered by masks usually, but safe check)
    // Ignore sensors
    if (otherBody.isSensor) return;

    // In DA, touching the ground with your head kills you too
    endRound(killerID, "CRUSHED");
}

function endRound(winnerID, reason) {
    if (!gameActive) return;
    gameActive = false;

    // Update Score
    if (winnerID === 1) scores.p1++;
    else scores.p2++;
    
    document.getElementById('score-1').innerText = scores.p1;
    document.getElementById('score-2').innerText = scores.p2;

    // Show Screen
    const color = winnerID === 1 ? 'var(--p1-color)' : 'var(--p2-color)';
    const name = winnerID === 1 ? 'BLUE' : 'RED';
    
    const title = document.getElementById('winner-text');
    title.innerText = `${name} WINS`;
    title.style.color = color;
    
    document.getElementById('round-screen').style.display = 'block';
}
