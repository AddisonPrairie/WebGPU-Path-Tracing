@vertex 
fn vs(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f {
    switch(vertexIndex) {
        case 0u: {
            return vec4f(1., 1., 0., 1.);}
        case 1u: {
            return vec4f(-1., 1., 0., 1.);}
        case 2u: {
            return vec4f(-1., -1., 0., 1.);}
        case 3u: {
            return vec4f(1., -1., 0., 1.);}
        case 4u: {
            return vec4f(1., 1., 0., 1.);}
        case 5u: {
            return vec4f(-1., -1., 0., 1.);}
        default: {
            return vec4f(0., 0., 0., 0.);}
    }
}

struct Uniforms {
    screenWidth : f32, screenHeight : f32
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var<storage, read> finalColorBuffer : array<vec4f>;

@fragment 
fn fs(@builtin(position) fragCoord : vec4f) -> @location(0) vec4f {
    var idx = u32(fragCoord.x) + u32(fragCoord.y) * u32(uniforms.screenWidth);

    return vec4f(toneMap(finalColorBuffer[idx].xyz), 1.);
}

fn toneMap(z : vec3f) -> vec3f {
    return z / vec3f(1. + dot(z, vec3f(.2126, .7152, .0722)));
}

fn ACESFilm(x : vec3f) -> vec3f {
    var a = 2.51;
    var b = 0.03;
    var c = 2.43;
    var d = 0.59;
    var e = 0.14;
    return pow((x*(a*x+b))/(x*(c*x+d)+e), vec3f(1. / 2.2));
}