'use strict';

var assignIn = require('lodash.assignin');
var Canvas = require('canvas-utilities').Canvas;
var ImageHelper = require('canvas-utilities/lib/image-helper.js');

function ImageInterestingness(options) {
  this.options = assignIn({}, ImageInterestingness.DEFAULTS, options);
}

ImageInterestingness.DEFAULTS = {
  detailWeight: 1,
  saturationBrightnessMin: 0.05,
  saturationBrightnessMax: 0.9,
  saturationThreshold: 0.4,
  saturationBias: 5,
  saturationWeight: 0.5,
  scoreDownSample: 1,
  edgeRadius: 0.4,
  edgeWeight: -20.0,
  ruleOfThirds: true
};

ImageInterestingness.prototype = {
  canvas: function (width, height) {
    var canvas = new Canvas();

    canvas.width = width;
    canvas.height = height;

    return canvas;
  },

  edgeDetect: function (input, output) {
    var w = input.width;
    var h = input.height;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var p = (y * w + x) * 4;
        var lightness;

        if (x === 0 ||
            x >= w - 1 ||
            y === 0 ||
            y >= h - 1) {
          lightness = sample(input.data, p);
        } else {
          lightness = sample(input.data, p) * 4 -
                      sample(input.data, p - w * 4) -
                      sample(input.data, p - 4) -
                      sample(input.data, p + 4) -
                      sample(input.data, p + w * 4);
        }

        output.data[p + 1] = lightness;
      }
    }
  },

  saturationDetect: function (input, output) {
    var w = input.width;
    var h = input.height;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var p = (y * w + x) * 4;
        var lightness = cie(input.data[p], input.data[p + 1], input.data[p + 2]) / 255;
        var sat = saturation(input.data[p], input.data[p + 1], input.data[p + 2]);

        if (sat > this.options.saturationThreshold &&
            lightness >= this.options.saturationBrightnessMin &&
            lightness <= this.options.saturationBrightnessMax) {
          output.data[p + 2] = (sat - this.options.saturationThreshold) *
                               (255 / (1 - this.options.saturationThreshold));
        } else {
          output.data[p + 2] = 0;
        }
      }
    }
  },

  score: function (output, dimensions) {
    var score = {
      detail: 0,
      saturation: 0,
      total: 0
    };

    var downSample = this.options.scoreDownSample;
    var invDownSample = 1 / downSample;
    var outputHeightDownSample = output.height * downSample;
    var outputWidthDownSample = output.width * downSample;

    for (var y = 0; y < outputHeightDownSample; y += downSample) {
      for (var x = 0; x < outputWidthDownSample; x += downSample) {
        var p = (truncate(y * invDownSample) * output.width +
                 truncate(x * invDownSample)) * 4;
        var importance = this.importance(dimensions, x, y);
        var detail = output.data[p + 1] / 255;

        score.detail += detail * importance;
        score.saturation += output.data[p + 2] / 255 *
                            (detail + this.options.saturationBias) * importance;
      }
    }

    score.total = (score.detail * this.options.detailWeight +
                   score.saturation * this.options.saturationWeight);

    return score;
  },

  importance: function (dimensions, x, y) {
    x /= dimensions.width;
    y /= dimensions.height;

    var px = Math.abs(0.5 - x) * 2;
    var py = Math.abs(0.5 - y) * 2;

    // distance from edge
    var dx = Math.max(px - 1.0 + this.options.edgeRadius, 0);
    var dy = Math.max(py - 1.0 + this.options.edgeRadius, 0);

    var d = (dx * dx + dy * dy) * this.options.edgeWeight;

    var s = 1.41 - Math.sqrt(px * px + py * py);

    if (this.options.ruleOfThirds) {
      s += (Math.max(0, s + d + 0.5) * 1.2) *
        (thirds(px) + thirds(py));
    }

    return s + d;
  },

  analyze: function (image) {
    var canvas = this.canvas(image.width, image.height);
    var ctx = canvas.getContext('2d');

    ctx.drawImage(image, 0, 0);

    var input = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var output = ctx.getImageData(0, 0, canvas.width, canvas.height);

    this.edgeDetect(input, output);
    this.saturationDetect(input, output);

    var scoreCanvas = this.canvas(
      Math.ceil(image.width / this.options.scoreDownSample),
      Math.ceil(image.height / this.options.scoreDownSample));

    var scoreCtx = scoreCanvas.getContext('2d');

    ctx.putImageData(output, 0, 0);

    scoreCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0,
                       scoreCanvas.width, scoreCanvas.height);

    var scoreOutput = scoreCtx.getImageData(
      0, 0, scoreCanvas.width, scoreCanvas.height);

    var dimensions = {
      width: image.width,
      height: image.height
    };

    return this.score(scoreOutput, dimensions);
  },

  analyzeFile: function (filename) {
    var image = ImageHelper.fromFile(filename).image();

    return this.analyze(image);
  }
};

function truncate(number) {
  if (number < 0) {
    return Math.ceil(number);
  }

  return Math.floor(number);
}

// gets value in the range of [0, 1] where 0 is the center of the pictures
// returns weight of rule of thirds [0, 1]
function thirds(x) {
  x = ((x - (1 / 3) + 1.0) % 2.0 * 0.5 - 0.5) * 16;

  return Math.max(1.0 - x * x, 0.0);
}

function cie(r, g, b) {
  return 0.5126 * b + 0.7152 * g + 0.0722 * r;
}

function sample(data, p) {
  return cie(data[p], data[p + 1], data[p + 2]);
}

function saturation(r, g, b) {
  var maximum = Math.max(r / 255, g / 255, b / 255);
  var minumum = Math.min(r / 255, g / 255, b / 255);

  if (maximum === minumum) {
    return 0;
  }

  var l = (maximum + minumum) / 2;
  var d = maximum - minumum;

  return l > 0.5 ? d / (2 - maximum - minumum) : d / (maximum + minumum);
}

module.exports = ImageInterestingness;
