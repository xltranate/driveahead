const { Engine, Render, Runner, Bodies, Body, Composite, Constraint, Events, Vector } = Matter;

// --- CONFIGURATION ---
const CAT_DEFAULT = 0x0001;
const CAT_P1 = 0x0002; 
const CAT_P2 = 0x0004; 
const CAT_WALL = 0x0008;

const width = window.innerWidth;
const height = window.innerHeight;

let engine, render, runner;
let p1, p2; 
let scores = { p1: 0, p2: 0 };
let gameActive = false;
let roundStartTime = 0;
let waterLevel = 0;
let waterRising = false;

// Default Selections
let config = {
    p1Car: 'racer',
    p2Car: 'racer',
    map: 'stadium'
};

// --- UI SELECTION LOGIC (FIXED) ---

window.setCar = function(player, type, element) {
    if(player === 1) config.p1Car = type;
    else config.p2Car = type;
    
    // Update UI visuals
    const parentId = player === 1 ? 'p1-select' : 'p2-select';
    document.querySelectorAll(`#${parentId} .btn`).forEach(b => b.classList.remove('active'));
    
    // If the element was passed via 'this', highlight it
    if (element) {
        element.classList.add('active');
    } else {
        // Fallback search
        event.currentTarget.classList.add('active');
    }
};

window.setMap = function(type, element) {
    config.map = type;
    document.querySelectorAll('#map-select .btn').forEach(b => b.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    } else {
        event.currentTarget.classList.add('active');
    }
};

window.startGame = function() {
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-hud').style.display = 'block';
    
    engine = Engine.create();
    engine.world.gravity.y = 0.9; 

    render = Render.create({
        element: document.body,
        engine: engine,
        options: {
            width, height,
            wireframes: false,
            background: '#1a1a24'
        }
    });

    Events.on(render, 'afterRender', drawWater);
    Events.on(engine, 'collisionStart', handleCollisions);

    Render.run(render);
    runner = Runner.create();
    Runner.run(runner, engine);

    startRound();
    Events.on(engine, 'beforeUpdate', gameLoop);
};

// --- CORE GAME ENGINE ---

function startRound() {
    if (engine) {
        Composite.clear(engine.world);
        Engine.clear(engine);
    }
    
    gameActive = true;
    waterLevel = 0;
    waterRising = false;
    roundStartTime = Date.now();
    
    document.getElementById('sudden-death').style.display = 'none';
    document.getElementById('round-screen').style.display = 'none';

    createMap(config.map);
    
    // Spawn with some height to drop in
    p1 = createCar(width * 0.25, height * 0.4, config.p1Car, 1);
    p2 = createCar(width * 0.75, height * 0.4, config.p2Car, 2);
}

window.nextRound = function() {
    startRound();
};

// --- POLISHED VEHICLE MODELS ---

function createCar(x, y, type, playerID) {
    const isP1 = playerID === 1;
    const color = isP1 ? '#00f3ff' : '#ff0055'; 
    const group = Body.nextGroup(true);
    const category = isP1 ? CAT_P1 : CAT_P2;
    const mask = CAT_WALL | (isP1 ? CAT_P2 : CAT_P1); 

    let chassisParts = [];
    let wheelOffsets = [];
    let wheelSize = 22;
    let speed = 0.006;

    if (type === 'racer') {
        speed = 0.009;
        wheelSize = 20;
        wheelOffsets = [-50, 50];
        
        const base = Bodies.rectangle(x, y, 130, 15, { render: { fillStyle: color } });
        const nose = Bodies.trapezoid(x + 50, y + 2, 40, 10, 0.8, { angle: Math.PI/2, render: { fillStyle: color } });
        const spoilerV = Bodies.rectangle(x - 55, y - 15, 4, 30, { render: { fillStyle: '#fff' } });
        const spoilerH = Bodies.rectangle(x - 55, y - 30, 40, 4, { render: { fillStyle: '#fff' } });
        chassisParts = [base, nose, spoilerV, spoilerH];
    } 
    else if (type === 'truck') {
        speed = 0.005;
        wheelSize = 36;
        wheelOffsets = [-50, 50];
        const body = Bodies.rectangle(x, y - 10, 120, 45, { render: { fillStyle: color } });
        const hood = Bodies.rectangle(x + 40, y - 15, 40, 30, { render: { fillStyle: '#fff' } });
        const rollbar = Bodies.rectangle(x - 30, y - 40, 6, 40, { render: { fillStyle: '#666' } });
        chassisParts = [body, hood, rollbar];
    }
    else if (type === 'tank') {
        speed = 0.004;
        wheelSize = 24;
        wheelOffsets = [-45, 0, 45];
        const hull = Bodies.trapezoid(x, y, 140, 45, 0.3, { render: { fillStyle: '#4d5656' } });
        const turret = Bodies.circle(x, y - 30, 22, { render: { fillStyle: color } });
        const gun = Bodies.rectangle(x + 40, y - 30, 60, 10, { render: { fillStyle: '#222' } });
        chassisParts = [hull, turret, gun];
    }

    const chassis = Body.create({
        parts: chassisParts,
        collisionFilter: { group, category, mask },
        friction: 0.1
    });

    const head = Bodies.circle(x, y - 55, 14, {
        density: 0.0005,
        label: `head_${playerID}`,
        render: { fillStyle: '#ffeaa7', strokeStyle: '#000', lineWidth: 2 },
        collisionFilter: { group, category, mask }
    });

    const headMount = Constraint.create({
        bodyA: chassis, bodyB: head,
        pointA: { x: -10, y: -30 }, pointB: { x: 0, y: 0 },
        stiffness: 0.9, length: 0, render: { visible: false }
    });

    let wheels = [];
    let constraints = [];
    wheelOffsets.forEach(ox => {
        const w = Bodies.circle(x + ox, y + 20, wheelSize, {
            friction: 2, density: 0.05,
            collisionFilter: { group, category, mask },
            render: { fillStyle: '#111', strokeStyle: '#555', lineWidth: 4 }
        });
        const suspension = Constraint.create({
            bodyA: chassis, bodyB: w,
            pointA: { x: ox, y: 15 },
            stiffness: 0.4, damping: 0.3, length: 5,
            render: { visible: false }
        });
        wheels.push(w);
        constraints.push(suspension);
    });

    Composite.add(engine.world, [chassis, head, headMount, ...wheels, ...constraints]);
    return { body: chassis, wheels, speed, head, id: playerID };
}

// --- WORLD BUILDING ---

function createMap(type) {
    const wallStyle = { fillStyle: '#2d3436' };
    const walls = [
        Bodies.rectangle(width/2, height + 50, width, 100, { isStatic: true, render: wallStyle }), // Ground
        Bodies.rectangle(-50, height/2, 100, height*2, { isStatic: true, render: wallStyle }), // Walls
        Bodies.rectangle(width+50, height/2, 100, height*2, { isStatic: true, render: wallStyle })
    ];

    if (type === 'stadium') {
        walls.push(Bodies.rectangle(150, height-100, 400, 30, { isStatic: true, angle: 0.5, render: wallStyle }));
        walls.push(Bodies.rectangle(width-150, height-100, 400, 30, { isStatic: true, angle: -0.5, render: wallStyle }));
    } else if (type === 'seesaw') {
        const pivot = Bodies.rectangle(width/2, height-50, 40, 120, { isStatic: true, render: wallStyle });
        const plank = Bodies.rectangle(width/2, height-130, 800, 25, { render: { fillStyle: '#e67e22' }, density: 0.01 });
        const joint = Constraint.create({ bodyA: pivot, bodyB: plank, pointA: {x:0, y:-50}, stiffness: 1, length: 0 });
        Composite.add(engine.world, [pivot, plank, joint]);
    } else if (type === 'ufo') {
        walls.push(Bodies.rectangle(width/2, height-250, 400, 40, { isStatic: true, render: { fillStyle: '#8e44ad' } }));
        walls.push(Bodies.rectangle(width/2, height-500, 200, 20, { isStatic: true, render: { fillStyle: '#8e44ad' } }));
    }

    Composite.add(engine.world, walls);
}

// --- GAMEPLAY LOOP ---

const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

function gameLoop() {
    if (!gameActive) return;

    const elapsed = (Date.now() - roundStartTime) / 1000;
    if (elapsed > 12) {
        waterRising = true;
        document.getElementById('sudden-death').style.display = 'block';
    }
    if (waterRising) waterLevel += 1.0;

    // Movement
    if (keys['KeyD']) drive(p1, 1);
    if (keys['KeyA']) drive(p1, -1);
    if (keys['ArrowRight']) drive(p2, 1);
    if (keys['ArrowLeft']) drive(p2, -1);

    // Bounds
    if (p1.head.position.y > height - waterLevel) endRound(2);
    if (p2.head.position.y > height - waterLevel) endRound(1);
}

function drive(car, dir) {
    car.wheels.forEach(w => Body.setAngularVelocity(w, 0.5 * dir));
    Body.applyForce(car.body, car.body.position, { x: car.speed * dir, y: 0 });
}

function drawWater() {
    if (waterLevel <= 0) return;
    const ctx = render.context;
    ctx.fillStyle = 'rgba(0, 200, 255, 0.5)';
    ctx.fillRect(0, height - waterLevel, width, waterLevel);
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#fff";
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, height - waterLevel, width, 4);
    ctx.shadowBlur = 0;
}

function handleCollisions(event) {
    if (!gameActive) return;
    event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        checkHead(bodyA, bodyB);
        checkHead(bodyB, bodyA);
    });
}

function checkHead(head, other) {
    if (head.label && head.label.startsWith('head_')) {
        const victimID = parseInt(head.label.split('_')[1]);
        if (!other.label || !other.label.includes(`head_${victimID}`)) {
             // If head hits ground or enemy car parts
             if (!other.isSensor) endRound(victimID === 1 ? 2 : 1);
        }
    }
}

function endRound(winnerID) {
    if (!gameActive) return;
    gameActive = false;
    
    if (winnerID === 1) scores.p1++;
    else scores.p2++;
    
    document.getElementById('score-1').innerText = scores.p1;
    document.getElementById('score-2').innerText = scores.p2;

    const winText = document.getElementById('winner-text');
    winText.innerText = winnerID === 1 ? "PLAYER 1 WINS!" : "PLAYER 2 WINS!";
    winText.style.color = winnerID === 1 ? '#00f3ff' : '#ff0055';
    
    document.getElementById('round-screen').style.display = 'block';
}
