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
 * @implements msetools.ParserClient
 * @implements ByteStreamValidator
 */
function ISOBMFFValidator() {
  this.parser_ = new msetools.ElementListParser(this);
  this.parserError_ = false;
  this.errors_ = [];

  this.ID_IS_FULL_BOX_MAP_ = {
    'mvhd': this.parseMvhd,
    'tkhd': this.parseTkhd,
    'mdhd': this.parseMdhd,
    'hdlr': this.parseHdlr,
    'vmhd': this.parseVmhd,
    'smhd': this.parseSmhd,
    'trex': this.parseTrex,
    'tfhd': this.parseTfhd,
    'trun': this.parseTrun
  };

  this.currentTracks_ = {};
}

/**
 * @type {msetools.ElementListParser}
 * @private
 */
ISOBMFFValidator.prototype.parser_ = null;

/**
 * @type {number}
 * @private
 */
ISOBMFFValidator.prototype.default_sample_duration_ = -1;

/**
 * @type {number}
 * @private
 */
ISOBMFFValidator.prototype.default_sample_size_ = -1;

/**
 * @type {number}
 * @private
 */
ISOBMFFValidator.prototype.default_sample_flags_ = 0;

/**
 * @type {ByteStreamTypeInfo?}
 * @private
 */
ISOBMFFValidator.prototype.typeInfo_ = null;

/**
 * @type {boolean}
 * @private
 */
ISOBMFFValidator.prototype.expect_audio_ = false;

/**
 * @type {boolean}
 * @private
 */
ISOBMFFValidator.prototype.expect_video_ = false;


/**
 * @type {boolean}
 * @private
 */
ISOBMFFValidator.prototype.has_audio_ = false;

/**
 * @type {boolean}
 * @private
 */
ISOBMFFValidator.prototype.has_video_ = false;

/**
 * @override
 */
ISOBMFFValidator.prototype.init = function(typeInfo) {
  this.typeInfo_ = typeInfo;

  if (typeInfo.minor != 'mp4') {
    throw new Error(typeInfo.minor + ' not supported by this validator');
  }

  var AVC_PREFIX = 'avc1.';
  var AAC_PREFIX = 'mp4a.40.';
  var supportedCodecs = [];
  if (typeInfo.major == 'video') {
    supportedCodecs = [AVC_PREFIX, AAC_PREFIX];
  } else if (typeInfo.major == 'audio') {
    supportedCodecs = [AAC_PREFIX];
  }

  for (var i = 0; i < typeInfo.codecs.length; ++i) {
    var codec = typeInfo.codecs[i];
    var foundMatch = false;
    for (var j = 0; j < supportedCodecs.length; ++j) {
      if (codec.indexOf(supportedCodecs[j]) == 0) {
        foundMatch = true;

        if (supportedCodecs[j] == AVC_PREFIX) {
          this.expect_video_ = true;
        } else if (supportedCodecs[j] == AAC_PREFIX) {
          this.expect_audio_ = true;
        }
        break;
      }
    }

    if (!foundMatch) {
      console.log('Codec "' + codec + '" is not supported.');
    }
  }
};

/**
 * @override
 */
ISOBMFFValidator.prototype.parse = function(data) {
  if (this.parserError_) {
    return ['Previously encountered a parser error.'];
  }

  this.errors_ = [];
  if (this.parser_.append(data) == msetools.ParserStatus.ERROR) {
    this.parserError_ = true;
  }

  var errors = this.errors_;
  this.errors_ = [];
  return errors;
};

/**
 * @override
 */
ISOBMFFValidator.prototype.reset = function() {

};

/**
 * @override
 */
ISOBMFFValidator.prototype.endOfStream = function() {

};

/**
 * @override
 */
ISOBMFFValidator.prototype.parseElementHeader = function(buf) {
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
 */
var ID_IS_LIST_MAP = {
  'moov': true,
  'trak': true,
  'edts': true,
  'mdia': true,
  'minf': true,
  'stbl': true,
  'mvex': true,
  'moof': true,
  'traf': true
};

/**
 * @override
 */
ISOBMFFValidator.prototype.isIdAList = function(id) {
  return ID_IS_LIST_MAP[id] || false;
};

/**
 * Checks to see if the id is a full box element.
 *
 * @param {string} id The id to check.
 * @return {boolean} True if the id is a full box element.
 * False otherwise.
 */
ISOBMFFValidator.prototype.isIdAFullBox = function(id) {
  return this.ID_IS_FULL_BOX_MAP_[id] || false;
};

/**
 * @override
 */
ISOBMFFValidator.prototype.onListStart = function(id, elementPosition,
                                                  bodyPosition) {
  /*
  console.log('onListStart(' + id +
              ', ' + elementPosition +
              ', ' + bodyPosition + ')');
  */

  if (id == 'moof') {
    this.currentTracks_ = {};
  } else if (id == 'trak') {
    this.currentTrackID_ = 0;
  }

  return msetools.ParserStatus.OK;
};


/**
 * @override
 */
ISOBMFFValidator.prototype.onListEnd = function(id, size) {
  //console.log('onListEnd(' + id + ', ' + size + ')');

  if (id == 'moof') {
    if (this.has_video_ != this.expect_video_) {
      console.log('The moov box ' +
                  (this.has_video_ ? ' has' : ' does not have') +
                  ' a video track, but a video codec' +
                  (this.expect_video_ ? ' was' : ' was not') +
                  ' specified in the type passed to addSourceBuffer()');
    }

    if (this.has_audio_ != this.expect_audio_) {
      console.log('The moov box ' +
                  (this.has_audio_ ? ' has' : ' does not have') +
                  ' an audio track, but an audio codec' +
                  (this.expect_audio_ ? ' was' : ' was not') +
                  ' specified in the type passed to addSourceBuffer()');
    }
  } else if (id == 'trak') {
    this.currentTrackID_ = 0;
  }

  return true;
};


/**
 * @override
 */
ISOBMFFValidator.prototype.onBinary = function(id, value) {
  if (this.isIdAFullBox(id)) {
    if (value.length < 4) {
      console.log('Invalid FullBox \'' + id + '\'');
      return false;
    }
    var br = new msetools.BufferReader(value);
    var tmp = br.readUint32();
    var version = (tmp >> 24) & 0xff;
    var flags = tmp & 0xffffff;
    return this.onFullBox(id, version, flags, value.subarray(4));
  }

  //console.log('onBinary(' + id + ', ' + value.length + ')');

  return true;
};

/**
 * Called when a full box element has been received.
 *
 * @param {string} id Element id.
 * @param {number} version The full box version field.
 * @param {number} flags The full box flags field.
 * @param {Uint8Array} value The body of the full box.
 * @return {boolean} True if the element was successfully parsed.
 */
ISOBMFFValidator.prototype.onFullBox = function(id, version, flags, value) {
  /*
  console.log('onFullBox(' + id +
              ', ' + version +
              ', 0x' + flags.toString(16) +
              ', ' + value.length + ')');
  */
  var func = this.ID_IS_FULL_BOX_MAP_[id];

  if (!func) {
    return true;
  }

  return func.call(this, version, flags, value);
};

/**
 * Called when mvhd box has been received.
 *
 * @param {number} version The full box version field.
 * @param {number} flags The full box flags field.
 * @param {Uint8Array} value The body of the full box.
 * @return {boolean} True if the element was successfully parsed.
 */
ISOBMFFValidator.prototype.parseMvhd = function(version, flags, value) {
  var br = new msetools.BufferReader(value);
  if (version == 0) {
    // Skip creation_time & modification_time.
    br.readUint32();
    br.readUint32();
  } else if (version == 1) {
    // Skip creation_time & modification_time.
    br.readUint64();
    br.readUint64();
  } else {
    console.log('Invalid mvhd version: ' + version);
    return false;
  }

  var timescale = br.readUint32();

  if (version == 0) {
    // Skip duration.
    br.readUint32();
  } else if (version == 1) {
    // Skip duration.
    br.readUint64();
  }

  br.readUint32(); // Skip rate
  br.readUint16(); // Skip volume
  var reserved1 = br.readUint16();
  var reserved2 = br.readUint32();
  var reserved3 = br.readUint32();

  br.skip(4 * 9); // Skip matrix.
  br.skip(4 * 6); // Skip pre_defined.
  br.readUint32(); // Skip next_track_ID.

  if (reserved1 != 0 || reserved2 != 0 || reserved3 != 0) {
    console.log('mvhd has an invalid reserved field');
  }

  if (br.bytesLeft() != 0) {
    console.log('Unexpected bytes at the end of mvhd: ' +
        br.bytesLeft() + ' bytes');
  }

  //console.log('mvhd: timescale ' + timescale);


  return true;
};


/**
 * Called when mdhd box has been received.
 *
 * @param {number} version The full box version field.
 * @param {number} flags The full box flags field.
 * @param {Uint8Array} value The body of the full box.
 * @return {boolean} True if the element was successfully parsed.
 */
ISOBMFFValidator.prototype.parseMdhd = function(version, flags, value) {
  var br = new msetools.BufferReader(value);
  if (version == 0) {
    // Skip creation_time & modification_time.
    br.readUint32();
    br.readUint32();
  } else if (version == 1) {
    // Skip creation_time & modification_time.
    br.readUint64();
    br.readUint64();
  } else {
    console.log('Invalid mvhd version: ' + version);
    return false;
  }

  if (this.currentTrackID_ == 0) {
    console.log('Invalid tkhd box is not before mdhd box!');
    return false;
  }

  var timescale = br.readUint32();

  if (version == 0) {
    // Skip duration.
    br.readUint32();
  } else if (version == 1) {
    // Skip duration.
    br.readUint64();
  }

  br.readUint16(); // Skip language
  br.readUint16(); // Skip predefined

  if (br.bytesLeft() != 0) {
    console.log('Unexpected bytes at the end of mdhd: ' +
        br.bytesLeft() + ' bytes');
  }

  //console.log('mdhd: timescale ' + timescale);


  return true;
};

/**
 * Called when hdlr box has been received.
 *
 * @param {number} version The full box version field.
 * @param {number} flags The full box flags field.
 * @param {Uint8Array} value The body of the full box.
 * @return {boolean} True if the element was successfully parsed.
 */
ISOBMFFValidator.prototype.parseHdlr = function(version, flags, value) {
  var br = new msetools.BufferReader(value);

  if (version != 0) {
    console.log('hdlr has unsupported version: ' + version);
    return false;
  }

  if (flags != 0) {
    console.log('hdlr has unsupported flags: ' + version);
    return false;
  }

  if (this.currentTrackID_ == 0) {
    console.log('Invalid tkhd box is not before vmhd box!');
    return false;
  }

  if (br.readUint32() != 0) {
    console.log('hdlr has an invalid pre_defined field.');
    return false;
  }

  var handler_type = '';
  for (var i = 0; i < 4; ++i) {
    handler_type += String.fromCharCode(br.readUint8());
  }

  if (handler_type == 'vide') {
    this.has_video_ = true;
  } else if (handler_type == 'soun') {
    this.has_audio_ = true;
  } else {
    console.log('TrackID ' + this.currentTrackID_ + ': handler_type "' +
                handler_type + '" is not supported');
    return false;
  }

  this.currentTracks_[this.currentTrackID_].handler_type = handler_type;

  //console.log('hdlr: handler_type ' + handler_type);
  return true;
};

/**
 * Called when vmhd box has been received.
 *
 * @param {number} version The full box version field.
 * @param {number} flags The full box flags field.
 * @param {Uint8Array} value The body of the full box.
 * @return {boolean} True if the element was successfully parsed.
 */
ISOBMFFValidator.prototype.parseVmhd = function(version, flags, value) {
  var br = new msetools.BufferReader(value);

  if (version != 0) {
    console.log('vmhd has unsupported version: ' + version);
    return false;
  }

  if (flags != 1) {
    console.log('vmhd has unsupported flags: ' + version);
    return false;
  }

  if (this.currentTrackID_ == 0) {
    console.log('Invalid tkhd box is not before vmhd box!');
    return false;
  }

  br.skip(2); // Skip graphicsmode.
  br.skip(2 * 3); // Skip opcolor.

  if (br.bytesLeft() != 0) {
    console.log('Unexpected bytes at the end of vmhd: ' +
        br.bytesLeft() + ' bytes');
  }

  return true;
};

/**
 * Called when smhd box has been received.
 *
 * @param {number} version The full box version field.
 * @param {number} flags The full box flags field.
 * @param {Uint8Array} value The body of the full box.
 * @return {boolean} True if the element was successfully parsed.
 */
ISOBMFFValidator.prototype.parseSmhd = function(version, flags, value) {
  var br = new msetools.BufferReader(value);

  if (version != 0) {
    console.log('smhd has unsupported version: ' + version);
    return false;
  }

  if (flags != 0) {
    console.log('smhd has unsupported flags: ' + version);
    return false;
  }

  if (this.currentTrackID_ == 0) {
    console.log('Invalid tkhd box is not before smhd box!');
    return false;
  }

  br.skip(2); // Skip balance.

  if (br.readUint16() != 0) {
    console.log('Invalid reserved field.');
    return false;
  }

  if (br.bytesLeft() != 0) {
    console.log('Unexpected bytes at the end of smhd: ' +
        br.bytesLeft() + ' bytes');
  }

  return true;
};


/**
 * Called when trex box has been received.
 *
 * @param {number} version The full box version field.
 * @param {number} flags The full box flags field.
 * @param {Uint8Array} value The body of the full box.
 * @return {boolean} True if the element was successfully parsed.
 */
ISOBMFFValidator.prototype.parseTrex = function(version, flags, value) {
  if (version != 0) {
    console.log('trex has unsupported version: ' + version);
    return false;
  }

  if (flags != 0) {
    console.log('trex has unsupported flags: ' + version);
    return false;
  }

  var br = new msetools.BufferReader(value);

  var trackID = br.readUint32();
  var default_sample_description_index = br.readUint32();
  var default_sample_duration = br.readUint32();
  var default_sample_size = br.readUint32();
  var default_sample_flags = br.readUint32();

  if (br.bytesLeft() != 0) {
    console.log('Unexpected bytes at the end of trex: ' +
        br.bytesLeft() + ' bytes');
  }

  var trackInfo = this.currentTracks_[trackID];
  if (!trackInfo) {
    trackInfo = {};
    this.currentTracks_[trackID] = trackInfo;
  }

  this.currentTracks_[trackID]['trex'] = {
    sample_description_index: default_sample_description_index,
    sample_duration: default_sample_duration,
    sample_size: default_sample_size,
    sample_flags: default_sample_flags
  };

  /*
  console.log('trex :' +
              ' ' + trackID +
              ' ' + default_sample_description_index +
              ' ' + default_sample_duration +
              ' ' + default_sample_size +
              ' ' + this.sampleFlagsToString_(default_sample_flags));
  */
  return true;
};

/**
 * Called when trun box has been received.
 *
 * @param {number} version The full box version field.
 * @param {number} flags The full box flags field.
 * @param {Uint8Array} value The body of the full box.
 * @return {boolean} True if the element was successfully parsed.
 */
ISOBMFFValidator.prototype.parseTrun = function(version, flags, value) {
  var hasDataOffset = (flags & 0x1) != 0;
  var hasFirstSampleFlag = (flags & 0x4) != 0;
  var hasSampleDuration = (flags & 0x100) != 0;
  var hasSampleSize = (flags & 0x200) != 0;
  var hasSampleFlags = (flags & 0x400) != 0;
  var hasSampleCompositionOffsets = (flags & 0x800) != 0;

  var br = new msetools.BufferReader(value);
  var sampleCount = br.readUint32();
  //console.log('trun.sample_count ' + sampleCount);
  if (hasDataOffset) {
    var offset = br.readUint32();
    //console.log('trun.data_offset ' + offset);
  }

  var firstSampleFlags = -1;
  if (hasFirstSampleFlag) {
    firstSampleFlags = br.readUint32();
    //console.log('trun.first_sample_flags ' +
    //                   this.sampleFlagsToString_(firstSampleFlags));
  }

  for (var j = 0; j < sampleCount; ++j) {
    var duration = this.default_sample_duration_;
    var size = this.default_sample_size_;
    var sample_flags = this.default_sample_flags_;
    var compositionOffset = -1;

    if (j == 0 && firstSampleFlags != -1) {
      sample_flags = firstSampleFlags;
    }

    if (hasSampleDuration) {
      duration = br.readUint32();
    }

    if (hasSampleSize) {
      size = br.readUint32();
    }

    if (hasSampleFlags) {
      sample_flags = br.readUint32();
    }

    if (hasSampleCompositionOffsets) {
      compositionOffset = br.readUint32();
    }
    //console.log('trun : ' + duration +
    //            ' ' + size +
    //            ' ' + this.sampleFlagsToString_(sample_flags) +
    //            ' ' + compositionOffset);
  }

  if (br.bytesLeft() != 0) {
    console.log('Unexpected bytes at the end of trun: ' +
        br.bytesLeft() + ' bytes');
  }

  return true;
};

/**
 * Called when tkhd box has been received.
 *
 * @param {number} version The full box version field.
 * @param {number} flags The full box flags field.
 * @param {Uint8Array} value The body of the full box.
 * @return {boolean} True if the element was successfully parsed.
 */
ISOBMFFValidator.prototype.parseTkhd = function(version, flags, value) {
  var trackEnabled = (flags & 0x1) != 0;
  var trackInMovie = (flags & 0x2) != 0;
  var trackInPreview = (flags & 0x4) != 0;

  var br = new msetools.BufferReader(value);

  var i = 0;
  if (version == 0) {
    // Skip creation_time & modification_time.
    br.readUint32();
    br.readUint32();
  } else if (version == 1) {
    // Skip creation_time & modification_time.
    br.readUint64();
    br.readUint64();
  } else {
    console.log('Invalid tkhd version: ' + version);
    return false;
  }

  var trackID = br.readUint32();
  //console.log('tkhd: trackID ' + trackID +
  //    ((trackEnabled) ? ' E ' : '') +
  //    ((trackInMovie) ? ' IM ' : '') +
  //    ((trackInPreview) ? ' IP ' : ''));

  if (br.readUint32() != 0) {
    console.log('tkhd has an invalid reserved field');
  }

  if (version == 0) {
    // Skip duration.
    br.readUint32();
  } else if (version == 1) {
    // Skip duration.
    br.readUint64();
  }

  var reserved1 = br.readUint32();
  var reserved2 = br.readUint32();
  br.readUint16(); // Skip layer
  br.readUint16(); // Skip alternate_group
  br.readUint16(); // Skip volume
  var reserved3 = br.readUint16();
  br.skip(4 * 9); // Skip matrix.
  br.readUint32(); // Skip width.
  br.readUint32(); // Skip height.

  if (reserved1 != 0 || reserved2 != 0 || reserved3 != 0) {
    console.log('tkhd has an invalid reserved field');
  }

  if (br.bytesLeft() != 0) {
    console.log('Unexpected bytes at the end of tkhd: ' +
        br.bytesLeft() + ' bytes');
  }

  this.currentTrackID_ = trackID;

  //if (this.currentTracks_[trackID]) {
  //  console.log('TrackID ' + trackID + ' is in more than one tkhd box.');
  //  return false;
  //}

  this.currentTracks_[this.currentTrackID_] = {};

  return true;
};

/**
 * Called when tfhd box has been received.
 *
 * @param {number} version The full box version field.
 * @param {number} flags The full box flags field.
 * @param {Uint8Array} value The body of the full box.
 * @return {boolean} True if the element was successfully parsed.
 */
ISOBMFFValidator.prototype.parseTfhd = function(version, flags, value) {
  var hasDataOffset = (flags & 0x1) != 0;
  var hasIndex = (flags & 0x2) != 0;
  var hasDuration = (flags & 0x8) != 0;
  var hasSize = (flags & 0x10) != 0;
  var hasFlags = (flags & 0x20) != 0;
  var isDurationEmpty = (flags & 0x10000) != 0;

  var br = new msetools.BufferReader(value);

  var trackId = br.readUint32();
  var offset = -1;
  var index = -1;
  this.default_sample_duration_ = -1;
  this.default_sample_size_ = -1;
  this.default_sample_flags_ = 0;

  if (hasDataOffset) {
    offset = br.readUint64();
  }

  if (hasIndex) {
    index = br.readUint32();
  }

  if (hasDuration) {
    this.default_sample_duration_ = br.readUint32();
  }

  if (hasSize) {
    this.default_sample_size_ = br.readUint32();
  }

  if (hasFlags) {
    this.default_sample_flags_ = br.readUint32();
  }

  if (br.bytesLeft() != 0) {
    console.log('Unexpected bytes at the end of tfhd: ' +
        br.bytesLeft() + ' bytes');
  }

  /*
  console.log('tfhd :' +
              ' ' + trackId +
              ' ' + offset +
              ' ' + index +
              ' ' + this.default_sample_duration_ +
              ' ' + this.default_sample_size_ +
              ' ' + this.sampleFlagsToString_(this.default_sample_flags_));
  */

  return true;
};

/**
 * Conversts a sample_flags field to a string.
 *
 * @private
 * @param {number} flags The contents of a sample_flags field.
 * @return {string} A string representation of the flags.
 */
ISOBMFFValidator.prototype.sampleFlagsToString_ = function(flags) {
  var str = '[';

  str += ' DO' + ((flags >> 24) & 0x3);
  str += ' IDO' + ((flags >> 22) & 0x3);
  str += ' HR' + ((flags >> 20) & 0x3);
  str += ' P' + ((flags >> 17) & 0x7);
  str += ' D' + ((flags >> 16) & 0x1);
  str += ' PR' + (flags & 0xffff);
  str += ' ]';
  return str;
};

msetools.ISOBMFFValidator = ISOBMFFValidator;
