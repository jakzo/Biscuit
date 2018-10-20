var container, composer, multitrack;
var effectsPane;
var uiElementFocused = null;
var panes = [];
function init() {
    
    //Initialise UI panes
    container = document.getElementById("panes");
    var multitrackPane = document.createElement("DIV");
    multitrackPane.id = "multitrack";
    container.appendChild(multitrackPane);
    panes.push(multitrackPane);
    var lowerPane = new Pane("bottom");
    var composerContainer = document.createElement("DIV");
    composerContainer.id = "composer";
    lowerPane.addUI("Piano Roll", composerContainer);
    effectsPane = document.createElement("DIV");
    lowerPane.addUI("Effects Chain", effectsPane);
    resourcePane = document.createElement("DIV");
    lowerPane.addUI("Resources", resourcePane);
    
    //Piano roll composer
    composer = new Biscuit.PianoRoll({
        id: "composer",
        disabled: true
    });
    
    //Resource list
    Resources.setList(resourcePane);
    
    //Multitrack editor
    multitrack = new Biscuit.Multitrack({
        id: "multitrack",
        onLoopOpen: function(loop) {
            if(loop.type == "midi") {
                composer.load(loop.events, {
                    onResize: multitrack.loopResized,
                    onNoteEdit: multitrack.updateCurrentLoop,
                    tickSize: loop.tickSize,
                    ticksPerBeat: loop.ticksPerBeat,
                    timeSignature: loop.timeSignature,
                    instrumentInstance: loop.track.instrumentInstance
                });
            }
            else composer.disable();
        },
        onLoopClose: composer.disable,
        onTrackOpen: function(track) {
            while(effectsPane.firstChild) {
                effectsPane.removeChild(effectsPane.firstChild);
            }
            effectsPane.appendChild(track.chain.element);
            composer.setChannel(track.channel);
        }
    });

    Demo.onMultitrackLoad();
    
    Preset.onChange = multitrack.onPresetChange;
    
    //Musical keyboard
    var musicalKeyboard = new MusicalKeyboard({
        baseNote: 60
    });
    
    //MIDI file player
    var midiSelector = document.createElement("INPUT");
    midiSelector.type = "file";
    fileImport(midiSelector, loadMidi);
    function midiSelectorClicked() { midiSelector.click(); }
    
    //WAVE file importer
    var waveSelector = document.createElement("INPUT");
    waveSelector.type = "file";
    fileImport(waveSelector, function(file) {
        var waveFile = Wave.import(file);
        multitrack.createWaveLoop(waveFile);
    });
    function waveSelectorClicked() { waveSelector.click(); }
    
    window.addEventListener("drop", stop, true);
    window.addEventListener("dragover", stop, false);
    
    //Menu bar menus
    new Menu({
        button: document.getElementById("menu_file"),
        openClass: "ui_menuopen",
        items: [
            { text: "New Project", onClick: multitrack.reset },
            { text: "Save...", onClick: save },
            { text: "Open...", onClick: open },
            { text: "Create Track", onClick: multitrack.newTrack },
            { text: "Play MIDI File...", onClick: midiSelectorClicked },
            { text: "Import WAVE File...", onClick: waveSelectorClicked },
            { text: "Export as WAVE File...", onClick: exportAsWave }
        ]
    });
    
    //Fullscreen button
    var fullscreenButton = document.getElementById("fullscreen");
    fullscreenButton.addEventListener("mousedown", function(e) {
        if(!e.button) toggleFullscreen();
    }, false);
    
    
    //Keep track of which UI element has focus
    var focusable = {
        "menu_file": {},
        "multitrack": multitrack,
        "composer": composer
    };
    function focus(e) {
        if(uiElementFocused) blur();
        uiElementFocused = focusable[this.id];
        if(uiElementFocused.onFocus) uiElementFocused.onFocus();
    }
    function blur() {
        if(uiElementFocused.onBlur) uiElementFocused.onBlur();
        uiElementFocused = null;
    }
    for(var id in focusable) {
        var uiElement = focusable[id];
        var element = document.getElementById(id);
        element.addEventListener("mousedown", focus, true);
    }
    
    //Handle events
    stopEvent(window, "contextmenu");
    window.addEventListener("mousedown", function(e) {
        if(e.button != 1) stop(e);
        if(document.activeElement) document.activeElement.blur();
    }, false);
    window.addEventListener("keydown", keydown, false);
}

//Renders the instrument pane
function renderInstrument(instrumentInstance, container) {
    //Clear the container
    while(container.firstChild) {
        container.removeChild(container.firstChild);
    }
    //Create instrument heading
    var heading = document.createElement("h3");
    heading.className = "instrument_heading";
    heading.textContent = instrumentInstance.displayName;
    container.appendChild(heading);
    //Display controls for each parameter
    var parameters = instrumentInstance.parameters;
    for(var parameterName in parameters) {
        var parameter = parameters[parameterName];
        var parameterContainer = document.createElement("DIV");
        var label = document.createElement("h4");
        label.className = "instrument_label";
        label.textContent = parameter.displayName;
        parameterContainer.appendChild(label);
        //Range parameter
        if(parameter.type == "range") {
            var minSpan = document.createElement("SPAN");
            minSpan.className = "instrument_range";
            minSpan.textContent = parameter.min;
            parameterContainer.appendChild(minSpan);
            var range = document.createElement("INPUT");
            range.type = "range";
            range.factor = 100;
            range.min = parameter.min * range.factor;
            range.max = parameter.max * range.factor;
            range.value = parameter.value * range.factor;
            range.instrumentInstance = instrumentInstance;
            range.parameterName = parameterName;
            range.addEventListener("change", parameterChanged, false);
            range.addEventListener("mousedown", stopPropagation, false);
            range.addEventListener("mouseup", stopPropagation, false);
            parameterContainer.appendChild(range);
            var maxSpan = document.createElement("SPAN");
            maxSpan.className = "instrument_range";
            maxSpan.textContent = parameter.max;
            parameterContainer.appendChild(maxSpan);
        }
        container.appendChild(parameterContainer);
    }
}
function parameterChanged(e) {
    var parameters = this.instrumentInstance.parameters;
    var value = this.value / this.factor;
    parameters[this.parameterName].value = value;
}

//Creates a pane that contains UI elements
var Pane = function(position) {
    this.position = position;
    var uiElements = this.uiElements = [];
    var openUIElement = null;
    //Create the pane element
    var pane = this.element = document.createElement("DIV");
    pane.className = "pane pane_" + position;
    container.appendChild(pane);
    //Create the UI element containers
    var selectorBar = document.createElement("DIV");
    pane.appendChild(selectorBar);
    var elementContainer = document.createElement("DIV");
    pane.appendChild(elementContainer);
    panes.push(pane);
    
    //Adds a UI element to the pane
    this.addUI = function(name, element) {
        var button = document.createElement("DIV");
        var uiElement = {
            name: name,
            button: button,
            element: element
        };
        //Create the selector button
        button.className = "pane_button";
        button.textContent = name;
        button.uiElement = uiElement;
        button.addEventListener("click", buttonClicked, false);
        selectorBar.appendChild(button);
        //Add the element to the pane
        elementContainer.appendChild(element);
        if(uiElements.length) {
            element.style.display = "none";
            //Make first button visible in case it was
            //previously the only UI element in the pane
            uiElements[0].button.style.display = "";
            elementContainer.className = "pane_container";
        }
        else {
            openUIElement = uiElement;
            button.style.display = "none";
            button.className = "pane_button_selected";
            elementContainer.className = "pane_container pane_nobar";
        }
        uiElements.push(uiElement);
    };
    
    //Opens a new element inside the pane
    function buttonClicked(e) {
        openUIElement.element.style.display = "none";
        openUIElement.button.className = "pane_button";
        openUIElement = this.uiElement;
        openUIElement.element.style.display = "";
        openUIElement.button.className = "pane_button_selected";
    }
};

function stop(e) { e.preventDefault(); }
function stopPropagation(e) { e.stopPropagation(); }
function stopEvent(element, event) {
    element.addEventListener(event, stop, false);
}

var clipboard = null;
function keydown(e) {
    e.preventDefault();
    //Space - Play/Pause
    if(e.keyCode == 32) {
        if(multitrack.playing) multitrack.stop();
        else multitrack.play();
    }
    //F11 - Fullscreen
    else if(e.keyCode == 121) toggleFullscreen();
    //Ctrl-C
    else if(e.keyCode == 67 && e.ctrlKey) {
        if(uiElementFocused && uiElementFocused.onCopy) {
            clipboard = uiElementFocused.onCopy() || clipboard;
        }
    }
    //Ctrl-V
    else if(e.keyCode == 86 && e.ctrlKey) {
        if(clipboard && uiElementFocused && uiElementFocused.onPaste) {
            uiElementFocused.onPaste(clipboard);
        }
    }
    //Otherwise send the event to the focused UI element
    else if(uiElementFocused && uiElementFocused.onKeyDown) {
        uiElementFocused.onKeyDown(e);
    }
}

//Exports the current song as a WAVE file
function exportAsWave() {
    var buffer = Wave.export({
        multitrack: multitrack,
        sampleRate: multitrack.audio.sampleRate
    });
    downloadBuffer(buffer, "MyBiscuitProject.wav");
}

//Saves the current song as a file
function save() {
    //Get the save data
    var saveData = multitrack.getSaveData();
    var size = saveData.length;
    var buffer = new ArrayBuffer(size);
    var bytes = new Uint8Array(buffer);
    for(var i = 0; i < size; i++) bytes[i] = saveData[i];
    downloadBuffer(buffer, "MyBiscuitProject.bpj");
}

//Downloads an array buffer as a binary file
function downloadBuffer(arrayBuffer, filename) {
    var blob = new Blob([ arrayBuffer ], { type: "application/binary" });
    var a = document.createElement("a");
    a.href = window.URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

//Creates a web worker from a function (for multi-threading)
function createWorker(mainFunction) {
    var blobParts = [ "(", mainFunction.toString(), ")()" ];
    var blob = new Blob(blobParts, { type: "application/javascript" });
    var blobUrl = URL.createObjectURL(blob);
    var worker = new Worker(blobUrl);
    URL.revokeObjectURL(blobUrl);
    return worker;
}

//Toggles fullscreen
function toggleFullscreen() {
    if(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
    ) (
        document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.mozCancelFullScreen ||
        document.msExitFullscreen
    ).call(document);
    else (
        document.body.requestFullScreen ||
        document.body.webkitRequestFullScreen ||
        document.body.mozRequestFullScreen ||
        document.body.msRequestFullScreen
    ).call(document.body);
}

//Loads and opens a song file
var openSelector = document.createElement("INPUT");
openSelector.type = "file";
openSelector.accept = ".bpj";
fileImport(openSelector, openFileChosen);
function open() { openSelector.click(); }
function openFileChosen(file) {
    multitrack.openSaveData(file.buffer);
}

//Loads a sound font file
// https://github.com/robsheely/AS3-SoundFont-Parser
var sfSelector = document.createElement("INPUT");
sfSelector.type = "file";
fileImport(sfSelector, sfFileChosen);
function sfOpen() { sfSelector.click(); }
function sfFileChosen(file) {
    new SoundFont(file);
}

function loadMidi(file) {
    var midiFile = MIDI.load(file);
    MIDI.play(midiFile);
}

//Makes file input load file into memory
function fileImport(element, handler) {
    var input = element;
    input.addEventListener("change", function(e) {
        var files = input.files;
        if(files && files.length) {
            loadFile(input.files[0], handler);
        }
    }, false);
}

//Loads a file's contents into a variable
function loadFile(file, handler) {
    var reader = new FileReader();
    reader.onerror = function(e) {
        //Find the error code and log it in the console
        var errors = e.target.error, message = null;
        for(var error in errors) {
            if(error == "code") continue;
            if(errors.code === errors[error]) {
                message = "File Read Error: " + error;
                break;
            }
        }
        errorHandler(message || "File Read Error: Unknown!");
    };
    reader.onload = function readLoaded(e) {
        var name = file.name;
        var buffer = e.target.result;
        handler({ name: name, buffer: buffer, size: file.size });
    };
    //Read the file
    reader.readAsArrayBuffer(file);
}

function errorHandler(message) {
    alert("Error: " + message);
}

//MIDI Devices
var midiAccess = null;
function enableMidi() {
    if(!navigator.requestMIDIAccess) {
        console.log("Browser does not support MIDI API...");
        return;
    }
    function onExternalMidiMessage(e) {
        // https://www.nyu.edu/classes/bello/FMT_files/9_MIDI_code.pdf
        var event = {};
        //Channel event
        if(e.data[0] & 0x80) {
            event.type = "channel";
            event.channel = e.data[0] & 0x0f;
            //Get event type
            event.subtype = {
                0: "noteOff",
                1: "noteOn",
                2: "noteAftertouch",
                3: "control",
                4: "program",
                5: "channelAftertouch",
                6: "pitch"
            }[(e.data[0] & 0x70) >> 4] || "unknown";
            if(event.subtype == "unknown") return;
            //Get event data
            if(event.subtype == "noteOn" || event.subtype == "noteOff") {
                event.note = e.data[1];
                event.velocity = e.data[2];
            }
            else if(event.subtype == "noteAftertouch") {
                event.note = e.data[1];
                event.pressure = e.data[2];
            }
            else if(event.subtype == "control") {
                event.controller = {
                    64: "sustain"
                }[e.data[1]] || e.data[1];
                event.value = e.data[2];
            }
            else if(event.subtype == "program") {
                event.program = e.data[1];
            }
            else if(event.subtype == "channelAftertouch") {
                event.pressure = e.data[1];
            }
            else if(event.subtype == "pitch") {
                event.ls = e.data[1];
                event.ms = e.data[2];
            }
        }
        //System event
        else {

        }
        //Send the event
        var cleanedEvent = Biscuit.cleanEvent(event);
        if(cleanedEvent) multitrack.externalMidiEvent(cleanedEvent);
    }
    function onConnect(e) {
        console.log("MIDI onConnect fired! :D", e);
        e.port.onmidimessage = onExternalMidiMessage;
    }
    function onDisconnect(e) {
        console.log("MIDI onDisconnect fired! :D", e);
    }
    navigator.requestMIDIAccess().then(function(access) {
        midiAccess = access;
        for(var i = 0, inputs = access.inputs; i < inputs.size; i++) {
            inputs.get(i).onmidimessage = onExternalMidiMessage;
        }
        midiAccess.onconnect = onConnect;
        midiAccess.ondisconnect = onDisconnect;
    });
}
enableMidi();

//Adds a long-tap event handler to an element
var addLongTapEventListener = function(element, onLongTap) {
    var longTapCallback = onLongTap;
    var longTapTime = 500;
    var longTapTimeout;
    element.addEventListener("touchstart", function(e) {
        var timeout = longTapTimeout = setTimeout(function() {
            if(longTapTimeout == timeout) {
                var touch = e.changedTouches[0];
                longTapCallback.call(element, touch);
            }
        }, longTapTime);
    }, false);
    element.addEventListener("touchend", function(e) {
        longTapTimeout = null;
    }, false);
};

var UI = new (function() {
    //Framework for making input elements focus and blur like normal
    var focusedElement = null;
    function unfocus(e) {
        if(focusedElement) focusedElement.blur();
        focusedElement = null;
    }
    window.addEventListener("mousedown", unfocus, true);
    
    //Easily creates DOM elements
    this.createElement = function(tag, className, parentNode) {
        var tagName = tag;
        if(tag == "TEXTINPUT") tagName = "INPUT";
        var element = document.createElement(tagName);
        element.className = className;
        if(parentNode) parentNode.appendChild(element);
        if(tag == "TEXTINPUT") {
            element.type = "text";
            element.addEventListener("mousedown", stopPropagation, false);
            element.addEventListener("keydown", stopPropagation, false);
            element.addEventListener("focus", inputFocused, false);
            element.addEventListener("blur", unfocus, false);
        }
        return element;
    };
    function inputFocused(e) { focusedElement = this; }
    
    function stopPropagation(e) { e.stopPropagation(); }
})();

//Microphone audio
navigator.getUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;

var listenToAudioNode = null;
function listenToAudio() {
    MediaStreamTrack.getSources(function(sources) {
        var source = sources[3];
        var constraints = { audio: { optional: [{ sourceId: source.id }] } };
        navigator.getUserMedia(constraints, function(stream) {
            var streamSource = Biscuit.context.createMediaStreamSource(stream);
            //var filter = Biscuit.context.createBiquadFilter();
            //streamSource.connect(filter);
            //filter.connect(Biscuit.context.destination);
            //streamSource.connect(Biscuit.context.destination);
            var bufferSize = 1024, channelCount = 2;
            listenToAudioNode = Biscuit.context.createScriptProcessor(bufferSize, channelCount, channelCount);
            listenToAudioNode.onaudioprocess = function(e) {
                for(var c = 0; c < channelCount; c++) {
                    var outputChannelData = e.outputBuffer.getChannelData(c),
                        inputChannelData = e.inputBuffer.getChannelData(c);
                    for(var s = 0; s < bufferSize; s++) {
                        outputChannelData[s] = inputChannelData[s];
                    }
                }
            };
            streamSource.connect(listenToAudioNode);
            listenToAudioNode.connect(Biscuit.context.destination);
        }, function(e) {
            console.log("Audio listen error!", e);
        });
    });
}

//AJAX request
function ajax(options) {
	var request = new XMLHttpRequest(),
		method = options.method || "GET",
		data = options.data || null;
	request.onload = function(e) {
		if(this.status == 200) {
			if(options.onSuccess) options.onSuccess(this.response);
		}
	};
	request.open(method, options.url);
	if(data && typeof data == "object") {
		data = JSON.stringify(data);
		//request.setRequestHeader("Content-Type", "application/json");
	}
	if(options.responseType) request.responseType = options.responseType;
	request.send(data);
}
