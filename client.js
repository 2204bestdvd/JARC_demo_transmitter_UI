/******** 
 * Radar Plot
 ********/

var dummyTraceScatter = {
    x: [],
    y: [],
    mode: 'markers',
    type: 'scatter'
};

var dummyTraceLine = {
    x: [],
    y: [],
    mode: 'lines',
    type: 'scatter'
};


/*
var layout = {
    xaxis: {domain: [0, 0.45]},
    yaxis2: {anchor: 'x2'},
    xaxis2: {domain: [0.55, 1]}
};
*/

var layoutScatter = {
    margin: {t: 0},
    xaxis: {range: [-20, 20]},
    yaxis: {range: [0, 20]}
};

var layoutRangeDoppler = {
    margin: {t: 0},
    xaxis: {range: [0, 50]},
    yaxis: {range: [-50, 50]}
};

var layoutRangeProfile = {
    margin: {t: 0},
    xaxis: {range: [0, 256]},
    yaxis: {range: [0, 15000]}
};


Plotly.plot('scatter-plot', [dummyTraceScatter], layoutScatter);
Plotly.plot('range-doppler-plot', [dummyTraceScatter], layoutRangeDoppler);
Plotly.plot('range-profile-plot', [dummyTraceLine], layoutRangeProfile);


function plotRadar(msg) {
    Plotly.restyle('scatter-plot', {x: [msg.x_coord], y: [msg.y_coord]});
    //console.log("Update plot");

    Plotly.restyle('range-doppler-plot', {x: [msg.range], y: [msg.doppler]});

}

function plotRangeProfile(msg) {
    Plotly.restyle('range-profile-plot', {x: [msg.x], y: [msg.y]});
}





/******** 
 * Serial port handling
 ********/

var portOpen = true;

document.getElementById('uart-toggle').onclick = function(){
    if (portOpen === true) {
        socket.emit('uart-close');
        portOpen = false;
        document.getElementById('uart-toggle').innerText = "Connect";
    } else {
        socket.emit('uart-open');
        portOpen = true;
        document.getElementById('uart-toggle').innerText = "Disconnect";
    }
};



/******** 
 * Data loading
 *  - Read data file (display if file is image)
 *  - Encode data (Reed Solomon code) and push into data queue
 *  - Schedule data loading command into radar device 
 ********/


var dataQueue = [];

var n = 20;
var rs = new ReedSolomon(n);
//message = [...Array(10).keys()];
//var enc = rs.encodeByte(message);
//console.log(enc);


/*
function handleFileSelect(evt) {
    var files = evt.target.files; // FileList object

    // files is a FileList of File objects. List some properties.
    var output = [];
    for (var i = 0, f; f = files[i]; i++) {
        output.push('<li><strong>', escape(f.name), '</strong>', 
                    //' (', f.type || 'n/a', ')',
                    ' - ',
                    f.size, ' bytes, last modified: ',
                    f.lastModifiedDate ? f.lastModifiedDate.toLocaleDateString() : 'n/a',
                    '</li>');
    }
    document.getElementById('list').innerHTML = '<ul id="filelist">' + output.join('') + '</ul>';
}

document.getElementById('files').addEventListener('change', handleFileSelect, false);
*/


function handleFileSelect(evt) {
    var files = evt.target.files; // FileList object

    // Loop through the FileList and render image files as thumbnails.
    for (var i = 0, f; f = files[i]; i++) {
        // Load data and encode, then push into data queue         
        loadFileInDataQueue(f);

        // Only process image files.
        if (!f.type.match('image.*')) {
            continue;
        }

        var reader = new FileReader();

        // Closure to capture the file information.
        reader.onload = (function(theFile) {
            return function(e) {
            // Render thumbnail.
            var span = document.createElement('span');
            span.innerHTML = ['<img class="thumb" src="', e.target.result,
                                '" title="', escape(theFile.name), '"/>'].join('');
            document.getElementById('list').insertBefore(span, null);
            };
        })(f);

        // Read in the image file as a data URL.
        reader.readAsDataURL(f);
    }
}


function loadFileInDataQueue(file) {
    var reader = new FileReader();    

    reader.onload = function(f) {
        var content = this.result.split('').map(function(e){return e.codePointAt(0)});
        
        // File header length of 6 bytes: [1, 255, length(4 bytes)]
        var l = content.length;
        var header = [1, 255, (l >>> 24)%256, (l >>> 16)%256, (l >>> 8)%256, l%256];
        var data = header.concat(content);
        console.log(data);
        var dataEncoded = rs.encodeByte(data);
        console.log(dataEncoded);

        socket.emit('sent-data', dataEncoded);

        dataQueue = dataQueue.concat(dataEncoded);

        console.log(dataQueue);
    }

    reader.readAsBinaryString(file);
}

var maxNumBytePerCommand = 32;
var doneFlag = 0;
var sendingInProgress = 0;
function trySendData(timeout) {
    return new Promise( function(resolve, reject) {
        var numByte = (dataQueue.length > maxNumBytePerCommand)? maxNumBytePerCommand : dataQueue.length;
        if (numByte == 0) {
            reject('Data queue empty');
            return;
        }

        var command = ['dataTx', numByte].concat(dataQueue.slice(0, numByte)).join(' ');
        socket.emit('command', command);

        socket.on('log', receiveDone);

        setTimeout(function() {
            if (doneFlag === 1) {
                resolve(numByte);
            } else {
                reject(new Error('Timeout for receiving done'));
            }
            doneFlag = 0;
            socket.removeListener('log', receiveDone);
        }, timeout)
    });
}

function receiveDone(msg){
    if (msg.match(/Done/g)) {
        doneFlag = 1;
    }
}

function sendData() {
    sendingInProgress = 1;
    trySendData(200).then(function(numByte) {
        console.log('Sent ' + numByte + ' bytes');
        dataQueue = dataQueue.slice(numByte);

        // continue sending data until failure or data queue empty
        sendData();
    }).catch(function(err){
        console.log(err);

        // Stop sending
        sendingInProgress = 0;
    })
}

setInterval( function() {
    if (socket.disconnected) return;

    if (sendingInProgress === 0){
        sendData();
    }
}, 1000);

document.getElementById('files').addEventListener('change', handleFileSelect, false);


document.getElementById('config').addEventListener('change', function (evt) {
    var f = evt.target.files[0];
    loadConfigFile(f);
});

/*
function convertBytesAndSendCommand(byteString) {
    var numByte = byteString.length;
    // convert byte string to array of bytes (in int)
    var byteArray = byteString.split('').map(function(e){return e.codePointAt(0)});
    var command = ['dataTx', numByte].concat(byteArray).join(' ');
    socket.emit('command', command);
}
*/


/******** 
 * Load config file
 ********/

function loadConfigFile(f) {
    var reader = new FileReader();

    reader.onload = function (progressEvent) {
        var lines = this.result.split('\n');

        /*
        var line = 0;
        var timeoutDuration = 100;
        var printAndWait = function(){
            if (line < lines.length) {
                //console.log(lines[line]);
                socket.emit('command', lines[line]);
                line++;
                setTimeout(printAndWait, timeoutDuration);                
            }
        }
        setTimeout(printAndWait, timeoutDuration);
        */
        socket.emit('cfg-file', lines);
    };
    reader.readAsText(f);
}

