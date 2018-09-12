(function () {
    //'use strict';

    function mmWaveInput() {
        if (!(this instanceof mmWaveInput))
            return new mmWaveInput();
        
        this.init();
    }

    var Platform = {
        xWR14xx: 'xWR14xx'
        , xWR16xx: 'xWR16xx'
    };
    function init() {
        this.Input = {
            lightSpeed: 300 // speed of light m/us
            , kB: 1.38064852e-23 // Bolzmann constant J/K, kgm^2/s^2K
            , cube_4pi: Math.pow(4*Math.PI, 3)
            , sdkVersionUint16: 0x0101 //careful : hex coding or you can express as (major << 8) | (minor)
            
            , Frequency_band: 77    // frequncy band: 77GHz with 4GHz bw, 76GHz with 1GHz bw
            
            , platform: Platform.xWR16xx // xWR14xx, xWR16xx
            //, L3_memory_size: 256 // L3 memory size kB;  subject to platform
            //, ADCBuf_memory_size // Byte
            //, max_sampling_rate: 15 // max sampling rate - subject to platform
            //, min_interchirp_dur: 7 // us - subject to platform

            , Number_of_RX: 4
            , Number_of_TX: 1

            , ADC_Samples_Type: 2 // 1 real, 2 complex

            , Inter_Chirp_Duration: 20  // us
            , Chirp_Start_Time: 10  // us
            , Chirp_Duration: 80  // us 
            //, chirp_end_time: 1 // us
            , Ramp_Slope: 10  // Slope value (S) as part of range resolution computation, in MHz/us
            , Num_ADC_Samples: 256 
            , ADC_Sampling_Rate: 5  // MHz
            //, ADC_bits: 16 // bits
            , Chirps_Per_Interrupt: 0

            , Num_Chirps: 128
            , Num_FSK_Symbols: 4
            , Num_Bit_Per_Symbol: 2
            , Freq_Var_Start: 1.0  // First symbol frequency, in MHz
            , Freq_Var_Step: 0.4  // Frequency difference between symbols, in MHz

            , Hardware_Trigger: true
            , Frame_Duration: 40  // ms

            , Range_Sensitivity: 30  // dB
            , Doppler_Sensitivity: 30  // dB
            , Num_Virt_Ant: 1

            , Peak_Grouping_Range: false
            , Peak_Grouping_Doppler: false

            , Range_FFT_size: 225

            //, Pt: 12 // transmit power dBm
            //, Gt: 8 // Minimum Transmit antenna gain in the FoV (dB)
            //, Gr:8 // Minimum Receive antenna gain in the FoV (dB)
            , T0_C: 20 // Ambient temperature, Celcius
            , T0_K: 293.15 // Ambient temperature, Kelvin
            //, NF // Noise figure (dB)
            
            //, subprofile_type: 'best_range_res' // choices: best_range_res|best_vel_res|best_range
            
            //, frame_rate: 25 // fps (frames/s);
            //, frame_rate_lo, frame_rate_hi
            //, frame duration = 1000/frame_rate (ms)
            
            //, azimuth_res: '15' // azimuth resolution deg: 15, 30, 60 (2RX), 60 (1RX); determine Rx and Tx
            //, num_Rx: 4  // number of Rx antennas
            //, num_Tx: 2  // number of Tx antennas
            //, num_virt_ant // number of virtual antenna
            
            //, ramp_slope_lo:5
            //, ramp_slope_hi:100
            //, total_bw: 4000 // Total Bandwidth : case 1 - for best range resolution: 4000 MHz for freq band=77GHz, 1000MHz for freq band=76GHz
            //, sweep_bw
            
            //, range_res    
            //, range_res_lo
            //, range_res_hi, 
            
            //, max_range: 1.13  // max unambiguous range 
            //, max_range_lo, max_range_hi
            
            //, max_radial_vel: 0.39
            //, N_chirps: 16
            
        };
    }

    // takes uint16 version number and converts to 0xabcd
    var getVersionString = function(verUint16) {
        var hexStr = Number(verUint16).toString(16); //convert to hec
        hexStr = "0000".substr(0, 4 - hexStr.length) + hexStr; //make width=4 by adding zeros
        hexStr = hexStr.substr(0,2) + '.' + hexStr.substr(2,2); //separate into major/minor
        return hexStr;
    }
    
    var generate_ChannelCfg = function(Input,P) {
        if (Input.Number_of_RX ==4) P.channelCfg.rxChannelEn = 15;
        else if (Input.Number_of_RX==3) P.channelCfg.rxChannelEn = 7;
        else if (Input.Number_of_RX==2) P.channelCfg.rxChannelEn = 3;
        else if (Input.Number_of_RX==1) P.channelCfg.rxChannelEn = 2;
        else P.channelCfg.rxChannelEn = 0;
        //P.channelCfg.txChannelEn=IF(Number_of_TX=3,7,IF(Number_of_TX=2,5,IF(Number_of_TX=1,1,0)))
        if (Input.platform == Platform.xWR14xx) {
            if (Input.Number_of_TX ==3) P.channelCfg.txChannelEn = 7;
            else if (Input.Number_of_TX==2) P.channelCfg.txChannelEn = 5;
            else if (Input.Number_of_TX==1) P.channelCfg.txChannelEn = 1;
            else P.channelCfg.txChannelEn = 0;
        } else if (Input.platform == Platform.xWR16xx) {
            if (Input.Number_of_TX==2) P.channelCfg.txChannelEn = 3;
            else if (Input.Number_of_TX==1) P.channelCfg.txChannelEn = 1;
            else P.channelCfg.txChannelEn = 0;
        } else {
            P.channelCfg.txChannelEn = 0;
        }
        
        P.channelCfg.cascading = 0;
        P.lines.push(['channelCfg', P.channelCfg.rxChannelEn, P.channelCfg.txChannelEn, P.channelCfg.cascading].join(' '));
    }
    
    var generate_adcCfg = function(Input,P) {
        P.adcCfg.numADCBits = 2; //=IF(ADC_bits=16,2,"NA")
        P.adcCfg.adcOutputFmt = Input.ADC_Samples_Type==2 ? 1 : 0; //=IF(ADC_Samples_Type=2,1,0)
        P.adcCfg.justification = 0;//TODO remove
        P.lines.push(['adcCfg', P.adcCfg.numADCBits, P.adcCfg.adcOutputFmt].join(' '));
    }
    
    var generate_adcbufCfg = function(Input,P) {
        P.dataFmt.rxChannelEn = P.channelCfg.rxChannelEn;
        P.dataFmt.adcOutputFmt = Input.ADC_Samples_Type==2 ? 0 : 1;//=IF(ADC_Samples_Type=2,0,1)
        if (Input.platform == Platform.xWR16xx) {
            P.dataFmt.SampleSwap = 0;
            P.dataFmt.ChanInterleave = 1;
        } else {
            P.dataFmt.SampleSwap = 1;
            P.dataFmt.ChanInterleave = 0;
        }
        P.dataFmt.chirpThreshold = Input.Chirps_Per_Interrupt;
        if ((Input.platform == Platform.xWR16xx) && (Input.sdkVersionUint16 >= 0x0101))
        {
            P.lines.push(['adcbufCfg -1', P.dataFmt.adcOutputFmt, P.dataFmt.SampleSwap, P.dataFmt.ChanInterleave, P.dataFmt.chirpThreshold].join(' '));
        }
        else
        {
            P.lines.push(['adcbufCfg', P.dataFmt.adcOutputFmt, P.dataFmt.SampleSwap, P.dataFmt.ChanInterleave, P.dataFmt.chirpThreshold].join(' '));
        }
    }
    
    var generate_profileCfg = function(Input,P) {
        P.profileCfg.profileId = 0;
        P.profileCfg.startFreq = Input.Frequency_band;
        P.profileCfg.idleTime = Input.Inter_Chirp_Duration;
        P.profileCfg.adcStartTime = Input.Chirp_Start_Time;
        P.profileCfg.rampEndTime = Input.Chirp_Duration;
        P.profileCfg.txOutPower = 0;
        P.profileCfg.txPhaseShifter = 0;
        P.profileCfg.freqSlopeConst = Input.Ramp_Slope;
        P.profileCfg.txStartTime = 1;
        P.profileCfg.numAdcSamples = Input.Num_ADC_Samples;
        P.profileCfg.digOutSampleRate = Input.ADC_Sampling_Rate*1000;
        P.profileCfg.hpfCornerFreq1 = 0;
        P.profileCfg.hpfCornerFreq2 = 0;
        P.profileCfg.rxGain = 30;
        P.lines.push(['profileCfg', P.profileCfg.profileId, P.profileCfg.startFreq, P.profileCfg.idleTime, P.profileCfg.adcStartTime, P.profileCfg.rampEndTime,
                    P.profileCfg.txOutPower, P.profileCfg.txPhaseShifter, P.profileCfg.freqSlopeConst, P.profileCfg.txStartTime, P.profileCfg.numAdcSamples,
                    P.profileCfg.digOutSampleRate, P.profileCfg.hpfCornerFreq1, P.profileCfg.hpfCornerFreq2, P.profileCfg.rxGain].join(' '));
    }
    
    var generate_chirpCfg = function(Input,P) {
        var symbolIdx = 0;

        while (symbolIdx <= Input.Num_FSK_Symbols) {
            var chirpCfg = {}; P.chirpCfg.push(chirpCfg);
            chirpCfg.startIdx = symbolIdx;
            chirpCfg.endIdx = symbolIdx < Input.Num_FSK_Symbols ? symbolIdx : Input.Num_Chirps - 1;
            chirpCfg.profileId = 0;
            chirpCfg.startFreq = 0;
            chirpCfg.freqSlopeVar = Input.Freq_Var_Start + (symbolIdx % Input.Num_FSK_Symbols) * Input.Freq_Var_Step;
            chirpCfg.idleTime = 0;
            chirpCfg.adcStartTime = 0;
            //chirpCfg.txEnable = 1;
            if (Input.platform == Platform.xWR14xx) {
                if (Input.Number_of_TX ==3) chirpCfg.txEnable = 1;
                else if (Input.Number_of_TX==2) chirpCfg.txEnable = 1;
                else chirpCfg.txEnable = 1;
            } else if (Input.platform == Platform.xWR16xx) {
                if (Input.Number_of_TX==2) chirpCfg.txEnable = 1;
                else chirpCfg.txEnable = 1;
            } else {
                chirpCfg.txEnable = 0;
            }
                
            symbolIdx++;
        }
        
        for (var idx=0; idx<P.chirpCfg.length; idx++) {
            chirpCfg = P.chirpCfg[idx];
            P.lines.push(['chirpCfg', chirpCfg.startIdx, chirpCfg.endIdx, chirpCfg.profileId, chirpCfg.startFreq, chirpCfg.freqSlopeVar,
                        chirpCfg.idleTime, chirpCfg.adcStartTime, chirpCfg.txEnable].join(' '));
        }
    }
    
    var generate_frameCfg = function(Input,P) {
        P.frameCfg.chirpStartIdx = 0;
        P.frameCfg.chirpEndIdx = Input.Num_Chirps - 1;
        P.frameCfg.numLoops = 1;
        P.frameCfg.numFrames = 0;
        P.frameCfg.framePeriodicity = Input.Frame_Duration;
        if (Input.Hardware_Trigger) {
            P.frameCfg.triggerSelect = 2;            
        } else {
            P.frameCfg.triggerSelect = 1;
        }
        P.frameCfg.frameTriggerDelay = 0;
        P.lines.push(['frameCfg', P.frameCfg.chirpStartIdx, P.frameCfg.chirpEndIdx, P.frameCfg.numLoops, P.frameCfg.numFrames,
                    P.frameCfg.framePeriodicity, P.frameCfg.triggerSelect, P.frameCfg.frameTriggerDelay].join(' '));
    }
    
    var generate_guiMonitorCfg = function(Input,P) {
        /*
        P.guiMonitor.detectedObjects = templateObj.$.ti_widget_checkbox_scatter_plot.checked ? 1 : 0;
        P.guiMonitor.logMagRange = templateObj.$.ti_widget_checkbox_range_profile.checked ? 1 : 0;
        P.guiMonitor.noiseProfile = templateObj.$.ti_widget_checkbox_noise_profile.checked ? 1 : 0;
        P.guiMonitor.rangeAzimuthHeatMap = templateObj.$.ti_widget_checkbox_azimuth_heatmap.checked ? 1 : 0;
        P.guiMonitor.rangeDopplerHeatMap = templateObj.$.ti_widget_checkbox_doppler_heatmap.checked ? 1 : 0;
        P.guiMonitor.statsInfo = templateObj.$.ti_widget_checkbox_statistics.checked ? 1 : 0;
        */
        P.guiMonitor.detectedObjects = 1;
        P.guiMonitor.logMagRange = 1;
        P.guiMonitor.noiseProfile = 0;
        P.guiMonitor.rangeAzimuthHeatMap = 0;
        P.guiMonitor.rangeDopplerHeatMap = 0;
        P.guiMonitor.statsInfo = 1;
        if ((Input.platform == Platform.xWR16xx) && (Input.sdkVersionUint16 >= 0x0101))
        {
            P.lines.push(['guiMonitor -1', P.guiMonitor.detectedObjects, P.guiMonitor.logMagRange, P.guiMonitor.noiseProfile,
                        P.guiMonitor.rangeAzimuthHeatMap, P.guiMonitor.rangeDopplerHeatMap, P.guiMonitor.statsInfo].join(' '));
        }                
        else
        {
            P.lines.push(['guiMonitor', P.guiMonitor.detectedObjects, P.guiMonitor.logMagRange, P.guiMonitor.noiseProfile,
                        P.guiMonitor.rangeAzimuthHeatMap, P.guiMonitor.rangeDopplerHeatMap, P.guiMonitor.statsInfo].join(' '));
        }
    }

    var convertSensitivitydBToLinear = function(dB_value,platform,Num_Virt_Ant) {
        var linear_value;
        if (platform == Platform.xWR14xx) {
            linear_value = 512*dB_value/6;
        }
        else {
            linear_value = (256*Num_Virt_Ant)*dB_value/6;
        }
        return Math.ceil(linear_value);
    };
    
    var generate_cfarCfg = function(Input,P) {
        var cfarCfg = {}; P.cfarRangeCfg = cfarCfg;
        if (Input.platform == Platform.xWR16xx) {
            cfarCfg.avgMode = 0;    
        } else {
            cfarCfg.avgMode = 2;
        }
        cfarCfg.noiseAvgWindowLength = 8;
        cfarCfg.guardLength = 4;
        if (Input.platform == Platform.xWR16xx) {
            cfarCfg.noiseSumDivisorAsShift = 4;
        } else {
            cfarCfg.noiseSumDivisorAsShift = 3;
        }
        cfarCfg.cyclicMode = 0;
        cfarCfg.thresholdScale = convertSensitivitydBToLinear(Input.Range_Sensitivity,Input.platform,Input.Num_Virt_Ant);
        if ((Input.platform == Platform.xWR16xx) && (Input.sdkVersionUint16 >= 0x0101))
        {
            P.lines.push(['cfarCfg -1 0', cfarCfg.avgMode, cfarCfg.noiseAvgWindowLength, cfarCfg.guardLength, cfarCfg.noiseSumDivisorAsShift,
                        cfarCfg.cyclicMode, cfarCfg.thresholdScale].join(' '));
        }                
        else
        {
            P.lines.push(['cfarCfg 0', cfarCfg.avgMode, cfarCfg.noiseAvgWindowLength, cfarCfg.guardLength, cfarCfg.noiseSumDivisorAsShift,
                        cfarCfg.cyclicMode, cfarCfg.thresholdScale].join(' '));
        }                
        
        //CFAR doppler only supported in xWR16xx
        if (Input.platform == Platform.xWR16xx) 
        {
            cfarCfg = {}; P.cfarDopplerCfg = cfarCfg;
            cfarCfg.avgMode = 0;
            // reduce the window and guard length for smaller FFT
            if (Input.Doppler_FFT_size==16){
                cfarCfg.noiseAvgWindowLength = 4;
                cfarCfg.guardLength = 2;
                cfarCfg.noiseSumDivisorAsShift = 3;
            } else {
                cfarCfg.noiseAvgWindowLength = 8;
                cfarCfg.guardLength = 4;
                cfarCfg.noiseSumDivisorAsShift = 4;
            }
            cfarCfg.cyclicMode = 0;
            cfarCfg.thresholdScale = convertSensitivitydBToLinear(Input.Doppler_Sensitivity,Input.platform,Input.Num_Virt_Ant);
            if (Input.sdkVersionUint16 >= 0x0101)
            {
                P.lines.push(['cfarCfg -1 1', cfarCfg.avgMode, cfarCfg.noiseAvgWindowLength, cfarCfg.guardLength, cfarCfg.noiseSumDivisorAsShift,
                            cfarCfg.cyclicMode, cfarCfg.thresholdScale].join(' '));
            }                
            else
            {
                P.lines.push(['cfarCfg 1', cfarCfg.avgMode, cfarCfg.noiseAvgWindowLength, cfarCfg.guardLength, cfarCfg.noiseSumDivisorAsShift,
                            cfarCfg.cyclicMode, cfarCfg.thresholdScale].join(' '));
            }
        }
    }

    var generate_peakGroupingCfg = function(Input,P) {
        var peakGrouping = {};
        peakGrouping.groupingMode = 1;
        peakGrouping.rangeDimEn = Input.Peak_Grouping_Range ? 1 : 0; 
        peakGrouping.dopplerDimEn = Input.Peak_Grouping_Doppler ? 1 : 0; 
        peakGrouping.startRangeIdx = 1;
        if (Input.platform == Platform.xWR16xx) {
            peakGrouping.endRangeIdx = Input.Range_FFT_size-1; //MMWSDK-546
        } else {
            peakGrouping.endRangeIdx = Math.floor(0.9*Input.Range_FFT_size)-1; //MMWSDK-546
        }
        
        if ((Input.platform == Platform.xWR16xx) && (Input.sdkVersionUint16 >= 0x0101))
        {
            P.lines.push(['peakGrouping -1', peakGrouping.groupingMode, peakGrouping.rangeDimEn, peakGrouping.dopplerDimEn, peakGrouping.startRangeIdx,
                    peakGrouping.endRangeIdx].join(' '));
        }
        else        
        {
            P.lines.push(['peakGrouping', peakGrouping.groupingMode, peakGrouping.rangeDimEn, peakGrouping.dopplerDimEn, peakGrouping.startRangeIdx,
                    peakGrouping.endRangeIdx].join(' '));
        }
    }
    
    var generate_BFCfg = function(Input,P) {
        var multiObjBeamForming = {};
        multiObjBeamForming.enabled = 1;
        multiObjBeamForming.threshold = 0.5;
        if ((Input.platform == Platform.xWR16xx) && (Input.sdkVersionUint16 >= 0x0101))
        {
            P.lines.push(['multiObjBeamForming -1', multiObjBeamForming.enabled, multiObjBeamForming.threshold].join(' '));
        }
        else        
        {
            P.lines.push(['multiObjBeamForming', multiObjBeamForming.enabled, multiObjBeamForming.threshold].join(' '));
        }
        
    }
    
    var generate_clutterCfg = function(Input,P) {
        if (Input.sdkVersionUint16 >= 0x0101) {
            //P.clutterRemoval.enabled = templateObj.$.ti_widget_checkbox_clutter_removal.checked ? 1 : 0;
            P.clutterRemoval.enabled = 0;
            if (Input.platform == Platform.xWR16xx)
            {
                P.lines.push(['clutterRemoval -1', P.clutterRemoval.enabled].join(' '));
            }
            else
            {
                P.lines.push(['clutterRemoval', P.clutterRemoval.enabled].join(' '));
            }
        }
    }   

    var generate_DcRangeCfg = function(Input,P) {
        var calibDcRangeSig = {};
        calibDcRangeSig.enabled = 0;
        calibDcRangeSig.negativeBinIdx = -5;
        calibDcRangeSig.positiveBinIdx = 8;
        calibDcRangeSig.numAvgChirps = 256;
        
        if ((Input.platform == Platform.xWR16xx) && (Input.sdkVersionUint16 >= 0x0101))
        {
            P.lines.push(['calibDcRangeSig -1', calibDcRangeSig.enabled, calibDcRangeSig.negativeBinIdx, calibDcRangeSig.positiveBinIdx, calibDcRangeSig.numAvgChirps].join(' '));
        }
        else
        {
            P.lines.push(['calibDcRangeSig', calibDcRangeSig.enabled, calibDcRangeSig.negativeBinIdx, calibDcRangeSig.positiveBinIdx, calibDcRangeSig.numAvgChirps].join(' '));
        }
    }
    
    var generate_extendedVeloCfg = function(Input,P) {
        var extendedMaxVelocity = {};
        extendedMaxVelocity.enabled = 0;
        if ((Input.platform == Platform.xWR16xx) && (Input.sdkVersionUint16 >= 0x0101))
        {
            P.lines.push(['extendedMaxVelocity -1', extendedMaxVelocity.enabled].join(' '));
        }
    }
    
    var generate_compRangeBiasAndRxChanPhase = function(Input,P) {
        if (Input.sdkVersionUint16 >= 0x0101) {
            //P.lines.push(templateObj.$.ti_widget_textbox_compensation.getText());
            P.lines.push('compRangeBiasAndRxChanPhase 0.0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1 0');


            //if (Input.platform == Platform.xWR16xx) {
            //    P.lines.push('compRangeBiasAndRxChanPhase 0.0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1 0');
            //} else {
            //    P.lines.push('compRangeBiasAndRxChanPhase 0.0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1 0');
            //}       
        }
    }
    
    var generate_measureRangeBiasAndRxChanPhase = function(Input,P) {
        if (Input.sdkVersionUint16 >= 0x0101) {
            P.lines.push('measureRangeBiasAndRxChanPhase 0 1.5 0.2');       
        }
    }

    var generate_dynamicChirpCfg = function(Input,P) {
        totalSymbolPerFrame = Input.Num_Chirps;
        numHeaderSymbol = 8;
        numFSKSymbol = Input.Num_FSK_Symbols;
        numBitPerSymbol = Input.Num_Bit_Per_Symbol;

        P.lines.push(['dynChirpCfg', totalSymbolPerFrame, numHeaderSymbol, numFSKSymbol, numBitPerSymbol].join(' '));
    }

    var generate_fskCfg = function(Input,P) {
        var listCommand = ['fskCfg', Input.Num_FSK_Symbols];
        for (var i = 0; i < Input.Num_FSK_Symbols; i++) {
            listCommand.push(Input.Freq_Var_Start + i * Input.Freq_Var_Step);
        }

        P.lines.push(listCommand.join(' '));
    }


    var generateCfg = function() {
        var Input = this.Input;
        var P = {channelCfg: {}, adcCfg:{}, dataFmt:{}, profileCfg: {},
                 chirpCfg: [], frameCfg: {}, guiMonitor: {}, clutterRemoval: {}, lines: [] };
                 
        P.lines.push('% ***************************************************************');
        
        P.lines.push(['% Created for SDK ver',getVersionString(Input.sdkVersionUint16)].join(':'));
        P.lines.push(['% Created using Visualizer ver',visualizerVersion].join(':'));
        P.lines.push(['% Frequency',Input.Frequency_band].join(':'));
        P.lines.push(['% Platform',Input.platform].join(':'));
        P.lines.push(['% Scene Classifier',Input.subprofile_type].join(':'));
        P.lines.push(['% Azimuth Resolution(deg)',Input.Azimuth_Resolution].join(':'));
        P.lines.push(['% Range Resolution(m)',Input.Range_Resolution].join(':'));
        P.lines.push(['% Maximum unambiguous Range(m)',Input.Maximum_range].join(':'));
        P.lines.push(['% Maximum Radial Velocity(m/s)',Input.Maximum_radial_velocity].join(':'));
        P.lines.push(['% Radial velocity resolution(m/s)',Input.Radial_velocity_Resolution].join(':'));
        P.lines.push(['% Frame Duration(msec)',Input.Frame_Duration].join(':'));
        P.lines.push(['% Range Detection Threshold (dB)',Input.Range_Sensitivity].join(':'));
        if (Input.platform == Platform.xWR16xx) P.lines.push(['% Doppler Detection Threshold (dB)',Input.Doppler_Sensitivity].join(':'));
        //P.lines.push(['% Range Peak Grouping',templateObj.$.ti_widget_checkbox_grouppeak_rangedir.checked ? 'enabled' : 'disabled'].join(':'));
        //P.lines.push(['% Doppler Peak Grouping',templateObj.$.ti_widget_checkbox_grouppeak_dopplerdir.checked ? 'enabled' : 'disabled'].join(':'));
        //P.lines.push(['% Static clutter removal',templateObj.$.ti_widget_checkbox_clutter_removal.checked ? 'enabled' : 'disabled'].join(':'));
        P.lines.push(['% Range Peak Grouping','enabled'].join(':'));
        P.lines.push(['% Doppler Peak Grouping','enabled'].join(':'));
        P.lines.push(['% Static clutter removal','disabled'].join(':'));
        
        P.lines.push('% ***************************************************************');
        
        P.lines.push('sensorStop');
        P.lines.push('flushCfg');
        P.lines.push('dfeDataOutputMode 1');
    
        // channelCfg
        generate_ChannelCfg(Input,P);
        
        // adcCfg
        generate_adcCfg(Input,P);
        
        // dataFmt (adcbufCfg)
        generate_adcbufCfg(Input,P);
                
        // profileCfg
        generate_profileCfg(Input,P);
        
        // chirpCfg 
        generate_chirpCfg(Input,P);
        
        // frameCfg
        generate_frameCfg(Input,P);
        
        // guiMonitor
        generate_guiMonitorCfg(Input,P);
        
        // cfarCfg, cfarRangeCfg, cfarDopplerCfg
        generate_cfarCfg(Input,P);
        
        // peakGrouping
        generate_peakGroupingCfg(Input,P);

        // multiObjBeamForming
        generate_BFCfg(Input,P);
        
        //always disable calibDcRangeSig and fill in defaults (needed as they are checked by demo)
        generate_DcRangeCfg(Input,P);
        
        //always disable extendedMaxVelocity
        generate_extendedVeloCfg(Input,P);

        //Static clutter removal
        generate_clutterCfg(Input,P);
        
        // compensate range and angle based on input
        generate_compRangeBiasAndRxChanPhase(Input,P);
        
        // disable always
        generate_measureRangeBiasAndRxChanPhase(Input,P);

        // Dynamic chirp configuration
        generate_dynamicChirpCfg(Input,P);

        // FSK configuration
        generate_fskCfg(Input, P);

        P.lines.push('sensorStart');
        return P;
    };    

    mmWaveInput.prototype.init = init;
    mmWaveInput.prototype.generateCfg = generateCfg;
    

    // export as AMD/CommonJS module or global variable
    if (typeof define === 'function' && define.amd) define('mmWaveInput', function () { return mmWaveInput; });
    else if (typeof module !== 'undefined') module.exports = mmWaveInput;
    else if (typeof self !== 'undefined') self.mmWaveInput = mmWaveInput;
    else window.mmWaveInput = mmWaveInput;

})();