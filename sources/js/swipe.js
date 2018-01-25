/* 
 Created on : 04.11.2017
 Author     : Daniel Kleebinder
 
 (c) Please do not copy or redistribute this source!
 */


// Standard rotation speed of the camera being the factor for the
// camera rotation controls
var rotationSpeed = 0.4;
var swipeEventTimeout = 100;
var zoomEventTimeout = 20;
var invertAxis = {
    x: true,
    y: false
};


// Contains all preset IDs which do not have a valid preset
var emptyPresetIDs = new Array();

// Favorite preset IDs
// This is an associated array using the currently selected camera as index
var favoritePresetID = {};

// ID on which preset the camera should center
var centerPresetID = -1;

// Represents the preset which should be removed
var preset = {
    id: -1,
    name: null,
    parent: null
};
var rotation = {
    relativeX: 0,
    relativeY: 0
};
var zoom = {
    absoluteZoom: 0
};


// Check if document is ready to add all used events
$(document).ready(function () {
    // Hide all non-important components
    $("#new-preset-empty-name-alert").hide();
    $("#preset-options-modal-empty-name-alert").hide();

    // Load settings from local storage
    loadLocalSettings();

    // Set camera IP-address as navbar brand
    loadNavbar();

    // Load camera related stuff
    loadStatus();
    loadPresets();

    setInterval(function () {
        if (rotation == null) {
            return;
        }
        startRotation(
                rotation.relativeX, rotation.relativeY,
                invertAxis.x, invertAxis.y
                );
        rotation = null;
    }, swipeEventTimeout);

    setInterval(function () {
        if (zoom == null) {
            return;
        }
        setAbsoluteZoom(zoom.absoluteZoom);
        zoom = null;
    }, zoomEventTimeout);

    // Start touch and gesture event handling
    var firstTouch;
    var dragging = false;
    $("#swipe-area").on('mousedown touchstart gesturestart', function (evt) {
        evt.preventDefault();

        // Get first touch
        dragging = true;
        firstTouch = evt.originalEvent;
        if (evt.originalEvent.changedTouches) {
            firstTouch = evt.originalEvent.changedTouches[0];
        }
    });
    $("#control-area").on('mousemove touchmove', function (evt) {
        if (!dragging) {
            return;
        }

        evt.preventDefault();

        // Get current touch
        var touch = evt.originalEvent;
        if (evt.originalEvent.changedTouches) {
            touch = evt.originalEvent.changedTouches[0];
        }

        // Compute "drag" direction
        var direction = computeDirection(
                firstTouch.clientX, firstTouch.clientY,
                touch.clientX, touch.clientY
                );
        rotation = {
            relativeX: Math.round(direction.x * direction.mag * rotationSpeed),
            relativeY: Math.round(direction.y * direction.mag * rotationSpeed)
        };

        // Set drag opacity
        $("#swipe-area").css('opacity', (1.0 - Math.min(direction.mag / 400, 1.0)));
        console.log(Math.round(direction.x * direction.mag * rotationSpeed) + ":" + Math.round(direction.y * direction.mag * rotationSpeed));
    }).on('mouseup touchend touchcancel gestureend', function (evt) {
        evt.preventDefault();

        // Stop rotating the camera
        $("#swipe-area").css('opacity', '1');
        dragging = false;
        console.log("End Swipe");
        rotation = null;
        stopRotation();
    });

    $("#control-area").on('mousedown touchstart gesturestart', function (evt) {
        var $this = $(this);
        var offset = $this.offset();
        var width = $this.width();
        var height = $this.height();

        var centerX = offset.left + width / 2;
        var centerY = offset.top + height / 2;

        // Get current touch
        var touch = evt.originalEvent;
        if (evt.originalEvent.changedTouches) {
            touch = evt.originalEvent.changedTouches[0];
        }

        // Compute "drag" direction
        var direction = computeDirection(
                centerX, centerY,
                touch.clientX, touch.clientY
                );

        // Start rotation. Optimize here by not normalizing the vector in first place
        rotation = {
            relativeX: Math.round(direction.x * direction.mag * rotationSpeed),
            relativeY: Math.round(direction.y * direction.mag * rotationSpeed)
        };

        // Visual Feedback for control area events
        if ($(evt.target).attr('id') !== "swipe-area") {
            visualClickFeedback(touch.clientX, touch.clientY);
        }
    });

    // Set camera address selection
    $(".camera-switch").click(function (evt) {
        if ($(this).parent('li').hasClass('active')) {
            return;
        }

        // Stop all transformations. This is the first step, because
        // the call is asynchronous and won't block any other operations
        stopTransformation();

        // Set selected camera as active in navbar
        $(".navbar-nav > li").each(function () {
            $(this).removeClass();
        });
        $(this).parent('li').addClass('active');

        // Set address
        address = $(this).attr('data-address');
        saveLocalSettings();

        // Try to fetch all presets and generate appropriate user interface
        // using the loaded status.
        loadStatus();
        loadPresets();

        // Show camera switching alert with correct IP address
        $(".navbar-brand").html(address);
    });

    // Setup zoom slider
    $("#zoom-slider").on('change', function (evt) {
        var newZoom = $(this).val();
        console.log("Zoom Factor: " + newZoom);

        // Set zoom value for absolute zoom of camera
        zoom = {
            absoluteZoom: newZoom
        };
        console.log("Input Zoom");
    });
    $("#btn-zoom-out").click(function (evt) {
        changeZoomSliderValue(-1);
    });
    $("#btn-zoom-in").click(function (evt) {
        changeZoomSliderValue(+1);
    });

    // Event handling for the "absolute control" buttons
    $("#btn-reset-zoom").click(function (evt) {
        $("#zoom-slider").val(0);
        console.log("Reset Zoom");
        zoom = null;
        setToNoZoom();
    });
    $("#btn-favorite-preset").click(function (evt) {
        if (favoritePresetID[address] < 0) {
            return;
        }
        console.log("Go To Favorite Preset " + favoritePresetID[address]);
        gotoPreset(favoritePresetID[address]);
    });
    $("#btn-center-camera").click(function (evt) {
        if (centerPresetID < 0) {
            return;
        }
        console.log("Go To Center Preset " + centerPresetID);
        gotoPreset(centerPresetID);
    });

    // Adds a new preset to the list
    var addNewPresetFunction = function (evt) {
        var name = $("#new-preset-name").val();

        // Check if the name is valid
        if (!isValidPresetName(name)) {
            $("#new-preset-empty-name-alert").show();
            return;
        }

        // Reset name input text field
        $("#new-preset-name").val("");
        console.log("Create New Preset: " + name);

        // WARNING: May not save preset properly, because an ID has to be
        // specified. Needs testing in the laboratory!!
        //
        // Save the newly created preset to allow loading access
        savePreset(nextEmptyPresetID(), name, true, function (result) {
            loadPresets();
        });

        // Hide the create preset modal
        $("#new-preset-modal").modal('hide');
        $("#new-preset-empty-name-alert").hide();
    };
    $("#new-preset-create").click(addNewPresetFunction);
    $("#new-preset-name").change(addNewPresetFunction);

    // Removes the selected preset
    $("#rem-preset-delete").click(function (evt) {
        if (preset.id < 0 || preset.parent === null) {
            return;
        }

        console.log("Trying To Remove Preset:");
        console.log(preset);

        // Delete the preset using the camera system
        deletePreset(preset.id, function (result) {
            console.log("Delete Preset: " + result);
            preset.parent.remove();

            if (favoritePresetID[address] === preset.id) {
                favoritePresetID[address] = -1;
                saveLocalSettings();
            }

            $("#preset-options-modal").modal('hide');
        });
    });

    // Overrides the current configuration
    $("#sav-preset-override").click(function (evt) {
        if (preset.id < 0) {
            return;
        }

        console.log("Trying To Save Preset:");
        console.log(preset);
        savePresetTransformation(preset.id);
        $("#preset-options-modal-override").attr('disabled', 'disabled');
    });

    // Update dialog title when changing the name
    $("#preset-options-modal-name").change(function (evt) {
        if (evt !== null
                && evt.originalEvent != null
                && evt.originalEvent.explicitOriginalTarget != null
                && $(evt.originalEvent.explicitOriginalTarget).attr('id') === "preset-options-modal-name-refresh") {
            return;
        }

        var name = $(this).val();

        if (preset.id < 0					// Check if valid preset is selected
                || preset.parent === null			// Check is parent item is valid
                || preset.name === name) {			// Check if names are not equal
            return;
        }

        // Check if the name is valid
        if (!isValidPresetName(name)) {
            $("#preset-options-modal-empty-name-alert").show();
            return;
        }

        // Standard debug output
        console.log("Trying To Rename Preset:");
        console.log(preset);
        console.log("New Name: " + name);

        // Rename the preset and change all values after success
        renamePreset(preset.id, name, function (result) {
            console.log("Rename Preset: " + result);

            $("#preset-options-modal-title").html(name);
            $("#preset-options-modal-empty-name-alert").hide();

            preset.name = name;
            preset.parent.find(".preset-name").html(name);
        });
    });
    $("#preset-options-modal-name-ok").click(function (evt) {
        $("#preset-options-modal-name").change();
    });
    $("#preset-options-modal-name-refresh").click(function (evt) {
        $("#preset-options-modal-name").val(preset.name);
    });

    // Create preset favorite change
    $("#preset-options-modal-favorite").click(function (evt) {
        favoritePresetID[address] = -1;

        $("#preset-options-modal-favorite").toggleClass("active");
        $("#preset-options-modal-favorite-addon").toggleClass("text-gold", 250);

        var addonView = $("#preset-options-modal-favorite-addon");
        if (addonView.hasClass("glyphicon-star")) {
            addonView.switchClass("glyphicon-star", "glyphicon-star-empty", 250);
        } else {
            addonView.switchClass("glyphicon-star-empty", "glyphicon-star", 250);
        }

        if ($("#preset-options-modal-favorite").hasClass("active")) {
            favoritePresetID[address] = preset.id;
        }

        saveLocalSettings();
    });

    // Saves the current transformation for a given preset
    $("#preset-options-modal-override").click(function (evt) {
        $("#sav-preset-name").html(preset.name);
        $("#sav-preset-modal").modal('show');
    });

    // Create delete preset functionallity
    $("#preset-options-modal-delete").click(function (evt) {
        $("#rem-preset-name").html(preset.name);
        $("#rem-preset-modal").modal('show');
    });
});


/**
 * Changes the zoom sliders value and triggers the slider event.
 * 
 * @param {Number} offset Absolute zoom offset.
 */
function changeZoomSliderValue(offset) {
    var value = parseInt($("#zoom-slider").val());
    $("#zoom-slider").val(value + offset);

    // Trigger change event on slider to update camera position
    $("#zoom-slider").change();
}


/**
 * Computes a normalized direction vector for the given points from point 1
 * to point 2.
 * 
 * @param {Number} x1 Point 1 x position.
 * @param {Number} y1 Point 1 y position.
 * @param {Number} x2 Point 2 x position.
 * @param {Number} y2 Point 2 y position.
 * @returns {computeDirection.direction} Direction vector.
 */
function computeDirection(x1, y1, x2, y2) {
    var direction = {};
    direction.x = x1 - x2;
    direction.y = y1 - y2;

    // Compute magnitude aka length of the vector
    direction.mag = Math.sqrt(direction.x * direction.x + direction.y * direction.y);

    // Normalize direction vector
    direction.x /= direction.mag;
    direction.y /= direction.mag;

    // Return normalized vector
    return direction;
}


/**
 * Animates a small visual feedback at the given location for touch events.
 * 
 * @param {Number} x X position.
 * @param {Number} y Y position.
 */
function visualClickFeedback(x, y) {
    $(".visual-feedback")
            .stop()
            .css('width', 0).css('height', 0)
            .css('left', x).css('top', y)
            .css('opacity', 1)
            .animate({
                opacity: "0",
                width: "60px", height: "60px",
                top: "-=30px", left: "-=30px"
            }, 350);
}


/**
 * Loads all camera status related things.
 */
function loadStatus() {
    fetchStatus(function (data) {
        $("#zoom-slider").val(parseInt(data.absoluteZoom));
    });
}


/**
 * Saves all local settings to the local web storage.
 */
function saveLocalSettings() {
    if (typeof (window.localStorage) === 'undefined') {
        console.log("Local settings cannot be saved. No web storage support!");
        return;
    }

    localStorage.favoritePresets = JSON.stringify(favoritePresetID);
    console.log("Saving Parameter [localStorage.favoritePresets]:");
    console.log(localStorage.favoritePresets);

    localStorage.currentAddress = address;
    console.log("Saving Parameter [localStorage.currentAddress]:");
    console.log(localStorage.currentAddress);
}


/**
 * Loads all local settings from the web storage.
 */
function loadLocalSettings() {
    if (typeof (window.localStorage) === 'undefined') {
        console.log("Local settings cannot be saved. No web storage support!");
        return;
    }

    if (typeof (localStorage.favoritePresets) !== 'undefined' && localStorage.favoritePresets !== null) {
        favoritePresetID = JSON.parse(localStorage.favoritePresets);
        console.log("Loading Parameter [localStorage.favoritePresets]:");
        console.log(favoritePresetID);
    }

    if (typeof (localStorage.currentAddress) !== 'undefined' && localStorage.currentAddress !== null) {
        address = localStorage.currentAddress;
        console.log("Loading Parameter [localStorage.currentAddress]:");
        console.log(address);
    }
}


/**
 * Loads all dynamic information and data into the navbar.
 */
function loadNavbar() {
    $("#navigation > ul").empty();

    for (var i = 0; i < AVAILABLE_CAMERA_ADDRESSES.length; i++) {
        var liClass = "";
        var current = AVAILABLE_CAMERA_ADDRESSES[i];

        // Use currently active camera address as active navbar item
        if (current === address) {
            liClass = " class='active'";
        }

        // Build the list entry for the navbar
        $("#navigation > ul")
                .append("<li" + liClass + "><a href='#' class='camera-switch' data-address='" + current + "' data-toggle='collapse' data-target='#navigation'>ALLNET Camera " + (i + 1) + "</a></li>");
    }

    $(".navbar-brand").html(address);
}


/**
 * Loads all presets and updates the presets list.
 */
function loadPresets() {
    fetchAllPresets(function (data) {
        $("#preset-list").empty();
        var count = 0;
        var previousID = 0;
        $(data).each(function () {
            // Use first preset as standard favorite
            if (count <= 0) {
                if ((typeof favoritePresetID[address] === 'undefined')
                        || favoritePresetID[address] === null) {
                    favoritePresetID[address] = this.id;
                    saveLocalSettings();
                }
                centerPresetID = this.id;
            }

            // Save all unused preset IDs
            for (var i = previousID + 1; i < this.id; i++) {
                emptyPresetIDs.push(i);
            }
            previousID = parseInt(this.id);

            // Construct preset entry
            var root = $(document.createElement("li"))
                    .addClass("list-group-item")
                    .attr('data-id', this.id)
                    .click(function (evt) {
                        if ($(evt.target).hasClass("preset-name")
                                || $(evt.target).hasClass("list-group-item")) {
                            console.log("Go To Preset #" + $(this).attr('data-id'));
                            gotoPreset($(this).attr('data-id'));
                        }
                    })
                    .append($(document.createElement('span')).addClass('preset-name').text(this.name));
            $(root).append("<div class='pull-right'>\n\
                                <a class='preset-options'><span class='glyphicon glyphicon-cog text-muted'></span></a>\n\
                            </div>");
            $("#preset-list").append(root);

            // Set favorite
            if (favoritePresetID[address] === this.id) {
                $(root).find('.preset-fav')
                        .removeClass('glyphicon-star-empty')
                        .addClass('glyphicon-star');
            }

            count++;
        });

        $(".preset-options").click(function (evt) {
            var parent = $(this).parent().parent();
            var id = parent.attr('data-id');
            var name = parent.find('.preset-name').html();

            preset.id = id;
            preset.name = name;
            preset.parent = parent;

            if (favoritePresetID[address] === id) {
                $("#preset-options-modal-favorite").addClass("active");
                $("#preset-options-modal-favorite-addon")
                        .addClass("text-gold")
                        .removeClass("glyphicon-star-empty")
                        .addClass("glyphicon-star");
            } else {
                $("#preset-options-modal-favorite").removeClass("active");
                $("#preset-options-modal-favorite-addon")
                        .removeClass("text-gold")
                        .removeClass("glyphicon-star")
                        .addClass("glyphicon-star-empty");
            }

            $("#preset-options-modal-empty-name-alert").hide();
            $("#preset-options-modal-override").removeAttr('disabled');
            $("#preset-options-modal-title").html(name);
            $("#preset-options-modal-name").val(name);
            $("#preset-options-modal").modal('show');
        });
    });
}


/**
 * Returns the next available empty preset ID for creating new presets.
 * 
 * @returns {Number} A valid and empty preset ID.
 */
function nextEmptyPresetID() {
    return emptyPresetIDs.shift();
}