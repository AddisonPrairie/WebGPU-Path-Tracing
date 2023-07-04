//memory layout for uniforms
struct UBO {
    screen : vec2f,
    position : vec4f,//note: the a component of this stores a uint with the offset to know how many more paths to write
    forward : vec4f,
    right : vec4f,
    focal : f32,
    aperture : f32
};
//memory layout for raycast info buffer
struct RaycastInfoBufferSegment {
    position : vec4f,//note: the a component of this stores the index to remap this ray to a path
    direction : vec4f
};

const Pi      = 3.14159265358979323846;
const InvPi   = 0.31830988618379067154;
const Inv2Pi  = 0.15915494309189533577;
const Inv4Pi  = 0.07957747154594766788;
const PiOver2 = 1.57079632679489661923;
const PiOver4 = 0.78539816339744830961;
const Sqrt2   = 1.41421356237309504880;

@group(0) @binding(0) var<uniform> uniforms : UBO;
@group(0) @binding(1) var<storage, read_write> raycastInfoBuffer : array<RaycastInfoBufferSegment>;
@group(0) @binding(2) var<storage, read_write> logicBuffer : array<vec4f>;
@group(0) @binding(3) var<storage, read> newrayQueueBuffer : array<u32>;
@group(0) @binding(4) var<storage, read_write> stageTwoQueueCountsBuffer : array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> raycastQueueBuffer : array<u32>;
@group(0) @binding(6) var<storage, read> stageOneQueueCountBuffer : array<u32>;

var<workgroup> raycastQueueCount : atomic<u32>;
var<workgroup> raycastQueue : array<u32, 32>;

@compute @workgroup_size(32)
fn main(@builtin(global_invocation_id) global_id : vec3u) {
    if (global_id.x >= stageOneQueueCountBuffer[0]) {
        return;
    }

    var pathIndex : u32 = newrayQueueBuffer[global_id.x];
    var outputIndex : u32 = pathIndex;
    logicBuffer[pathIndex] = vec4f(1., 1., 1., bitcast<f32>(outputIndex));

    initSeed(global_id.xy);
    var spos : vec2f = vec2f(vec2u(outputIndex % u32(uniforms.screen.x), outputIndex / u32(uniforms.screen.x)));
    var r2 = rand2(); var theta = 2. * Pi * r2.x;
    spos += (r2.y * .5) * (vec2f(cos(theta), sin(theta)));
    var sspace : vec2f = (spos - .5 * uniforms.screen) / vec2f(uniforms.screen.y, -uniforms.screen.y);
    var up : vec3f = normalize(cross(uniforms.forward.xyz, uniforms.right.xyz));
    
    var raycastInfo : RaycastInfoBufferSegment;
    var apertureSample : vec2f = uniformSampleDisk() * uniforms.aperture;
    raycastInfo.position = vec4f(uniforms.position.xyz + apertureSample.x * uniforms.right.xyz + apertureSample.y * up, 1.);
    raycastInfo.direction = vec4f(
        normalize(uniforms.position.xyz + uniforms.focal * normalize(uniforms.forward.xyz * 1. - uniforms.right.xyz * sspace.x + up * sspace.y) - raycastInfo.position.xyz),
        -3.1415//just random packing
    );

    raycastInfoBuffer[pathIndex] = raycastInfo;

    var workgroupIndex : u32 = atomicAdd(&raycastQueueCount, 1u);
    raycastQueue[workgroupIndex] = pathIndex;

    if (workgroupIndex == 30u) {
        var stageTwoQueueWriteToIndex = atomicAdd(&stageTwoQueueCountsBuffer[0], 32u);
        for (var i : u32 = 0u; i < 32u; i += 1u) {
            raycastQueueBuffer[stageTwoQueueWriteToIndex + i] = raycastQueue[i];
        }
    }
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
//from: pbrt
fn uniformSampleDisk() -> vec2f {
    var r2 : vec2f = rand2();
    var r : f32 = sqrt(r2.x);
    var theta : f32 = 2. * Pi * r2.y;
    return vec2f(r * cos(theta), r * sin(theta));
}