import fullscreenWGSL from "../shaders/fullscreen.wgsl";
import logicWGSL from "../shaders/logic.wgsl";
import materialWGSL from "../shaders/material.wgsl";
import newrayWGSL from "../shaders/newray.wgsl";
import raycastWGSL from "../shaders/raycast.wgsl";

export async function init(canvas, initBVHBuffer, initTriBuffer, hdri) {
    let info = {};

    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    
    if (!device) {
        console.error("browser does not support webGPU");
        return {err: true};
    }
    info["device"] = device;

    const context = canvas.getContext("webgpu");
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({device, format: presentationFormat});
    info["context"] = context;
    info["canvas"] = canvas;


    //let {addComputePass, computeOutputBuffer} = makeComputePass(device, [canvas.clientWidth, canvas.clientHeight], initBVHBuffer, initTriBuffer);
    let {addComputePass, computeOutputBuffer, bufferInfo, resizeOutput,loadScene, loadMaterials} = makeComputePass2(device, [canvas.width, canvas.height], initBVHBuffer, initTriBuffer, hdri);
    let {addFullScreenPass, resizeFullscreen} = makeFullScreenPass(device, presentationFormat, [canvas.width, canvas.height], computeOutputBuffer);

    info["imageBuffer"] = computeOutputBuffer;
    info["bufferInfo"] = bufferInfo;
    info["addComputePass"] = addComputePass;
    info["addFullScreenPass"] = addFullScreenPass;
    info["loadMaterials"] = loadMaterials;

    info["resize"] = async (W, H, cv) => {
        if (W * H > 2_001_000) {
            document.querySelector("#renderY").value = parseInt(cv.width);
            document.querySelector("#renderY").value = parseInt(cv.height);
            return;
        }
        const newImageBuffer = await resizeOutput(info, W, H, cv);
        info["imageBuffer"] = newImageBuffer;
        info["uniformValues"]["rendersize"] = [W, H];
        resizeFullscreen(newImageBuffer);
    };
    info["loadScene"] = loadScene;

    let theta = 0.; let phi = 0.;
    let ct = Math.cos(theta);
    let st = Math.sin(theta);
    let cp = Math.cos(phi);
    let sp = Math.sin(phi);
    let dist = 20;
    info["uniformValues"] = {
        "rendersize": [canvas.width, canvas.height],
        "position": [ct * cp * -dist, st * cp * -dist, sp * -dist + 4.5],
        "forward": [ct * cp, st * cp, sp],
        "left": [-st, ct, 0.],
        "focal": [5.5],
        "aperture": [.1],
        "frames": [0],
        "pathoffset": [0],
        "reset": false
    };

    return info;
}

//used to save the image from the GPU
export async function downloadImage(info) {
    const canvas = info["canvas"];
    const pixels = canvas.width * canvas.height;
    const readBuffer = info["device"].createBuffer({
        size: pixels * 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    const commandEncoder = info["device"].createCommandEncoder();
    commandEncoder.copyBufferToBuffer(info["imageBuffer"], 0, readBuffer, 0, pixels * 16);
    info["device"].queue.submit([commandEncoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const readCPUBuffer = readBuffer.getMappedRange();
    const readArrayFloats = new Float32Array(readCPUBuffer);

    const imageBuffer = new Uint8ClampedArray(pixels * 4);
    for (var i = 0; i < pixels; i++) {
        const i4 = i * 4;
        const mult = 255. / (1. + readArrayFloats[i4 + 0] * .2126 + readArrayFloats[i4 + 1] * .7152 + readArrayFloats[i4 + 2] * .0722);
        imageBuffer[i4 + 0] = readArrayFloats[i4 + 0] * mult;
        imageBuffer[i4 + 1] = readArrayFloats[i4 + 1] * mult;
        imageBuffer[i4 + 2] = readArrayFloats[i4 + 2] * mult;
        imageBuffer[i4 + 3] = 255;
    }

    readBuffer.unmap();
    readBuffer.destroy();

    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    c.width = canvas.width; c.height = canvas.height;
    const idata = ctx.createImageData(canvas.width, canvas.height);
    idata.data.set(imageBuffer);
    ctx.putImageData(idata, 0, 0);

    var link = document.createElement("a");
    link.download = "save.png";
    link.href = c.toDataURL();
    link.click();
}

export async function GPUFrame(info) {
    //even though this shouldnt be done here, for now we just will
    const commandEncoder = info["device"].createCommandEncoder();
    for (var i = 0; i < 3; i++) {
        await info["addComputePass"](info);
    }
    info["addFullScreenPass"](info["context"], commandEncoder, info);
    info["device"].queue.submit([commandEncoder.finish()]);
}

//makes the render pass that will draw the image buffer to the canvas
function makeFullScreenPass(device, presentationFormat, renderSize, finalImageBuffer) {
    let bgLayout = device.createBindGroupLayout({
        label: "Full Screen Bind Group Layout",
        entries: [ {
            binding: 0, visibility: GPUShaderStage.FRAGMENT,
            buffer: {type: "uniform"}
            }, {
            binding: 1, visibility: GPUShaderStage.FRAGMENT,
            buffer: {type: "read-only-storage"}
            }
        ]
    });

    const shaderModule = device.createShaderModule({
        label: "Full Screen Pass", code: fullscreenWGSL,
    });

    const pipeline = device.createRenderPipeline({
        label: "Full Screen Pipeline",
        layout: device.createPipelineLayout({bindGroupLayouts: [bgLayout]}),
        vertex: {
            module: shaderModule, entryPoint: "vs",
        },
        fragment: {
            module: shaderModule, entryPoint: "fs",
            targets: [{format: presentationFormat}]
        }
    });

    const uniformBufferSize = 4 * 2; // screen width & height
    const uniformBuffer = device.createBuffer({
        size: uniformBufferSize, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    let bg = device.createBindGroup({
        label: "Full Screen Bind Group",
        layout: bgLayout,
        entries: [ {
            binding: 0, resource: {buffer: uniformBuffer}
            }, {
            binding: 1, resource: {buffer: finalImageBuffer}
            }
        ]
    });

    const renderPassDescriptor = {
        colorAttachments: [
            {
                view: undefined,
                clearValue: {r: 1., g: 0., b: 0., a: 1.},
                loadOp: "clear", storeOp: "store"
            }
        ]
    };

    const resizeFullscreen = (newBuffer) => {
        bg = device.createBindGroup({
            label: "Full Screen Bind Group",
            layout: bgLayout,
            entries: [ {
                binding: 0, resource: {buffer: uniformBuffer}
                }, {
                binding: 1, resource: {buffer: newBuffer}
                }
            ]
        });
    };

    const addFullScreenPass = (context, commandEncoder, info) => {
        device.queue.writeBuffer(
            uniformBuffer, 0, new Float32Array([info["uniformValues"]["rendersize"][0], info["uniformValues"]["rendersize"][0]])
        );

        renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();

        const pass = commandEncoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bg);
        pass.draw(6);
        pass.end();
    };

    return {addFullScreenPass, resizeFullscreen};
}

//make wavefront compute pass
function makeComputePass2(device, targetDimension, initBVHBuffer, initTriBuffer, hdri) {
    let W = targetDimension[0]; let H = targetDimension[1];
    let numPaths = W * H;
    //used to resize buffers later on
    const bufferInfo = {};

    const logicSM = device.createShaderModule({
        label: "Wavefront Logic Stage Shader Module", code: logicWGSL
    });
    const materialSM = device.createShaderModule({
        label: "Wavefront Material Stage Shader Module", code: materialWGSL
    });
    const newraySM = device.createShaderModule({
        label: "Wavefront New Ray Stage Shader Module", code: newrayWGSL
    });
    const raycastSM = device.createShaderModule({
        label: "Wavefront Ray Cast Stage Shader Module", code: raycastWGSL
    });

    bufferInfo["ShaderModules"] = {
        "logic": logicSM, "material": materialSM, "newray": newraySM, "raycast": raycastSM
    };

    let raycastInfoSize = 32 * numPaths;//vec4f startPos, vec4f direction
    const raycastInfoBuffer = device.createBuffer({
        size: raycastInfoSize, usage: GPUBufferUsage.STORAGE
    });

    let raycastResultSize = 32 * numPaths;//vec4f normal/distance, vec4u hit?/tri-index/..
    const raycastResultBuffer = device.createBuffer({
        size: raycastResultSize, usage: GPUBufferUsage.STORAGE
    });

    let materialResultSize = 32 * numPaths;//vec4f brdf/pdf, vec4f hit?/...
    const materialResultBuffer = device.createBuffer({
        size: materialResultSize, usage: GPUBufferUsage.STORAGE
    });

    let logicSize = 16 * numPaths;//vec4f throughput/outputIndex
    const logicBuffer = device.createBuffer({
        size: logicSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    let queueSize = 4 * numPaths;//u32 idx
    const materialQueueBuffer = device.createBuffer({
        size: queueSize, usage: GPUBufferUsage.STORAGE
    });
    const newrayQueueBuffer = device.createBuffer({
        size: queueSize, usage: GPUBufferUsage.STORAGE
    });
    const raycastQueueBuffer = device.createBuffer({
        size: queueSize, usage: GPUBufferUsage.STORAGE
    });

    const stageOneQueueCountsBuffer = device.createBuffer({
        size: (4) * 2, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    });

    const stageTwoQueueCountsBuffer = device.createBuffer({
        size: (4) * 1, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    });

    const bvhBuffer = device.createBuffer({
        size: initBVHBuffer.byteLength,
        usage: GPUBufferUsage.STORAGE,
        mappedAtCreation: true
    }); new Float32Array(bvhBuffer.getMappedRange()).set(initBVHBuffer);
    bvhBuffer.unmap();

    const triBuffer = device.createBuffer({
        size: initTriBuffer.byteLength,
        usage: GPUBufferUsage.STORAGE,
        mappedAtCreation: true
    }); new Float32Array(triBuffer.getMappedRange()).set(initTriBuffer);
    triBuffer.unmap();

    const uniformBufferSize = Math.ceil((
        4 * 4 + //screen width & height & padding
        4 * 4 + //position vector & padding
        4 * 4 + //forward vector & padding
        4 * 4 + //right vector & padding
        4 * 2   //focal distance & aperture
    ) / 16) * 16;
    const uniformBuffer = device.createBuffer({
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    let outputBufferSize = Float32Array.BYTES_PER_ELEMENT * W * H * 4;
    const computeOutputBuffer = device.createBuffer({
        label: "Compute Image Buffer",
        size: outputBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    });

    const materialBuffer = device.createBuffer({
        label: "material buffer",
        size: Math.ceil((32 * 32 + 32 * 4) / 16) * 16, 
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    bufferInfo["buffers"] = {
        "raycastInfo": raycastInfoBuffer, "raycastResult": raycastResultBuffer, "materialResult": materialResultBuffer,
        "logic": logicBuffer, "materialQueue": materialQueueBuffer, "newrayQueue": newrayQueueBuffer,
        "raycastQueue": raycastQueueBuffer, "stageOneQueueCounts": stageOneQueueCountsBuffer, "stageTwoQueueCounts": stageTwoQueueCountsBuffer,
        "bvh": bvhBuffer, "tri": triBuffer, "uniform": uniformBuffer, "output": computeOutputBuffer,
        "material": materialBuffer
    };

    const IBLTexture = device.createTexture({
        size: [hdri.width, hdri.height],
        format: "rgba32float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });

    device.queue.writeTexture(
        {texture: IBLTexture}, hdri.buffer,
        {bytesPerRow: hdri.width * 16},
        {width: hdri.width, height: hdri.height}
    );

    const logicBGLayout = device.createBindGroupLayout({
        label: "Wave Front Logic Kernel Bind Group Layout",
        entries: [
            {//uniform buffer
                binding: 0, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "uniform"}
            },
            {//raycast result buffer
                binding: 1, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//material result buffer
                binding: 2, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//"logic" buffer
                binding: 3, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//material queue
                binding: 4, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//new ray queue
                binding: 5, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//stage 1 queue count
                binding: 6, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//rendered image buffer
                binding: 7, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//HDRI texture
                binding: 8, visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: "unfilterable-float", viewDimension: "2d", multisampled: false
                }
            },
            {//raycast info buffer
                binding: 9, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "read-only-storage"}
            }
        ]
    });
    let logicBGEntries = [
        {
            binding: 0, resource: {buffer: uniformBuffer}
        },
        {
            binding: 1, resource: {buffer: raycastResultBuffer}
        },
        {
            binding: 2, resource: {buffer: materialResultBuffer}
        },
        {
            binding: 3, resource: {buffer: logicBuffer}
        },
        {
            binding: 4, resource: {buffer: materialQueueBuffer}
        },
        {
            binding: 5, resource: {buffer: newrayQueueBuffer}
        },
        {
            binding: 6, resource: {buffer: stageOneQueueCountsBuffer}
        },
        {
            binding: 7, resource: {buffer: computeOutputBuffer}
        },
        {
            binding: 8, resource: IBLTexture.createView(),
        },
        {
            binding: 9, resource: {buffer: raycastInfoBuffer}
        }
    ];
    const logicBG = device.createBindGroup({
        label: "Wave Front Logic Kernel Bind Group",
        layout: logicBGLayout,
        entries: logicBGEntries
    });

    const materialBGLayout = device.createBindGroupLayout({
        label: "Wave Front Material Kernel Bind Group Layout",
        entries: [
            {//uniform buffer
                binding: 0, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "uniform"}
            },
            {//raycast info buffer
                binding: 1, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//material result buffer
                binding: 2, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//material queue buffer
                binding: 3, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "read-only-storage"}
            },
            {//stage 2 queue count
                binding: 4, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//raycast queue buffer
                binding: 5, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//ray cast results buffer
                binding: 6, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "read-only-storage"}
            },
            {//stage 1 counts buffer
                binding: 7, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "read-only-storage"}
            },
            {//material buffer
                binding: 8, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "uniform"}
            }
        ]
    });
    let materialBGEntries = [
        {
            binding: 0, resource: {buffer: uniformBuffer}
        },
        {
            binding: 1, resource: {buffer: raycastInfoBuffer}
        },
        {
            binding: 2, resource: {buffer: materialResultBuffer}
        },
        {
            binding: 3, resource: {buffer: materialQueueBuffer}
        },
        {
            binding: 4, resource: {buffer: stageTwoQueueCountsBuffer}
        },
        {
            binding: 5, resource: {buffer: raycastQueueBuffer}
        },
        {
            binding: 6, resource: {buffer: raycastResultBuffer}
        },
        {
            binding: 7, resource: {buffer: stageOneQueueCountsBuffer}
        },
        {
            binding: 8, resource: {buffer: materialBuffer}
        }
    ];
    const materialBG = device.createBindGroup({
        label: "Wave Front Material Kernel Bind Group",
        layout: materialBGLayout,
        entries: materialBGEntries
    });

    const newrayBGLayout = device.createBindGroupLayout({
        label: "Wave Front New Ray Kernel Bind Group Layout",
        entries: [
            {//uniform buffer
                binding: 0, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "uniform"}
            },
            {//raycast info buffer
                binding: 1, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//logic buffer
                binding: 2, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//new ray queue buffer
                binding: 3, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "read-only-storage"}
            },
            {//stage 2 queue count
                binding: 4, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//raycast queue buffer
                binding: 5, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//stage 1 counts buffer
                binding: 6, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "read-only-storage"}
            }
        ]
    });
    let newrayBGEntries = [
        {
            binding: 0, resource: {buffer: uniformBuffer}
        },
        {
            binding: 1, resource: {buffer: raycastInfoBuffer}
        },
        {
            binding: 2, resource: {buffer: logicBuffer}
        },
        {
            binding: 3, resource: {buffer: newrayQueueBuffer}
        },
        {
            binding: 4, resource: {buffer: stageTwoQueueCountsBuffer}
        },
        {
            binding: 5, resource: {buffer: raycastQueueBuffer}
        },
        {
            binding: 6, resource: {buffer: stageOneQueueCountsBuffer}
        }
    ];
    const newrayBG = device.createBindGroup({
        label: "Wave Front New Ray Kernel Bind Group",
        layout: newrayBGLayout,
        entries: newrayBGEntries
    });

    const raycastBGLayout = device.createBindGroupLayout({
        label: "Wave Front Raycast Kernel Bind Group Layout",
        entries: [
            {//uniform buffer
                binding: 0, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "uniform"}
            },
            {//bvh buffer
                binding: 1, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "read-only-storage"}
            },
            {//tri buffer
                binding: 2, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "read-only-storage"}
            },
            {//raycast info buffer
                binding: 3, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "read-only-storage"}
            },
            {//ray cast result buffer
                binding: 4, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            },
            {//raycast queue buffer
                binding: 5, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "read-only-storage"}
            },
            {//raycast queue counts buffer
                binding: 6, visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "read-only-storage"}
            }
        ]
    });
    let raycastBGEntries = [
        {
            binding: 0, resource: {buffer: uniformBuffer}
        },
        {
            binding: 1, resource: {buffer: bvhBuffer}
        },
        {
            binding: 2, resource: {buffer: triBuffer}
        },
        {
            binding: 3, resource: {buffer: raycastInfoBuffer}
        },
        {
            binding: 4, resource: {buffer: raycastResultBuffer}
        },
        {
            binding: 5, resource: {buffer: raycastQueueBuffer}
        },
        {
            binding: 6, resource: {buffer: stageTwoQueueCountsBuffer}
        }
    ];
    const raycastBG = device.createBindGroup({
        label: "Wave Front Raycast Kernel Bind Group",
        layout: raycastBGLayout,
        entries: raycastBGEntries
    });
    bufferInfo["bindgroups"] = {
        "logic": {"entries": logicBGEntries, "layout": logicBGLayout, "bg": logicBG},
        "material": {"entries": materialBGEntries, "layout": materialBGLayout, "bg": materialBG},
        "newray": {"entries": newrayBGEntries, "layout": newrayBGLayout, "bg": newrayBG},
        "raycast": {"entries": raycastBGEntries, "layout": raycastBGLayout, "bg": raycastBG}
    };

    const logicPipeline = device.createComputePipeline({
        label: "Wave Front Logic Kernel Pipeline",
        layout: device.createPipelineLayout({bindGroupLayouts: [logicBGLayout]}),
        compute: {module: logicSM, entryPoint: "main"}
    });

    const newrayPipeline = device.createComputePipeline({
        label: "Wave Front New Ray Kernel Pipeline",
        layout: device.createPipelineLayout({bindGroupLayouts: [newrayBGLayout]}),
        compute: {module: newraySM, entryPoint: "main"}
    });

    const materialPipeline = device.createComputePipeline({
        label: "Wave Front Material Kernel Pipeline",
        layout: device.createPipelineLayout({bindGroupLayouts: [materialBGLayout]}),
        compute: {module: materialSM, entryPoint: "main"}
    });

    const raycastPipeline = device.createComputePipeline({
        label: "Wave Front Ray Cast Closest Kernel Pipeline",
        layout: device.createPipelineLayout({bindGroupLayouts: [raycastBGLayout]}),
        compute: {module: raycastSM, entryPoint: "main"}
    });

    bufferInfo["pipelines"] = {
        "logic": logicPipeline, "newray": newrayPipeline, "material": materialPipeline, "raycast": raycastPipeline
    };

    const queueCountsReadBuffer = device.createBuffer({
        size: (4) * 2, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });

    bufferInfo["buffers"]["queueCountsRead"] = queueCountsReadBuffer;

    const resizeOutput = async (info, newWidth, newHeight, canvas) => {
        const uniformValues = info["uniformValues"];
        W = newWidth; H = newHeight; numPaths = W * H;
        canvas.width = W; canvas.height = H;

        let sHeight = .95 * window.innerHeight;
        let sWidth = sHeight * W / H;
        if (sWidth >= .95 * window.innerWidth) {
            sWidth = .95 * window.innerWidth;
            sHeight = sWidth * H / W;
        }
        document.querySelector(":root").style.setProperty("--canvas-width", sWidth + "px");
        document.querySelector(":root").style.setProperty("--canvas-height", sHeight + "px");

        //recreate all buffers
        if (bufferInfo["buffers"]["output"]) {
            bufferInfo["buffers"]["output"].destroy();
        }
        bufferInfo["buffers"]["output"] = device.createBuffer({
            label: "output buffer",
            size: W * H * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        });
        raycastInfoSize = 32 * numPaths;
        if (bufferInfo["buffers"]["raycastInfo"]) {
            bufferInfo["buffers"]["raycastInfo"].destroy();
        }
        bufferInfo["buffers"]["raycastInfo"] = device.createBuffer({
            label: "raycast info buffer",
            size: raycastInfoSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });

        raycastResultSize = 32 * numPaths;
        if (bufferInfo["buffers"]["raycastResult"]) {
            bufferInfo["buffers"]["raycastResult"].destroy();
        }
        bufferInfo["buffers"]["raycastResult"] = device.createBuffer({
            label: "raycast result buffer",
            size: raycastResultSize, usage: GPUBufferUsage.STORAGE
        });

        materialResultSize = 32 * numPaths;
        if (bufferInfo["buffers"]["materialResult"]) {
            bufferInfo["buffers"]["materialResult"].destroy();
        }
        bufferInfo["buffers"]["materialResult"] = device.createBuffer({
            label: "material result buffer",
            size: materialResultSize, usage: GPUBufferUsage.STORAGE
        });

        logicSize = 16 * numPaths;
        if (bufferInfo["buffers"]["logic"]) {
            bufferInfo["buffers"]["logic"].destroy();
        }
        bufferInfo["buffers"]["logic"] = device.createBuffer({
            label: "logic buffer",
            size: logicSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        queueSize = 4 * numPaths;
        if (bufferInfo["buffers"]["materialQueue"]) {
            bufferInfo["buffers"]["materialQueue"].destroy();
        }
        bufferInfo["buffers"]["materialQueue"] = device.createBuffer({
            label: "material queue buffer",
            size: queueSize, usage: GPUBufferUsage.STORAGE
        });
        if (bufferInfo["buffers"]["newrayQueue"]) {
            bufferInfo["buffers"]["newrayQueue"].destroy();
        }
        bufferInfo["buffers"]["newrayQueue"] = device.createBuffer({
            label: "newray queue buffer",
            size: queueSize, usage: GPUBufferUsage.STORAGE
        });
        if (bufferInfo["buffers"]["raycastQueue"]) {
            bufferInfo["buffers"]["raycastQueue"].destroy();
        }
        bufferInfo["buffers"]["raycastQueue"] = device.createBuffer({
            label: "raycast queue buffer",
            size: queueSize, usage: GPUBufferUsage.STORAGE
        });
        //reset all entries in BGs
        //logicBG
        bufferInfo["bindgroups"]["logic"]["entries"][1]["resource"]["buffer"] = bufferInfo["buffers"]["raycastResult"];
        bufferInfo["bindgroups"]["logic"]["entries"][2]["resource"]["buffer"] = bufferInfo["buffers"]["materialResult"];
        bufferInfo["bindgroups"]["logic"]["entries"][3]["resource"]["buffer"] = bufferInfo["buffers"]["logic"];
        bufferInfo["bindgroups"]["logic"]["entries"][4]["resource"]["buffer"] = bufferInfo["buffers"]["materialQueue"];
        bufferInfo["bindgroups"]["logic"]["entries"][5]["resource"]["buffer"] = bufferInfo["buffers"]["newrayQueue"];
        bufferInfo["bindgroups"]["logic"]["entries"][7]["resource"]["buffer"] = bufferInfo["buffers"]["output"];
        bufferInfo["bindgroups"]["logic"]["entries"][9]["resource"]["buffer"] = bufferInfo["buffers"]["raycastInfo"];
        //materialBG
        bufferInfo["bindgroups"]["material"]["entries"][1]["resource"]["buffer"] = bufferInfo["buffers"]["raycastInfo"];
        bufferInfo["bindgroups"]["material"]["entries"][2]["resource"]["buffer"] = bufferInfo["buffers"]["materialResult"];
        bufferInfo["bindgroups"]["material"]["entries"][3]["resource"]["buffer"] = bufferInfo["buffers"]["materialQueue"];
        bufferInfo["bindgroups"]["material"]["entries"][5]["resource"]["buffer"] = bufferInfo["buffers"]["raycastQueue"];
        bufferInfo["bindgroups"]["material"]["entries"][6]["resource"]["buffer"] = bufferInfo["buffers"]["raycastResult"];
        //newrayBG
        bufferInfo["bindgroups"]["newray"]["entries"][1]["resource"]["buffer"] = bufferInfo["buffers"]["raycastInfo"];
        bufferInfo["bindgroups"]["newray"]["entries"][2]["resource"]["buffer"] = bufferInfo["buffers"]["logic"];
        bufferInfo["bindgroups"]["newray"]["entries"][3]["resource"]["buffer"] = bufferInfo["buffers"]["newrayQueue"];
        bufferInfo["bindgroups"]["newray"]["entries"][5]["resource"]["buffer"] = bufferInfo["buffers"]["raycastQueue"];
        //raycastBG
        bufferInfo["bindgroups"]["raycast"]["entries"][3]["resource"]["buffer"] = bufferInfo["buffers"]["raycastInfo"];
        bufferInfo["bindgroups"]["raycast"]["entries"][4]["resource"]["buffer"] = bufferInfo["buffers"]["raycastResult"];
        bufferInfo["bindgroups"]["raycast"]["entries"][5]["resource"]["buffer"] = bufferInfo["buffers"]["raycastQueue"];
        //recreate all BGs
        bufferInfo["bindgroups"]["logic"]["bg"] = info["device"].createBindGroup({
            label: "Wave Front Logic Kernel Bind Group",
            layout: bufferInfo["bindgroups"]["logic"]["layout"],
            entries: bufferInfo["bindgroups"]["logic"]["entries"]
        });
        bufferInfo["bindgroups"]["material"]["bg"] = info["device"].createBindGroup({
            label: "Wave Front Material Kernel Bind Group",
            layout: bufferInfo["bindgroups"]["material"]["layout"],
            entries: bufferInfo["bindgroups"]["material"]["entries"]
        });
        bufferInfo["bindgroups"]["newray"]["bg"] = info["device"].createBindGroup({
            label: "Wave Front NewRay Kernel Bind Group",
            layout: bufferInfo["bindgroups"]["newray"]["layout"],
            entries: bufferInfo["bindgroups"]["newray"]["entries"]
        });
        bufferInfo["bindgroups"]["raycast"]["bg"] = info["device"].createBindGroup({
            label: "Wave Front Raycast Kernel Bind Group",
            layout: bufferInfo["bindgroups"]["raycast"]["layout"],
            entries: bufferInfo["bindgroups"]["raycast"]["entries"]
        });

        return bufferInfo["buffers"]["output"];
    }

    const loadMaterials = (matArr) => {
        let types = new Uint32Array(32);
        let params = new Float32Array(32 * 8);
        for (var i = 0; i < matArr.length && i < 32; i++) {
            switch(matArr[i]["type"]) {
                case "diffuse":
                    types[i] = 0;
                    params[i * 8 + 0] = matArr[i]["color"][0];
                    params[i * 8 + 1] = matArr[i]["color"][1];
                    params[i * 8 + 2] = matArr[i]["color"][2];
                    break;
                case "glass":
                    types[i] = 1;
                    params[i * 8 + 0] = matArr[i]["surface-color"][0];
                    params[i * 8 + 1] = matArr[i]["surface-color"][1];
                    params[i * 8 + 2] = matArr[i]["surface-color"][2];
                    params[i * 8 + 3] = matArr[i]["IOR"][0];
                    params[i * 8 + 4] = matArr[i]["absorption-color"][0];
                    params[i * 8 + 5] = matArr[i]["absorption-color"][1];
                    params[i * 8 + 6] = matArr[i]["absorption-color"][2];
                    params[i * 8 + 7] = matArr[i]["density"][0];
                    break;
                case "mirror":
                    types[i] = 2;
                    params[i * 8 + 0] = matArr[i]["color"][0];
                    params[i * 8 + 1] = matArr[i]["color"][1];
                    params[i * 8 + 2] = matArr[i]["color"][2];
                    break;
                case "glossy":
                    types[i] = 3;
                    params[i * 8 + 0] = matArr[i]["color"][0];
                    params[i * 8 + 1] = matArr[i]["color"][1];
                    params[i * 8 + 2] = matArr[i]["color"][2];
                    params[i * 8 + 3] = matArr[i]["IOR"][0];
                    params[i * 8 + 4] = matArr[i]["glossy-color"][0];
                    params[i * 8 + 5] = matArr[i]["glossy-color"][1];
                    params[i * 8 + 6] = matArr[i]["glossy-color"][2];
                    break;
                default: 
                    console.error("reached default in material");
            }
        }
        const buf = new ArrayBuffer(types.byteLength + params.byteLength);
        new Float32Array(buf).set(params);
        new Uint32Array(buf).set(types, params.byteLength / 4);
        device.queue.writeBuffer(bufferInfo["buffers"]["material"], 0, buf);
    };

    const loadScene = (newBVH, newTri) => {
        if (bufferInfo["buffers"]["bvh"]) {
            bufferInfo["buffers"]["bvh"].destroy();
        }
        if (bufferInfo["buffers"]["tri"]) {
            bufferInfo["buffers"]["tri"].destroy();
        }

        bufferInfo["buffers"]["bvh"] = device.createBuffer({
            size: newBVH.byteLength,
            usage: GPUBufferUsage.STORAGE,
            mappedAtCreation: true
        }); new Float32Array(bufferInfo["buffers"]["bvh"].getMappedRange()).set(newBVH);
        bufferInfo["buffers"]["bvh"].unmap();
    
        bufferInfo["buffers"]["tri"] = device.createBuffer({
            size: newTri.byteLength,
            usage: GPUBufferUsage.STORAGE,
            mappedAtCreation: true
        }); new Float32Array(bufferInfo["buffers"]["tri"].getMappedRange()).set(newTri);
        bufferInfo["buffers"]["tri"].unmap();

        bufferInfo["bindgroups"]["raycast"]["entries"][1]["resource"]["buffer"] = bufferInfo["buffers"]["bvh"];
        bufferInfo["bindgroups"]["raycast"]["entries"][2]["resource"]["buffer"] = bufferInfo["buffers"]["tri"];

        bufferInfo["bindgroups"]["raycast"]["bg"] = device.createBindGroup({
            label: "Wave Front Raycast Kernel Bind Group",
            layout: bufferInfo["bindgroups"]["raycast"]["layout"],
            entries: bufferInfo["bindgroups"]["raycast"]["entries"]
        });
    };

    const addComputePass = async (info) => {
        const uniformValues = info["uniformValues"];
        const device = info["device"];
        //const start = Date.now();
        if (uniformValues["reset"] == true) {
            uniformValues["frames"] = [0];
            uniformValues["reset"] = false;
        }
        //console.log("-------starting-------");
        const uniformbuf = new ArrayBuffer(4 * 18);
        const  uniformbufDV = new DataView(uniformbuf);
        uniformbufDV.setFloat32(0, uniformValues.rendersize[0], true);
        uniformbufDV.setFloat32(4, uniformValues.rendersize[1], true);
        uniformbufDV.setFloat32(8, hdri.width, true);
        uniformbufDV.setFloat32(12, hdri.height, true);
        uniformbufDV.setFloat32(16, uniformValues.position[0], true);
        uniformbufDV.setFloat32(20, uniformValues.position[1], true);
        uniformbufDV.setFloat32(24, uniformValues.position[2], true);
        uniformbufDV.setUint32(28, uniformValues.pathoffset[0], true);
        uniformbufDV.setFloat32(32, uniformValues.forward[0], true);
        uniformbufDV.setFloat32(36, uniformValues.forward[1], true);
        uniformbufDV.setFloat32(40, uniformValues.forward[2], true);
        uniformbufDV.setUint32(44, uniformValues.frames[0], true);
        uniformbufDV.setFloat32(48, uniformValues.left[0], true);
        uniformbufDV.setFloat32(52, uniformValues.left[1], true);
        uniformbufDV.setFloat32(56, uniformValues.left[2], true);
        // -------------------------------------------------------- //
        uniformbufDV.setFloat32(64, uniformValues.focal, true);
        uniformbufDV.setFloat32(68, uniformValues.aperture, true);

        device.queue.writeBuffer(bufferInfo["buffers"]["uniform"], 0, uniformbuf);
        device.queue.writeBuffer(bufferInfo["buffers"]["stageOneQueueCounts"], 0, new Uint32Array([0, 0]));
        device.queue.writeBuffer(bufferInfo["buffers"]["stageTwoQueueCounts"], 0, new Uint32Array([0]));

        const commandEncoderLogic = device.createCommandEncoder();
        const passLogic = commandEncoderLogic.beginComputePass();
        passLogic.setPipeline(bufferInfo["pipelines"]["logic"]);
        passLogic.setBindGroup(0, bufferInfo["bindgroups"]["logic"]["bg"]);
        passLogic.dispatchWorkgroups(Math.ceil(numPaths / 32));
        passLogic.end();

        commandEncoderLogic.copyBufferToBuffer(bufferInfo["buffers"]["stageOneQueueCounts"], 0, bufferInfo["buffers"]["queueCountsRead"], 0, 8);
        //const time0 = Date.now();
        device.queue.submit([commandEncoderLogic.finish()]);

        await bufferInfo["buffers"]["queueCountsRead"].mapAsync(GPUMapMode.READ);
        const readBufferStage1 = bufferInfo["buffers"]["queueCountsRead"].getMappedRange();
        let readArrayStage1 = new Uint32Array(readBufferStage1);
        const numNewPath = readArrayStage1[0]; 
        const numMaterial = readArrayStage1[1];
        bufferInfo["buffers"]["queueCountsRead"].unmap();
        //const time1 = Date.now();
        //console.log(`num new path: ${numNewPath}; num material: ${numMaterial}`);

        const commandEncoderStage2 = device.createCommandEncoder();
        const passStage2 = commandEncoderStage2.beginComputePass();
        passStage2.setPipeline(bufferInfo["pipelines"]["material"]);
        passStage2.setBindGroup(0, bufferInfo["bindgroups"]["material"]["bg"]);
        passStage2.dispatchWorkgroups(Math.ceil(numMaterial / 32));
        passStage2.setPipeline(bufferInfo["pipelines"]["newray"]);
        passStage2.setBindGroup(0, bufferInfo["bindgroups"]["newray"]["bg"]);
        passStage2.dispatchWorkgroups(Math.ceil(numNewPath / 32));
        passStage2.end();

        commandEncoderStage2.copyBufferToBuffer(bufferInfo["buffers"]["stageTwoQueueCounts"], 0, bufferInfo["buffers"]["queueCountsRead"], 0, 4);

        //const time2 = Date.now();
        device.queue.submit([commandEncoderStage2.finish()]);

        await bufferInfo["buffers"]["queueCountsRead"].mapAsync(GPUMapMode.READ);
        const readBufferStage2 = bufferInfo["buffers"]["queueCountsRead"].getMappedRange();
        let readArrayStage2 = new Uint32Array(readBufferStage2);
        const numRaycast = readArrayStage2[0];
        bufferInfo["buffers"]["queueCountsRead"].unmap();
        //console.log(`num ray cast ${numRaycast}`);
        //const time3 = Date.now();

        const commandEncoderStage3 = device.createCommandEncoder();
        const passStage3 = commandEncoderStage3.beginComputePass();
        passStage3.setPipeline(bufferInfo["pipelines"]["raycast"]);
        passStage3.setBindGroup(0, bufferInfo["bindgroups"]["raycast"]["bg"]);
        passStage3.dispatchWorkgroups(Math.ceil(numRaycast / 32));
        passStage3.end();
        
        //const time4 = Date.now();
        await device.queue.submit([commandEncoderStage3.finish()]);
        //const time5 = Date.now();
        //console.log(Date.now() - start);
        uniformValues.pathoffset[0] += numNewPath;
        uniformValues.frames[0]++;

        //console.log(`report: \nlogic stage ${time1 - time0}\nmat & newray ${time3 - time2}\n raycast ${time5 - time4}`);
    }
    return {addComputePass, computeOutputBuffer, resizeOutput, bufferInfo, loadScene, loadMaterials};
}
