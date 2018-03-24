//TODO:
//- what if user inputs image before letters are loaded?

// A 2D array of floating-point data
var LiteImageData = function(data, width, height)
{
	this.data = data;
	this.width = width;
	this.height = height;
}

LiteImageData.prototype.toCanvasImageData = function()
{
	var rgba = this.data;
	if (rgba instanceof Float32Array)
	{
		rgba = greyFloatToRGBA(this.data);
	}
	return new ImageData(rgba, this.width, this.height);
}

var Kernel = function(data, width, height, centerX, centerY)
{
	LiteImageData.call(this, data, width, height);
	this.centerX = centerX;
	this.centerY = centerY;
}

Kernel.prototype = new LiteImageData();

Kernel.accumulateMax = function(accum, data, kernel)
{
	return Math.max(accum, data * kernel);
}

Kernel.accumulateMin = function(accum, data, kernel)
{
	return kernel > 0 ? Math.min(accum, data) : accum;
}

Kernel.accumulateSum = function(accum, data, kernel)
{
	return accum + data * kernel;
}

// params:
//   oobValue - value to use for out-of-bounds pixels
// buffer: optional buffer to put the results in
Kernel.prototype.convolute = function(data, params, buffer)
{
	params = params || {};
	params.accumulateFn = params.accumulateFn || Kernel.accumulateSum;
	return this.convoluteFn(data, params, buffer);
}

// returns the minimum convolution of the specified image with the kernel
// params:
//   oobValue - value to use for out-of-bounds pixels
// buffer: optional buffer to put the results in
Kernel.prototype.convoluteMin = function(data, params, buffer)
{
	params = params || {};
	params.oobValue = params.oobValue === undefined ? 1 : params.oobValue;
	params.accumulateFn = params.accumulateFn || Kernel.accumulateMin;
	return this.convoluteFn(data, params, buffer);
}

// returns the maximum convolution of the specified image with the kernel
// params:
//   oobValue - value to use for out-of-bounds pixels
// buffer: optional buffer to put the results in
Kernel.prototype.convoluteMax = function(data, params, buffer)
{
	params = params || {};
	params.oobValue = params.oobValue === undefined ? 0 : params.oobValue;
	params.accumulateFn = params.accumulateFn || Kernel.accumulateMax;
	return this.convoluteFn(data, params, buffer);
}

Kernel.prototype.convoluteFn = function(data, params, buffer)
{
	var buffer = buffer || new Float32Array(data.data.length);
	var oobValue = params.oobValue === undefined ? 0 : params.oobValue;
	for (var dx = 0; dx < data.width; ++dx)
	for (var dy = 0; dy < data.height; ++dy)
	{
		var di = dx + dy * data.width;
		var result = oobValue;
		var earlyOut = false;
		for (var kx = 0; !earlyOut && kx < this.width; ++kx)
		for (var ky = 0; !earlyOut && ky < this.height; ++ky)
		{
			var ki = kx + ky * this.width;
			var dki = di + kx - this.centerX + (ky - this.centerY) * data.width;
			var imageValue = data.data[dki];
			if (imageValue === undefined)
			{
				imageValue = oobValue;
			}
			result = params.accumulateFn(result, imageValue, this.data[ki]);
			earlyOut = params.earlyOutFn && params.earlyOutFn(result);
		}
		buffer[di] = result;
	}
	return new LiteImageData(buffer, data.width, data.height);
}

// the source image being used
loadedImage = null;

// data on each letter in the template
letterData = [];
for (var c = 32; c < 128; c++)
{
	letterData[c] = {
		weight: 1.0,
		totalPixels: 0,
		pixels: null,
	};
}
letterData['\\'.charCodeAt(0)].weight = 2.0;
letterData['/'.charCodeAt(0)].weight = 2.0;
letterData['_'.charCodeAt(0)].weight = 2.0;
letterData['-'.charCodeAt(0)].weight = 2.0;
letterData['<'.charCodeAt(0)].weight = 1.3;
letterData['>'.charCodeAt(0)].weight = 1.3;
letterData['|'.charCodeAt(0)].weight = 1.8;
letterData['('.charCodeAt(0)].weight = 1.4;
letterData[')'.charCodeAt(0)].weight = 1.4;
letterData[','.charCodeAt(0)].weight = 0.7;
letterData[';'.charCodeAt(0)].weight = 0.7;
letterData['['.charCodeAt(0)].weight = 0.6;
letterData[']'.charCodeAt(0)].weight = 0.6;
letterData['~'.charCodeAt(0)].weight = 0.6;
letterData['{'.charCodeAt(0)].weight = 0;
letterData['}'.charCodeAt(0)].weight = 0;
letterData['&'.charCodeAt(0)].weight = 0;
letterData['$'.charCodeAt(0)].weight = 0;
letterData['@'.charCodeAt(0)].weight = 0;
letterData['!'.charCodeAt(0)].weight = 0.2;
for (var c = 'a'.charCodeAt(0); c <= 'z'.charCodeAt(0); c++)
	letterData[c].weight = 0;
for (var c = '0'.charCodeAt(0); c <= '9'.charCodeAt(0); c++)
	letterData[c].weight = 0;
for (var c = 'A'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++)
	letterData[c].weight = 0.6;

letterWidth = 0.0;
letterHeight = 0.0;
letterAspect = 1.0;

scratchCanvas = null;
scratchCtx = null;
rawCanvas = null;
rawCtx = null;
outputCanvas = null;
outputCtx = null;

outputHeightSlider = null;
thresholdSlider = null;
dilateSlider = null;
erodeSlider = null;
sdfRadiusSlider = null;
inverseMatchSlider = null;
allowedJitterSlider = null;
processStepSlider = null;
propertySliders = [];

jitterOffsets = [
	{ x: 0, y: 0 },
	{ x: 2, y: -2 },
	{ x: 0, y: -2 },
	{ x: -2, y: -2 },
	{ x: -2, y: 0 },
	{ x: -2, y: 2 },
	{ x: 0, y: 2 },
	{ x: 2, y: 2 },
	{ x: 2, y: 0 },
];

outputTilesX = 0; // horizontal tiles in the output
outputTilesY = 0; // vertical tiles in the output
productionStep = -1; // the highest production step reached so far for this image
rawImageData = null; // input image (Uint8ClampedArray RGBA)
rawGreyData = null; // greyscale input data (Float32Array)
edgeDetected = null; // edge-detected data (Float32Array)
thresholded = null; // thresholded (Float32Array)
dilated = null;
eroded = null;
sdf = null; // sdf (Float32Array)
letterChars = null; // Uint8Array of chars in the output grid
finalImage = null; // final image with matched letters (Float32Array)

dilateKernel = null;
erodeKernel = null;

setUpPropertySlider = function(sliderId, valueId, changeCallback)
{
	var slider = document.getElementById(sliderId);
	var value = document.getElementById(valueId);
	slider.addEventListener("change", changeCallback);
	if (value)
	{
		slider.addEventListener("change", function(e) { value.innerHTML = slider.value; });
		value.innerHTML = slider.value;
	}
	propertySliders.push({slider: slider, value: value});
	return slider;
}

updateAllPropertyValues = function()
{
	for (var i = 0; i < propertySliders.length; i++)
	{
		if (propertySliders[i].value)
		{
			propertySliders[i].value.innerHTML = propertySliders[i].slider.value;
		}
	}
	updateProcessStepPropertyValue();
	produceGreyscale();
}

updateProcessStepPropertyValue = function()
{
	var processStepValue = document.getElementById("processStepValue");
	processStepValue.innerHTML = processStepNames[processStepSlider.value];
}

onDomLoaded = function()
{
	scratchCanvas = document.createElement("canvas");
	scratchCtx = scratchCanvas.getContext("2d");
	rawCanvas = document.getElementById("rawCanvas");
	rawCtx = rawCanvas.getContext('2d');
	outputCanvas = document.getElementById("outputCanvas");
	outputCtx = outputCanvas.getContext('2d');

	outputHeightSlider = setUpPropertySlider("outputHeightSlider", "", onOutputHeightChanged);
	thresholdSlider = setUpPropertySlider("thresholdSlider", "thresholdValue", onThresholdChanged);
	dilateSlider = setUpPropertySlider("dilateSlider", "dilateValue", onDilateChanged);
	erodeSlider = setUpPropertySlider("erodeSlider", "erodeValue", onErodeChanged);
	sdfRadiusSlider = setUpPropertySlider("sdfRadiusSlider", "sdfRadiusValue", onSdfRadiusChanged);
	inverseMatchSlider = setUpPropertySlider("inverseMatchSlider", "inverseMatchValue", onInverseMatchWeightChanged);
	//allowedJitterSlider = setUpPropertySlider("allowedJitterSlider", "allowedJitterValue", onAllowedJitterChanged);
	processStepSlider = setUpPropertySlider("processStepSlider", "", onProcessStepChanged);

	loadLetters();
	setGraphicPreset();
}

onOutputHeightChanged = function(e)
{
	produceImageData();
}

onThresholdChanged = function(e)
{
	produceImageThresholds();
}

onDilateChanged = function(e)
{
	produceImageDilate();
}

onErodeChanged = function(e)
{
	produceImageErode();
}

onSdfRadiusChanged = function(e)
{
	produceImageSdf();
}

onInverseMatchWeightChanged = function(e)
{
	produceImageLetters();
}

onAllowedJitterChanged = function(e)
{
	produceImageLetters();
}

processStepNames = [
	"Raw Image",
	"Greyscale",
	"Edges",
	"Threshold",
	"Dilate",
	"Erode",
	"Blur",
	"Final"
];

onProcessStepChanged = function()
{
	updateProcessStepPropertyValue();

	var startFromStep = parseInt(processStepSlider.value);
	startFromStep = Math.min(productionStep + 1, startFromStep);
	switch (startFromStep)
	{
		case 0:
		case 1: produceGreyscale(); break;
		case 2: produceImageEdges(); break;
		case 3: produceImageThresholds(); break;
		case 4: produceImageDilate(); break;
		case 5: produceImageErode(); break;
		case 6: produceImageSdf(); break;
		case 7: produceImageLetters(); break;
	}
}

// loads the letter template image
loadLetters = function()
{
	var lettersImage = new Image;
	lettersImage.onload = function() {
		parseLetters(lettersImage);
	}
	lettersImage.src = "letters.png";
}

createDilateKernel = function()
{
	var kernelSize = parseInt(dilateSlider.value);
	if (!dilateKernel || kernelSize != dilateKernel.radius)
	{
		dilateKernel = createCircleKernel(kernelSize);
		dilateKernel.radius = kernelSize;
	}
}

createErodeKernel = function()
{
	var kernelSize = parseInt(erodeSlider.value);
	if (!erodeKernel || kernelSize != erodeKernel.radius)
	{
		erodeKernel = createCircleKernel(kernelSize);
		erodeKernel.radius = kernelSize;
	}
}

createCircleKernel = function(radius)
{
	var kernelSize = radius * 2 + 1;
	var center = radius;
	var radiusSq = radius * radius;
	var data = new Float32Array(kernelSize * kernelSize);
	for (var x = 0; x < kernelSize; x++)
	for (var y = 0; y < kernelSize; y++)
	{
		var dx = (center - x);
		var dy = (center - y);
		var dSq = dx * dx + dy * dy;
		var di = x + y * kernelSize;
		data[di] = dSq <= radiusSq ? 1 : 0;
	}
	return new Kernel(data, kernelSize, kernelSize, radius, radius);
}

// splits and prepares the letter template image
parseLetters = function(lettersImage)
{
	console.log("Parsing letters image.");

	// get image data
	scratchCanvas.width = lettersImage.width;
	scratchCanvas.height = lettersImage.height;
	scratchCtx.drawImage(lettersImage, 0, 0, lettersImage.width, lettersImage.height);
	var lettersImageData = scratchCtx.getImageData(0, 0, lettersImage.width, lettersImage.height);

	var lettersX = 16;
	var lettersY = 6;
	letterWidth = lettersImage.width / lettersX;
	letterHeight = lettersImage.height / lettersY;
	letterAspect = letterWidth / letterHeight;
	var index = 32;
	for (var y = 0; y < lettersY; ++y)
	for (var x = 0; x < lettersX; ++x)
	{
		var pixels = new Float32Array(letterWidth * letterHeight);
		var filledPixels = 0;
		var iy = y * letterHeight;
		var ix = x * letterWidth;
		for (var y2 = 0; y2 < letterHeight; ++y2)
		for (var x2 = 0; x2 < letterWidth; ++x2)
		{
			var i2 = x2 + y2 * letterWidth;
			var i = (x * letterWidth + x2 + (y * letterHeight + y2) * lettersImage.width) * 4;
			//TODO: greyscale the letters image?
			pixels[i2] = lettersImageData.data[i] / 255.0;
			filledPixels += pixels[i2];
		}
		letterData[index].pixels = pixels;
		letterData[index].totalPixels = filledPixels;
		index++;
	}
}

// a local file was provided
onFileInput = function()
{
	var fileElement = document.getElementById("filereader");
	if (fileElement.files.length == 0) return;

	console.log("Load image from file...");
	console.log("File: " + fileElement.files[0].name);

	loadedImage = new Image;
	loadedImage.onload = function() {
		console.log("Image loaded.");
		produceImage();
		URL.revokeObjectURL(loadedImage.src);
	};
	loadedImage.src = URL.createObjectURL(fileElement.files[0]);
}

// a URL was provided
onURLInput = function()
{
	var urlElement = document.getElementById("urlreader");
	console.log("Load image from URL...");
	console.log("URL: " + urlElement.value);

	loadedImage = new Image;
	loadedImage.onload = function() {
		console.log("Image loaded.");
		produceImage();
	};
	loadedImage.crossOrigin = "";
	loadedImage.src = urlElement.value;
}

produceImage = function()
{
	productionStep = -1;

	produceImageData();
}

produceImageData = function()
{
	if (!loadedImage) return;

	var sourceX = loadedImage.width;
	var sourceY = loadedImage.height;

	var aspectRatio = sourceX / sourceY;
	outputTilesY = parseInt(outputHeightSlider.value);
	var outputTilesXFloat = outputTilesY * aspectRatio / letterAspect;
	outputTilesX = Math.ceil(outputTilesXFloat);
	var outputX = outputTilesX * letterWidth;
	var outputY = outputTilesY * letterHeight;
	var outputTilesXRemainder = outputTilesX - outputTilesXFloat;
	var outputXMargin = outputTilesXRemainder * letterWidth / 2;

	var outputPixelCount = outputX * outputY;

	// get image data
	rawCanvas.width = outputX;
	rawCanvas.height = outputY;
	rawCtx.drawImage(loadedImage,
		0, 0, sourceX, sourceY,
		0, 0, outputX, outputY);
	var imageData = rawCtx.getImageData(0, 0, outputX, outputY);
	rawImageData = new LiteImageData(imageData.data, outputX, outputY)

	produceRawImage();
}

produceRawImage = function()
{
	if (!rawImageData) return;

	produceGreyscale();
}

produceGreyscale = function()
{
	// greyscale the data
	rawGreyData = getGreyscale(rawImageData);

	productionStep = Math.max(productionStep, 1);
	if (processStepSlider.value <= 1)
		showOutput(rawGreyData);
	else
		produceImageEdges();
}

produceImageEdges = function()
{
	// edge detection
	edgeDetected = getEdges(rawGreyData);

	productionStep = Math.max(productionStep, 2);
	if (processStepSlider.value <= 2)
		showOutput(edgeDetected);
	else
		produceImageThresholds();
}

produceImageThresholds = function()
{
	// threshold
	thresholded = thresholdFloats(edgeDetected, thresholdSlider.value);

	productionStep = Math.max(productionStep, 3);
	if (processStepSlider.value <= 3)
		showOutput(thresholded);
	else
		produceImageDilate();
}

produceImageDilate = function()
{
	// dilated
	createDilateKernel();
	dilated = dilateKernel.convoluteMax(thresholded, { earlyOutFn: accum => accum >= 1});

	productionStep = Math.max(productionStep, 4);
	if (processStepSlider.value <= 4)
		showOutput(dilated);
	else
		produceImageErode();
}

produceImageErode = function()
{
	// eroded
	createErodeKernel();
	eroded = erodeKernel.convoluteMin(dilated, {});

	productionStep = Math.max(productionStep, 5);
	if (processStepSlider.value <= 5)
		showOutput(eroded);
	else
		produceImageSdf();
}

produceImageSdf = function()
{
	// compute the distance field for the thresholded image
	sdf = floatToHackyFastSDF(eroded, sdfRadiusSlider.value);

	productionStep = Math.max(productionStep, 6);
	if (processStepSlider.value <= 6)
		showOutput(sdf);
	else
		produceImageLetters();
}

produceImageLetters = function()
{
	overlayLetters(sdf, outputTilesX, outputTilesY,
		inverseMatchSlider.value,
		onOverlayLettersComplete);
}

onOverlayLettersComplete = function(result)
{
	letterChars = result;

	// produce text output
	var outputText = document.getElementById("outputText");
	outputText.innerHTML = lettersToString(letterChars);
	outputText.style.height = outputText.style.width = "";
	outputText.style.width = outputText.scrollWidth + "px";
	outputText.style.height = outputText.scrollHeight + "px";

	produceImageFinal();
}

produceImageFinal = function()
{
	finalImage = lettersToImage(letterChars,
		rawImageData.width, rawImageData.height,
		outputTilesX, outputTilesY)

	productionStep = Math.max(productionStep, 3);
	showOutput(finalImage);
}

showOutput = function(imageData)
{
	// output
	outputCanvas.width = imageData.width;
	outputCanvas.height = imageData.height;
	var outputImageData = imageData.toCanvasImageData();
	outputCtx.putImageData(outputImageData, 0, 0);
}

/// Returns an array of greyscale values for each pixel in the data
/// Expects data as RGBA
getGreyscale = function(imageData)
{
	if (!(imageData instanceof LiteImageData))
	{
		throw "'imageData' is not a LiteImageData";
	}
	var data = imageData.data;
	var pixels = data.length / 4;
	if (pixels != Math.floor(pixels))
	{
		throw "getGreyscale: input array size is not divisble by 4";
	}
	var grey = new Float32Array(pixels);
	for (var i = 0; i < pixels; ++i)
	{
		var i4 = i * 4;
		grey[i] = (data[i4 + 0] * 0.105
			+ data[i4 + 1] * 0.36
			+ data[i4 + 2] * 0.035
			+ data[i4 + 3] * 0.50) / 255.0;
	}
	return new LiteImageData(grey, imageData.width, imageData.height);
}

/// Returns an array of 0-1 values for edge-detected pixels
/// Expects an array of one value per pixel
getEdges = function(imageData)
{
	if (!(imageData instanceof LiteImageData))
	{
		throw "'imageData' is not a LiteImageData";
	}
	var data = imageData.data;
	var width = imageData.width;
	var height = imageData.height;
	var edges = new Float32Array(data.length);
	
	// vertical pass
	var ymax = height - 1;
	for (var x = 0; x < width; ++x)
	for (var y = 0; y < ymax; ++y)
	{
		var i = x + y * width;
		var inext = x + (y + 1) * width;
		edges[i] += Math.abs(data[i] - data[inext]);
	}

	// horizontal pass
	var xmax = width - 1;
	for (var x = 0; x < xmax; ++x)
	for (var y = 0; y < height; ++y)
	{
		var i = x + y * width;
		var inext = (x + 1) + y * width;
		edges[i] += Math.abs(data[i] - data[inext]);
	}

	return new LiteImageData(edges, imageData.width, imageData.height);
}

/// Dilates the specified float image data
dilate = function(imageData, neighborhood)
{
	if (!(imageData instanceof LiteImageData))
	{
		throw "'imageData' is not a LiteImageData";
	}
	//TODO:
}

/// Erodes the specified float image data
erode = function(imageData, neighborhood)
{
	if (!(imageData instanceof LiteImageData))
	{
		throw "'imageData' is not a LiteImageData";
	}
	//TODO:
}

/// Thresholds the specified float array
thresholdFloats = function(imageData, threshold)
{
	if (!(imageData instanceof LiteImageData))
	{
		throw "'imageData' is not a LiteImageData";
	}
	var data = imageData.data;
	var thresholded = new Float32Array(data.length);
	for (var i = 0; i < data.length; ++i)
	{
		thresholded[i] = data[i] > threshold ? 1.0 : 0.0;
	}
	return new LiteImageData(thresholded, imageData.width, imageData.height);
}

/// Converts a greyscale (float) array to an RGBA byte array
greyFloatToRGBA = function(data)
{
	var rgba = new Uint8ClampedArray(data.length * 4);
	for (var i = 0; i < data.length; ++i)
	{
		var v = data[i] * 255;
		var i4 = i * 4;
		rgba[i4 + 0] = v;
		rgba[i4 + 1] = v;
		rgba[i4 + 2] = v;
		rgba[i4 + 3] = 255;
	}
	return rgba;
}

/// Converts a float array to a signed distance field array
floatToHackyFastSDF = function(imageData, radius)
{
	if (!(imageData instanceof LiteImageData))
	{
		throw "'imageData' is not a LiteImageData";
	}
	var falloff = 1 / radius;
	var width = imageData.width;
	var height = imageData.height;
	var out = new Float32Array(imageData.data);

	// right/down pass
	var xmax = width - 1;
	var ymax = height - 1;
	for (var x = 0; x < xmax; ++x)
	for (var y = 0; y < ymax; ++y)
	{
		var ival = out[x + y * width] - falloff;
		var ix = (x + 1) + y * width;
		var iy = x + (y + 1) * width;
		out[ix] = Math.max(out[ix], ival);
		out[iy] = Math.max(out[iy], ival);
	}

	// left/up pass
	for (var x = width - 1; x > 0; --x)
	for (var y = height - 1; y > 0; --y)
	{
		var ival = out[x + y * width] - falloff;
		var ix = (x - 1) + y * width;
		var iy = x + (y - 1) * width;
		out[ix] = Math.max(out[ix], ival);
		out[iy] = Math.max(out[iy], ival);
	}

	return new LiteImageData(out, width, height);
}

/// decides which letter to use for each tile
/// expects input as a Float32Array
/// ouputs a 2D Uint8Array of character ASCII codes
overlayLetters = function(imask, tilesX, tilesY,
	iinverseMatchWt,
	callback)
{
	if (!(imask instanceof LiteImageData))
	{
		throw "'imask' is not a LiteImageData";
	}
	var input = [];
	for (var ty = 0; ty < tilesY; ++ty)
	for (var tx = 0; tx < tilesX; ++tx)
	{
		input.push({x: tx, y: ty});
	}
	/*var task = new Parallel(input,
	{
		env: {
			letterWidth: letterWidth,
			letterHeight: letterHeight,
			letterData: letterData,
			mask: mask,
			inverseMatchWt: inverseMatchWt,
		}
	});*/
	//task.map(overlayLetter).then(callback);

	mask = imask;
	inverseMatchWt = iinverseMatchWt;
	
	callback(input.map(overlayLetter));
}

/// converts a 2D character array to a string
lettersToString = function(letterChars)
{
	var str = "";
	for (var y = 0; y < outputTilesY; y++)
	{
		for (var x = 0; x < outputTilesX; x++)
		{
			str += String.fromCharCode(letterChars[x + y * outputTilesX]);
		}
		str += "\n";
	}
	return str;
}

//TEMP:
mask = null;
inverseMatchWt = 0;

/// Map target function. Decides what character to use for the specified tile
overlayLetter = function(t)
{
	var bestRating = -Number.MAX_VALUE;
	var bestChar = 32;

	/*var letterWidth = global.env.letterWidth;
	var letterHeight = global.env.letterHeight;
	var letterData = global.env.letterData;
	var mask = global.env.mask;
	var inverseMatchWt = global.env.inverseMatchWt;*/

	var originI = t.x * letterWidth + t.y * letterHeight * mask.width;
	//var maxJitter = parseInt(allowedJitterSlider.value);

	for (var char = 32; char < 127; ++char)
	{
		var charData = letterData[char];
		if (charData.weight <= 0) continue;

		for (var i in jitterOffsets)
		{
			var jo = jitterOffsets[i];
			var jx = jo.x;
			var jy = jo.y;
			var jitteredOriginI = originI + jx + jy * mask.width;

			var rating = 0;
			var inverseRating = 0;
			for (var x = 0; x < letterWidth; ++x)
			for (var y = 0; y < letterHeight; ++y)
			{
				var letterValue = charData.pixels[x + y * letterWidth];
				var maskValue = mask.data[x + y * mask.width + jitteredOriginI];

				// bonus for convolution match
				rating += letterValue * maskValue;
				
				// penalty for convolution match with inverse
				inverseRating += letterValue * (1.0 - maskValue);
			}

			// sum, apply character weight
			rating = (rating - inverseMatchWt * inverseRating) * charData.weight;

			if (rating > bestRating)
			{
				bestRating = rating;
				bestChar = char;
			}
		}
	}

	return bestChar;
}

/// produces the output image for the array of letters
/// output is a Float32Array
lettersToImage = function(lettersGrid, outWidth, outHeight, tilesX, tilesY)
{
	var final = new Float32Array(outWidth * outHeight);

	for (var tx = 0; tx < tilesX; ++tx)
	for (var ty = 0; ty < tilesY; ++ty)
	{
		var originI = tx * letterWidth + ty * letterHeight * outWidth
		var letterPixels = letterData[lettersGrid[tx + ty * tilesX]].pixels;

		// copy the best character into the output buffer
		for (var x = 0; x < letterWidth; ++x)
		for (var y = 0; y < letterHeight; ++y)
		{
			final[x + y * outWidth + originI] = letterPixels[x + y * letterWidth];
		}
	}

	return new LiteImageData(final, outWidth, outHeight);
}
