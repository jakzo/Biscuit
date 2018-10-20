var Demo = {
    windowLoaded: false,
    loading: false,
    done: false,
    file: null,
    load: function() {
        if(!document.domain || !document.domain.length) return;
        Demo.loading = true;
        if(Demo.windowLoaded) Demo.setLoadText(true);
        var demoFile = null, pendingFiles = 0;
        function loadFile(url, callback) {
            ajax({
                url: url,
                responseType: "arraybuffer",
                onSuccess: callback
            });
        }
        function loadSoundFont(name, size) {
            Resources.find({ name: name, size: size }, function(resource) {
                if(resource) openDemo();
                else loadFile("demo/" + name, function(result) {
                    var file = {
                        name: name,
                        size: result.byteLength,
                        buffer: result
                    };
                    Resources.addFileContents(file, openDemo);
                });
            });
        }
        pendingFiles = 3;
        loadSoundFont("piano.sf2", 22175586);
        loadSoundFont("drums.sf2", 8436852);
        loadFile("demo/demo.bpj", function(result) {
            Demo.file = result;
            openDemo();
        });
        function openDemo() {
            if(!--pendingFiles) {
                Demo.done = true;
                if(multitrack) {
                    multitrack.openSaveData(Demo.file);
                    Demo.setLoadText(false);
                }
            }
        }
    },
    setLoadText: function(loading) {
        document.querySelector(".link").textContent =
            loading ? "Loading Demo (May take a while...)" : "Biscuit";
    },
    onMultitrackLoad: function() {
        if(Demo.done) {
            multitrack.openSaveData(demoFile);
            Demo.setLoadText(false);
        }
    }
};

window.addEventListener("load", function(e) {
    Demo.windowLoaded = true;
    if(Demo.loading) Demo.setLoadText(true);
}, false);
