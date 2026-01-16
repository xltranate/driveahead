const { Engine, Render, Runner, Bodies, Body, Composite, Constraint, Events, Vector } = Matter;

// --- CONFIG ---
const width = window.innerWidth;
const height = window.innerHeight;

let engine, render, runner;
let p1, p2; 
let scores = { p1: 0, p2: 0 };
let gameActive = false;
let roundStartTime = 0;
let waterLevel = 0;
let waterRising = false;

// Global Config Object (Modified by UI)
window.config = {
    p1Car: 'racer',
    p2Car: 'racer',
    map: 'stadium'
};

// --- CORE GAME FUNCTIONS ---

window.startGame = function() {
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-hud').style.display = 'block';
    
    engine = Engine.create();
    engine.world.gravity.y = 1.2; // Heavier gravity so they don't float away

    render = Render.create({
        element: document.body,
        engine: engine,
        options: {
            width, height,
            wireframes: false,
            background: '#1a1a24'
        }
    });

    Render.run(render);
    runner = Runner.create();
    Runner.run(runner, engine);

    Events.on(render, 'afterRender', drawWater);
    Events.on(engine, 'collisionStart', handleCollisions);
    Events.on(engine, 'beforeUpdate', gameLoop);

    startRound();
};

function startRound() {
    Composite.clear(engine.world);
    
    gameActive = true;
    waterLevel = 0;
    waterRising = false;
    roundStartTime = Date.now();
    
    document.getElementById('sudden-death').style.display = 'none';
    document.getElementById('round-screen').style.display = 'none';

    createMap(window.config.map);
    
    // SPAWN POINTS: Lowered and centered so they don't fall off
    p1 = createCar(width * 0.3, height - 200, window.config.p1Car, 1);
    p2 = createCar(width * 0.7, height - 200, window.config.p2Car, 2);
}

window.nextRound = function() {
    startRound();
};

// --- IMPROVED VEHICLE MODELS ---

function createCar(x, y, type, playerID) {
    const isP1 = playerID === 1;
    const color = isP1 ? '#00f3ff' : '#ff0055'; 
    const group = Body.nextGroup(true);

    let chassisParts = [];
    let wheelSize = 25;
    let speed = 0.007;

    // Design the bodies
    if (type === 'racer') {
        const base = Bodies.rectangle(x, y, 120, 20, { render: { fillStyle: color } });
        const wing = Bodies.rectangle(x - 50, y - 20, 10, 40, { render: { fillStyle: '#fff' } });
        chassisParts = [base, wing];
        wheelSize = 22;
    } else if (type === 'truck') {
        const base = Bodies.rectangle(x, y, 110, 40, { render: { fillStyle: color } });
        const cab = Bodies.rectangle(x + 20, y - 30, 50, 40, { render: { fillStyle: color } });
        chassisParts = [base, cab];
        wheelSize = 32;
    } else {
        const base = Bodies.trapezoid(x, y, 130, 40, 0.4, { render: { fillStyle: color } });
        chassisParts = [base];
        wheelSize = 25;
    }

    const chassis = Body.create({
        parts: chassisParts,
        collisionFilter: { group },
        friction: 0.1,
        restitution: 0.2 // Slight bounce
    });

    const head = Bodies.circle(x, y - 50, 15, {
        label: `head_${playerID}`,
        collisionFilter: { group },
        render: { fillStyle: '#ffeaa7' }
    });

    const headMount = Constraint.create({
        bodyA: chassis, bodyB: head,
        pointA: { x: 0, y: -25 },
        stiffness: 1, length: 0, render: { visible: false }
    });

    // Wheels
    const w1 = Bodies.circle(x - 40, y + 25, wheelSize, { 
        collisionFilter: { group }, friction: 1, density: 0.05,
        render: { fillStyle: '#111' }
    });
    const w2 = Bodies.circle(x + 40, y + 25, wheelSize, { 
        collisionFilter: { group }, friction: 1, density: 0.05,
        render: { fillStyle: '#111' }
    });

    const s1 = Constraint.create({ bodyA: chassis, bodyB: w1, pointA: {x:-40, y:15}, stiffness: 0.5, length: 5, render: {visible: false} });
    const s2 = Constraint.create({ bodyA: chassis, bodyB: w2, pointA: {x: 40, y:15}, stiffness: 0.5, length: 5, render: {visible: false} });

    Composite.add(engine.world, [chassis, head, headMount, w1, w2, s1, s2]);
    return { body: chassis, wheels: [w1, w2], speed, head };
}

// --- BULLETPROOF MAPS ---

function createMap(type) {
    const wallOpts = { isStatic: true, render: { fillStyle: '#2d3436' } };
    
    // 1. MAIN FLOOR (Always exists to stop them from falling off)
    Composite.add(engine.world, [
        Bodies.rectangle(width/2, height - 20, width, 60, wallOpts), // Ground
        Bodies.rectangle(-20, height/2, 60, height, wallOpts),      // Left wall
        Bodies.rectangle(width+20, height/2, 60, height, wallOpts)   // Right wall
    ]);

    if (type === 'stadium') {
        // High ramps on sides
        Composite.add(engine.world, [
            Bodies.rectangle(150, height - 120, 400, 40, { isStatic: true, angle: 0.6, render: { fillStyle: '#444' } }),
            Bodies.rectangle(width - 150, height - 120, 400, 40, { isStatic: true, angle: -0.6, render: { fillStyle: '#444' } })
        ]);
    } else if (type === 'seesaw') {
        const pivot = Bodies.rectangle(width/2, height-60, 50, 100, wallOpts);
        const plank = Bodies.rectangle(width/2, height-150, 800, 30, { density: 0.1, render: { fillStyle: '#e67e22' } });
        const joint = Constraint.create({ bodyA: pivot, bodyB: plank, pointA: {x:0, y:-40}, stiffness: 1 });
        Composite.add(engine.world, [pivot, plank, joint]);
    } else if (type === 'ufo') {
        Composite.add(engine.world, [
            Bodies.rectangle(width/2, height-250, 500, 40, { isStatic: true, render: { fillStyle: '#8e44ad' } }),
            Bodies.rectangle(width/2, height-500, 300, 40, { isStatic: true, render: { fillStyle: '#8e44ad' } })
        ]);
    }
}

// --- LOOP & INPUT ---

const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

function gameLoop() {
    if (!gameActive) return;

    // Sudden Death
    if (Date.now() - roundStartTime > 10000) {
        waterRising = true;
        document.getElementById('sudden-death').style.display = 'block';
    }
    if (waterRising) waterLevel += 1.2;

    // P1 (A/D)
    if (keys['KeyD']) drive(p1, 1);
    if (keys['KeyA']) drive(p1, -1);
    
    // P2 (Arrows)
    if (keys['ArrowRight']) drive(p2, 1);
    if (keys['ArrowLeft']) drive(p2, -1);

    // Death Check
    if (p1.head.position.y > height - waterLevel) endRound(2);
    if (p2.head.position.y > height - waterLevel) endRound(1);
}

function drive(car, dir) {
    car.wheels.forEach(w => Body.setAngularVelocity(w, 0.4 * dir));
    Body.applyForce(car.body, car.body.position, { x: car.speed * dir, y: 0 });
}

function drawWater() {
    if (waterLevel <= 0) return;
    const ctx = render.context;
    ctx.fillStyle = 'rgba(0, 180, 255, 0.5)';
    ctx.fillRect(0, height - waterLevel, width, waterLevel);
}

function handleCollisions(event) {
    if (!gameActive) return;
    event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        checkHead(bodyA, bodyB);
        checkHead(bodyB, bodyA);
    });
}

function checkHead(h, o) {
    if (h.label && h.label.startsWith('head_')) {
        const id = parseInt(h.label.split('_')[1]);
        if (o.isStatic || (o.label && !o.label.includes(id))) {
            endRound(id === 1 ? 2 : 1);
        }
    }
}

function endRound(winner) {
    if (!gameActive) return;
    gameActive = false;
    winner === 1 ? scores.p1++ : scores.p2++;
    document.getElementById('score-1').innerText = scores.p1;
    document.getElementById('score-2').innerText = scores.p2;
    document.getElementById('winner-text').innerText = `PLAYER ${winner} WINS!`;
    document.getElementById('round-screen').style.display = 'block';
}
