//Provides interface for playing sound from the multitrack

Biscuit.Multitrack.prototype.initPlay = function() {
    var self = this;
    this.externalAudio = false;
    this.externalOffset = 0;
    this.externalNotes = {};
    this.externalSustain = false;
    this.externalAudioTimeout = null;
    this.externalAudioStopTime = 10000;
    this.playOffset = 0;
    this.playing = false;
    this.playMarker = new Biscuit.Marker({
        multitrack: this,
        onDragEnd: function(tick) {
            self.movePlayMarker(self.ticksToSamples(tick));
        }
    });
    var playMarkerWidth = 2;
    this.playMarker.line.style.borderLeft = playMarkerWidth + "px solid #0af";
    //TODO: Use SVG or Canvas for this, not this hacky thing...
    this.playMarker.icon.style.borderTop = this.rulerHeight + "px solid #0af";
    this.playMarker.icon.style.borderLeft =
        this.playMarker.icon.style.borderRight =
            this.rulerHeight + "px solid transparent";
    this.playMarker.icon.style.marginLeft =
        (playMarkerWidth / 2 - this.rulerHeight) + "px";
    this.rulerContainer.addEventListener("mousedown", function(e) {
        self.playMarker.dragMouse(e);
    }, false);
    this.rulerContainer.addEventListener("touchstart", function(e) {
        self.playMarker.dragTouch(e);
    }, false);
    this.lastPlayMarkerUpdate = 0;
    this.playMarkerUpdateTime = 87;
    this.audio = new Biscuit.Audio({
        generator: function(audio, sampleCount) {
            return self.generate(audio, sampleCount);
        }
    });
};

//Lets other things like the piano roll composer play through the multitrack
Biscuit.Multitrack.prototype.externalMidiEvent = function(event) {
    if(event.type == "channel") {
        if(!this.currentTrack || !this.currentTrack.channel) return;
        if(event.subtype == "noteOn") {
            var note = event.note;
            //TODO: Handle this inside pianoroll.js...
            var key = document.getElementById("pianoroll_key" + note);
            if(key) key.classList.add("pianoroll_keydown");
            if(this.externalAudioTimeout) {
                clearTimeout(this.externalAudioTimeout);
                this.externalAudioTimeout = null;
            }
            this.externalAudio = true;
            this.externalNotes[note] = this.currentTrack.channel;
        }
        else if(event.subtype == "noteOff") {
            var note = event.note;
            //TODO: Handle this inside pianoroll.js...
            var key = document.getElementById("pianoroll_key" + note);
            if(key) key.classList.remove("pianoroll_keydown");
            if(!this.externalNotes[note]) return;
            delete this.externalNotes[note];
            this.externalAudioCheck(event);
        }
        else if(event.subtype == "control") {
            if(event.controller == "sustain") {
                this.externalSustain = !!event.value;
                this.externalAudioCheck(event);
            }
            //TODO: Remove this once automation is complete...
            else {
                var effects = this.currentTrack.channel.effectsChain.effects;
                for(var i = 0; i < effects.length; i++) {
                    var effect = effects[i];
                    if(effect instanceof PulseSquare) {
                        var parameter = effect.parameters.pulseRatio;
                        parameter.value = event.value / 127 *
                            (parameter.max - parameter.min) + parameter.min;
                    }
                }
            }
        }
    }
    this.currentTrack.channel.event(event);
};

//Checks if it is safe to deactivate the external audio
Biscuit.Multitrack.prototype.externalAudioCheck = function() {
    //Deactivate audio if there are no more notes being played
    if(this.externalSustain || this.externalAudioTimeout) return;
    for(var ifStillHasActiveNotes in this.externalNotes) return;
    var self = this;
    this.externalAudioTimeout = setTimeout(function() {
        self.externalAudioOff();
    }, this.externalAudioStopTime);
};

Biscuit.Multitrack.prototype.externalAudioOff = function() {
    this.externalAudioTimeout = null;
    this.externalAudio = false;
    this.externalOffset = 0;
    //Reset the track effects only if it is not currently playing
    if(!this.playing) {
        for(var t = 0; t < this.tracks.length; t++) {
            this.tracks[t].chain.reset();
        }
    }
};

//Plays all tracks simultaneously
Biscuit.Multitrack.prototype.play = function() {
    var bufferSizeSeconds = Biscuit.bufferSize / Biscuit.sampleRate;
    var transitionTime = Math.max(Math.floor(bufferSizeSeconds * 1000),
        this.playMarkerUpdateTime);
    this.playMarker.icon.style.transition =
        this.playMarker.line.style.transition =
            "left " + transitionTime + "ms linear";
    this.playButton.classList.add("multitrack_playing");
    var bufferMilliseconds = this.audio.bufferSize / this.audio.sampleRate;
    this.expectedAudioOffset = this.audio.offset + bufferMilliseconds * 3000;
    this.playing = true;
};

//Stops playing the multitrack
Biscuit.Multitrack.prototype.stop = function() {
    if(this.playing) {
        this.playing = false;
        this.updatePlayMarker(true);
        for(var t = 0; t < this.tracks.length; t++) {
            this.tracks[t].channel.reset();
        }
    }
    else this.movePlayMarker(0);
    this.playMarker.icon.style.transition =
        this.playMarker.line.style.transition = "";
    this.playButton.classList.remove("multitrack_playing");
};

//Moves the play marker and updates the play position
Biscuit.Multitrack.prototype.movePlayMarker = function(samplePosition) {
    if(samplePosition < 0) samplePosition = 0;
    this.playOffset = samplePosition;
    this.updatePlayMarker(true);
    //Don't let sounds carry on from the previous position
    if(this.playing) {
        for(var t = 0; t < this.tracks.length; t++) {
            this.tracks[t].channel.reset();
        }
    }
};

//Updates the position of the play marker
Biscuit.Multitrack.prototype.updatePlayMarker = function(forceUpdate) {
    //Only update after some time has passed since the last update
    if(!forceUpdate) {
        var now = Date.now();
        if(now - this.lastPlayMarkerUpdate < this.playMarkerUpdateTime) return;
        this.lastPlayMarkerUpdate = now;
    }
    //Move the play marker
    this.playMarker.setTick(this.samplesToTicks(this.playOffset));
    //Update the time display
    function pad(num) { return num < 10 ? "0" + num : num; }
    var totalSeconds = this.playOffset / this.settings.sampleRate;
    var seconds = pad((totalSeconds % 60).toFixed(2));
    var minutes = pad(Math.floor(totalSeconds / 60) % 60);
    var hours = pad(Math.floor(totalSeconds / 3600));
    this.timeSpan.textContent = hours + ":" + minutes + ":" + seconds;
    var beat = this.playOffset / (this.ticksPerBeat * this.samplesPerTick);
    var beats = Math.floor(beat) % this.timeSignature.numerator + 1;
    var bars = Math.floor(beat / this.beatsPerBar) + 1;
    this.barSpan.textContent = bars + "." + beats;
};

//Generates samples for the audio buffer
Biscuit.Multitrack.prototype.generate = function(audio, sampleCount) {
    if(!this.playing) {
        if(!this.externalAudio) return null;
        //Play external audio
        var audioChannels = Biscuit.createBlankAudioChannels(
            sampleCount, audio.channelCount);
        for(var t = 0; t < this.tracks.length; t++) {
            var track = this.tracks[t];
            var data = track.channel.generate(
                audio, sampleCount, this.externalOffset);
            if(data) Biscuit.combineChannels(
                audioChannels, data, 0, track.volume);
        }
        this.externalOffset += sampleCount;
        return audioChannels;
    }

    this.updatePlayMarker();
    this.setAutomationValues(this.samplesToTicks(this.playOffset));
    
    //Generate from all tracks when the playOffset is set
    var audioChannels = Biscuit.createBlankAudioChannels(
        sampleCount, audio.channelCount);
    var s, offset, channel, track, samplesRemaining;
    
    //Generates an amount of samples from the channel
    function generateSamples(sampleAmount) {
        if(sampleAmount > samplesRemaining) {
            //Set samples remaining to -1 to show that we're done
            sampleAmount = samplesRemaining--;
        }
        if(sampleAmount < 1) return;
        var data = channel.generate(audio, sampleAmount, offset);
        if(data) Biscuit.combineChannels(audioChannels, data, s, track.volume);
        offset += sampleAmount;
        s += sampleAmount;
        samplesRemaining -= sampleAmount;
    }
    
    for(var t = 0, trackCount = this.tracks.length; t < trackCount; t++) {
        track = this.tracks[t];
        if(track.muted) continue;
        //Generate samples for the current track
        channel = track.channel;
        offset = this.playOffset;
        s = 0;
        samplesRemaining = sampleCount;
        //Find the loop we're up to now
        var loops = track.loops, l = -1;
        var loopCount = loops.length;
        while(++l < loopCount && samplesRemaining >= 0) {
            var loop = loops[l];
            var sampleEnd = loop.samplePosition + loop.loopedSampleSize;
            if(sampleEnd > offset) {
                //This is the current or upcoming loop
                if(loop.samplePosition <= offset) {
                    //We are inside this loop
                    track.loopPlaying = loop;
                    var positionInLoop = offset - loop.samplePosition;
                    var loopedPosition = (positionInLoop + loop.sampleOffset) %
                        loop.sampleSize;
                    if(loop.type == "midi") {
                        //Find the next MIDI event to generate up to
                        var events = loop.events, i = -1;
                        var eventCount = events.length;
                        while(++i < eventCount && samplesRemaining >= 0) {
                            var event = events[i];

                            //-------------------------
                            //TODO: Remove this after setting in the events...
                            event.samplePosition =
                                this.ticksToSamples(event.tick);
                            //-------------------------

                            //POTENTIAL ISSUE: When the buffer ends on an
                            // event, it will execute that event the next
                            // time it starts generating audio (although it
                            // does not make a difference anyway...)
                            if(loopedPosition <= event.samplePosition) {
                                //Generate samples to next event or loop end
                                var samplesUntilEvent =
                                    event.samplePosition - loopedPosition;
                                var samplesUntilEnd = Math.min(
                                    loop.sampleSize - loopedPosition,
                                    loop.sampleEnd - offset
                                );
                                if(samplesUntilEvent <= samplesUntilEnd) {
                                    generateSamples(samplesUntilEvent);
                                    if(samplesRemaining >= 0) {
                                        loopedPosition += samplesUntilEvent;
                                        //Apply the event now that we're at it
                                        if(event.subtype == "noteOn") {
                                            var note = event.note;
                                            var velocity = event.velocity;
                                            channel.noteOn(note, velocity);
                                            track.activeNotes[note] = true;
                                        }
                                        else if(event.subtype == "noteOff") {
                                            var note = event.note;
                                            var velocity = event.velocity;
                                            channel.noteOff(note, velocity);
                                            delete track.activeNotes[note];
                                        }
                                    }
                                }
                                else {
                                    //Generate to loop end then repeat loop
                                    generateSamples(samplesUntilEnd);
                                    if(samplesRemaining >= 0) {
                                        //Reset the channel's active notes
                                        for(var note in track.activeNotes) {
                                            channel.noteOff(note, 0);
                                        }
                                        //track.activeNotes = {};
                                        //Iterate through this loop again
                                        l--;
                                        break;
                                    }
                                }
                            }
                        }
                        if(i == eventCount) {
                            //There are no more events in the loop
                            var samplesUntilEnd = Math.min(
                                loop.sampleSize - loopedPosition,
                                loop.sampleEnd - offset
                            );
                            //Generate to loop end then repeat loop
                            generateSamples(samplesUntilEnd);
                            if(samplesRemaining >= 0) {
                                //Reset the channel's active notes
                                for(var note in track.activeNotes) {
                                    channel.noteOff(note, 0);
                                }
                                //track.activeNotes = {};
                                //Iterate through this loop again
                                l--;
                            }
                        }
                    }
                    else {
                        //TODO: Wave loops...
                    }
                }
                //If we are before the loop, generate to it's start
                else {
                    generateSamples(loop.samplePosition - offset);
                    track.loopPlaying = null;
                    l--;
                }
            }
        }
        //If there are no more loops, just generate indefinitely
        if(l == loopCount && samplesRemaining >= 0) {
            generateSamples(samplesRemaining);
            track.loopPlaying = null;
        }
    }
    //Stop after all loops are finished
    var stopAfterEndInSeconds = 10;
    var endSample = this.ticksToSamples(this.multitrackTickSize) +
        stopAfterEndInSeconds * audio.sampleRate;
    if(this.playOffset > endSample) {
        this.playing = false;
        this.stop();
    }
    else this.playOffset += sampleCount;
    return audioChannels;
};

//Sets effect values for each track based on their automations and tick time
Biscuit.Multitrack.prototype.setAutomationValues = function(tick) {
    for(var t = 0; t < this.tracks.length; t++) {
        var track = this.tracks[t];
        for(var id in track.automations) {
            var parameters = track.automations[id],
                effect = track.chain.getEffectById(id);
            if(!effect) return;
            for(var parameter in parameters) {
                var automation = parameters[parameter];
                var points = automation.points;
                if(!points.length) continue;
                //Find the current automation point
                var previousPoint = points[0];
                var nextPoint = previousPoint;
                for(var p = 1, length = points.length; p < length; p++) {
                    var point = points[p];
                    if(point.tick > tick) {
                        nextPoint = point;
                        break;
                    }
                    else previousPoint = point;
                }
                //Linearly interpolate then set the value of the parameter
                var differenceValue = nextPoint.value - previousPoint.value,
                    differenceTime = nextPoint.tick - previousPoint.tick, value;
                var elapsed = (tick - previousPoint.tick) / differenceTime;
                if(elapsed < 0) value = previousPoint.value;
                else value = previousPoint.value + differenceValue * elapsed;
                effect.setParameter(parameter, value);
            }
        }
    }
};
