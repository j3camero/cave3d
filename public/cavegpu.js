// Render at half display resolution; increase toward 1.0 once FPS is known
const RENDER_SCALE = 1.0;

const COMPUTE_SHADER = /* wgsl */`
struct Uniforms {
    cameraX   : f32,
    cameraY   : f32,
    cameraZ   : f32,
    rw        : f32,
    rh        : f32,
    pad0      : f32,
    pad1      : f32,
    pad2      : f32,
};

@group(0) @binding(0) var<uniform>          uni  : Uniforms;
@group(0) @binding(1) var<storage, read>    perm : array<u32>;
@group(0) @binding(2) var                   outT : texture_storage_2d<rgba8unorm, write>;

fn permAt(i: u32) -> u32 { return perm[i & 511u]; }

fn grad3(hash: u32, x: f32, y: f32, z: f32) -> f32 {
    switch (hash % 12u) {
        case  0u: { return  x + y; }
        case  1u: { return -x + y; }
        case  2u: { return  x - y; }
        case  3u: { return -x - y; }
        case  4u: { return  x + z; }
        case  5u: { return -x + z; }
        case  6u: { return  x - z; }
        case  7u: { return -x - z; }
        case  8u: { return  y + z; }
        case  9u: { return -y + z; }
        case 10u: { return  y - z; }
        default:  { return -y - z; }
    }
}

fn noise3(x: f32, y: f32, z: f32) -> f32 {
    let F3 = 0.33333334;
    let G3 = 0.16666667;

    let s  = (x + y + z) * F3;
    let i  = i32(floor(x + s));
    let j  = i32(floor(y + s));
    let k  = i32(floor(z + s));
    let t  = f32(i + j + k) * G3;

    let x0 = x - (f32(i) - t);
    let y0 = y - (f32(j) - t);
    let z0 = z - (f32(k) - t);

    var i1 = 0; var j1 = 0; var k1 = 0;
    var i2 = 0; var j2 = 0; var k2 = 0;
    if (x0 >= y0) {
        if      (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
        else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
        else               { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
    } else {
        if      (y0 < z0)  { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
        else if (x0 < z0)  { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
        else               { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
    }

    let x1 = x0 - f32(i1) + G3;
    let y1 = y0 - f32(j1) + G3;
    let z1 = z0 - f32(k1) + G3;
    let x2 = x0 - f32(i2) + 2.0*G3;
    let y2 = y0 - f32(j2) + 2.0*G3;
    let z2 = z0 - f32(k2) + 2.0*G3;
    let x3 = x0 - 1.0 + 3.0*G3;
    let y3 = y0 - 1.0 + 3.0*G3;
    let z3 = z0 - 1.0 + 3.0*G3;

    let ii = u32(i & 255);
    let jj = u32(j & 255);
    let kk = u32(k & 255);

    let g0 = permAt(ii           + permAt(jj           + permAt(kk           )));
    let g1 = permAt(ii+u32(i1)   + permAt(jj+u32(j1)   + permAt(kk+u32(k1)  )));
    let g2 = permAt(ii+u32(i2)   + permAt(jj+u32(j2)   + permAt(kk+u32(k2)  )));
    let g3 = permAt(ii+1u        + permAt(jj+1u         + permAt(kk+1u       )));

    var n = 0.0;
    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if (t0 > 0.0) { let s0 = t0*t0; n += s0*s0 * grad3(g0, x0, y0, z0); }
    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if (t1 > 0.0) { let s1 = t1*t1; n += s1*s1 * grad3(g1, x1, y1, z1); }
    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if (t2 > 0.0) { let s2 = t2*t2; n += s2*s2 * grad3(g2, x2, y2, z2); }
    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if (t3 > 0.0) { let s3 = t3*t3; n += s3*s3 * grad3(g3, x3, y3, z3); }

    return 32.0 * n;
}

fn density(p: vec3<f32>) -> f32 { return noise3(p.x, p.y, p.z); }

fn rockColor(p: vec3<f32>) -> vec3<f32> {
    // Three octaves of texture noise at frequencies much higher than the cave shape.
    // Shape noise is at freq ~1.0; texture uses 6x–40x to get rocky grain.
    let n1 = noise3(p.x *  6.0,          p.y *  6.0,          p.z *  6.0);
    let n2 = noise3(p.x * 16.0 + 17.3,   p.y * 16.0 + 31.1,   p.z * 16.0 +  7.7);
    let n3 = noise3(p.x * 40.0 + 53.7,   p.y * 40.0 + 61.3,   p.z * 40.0 + 41.9);

    // FBM-style blend mapped to [0,1] for base lightness
    let t = clamp((n1 * 0.50 + n2 * 0.32 + n3 * 0.18) * 0.7 + 0.5, 0.0, 1.0);

    // Second independent channel (large coordinate offset) drives mineral-patch color
    let m = clamp(noise3(p.x * 7.0 + 100.0, p.y * 7.0 + 200.0, p.z * 7.0 + 150.0) * 0.5 + 0.5, 0.0, 1.0);

    // Earthy rock palette
    let black     = vec3<f32>(0.05, 0.04, 0.04);
    let darkGray  = vec3<f32>(0.20, 0.18, 0.17);
    let coolGray  = vec3<f32>(0.40, 0.37, 0.34);
    let warmGray  = vec3<f32>(0.56, 0.52, 0.47);
    let brown     = vec3<f32>(0.38, 0.25, 0.13);
    let ochre     = vec3<f32>(0.56, 0.42, 0.20);
    let sandstone = vec3<f32>(0.68, 0.56, 0.40);
    let limestone = vec3<f32>(0.84, 0.81, 0.76);

    // Base: gradient through grays from dark crevices to pale highlights
    var base: vec3<f32>;
    if (t < 0.20) {
        base = mix(black,    darkGray, t * 5.0);
    } else if (t < 0.50) {
        base = mix(darkGray, coolGray, (t - 0.20) * 3.33);
    } else if (t < 0.78) {
        base = mix(coolGray, warmGray, (t - 0.50) * 3.57);
    } else {
        base = mix(warmGray, limestone, (t - 0.78) * 4.55);
    }

    // Mineral patches: earthy browns, ochres, sandstone
    var mineral: vec3<f32>;
    if (m < 0.40) {
        mineral = mix(brown,     ochre,     m * 2.5);
    } else if (m < 0.70) {
        mineral = mix(ochre,     sandstone, (m - 0.40) * 3.33);
    } else {
        mineral = mix(sandstone, limestone, (m - 0.70) * 3.33);
    }

    // Patch extent driven by a low-frequency noise blob
    let patchNoise = noise3(p.x * 4.0 + 300.0, p.y * 4.0 + 400.0, p.z * 4.0 + 350.0);
    let mineralWeight = clamp(patchNoise * 0.5 + 0.35, 0.0, 0.70);
    return mix(base, mineral, mineralWeight);
}


@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let px = gid.x;
    let py = gid.y;
    if (px >= u32(uni.rw) || py >= u32(uni.rh)) { return; }

    let minDim  = min(uni.rw, uni.rh);
    let ndcX    = (f32(px) - uni.rw * 0.5) / (minDim * 0.5);
    let ndcY    = (f32(py) - uni.rh * 0.5) / (minDim * 0.5);
    let rayDir  = normalize(vec3<f32>(ndcX, ndcY, 1.0));

    let origin = vec3<f32>(uni.cameraX, uni.cameraY, uni.cameraZ);
    var pos    = origin;
    var oldH   = density(pos);
    var col    = vec4<f32>(0.0, 0.0, 0.0, 1.0);

    for (var i = 0; i < 200; i++) {
        let h        = density(pos);
        let stepSize = max(0.01, abs(h) * 0.1);
        pos         += rayDir * stepSize;

        if (h * oldH < 0.0) {
            // Newton-Raphson refinement toward the zero crossing
            for (var j = 0; j < 8; j++) {
                let nh  = density(pos);
                let e   = 0.001;
                let dh  = (density(pos + rayDir * e) - nh) / e;
                if (abs(dh) < 1e-6) { break; }
                pos -= rayDir * (nh / dh);
            }
            let dist       = length(pos - origin);
            let d2 = dist * dist;
            let brightness = 1.0 / (1.0 + d2 * d2);
            let rockCol = rockColor(pos);
            col = vec4<f32>(rockCol * brightness, 1.0);
            break;
        }
        oldH = h;
    }

    textureStore(outT, vec2<i32>(i32(px), i32(py)), col);
}
`;

const BLIT_SHADER = /* wgsl */`
struct VSOut {
    @builtin(position) pos : vec4<f32>,
    @location(0)       uv  : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VSOut {
    // Full-screen triangle covering clip space
    var p = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0)
    );
    // UV: map NDC (-1,-1)..(1,1) to texture (0,1)..(1,0) — v flipped for screen-top = tex-top
    var u = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0)
    );
    var o: VSOut;
    o.pos = vec4<f32>(p[vid], 0.0, 1.0);
    o.uv  = u[vid];
    return o;
}

@group(0) @binding(0) var tex : texture_2d<f32>;
@group(0) @binding(1) var smp : sampler;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
    return textureSample(tex, smp, in.uv);
}
`;

async function main() {
    const overlay = document.getElementById('overlay');

    if (!navigator.gpu) {
        overlay.textContent = 'WebGPU not supported in this browser.';
        return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        overlay.textContent = 'No WebGPU adapter found.';
        return;
    }
    const device = await adapter.requestDevice();

    const canvas = document.getElementById('canvas');
    const ctx    = canvas.getContext('webgpu');
    const fmt    = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format: fmt, alphaMode: 'opaque' });

    // Camera — keep coordinates modest so float32 stays precise
    const cameraX   = Math.random() * 100;
    const cameraY   = Math.random() * 100;
    let   cameraZ   = Math.random() * 900;
    const cameraSpeed = 0.000002; // world units per millisecond

    // Permutation table matching simplex-noise library seeding
    function buildPerm() {
        const p = new Uint8Array(512);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 0; i < 255; i++) {
            const r = i + Math.floor(Math.random() * (256 - i));
            const tmp = p[i]; p[i] = p[r]; p[r] = tmp;
        }
        for (let i = 256; i < 512; i++) p[i] = p[i - 256];
        return p;
    }
    const permBuf = device.createBuffer({
        size: 512 * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(permBuf, 0, new Uint32Array(buildPerm()));

    const uniBuf = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    // Pipelines
    const computeMod = device.createShaderModule({ code: COMPUTE_SHADER });
    const blitMod    = device.createShaderModule({ code: BLIT_SHADER });

    const computeBGL = device.createBindGroupLayout({ entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer:         { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer:         { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm' } },
    ]});
    const blitBGL = device.createBindGroupLayout({ entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ]});

    const computePipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [computeBGL] }),
        compute: { module: computeMod, entryPoint: 'main' },
    });
    const blitPipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [blitBGL] }),
        vertex:   { module: blitMod, entryPoint: 'vs' },
        fragment: { module: blitMod, entryPoint: 'fs', targets: [{ format: fmt }] },
        primitive: { topology: 'triangle-list' },
    });

    let renderTex      = null;
    let computeBG      = null;
    let blitBG         = null;
    let renderW        = 0;
    let renderH        = 0;

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        renderW = Math.max(1, Math.floor(canvas.width  * RENDER_SCALE));
        renderH = Math.max(1, Math.floor(canvas.height * RENDER_SCALE));

        if (renderTex) renderTex.destroy();
        renderTex = device.createTexture({
            size:   [renderW, renderH],
            format: 'rgba8unorm',
            usage:  GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });
        computeBG = device.createBindGroup({ layout: computeBGL, entries: [
            { binding: 0, resource: { buffer: uniBuf } },
            { binding: 1, resource: { buffer: permBuf } },
            { binding: 2, resource: renderTex.createView() },
        ]});
        blitBG = device.createBindGroup({ layout: blitBGL, entries: [
            { binding: 0, resource: renderTex.createView() },
            { binding: 1, resource: sampler },
        ]});
    }
    window.addEventListener('resize', resize);
    resize();

    let lastTime = 0;
    let fpsCount = 0;
    let lastFpsSec = 0;

    function frame(time) {
        const dt = lastTime > 0 ? time - lastTime : 0;
        lastTime  = time;
        cameraZ  += dt * cameraSpeed;
        fpsCount++;

        const sec = Math.floor(time / 1000);
        if (sec !== lastFpsSec) {
            overlay.textContent = `${fpsCount} fps`;
            fpsCount   = 0;
            lastFpsSec = sec;
        }

        // Upload uniforms
        device.queue.writeBuffer(uniBuf, 0, new Float32Array([
            cameraX, cameraY, cameraZ,
            renderW, renderH,
            0, 0, 0,
        ]));

        const enc = device.createCommandEncoder();

        // Compute pass: fill renderTex
        const cp = enc.beginComputePass();
        cp.setPipeline(computePipeline);
        cp.setBindGroup(0, computeBG);
        cp.dispatchWorkgroups(Math.ceil(renderW / 8), Math.ceil(renderH / 8));
        cp.end();

        // Render pass: blit renderTex to canvas
        const rp = enc.beginRenderPass({
            colorAttachments: [{
                view:       ctx.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp:     'clear',
                storeOp:    'store',
            }],
        });
        rp.setPipeline(blitPipeline);
        rp.setBindGroup(0, blitBG);
        rp.draw(3);
        rp.end();

        device.queue.submit([enc.finish()]);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

main();
