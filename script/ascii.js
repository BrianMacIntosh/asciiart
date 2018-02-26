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

// params:
// oobValue - value to use for out-of-bounds pixels
// buffer: optional buffer to put the results in
Kernel.prototype.convolute = function(data, params, buffer)
{
	for (var dx = 0; dx < data.width; ++dx)
	for (var dy = 0; dy < data.height; ++dy)
	{
		for (var kx = 0; kx < this.width; ++kx)
		for (var ky = 0; ky < this.height; ++ky)
		{
			//TOOD:
		}
	}
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
letterData['<'.charCodeAt(0)].weight = 1.5;
letterData['>'.charCodeAt(0)].weight = 1.5;
letterData['|'.charCodeAt(0)].weight = 1.8;
letterData['('.charCodeAt(0)].weight = 1.5;
letterData[')'.charCodeAt(0)].weight = 1.5;
letterData['f'.charCodeAt(0)].weight = 0.8;
letterData['a'.charCodeAt(0)].weight = 0.8;
letterData['r'.charCodeAt(0)].weight = 0.8;
letterData['t'.charCodeAt(0)].weight = 0.8;
letterData['j'.charCodeAt(0)].weight = 0.8;
letterData['['.charCodeAt(0)].weight = 0.9;
letterData[']'.charCodeAt(0)].weight = 0.9;

letterWidth = 0.0;
letterHeight = 0.0;
letterAspect = 1.0;

scratchCanvas = null;
scratchCtx = null;
outputCanvas = null;
outputCtx = null;
thresholdSlider = null;
sdfFalloffSlider = null;
inverseMatchSlider = null;
processStepSlider = null;

outputTilesX = 0; // horizontal tiles in the output
outputTilesY = 0; // vertical tiles in the output
productionStep = -1; // the highest production step reached so far for this image
rawImageData = null; // input image (Uint8ClampedArray RGBA)
rawGreyData = null; // greyscale input data (Float32Array)
edgeDetected = null; // edge-detected data (Float32Array)
thresholded = null; // thresholded (Float32Array)
sdf = null; // sdf (Float32Array)
letterChars = null; // Uint8Array of chars in the output grid
finalImage = null; // final image with matched letters (Float32Array)

onDomLoaded = function()
{
	scratchCanvas = document.createElement("canvas");
	scratchCtx = scratchCanvas.getContext("2d");

	outputCanvas = document.getElementById("outputCanvas");
	outputCtx = outputCanvas.getContext('2d');

	thresholdSlider = document.getElementById("thresholdSlider");
	thresholdSlider.addEventListener("change", onThresholdChanged);

	sdfFalloffSlider = document.getElementById("sdfFalloffSlider");
	sdfFalloffSlider.addEventListener("change", onSdfFalloffChanged);

	inverseMatchSlider = document.getElementById("inverseMatchSlider");
	inverseMatchSlider.addEventListener("change", onInverseMatchWeightChanged);

	processStepSlider = document.getElementById("processStepSlider");
	processStepSlider.addEventListener("change", onProcessStepChanged);

	loadLetters();
}

onThresholdChanged = function(e)
{
	produceImageThresholds();
}

onSdfFalloffChanged = function(e)
{
	produceImageSdf();
}

onInverseMatchWeightChanged = function(e)
{
	produceImageLetters();
}

onProcessStepChanged = function()
{
	var startFromStep = parseInt(processStepSlider.value);
	startFromStep = Math.min(productionStep + 1, startFromStep);
	switch (startFromStep)
	{
		case 0: produceGreyscale(); break;
		case 1: produceImageEdges(); break;
		case 2: produceImageThresholds(); break;
		case 3: produceImageSdf(); break;
		case 4: produceImageLetters(); break;
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
		produceImage();
	};
	loadedImage.src = urlElement.value;
}

produceImage = function()
{
	productionStep = -1;

	console.log("Image loaded.");
	console.log(loadedImage);

	var sourceX = loadedImage.width;
	var sourceY = loadedImage.height;

	var aspectRatio = sourceX / sourceY;
	outputTilesY = 40;
	var outputTilesXFloat = outputTilesY * aspectRatio / letterAspect;
	outputTilesX = Math.ceil(outputTilesXFloat);
	var outputX = outputTilesX * letterWidth;
	var outputY = outputTilesY * letterHeight;
	var outputTilesXRemainder = outputTilesX - outputTilesXFloat;
	var outputXMargin = outputTilesXRemainder * letterWidth / 2;

	var outputPixelCount = outputX * outputY;

	// get image data
	scratchCanvas.width = outputX;
	scratchCanvas.height = outputY;
	scratchCtx.drawImage(loadedImage,
		0, 0, sourceX, sourceY,
		0, 0, outputX, outputY);
	var imageData = scratchCtx.getImageData(0, 0, outputX, outputY);
	rawImageData = new LiteImageData(imageData.data, outputX, outputY)

	produceGreyscale();
}

produceGreyscale = function()
{
	// greyscale the data
	rawGreyData = getGreyscale(rawImageData);

	productionStep = Math.max(productionStep, 0);
	if (processStepSlider.value <= 0)
		showOutput(rawGreyData);
	else
		produceImageEdges();
}

produceImageEdges = function()
{
	// edge detection
	edgeDetected = getEdges(rawGreyData);

	productionStep = Math.max(productionStep, 1);
	if (processStepSlider.value <= 1)
		showOutput(edgeDetected);
	else
		produceImageThresholds();
}

produceImageThresholds = function()
{
	// threshold
	thresholded = thresholdFloats(edgeDetected, thresholdSlider.value);

	productionStep = Math.max(productionStep, 2);
	if (processStepSlider.value <= 2)
		showOutput(thresholded);
	else
		produceImageSdf();
}

produceImageSdf = function()
{
	// compute the distance field for the thresholded image
	sdf = floatToHackyFastSDF(thresholded, sdfFalloffSlider.value);

	productionStep = Math.max(productionStep, 3);
	if (processStepSlider.value <= 3)
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

	produceImageFinal();
}

produceImageFinal = function()
{
	finalImage = lettersToImage(letterChars,
		rawImageData.width, rawImageData.width,
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
floatToHackyFastSDF = function(imageData, falloff)
{
	if (!(imageData instanceof LiteImageData))
	{
		throw "'imageData' is not a LiteImageData";
	}
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

	for (var char = 32; char < 127; ++char)
	{
		var rating = 0;
		var inverseRating = 0;
		var charData = letterData[char];
		for (var x = 0; x < letterWidth; ++x)
		for (var y = 0; y < letterHeight; ++y)
		{
			var letterValue = charData.pixels[x + y * letterWidth];
			var maskValue = mask.data[x + y * mask.width + originI];

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
