export function initUI(callbackRotation, changedFlags, convertMeshes) {
    const elems = document.querySelectorAll(".expandable");
    for (let x = 0; x < elems.length; x++) {
        makeExpandable(elems[x]);
    }

    initOrientationEditor(callbackRotation);

    initMeshLoader(convertMeshes);

    for (var x = 0; x < document.querySelectorAll(".window").length; x++) {
        initWindow(document.querySelectorAll(".window")[x]);
    }

    document.querySelector("#camera-and-film-button").onclick = () => {
        document.querySelector("#camera-and-film").style.display = "";
    };
    document.querySelector("#objects-button").onclick = () => {
        document.querySelector("#objects").style.display = "";
    };
    document.querySelector("#mesh-button").onclick = () => {
        document.querySelector("#mesh").style.display = "";
    };
    document.querySelector("#material-button").onclick = () => {
        document.querySelector("#material").style.display = "";
    };

    let getObjects = initObjectsEditor(changedFlags);
    let getMaterials = initMaterialsEditor(changedFlags);

    //take all inputs, and use map them changing to let everything else know
    let UIChangeMap = {
        "focal": "camera",
        "aperture": "camera",
        "camOffsetX": "camera",
        "camOffsetY": "camera",
        "camOffsetZ": "camera",
        "camDistance": "camera",
        "renderX": "rendersize",
        "renderY": "rendersize"
    };
    const inputs = document.querySelectorAll("input");
    for (var x = 0; x < inputs.length; x++) {
        const copy = x;
        if (inputs[copy].getAttribute("type") === "number") {
            inputs[copy].addEventListener("keyup", (e) => {
                if (e.key === "Enter" || e.keyCode === 13) {
                    e.preventDefault();
                    inputs[copy].dispatchEvent(new Event("onchange"));
                }
            });
            inputs[copy].addEventListener("focusout", (e) => {
                e.preventDefault();
                inputs[copy].dispatchEvent(new Event("onchange"));
            });
            inputs[copy].addEventListener("onchange", () => {
                let value = inputs[copy].value;
                if (value === "" || value == null) {
                    value = 0.;
                }
                if (inputs[copy].getAttribute("min") != null) {
                    value = Math.max(inputs[copy].getAttribute("min"), value);
                }
                if (inputs[copy].getAttribute("max") != null) {
                    value = Math.min(inputs[copy].getAttribute("max"), value);
                }
                if (inputs[copy].getAttribute("step") == 1) {
                    value = Math.floor(value);
                }
                changedFlags[UIChangeMap[inputs[copy].id]] = true;
                inputs[copy].value = value;
            });
        }
    }

    return {getObjects, getMaterials};
}

function initMaterialsEditor(changedFlags) {
    const newMaterialButton = document.querySelector("#new-material");
    const materialsList = document.querySelector("#materials-list");
    let materialCount = 0;

    const materials = [
        "diffuse", "transmissive", "mirror", "glossy"
    ];
    let selectString = "";
    for (var x in materials) {
        selectString += `<option value=${materials[x]}>${materials[x]}</option>`;
    }

    const newMaterial = () => {
        let newElem = document.createElement("div");
        newElem.className = "expandable";
        newElem.innerHTML = 
        `<button class="expandable-head">
            <div class="expandable-arrow-container">
                <div class="expandable-arrow">
                </div>
            </div>
            Material ${materialCount++}
        </button>
        <div style="display: none;" class="expandable-content" id="material">
            <div style="display: flex; flex-direction: column;">
                <div class="editable-container" style="margin: 5px 0px 5px;">
                    <div class="editable-name">
                        type
                    </div>
                    <select class="editable-other" id="type-selector">
                        ${selectString}
                    </select>
                </div>
            </div>
        </div>
        `;
        materialsList.appendChild(newElem);
        makeExpandable(newElem);
        const typeSelector = newElem.querySelector("#type-selector");
        typeSelector.onchange = updateType;
        typeSelector.onchange();
        function updateType() {
            const type = newElem.querySelector("#type-selector").value;
            let str = "";
            changedFlags["material"] = true;
            switch (type) {
                case "diffuse":
                    str = 
                    `<div style="display: flex; flex-direction: column;">
                        <div class="editable-container" style="margin: 5px 0px 5px;">
                            <div class="editable-name">
                                type
                            </div>
                            <select class="editable-other" id="type-selector">
                                ${selectString}
                            </select>
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                                color R
                            </div>
                            <input id="color-0" min="0" value=".8" step=".1" type="number" class="editable-input">
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                                color G
                            </div>
                            <input id="color-1" min="0" value=".8" step=".1" type="number" class="editable-input">
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                                color B
                            </div>
                            <input id="color-2" min="0" value=".8" step=".1" type="number" class="editable-input">
                        </div>
                    </div>
                    `;
                    break;
                case "transmissive":
                    str = 
                    `<div style="display: flex; flex-direction: column;">
                        <div class="editable-container" style="margin: 5px 0px 5px;">
                            <div class="editable-name">
                                type
                            </div>
                            <select class="editable-other" id="type-selector">
                                ${selectString}
                            </select>
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                            i.o.r.
                            </div>
                            <input id="ior" min="0" value="1.6" step=".1" type="number" class="editable-input">
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                            volume color R
                            </div>
                            <input id="volume-color-0" min="0" value=".8" step=".1" type="number" class="editable-input">
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                            volume color G
                            </div>
                            <input id="volume-color-1" min="0" value=".8" step=".1" type="number" class="editable-input">
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                            volume color B
                            </div>
                            <input id="volume-color-2" min="0" value=".8" step=".1" type="number" class="editable-input">
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                            volume density
                            </div>
                            <input id="volume-density" min="0" value="5" step="5." type="number" class="editable-input">
                        </div>
                    </div>
                    `;
                    break;
                case "mirror":
                    str = 
                    `<div style="display: flex; flex-direction: column;">
                        <div class="editable-container" style="margin: 5px 0px 5px;">
                            <div class="editable-name">
                                type
                            </div>
                            <select class="editable-other" id="type-selector">
                                ${selectString}
                            </select>
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                                color R
                            </div>
                            <input id="color-0" min="0" value="1" step=".1" type="number" class="editable-input">
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                                color G
                            </div>
                            <input id="color-1" min="0" value="1" step=".1" type="number" class="editable-input">
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                                color B
                            </div>
                            <input id="color-2" min="0" value="1" step=".1" type="number" class="editable-input">
                        </div>
                    </div>
                    `;
                    break;
                case "glossy":
                    str = 
                    `<div style="display: flex; flex-direction: column;">
                        <div class="editable-container" style="margin: 5px 0px 5px;">
                            <div class="editable-name">
                                type
                            </div>
                            <select class="editable-other" id="type-selector">
                                ${selectString}
                            </select>
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                                i.o.r.
                            </div>
                            <input id="ior" min="0" value="1.5" step=".1" type="number" class="editable-input">
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                                color R
                            </div>
                            <input id="color-0" min="0" value=".6" step=".1" type="number" class="editable-input">
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                                color G
                            </div>
                            <input id="color-1" min="0" value=".6" step=".1" type="number" class="editable-input">
                        </div>
                        <div class="editable-container" style="margin: 0px 0px 5px;">
                            <div class="editable-name">
                                color B
                            </div>
                            <input id="color-2" min="0" value=".6" step=".1" type="number" class="editable-input">
                        </div>
                    </div>
                    `;
                    break;
                }
                newElem.querySelector(".expandable-content").innerHTML = str;

                const inputs = newElem.querySelector(".expandable-content").querySelectorAll("input");
                for (var j = 0; j < inputs.length; j++) {
                    const copy = j;
                    if (inputs[copy].getAttribute("type") === "number") {
                        inputs[copy].addEventListener("keyup", (e) => {
                            if (e.key === "Enter" || e.keyCode === 13) {
                                e.preventDefault();
                                inputs[copy].dispatchEvent(new Event("onchange"));
                            }
                        });
                        inputs[copy].addEventListener("focusout", (e) => {
                            e.preventDefault();
                            inputs[copy].dispatchEvent(new Event("onchange"));
                        });
                        inputs[copy].addEventListener("onchange", () => {
                            let value = inputs[copy].value;
                            if (value === "" || value == null) {
                                value = 0.;
                            }
                            if (inputs[copy].getAttribute("min") != null) {
                                value = Math.max(inputs[copy].getAttribute("min"), value);
                            }
                            if (inputs[copy].getAttribute("max") != null) {
                                value = Math.min(inputs[copy].getAttribute("max"), value);
                            }
                            if (inputs[copy].getAttribute("step") == 1) {
                                value = Math.floor(value);
                            }
                            changedFlags["material"] = true;
                            inputs[copy].value = value;
                        });
                    }
                }

                const selector = newElem.querySelector("#type-selector");
                selector.value = type;
                selector.onchange = updateType;
        };

    };
    newMaterial();
    newMaterialButton.onclick = newMaterial;

    return () => {
        const entries = materialsList.querySelectorAll("#material");
        const returned = [];
        for (var i = 0; i < entries.length; i++) {
            const curMaterial = {};
            const type = entries[i].querySelector("#type-selector").value;
            switch (type) {
                case "diffuse":
                    curMaterial["type"] = "diffuse";
                    curMaterial["color"] = [
                        parseFloat(entries[i].querySelector("#color-0").value),
                        parseFloat(entries[i].querySelector("#color-1").value),
                        parseFloat(entries[i].querySelector("#color-2").value)
                    ];
                    break;
                case "transmissive":
                    curMaterial["type"] = "glass";
                    curMaterial["absorption-color"] = [
                        parseFloat(entries[i].querySelector("#volume-color-0").value),
                        parseFloat(entries[i].querySelector("#volume-color-1").value),
                        parseFloat(entries[i].querySelector("#volume-color-2").value)
                    ];
                    curMaterial["surface-color"] = [1., 1., 1.];
                    curMaterial["IOR"] = [
                        parseFloat(entries[i].querySelector("#ior").value)
                    ];
                    curMaterial["density"] = [
                        parseFloat(entries[i].querySelector("#volume-density").value)
                    ];
                    break;
                case "mirror":
                    curMaterial["type"] = "mirror";
                    curMaterial["color"] = [
                        parseFloat(entries[i].querySelector("#color-0").value),
                        parseFloat(entries[i].querySelector("#color-1").value),
                        parseFloat(entries[i].querySelector("#color-2").value)
                    ];
                    break;
                case "glossy":
                    curMaterial["type"] = "glossy";
                    curMaterial["color"] = [
                        parseFloat(entries[i].querySelector("#color-0").value),
                        parseFloat(entries[i].querySelector("#color-1").value),
                        parseFloat(entries[i].querySelector("#color-2").value)
                    ];
                    curMaterial["glossy-color"] = [1., 1., 1.];
                    curMaterial["IOR"] = [
                        parseFloat(entries[i].querySelector("#ior").value)
                    ];
                    break;
            }
            returned.push(curMaterial);
        }
        return returned;
    };
}

function initMeshLoader(convertMeshes) {
    const uploadButton = document.querySelector("#upload-mesh");
    let meshCount = 1;
    const newMeshUI = (numTris, name) => {
        const meshlist = document.querySelector("#meshes-list");
        let newElem = document.createElement("div");
        newElem.className = "expandable";
        if (name.length > 25) {
            name = name.substring(0, 25) + "...";
        }
        newElem.innerHTML = 
        `<button class="expandable-head" style="overflow: hidden;">
            <div class="expandable-arrow-container">
                <div class="expandable-arrow">
                </div>
            </div>
            ${name}
        </button>
        <div style="display: none;" class="expandable-content">
            <div style="display: flex; flex-direction: column;">
                <div class="editable-container" style="margin: 5px 0px 5px;">
                    <div class="editable-name">
                        index
                    </div>
                    <button class="editable-other" style="overflow: hidden;">
                        ${meshCount++}
                    </button>
                </div>
                <div class="editable-container" style="margin: 0px 0px 5px; overflow: hidden;">
                    <div class="editable-name">
                        triangles
                    </div>
                    <button class="editable-other">
                        ${numTris}
                    </button>
                </div>
            </div>
        </div>`;
        makeExpandable(newElem);
        meshlist.appendChild(newElem);
    };

    uploadButton.onclick = () => {
        const uploadElem = document.createElement("input");
        uploadElem.setAttribute("type", "file");
        uploadElem.click();

        uploadElem.onchange = () => {
            const fileToRead = uploadElem.files[0];

            if (fileToRead == null) {
                return;
            }

            const blockingElem = document.createElement("div");
            blockingElem.style.width = "100%"; blockingElem.style.height = "100%"; 
            blockingElem.style.position = "absolute"; blockingElem.style.background = "rgba(60, 60, 60, .5)";
            blockingElem.style["z-index"] = 100;
            blockingElem.style.display = "flex"; blockingElem.style.alignItems = "center"; blockingElem.style["justify-content"] = "center";
            const textElem = document.createElement("div"); textElem.innerHTML = "parsing file...";
            textElem.style["font-family"] = `'Roboto', sans-serif`; textElem.style["font-size"] = "15px"; textElem.style.color = "#cccccc"; textElem.style.cursor = "default";
            blockingElem.appendChild(textElem);
            document.body.appendChild(blockingElem);

            const fileReader = new FileReader();
            fileReader.onload = (e) => {
                const txt = e.target.result;

                let arrs; let flagNothing = false;
                try {
                    arrs = parseObj(txt, fileToRead.name);
                } catch (error) {
                    console.error(error);
                    flagNothing = true;
                }
                if (!flagNothing) {
                    convertMeshes(arrs, newMeshUI);
                }

                blockingElem.remove();
            }; 

            fileReader.readAsText(fileToRead, "UTF-8");
            
        };
    };
}

function parseObj(txt, filename) {
    const lines = txt.split("\n");
    let objects = [];
    let curObject = null;
    const floatRegex = /[+-]?\d+(\.\d+)?/g;
    let verts = [];
    if (lines[0].charAt(0) === "v" && lines[0].charAt(1) === " ") {
        curObject = {
            faces: [],
            name: filename
        };
    }
    for (var x = 0; x < lines.length; x++) {
        if (lines[x].charAt(0) === "g" || lines[x].charAt(0) === "o") {
            if (curObject != null) {
                objects.push(curObject);
            }
            curObject = {
                faces: [],
                name: lines[x].substring(2)
            };
        }
        if (lines[x].charAt(0) === "v" && lines[x].charAt(1) === " ") {
            const pos = lines[x].match(floatRegex).map((a) => {return parseFloat(a);});
            verts.push(pos);
        }
        if (lines[x].charAt(0) === "f") {
            let idxs = []; let lastSpace = false;
            for (var i = 0; i < lines[x].length; i++) {
                if (lines[x].charAt(i) === " ") {
                    lastSpace = true;
                } else {
                    lastSpace = false;
                }

                if (lastSpace && lines[x].charAt(i + 1) !== " ") {
                    const newIdx = parseInt(lines[x].substring(i));
                    if (isFinite(newIdx)) {
                        idxs.push(newIdx);
                    }
                }
            }
            curObject.faces.push(idxs);
        }
    }
    if (curObject != null) {
        objects.push(curObject);
    }
    let objs = [];
    for (var x in objects) {
        let curArr = []; const curObject = objects[x];
        for (var y = 0; y < curObject.faces.length; y++) {
            for (var i = 0; i < 3; i++) {
                for (var j = 0; j < 3; j++) {
                    curArr.push(verts[curObject.faces[y][i] - 1][j]);
                }
            }
        }
        objs.push({
            name: curObject.name,
            tris: curArr 
        });
    }
    return objs;
}

function initObjectsEditor(changedFlags) {
    const listElem = document.querySelector("#objects-list");

    let objectCount = 0;

    //returns an array of objects
    function getAllObjects() {
        let returned = [];
        let objElems = listElem.querySelectorAll(".object");
        for (var x = 0; x < objElems.length; x++) {
            let obj = {};
            obj["position"] = [
                parseFloat(objElems[x].querySelector("#object-position-x").value),
                parseFloat(objElems[x].querySelector("#object-position-y").value),
                parseFloat(objElems[x].querySelector("#object-position-z").value)
            ];
            obj["scale"] = [
                parseFloat(objElems[x].querySelector("#object-scale").value)
            ];
            obj["mesh"] = [
                parseInt(objElems[x].querySelector("#object-mesh").value)
            ];
            obj["material"] = [
                parseInt(objElems[x].querySelector("#object-material").value)
            ];
            obj["rotation"] = [
                0, 0,
                //parseFloat(objElems[x].querySelector("#object-rotation-x").value * Math.PI / 180.),
                //parseFloat(objElems[x].querySelector("#object-rotation-y").value * Math.PI / 180.),
                parseFloat(objElems[x].querySelector("#object-rotation-z").value * Math.PI / 180.)
            ]
            returned.push(obj);
        }
        return returned;
    }

    const newObject = () => {
        let newElem = document.createElement("div");
        newElem.className = "expandable object"; newElem.id = `${objectCount++}`;
        newElem.innerHTML = 
        `<button class="expandable-head">
            <div class="expandable-arrow-container">
                <div class="expandable-arrow">
                </div>
            </div>
            Object ${objectCount}
        </button>
        <div style="display: none;" class="expandable-content">
            <div style="display: flex; flex-direction: column;">
                <div class="editable-container" style="margin: 5px 0px 5px">
                    <div class="editable-name">
                        position x
                    </div>
                    <input id="object-position-x" value="0" step=".5" type="number" class="editable-input">
                </div>
                <div class="editable-container" style="margin: 0px 0px 5px">
                    <div class="editable-name">
                        position y
                    </div>
                    <input id="object-position-y" value="0" step=".5" type="number" class="editable-input">
                </div>
                <div class="editable-container" style="margin: 0px 0px 5px">
                    <div class="editable-name">
                        position z
                    </div>
                    <input id="object-position-z" value="0" step=".5" type="number" class="editable-input">
                </div>
                <div class="editable-container" style="margin: 0px 0px 5px">
                    <div class="editable-name">
                        scale
                    </div>
                    <input id="object-scale" value="1" min=".001" step=".1" type="number" class="editable-input">
                </div>
                <div class="editable-container" style="margin: 0px 0px 5px">
                    <div class="editable-name">
                        rotation z
                    </div>
                    <input id="object-rotation-z" value="0" step=".1" type="number" class="editable-input">
                </div>
                <div class="editable-container" style="margin: 0px 0px 5px">
                    <div class="editable-name">
                        mesh
                    </div>
                    <input id="object-mesh" value="0" min="0" step="1" type="number" class="editable-input">
                </div>
                <div class="editable-container" style="margin: 0px 0px 5px">
                    <div class="editable-name">
                        material
                    </div>
                    <input id="object-material" value="0" min="0" step="1" type="number" class="editable-input">
                </div>
            </div>
        </div>`;
        /* maybe put in later? too cramped
        <div class="editable-container" style="margin: 0px 0px 5px">
            <div class="editable-name">
                rotation phi
            </div>
            <input id="object-rotation-x" value="0" step=".1" type="number" class="editable-input">
        </div>
        <div class="editable-container" style="margin: 0px 0px 5px">
            <div class="editable-name">
                rotation phi
            </div>
            <input id="object-rotation-y" value="0" step=".1" type="number" class="editable-input">
        </div>
        */
        makeExpandable(newElem);

        listElem.appendChild(newElem);

        document.querySelector("#new-object").onclick = newObject;
        changedFlags["scene"] = true;

        const inputs = newElem.querySelectorAll("input");
        for (var x = 0; x < inputs.length; x++) {
            const copy = x;
            if (inputs[copy].getAttribute("type") === "number") {
                inputs[copy].addEventListener("keyup", (e) => {
                    if (e.key === "Enter" || e.keyCode === 13) {
                        e.preventDefault();
                        inputs[copy].dispatchEvent(new Event("onchange"));
                    }
                });
                inputs[copy].addEventListener("focusout", (e) => {
                    e.preventDefault();
                    inputs[copy].dispatchEvent(new Event("onchange"));
                });
                inputs[copy].addEventListener("onchange", () => {
                    let value = inputs[copy].value;
                    if (value === "" || value == null) {
                        value = 0.;
                    }
                    if (inputs[copy].getAttribute("min") != null) {
                        value = Math.max(inputs[copy].getAttribute("min"), value);
                    }
                    if (inputs[copy].getAttribute("max") != null) {
                        value = Math.min(inputs[copy].getAttribute("max"), value);
                    }
                    if (inputs[copy].getAttribute("step") == 1) {
                        value = Math.floor(value);
                    }
                    //flag rebuild of bvh
                    changedFlags["scene"] = true;
                    inputs[copy].value = value;
                });
            }
        }
    };

    document.querySelector("#new-object").onclick = newObject;

    return getAllObjects;
}

//for the moveable windows
function initWindow(windowElem) {
    let posX = 100; let posY = 100;
    let posCenterX = -1e60; let posCenterY = -1e60;
    let topbar = null;
    for (var x in windowElem.childNodes) {
        if (windowElem.childNodes[x].className === "window-bar") {
            topbar = windowElem.childNodes[x];
        }
    }

    windowElem.addEventListener("mousedown", () => {
        const windows = document.querySelectorAll(".window");
        for (var i = 0; i < windows.length; i++) {
            windows[i].style["z-index"] = 10;
        }
        windowElem.style["z-index"] = 11;
    });

    let closeButton = null;
    for (var x in topbar.childNodes) {
        if (topbar.childNodes[x].tagName === "BUTTON") {
            closeButton = topbar.childNodes[x];
        }
    }
    closeButton.onclick = () => {
        windowElem.style.display = "none";
    };

    new ResizeObserver(() => {
        if (posCenterX == -1e60 || posCenterY == -1e60) {
            return;
        }
        posX = window.innerWidth / 2. + posCenterX;
        posY = window.innerHeight / 2. + posCenterY;
        posX = clamp(posX, 0, window.innerWidth - windowElem.offsetWidth);
        posY = clamp(posY, 0, window.innerHeight- windowElem.offsetHeight);
        windowElem.style.left = posX + "px";
        windowElem.style.top = posY + "px";
    }).observe(document.body);

    topbar.addEventListener("mousedown", (e) => {
        let offsetX = e.clientX - posX;
        let offsetY = e.clientY - posY;
        function update (e) {
            e.preventDefault();
            let newX = e.clientX - offsetX;
            let newY = e.clientY - offsetY;
            
            newX = clamp(newX, 0, window.innerWidth - windowElem.offsetWidth);
            newY = clamp(newY, 0, window.innerHeight- windowElem.offsetHeight);

            posCenterX = newX - window.innerWidth / 2.;
            posCenterY = newY - window.innerHeight / 2.;


            windowElem.style.left = newX + "px";
            windowElem.style.top = newY + "px";
            posX = newX; posY = newY;
        };

        window.addEventListener("mousemove", update);
        window.addEventListener("mouseup", () => {
            window.removeEventListener("mousemove", update);
        }, {once: true});
    });
}

function clamp(val, min, max) {
    return Math.min(Math.max(min, val), max);
}

function initOrientationEditor(callback) {
    const elem = document.querySelector("#orientation-editor");
    const xElem = document.querySelector("#x");
    const yElem = document.querySelector("#y");
    const zElem = document.querySelector("#z");
    const negXElem = document.querySelector("#xneg");
    const negYElem = document.querySelector("#yneg");
    const negZElem = document.querySelector("#zneg");

    let theta = -Math.PI / 4.; let phi = -Math.PI / 16.;

    function setIfEndOn(thetaVal, phiVal, elem) {
        const doThing = () => {
            theta = thetaVal; phi = phiVal;
            updatePosition();
        }
        elem.addEventListener("mouseup", doThing);
        window.addEventListener("mouseup", (e) => {
            elem.removeEventListener("mouseup", doThing);
        }, {once: true});
    }

    xElem.addEventListener("mousedown", () => {
        setIfEndOn(Math.PI, 0, xElem);
    });
    negXElem.addEventListener("mousedown", () => {
        setIfEndOn(0, 0, negXElem);
    });
    yElem.addEventListener("mousedown", () => {
        setIfEndOn(Math.PI * 1.5, 0, yElem);
    });
    negYElem.addEventListener("mousedown", () => {
        setIfEndOn(Math.PI / 2., 0, negYElem);
    });
    zElem.addEventListener("mousedown", () => {
        setIfEndOn(Math.PI / 2., -Math.PI / 2., zElem);
    });
    negZElem.addEventListener("mousedown", () => {
        setIfEndOn(Math.PI / 2., Math.PI / 2., negZElem);
    });

    const xWorld = [1., 0., 0.];
    const yWorld = [0., 1., 0.];
    const zWorld = [0., 0., 1.];
    const xWorldNeg = [-1., 0., 0.];
    const yWorldNeg = [0., -1., 0.];
    const zWorldNeg = [0., 0., -1.];

    function updatePosition () {
        callback(theta, phi);
        const forward = [
            -Math.cos(theta) * Math.cos(phi),
            -Math.sin(theta) * Math.cos(phi),
            -Math.sin(phi)
        ];
        const right = [
            Math.sin(theta), -Math.cos(theta), 0
        ];
        const up = [
            Math.cos(theta) * Math.cos(phi - Math.PI / 2.),
            Math.sin(theta) * Math.cos(phi - Math.PI / 2.),
            Math.sin(phi - Math.PI / 2.)
        ];
        const r = 40;
        const c = 50;
        const xRel = [
            dot(right, xWorld) * r + c - 10.,
            dot(up, xWorld) * r + c - 10.,
            dot(forward, xWorld)
        ];
        const yRel = [
            dot(right, yWorld) * r + c - 10.,
            dot(up, yWorld) * r + c - 10.,
            dot(forward, yWorld)
        ];
        const zRel = [
            dot(right, zWorld) * r + c - 10.,
            dot(up, zWorld) * r + c - 10.,
            dot(forward, zWorld)
        ];
        const xRelNeg = [
            dot(right, xWorldNeg) * r + c - 10.,
            dot(up, xWorldNeg) * r + c - 10.,
            dot(forward, xWorldNeg)
        ];
        const yRelNeg = [
            dot(right, yWorldNeg) * r + c - 10.,
            dot(up, yWorldNeg) * r + c - 10.,
            dot(forward, yWorldNeg)
        ];
        const zRelNeg = [
            dot(right, zWorldNeg) * r + c - 10.,
            dot(up, zWorldNeg) * r + c - 10.,
            dot(forward, zWorldNeg)
        ];
        xElem.style.left = xRel[0] + "px";
        xElem.style.top = xRel[1] + "px";
        yElem.style.left = yRel[0] + "px";
        yElem.style.top = yRel[1] + "px";
        zElem.style.left = zRel[0] + "px";
        zElem.style.top = zRel[1] + "px";
        negXElem.style.left = xRelNeg[0] + "px";
        negXElem.style.top = xRelNeg[1] + "px";
        negYElem.style.left = yRelNeg[0] + "px";
        negYElem.style.top = yRelNeg[1] + "px";
        negZElem.style.left = zRelNeg[0] + "px";
        negZElem.style.top = zRelNeg[1] + "px";
        if (xRel[2] >= 0.) {
            xElem.style["z-index"] = 10;
        } else {
            xElem.style["z-index"] = -10;
        }
        if (yRel[2] >= 0.) {
            yElem.style["z-index"] = 10;
        } else {
            yElem.style["z-index"] = -10;
        }
        if (zRel[2] >= 0.) {
            zElem.style["z-index"] = 10;
        } else {
            zElem.style["z-index"] = -10;
        }
        if (xRelNeg[2] >= 0.) {
            negXElem.style["z-index"] = 10;
        } else {
            negXElem.style["z-index"] = -10;
        }
        if (yRelNeg[2] >= 0.) {
            negYElem.style["z-index"] = 10;
        } else {
            negYElem.style["z-index"] = -10;
        }
        if (zRelNeg[2] >= 0.) {
            negZElem.style["z-index"] = 10;
        } else {
            negZElem.style["z-index"] = -10;
        }
    };

    updatePosition();

    elem.addEventListener("mousedown", (e) => {
        const startX = e.clientX;
        const startY = e.clientY;
        const startTheta = theta;
        const startPhi = phi;

        const onMouseMove = (e) => {
            e.preventDefault();
            theta = (e.clientX - startX) * -.01 + startTheta;
            phi = (e.clientY - startY) * -.01 + startPhi;
            updatePosition();
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", () => {
            document.removeEventListener("mousemove", onMouseMove);
        }, {once: true});

    });

    function dot(v1, v2) {
        let returned = 0.;
        for (var x = 0; x < 3; x++) {
            returned += v1[x] * v2[x];
        }
        return returned;
    }
}

function makeExpandable(elem) {
    let button = null;
    for (var x in elem.childNodes) {
        if (elem.childNodes[x].tagName === "BUTTON") {
            button = elem.childNodes[x];
        }
    }
    let opened = false;
    button.onclick = () => {
        opened = !opened;
        let arrow;
        let content;
        for (var x in button.childNodes) {
            if (button.childNodes[x].className === "expandable-arrow-container") {
                for (var y in button.childNodes[x].childNodes) {
                    if (button.childNodes[x].childNodes[y].className === "expandable-arrow") {
                        arrow = button.childNodes[x].childNodes[y];
                    }
                }
            }
        }
        for (var x in elem.childNodes) {
            if (elem.childNodes[x].className === "expandable-content") {
                content = elem.childNodes[x];
            }
        }
        if (opened) {
            content.style.display = "";
            arrow.id = "expanded";
        } else {
            content.style.display = "none";
            arrow.id = "";
        }
    };
    button.onclick();
}