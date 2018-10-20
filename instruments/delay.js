new Biscuit.Effect(function() {
    this.displayName = "Simple Delay";
    this.uuid = "e83acff0-1c74-11e4-8c21-0800200c9a66";
    var parameters = this.parameters = {
        delay: {
            displayName: "Delay (ms)",
            type: "range",
            min: 1,
            max: 1000,
            value: 432
        },
        sustain: {
            displayName: "Sustain",
            type: "range",
            min: 0.01,
            max: 1,
            value: 0.3
        }
    };
    var delayedAudioChannels = null;
    var delayIndex = 0;
    var input = { type: "audio" };
    this.inputs = [ input ];
    this.outputs = [{ type: "audio", generate: function(audio, sampleCount, sampleOffset) {
        //Create the delayed audio channels
        var delaySampleSize = parameters.delay.value / 1000 * audio.sampleRate;
        if(!delayedAudioChannels) {
            delayedAudioChannels = Biscuit.createBlankAudioChannels(
                delaySampleSize);
        }
        //Add the samples if the delay size has changed
        else if(delayedAudioChannels[0].length < delaySampleSize) {
            for(var c = 0; c < delayedAudioChannels.length; c++) {
                var channel = delayedAudioChannels[c];
                for(var s = 0; s < delaySampleSize; s++) {
                    channel[s] = 0;
                }
            }
        }
        //Get the audio channels from the input
        var audioChannels, channelCount = delayedAudioChannels.length;
        if(input.connectedTo && input.connectedTo.generate) {
            audioChannels = input.connectedTo.generate(audio, sampleCount, sampleOffset);
        }
        if(audioChannels) Biscuit.setChannelCount(channelCount, audioChannels);
        else audioChannels = Biscuit.createBlankAudioChannels(sampleCount);
        //Add the delayed audio
        var delayStartIndex = delayIndex;
        for(var c = 0; c < channelCount; c++) {
            var audioChannel = audioChannels[c];
            var delayChannel = delayedAudioChannels[c];
            delayIndex = delayStartIndex;
            for(var s = 0, length = audioChannel.length; s < length; s++) {
                audioChannel[s] += delayChannel[delayIndex];
                delayChannel[delayIndex] += audioChannel[s];
                delayChannel[delayIndex] *= parameters.sustain.value;
                if(++delayIndex >= delaySampleSize) {
                    delayIndex = 0;
                }
            }
        }
        return audioChannels;
    } }];
    this.reset = function() {
        delayedAudioChannels = null;
        delayIndex = 0;
    }
});