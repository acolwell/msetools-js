// Copyright 2012 Google Inc. All Rights Reserved.
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
function BufferReader(buf) {
  this.buffer_ = buf;
  this.index_ = 0;
}

/**
 * @type {Uint8Array}
 * @private
 */
BufferReader.prototype.buffer_ = null;

/**
 * @type {number}
 * @private
 */
BufferReader.prototype.index_ = 0;


/**
 * Get the number of unread bytes left.
 *
 * @return {number} The number of unread bytes left.
 */
BufferReader.prototype.bytesLeft = function() {
  if (this.index_ >= this.buffer_.length) {
    return 0;
  }

  return this.buffer_.length - this.index_;
};

/**
 * Skips bytes in the buffer.
 *
 * @param {number} count The number of bytes to skip.
 */
BufferReader.prototype.skip = function(count) {
  this.index_ += count;
  if (this.index_ > this.buffer_.length) {
    throw new Error('Skipped past the end of the buffer.');
  }
};

/**
 * Reads a 8-bit big endian unsigned integer from the buffer.
 *
 * @return {number} The 8-bit unsigned integer read from the buffer.
 */
BufferReader.prototype.readUint8 = function() {
  return this.readUint_(1);
};

/**
 * Reads a 16-bit big endian unsigned integer from the buffer.
 *
 * @return {number} The 16-bit unsigned integer read from the buffer.
 */
BufferReader.prototype.readUint16 = function() {
  return this.readUint_(2);
};

/**
 * Reads a 32-bit big endian unsigned integer from the buffer.
 *
 * @return {number} The 32-bit unsigned integer read from the buffer.
 */
BufferReader.prototype.readUint32 = function() {
  return this.readUint_(4);
};


/**
 * Reads a 64-bit big endian unsigned integer from the buffer.
 *
 * @return {number} The 64-bit unsigned integer read from the buffer.
 */
BufferReader.prototype.readUint64 = function() {
  return this.readUint_(8);
};


/**
 * Reads a big endian integer from the buffer.
 *
 * @private
 * @param {number} size The number of bytes to read.
 * @return {number} The integer read from the buffer.
 */
BufferReader.prototype.readUint_ = function(size) {
  if (size > 8) {
    throw new Error('Read size too large.');
  }

  var result = 0;
  var end = this.index_ + size;
  for (; this.index_ < end; ++this.index_) {
    result *= 256;
    result += this.buffer_[this.index_] & 0xff;
  }
  return result;
};

msetools.BufferReader = BufferReader;
