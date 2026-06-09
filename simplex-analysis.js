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

function ToUniform(noiseVal) {
    const flattened = 0.5 + 0.5 * (1.85 * noiseVal - 0.85 * Math.pow(noiseVal, 5));
    return Math.max(0.0001, Math.min(0.9999, flattened)); // Clamp slightly away from 0 and 1 to prevent infinity
}

for (let i = 0; i < 1000; i++) {
    const x = Math.random() * 1000;
    const y = Math.random() * 1000;
    const z = Math.random() * 1000;
    //const s = Steepness(x, y, z);
    const h = noise3D(x, y, z);
    console.log(ToUniform(h));
}
