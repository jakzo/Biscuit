//TODO: Set these in Biscuit or somewhere else global
var DEFAULT_TICKS_PER_BEAT = 480;
var KEY_HEIGHT = 12;
var NOTE_BAR_BORDER_OFFSET = 2;

if(!Biscuit) Biscuit = {};

//Creates piano roll composer
//TODO: Go through and change everything to time signatures
//TODO: Change element variables to element.(variable)
//TODO: Prefix all CSS class names with 'pianoroll_'
Biscuit.PianoRoll = function(settings) {
    var me = this;
    
    //Get default settings
    function getSettings(newSettings) {
        //Defaults (commented settings must be set programatically)
        var defaultSettings = {
            disabled: false,
            timeSignature: {
                numerator: 4,
                denominator: 4
            },
            //snap: timeSignature.numerator,
            //maxSnap: Math.max(snap, 64),
            zoom: 1,
            maxScrollSpeed: 30,
            // Whenever we're talking about MIDI timing:
            // beatsPerMinute = quarter notes per minute
            // ticksPerBeat = ticks per quarter note
            // 
            // ...but in the interface/musical sense:
            // 1 beat = 1 / timeSignature.denominator
            ticksPerBeat: DEFAULT_TICKS_PER_BEAT,
            //tickSize: ticksPerBeat / 4,
            highestNote: 105,
            lowestNote: 21,
            instrumentInstance: null
        };
        //Reset settings variable
        me.settings = settings = newSettings || {};
        //Set every unset default setting
        for(var key in defaultSettings) {
            if(settings[key] === undefined) {
                settings[key] = defaultSettings[key];
            }
        }
        //Check settings that must be set programatically
        if(!settings.timeSignature.denominator) {
            settings.timeSignature.denominator = 4;
        }
        if(!settings.timeSignature.numerator) {
            settings.timeSignature.numerator = settings.timeSignature.denominator;
        }
        if(!settings.snap) settings.snap = settings.timeSignature.numerator;
        if(!settings.maxSnap) settings.maxSnap = Math.max(settings.snap, 64);
        if(!settings.tickSize) settings.tickSize = settings.ticksPerBeat / 4;
        //Set the new channel
        if(!settings.channel) settings.channel = new Biscuit.Channel();
    }
    getSettings(settings);
    //TODO: More structured way of setting defaults
    //TODO: Set settings as object properties
    
    //Global variables used throughout the piano roll code
    //TODO: Change global variables to object properties
    // Audio channel for composed note playback
    var composerChannel = settings.channel;
    var elements = {};              // DOM interface elements
    var quartersPerBar = settings.timeSignature.numerator / settings.timeSignature.denominator * 4;
    var ticksPerBar = settings.ticksPerBeat * quartersPerBar; // The number of ticks in a bar
    var noteSize = ticksPerBar / settings.snap; // Size of note in ticks to be placed on click
    var beatSize = 0;               // The size of a single (musical) beat in pixels
    var snapSize = 0;               // The distance between snap points in pixels
    var resizeSnaps = 0;            // The number of snap lines to resize the loop to on mouse up
    var borderWidthOffset = 2;      // The number of pixels a note bar border takes up
    
    //Create interface containers
    if(settings.id) elements.container = document.getElementById(this.settings.id);
    else elements.container = document.createElement("DIV");
    me.element = elements.container;
    elements.container.className = "composer";
    //Control bar
    elements.controls = document.createElement("DIV");
    elements.controls.className = "controls";
    elements.container.appendChild(elements.controls);
    //Ruler
    elements.ruler = document.createElement("DIV");
    elements.ruler.className = "ruler";
    elements.container.appendChild(elements.ruler);
    //Piano roll container
    elements.editor = document.createElement("DIV");
    elements.editor.className = "editor";
    elements.container.appendChild(elements.editor);
    //Piano roll overflow container
    elements.overflow = document.createElement("DIV");
    elements.overflow.className = "overflow";
    elements.editor.appendChild(elements.overflow);
    //Piano roll keyboard
    elements.pianoRoll = document.createElement("DIV");
    elements.pianoRoll.className = "piano_roll";
    elements.overflow.appendChild(elements.pianoRoll);
    //Scroll bar container
    elements.scrollContainer = document.createElement("DIV");
    elements.scrollContainer.className = "scroll_container";
    elements.editor.appendChild(elements.scrollContainer);
    //Route scroll events to the scroll container
    //TODO: Route so that Firefox acts properly...
    function routeToScrollContainer(e) {
        lastScrollTop = elements.scrollContainer.scrollTop;
        elements.scrollContainer.scrollLeft += e.deltaX;
        elements.scrollContainer.scrollTop += e.deltaY;
    }
    elements.container.addEventListener("wheel", routeToScrollContainer, false);
    //Note drawing area container
    elements.drawArea = document.createElement("DIV");
    elements.drawArea.className = "draw_area";
    elements.scrollContainer.appendChild(elements.drawArea);
    //Beat line container
    elements.snapLines = document.createElement("DIV");
    elements.snapLines.className = "beat_lines";
    elements.drawArea.appendChild(elements.snapLines);
    //Ruler beat line container
    elements.rulerSnapLines = document.createElement("DIV");
    elements.rulerSnapLines.className = "ruler_beatlines";
    elements.ruler.appendChild(elements.rulerSnapLines);
    //Note bar container
    elements.noteBars = document.createElement("DIV");
    elements.noteBars.className = "note_bars";
    elements.drawArea.appendChild(elements.noteBars);
    //Transparent overlay to catch all click events with correct offsets
    elements.overlay = document.createElement("DIV");
    elements.overlay.className = "line_cover";
    elements.drawArea.appendChild(elements.overlay);
    
    //Create interface controls
    function allowLeftClick(e) {
        //If left button clicked, stop the event from bubbling
        //to the UI and having the default action cancelled
        if(!e.button) e.stopPropagation();
    }
    //Note size
    elements.noteSizeButton = document.createElement("SPAN");
    elements.noteSizeButton.className = "ui_menubutton";
    elements.controls.appendChild(elements.noteSizeButton);
    var items = [];
    function makeSizeOptions(factor) {
        //Make size options
        while(factor <= settings.maxSnap) {
            items.push({
                toggle: true,
                text: "1 / " + factor,
                value: factor
            });
            factor *= 2;
        }
    }
    makeSizeOptions(1);     //Normal size values
    items.push({ type: "divider" });
    makeSizeOptions(3);     //Triplet size values
    
    var noteSizeMenu = new Menu({
        button: elements.noteSizeButton,
        openClass: "ui_menuopen",
        openUpwards: true,
        items: items,
        classPrefix: "ui",
        onItemSelect: function(item) {
            noteSize = ticksPerBar / item.value;
            elements.noteSizeButton.textContent = "Draw " + item.text + " Note";
            var items = noteSizeMenu.settings.items;
            for(var i = 0; i < items.length; i++) {
                noteSizeMenu.setItemToggle(items[i], false);
            }
            noteSizeMenu.setItemToggle(item, true);
        }
    });
    elements.noteSizeButton.textContent = "Draw 1 / 4 Note";
    noteSizeMenu.setItemToggle(noteSizeMenu.settings.items[2], true);
    
    //Snap
    //TODO: Irregular time signature snapping
    elements.snapSizeButton = document.createElement("SPAN");
    elements.snapSizeButton.className = "ui_menubutton";
    elements.controls.appendChild(elements.snapSizeButton);
    items = [];
    makeSizeOptions(1);     //Normal size values
    items.push({ type: "divider" });
    makeSizeOptions(3);     //Triplet size values
    var snapSizeMenu = new Menu({
        button: elements.snapSizeButton,
        openClass: "ui_menuopen",
        openUpwards: true,
        items: items,
        classPrefix: "ui",
        onItemSelect: function(item) {
            settings.snap = item.value;
            drawSnapLines();
            elements.snapSizeButton.textContent = "Snap to " + item.text;
            var items = snapSizeMenu.settings.items;
            for(var i = 0; i < items.length; i++) {
                snapSizeMenu.setItemToggle(items[i], false);
            }
            snapSizeMenu.setItemToggle(item, true);
        }
    });
    elements.snapSizeButton.textContent = "Snap to 1 / 4";
    snapSizeMenu.setItemToggle(snapSizeMenu.settings.items[2], true);
    
    //Zoom
    elements.zoomLabel = document.createElement("SPAN");
    elements.zoomLabel.textContent = "Zoom:";
    elements.controls.appendChild(elements.zoomLabel);
    elements.zoomIn = document.createElement("SPAN");
    elements.zoomIn.textContent = "+";
    elements.zoomIn.className = "zoom";
    elements.zoomIn.addEventListener("click", function(e) {
        settings.zoom *= 2;
        redraw();
        //TODO: Scroll to where we were before
    }, false);
    elements.controls.appendChild(elements.zoomIn);
    elements.zoomOut = document.createElement("SPAN");
    elements.zoomOut.textContent = "-";
    elements.zoomOut.className = "zoom";
    elements.zoomOut.addEventListener("click", function(e) {
        settings.zoom *= 0.5;
        redraw();
        //TODO: Scroll to where we were before
    }, false);
    elements.controls.appendChild(elements.zoomOut);
    
    //Removes then redraws everything
    function redraw() {
        drawSnapLines();
        //Remove notes from the editor
        removeChildren(elements.noteBars);
        //Redraw them at the new zoom level
        var notesOn = {};
        for(var i = 0, length = notes.length; i < length; i++) {
            var event = notes[i];
            if(event.subtype == "noteOn") {
                if(notesOn[event.note]) {
                    var noteOff = {
                        subtype: "noteOff",
                        channel: 0,
                        note: event.note,
                        tick: event.tick
                    };
                    makeNoteBar(event, noteOff);
                }
                notesOn[event.note] = event;
            }
            else if(event.subtype == "noteOff") {
                var noteOn = notesOn[event.note];
                if(noteOn) {
                    makeNoteBar(noteOn, event);
                    delete notesOn[event.note];
                }
            }
        }
    }
    
    //Add loop end element
    elements.loopEnd = document.createElement("DIV");
    elements.loopEnd.className = "loop_end";
    elements.drawArea.appendChild(elements.loopEnd);
    elements.loopResize = document.createElement("DIV");
    elements.loopResize.className = "loop_resize";
    //Handle loop resizing bar
    function resizeMouseMove(e) {
        //Get the position of the editor in relation to the page
        var editorOffset = 0, element = elements.noteBars;
        while(element != document.body) {
            editorOffset += element.offsetLeft;
            editorOffset -= element.scrollLeft;
            element = element.parentNode;
        }
        //Get mouse position relative to the note area
        var mousePosition = e.x - editorOffset;
        resizeSnaps = Math.max(Math.round(mousePosition / snapSize), 1);
        elements.loopResize.style.left = (resizeSnaps * snapSize) + "px";
    }
    function stopResizing(e) {
        window.removeEventListener("mousemove", resizeMouseMove, false);
        window.removeEventListener("mouseup", stopResizing, false);
        document.body.className = "";
        settings.tickSize = resizeSnaps * ticksPerBar / settings.snap;
        drawSnapLines();
        if(settings.onResize) settings.onResize(settings.tickSize);
    }
    elements.loopResize.addEventListener("mousedown", function(e) {
        if(e.button) return;
        window.addEventListener("mousemove", resizeMouseMove, false);
        window.addEventListener("mouseup", stopResizing, false);
        document.body.className = "resizing_side";
    }, false);
    elements.drawArea.appendChild(elements.loopResize);
    function drawSnapLines() {
        //Remove current lines before drawing new ones
        removeChildren(elements.snapLines);
        removeChildren(elements.rulerSnapLines);
        //If it's disabled, finish here
        if(settings.disabled) {
            elements.loopEnd.style.left = 0;
            elements.loopResize.style.display = "none";
            return;
        }
        //Draw new lines
        snapSize = settings.zoom / settings.snap * 100;
        var snapCount = settings.tickSize / ticksPerBar * settings.snap;
        var count = Math.floor(snapCount);
        for(var i = 0; i <= count; i++) {
            //Calculate line position
            var left = i * snapSize;
            var isBarLine = !(i % settings.snap);
            //Create the line
            var snapLine = document.createElement("DIV");
            snapLine.className = isBarLine ? "bar_line" : "beat_line";
            snapLine.style.left = left + "px";
            elements.snapLines.appendChild(snapLine);
            //Create the line to go on the ruler
            var rulerLine = document.createElement("DIV");
            rulerLine.className = isBarLine ? "bar_ruler" : "beat_ruler";
            rulerLine.style.left = left + "px";
            elements.rulerSnapLines.appendChild(rulerLine);
            //Create a bar number if it's a bar line
            if(isBarLine) {
                var barNumber = document.createElement("DIV");
                barNumber.textContent = i / settings.snap + 1;
                barNumber.className = "bar_number";
                barNumber.style.left = left + "px";
                elements.rulerSnapLines.appendChild(barNumber);
            }
        }
        //Update loop end
        var loopSize = snapCount * snapSize;
        elements.loopEnd.style.left = elements.loopResize.style.left = loopSize + "px";
        elements.loopResize.style.display = "";
        elements.drawArea.style.width = (loopSize + 52) + "px";
    }
    drawSnapLines();
    //Keep everything positioned correctly when scrolling
    var lastScrollTop;
    function reposition(e) {
        //Cap the scroll speed (only for Y axis)
        if(lastScrollTop) {
            var scrollTop = elements.scrollContainer.scrollTop;
            var deltaY = scrollTop - lastScrollTop;
            if(deltaY > settings.maxScrollSpeed) {
                scrollTop -= deltaY - settings.maxScrollSpeed;
                elements.scrollContainer.scrollTop = scrollTop;
            }
            if(deltaY < -settings.maxScrollSpeed) {
                scrollTop -= deltaY + settings.maxScrollSpeed;
                elements.scrollContainer.scrollTop = scrollTop;
            }
            lastScrollTop = null;
        }
        //Reposition the elements
        var left = -elements.scrollContainer.scrollLeft;
        elements.ruler.style.marginLeft = left + "px";
        var top = -elements.scrollContainer.scrollTop;
        elements.pianoRoll.style.top = top + "px";
    }
    elements.scrollContainer.addEventListener("scroll", reposition, false);
    elements.scrollContainer.addEventListener("mousewheel", function(e) {
        lastScrollTop = elements.scrollContainer.scrollTop;
    }, false);
    
    //Composed notes in MIDI track form
    var notes = [];
    function makeNote(note) {
        var result = insertNote(note.tick, note.length, note.note);
        if(!result) return;
        if(settings.onNoteEdit) settings.onNoteEdit();
        return makeNoteBar(result.on, result.off);
    }
    function insertNote(tick, tickSize, note) {
        //Create the MIDI events
        var endTick = tick + tickSize;
        var noteOn = {
            type: "channel",
            subtype: "noteOn",
            channel: 0,
            note: note,
            tick: tick,
            samplePosition: ticksToSamples(tick)
        };
        var noteOff = {
            type: "channel",
            subtype: "noteOff",
            channel: 0,
            note: note,
            tick: endTick,
            samplePosition: ticksToSamples(tick)
        };
        //Insert the MIDI events
        if(!validNotePosition(note, tick, tickSize)) return null;
        var noteAlreadyOn = false;
        for(var on = 0; on < notes.length; on++) {
            var event = notes[on];
            if(event.tick > tick) {
                if(noteAlreadyOn) return null;
                break;
            }
            if(event.note == note.note && event.subtype == "noteOn") {
                noteAlreadyOn = true;
            }
            else if(event.note == note.note && event.subtype == "noteOff") {
                noteAlreadyOn = false;
            }
        }
        for(var off = on; off < notes.length; off++) {
            var event = notes[off];
            if(event.tick >= endTick) break;
            if(event.note == note.note) return null;
        }
        notes.splice(on, 0, noteOn);
        notes.splice(++off, 0, noteOff);
        return { on: noteOn, off: noteOff };
    }
    function makeNoteBar(noteOn, noteOff) {
        //Create the DOM bar of the note
        var bar = document.createElement("DIV");
        bar.noteOn = noteOn;
        bar.noteOff = noteOff;
        bar.className = "note_bar";
        bar.style.top = ((settings.highestNote - noteOn.note) * KEY_HEIGHT) + "px";
        var barSize = snapSize * settings.snap;
        var left = noteOn.tick / ticksPerBar * barSize;
        bar.style.left = left + "px";
        var ticks = noteOff.tick - noteOn.tick;
        var width = ticks / ticksPerBar * barSize;
        bar.style.width = (width - NOTE_BAR_BORDER_OFFSET) + "px";
        //Listen for mouse interaction events
        bar.addEventListener("dblclick", removeNoteBar, false);
        bar.addEventListener("mousedown", noteMouseDown, false);
        bar.addEventListener("mouseover", noteMouseOver, false);
        bar.addEventListener("mousemove", noteMouseMove, false);
        bar.addEventListener("mouseout", noteMouseOut, false);
        addLongTapEventListener(bar, removeNoteBar);
        elements.noteBars.appendChild(bar);
        return bar;
    }
    function removeNoteBar(e) {
        //Remove MIDI events
        var index = removeEvent(this.noteOn);
        removeEvent(this.noteOff, index);
        //Remove the bar from the screen
        this.parentNode.removeChild(this);
        currentNote = null;
        if(settings.onNoteEdit) settings.onNoteEdit();
    }
    function removeEvent(midiEvent, offset) {
        //Search for and remove event
        var index = (offset || 0) - 1;
        while(++index < notes.length) {
            if(notes[index] == midiEvent) {
                notes.splice(index, 1);
                return index;
            }
        }
        return null;
    }
    function linePressed(e) {
        //Allow middle click scrolling
        if(e.button == 1) return;
        e.preventDefault();
        //Do nothing on right click
        if(e.button == 2) return;
        //Calculate and play the note
        note = settings.highestNote - Math.floor(e.layerY / KEY_HEIGHT);
        multitrack.externalMidiEvent({
            type: "channel",
            subtype: "noteOn",
            note: note,
            velocity: 64
        });
        window.addEventListener("mouseup", pianoRollKeyUp, false);
        //Create the note
        var snappedPosition = Math.floor(e.layerX / snapSize);
        var bar = makeNote({
            note: note,
            tick: ticksPerBar / settings.snap * snappedPosition,
            length: noteSize
        });
        if(bar) openNote(bar);
    }
    elements.overlay.addEventListener("mousedown", linePressed, false);
    
    //Selects a note
    function openNote(noteElement) {
        closeNote();
        currentNote = noteElement;
        noteElement.className = "note_bar note_selected";
    }
    function closeNote() {
        if(!currentNote) return;
        currentNote.className = "note_bar";
    }
    
    //Handles note mouse interaction
    var currentNote = null;
    var noteMouseStart = null;
    var noteEdgeSize = 6;
    function noteMouseDown(e) {
        openNote(this);
        noteMouseStart = {
            x: e.screenX,
            y: e.screenY
        };
        if(this.cursorOverSide) noteResizeDown();
        else noteDragStart();
    }
    function noteMouseOver(e) {
        this.rightEdge = this.offsetWidth - noteEdgeSize;
        noteCheckResizeArea(this, e.layerX);
    }
    function noteMouseMove(e) { noteCheckResizeArea(this, e.layerX); }
    function noteMouseOut(e) { noteResizeAreaExited(this); }
    
    //Use the resize cursor when the cursor is over an edge
    function noteCheckResizeArea(element, x) {
        //Check if the cursor is over a side
        if(x < noteEdgeSize) {
            if(element.cursorOverSide != "left") {
                noteResizeAreaEntered(element, "left");
            }
        }
        else if(x > element.rightEdge) {
            if(element.cursorOverSide != "right") {
                noteResizeAreaEntered(element, "right");
            }
        }
        else noteResizeAreaExited(element);
    }
    function noteResizeAreaEntered(element, side) {
        element.cursorOverSide = side;
        var className = "note_bar resizing_side";
        if(element == currentNote) {
            className += " note_selected";
        }
        element.className = className;
    }
    function noteResizeAreaExited(element) {
        if(!element.cursorOverSide)  return;
        element.cursorOverSide = null;
        var className = "note_bar";
        if(element == currentNote) {
            className += " note_selected";
        }
        element.className = className;
    }
    
    //Handles note resizing
    var noteResize = null;
    function noteResizeDown() {
        //Create the boundaries of the resizing
        var side = currentNote.cursorOverSide;
        var leftSnap, rightSnap;
        var tick = currentNote.noteOn.tick;
        var endTick = currentNote.noteOff.tick;
        var startBar = (tick + 1) / ticksPerBar;
        if(side == "right") leftSnap = Math.ceil(startBar * settings.snap);
        else rightSnap = ticksToSnaps(endTick - 1);
        //Search for the next note bar with the same note
        var nextNote = null, currentEvent;
        if(side == "left") currentEvent = currentNote.noteOn;
        else currentEvent = currentNote.noteOff;
        //Find the index of the note we're currently resizing
        for(var i = 0; i < notes.length; i++) {
            if(notes[i] == currentEvent) break;
        }
        var index = i;
        //Then find the adjacent note
        var ourNote = currentNote.noteOn.note;
        function checkForSameNote() {
            if(notes[i].note == ourNote) {
                nextNote = notes[i];
                return true;
            }
            return false;
        }
        if(side == "right") while(++i < notes.length) {
            if(checkForSameNote()) break;
        }
        else while(i--) {
            if(checkForSameNote()) break;
        }
        if(nextNote) {
            if(side == "left") leftSnap = ticksToSnaps(nextNote.tick);
            else rightSnap = ticksToSnaps(nextNote.tick);
        }
        //If there is no adjacent note
        else if(side == "left") leftSnap = 0;
        else rightSnap = ticksToSnaps(settings.tickSize);
        noteResize = {
            side: side,
            leftSnap: leftSnap,
            rightSnap: rightSnap,
            startX: ticksToPixels(tick),
            endX: ticksToPixels(endTick),
            tick: tick,
            endTick: endTick,
            index: index
        };
        //Start the resizing process
        document.body.className = "resizing_side";
        window.addEventListener("mousemove", noteResizeMove, true);
        window.addEventListener("mouseup", noteResizeUp, true);
    }
    function noteResizeMove(e) {
        //Get pixel position of the mouse
        var relativeX = e.screenX - noteMouseStart.x;
        var side = noteResize.side;
        var startPoint = side == "left" ?
            noteResize.startX : noteResize.endX;
        var unsnappedX = startPoint + relativeX;
        //Convert it to snaps and keep it in bounds
        var snaps = pixelsToSnaps(unsnappedX);
        if(snaps > noteResize.rightSnap) snaps = noteResize.rightSnap;
        else if(snaps < noteResize.leftSnap) snaps = noteResize.leftSnap;
        //Resize the loop element
        var x = snapsToPixels(snaps);
        var width = -borderWidthOffset;
        var tick = snapsToTicks(snaps);
        if(side == "left") {
            noteResize.tick = tick;
            noteResize.tickSize = noteResize.endTick - tick;
            currentNote.style.left = x + "px";
            width += noteResize.endX - x;
        }
        else {
            noteResize.tickSize = tick - noteResize.tick;
            width += x - noteResize.startX;
        }
        currentNote.style.width = width + "px";
    }
    function noteResizeUp(e) {
        //Update the note size and position
        var side = noteResize.side;
        var currentEvent, otherEvent;
        if(side == "left") {
            currentEvent = currentNote.noteOn;
            otherEvent = currentNote.noteOff;
        }
        else {
            currentEvent = currentNote.noteOff;
            otherEvent = currentNote.noteOn;
        }
        var newTick = noteResize.tick;
        if(side == "right") newTick += noteResize.tickSize;
        currentEvent.tick = newTick;
        //Remove the note at the old position
        notes.splice(noteResize.index, 1);
        //Find the index of the other note event
        var otherIndex = findNoteEvent(otherEvent, noteResize.index, (side == "right"));
        //Find the new index of the note event and add it
        var noteAdded = false;
        if(side == "left") {
            for(var i = otherIndex - 1; i >= 0; i--) {
                if(notes[i].tick <= newTick) {
                    notes.splice(i + 1, 0, currentNote.noteOn);
                    noteAdded = true;
                    break;
                }
            }
            if(!noteAdded) notes.splice(0, 0, currentNote.noteOn);
        }
        else {
            for(var i = otherIndex + 1; i < notes.length; i++) {
                if(notes[i].tick >= newTick) {
                    notes.splice(i, 0, currentNote.noteOff);
                    noteAdded = true;
                    break;
                }
            }
            if(!noteAdded) notes.push(currentNote.noteOff);
        }
        //Reset the state
        document.body.className = "";
        noteMouseStart = null;
        window.removeEventListener("mousemove", noteResizeMove, true);
        window.removeEventListener("mouseup", noteResizeUp, true);
        if(settings.onNoteEdit) settings.onNoteEdit();
    }
    
    //Handle note dragging and dropping
    var dragCurrentPosition = null;
    var dragOriginalPosition = null;
    var dragMaxNote = null;
    var dragMaxSnap = null;
    function noteDragStart() {
        dragMaxNote = settings.highestNote - settings.lowestNote;
        var tickSize = currentNote.noteOff.tick - currentNote.noteOn.tick;
        var maxTick = settings.tickSize - tickSize;
        var ticksPerSnap = ticksPerBar / settings.snap;
        dragMaxSnap = Math.floor(maxTick / ticksPerSnap);
        //Get the starting position of the note
        var tick = currentNote.noteOn.tick;
        var snaps = Math.floor(tick / (ticksPerBar / settings.snap));
        var x = (snaps + 0.5) * snapSize;
        var y = (settings.highestNote + 0.5 - currentNote.noteOn.note) * KEY_HEIGHT;
        dragOriginalPosition = { x: x, y: y };
        dragCurrentPosition = {
            x: x,
            y: y,
            validTick: tick,
            validNote: currentNote.noteOn.note
        };
        //Start the dragging process
        document.body.className = "grabbing";
        window.addEventListener("mousemove", noteDragged, false);
        window.addEventListener("mouseup", noteDropped, false);
        currentNote.className = "note_bar note_selected note_dragging";
    }
    function noteDragged(e) {
        //Get the pixel position of the note
        var relativeX = e.screenX - noteMouseStart.x;
        var relativeY = e.screenY - noteMouseStart.y;
        var unsnappedX = dragOriginalPosition.x + relativeX;
        var unsnappedY = dragOriginalPosition.y + relativeY;
        //Move the bar to the new note
        var noteNumber = Math.floor(unsnappedY / KEY_HEIGHT);
        if(noteNumber < 0) noteNumber = 0;
        else if(noteNumber > dragMaxNote) noteNumber = dragMaxNote;
        var y = noteNumber * KEY_HEIGHT;
        //Find the snapped pixel position to move to
        var snaps = Math.floor(unsnappedX / snapSize);
        if(snaps > dragMaxSnap) snaps = dragMaxSnap;
        else if(snaps < 0) snaps = 0;
        //Save tick position
        var x = snaps * snapSize;
        //Move the note bar
        if(x != dragCurrentPosition.x || y != dragCurrentPosition.y) {
            dragCurrentPosition.y = y;
            dragCurrentPosition.x = x;
            //Make sure the new position does not overlap any other notes
            var note = settings.highestNote - noteNumber;
            var tick = snapsToTicks(snaps);
            var tickSize = currentNote.noteOff.tick - currentNote.noteOn.tick;
            if(validNotePosition(note, tick, tickSize, currentNote.noteOn)) {
                dragCurrentPosition.validNote = note;
                dragCurrentPosition.validTick = tick;
                currentNote.style.top = y + "px";
                currentNote.style.left = x + "px";
            }
        }
    }
    function noteDropped(e) {
        //Remove the original events
        var noteOn = currentNote.noteOn;
        var noteOff = currentNote.noteOff;
        var index = removeEvent(noteOn);
        removeEvent(noteOff, index);
        //Insert the note in the new location
        var tick = dragCurrentPosition.validTick;
        var tickSize = noteOff.tick - noteOn.tick;
        var note = dragCurrentPosition.validNote;
        var result = insertNote(tick, tickSize, note);
        if(result) {
            currentNote.noteOn = result.on;
            currentNote.noteOff = result.off;
        }
        //Put the original note back if it fails
        else insertNote(noteOn.tick, tickSize, noteOn.note);
        //Reset the state
        currentNote.className = "note_bar note_selected";
        dragCurrentPosition = dragOriginalPosition =
            dragMaxNote = dragMaxSnap = null;
        document.body.className = "";
        window.removeEventListener("mousemove", noteDragged, false);
        window.removeEventListener("mouseup", noteDropped, false);
        if(settings.onNoteEdit) settings.onNoteEdit();
    }
    
    //Create piano roll keys
    //For some reason we need to wait to make the composer audio...
    var note;
    function pianoRollKeyUp(e) {
        e.preventDefault();
        multitrack.externalMidiEvent({
            type: "channel",
            subtype: "noteOff",
            note: note,
            velocity: 0
        });
        window.removeEventListener("mouseup", this, false);
    }
    function pianoRollKeyPressed(e) {
        if(e.button == 1) return;
        e.preventDefault();
        if(e.button == 2) return;
        note = this.note;
        multitrack.externalMidiEvent({
            type: "channel",
            subtype: "noteOn",
            note: note,
            velocity: 64
        });
        window.addEventListener("mouseup", pianoRollKeyUp, false);
    }
    var styles = [
        "white_top",
        "black",
        "white_both",
        "black",
        "white_bottom",
        "white_top",
        "black",
        "white_both",
        "black",
        "white_both",
        "black",
        "white_bottom"
    ];
    var i = 0, marginNext = false;
    function makeKey(note, style, i, label) {
        //Create piano key
        var key = document.createElement("DIV");
        key.className = "key " + style;
        key.id = "pianoroll_key" + note;
        //Absolutely position black keys
        if(style == "black") key.style.top = (i * KEY_HEIGHT) + "px";
        //If the first key is black, we need a margin on
        //the white key under it to keep the spacing
        else if(marginNext) {
            key.style.paddingTop = (KEY_HEIGHT / 2) + "px";
            marginNext = false;
        }
        key.note = note;
        key.addEventListener("mousedown", pianoRollKeyPressed, false);
        //Create label if it has one
        if(label) {
            var labelElement = document.createElement("DIV");
            labelElement.className = "label";
            labelElement.textContent = label;
            key.appendChild(labelElement);
        }
        elements.pianoRoll.appendChild(key);
        //Create editor key line
        var line = document.createElement("DIV");
        line.className = style == "black" ? "black_line" : "white_line";
        elements.drawArea.appendChild(line);
    }
    for(var a = settings.highestNote; a >= settings.lowestNote; a--) {
        //Calculate note, label and key style
        var note = a % 12;
        var label = note ? null : "C" + (a / 12 - 2);
        var style = styles[note];
        //Make sure the white keys are spaced correctly at the start
        if(a == settings.highestNote) {
            if(style == "white_both") style = "white_bottom";
            else if(style == "white_top") style = "white";
            else if(style == "black") marginNext = true;
        }
        makeKey(a, style, i++, label);
    }
    //Scroll to halfway initially
    var sc = elements.scrollContainer;
    sc.scrollTop = (sc.scrollHeight - sc.clientHeight) / 2;
    
    //Helper functions
    function snapsToPixels(snaps) {
        return snaps * snapSize;
    }
    function snapsToTicks(snaps) {
        return snaps / settings.snap * ticksPerBar;
    }
    function ticksToSnaps(ticks) {
        return Math.floor(ticks / ticksPerBar * settings.snap);
    }
    function ticksToPixels(ticks) {
        return ticks / ticksPerBar * settings.snap * snapSize;
    }
    function ticksToSamples(ticks) {
        return Math.round(ticks * me.samplesPerTick);
    }
    function pixelsToSnaps(x) {
        return Math.floor(x / snapSize);
    }
    
    //Checks if a note position does not overlap any other notes
    function validNotePosition(note, tick, tickSize, excludeEvent) {
        var noteIsOn = false;
        var endTick = tick + tickSize;
        if(endTick > settings.tickSize) return false;
        for(var n = 0, length = notes.length; n < length; n++) {
            var currentEvent = notes[n];
            if(currentEvent == excludeEvent) continue;
            if(currentEvent.tick >= endTick) return !noteIsOn;
            if(currentEvent.note == note) {
                var eventTick = currentEvent.tick;
                if(currentEvent.subtype == "noteOn") {
                    if(eventTick >= tick) return false;
                    noteIsOn = true;
                }
                else if(currentEvent.subtype == "noteOff") {
                    noteIsOn = false;
                }
            }
        }
        return !noteIsOn;
    }
    
    //Loops through all note events to find a specific one
    function findNoteEvent(noteEvent, offset, reversed) {
        var i = offset || 0;
        if(!reversed) for(var length = notes.length; i < length; i++) {
            if(notes[i] == noteEvent) return i;
        }
        else for(; i >= 0; i--) {
            if(notes[i] == noteEvent) return i;
        }
        return null;
    }
    
    //Removes all child elements from an element
    function removeChildren(element) {
        while(element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }
    
    //Handle key presses
    this.onKeyDown = function(e) {
        //Delete
        if(e.keyCode == 46) {
            if(currentNote) {
                var note = currentNote;
                removeNoteBar.call(note);
                currentNote = null;
            }
        }
    };
    
    //Clears everything and resets the composer
    this.reset = function() {
        getSettings();
        notes = [];
        redraw();
    };
    
    //Clears everything and disables the composer
    this.disable = function() {
        getSettings({ disabled: true });
        notes = [];
        redraw();
    };
    
    //Sets a new channel for the composer
    this.setChannel = function(channel) {
        /*
        //TODO: Implement this...
        for(var note in activeNotes) multitrack.externalNoteOff(note);
        */
        composerChannel = channel;
    };
    
    //Loads a midi track into the composer
    this.load = function(events, loopSettings) {
        //Resize to loop size
        getSettings(loopSettings);
        notes = [];
        redraw();
        //Load the notes
        var notesOn = {};
        for(var i = 0; i < events.length; i++) {
            var event = events[i];
            if(event.subtype == "noteOn") {
                notesOn[event.note] = event;
            }
            else if(event.subtype == "noteOff" &&
                    notesOn[event.note]) {
                makeNoteBar(notesOn[event.note], event);
                delete notesOn[event.note];
            }
        }
        notes = events;
    };
    
    //Plays the tune in the composer
    this.play = function() {
        var beatsPerMinute = 120;
        //Convert the composer tune into MIDI format
        var midiFile = {
            header: {
                ticksPerBeat: settings.ticksPerBeat
            },
            midiEvents: [{
                subtype: "setTempo",
                microsecondsPerBeat: 60000000 / beatsPerMinute,
                tick: 0
            }].concat(notes)
        };
        //Play the newly converted MIDI file
        MIDI.play(midiFile);
    };
}