var fs = require('fs');
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var http = require('http').Server(app);
var io = require('socket.io')(http);
//var port = process.env.PORT || 8000;
var port = 8000;

var radar = require('./radarProcess');
var dataSend = require('./dataSend');
var compress_images = require('compress-images');

/********
 * Create serial port connection
 ********/
var serial = require("serialport");
var portNameCli = "COM10";
var portNameData = "COM9";
if (process.argv.length > 2) {
    var portNameCli = process.argv[2];
    if (process.argv.length > 3) {
        var portNameData = process.argv[3];
    } else {
        console.log("Data port not supplied, use default COM9");        
    }   
} else {
    console.log("Config port not supplied, use default COM10");
}


var serialPortCli = new serial(portNameCli, {
    baudRate: 115200,
    autoOpen: true,
});

var serialPortData = new serial(portNameData, {
    baudRate: 921600,
    autoOpen: true,
});
  

const Readline = serial.parsers.Readline;
var parserCli = new Readline();
serialPortCli.pipe(parserCli)

serialPortCli.on("open", function () {
    console.log('open cli port');
});
parserCli.on('data', function (data) {
    console.log(data);
    io.emit('log', data);
})  

  
// Read input from console and send through serial port
var stdin = process.openStdin();
stdin.addListener("data", function(d) {
    serialPortCli.write(d);
});


//const ReadByte = serial.parsers.ByteLength;
//var parserData = new ReadByte( {length: 1024} );
var partialHeader = [2,1,4,3];
var parserData = new serial.parsers.Delimiter( {delimiter: new Buffer(partialHeader) });
serialPortData.pipe(parserData);

/*
parserData.on('data', function (data) {
    console.log(data);
    //for (i = 0; i < data.length; i++) {
    //    console.log(data[i]);
    //}
})  
*/
var dataframe;
parserData.on('data', function(data) {
    // Transform buffer object to byte array and send for processing
    radar.processData( partialHeader.concat([...data]) );
    //console.log(partialHeader.concat([...data]).toString() );
});


serialPortData.on("open", function () {
    console.log('open data port');
});



/********
 * Handle client request
 ********/

app.use(express.static('public'));
app.get('/index.html', function (req, res) {
    res.sendFile( __dirname + "/" + "index.html" );
})
app.get('/client.js', function (req, res) {
    res.sendFile( __dirname + "/" + "client.js" );
})
app.get('/ReedSolomon.js', function (req, res) {
    res.sendFile( __dirname + "/" + "ReedSolomon.js" );
})
app.get('/config.js', function (req, res) {
    res.sendFile( __dirname + "/" + "config.js" );
})

  
http.listen(port, 'localhost', function(){
    console.log('listening on ' + http.address().address + ':' + http.address().port);
});

io.on('connection', function(socket){
    console.log('a user connected');

    socket.on('disconnect', function(){
        console.log('user disconnected');
    });    

    socket.on('command', function(msg){
        console.log('message: ' + msg);
        io.emit('log', msg);
        serialPortCli.write(msg + '\n');
    });
    
    socket.on('uart-open', function(msg){
        if (serialPortCli.isOpen === false) {
            serialPortCli.open();
        };
        if (serialPortData.isOpen === false) {
            serialPortData.open();
        };
        console.log('open');
        io.emit('uart-open');
    });

    socket.on('uart-close', function(msg){
        if (serialPortCli.isOpen === true) {
            serialPortCli.close();
        };
        if (serialPortData.isOpen === true) {
            serialPortData.close();
        };
        console.log('close');
        io.emit('uart-close');
    });
    
    var autoLoad = false;
    var initialized = false;
    var defaultCfgFilename = '../AWR1642\ Application/mmwave_sdk_01_01_00_02/demo/profiles'
                            + '/transmitter/profile_fft_test_hw_trigger_chirp_128_slope_1_tx.cfg';

    if (autoLoad) {
        if (!initialized) {
            fs.readFile(defaultCfgFilename, 'utf8', function(err, data) {
                try {
                    lines = data.split('\n');
                    cliSendLines(lines);

                    initialized = true;
                } catch(e) {
                    console.log("Initialized failed");
                }
            });

        }            
    } else {
        socket.on('cfg-file', function(msg){
            var lines = msg;
            radar.loadCfg(lines);
        
            cliSendLines(lines);
        });    
    }


    socket.on('sent-data', function(data){
        fs.writeFile('debug_sent.txt', data, function(err){});
    });
    socket.on('img-tx', function(msg){
        console.log('received image, size = ' + msg.length);
        //console.log(msg);

        var buf = new Buffer(msg, 'base64');

        // Remove previous compressed files to avoid compress-image malfunction
        try {
            fs.unlinkSync('compress/image_sending.png');
            //console.log('successfully deleted ./compress/image_sending.png');
        } catch (err) {
            // handle the error
            console.log(err);
        }
        fs.writeFile('image_sending.png', buf, function(err){
            if (err) {
                return console.log(err);
            }            

            //sharp('image_sending.png').resize(200).toFile('image_resize.png');
            compress_images('image_sending.png', 'compress/', 
                {compress_force: false, statistic: true, autoupdate: true}, 
                false,
                {jpg: {engine: false, command: false}},
                {png: {engine: 'pngquant', command: ['--quality=20-50']}},
                {svg: {engine: false, command: false}},
                {gif: {engine: false, command: false}}, 
                function(){
                    fs.readFile('compress/image_sending.png', function(err,data){
                        //console.log([...data]);
                        dataSend.addHeaderAndEnqueue([...data]);
                        socket.emit('img-tx', { image: true, buffer: data });
                    });            
                }
            );            
        });
    });

});


function cliSendLines(lines) {
    var line = 0;   
    var timeoutDuration = 100;
    var printAndWait = function(){
        if (line < lines.length) {
            //console.log(lines[line]);
            //socket.emit('command', lines[line]);
            console.log('message: ' + lines[line]);
            io.emit('log', lines[line]);
            serialPortCli.write(lines[line] + '\n');
    
            line++;
            setTimeout(printAndWait, timeoutDuration);                
        }
    }
    setTimeout(printAndWait, timeoutDuration);    
}


radar.init(io);

dataSend.startDataSend();
