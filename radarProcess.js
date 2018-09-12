
var math = require('./math')

var initComplete = false;
var in_process1 = false;
var gDebugStats = 1; //enable stats collection for plots
var trytimeout = 30; //msec
var tprocess1; // defined later
var dataFrameQueue = [];
var dataframe;
var maxNumSubframes = 4;


var NUM_ANGLE_BINS=64;
var platform = 'xWR16xx';
var Params = {
    channelCfg: {}, dataPath: [], profileCfg: [], frameCfg: {}, guiMonitor: [], extendedMaxVelocity: [],
    dfeDataOutputMode: {}, advFrameCfg: {}, subFrameCfg: [], chirpCfg: [], subFrameInfo: [], 
    log2linScale: [], platform: platform, cmdReceivedFlag:{}, numDetectedObj: [],
    dspFftScaleComp2D_lin: [], dspFftScaleComp2D_log: [], 
    dspFftScaleComp1D_lin: [], dspFftScaleComp1D_log: [], dspFftScaleCompAll_lin: [], dspFftScaleCompAll_log: [],
    interFrameProcessingTime: [], transmitOutputTime:[], interFrameProcessingMargin:[], 
    interChirpProcessingMargin:[], activeFrameCPULoad:[],interFrameCPULoad:[], compRxChanCfg: {}, measureRxChanCfg: {}
};
var range_depth = 10;// Required. To be configured
var range_width = 5;// Required. To be configured
var maxRangeProfileYaxis = 2e6;// Optional. To be configured
var debug_mode = 0;
var COLOR_MAP=[[0, 'rgb(0,0,128)'], [1, 'rgb(0,255,255)']];


var radarPlot = {
    x_coord: [1, 2],
    y_coord: [2, 3],
    z_coord: 1,
    range: 1,
    doppler: 1,
    frameToPlot: 0
}


var MyUtil = {
    reshape: function(vec, rows, cols) {
        // matlab column-based reshape: [1:9],3,3 => [1 4 7;2 5 8; 3 6 9]
        // [1:8],4,2 => [1,5;2,6;3,7;4,8]
        var t = [];
        for (var r = 0; r < rows; r++) {
            var row = [];
            for (var c = 0; c < cols; c++) {
                var i = c * rows + r;
                if (i < vec.length) {
                    row.push(vec[i]);
                } 
            }
            t.push(row);
        }
        return t;
    },
    foo: function(t,n,e,r){ 
            function o(){
                function o(){
                    u=Number(new Date),e.apply(a,l)
                }
                function f(){
                    i=void 0
                }
                var a=this,h=Number(new Date)-u,l=arguments;
                r&&!i&&o(),i&&clearTimeout(i),void 0===r&&h>t?o():n!==!0&&(i=setTimeout(r?f:o,void 0===r?t-h:t))
            }
            var i,u=0;
            return"boolean"!=typeof n&&(r=e,e=n,n=void 0),o
    }
}



var getTimeDiff = function (start_timestamp) {
  if (gDebugStats == 1) {
      return   (new Date().getTime() - start_timestamp);
  }
  else
  {
      return 0;
  }
};


var byte_mult = [1, 256, Math.pow(2, 16), Math.pow(2,24)];

var isMagic = function(bytevec, byteVecIdx) {
    if (bytevec.length >= byteVecIdx+8) {
        return (
        bytevec[byteVecIdx+0] == 2 && bytevec[byteVecIdx+1] == 1 &&
        bytevec[byteVecIdx+2] == 4 && bytevec[byteVecIdx+3] == 3 &&
        bytevec[byteVecIdx+4] == 6 && bytevec[byteVecIdx+5] == 5 &&
        bytevec[byteVecIdx+6] == 8 && bytevec[byteVecIdx+7] == 7
        );
    }
    return false;
};

var totalFrameSize = function(bytevec, byteVecIdx) {
    var totalPacketLen = math.sum( math.dotMultiply( bytevec.slice(byteVecIdx, byteVecIdx+4), byte_mult ) );
    return totalPacketLen;
}



var configError = function(errorStr) {
    console.log("ERROR: " + errorStr);
}    




var TLV_type = {
    MMWDEMO_OUTPUT_MSG_DETECTED_POINTS : 1,
    MMWDEMO_OUTPUT_MSG_RANGE_PROFILE : 2,
    MMWDEMO_OUTPUT_MSG_NOISE_PROFILE : 3,
    MMWDEMO_OUTPUT_MSG_AZIMUT_STATIC_HEAT_MAP : 4,
    MMWDEMO_OUTPUT_MSG_RANGE_DOPPLER_HEAT_MAP : 5,
    MMWDEMO_OUTPUT_MSG_STATS : 6,
    MMWDEMO_OUTPUT_MSG_MAX : 7
};
// caution 0-based indexing; ending index not included unless otherwise specified
var process1 = function(bytevec) {
    //check sanity of bytevec
    if ((bytevec.length >= 8+4+4) && isMagic(bytevec, 0))
    {
        /* proceed */
    }
    else
    {
        return;
    }
    
    // Header
    var byteVecIdx = 8; // magic word (4 unit16)
    var numDetectedObj = 0;
    // Version, uint32: MajorNum * 2^24 + MinorNum * 2^16 + BugfixNum * 2^8 + BuildNum
    Params.tlv_version = bytevec.slice(byteVecIdx, byteVecIdx+4);
    Params.tlv_version_uint16 = Params.tlv_version[2]+(Params.tlv_version[3]<<8);
    byteVecIdx += 4;
    
    // Total packet length including header in Bytes, uint32
    var totalPacketLen = math.sum( math.dotMultiply( bytevec.slice(byteVecIdx, byteVecIdx+4), byte_mult ) );
    byteVecIdx += 4;
    if (bytevec.length >= totalPacketLen)
    {
        /* proceed */
    }
    else
    {
        return;
    }
    var start_ts = getTimeDiff(0);
    
    
    //platform type, uint32: 0xA1642 or 0xA1443 
    Params.tlv_platform = math.sum( math.dotMultiply( bytevec.slice(byteVecIdx, byteVecIdx+4), byte_mult ) );
    byteVecIdx += 4;
    
    // Frame number, uint32
    Params.frameNumber = math.sum( math.dotMultiply( bytevec.slice(byteVecIdx, byteVecIdx+4), byte_mult ) );
    byteVecIdx += 4;

    // Time in CPU cycles when the message was created. For AR16xx: DSP CPU cycles, for AR14xx: R4F CPU cycles, uint32
    var timeCpuCycles = math.sum( math.dotMultiply( bytevec.slice(byteVecIdx, byteVecIdx+4), byte_mult ) );
    byteVecIdx += 4;
    
    // Number of detected objects, uint32
    numDetectedObj = math.sum( math.dotMultiply( bytevec.slice(byteVecIdx, byteVecIdx+4), byte_mult ) );
    byteVecIdx += 4;
    
    // Number of TLVs, uint32
    var numTLVs = math.sum( math.dotMultiply( bytevec.slice(byteVecIdx, byteVecIdx+4), byte_mult ) );
    byteVecIdx += 4;

    // subFrame number, uint32
    if ((Params.platform == 'xWR16xx') && (Params.tlv_version_uint16 >= 0x0101))
    {
        Params.currentSubFrameNumber = math.sum( math.dotMultiply( bytevec.slice(byteVecIdx, byteVecIdx+4), byte_mult ) );
        byteVecIdx += 4;
        if (Params.dfeDataOutputMode.mode != 3)
        {
            /*make sure this is set to zero when legacy frame is used*/
            Params.currentSubFrameNumber = 0;
        }
    }
    else
    {
        Params.currentSubFrameNumber = 0;
    }
    Params.numDetectedObj[Params.currentSubFrameNumber] = numDetectedObj;
    
    var detObjRes = {};
    
    // Start of TLVs
    //console.log("got number subf=%d and numTLVs=%d tlvtype=%d",Params.currentSubFrameNumber,numTLVs);
    for (var tlvidx=0; tlvidx<numTLVs; tlvidx++) {
        var tlvtype = math.sum( math.dotMultiply( bytevec.slice(byteVecIdx, byteVecIdx+4), byte_mult ) );
        byteVecIdx += 4;
        var tlvlength = math.sum( math.dotMultiply( bytevec.slice(byteVecIdx, byteVecIdx+4), byte_mult ) );
        byteVecIdx += 4;
	    var start_tlv_ticks = getTimeDiff(0);
        // tlv payload
        if (tlvtype == TLV_type.MMWDEMO_OUTPUT_MSG_DETECTED_POINTS) {	    
            // will not get this type if numDetectedObj == 0 even though gui monitor selects this type
            detObjRes = processDetectedPoints(bytevec, byteVecIdx, Params);
	        //gatherParamStats(Params.plot.scatterStats,getTimeDiff(start_tlv_ticks));
        } else if (tlvtype == TLV_type.MMWDEMO_OUTPUT_MSG_RANGE_PROFILE) {
            processRangeNoiseProfile(bytevec, byteVecIdx, Params, true, detObjRes);
	        //gatherParamStats(Params.plot.rangeStats,getTimeDiff(start_tlv_ticks));
        } else if (tlvtype == TLV_type.MMWDEMO_OUTPUT_MSG_NOISE_PROFILE) {
            processRangeNoiseProfile(bytevec, byteVecIdx, Params, false);
	        //gatherParamStats(Params.plot.noiseStats,getTimeDiff(start_tlv_ticks));
        } else if (tlvtype == TLV_type.MMWDEMO_OUTPUT_MSG_AZIMUT_STATIC_HEAT_MAP) {
            processAzimuthHeatMap(bytevec, byteVecIdx, Params);
	        //gatherParamStats(Params.plot.azimuthStats,getTimeDiff(start_tlv_ticks));
        } else if (tlvtype == TLV_type.MMWDEMO_OUTPUT_MSG_RANGE_DOPPLER_HEAT_MAP) {
            processRangeDopplerHeatMap(bytevec, byteVecIdx, Params);
	        //gatherParamStats(Params.plot.dopplerStats,getTimeDiff(start_tlv_ticks));
        } else if (tlvtype == TLV_type.MMWDEMO_OUTPUT_MSG_STATS) {
            processStatistics(bytevec, byteVecIdx, Params);
	        //gatherParamStats(Params.plot.cpuloadStats,getTimeDiff(start_tlv_ticks));
        }
        byteVecIdx += tlvlength;
    }
    
    /*Make sure that scatter plot is updated when advanced frame config
      is used even when there is no data for this subframe*/
    if ((Params.dfeDataOutputMode.mode == 3) && ((Params.numDetectedObj[Params.currentSubFrameNumber] == 0)
        ||(Params.guiMonitor[Params.currentSubFrameNumber].detectedObjects == 0)))
    {
	    var start_tlv_ticks = getTimeDiff(0);
        Params.subFrameNoDataFlag = 1;
        processDetectedPoints(undefined, undefined, Params);
	    //gatherParamStats(Params.plot.scatterStats,getTimeDiff(start_tlv_ticks));
    }  
    
    //gatherParamStats(Params.plot.processFrameStats,getTimeDiff(start_ts));


    /*
    var curPlotServiced = Params.frameNumber;
    if (Params.dfeDataOutputMode.mode == 3) {
	    curPlotServiced = Params.frameNumber*Params.advFrameCfg.numOfSubFrames + Params.currentSubFrameNumber;
    } 
    if (Params.plot.lastPlotServiced == 0)
    {
        Params.plot.lastPlotServiced = (curPlotServiced-1);
    }
    Params.plot.droppedFrames += curPlotServiced - (Params.plot.lastPlotServiced+1); 
    Params.plot.lastPlotServiced = curPlotServiced;
    
    if (Params.plot.processFrameStats.accumTotalCnt > 100) {
        var periodicity = getFramePeriodicty(Params.currentSubFrameNumber);
        if (Params.plot.processFrameStats.avg > (periodicity)) {
            updateToast('Performance Degradation seen: Reduce number of plots or decrease frame rate');
        }
    }
    */
      
};



var xFrameCoord=[];
var yFrameCoord=[];
var zFrameCoord=[];
var frameRange=[];
var frameDoppler=[];
var lastFramePlotted = 0;
var lastFrameSaved = 0;

var resetScatterPlotArrays = function()
{
    xFrameCoord  = [];
    yFrameCoord  = [];
    frameRange   = [];
    frameDoppler = [];
}

/*This function plots the scattered plot and range-doppler plot.
Legacy frame:
It will plot scattered plot if guiMonitor.detectedObjects is enabled.
If range doppler heat map is not enabled it will plot the range-dopler plot.

Advanced frame:
It will plot scattered plot always.
If range doppler heat map is not enabled for the one subframe that has selected the extra plots
it will plot the range-dopler plot.
*/
var plotScatterpoints = function(x_coord,y_coord,z_coord,range,doppler,plotEmpty,frameToPlot,numDetectedObj) {
    var plot_elapsed_time = {}; // for profile this code only
    var start_time = new Date().getTime();
    
    radarPlot.x_coord = x_coord;
    radarPlot.y_coord = y_coord;
    radarPlot.z_coord = z_coord;
    radarPlot.range = range;
    radarPlot.doppler = doppler;
    radarPlot.numDetectedObj = numDetectedObj;

    // Send out data for client to plot
    if (socket) {
        socket.emit('plot-radar', radarPlot);
    }


    plot_elapsed_time.scatterPlot = new Date().getTime() - start_time;
    plot_elapsed_time.rangeDopplerPlot = plot_elapsed_time.scatterPlot;

    lastFramePlotted = frameToPlot;
    //resetScatterPlotArrays();
    return plot_elapsed_time;
}


var processDetectedPoints = function(bytevec, byteVecIdx, Params) {
    var elapsed_time = {}; // for profile this code only
    var rangeIdx, dopplerIdx, numDetectedObj = 0, xyzQFormat;
    var subFrameNum = Params.currentSubFrameNumber;
    var dummyArr = [];
    var proc_start_time = new Date().getTime();
        
/*
    // TODO: temp values, update with parseCfg()
    Params.dataPath[subFrameNum].rangeIdxToMeters = 1;
    Params.dataPath[subFrameNum].numDopplerBins = 512;
    Params.dataPath[subFrameNum].dopplerResolutionMps = 1;
*/


    /*Check if we need to redraw the plot now because we missed
    some subframe (either because it was dropped in the socket
    or because there was nothing detected in the subframe.
    Valid only for advanced frame config.*/
    if (Params.dfeDataOutputMode.mode == 3)
    {
        if ((Params.frameNumber > lastFramePlotted + 1) && (lastFrameSaved<Params.frameNumber))
        {
            plotScatterpoints(xFrameCoord,yFrameCoord,dummyArr,frameRange,frameDoppler,0,lastFrameSaved,numDetectedObj);
        }
    }

    if (bytevec) {
        // MmwDemo_output_message_dataObjDescr
        //  Number of detected objects, uint16
        numDetectedObj = math.sum( math.dotMultiply( bytevec.slice(byteVecIdx, byteVecIdx+2), [1, 256] ) );
        byteVecIdx += 2;
        //  Q format of detected objects x/y/z coordinates, uint16
        xyzQFormat = Math.pow(2,math.sum( math.dotMultiply( bytevec.slice(byteVecIdx, byteVecIdx+2),  [1, 256] ) ));
        byteVecIdx += 2;
    }
    // list of detected objects, each is
    //typedef volatile struct MmwDemo_detectedObj_t {
    //    uint16_t   rangeIdx;     Range index
    //    uint16_t   dopplerIdx;   Dopler index
    //    uint16_t  peakVal;       Peak value
    //    int16_t  x;              x - coordinate in meters. Q format depends on the range resolution
    //    int16_t  y;              y - coordinate in meters. Q format depends on the range resolution
    //    int16_t  z;              z - coordinate in meters. Q format depends on the range resolution
    //}
    var sizeofObj = 12; // size of MmwDemo_detectedObj_t in bytes

    if (numDetectedObj > 0) {
        var x = bytevec.slice(byteVecIdx, byteVecIdx+ sizeofObj*numDetectedObj);
        x = MyUtil.reshape(x, sizeofObj, numDetectedObj);
        // convert range index to range (in meters)
        rangeIdx = math.add(x[0], math.multiply(x[1], 256));
        var range = math.map(rangeIdx, function(value) {
            return value*Params.dataPath[subFrameNum].rangeIdxToMeters; 
        });
        //circshift the doppler fft bins
        dopplerIdx = math.add(x[2], math.multiply(x[3], 256));
        if (Params.tlv_version_uint16 > 0x0100) {
            math.forEach(dopplerIdx, function(value, idx, ary) {
                if (value > 32767) {
                    ary[idx] = ary[idx]-65536;
                }
            });
        } else {
            math.forEach(dopplerIdx, function(value, idx, ary) {
                if (value > Params.dataPath[subFrameNum].numDopplerBins/2-1) {
                    ary[idx] = ary[idx]-Params.dataPath[subFrameNum].numDopplerBins;
                }
            });
            
        }
        // convert doppler index to doppler (meters/sec)
        var doppler = math.map(dopplerIdx, function(value, idx, ary) {
            return value*Params.dataPath[subFrameNum].dopplerResolutionMps;
        });
        // peak value
        var peakVal = math.add(x[4], math.multiply(x[5], 256));
        var peakValLog = math.map(peakVal, function(value) {
            return Math.round(10*math.log10(1+value));
        });
        // x_coord, y_coord, z_coord
        var x_coord = math.add(x[6], math.multiply(x[7], 256));
        var y_coord = math.add(x[8], math.multiply(x[9], 256));
        var z_coord = math.add(x[10], math.multiply(x[11], 256));
        var xyz = [x_coord, y_coord, z_coord];
        for (var xyzidx=0; xyzidx<xyz.length; xyzidx++) {
            math.forEach(xyz[xyzidx], function(value, idx, ary) {
                if (value > 32767) { value = value - 65536; }
                ary[idx] = value/xyzQFormat;
            });
        }
        range = math.sqrt(math.add(math.dotMultiply(z_coord,z_coord),math.add(math.dotMultiply(x_coord,x_coord),math.dotMultiply(y_coord,y_coord))));
        if(Params.dfeDataOutputMode.mode == 3)
        {
            lastFrameSaved = Params.frameNumber;
            /*This is advanced frame config. Need to plot objects
            detected in all subframes*/
            if(Params.currentSubFrameNumber == 0)
            {
                /*start list of objects with data from subframe zero*/
                xFrameCoord = x_coord;
                yFrameCoord = y_coord;
                zFrameCoord = z_coord;
                frameRange = range;
                frameDoppler = doppler;
            }
            else
            {
                /*append list of objects with data from subframe N=1,2,3*/
                xFrameCoord = xFrameCoord.concat(x_coord);
                yFrameCoord = yFrameCoord.concat(y_coord);
                zFrameCoord = zFrameCoord.concat(z_coord);
                frameRange = frameRange.concat(range);
                frameDoppler = frameDoppler.concat(doppler)
            }
            /*redraw only in the last subframe*/
            /*cant redraw only in last subframe because maybe there is no data
                for the last subframe and in that case this function is not even
                called and the previous subframes wont be plotted. Need to redraw
                in every subframe. Can not redraw in every subframe either because
                subframes 1,2,3 will be blinking as they will have value zero until
                it gets to that subframe.*/
            if((Params.currentSubFrameNumber == Params.advFrameCfg.numOfSubFrames-1))
            {
                elapsed_time = plotScatterpoints(xFrameCoord,yFrameCoord,dummyArr,frameRange,frameDoppler,0,Params.frameNumber,numDetectedObj);
            }
        }
        else 
        {
            elapsed_time = plotScatterpoints(x_coord,y_coord,z_coord,range,doppler,1,Params.frameNumber,numDetectedObj);
        }
    } else {
        if(Params.dfeDataOutputMode.mode != 3) {
            elapsed_time = plotScatterpoints(dummyArr,dummyArr,dummyArr,dummyArr,dummyArr,1,Params.frameNumber,numDetectedObj);
        } else {
            if(Params.currentSubFrameNumber == Params.advFrameCfg.numOfSubFrames-1)
            {
                elapsed_time = plotScatterpoints(xFrameCoord,yFrameCoord,dummyArr,frameRange,frameDoppler,0,Params.frameNumber,numDetectedObj);
            }
        }
    }

    elapsed_time.total_det_obj_process = new Date().getTime() - proc_start_time;
    return {rangeIdx: rangeIdx, dopplerIdx: dopplerIdx, numDetectedObj: numDetectedObj}
};


var processRangeNoiseProfile = function(bytevec, byteVecIdx, Params, isRangeProfile, detObjRes) {

    var subFrameNum = Params.currentSubFrameNumber;
    //var numRangeBin = Params.dataPath[subFrameNum].numRangeBins;
    var numRangeBin = 256;

    if (isRangeProfile == false && Params.guiMonitor[subFrameNum].noiseProfile != 1) return;

    // %bytes corresponding to range profile are in rp
    var rp = bytevec.slice(byteVecIdx, byteVecIdx+numRangeBin*2);
    rp = math.add(
        math.subset(rp, math.index(math.range(0,numRangeBin*2,2))), 
        math.multiply(math.subset(rp, math.index(math.range(1,numRangeBin*2,2))), 256)
    );

    /*
    if (Params.rangeProfileLogScale == false) {
        math.forEach(rp, function(value, idx, ary) {
            ary[idx] = Params.dspFftScaleCompAll_lin[subFrameNum] * Math.pow(2,value*Params.log2linScale[subFrameNum]);
        });
    } else {
        math.forEach(rp, function(value, idx, ary) {
            ary[idx] = value*Params.log2linScale[subFrameNum]*Params.toDB  + Params.dspFftScaleCompAll_log[subFrameNum];
        });
    }
    */
    var rp_x = math.range(0,numRangeBin);
    /*
    var rp_x = math.multiply(math.range(0,numRangeBin), Params.dataPath[subFrameNum].rangeIdxToMeters).valueOf();
    rp_x = math.subtract(rp_x,Params.compRxChanCfg.rangeBias); //correct regardless of state (measurement or compensation)
    math.forEach(rp_x, function(value, idx, ary) {
                    ary[idx] = math.max(ary[idx],0);
            });
    */
        
    var update = {x:[],y:[]};

    
    update.x = rp_x.valueOf();
    update.y = rp.valueOf();


    // Send out data for client to plot
    if (socket) {
        socket.emit('plot-range-profile', update);
    }
    


}

var processAzimuthHeatMap = function(bytevec, byteVecIdx, Params) {
}

var processStatistics = function(bytevec, byteVecIdx, Params) {
}

var extractDataFrame = function (dataframe_in) {
    var dataframe_process = dataframe_in.slice(0,Params.total_payload_size_bytes);
    //if (initComplete === true && in_process1 === false && onPlotsTab == true && tprocess1) {
    if (initComplete === true && tprocess1) {
            dataFrameQueue.push(dataframe_process);
            lastCorrectFrame = dataframe_process;
    }
    var dataframe_out=dataframe_in.slice(Params.total_payload_size_bytes,dataframe_in.length);
    
    return dataframe_out;
}

var errorFrameCount = 0;
var lastCorrectFrame;

var processData = function (data){
    if (data) {
        var numDataFrameAdded = 0;

        console.log("Received " + data.length + " bytes");

        if (dataframe) {
            Array.prototype.push.apply(dataframe, data);
        } else {
            if (data.length >= 8+4+4 && isMagic(data, 0)) {
                dataframe = data.slice(0);
            }
        }

        // Now split the accumulated dataframe into bytevec that can be given to process1
        while (dataframe.length>0) {
            // start of the remainder dataframe should start with magic else drop the accumulated frame
            if (dataframe.length >= 8+4+4 && isMagic(dataframe, 0)) {
                Params.total_payload_size_bytes = totalFrameSize(dataframe, 8+4);
            } else {
                if (errorFrameCount < 1) {
                    console.log("Header error");
                    console.log("Last correct")
                    console.log(lastCorrectFrame.toString());
                    console.log("Error frame length" + dataframe.length);
                    console.log(dataframe.toString());
                    errorFrameCount++;
                }
                dataframe = [];
                Params.total_payload_size_bytes = 0;
            }
            if (dataframe.length >= Params.total_payload_size_bytes) {
                // this function will push one bytevec worth of data to the queue and return remaining bytes 
                dataframe = extractDataFrame(dataframe);   
                numDataFrameAdded++;
                console.log(Params.total_payload_size_bytes);
                /*
                if (socket) {
                    socket.emit('plot-radar', radarPlot);
                }
                */
            } else {
                break;
            }
        }

        
        // Now check if we have bytevec's queued up
        if (dataFrameQueue.length>0 && initComplete === true) {
            //if (in_process1 === false && onPlotsTab == true && tprocess1) {
            if (in_process1 === false && tprocess1) {
                try {
                    var cnt;
                    /*
                    if (Params.plot) {
                        if (Params.plot.dataFrames>0) {
                            gatherParamStats(Params.plot.dataStats,getTimeDiff(dataframe_start_ts));
                        }
                        dataframe_start_ts = getTimeDiff(0);
                        Params.plot.dataFrames++;
                    }
                    */
                    in_process1 = true;
                    //if we added more than one bytevec in this run, we should queue it up for process1
                    //else let data interrupts help drain the queue
                    for (cnt = 0; cnt < numDataFrameAdded; cnt++) { 
                        var dataframe_process = dataFrameQueue.shift();
                        if (dataframe_process && dataframe_process.length>0) {
                            tprocess1(dataframe_process);
                        }
                    }
                } finally {
                    in_process1 = false; 
                    // need to refactor, the global Params is not a good idea. 
                    //we may hit exception when changing global Params and so in_process1 never flipped to false
                }
            }
        }

    }

}

var socket;

function init(io) {
    initComplete = true;
    tprocess1 = MyUtil.foo(trytimeout, process1);

    Params = parseCfg([], 'xWR16xx', 0x0100);

    if (io) {
        socket = io;
    } else {
        console.log("Socket not provided, plotting may not be functioning");
    }
}



function loadCfg(lines) {
    var tempParams = parseCfg(lines, 'xWR16xx', 0x0100);
    if(tempParams.configErrorFlag == 1)
    {
        return;
    }    

    /*save to global params*/
    Params = tempParams;    
}


module.exports = {
    processData: processData,
    loadCfg: loadCfg,
    init: init
};




var mmwInput = {
    Platform: {
        xWR14xx: 'xWR14xx',
        xWR16xx: 'xWR16xx'
    }
}

var parseCfg = function(lines, platform, sdkVersionUint16) {
    var P = {channelCfg: {}, dataPath: [], profileCfg: [], frameCfg: {}, guiMonitor: [], extendedMaxVelocity: [],
             dfeDataOutputMode: {}, advFrameCfg: {}, subFrameCfg: [], chirpCfg: [], subFrameInfo: [], 
             log2linScale: [], platform: platform, cmdReceivedFlag:{}, numDetectedObj: [],
             dspFftScaleComp2D_lin: [], dspFftScaleComp2D_log: [], 
             dspFftScaleComp1D_lin: [], dspFftScaleComp1D_log: [], dspFftScaleCompAll_lin: [], dspFftScaleCompAll_log: [],
             interFrameProcessingTime: [], transmitOutputTime:[], interFrameProcessingMargin:[], 
             interChirpProcessingMargin:[], activeFrameCPULoad:[],interFrameCPULoad:[], compRxChanCfg: {}, measureRxChanCfg: {}
    };           

    dataFrameQueue = [];
    
    /*initialize variables*/       
    for(var i=0;i<maxNumSubframes;i++)
    {
        /*data path*/
        P.dataPath[i] = {
        numTxAzimAnt           :0,
        numTxElevAnt           :0,
        numRxAnt               :0,
        azimuthResolution      :0, 
        numChirpsPerFrame      :0,
        numDopplerBins         :0,
        numRangeBins           :0,
        rangeResolutionMeters  :0,
        rangeMeters            :0,
        velocityMps            :0,
        dopplerResolutionMps   :0};
        
        /*log2lin*/
        P.log2linScale[i]=0;
        
        /*max vel*/
        P.extendedMaxVelocity[i] = {
        enable :0};
        
        /*gui monitor*/
        P.guiMonitor[i] = {
        subFrameIdx         :0,
        detectedObjects     :0,
        logMagRange         :0,
        noiseProfile        :0,
        rangeAzimuthHeatMap :0,
        rangeDopplerHeatMap :0,
        statsInfo           :0};
        
    }    
    
    P.dfeDataOutputMode.mode = 0;
    P.configErrorFlag = 0;

    profileCfgCounter = 0;
    chirpCfgCounter = 0;

    for (var idx=0; idx<lines.length; idx++) {
        var tokens = lines[idx].split(/\s+/);
        if (tokens[0] == 'channelCfg') {
            setCmdReceivedFlag(P, 0, platform, tokens[0]); 
            P.channelCfg.txChannelEn = parseInt(tokens[2]);
            /*There is always only one channelCfg command.*/
            if (platform == mmwInput.Platform.xWR14xx) {
                P.channelCfg.numTxAzimAnt = ((P.channelCfg.txChannelEn<<0)&1) +
                                          ((P.channelCfg.txChannelEn>>2)&1);
                P.channelCfg.numTxElevAnt = ((P.channelCfg.txChannelEn>>1)&1);
            } else if (platform == mmwInput.Platform.xWR16xx) {
                P.channelCfg.numTxAzimAnt = ((P.channelCfg.txChannelEn<<0)&1) +
                                              ((P.channelCfg.txChannelEn>>1)&1);
                P.channelCfg.numTxElevAnt = 0;
            }
            P.channelCfg.rxChannelEn = parseInt(tokens[1]);
            P.channelCfg.numRxAnt = ((P.channelCfg.rxChannelEn<<0)&1) +
                                    ((P.channelCfg.rxChannelEn>>1)&1) +
                                    ((P.channelCfg.rxChannelEn>>2)&1) +
                                    ((P.channelCfg.rxChannelEn>>3)&1);
            
        } else if (tokens[0] == 'profileCfg') {
            P.profileCfg[profileCfgCounter] = {
            profileId : parseInt(tokens[1]),
            startFreq : parseFloat(tokens[2]),
            idleTime : parseFloat(tokens[3]),
            rampEndTime : parseFloat(tokens[5]),
            freqSlopeConst : parseFloat(tokens[8]),
            numAdcSamples : parseInt(tokens[10]),
            digOutSampleRate : parseInt(tokens[11])}
            
            profileCfgCounter++;
            setCmdReceivedFlag(P, 0, platform, tokens[0]);
        } else if (tokens[0] == 'chirpCfg') {
            P.chirpCfg[chirpCfgCounter] = {
            startIdx : parseInt(tokens[1]),
            endIdx : parseInt(tokens[2]),
            profileId : parseInt(tokens[3]),
            txEnable : parseInt(tokens[8]),
            numTxAzimAnt : 0}

            //MMWSDK-507
            if (platform == mmwInput.Platform.xWR14xx) {
                if (P.chirpCfg[chirpCfgCounter].txEnable == 5) {
                    P.chirpCfg[chirpCfgCounter].numTxAzimAnt = 1; //Non-MIMO - this overrides the channelCfg derived values
                }
            } else if (platform == mmwInput.Platform.xWR16xx) {
                if (P.chirpCfg[chirpCfgCounter].txEnable == 3) {
                    P.chirpCfg[chirpCfgCounter].numTxAzimAnt = 1; //Non-MIMO  - this overrides the channelCfg derived values
                } 
            }
            
            chirpCfgCounter++;
            setCmdReceivedFlag(P, 0, platform, tokens[0]);
        } else if (tokens[0] == 'frameCfg') {
            if(P.dfeDataOutputMode.mode != 1)
            {
                configError("frameCfg can only be used with dfeDataOutputMode 1");
                P.configErrorFlag = 1;
                return P;
            }
            P.frameCfg.chirpStartIdx = parseInt(tokens[1]);
            P.frameCfg.chirpEndIdx = parseInt(tokens[2]);
            P.frameCfg.numLoops = parseInt(tokens[3]);
            P.frameCfg.numFrames = parseInt(tokens[4]);
            P.frameCfg.framePeriodicity = parseFloat(tokens[5]);
            setCmdReceivedFlag(P, 0, platform, tokens[0]);
        } else if (tokens[0] == 'extendedMaxVelocity') {
            if(checkSubFrameIdx(P, parseInt(tokens[1]), platform, sdkVersionUint16, "extendedMaxVelocity") == -1)
            {
                /*return error*/
                P.configErrorFlag = 1;
                return P;
            }
            if(tokens.length != 3)
            {
                configError("extendedMaxVelocity invalid number of arguments");
                P.configErrorFlag = 1;
                return P;
            }
            var subFrameMaxVel = parseInt(tokens[1]);
            if(subFrameMaxVel == -1)
            {
               /*This is a 'broadcast to all subframes' configuration*/
               for(var maxVelIdx = 0; maxVelIdx < maxNumSubframes; maxVelIdx++)
               {
                   P.extendedMaxVelocity[maxVelIdx].enable = parseInt(tokens[2]);
               }
            }
            else
            {
                 P.extendedMaxVelocity[subFrameMaxVel].enable = parseInt(tokens[2]);
            }
            setCmdReceivedFlag(P, parseInt(tokens[1]), platform, tokens[0]); 
        } else if (tokens[0] == 'guiMonitor') {
            if ((platform == mmwInput.Platform.xWR14xx) || (sdkVersionUint16 == 0x0100))
            {
                if(tokens.length != 7)
                {
                    configError("guiMonitor invalid number of arguments");
                    P.configErrorFlag = 1;
                    return P;
                }
                
                P.guiMonitor[0] = {
                detectedObjects     : parseInt(tokens[1]),
                logMagRange         : parseInt(tokens[2]),
                noiseProfile        : parseInt(tokens[3]),
                rangeAzimuthHeatMap : parseInt(tokens[4]),
                rangeDopplerHeatMap : parseInt(tokens[5]),
                statsInfo           : parseInt(tokens[6])};
            }    
            else if (platform == mmwInput.Platform.xWR16xx)
            {          
                if(tokens.length != 8)
                {
                    configError("guiMonitor invalid number of arguments");
                    P.configErrorFlag = 1;
                    return P;
                }
                /*GUI monitor for subframe N is stored in array positon N.
                  If GUI monitor command is sent with subframe -1, configuration
                  is copied in all subframes 0-maxNumSubframes*/                  
                var guiMonIdx = parseInt(tokens[1]);
                
                if(checkSubFrameIdx(P, guiMonIdx, platform, sdkVersionUint16, "guiMonitor") == -1)
                {
                    /*return error*/
                    P.configErrorFlag = 1;
                    return P;
                }
                
                if(guiMonIdx == -1)
                {
                   /*This is a 'broadcast to all subframes' configuration*/
                   for(var guiIdx = 0; guiIdx < maxNumSubframes; guiIdx++)
                   {
                        P.guiMonitor[guiIdx] = {
                        subFrameIdx         : parseInt(tokens[1]),
                        detectedObjects     : parseInt(tokens[2]),
                        logMagRange         : parseInt(tokens[3]),
                        noiseProfile        : parseInt(tokens[4]),
                        rangeAzimuthHeatMap : parseInt(tokens[5]),
                        rangeDopplerHeatMap : parseInt(tokens[6]),
                        statsInfo           : parseInt(tokens[7])};

                   }
                }
                else
                {
                        P.guiMonitor[guiMonIdx] = {
                        subFrameIdx         : parseInt(tokens[1]),
                        detectedObjects     : parseInt(tokens[2]),
                        logMagRange         : parseInt(tokens[3]),
                        noiseProfile        : parseInt(tokens[4]),
                        rangeAzimuthHeatMap : parseInt(tokens[5]),
                        rangeDopplerHeatMap : parseInt(tokens[6]),
                        statsInfo           : parseInt(tokens[7])};
                }               

            }
            setCmdReceivedFlag(P, parseInt(tokens[1]), platform, tokens[0]);
        }else if (tokens[0] == 'dfeDataOutputMode') {
                setCmdReceivedFlag(P, 0, platform, tokens[0]); 
                if(tokens.length != 2)
                {
                    configError("dfeDataOutputMode invalid number of arguments");
                    P.configErrorFlag = 1;
                    return P;
                }
                P.dfeDataOutputMode.mode = parseInt(tokens[1]);
        }else if (tokens[0] == 'advFrameCfg') {
                if(tokens.length != 6)
                {
                    configError("advFrameCfg invalid number of arguments");
                    P.configErrorFlag = 1;
                    return P;
                }
               if(P.dfeDataOutputMode.mode != 3)
               {
                   configError("advFrameCfg must use dfeDataOutputMode 3");
                   P.configErrorFlag = 1;
                   return P;
               }
               P.advFrameCfg.numOfSubFrames = parseInt(tokens[1]);
               P.advFrameCfg.forceProfile = parseInt(tokens[2]);
               P.advFrameCfg.numFrames = parseInt(tokens[3]);
               P.advFrameCfg.triggerSelect = parseInt(tokens[4]);
               P.advFrameCfg.frameTrigDelay = parseInt(tokens[5]);
               if(P.advFrameCfg.numOfSubFrames > maxNumSubframes)
               {
                   configError("advFrameCfg: Maximum number of subframes is 4");
                   P.configErrorFlag = 1;
                   return P;
               }
               setCmdReceivedFlag(P, 0, platform, tokens[0]);

        }else if (tokens[0] == 'subFrameCfg') {
                if(tokens.length != 11)
                {
                    configError("subFrameCfg invalid number of arguments");
                    P.configErrorFlag = 1;
                    return P;
                }

                if(P.dfeDataOutputMode.mode != 3)
                {
                    configError("subFrameCfg is allowed only in advFrameCfg mode and must use dfeDataOutputMode 3");
                    P.configErrorFlag = 1;
                    return P;
                }
                var subFrameNumLocal = parseInt(tokens[1]);
                if(subFrameNumLocal >= maxNumSubframes)
                {
                    configError("Bad subframe config:Invalid subframe number");
                    P.configErrorFlag = 1;
                    return P;                    
                }
                P.subFrameCfg[subFrameNumLocal] = {
                forceProfileIdx : parseInt(tokens[2]),
                chirpStartIdx : parseInt(tokens[3]),
                numOfChirps : parseInt(tokens[4]),
                numLoops : parseInt(tokens[5]),
                burstPeriodicity : parseFloat(tokens[6]),
                chirpStartIdxOffset : parseInt(tokens[7]),
                numOfBurst : parseInt(tokens[8]),
                numOfBurstLoops : parseInt(tokens[9]),
                subFramePeriodicity : parseFloat(tokens[10])
                }

                if(P.subFrameCfg[subFrameNumLocal].numOfBurst != 1)
                {
                    configError("Bad subframe config: numOfBurst must be 1");
                    P.configErrorFlag = 1;
                    return P;                    
                }
                if(P.subFrameCfg[subFrameNumLocal].numOfBurstLoops != 1)
                {
                    configError("Bad subframe config: numOfBurstLoops must be 1");
                    P.configErrorFlag = 1;
                    return P;                    
                }
                setCmdReceivedFlag(P, subFrameNumLocal, platform, tokens[0]);
        }
        else if(tokens[0] == 'cfarCfg')
        {
            var localSubframe = parseInt(tokens[1]);
            var checkTokenLength = 9;
            if((platform == mmwInput.Platform.xWR14xx) || (sdkVersionUint16 == 0x0100)) 
            {
            checkTokenLength = 8;
            }
            if (tokens.length != checkTokenLength)
            {
              configError("cfarCfg invalid number of arguments");
              P.configErrorFlag = 1;
              return P;
            }
            if(checkSubFrameIdx(P, parseInt(tokens[1]), platform, sdkVersionUint16, "cfarCfg") == -1)
            {
              /*return error*/
              P.configErrorFlag = 1;
              return P;
            }
            setCmdReceivedFlag(P, localSubframe, platform, tokens[0]);
        }
        else if (tokens[0] == 'compRangeBiasAndRxChanPhase') {        
            var checkTokenLength = 18; /*2*4*2+1+1;*/
            if(platform == mmwInput.Platform.xWR14xx) 
            {
                checkTokenLength = 26;/*3*4*2+1+1;*/
            }
            if (tokens.length != checkTokenLength)
            {
              configError("compRangeBiasAndRxChanPhase invalid number of arguments");
              P.configErrorFlag = 1;
              return P;
            }
            
            P.compRxChanCfg.rangeBias = parseFloat(tokens[1]);
            
            setCmdReceivedFlag(P, 0, platform, tokens[0]); 
        } 
        else if (tokens[0] == 'measureRangeBiasAndRxChanPhase') {                 
            if (tokens.length != 4)
            {
              configError("measureRangeBiasAndRxChanPhase invalid number of arguments");
              P.configErrorFlag = 1;
              return P;
            }           
            P.measureRxChanCfg.enabled = parseInt(tokens[1]); //0 - compensation; 1- measurement
            setCmdReceivedFlag(P, 0, platform, tokens[0]); 
        } 
        else if(tokens[0] == 'peakGrouping')
        {
            var localSubframe = parseInt(tokens[1]);
            var checkTokenLength = 7;
            if((platform == mmwInput.Platform.xWR14xx) || (sdkVersionUint16 == 0x0100)) 
            {
                checkTokenLength = 6;
            }
            if (tokens.length != checkTokenLength)
            {
                configError("peakGrouping invalid number of arguments");
                P.configErrorFlag = 1;
                return P;
            }
            if(checkSubFrameIdx(P, parseInt(tokens[1]), platform, sdkVersionUint16, "peakGrouping") == -1)
            {
                /*return error*/
                P.configErrorFlag = 1;
                return P;
            }
            setCmdReceivedFlag(P, localSubframe, platform, tokens[0]);
        }
        else if(tokens[0] == 'multiObjBeamForming')
        {
            var localSubframe = parseInt(tokens[1]);
            var checkTokenLength = 4;
            if((platform == mmwInput.Platform.xWR14xx) || (sdkVersionUint16 == 0x0100)) 
            {
                checkTokenLength = 3;
            }
            if (tokens.length != checkTokenLength)
            {
              configError("multiObjBeamForming invalid number of arguments");
              P.configErrorFlag = 1;
              return P;
            }
            if(checkSubFrameIdx(P, parseInt(tokens[1]), platform, sdkVersionUint16, "multiObjBeamForming") == -1)
            {
              /*return error*/
              P.configErrorFlag = 1;
              return P;
            }
            setCmdReceivedFlag(P, localSubframe, platform, tokens[0]);
        }
        else if(tokens[0] == 'calibDcRangeSig')
        {
            var localSubframe = parseInt(tokens[1]);
            var checkTokenLength = 6;
            if((platform == mmwInput.Platform.xWR14xx) || (sdkVersionUint16 == 0x0100)) 
            {
                checkTokenLength = 5;
            }
            if (tokens.length != checkTokenLength)
            {
              configError("calibDcRangeSig invalid number of arguments");
              P.configErrorFlag = 1;
              return P;
            }
            if(checkSubFrameIdx(P, parseInt(tokens[1]), platform, sdkVersionUint16, "calibDcRangeSig") == -1)
            {
              /*return error*/
              P.configErrorFlag = 1;
              return P;
            }
            setCmdReceivedFlag(P, localSubframe, platform, tokens[0]);
        }
        else if(tokens[0] == 'adcbufCfg')
        {
            var localSubframe = parseInt(tokens[1]);
            var checkTokenLength = 6;
            if((platform == mmwInput.Platform.xWR14xx) || (sdkVersionUint16 == 0x0100)) 
            {
                checkTokenLength = 5;
            }
            if (tokens.length != checkTokenLength)
            {
                configError("adcbufCfg invalid number of arguments");
                P.configErrorFlag = 1;
                return P;
            }
            
            if(checkSubFrameIdx(P, localSubframe, platform, sdkVersionUint16, "adcbufCfg") == -1)
            {
                /*return error*/
                P.configErrorFlag = 1;
                return P;
            }
            setCmdReceivedFlag(P, localSubframe, platform, tokens[0]); 
        }
        else if(tokens[0] == 'adcCfg')
        {
            setCmdReceivedFlag(P, 0, platform, tokens[0]); 
        }
        else if(tokens[0] == 'clutterRemoval')
        {
            setCmdReceivedFlag(P, 0, platform, tokens[0]); 
        }

    }
 
    /*check if all necessary CLI commands were received*/
    if((sdkVersionUint16 >= 0x0101) && (verifyCmdReceived(P, platform) == -1))
    {
        P.configErrorFlag = 1;
        return P;
    }
    
    //backward compatibility
    if (sdkVersionUint16 == 0x0100)
    {
        P.compRxChanCfg.rangeBias = 0;
        P.measureRxChanCfg.enabled = 0;
    }
    
    /*find which subframe number to plot*/
    //P.subFrameToPlot = subframeNumberToPlot(P);
    //P.detectedObjectsToPlot = checkDetectedObjectsSetting(P);
   
    var totalSubframes;
    if(P.dfeDataOutputMode.mode == 1)
    {
        /* This is legacy frame cfg */
        totalSubframes = 1;
    }
    else if(P.dfeDataOutputMode.mode == 3)
    {
        /* This is advanced frame cfg */
        totalSubframes = P.advFrameCfg.numOfSubFrames;
    }
    
    for (var idx=0; idx<totalSubframes; idx++) 
    {
        var profileCfgIdx;
        profileCfgIdx = getProfileIdx(P,idx);
        
        /*store this info in Params to be used later*/
        P.subFrameInfo[idx] = {
        profileCfgIndex : profileCfgIdx};

        //console.log("Debug: profileidx = %d",profileCfgIdx);
        if(profileCfgIdx == -1)
        {
            configError("Could not find profile for chirp configuration");
            P.configErrorFlag = 1;
            return P;
        }

        /*Populate datapath antenna configuration*/
        if(getAntCfg(P,idx) == -1)
        {
            configError("Could not get antenna configuration");
            P.configErrorFlag = 1;
            return P;
        }

        P.dataPath[idx].numTxAnt = P.dataPath[idx].numTxElevAnt + P.dataPath[idx].numTxAzimAnt;
        if ((P.dataPath[idx].numRxAnt*P.dataPath[idx].numTxAzimAnt < 2))
        {
            P.dataPath[idx].azimuthResolution = 'None';
        } else {
            P.dataPath[idx].azimuthResolution = MyUtil.toPrecision(math.asin(2/(P.dataPath[idx].numRxAnt*P.dataPath[idx].numTxAzimAnt))*180/3.1415926,1);
        }
        if(P.dfeDataOutputMode.mode == 1)
        {
            /* This is legacy frame cfg */
            P.dataPath[idx].numChirpsPerFrame = (P.frameCfg.chirpEndIdx -
                                                    P.frameCfg.chirpStartIdx + 1) *
                                                    P.frameCfg.numLoops;
        }
        else
        {
            /* This is adv frame cfg */
            P.dataPath[idx].numChirpsPerFrame = P.subFrameCfg[idx].numOfChirps * P.subFrameCfg[idx].numLoops;
        }        
        P.dataPath[idx].numDopplerBins = P.dataPath[idx].numChirpsPerFrame / P.dataPath[idx].numTxAnt;
        P.dataPath[idx].numRangeBins = 1<<Math.ceil(Math.log2(P.profileCfg[profileCfgIdx].numAdcSamples));
        P.dataPath[idx].rangeResolutionMeters = 300 * P.profileCfg[profileCfgIdx].digOutSampleRate /
                         (2 * P.profileCfg[profileCfgIdx].freqSlopeConst * 1e3 * P.profileCfg[profileCfgIdx].numAdcSamples);
        P.dataPath[idx].rangeIdxToMeters = 300 * P.profileCfg[profileCfgIdx].digOutSampleRate /
                         (2 * P.profileCfg[profileCfgIdx].freqSlopeConst * 1e3 * P.dataPath[idx].numRangeBins);
        P.dataPath[idx].rangeMeters = 300 * 0.8 * P.profileCfg[profileCfgIdx].digOutSampleRate /(2 * P.profileCfg[profileCfgIdx].freqSlopeConst * 1e3);
        P.dataPath[idx].velocityMps = 3e8 / (4*P.profileCfg[profileCfgIdx].startFreq*1e9 *
                                            (P.profileCfg[profileCfgIdx].idleTime + P.profileCfg[profileCfgIdx].rampEndTime) *
                                            1e-6 * P.dataPath[idx].numTxAnt); 
        P.dataPath[idx].dopplerResolutionMps = 3e8 / (2*P.profileCfg[profileCfgIdx].startFreq*1e9 *
                                            (P.profileCfg[profileCfgIdx].idleTime + P.profileCfg[profileCfgIdx].rampEndTime) *
                                            1e-6 * P.dataPath[idx].numChirpsPerFrame); 
    
        if (platform == mmwInput.Platform.xWR14xx) {
            P.log2linScale[idx] = 1/512;
            if (P.dataPath[idx].numTxElevAnt == 1) P.log2linScale[idx] = P.log2linScale[idx]*4/3; //MMWSDK-439
        } else if (platform == mmwInput.Platform.xWR16xx) {
            P.log2linScale[idx] = 1/(256*P.dataPath[idx].numRxAnt*P.dataPath[idx].numTxAnt);
        }
        
        P.toDB = 20 * Math.log10(2);
        P.rangeAzimuthHeatMapGrid_points = 100;
        P.stats = {activeFrameCPULoad: [], interFrameCPULoad: [], sizeLimit: 100};
        for (var i=0; i<P.stats.sizeLimit; i++) {
            P.stats.activeFrameCPULoad.push(0);
            P.stats.interFrameCPULoad.push(0);
        }
        if (platform == mmwInput.Platform.xWR16xx) {
            P.dspFftScaleComp2D_lin[idx] = dspFftScalComp2(16, P.dataPath[idx].numDopplerBins);
            P.dspFftScaleComp2D_log[idx] = 20 * Math.log10(P.dspFftScaleComp2D_lin[idx]);
            P.dspFftScaleComp1D_lin[idx] = dspFftScalComp1(64, P.dataPath[idx].numRangeBins);
            P.dspFftScaleComp1D_log[idx] = 20 * Math.log10(P.dspFftScaleComp1D_lin[idx]);
        } else {
            P.dspFftScaleComp1D_lin[idx] = dspFftScalComp2(32, P.dataPath[idx].numRangeBins);
            P.dspFftScaleComp1D_log[idx] = 20 * Math.log10(P.dspFftScaleComp1D_lin[idx]);
            P.dspFftScaleComp2D_lin[idx] = 1;
            P.dspFftScaleComp2D_log[idx] = 0;
        }
        
        P.dspFftScaleCompAll_lin[idx] = P.dspFftScaleComp2D_lin[idx] * P.dspFftScaleComp1D_lin[idx];
        P.dspFftScaleCompAll_log[idx] = P.dspFftScaleComp2D_log[idx] + P.dspFftScaleComp1D_log[idx];
    }
    
    return P;
};


/*This function populates the cmdReceivedFlag array.
This array has a flag for each possible CLI command.
Value = 0, means command not received
Value = 1, means command received
It has a flag for each command for each subframe whenever it
makes sense.
For instance, adcbufCfg has a flag defined for all subframes,
that is:
ParamsIn.cmdReceivedFlag.adcbufCfg0 =  0 or 1
ParamsIn.cmdReceivedFlag.adcbufCfg1 =  0 or 1
ParamsIn.cmdReceivedFlag.adcbufCfg2 =  0 or 1
ParamsIn.cmdReceivedFlag.adcbufCfg3 =  0 or 1

For instance, dfeDataOutputMode has a flag defined only for position zero:
ParamsIn.cmdReceivedFlag.dfeDataOutputMode0 = 0 or 1
*/
var setCmdReceivedFlag = function(ParamsIn, subFrameNum, platform, cmd) 
{    
    if((cmd === "dfeDataOutputMode") || (cmd === "channelCfg") || (cmd === "adcCfg") || 
       (cmd === "profileCfg") || (cmd === "chirpCfg") || (cmd === "frameCfg") ||
       (cmd === "advFrameCfg") ||(cmd === "clutterRemoval") ||(cmd === "compRangeBiasAndRxChanPhase") ||
       (cmd === "measureRangeBiasAndRxChanPhase"))
    {
        ParamsIn.cmdReceivedFlag[cmd+"0"] = 1;
    }
    else
    {
        if ((platform == mmwInput.Platform.xWR14xx) || (ParamsIn.dfeDataOutputMode.mode == 1))
        {
            ParamsIn.cmdReceivedFlag[cmd+"0"] = 1;
        }
        else
        {
            if(subFrameNum == -1)
            {
                for(var i=0; i<maxNumSubframes; i++)
                {
                    ParamsIn.cmdReceivedFlag[cmd+i] = 1;
                }                
            }
            else
            {
                ParamsIn.cmdReceivedFlag[cmd+subFrameNum] = 1;
            }
        }
    }
}



/*This function verifies if all necessary CLI commands were received
  Returns -1 if there are missing commands
  Returns 0 if all commands are present*/
var verifyCmdReceived = function(ParamsIn, platform) 
{   
    var i,j;
    var tempStr;
    
    /*array with all commands that must be sent for all subframes*/ 
    var subframeCmds = [];
    subframeCmds.push("adcbufCfg");
    subframeCmds.push("guiMonitor");
    subframeCmds.push("cfarCfg");
    subframeCmds.push("peakGrouping");
    subframeCmds.push("multiObjBeamForming");
    subframeCmds.push("calibDcRangeSig");
    if (platform == mmwInput.Platform.xWR16xx)
    {
        subframeCmds.push("extendedMaxVelocity");
    }    

    /*array with all commands that are not per subframe*/ 
    var frameCmds = [];
    frameCmds.push("dfeDataOutputMode");
    frameCmds.push("channelCfg");
    frameCmds.push("adcCfg");
    frameCmds.push("profileCfg");
    frameCmds.push("chirpCfg");
    frameCmds.push("clutterRemoval");
    frameCmds.push("compRangeBiasAndRxChanPhase");
    frameCmds.push("measureRangeBiasAndRxChanPhase");
    
    
    /*DFE mode must be set and must be the first of the frame commands
      (Here we can not detect if it is the first but only if it is present).*/
    if(ParamsIn.cmdReceivedFlag["dfeDataOutputMode0"] != 1)  
    {
        configError("Missing command dfeDataOutputMode.");    
        return -1;
    }
    
    if(ParamsIn.dfeDataOutputMode.mode == 1)
    {
        /*legacy frame mode, so lets add it to command list*/
        frameCmds.push("frameCfg");
        
        /*check if subframe commands were received.
          need to check position zero only*/
        for(i = 0; i < subframeCmds.length; i++)
        {
            tempStr = subframeCmds[i]+"0";
            if(ParamsIn.cmdReceivedFlag[tempStr] != 1)
            {
                configError("Missing command " + subframeCmds[i]);    
                return -1;
            }
        }
    }
    else if(ParamsIn.dfeDataOutputMode.mode == 3)
    {
        /*this is advanced frame config*/
        /*add adv frame command to list to be checked*/
        frameCmds.push("advFrameCfg");
        /*add subframe command to list to be checked*/
        subframeCmds.push("subFrameCfg");
        
        /*check if subframe commands were received.
          need to check all valid subframes*/
        for(i = 0; i < subframeCmds.length; i++)
        {
            for(j = 0; j < ParamsIn.advFrameCfg.numOfSubFrames; j++)
            {
                var subframe = j.toString();
                tempStr = subframeCmds[i] + subframe;
                if(ParamsIn.cmdReceivedFlag[tempStr] != 1)
                {
                    configError("Missing command " + subframeCmds[i] + " for subframe " + subframe);    
                    return -1;
                }
            }    
        }
    }

    /*check if frame commands were received.
      need to check position zero only*/
    for(i = 0; i < frameCmds.length; i++)
    {
        tempStr = frameCmds[i]+"0";
        if(ParamsIn.cmdReceivedFlag[tempStr] != 1)
        {
            configError("Missing command " + frameCmds[i]);    
            return -1;
        }
    }
    return 0;    
}


