//Musical Keyboard!
var MusicalKeyboard = function(options) {
    var me = this;
    var whiteKeys = [
        null,
        65,
        83,
        68,
        70,
        71,
        72,
        74,
        75,
        76,
        186,
        222
    ];
    var blackKeys = [
        81,
        87,
        69,
        82,
        84,
        89,
        85,
        73,
        79,
        80,
        219,
        221
    ];
    var noteTypes = [
        whiteKeys,
        blackKeys,
        whiteKeys,
        blackKeys,
        whiteKeys,
        whiteKeys,
        blackKeys,
        whiteKeys,
        blackKeys,
        whiteKeys,
        blackKeys,
        whiteKeys
    ];
    var baseNote = 0;
    var keyMap = {};
    function createKeyMap(newBaseNote) {
        baseNote = newBaseNote;
        keyMap = {
            90: "keyDown",
            88: "keyUp",
            67: "octaveDown",
            86: "octaveUp"
        };
        var keyIndex = 0, i = -1;
        if(noteTypes[baseNote - 1] == blackKeys) i--;
        var noteCount = whiteKeys.length + blackKeys.length - 1;
        while(++i < noteCount) {
            var note = baseNote + i;
            var noteLetter = note % 12;
            var noteType = noteTypes[noteLetter];
            if(noteType == whiteKeys) keyIndex++;
            var keyCode = noteType[keyIndex];
            keyMap[keyCode] = note;
        }
    }
    createKeyMap(options.baseNote);
    var keysDown = {};
    window.addEventListener("keydown", function(e) {
        if(keysDown[e.keyCode]) return;
        keysDown[e.keyCode] = true;
        var note = keyMap[e.keyCode];
        if(note == "keyDown") {
            var noteType = noteTypes[(baseNote - 1) % 12];
            var steps = noteType == blackKeys ? 2 : 1;
            createKeyMap(baseNote - steps);
        }
        else if(note == "keyUp") {
            var noteType = noteTypes[(baseNote + 1) % 12];
            var steps = noteType == blackKeys ? 2 : 1;
            createKeyMap(baseNote + steps);
        }
        else if(note == "octaveDown") {
            createKeyMap(baseNote - 12);
        }
        else if(note == "octaveUp") {
            createKeyMap(baseNote + 12);
        }
        else if(note) {
            multitrack.externalMidiEvent({
                type: "channel",
                subtype: "noteOn",
                note: note,
                velocity: 64
            });
            //TODO: Make own keyboard window
        }
    }, false);
    window.addEventListener("keyup", function(e) {
        delete keysDown[e.keyCode];
        var note = keyMap[e.keyCode];
        if(note) multitrack.externalMidiEvent({
            type: "channel",
            subtype: "noteOff",
            note: note,
            velocity: 0
        });
    }, false);
};