import {buildBVH} from "./bvh.js";
import { convertHDRtoFloat4 } from "./hdr.js";
import {init, GPUFrame, downloadImage} from "./renderFrame.js";
import {
    createScene, sceneAddMesh,
    sceneMakeGPUArrays, sceneLoadObjects
} from "./scene.js";
import {initUI} from "./utils.js";


window.onload = async () => {
    let theta = 0; let phi = 0; let rotationChanged = false;
    const uiChangedFlags = {
        "camera": true,
        "rendersize": false
    };
    
    //initialize all of the UI widgets/windows
    let {getObjects, getMaterials} = initUI(rotationCallBack, uiChangedFlags, convertMeshes);
    
    //load in the HDR
    const hdr = await convertHDRtoFloat4();
    const scene = createScene();

    //used by UI
    async function convertMeshes(arrs, callback) {
        for (var x in arrs) {
            let curArr = arrs[x];
            let {bvhbuffer, tribuffer, bounds} = await buildBVH(curArr["tris"]);
            sceneAddMesh(scene, bvhbuffer, tribuffer, bounds);
            callback(Math.floor(curArr["tris"].length / 9), curArr["name"]);
        }
    };
    //load in starter model - floor
    {
        let floor = [];
        let dist = 1.; let h = 0.;
        floor.push(-dist); floor.push(-dist); floor.push(h);
        floor.push(dist); floor.push(-dist); floor.push(h);
        floor.push(-dist); floor.push(dist); floor.push(h);

        floor.push(dist); floor.push(dist); floor.push(h);
        floor.push(-dist); floor.push(dist); floor.push(h);
        floor.push(dist); floor.push(-dist); floor.push(h);

        let {bvhbuffer, tribuffer, bounds} = await buildBVH(floor);
        sceneAddMesh(scene, bvhbuffer, tribuffer, bounds);
    }
    //make sure initial BVH is built
    document.querySelector("#new-object").onclick();
    sceneLoadObjects(scene, getObjects());
    let {bvh, tri} = sceneMakeGPUArrays(scene);

    const canvas = document.querySelector("#render-result");
    let GPUInfo = await init(canvas, bvh, tri, hdr);

    //make sure that the canvas is always properly in view
    function resizeCanvas() {
        const W = canvas.width; const H = canvas.height;
        let sHeight = .95 * window.innerHeight;
        let sWidth = sHeight * W / H;
        if (sWidth >= .95 * window.innerWidth) {
            sWidth = .95 * window.innerWidth;
            sHeight = sWidth * H / W;
        }
        document.querySelector(":root").style.setProperty("--canvas-width", sWidth + "px");
        document.querySelector(":root").style.setProperty("--canvas-height", sHeight + "px");
    } resizeCanvas();
    new ResizeObserver(resizeCanvas).observe(document.body);

    //flags for executing certain things each frame
    const flags = {"download": false, "exit": false};
    document.querySelector("#download-image").onclick = () => {
        flags["download"] = true;
    };

    function play() {
        document.querySelector("#pause").onclick = pause;
        document.querySelector("#pause").innerHTML = "Pause Render";
        frame();
    }
    function pause() {
        flags["exit"] = true;
        document.querySelector("#pause").innerHTML = "Start Render";
        document.querySelector("#pause").onclick = play;
    }
    play();

    document.querySelector("#reset").onclick = () => {
        GPUInfo["uniformValues"]["reset"] = true;
    };

    //main loop called each fram
    async function frame() {
        if (flags["download"]) {
            await downloadImage(GPUInfo);
            flags["download"] = false;
        }
        if (flags["exit"]) {
            flags["exit"] = false;
            return;
        }
        if (uiChangedFlags["material"]) {
            uiChangedFlags["material"] = false;
            GPUInfo["uniformValues"]["reset"] = true;
            GPUInfo["loadMaterials"](getMaterials());
        }
        if (rotationChanged || uiChangedFlags["camera"]) {
            const ct = Math.cos(theta); const st = Math.sin(theta);
            const cp = Math.cos(phi); const sp = Math.sin(phi);
            const dist = parseFloat(document.querySelector("#camDistance").value);
            const posX = parseFloat(document.querySelector("#camOffsetX").value);
            const posY = parseFloat(document.querySelector("#camOffsetY").value);
            const posZ = parseFloat(document.querySelector("#camOffsetZ").value);
            GPUInfo["uniformValues"]["position"] = [
                ct * cp * -dist + posX, st * cp * -dist + posY, sp * -dist + posZ
            ];
            GPUInfo["uniformValues"]["forward"] = [
                ct * cp, st * cp, sp
            ]
            GPUInfo["uniformValues"]["left"] = [
                -st, ct, 0.
            ];
            GPUInfo["uniformValues"]["focal"] = parseFloat(document.querySelector("#focal").value);
            GPUInfo["uniformValues"]["aperture"] = parseFloat(document.querySelector("#aperture").value);
            GPUInfo["uniformValues"]["reset"] = true;
            rotationChanged = false;
            uiChangedFlags["camera"] = false;
        }
        if (uiChangedFlags["scene"]) {
            GPUInfo["uniformValues"]["reset"] = true;
            sceneLoadObjects(scene, getObjects());
            let {bvh, tri} = sceneMakeGPUArrays(scene);
            GPUInfo["loadScene"](bvh, tri);
            uiChangedFlags["scene"] = false;
        }
        if (uiChangedFlags["rendersize"]) {
            await GPUInfo["resize"](parseInt(document.querySelector("#renderX").value), parseInt(document.querySelector("#renderY").value), canvas);
            GPUInfo["uniformValues"]["reset"] = true;
            uiChangedFlags["rendersize"] = false;
        }
        await GPUFrame(GPUInfo);
        window.requestAnimationFrame(frame);
    } frame();

    //used by UI
    function rotationCallBack(a, b) {
        theta = a; phi = b; rotationChanged = true;
    }
};