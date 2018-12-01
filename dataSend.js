var ReedSolomon = require('./ReedSolomon').ReedSolomon;
var fs = require('fs');

var dataQueue = [];
var maxNumBytePerCommand = 100;
var doneFlag = 0;
var sendingInProgress = 0;

var numRedundant = 20;
var rs = new ReedSolomon(numRedundant);


function addHeaderAndEnqueue(content) {
    // File header length of 6 bytes: [1, 255, length(4 bytes)]
    var l = content.length;
    var header = [1, 255, (l >>> 24)%256, (l >>> 16)%256, (l >>> 8)%256, l%256];
    var data = header.concat(content);
    console.log(data);
    var dataEncoded = rs.encodeByte(data);
    console.log(dataEncoded);

    //socket.emit('sent-data', dataEncoded);

    dataQueue = dataQueue.concat(dataEncoded);

    fs.writeFile('debug_sent.txt', dataEncoded, function(err){});

    console.log(dataQueue);
}

function loadFileInDataQueue(file) {
    var reader = new FileReader();    

    reader.onload = function(f) {
        var content = this.result.split('').map(function(e){return e.codePointAt(0)});
        addHeaderAndEnqueue(content);
    }

    reader.readAsBinaryString(file);
}

function trySendData(timeout) {
    return new Promise( function(resolve, reject) {
        var numByte = (dataQueue.length > maxNumBytePerCommand)? maxNumBytePerCommand : dataQueue.length;
        if (numByte == 0) {
            reject('Data queue empty');
            return;
        }

        //var command = ['dataTx', numByte].concat(dataQueue.slice(0, numByte)).join(' ');
        var command = ['hexTx', numByte].concat(toHexString(dataQueue.slice(0, numByte))).join(' ');
        //socket.emit('command', command);
        serialPortCli.write(command + '\n');

        parserCli.on('data', receiveDone);
        //socket.on('log', receiveDone);

        setTimeout(function() {
            if (doneFlag === 1) {
                resolve(numByte);
            } else {
                var timeoutMessage = 'Timeout for receiving done';
                reject(timeoutMessage);
                console.log(timeoutMessage);
            }
            doneFlag = 0;
            parserCli.removeListener('data', receiveDone);
            //socket.removeListener('log', receiveDone);
        }, timeout)
    });
}

function toHexString(byteArray) {
    return Array.from(byteArray, function(byte) {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('')
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
        //console.log(err);

        // Stop sending
        sendingInProgress = 0;
    })
}

function startDataSend() {
    setInterval( function() {
        if (sendingInProgress === 0){
            sendData();
        }
    }, 100);
}

var serialPortCli;
var parserCli;

function init(port, parser) {
    if (port) {
        serialPortCli = port;
        parserCli = parser;
    } else {
        console.log("Serial connection not provided, could not initiate data sending");
    }
}

exports.init = init;
exports.startDataSend = startDataSend;
exports.addHeaderAndEnqueue = addHeaderAndEnqueue;
