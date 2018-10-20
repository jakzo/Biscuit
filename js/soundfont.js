//Thanks to:
//http://freepats.zenvoid.org/sf2/sfspec24.pdf
//https://github.com/robsheely/AS3-SoundFont-Parser
var SoundFont = function(file) {
    this.file = {
        name: file.name,
        size: file.size
    };
    this.info = {};
    this.instruments = [];
    this.presets = [];
    //Check for correct SoundFont format
    var data = new Uint8Array(file.buffer);
    var format = SoundFont.readString(data, 0, 4);
    if(format != "RIFF") return SoundFont.error(
        "Expected chunk format 'RIFF' but got '" + format + "' instead!"
    );
    //Check for correct SoundFont bank type
    var type = SoundFont.readString(data, 8, 4);
    if(type != "sfbk") return SoundFont.error(
        "Expected chunk type 'sfbk' but got '" + type + "' instead!"
    );
    //Create the sound bank chunk
    var foundSubchunks = {};
    var size = SoundFont.readInt(data, 4, 32);
    var buffer = file.buffer.slice(8);
    var bankChunk = new SoundFont.Chunk(format, size, buffer);
    if(!bankChunk) return null;
    
    var presetRecords = [],
        presetBagRecords = [],
        presetGeneratorRecords = [],
        presetModulatorRecords = [],
        instrumentRecords = [],
        instrumentBagRecords = [],
        instrumentGeneratorRecords = [],
        instrumentModulatorRecords = [],
        samples = [],
        sampleData = null;
    
    //Read each chunk within the SoundFont bank
    while(bankChunk.cursor < bankChunk.size) {
        var chunk = bankChunk.readChunk();
        if(!chunk) return null;
        
        //Info Chunk
        if(chunk.type == "INFO") {
            //Define the info tags
            var infoTags = {
                "ifil": { name: "soundFontVersion", type: "version" },
                "isng": { name: "targetEngine", type: "string" },
                "INAM": { name: "bankName", type: "string" },
                "irom": { name: "romName", type: "string" },
                "iver": { name: "romVersion", type: "version" },
                "ICRD": { name: "creationDate", type: "string" },
                "IENG": { name: "engineers", type: "string" },
                "IPRD": { name: "product", type: "string" },
                "ICOP": { name: "copyright", type: "string" },
                "ICMT": { name: "comments", type: "string" },
                "ISFT": { name: "tools", type: "string" },
            };
            //Read each info tag
            while(chunk.cursor < chunk.size) {
                var tagName = chunk.readString(4);
                var tagSize = chunk.readInt(32);
                var tag = infoTags[tagName];
                if(!tag) SoundFont.error("Unknown INFO tag '" +
                    tagName + "'!");
                else if(tag.type == "version") {
                    //Version info must be 4 bytes long
                    if(tagSize != 4) {
                        SoundFont.error("Expected " + tagName +
                            " to be 4 bytes long but it was " + tagSize + "!");
                        if(tagName == "ifil") return null;
                    }
                    //Get the version
                    var major = chunk.readInt(16);
                    var minor = chunk.readInt(16);
                    var version = this.info[tag.name] = major + minor / 100;
                    //Latest supported version is 2.04 (current)
                    if(tag.name == "soundFontVersion") {
                        if(version > 2.04) SoundFont.error(
                            "SoundFont version is " + version +
                            " but highest supported is 2.04!"
                        );
                    }
                }
                else {
                    var text = chunk.readString(tagSize);
                    //Size must be 256 bytes or less (65536 for comments)
                    //...but we'll allow it anyway
                    var maxSize = tagName == "ICMT" ? 65536 : 256;
                    if(tagSize > maxSize) SoundFont.error("Info string '" +
                        tagName + "' size (" + tagSize + ") is over maximum " +
                        "(" + maxSize + ")!");
                    //String must be terminated by a '0' byte
                    if(text.length < tagSize) this.info[tag.name] = text;
                    else SoundFont.error("Info string '" + tagName +
                        "' is not terminated by a '0' byte!");
                }
            }
        }
        
        //Sample Data Chunk
        else if(chunk.type == "sdta") {
            var tag = chunk.readString(4);
            var tagSize = chunk.readInt(32);
            var bytes = chunk.readBytes(tagSize);
            if(tag == "smpl") sampleData = new Int16Array(bytes);
            else SoundFont.error("Unknown sample tag '" + tag + "'!");
        }
        
        //Data Chunk
        else if(chunk.type == "pdta") {
            while(chunk.cursor < chunk.size) {
                var tag = chunk.readString(4);
                var tagSize = chunk.readInt(32);
                //Keep track of found subchunks
                foundSubchunks[tag] = true;
                var subchunk = new SoundFont.Chunk(
                    tag,
                    tagSize,
                    chunk.readBytes(tagSize)
                );
                subchunk.cursor = 0;
                var records = null;
                switch(tag) {
                    //Presets
                    case "phdr":
                        //Each record is 38 bytes long
                        if(SoundFont.checkSubchunkSize(
                            tag, tagSize, 38)) return null;
                        //Get the records (except terminal record)
                        while(subchunk.cursor < tagSize - 38) {
                            presetRecords.push({
                                name: subchunk.readString(20),
                                preset: subchunk.readInt(16),
                                bank: subchunk.readInt(16),
                                index: subchunk.readInt(16),
                                library: subchunk.readInt(32),
                                genre: subchunk.readInt(32),
                                morphology: subchunk.readInt(32)
                            });
                        }
                        //Minimum of 1 record (plus terminal record)
                        if(SoundFont.checkSubchunkRecords(
                            tag, presetRecords, 1)) return null;
                        break;
                    //Preset and Instrument Bags
                    case "ibag": records = instrumentBagRecords;
                    case "pbag":
                        if(!records) records = presetBagRecords;
                        //Each record is 4 bytes long
                        if(SoundFont.checkSubchunkSize(
                            tag, tagSize, 4)) return null;
                        //Get the records (except terminal record)
                        while(subchunk.cursor < tagSize - 4) {
                            records.push({
                                generatorIndex: subchunk.readInt(16),
                                modulatorIndex: subchunk.readInt(16)
                            });
                        }
                        break;
                    //Preset and Instrument Modulators
                    case "imod": records = instrumentModulatorRecords;
                    case "pmod":
                        if(!records) records = presetModulatorRecords;
                        //Each record is 10 bytes long
                        if(SoundFont.checkSubchunkSize(
                            tag, tagSize, 10)) return null;
                        //Get the records
                        while(subchunk.cursor < tagSize) {
                            records.push({
                                sourceOperator: subchunk.readInt(16),
                                destinationOperator: subchunk.readInt(16),
                                amountOperator: subchunk.readInt(16, true),
                                amountSourceOperator: subchunk.readInt(16),
                                transformOperator: subchunk.readInt(16)
                            });
                        }
                        break;
                    //Preset and Instrument Generators
                    case "igen": records = instrumentGeneratorRecords;
                    case "pgen":
                        if(!records) records = presetGeneratorRecords;
                        //Size must be a multiple of 4 bytes
                        if(SoundFont.checkSubchunkSize(
                            tag, tagSize, 4)) return null;
                        //Get the records (except terminal record)
                        while(subchunk.cursor < tagSize - 4) {
                            var type = subchunk.readInt(16);
                            var generator = SoundFont.generatorsByIndex[type];
                            if(!generator) SoundFont.error("Unknown or " +
                                "unused generator type (" + type + ")!");
                            //Get generator amount
                            var amount;
                            if(generator.amountType == "unsigned") {
                                amount = subchunk.readInt(16);
                            }
                            else if(generator.amountType == "lowHigh") {
                                amount = {
                                    low: subchunk.readInt(8),
                                    high: subchunk.readInt(8)
                                };
                            }
                            else amount = subchunk.readInt(16, true);
                            records.push({
                                name: generator.name,
                                amount: amount
                            });
                        }
                        break;
                    //Instruments
                    case "inst":
                        //Each record is 22 bytes long
                        if(SoundFont.checkSubchunkSize(
                            tag, tagSize, 22)) return null;
                        //Get the records (except terminal record)
                        while(subchunk.cursor < tagSize - 22) {
                            instrumentRecords.push({
                                name: subchunk.readString(20),
                                index: subchunk.readInt(16)
                            });
                        }
                        //Minimum of 1 record (plus terminal record)
                        if(SoundFont.checkSubchunkRecords(
                            tag, instrumentRecords, 1)) return null;
                        break;
                    //Samples
                    case "shdr":
                        //Size must be a multiple of 46 bytes
                        if(SoundFont.checkSubchunkSize(
                            tag, tagSize, 46)) return null;
                        //Get the records (except terminal record)
                        while(subchunk.cursor < tagSize - 46) {
                            var sample = {
                                name: subchunk.readString(20),
                                start: subchunk.readInt(32),
                                end: subchunk.readInt(32),
                                loopStart: subchunk.readInt(32),
                                loopEnd: subchunk.readInt(32),
                                sampleRate: subchunk.readInt(32),
                                originalPitch: subchunk.readInt(8),
                                pitchCorrection:
                                    subchunk.readInt(8, true) / 100,
                                sampleLink: subchunk.readInt(16)
                            };
                            //Read type bits
                            var type = subchunk.readInt(16);
                            sample.mono = !!(type & 1);
                            sample.right = !!(type & 2);
                            sample.left = !!(type & 4);
                            sample.linked = !!(type & 8);
                            sample.rom = !!(type & 32768);
                            samples.push(sample);
                        }
                        break;
                    //Unknown Tag
                    default:
                        SoundFont.error("Unknown data tag '" + tag + "'!");
                }
            }
        }
    }
    
    //Make sure we have all mandatory subchunks and data
    if(!this.info.soundFontVersion) {
        SoundFont.error("Missing SoundFont version!");
        return null;
    }
    if(!this.info.targetEngine) {
        //Technically if the target sound engine is unknown "EMU8000" should be
        //assumed, but that doesn't mean anything to us anyway...
        //this.info.targetEngine = "EMU8000";
    }
    var requiredSubchunks = {
        "phdr": {},
        "pbag": {},
        "pmod": {},
        "pgen": {},
        "inst": {},
        "ibag": {},
        "imod": {},
        "igen": {},
        "shdr": {}
    };
    for(var name in requiredSubchunks) {
        var subchunk = requiredSubchunks[name];
        if(!foundSubchunks[name]) {
            SoundFont.error("Missing required subchunk '" + name + "'!");
            return null;
        }
    }
    
    //Link sample data
    for(var s = 0; s < samples.length; s++) {
        var sample = samples[s];
        //Convert the 16 bit integers to float values between -1 and 1
        var convertedData = [];
        for(var d = sample.start; d < sample.end; d++) {
            //TODO: Apply pitch correction now?
            convertedData.push(sampleData[d] / 0x8000);
        }
        sample.data = convertedData;
        //Alter sample info so we only have what we need
        sample.loopStart -= sample.start;
        sample.loopEnd -= sample.start;
        sample.loopSize = sample.loopEnd - sample.loopStart;
        delete sample.start;
        delete sample.end;
    }
    
    //Link the instrument, generator and preset records together
    var instruments;
    function processGenerators(records, bags, generators, modulators) {
        var linkedRecords = [];
        for(var r = 0; r < records.length; r++) {
            var record = records[r], nextRecord = records[r + 1];
            var zones = [];
            var lastZone = nextRecord ? nextRecord.index : bags.length;
            for(var b = record.index; b < lastZone; b++) {
                var bag = bags[b], nextBag = bags[b + 1];
                var zone = {
                    generators: {},
                    modulators: []
                };
                //Get zone generator values
                var end = nextBag ? nextBag.generatorIndex : generators.length;
                for(var g = bag.generatorIndex; g < end; g++) {
                    var generator = generators[g];
                    var name = generator.name;
                    var amount = generator.amount;
                    //Handle index generators
                    if(name == "instrument") {
                        zone.instrument = instruments[amount];
                        //Any generators after an instrument are to be ignored
                        break;
                    }
                    else if(name == "sampleID") zone.sample = samples[amount];
                    //Handle range generators
                    else if(name == "keyRange") zone.keyRange = amount;
                    else if(name == "velRange") zone.velRange = amount;
                    //Handle substitution generators
                    //Handle sample generators
                    //Handle value generators
                    else if(name == "pan") zone.generators.pan = amount / 500;
                    else zone.generators[name] = amount;
                }
                //Get zone modulators
                //TODO: Is this right?
                var start = bag.modulatorIndex;
                var end = nextBag ? nextBag.modulatorIndex : modulators.length;
                var zoneModulators = modulators.slice(start, end);
                zone.modulators = zoneModulators;
                //Add the zone to the list
                zones.push(zone);
            }
            linkedRecords.push({
                name: record.name,
                zones: zones
            });
        }
        return linkedRecords;
    }
    this.instruments = instruments = processGenerators(
        instrumentRecords,
        instrumentBagRecords,
        instrumentGeneratorRecords,
        instrumentModulatorRecords
    );
    this.presets = processGenerators(
        presetRecords,
        presetBagRecords,
        presetGeneratorRecords,
        presetModulatorRecords
    );
    
    //Free unused memory
    data = sampleData = file = null;
};
SoundFont.readInt = function(data, index, size) {
    var result = 0, byte = 0;
    while(byte * 8 < size) {
        result += data[index + byte] << byte++ * 8;
    }
    return result;
};
SoundFont.readString = function(data, index, length) {
    var end = index + length, result = "";
    while(index < end) {
        var byte = data[index++];
        if(!byte) return result;
        result += String.fromCharCode(byte);
    }
    return result;
};
SoundFont.Chunk = function(format, size, buffer) {
    this.cursor = 0;
    this.format = format;
    this.size = size;
    this.buffer = buffer;
    this.data = new Uint8Array(buffer);
    if(this.data.length < size) {
        SoundFont.error("Tried to read chunk of size " +
            size + " but only " + this.data.length + " is available!");
        return null;
    }
    this.type = this.readString(4);
};
SoundFont.Chunk.prototype.readChunk = function() {
    var format = this.readString(4);
    var size = this.readInt(32);
    var buffer = this.readBytes(size);
    return new SoundFont.Chunk(format, size, buffer);
};
SoundFont.Chunk.prototype.readInt = function(size, signed) {
    var result = SoundFont.readInt(this.data, this.cursor, size);
    this.cursor += size / 8;
    if(signed && result >= 1 << size - 1) result -= 1 << size;
    return result;
};
SoundFont.Chunk.prototype.readString = function(length) {
    var result = SoundFont.readString(this.data, this.cursor, length);
    this.cursor += length;
    return result;
};
SoundFont.Chunk.prototype.readBytes = function(length) {
    var result = this.buffer.slice(this.cursor, this.cursor + length);
    this.cursor += length;
    return result;
};
SoundFont.error = function(message) {
    console.log("SoundFont Error: " + message);
    return null;
};
SoundFont.checkSubchunkSize = function(type, size, recordSize) {
    if(size % recordSize) {
        SoundFont.error("'" + type + "' subchunk size is " + size +
            " instead of a multiple of " + recordSize + "!");
        return true;
    }
    return false;
};
SoundFont.checkSubchunkRecords = function(type, records, minimum) {
    if(records.length < minimum) {
        SoundFont.error("'" + type + "' subchunk contains only " +
            records.length + " records when the minimum is " + minimum + "!");
        return true;
    }
    return false;
};

//Define the generators
SoundFont.generators = {};
SoundFont.generatorsByIndex = [];
SoundFont.Generator = function(name, amountType) {
    this.name = name;
    this.amountType = amountType || "signed";
    SoundFont.generators[name] = this;
    SoundFont.generatorsByIndex.push(this);
};
new SoundFont.Generator("startAddrsOffset");
new SoundFont.Generator("endAddrsOffset");
new SoundFont.Generator("startloopAddrsOffset");
new SoundFont.Generator("endloopOffset");
new SoundFont.Generator("startAddrsCoarseOffset");
new SoundFont.Generator("modLfoToPitch");
new SoundFont.Generator("vibLfoToPitch");
new SoundFont.Generator("modEnvToPitch");
new SoundFont.Generator("initialFilterFc");
new SoundFont.Generator("initialFilterQ");
new SoundFont.Generator("modLfoToFilterFc");
new SoundFont.Generator("modEnvToFilterFc");
new SoundFont.Generator("endAddrsCoarseOffset");
new SoundFont.Generator("modLfoToVolume");
SoundFont.generatorsByIndex.push(null);
new SoundFont.Generator("chorusEffectsSend");
new SoundFont.Generator("reverbEffectsSend");
new SoundFont.Generator("pan");
SoundFont.generatorsByIndex.push(null);
SoundFont.generatorsByIndex.push(null);
SoundFont.generatorsByIndex.push(null);
new SoundFont.Generator("delayModLFO");
new SoundFont.Generator("freqModLFO");
new SoundFont.Generator("delayVibLFO");
new SoundFont.Generator("freqVibLFO");
new SoundFont.Generator("delayModEnv");
new SoundFont.Generator("attackModEnv");
new SoundFont.Generator("holdModEnv");
new SoundFont.Generator("decayModEnv");
new SoundFont.Generator("sustainModEnv");
new SoundFont.Generator("releaseModEnv");
new SoundFont.Generator("keynumToModEnvHold");
new SoundFont.Generator("keynumToModEnvDecay");
new SoundFont.Generator("delayVolEnv");
new SoundFont.Generator("attackVolEnv");
new SoundFont.Generator("holdVolEnv");
new SoundFont.Generator("decayVolEnv");
new SoundFont.Generator("sustainVolEnv");
new SoundFont.Generator("releaseVolEnv");
new SoundFont.Generator("keynumToVolEnvHold");
new SoundFont.Generator("keynumToVolEnvDecay");
new SoundFont.Generator("instrument", "unsigned");
SoundFont.generatorsByIndex.push(null);
new SoundFont.Generator("keyRange", "lowHigh");
new SoundFont.Generator("velRange", "lowHigh");
new SoundFont.Generator("startloopAddrsCoarseOffset");
new SoundFont.Generator("keynum");
new SoundFont.Generator("velocity");
new SoundFont.Generator("initialAttenuation");
SoundFont.generatorsByIndex.push(null);
new SoundFont.Generator("endloopAddrsCoarseOffset");
new SoundFont.Generator("coarseTune");
new SoundFont.Generator("fineTune");
new SoundFont.Generator("sampleID", "unsigned");
new SoundFont.Generator("sampleModes");
SoundFont.generatorsByIndex.push(null);
new SoundFont.Generator("scaleTuning");
new SoundFont.Generator("exclusiveClass");
new SoundFont.Generator("overridingRootKey");

//Create the Biscuit SoundFont instrument
new Biscuit.Effect(function() {
    var me = this;
    this.displayName = "SoundFont";
    this.uuid = "6abee6e0-2d10-11e4-8c21-0800200c9a66";
    var soundfont = null;
    this.parameters = {
        file: {
            displayName: "SoundFont File",
            type: "file",
            onChange: function(file) {
                if(file) soundfont = new SoundFont(file);
                else soundfont = null;
            }
        },
        preset: {
            displayName: "Preset",
            type: "number",
            min: 0,
            max: 255,
            value: 0
        }
    };
    var activeNotes = {};
    var NoteGenerator = function(event) {
        var noteOffset = 0, amplitude = 0, end = Infinity;
        var releaseOffset = null, releaseAmplitude, releaseSamples = 0;
        if(!soundfont) return;
        var preset = soundfont.presets[me.parameters.preset.value];
        if(!preset) return;
        //Process each zone to find which generators and samples to use
        var presetGenerators = {}, instrumentGenerators = {}, samples = [];
        //Calls a handler for each zone that applies to the current event
        function getApplicableZones(zones, handler) {
            for(var z = 0; z < zones.length; z++) {
                var zone = zones[z];
                //Check the key and velocity ranges to see if this zone applies
                if((!zone.keyRange ||
                        event.note >= zone.keyRange.low &&
                        event.note <= zone.keyRange.high) &&
                    (!zone.velRange ||
                        event.velocity >= zone.velRange.low &&
                        event.velocity <= zone.velRange.high)) {
                    handler(zone);
                }
            }
        }
        //Get global generators for the preset first
        getApplicableZones(preset.zones, function(zone) {
            if(!zone.instrument) for(var name in zone.generators) {
                presetGenerators[name] = zone.generators[name];
            }
        });
        //Then get each instrument's generators
        getApplicableZones(preset.zones, function(zone) {
            if(zone.instrument) {
                //First get the preset's generators for the instrument
                for(var name in zone.generators) {
                    instrumentGenerators[name] = zone.generators[name];
                }
                //Then get the instrument's global generators
                getApplicableZones(zone.instrument.zones, function(zone) {
                    if(!zone.sample) for(var name in zone.generators) {
                        instrumentGenerators[name] = zone.generators[name];
                    }
                });
                //Finally get the samples and their generators
                getApplicableZones(zone.instrument.zones, function(zone) {
                    if(zone.sample) {
                        //Add all the generators to the sample
                        var generators = {};
                        for(var name in zone.generators) {
                            generators[name] = zone.generators[name];
                        }
                        for(var name in instrumentGenerators) {
                            if(!generators[name]) generators[name] = 0;
                            generators[name] += instrumentGenerators[name];
                        }
                        for(var name in presetGenerators) {
                            if(!generators[name]) generators[name] = 0;
                            generators[name] += presetGenerators[name];
                        }
                        //TODO: Copy the sample with interpolation...
                        samples.push({
                            sample: zone.sample,
                            generators: generators
                        });
                    }
                });
            }
        });
        
        //Generates the note audio
        this.generate = function(sampleCount, sampleOffset, sampleRate) {
            //ADSR
            if(releaseOffset != null) {
                //If the release has just started
                if(noteOffset == releaseOffset) {
                    releaseAmplitude = amplitude;
                    end = releaseOffset + releaseSamples;
                }
                //If the release is over
                if(noteOffset + sampleCount >= end) {
                    delete activeNotes[event.note];
                }
                var elapsed = noteOffset - releaseOffset;
                //TODO: Work out what this should be...
                //Exponentially ramp instead of linearly
                amplitude = Math.pow(
                    releaseAmplitude - elapsed / releaseSamples, 12);
            }
            else amplitude = 1;
            /*
            var generators = sampleData.generators;
            var attackSamples = generators.attackModEnv;
            if(attackSamples && noteOffset < attackSamples) {
                var progress = noteOffset / attackSamples;
                var attackLevel = generators.attackVolEnv != null ?
                    generators.attackVolEnv : 0;
                adsrModifier = attackLevel + progress * decayDifference;
            }
            else if(noteOffset < decayEnd) {
                var progress = (noteOffset - attackSamples) / decaySamples;
                adsrModifier = decayLevel + progress * sustainDifference;
            }
            else adsrModifier = sustainLevel;
            */
            //Generate each SoundFont sample
            var channels = Biscuit.createBlankAudioChannels(sampleCount, 2);
            var leftChannel = channels[0], rightChannel = channels[1];
            for(var i = 0; i < samples.length; i++) {
                var sampleData = samples[i];
                //Compare the sample's rate to the output's and combine this
                //with the pitch modifiers to get the correct offset
                var rootKey = sampleData.generators.overridingRootKey;
                if(rootKey == null) rootKey = sampleData.sample.originalPitch;
                var semitoneOffset = sampleData.sample.pitchCorrection +
                    event.note - rootKey;
                var pitchRatio = Math.pow(2, semitoneOffset / 12);
                var sampleRatio = sampleData.sample.sampleRate / sampleRate;
                var offsetRatio = sampleRatio * pitchRatio;
                //Calculate pan gain values
                var channel, pan = sampleData.generators.pan || 0;
                var leftGain = Math.min(1, -pan + 1);
                var rightGain = Math.min(1, pan + 1);
                //Generate each audio sample for the current SoundFont sample
                var count = Math.min(sampleCount, end);
                for(var s = 0; s < count; s++) {
                    var position = Math.floor((noteOffset + s) * offsetRatio);
                    var offset;
                    if(position < sampleData.sample.loopStart)
                        offset = position;
                    else offset = sampleData.sample.loopStart + (position -
                        sampleData.sample.loopStart) %
                        sampleData.sample.loopSize;
                    //TODO: Work out when to and when not to loop...
                    if(position > sampleData.sample.data.length) break;
                    //Add the sample
                    var sample = sampleData.sample.data[offset] * amplitude;
                    leftChannel[s] += sample * leftGain;
                    rightChannel[s] += sample * rightGain;
                }
            }
            noteOffset += sampleCount;
            return channels;
        };
        
        //Get highest release sample length
        function timeCentsToSamples(timeCents, sampleRate) {
            return Math.pow(2, timeCents / 1200) * sampleRate;
        }
        function samplesToTimeCents(samples, sampleRate) {
            return Math.log(samples / sampleRate) / Math.log(2) * 1200;
        }
        for(var s = 0; s < samples.length; s++) {
            var sample = samples[s];
            var generators = sample.generators;
            if(generators.releaseVolEnv) {
                var sampleReleaseTime = timeCentsToSamples(
                    generators.releaseVolEnv,
                    sample.sample.sampleRate
                );
                //TODO: Work out what's wrong and fix it...
                //This seems to generate the correct number, but it always
                //sounds like it is too long...
                sampleReleaseTime *= 1;
                if(sampleReleaseTime > releaseSamples) {
                    releaseSamples = sampleReleaseTime;
                }
            }
        }
        this.release = function() {
            releaseOffset = noteOffset;
        };
    };
    //MIDI Input
    this.inputs = [{ type: "midi", onEvent: function(event) {
        if(event.type != "channel") return;
        if(event.subtype == "noteOn") {
            var generator = new NoteGenerator(event);
            if(generator.generate) activeNotes[event.note] = generator;
        }
        else if(event.subtype == "noteOff") {
            var generator = activeNotes[event.note];
            if(generator) generator.release();
        }
    } }];
    //Audio Output
    this.outputs = [{
        type: "note",
        generate: function(audio, sampleCount, sampleOffset) {
            var noteChannels = [];
            for(var note in activeNotes) {
                var channels = activeNotes[note].generate(sampleCount,
                    sampleOffset, audio.sampleRate);
                if(channels) noteChannels.push(channels);
            }
            return noteChannels;
        }
    }];
    this.reset = function() { activeNotes = {}; };
});