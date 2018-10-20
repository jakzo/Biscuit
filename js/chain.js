//Creates an effects chain
var EffectsChain = function(options) {
    var me = this;
    options = options || {};
    this.track = options.track || null;
    //Ports for chain input
    var midiPort, audioPort, outputPort;
    //Create DOM containers
    var container = me.element = UI.createElement("DIV", "chain");
    var bank = UI.createElement("DIV", "chain_bank", container);
    var presetContainer = UI.createElement("DIV", "chain_presets", bank);
    var presetSpan = UI.createElement("SPAN", "ui_menubutton", presetContainer);
    presetSpan.textContent = "<New>";
    function presetSelected(item) {
        presetMenu.settings.button.textContent = item.text;
        var items = presetMenu.settings.items;
        for(var i = 0; i < items.length; i++) {
            presetMenu.setItemToggle(items[i], false);
        }
        presetMenu.setItemToggle(item, true);
        presetName.value = item.value ? item.value.name : "";
    }
    var presetMenu = new Menu({
        button: presetSpan,
        openClass: "ui_menuopen",
        items: [],
        onItemSelect: presetSelected,
        classPrefix: "ui"
    });
    var presetInputs = UI.createElement("DIV", "", presetContainer);
    var presetName = UI.createElement("TEXTINPUT", "", presetInputs);
    presetName.placeholder = "Preset Name";
    var presetSave = UI.createElement("BUTTON", "", presetInputs);
    presetSave.textContent = "Save";
    presetSave.addEventListener("click", function(e) {
        //Update or add the new preset
        var preset;
        function updateMenu(menu) {
            var items = menu.settings.items;
            for(var i = 1; i < items.length; i++) {
                var item = items[i];
                if(item.value == preset) {
                    menu.setOnlyItemToggled(item);
                    break;
                }
            }
            menu.settings.button.textContent = preset.name;
        }
        //Find and update the currently selected item
        var items = presetMenu.settings.items;
        for(var i = 1; i < items.length; i++) {
            var item = items[i];
            if(item.toggled) {
                preset = item.value;
                preset.name = presetName.value;
                if(Preset.onChange) Preset.onChange(preset);
                item.text = preset.name;
                updateMenu(presetMenu);
                preset.setEffects(chainEffects);
                return;
            }
        }
        //Add the item if it was not found
        preset = new Preset(presetName.value);
        var items = presetMenu.settings.items;
        var item = items[items.length - 1];
        updateMenu(presetMenu);
        presetMenu.setOnlyItemToggled(item);
        if(me.track) {
            updateMenu(me.track.presetMenu);
            me.track.presetName = preset.name;
            me.track.preset = preset;
        }
        preset.setEffects(chainEffects);
    }, false);
    var scrollContainer = UI.createElement("DIV", "chain_scroll", bank);
    
    var chain = UI.createElement("DIV", "chain_container", container);
    var zoomContainer = UI.createElement("DIV", "chain_zoom", chain);
    zoomContainer.style.transformOrigin = "0 0";
    var cableCanvas = Biscuit.createSvgCanvas(1000, 1000);
    zoomContainer.appendChild(cableCanvas);
    
    //Keep track of element positions
    var chainEffects = me.effects = [];
    function createElement(effect) {
        //Create effect container
        var element = document.createElement("DIV");
        element.effect = effect;
        effect.element = element;
        element.className = "chain_element";
        //Create effect box
        var box = document.createElement("DIV");
        box.effect = effect;
        effect.box = box;
        box.className = "chain_effectbox";
        box.addEventListener("mousedown", effectElementDown, false);
        element.appendChild(box);
        //Initialise effect display
        if(effect.dom) box.appendChild(effect.dom);
        else {
            var title = document.createElement("H3");
            title.textContent = effect.displayName;
            box.appendChild(title);
            //Draw parameter controls
            if(effect.parameters) for(var name in effect.parameters) {
                var parameter = effect.parameters[name];
                var row = document.createElement("DIV");
                var label = document.createElement("SPAN");
                label.textContent = parameter.displayName;
                row.appendChild(label);
                var control = UI.createElement("TEXTINPUT", "", row);
                if(parameter.type == "range") {
                    control.type = "range";
                    control.min = (parameter.min || 0) * 100;
                    control.max = (parameter.max || 100) * 100;
                    control.value = (parameter.value || 50) * 100;
                }
                else if(parameter.type == "file") {
                    control.type = "file";
                }
                else if(parameter.type == "number") {
                    control.type = "number";
                    control.min = parameter.min || 0;
                    control.max = parameter.max || 100;
                }
                control.effect = effect;
                control.parameter = parameter;
                control.parameterName = name;
                control.addEventListener("change", effectParameterChanged, false);
                control.addEventListener("mouseup", stopPropagation, false);
                parameter.control = control;
                box.appendChild(row);
            }
        }
        //Get effect size
        document.body.appendChild(element);
        effect.width = element.offsetWidth;
        effect.height = element.offsetHeight;
        //Create input/output ports
        var portCount = effect.inputs.length + effect.outputs.length;
        var currentPort = 0, portSpacing = effect.width / (portCount + 1);
        function createPorts(ports, type) {
            for(var i = 0; i < ports.length; i++) {
                var port = ports[i];
                var div = document.createElement("DIV");
                var classList = div.classList;
                classList.add("chain_port");
                if(type == "input") classList.add("chain_inputport");
                else classList.add("chain_outputport");
                if(port.type == "midi") classList.add("chain_midiport");
                else if(port.type == "note") classList.add("chain_noteport");
                else classList.add("chain_audioport");
                port.x = portSpacing * ++currentPort;
                div.style.left = port.x + "px";
                //The angle of the port (0=down, 180=up, etc.)
                port.angle = 0;
                //Handle port linking
                port.element = div;
                div.port = port;
                div.portType = port.type;
                div.portInput = type == "input";
                div.addEventListener("mousedown", portDown, false);
                element.appendChild(div);
                port.x += div.offsetWidth / 2;
                port.y = div.offsetTop + div.offsetHeight;
            }
        }
        createPorts(effect.inputs, "input");
        createPorts(effect.outputs, "output");
        document.body.removeChild(element);
        return element;
    }
    
    function effectParameterChanged(e) {
        var value = this.value, effect = this.effect,
            parameter = this.parameter, parameterName = this.parameterName;
        if(parameter.type == "range") value /= 100;
        else if(parameter.type == "file") {
            var file = this.files[0];
            if(!file) {
                effect.setParameter(parameterName, null);
                return;
            }
            Resources.addFile(file, function(resource) {
                effect.setParameter(parameterName, {
                    name: resource.headers.name,
                    size: resource.headers.size,
                    buffer: resource.data
                });
            });
            return;
        }
        effect.setParameter(parameterName, value, true);
    }
    
    function stopPropagation(e) { e.stopPropagation(); }
    
    function stopEvent(e) {
        e.stopPropagation();
        e.preventDefault();
    }
    
    //Handles viewport dragging
    var viewStart;
    function viewDown(e) {
        stopEvent(e);
        viewStart = {
            x: e.screenX,
            y: e.screenY,
            scrollLeft: chain.scrollLeft,
            scrollTop: chain.scrollTop
        };
        document.body.classList.add("grabbing");
        //Listen for drag events
        window.addEventListener("mousemove", viewMove, false);
        window.addEventListener("mouseup", viewUp, false);
    }
    function viewMove(e) {
        //Scroll the chain area
        var deltaX = e.screenX - viewStart.x;
        var deltaY = e.screenY - viewStart.y;
        chain.scrollLeft = viewStart.scrollLeft - deltaX;
        chain.scrollTop = viewStart.scrollTop - deltaY;
    }
    function viewUp(e) {
        //Restore state
        document.body.classList.remove("grabbing");
        window.removeEventListener("mousemove", viewMove, false);
        window.removeEventListener("mouseup", viewUp, false);
    }
    zoomContainer.addEventListener("mousedown", viewDown, false);
    
    //Handles zooming
    var zoomScale = 1;
    var zoomLeftMargin = 0;
    var zoomBaseWidth = 1000;
    var zoomBaseHeight = 1000;
    var openThreshold = 0.75;
    function scale(level) {
        //Set the effect opening state
        if(zoomScale >= openThreshold && level < openThreshold) {
            for(var i = 0; i < chainEffects.length; i++) {
                chainEffects[i].element.classList.add("chain_click");
            }
        }
        else if(zoomScale < openThreshold && level >= openThreshold) {
            for(var i = 0; i < chainEffects.length; i++) {
                chainEffects[i].element.classList.remove("chain_click");
            }
        }
        //Zoom the viewport
        zoomScale = level;
        zoomContainer.style.transform = "scale(" + zoomScale + ")";
    }
    chain.addEventListener("wheel", function(e) {
        e.preventDefault();
        scale(zoomScale * (1 - e.deltaY / 1000));
    }, false);
    
    //Opens an effect for editing
    function openEffect(effect) {
        //Get view and effect sizes
        var viewWidth = chain.clientWidth;
        var viewHeight = chain.clientHeight;
        var viewRatio = viewWidth / viewHeight;
        var effectRatio = effect.width / effect.height;
        //Match effect size to view size
        if(effectRatio > viewRatio) scale(viewWidth / effect.width);
        else scale(viewHeight / effect.height);
        //Scroll to effect
        chain.scrollLeft = effect.x * zoomScale;
        chain.scrollTop = effect.y * zoomScale;
    }
    
    //Handles effect drag and drop
    var currentElement = null;
    var mouseIsOverChainArea = false;
    var positionIsValid = false;
    var originalLocation;
    function startDrag(e, element) {
        currentElement = element;
        document.body.appendChild(element);
        mouseIsOverChainArea = false;
        originalLocation = { x: element.effect.x, y: element.effect.y };
        dragMove(e);
        currentElement.style.pointerEvents = "none";
        document.body.classList.add("grabbing");
        window.addEventListener("mousemove", dragMove, false);
        window.addEventListener("mouseup", dragEnd, false);
    }
    function dragMove(e) {
        //Check if the mouse is in or out of the chain area
        var parent = e.target;
        var x = e.pageX, y = e.pageY;
        while(parent && parent != zoomContainer) {
            parent = parent.parentNode;
        }
        if(parent != zoomContainer) {
            //If mouse has moved out of chain area
            if(mouseIsOverChainArea) {
                removeElement(currentElement);
                mouseIsOverChainArea = false;
                document.body.appendChild(currentElement);
                forEachCable(currentElement.effect, "hide");
            }
            currentElement.style.left = x + "px";
            currentElement.style.top = y + "px";
            return;
        }
        x += chain.scrollLeft;
        y += chain.scrollTop;
        while(parent) {
            x -= parent.offsetLeft;
            y -= parent.offsetTop;
            parent = parent.offsetParent;
        }
        //If mouse has moved into chain area
        if(!mouseIsOverChainArea) {
            removeElement(currentElement);
            zoomContainer.appendChild(currentElement);
            forEachCable(currentElement.effect, "show");
            mouseIsOverChainArea = true;
            positionIsValid = true;
        }
        x /= zoomScale;
        y /= zoomScale;
        //Get effect position
        var effect = currentElement.effect;
        effect.x = x;
        effect.y = y;
        currentElement.style.left = x + "px";
        currentElement.style.top = y + "px";
        //Check if the position intersects any existing effects
        var xRight = x + currentElement.offsetWidth;
        var yBottom = y + currentElement.offsetHeight;
        function checkIntersection(effect) {
            if(effect == currentElement.effect) return;
            var top = effect.y, left = effect.x;
            var right = left + effect.width, bottom = top + effect.height;
            //TODO: Better checking...
            if(x >= left && x < right && y >= top && y < bottom) {
                //If the position has just become invalid
                if(positionIsValid) {
                    currentElement.effect.box.classList.add("chain_invalid");
                    positionIsValid = false;
                }
                forEachCable(currentElement.effect, "update");
                return true;
            }
        }
        for(var i = 0; i < chainEffects.length; i++) {
            if(checkIntersection(chainEffects[i])) return;
        }
        //If the position has just become valid
        if(!positionIsValid) {
            currentElement.effect.box.classList.remove("chain_invalid");
            positionIsValid = true;
        }
        //Move connected cables
        forEachCable(currentElement.effect, "update");
    }
    function removeElement(element) {
        element.parentNode.removeChild(element);
    }
    function dragEnd(e) {
        var effect = currentElement.effect;
        if(mouseIsOverChainArea && positionIsValid) {
            chainEffects.push(effect);
        }
        else if(!mouseIsOverChainArea && !effect.invincible) {
            //Remove the effect from the chain
            forEachPort(effect, function(port) {
                if(port.cable) {
                    port.cable.remove();
                    port.connectedTo.cable = null;
                    port.connectedTo.connectedTo = null;
                }
            });
            for(var i = 0; i < chainEffects.length; i++) {
                if(chainEffects[i] == effect) {
                    chainEffects.splice(i, 1);
                    break;
                }
            }
            removeElement(currentElement);
        }
        else {
            //Put the effect back in it's original location
            removeElement(currentElement);
            effect.x = originalLocation.x;
            effect.y = originalLocation.y;
            currentElement.style.left = effect.x + "px";
            currentElement.style.top = effect.y + "px";
            zoomContainer.appendChild(currentElement);
            forEachCable(effect, "show");
            forEachCable(effect, "update");
        }
        currentElement.style.pointerEvents = "";
        currentElement.effect.box.classList.remove("chain_invalid");
        document.body.classList.remove("grabbing");
        window.removeEventListener("mousemove", dragMove, false);
        window.removeEventListener("mouseup", dragEnd, false);
    }
    
    //Handles chain area effect clicking/dragging
    var effectMouseStart;
    function effectElementDown(e) {
        stopEvent(e);
        //Open the effect if we're zoomed out far enough
        if(zoomScale < openThreshold) {
            openEffect(this.effect);
            return;
        }
        //If the mouse is moved a certain distance, start dragging
        effectMouseStart = {
            element: this,
            x: e.screenX,
            y: e.screenY
        };
        window.addEventListener("mousemove", effectMouseMoved, false);
        window.addEventListener("mouseup", effectMouseUp, false);
    }
    function effectMouseMoved(e) {
        var x = e.screenX, y = e.screenY;
        var minX = effectMouseStart.x - 10;
        var minY = effectMouseStart.y - 10;
        var maxX = effectMouseStart.x + 10;
        var maxY = effectMouseStart.y + 10;
        if(x > maxX || x < minX || y > maxY || y < minY) {
            effectMouseUp(e);
            var element = effectMouseStart.element.parentNode;
            removeElement(element);
            startDrag(e, element);
        }
    }
    function effectMouseUp(e) {
        window.removeEventListener("mousemove", effectMouseMoved, false);
        window.removeEventListener("mouseup", effectMouseUp, false);
    }
    
    //When an effect from the bank is clicked
    function bankEffectDown(e) {
        var effect = this.effect;
        var element = createElement(new effect({}));
        startDrag(e, element);
    }
    
    //Handles linking ports together
    var currentPort = null;
    function portDown(e) {
        stopEvent(e);
        //Remove the old connection
        if(this.port.connectedTo) {
            this.port.connectedTo.connectedTo = null;
            this.port.connectedTo = null;
            this.port.cable.remove();
            this.port.cable = null;
        }
        currentPort = {
            element: this,
            port: this.port,
            type: this.portType,
            input: this.portInput,
            newLinkPort: null,
            newLinkElement: null,
            cable: new Cable(
                this.portType,
                this.portInput ? this.port : null,
                this.portInput ? null : this.port
            ),
            oldPort: null
        };
        document.body.classList.add("grabbing");
        window.addEventListener("mousemove", portMove, false);
        window.addEventListener("mouseup", portUp, false);
    }
    function portMove(e) {
        //If the mouse has moved over a port
        if(e.target.portInput != undefined &&
                e.target.portInput != currentPort.input &&
                e.target.portType == currentPort.type) {
            if(currentPort.newLinkElement != e.target) {
                currentPort.newLinkElement = e.target;
                currentPort.newLinkPort = e.target.port;
                //Connect cable to new port
                currentPort.oldPort = currentPort.newLinkPort.connectedTo;
                if(currentPort.oldPort) currentPort.oldPort.cable.hide();
                var setPort = e.target.portInput ?
                    currentPort.cable.setInputPort :
                    currentPort.cable.setOutputPort;
                setPort(currentPort.newLinkPort);
            }
            return;
        }
        //If the mouse has moved out of a port
        else if(currentPort.newLinkElement) {
            //Put the old cable back
            resetOldPort();
            //Reset our cable
            var setPort = currentPort.input ?
                currentPort.cable.setOutputPort :
                currentPort.cable.setInputPort;
            setPort(null);
            currentPort.newLinkElement = null;
            currentPort.newLinkPort = null;
        }
        //Update the cable position
        var mousePosition = getPositionRelativeTo(e, zoomContainer);
        if(!mousePosition) return;
        mousePosition.noAngle = true;
        var inputPosition = currentPort.input ? null : mousePosition;
        var outputPosition = currentPort.input ? mousePosition : null;
        currentPort.cable.update(inputPosition, outputPosition);
    }
    function portUp(e) {
        if(currentPort.newLinkPort) {
            //Unlink the old connections and link the new ones
            if(currentPort.port.connectedTo) {
                currentPort.port.connectedTo.connectedTo = null;
            }
            if(currentPort.oldPort) {
                currentPort.oldPort.connectedTo = null;
                currentPort.oldPort.cable.remove();
            }
            currentPort.port.connectedTo = currentPort.newLinkPort;
            currentPort.newLinkPort.connectedTo = currentPort.port;
            currentPort.newLinkPort.cable = currentPort.cable;
        }
        //Remove the cable
        else {
            currentPort.cable.remove();
            resetOldPort();
        }
        //Reset state
        currentPort = null;
        document.body.classList.remove("grabbing");
        window.removeEventListener("mousemove", portMove, false);
        window.removeEventListener("mouseup", portUp, false);
    }
    function resetOldPort() {
        if(!currentPort.oldPort) return;
        var setOldPort = currentPort.input ?
            currentPort.oldPort.cable.setOutputPort :
            currentPort.oldPort.cable.setInputPort;
        setOldPort(currentPort.newLinkPort);
        currentPort.oldPort.cable.show();
        currentPort.oldPort = null;
    }
    
    //Sort the effects into types
    var allEffects = Biscuit.effects;
    var instruments = [], audioEffects = [], otherEffects = [];
    for(var uuid in allEffects) {
        var midiInput = false, audioInput = false;
        var noteOutput = false, audioOutput = false;
        var effect = allEffects[uuid];
        var inputs = effect.inputs;
        var outputs = effect.outputs;
        for(var a = 0; a < inputs.length; a++) {
            var input = inputs[a];
            if(input.type == "midi") midiInput = true;
            else if(input.type == "audio") audioInput = true;
        }
        for(var a = 0; a < outputs.length; a++) {
            var output = outputs[a];
            if(output.type == "audio") audioOutput = true;
            else if(output.type == "note") noteOutput = true;
        }
        if(midiInput && (audioOutput || noteOutput)) instruments.push(effect);
        else if(audioInput && audioOutput) audioEffects.push(effect);
        else if(effect.uuid != EffectsChain.INPUT_UUID &&
            effect.uuid != EffectsChain.OUTPUT_UUID) otherEffects.push(effect);
    }
    //Display the bank categories
    function displayBankCategory(title, effects) {
        var heading = document.createElement("H2");
        heading.textContent = title;
        scrollContainer.appendChild(heading);
        var list = document.createElement("UL");
        scrollContainer.appendChild(list);
        for(var i = 0; i < effects.length; i++) {
            var effect = effects[i];
            var item = document.createElement("LI");
            item.textContent = effect.displayName;
            item.effect = effect;
            item.addEventListener("mousedown", bankEffectDown, false);
            list.appendChild(item);
        }
    }
    displayBankCategory("Instruments", instruments);
    displayBankCategory("Audio Effects", audioEffects);
    displayBankCategory("Other Effects", otherEffects);

    //Returns the passed in audio
    function generateAudioInput(audio, sampleCount, offset) {
        if(!this.track) return null;
        var data = this.track.generateAudio(audio, sampleCount, offset);
        return data;
    };
    
    //Create input and output effect elements
    function addInputOutputEffects() {
        var startEffect = new Biscuit.effects[EffectsChain.INPUT_UUID];
        midiPort = startEffect.outputs[0];
        audioPort = startEffect.outputs[1];
        audioPort.generate = generateAudioInput;
        startEffect.x = startEffect.y = 10;
        startEffect.invincible = true;
        var startElement = createElement(startEffect);
        startElement.style.left = startEffect.x + "px";
        startElement.style.top = startEffect.y + "px";
        zoomContainer.appendChild(startElement);
        var endEffect = new Biscuit.effects[EffectsChain.OUTPUT_UUID];
        outputPort = endEffect.inputs[0];
        endEffect.x = 130;
        endEffect.y = 10;
        endEffect.invincible = true;
        var endElement = createElement(endEffect);
        endElement.style.left = endEffect.x + "px";
        endElement.style.top = endEffect.y + "px";
        zoomContainer.appendChild(endElement);
        chainEffects.push(startEffect, endEffect);
    }
    addInputOutputEffects();
    
    //API functions
    me.add = function(effect) {
        var element = createElement(effect);
        element.effect = effect;
        element.addEventListener("mousedown", effectElementDown, false);
        if(effect.x == null || effect.y == null) {
            //Add the effect element to the top-right of the current elements
            var top = Infinity, right = 0;
            for(var i = 0; i < chainEffects.length; i++) {
                var chainEffect = chainEffects[i];
                if(chainEffect.x > right) right = chainEffect.x;
                if(chainEffect.y < top) top = chainEffect.y;
            }
            effect.x = right + 20;
            effect.y = top;
        }
        element.style.left = effect.x + "px";
        element.style.top = effect.y + "px";
        chainEffects.push(effect);
        zoomContainer.appendChild(element);
        //If it is an input/output effect, set the special ports
        if(effect.uuid == EffectsChain.INPUT_UUID) {
            midiPort = effect.outputs[0];
            audioPort = effect.outputs[1];
            audioPort.generate = generateAudioInput;
        }
        else if(effect.uuid == EffectsChain.OUTPUT_UUID) {
            outputPort = effect.inputs[0];
        }
    };
    //Connects two ports together and draws the cable between them
    me.connectPorts = function(inputPort, outputPort) {
        inputPort.connectedTo = outputPort;
        outputPort.connectedTo = inputPort;
        var cable = new Cable(inputPort.type, inputPort, outputPort);
        cable.update();
    };
    //Opens an effects chain preset
    me.open = function(preset) {
        me.clear();
        if(!preset) {
            addInputOutputEffects();
            var item = presetMenu.settings.items[0];
            presetMenu.setOnlyItemToggled(item);
            presetMenu.settings.button.textContent = item.text;
            return;
        }
        //Add other effects
        var createdEffects = [];
        for(var i = 0; i < preset.effects.length; i++) {
            var presetEffect = preset.effects[i];
            var effectClass = Biscuit.effects[presetEffect.uuid];
            if(!effectClass) continue;
            var effect = new effectClass();
            for(var name in preset.parameters) {
                effect.setParameter(name, presetEffect.parameters[name]);
            }
            effect.x = presetEffect.x;
            effect.y = presetEffect.y;
            me.add(effect);
            createdEffects[i] = effect;
        }
        //Connect the ports
        function connect(index, portType, otherType) {
            var presetPorts = preset.effects[index][portType];
            for(var p = 0; p < presetPorts.length; p++) {
                var port = createdEffects[index][portType][p];
                if(port.connectedTo) continue;
                //Connect the port to the indexed effect and port
                var presetPort = presetPorts[p];
                var connectedEffect = createdEffects[presetPort.effect];
                if(!connectedEffect) continue;
                var otherPort = connectedEffect[otherType][presetPort.port];
                var inputPort = portType == "inputs" ? port : otherPort;
                var outputPort = portType == "inputs" ? otherPort : port;
                me.connectPorts(inputPort, outputPort);
            }
        }
        for(var i in createdEffects) {
            connect(i, "inputs", "outputs");
            connect(i, "outputs", "inputs");
        }
        //Load the preset menu
        var items = presetMenu.settings.items;
        for(var i = 0; i < items.length; i++) {
            var item = items[i];
            if(item.value == preset) {
                presetSelected(item);
                break;
            }
        }
    };
    me.clear = function() {
        while(zoomContainer.lastChild != cableCanvas) {
            zoomContainer.removeChild(zoomContainer.lastChild);
        }
        chainEffects = me.effects = [];
        Cable.removeAll();
        presetName.value = "";
    };
    //Clears the state of all effects so that notes don't carry
    //on after stopping playback and moving the play marker
    me.reset = function() {
        for(var i = 0; i < chainEffects.length; i++) {
            if(chainEffects[i].reset) chainEffects[i].reset();
        }
    };
    me.midiEvent = function(event) {
        if(!midiPort.connectedTo || !midiPort.connectedTo.onEvent) return;
        midiPort.connectedTo.onEvent(event);
    };
    me.generate = function(audio, sampleCount, offset, audioInputData) {
        if(!outputPort.connectedTo) return null;
        me.audioInputData = audioInputData;
        return outputPort.connectedTo.generate(audio, sampleCount, offset);
    };
    me.reloadPresetMenu = function() {
        var selectedPreset = presetMenu.value;
        var items = Preset.getMenuItems();
        items.splice(0, 0, { text: "<New Preset>", toggle: true });
        presetMenu.setItems(items);
        if(selectedPreset) {
            for(var i = 0; i < items.length; i++) {
                var item = items[i];
                if(item.value == selectedPreset) {
                    presetMenu.setItemToggle(item, true);
                    presetMenu.settings.button.textContent = item.text;
                    break;
                }
            }
        }
        else presetMenu.setItemToggle(items[0], true);
    };
    me.reloadPresetMenu();
    
    //Creates a cable
    var Cable = function(type, inputPort, outputPort) {
        
        var me = this;
        me.inputPort = inputPort;
        me.outputPort = outputPort;
        me.path = null;
        
        //Set the port's cable to this
        if(inputPort) inputPort.cable = me;
        if(outputPort) outputPort.cable = me;
        
        //Updates the cable position (optionally with other positions)
        this.update = function(inputPosition, outputPosition) {
            function getPortConnectionPosition(port) {
                if(!port) return null;
                var element = port.element;
                return {
                    angle: port.angle,
                    x: port.effect.x + port.x,
                    y: port.effect.y + port.y
                };
            }
            inputPosition = inputPosition || getPortConnectionPosition(me.inputPort);
            outputPosition = outputPosition || getPortConnectionPosition(me.outputPort);
            if(!inputPosition || !outputPosition) return;
            var x1 = inputPosition.x, y1 = inputPosition.y;
            var x2 = outputPosition.x, y2 = outputPosition.y;
            var cableCurveAmount = 50, radians, cp1x, cp1y, cp2x, cp2y;
            if(inputPosition.noAngle) {
                cp1x = x1;
                cp1y = y1;
            }
            else {
                radians = inputPosition.angle / 180 * Math.PI;
                cp1x = x1 + Math.sin(radians) * cableCurveAmount;
                cp1y = y1 + Math.cos(radians) * cableCurveAmount;
            }
            if(outputPosition.noAngle) {
                cp2x = x2;
                cp2y = y2;
            }
            else {
                radians = outputPosition.angle / 180 * Math.PI;
                cp2x = x2 + Math.sin(radians) * cableCurveAmount;
                cp2y = y2 + Math.cos(radians) * cableCurveAmount;
            }
            var data = "M" + x1 + " " + y1 +
                " C" + cp1x + " " + cp1y + " " +
                cp2x + " " + cp2y + " " +
                x2 + " " + y2;
            me.path.setAttribute("d", data);
        };
        
        function setPort(type, port) {
            me[type] = port;
            if(port) {
                port.cable = me;
                me.update();
            }
        }
        this.setInputPort = function(inputPort) {
            setPort("inputPort", inputPort);
        };
        this.setOutputPort = function(outputPort) {
            setPort("outputPort", outputPort);
        };
        
        //Create the cable SVG path
        var colour = "#333";
        if(type == "midi") colour = "#363";
        else if(type == "audio") colour = "#336";
        else if(type == "note") colour = "#636";
        me.path = document.createElementNS(Biscuit.svgNamespace, "path");
        me.path.setAttribute("stroke", colour);
        me.path.setAttribute("stroke-width", "3");
        me.path.setAttribute("fill", "none");
        cableCanvas.appendChild(me.path);
        
        Cable.all.push(me);
    };
    //Cable DOM functions
    Cable.prototype.remove = function() {
        this.path.remove();
        for(var c = 0; c < Cable.all.length; c++) {
            if(Cable.all[c] == this) Cable.all.splice(c, 1);
        }
    };
    Cable.prototype.hide = function() { this.path.style.display = "none"; };
    Cable.prototype.show = function() { this.path.style.display = ""; };
    //Cable globals
    Cable.all = [];
    Cable.removeAll = function() {
        while(Cable.all.length) Cable.all[0].remove();
    };
    
    //Returns the X position in relation to an element
    function getPositionRelativeTo(e, relativeElement) {
        var element = e.target;
        var x = e.offsetX, y = e.offsetY;
        while(element != relativeElement && element) {
            x += element.offsetLeft - element.scrollLeft;
            y += element.offsetTop - element.scrollTop;
            element = element.offsetParent;
        }
        return element ? { x: x, y: y } : null;
    }
    
    //Loops through each port of an effect
    function forEachPort(effect, iterator) {
        for(var i = 0; i < effect.inputs.length; i++) {
            iterator(effect.inputs[i], "input");
        }
        for(var i = 0; i < effect.outputs.length; i++) {
            iterator(effect.outputs[i], "output");
        }
    }
    
    //Loops through each cable of an effect
    function forEachCable(effect, iterator) {
        forEachPort(effect, function(port) {
            if(port.cable) port.cable[iterator]();
        });
    }
};

//Returns an effect instance from the chain with the specified ID
EffectsChain.prototype.getEffectById = function(id) {
    for(var i = 0; i < this.effects.length; i++) {
        var effect = this.effects[i];
        if(effect.id == id) return effect;
    }
    return null;
};

//Initialise input and output effects
EffectsChain.INPUT_UUID = "00000000-0000-0000-0000-000000000000";
EffectsChain.OUTPUT_UUID = "00000000-0000-0000-0000-000000000001";
new Biscuit.Effect(function() {
    this.uuid = EffectsChain.INPUT_UUID;
    this.displayName = "Input";
    this.parameters = {};
    this.inputs = [];
    this.outputs = [
        { type: "midi" },
        { type: "audio" }
    ];
});
new Biscuit.Effect(function() {
    this.uuid = EffectsChain.OUTPUT_UUID;
    this.displayName = "Output";
    this.parameters = {};
    this.inputs = [{ type: "audio" }];
    this.outputs = [];
});

//Helper effects
var NoteToAudio = new Biscuit.Effect(function() {
    this.displayName = "Notes to Audio Converter";
    this.uuid = "e83acff6-1c74-11e4-8c21-0800200c9a66";
    var input = { type: "note" };
    this.inputs = [ input ];
    this.outputs = [{ type: "audio", generate: function(audio, sampleCount, sampleOffset) {
        if(input.connectedTo) {
            var noteChannels = input.connectedTo.generate(
                audio,
                sampleCount,
                sampleOffset,
                audio.sampleRate
            );
            if(!noteChannels || !noteChannels.length) return null;
            var channelCount = noteChannels[0].length;
            var audioChannels = Biscuit.createBlankAudioChannels(sampleCount, channelCount);
            for(var n = 0; n < noteChannels.length; n++) {
                Biscuit.combineChannels(audioChannels, noteChannels[n]);
            }
            return audioChannels;
        }
        return null;
    } }];
});

//Creates an effects chain preset
var Preset = function(name, effects) {
    Preset.all.push(this);
    this.name = name;
    this.effects = effects;
    if(Preset.onChange) Preset.onChange(this);
};
Preset.prototype.setEffects = function(effects) {
    //Add the effects to the preset
    var me = this;
    this.effects = [];
    for(var i = 0; i < effects.length; i++) {
        var effect = effects[i];
        var parameters = {};
        for(var name in effect.parameters) {
            parameters[name] = effect.parameters[name].value;
        }
        var presetEffect = {
            uuid: effect.uuid,
            parameters: parameters,
            inputs: [],
            outputs: [],
            oldInputs: effect.inputs,
            oldOutputs: effect.outputs,
            oldEffect: effect,
            x: effect.x,
            y: effect.y
        };
        this.effects.push(presetEffect);
    }
    //Link ports with indexes
    //TODO: Give each port a unique ID and link using that...
    function linkPorts(index, ports, oldPorts, otherType, otherOldType) {
        var effects = me.effects;
        var effectCount = effects.length;
        for(var p = 0; p < oldPorts.length; p++) {
            if(ports[p]) continue;
            var port = oldPorts[p];
            var connectedPort = port.connectedTo;
            if(connectedPort) {
                //Find the index of the connected effect and port
                for(var i = 0; i < effectCount; i++) {
                    var effect = effects[i];
                    if(effect.oldEffect == connectedPort.effect) {
                        var otherPorts = effect[otherOldType];
                        for(var a = 0; a < otherPorts.length; a++) {
                            if(otherPorts[a] == connectedPort) {
                                //Link the ports!
                                ports[p] = { effect: i, port: a };
                                effect[otherType][a] = {
                                    effect: index,
                                    port: p
                                };
                                break;
                            }
                        }
                        break;
                    }
                }
            }
        }
    }
    for(var i = 0; i < this.effects.length; i++) {
        var effect = this.effects[i];
        linkPorts(i, effect.inputs, effect.oldInputs, "outputs", "oldOutputs");
        delete effect.oldInputs;
        linkPorts(i, effect.outputs, effect.oldOutputs, "inputs", "oldInputs");
        delete effect.oldOutputs;
    }
    for(var i = 0; i < this.effects.length; i++) {
        delete this.effects[i].oldEffect;
    }
};
Preset.all = [];
Preset.getMenuItems = function() {
    var presets = Preset.all, items = [];
    for(var p = 0, length = presets.length; p < length; p++) {
        var preset = presets[p];
        items.push({ text: preset.name, value: preset, toggle: true });
    }
    return items;
};