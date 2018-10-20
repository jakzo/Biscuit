/*
 * Biscuit.Marker
 * Multitrack marker framework
 *
 * Options:
 * multitrack: (required) The multitrack object to attach the marker to
 * icon: The DOM element of the ruler marker icon (default = empty <div>)
 * line: The DOM element of the track marker line (default = empty <div>)
 * tick: The tick position of the marker (default = 0)
 */
Biscuit.Marker = function(options) {
    this.multitrack = options.multitrack;
    this.dragging = false;
    this.tick = options.tick || 0;
    this.setIcon(options.icon);
    this.setLine(options.line);
    this.onDragEnd = options.onDragEnd;
    this.multitrack.markers.push(this);
};
Biscuit.Marker.prototype.setMultitrack = function(multitrack) {
    this.multitrack = multitrack;
};
Biscuit.Marker.prototype.setIcon = function(icon) {
    this.configureElement("icon", this.multitrack.ruler, icon);
};
Biscuit.Marker.prototype.setLine = function(line) {
    this.configureElement("line", this.multitrack.trackScroller, line);
};
//Sets marker DOM element styles, properties and event listeners
Biscuit.Marker.prototype.configureElement = function(name, container, element) {
    var self = this;
    //Remove the old element
    var old = this[name];
    if(old && old.parentNode) old.parentNode.removeChild(old);
    //Configure the new element
    if(!element) element = document.createElement("div");
    element.style.position = "absolute";
    element.style.top = 0;
    element.style.zIndex = 3;
    element.style.height = "100%";
    element.style.cursor = "ew-resize";
    element.style.left = this.multitrack.ticksToPixels(this.tick) + "px";
    //Enable marker dragging (disable by setting style.pointerEvents to "none")
    element.addEventListener("mousedown", function(e) {
        self.dragMouse(e);
    }, false);
    var touchId = null;
    element.addEventListener("touchstart", function(e) {
        self.dragTouch(e);
    }, false);
    //Add the new element
    this[name] = element;
    container.appendChild(element);
};
//Start dragging with the mouse
Biscuit.Marker.prototype.dragMouse = function(e) {
    var self = this;
    function mouseMove(e) { self.dragMove(e.pageX); }
    function mouseUp(e) {
        window.removeEventListener("mousemove", mouseMove, false);
        window.removeEventListener("mouseup", mouseUp, false);
        self.dragEnd(e.pageX);
        document.body.classList.remove("resizing_side");
    }
    Biscuit.stopEvent(e);
    this.dragBegin(e.pageX);
    document.body.classList.add("resizing_side");
    window.addEventListener("mousemove", mouseMove, false);
    window.addEventListener("mouseup", mouseUp, false);
};
//Start dragging with a touch
Biscuit.Marker.prototype.dragTouch = function(e) {
    var self = this;
    function touchMove(e) {
        for(var t = 0; t < e.changedTouches.length; t++) {
            var touch = e.changedTouches[t];
            if(touch.identifier == touchId) {
                self.dragMove(touch.pageX);
                return;
            }
        }
    }
    function touchEnd(e) {
        for(var t = 0; t < e.changedTouches.length; t++) {
            var touch = e.changedTouches[t];
            if(touch.identifier == touchId) {
                window.removeEventListener("touchmove", touchMove, false);
                window.removeEventListener("touchend", touchEnd, false);
                self.dragEnd(touch.pageX);
                return;
            }
        }
    }
    Biscuit.stopEvent(e);
    var touch = e.changedTouches[0];
    self.dragBegin(touch.pageX);
    touchId = touch.identifier;
    window.addEventListener("touchmove", touchMove, false);
    window.addEventListener("touchend", touchEnd, false);
};
Biscuit.Marker.prototype.dragBegin = function(pageX) {
    this.dragging = true;
    this.multitrack.rulerLeft = Biscuit.getPositionOf(this.multitrack.ruler).x;
    this.dragMove(pageX);
};
Biscuit.Marker.prototype.dragMove = function(pageX) {
    this.move(Math.max(pageX - this.multitrack.rulerLeft, 0));
};
Biscuit.Marker.prototype.dragEnd = function(pageX) {
    var tick = this.multitrack.pixelsToTicks(pageX - this.multitrack.rulerLeft);
    this.dragging = false;
    this.setTick(Math.max(tick, 0));
    if(this.onDragEnd) this.onDragEnd(tick);
};
Biscuit.Marker.prototype.dragCancel = function() {
    this.dragging = false;
    this.setTick(this.tick);
};
Biscuit.Marker.prototype.setTick = function(tick) {
    this.tick = tick || 0;
    if(!this.dragging) this.move(this.multitrack.ticksToPixels(this.tick));
};
Biscuit.Marker.prototype.move = function(pixels) {
    this.icon.style.left = this.line.style.left = pixels + "px";
};

//Initialises marker module
Biscuit.Multitrack.prototype.initMarker = function() {
    this.markers = [];
    this.rulerLeft = 0;
};

//Updates the position of every marker in the multitrack
Biscuit.Multitrack.prototype.updateAllMarkers = function() {
    for(var m = 0; m < this.markers.length; m++) {
        var marker = this.markers[m];
        marker.setTick(marker.tick);
    }
};
