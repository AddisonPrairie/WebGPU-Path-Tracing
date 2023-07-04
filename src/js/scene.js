//the scene class handles all of the meshes/materials/objects
export function createScene() {
    return {
        meshes: [],
        objects: [],
        didChange: false
    };
}

//sceneAddMesh(scene, bvhbuffer, tribuffer, bounds);
export function sceneAddMesh(scene, bvhbuffer, tribuffer, bounds) {
    const newBVH = new Float32Array(bvhbuffer.length);
    newBVH.set(bvhbuffer);
    const newTris = new Float32Array(tribuffer.length);
    newTris.set(tribuffer);
    
    scene.meshes.push({
        bounds: bounds,
        bvh: newBVH,
        tri: newTris
    });
}

function sceneAddObject(scene, meshIdx) {
    if (meshIdx >= scene.meshes.length) {
        console.error("in add object: mesh does not exist");
        return false;
    }
    scene.objects.push({
        mesh: meshIdx,
        material: 0,
        transforms: {
            position: {x: 0, y: 0, z: 0},
            scale: 1.,
            rotation: {x: 0, y: 0, z: 0}
        }
    });
    scene.didChange = true;
    return true;
}

export function sceneLoadObjects(scene, arr) {
    scene.objects = [];
    for (var x in arr) {
        const mesh = Math.min(arr[x].mesh, scene.meshes.length - 1);
        
        sceneAddObject(scene, mesh);
        scene.objects[x].material = arr[x].material;
        scene.objects[x].transforms = {
            position: {
                "x": arr[x].position[0], "y": arr[x].position[1], "z": arr[x].position[2]
            },
            scale: arr[x].scale,
            rotation: {
                "x": arr[x].rotation[0], "y": arr[x].rotation[1], "z": arr[x].rotation[2]
            }
        };
    }
}

//creates the TLAS bvh
function BVHFromNodes(node) {
    node.bounds = nodesListBounds(node.objs);
    if (node.objs.length == 1) {
        return;
    }
    let xRes = findSplit(node.objs, "x");
    let yRes = findSplit(node.objs, "y");
    let zRes = findSplit(node.objs, "z");

    let minCost = Math.min(Math.min(xRes.sah, yRes.sah), zRes.sah);
    let leftArr = [];
    let rightArr = [];
    if (xRes == minCost) {
        for (let i = 0; i < node.objs.length; i++) {
            if (node.objs[i].centroid.x <= xRes.split) {
                leftArr.push(node.objs[i]);
            } else {
                rightArr.push(node.objs[i]);
            }
        }
    } else if (yRes == minCost) {
        for (let i = 0; i < node.objs.length; i++) {
            if (node.objs[i].centroid.y <= yRes.split) {
                leftArr.push(node.objs[i]);
            } else {
                rightArr.push(node.objs[i]);
            }
        }
    } else {
        for (let i = 0; i < node.objs.length; i++) {
            if (node.objs[i].centroid.z <= zRes.split) {
                leftArr.push(node.objs[i]);
            } else {
                rightArr.push(node.objs[i]);
            }
        }
    }

    if (leftArr.length == 0) {
        console.error("note - same position in costruction?");
        leftArr.push(rightArr.pop());
    } else if (rightArr.length == 0) {
        console.error("note - same position in construction?");
        rightArr.push(leftArr.pop());
    }
    node.objs = [];

    node.left = {
        objs: leftArr
    };
    node.right = {
        objs: rightArr
    };

    BVHFromNodes(node.left);
    BVHFromNodes(node.right);
}

//builds the TLAS bvh, combines it with the BLAS, creates buffers for GPU
export function sceneMakeGPUArrays(scene) {
    //prep them for creating a BVH
    let nodes = [];
    for (let i = 0; i < scene.objects.length; i++) {
        let s = scene.objects[i].transforms.scale;
        let p = scene.objects[i].transforms.position;
        let r = scene.objects[i].transforms.rotation;
        let b = scene.meshes[scene.objects[i].mesh].bounds;
        let bl = b.min;
        let bh = b.max;

        const corners = [
            [bl.x * s, bl.y * s, bl.z * s],
            [bh.x * s, bl.y * s, bl.z * s],
            [bh.x * s, bh.y * s, bl.z * s],
            [bl.x * s, bh.y * s, bl.z * s],
            [bl.x * s, bl.y * s, bh.z * s],
            [bh.x * s, bl.y * s, bh.z * s],
            [bh.x * s, bh.y * s, bh.z * s],
            [bl.x * s, bh.y * s, bh.z * s],
        ];

        const cosX = Math.cos(r.x); const sinX = Math.sin(r.x);
        const cosY = Math.cos(r.y); const sinY = Math.sin(r.y);
        const cosZ = Math.cos(r.z); const sinZ = Math.sin(r.z);
        for (var x = 0; x < 8; x++) {
            corners[x] = [
                corners[x][0],
                corners[x][1] * cosX - corners[x][2] * sinX,
                corners[x][1] * sinX + corners[x][2] * cosX
            ];
            corners[x] = [
                corners[x][2] * sinY + corners[x][0] * cosY,
                corners[x][1],
                corners[x][2] * cosY - corners[x][0] * sinY
            ];
            corners[x] = [
                corners[x][0] * cosZ - corners[x][1] * sinZ,
                corners[x][0] * sinZ + corners[x][1] * cosZ,
                corners[x][2]
            ];
        }

        const nl = {
            "x": corners[0][0], "y": corners[0][1], "z": corners[0][2]
        };
        const nh = {
            "x": corners[0][0], "y": corners[0][1], "z": corners[0][2]
        };
        for (var x = 1; x < 8; x++) {
            nl.x = Math.min(nl.x, corners[x][0]);
            nl.y = Math.min(nl.y, corners[x][1]);
            nl.z = Math.min(nl.z, corners[x][2]);
            nh.x = Math.max(nh.x, corners[x][0]);
            nh.y = Math.max(nh.y, corners[x][1]);
            nh.z = Math.max(nh.z, corners[x][2]);
        }

        nodes.push({
            min: {
                x: p.x + nl.x,
                y: p.y + nl.y,
                z: p.z + nl.z
            },
            max: {
                x: p.x + nh.x,
                y: p.y + nh.y,
                z: p.z + nh.z
            },
            object: scene.objects[i]
        });
        let last = nodes[nodes.length - 1];
        last.centroid = {
            x: (last.min.x + last.max.x) * .5,
            y: (last.min.y + last.max.y) * .5,
            z: (last.min.z + last.max.z) * .5
        };
    }

    if (nodes.length == 0) {
        let buf = new ArrayBuffer(64);
        let dv = new DataView(buf); const byteOffset = 0;
        dv.setUint32(byteOffset +  0,      0, true);
        dv.setUint32(byteOffset +  4,      0, true);
        dv.setUint32(byteOffset +  8,      0, true);
        dv.setUint32(byteOffset + 12,      0, true);
        dv.setUint32(byteOffset + 16,      0, true);
        dv.setUint32(byteOffset + 20,      0, true);
        dv.setUint32(byteOffset + 24,      0, true);
        dv.setUint32(byteOffset + 28,     99, true);
        dv.setUint32(byteOffset + 32,      0, true);
        dv.setUint32(byteOffset + 36,      0, true);
        dv.setUint32(byteOffset + 40,      0, true);
        /*-------------------------------------------*/
        dv.setUint32(byteOffset + 48,      0, true);
        dv.setUint32(byteOffset + 52,      0, true);
        dv.setUint32(byteOffset + 56,      0, true);
        /*-------------------------------------------*/
        return {
            "bvh": new Float32Array(buf),
            "tri": new Float32Array(buf)
        };
    }

    //create BVH
    let rootNode = {objs: nodes};
    BVHFromNodes(rootNode);
    //flatten and pack to format
    let flattenedBVH = [];
    const addNode = (node) => {
        let idx = flattenedBVH.length;
        flattenedBVH.push(node);
        if (node.left) {
            addNode(node.left);
            flattenedBVH[idx].rightIndex = addNode(node.right);
        }
        return idx;
    }; addNode(rootNode);
    let packedArr = [];
    for (let i = 0; i < flattenedBVH.length; i++) {
        let newNode = {
        };
        if ("rightIndex" in flattenedBVH[i]) {//branch
            let rightIndex = flattenedBVH[i].rightIndex;
            newNode.lmin = {
                x: flattenedBVH[i + 1].bounds.min.x,
                y: flattenedBVH[i + 1].bounds.min.y,
                z: flattenedBVH[i + 1].bounds.min.z
            };
            newNode.lmax = {
                x: flattenedBVH[i + 1].bounds.max.x,
                y: flattenedBVH[i + 1].bounds.max.y,
                z: flattenedBVH[i + 1].bounds.max.z
            };
            newNode.rmin = {
                x: flattenedBVH[rightIndex].bounds.min.x,
                y: flattenedBVH[rightIndex].bounds.min.y,
                z: flattenedBVH[rightIndex].bounds.min.z
            };
            newNode.rmax = {
                x: flattenedBVH[rightIndex].bounds.max.x,
                y: flattenedBVH[rightIndex].bounds.max.y,
                z: flattenedBVH[rightIndex].bounds.max.z
            };
            newNode.right = rightIndex;
        } else {//leaf
            newNode.obj = flattenedBVH[i].objs[0].object;
        }
        packedArr.push(newNode);
    }

    //find all of the meshes that are actually used
    let usedMeshes = [];
    for (let i = 0; i < scene.objects.length; i++) {
        let found = false;
        for (let j = 0; j < usedMeshes.length; j++) {
            if (usedMeshes[j] === scene.objects[i].mesh) {
                found = true;
                continue;
            }
        }
        if (!found) {
            usedMeshes.push(scene.objects[i].mesh);
        }
    }
    
    let bufferByteSize = packedArr.length * 64; let meshByteOffsetMap = {};
    let trisCount = 0; let triOffsetMap = {};
    for (let i = 0; i < usedMeshes.length; i++) {
        meshByteOffsetMap[usedMeshes[i]] = bufferByteSize;
        bufferByteSize += scene.meshes[usedMeshes[i]].bvh.byteLength;
        triOffsetMap[usedMeshes[i]] = trisCount;
        trisCount += Math.floor(scene.meshes[usedMeshes[i]].tri.byteLength / 64)
    }

    for (let i = 0; i < packedArr.length; i++) {
        if ("obj" in packedArr[i]) {
            packedArr[i].ptr = Math.floor(meshByteOffsetMap[packedArr[i].obj.mesh] / 64);
            packedArr[i].trioff = triOffsetMap[packedArr[i].obj.mesh];
        }
    }

    const bvhBuffer = new ArrayBuffer(bufferByteSize);
    const dv = new DataView(bvhBuffer);
    for (let i = 0; i < packedArr.length; i++) {
        const byteOffset = i * 64;
        const c = packedArr[i];
        if ("obj" in c) {
            const p = c.obj.transforms.position;
            const r = c.obj.transforms.rotation;
            const s = c.obj.transforms.scale;
            const m = c.obj.material;
            dv.setFloat32(byteOffset +  0,      p.x, true);
            dv.setFloat32(byteOffset +  4,      p.y, true);
            dv.setFloat32(byteOffset +  8,      p.z, true);
            dv.setUint32 (byteOffset + 12, 91234569, true);
            dv.setFloat32(byteOffset + 16,      r.x, true);
            dv.setFloat32(byteOffset + 20,      r.y, true);
            dv.setFloat32(byteOffset + 24,      r.z, true);
            dv.setUint32 (byteOffset + 28,      0  , true);
            dv.setFloat32(byteOffset + 32,        s, true);
            dv.setFloat32(byteOffset + 36,        s, true);
            dv.setFloat32(byteOffset + 40,        s, true);
            /*-------------------------------------------*/
            dv.setUint32 (byteOffset + 48, c.trioff, true);
            dv.setUint32 (byteOffset + 52,    c.ptr, true);
            dv.setUint32 (byteOffset + 56,        m, true);
            /*-------------------------------------------*/
        } else {
            dv.setFloat32(byteOffset +  0, c.lmin.x, true);
            dv.setFloat32(byteOffset +  4, c.lmin.y, true);
            dv.setFloat32(byteOffset +  8, c.lmin.z, true);
            dv.setUint32 (byteOffset + 12, c.right , true);
            dv.setFloat32(byteOffset + 16, c.lmax.x, true);
            dv.setFloat32(byteOffset + 20, c.lmax.y, true);
            dv.setFloat32(byteOffset + 24, c.lmax.z, true);
            dv.setUint32 (byteOffset + 28, 123456  , true);
            dv.setFloat32(byteOffset + 32, c.rmin.x, true);
            dv.setFloat32(byteOffset + 36, c.rmin.y, true);
            dv.setFloat32(byteOffset + 40, c.rmin.z, true);
            /*-------------------------------------------*/
            dv.setFloat32(byteOffset + 48, c.rmax.x, true);
            dv.setFloat32(byteOffset + 52, c.rmax.y, true);
            dv.setFloat32(byteOffset + 56, c.rmax.z, true);
            /*-------------------------------------------*/
        }
    }

    const triBuffer = new ArrayBuffer(trisCount * 64);
    for (let i = 0; i < usedMeshes.length; i++) {
        const arrBVH = new Float32Array(
            bvhBuffer, meshByteOffsetMap[usedMeshes[i]], scene.meshes[usedMeshes[i]].bvh.length
        );
        arrBVH.set(scene.meshes[usedMeshes[i]].bvh);
        const arrTri = new Float32Array(
            triBuffer, triOffsetMap[usedMeshes[i]] * 64, scene.meshes[usedMeshes[i]].tri.length
        );
        arrTri.set(scene.meshes[usedMeshes[i]].tri);
    }

    return {
        "bvh" : new Float32Array(bvhBuffer),
        "tri" : new Float32Array(triBuffer)
    };
}

//helper functions for BVH construction
function nodesListBounds(list) {
    if (list.length == 0) {
        return {
            min: {x: -1e30, y: -1e30, z: -1e30},
            max: {x: 1e30, y: 1e30, z: 1e30}
        };
    }
    let minX = list[0].min.x; let minY = list[0].min.y; let minZ = list[0].min.z;
    let maxX = list[0].max.x; let maxY = list[0].max.y; let maxZ = list[0].max.z;
    for (let i = 1; i < list.length; i++) {
        minX = Math.min(minX, list[i].min.x);
        minY = Math.min(minY, list[i].min.y);
        minZ = Math.min(minZ, list[i].min.z);
        maxX = Math.max(maxX, list[i].max.x);
        maxY = Math.max(maxY, list[i].max.y);
        maxZ = Math.max(maxZ, list[i].max.z);
    }
    return {
        min: {
            x: minX, y: minY, z: minZ
        },
        max: {
            x: maxX, y: maxY, z: maxZ
        }
    };
}

function findSplit(objs, axis) {
    let minSAH = 999999999999.;
    let split;
    for (let i = 0; i < objs.length; i++) {
        if (costSplit(objs, objs[i].centroid[axis], axis) < minSAH) {
            split = objs[i].centroid[axis];
        }
    }
    return {
        sah: minSAH,
        split: split
    };
}

function costSplit(objs, split, axis) {
    let listLeft = [];
    let listRight = [];
    for (let i = 0; i < objs.length; i++) {
        if (objs[i].centroid[axis] <= split) {
            listLeft.push(objs[i]);
        } else {
            listRight.push(objs[i]);
        }
    }
    let bl = nodesListBounds(listLeft);
    let br = nodesListBounds(listRight);
    let le = {
        x: bl.max.x - bl.min.x,
        y: bl.max.y - bl.min.y,
        z: bl.max.z - bl.min.z
    };
    let re = {
        x: br.max.x - br.min.x,
        y: br.max.y - br.min.y,
        z: br.max.z - br.min.z
    };
    return listLeft.length * (le.x * le.y + le.y * le.z + le.x * le.z) +
          listRight.length * (re.x * re.y + re.y * re.z + re.x * re.z)
}