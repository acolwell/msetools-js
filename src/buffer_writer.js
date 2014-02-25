// Copyright 2014 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


/**
 * @constructor
 * @param {Uint8Array} buf The buffer to read data from.
 */
function BufferWriter(buf) {
  this.buffer_ = buf;
  this.bytesWritten_ = 0;
}


/**
 * @type {Uint8Array}
 * @private
 */
BufferWriter.prototype.buffer_ = null;

/**
 * @type {DataView}
 * @private
 */
BufferWriter.prototype.dataView_ = null;

/**
 * @type {number}
 * @private
 */
BufferWriter.prototype.bytesWritten_ = 0;

BufferWriter.prototype.finish = function() {
    return this.buffer_.subarray(0, this.bytesWritten_);
}

/**
 * Writes an 8-bit unsigned integer to the buffer.
 *
 * @param {number} value The value to write to the buffer.
 */
BufferWriter.prototype.writeUint8 = function(value) {
    this.makeSpace_(1);
    this.dataView_.setUint8(this.bytesWritten_, value);
    this.bytesWritten_ += 1;
};

/**
 * Writes a 16-bit big endian unsigned integer to the buffer.
 *
 * @param {number} value The value to write to the buffer.
 */
BufferWriter.prototype.writeUint16 = function(value) {
    this.makeSpace_(2);
    this.dataView_.setUint16(this.bytesWritten_, value);
    this.bytesWritten_ += 2;
};

/**
 * Writes a 24-bit big endian unsigned integer to the buffer.
 *
 * @param {number} value The value to write to the buffer.
 */
BufferWriter.prototype.writeUint24 = function(value) {
    this.makeSpace_(3);
    this.dataView_.setUint8(this.bytesWritten_, (value >> 16) & 0xff);
    this.dataView_.setUint16(this.bytesWritten_ + 1, value);
    this.bytesWritten_ += 3;
};

/**
 * Writes a 32-bit big endian unsigned integer to the buffer.
 *
 * @param {number} value The value to write to the buffer.
 */
BufferWriter.prototype.writeUint32 = function(value) {
    this.makeSpace_(4);
    this.dataView_.setUint32(this.bytesWritten_, value);
    this.bytesWritten_ += 4;
};

/**
 * Writes a 64-bit big endian unsigned integer to the buffer.
 *
 * @param {number} value The value to write to the buffer.
 */
BufferWriter.prototype.writeUint64 = function(value) {
    this.makeSpace_(8);
    for (var i = 7; i >= 0; --i) {
	var b = value & 0xff;
	this.buffer_[this.bytesWritten_ + i] = b;
	value = (value - b) / 256;
    }
    this.bytesWritten_ += 8;
};

/**
 * Writes a Uint8Array to the buffer.
 *
 * @param {Uint8Array} buffer The buffer to write.
 */
BufferWriter.prototype.writeUint8Array = function(buffer) {
    this.makeSpace_(buffer.length);
    this.buffer_.set(buffer, this.bytesWritten_);
    this.bytesWritten_ += buffer.length;
};

/**
 * Writes an ASCII string to the buffer.
 *
 * @param {string} value The string to write to the buffer.
 */
BufferWriter.prototype.writeAscii = function(value) {
    this.makeSpace_(value.length);
    for (var i = 0; i < value.length; ++i) {
	var ch = value.charCodeAt(i);
	if (ch > 255) {
	    throw "Non-ASCII character encountered. '" + value.charAt(i) + "'"; 
	}
	this.buffer_[this.bytesWritten_++] = ch;
    }
}

BufferWriter.prototype.reserveUint32 = function(exclusive) {
    var fieldOffset = this.bytesWritten_;
    this.writeUint32(0);
    
    var t = this;
    var doneFunc = function(value) {
	if (value == undefined) {
	    value = t.bytesWritten_ - fieldOffset;
	    if (exclusive)
		value -= 4;
	}

	var tmp = t.bytesWritten_;
	t.bytesWritten_ = fieldOffset;
	t.writeUint32(value);
	t.bytesWritten_ = tmp;
    };

    return { done: doneFunc};
};

/**
 * Ensures that buffer_ has at least |bytesNeeded| bytes.
 *
 * @param {number} bytesNeeded The number of bytes to skip.
 */
BufferWriter.prototype.makeSpace_ = function(bytesNeeded) {
    if (this.buffer_ == null) {
	this.buffer_ = new Uint8Array(bytesNeeded);
	this.dataView_ = new DataView(this.buffer_.buffer);
	return;
    }

    var totalNeeded = this.bytesWritten_ + bytesNeeded;
    if (totalNeeded <= this.buffer_.length)
	return;

    var newLength = this.buffer_.length;
    while (newLength < totalNeeded) {
	newLength *= 2;
    }
    
    var newBuffer = new Uint8Array(newLength);
    newBuffer.set(this.buffer_);
    this.buffer_ = newBuffer;
    this.dataView_ = new DataView(this.buffer_.buffer);
};

var exports = exports || {};
exports.BufferWriter = BufferWriter;
