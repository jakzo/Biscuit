function createWaveformInstrument(name, sampleGenerator, parameters, uuid) {
    return new Biscuit.Effect(function() {
        this.displayName = name;
        this.uuid = uuid;
        //Clone parameters so that we don't alter every effect
        var clonedParameters = {};
        for(var n in parameters) {
            var parameter = parameters[n];
            clonedParameters[n] = {
                displayName: parameter.displayName,
                type: parameter.type,
                min: parameter.min,
                max: parameter.max,
                value: parameter.value
            };
        }
        this.parameters = clonedParameters;
        //Note framework
        //TODO: Change this to an array to increase performance...
        var activeNotes = {};
        var NoteGenerator = function(note) {
            //Sound constants
            var volume = note.velocity / 127;
            this.generate = function(sampleCount, sampleOffset, sampleRate) {
                var frequency = sampleRate / note.frequency;
                var channel = [];
                //Create the wave
                for(var i = 0; i < sampleCount; i++) {
                    var sample = sampleGenerator(frequency, sampleOffset + i, clonedParameters);
                    channel[i] = sample * volume;
                }
                return [ channel ];
            };
        };
        //Midi event input
        this.inputs = [{ type: "midi", onEvent: function(event) {
            if(event.type != "channel") return;
            switch(event.subtype) {
                case "noteOn":
                    activeNotes[event.note] = new NoteGenerator(event);
                    break;
                case "noteOff":
                    delete activeNotes[event.note];
                    break;
            }
        } }];
        //Resets the instrument state
        this.reset = function() {
            activeNotes = {};
        };
        this.outputs = [{ type: "note", generate: function(audio, sampleCount, sampleOffset) {
            var noteChannels = [];
            for(var note in activeNotes) {
                noteChannels.push(
                    activeNotes[note].generate(sampleCount, sampleOffset, audio.sampleRate)
                );
            }
            return noteChannels;
        } }];
    });
}

var Sine = createWaveformInstrument("Sine", function(frequency, samplePosition, parameters) {
    return Math.sin(2 * Math.PI / frequency * samplePosition);
}, {}, "e83acff1-1c74-11e4-8c21-0800200c9a66");

var Square = createWaveformInstrument("Square", function(frequency, samplePosition, parameters) {
    return Math.floor(samplePosition / frequency) % 2 ? -1 : 1;
}, {}, "e83acff2-1c74-11e4-8c21-0800200c9a66");

var Triangle = createWaveformInstrument("Triangle", function(frequency, samplePosition, parameters) {
    var quarterFrequency = frequency / 4;
    var sample = (samplePosition + quarterFrequency) % frequency / quarterFrequency - 1;
    if(sample > 1) return 2 - sample;
    return sample;
}, {}, "e83acff3-1c74-11e4-8c21-0800200c9a66");

var Sawtooth = createWaveformInstrument("Sawtooth", function(frequency, samplePosition, parameters) {
    return samplePosition % frequency / frequency;
}, {}, "e83acff4-1c74-11e4-8c21-0800200c9a66");

var PulseSquare = createWaveformInstrument("Pulse Square", function(frequency, samplePosition, parameters) {
    var wavePosition = samplePosition % frequency / frequency;
    return wavePosition < parameters.pulseRatio.value ? 1 : -1;
}, { pulseRatio: { displayName: "Pulse Ratio", type: "range", min: 0.01, max: 0.50, value: 0.3 }},
"e83acff5-1c74-11e4-8c21-0800200c9a66");