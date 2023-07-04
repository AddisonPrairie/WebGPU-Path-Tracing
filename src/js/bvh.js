import {bvhbuild} from "../wasm/bvhbuild.js";
import bvhbuildModule from "../wasm/bvhbuild.wasm";

const wasm = bvhbuild({
    locateFile(path) {
      if (path.endsWith(`.wasm`)) {
        return bvhbuildModule
      }
      return path
    },
});

export async function buildBVH(trisArr) {
    const numTris = Math.floor(trisArr.length / 9.);
    const bvhBuildInstance = await wasm;

    var buf = bvhBuildInstance._malloc(numTris * 9 * 4);
    bvhBuildInstance.HEAP8.set(new Int8Array(new Float32Array(trisArr).buffer), buf);

    const blockingElem = document.createElement("div");
    blockingElem.style.width = "100%"; blockingElem.style.height = "100%"; 
    blockingElem.style.position = "absolute"; blockingElem.style.background = "rgba(60, 60, 60, .5)";
    blockingElem.style["z-index"] = 100;
    blockingElem.style.display = "flex"; blockingElem.style.alignItems = "center"; blockingElem.style["justify-content"] = "center";
    const textElem = document.createElement("div"); textElem.innerHTML = "building bvh...";
    textElem.style["font-family"] = `'Roboto', sans-serif`; textElem.style["font-size"] = "15px"; textElem.style.color = "#cccccc"; textElem.style.cursor = "default";
    blockingElem.appendChild(textElem);
    document.body.appendChild(blockingElem);

    await new Promise(r => setTimeout(r, 20));

    bvhBuildInstance.ccall("bvhbuild", "number", ["number", "number"], [numTris, buf])

    const outReadValue = new Int32Array(
        bvhBuildInstance.HEAP8.buffer, buf, 4
    );

    const outBVH = new Float32Array(
        bvhBuildInstance.HEAP8.buffer, outReadValue[1], outReadValue[0] * 16
    );
    const outTris = new Float32Array(
        bvhBuildInstance.HEAP8.buffer, outReadValue[3], outReadValue[2] * 16
    );

    let minX = 100000000000; let minY = 100000000000; let minZ = 100000000000;
    let maxX = -100000000000;let maxY = -100000000000;let maxZ = -100000000000;
    const numVerts = numTris * 3;
    for (var i = 0; i < numVerts; i++) {
        minX = Math.min(minX, trisArr[i * 3 + 0]);
        minY = Math.min(minY, trisArr[i * 3 + 1]);
        minZ = Math.min(minZ, trisArr[i * 3 + 2]);
        maxX = Math.max(maxX, trisArr[i * 3 + 0]);
        maxY = Math.max(maxY, trisArr[i * 3 + 1]);
        maxZ = Math.max(maxZ, trisArr[i * 3 + 2]);
    }

    blockingElem.remove();

    const  e = 0.;
    return {
        "bvhbuffer": outBVH,
        "tribuffer": outTris,
        "bounds": {
            min: {x: minX, y: minY, z: minZ},
            max: {x: maxX, y: maxY, z: maxZ}
        }
    };
}
