const { createNoise3D } = require('simplex-noise');

const maxPointCount = 20000;
const globalBrightness = 0.3;
const followDistance = 0.0;
const cameraSpeed = 0.00002;
const cameraX = Math.random() * 1000;
const cameraY = Math.random() * 1000;
let cameraZ = Math.random() * 9000;
let lastFrameMillis = 0;
let fpsCount = 0;
let points = [];
const noise3D = createNoise3D();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function CaveDensity(x, y, z) {
    return noise3D(x, y, z) - 0.0;
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
    const p = CastRay(cameraX, cameraY, cameraZ, direction.x, direction.y, direction.z);
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

function Get3DRainbowColor(vector) {
    // 1. Define the 6 primary directional vectors and their corresponding HSL hues
    const directions = [
        { dir: { x:  0, y:  1, z:  0 }, hue:   0 }, // Up (Red)
        { dir: { x:  0, y: -1, z:  0 }, hue:  60 }, // Down (Yellow)
        { dir: { x: -1, y:  0, z:  0 }, hue: 120 }, // Left (Green)
        { dir: { x:  1, y:  0, z:  0 }, hue: 180 }, // Right (Cyan)
        { dir: { x:  0, y:  0, z:  1 }, hue: 240 }, // Forward (Blue)
        { dir: { x:  0, y:  0, z: -1 }, hue: 300 }  // Backward (Magenta)
    ];

    // 2. Calculate the dot product (alignment) for all 6 directions
    // The higher the dot product, the closer the vector is to that direction.
    let alignments = directions.map(d => ({
        hue: d.hue,
        weight: vector.x * d.dir.x + vector.y * d.dir.y + vector.z * d.dir.z
    }));

    // 3. Sort by alignment to find the 3 closest directions, and filter out negative weights
    alignments.sort((a, b) => b.weight - a.weight);
    
    // Take the 3 nearest directions
    const top3 = alignments.slice(0, 3).filter(a => a.weight > 0);

    // 4. If no valid direction (e.g., zero vector), default to black
    if (top3.length === 0) return 'hsl(0, 0%, 0%)';

    // 5. Normalize the weights so they sum to 1
    let totalWeight = top3.reduce((sum, a) => sum + a.weight, 0);
    if (totalWeight === 0) totalWeight = 1;

    // 6. Interpolate the hue using the weighted average
    let interpolatedHue = top3.reduce((sum, a) => {
        // Calculate shortest angular distance to prevent wild color jumps
        let diff = a.hue - sum;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        return sum + (diff * (a.weight / totalWeight));
    }, top3[0].hue);

    // Keep hue strictly between 0 and 360
    interpolatedHue = (interpolatedHue % 360 + 360) % 360;

    return `hsl(${Math.round(interpolatedHue)}, 100%, 50%)`;
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
        const px = p.x - cameraX;
        const py = p.y - cameraY;
        const pz = p.z - cameraZ;
        if (pz < 0.00001) {
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
        const light = 1 + 0.2 * Math.abs(dot);
        const radius = Math.min(2, light * globalBrightness / distance);
        ctx.fillStyle = Get3DRainbowColor({ x: p.dx, y: p.dy, z: p.dz });
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
