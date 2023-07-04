//the "logic" stage of wavefront path tracing

//memory layout for uniforms
struct UBO {
    screen : vec4f,
    position : vec4f,//note: the a component of this stores a uint with the offset to know how many more paths to write
    forward : vec4f,//note: the a component of this stores a uint with the current frame number
    right : vec3f,
    focal : f32,
    aperture : f32
};
//memory layout for raycast info buffer
struct RaycastInfoBufferSegment {
    position : vec4f,
    direction : vec4f
};
//memory layout for material result buffer
struct MaterialResult {
    brdfpdf : vec4f,
    other : vec4u
};
//memory layout for a raycast result
struct RaycastResultBufferSegment {
    normaldist : vec4f,
    other : vec4f
};

const Pi      = 3.14159265358979323846;
const InvPi   = 0.31830988618379067154;
const Inv2Pi  = 0.15915494309189533577;
const Inv4Pi  = 0.07957747154594766788;
const PiOver2 = 1.57079632679489661923;
const PiOver4 = 0.78539816339744830961;
const Sqrt2   = 1.41421356237309504880;

@group(0) @binding(0) var<uniform> uniforms : UBO;
@group(0) @binding(1) var<storage, read_write> raycastResultBuffer : array<RaycastResultBufferSegment>;
@group(0) @binding(2) var<storage, read_write> material : array<MaterialResult>;
@group(0) @binding(3) var<storage, read_write> logicBuffer : array<vec4f>;
@group(0) @binding(4) var<storage, read_write> materialQueueBuffer : array<u32>;
@group(0) @binding(5) var<storage, read_write> newrayQueueBuffer : array<u32>;
@group(0) @binding(6) var<storage, read_write>  stageOneQueueCounts : array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> imageBuffer : array<vec4f>;
@group(0) @binding(8) var iblTexture : texture_2d<f32>;
@group(0) @binding(9) var<storage, read> raycastInfoBuffer : array<RaycastResultBufferSegment>;

var<workgroup> materialQueueCount : atomic<u32>;
var<workgroup> newrayQueueCount : atomic<u32>;
var<workgroup> materialQueue : array<u32, 32>;
var<workgroup> newrayQueue : array<u32, 32>;
var<workgroup> numDone : atomic<u32>;

@compute @workgroup_size(32)
fn main(@builtin(global_invocation_id) global_id : vec3u) {
    if (global_id.x >= u32(uniforms.screen.x) * u32(uniforms.screen.y)) {
        return;
    }

    var materialResult : MaterialResult = material[global_id.x];
    var raycastResult : RaycastResultBufferSegment = raycastResultBuffer[global_id.x];
    var logicValue : vec4f = logicBuffer[global_id.x];

    var lastMaterialEval : bool = materialResult.other.x == bitcast<u32>(uniforms.forward.a);
    var hitTri : u32 = bitcast<u32>(raycastResult.other.x);
    var lastRayHit : bool = hitTri != 4294967295u;
    var firstFrame = bitcast<u32>(uniforms.forward.a) == 0u;

    var inputThroughput : vec3f = logicValue.xyz;
    var curThroughput : vec3f = select(inputThroughput, inputThroughput * materialResult.brdfpdf.xyz, lastMaterialEval);

    var newpath : bool = false;

    if (firstFrame) {
        imageBuffer[global_id.x] = vec4f(0.);
        newpath = true;
    }

    if (all(curThroughput == vec3f(0.)) && !firstFrame) {
        newpath = true;
    }

    if (!lastRayHit) {
        newpath = true;
    }

    var q : f32 = min(max(.1, 1. - curThroughput.y), .7);
    initSeed(global_id.xy);
    var r2 : vec2f = rand2();
    if (r2.x < q) {
        if (lastRayHit) {
            curThroughput = vec3f(0.);
        }
        newpath = true;
    } else {
        curThroughput = curThroughput / (1. - q);
    }

    var clamped = clamp(curThroughput, vec3f(0.), vec3f(10.));
    if (newpath && !firstFrame && all(clamped == curThroughput)) {
        var curValue : vec4f = imageBuffer[global_id.x];
        var newValue = vec4f(
            (curValue.xyz * curValue.a + curThroughput * getIBL(raycastInfoBuffer[global_id.x].other.xyz)) / (curValue.a + 1.),
            curValue.a + 1.
        );
        imageBuffer[global_id.x] = newValue;
    }

    var done : bool = atomicAdd(&numDone, 1u) == 30u;
    if (newpath) {
        var writeToIndex : u32 = atomicAdd(&newrayQueueCount, 1u);
        newrayQueue[writeToIndex] = global_id.x;
    } else {
        var writeToIndex : u32 = atomicAdd(&materialQueueCount, 1u);
        materialQueue[writeToIndex] = global_id.x;
    }

    logicBuffer[global_id.x] = vec4f(curThroughput.xyz, logicValue.a);

    if (done) {
        var matCount : u32 = atomicLoad(&materialQueueCount);
        var newCount : u32 = atomicLoad(&newrayQueueCount);
        var newpathWriteToIndex = atomicAdd(&stageOneQueueCounts[0], newCount);
        for (var i : u32 = 0u; i < newCount; i++) {
            newrayQueueBuffer[newpathWriteToIndex + i] = newrayQueue[i];
        }
        var materialWriteToIndex = atomicAdd(&stageOneQueueCounts[1], matCount);
        for (var i : u32 = 0u; i < matCount; i++) {
            materialQueueBuffer[materialWriteToIndex + i] = materialQueue[i];
        }
    }
}

fn getIBL(dir : vec3f) -> vec3f {
    var theta : f32 = atan(dir.y / dir.x) + Pi * .5;
    if (dir.x < 0.) {
        theta += Pi;
    }
    var phi = acos(dir.z);
    var lonlat : vec2f = vec2f(theta, phi) * vec2f(Inv2Pi, InvPi);
    lonlat = uniforms.screen.zw * (lonlat);
    return textureLoad(iblTexture, vec2i(lonlat), 0).xyz;
}

//from: https://www.shadertoy.com/view/XlycWh
var<private> bSeed : f32 = 0.f;

fn baseHash(p : vec2u) -> u32 {
    var p2 : vec2u = 1103515245u*((p >> vec2u(1u))^(p.yx));
    var h32 : u32 = 1103515245u*((p2.x)^(p2.y>>3u));
    return h32^(h32 >> 16);
}

fn initSeed(coord : vec2u) {
    bSeed = f32(baseHash(coord)) / f32(0xffffffffu) + f32(bitcast<u32>(uniforms.forward.a)) * .008;
}

fn rand2() -> vec2f {
    var n : u32 = baseHash(bitcast<vec2u>(vec2f(bSeed + 1., bSeed + 2.)));
    bSeed += 2.;
    var rz : vec2u = vec2u(n, n * 48271u);
    return vec2f(rz.xy & vec2u(0x7fffffffu))/f32(0x7fffffff);
}