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
//memory layout for result buffer
struct RaycastResultBufferSegment {
    normaldist : vec4f,
    other : vec4u
}
//memory layout for a bvh node
struct BVHNode {
    AABBLLow : vec4f,
    AABBLHigh : vec4f,
    AABBRLow : vec4f,
    AABBRHigh : vec4f
};
//memory layout for a triangle primitive
struct Triangle {
    v0 : vec4f,
    v1 : vec4f,
    v2 : vec4f,
    vx : vec4f
};

@group(0) @binding(0) var<uniform> uniforms : UBO;
@group(0) @binding(1) var<storage, read> bvh : array<BVHNode>;
@group(0) @binding(2) var<storage, read> tris : array<Triangle>;
@group(0) @binding(3) var<storage, read> info : array<RaycastInfoBufferSegment>;
@group(0) @binding(4) var<storage, read_write> result : array<RaycastResultBufferSegment>;
@group(0) @binding(5) var<storage, read> queue : array<u32>;
@group(0) @binding(6) var<storage, read> stageTwoQueueCountsBuffer : array<u32>;

var<private> stack : array<u32, 64>;

@compute @workgroup_size(32)
fn main(@builtin(global_invocation_id) global_id : vec3u) {
    if (global_id.x >= stageTwoQueueCountsBuffer[0]) {
        return;
    }

    var writeToIndex : u32 = queue[global_id.x];
    var input : RaycastInfoBufferSegment = info[writeToIndex];

    var o : vec3f = input.position.xyz;
    var d : vec3f = input.direction.xyz;
    var hitNormal = vec3f(0.);
    var stackptr : u32 = 0u;
    var leftHit = 0.; var rightHit = 0.;
    var maxDist = 987654321.;
    var foundTri : u32 = 4294967295u;
    stack[stackptr] = 0u;
    stackptr += 1u;
    var idx : u32 = 0u;
    var primptr = 0u; var primax = 0u;
    var isNew = true;
    var material : u32 = 0u;

    var curScale : f32 = 1.;
    var curPosition : vec3f = vec3f(0.);
    var curRotation = 0.;// : vec3f = vec3f(0.);
    var primOffset : u32 = 0u;
    var bvhOffset : u32 = 0u;
    var stackCutOff : u32 = 0u;
    var curMaterial : u32 = 0u;

    while (stackptr != 0u) {
        var node : BVHNode = bvh[idx];

        //this is a leaf
        if (isNew && bitcast<u32>(node.AABBLLow.a) == 0u) {
            primptr = bitcast<u32>(node.AABBLLow.x) + primOffset;
            primax = bitcast<u32>(node.AABBLLow.y) + primOffset;
            isNew = false;
        }

        if (stackptr <= stackCutOff) {
            //undo the object space transforms
            primOffset = 0u;
            bvhOffset = 0u;
            curMaterial = 0u;
            stackCutOff = 0u;
            var c = cos(curRotation);
            var s = sin(curRotation);
            /*o = vec3f(
                o.x,
                o.y * c.x - o.z * s.x,
                o.y * s.x + o.z * c.x
            );
            d = vec3f(
                d.x,
                d.y * c.x - d.z * s.x,
                d.y * s.x + d.z * c.x
            );
            o = vec3f(
                o.z * s.y + o.x * c.y,
                o.y,
                o.z * c.y - o.x * s.y
            );
            d = vec3f(
                d.z * s.y + d.x * c.y,
                d.y,
                d.z * c.y - d.x * s.y
            );*/
            o = vec3f(
                o.x * c - o.y * s,
                o.x * s + o.y * c,
                o.z
            );
            d = vec3f(
                d.x * c - d.y * s,
                d.x * s + d.y * c,
                d.z
            );
            o *= curScale;
            o += curPosition;
            d = normalize(d * curScale);
            curScale = 1.;
            curPosition = vec3f(0.);
            curRotation = 0.;//vec3f(0.);
        }

        if (bitcast<u32>(node.AABBLHigh.a) == 0u) {
            //apply object space transforms
            curPosition = node.AABBLLow.xyz;
            curScale = node.AABBRLow.x;
            curRotation = node.AABBLHigh.z;//node.AABBLHigh.xyz;
            var offsetsmatidx : vec4u = bitcast<vec4u>(node.AABBRHigh);
            o = o - curPosition;
            o = o / curScale;
            d = normalize(d / curScale);
            //apply rotation :(
            var c = cos(-curRotation);
            var s = sin(-curRotation);
            o = vec3f(
                o.x * c - o.y * s,
                o.x * s + o.y * c,
                o.z
            );
            d = vec3f(
                d.x * c - d.y * s,
                d.x * s + d.y * c,
                d.z
            );
            /*o = vec3f(
                o.z * s.y + o.x * c.y,
                o.y,
                o.z * c.y - o.x * s.y
            );
            d = vec3f(
                d.z * s.y + d.x * c.y,
                d.y,
                d.z * c.y - d.x * s.y
            );
            o = vec3f(
                o.x,
                o.y * c.x - o.z * s.x,
                o.y * s.x + o.z * c.x
            );
            d = vec3f(
                d.x,
                d.y * c.x - d.z * s.x,
                d.y * s.x + d.z * c.x
            );*/
            primOffset = offsetsmatidx.x;
            bvhOffset = offsetsmatidx.y;
            curMaterial = offsetsmatidx.z;
            idx = offsetsmatidx.y;
            stackCutOff = stackptr - 1u;
            isNew = true;
            continue;
        }

        //we need to intersect the triangle
        if (primptr < primax) {
            var v0 : vec3f = tris[primptr].v0.xyz;
            var v1 : vec3f = tris[primptr].v1.xyz;
            var v2 : vec3f = tris[primptr].v2.xyz;

            var e0 : vec3f = v1 - v0;
            var e1 : vec3f = v2 - v0;
            var pv : vec3f = cross(d, e1);
            var det : f32 = dot(e0, pv);

            var tv : vec3f = o - v0;
            var qv : vec3f = cross(tv, e0);

            var uvt : vec4f;
            uvt.x = dot(tv, pv); uvt.y = dot(d, qv); uvt.z = dot(e1, qv);
            uvt = vec4f(uvt.xyz / det, uvt.w);
            uvt.w = 1. - uvt.x - uvt.y;
            uvt.z *= curScale;

            if (all(uvt >= vec4f(0.)) && uvt.z < maxDist) {
                //this triangle is hit and is the closest
                maxDist = uvt.z;
                foundTri = primptr;
                material = curMaterial;
                hitNormal = normalize(cross(e0, e1));
                var c = cos(curRotation);
                var s = sin(curRotation);
                /*hitNormal = vec3f(
                    hitNormal.x,
                    hitNormal.y * c.x - hitNormal.z * s.x,
                    hitNormal.y * s.x + hitNormal.z * c.x
                );
                hitNormal = vec3f(
                    hitNormal.z * s.y + hitNormal.x * c.y,
                    hitNormal.y,
                    hitNormal.z * c.y - hitNormal.x * s.y
                );*/
                hitNormal = vec3f(
                    hitNormal.x * c - hitNormal.y * s,
                    hitNormal.x * s + hitNormal.y * c,
                    hitNormal.z
                );
            }

            primptr += 1u;
            if (primptr >= primax) {
                isNew = true;
                stackptr -= 1u;
                idx = stack[stackptr];
            }
        } else {
            rightHit = AABBIntersect(node.AABBRLow.xyz, node.AABBRHigh.xyz, o, d);
            leftHit = AABBIntersect(node.AABBLLow.xyz, node.AABBLHigh.xyz, o, d);

            var lValid : bool = leftHit != -1e30 && curScale * leftHit <= maxDist;
            var rValid : bool = rightHit != -1e30 && curScale * rightHit <= maxDist;

            isNew = true;
            if (lValid && rValid) {
                var deferred : u32 = 0u;
                
                var leftIndex : u32 = idx + 1u;
                var rightIndex : u32 = bitcast<u32>(node.AABBLLow.a) + bvhOffset;
                if (leftHit < rightHit) {
                    deferred = rightIndex;
                    idx = leftIndex;
                } else {
                    deferred = leftIndex;
                    idx = rightIndex;
                }
                stack[stackptr] = deferred;
                stackptr += 1u;
            } else if (lValid) {
                //depth first packing means left node is always the next
                idx = idx + 1u;
            } else if (rValid) {
                //otherwise right node is packed into fourth component of 
                idx = bitcast<u32>(node.AABBLLow.a) + bvhOffset;
            } else {
                stackptr -= 1u;
                idx = stack[stackptr];
            }
        }
    }

    var res : RaycastResultBufferSegment;
    res.normaldist = vec4f(hitNormal, maxDist);
    res.other = vec4u(
        u32(foundTri), bitcast<u32>(uniforms.forward.a) + 1u, material, 0u
    );

    result[writeToIndex] = res;
};

//for bvh-ray intersection
fn AABBIntersect(low : vec3f, high : vec3f, o : vec3f, d : vec3f) -> f32 {
    var iDir = 1. / d;
    var f = (high - o) * iDir; var n = (low - o) * iDir;
    var tmax = max(f, n); var tmin = min(f, n);
    var t0 = max(tmin.x, max(tmin.y, tmin.z));
    var t1 = min(tmax.x, min(tmax.y, tmax.z));
    return select(-1e30, select(t0, -1e30, t1 < 0.), t1 >= t0);
}