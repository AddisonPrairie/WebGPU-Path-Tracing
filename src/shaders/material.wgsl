//memory layout for uniforms
struct UBO {
    screen : vec2f,
    position : vec4f,//note: the a component of this stores a uint with the offset to know how many more paths to write
    forward : vec4f,//note: the a component of this stores a uint with the current frame number
    right : vec3f,
    focal : f32,
    aperture : f32
};
//memory layout for raycast info buffer
struct RaycastInfoBufferSegment {
    position : vec4f,//note: the a component of this stores the index to remap this ray to a path
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
    other : vec4u
};
struct MatParams {
    param0 : vec4f,
    param1 : vec4f
}
//memory layout for the material information
struct MaterialInfo {
    matparams : array<MatParams, 32>,
    mattype : array<vec4u, 8>
}
const Pi      = 3.14159265358979323846;
const InvPi   = 0.31830988618379067154;
const Inv2Pi  = 0.15915494309189533577;
const Inv4Pi  = 0.07957747154594766788;
const PiOver2 = 1.57079632679489661923;
const PiOver4 = 0.78539816339744830961;
const Sqrt2   = 1.41421356237309504880;
@group(0) @binding(0) var<uniform> uniforms : UBO;
@group(0) @binding(1) var<storage, read_write> raycastInfoBuffer : array<RaycastInfoBufferSegment>;
@group(0) @binding(2) var<storage, read_write> resultBuffer : array<MaterialResult>;
@group(0) @binding(3) var<storage, read> inQueueBuffer : array<u32>;
@group(0) @binding(4) var<storage, read_write> stageTwoQueueCountsBuffer : array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> raycastQueueBuffer : array<u32>;
@group(0) @binding(6) var<storage, read> raycastResultBuffer : array<RaycastResultBufferSegment>;
@group(0) @binding(7) var<storage, read> stageOneQueueCountBuffer : array<u32>;
@group(0) @binding(8) var<uniform> materialInfo : MaterialInfo;
var<workgroup> raycastQueueCount : atomic<u32>;
var<workgroup> raycastQueue : array<u32, 32>;
@compute @workgroup_size(32)
fn main(@builtin(global_invocation_id) global_id : vec3u) {
    if (global_id.x >= stageOneQueueCountBuffer[1]) {
        return;
    }
    initSeed(global_id.xy);
    var pathIndex = inQueueBuffer[global_id.x];
    var lastRaycastResult : RaycastResultBufferSegment = raycastResultBuffer[pathIndex];
    var lastRaycastStart : RaycastInfoBufferSegment = raycastInfoBuffer[pathIndex];

    var wo : vec3f = -lastRaycastStart.direction.xyz;
    var normal : vec3f = lastRaycastResult.normaldist.xyz;
    var brdfGrazingOverPdf : vec3f = vec3f(1.);
    var pdf : f32 = 1.;
    var wi : vec3f = vec3f(0.);

    var material : u32 = lastRaycastResult.other.z;
    var mattypevec : vec4u = materialInfo.mattype[material / 4u];
    var mattype : u32;
    if (material % 4 == 0) {
        mattype = mattypevec.x;
    } else if (material % 4 == 1) {
        mattype = mattypevec.y;
    } else if (material % 4 == 2) {
        mattype = mattypevec.z;
    } else {
        mattype = mattypevec.a;
    }
    var matparams : MatParams = materialInfo.matparams[material];

    var internal : bool = false;
    switch (mattype) {
        case 0u: {
            var albedo : vec3f = matparams.param0.xyz;
            var brdf : vec3f = albedo * InvPi;
            var sample : vec3f = cosineSampleHemisphere();
            wi = localToWorld(sample, normal);
            pdf = abs(dot(wi, normal)) * InvPi;
            brdfGrazingOverPdf = brdf * abs(dot(wi, normal)) / pdf;
        }
        case 1u: {
            var attenuationColor : vec3f = matparams.param1.xyz;
            var density : f32 = matparams.param1.a;
            var attenuationFactor : vec3f = vec3f(1.);

            var eta : f32 = matparams.param0.a;
            if (dot(normal, wo) < 0.) {
                internal = true; eta = 1. / eta;
                attenuationFactor = exp(-(vec3(1.) - attenuationColor) * density * lastRaycastResult.normaldist.a);
            }
            var R : f32 = FrDialectric(abs(dot(normal, wo)), eta);
            var c2 : f32 = rand2().x;
            //multiply by volume and surface absorption
            brdfGrazingOverPdf *= attenuationFactor;
            brdfGrazingOverPdf *= matparams.param0.xyz;
            if (c2 <= R || R == -1.) {
                pdf = 1.;
                wi = reflect(-wo, normal);
            } else {
                pdf = 1.;
                wi = refract(-wo, normal * select(1., -1., internal), 1. / eta);
                internal = !internal;
            }
        }
        case 2u: {
            brdfGrazingOverPdf *= matparams.param0.xyz;
            wi = reflect(-wo, normal);
            var pdf = 1.;
        }
        case 3u: {
            var eta : f32 = matparams.param0.a;
            var R : f32 = FrDialectric(abs(dot(normal, wo)), eta);
            var c2 : f32 = rand2().x;
            if (c2 <= R || R == -1.) {
                pdf = 1.;
                wi = reflect(-wo, normal);
                brdfGrazingOverPdf *= matparams.param1.xyz;
            } else {
                var albedo : vec3f = matparams.param0.xyz;
                var brdf : vec3f = albedo * InvPi;
                
                var sample : vec3f = cosineSampleHemisphere();
                wi = localToWorld(sample, normal);

                pdf = abs(dot(wi, normal)) * InvPi;
                brdfGrazingOverPdf = brdf * abs(dot(wi, normal)) / pdf;
            }
        }
        default: {
            brdfGrazingOverPdf = vec3f(1., 0., 0.);
            wi = reflect(-wo, normal);
        }
    }

    var result : MaterialResult;
    result.brdfpdf = vec4f(brdfGrazingOverPdf, pdf);
    result.other = vec4u(bitcast<u32>(uniforms.forward.a) + 1u, 0u, 0u, 0u);
    resultBuffer[pathIndex] = result;

    var newRay : RaycastInfoBufferSegment;
    newRay.position = vec4f(lastRaycastResult.normaldist.xyz * select(.00001, -.00001, internal) + lastRaycastStart.position.xyz + lastRaycastResult.normaldist.a * lastRaycastStart.direction.xyz, 1.);
    newRay.direction = vec4f(wi, 1.);
    raycastInfoBuffer[pathIndex] = newRay;

    var workgroupIndex : u32 = atomicAdd(&raycastQueueCount, 1u);
    raycastQueue[workgroupIndex] = pathIndex;

    if (workgroupIndex == 30u) {
        var stageTwoQueueWriteToIndex = atomicAdd(&stageTwoQueueCountsBuffer[0], 32u);
        for (var i : u32 = 0u; i < 32u; i += 1u) {
            raycastQueueBuffer[stageTwoQueueWriteToIndex + i] = raycastQueue[i];
        }
    }
}
//from: pbrt, eta = transmit to IOR / current IOR
//returns negative 1 if a reflection should be done
fn FrDialectric(iCosTheta : f32, eta : f32) -> f32 {
    var iSinTheta2 : f32 = max(0., 1. - iCosTheta * iCosTheta);
    var tSinTheta2 : f32 = iSinTheta2 / (eta * eta);
    if (tSinTheta2 >= 1.) {
        return -1.;
    }
    var tCosTheta : f32 = sqrt(1. - tSinTheta2);

    var r_par : f32 = (eta * iCosTheta - tCosTheta) / (eta * iCosTheta + tCosTheta);
    var r_per : f32 = (iCosTheta - eta * tCosTheta) / (iCosTheta + eta * tCosTheta);

    return (r_par * r_par + r_per * r_per) / 2.;
}
//converts from local (normal z-up) to world
fn localToWorld(sample : vec3f, normal : vec3f) -> vec3f {
    var o1 : vec3f;
    if (abs(normal.x) > abs(normal.y)) {
        o1 = vec3f(-normal.y, normal.x, 0.);
    } else {
        o1 = vec3f(0., -normal.z, normal.y);
    }
    o1 = normalize(o1);
    var o2 : vec3f = normalize(cross(normal, o1));

    return  o1 * sample.x + o2 * sample.y + normal * sample.z;
}

//from: pbrt
fn uniformSampleDisk() -> vec2f {
    var r2 : vec2f = rand2();
    var r : f32 = sqrt(r2.x);
    var theta : f32 = 2. * Pi * r2.y;
    return vec2f(r * cos(theta), r * sin(theta));
}
//from: pbrt
fn concentricSampleDisk() -> vec2f {
    var uOffset : vec2f = rand2() * 2. - vec2f(1.);

    if (uOffset.x == 0. && uOffset.y == 0.) {
        return vec2f(0.);
    }

    var theta : f32; var r : f32;
    if (abs(uOffset.x) > abs(uOffset.y)) {
        r = uOffset.x;
        theta = PiOver4 * (uOffset.y / uOffset.x);
    } else {
        r = uOffset.y;
        theta = PiOver2 - PiOver4 * (uOffset.x / uOffset.y);
    }
    return r * vec2f(cos(theta), sin(theta));
}
//from: pbrt
fn cosineSampleHemisphere() -> vec3f {
    var d : vec2f = uniformSampleDisk();
    var z : f32 = sqrt(max(0., 1. - d.x * d.x - d.y * d.y));
    return vec3f(d.xy, z);
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