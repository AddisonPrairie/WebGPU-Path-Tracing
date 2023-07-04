import {hdrToFloats} from "../wasm/hdrToFloats.js";
import hdrToFloatsModule from "../wasm/hdrToFloats.wasm";

const wasm = hdrToFloats({
    locateFile(path) {
      if (path.endsWith(`.wasm`)) {
        return hdrToFloatsModule
      }
      return path
    },
});

export async function convertHDRtoFloat4() {
    const wasmInstance = await wasm;

    const HDRBuffer = await fetch("HDRs/outdoor0.hdr").then((response) => {return response.arrayBuffer()});
    var buf = wasmInstance._malloc(HDRBuffer.byteLength);
    wasmInstance.HEAP8.set(new Int8Array(HDRBuffer), buf);

    wasmInstance.ccall("hdrToFloats", "number", ["number", "number"], [HDRBuffer.byteLength, buf]);

    const outReadValue = new Int32Array(
        wasmInstance.HEAP8.buffer, buf, 3
    );

    const outHDRI = new Float32Array(
        wasmInstance.HEAP8.buffer, outReadValue[2], outReadValue[0] * outReadValue[1] * 4
    );
    const copyHDRI = new Float32Array(new ArrayBuffer(outHDRI.byteLength));
    copyHDRI.set(outHDRI);

    return {
        buffer: copyHDRI.buffer,
        width:  outReadValue[0],
        height: outReadValue[1]
    };
}
