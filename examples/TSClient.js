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
(function(window, undefined) {
  function BitReader(buf) {
    this.buf_ = buf;
    this.offset_ = 0;
    this.bitsLeft_ = 8;
  }

  BitReader.kMask = [0x00, 0x01, 0x03, 0x07,
                     0x0F, 0x1F, 0x3F, 0x7F, 0xFF];

  BitReader.prototype.bitsLeft = function() {
    return 8 * (this.buf_.length - this.offset_ - 1) + this.bitsLeft_;
  };

  BitReader.prototype.read = function(count) {
    if (count > 32)
      throw "Count too large. " + count;

    var value = 0;

    if (this.bitsLeft_ > count) {
      this.bitsLeft_ -= count;
      return (this.buf_[this.offset_] >> this.bitsLeft_) & BitReader.kMask[count];
    }

    value = this.buf_[this.offset_] & BitReader.kMask[this.bitsLeft_];
    count -= this.bitsLeft_;
    this.offset_++;
    this.bitsLeft_ = 8;

    while (count >= 8) {
      value = (value << 8) | this.buf_[this.offset_++];
      count -= 8;
    }

    if (count > 0) {
      value <<= count;
      this.bitsLeft_ -= count;
      value |= (this.buf_[this.offset_] >> this.bitsLeft_) & this.kMask[count];
    }

    return value;
  };

  BitReader.prototype.skip = function(count) {
    if (this.bitsLeft_ > count) {
      this.bitsLeft_ -= count;
      return;
    }

    count -= this.bitsLeft_;

    this.offset_ += 1 + count / 8;
    this.bitsLeft_ = 8 - count % 8;
  };

  function ParseBits(position, buf, descriptor, pktFieldInfo) {
    var br = new BitReader(buf);

    var obj = {};
    for (var i = 0; i < descriptor.length; ++i) {
      var fieldName = descriptor[i][0];

      var info = descriptor[i][1];

      if (typeof info == "function") {
        info(position, obj, br, pktFieldInfo, fieldName);
        continue;
      }

      var numBits = info;

      var fieldPos = position + br.offset_;
      var fieldLen = numBits / 8;
      var value = br.read(numBits);

      obj[fieldName] = value;
      pktFieldInfo.addChild(fieldName, fieldPos, fieldPos + fieldLen, value);
    }
  }

  function parseAdaptationField(position, obj, br, pktFieldInfo, fieldName) {
    if (obj.adaptation_field_control == 0x02 ||
        obj.adaptation_field_control == 0x03) {

      var fieldPos = position + br.offset_;
      var adaptation_field_length = br.read(8);
      var fieldLen = 1 + adaptation_field_length;

      var adaptationFieldInfo = new FieldInfo(fieldName, fieldPos, fieldPos + fieldLen);
      adaptationFieldInfo.addChild("adaptation_field_length", fieldPos, fieldPos + 1);

      // TODO: Remove when actual parse logic is added.
      br.skip(8 * adaptation_field_length);

      pktFieldInfo.addChildFieldInfo(adaptationFieldInfo);
    }
  }

  function parseDataField(position, obj, br, pktFieldInfo, fieldName) {
    if (obj.adaptation_field_control == 0x01 ||
        obj.adaptation_field_control == 0x03) {
      var fieldPos = position + br.offset_;
      var fieldLen = br.bitsLeft() / 8;
      pktFieldInfo.addChild(fieldName, fieldPos, fieldPos + fieldLen);
    }
  }

  function Mpeg2TSParser(client) {
    this.client_ = client;
  }

  Mpeg2TSParser.prototype.client_ = null;
  Mpeg2TSParser.prototype.buffer_ = null;
  Mpeg2TSParser.prototype.bytePosition_ = 0;
  Mpeg2TSParser.prototype.errors_ = [];

  Mpeg2TSParser.prototype.parse = function(newBuffer) {
    if (this.buffer_) {
      var oldBuffer = this.buffer_;
      this.buffer_ = new Uint8Array(oldBuffer.length + newBuffer.length);
      this.buffer_.set(oldBuffer, 0);
      this.buffer_.set(newBuffer, oldBuffer.length);
    } else {
      this.buffer_ = newBuffer;
    }

    this.errors_ = [];

    var i = 0;
    var kFrameSize = 188;
    while (i + kFrameSize <= this.buffer_.length) {
      var pktFrameInfo = new FieldInfo("pkt", this.bytePosition_, 
                                       this.bytePosition_ + kFrameSize);

      var descriptor = [
        ["sync_byte", 8],
        ["transport_error_indicator", 1],
        ["payload_unit_start_indicator", 1],
        ["transport_priority", 1],
        ["PID", 13],
        ["transport_scrambling_control", 2],
        ["adaptation_field_control", 2],
        ["continuity_counter", 4],
        ["adaptation_field", parseAdaptationField],
        ["data", parseDataField],
      ];

      ParseBits(this.bytePosition_,
                this.buffer_.subarray(i, i + kFrameSize),
                descriptor,
                pktFrameInfo);

      this.client_.onPacket(pktFrameInfo);

      i += kFrameSize;
      this.bytePosition_ += kFrameSize;
    }

    if (i > 0)
      this.buffer_ = this.buffer_.subarray(i, this.buffer_.length);

    return this.errors_;
  }

  function TSClient(url, doneCallback) {
    this.doneCallback_ = doneCallback;
    this.file_ = new msetools.RemoteFile(url);
    this.readSize_ = 256 * 1024;
    this.file_.read(this.readSize_, this.onReadDone_.bind(this));
    this.list_stack_ = [];
    this.fieldInfo_ = []

    this.parser_ = new Mpeg2TSParser(this);
  }

  TSClient.prototype.onPacket = function(frameInfo) {
    this.fieldInfo_.push(frameInfo);
  };

  TSClient.prototype.onReadDone_ = function(status, buf) {
    console.log("onReadDone_(" + status + ")");

    if (status == 'eof') {
      this.doneCallback_(this.fieldInfo_);
      return;
    }

    if (status != 'ok') {
      console.log('onReadDone_(' + status + ')');
      this.doneCallback_(null);
      return;
    }

    if (this.parser_.parse(buf).length > 0) {
      console.log('onReadDone_(' + status + ') : parser error');
      this.doneCallback_(null);
      return;
    }

    this.file_.read(this.readSize_, this.onReadDone_.bind(this));
  };

  window["TSClient"] = TSClient;
})(window);
