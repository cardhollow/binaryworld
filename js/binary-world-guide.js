window.__BinaryWorldSourceParts = window.__BinaryWorldSourceParts || [];

window.__BinaryWorldSourceParts[6] = `
function filenameSafe(name) {
    return (
        String(name || 'world')
            .replace(/[\\\\/:*?"<>|]/g, '_') ||
        'world'
    );
}

function downloadBytes(bytes, name, type) {
    var blob = new Blob(
        [bytes],
        {
            type: type || 'application/octet-stream'
        }
    );

    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');

    link.href = url;
    link.download = name;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(function() {
        URL.revokeObjectURL(url);
    }, 1000);
}

BW.export = function() {
    var data = BW.buildData();
    var binary = BW.writeFile(data);

    downloadBytes(
        binary,
        filenameSafe(world.meta.name) + '.bw',
        'application/octet-stream'
    );

    return {
        data: data,
        binary: binary
    };
};

BW.import = function() {
    return pickFile(
        '.bw',
        function(file) {
            return file.arrayBuffer().then(function(buf) {
                var data = BW.readFile(new Uint8Array(buf));
                var restored = BW.createWorld(data);

                applyImportedWorld(restored);

                return {
                    data: data,
                    world: restored
                };
            });
        }
    );
};

BW.test = function() {
    var data = BW.buildData();
    var binary = BW.writeFile(data);
    var imported = BW.readFile(binary);
    var restored = BW.createWorld(imported);

    return {
        data: data,
        binary: binary,
        imported: imported,
        restored: restored
    };
};

function pickFile(accept, reader) {
    return new Promise(function(resolve, reject) {
        var input = document.createElement('input');

        input.type = 'file';
        input.accept = accept;
        input.style.display = 'none';

        document.body.appendChild(input);

        input.onchange = function() {
            var file = input.files && input.files[0];

            if (!file) {
                input.remove();
                resolve(null);
                return;
            }

            Promise.resolve(reader(file))
                .then(function(v) {
                    resolve(v);
                })
                .catch(function(e) {
                    console.error(e);
                    alert('Import failed:\\n' + e.message);
                    reject(e);
                })
                .then(function() {
                    input.remove();
                });
        };

        input.click();
    });
}

function exportJSON() {
    var data = serializableWorld();

    downloadBytes(
        new TextEncoder().encode(JSON.stringify(data, null, 2)),
        filenameSafe(world.meta.name) + '.json',
        'application/json'
    );
}

function importJSON() {
    return pickFile(
        '.json,application/json',
        function(file) {
            return file.text().then(function(text) {
                var data = JSON.parse(text);
                var restored = normalizeJSONWorld(data);

                applyImportedWorld(restored);

                return {
                    data: data,
                    world: restored
                };
            });
        }
    );
}

function applyImportedWorld(restored) {
    var before =
        currentProjectKey && app.style.display !== 'none'
            ? deepSnapshot()
            : null;

    if (!currentProjectKey || app.style.display === 'none') {
        currentProjectKey = createUniqueProjectKey();
        currentProjectCreatedAt = Date.now();
        clearHistory();
    } else if (before) {
        pushHistory(before);
    }

    replaceWorld(restored);

    activeLayer = Math.min(
        activeLayer,
        Math.max(0, world.layers.length - 1)
    );

    closeModal(importModal);
    enterEditor();
    saveCurrentProject();
    updateHistoryButtons();
}

document.getElementById('exportBW').onclick = function() {
    closeModal(exportModal);
    BW.export();
};

document.getElementById('exportJSON').onclick = function() {
    closeModal(exportModal);
    exportJSON();
};

document.getElementById('importBW').onclick = function() {
    closeModal(importModal);
    BW.import();
};

document.getElementById('importJSON').onclick = function() {
    closeModal(importModal);
    importJSON();
};

window.BinaryWorld = window.BinaryWorld || {};

window.BinaryWorld.blocks = blocks;
window.BinaryWorld.world = world;
window.BinaryWorld.BW = BW;

window.BinaryWorld.exportBW = function() {
    return BW.export();
};

window.BinaryWorld.importBW = function() {
    return BW.import();
};

window.BinaryWorld.exportJSON = exportJSON;
window.BinaryWorld.importJSON = importJSON;

window.BinaryWorld.openGuide = function() {
    openGuide();
};

window.BW = BW;

window.bwExport = function() {
    return BW.export();
};

window.bwImport = function() {
    return BW.import();
};

var guide = {
    introduction:
        '<div class="guidePage">' +
            '<h1>Introduction</h1>' +
            '<p>Binary World is a grid based digital logic builder. Blocks occupy cells, connect automatically through compatible adjacent ports, and are evaluated by the simulation.</p>' +

            '<h2>Grid</h2>' +
            '<p>The editor is a two dimensional grid. Each cell can contain one block. X is the horizontal coordinate and Y is the depth coordinate shown by the editor.</p>' +

            '<h2>Layers</h2>' +
            '<p>Layers stack vertically. Blocks such as Passer can exchange signals between adjacent layers at matching positions.</p>' +

            '<h2>Automatic Connections</h2>' +
            '<p>No wire drawing is required. An output connects when it faces a compatible input on the neighboring cell.</p>' +

            '<h2>Simulation</h2>' +
            '<p>When a signal changes, affected blocks are scheduled and reevaluated automatically.</p>' +

            '<h2>Signal Paths</h2>' +
            '<p>Connectors carry signals in a straight line. Passers can move signals between layers, allowing more complex routes and turns.</p>' +
        '</div>',

    controls:
        '<div class="guidePage">' +
            '<h1>Controls</h1>' +

            '<h2>Selector</h2>' +
            '<p>Selector mode selects cells and blocks. Every newly placed block is automatically selected.</p>' +

            '<h2>Adding Blocks</h2>' +
            '<p>Choose a block from the toolbar and click an empty cell. The placed block becomes the current selection immediately.</p>' +

            '<h2>Deleting</h2>' +
            '<p>Choose <strong>Del</strong> and click a block, or select a block and press <strong>Delete</strong> or <strong>Backspace</strong>.</p>' +

            '<h2>Rotating</h2>' +
            '<p>With a block selected, press <strong>R</strong> to rotate it 90 degrees clockwise. You can also choose <strong>Rotate</strong> and click a block.</p>' +

            '<h2>Layers</h2>' +
            '<p><strong>ADD</strong> creates a new layer. <strong>DEL</strong> deletes the active layer after confirmation. The final layer cannot be deleted.</p>' +

            '<h2>Renaming</h2>' +
            '<p>Double click a layer name. Press <strong>Enter</strong> or click/tap outside its input to save.</p>' +
            '<p>Double click the project title. Press <strong>Enter</strong> or click/tap anywhere outside its input to save.</p>' +

            '<h2>Undo / Redo</h2>' +
            '<p>Use the buttons or <strong>Ctrl+Z</strong> and <strong>Ctrl+Y</strong>. <strong>Ctrl+Shift+Z</strong> also performs redo.</p>' +

            '<h2>Input</h2>' +
            '<p>Press and hold an Input block to activate it. Releasing the pointer deactivates it.</p>' +
        '</div>',

    exportImport:
        '<div class="guidePage">' +
            '<h1>Export / Import</h1>' +

            '<h2>BW</h2>' +
            '<p>BW is the compressed Binary World file format. It stores world dimensions, layer names, the block dictionary, placements, rotations, and saved states.</p>' +

            '<h2>JSON</h2>' +
            '<p>JSON is the readable world representation for debugging, editing, and external tools.</p>' +

            '<h2>Local Projects</h2>' +
            '<p>Projects are automatically saved to browser local storage. Use LOAD, then Load from local, to open stored projects.</p>' +
        '</div>',

    Node:
        '<div class="guidePage">' +
            '<h1>Node</h1>' +

            '<div class="guideBlock">' +
                '<div class="block">' +
                    blocks.node.display({
                        state: 0,
                        pressed: false,
                        inputs: {
                            top: 0,
                            right: 0,
                            bottom: 0,
                            left: 0,
                            z: 0
                        },
                        connected: {},
                        outputs: {},
                        zOutputs: {},
                        runtime: createRuntime()
                    }) +
                '</div>' +
            '</div>' +

            '<p>Node is a signal collector with four directional inputs. It becomes active when any of its directional inputs receives a 1. Supported vertical input can also activate it.</p>' +

            '<h2>Ports</h2>' +

            '<table class="guideTable">' +
                '<tr>' +
                    '<th>Port</th>' +
                    '<th>Side</th>' +
                    '<th>Purpose</th>' +
                '</tr>' +

                '<tr>' +
                    '<td>Top</td>' +
                    '<td>Top</td>' +
                    '<td>Receives the output of the block above.</td>' +
                '</tr>' +

                '<tr>' +
                    '<td>Right</td>' +
                    '<td>Right</td>' +
                    '<td>Receives the output of the block to the right.</td>' +
                '</tr>' +

                '<tr>' +
                    '<td>Bottom</td>' +
                    '<td>Bottom</td>' +
                    '<td>Receives the output of the block below.</td>' +
                '</tr>' +

                '<tr>' +
                    '<td>Left</td>' +
                    '<td>Left</td>' +
                    '<td>Receives the output of the block to the left.</td>' +
                '</tr>' +
            '</table>' +

            '<h2>Behavior</h2>' +
            '<p>At least one active input makes Node state 1. With no active input, its state is 0.</p>' +

            '<h2>Important</h2>' +
            '<p>Node has <strong>no output port</strong>. It is a signal collector and display block only.</p>' +

            '<h2>Rotation</h2>' +
            '<p>Rotation changes the physical side assigned to each directional port.</p>' +
        '</div>',

    Input:
        '<div class="guidePage">' +
            '<h1>Input</h1>' +

            '<div class="guideBlock">' +
                '<div class="block">' +
                    blocks.input.display({
                        state: 0,
                        pressed: false,
                        inputs: {},
                        connected: {},
                        outputs: {
                            out: 0
                        },
                        zOutputs: {},
                        runtime: createRuntime()
                    }) +
                '</div>' +
            '</div>' +

            '<p>Input is a manually controlled binary signal source.</p>' +

            '<h2>Output</h2>' +
            '<p>The right side <strong>Out</strong> port carries the signal.</p>' +

            '<h2>Behavior</h2>' +
            '<p>Press and hold Input to output 1. Release it to output 0.</p>' +

            '<h2>Use</h2>' +
            '<p>Useful for switches, manual testing, triggers, and starting logic chains.</p>' +
        '</div>',

    Comparator:
        '<div class="guidePage">' +
            '<h1>Comparator</h1>' +

            '<div class="guideBlock">' +
                '<div class="block">' +
                    blocks.comparator.display({
                        state: 0,
                        pressed: false,
                        inputs: {
                            a: 0,
                            b: 0
                        },
                        connected: {},
                        outputs: {
                            out: 0
                        },
                        zOutputs: {},
                        runtime: createRuntime()
                    }) +
                '</div>' +
            '</div>' +

            '<p>Comparator performs a two-input <strong>AND</strong> operation. The output becomes 1 only when both A and B are powered.</p>' +

            '<h2>Ports</h2>' +

            '<table class="guideTable">' +
                '<tr>' +
                    '<th>Port</th>' +
                    '<th>Side</th>' +
                    '<th>Purpose</th>' +
                '</tr>' +

                '<tr>' +
                    '<td>A</td>' +
                    '<td>Left</td>' +
                    '<td>First binary input.</td>' +
                '</tr>' +

                '<tr>' +
                    '<td>B</td>' +
                    '<td>Top</td>' +
                    '<td>Second binary input.</td>' +
                '</tr>' +

                '<tr>' +
                    '<td>Out</td>' +
                    '<td>Right</td>' +
                    '<td>Outputs the AND result.</td>' +
                '</tr>' +
            '</table>' +

            '<h2>Truth Table</h2>' +

            '<table class="guideTable">' +
                '<tr>' +
                    '<th>A</th>' +
                    '<th>B</th>' +
                    '<th>Out</th>' +
                '</tr>' +

                '<tr>' +
                    '<td>0</td>' +
                    '<td>0</td>' +
                    '<td>0</td>' +
                '</tr>' +

                '<tr>' +
                    '<td>0</td>' +
                    '<td>1</td>' +
                    '<td>0</td>' +
                '</tr>' +

                '<tr>' +
                    '<td>1</td>' +
                    '<td>0</td>' +
                    '<td>0</td>' +
                '</tr>' +

                '<tr>' +
                    '<td>1</td>' +
                    '<td>1</td>' +
                    '<td><strong>1</strong></td>' +
                '</tr>' +
            '</table>' +

            '<h2>Behavior</h2>' +
            '<p>Comparator does not have an operation changer. It has exactly two inputs: A and B.</p>' +

            '<p>The output is powered <strong>only when both inputs are powered</strong>.</p>' +
        '</div>',

    Inverter:
        '<div class="guidePage">' +
            '<h1>Inverter</h1>' +

            '<div class="guideBlock">' +
                '<div class="block">' +
                    blocks.inverter.display({
                        state: 1,
                        pressed: false,
                        inputs: {
                            in: 0
                        },
                        connected: {
                            in: true
                        },
                        outputs: {
                            out: 1
                        },
                        zOutputs: {},
                        runtime: createRuntime()
                    }) +
                '</div>' +
            '</div>' +

            '<p>Inverter performs logical NOT.</p>' +

            '<h2>Ports</h2>' +
            '<p><strong>In</strong> is on the left and <strong>Out</strong> is on the right.</p>' +

            '<h2>Behavior</h2>' +
            '<p>0 becomes 1 and 1 becomes 0. An unconnected input is treated as 0, so the output becomes 1.</p>' +
        '</div>',

    Connector:
        '<div class="guidePage">' +
            '<h1>Connector</h1>' +

            '<div class="guideBlock">' +
                '<div class="block">' +
                    blocks.connector.display({
                        state: 0,
                        pressed: false,
                        inputs: {
                            in: 0
                        },
                        connected: {
                            in: false
                        },
                        outputs: {
                            out: 0
                        },
                        zOutputs: {},
                        runtime: createRuntime()
                    }) +
                '</div>' +
            '</div>' +

            '<p>Connector repeats a signal from one side to the other.</p>' +

            '<h2>Ports</h2>' +
            '<p><strong>In</strong> is on the left. <strong>Out</strong> is on the right.</p>' +

            '<h2>Behavior</h2>' +
            '<p>When connected, Out follows In exactly. With no connection, Out stays 0.</p>' +

            '<h2>Use</h2>' +
            '<p>Useful for extending signal paths and keeping circuits organized.</p>' +
        '</div>',

    Delayer:
        '<div class="guidePage">' +
            '<h1>Delayer</h1>' +

            '<div class="guideBlock">' +
                '<div class="block">' +
                    blocks.delayer.display({
                        state: 0,
                        pressed: false,
                        inputs: {
                            in: 0
                        },
                        connected: {
                            in: true
                        },
                        outputs: {
                            out: 0
                        },
                        zOutputs: {},
                        runtime: createRuntime()
                    }) +
                '</div>' +
            '</div>' +

            '<p>Delayer repeats an input after a fixed delay.</p>' +

            '<h2>Ports</h2>' +
            '<p><strong>In</strong> is on the left. <strong>Out</strong> is on the right.</p>' +

            '<h2>Delay</h2>' +
            '<p>The current implementation uses <strong>500 milliseconds</strong>.</p>' +

            '<h2>Behavior</h2>' +
            '<p>A changed input schedules a future output change. A newer pending change replaces the previous pending change for that block.</p>' +
        '</div>',

    Passer:
        '<div class="guidePage">' +
            '<h1>Passer</h1>' +

            '<div class="guideBlock">' +
                '<div class="block">' +
                    blocks.passer.display({
                        state: 0,
                        pressed: false,
                        inputs: {
                            in: 0,
                            zUp: 0,
                            zDown: 0
                        },
                        connected: {
                            in: false,
                            zUp: false,
                            zDown: false
                        },
                        outputs: {
                            out: 0
                        },
                        zOutputs: {
                            up: 0,
                            down: 0
                        },
                        runtime: createRuntime()
                    }) +
                '</div>' +
            '</div>' +

            '<p>Passer routes binary signals horizontally and between layers.</p>' +

            '<h2>Horizontal</h2>' +
            '<p>The left <strong>In</strong> port receives a local signal. The right <strong>Out</strong> port outputs its local state.</p>' +

            '<h2>Vertical</h2>' +
            '<p>Passer exposes <strong>up</strong> and <strong>down</strong> Z outputs for supported blocks on adjacent layers.</p>' +

            '<h2>Routing</h2>' +
            '<p>The runtime remembers a routing direction and can select upper, lower, both, or local behavior based on incoming signals.</p>' +

            '<h2>Use</h2>' +
            '<p>Useful for multi layer circuits and moving signals vertically through the world.</p>' +
        '</div>',

    Latch:
        '<div class="guidePage">' +
            '<h1>Latch</h1>' +

            '<div class="guideBlock">' +
                '<div class="block">' +
                    blocks.latch.display({
                        state: 0,
                        pressed: false,
                        inputs: {
                            signal: 0,
                            opener: 0
                        },
                        connected: {
                            signal: true,
                            opener: true
                        },
                        outputs: {
                            out: 0
                        },
                        zOutputs: {},
                        runtime: createRuntime()
                    }) +
                '</div>' +
            '</div>' +

            '<p>Latch is a memory element that keeps its previous state until its opener allows an update.</p>' +

            '<h2>Ports</h2>' +

            '<table class="guideTable">' +
                '<tr>' +
                    '<th>Port</th>' +
                    '<th>Side</th>' +
                    '<th>Purpose</th>' +
                '</tr>' +

                '<tr>' +
                    '<td>Signal</td>' +
                    '<td>Left</td>' +
                    '<td>Value that may be stored.</td>' +
                '</tr>' +

                '<tr>' +
                    '<td>Opener</td>' +
                    '<td>Top</td>' +
                    '<td>Allows the stored value to update.</td>' +
                '</tr>' +

                '<tr>' +
                    '<td>Out</td>' +
                    '<td>Right</td>' +
                    '<td>Current stored state.</td>' +
                '</tr>' +
            '</table>' +

            '<h2>Behavior</h2>' +
            '<p>When Opener is 1, the Latch copies Signal. When Opener is 0, it holds its existing state.</p>' +

            '<h2>Example</h2>' +
            '<p>Store a 1 with Signal=1 and Opener=1. Then turn Opener off; Out remains 1 until another permitted update changes it.</p>' +
        '</div>'
};

var guideOrder = [
    ['category', 'BASICS'],
    ['introduction', 'Introduction'],
    ['controls', 'Controls'],
    ['exportImport', 'Export / Import'],
    ['category', 'BLOCKS'],
    ['Node', 'Node'],
    ['Input', 'Input'],
    ['Comparator', 'Comparator'],
    ['Inverter', 'Inverter'],
    ['Connector', 'Connector'],
    ['Delayer', 'Delayer'],
    ['Passer', 'Passer'],
    ['Latch', 'Latch']
];

var guideElement = document.getElementById('guide');
var guideSections = document.getElementById('guideSections');
var guideContent = document.getElementById('guideContent');

function buildGuideNavigation() {
    guideSections.innerHTML = '';

    guideOrder.forEach(function(item) {
        if (item[0] === 'category') {
            var c = document.createElement('div');

            c.className = 'guideSection category';
            c.textContent = item[1];

            guideSections.appendChild(c);
            return;
        }

        var b = document.createElement('div');

        b.className = 'guideSection';
        b.dataset.guide = item[0];
        b.textContent = item[1];

        b.onclick = function() {
            showGuide(item[0]);
        };

        guideSections.appendChild(b);
    });
}

function showGuide(name) {
    if (!guide[name]) {
        return;
    }

    document
        .querySelectorAll('.guideSection[data-guide]')
        .forEach(function(x) {
            x.classList.toggle(
                'active',
                x.dataset.guide === name
            );
        });

    guideContent.innerHTML = guide[name];
    guideContent.scrollTop = 0;
}

function openGuide() {
    buildGuideNavigation();
    guideElement.classList.add('visible');
    showGuide('introduction');
}

function closeGuide() {
    guideElement.classList.remove('visible');
}

document.getElementById('guideBack').onclick = closeGuide;

window.openGuide = openGuide;
window.closeGuide = closeGuide;

buildGuideNavigation();

try {
    BW.test();

    window.BinaryWorld.ready = true;
    window.BinaryWorld.bwSelfTest = 'passed';
} catch (e) {
    window.BinaryWorld.ready = false;
    window.BinaryWorld.bwSelfTest = 'failed';

    console.error('BW self test failed:', e);
}

})();
`;
