//Provides automation interface on the multitrack

//Automation initialisation
Biscuit.Track.prototype.initAutomation = function(options) {
    var self = this;
    this.automations = options.automations || {};
    this.automationPaths = {};
    this.svg = Biscuit.createSvgCanvas(1, 1);
    this.svg.style.display = "none";
    this.svg.style.position = "absolute";
    //this.svg.style.top = this.svg.style.left = 0;
    this.svg.style.zIndex = 1;
    this.svg.style.cursor = "pointer";
    //Automation interaction
    function drag(pageX, pageY) {
        var automation = self.currentAutomation;
        var points = automation.points;
        //Get the position and value of where the mouse is
        var trackPosition = Biscuit.getPositionOf(self.svg);
        var x = pageX - trackPosition.x, y = pageY - trackPosition.y;
        var tick = self.multitrack.getSnappedTickPosition(x, true);
        var result = 1 - y / self.height;
        if(result > 1) result = 1;
        else if(result < 0) result = 0;
        var value = (automation.max - automation.min) * result + automation.min;
        //Save the new value to the point
        var p = -1, pointCount = points.length;
        while(++p < pointCount) {
            var point = points[p];
            if(point.tick == tick) {
                point.value = value;
                break;
            }
            if(point.tick > tick) {
                points.splice(p, 0, { tick: tick, value: value });
                break;
            }
        }
        if(p == pointCount) points.push({ tick: tick, value: value });
        self.setAutomationData(self.currentAutomation);
    }
    //Touch events
    var touches = {};
    this.svg.addEventListener("touchstart", function(e) {
        if(!self.currentAutomation) return;
        e.preventDefault();
        for(var t = 0; t < e.changedTouches.length; t++) {
            var touch = e.changedTouches[t];
            touches[touch.identifier] = true;
        }
        touchMove(e);
    }, false);
    function touchMove(e) {
        for(var t = 0; t < e.changedTouches.length; t++) {
            var touch = e.changedTouches[t];
            if(!touches[touch.identifier]) return;
            drag(touch.pageX, touch.pageY);
        }
    }
    this.svg.addEventListener("touchmove", touchMove, false);
    this.svg.addEventListener("touchend", function(e) {
        for(var t = 0; t < e.changedTouches.length; t++) {
            var touch = e.changedTouches[t];
            delete touches[touch.identifier];
        }
    }, false);
    //Mouse events
    this.svg.addEventListener("mousedown", function(e) {
        if(!self.currentAutomation) return;
        window.addEventListener("mousemove", mouseDragging, false);
        window.addEventListener("mouseup", mouseUp, false);
        mouseDragging(e);
    }, false);
    function mouseDragging(e) {
        drag(e.pageX, e.pageY);
    }
    function mouseUp(e) {
        window.removeEventListener("mousemove", mouseDragging, false);
        window.removeEventListener("mouseup", mouseUp, false);
    }
    this.element.appendChild(this.svg);
};

//Overlays all automations on the track
Biscuit.Track.prototype.showAllAutomations = function() {
    for(var key in this.automationPaths) {
        this.automationPaths[key].style.display = "";
    }
    this.currentAutomation = null;
};

//Returns the automation matching the effect ID and parameter
Biscuit.Track.prototype.getAutomation = function(id, parameter) {
    var effectAutomations = this.automations[id], automation;
    if(!effectAutomations) effectAutomations = this.automations[id] = {};
    else automation = effectAutomations[parameter];
    if(!automation) {
        automation = effectAutomations[parameter] = this.createAutomation();
        var effect = this.chain.getEffectById(id);
        if(!effect) return null;
        var parameterValues = effect.parameters[parameter];
        if(!parameterValues) return null;
        automation.min = parameterValues.min;
        automation.max = parameterValues.max;
    }
    return automation;
};

//Overlays an automation on the track loops
Biscuit.Track.prototype.showAutomation = function(id, parameter) {
    var automation = this.getAutomation(id, parameter);
    if(!automation) return;
    automation.path.style.display = this.svg.style.display = "";
    this.currentAutomation = automation;
};

//Hides an automation overlay
Biscuit.Track.prototype.hideAutomation = function(id, parameter) {
    var automation = this.getAutomation(id, parameter);
    if(!automation) return;
    automation.path.style.display = "none";
    if(this.currentAutomation == automation) this.currentAutomation = null;
};

//Hides all visible automation overlays
Biscuit.Track.prototype.hideAllAutomations = function() {
    for(var id in this.automations) {
        var effectAutomations = this.automations[id];
        for(var parameter in effectAutomations) {
            effectAutomations[parameter].path.style.display = "none";
        }
    }
    this.currentAutomation = null;
    this.svg.style.display = "none";
};

//Overlays the automations on the track loops
Biscuit.Track.prototype.createAutomation = function() {
    //Create the automation
    var automation = {
        min: 0,
        max: 1,
        points: [],
        path: document.createElementNS(Biscuit.svgNamespace, "path")
    };
    //Draw the automation on the canvas
    this.resizeAutomationCanvas();
    automation.path.setAttribute("stroke", "#0af");
    automation.path.setAttribute("stroke-width", 5);
    automation.path.setAttribute("fill", "none");
    automation.path.style.cursor = "pointer";
    automation.path.style.display = "none";
    this.svg.appendChild(automation.path);
    this.setAutomationData(automation);
    return automation;
};

//Sets the data of an automation line path
Biscuit.Track.prototype.setAutomationData = function(automation) {
    var lineWidth = 3;
    var margin = lineWidth / 2, height = this.height - lineWidth;
    function getHeight(value) {
        var min = automation.min, max = automation.max;
        return height - (value - min) / (max - min) * height + margin;
    }
    //Create the data
    var points = automation.points;
    var lastHeight = points.length ? getHeight(points[0].value) : height / 2;
    var data = [ "M0 " + lastHeight ];
    for(var p = 0; p < points.length; p++) {
        var point = points[p];
        var value = getHeight(point.value);
        var x = this.multitrack.ticksToPixels(point.tick),
            y = lastHeight = getHeight(point.value);
        data.push("L" + x + " " + y);
    }
    data.push("L" + this.width + " " + lastHeight);
    automation.path.setAttribute("d", data.join(" "));
};

//Resizes the automation SVG canvas to the same size as the track element
Biscuit.Track.prototype.resizeAutomationCanvas = function() {
    this.width = this.element.clientWidth;
    this.height = this.element.clientHeight;
    this.svg.setAttribute("width", this.width);
    this.svg.setAttribute("height", this.height);
};
