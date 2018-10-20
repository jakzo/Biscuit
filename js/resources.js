var Resources = new (function() {
    var self = this;

    //Use IndexedDB to store data
    var db = null;
    var dbName = "biscuit";
    var version = 3;
    
	function dbError(e) { console.log(e); }

	//Executes a query on the database
	this.dbQuery = function(store, action, callback, parameter1, parameter2, etc) {
		if(!db) return;
		var transaction = db.transaction([ store ], "readwrite");
		var objectStore = transaction.objectStore(store);
		var parameters = Array.prototype.slice.call(arguments, 3);
		var request = objectStore[action].apply(objectStore, parameters);
		request.onsuccess = callback;
		request.onerror = dbError;
	}
	
	//Open the database
    this.db = null;
	function openDatabase() {
		var dbRequest = indexedDB.open(dbName, version);
		dbRequest.onupgradeneeded = function(e) {
			db = e.target.result;
			e.target.transaction.onerror = dbError;
			//Remove the old resources store
			if(db.objectStoreNames.contains("resources")) {
				db.deleteObjectStore("resources");
			}
			//Create the header and data stores
			db.createObjectStore("headers", { autoIncrement: true });
			db.createObjectStore("data");
			openDatabase();
		};
		dbRequest.onsuccess = function(e) {
			self.db = db = e.target.result;
			//Populate the resource list with all the resources in the database
			self.dbQuery("headers", "openCursor", function(e) {
				var cursor = e.target.result;
				if(!cursor) {
					//TODO: Change this to some sort of callback...
					Demo.load();
					return;
				}
				var resource = {
					id: cursor.key,
					headers: cursor.value,
					data: null
				};
				self.all.push(resource);
				addResourceToList(resource);
				cursor.continue();
			});
		};
		dbRequest.onerror = dbError;
	}
	openDatabase();
    
    //Returns a resource from the database
    function getDataFromDatabase(resource, handler) {
        if(!db) return;
		//Keep a list of handlers so that we only have to request it once
		if(!resource.handlers) {
			resource.handlers = [];
			self.dbQuery("data", "get", function(e) {
				resource.data = e.target.result;
				for(var h = 0; h < resource.handlers.length; h++) {
					resource.handlers[h](resource);
				}
				delete resource.handlers;
			}, resource.id);
		}
		resource.handlers.push(handler);
    }

    //Contains every resource
    this.all = [];

    //Fired when a resource is clicked on
    function mouseDown(e) {
    	self.displayInfo(this.resource);
    };
    
    //Displays a resource in the resource list
    function addResourceToList(resource) {
        if(!self.elements.list) return;
        var item = document.createElement("LI");
        item.resource = resource;
        item.addEventListener("mousedown", mouseDown, false);
        var icon = document.createElement("SPAN");
        icon.classList.add("resource_icon");
        item.icon = icon;
        item.appendChild(icon);
        var name = document.createElement("SPAN");
        name.classList.add("resource_name");
        name.textContent = resource.headers.name;
        item.nameElement = name;
        item.appendChild(name);
        self.elements.list.appendChild(item);
        resource.item = item;
        self.statusChanged(resource);
    }

    //Adds a resource to this list
    this.add = function(resource) {
        self.all.push(resource);
        //Save the resource to the database
		self.dbQuery("headers", "add", function(e) {
			resource.id = e.target.result;
			self.dbQuery("data", "add", null, resource.data, resource.id);
		}, resource.headers);
        resource.onStatusChange = self.statusChanged;
        addResourceToList(resource);
    };
    
    //Updates a resource's properties in the database
    this.update = function(resource, callback) {
		self.dbQuery("headers", "put", function(e) {
        	if(resource.data == null) {
				if(callback) callback();
				return;
        	}
			self.dbQuery("data", "put", callback, resource.data, resource.id);
		}, resource.headers, resource.id);
    };

    //List UL element
    this.elements = {};
    this.setList = function(container) {
        container.classList.add("resource_list");
        //Info box
        self.elements.info = document.createElement("DIV");
        self.elements.info.classList.add("resource_info");
        container.appendChild(self.elements.info);
        //Info title
        self.elements.title = document.createElement("H2");
        self.elements.title.classList.add("resource_title");
        self.elements.info.appendChild(self.elements.title);
        //Info type
        self.elements.type = document.createElement("H3");
        self.elements.type.classList.add("resource_type");
        self.elements.info.appendChild(self.elements.type);
        //Info thumbnail
        self.elements.thumbnail = document.createElement("DIV");
        self.elements.thumbnail.classList.add("resource_thumbnail");
        self.elements.info.appendChild(self.elements.thumbnail);
        //Info table
        self.elements.table = document.createElement("TABLE");
        self.elements.info.appendChild(self.elements.table);
        //Resource list
        self.elements.list = document.createElement("UL");
        container.appendChild(self.elements.list);
    };

	//Selects the resource in the file manager
    var selectedResources = [];
    this.select = function(resource) {
    	resource.item.classList.add("resource_selected");
    	selectedResources.push(resource);
    };
    this.deselect = function(resource) {
    	resource.item.classList.remove("resource_selected");
    	selectedResources.push(resource);
    };

    //Displays the information for a resource in the info box
    this.displayInfo = function(resource) {
    	self.elements.title.textContent = resource.headers.name;
    	self.elements.type.textContent = resource.headers.type;
    	self.elements.table.innerHTML = "";
    	for(var key in resource.headers) {
    		if(key != "name" && key != "type") {
    			var row = document.createElement("TR");
    			var header = document.createElement("TD");
    			header.textContent = key + ":";
    			row.appendChild(header);
    			var value = document.createElement("TD");
    			value.textContent = resource.headers[key];
    			row.appendChild(value);
    			self.elements.table.appendChild(row);
    		}
    	}
    };

    //Updates the resource list to show changes to a resource
    this.statusChanged = function(resource) {
        var status = resource.status || "unknown";
        var icon = resource.icon || self.icons.Unknown;
		resource.headers.icon = icon.name;
        resource.item.icon.textContent = icon.label;
        resource.item.icon.className = "resource_icon";
        if(status) resource.item.icon.classList.add("resource_" + status);
		//self.update(resource);
    };

    //Finds a resource that matches
    this.find = function(headerProperties, handler) {
        for(var i = 0; i < self.all.length; i++) {
            var resource = self.all[i], matches = true;
            for(var key in headerProperties) {
                if(resource.headers[key] !== headerProperties[key]) {
                    matches = false;
                    break;
                }
            }
            if(matches) {
                if(resource.data != null) handler(resource);
                else getDataFromDatabase(resource, handler);
                return;
            }
        }
        handler(null);
    };

    //Loads and adds a file to the resource list and returns the resource
    this.addFile = function(file, callback) {
        //Try and find the file in the resources
        self.find({ name: file.name, size: file.size }, function(resource) {
            if(resource) return callback(resource);
            //Add the file if it is not already in the resources
            var reader = new FileReader();
            reader.onerror = function(e) { console.log("File Read Error!"); };
            reader.onload = function(e) {
                var resource = {
                    id: null,
                    headers: {
                        name: file.name,
                        size: file.size
                    },
                    data: e.target.result
                };
                self.add(resource);
                if(callback) callback(resource);
            };
            reader.readAsArrayBuffer(file);
        });
    };

    //Adds a preloaded file to the resource list and returns the resource
    this.addFileContents = function(file, callback) {
        //Try and find the file in the resources
        self.find({ name: file.name, size: file.size }, function(resource) {
            if(resource) return callback(resource);
            //Add the file if it is not already in the resources
			var resource = {
				id: null,
				headers: {
					name: file.name,
					size: file.size
				},
				data: file.buffer
			};
			self.add(resource);
			if(callback) callback(resource);
        });
    };
    
    this.deleteAll = function() {
    	self.dbQuery("headers", "clear", function(e) {
    		self.dbQuery("data", "clear", function(e) {
				self.elements.list.innerHTML = "";
			});
        });
    };

    //Resource Icons
    this.icons = {};
    this.Icon = function(name, label, className) {
        this.name = name;
        this.label = label;
        this.className = className || "";
        self.icons[name] = this;
    };
    new this.Icon("Loading", String.fromCharCode(0x231B));
    new this.Icon("Wave", "wav");
    new this.Icon("Unknown", "???");
})();
