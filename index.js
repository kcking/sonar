function makeConvolutionBuffer(audioContext, periods, freq, sampFn) {
  var sampleRate = audioContext.sampleRate;
  var samples = periods*sampleRate/freq;
  var buffer = audioContext.createBuffer(1, samples, sampleRate);
  var channelL = buffer.getChannelData(0);

  var sampleToRadians = freq * 2 * Math.PI / sampleRate;
  for (var i = 0; i < samples; i++){
      channelL[i] = sampFn(i * sampleToRadians);
  }

  return buffer;
}

function createConvolverDetector(context, input, freq, callback) {
  var convolvePeriods = 100;
  var emitPeriods = 100;
  var sineConvolver = context.createConvolver();
  sineConvolver.normalize = true;
  sineConvolver.buffer = makeConvolutionBuffer(context, convolvePeriods, freq, Math.sin);
  input.connect(sineConvolver);
  var cosineConvolver = context.createConvolver();
  cosineConvolver.normalize = true;
  cosineConvolver.buffer = makeConvolutionBuffer(context, convolvePeriods, freq, Math.cos);
  input.connect(cosineConvolver);
  var bufferSize = 1024;
  processor = context.createScriptProcessor(bufferSize, 2, 1);
  var threshold = 0.005;
  //	require C consecutive samples above threshold to trigger
  var C = 10;
  var debounceWindow = 100;
  var lastDetection = 0;
  var detectionCount = 0;
  
  var wrapper = document.createElement('div');
  var button = document.createElement('button');
  button.innerHTML = freq;
  button.onclick = function() {
    var source = context.createBufferSource();
    source.buffer = makeConvolutionBuffer(context, emitPeriods, freq, Math.sin);
    source.connect(context.destination);
    source.start();
    setTimeout(function() {
      source.disconnect();
    }, 3000);
  };
  wrapper.appendChild(button);
  var maxOutput = document.createElement('span');
  wrapper.appendChild(maxOutput);
  document.getElementById('detectors').appendChild(wrapper);

  var previousBuffer = context.createBuffer(1, bufferSize, 44100);
  var inputData = context.createBuffer(1, bufferSize, 44100);
  var c = 0;
  processor.onaudioprocess = function(e) {
    if (Date.now() > lastDetection + debounceWindow) {
      var sineData = e.inputBuffer.getChannelData(0);
      var cosineData = e.inputBuffer.getChannelData(0);
      var max = -1;
	  // consecutive samples above threshold
      for (var i = 0; i < bufferSize; i++) {
		inputData[i] = Math.sqrt(sineData[i]*sineData[i] + cosineData[i]*cosineData[i]);
		if (inputData[i] > max) {
			max = inputData[i];
		}
		if ((Date.now() > lastDetection + debounceWindow) && inputData[i] > threshold) {
			c++;
			if (c >= C) {
				c = 0;
				lastDetection = Date.now();
				log('Saw ' + freq);
				callback();
			}
		} else {
			c = 0;
		}
		previousBuffer[i] = inputData[i];
      }
      maxOutput.innerHTML = max;
    }
  };
  var merger = context.createChannelMerger(2);
  sineConvolver.connect(merger, 0, 0);
  cosineConvolver.connect(merger, 0, 1);
  merger.connect(processor);
  processor.connect(context.destination);
}

function log(text) {
  console.log(text);
  document.getElementById('log').appendChild(document.createTextNode(text + "\n"));
}

function clearButton() {
  document.getElementById('clear').onclick = function() { document.getElementById('log').innerHTML = ''; };
}

var handleSuccess = function(stream) {
  var context = new AudioContext();
  var input = context.createMediaStreamSource(stream);
	var analyser = context.createAnalyser();

	createConvolverDetector(context, input, 44100/2.2, function() {});
	createConvolverDetector(context, input, 44100/2.3, function() {});
  clearButton();
  
  //input.connect(analyser);
  
  analyser.fftSize = 2048;
  var bufferLength = analyser.frequencyBinCount;
  var timeDataArray = new Uint8Array(bufferLength);
  var freqDataArray = new Uint8Array(bufferLength);

  var timeCanvas = document.getElementById("oscilloscope");
  var timeCanvasCtx = timeCanvas.getContext("2d");
  var freqCanvas = document.getElementById("fft");
  var freqCanvasCtx = freqCanvas.getContext("2d");

  function draw() {
    drawVisual = requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(timeDataArray);
    analyser.getByteFrequencyData(freqDataArray);

    timeCanvasCtx.fillStyle = 'rgb(200, 200, 200)';
    timeCanvasCtx.fillRect(0, 0, timeCanvas.width, timeCanvas.height);
    freqCanvasCtx.fillStyle = 'rgb(200, 200, 200)';
    freqCanvasCtx.fillRect(0, 0, freqCanvas.width, freqCanvas.height);

    timeCanvasCtx.lineWidth = 2;
    timeCanvasCtx.strokeStyle = 'rgb(0, 0, 0)';
    timeCanvasCtx.beginPath();
    var sliceWidth = timeCanvas.width * 1.0 / bufferLength;
    var x = 0;
    for (var i = 0; i < bufferLength; i++) {
      var v = timeDataArray[i] / 128.0;
      var y = v * timeCanvas.height / 2;
      if (i === 0) {
        timeCanvasCtx.moveTo(x, y);
      } else {
        timeCanvasCtx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    timeCanvasCtx.lineTo(timeCanvas.width, timeCanvas.height / 2);
    timeCanvasCtx.stroke();

    freqCanvasCtx.lineWidth = 2;
    freqCanvasCtx.strokeStyle = 'rgb(0, 0, 0)';
    freqCanvasCtx.beginPath();
    var sliceWidth = freqCanvas.width * 1.0 / bufferLength;
    var x = 0;
    for (var i = 0; i < bufferLength; i++) {
      var v = freqDataArray[i] / 256.0;
      var y = freqCanvas.height - v * freqCanvas.height;
      if (i === 0) {
        freqCanvasCtx.moveTo(x, y);
      } else {
        freqCanvasCtx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    freqCanvasCtx.lineTo(freqCanvas.width, freqCanvas.height / 2);
    freqCanvasCtx.stroke();
  };

  draw();
};

navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(handleSuccess);
