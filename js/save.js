//Saves and loads the current state as a file
//TODO: automations, metadata for Biscuit addons

/*

--------------------------------------
- Biscuit Save File Format Version 3 -
--------------------------------------

Note 1: Subchunks can be in any order, however there must only be one header
        subchunk and it is recommended that it is the first subchunk.

Note 2: Values of type Ustring are unicode values and are therefore two bytes
        per character.

Note 2: All chunks containing subchunks (RIFF, trak, loop, efct, efpr) can
        optionally contain 'adon' chunks which hold addon data related to the
        chunk that they are contained within. Following is the format of an
        'adon' chunk:
        
        String(4) "adon"
        Int(4) Addon chunk length

            Int

//File contains a single RIFF Chunk
String(4) "RIFF"
Int(4) Riff chunk size

    //Project header data
    String(4) "bphd"
    Int(4) Project header chunk length

        String(7) "Biscuit"
        String(7) "Project"
        Int(1) Biscuit project save file version
        Int(1) Minimum compatible Biscuit project save file version
        Int(4) Play marker offset

    //Track Chunk List
    String(4) "trak"
    Int(4) Track chunk size

        //First chunk contains track header data
        String(4) "tkhd"
        Int(4) Track header chunk length

            Int(1) Boolean track options
                Bit 0 = Muted
            Int(1) Track name byte size
            Ustring(...) Track name
            Int(1) Track preset name byte size
            Ustring(...) Track preset name
            Int(1) Track volume * 100 (0 - 150)

        //Followed by multiple effect chunks
        String(4) "efct"
        Int(4) Effect chunk length

            //First chunk contains effect header data
            String(4) "efhd"
            Int(4) Effect header chunk length

                Int(1) Boolean effect options
                String(36) UUID
                Int(4) X position * 100
                Int(4) Y position * 100

            //Subsequent chunks contain effect parameter data...
            String(4) "efpr"
            Int(4) Effect parameter chunk length
                
                //Effect parameter data
                String(4) "ephd"
                Int(4) Effect parameter header chunk length

                    Int(1) Parameter name length
                    Ustring(...) Parameter name
                    Int(1) Parameter type
                        0 = Unknown
                        1 = Range
                        2 = Number
                        3 = File
                        4 = String
                    Parameter(...) Parameter value
                        Range:  Int(4) Value * 100
                        Number: Int(4) Value
                        File:   Int(2) Parameter value byte size
                                       (4 + file name length * 2)
                                Int(4) File size
                                Ustring(...) File name
                        String: Int(2) Parameter value byte size
                                       (value length * 2)
                                Ustring(...) = Value
                
                //Optional effect parameter automation data chunk
                String(4) "epau"
                Int(4) Automation chunk length
                    
                    //Contains multiple consecutive automation data chunks
                    Int(4) Tick position
                    Parameter(...) Parameter value as defined above

            //...and effect port data
            String(4) "efpt"
            Int(4) Effect port chunk length

                Int(1) Boolean port options
                    Bit 0 = Output (0 = Input, 1 = Output)
                Int(2) Port ID (Auto-incremented value starting from 1)
                Int(2) ID of connected port (or 0 for none)
                Int(1) Port type
                    0 = Audio
                    1 = MIDI
                    2 = Note channels

        //Subsequent chunks contain track loop data
        String(4) "loop"
        Int(4) Loop chunk length

            //First loop data chunk contains loop header data
            String(4) "lphd"
            Int(4) Loop header chunk length

                Int(1) Boolean loop options
                    Bit 0 = Loop type (0 = MIDI, 1 = Wave)
                    Bit 1 = Loopable
                    Bit 2 = Size locked
                Int(1) Loop name byte size
                Ustring(...) Loop name
                Int(2) Ticks per beat
                Int(1) Time signature denominator
                Int(1) Time signature numerator
                Int(4) Tick position
                Int(4) Tick size
                Int(4) Tick offset
                Int(4) Looped tick size

            //Subsequent chunks contain loop event data
            String(4) "evnt"
            Int(4) Event chunk length

                Int(1) Event type
                    1 = Channel
                        Int(1) MIDI channel
                        Int(1) Note
                        Int(4) Tick position
                        Int(1) Event subtype
                            1 = Note on
                                Int(1) Velocity
                            2 = Note off
                                Int(1) Velocity
*/

Biscuit.Multitrack.saveVersion = 3;
Biscuit.Multitrack.minimumCompatibleVersion = 3;
Biscuit.Multitrack.prototype.getSaveData = function() {
    //Framework for easily creating save file chunks
    var Chunk = function(name) { this.name = name; this.data = []; };
    //Functions used to add data to the chunk
    Chunk.prototype.addInt = function(value, size) {
        if(value == null) value = 0;
        if(size == null) size = 1;
        this.data.push({ type: "int", size: size, value: value });
    };
    Chunk.prototype.addString = function(value, size) {
        if(value == null) value = "";
        if(size == null) size = value.length;
        this.data.push({ type: "string", value: value, size: size });
    };
    Chunk.prototype.addUstring = function(value, size) {
        if(value == null) value = "";
        if(size == null) size = value.length * 2;
        this.data.push({ type: "ustring", value: value, size: size });
    };
    Chunk.prototype.addChunk = function(value) {
        this.data.push({ type: "chunk", value: value });
    };
    //Returns the chunk as an array of bytes
    Chunk.prototype.getBytes = function() {
        //Functions for getting each type of chunk data as bytes
        var save = {
            int: function(item) {
                for(var i = 0; i < item.size; i++) {
                    bytes.push(item.value >> i * 8 & 0xFF);
                }
            },
            string: function(item) {
                for(var i = 0; i < item.size; i++) {
                    bytes.push(i < item.value.length ?
                        item.value.charCodeAt(i) : 0);
                }
            },
            ustring: function(item) {
                for(var i = 0; i < item.size; i += 2) {
                    var character = i < item.value.length ?
                        item.value.charCodeAt(i) : 0;
                    bytes.push(character & 0xFF, character >> 8);
                }
            },
            chunk: function(item) {
                bytes = bytes.concat(item.value.getBytes());
            }
        };
        //Get chunk data
        var bytes = [];
        for(var d = 0; d < this.data.length; d++) {
            var item = this.data[d];
            save[item.type](item);
        }
        //Get chunk header now that we know the size of the chunk data
        var header = [], i = -1;
        while(++i < 4) header[i] = this.name.charCodeAt(i);
        i--;
        while(++i < 8) header[i] = bytes.length >> (i - 4) * 8 & 0xFF;
        return header.concat(bytes);
    };

    //Set the unique port IDs first
    var portCount = 0;
    for(var t = 0; t < this.tracks.length; t++) {
        var effects = this.tracks[t].chain.effects;
        for(var i = 0; i < effects.length; i++) {
            var effect = effects[i];
            var ports = effect.inputs.concat(effect.outputs);
            for(var p = 0; p < ports.length; p++) {
                ports[p].portId = ++portCount;
            }
        }
    }

    //Get the save data
    var riff = new Chunk("RIFF");

    var projectHeader = new Chunk("bphd");
    projectHeader.addString("Biscuit");
    projectHeader.addString("Project");
    projectHeader.addInt(Biscuit.Multitrack.saveVersion);
    projectHeader.addInt(Biscuit.Multitrack.minimumCompatibleVersion);
    projectHeader.addInt(this.playOffset, 4);
    riff.addChunk(projectHeader);

    for(var t = 0; t < this.tracks.length; t++) {
        var track = this.tracks[t];
        var trackChunk = new Chunk("trak");

        var trackHeader = new Chunk("tkhd");
        var trackOptions = 0;
        if(track.muted) trackOptions |= 1;
        trackHeader.addInt(trackOptions);
        trackHeader.addInt(track.name.length * 2);
        trackHeader.addUstring(track.name);
        trackHeader.addInt(track.presetName.length * 2);
        trackHeader.addUstring(track.presetName);
        trackHeader.addInt(track.volume * 100);
        trackChunk.addChunk(trackHeader);

        var effects = track.chain.effects;
        for(var i = 0; i < effects.length; i++) {
            var effect = effects[i];
            var effectChunk = new Chunk("efct");

            var effectHeader = new Chunk("efhd");
            var effectOptions = 0;
            effectHeader.addInt(effectOptions);
            effectHeader.addString(effect.uuid, 36);
            effectHeader.addInt(effect.x * 100, 4);
            effectHeader.addInt(effect.y * 100, 4);
            effectChunk.addChunk(effectHeader);

            for(var name in effect.parameters) {
                var parameter = effect.parameters[name];
                var parameterChunk = new Chunk("efpr");
                parameterChunk.addInt(name.length * 2);
                parameterChunk.addUstring(name);
                if(parameter.type == "range") {
                    parameterChunk.addInt(1);
                    parameterChunk.addInt(parameter.value * 100, 4);
                }
                else if(parameter.type == "number") {
                    parameterChunk.addInt(2);
                    parameterChunk.addInt(parameter.value, 4);
                }
                else if(parameter.type == "file") {
                    parameterChunk.addInt(3);
                    if(parameter.value) {
                        var size = 4 + parameter.value.name.length * 2;
                        parameterChunk.addInt(size, 2);
                        parameterChunk.addInt(parameter.value.size, 4);
                        parameterChunk.addUstring(parameter.value.name);
                    }
                    else parameterChunk.addInt(0, 2);
                }
                else if(parameter.type == "string") {
                    parameterChunk.addInt(4);
                    parameterChunk.addInt(parameter.value.length * 2, 2);
                    parameterChunk.addUstring(parameter.value);
                }
                else {
                    parameterChunk.addInt(0);
                    parameterChunk.addInt(0, 2);
                }
                effectChunk.addChunk(parameterChunk);
            }

            var ports = effect.inputs.concat(effect.outputs);
            for(var p = 0; p < ports.length; p++) {
                var port = ports[p];
                var portChunk = new Chunk("efpt");
                var portOptions = 0;
                if(p >= effect.inputs.length) portOptions |= 1;
                portChunk.addInt(portOptions);
                portChunk.addInt(port.portId, 2);
                var connectedId = port.connectedTo ?
                    port.connectedTo.portId : 0;
                portChunk.addInt(connectedId, 2);
                portChunk.addInt({
                    "audio": 0,
                    "midi": 1,
                    "note": 2
                }[port.type]);
                effectChunk.addChunk(portChunk);
            }

            trackChunk.addChunk(effectChunk);
        }

        for(var l = 0; l < track.loops.length; l++) {
            var loop = track.loops[l];
            var loopChunk = new Chunk("loop");

            var loopHeader = new Chunk("lphd");
            var loopOptions = 0;
            if(loop.type == "wave") loopOptions |= 1;
            if(loop.loopable) loopOptions |= 2;
            if(loop.sizeLocked) loopOptions |= 4;
            loopHeader.addInt(loopOptions);
            loopHeader.addInt(loop.name.length * 2);
            loopHeader.addUstring(loop.name);
            loopHeader.addInt(loop.ticksPerBeat, 2);
            loopHeader.addInt(loop.timeSignature.denominator);
            loopHeader.addInt(loop.timeSignature.numerator);
            loopHeader.addInt(loop.tickPosition, 4);
            loopHeader.addInt(loop.tickSize, 4);
            loopHeader.addInt(loop.tickOffset, 4);
            loopHeader.addInt(loop.loopedTickSize, 4);
            loopChunk.addChunk(loopHeader);

            if(loop.events) for(var i = 0; i < loop.events.length; i++) {
                var event = loop.events[i];
                var eventChunk = new Chunk("evnt");
                if(event.type == "channel") {
                    eventChunk.addInt(1);
                    eventChunk.addInt(event.channel);
                    eventChunk.addInt(event.note);
                    eventChunk.addInt(event.tick, 4);
                    if(event.subtype == "noteOn") eventChunk.addInt(1);
                    else if(event.subtype == "noteOff") eventChunk.addInt(2);
                    else eventChunk.addInt(0);
                }
                loopChunk.addChunk(eventChunk);
            }

            trackChunk.addChunk(loopChunk);
        }

        riff.addChunk(trackChunk);
    }

    //Unset the unique port IDs now that we don't need them anymore
    for(var t = 0; t < this.tracks.length; t++) {
        var effects = this.tracks[t].chain.effects;
        for(var i = 0; i < effects.length; i++) {
            var effect = effects[i];
            var ports = effect.inputs.concat(effect.outputs);
            for(var p = 0; p < ports.length; p++) {
                delete ports[p].portId;
            }
        }
    }

    return riff.getBytes();
};

//Opens data from a save file
Biscuit.Multitrack.prototype.openSaveData = function(fileData) {
    //Chunk reading framework
    var Chunk = function(name, size, buffer) {
        this.buffer = buffer;
        this.data = new Uint8Array(buffer);
        this.index = 0;
        this.name = name;
        this.size = size;
    };
    Chunk.prototype.readInt = function(size) {
        var result = 0, i = 0;
        while(i < size) {
            result += this.data[this.index + i] << i++ * 8;
        }
        this.index += size;
        return result;
    };
    Chunk.prototype.readString = function(size) {
        var end = this.index + size, result = "";
        while(this.index < end) {
            var charCode = this.data[this.index++];
            result += String.fromCharCode(charCode);
        }
        return result;
    };
    Chunk.prototype.readUstring = function(size) {
        var end = this.index + size - size % 2, result = "";
        while(this.index < end) {
            var code = this.data[this.index++] + (this.data[this.index++] << 8);
            result += String.fromCharCode(code);
        }
        return result;
    };
    Chunk.prototype.readVariableString = function(size) {
        return this.readString(this.readInt(size || 1));
    };
    Chunk.prototype.readVariableUstring = function(size) {
        return this.readUstring(this.readInt(size || 1));
    };
    Chunk.prototype.readChunk = function() {
        var name = this.readString(4);
        var size = this.readInt(4);
        var buffer = this.buffer.slice(this.index, this.index + size);
        this.index += size;
        return new Chunk(name, size, buffer);
    };
    function error(message) {
        alert("Error loading project: " + message);
    }

    //Read the save file
    var fileChunk = new Chunk("file", fileData.byteLength, fileData);
    var riffChunk = fileChunk.readChunk();
    if(riffChunk.name != "RIFF") {
        error("Invalid Biscuit project file!");
        return;
    }
    var data = { tracks: [] }, allPorts = {};
    while(riffChunk.index < riffChunk.size) {
        var chunk = riffChunk.readChunk();
        //Project header
        if(chunk.name == "bphd") {
            var magic = chunk.readString(14);
            if(magic != "BiscuitProject") {
                error("Invalid Biscuit project file!");
                return;
            }
            var saveFileVersion = chunk.readInt(1);
            if(saveFileVersion <
                    Biscuit.Multitrack.minimumCompatibleVersion) {
                if(saveFileVersion == 2) this.openSaveDataV2(fileData);
                else error("Save file version is too old! (minimum = " +
                    Biscuit.Multitrack.minimumCompatibleVersion +
                    ", found = " + saveFileVersion + ")");
                return;
            }
            else if(saveFileVersion > Biscuit.Multitrack.saveVersion) {
                console.log("Load Warning: Save file version beyond Biscuit " +
                    "version!");
            }
            var minimumVersion = chunk.readInt(1);
            if(Biscuit.Multitrack.minimumCompatibleVersion < minimumVersion) {
                error("Save file version is too new! (minimum needed = " +
                    minimumVersion + ", current = " +
                    Biscuit.Multitrack.minimumCompatibleVersion + ")");
                return;
            }
            data.playMarkerOffset = chunk.readInt(4);
        }
        //Track chunk
        else if(chunk.name == "trak") {
            var track = { effects: [], loops: [] };
            while(chunk.index < chunk.size) {
                var subchunk = chunk.readChunk();
                //Track header
                if(subchunk.name == "tkhd") {
                    var trackOptions = subchunk.readInt(1);
                    track.muted = !!(trackOptions & 1);
                    track.name = subchunk.readVariableUstring();
                    track.preset = subchunk.readVariableUstring();
                    track.volume = subchunk.readInt(1) / 100;
                }
                //Track effect
                else if(subchunk.name == "efct") {
                    var effect = {
                        parameters: {},
                        inputs: [],
                        outputs: []
                    };
                    while(subchunk.index < subchunk.size) {
                        var effectSubchunk = subchunk.readChunk();
                        //Effect header
                        if(effectSubchunk.name == "efhd") {
                            var effectOptions = effectSubchunk.readInt(1);
                            effect.uuid = effectSubchunk.readString(36);
                            effect.x = effectSubchunk.readInt(4) / 100;
                            effect.y = effectSubchunk.readInt(4) / 100;
                        }
                        //Effect parameter
                        else if(effectSubchunk.name == "efpr") {
                            var name = effectSubchunk.readVariableUstring();
                            var type = effectSubchunk.readInt(1);
                            var value = null;
                            if(type == 1) {
                                value = effectSubchunk.readInt(4) / 100;
                            }
                            else if(type == 2) {
                                value = effectSubchunk.readInt(4);
                            }
                            else if(type == 3) {
                                var valueLength = effectSubchunk.readInt(2);
                                value = !valueLength ? null : {
                                    size: effectSubchunk.readInt(4),
                                    name: effectSubchunk.readUstring(
                                        valueLength - 4)
                                };
                            }
                            else if(type == 4) {
                                var valueLength = effectSubchunk.readInt(2);
                                value = effectSubchunk.readUstring(valueLength);
                            }
                            effect.parameters[name] = value;
                        }
                        //Effect port
                        else if(effectSubchunk.name == "efpt") {
                            var port = {};
                            var portOptions = effectSubchunk.readInt(1);
                            var isInput = !(portOptions & 1);
                            port.id = effectSubchunk.readInt(2);
                            port.connectedId = effectSubchunk.readInt(2);
                            port.type = {
                                0: "audio",
                                1: "midi",
                                2: "note"
                            }[effectSubchunk.readInt(1)];
                            if(isInput) effect.inputs.push(port);
                            else effect.outputs.push(port);
                            allPorts[port.id] = port;
                        }
                        else console.log("Warning: Unknown effect chunk: " +
                            effectSubchunk.name);
                    }
                    track.effects.push(effect);
                }
                //Track loop
                else if(subchunk.name == "loop") {
                    var loop = {
                        multitrack: this,
                        timeSignature: {},
                        events: []
                    };
                    while(subchunk.index < subchunk.size) {
                        var loopSubchunk = subchunk.readChunk();
                        //Loop header
                        if(loopSubchunk.name == "lphd") {
                            var loopOptions = loopSubchunk.readInt(1);
                            loop.type = loopOptions & 1 ? "wave" : "midi";
                            loop.loopable = !!(loopOptions & 2);
                            loop.sizeLocked = !!(loopOptions & 4);
                            loop.name = loopSubchunk.readVariableUstring();
                            loop.ticksPerBeat = loopSubchunk.readInt(2);
                            loop.timeSignature.denominator =
                                loopSubchunk.readInt(1);
                            loop.timeSignature.numerator =
                                loopSubchunk.readInt(1);
                            loop.tickPosition = loopSubchunk.readInt(4);
                            loop.tickSize = loopSubchunk.readInt(4);
                            loop.tickOffset = loopSubchunk.readInt(4);
                            loop.loopedTickSize = loopSubchunk.readInt(4);
                        }
                        //Loop event
                        else if(loopSubchunk.name == "evnt") {
                            var event = {};
                            event.type = {
                                1: "channel"
                            }[loopSubchunk.readInt(1)] || "unknown";
                            if(event.type == "channel") {
                                event.channel = loopSubchunk.readInt(1);
                                event.note = loopSubchunk.readInt(1);
                                event.tick = loopSubchunk.readInt(4);
                                event.subtype = {
                                    1: "noteOn",
                                    2: "noteOff"
                                }[loopSubchunk.readInt(1)] || "unknown";
                            }
                            loop.events.push(event);
                        }
                    }
                    track.loops.push(new Biscuit.Loop(loop));
                }
                else console.log("Load Warning: Unknown subchunk: " +
                    subchunk.name);
            }
            data.tracks.push(track);
        }
    }

    //Clear the current state first
    this.reset();

    //Load the new state
    function loadFileParameter(effect, parameterName, value) {
        Resources.find(value, function(resource) {
            if(resource) effect.setParameter(parameterName, {
                name: resource.headers.name,
                size: resource.headers.size,
                buffer: resource.data
            });
        });
    }
    for(var t = 0; t < data.tracks.length; t++) {
        var track = data.tracks[t];
        //Get the track options
        var options = {
            muted: track.muted,
            name: track.name,
            volume: track.volume,
            presetName: track.preset
        };
        this.newTrack(options);
        //Set the preset
        var newTrack = this.tracks[this.tracks.length - 1];
        if(track.preset.length) {
            newTrack.presetMenu.settings.button.textContent = track.preset;
        }
        //Add the effects
        newTrack.chain.clear();
        var ports = {};
        for(var i = 0; i < track.effects.length; i++) {
            var effect = track.effects[i];
            var effectClass = Biscuit.effects[effect.uuid];
            if(!effectClass) {
                console.log("Load Warning: Effect not found: " + effect.uuid);
                continue;
            }
            var effectInstance = new effectClass();
            effectInstance.x = effect.x;
            effectInstance.y = effect.y;
            newTrack.chain.add(effectInstance);
            //Set the parameters
            for(var name in effectInstance.parameters) {
                var parameter = effectInstance.parameters[name];
                var value = effect.parameters[name];
                if(parameter.type == "file") {
                    loadFileParameter(effectInstance, name, value);
                }
                else effectInstance.setParameter(name, value);
            }
            //Save the ports and their IDs so that we can connect them all
            //after adding every effect
            for(var p = 0; p < effect.inputs.length; p++) {
                var port = effect.inputs[p];
                if(port.connectedId) ports[port.id] = {
                    input: true,
                    connectedId: port.connectedId,
                    realPort: effectInstance.inputs[p]
                };
            }
            for(var p = 0; p < effect.outputs.length; p++) {
                var port = effect.outputs[p];
                if(port.connectedId) ports[port.id] = {
                    input: false,
                    connectedId: port.connectedId,
                    realPort: effectInstance.outputs[p]
                };
            }
        }
        //Connect the effect ports
        for(var id in ports) {
            var portA = ports[id];
            var portB = ports[portA.connectedId];
            var inputPort = portA.input ? portA.realPort : portB.realPort;
            var outputPort = portA.input ? portB.realPort : portA.realPort;
            newTrack.chain.connectPorts(inputPort, outputPort);
            delete ports[id];
            delete ports[portA.connectedId];
        }
        //Add the loops
        var loops = track.loops;
        for(var l = 0; l < loops.length; l++) {
            var loop = loops[l];
            if(loop.type == "wave") {
                //TODO: Get the samples for the wave loop...
                var samples = null;
                if(!samples) continue;
            }
            this.addLoopToTrack(loops[l], newTrack);
        }
    }
    this.playOffset = data.playMarkerOffset;
    //Update the DOM
    this.updatePlayMarker();
};

//Opens old version 2 save files
Biscuit.Multitrack.prototype.openSaveDataV2 = function(fileData) {
    //Chunk reading framework
    var Chunk = function(name, size, buffer) {
        this.buffer = buffer;
        this.data = new Uint8Array(buffer);
        this.index = 0;
        this.name = name;
        this.size = size;
    };
    Chunk.prototype.readInt = function(size) {
        var result = 0, i = 0;
        while(i < size) {
            result += this.data[this.index + i] << i++ * 8;
        }
        this.index += size;
        return result;
    };
    Chunk.prototype.readString = function(size) {
        var end = this.index + size, result = "";
        while(this.index < end) {
            var charCode = this.data[this.index++];
            result += String.fromCharCode(charCode);
        }
        return result;
    };
    Chunk.prototype.readVariableString = function(size) {
        return this.readString(this.readInt(size || 1));
    };
    Chunk.prototype.readChunk = function() {
        var name = this.readString(4);
        var size = this.readInt(4);
        var buffer = this.buffer.slice(this.index, this.index + size);
        this.index += size;
        return new Chunk(name, size, buffer);
    };
    function error(message) {
        alert("Error loading project: " + message);
    }

    //Read the save file
    var fileChunk = new Chunk("file", fileData.byteLength, fileData);
    var riffChunk = fileChunk.readChunk();
    if(riffChunk.name != "RIFF") {
        error("Invalid Biscuit project file!");
        return;
    }
    var data = { tracks: [] }, allPorts = {};
    while(riffChunk.index < riffChunk.size) {
        var chunk = riffChunk.readChunk();
        //Project header
        if(chunk.name == "bphd") {
            var magic = chunk.readString(14);
            if(magic != "BiscuitProject") {
                error("Invalid Biscuit project file!");
                return;
            }
            var saveFileVersion = chunk.readInt(1);
            if(saveFileVersion > Biscuit.Multitrack.saveVersion) {
                console.log("Load Warning: Save file version beyond Biscuit " +
                    "version!");
            }
            data.playMarkerOffset = chunk.readInt(4);
        }
        //Track chunk
        else if(chunk.name == "trak") {
            var track = { effects: [], loops: [] };
            while(chunk.index < chunk.size) {
                var subchunk = chunk.readChunk();
                //Track header
                if(subchunk.name == "tkhd") {
                    var trackOptions = subchunk.readInt(1);
                    track.muted = !!(trackOptions & 1);
                    track.name = subchunk.readVariableString();
                    track.preset = subchunk.readVariableString();
                    track.volume = subchunk.readInt(1) / 100;
                }
                //Track effect
                else if(subchunk.name == "efct") {
                    var effect = {
                        parameters: {},
                        inputs: [],
                        outputs: []
                    };
                    while(subchunk.index < subchunk.size) {
                        var effectSubchunk = subchunk.readChunk();
                        //Effect header
                        if(effectSubchunk.name == "efhd") {
                            var effectOptions = effectSubchunk.readInt(1);
                            effect.uuid = effectSubchunk.readString(36);
                            effect.x = effectSubchunk.readInt(4) / 100;
                            effect.y = effectSubchunk.readInt(4) / 100;
                        }
                        //Effect parameter
                        else if(effectSubchunk.name == "efpr") {
                            var name = effectSubchunk.readVariableString();
                            var type = effectSubchunk.readInt(1);
                            var valueLength = effectSubchunk.readInt(2);
                            var value = null;
                            if(type == 1) {
                                value = effectSubchunk.readInt(4) / 100;
                            }
                            else if(type == 2) {
                                value = effectSubchunk.readInt(4);
                            }
                            else if(type == 3) {
                                value = !valueLength ? null : {
                                    size: effectSubchunk.readInt(4),
                                    name: effectSubchunk.readString(
                                        valueLength - 4)
                                };
                            }
                            else if(type == 4) {
                                value = effectSubchunk.readString(valueLength);
                            }
                            effect.parameters[name] = value;
                        }
                        //Effect port
                        else if(effectSubchunk.name == "efpt") {
                            var port = {};
                            var portOptions = effectSubchunk.readInt(1);
                            var isInput = !(portOptions & 1);
                            port.id = effectSubchunk.readInt(2);
                            port.connectedId = effectSubchunk.readInt(2);
                            port.type = {
                                0: "audio",
                                1: "midi",
                                2: "note"
                            }[effectSubchunk.readInt(1)];
                            if(isInput) effect.inputs.push(port);
                            else effect.outputs.push(port);
                            allPorts[port.id] = port;
                        }
                        else console.log("Load Warning: Unknown effect chunk: " +
                            effectSubchunk.name);
                    }
                    track.effects.push(effect);
                }
                //Track loop
                else if(subchunk.name == "loop") {
                    var loop = {
                        multitrack: this,
                        timeSignature: {},
                        events: []
                    };
                    while(subchunk.index < subchunk.size) {
                        var loopSubchunk = subchunk.readChunk();
                        //Loop header
                        if(loopSubchunk.name == "lphd") {
                            var loopOptions = loopSubchunk.readInt(1);
                            loop.type = loopOptions & 1 ? "wave" : "midi";
                            loop.loopable = !!(loopOptions & 2);
                            loop.sizeLocked = !!(loopOptions & 4);
                            loop.name = loopSubchunk.readVariableString();
                            loop.ticksPerBeat = loopSubchunk.readInt(2);
                            loop.timeSignature.denominator =
                                loopSubchunk.readInt(1);
                            loop.timeSignature.numerator =
                                loopSubchunk.readInt(1);
                            loop.tickPosition = loopSubchunk.readInt(4);
                            loop.tickSize = loopSubchunk.readInt(4);
                            loop.tickOffset = loopSubchunk.readInt(4);
                            loop.loopedTickSize = loopSubchunk.readInt(4);
                        }
                        //Loop event
                        else if(loopSubchunk.name == "evnt") {
                            var event = {};
                            event.type = {
                                1: "channel"
                            }[loopSubchunk.readInt(1)] || "unknown";
                            if(event.type == "channel") {
                                event.channel = loopSubchunk.readInt(1);
                                event.note = loopSubchunk.readInt(1);
                                event.tick = loopSubchunk.readInt(4);
                                event.subtype = {
                                    1: "noteOn",
                                    2: "noteOff"
                                }[loopSubchunk.readInt(1)] || "unknown";
                            }
                            loop.events.push(event);
                        }
                    }
                    track.loops.push(new Biscuit.Loop(loop));
                }
                else console.log("Load Warning: Unknown subchunk: " +
                    subchunk.name);
            }
            data.tracks.push(track);
        }
    }

    //Clear the current state first
    this.reset();

    //Load the new state
    function loadFileParameter(effect, parameterName, value) {
        Resources.find(value, function(resource) {
            if(resource) effect.setParameter(parameterName, {
                name: resource.headers.name,
                size: resource.headers.size,
                buffer: resource.data
            });
        });
    }
    for(var t = 0; t < data.tracks.length; t++) {
        var track = data.tracks[t];
        //Get the track options
        var options = {
            muted: track.muted,
            name: track.name,
            volume: track.volume,
            presetName: track.preset
        };
        this.newTrack(options);
        //Set the preset
        var newTrack = this.tracks[this.tracks.length - 1];
        if(track.preset.length) {
            newTrack.presetMenu.settings.button.textContent = track.preset;
        }
        //Add the effects
        newTrack.chain.clear();
        var ports = {};
        for(var i = 0; i < track.effects.length; i++) {
            var effect = track.effects[i];
            var effectClass = Biscuit.effects[effect.uuid];
            if(!effectClass) {
                console.log("Load Warning: Effect not found: " + effect.uuid);
                continue;
            }
            var effectInstance = new effectClass();
            effectInstance.x = effect.x;
            effectInstance.y = effect.y;
            newTrack.chain.add(effectInstance);
            //Set the parameters
            for(var name in effectInstance.parameters) {
                var parameter = effectInstance.parameters[name];
                var value = effect.parameters[name];
                if(parameter.type == "file") {
                    loadFileParameter(effectInstance, name, value);
                }
                else effectInstance.setParameter(name, value);
            }
            //Save the ports and their IDs so that we can connect them all
            //after adding every effect
            for(var p = 0; p < effect.inputs.length; p++) {
                var port = effect.inputs[p];
                if(port.connectedId) ports[port.id] = {
                    input: true,
                    connectedId: port.connectedId,
                    realPort: effectInstance.inputs[p]
                };
            }
            for(var p = 0; p < effect.outputs.length; p++) {
                var port = effect.outputs[p];
                if(port.connectedId) ports[port.id] = {
                    input: false,
                    connectedId: port.connectedId,
                    realPort: effectInstance.outputs[p]
                };
            }
        }
        //Connect the effect ports
        for(var id in ports) {
            var portA = ports[id];
            var portB = ports[portA.connectedId];
            var inputPort = portA.input ? portA.realPort : portB.realPort;
            var outputPort = portA.input ? portB.realPort : portA.realPort;
            newTrack.chain.connectPorts(inputPort, outputPort);
            delete ports[id];
            delete ports[portA.connectedId];
        }
        //Add the loops
        var loops = track.loops;
        for(var l = 0; l < loops.length; l++) {
            var loop = loops[l];
            if(loop.type == "wave") {
                //TODO: Get the samples for the wave loop...
                var samples = null;
                if(!samples) continue;
            }
            this.addLoopToTrack(loops[l], newTrack);
        }
    }
    this.playOffset = data.playMarkerOffset;
    //Update the DOM
    this.updatePlayMarker();
};
