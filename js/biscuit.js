// Biscuit - Real-time synthesised instruments in the browser
// Kudos to: RiffWave, jasmid, MIDI.js & Google Search ;)

var Biscuit = {
    
    //Plays sound from a sample generator
    AudioContext: null,
    context: null,

    //Provides interaction with instruments
    DEFAULT_VELOCITY: 64,
    Channel: function(options) {
        var me = this;
        options = options || {};
        me.effectsChain = options.effectsChain || new EffectsChain({});
        //Send an event to the effects chain after validating it
        var sustainedNotes, sustaining = false;
        this.event = function(event) {
            var cleanedEvent = Biscuit.cleanEvent(event);
            //Handle sustain pedal
            //TODO: Handle this in the instrument...
            if(event.type == "channel") {
                if(event.subtype == "control" &&
                        event.controller == "sustain") {
                    sustaining = !!event.value;
                    if(sustaining) sustainedNotes = {};
                    else for(var note in sustainedNotes) {
                        me.event({
                            type: "channel",
                            subtype: "noteOff",
                            note: note
                        });
                    }
                }
                else if(sustaining) {
                    if(event.subtype == "noteOff") {
                        sustainedNotes[cleanedEvent.note] = true;
                        cleanedEvent = null;
                    }
                    else if(event.subtype == "noteOn" &&
                            sustainedNotes[cleanedEvent.note]) {
                        delete sustainedNotes[cleanedEvent.note];
                    }
                }
            }
            if(cleanedEvent) me.effectsChain.midiEvent(cleanedEvent);
        };
        //TODO: Remove these and only use this.event...
        this.noteOn = function(note, velocity) {
            if(velocity == null) velocity = Biscuit.DEFAULT_VELOCITY;
            me.effectsChain.midiEvent({
                type: "channel",
                subtype: "noteOn",
                note: note,
                frequency: Biscuit.noteFrequency(note),
                velocity: velocity
            });
        };
        this.noteOff = function(note, velocity) {
            me.effectsChain.midiEvent({
                type: "channel",
                subtype: "noteOff",
                note: note,
                frequency: Biscuit.noteFrequency(note),
                velocity: velocity || 0
            });
        };
        this.programChange = function(programNumber) {

        };
        //TODO: Replace audio argument with sampleRate...
        this.generate = function(audio, sampleCount, offset) {
            return me.effectsChain.generate(audio, sampleCount, offset);
        };
        this.reset = function() { me.effectsChain.reset(); };
    },

    //Effect/Instrument prototype
    currentEffectId: 0,
    effects: {},
    Effect: function(EffectClass) {
        function clone(originalObject) {
            var clonedObject = {};
            for(var key in originalObject) {
                var value = originalObject[key];
                if(typeof value == "object") value = clone(value);
                clonedObject[key] = value;
            }
            return clonedObject;
        }
        //Return a class used to create instances of the effect
        var effect = function() {
            var effectInstance = new EffectClass();
            var me = this;
            me.id = Biscuit.currentEffectId++;
            me.uuid = effectInstance.uuid;
            me.displayName = effectInstance.displayName;
            me.inputs = effectInstance.inputs;
            me.outputs = effectInstance.outputs;
            me.parameters = effectInstance.parameters;
            me.reset = effectInstance.reset;
            me.NoteGenerator = function(note) {
                var offset = 0;
                var endOffset = null;
                var generator = new effectInstance.NoteGenerator(note);
                this.generate = function(audio, sampleCount) {
                    var audioChannels = generator.generate(
                        audio,
                        sampleCount,
                        offset,
                        endOffset,
                        effectInstance.parameters
                    );
                    offset += sampleCount;
                    return audioChannels;
                };
                this.noteOff = function() { endOffset = offset; };
            };
            me.setParameter = function(name, value, dontSetControl) {
                var parameter = me.parameters[name];
                if(parameter) {
                    parameter.value = value;
                    if(!dontSetControl && parameter.control) {
                        if(parameter.type == "range") {
                            parameter.control.value = value * 100;
                        }
                        else if(parameter.type != "file") {
                            parameter.control.value = value;
                        }
                    }
                    if(parameter.onChange) parameter.onChange(value);
                }
            };
            for(var i = 0; i < me.inputs.length; i++) {
                me.inputs[i].effect = me;
            }
            for(var i = 0; i < me.outputs.length; i++) {
                me.outputs[i].effect = me;
            }
        };
        var instance = new EffectClass();
        effect.displayName = instance.displayName;
        effect.uuid = instance.uuid;
        effect.inputs = instance.inputs;
        effect.outputs = instance.outputs;
        Biscuit.effects[effect.uuid] = effect;
        //Check if this effect is an instrument
        var midiInput = false, audioOutput = false;
        for(var i = 0; i < effect.inputs.length; i++) {
            if(effect.inputs[i].type == "midi") {
                midiInput = true;
                break;
            }
        }
        for(var i = 0; i < effect.outputs.length; i++) {
            if(effect.outputs[i].type == "audio") {
                audioOutput = true;
                break;
            }
        }
        return effect;
    },

    //Gets the frequency of a note
    middleA: 440,
    noteFrequency: function(note) {
        return Biscuit.middleA * Math.pow(1.059463, note - 69);
    },
    
    //Generates a checksum for a JavaScript variable
    getChecksum: function(data) {
        //Generate using Adler-32 algorithm
        var a = 1, b = 0, prime = 65521;
        function calculate(variable) {
            switch(typeof variable) {
                //Object, Array, Null
                case "object":
                    //Do nothing for null
                    if(!variable) return;
                    for(var key in variable) {
                        calculate(key);
                        calculate(variable[key]);
                    }
                    break;
                //String
                case "string":
                    for(var i = 0, length = variable.length; i < length; i++) {
                        var charCode = variable.charCodeAt(i);
                        a = (a + charCode) % prime;
                        b = (b + a) % prime;
                    }
                    break;
                //Number
                case "number":
                    //Float, Infinity (calculate as a string)
                    if(variable % 1 || variable == Infinity) {
                        calculate(variable.toString());
                    }
                    //Integer
                    else {
                        a = (a + variable) % prime;
                        b = (b + a) % prime;
                    }
                    break;
                //Function
                case "function":
                    calculate(variable.toString());
                    break;
                //Boolean
                case "boolean":
                    a = (a + (variable ? 1 : 0)) % prime;
                    b = (b + a) % prime;
                    break;
                //Undefined (do nothing)
            }
        }
        calculate(data);
        return b << 16 | a;
    }
};

/*
 * Biscuit.Audio
 * Handles audio queuing and playback
 *
 * Options:
 * generator: (required) Sample generator function, called as:
 *            var generatedChannels = generator(audio, numberOfSamples);
 * bufferSize: Number of samples per buffer (must be a power of 2)
 *             0 = Automatically adjust size based on CPU load (default = 0)
 * channelCount: Number of audio channels (default = 2)
 * gain: Multiplies each sample by this amount (default = 1)
 * sampleRate: Samples per second (default = browser sample rate)
 */
Biscuit.DEFAULT_BUFFER_SIZE = 0;
Biscuit.DEFAULT_CHANNEL_COUNT = 2;
Biscuit.DEFAULT_GAIN = 1;
Biscuit.Audio = function(options) {
    this.offset = 0; // Current samples generated since Audio creation
    this.generateTimes = []; // Holds timestamps of when generate was called
    this.setChannelCount(options.channelCount);
    this.setGenerator(options.generator);
    this.setGain(options.gain);
    this.setSampleRate(options.sampleRate);
    this.setBufferSize(options.bufferSize);
};
//Creates the node used to route audio data from Biscuit to the speakers
Biscuit.Audio.prototype.createNode = function() {
    var self = this;
    this.stop();
    this.node = Biscuit.context.createScriptProcessor(
        this.currentBufferSize, this.channelCount, this.channelCount);
    //Automatically called to refresh the audio buffer
    this.node.onaudioprocess = function onAudioProcess(e) {
        //Get the time before we start generating so we know how long it takes
        var timeBefore = Date.now();
        var generatedChannels = self.generator(self, self.currentBufferSize);
        self.offset += self.bufferSize;
        if(generatedChannels) {
            //TODO: Resample if the sample rate is different...
            //Map generated channels to output channels
            for(var a = 0; a < generatedChannels.length; a++) {
                var samples = generatedChannels[a];
                var channelData = e.outputBuffer.getChannelData(a);
                for(var b = 0, length = channelData.length; b < length; b++) {
                    var sample = samples[b] * self.gain;
                    if(sample > 1) sample = 1;
                    else if(sample < -1) sample = -1;
                    channelData[b] = sample;
                }
            }
            //Work out how well the CPU is keeping up with the buffer
            //TODO: Remove this when I figure out how to auto-adjust down...
            // if(!self.bufferSize) {
            //     var spacing = 1000 / (self.sampleRate / self.currentBufferSize),
            //         difference = timeBefore - self.generateTimes[0];
            //     if(difference > spacing * 2 && self.currentBufferSize < 16384) {
            //         var bufferSize = self.currentBufferSize * 2;
            //         console.log("Buffer size auto-adjusted up to " + bufferSize);
            //         self.currentBufferSize = bufferSize;
            //         self.createNode();
            //     }
            //     self.generateTimes[0] = timeBefore;
            // }
        }
        //Clear the buffer when there is no generated audio
        else for(var c = 0; c < e.outputBuffer.numberOfChannels; c++) {
            var channelData = e.outputBuffer.getChannelData(c);
            for(var s = 0, length = channelData.length; s < length; s++) {
                channelData[s] = 0;
            }
            //Reset the buffer size to 512 every time audio stops
            //TODO: Remove this when I figure out how to auto-adjust down...
            var bufferSize = 512;
            if(self.currentBufferSize != bufferSize) {
                console.log("Buffer size reset to " + bufferSize);
                self.currentBufferSize = bufferSize;
                self.createNode();
            }
        }
        /*
        //TODO: Figure out how to know when the CPU can cope accurately...
        //      (There can be variations even when it's fine)
        self.generateTimes.push(timeBefore);
        if(self.generateTimes.length >= 50) {
            //Find the highest variation in generation times to determine if the
            //CPU is struggling or not
            var spacing = 1000 / (self.sampleRate / self.currentBufferSize),
                max = 0;
            for(var t = 2; t < self.generateTimes.length; t++) {
                var time = self.generateTimes[t],
                    previousTime = self.generateTimes[t - 1];
                var difference = time - previousTime;
                if(difference > max) max = difference;
            }
            if(max > spacing * 2 && self.currentBufferSize < 1024 * 16) {
                var bufferSize = self.currentBufferSize * 2;
                console.log("Buffer size auto-adjusted up to " + bufferSize);
                self.currentBufferSize = bufferSize;
                self.createNode();
            }
            else if(max < spacing * 1.2 && self.currentBufferSize > 256) {
                var bufferSize = self.currentBufferSize / 2;
                console.log("Buffer size auto-adjusted down to " + bufferSize);
                self.currentBufferSize = bufferSize;
                self.createNode();
            }
            self.generateTimes = [];
        }
        */
    };
    //TODO: See if we can catch randomly disconnected nodes to reconnect them...
    this.node.addEventListener("disconnect", function(e) {
        console.log("Audio node disconnected!");
    }, false);
    this.start();
};
//Connects the audio node and starts generating
Biscuit.Audio.prototype.start = function() {
    this.generateTimes = [];
    this.node.connect(Biscuit.context.destination);
    this.active = true;
};
//Stops the Audio from generating
Biscuit.Audio.prototype.stop = function() {
    if(this.node) this.node.disconnect();
    this.active = false;
};
//Sets the generator function
Biscuit.Audio.prototype.setGenerator = function(generator) {
    this.generator = generator;
};
//Sets the sample rate
Biscuit.Audio.prototype.setSampleRate = function(sampleRate) {
    this.sampleRate = sampleRate != null ?
        sampleRate : Biscuit.context.sampleRate;
};
//Sets the gain
Biscuit.Audio.prototype.setGain = function(gain) {
    this.gain = gain != null ? gain : Biscuit.DEFAULT_GAIN;
};
//Sets the number of audio channels
Biscuit.Audio.prototype.setChannelCount = function(channelCount) {
    this.channelCount = channelCount != null ?
        channelCount : Biscuit.DEFAULT_CHANNEL_COUNT;
};
//Sets a new buffer size in samples (or 0 to auto-adjust buffer size)
Biscuit.Audio.prototype.setBufferSize = function(bufferSize) {
    if(bufferSize == null) bufferSize = Biscuit.DEFAULT_BUFFER_SIZE;
    //Update the buffer size
    this.bufferSize = bufferSize; // Passed size (could be 0 if auto-adjusted)
    this.currentBufferSize = bufferSize || 512; // Actual (auto-adjusted) size
    //Create a new node and replace the old one with it
    this.createNode();
};

//Helper functions

Biscuit.stopEvent = function(e) { e.preventDefault(); e.stopPropagation(); };

//Creates blank audio channels to add data to
Biscuit.createBlankAudioChannels = function(sampleCount, channelCount) {
    //TODO: See if we can make a Float32Array to increase performance...
    var audioChannels = [];
    if(!channelCount) channelCount = 2;
    for(var a = 0; a < channelCount; a++) {
        var audioChannel = audioChannels[a] = [];
        for(var b = 0; b < sampleCount; b++) {
            audioChannel[b] = 0;
        }
    }
    return audioChannels;
};

//Adds the samples of a channel to another
Biscuit.combineChannels = function(destination, source, offset, gain) {
    var sourceChannelCount = source.length;
    var destinationChannelCount = destination.length;
    var channelCount = Math.max(sourceChannelCount, destinationChannelCount);
    offset = offset || 0;
    if(gain == null) gain = 1;
    //Combine each channel
    for(var c = 0; c < channelCount; c++) {
        var sourceChannel = source[c % sourceChannelCount];
        //If there are more channels in the source then
        //start adding to the first channel again
        var destinationChannel = destination[c % destinationChannelCount];
        var sampleCount = Math.min(sourceChannel.length, destinationChannel.length);
        //Combine each sample
        for(var s = 0; s < sampleCount; s++) {
            var sample = sourceChannel[s];
            destinationChannel[s + offset] += sample * gain;
        }
    }
};

//Sets the number of channels in a set of audio channels
Biscuit.setChannelCount = function(channelCount, audioChannels) {
    var currentChannelCount = audioChannels.length;
    for(var c = currentChannelCount; c < channelCount; c++) {
        var existingChannel = audioChannels[c % currentChannelCount];
        var newChannel = [];
        for(var s = 0, sampleCount = existingChannel.length; s < sampleCount; s++) {
            newChannel[s] = existingChannel[s];
        }
        audioChannels[c] = newChannel;
    }
};

//Validates and cleans a MIDI event
Biscuit.cleanEvent = function(event) {
    //Finish now if the event is already clean and validated
    if(event.clean) return event;
    var cleanedEvent = { clean: true };
    //Channel events
    if(event.type == "channel") {
        cleanedEvent.type = "channel";

        if(event.subtype == "noteOn") {
            if(event.note == null) return null;
            cleanedEvent.note = event.note;
            if(event.frequency) cleanedEvent.frequency = event.frequency;
            else cleanedEvent.frequency = Biscuit.noteFrequency(event.note);
            cleanedEvent.velocity = event.velocity || 64;
            if(event.velocity != 0) {
                cleanedEvent.subtype = "noteOn";
                cleanedEvent.velocity = event.velocity || 64;
            }
            else {
                cleanedEvent.subtype = "noteOff";
                cleanedEvent.velocity = 0;
            }
        }

        else if(event.subtype == "noteOff") {
            if(event.note == null) return null;
            cleanedEvent.subtype = "noteOff";
            cleanedEvent.note = event.note;
            if(event.frequency) cleanedEvent.frequency = event.frequency;
            else cleanedEvent.frequency = Biscuit.noteFrequency(event.note);
            cleanedEvent.velocity = 0;
        }

        else if(event.subtype == "control") {
            cleanedEvent.subtype = "control";
            cleanedEvent.controller = event.controller;
            cleanedEvent.value = event.value || 0;
            console.log("controller = " + event.controller + " & value = " + event.value);
        }
    }
    return cleanedEvent;
};

//Returns the position of an element relative to another
Biscuit.getPositionOf = function(sourceElement, relativeElement,
        offsetX, offsetY) {
    var element = sourceElement, offsetParent = sourceElement;
    var x = offsetX || 0, y = offsetY || 0;
    while(element != relativeElement && element != document.body) {
        if(element == offsetParent) {
            x += element.offsetLeft - element.scrollLeft;
            y += element.offsetTop - element.scrollTop;
            offsetParent = element.offsetParent;
            element = element.parentNode;
        }
        else {
            x -= element.scrollLeft;
            y -= element.scrollTop;
            element = element.parentNode;
        }
    }
    return { x: x, y: y };
};

//Creates an SVG canvas
Biscuit.svgNamespace = "http://www.w3.org/2000/svg";
Biscuit.createSvgCanvas = function(height, width) {
    var canvas = document.createElementNS(Biscuit.svgNamespace, "svg");
    canvas.setAttribute("version", "1.1");
    canvas.setAttribute("xmlns", Biscuit.svgNamespace);
    canvas.setAttribute("width", height);
    canvas.setAttribute("height", width);
    return canvas;
};

//Get audio context
// (cross-browser hack)
Biscuit.AudioContext = window.AudioContext || window.webkitAudioContext;
if(!Biscuit.AudioContext) {
    alert("Sorry, the web audio API is not supported by this browser!");
}
else Biscuit.context = new Biscuit.AudioContext();

/*
//Biscuit SVG Logo
<svg style="width:640px;height:640px" viewBox="0 0 100 100">
  <path
    d="M30 10
      C25 10 15 18 25 26
      Q15 34 25 42
      Q15 50 25 58
      Q15 66 25 74
      C15 82 25 90 30 90
      L70 90
      C75 90 85 82 75 74
      Q85 66 75 58
      Q85 50 75 42
      Q85 34 75 26
      C85 18 75 10 70 10
    Z"
    stroke="#0af"
    stroke-width="2"
    fill="#666"
  />
</svg>

//Biscuit SVG Logo in 3D
<svg style="
  width:640px;
  height:640px;
  transform: rotateX(65deg) rotateZ(315deg);
  -webkit-filter: drop-shadow(-16px 16px 0px #09e);
" viewBox="0 0 100 100">
  <path
    d="M30 10
      C25 10 15 18 25 26
      Q15 34 25 42
      Q15 50 25 58
      Q15 66 25 74
      C15 82 25 90 30 90
      L70 90
      C75 90 85 82 75 74
      Q85 66 75 58
      Q85 50 75 42
      Q85 34 75 26
      C85 18 75 10 70 10
    Z"
    stroke="#0af"
    stroke-width="2"
    fill="#666"
  />
</svg>
*/
