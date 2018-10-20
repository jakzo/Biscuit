//Track object
Biscuit.Track = function(options) {
    var self = this;
    this.multitrack = options.multitrack || null;
    this.channel = options.channel || new Biscuit.Channel(this.chain);
    this.loops = options.loops || [];
    this.presetName = options.presetName || "";
    this.preset = options.preset || null;
    this.activeNotes = {};

    //Create track interface
    this.element = null;

    //Track controls container
    this.controls = document.createElement("DIV");
    this.controls.classList.add("track_controls");
    this.onClick = options.onClick || null;
    var trackClicked = function(e) { if(self.onClick) self.onClick(self); };
    this.controls.addEventListener("mousedown", trackClicked, false);
    if(this.multitrack) {
        this.multitrack.trackControls.appendChild(this.controls);
    }

    //Track name input
    this.name = options.name || "Track";
    this.nameInput = document.createElement("INPUT");
    this.nameInput.type = "text";
    this.nameInput.classList.add("track_name");
    this.nameInput.value = this.name;
    this.nameInput.addEventListener("mousedown", allowLeftClick, false);
    this.nameInput.addEventListener("keydown", allowLeftClick, false);
    this.nameInput.addEventListener("change", function(e) {
        self.setName(this.value);
    }, false);
    this.controls.appendChild(this.nameInput);
    
    //Mute button
    this.muted = options.muted || false;
    this.muteButton = document.createElement("DIV");
    this.muteButton.classList.add("track_mute");
    if(this.muted) this.muteButton.classList.add("track_muted");
    this.muteButton.textContent = "M";
    this.muteButton.addEventListener("mousedown", function(e) {
        self.toggleMuted();
    }, false);
    this.controls.appendChild(this.muteButton);
    
    //Volume slider
    this.volume = options.volume == null ? 1 : options.volume;
    this.volumeSlider = document.createElement("INPUT");
    this.volumeSlider.classList.add("track_volume");
    this.volumeSlider.type = "range";
    this.volumeSlider.min = 0;
    this.volumeSlider.max = 150;
    this.volumeSlider.value = this.volume * 100;
    //TODO: Make my own sliders so I don't need to rely on this
    function allowLeftClick(e) {
        if(!e.button) e.stopPropagation();
    }
    this.volumeSlider.addEventListener("mousedown", allowLeftClick, false);
    //this.volumeSlider.addEventListener("mouseup", allowLeftClick, false);
    this.volumeSlider.addEventListener("change", function(e) {
        self.setVolume(this.value / 100);
    }, false);
    this.controls.appendChild(this.volumeSlider);

    //Track effects chain
    this.chain = options.chain || new EffectsChain({});
    this.chain.track = this;
    this.channel.effectsChain = this.chain;

    //Preset selector
    var bottomRow = document.createElement("DIV");
    var presetButton = document.createElement("SPAN");
    presetButton.classList.add("track_menu");
    presetButton.classList.add("track_presetbutton");
    var items = Preset.getMenuItems();
    var currentItem = { text: "<NONE>", toggle: true };
    items.splice(0, 0, currentItem);
    this.presetMenu = new Menu({
        button: presetButton,
        openClass: "ui_menuopen",
        items: items,
        classPrefix: "ui",
        onItemSelect: function(item) {
            self.preset = item.value;
            //Update the preset selector
            self.presetName = item.text;
            self.presetMenu.setOnlyItemToggled(item);
            //Load the preset in the effects chain
            self.chain.open(self.preset);
        }
    });
    presetButton.textContent = "Sound";
    this.presetMenu.setOnlyItemToggled(currentItem);
    bottomRow.appendChild(presetButton);
    this.controls.appendChild(bottomRow);

    //Automation selector
    var automationButton = document.createElement("SPAN");
    automationButton.classList.add("track_menu");
    automationButton.classList.add("track_automationbutton");
    var currentItem = null;
    function automationClicked(item) {
        self.hideAllAutomations();
        if(item.value) {
            self.showAutomation(item.value.id, item.value.parameter);
            currentItem = item.value;
        }
        else currentItem = null;
    }
    var items = Preset.getMenuItems();
    var hideItem = { text: "HIDE", onClick: automationClicked };
    items.splice(0, 0, hideItem);
    this.automationMenu = new Menu({
        button: automationButton,
        openClass: "ui_menuopen",
        items: items,
        classPrefix: "ui",
        onOpen: function() {
            var items = [ hideItem ];
            var effects = self.chain.effects;
            for(var i = 0; i < effects.length; i++) {
                var effect = effects[i], submenuItems = [];
                var effectItem = {
                    text: effect.displayName,
                    items: submenuItems,
                    toggle: true,
                    toggled: currentItem && effect.id == currentItem.id
                };
                for(var name in effect.parameters) {
                    var parameter = effect.parameters[name];
                    if(parameter.type == "file") continue;
                    submenuItems.push({
                        text: name,
                        toggle: true,
                        value: {
                            id: effect.id,
                            parameter: name,
                            effectItem: effectItem
                        },
                        toggled: currentItem && currentItem.parameter == name,
                        onClick: automationClicked
                    });
                }
                if(submenuItems.length) items.push(effectItem);
            }
            self.automationMenu.setItems(items);
        }
    });
    automationButton.textContent = "Automation";
    this.automationMenu.setOnlyItemToggled(hideItem);
    bottomRow.appendChild(automationButton);

    //Track line
    this.element = document.createElement("DIV");
    this.element.classList.add("track");
    this.element.addEventListener("mousedown", trackClicked, false);
    if(this.multitrack) {
        this.multitrack.lineContainer.appendChild(this.element);
    }

    //Initialise track modules
    this.initAutomation(options);
};

//Generates an amount of audio for the track
Biscuit.Track.prototype.generateAudio = function(audio, sampleCount, offset) {
    //Find the loop we are currently up to
    var offsetEnd = offset + sampleCount;
    for(var l = 0; l < track.loops.length; l++) {
        var loop = track.loops[l];
        if(loop.sampleEnd >= offset) continue;
        if(loop.type == "wave" && loop.samplePosition < offsetEnd) {
            //Copy audio from the loop
            var o = offset, end = Math.min(loop.sampleEnd, offsetEnd),
                audioChannels = Biscuit.createBlankAudioChannels(sampleCount);
            while(o < end) {
                var loopOffset = (o - loop.samplePosition + loop.sampleOffset) %
                    loop.sampleSize;
                var copyEnd = Math.min(end, o + loop.sampleSize - loopOffset);
                var sampleEnd = copyEnd - o + loopOffset;
                for(var c = 0; c < loop.sampleChannels.length; c++) {
                    var sourceChannel = loop.sampleChannels[c],
                        destinationChannel = audioChannels[c % 2],
                        d = o - offset;
                    for(var s = loopOffset; s < sampleEnd; s++) {
                        destinationChannel[d++] = sourceChannel[s];
                    }
                }
                o = copyEnd;
            }
            return audioChannels;
        }
        else return null;
    }
    return null;
};

//Name
Biscuit.Track.prototype.setName = function(name) {
    this.name = name || "";
    this.nameInput.value = this.name;
};

//Muted
Biscuit.Track.prototype.setMuted = function(mute) {
    if(mute) this.muteButton.classList.add("track_muted");
    else this.muteButton.classList.remove("track_muted");
    this.muted = mute;
};
Biscuit.Track.prototype.mute = function() { this.setMuted(true); };
Biscuit.Track.prototype.unmute = function() { this.setMuted(false); };
Biscuit.Track.prototype.toggleMuted = function() {
    this.setMuted(!this.muted);
};

//Volume
Biscuit.Track.prototype.setVolume = function(volume) {
    this.volume = volume;
    this.volumeSlider.value = this.volume * 100;
};

//Removes the track from the multitrack
Biscuit.Track.prototype.remove = function() {
    if(this.controls.parentNode) {
        this.controls.parentNode.removeChild(this.controls);
    }
    if(this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
    }
    if(this.multitrack) {
        var tracks = this.multitrack.tracks;
        for(var t = 0; t < tracks.length; t++) {
            if(tracks[t] == this) {
                tracks.splice(t, 1);
                break;
            }
        }
    }
};

Biscuit.Track.prototype.calculateSampleSizes = function() {
    
};
