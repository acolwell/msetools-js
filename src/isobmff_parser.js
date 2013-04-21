// Copyright 2013 Google Inc. All Rights Reserved.
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
 * Client interface for msetools.ISOBMFFParser.
 * @interface
 */
msetools.ISOBMFFParserClient = function() {};


/**
 * Called when the start of a list element is parsed.
 * @param {string} id The ID for the list element.
 * @param {number} elementPosition The position of list element header.
 * @param {number} bodyPosition The position of list element body.
 * @return {msetools.ParserStatus} True if the element was accepted by
 * the client. False if the client wants the parser to signal a parse error.
 */
msetools.ISOBMFFParserClient.prototype.onListStart =
  function(id, elementPosition, bodyPosition) {};


/**
 * Called when the end of a list element is parsed.
 * @param {string} id The ID for the list element.
 * @param {number} size The size of the list.
 * @return {boolean} True if the element was accepted by the client.
 * False if the client wants the parser to signal a parse error.
 */
msetools.ISOBMFFParserClient.prototype.onListEnd = function(id, size) {};


/**
 * Called when a standard box is parsed.
 * @param {string} id The ID for the element.
 * @param {Uint8Array} value The value in the element.
 * @param {number} elementPosition The position of element header.
 * @param {number} bodyPosition The position of element body.
 * @return {boolean} True if the element was accepted by the client.
 * False if the client wants the parser to signal a parse error.
 */
msetools.ISOBMFFParserClient.prototype.onBox =
  function(id, value, elementPosition, bodyPosition) {};

/**
 * Called when a full box is parsed.
 * @param {string} id The ID for the element.
 * @param {number} version The element version.
 * @param {number} flags The element flags.
 * @param {Uint8Array} value The value in the element.
 * @param {number} elementPosition The position of element header.
 * @param {number} bodyPosition The position of element body.
 * @return {boolean} True if the element was accepted by the client.
 * False if the client wants the parser to signal a parse error.
 */
msetools.ISOBMFFParserClient.prototype.onFullBox =
  function(id, version, flags, value, elementPosition, bodyPosition) {};

/**
 * @constructor
 * @implements msetools.ParserClient
 * @param {msetools.ISOBMFFParserClient} client Client object called when
 *  elements are parsed.
 */
function ISOBMFFParser(client) {
  this.parser_ = new msetools.ElementListParser(this);
  this.client_ = client;
  this.parserError_ = false;
  this.errors_ = [];
}

/**
 * @type {msetools.ElementListParser}
 * @private
 */
ISOBMFFParser.prototype.parser_ = null;

/**
 * @type {msetools.ISOBMFFParserClient}
 * @private
 */
ISOBMFFParser.prototype.client_ = null;

/**
 * Parse new bytestream data.
 *
 * @param {Uint8Array} data The new data to parse.
 * @return {Array.<string>} List of parse errors detected.
 */
ISOBMFFParser.prototype.parse = function(data) {
  if (this.parserError_) {
    return ['Previously encountered a parser error.'];
  }

  this.errors_ = [];
  if (this.parser_.append(data) == msetools.ParserStatus.ERROR) {
    this.parserError_ = true;
  }

  var errors = this.errors_;
  this.errors_ = [];
  for (var i = 0; i < errors.length; ++i) {
    console.log('Error : ' + errors[i]);
  }
  return errors;
};

/**
 * @override
 */
ISOBMFFParser.prototype.parseElementHeader = function(buf) {
  var ERROR_STATUS = {status: msetools.ParserStatus.ERROR,
                      bytesUsed: 0, id: '', size: 0 };

  if (buf.length < 8) {
    return {status: msetools.ParserStatus.NEED_MORE_DATA,
            bytesUsed: 0, id: '', size: 0 };
  }

  var br = new msetools.BufferReader(buf);
  var size = br.readUint32();

  if (size == 0) {
    this.errors_.push('Box size of 0 not allowed!.');
    return ERROR_STATUS;
  }

  if (size == 1) {
    this.errors_.push('64-bit box sizes not supported yet!.');
    return ERROR_STATUS;
  }

  var id = '';
  for (var i = 0; i < 4; ++i) {
    id += String.fromCharCode(br.readUint8());
  }

  if (id == 'uuid') {
    this.errors_.push('uuid boxes not supported yet!.');
    return ERROR_STATUS;
  }

  var bytesUsed = buf.length - br.bytesLeft();
  if (size < bytesUsed) {
    this.errors_.push('Invalid box size ' + size);
    return ERROR_STATUS;
  }

  //console.log('id ' + id + ' size ' + size);
  return {
    status: msetools.ParserStatus.OK,
    bytesUsed: bytesUsed,
    id: id,
    size: (size - bytesUsed)
  };
};

/**
 * Indicates which element IDs are list elements.
 *
 * @type {Object.<string, boolean>}
 * @private
 */
ISOBMFFParser.ID_IS_LIST_MAP_ = {
  'moov': true,
  'trak': true,
  'edts': true,
  'mdia': true,
  'minf': true,
  'dinf': true,
  'stbl': true,
  'mvex': true,
  'moof': true,
  'traf': true,
  'mfra': true,
  'skip': true,
  'udta': true,
  'strk': true,
//  'meta': true,
//  'ipro': true,
//  'sinf': true,
//  'fiin': true,
//  'paen': true,
  'meco': true
};

/**
 * @override
 */
ISOBMFFParser.prototype.isIdAList = function(id) {
  return ISOBMFFParser.ID_IS_LIST_MAP_[id] || false;
};


/**
 * Indicates which element IDs are full box elements.
 *
 * @type {Object.<string, boolean>}
 * @private
 */
ISOBMFFParser.ID_IS_FULL_BOX_MAP_ = {
  'mvhd': true,
  'tkhd': true,
  'mdhd': true,
  'hdlr': true,
  'vmhd': true,
  'smhd': true,
  'trex': true,
  'tfhd': true,
  'trun': true
};

/**
 * Checks to see if the id is a full box element.
 *
 * @private
 * @param {string} id The id to check.
 * @return {boolean} True if the id is a full box element.
 * False otherwise.
 */
ISOBMFFParser.prototype.isIdAFullBox_ = function(id) {
  return ISOBMFFParser.ID_IS_FULL_BOX_MAP_[id] || false;
};

/**
 * @override
 */
ISOBMFFParser.prototype.onListStart = function(id, elementPosition,
                                               bodyPosition) {
  /*
  console.log('onListStart(' + id +
              ', ' + elementPosition +
              ', ' + bodyPosition + ')');
  */
  return this.client_.onListStart(id, elementPosition, bodyPosition);
};


/**
 * @override
 */
ISOBMFFParser.prototype.onListEnd = function(id, size) {
  //console.log('onListEnd(' + id + ', ' + size + ')');
  return this.client_.onListEnd(id, size);
};


/**
 * @override
 */
ISOBMFFParser.prototype.onBinary = function(id, value, elementPosition,
                                            bodyPosition) {
  if (this.isIdAFullBox_(id)) {
    if (value.length < 4) {
      console.log('Invalid FullBox \'' + id + '\'');
      return false;
    }
    var br = new msetools.BufferReader(value);
    var tmp = br.readUint32();
    var version = (tmp >> 24) & 0xff;
    var flags = tmp & 0xffffff;
    return this.client_.onFullBox(id, version, flags, value.subarray(4),
                                 elementPosition, bodyPosition + 4);
  }

  this.client_.onBox(id, value, elementPosition, bodyPosition);
  return true;
};

msetools.ISOBMFFParser = ISOBMFFParser;
