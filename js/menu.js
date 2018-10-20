var Menu = function(settings) {
    var me = this;
    
    //Get default settings
    function getSettings(newSettings) {
        //Defaults (commented settings must be set programatically)
        var defaultSettings = {
            button: null,
            openClass: null,
            items: [],
            clickOutsideCloses: true,
            itemSelectCloses: true,
            closeAllBeforeOpening: true,
            openUpwards: false,
            tick: String.fromCharCode(10162),
            classPrefix: ""
        };
        //Reset settings variable
        me.settings = settings = newSettings || {};
        //Set every unset default setting
        for(var key in defaultSettings) {
            if(settings[key] === undefined) {
                settings[key] = defaultSettings[key];
            }
        }
    }
    getSettings(settings);
    
    //Handle menu open button
    var normalClass = "";
    if(settings.button) {
        settings.button.addEventListener("mousedown", function(e) {
            if(e.button) return;
            if(me.isOpen) me.close();
            else {
                if(settings.openClass) {
                    me.close();
                    normalClass = settings.button.className;
                    settings.button.classList.add(settings.openClass);
                }
                me.open();
            }
        }, false);
    }
    
    //Create DOM elements
    var container = document.createElement("DIV");
    container.className = "menu_container";
    //Create menu items
    function itemClicked(e) {
        e.stopPropagation();
        e.preventDefault();
        if(e.button) return;
        if(this.item.disabled) return;
        if(settings.itemSelectCloses && !this.item.items) me.close();
        if(this.item.onClick) this.item.onClick.call(me, this.item);
        if(settings.onItemSelect) {
            settings.onItemSelect.call(me, this.item);
        }
    }
    function menuMouseDown(e) {
        e.stopPropagation();
        e.preventDefault();
    }
    function closeSubmenu(submenu) {
        if(!submenu) return;
        closeSubmenu(submenu.submenu);
        if(submenu.parentNode) container.removeChild(submenu);
        clearTimeout(submenu.timeout);
    }
    function submenuClearTimeout(e) {
        clearTimeout(this.timeout);
    }
    function submenuHover(e) {
        if(this.item.disabled || this.submenu.parentNode) return;
        var submenu = this.submenu;
        var position = Menu.getPosition(this, container, this.clientWidth, 0);
        this.submenu.style.left = position.x + "px";
        this.submenu.style.top = position.y + "px";
        closeSubmenu(this.parentNode.submenu);
        this.parentNode.submenu = submenu;
        container.appendChild(this.submenu);
    }
    function submenuOut(e) {
        //Set a timeout to close the submenu so that it does not close instantly
        //even when moving the mouse over the submenu
        var submenu = this.submenu;
        clearTimeout(submenu.timeout);
        submenu.timeout = setTimeout(function() {
            if(submenu.parentNode) container.removeChild(submenu);
        }, 500);
    }
    //Sets the class of an element with custom prefix
    function setClassName(element, className) {
        if(settings.classPrefix) {
            className += " " + settings.classPrefix + "_" + className;
        }
        element.className = className;
    }
    function createMenuItems(items) {
        var menu = document.createElement("DIV");
        setClassName(menu, "menu");
        menu.addEventListener("mousedown", menuMouseDown, false);
        if(settings.openUpwards) menu.style.bottom = "0px";
        for(var i = 0; i < items.length; i++) {
            var item = items[i];
            //Check if it is a divider
            if(item.type == "divider") {
                var div = document.createElement("DIV");
                setClassName(div, "menu_divider");
                menu.appendChild(div);
                continue;
            }
            //Create item
            var div = document.createElement("DIV");
            setClassName(div, "menu_item");
            if(item.disabled) setClassName(div, "menu_disabled");;
            div.addEventListener("mousedown", itemClicked, false);
            div.item = item;
            item.div = div;
            menu.appendChild(div);
            //Add space for the toggled icon
            if(item.toggle) {
                var toggle = document.createElement("SPAN");
                setClassName(toggle, "menu_toggle");
                div.toggle = toggle;
                div.appendChild(toggle);
                me.setItemToggle(item, !!item.toggled);
            }
            //Create it's text
            var label = document.createElement("SPAN");
            label.textContent = item.text;
            div.appendChild(label);
            if(item.items) {
                //Create submenu and it's items
                var submenuIcon = document.createElement("SPAN");
                submenuIcon.textContent = ">";
                submenuIcon.classList.add("menu_submenu");
                div.appendChild(submenuIcon);
                div.submenu = createMenuItems(item.items);
                //Clear the timeout that closes the submenu
                div.submenu.addEventListener(
                    "mouseenter", submenuClearTimeout, false);
                div.addEventListener("mouseenter", submenuHover, false);
                div.addEventListener("mousedown", submenuHover, false);
                div.addEventListener("mouseleave", submenuOut, false);
            }
        }
        return menu;
    }
    container.appendChild(createMenuItems(settings.items));
    
    //Opens the menu
    me.isOpen = false;
    me.open = function(position) {
        if(settings.closeAllBeforeOpening) Menu.closeAll();
        if(settings.onOpen) settings.onOpen();
        //Get the menu's absolute position
        if(!position && settings.button) {
            position = Menu.getPosition(settings.button, null,
                0, settings.openUpwards ? 0 : settings.button.offsetHeight);
        }
        else if(!position) position = { x: 0, y: 0};
        //Display the menu on the page
        container.style.top = position.y + "px";
        container.style.left = position.x + "px";
        document.body.appendChild(container);
        me.isOpen = true;
    };
    
    //Closes the menu
    me.close = function() {
        if(me.isOpen) {
            //Remove the menu from the screen
            container.parentNode.removeChild(container);
            //Set the button's class back to normal
            if(settings.button && settings.openClass) {
                settings.button.classList.remove(settings.openClass);
            }
            me.isOpen = false;
        }
    };
    
    //Untoggles all items then sets just one as toggled
    me.setOnlyItemToggled = function(toggledItem) {
        function checkItems(items) {
            for(var i = 0; i < items.length; i++) {
                var item = items[i];
                me.setItemToggle(item, false);
                if(item.items) checkItems(item.items);
            }
        }
        checkItems(settings.items);
        me.setItemToggle(toggledItem, true);
    };
    
    //Sets the menu items
    me.setItems = function(items) {
        settings.items = items;
        while(container.firstChild) container.removeChild(container.firstChild);
        container.appendChild(createMenuItems(items));
    };
    
    //Closes the menu when the mouse is clicked outside of it
    if(settings.clickOutsideCloses) {
        window.addEventListener("mousedown", function(e) {
            if(e.target != settings.button &&
                !Menu.isDescendant(e.target, container)) me.close();
        }, true);
    }
    
    //Add this new menu to the list of menus
    Menu.menus.push(me);
};

//Sets the toggle state of an item
Menu.prototype.setItemToggle = function(item, toggled) {
    if(!item.toggle) return;
    item.toggled = toggled;
    item.div.toggle.textContent = toggled ? this.settings.tick : "";
};

//Global menu variables
Menu.menus = [];

//Closes all menus
Menu.closeAll = function() {
    for(var i = 0; i < Menu.menus.length; i++) {
        Menu.menus[i].close();
    }
};

//Returns the position of an element relative to another
Menu.getPosition = function(sourceElement, relativeElement,
        offsetX, offsetY) {
    var element = sourceElement, offsetParent = sourceElement;
    var x = offsetX || 0, y = offsetY || 0;
    while(element != relativeElement && element != document.body) {
        if(element == offsetParent) {
            x += element.offsetLeft - element.scrollLeft;
            y += element.offsetTop - element.scrollTop;
            offsetParent = element.offsetParent;
            element = element.parentNode;
        }
        else {
            x -= element.scrollLeft;
            y -= element.scrollTop;
            element = element.parentNode;
        }
    }
    return { x: x, y: y };
};

//Checks if an element is a descendant of a certain element
Menu.isDescendant = function(element, parent) {
    var nextElement = element;
    while(nextElement) {
        nextElement = nextElement.parentNode;
        if(nextElement == parent) return true;
    }
    return false;
};

/*
//Sample usage
var menu = new Menu({
    button: document.getElementById("menuButton"),
    openClass: "menu_button open",
    items: [
        { text: "Save", onClick: saveFunction },
        { text: "Import", items: [
            { text: "WAV", onClick: importWav },
            { text: "MIDI", onClick: importMIDI },
            { text: "MP3", onClick: importMp3 }
        ] },
        { text: "Exit", onClick: exit }
    ]
});
*/