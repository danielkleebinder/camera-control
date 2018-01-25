/* 
 Created on : 04.11.2017
 Author     : Daniel Kleebinder
 
 (c) Please do not copy or redistribute this source!
 */


// Contains all available camera addresses. This list will be shown to the
// user in navigation bar of the application. Users can then choose one of
// the addresses to control a specific camera.
var AVAILABLE_CAMERA_ADDRESSES = [
    "10.128.115.30",
    "10.128.115.31"
];


// The nginx reverse proxy server address. This address needs to be corrected
// if any changes happen to the ip addresses! The nginx server is the main
// communication pipeline between the cameras and this application.
var NGINX_REVERSE_PROXY_ADDRESS = "10.128.115.10:7070";

// Camera address to connect to the service. This is the current camera address.
var address = AVAILABLE_CAMERA_ADDRESSES[0];



// Constants
var CAMERA_MIN_ZOOM = 0;
var CAMERA_MAX_ZOOM = 100;


/**
 * Returns the camera address.
 * 
 * @returns {String} Camera address.
 */
function cameraAddress() {
    return "http://" + NGINX_REVERSE_PROXY_ADDRESS + "/" + address + "/ISAPI";
}


/**
 * Returns the camera PTZ address.
 * 
 * @returns {String} Camera PTZCtrl channel 1 string.
 */
function cameraPTZAddress() {
    return cameraAddress() + "/PTZCtrl/channels/1/";
}


/**
 * Returns the camera status address.
 * 
 * @returns {String} Camera status address.
 */
function cameraStatusAddress() {
    return cameraPTZAddress() + "status";
}


/**
 * Returns the camera presets address.
 * 
 * @returns {String} Camera presets address.
 */
function cameraPresetsAddress() {
    return cameraPTZAddress() + "presets/";
}


/**
 * Parses the given XML string to valid XML.
 * 
 * @param {String} e XML which should be parsed.
 * @returns {unresolved} Valid XML.
 */
function parseXmlFromStr(e) {
    if (e === null || e === "") {
        return null;
    }
    return new DOMParser().parseFromString(e, "text/xml");
}


/**
 * Starts a rotation action using the given rotation speeds.
 * 
 * @param {Number} pan Pan rotation speed.
 * @param {Number} tilt Tilt rotation speed.
 */
function startRotation(pan, tilt) {
    startRotation(pan, tilt, false, false);
}


/**
 * Starts a rotation action using the given rotation speeds.
 * 
 * @param {Number} pan Pan rotation speed.
 * @param {Number} tilt Tilt rotation speed.
 * @param {Boolean} invertAxisX True if the x axis rotation should be inverted.
 * @param {Boolean} invertAxisY True if the y axis rotation should be inverted.
 */
function startRotation(pan, tilt, invertAxisX, invertAxisY) {
    if (invertAxisX) {
        pan *= -1;
    }
    if (invertAxisY) {
        tilt *= -1;
    }

    // Send Request
    var request = "<?xml version='1.0' encoding='UTF-8'?><PTZData><pan>" + pan + "</pan><tilt>" + tilt + "</tilt></PTZData>";
    var encodedRequest = parseXmlFromStr(request);
    $.ajax({
        type: "PUT",
        url: cameraPTZAddress() + "continuous",
        processData: !1,
        data: encodedRequest
    });
}


/**
 * Immediately stops all rotation actions.
 */
function stopRotation() {
    startRotation(0, 0);
}


/**
 * Starts a zoom action using the given zoom speed.
 * 
 * @param {Number} zoom Zoom speed.
 */
function startZoom(zoom) {
    var request = "<?xml version='1.0' encoding='UTF-8'?><PTZData><zoom>" + zoom + "</zoom></PTZData>";
    var encodedRequest = parseXmlFromStr(request);
    $.ajax({
        type: "PUT",
        url: cameraPTZAddress() + "continuous",
        processData: !1,
        data: encodedRequest
    });
}


/**
 * Immediately stops all zoom actions.
 */
function stopZoom() {
    startZoom(0);
}


/**
 * Immediately stops all kind of transformations (rotation, [translation] and
 * zoom) of the camera.
 */
function stopTransformation() {
    stopRotation();
    stopZoom();
}


/**
 * Fetches all presets from the camera and parses the XML result.
 * 
 * @param {Function} done Feedback function for success.
 */
function fetchAllPresets(done) {
    $.ajax({
        type: "GET",
        url: cameraPresetsAddress(),
        dataType: 'xml',
        success: function (xml) {
            // Process fetched preset data
            var result = new Array();
            $('PTZPreset', xml).each(function () {
                var elem = {
                    id: $(this).find('id').text(),
                    enabled: $(this).find('enabled').text(),
                    name: $(this).find('presetName').text()
                };
                result.push(elem);
            });

            // Use parameter function to proccess parsed data
            done(result);
        }
    });
}


/**
 * Fetches the current status of the camera. The status is the rotation and zoom
 * levels. One can access these values by using the properties "elevation",
 * "azimuth" and "absoluteZoom" on the resulting object.
 * 
 * @param {Function} done Feedback function for success.
 */
function fetchStatus(done) {
    $.ajax({
        type: "GET",
        url: cameraStatusAddress(),
        dataType: 'xml',
        success: function (xml) {
            // Process fetched status data
            var result;
            $('AbsoluteHigh', xml).each(function () {
                result = {
                    elevation: parseFloat($(this).find('elevation').text()),
                    azimuth: parseFloat($(this).find('azimuth').text()),
                    absoluteZoom: parseFloat($(this).find('absoluteZoom').text())
                };
                return;
            });

            // Use parameter function to proccess parsed data
            done(result);
        }
    });
}


/**
 * Starts the preset with the given index on the camera.
 * 
 * @param {Number} index Preset index.
 */
function gotoPreset(index) {
    var presetURL = cameraPresetsAddress() + parseInt(index) + "/goto";
    $.ajax({
        type: "PUT",
        url: presetURL,
        processData: !1
    });
}


/**
 * Saves the current camera transformation as preset using the given name.
 * 
 * @param {Number} id Preset id.
 * @param {String} name Preset name.
 * @param {Boolean} enabled True if the preset is enabled for use.
 * @param {Function} done Success callback function.
 */
function savePreset(id, name, enabled, done) {
    var request = "<?xml version='1.0' encoding='UTF-8'?><PTZPresetList><PTZPreset><id>" + id + "</id><enabled>" + enabled + "</enabled><presetName>" + name + "</presetName></PTZPreset></PTZPresetList>";
    var encodedRequest = parseXmlFromStr(request);
    $.ajax({
        type: "PUT",
        url: cameraPresetsAddress(),
        processData: !1,
        data: encodedRequest,
        success: function (result) {
            if (done == null) {
                return;
            }
            done(result);
        }
    });
}


/**
 * Saves the current transformation for the given preset.
 * 
 * @param {Number} index Preset index.
 */
function savePresetTransformation(index) {
    var request = "<?xml version='1.0' encoding='UTF-8'?><PTZPreset><id>" + index + "</id></PTZPreset>";
    var encodedRequest = parseXmlFromStr(request);
    $.ajax({
        type: "PUT",
        url: cameraPresetsAddress() + index,
        processData: !1,
        data: encodedRequest
    });
}


/**
 * Renames the preset at the given index position.
 * 
 * @param {Number} index Index of the preset.
 * @param {String} name New preset name.
 * @param {Function} done Success callback function.
 */
function renamePreset(index, name, done) {
    if (!isValidPresetName(name)) {
        return;
    }

    var request = "<?xml version='1.0' encoding='UTF-8'?><PTZPreset><id>" + index + "</id><presetName>" + name + "</presetName></PTZPreset>";
    var encodedRequest = parseXmlFromStr(request);
    $.ajax({
        type: "PUT",
        url: cameraPresetsAddress() + index,
        processData: !1,
        data: encodedRequest,
        success: function (result) {
            if (done == null) {
                return;
            }
            done(result);
        }
    });
}


/**
 * Deletes the preset with the given index. A deleted preset can not be
 * restored!
 * 
 * @param {Number} index Preset index.
 * @param {Function} done Success callback function.
 */
function deletePreset(index, done) {
    var presetURL = cameraPresetsAddress() + parseInt(index);
    $.ajax({
        type: "DELETE",
        url: presetURL,
        success: function (result) {
            if (done == null) {
                return;
            }
            done(result);
        }
    });
}


/**
 * Resets the camera to the no zoom position.
 */
function setToNoZoom() {
    setAbsoluteZoom(CAMERA_MIN_ZOOM);
}


/**
 * Sets the camera to the max zoom position.
 */
function setToMaxZoom() {
    setAbsoluteZoom(CAMERA_MAX_ZOOM);
}


/**
 * Sets the absolute zoom level of the camera between 0 and 100. 100 is the
 * maximum possible zoom level. 0 indicates no zoom at all.
 * 
 * @param {Number} zoom Absolute zoom level between 0 and 100.
 */
function setAbsoluteZoom(zoom) {
    // The cameras absolute zoom level is between 0 and 100
    zoom = parseInt(clamp(zoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM));

    fetchStatus(function (result) {
        // Send XML encoded ajax request
        var request = "<?xml version='1.0' encoding='UTF-8'?><PTZData><AbsoluteHigh><elevation>" + result.elevation +
                "</elevation><azimuth>" + result.azimuth +
                "</azimuth><absoluteZoom>" + zoom +
                "</absoluteZoom></AbsoluteHigh></PTZData>";
        var encodedRequest = parseXmlFromStr(request);
        $.ajax({
            type: "PUT",
            url: cameraPTZAddress() + "absolute",
            processData: !1,
            data: encodedRequest
        });
    });
}


/**
 * Checks if the given preset name is valid.
 * 
 * @param {String} name Preset name.
 * @returns {Boolean} True if the preset name is valid, otherwise false.
 */
function isValidPresetName(name) {
    // Max Count: 20
    // Max Example: sofa und tv #2222222
    if (name === null || $.trim(name).length === 0) {
        return false;
    }
    if (name.length <= 0 || name.length > 20) {
        return false;
    }
    return true;
}


/**
 * Clamps the given value into the given min and max range.
 * 
 * @param {Number} val Value.
 * @param {Number} min Min value.
 * @param {Number} max Max value.
 * @returns {Number} Clamped value between min and max.
 */
function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}