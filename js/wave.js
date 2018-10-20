var Wave = function(name, originalSize, sampleChannels, sampleRate) {
    this.headers = {
        name: name,
        originalSize: originalSize,
        sampleRate: sampleRate
    };
    this.data = sampleChannels;
    this.status = "loading";
    this.icon = Resources.icons.Loading;
    this.onStatusChange = null;
    Resources.add(this);
};

//Changes the status of the resource
Wave.prototype.setStatus = function(status) {
    this.status = status;
    if(this.onStatusChange) this.onStatusChange(this);
};

//Decodes and imports a resource from a WAVE file
//TODO: Store the original file and decode every time (saves space...)
Wave.import = function(file, callback) {
    //Check if this file is already loaded
    var headers = { name: file.name, originalSize: file.size };
    Resources.find(headers, function(resource) {
        if(resource) return callback(resource);
        //Add the resource
        var wave = new Wave(file.name, file.size);
        //Decode the imported file
        Biscuit.context.decodeAudioData(file.buffer, function(buffer) {
            //Get the audio channels
            var channels = [];
            for(var i = 0; i < buffer.numberOfChannels; i++) {
                channels[i] = buffer.getChannelData(i);
            }
            //Update the resource
            //Chrome always decodes into the right sample
            //rate, so we may not need the sample rate...
            wave.headers.sampleRate = buffer.sampleRate;
            wave.data = channels;
            Resources.update(wave);
            wave.icon = Resources.icons.Wave;
            wave.setStatus("wave");
            callback(wave);
        });
    });
};

//Exports the sample data as an array buffer of a WAVE file
Wave.export = function(options) {
    var sampleLength = 0, sampleRate = options.sampleRate || 44100;
    if(options.multitrack) {
        var tickSize = options.multitrack.multitrackTickSize;
        var multitrackSamples = options.multitrack.ticksToSamples(tickSize);
        var seconds = multitrackSamples / options.multitrack.audio.sampleRate;
        sampleLength = (seconds + 10) * sampleRate;
    }
    //Coerce the data channels into the number of WAVE channels
    else if(options.data && options.data.length) {
        sampleLength = options.data[0].length || 0;
    }
    //Calculate headers
    var headerSize = 44;
    var header = {
        // Offset Bytes Description
        // 0x00   4     "RIFF" = 0x52494646 (0x46464952 in little endian)
        chunkId:        0x46464952,
        // 0x04   4     36+subChunk2Size = 4+(8+subChunk1Size)+(8+subChunk2Size)
        chunkSize:      0,
        // 0x08   4     "WAVE" = 0x57415645
        format:         0x45564157,
        // 0x0C   4     "fmt " = 0x666d7420
        subChunk1Id:    0x20746d66,
        // 0x10   4     16 for PCM
        subChunk1Size:  16,
        // 0x14   2     PCM = 1
        audioFormat:    1,
        // 0x16   2     Mono = 1, Stereo = 2, etc...
        numChannels:    options.numChannels || 2,
        // 0x18   4     8000, 44100, etc..
        sampleRate:     sampleRate,
        // 0x1C   4     sampleRate*numChannels*bitsPerSample/8
        byteRate:       0,
        // 0x20   2     numChannels*bitsPerSample/8
        blockAlign:     0,
        // 0x22   2     8 bits = 8, 16 bits = 16
        bitsPerSample:  options.bitsPerSample || 16,
        // 0x24   4     "data" = 0x64617461
        subChunk2Id:    0x61746164,
        // 0x28   4     Data Chunk Size = numSamples*numChannels*bitsPerSample/8
        subChunk2Size:  0
    };
    if(header.bitsPerSample > 32) header.bitsPerSample = 32;
    var bytesPerSample = Math.ceil(header.bitsPerSample / 8);
    var signedData = bytesPerSample > 1;
    header.blockAlign = header.numChannels * bytesPerSample;
    header.byteRate = header.blockAlign * header.sampleRate;
    header.subChunk2Size = sampleLength * bytesPerSample * header.numChannels;
    header.chunkSize = 36 + header.subChunk2Size;
    //Add headers to array buffer
    var size = headerSize + sampleLength * bytesPerSample * header.numChannels;
    if(size % 2) size++; // Size must be even
    var arrayBuffer = new ArrayBuffer(size);
    var uint32 = new Uint32Array(arrayBuffer);
    uint32[0] = header.chunkId;
    uint32[1] = header.chunkSize;
    uint32[2] = header.format;
    uint32[3] = header.subChunk1Id;
    uint32[4] = header.subChunk1Size;
    uint32[5] = header.audioFormat |
                header.numChannels << 16;
    uint32[6] = header.sampleRate;
    uint32[7] = header.byteRate;
    uint32[8] = header.blockAlign |
                header.bitsPerSample << 16;
    uint32[9] = header.subChunk2Id;
    uint32[10] = header.subChunk2Size;

    //Get audio data
    var audioChannels;
    if(options.multitrack) {
        var audioOptions = {
            sampleRate: header.sampleRate,
            channelCount: header.numChannels
        };
        //TODO: Make a separate function for generating so we do not have to
        //      simulate the multitrack playing and can do different sample
        //      rates...
        var playOffset = options.multitrack.playOffset,
            playing = options.multitrack.playing;
        options.multitrack.playOffset = 0;
        options.multitrack.playing = true;
        audioChannels = options.multitrack.generate(audioOptions, sampleLength);
        options.multitrack.playOffset = playOffset;
        options.multitrack.playing = playing;
        options.multitrack.updatePlayMarker();
    }
    else if(options.data) {
        audioChannels = Biscuit.createBlankAudioChannels(
            sampleLength, header.numChannels);
        Biscuit.combineChannels(audioChannels, options.data);
    }
    if(!audioChannels) return arrayBuffer;

    //Add the sample data
    var wave = (new Uint8Array(arrayBuffer)).subarray(headerSize);
    //var maxSample = (1 << header.bitsPerSample - 1) - 1;
    //Have to do this instead of bit-shift because bit-shift fails at ~30
    var maxSample = 1;
    for(var b = 0; b < header.bitsPerSample - 1; b++) maxSample *= 2;
    maxSample -= 1;
    var minSample = -maxSample - 1;
    //Save them to the buffer
    for(var c = 0; c < audioChannels.length; c++) {
        var channel = audioChannels[c];
        for(var s = 0; s < sampleLength; s++) {
            //Calculate the result to put in the buffer
            var sample = channel[s];
            var result = sample * maxSample;
            if(result > maxSample) result = maxSample;
            else if(result < minSample) result = minSample;
            if(!signedData || result < 0) result -= minSample;
            //Save the sample to the buffer
            var index = (s * header.numChannels + c) * bytesPerSample;
            for(var b = 0; b < bytesPerSample; b++) {
                wave[index + b] = result & 0xff;
                result >>>= 8;
            }
            if(signedData && sample < 0) {
                wave[index + bytesPerSample - 1] |= 0x80;
            }
        }
    }
    return arrayBuffer;
};
