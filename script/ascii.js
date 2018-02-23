//TODO:
//- what if user inputs image before letters are loaded?

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

outputX = 0; // width of the output
outputY = 0; // height of the output
outputTilesX = 0; // horizontal tiles in the output
outputTilesY = 0; // vertical tiles in the output
productionStep = -1; // the highest production step reached so far for this image
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
		case 0: produceImageEdges(); break;
		case 1: produceImageThresholds(); break;
		case 2: produceImageSdf(); break;
		case 3: produceImageLetters(); break;
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
	for (var y = 0; y < lettersY; y++)
	for (var x = 0; x < lettersX; x++)
	{
		var pixels = new Float32Array(letterWidth * letterHeight);
		var filledPixels = 0;
		var iy = y * letterHeight;
		var ix = x * letterWidth;
		for (var y2 = 0; y2 < letterHeight; y2++)
		for (var x2 = 0; x2 < letterWidth; x2++)
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
	outputX = outputTilesX * letterWidth;
	outputY = outputTilesY * letterHeight;
	var outputTilesXRemainder = outputTilesX - outputTilesXFloat;
	var outputXMargin = outputTilesXRemainder * letterWidth / 2;

	var outputPixelCount = outputX * outputY;

	// get image data
	scratchCanvas.width = outputX;
	scratchCanvas.height = outputY;
	scratchCtx.drawImage(loadedImage,
		0, 0, sourceX, sourceY,
		0, 0, outputX, outputY);
	var rawImageData = scratchCtx.getImageData(0, 0, outputX, outputY);

	// greyscale the data
	rawGreyData = getGreyscale(rawImageData.data);

	produceImageEdges();
}

produceImageEdges = function()
{
	// edge detection
	edgeDetected = getEdges(rawGreyData, outputX, outputY);

	productionStep = Math.max(productionStep, 0);
	if (processStepSlider.value <= 0)
		showOutput(greyFloatToRGBA(edgeDetected));
	else
		produceImageThresholds();
}

produceImageThresholds = function()
{
	// threshold
	thresholded = thresholdFloats(edgeDetected, thresholdSlider.value);

	productionStep = Math.max(productionStep, 1);
	if (processStepSlider.value <= 1)
		showOutput(greyFloatToRGBA(thresholded));
	else
		produceImageSdf();
}

produceImageSdf = function()
{
	// compute the distance field for the thresholded image
	sdf = floatToHackyFastSDF(thresholded, outputX, outputY, sdfFalloffSlider.value);

	productionStep = Math.max(productionStep, 2);
	if (processStepSlider.value <= 2)
		showOutput(greyFloatToRGBA(sdf));
	else
		produceImageLetters();
}

produceImageLetters = function()
{
	overlayLetters(sdf, outputX, outputY, outputTilesX, outputTilesY,
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
	finalImage = lettersToImage(letterChars, outputX, outputY, outputTilesX, outputTilesY)

	productionStep = Math.max(productionStep, 3);
	showOutput(greyFloatToRGBA(finalImage));
}

showOutput = function(rgbaData)
{
	// output
	outputCanvas.width = outputX;
	outputCanvas.height = outputY;
	var outputImageData = new ImageData(rgbaData, outputX, outputY);
	outputCtx.putImageData(outputImageData, 0, 0);
}

/// Returns an array of greyscale values for each pixel in the data
/// Expects data as RGBA
getGreyscale = function(data)
{
	var pixels = data.length / 4;
	if (pixels != Math.floor(pixels))
	{
		throw "getGreyscale: input array size is not divisble by 4";
	}
	var grey = new Float32Array(pixels);
	for (var i = 0; i < pixels; i++)
	{
		var i4 = i * 4;
		grey[i] = (data[i4 + 0] * 0.21
			+ data[i4 + 1] * 0.72
			+ data[i4 + 2] * 0.07) / 255.0;
	}
	return grey;
}

/// Returns an array of 0-1 values for edge-detected pixels
/// Expects an array of one value per pixel
getEdges = function(greyData, width, height)
{
	var edges = new Float32Array(greyData.length);
	
	// vertical pass
	for (var x = 0; x < width; x++)
	{
		for (var y = 0; y < height - 1; y++)
		{
			var i = x + y * width;
			var inext = x + (y + 1) * width;
			edges[i] += Math.abs(greyData[i] - greyData[inext]);
		}
	}

	// horizontal pass
	for (var x = 0; x < width; x++)
	{
		for (var y = 0; y < height - 1; y++)
		{
			var i = x + y * width;
			var inext = (x + 1) + y * width;
			edges[i] += Math.abs(greyData[i] - greyData[inext]);
		}
	}

	return edges;
}

/// Thresholds the specified float array
thresholdFloats = function(data, threshold)
{
	var thresholded = new Float32Array(data.length);
	for (var i = 0; i < data.length; i++)
	{
		thresholded[i] = data[i] > threshold ? 1.0 : 0.0;
	}
	return thresholded;
}

/// Converts a greyscale (float) array to an RGBA byte array
greyFloatToRGBA = function(greyData)
{
	var rgba = new Uint8ClampedArray(greyData.length * 4);
	for (var i = 0; i < greyData.length; i++)
	{
		var v = greyData[i] * 255;
		rgba[i * 4 + 0] = v;
		rgba[i * 4 + 1] = v;
		rgba[i * 4 + 2] = v;
		rgba[i * 4 + 3] = 255;
	}
	return rgba;
}

/// Converts a float array to a signed distance field array
floatToHackyFastSDF = function(inData, width, height, falloff)
{
	var out = new Float32Array(inData);

	// right/down pass
	for (var x = 0; x < width - 1; x++)
	for (var y = 0; y < height - 1; y++)
	{
		var i = x + y * width;
		var ix = (x + 1) + y * width;
		var iy = x + (y + 1) * width;
		out[ix] = Math.max(out[ix], out[i] - falloff);
		out[iy] = Math.max(out[iy], out[i] - falloff);
	}

	// left/up pass
	for (var x = width - 1; x > 0; x--)
	for (var y = height - 1; y > 0; y--)
	{
		var i = x + y * width;
		var ix = (x - 1) + y * width;
		var iy = x + (y - 1) * width;
		out[ix] = Math.max(out[ix], out[i] - falloff);
		out[iy] = Math.max(out[iy], out[i] - falloff);
	}

	return out;
}

/// decides which letter to use for each tile
/// expects input as a Float32Array
/// ouputs a 2D Uint8Array of character ASCII codes
overlayLetters = function(imask, imaskWidth, imaskHeight, tilesX, tilesY,
	iinverseMatchWt,
	callback)
{
	var input = [];
	for (var ty = 0; ty < tilesY; ty++)
	for (var tx = 0; tx < tilesX; tx++)
	{
		input.push({x: tx, y: ty});
	}
	var task = new Parallel(input/*,
	{
		env: {
			letterWidth: letterWidth,
			letterHeight: letterHeight,
			letterData: letterData,
			mask: mask,
			maskWidth: maskWidth,
			//maskHeight: maskHeight,
			inverseMatchWt: inverseMatchWt,
		}
	}*/);
	//task.map(overlayLetter).then(callback);

	mask = imask;
	maskWidth = imaskWidth;
	inverseMatchWt = iinverseMatchWt;
	
	callback(input.map(overlayLetter));
}

//TEMP:
mask = null;
maskWidth = 0;
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
	var maskWidth = global.env.maskWidth;
	var inverseMatchWt = global.env.inverseMatchWt;*/

	var originX = t.x * letterWidth;
	var originY = t.y * letterHeight;
	var originI = originX + originY * maskWidth;

	for (var char = 32; char < 128; ++char)
	{
		var rating = 0;
		var inverseRating = 0;
		var charData = letterData[char];
		for (var x = 0; x < letterWidth; ++x)
		for (var y = 0; y < letterHeight; ++y)
		{
			var li = x + y * letterWidth;
			var oi = x + y * maskWidth + originI;
			var letterValue = charData.pixels[li];
			var maskValue = mask[oi];

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

	for (var tx = 0; tx < tilesX; tx++)
	for (var ty = 0; ty < tilesY; ty++)
	{
		// copy the best character into the output buffer
		for (var x = 0; x < letterWidth; x++)
		for (var y = 0; y < letterHeight; y++)
		{
			var li = x + y * letterWidth;
			var oi = x + tx * letterWidth + (y + ty * letterHeight) * outWidth;
			final[oi] = letterData[lettersGrid[tx + ty * tilesX]].pixels[li];
		}
	}

	return final;
}
