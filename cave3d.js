const { createNoise3D } = require('simplex-noise');

const globalBrightness = 0.3;
const followDistance = 0.0;
const cameraSpeed = 0.00002;
let cameraZ = 0;
let lastFrameMillis = 0;
let fpsCount = 0;
let points = [];
const noise3D = createNoise3D();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function CaveDensity(x, y, z) {
    return noise3D(x, y, z) - 0.3;
}

function RayDerivative(x, y, z, dx, dy, dz) {
    const delta = 0.0001;
    const invDelta = 1 / delta;
    const h = CaveDensity(x, y, z);
    const q = CaveDensity(x + delta * dx, y + delta * dy, z + delta * dz);
    return (q - h) * invDelta;
}

function NewtonRaphsonMethod(x, y, z, dx, dy, dz) {
    for (let i = 0; i < 10; i++) {
        const h = CaveDensity(x, y, z);
        const dh = RayDerivative(x, y, z, dx, dy, dz);
        if (Math.abs(dh) < 1e-6) break; // Avoid division by zero
        const t = h / dh;
        x -= t * dx;
        y -= t * dy;
        z -= t * dz;
    }
    return { x, y, z };
}

function CastRay(x, y, z, dx, dy, dz) {
    let oldH = CaveDensity(x, y, z);
    while (true) {
        const h = CaveDensity(x, y, z);
        const stepSize = Math.max(0.01, Math.abs(h) * 0.1);
        x += dx * stepSize;
        y += dy * stepSize;
        z += dz * stepSize;
        if (Math.sign(h) !== Math.sign(oldH)) {
            return NewtonRaphsonMethod(x, y, z, dx, dy, dz);
        }
        oldH = h;
    }
    throw 'Convergence failed';
}

function GenerateRandomDirection() {
    const x = Math.random() * 2 - 1;
    const y = Math.random() * 2 - 1;
    const z = Math.random() * 2 - 1;
    const mag = Math.sqrt(x * x + y * y + z * z);
    if (mag > 1) {
        return GenerateRandomDirection();
    }
    return { x: x / mag, y: y / mag, z: z / mag };
}

function GenerateOnePoint() {
    const direction = GenerateRandomDirection();
    const p = CastRay(0, 0, cameraZ, direction.x, direction.y, direction.z);
    points.push(p);
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

function DoFrame() {
    const visiblePoints = [];
    const currentFrameMillis = Date.now();
    if (lastFrameMillis) {
        const deltaT = currentFrameMillis - lastFrameMillis;
        cameraZ += deltaT * cameraSpeed;
        const lastFrameSec = Math.floor(lastFrameMillis / 1000);
        const currentFrameSec = Math.floor(currentFrameMillis / 1000);
        if (currentFrameSec !== lastFrameSec) {
            console.log('fps', fpsCount, 'points', points.length);
            fpsCount = 0;
        }
    }
    for (let i = 0; i < 999 && points.length < 50000; i++) {
        GenerateOnePoint();
    }
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const minwh = Math.min(canvas.width, canvas.height);
    const minwh2 = minwh / 2;
    ctx.fillStyle = '#FFFFFF';
    for (const p of points) {
        const px = p.x - followDistance * 0.2;
        const py = p.y + followDistance * 0.1;
        const pz = p.z - cameraZ + followDistance;
        if (pz > 0) {
            const distanceSq = px * px + py * py + pz * pz;
            const distance = Math.sqrt(distanceSq);
            const screenX = minwh2 * px / pz + canvas.width / 2;
            const screenY = minwh2 * py / pz + canvas.height / 2;
            if (screenX >= 0 && screenX < canvas.width && screenY >= 0 && screenY < canvas.height) {
                const radius = Math.min(2, globalBrightness / distance);
                ctx.beginPath();
                ctx.arc(screenX, screenY, radius, 0, 2 * Math.PI);
                ctx.fill();
                visiblePoints.push(p);
            }
        }
    }
    lastFrameMillis = currentFrameMillis;
    fpsCount++;
    points = visiblePoints;
    setTimeout(DoFrame, 0);
}

setTimeout(DoFrame, 10);
