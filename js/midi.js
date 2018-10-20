//MIDI - Loads and plays MIDI files
var MIDI = {};

//Loads and parses a MIDI file and returns it as an object
// http://www.somascape.org/midi/tech/mfile.html
// https://github.com/gasman/jasmid
MIDI.load = function(file) {
    //File reading helper functions
    var contents = new Uint8Array(file.buffer);
    var index = 0;
    function read(length) {
        index += length;
        return contents.subarray(index - length, index);
    }
    function readText(length) {
        var result = "";
        for(var end = index + length; index < end; index++) {
            result += String.fromCharCode(contents[index]);
        }
        return result;
    }
    function readVarInt() {
        var result = 0;
        do {
            var byte = contents[index++];
            result = (result << 7) + (byte & 0x7f);
        }
        while(byte & 0x80);
        return result;
    }
    function readInt32() {
        return (contents[index++] << 24) +
            (contents[index++] << 16) +
            (contents[index++] << 8) +
            contents[index++];
    }
    function readInt24() {
        return (contents[index++] << 16) +
            (contents[index++] << 8) +
            contents[index++];
    }
    function readInt16() {
        return (contents[index++] << 8) +
            contents[index++];
    }
    function readInt8() {
        return contents[index++];
    }
    //Get header information
    var header = readText(4);
    if(header != "MThd") {
        errorHandler("Invalid MIDI file (wrong header)!")
        return;
    }
    var headerLength = readInt32();
    var formatType = readInt16();
    var trackCount = readInt16();
    var ticksPerBeat = readInt16();
    if(ticksPerBeat & 0x8000) {
        errorHandler("SMTPE time division format not yet supported!")
        return;
    }
    //Get tracks
    index = 8 + headerLength;
    var tracks = [];
    for(var i = 0; i < trackCount; i++) {
        var track = [];
        tracks[i] = track;
        var trackHeader = readText(4);
        if(trackHeader != "MTrk") {
            errorHandler("Unexpected block header (expected MTrk)!")
            continue;
        }
        var trackLength = readInt32();
        var trackEnd = index + trackLength;
        var unfinishedSysEx = false, lastEventType = 0;
        //Read each event in the track
        while(index < trackEnd) {
            var event = {};
            event.deltaTime = readVarInt();
            var eventType = readInt8();
            //Meta event
            if(eventType == 0xff) {
                event.type = "meta";
                var eventSubtype = readInt8();
                var length = readVarInt();
                switch(eventSubtype) {
                    case 0x00:
                        event.subtype = "sequenceNumber";
                        if(length != 2) {
                            console.log("Sequence Number is " + length + " instead of 2!");
                            event.invalid = true;
                            break;
                        }
                        event.number = readInt16();
                        break;
                    case 0x01:
                        event.subtype = "text";
                        event.text = readText(length);
                        break;
                    case 0x02:
                        event.subtype = "copyright";
                        event.text = readText(length);
                        break;
                    case 0x03:
                        event.subtype = "trackName";
                        event.text = readText(length);
                        break;
                    case 0x04:
                        event.subtype = "instrumentName";
                        event.text = readText(length);
                        break;
                    case 0x05:
                        event.subtype = "lyrics";
                        event.text = readText(length);
                        break;
                    case 0x06:
                        event.subtype = "marker";
                        event.text = readText(length);
                        break;
                    case 0x07:
                        event.subtype = "cuePoint";
                        event.text = readText(length);
                        break;
                    case 0x08:
                        event.subtype = "programName";
                        event.text = readText(length);
                        break;
                    case 0x09:
                        event.subtype = "deviceName";
                        event.text = readText(length);
                        break;
                    case 0x20:
                        event.subtype = "midiChannelPrefix";
                        if(length != 1) {
                            console.log("Midi Channel Prefix length is " + length + " instead of 1!");
                            event.invalid = true;
                            break;
                        }
                        event.channel = readInt8();
                        break;
                    case 0x21:
                        event.subtype = "midiPort";
                        if(length != 1) {
                            console.log("Midi Port Prefix length is " + length + " instead of 1!");
                            event.invalid = true;
                            break;
                        }
                        event.port = readInt8();
                        break;
                    case 0x2f:
                        event.subtype = "endOfTrack";
                        if(length != 0) {
                            console.log("End of Track length is " + length + " instead of 0!");
                            event.invalid = true;
                            break;
                        }
                        break;
                    case 0x51:
                        event.subtype = "setTempo";
                        if(length != 3) {
                            console.log("Set Tempo length is " + length + " instead of 1!");
                            event.invalid = true;
                            break;
                        }
                        event.microsecondsPerBeat = readInt24();
                        break;
                    case 0x54:
                        event.subtype = "smpteOffset";
                        if(length != 5) {
                            console.log("SMPTE Offset length is " + length + " instead of 5!");
                            event.invalid = true;
                            break;
                        }
                        var hourByte = readInt8();
                        event.frameRate = {
                            0x00: 24,
                            0x20: 25,
                            0x40: 29,
                            0x60: 30
                        }[hourByte & 0x60];
                        event.hour = hourByte & 0x1f;
                        event.min = readInt8();
                        event.sec = readInt8();
                        event.frame = readInt8();
                        event.subframe = readInt8();
                        break;
                    case 0x58:
                        event.subtype = "timeSignature";
                        if(length != 4) {
                            console.log("Time Signature length is " + length + " instead of 4!");
                            event.invalid = true;
                            break;
                        }
                        event.numerator = readInt8();
                        event.denominator = Math.pow(2, readInt8());
                        event.metronome = readInt8();
                        event.thirtyseconds = readInt8();
                        break;
                    case 0x59:
                        event.subtype = "keySignature";
                        if(length != 2) {
                            console.log("Key Signature length is " + length + " instead of 2!");
                            event.invalid = true;
                            break;
                        }
                        event.key = readInt8();
                        event.scale = readInt8();
                        break;
                    case 0x7f:
                        event.subtype = "sequencerSpecific";
                        event.data = read(length);
                        break;
                    default:
                        console.log("Unrecognised meta event subtype (" + eventSubtype + ")!");
                        event.subtype = "unknown";
                        event.invalid = true;
                        event.data = read(length);
                }
            }
            //System event
            else if(eventType == 0xf0) {
				event.type = "sysEx";
				var length = readVarInt();
				event.data = read(length);
                if(event.data[length - 1] != 0xf7) {
                    unfinishedSysEx = true;
                }
            }
            //Continued system event / Escape sequence
            else if(eventType == 0xf7) {
                if(unfinishedSysEx) {
                    event.type = "continuedSysEx";
                    var length = readVarInt();
                    event.data = read(length);
                    if(event.data[length - 1] == 0xf7) {
                        unfinishedSysEx = false;
                    }
                }
                else {
                    event.type = "escapeSequence";
                    var length = readVarInt();
                    event.data = read(length);
                }
            }
            //Channel MIDI event
            else if(eventType < 0xf0) {
                var parameter;
                //Check for running status
                if(eventType < 0x80) {
                    parameter = eventType;
                    eventType = lastEventType;
                }
                else {
                    parameter = readInt8();
                    lastEventType = eventType;
                }
                event.channel = eventType & 0x0f;
                event.type = "channel";
                switch(eventType >> 4) {
                    case 0x08:
                        event.subtype = "noteOff";
                        event.note = parameter;
                        event.velocity = readInt8();
                        break;
                    case 0x09:
                        event.note = parameter;
                        event.velocity = readInt8();
                        event.subtype = event.velocity ? "noteOn" : "noteOff";
                        break;
                    case 0x0a:
                        event.subtype = "noteAftertouch";
                        event.note = parameter;
                        event.pressure = readInt8();
                        break;
                    case 0x0b:
                        event.subtype = "controller";
                        event.controllerType = parameter;
                        event.value = readInt8();
                        break;
                    case 0x0c:
                        event.subtype = "programChange";
                        event.programNumber = parameter;
                        break;
                    case 0x0d:
                        event.subtype = "channelAftertouch";
                        event.pressure = parameter;
                        break;
                    case 0x0e:
                        event.subtype = "pitchBend";
                        event.value = parameter + (readInt8() << 7);
                        break;
                    default:
                        console.log("Unrecognised channel MIDI event subtype (" + eventSubtype + ")! " +
                            "Assuming length of 2 (MIDI file parsing could break).");
                        event.subtype = "unknown";
                        event.invalid = true;
                        event.parameter = parameter;
                }
            }
            else {
                console.log("Unknown event type (" + eventType + ")! " +
                    "Assuming length of 2 (MIDI file parsing could break).");
                event.invalid = true;
            }
            track.push(event);
        }
        index = trackEnd;
    }
    var midiFile = {
        header: {
            formatType: formatType,
            ticksPerBeat: ticksPerBeat,
            trackCount: trackCount
        },
        tracks: tracks
    };
    //Parse the file now so that it's ready for playing
    MIDI.parse(midiFile);
    return midiFile;
};

//Parses a MIDI file into an easily playable format
MIDI.parse = function(midiFile) {
    var midiEvents = midiFile.midiEvents = [];
    var nextEvents = [];
    var tracks = midiFile.tracks;
    //Finds the next MIDI channel event
    function findNextEvent(trackNumber) {
        var last = nextEvents[trackNumber] || { index: -1 };
        var lastIndex = last.index;
        var tick = last.tick || 0;
        var track = tracks[trackNumber];
        for(var i = lastIndex + 1; i < track.length; i++) {
            var event = track[i];
            tick += event.deltaTime;
            if(event.type == "channel" || event.subtype == "setTempo") {
                nextEvents[trackNumber] = {
                    track: trackNumber,
                    index: i,
                    tick: tick,
                    event: event
                };
                return;
            }
        }
        nextEvents[trackNumber] = null;
    }
    //Initialise next event for each track
    var nextEvent = { tick: Infinity };
	for(var i = 0; i < tracks.length; i++) {
        findNextEvent(i);
        if(nextEvents[i] && nextEvents[i].tick < nextEvent.tick) {
            nextEvent = nextEvents[i];
        }
	}
    //Loop through each event
    while(nextEvent.event) {
        //Push the event
        var event = nextEvent.event;
        event.tick = nextEvent.tick;
        midiEvents.push(event);
        findNextEvent(nextEvent.track);
        //Get soonest event
        var nextEvent = { tick: Infinity };
        for(var i = 0; i < nextEvents.length; i++) {
            var trackNextEvent = nextEvents[i];
            if(trackNextEvent && trackNextEvent.tick < nextEvent.tick) {
                nextEvent = trackNextEvent;
            }
        }
    }
};

//Plays a MIDI file
MIDI.play = function(midiFile) {
    if(!midiFile.midiEvents) MIDI.parse(midiFile);
    var midiEvents = midiFile.midiEvents;
    //Create MIDI channels
    var channelCount = 16;
    var midiChannels = [];
    for(var i = 0; i < channelCount; i++) {
        midiChannels.push(new Biscuit.Channel());
    }
    //Start playing the file
    var ticksPerBeat = midiFile.header.ticksPerBeat;
    var beatsPerMinute = 120;
	var waitAfterLastNote = 5;
    var ticksPerSecond = ticksPerBeat * beatsPerMinute / 60;
    var ticksGenerated = 0;
    var totalGeneratedSamples = 0;
	var finish = null;
    var i = -1;
    function generate(audio) {
        var audioChannels =  audio.createBlankAudioChannels(audio.bufferSize, audio.channelCount);
        var generatedSamples = 0;
		//Stop generating audio once we're done
		if(i >= midiEvents.length && !finish) {
			finish = Biscuit.context.currentTime + waitAfterLastNote;
		}
		//Stop now that all notes should be over
		if(finish && Biscuit.context.currentTime > finish) {
			audio.stop();
		}
        while(++i < midiEvents.length) {
            var event = midiEvents[i];
            //Generate audio up until this event
            var ticksUntil = event.tick - ticksGenerated;
            if(ticksUntil) {
                var samplesPerTick = audio.sampleRate / ticksPerSecond;
                var sampleCount = Math.floor(ticksUntil * samplesPerTick);
                if(generatedSamples + sampleCount > audio.bufferSize) sampleCount = audio.bufferSize - generatedSamples;
                for(var c = 0; c < channelCount; c++) {
                    var data = midiChannels[c].generate(audio, sampleCount, totalGeneratedSamples + generatedSamples);
                    if(!data) continue;
                    for(var a = 0; a < data.length; a++) {
                        var audioChannel = audioChannels[a];
                        var samples = data[a];
                        for(var b = 0; b < sampleCount; b++) {
                            audioChannel[b + generatedSamples] += samples[b];
                        }
                    }
                }
                generatedSamples += sampleCount;
                if(generatedSamples >= audio.bufferSize) {
                    totalGeneratedSamples += generatedSamples;
                    ticksGenerated += Math.round(sampleCount / samplesPerTick);
                    i--;
                    break;
                }
                else ticksGenerated = event.tick;
            }
            //Apply the event
            switch(event.subtype) {
                case "noteOn":
                    midiChannels[event.channel].noteOn(event.note, event.velocity);
                    break;
                case "noteOff":
                    midiChannels[event.channel].noteOff(event.note, event.velocity);
                    break;
                case "programChange":
                    midiChannels[event.channel].programChange(event.programNumber);
                    break;
                case "setTempo":
                    beatsPerMinute = 60000000 / event.microsecondsPerBeat;
                    ticksPerSecond = ticksPerBeat * beatsPerMinute / 60;
                    break;
            }
        }
        return audioChannels;
    }
    new Biscuit.Audio(generate);
};

//Stops playing a MIDI file (not working currently)
MIDI.stop = function() {
    if(MIDI.audio) MIDI.audio.stop();
};