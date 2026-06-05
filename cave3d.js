const { createNoise3D } = require('simplex-noise');

const maxPointCount = 30000;
const globalBrightness = 0.3;
const followDistance = 0.0;
const cameraSpeed = 0.00002;
let cameraZ = Math.random() * 9000;
let lastFrameMillis = 0;
let fpsCount = 0;
let points = [];
const noise3D = createNoise3D();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function CaveDensity(x, y, z) {
    return noise3D(x, y, z) - 0.5;
}

function CaveNormal(x, y, z) {
    const delta = 0.0001;
    const invDelta = 1 / delta;
    const h = CaveDensity(x, y, z);
    const dx = (CaveDensity(x + delta, y, z) - h) * invDelta;
    const dy = (CaveDensity(x, y + delta, z) - h) * invDelta;
    const dz = (CaveDensity(x, y, z + delta) - h) * invDelta;
    return { dx, dy, dz };
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
    const norm = CaveNormal(x, y, z);
    return { x, y, z, dx: norm.dx, dy: norm.dy, dz: norm.dz };
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

function DotProductNormalized(x1, y1, z1, x2, y2, z2) {
    const mag1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
    const mag2 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2);
    if (mag1 < 1e-6 || mag2 < 1e-6) {
        return 0;
    }
    return (x1 * x2 + y1 * y2 + z1 * z2) / (mag1 * mag2);
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
    for (let i = 0; i < 999 && points.length < maxPointCount; i++) {
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
        if (pz < 0.001) {
            continue;
        }
        const distanceSq = px * px + py * py + pz * pz;
        const distance = Math.sqrt(distanceSq);
        const screenX = minwh2 * px / pz + canvas.width / 2;
        const screenY = minwh2 * py / pz + canvas.height / 2;
        if (screenX < 0 || screenX >= canvas.width || screenY < 0 || screenY >= canvas.height) {
            continue;
        }
        if (distance < 0.001) {
            continue;
        }
        const dot = DotProductNormalized(p.dx, p.dy, p.dz, -px, -py, -pz);
        const light = 1 + Math.abs(dot);
        const radius = Math.min(2, light * globalBrightness / distance);
        const red = Math.floor(255 * (p.dx + 1) / 2);
        const green = Math.floor(255 * (p.dy + 1) / 2);
        const blue = Math.floor(255 * (p.dz + 1) / 2);
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY, radius, 0, 2 * Math.PI);
        ctx.fill();
        visiblePoints.push(p);
    }
    lastFrameMillis = currentFrameMillis;
    fpsCount++;
    points = visiblePoints;
    setTimeout(DoFrame, 0);
}

setTimeout(DoFrame, 10);
