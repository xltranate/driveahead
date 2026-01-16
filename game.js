const { Engine, Render, Runner, Bodies, Body, Composite, Constraint, Events, Vector } = Matter;

const width = window.innerWidth;
const height = window.innerHeight;

let engine, render, runner;
let p1, p2; 
let scores = { p1: 0, p2: 0 };
let gameActive = false;
let roundStartTime = 0;
let waterLevel = 0;
let waterRising = false;

window.config = { p1Car: 'racer', p2Car: 'racer', map: 'stadium' };

window.startGame = function() {
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-hud').style.display = 'block';
    
    engine = Engine.create();
    engine.world.gravity.y = 1.2;

    render = Render.create({
        element: document.body,
        engine: engine,
        options: { width, height, wireframes: false, background: '#111' }
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
    
    // Spawning players well within the map boundaries
    p1 = createCar(width * 0.2, height - 150, window.config.p1Car, 1);
    p2 = createCar(width * 0.8, height - 150, window.config.p2Car, 2);
}

window.nextRound = () => startRound();

// --- CARS WITH EXPLOSION CAPABILITY ---

function createCar(x, y, type, playerID) {
    const isP1 = playerID === 1;
    const color = isP1 ? '#00f3ff' : '#ff0055'; 
    const group = Body.nextGroup(true);

    let chassisParts = [];
    let wheelSize = 25;
    let speed = 0.008;

    if (type === 'racer') {
        chassisParts = [Bodies.rectangle(x, y, 120, 20, { render: { fillStyle: color } })];
        wheelSize = 22;
    } else if (type === 'truck') {
        chassisParts = [Bodies.rectangle(x, y, 110, 45, { render: { fillStyle: color } })];
        wheelSize = 34;
    } else {
        chassisParts = [Bodies.trapezoid(x, y, 130, 40, 0.4, { render: { fillStyle: color } })];
    }

    const chassis = Body.create({ parts: chassisParts, collisionFilter: { group }, friction: 0.1 });
    const head = Bodies.circle(x, y - 45, 15, { label: `head_${playerID}`, collisionFilter: { group }, render: { fillStyle: '#ffeaa7' } });
    const headMount = Constraint.create({ bodyA: chassis, bodyB: head, pointA: { x: 0, y: -20 }, stiffness: 0.8, length: 0, render: { visible: false } });

    const w1 = Bodies.circle(x - 40, y + 25, wheelSize, { collisionFilter: { group }, friction: 1, render: { fillStyle: '#222' } });
    const w2 = Bodies.circle(x + 40, y + 25, wheelSize, { collisionFilter: { group }, friction: 1, render: { fillStyle: '#222' } });

    const s1 = Constraint.create({ bodyA: chassis, bodyB: w1, pointA: {x:-40, y:10}, stiffness: 0.4, length: 10, render: {visible: false} });
    const s2 = Constraint.create({ bodyA: chassis, bodyB: w2, pointA: {x: 40, y:10}, stiffness: 0.4, length: 10, render: {visible: false} });

    Composite.add(engine.world, [chassis, head, headMount, w1, w2, s1, s2]);
    return { chassis, wheels: [w1, w2], speed, head, color };
}

function explode(car) {
    const pos = car.chassis.position;
    // Remove original car
    Composite.remove(engine.world, [car.chassis, car.head, ...car.wheels]);

    // Create 15 flying shards
    for (let i = 0; i < 15; i++) {
        const shard = Bodies.polygon(pos.x, pos.y, Math.floor(Math.random() * 3) + 3, Math.random() * 15 + 5, {
            render: { fillStyle: car.color },
            frictionAir: 0.02
        });
        Body.setVelocity(shard, { x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 20 });
        Body.setAngularVelocity(shard, Math.random() * 0.5);
        Composite.add(engine.world, shard);
    }
}

// --- EXTENDED MAPS ---

function createMap(type) {
    const wallOpts = { isStatic: true, render: { fillStyle: '#333' } };
    
    // Giant Safety Floor and Walls
    Composite.add(engine.world, [
        Bodies.rectangle(width/2, height + 40, width * 2, 100, wallOpts),
        Bodies.rectangle(-40, height/2, 100, height * 2, wallOpts),
        Bodies.rectangle(width + 40, height/2, 100, height * 2, wallOpts)
    ]);

    if (type === 'stadium') {
        Composite.add(engine.world, [
            Bodies.rectangle(width * 0.2, height - 100, width * 0.4, 40, { isStatic: true, angle: 0.2, render: { fillStyle: '#444' } }),
            Bodies.rectangle(width * 0.8, height - 100, width * 0.4, 40, { isStatic: true, angle: -0.2, render: { fillStyle: '#444' } })
        ]);
    } else if (type === 'seesaw') {
        const plank = Bodies.rectangle(width/2, height - 150, width * 0.7, 30, { render: { fillStyle: '#d35400' } });
        const pivot = Bodies.rectangle(width/2, height - 50, 60, 150, wallOpts);
        Composite.add(engine.world, [pivot, plank, Constraint.create({ bodyA: pivot, bodyB: plank, pointA: {x:0, y:-60}, stiffness: 1 })]);
    } else if (type === 'ufo') {
        Composite.add(engine.world, [
            Bodies.rectangle(width/2, height - 300, 600, 40, { isStatic: true, render: { fillStyle: '#8e44ad' } }),
            Bodies.rectangle(width * 0.2, height - 450, 300, 30, { isStatic: true, render: { fillStyle: '#9b59b6' } }),
            Bodies.rectangle(width * 0.8, height - 450, 300, 30, { isStatic: true, render: { fillStyle: '#9b59b6' } })
        ]);
    }
}

// --- GAME LOOP ---

const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

function gameLoop() {
    if (!gameActive) return;

    if (Date.now() - roundStartTime > 15000) {
        waterRising = true;
        document.getElementById('sudden-death').style.display = 'block';
    }
    if (waterRising) waterLevel += 1.5;

    if (keys['KeyD']) drive(p1, 1);
    if (keys['KeyA']) drive(p1, -1);
    if (keys['ArrowRight']) drive(p2, 1);
    if (keys['ArrowLeft']) drive(p2, -1);

    if (p1.head.position.y > height - waterLevel) endRound(2);
    if (p2.head.position.y > height - waterLevel) endRound(1);
}

function drive(car, dir) {
    car.wheels.forEach(w => Body.setAngularVelocity(w, 0.5 * dir));
    Body.applyForce(car.chassis, car.chassis.position, { x: car.speed * dir, y: 0 });
}

function drawWater() {
    if (waterLevel <= 0) return;
    const ctx = render.context;
    ctx.fillStyle = 'rgba(0, 200, 255, 0.5)';
    ctx.fillRect(0, height - waterLevel, width, waterLevel);
}

function handleCollisions(event) {
    if (!gameActive) return;
    event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        const check = (h, o) => {
            if (h.label && h.label.startsWith('head_')) {
                const id = parseInt(h.label.split('_')[1]);
                if (o.isStatic || (o.label && !o.label.includes(id))) endRound(id === 1 ? 2 : 1);
            }
        };
        check(bodyA, bodyB); check(bodyB, bodyA);
    });
}

function endRound(winner) {
    if (!gameActive) return;
    gameActive = false;
    
    // Explode the loser
    explode(winner === 1 ? p2 : p1);

    winner === 1 ? scores.p1++ : scores.p2++;
    document.getElementById('score-1').innerText = scores.p1;
    document.getElementById('score-2').innerText = scores.p2;
    document.getElementById('winner-text').innerText = `PLAYER ${winner} WINS!`;
    document.getElementById('round-screen').style.display = 'block';
}
