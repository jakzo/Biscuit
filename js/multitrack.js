Biscuit.Multitrack = function(settings) {
    var self = this;
    //TODO: Get these variables from project settings
    this.settings = settings;
    this.ticksPerBeat = 480;
    var beatsPerMinute = 120;
    this.timeSignature = {
        numerator: 4,
        denominator: 4
    };
    if(!settings.zoom) settings.zoom = 1;
    if(!settings.sampleRate) settings.sampleRate = 48000;
    this.barSize = 50;
    this.scaledBarSize = this.barSize * settings.zoom;
    var snapsPerBar = 2;
    this.trackHeight = 61;
    this.metaWidth = 150;
    this.rulerHeight = 16;
    this.borderWidthOffset = 4;

    var me = this;
    var beatsPerSecond = beatsPerMinute / 60;
    this.ticksPerSecond = this.ticksPerBeat * beatsPerSecond;
    this.beatsPerBar = this.timeSignature.numerator / this.timeSignature.denominator * 4;
    this.ticksPerBar = this.ticksPerBeat * this.beatsPerBar;
    this.samplesPerTick = settings.sampleRate / me.ticksPerSecond;
    var samplesPerPixel = 0;
    this.multitrackTickSize = 0;
    var tracks = this.tracks = [];
    var loopCount = 0;
    var snapSize = 0;
    var outerContainer = document.getElementById(settings.id);
    me.element = outerContainer;
    
    //Create options bar
    var optionsBar = document.createElement("DIV");
    optionsBar.className = "multitrack_options";
    outerContainer.appendChild(optionsBar);
    
    //Create options
    //Zoom
    function updateLoopPositions() {
        //Loop through every loop
        for(var t = 0; t < tracks.length; t++) {
            var loops = tracks[t].loops;
            for(var l = 0; l < loops.length; l++) loops[l].calculateMetrics();
        }
    }
    var zoomLabel = document.createElement("SPAN");
    zoomLabel.textContent = "Zoom:";
    optionsBar.appendChild(zoomLabel);
    var zoomIn = document.createElement("SPAN");
    zoomIn.textContent = "+";
    zoomIn.className = "zoom";
    zoomIn.addEventListener("click", function(e) {
        settings.zoom *= 2;
        me.scaledBarSize = me.barSize * settings.zoom;
        me.multitrackTickSize = -1;
        updateMultitrackWidth();
        updateLoopPositions();
        me.updateLoopThumbnailSizes();
        me.updateAllMarkers();
        //TODO: Scroll to where we were before
    }, false);
    optionsBar.appendChild(zoomIn);
    var zoomOut = document.createElement("SPAN");
    zoomOut.textContent = "-";
    zoomOut.className = "zoom";
    zoomOut.addEventListener("click", function(e) {
        settings.zoom *= 0.5;
        me.scaledBarSize = me.barSize * settings.zoom;
        me.multitrackTickSize = -1;
        updateMultitrackWidth();
        updateLoopPositions();
        me.updateLoopThumbnailSizes();
        me.updateAllMarkers();
        //TODO: Scroll to where we were before
    }, false);
    optionsBar.appendChild(zoomOut);
    
    //Create ruler
    this.rulerContainer = document.createElement("DIV");
    this.rulerContainer.className = "track_ruler";
    this.rulerContainer.style.top = 0;
    outerContainer.appendChild(this.rulerContainer);
    this.ruler = document.createElement("DIV");
    this.ruler.style.marginLeft = me.metaWidth + "px";
    this.ruler.style.height = "100%";
    this.ruler.style.position = "relative";
    this.rulerContainer.appendChild(this.ruler);
    this.rulerNumbers = document.createElement("DIV");
    this.ruler.appendChild(this.rulerNumbers);

    //Create track container
    this.trackContainer = document.createElement("DIV");
    this.trackContainer.className = "track_container";
    outerContainer.appendChild(this.trackContainer);
    
    //Create container for track controls
    this.controlContainer = document.createElement("DIV");
    this.controlContainer.style.position = "relative";
    this.controlContainer.style.float = "left";
    this.controlContainer.style.zIndex = "1";
    this.controlContainer.style.overflow = "hidden";
    this.controlContainer.style.height = "100%";
    this.controlContainer.style.width = this.metaWidth + "px";
    //this.controlContainer.addEventListener("dblclick", stopPropagation, false);
    this.trackControls = document.createElement("DIV");
    this.trackControls.style.position = "absolute";
    this.controlContainer.appendChild(this.trackControls);
    this.trackContainer.appendChild(this.controlContainer);
    
    //Create track line container
    this.trackScroller = document.createElement("DIV");
    this.trackScroller.style.height = "calc(100% - 64px)";
    this.trackScroller.style.overflow = "auto";
    this.trackScroller.style.position = "relative";
    this.trackContainer.appendChild(this.trackScroller);

    //Create beat lines
    var rulerBeatCanvas = document.createElement("canvas"),
        trackBeatCanvas = document.createElement("canvas");
    trackBeatCanvas.height = 1;
    var rulerBeatContext = rulerBeatCanvas.getContext("2d"),
        trackBeatContext = trackBeatCanvas.getContext("2d");
    function drawBeatLines() {
        //Reset and clear canvasses
        trackBeatCanvas.width = rulerBeatCanvas.width = me.scaledBarSize;
        rulerBeatCanvas.height = me.rulerHeight;
        rulerBeatContext.clearRect(0, 0, me.scaledBarSize, me.rulerHeight);
        trackBeatContext.clearRect(0, 0, me.scaledBarSize, 1);
        rulerBeatContext.lineWidth = trackBeatContext.lineWidth = 1;
        snapSize = me.scaledBarSize / snapsPerBar;
        //Draw the bar and snap lines
        //TODO: Only redraw beat lines on zoom...
        for(var l = 0; l < snapsPerBar; l++) {
            var isBarLine = !(l % snapsPerBar);
            var x = l * snapSize,
                y = me.rulerHeight * (isBarLine ? 0.25 : 0.5);
            rulerBeatContext.beginPath();
            rulerBeatContext.moveTo(x, y);
            rulerBeatContext.lineTo(x, me.rulerHeight);
            rulerBeatContext.strokeStyle = isBarLine ? "#666" : "#999";
            rulerBeatContext.stroke();
            trackBeatContext.beginPath();
            trackBeatContext.moveTo(x, 0);
            trackBeatContext.lineTo(x, 1);
            trackBeatContext.strokeStyle = isBarLine ? "#fff" : "#999";
            trackBeatContext.stroke();
        }
        //Set the drawn beat lines as the background images
        var rulerBackground = "url(" + rulerBeatCanvas.toDataURL() + ")";
        me.ruler.style.backgroundImage = rulerBackground;
        var trackBackground = "url(" + trackBeatCanvas.toDataURL() + ")";
        me.lineContainer.style.backgroundImage = trackBackground;
        //Remove old bar numbers
        while(me.rulerNumbers.firstChild) {
            me.rulerNumbers.removeChild(me.rulerNumbers.firstChild);
        }
        //Add new bar numbers
        //TODO: Add only visible bar numbers and update on scroll...
        var barNumberSpacing = 50;
        var totalBars = Math.floor(me.trackWidth / me.scaledBarSize),
            barsPerNumber = Math.floor(barNumberSpacing / me.scaledBarSize);
        if(barsPerNumber < 1) barsPerNumber = 1;
        for(var b = 0; b <= totalBars; b += barsPerNumber) {
            var barNumber = document.createElement("DIV");
            barNumber.textContent = b + 1;
            barNumber.className = "track_barnumber";
            barNumber.style.left = b * me.scaledBarSize + "px";
            me.rulerNumbers.appendChild(barNumber);
        }
    }

    //Add container for track lines
    this.lineContainer = document.createElement("DIV");
    this.trackScroller.appendChild(this.lineContainer);

    //Scroll all elements together
    var controlContainerHasShadow = false;
    function scrollElements() {
        var left = self.trackScroller.scrollLeft,
            top = self.trackScroller.scrollTop;
        me.ruler.style.left = -left + "px";
        me.trackControls.style.top = -top + "px";
        //Display track control shadow when scrolled
        if(left && !controlContainerHasShadow) {
            me.controlContainer.style.boxShadow = "18px 0 18px -18px #333";
            controlContainerHasShadow = true;
        }
        else if(!left && controlContainerHasShadow) {
            me.controlContainer.style.boxShadow = "";
            controlContainerHasShadow = false;
        }
    }
    this.trackScroller.addEventListener("scroll", scrollElements, false);
    
    //Create lower control bar
    var lowerControls = document.createElement("DIV");
    lowerControls.id = "control_bar";
    outerContainer.appendChild(lowerControls);
    var controlBar = document.createElement("DIV");
    controlBar.className = "multitrack_controlcontainer";
    lowerControls.appendChild(controlBar);
    //Add track control buttons
    var playButton = this.playButton = document.createElement("DIV");
    playButton.className = "multitrack_play";
    playButton.textContent = String.fromCharCode(9654);
    playButton.addEventListener("mousedown", function(e) {
        me.play();
    }, false);
    controlBar.appendChild(playButton);
    var stopButton = document.createElement("DIV");
    stopButton.className = "multitrack_stop";
    stopButton.textContent = String.fromCharCode(9632);
    stopButton.addEventListener("mousedown", function(e) {
        me.stop();
    }, false);
    controlBar.appendChild(stopButton);
    //Add track time display
    var timeDisplay = document.createElement("DIV");
    timeDisplay.className = "multitrack_timedisplay";
    var timeLabel = document.createElement("SPAN");
    timeLabel.textContent = "Time: ";
    timeDisplay.appendChild(timeLabel);
    var timeSpan = this.timeSpan = document.createElement("SPAN");
    timeSpan.className = "multitrack_displayspan";
    timeSpan.textContent = "00:00:00.00";
    timeDisplay.appendChild(timeSpan);
    var barLabel = document.createElement("SPAN");
    barLabel.textContent = " Bar: ";
    timeDisplay.appendChild(barLabel);
    var barSpan = this.barSpan = document.createElement("SPAN");
    barSpan.className = "multitrack_displayspan";
    barSpan.textContent = "1.1";
    timeDisplay.appendChild(barSpan);
    controlBar.appendChild(timeDisplay);
    
    //Track interface handlers
    function stopEvent(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    function stopPropagation(e) {
        e.stopPropagation();
    }
    this.currentTrack = null;
    function openTrack(track) {
        closeTrack();
        me.currentTrack = track;
        track.element.classList.add("track_selected");
        track.controls.classList.add("meta_selected");
        if(settings.onTrackOpen) {
            settings.onTrackOpen(track);
        }
    }
    function closeTrack() {
        if(!me.currentTrack) return;
        me.currentTrack.element.classList.remove("track_selected");
        me.currentTrack.controls.classList.remove("meta_selected");
        me.currentTrack = null;
    }
    var currentLoopElement = null;
    function openLoop(loop) {
        closeLoop();
        currentLoopElement = loop.element;
        //Open the track also
        openTrack(loop.track);
        //Open the loop in the loop editor
        if(settings.onLoopOpen) {
            settings.onLoopOpen(loop);
            loop.element.classList.add("loop_selected");
        }
    }
    function closeLoop() {
        if(!currentLoopElement) return;
        currentLoopElement.classList.remove("loop_selected");
        if(settings.onLoopClose) settings.onLoopClose();
        currentLoopElement = null;
    }
    
    //Create the snap marker
    var snapMarkerPosition = null;
    var snapMarker = document.createElement("DIV");
    snapMarker.className = "multitrack_snapmarker";
    function showSnapMarker(trackDiv, x) {
        if(snapMarkerPosition == x) return;
        if(snapMarker.parentNode != trackDiv) hideSnapMarker();
        snapMarker.style.left = x + "px";
        snapMarkerPosition = x;
        trackDiv.appendChild(snapMarker);
    }
    function hideSnapMarker() {
        if(snapMarker.parentNode) {
            snapMarker.parentNode.removeChild(snapMarker);
        }
        snapMarkerPosition = null;
    }
    
    //Handles loop mouse interaction
    var currentLoop = null;
    var loopMouseStart = null;
    var loopEdgeSize = 10;
    function loopMouseDown(e) {
        currentLoop = this.loop;
        openLoop(currentLoop);
        loopMouseStart = {
            x: e.screenX,
            y: e.screenY
        };
        if(this.cursorOverSide) loopResizeDown();
        else loopDragStart();
    }
    function loopMouseOver(e) {
        this.rightEdge = this.offsetWidth - loopEdgeSize;
        loopCheckResizeArea(this, e.layerX);
    }
    function loopMouseMove(e) { loopCheckResizeArea(this, e.layerX); }
    function loopMouseOut(e) { loopResizeAreaExited(this); }
    
    //Use the resize cursor when the cursor is over an edge
    function loopCheckResizeArea(element, x) {
        //Check if the cursor is over a side
        if(x < loopEdgeSize) {
            if(element.cursorOverSide != "left") {
                loopResizeAreaEntered(element, "left");
            }
        }
        else if(x > element.rightEdge) {
            if(element.cursorOverSide != "right") {
                loopResizeAreaEntered(element, "right");
            }
        }
        else loopResizeAreaExited(element);
    }
    function loopResizeAreaEntered(element, side) {
        element.cursorOverSide = side;
        element.classList.add("resizing_side");
    }
    function loopResizeAreaExited(element) {
        element.cursorOverSide = null;
        element.classList.remove("resizing_side");
    }
    
    //Handles loop resizing
    var loopResize = null;
    function loopResizeDown() {
        //Create the boundaries of the resizing
        var side = currentLoop.element.cursorOverSide;
        var leftSnap, rightSnap;
        var tick = currentLoop.tickPosition;
        var endTick = tick + currentLoop.loopedTickSize;
        var startBar = (tick + 1) / me.ticksPerBar;
        if(side == "right") leftSnap = Math.ceil(startBar * snapsPerBar);
        else rightSnap = ticksToSnaps(endTick - 1);
        var loops = currentLoop.track.loops;
        var nextLoop = null;
        for(var i = 0; i < loops.length; i++) {
            if(loops[i] == currentLoop) {
                if(side == "right") nextLoop = loops[i + 1];
                else nextLoop = loops[i - 1];
                break;
            }
        }
        if(nextLoop) {
            if(side == "left") {
                var leftTick = nextLoop.tickPosition + nextLoop.loopedTickSize;
                leftSnap = ticksToSnaps(leftTick);
            }
            else rightSnap = ticksToSnaps(nextLoop.tickPosition);
        }
        else if(side == "left") leftSnap = 0;
        else rightSnap = Infinity;
        var offset = currentLoop.tickOffset;
        loopResize = {
            side: side,
            leftSnap: leftSnap,
            rightSnap: rightSnap,
            startX: ticksToPixels(tick),
            endX: ticksToPixels(endTick),
            tick: tick,
            tickSize: currentLoop.loopedTickSize,
            endTick: endTick,
            tickMinusOffset: tick + currentLoop.tickSize - offset,
            offset: offset
        };
        //Start the resizing process
        document.body.classList.add("resizing_side");
        window.addEventListener("mousemove", loopResizeMove, true);
        window.addEventListener("mouseup", loopResizeUp, true);
    }
    function loopResizeMove(e) {
        //Get pixel position of the mouse
        var relativeX = e.screenX - loopMouseStart.x;
        var side = loopResize.side;
        var startPoint = side == "left" ?
            loopResize.startX : loopResize.endX;
        var unsnappedX = startPoint + relativeX;
        //Convert it to snaps and keep it in bounds
        var snaps = pixelsToSnaps(unsnappedX);
        if(snaps > loopResize.rightSnap) snaps = loopResize.rightSnap;
        else if(snaps < loopResize.leftSnap) snaps = loopResize.leftSnap;
        //Resize the loop element
        var width = -me.borderWidthOffset, x;
        var tick = snapsToTicks(snaps);
        //Limit resize to loop size if it is not loopable
        if(!currentLoop.loopable) {
            if(side == "right") {
                var maxTick = loopResize.tick + currentLoop.tickSize;
                if(tick > maxTick) tick = maxTick;
            }
            else if(side == "left") {
                var minTick = currentLoop.tickPosition - currentLoop.tickOffset;
                if(tick < minTick) tick = minTick;
            }
            x = ticksToPixels(tick);
        }
        else x = snapsToPixels(snaps);
        if(side == "left") {
            loopResize.tick = tick;
            loopResize.tickSize = loopResize.endTick - tick;
            currentLoop.element.style.left = x + "px";
            width += loopResize.endX - x;
            //Calculate the loop start offset
            var size = currentLoop.tickSize;
            var offset = (size - (loopResize.tickMinusOffset - tick)) % size;
            if(offset < 0) offset += size;
            loopResize.offset = offset;
            currentLoop.setThumbnailOffset(offset);
        }
        else {
            loopResize.tickSize = tick - loopResize.tick;
            width += x - loopResize.startX;
        }
        currentLoop.element.style.width = width + "px";
    }
    function loopResizeUp(e) {
        //Update the loop size and position
        currentLoop.tickPosition = loopResize.tick;
        currentLoop.loopedTickSize = loopResize.tickSize;
        currentLoop.tickOffset = loopResize.offset;
        currentLoop.sizeLocked = false;
        currentLoop.calculateSampleSizes();
        //Reset the state
        document.body.classList.remove("resizing_side");
        loopMouseStart = currentLoop = loopResizeStart = null;
        window.removeEventListener("mousemove", loopResizeMove, true);
        window.removeEventListener("mouseup", loopResizeUp, true);
        updateMultitrackWidth();
    }
    
    //Handles loop dragging
    var loopCurrentPosition = null;
    var loopOriginalPosition = null;
    function loopDragStart() {
        //Find track number
        var t = -1;
        while(tracks[++t] != currentLoop.track) {}
        //Get original loop position
        var x = currentLoop.tickPosition / me.ticksPerBar * me.scaledBarSize;
        var y = t * me.trackHeight + me.trackHeight / 2;
        var snapSize = me.barSize / snapsPerBar;
        loopCurrentPosition = { x: x, trackNumber: t };
        loopOriginalPosition = { x: x + snapSize / 2, y: y };
        //Start the dragging process
        document.body.classList.add("grabbing");
        window.addEventListener("mousemove", loopDragged, true);
        window.addEventListener("mouseup", loopDropped, true);
        currentLoop.element.classList.add("multitrack_loopdragging");
    }
    function loopDragged(e) {
        //Get the pixel position of the loop
        var relativeX = e.screenX - loopMouseStart.x;
        var relativeY = e.screenY - loopMouseStart.y;
        var unsnappedX = loopOriginalPosition.x + relativeX;
        var unsnappedY = loopOriginalPosition.y + relativeY;
        //Put the loop inside the correct track
        var trackNumber = Math.floor(unsnappedY / me.trackHeight);
        if(trackNumber >= tracks.length) trackNumber = tracks.length - 1;
        if(trackNumber <= 0) trackNumber = 0;
        if(trackNumber != loopCurrentPosition.trackNumber) {
            currentLoop.element.parentNode.removeChild(currentLoop.element);
            var track = tracks[trackNumber];
            track.element.appendChild(currentLoop.element);
            loopCurrentPosition.trackNumber = trackNumber;
        }
        //Find the snapped pixel position to move to
        var x = Math.max(getSnappedPixelPosition(unsnappedX), 0);
        if(x != loopCurrentPosition.x) {
            currentLoop.element.style.left = x + "px";
            loopCurrentPosition.x = x;
        }
    }
    function loopDropped(e) {
        //Get the tick position
        var tick = getSnappedTickPosition(loopCurrentPosition.x);
        //Find the place to add the loop in the track
        var tickEnd = tick + currentLoop.loopedTickSize;
        var track = tracks[loopCurrentPosition.trackNumber];
        var loops = track.loops;
        var fail = false, push = true;
        for(var l = 0; l < loops.length; l++) {
            var loop = loops[l];
            //Ignore the loop that we have moved
            if(loop == currentLoop) continue;
            //If the next loop is after the end of ours, insert it here
            if(loop.tickPosition >= tickEnd) {
                loops.splice(l, 0, currentLoop);
                push = false;
                break;
            }
            //If the next loop intersects ours, cancel
            if(loop.tickPosition + loop.loopedTickSize > tick) {
                //Move the element back to the original spot
                loopDragged({
                    screenX: loopMouseStart.x,
                    screenY: loopMouseStart.y
                });
                fail = true;
                push = false;
                break;
            }
        }
        if(push) loops.push(currentLoop);
        if(!fail) {
            //Reset the track's audio if this loop is currently playing
            if(currentLoop.track.loopPlaying == currentLoop) {
                track.channel.reset();
            }
            //Remove the loop from the previous location
            if(track != currentLoop.track) {
                var oldLoops = currentLoop.track.loops;
                for(var i = 0; i < oldLoops.length; i++) {
                    if(oldLoops[i] == currentLoop) {
                        oldLoops.splice(i, 1);
                        break;
                    }
                }
            }
            else for(var i = 0; i < loops.length; i++) {
                //If it is the same loop but not the one we placed
                if(loops[i] == currentLoop && i != l) {
                    loops.splice(i, 1);
                    break;
                }
            }
            //Update the track and loop variables
            currentLoop.tickPosition = tick;
            currentLoop.samplePosition = ticksToSamples(tick);
            currentLoop.sampleEnd =
                currentLoop.samplePosition + currentLoop.loopedSampleSize;
            currentLoop.track = track;
            openTrack(track);
        }
        //Reset the state
        currentLoop.element.classList.remove("multitrack_loopdragging");
        loopMouseStart = loopCurrentPosition =
            loopOriginalPosition = currentLoop = null;
        document.body.classList.remove("grabbing");
        window.removeEventListener("mousemove", loopDragged, true);
        window.removeEventListener("mouseup", loopDropped, true);
        updateMultitrackWidth();
    }
    
    //Creates the DOM element for the loop
    //TODO: Add this to the Track prototype...
    this.addLoopToTrack = function(loop, track) {
        //Add the loop to the track
        var previousEnd = 0;
        for(var i = 0; i < track.loops.length; i++) {
            var currentLoop = track.loops[i];
            var position = currentLoop.tickPosition;
            if(position > loop.tickPosition) {
                //Do not add loop if it will intersect
                if(position < loop.tickPosition + loop.loopedTickSize ||
                        previousEnd > loop.tickPosition) {
                    return false;
                }
                break;
            }
            else if(position + currentLoop.loopedTickSize > loop.tickPosition) {
                return false;
            }
            previousEnd = position + currentLoop.loopedTickSize;
        }
        track.loops.splice(i, 0, loop);
        //Update the multitrack length if we need to
        updateMultitrackWidth();
        //Create loop element
        var element = document.createElement("DIV");
        element.className = "multitrack_loop";
        loop.element = element;
        loop.track = track;
        loop.calculateMetrics();
        element.loop = loop;
        element.cursorOverSide = null;
        element.addEventListener("mousedown", loopMouseDown, false);
        element.addEventListener("mouseover", loopMouseOver, false);
        element.addEventListener("mousemove", loopMouseMove, false);
        element.addEventListener("mouseout", loopMouseOut, false);
        //Stop double clicking on a loop from creating a new loop
        element.addEventListener("dblclick", stopPropagation, false);
        track.element.appendChild(element);
        //Create loop label
        var label = document.createElement("DIV");
        label.className = "multitrack_looplabel";
        label.textContent = loop.name;
        element.appendChild(label);
        loop.generateThumbnail();
        loopCount++;
        return true;
    }
    
    //Double click to create a new loop
    function createLoop(x, y) {
        //Get the track
        var trackNumber = Math.floor(y / me.trackHeight);
        var track = tracks[trackNumber];
        if(!track) return;
        //Create loop object
        var loop = new Biscuit.Loop({
            multitrack: me,
            track: track,
            type: "midi",
            name: "Loop " + (loopCount + 1),
            tickSize: me.ticksPerBar,
            tickPosition: getSnappedTickPosition(x)
        });
        var added = me.addLoopToTrack(loop, track);
        if(added) openLoop(loop);
    }
    this.trackScroller.addEventListener("dblclick", function(e) {
        var x = e.layerX;
        var y = e.layerY + e.target.offsetTop - 16;
        createLoop(x, y);
    }, false);
    addLongTapEventListener(this.trackScroller, function(e) {
        //Get relative position of touch
        var containerPosition = Biscuit.getPositionOf(self.trackScroller);
        var x = e.clientX - containerPosition.x;
        var y = e.clientY - containerPosition.y - 16;
        createLoop(x, y);
    });
    
    //Handle file drop (importing WAVE file)
    var dropPosition = 0, dragTrack = 0;
    function fileDropped(e) {
        stopEvent(e);
        //Calculate the tick position and track to add the loop at
        var y = e.layerY + e.target.offsetTop - self.rulerHeight;
        dragTrack = Math.floor(y / me.trackHeight);
        dropPosition = getSnappedTickPosition(e.layerX);
        //Load the file
        var file = e.dataTransfer.files[0];
        if(!file) return;
        loadFile(file, droppedFileLoaded);
    }
    function droppedFileLoaded(file) {
        hideSnapMarker();
        var waveFile = Wave.import(file, waveFileDecoded);
    }
    function waveFileDecoded(wave) {
        me.createWaveLoop({
            name: wave.headers.name,
            sampleChannels: wave.data,
            sampleRate: wave.headers.sampleRate,
            tickPosition: dropPosition,
            track: tracks[dragTrack]
        });
    }
    function fileOver(e) {
        stopEvent(e);
        e.dataTransfer.dropEffect = "copy";
        //Show the snap marker
        var position = Biscuit.getPositionOf(
            e.target, this.trackScroller, e.layerX, e.layerY);
        var snaps = Math.floor(position.x / snapSize);
        var x = snaps * snapSize;
        var trackNumber =
            Math.floor((position.y - self.rulerHeight) / me.trackHeight);
        var track = tracks[trackNumber];
        if(track) showSnapMarker(track.element, x);
        else hideSnapMarker();
    }
    this.trackScroller.addEventListener("drop", fileDropped, false);
    this.trackScroller.addEventListener("dragover", fileOver, false);
    this.trackScroller.addEventListener("dragleave", hideSnapMarker, false);
    this.trackScroller.addEventListener("dragend", hideSnapMarker, false);
    //TODO: Handle dragging onto child elements
    
    //Calculates the width based on the final loop and updates if necessary
    function updateMultitrackWidth() {
        //Find the tick position of the end of the last loop
        var finalTick = 0;
        for(var i = 0; i < tracks.length; i++) {
            var trackLoops = tracks[i].loops;
            if(!trackLoops.length) continue;
            var lastTrackLoop = trackLoops[trackLoops.length - 1];
            var endTick = lastTrackLoop.tickPosition + lastTrackLoop.loopedTickSize;
            if(endTick > finalTick) finalTick = endTick;
        }
        //If it's changed, we must resize
        if(finalTick != me.multitrackTickSize) {
            me.multitrackTickSize = finalTick;
            var loopWidth = me.scaledBarSize / me.ticksPerBar * finalTick;
            var containerWidth = outerContainer.clientWidth - me.metaWidth;
            var extraSpacing = containerWidth * 0.9;
            me.trackWidth = Math.max(loopWidth + extraSpacing, containerWidth);
            me.ruler.style.width = me.lineContainer.style.width =
                me.trackWidth + "px";
            drawBeatLines();
        }
        //Update the global position variables
        me.samplesPerTick = settings.sampleRate / me.ticksPerSecond;
        var pixelsPerBeat = me.scaledBarSize / me.beatsPerBar;
        var pixelsPerSecond = beatsPerMinute / 60 * pixelsPerBeat;
        samplesPerPixel = settings.sampleRate / pixelsPerSecond;
    }
    window.addEventListener("resize", function(e) {
        me.multitrackTickSize = -1;
        updateMultitrackWidth();
    }, false);
    
    function trackClicked(track) {
        if(me.currentTrack == track) return;
        closeLoop();
        openTrack(track);
    }
    this.newTrack = function(options) {
        //Create track based on options passed in and defaults
        options = options || {};
        options.multitrack = me;
        options.name = options.name || "Track " + (tracks.length + 1);
        options.onClick = trackClicked;
        var track = new Biscuit.Track(options);
        tracks.push(track);
    };
    
    //API functions
    this.updateCurrentLoop = function() {
        if(currentLoopElement) currentLoopElement.loop.generateThumbnail();
    };
    this.loopResized = function(tickSize) {
        if(currentLoopElement) {
            var loop = currentLoopElement.loop;
            //Keep the loop offset the same distance from the end
            if(loop.tickOffset) {
                loop.tickOffset += tickSize - loop.tickSize;
                if(loop.tickOffset < 0) loop.tickOffset = 0;
            }
            loop.tickSize = tickSize;
            //Resize the loop element if the size is still locked
            if(loop.sizeLocked) {
                loop.loopedTickSize = tickSize;
                var width = tickSize / me.ticksPerBar * me.scaledBarSize - 4;
                currentLoopElement.style.width = width + "px";
                updateMultitrackWidth();
            }
            loop.calculateSampleSizes();
            loop.generateThumbnail();
        }
    };
    this.createWaveLoop = function(settings) {
        //Create loop object
        var sampleCount = settings.sampleChannels[0].length;
        var secondSize = sampleCount / settings.sampleRate;
        var loop = new Biscuit.Loop({
            multitrack: me,
            type: "wave",
            name: settings.name || ("Wave " + (loopCount + 1)),
            sampleChannels: settings.sampleChannels,
            sampleRate: settings.sampleRate,
            tickSize: Math.ceil(secondSize * me.ticksPerSecond),
            loopable: false,
            sizeLocked: true,
            tickPosition: settings.tickPosition
        });
        var track = settings.track || tracks[0];
        var added = me.addLoopToTrack(loop, track);
        if(added) openLoop(loop);
    };
    //Helper functions
    function snapsToPixels(snaps) {
        return snaps / snapsPerBar * me.scaledBarSize;
    }
    function snapsToTicks(snaps) {
        return snaps / snapsPerBar * me.ticksPerBar;
    }
    function ticksToSnaps(ticks) {
        return Math.floor(ticks / me.ticksPerBar * snapsPerBar);
    }
    function ticksToPixels(ticks) {
        return ticks / me.ticksPerBar * me.scaledBarSize;
    }
    function ticksToSamples(ticks) {
        return Math.round(ticks * me.samplesPerTick);
    }
    function samplesToTicks(samples) {
        return Math.round(samples / me.samplesPerTick);
    }
    function samplesToPixels(samples) {
        return samples / samplesPerPixel;
    }
    function pixelsToSnaps(x, snapToNearest) {
        return (snapToNearest ? Math.round : Math.floor)(x / snapSize);
    }
    function pixelsToSamples(pixels) {
        return pixels * samplesPerPixel;
    }
    function pixelsToTicks(pixels) {
        return Math.round(pixels / me.scaledBarSize * me.ticksPerBar);
    }
    this.snapsToPixels = snapsToPixels;
    this.snapsToTicks = snapsToTicks;
    this.ticksToSnaps = ticksToSnaps;
    this.ticksToPixels = ticksToPixels;
    this.ticksToSamples = ticksToSamples;
    this.samplesToTicks = samplesToTicks;
    this.samplesToPixels = samplesToPixels;
    this.pixelsToSnaps = pixelsToSnaps;
    this.pixelsToSamples = pixelsToSamples;
    this.pixelsToTicks = pixelsToTicks;
    //Returns the pixel position of the nearest snap point
    function getSnappedPixelPosition(x) {
        return snapsToPixels(pixelsToSnaps(x));
    }
    //Returns the tick position of the nearest snap point
    function getSnappedTickPosition(x, snapToNearest) {
        return snapsToTicks(pixelsToSnaps(x, snapToNearest));
    }
    this.getSnappedTickPosition = getSnappedTickPosition;
    //Removes a loop from the multitrack editor
    function removeLoop(loop) {
        var loops = loop.track.loops;
        for(var i = 0; i < loops.length; i++) {
            if(loops[i] == loop) {
                loops.splice(i, 1);
                break;
            }
        }
        loop.element.parentNode.removeChild(loop.element);
    }
    
    //Copy and paste functionality
    var clipboard = null;
    
    //API functions
    this.onKeyDown = function(e) {
        //Delete
        if(e.keyCode == 46) {
            if(currentLoopElement) {
                var loop = currentLoopElement.loop;
                closeLoop();
                removeLoop(loop);
            }
        }
    };
    this.onCopy = function() {
        if(!currentLoopElement) return null;
        var loop = currentLoopElement.loop.clone();
        return { data: loop, type: "loop" };
    };
    this.onPaste = function(clipboard) {
        if(!me.currentTrack || clipboard.type != "loop") return;
        //Clone the copied loop
        var loop = clipboard.data.clone();
        loop.multitrack = me;
        //Update the position to the cursor
        loop.tickPosition = 0;
        loop.calculateSampleSizes();
        //Add the cloned loop to the track
        me.addLoopToTrack(loop, me.currentTrack);
        if(loop.element) openLoop(loop);
    };
    this.reset = function() {
        closeLoop();
        closeTrack();
        while(tracks.length) tracks[0].remove();
        settings.zoom = 1;
    };
    
    //Reloads preset menus
    this.onPresetChange = function(changedPreset) {
        for(var t = 0; t < tracks.length; t++) {
            var track = tracks[t];
            track.chain.reloadPresetMenu();
            var presetMenu = track.presetMenu;
            var preset = track.preset;
            var items = Preset.getMenuItems();
            items.splice(0, 0, { text: "<NONE>", toggle: true });
            presetMenu.setItems(items);
            for(var i = 0; i < items.length; i++) {
                var item = items[i];
                if(item.value == preset) {
                    presetMenu.setItemToggle(item, true);
                    presetMenu.settings.button.textContent = item.text;
                    break;
                }
            }
        }
    };
    
    //Initialise multitrack modules
    this.initMarker();
    this.initPlay();
};
//Updates the thumbnail size of every loop (usually after zooming...)
Biscuit.Multitrack.prototype.updateLoopThumbnailSizes = function() {
    var suffix = "px " + (this.trackHeight - this.borderWidthOffset) + "px";
    for(var t = 0; t < this.tracks.length; t++) {
        var loops = this.tracks[t].loops;
        for(var l = 0; l < loops.length; l++) {
            var loop = loops[l];
            var pixelSize = loop.tickSize / this.ticksPerBar * this.barSize;
            var backgroundSize = (pixelSize * this.settings.zoom) + suffix;
            loop.element.style.backgroundSize = backgroundSize;
            loop.setThumbnailOffset(loop.tickOffset);
        }
    }
};
