//Loop object
Biscuit.Loop = function(options) {
    this.multitrack = options.multitrack || null;
    this.type = options.type || "midi";
    this.name = options.name || "Loop";
    this.element = null;
    this.events = options.events || [];
    this.timeSignature = options.timeSignature || {
        numerator: 4,
        denominator: 4
    };
    this.tickSize = options.tickSize || this.ticksPerBeat * 4;
    this.loopable = options.loopable != null ? options.loopable : true;
    this.loopedTickSize = options.loopedTickSize || this.tickSize;
    //If the looped size is locked to the single size
    this.sizeLocked = options.sizeLocked != null ? options.sizeLocked : false;
    this.tickPosition = options.tickPosition || 0;
    this.tickOffset = options.tickOffset || 0;
    if(this.type == "midi") {
        if(options.ticksPerBeat) this.ticksPerBeat = options.ticksPerBeat;
        else if(!this.multitrack) this.ticksPerBeat = 480;
        else this.ticksPerBeat = this.multitrack.ticksPerBeat;
    }
    else if(this.type == "wave") {
        this.samplesPerBeat = options.samplesPerBeat || 0;
        this.sampleChannels = options.sampleChannels || [];
        this.sampleRate = options.sampleRate || 44100;
        this.sampleLength = options.sampleLength ||
            this.sampleChannels[0] ? this.sampleChannels[0].length : 0;
    }
    this.calculateSampleSizes();
};

Biscuit.Loop.prototype.calculateSampleSizes = function() {
    if(!this.multitrack) return;
    this.samplePosition = this.multitrack.ticksToSamples(this.tickPosition);
    this.sampleSize = this.multitrack.ticksToSamples(this.tickSize);
    this.loopedSampleSize =
        this.multitrack.ticksToSamples(this.loopedTickSize);
    this.sampleEnd = this.samplePosition + this.loopedSampleSize;
    this.sampleOffset = this.multitrack.ticksToSamples(this.tickOffset);
};

//Draws loop thumbnails
Biscuit.Loop.canvas = document.createElement("CANVAS");
Biscuit.Loop.context = Biscuit.Loop.canvas.getContext("2d");
Biscuit.Loop.prototype.generateThumbnail = function() {
    if(this.type == "midi") this.generateMidiThumbnail();
    else if(this.type == "wave") this.generateWaveThumbnail();
}
Biscuit.Loop.prototype.generateMidiThumbnail = function() {
    if(!this.track) return;
    var canvasWidth = this.tickSize / this.multitrack.ticksPerBar *
        this.multitrack.barSize;
    var canvasHeight = this.multitrack.trackHeight -
        this.multitrack.borderWidthOffset;
    Biscuit.Loop.canvas.width = canvasWidth;
    Biscuit.Loop.canvas.height = canvasHeight;
    Biscuit.Loop.context.clearRect(0, 0, canvasWidth, canvasHeight);
    //Get each note and their dimensions
    var length = this.events.length;
    var loopNotes = [], currentNotes = {}, lowestNote = 127, highestNote = 0;
    for(var i = 0; i < length; i++) {
        var loopEvent = this.events[i];
        if(loopEvent.subtype == "noteOn") {
            if(currentNotes[loopEvent.note] == null) {
                currentNotes[loopEvent.note] = loopEvent.tick;
            }
        }
        else if(loopEvent.subtype == "noteOff") {
            var note = loopEvent.note;
            var startTick = currentNotes[note];
            if(startTick != null) {
                //Add it to the list of notes
                loopNotes.push({
                    note: note,
                    startTick: startTick,
                    endTick: loopEvent.tick
                });
                //Log the lowest and highest notes for bounds
                if(note < lowestNote) lowestNote = note;
                if(note > highestNote) highestNote = note;
                delete currentNotes[note];
            }
        }
    }
    //Draw the notes
    var range = highestNote - lowestNote;
    if(range < 12) {
        highestNote = lowestNote + (range == 11 ? 11 : 10);
        lowestNote -= range == 11 ? 1 : 2;
    }
    var height = canvasHeight / (highestNote - lowestNote + 1);
    Biscuit.Loop.context.fillStyle = "#000";
    for(var i = 0, length = loopNotes.length; i < length; i++) {
        var note = loopNotes[i];
        var x = note.startTick / this.tickSize * canvasWidth;
        var y = (highestNote - note.note) * height;
        var width = (note.endTick - note.startTick) / this.tickSize *
            canvasWidth;
        Biscuit.Loop.context.fillRect(x, y, width, height);
    }
    //Draw the border of the loop to see repeat points
    Biscuit.Loop.context.beginPath();
    Biscuit.Loop.context.moveTo(0, 0);
    Biscuit.Loop.context.lineTo(0, canvasHeight);
    Biscuit.Loop.context.lineWidth = 1;
    Biscuit.Loop.context.strokeStyle = "#06c";
    Biscuit.Loop.context.stroke();
    //Display the thumbnail at the correct offset
    var background = "url(" + Biscuit.Loop.canvas.toDataURL() + ")";
    this.element.style.backgroundImage = background;
    this.setThumbnailOffset(this.tickOffset);
};
Biscuit.Loop.prototype.generateWaveThumbnail = function() {
    //Set up the canvas
    var canvasWidth = this.tickSize / this.multitrack.ticksPerBar *
        this.multitrack.barSize;
    var canvasHeight = this.multitrack.trackHeight -
        this.multitrack.borderWidthOffset;
    Biscuit.Loop.canvas.width = canvasWidth;
    Biscuit.Loop.canvas.height = canvasHeight;
    Biscuit.Loop.context.clearRect(0, 0, canvasWidth, canvasHeight);
    //Get the value of each pixel by using the maximum sample
    var samplesPerPixel = this.sampleRate / (this.multitrack.barSize / 2);
    var channelCount = this.sampleChannels.length;
    var sampleCount = this.sampleChannels[0].length;
    var pixelCount = Math.floor(sampleCount / samplesPerPixel);
    var values = [];
    for(var i = 0; i < pixelCount; i++) values[i] = 0;
    for(var c = 0; c < channelCount; c++) {
        var channel = this.sampleChannels[c];
        var max = 0, min = 1;
        for(var s = 1, pixel = 0; s < sampleCount; s++) {
            var sample = channel[s];
            if(sample > max) max = sample;
            if(sample < min) min = sample;
            //Add to the waveform pixel values after getting enough samples
            if((s % (samplesPerPixel * 2)) < 1) {
                values[pixel++] += max - min;
                max = 0;
                min = 1;
                //Skip a pixel for effect (and half the processing time)
                //s = Math.round(s + samplesPerPixel) + 1;
                pixel++;
            }
        }
    }
    var halfway = canvasHeight / 2;
    for(var p = 0; p < pixelCount; p += 2) {
        //Draw average value
        var value = values[p] / channelCount;
        var y = halfway - value * halfway;
        var height = value * canvasHeight;
        Biscuit.Loop.context.fillRect(p, y, 1, height);
    }
    //Draw the border of the loop to see repeat points
    Biscuit.Loop.context.beginPath();
    Biscuit.Loop.context.moveTo(0, 0);
    Biscuit.Loop.context.lineTo(0, canvasHeight);
    Biscuit.Loop.context.lineWidth = 1;
    Biscuit.Loop.context.strokeStyle = "#06c";
    Biscuit.Loop.context.stroke();
    //Display the thumbnail at the correct offset
    var background = "url(" + Biscuit.Loop.canvas.toDataURL() + ")";
    this.element.style.backgroundImage = background;
    this.setThumbnailOffset(this.tickOffset);
};
Biscuit.Loop.prototype.setThumbnailOffset = function(newOffset) {
    var offsetTicks = this.tickSize - newOffset;
    var offset = offsetTicks / this.multitrack.ticksPerBar *
        this.multitrack.barSize - this.multitrack.borderWidthOffset / 2;
    this.element.style.backgroundPosition =
        (offset * this.multitrack.settings.zoom) + "px 0";
};

//Clones a loop object
Biscuit.Loop.prototype.clone = function() {
    //Create the new loop
    var clonedLoop = new Biscuit.Loop({
        type: this.type,
        name: this.name,
        timeSignature: {
            numerator: this.timeSignature.numerator,
            denominator: this.timeSignature.denominator
        },
        tickSize: this.tickSize,
        loopable: this.loopable,
        loopedTickSize: this.loopedTickSize,
        sizeLocked: this.sizeLocked,
        tickPosition: this.tickPosition,
        tickOffset: this.tickOffset
    });
    if(this.type == "midi") {
        //Clone the loop's events
        for(var i = 0, length = this.events.length; i < length; i++) {
            //TODO: Put this in the Event prototype...
            //clonedLoop.events[i] = this.events[i].clone();
            var newEvent = {}, oldEvent = this.events[i];
            for(var key in oldEvent) {
                newEvent[key] = oldEvent[key];
            }
            clonedLoop.events[i] = newEvent;
        }
        clonedLoop.ticksPerBeat = this.ticksPerBeat;
    }
    else if(this.type == "wave") {
        //Clone the sample channels
        for(var c = 0; c < this.sampleChannels.length; c++) {
            var newChannel = clonedLoop.sampleChannels[c] = [],
                oldChannel = this.sampleChannels[c];
            for(var s = 0; s < this.sampleCount; s++) {
                newChannel[s] = oldChannel[s];
            }
        }
        clonedLoop.sampleRate = this.sampleRate;
        clonedLoop.samplesPerBeat = this.samplesPerBeat;
    }
    return clonedLoop;
};

//Calculates the size and position of the loop
Biscuit.Loop.prototype.calculateMetrics = function() {
    var barPosition = this.tickPosition / this.multitrack.ticksPerBar;
    var left = barPosition * this.multitrack.scaledBarSize;
    this.element.style.left = left + "px";
    var barSize = this.loopedTickSize / this.multitrack.ticksPerBar;
    var pixelSize = barSize * this.multitrack.scaledBarSize;
    var width = pixelSize - this.multitrack.borderWidthOffset;
    this.element.style.width = width + "px";
    this.element.style.top = 0;
};
