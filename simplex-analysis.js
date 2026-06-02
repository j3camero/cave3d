const { createNoise3D } = require('simplex-noise');

const noise3D = createNoise3D();

function Gradient(x, y, z) {
    const delta = 0.01;
    const invDelta = 1 / delta;
    const v = noise3D(x, y, z);
    const dx = (noise3D(x + delta, y, z) - v) * invDelta;
    const dy = (noise3D(x, y + delta, z) - v) * invDelta;
    const dz = (noise3D(x, y, z + delta) - v) * invDelta;
    return { dx, dy, dz };
}

function Steepness(x, y, z) {
    const { dx, dy, dz } = Gradient(x, y, z);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

for (let i = 0; i < 1000; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const z = Math.random() * 100;
    const s = Steepness(x, y, z);
    console.log(s);
}
