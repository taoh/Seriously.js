/* global define, require */
(function (root, factory) {
	'use strict';

	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define(['seriously'], factory);
	} else if (typeof exports === 'object') {
		// Node/CommonJS
		factory(require('seriously'));
	} else {
		/*
		todo: build out-of-order loading for sources and transforms or remove this
		if (!root.Seriously) {
			root.Seriously = { plugin: function (name, opt) { this[name] = opt; } };
		}
		*/
		factory(root.Seriously);
	}
}(this, function (Seriously, undefined) {
	'use strict';

	/*
	Load depth map from JPG file
	https://developers.google.com/depthmap-metadata/

	Depth maps can be generated by Android Camera app
	http://googleresearch.blogspot.sg/2014/04/lens-blur-in-new-google-camera-app.html

	Method for loading depth image from jpg borrowed from Jaume Sanchez Elias (@thespite)
	http://www.clicktorelease.com/tools/lens-blur-depth-extractor/
	*/

	function ab2str(buf) {
		return String.fromCharCode.apply(null, new Uint8Array(buf));
	}

	function memcpy(dst, dstOffset, src, srcOffset, length) {
		var dstU8 = new Uint8Array(dst, dstOffset, length),
			srcU8 = new Uint8Array(src, srcOffset, length);

		dstU8.set(srcU8);
	}

	var depthRegex = /GDepth:Data="([\S]*)"/;

	Seriously.source('depth', function (source, options, force) {
		var that = this,
			element,
			url,
			xhr,
			depthImage,

			destroyed = false;

		/*
		todo: what happens if src of source image changes? can we adapt?
		*/

		function initialize() {
			if (!destroyed) {
				that.width = depthImage.naturalWidth;
				that.height = depthImage.naturalHeight;
				that.setReady();
			}
		}

		function parseArrayBuffer(arrayBuffer) {
			var byteArray = new Uint8Array(arrayBuffer), // this.response == uInt8Array.buffer
				boundaries = [],

				str = '',
				i, j,
				tmp,
				tmpStr,
				length,
				offset,
				match;

			if (byteArray[0] == 0xff && byteArray[1] == 0xd8) {
				//look for boundaries
				for (i = 0; i < byteArray.byteLength; i++) {
					if (byteArray[i] === 0xff && byteArray[i + 1] === 0xe1) {
						boundaries.push(i);
						i++;
					}
				}
				boundaries.push(byteArray.byteLength);

				for (j = 0; j < boundaries.length - 1; j++) {
					if (byteArray[boundaries[j]] === 0xff && byteArray[boundaries[j] + 1] === 0xe1) {
						length = byteArray[boundaries[j] + 2] * 256 + byteArray[boundaries[j] + 3];
						offset = 79;
						if (offset > length) {
							offset = 0;
						}
						length += 2;

						tmp = new ArrayBuffer(length - offset);
						memcpy(tmp, 0, arrayBuffer, boundaries[j] + offset, length - offset);
						tmpStr = ab2str(tmp);
						str += tmpStr;
					}
				}

				match = depthRegex.exec(str);
				if (match === null) {
					Seriously.logger.error('JPEG file does not include depth image.');
					return false;
				}

				if (!depthImage) {
					depthImage = document.createElement('img');
				}

				depthImage.src = 'data:image/png;base64,' + match[1];

				if (!depthImage.complete || !depthImage.naturalWidth) {
					depthImage.addEventListener('load', initialize, true);
					depthImage.addEventListener('error', function (evt) {
						Seriously.logger.error('Error loading depth image.', evt);
					}, true);
				} else {
					initialize();
				}
			} else {
				Seriously.logger.error('Unable to load depth image. File is not a JPEG.');
				return false;
			}
		}

		if (force) {
			if (typeof source === 'string') {
				element = document.querySelector(source);
			} else {
				element = source;
			}

			if (element instanceof window.ArrayBuffer) {
				parseArrayBuffer(source);
			} else if (options && options.url) {
				url = options.url;
			} else if (element && element instanceof window.HTMLImageElement &&
					(element.tagName === 'IMG' || force)) {

				url = element.src;
				//todo: validate url
			}

			if (!url && typeof source === 'string') {
				url = source;
			}

			if (url) {
				depthImage = document.createElement('img');

				xhr = new XMLHttpRequest();
				xhr.open('GET', url, true);
				xhr.responseType = 'arraybuffer';

				xhr.onload = function() {
					parseArrayBuffer(this.response);
				};

				xhr.send();
			}

			return !depthImage ? false : {
				deferTexture: true,
				source: depthImage,
				render: Object.getPrototypeOf(this).renderImageCanvas,
				destroy: function () {
					destroyed = true;
				}
			};

		}
	}, {
		title: 'Depth Image'
	});
}));