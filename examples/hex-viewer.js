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
(function(window, undefined) {
  function FieldInfo(id, start, end, value) {
    this.id = id;
    this.start = start;
    this.end = end;
    this.value = (value !== undefined) ? value : null;
    this.children = [];
  }

  FieldInfo.prototype.addChild = function(name, start, end, value) {
    this.addChildFieldInfo(new FieldInfo(name, start, end, value));
  };

  FieldInfo.prototype.addChildFieldInfo = function(fieldInfo) {
    this.children.push(fieldInfo);
  };

  function HexView(id, pageSize, readCallback) {
    this.table_ = document.getElementById(id);
    if (!this.table_) {
      console.log("Can't find table for id '" + id +
                  "'. View not updated.");
      return;
    }
    this.table_.style.fontFamily = 'monospace';
    this.pageSize_ = pageSize;
    this.readCallback_ = readCallback;
  };

  HexView.prototype.table_ = null;
  HexView.prototype.pageSize_ = 0;
  HexView.prototype.readCallback_ = null;
  HexView.prototype.setBaseOffsetCallback_ = null;
  HexView.prototype.buffer_ = null;
  HexView.prototype.selectionStart_ = -1;
  HexView.prototype.selectionEnd_ = -1;
  HexView.prototype.bytesPerRow_ = 16;


  HexView.prototype.setBaseOffset = function(offset, callback) {
    if (this.setBaseOffsetCallback_)
      return;

    this.setBaseOffsetCallback_ = callback;
    this.readCallback_(offset, this.pageSize_,
                       this.setBaseOffsetDone_.bind(this, offset));
  };

  HexView.prototype.setBaseOffsetDone_ = function(offset, buffer) {
    var callback = this.setBaseOffsetCallback_;
    this.setBaseOffsetCallback_ = null;

    if (!buffer) {
      callback(false);
      return;
    }

    this.baseOffset_ = offset;
    this.buffer_ = buffer;
    this.updateDisplay();
    callback(true);
  };

  HexView.prototype.rowOffset = function(offset) {
    return Math.floor(offset / this.bytesPerRow_) * this.bytesPerRow_;
  };

  HexView.prototype.nextRowOffset = function(offset) {
    return (1 + Math.floor(offset / this.bytesPerRow_)) * this.bytesPerRow_;
  };

  HexView.prototype.isVisible = function(offset) {
    var adjustedOffset = offset - this.baseOffset_;
    return (adjustedOffset >= 0) && (adjustedOffset <= this.buffer_.length);
  };

  HexView.prototype.select = function(start, end) {
    if (start < 0 || end <= start) {
      console.log('Invalid selection range ' + start + '-' + end);
      return;
    }

    this.selectionStart_ = start;
    this.selectionEnd_ = end;

    this.updateDisplay();
  };

  HexView.prototype.clearSelect = function() {
    this.selectionStart_ = -1;
    this.selectionEnd_ = -1;
    this.updateDisplay();
  };

  HexView.prototype.toHex_ = function(val, size) {
    var result = val.toString(16);

    while (result.length < size)
      result = '0' + result;

    return result;
  };

  HexView.prototype.getBaseOffset = function() {
    return this.baseOffset_;
  };

  HexView.prototype.getSelectionStart = function() {
    return this.selectionStart_;
  };

  HexView.prototype.getSelectionEnd = function() {
    return this.selectionEnd_;
  };

  HexView.prototype.inSelectionRange_ = function(index) {
    return (this.selectionStart_ >= 0 &&
            (index + this.baseOffset_) >= this.selectionStart_ &&
            (index + this.baseOffset_) < this.selectionEnd_);
  };

  HexView.prototype.updateDisplay = function() {
    var tableBody = document.createElement('tbody');
    var numRows = this.buffer_.length / this.bytesPerRow_;
    for (var i = 0; i < numRows; ++i) {
      var row = document.createElement('tr');
      var rowStart = i * this.bytesPerRow_;
      var rowEnd = Math.min(rowStart + this.bytesPerRow_, this.buffer_.length);
      var rowOffsetTD = document.createElement('td');
      rowOffsetTD.textContent = this.toHex_(this.baseOffset_ + rowStart, 6);
      row.appendChild(rowOffsetTD);

      var hexStr = '';
      var charStr = '&nbsp;';

      var selectStarted = false;
      for (var j = rowStart; j < rowEnd; ++j) {
        if (selectStarted && !this.inSelectionRange_(j)) {
          hexStr += '</span>';
          charStr += '</span>';
          selectStarted = false;
        }

        hexStr += '&nbsp;';

        if (!selectStarted && this.inSelectionRange_(j)) {
          var selectedMarkup = "<span class='selected'>";
          hexStr += selectedMarkup;
          charStr += selectedMarkup;
          selectStarted = true;
        }

        var byte = this.buffer_[j];
        hexStr += this.toHex_(byte, 2);
        if (byte <= 0x20 || (byte > 0x7E && byte < 0xA1) || 
            byte == 0xAD) {
          charStr += '.';
        } else if (byte == 0x26) {
          charStr += '&amp;'
        } else if (byte == 0x3C) {
          charStr += '&lt;'
        } else if (byte == 0x3E) {
          charStr += '&gt;'
        } else {
          charStr += String.fromCharCode(byte);
        }
      }

      if (selectStarted) {
        hexStr += '</span>';
        charStr += '</span>';
        selectStarted = false;
      }

      var hexTD = document.createElement('td');
      hexTD.innerHTML = hexStr;
      row.appendChild(hexTD);

      var charTD = document.createElement('td');
      charTD.innerHTML = charStr;
      row.appendChild(charTD);

      tableBody.appendChild(row);
    }

    this.table_.replaceChild(tableBody, this.table_.tBodies[0]);
  };

  function onPageLoad() {
    document.getElementById('load_button').addEventListener('click', loadUrl);
    document.getElementById('prev_button').addEventListener('click', prevPage);
    document.getElementById('next_button').addEventListener('click', nextPage);

    // Extract the 'url' parameter from the document URL.
    var urlRegex = new RegExp('[\\?&]url=([^&#]*)');
    var results = urlRegex.exec(window.location.href);
    if (results != null) {
      var url = results[1];

      // Assign to the input field.
      var u = document.getElementById('u');
      u.value = url;

      loadUrl();
    }
  }

  function BoxFieldParser(position, buf, parent, updateParentEnd) {
    this.position_ = position;
    this.buf_ = buf;
    this.parent_ = parent;
    this.updateParentEnd_ = updateParentEnd || false;
    this.index_ = 0;
    this.bitsLeftInCurrentByte_ = 8;
  }

  BoxFieldParser.prototype.addUInt = function (name, numBits) {
    var start = this.position_  + this.index_;

    if (numBits > 52) {
      var tmp = this.readBits_(numBits - 52);
      if (this.readBits_(numBits - 52) != 0) {
        throw new Error("Number too large to represent accurately");
      }
      numBits = 52;
    }

    var value = this.readBits_(numBits);
    var end = this.position_  + this.index_;
    if (start == end)
      ++end;
    if (this.updateParentEnd_ && end > this.parent_.end)
      this.parent_.end = end;
    this.parent_.addChild(name, start, end, value);
  };

  BoxFieldParser.prototype.addField = function (name, numBits, arraySize) {
    arraySize = arraySize || 1;

    var start = this.position_  + this.index_;
    for (var i = 0; i < arraySize; ++i) {
      this.skip(numBits);
    }
    var end = this.position_  + this.index_;
    if (start == end)
      ++end;
    if (this.updateParentEnd_ && end > this.parent_.end)
      this.parent_.end = end;
    this.parent_.addChild(name, start, end);
  };

  BoxFieldParser.prototype.skip = function (numBits, arraySize){
    arraySize = arraySize || 1;
    numBits *= arraySize;

    if (numBits < this.bitsLeftInCurrentByte_) {
      this.bitsLeftInCurrentByte_ -= numBits;
      return;
    }

    var bytesNeeded =
      Math.floor(numBits - this.bitsLeftInCurrentByte_ + 7) / 8;
    if (this.index_ + bytesNeeded > this.buf_.length) {
        var end = this.index_ + bytesNeeded;
        throw new Error("Read beyond the end of the buffer. " +
                        end + ' vs ' + this.buf_.length);
      }

    var bitsLeft = numBits - this.bitsLeftInCurrentByte_;
    ++this.index_;
    this.bitsLeftInCurrentByte_ = 8;

    if (bitsLeft == 0)
      return;

    var numBytes = Math.floor(bitsLeft / 8);
    this.index_ += numBytes;
    bitsLeft -= numBytes * 8;
    this.bitsLeftInCurrentByte_ -= bitsLeft;
  }

  BoxFieldParser.prototype.readBits_ = function (numBits) {
    if (numBits > 52) {
      new Error("Reading " + numBits + " bits is not supported");
    }

    var mask = 0xff >> (8 - this.bitsLeftInCurrentByte_);
    if (numBits < this.bitsLeftInCurrentByte_) {
      this.bitsLeftInCurrentByte_ -= numBits;
      return (this.buf_[this.index_] & mask) >> this.bitsLeftInCurrentByte_;
    }

    var bytesNeeded =
      Math.floor(numBits - this.bitsLeftInCurrentByte_ + 7) / 8;
    if (this.index_ + bytesNeeded > this.buf_.length) {
        var end = this.index_ + bytesNeeded;
        throw new Error("Read beyond the end of the buffer. " +
                        end + ' vs ' + this.buf_.length);
      }

    var value = this.buf_[this.index_] & mask;
    var bitsLeft = numBits - this.bitsLeftInCurrentByte_;
    ++this.index_;
    this.bitsLeftInCurrentByte_ = 8;

    if (bitsLeft == 0)
      return value;

    for (;bitsLeft >= 8; bitsLeft -= 8) {
      value *= 256;
      value += this.buf_[this.index_++];
    }

    if (bitsLeft == 0)
      return value;

    this.bitsLeftInCurrentByte_ -= bitsLeft;
    return value * (1 << bitsLeft) +
      ((this.buf_[this.index_] & 0xff) >> this.bitsLeftInCurrentByte_);
  }

  BoxFieldParser.prototype.createChildParser = function(name) {
    if (this.bitsLeftInCurrentByte_ != 8) {
      throw new Error("Child parser only allowed to start on a" +
                      " byte boundary");
    }

    var child = new FieldInfo(name, this.position_ + this.index_,
                              this.position_ + this.index_);
    this.parent_.addChildFieldInfo(child);
    return new BoxFieldParser(this.position_ + this.index_,
                              this.buf_.subarray(this.index_), child, true);
  }

  function getURL() {
    return document.getElementById('u').value;
  }

  function loadUrl() {
    var url = getURL();
    var client = new ISOClient(url, parsingDone.bind(this, url));
    //var client = new TSClient(url, parsingDone.bind(this, url));
  }

  var PAGE_SIZE = 512;
  var hexView = null;

  function readFromFile(file, offset, size, callback) {
    console.log('readFromFile(' + offset + ', ' + size + ')');
    file.seek(offset);
    file.read(size, onReadFromFileDone.bind(this, callback));
  }

  function onReadFromFileDone(callback, status, buffer) {
    console.log('onReadFromFileDone(' + status + ')');
    if (status != 'ok') {
      callback(null);
      return;
    }
    callback(buffer);
  }

  function dumpFieldInfoList (fieldInfoList) {
    if (fieldInfoList.length == 0)
      return "";

    var result = '<ul class="box_list">';
    for (var i = 0; i < fieldInfoList.length; ++i) {
      var fieldInfo = fieldInfoList[i];
      result += "<li><a href='#' onclick='selectBox(" + fieldInfo.start + ',' +
        fieldInfo.end;
      if (fieldInfo.value !== null) {
        result += ", " + fieldInfo.value;
      }
      result += ")'";
      result += " style='white-space:nowrap;'>";
      result += fieldInfo.id;
      result += '</a>';
      result += dumpFieldInfoList(fieldInfo.children);
      result += '</li>';
    }

    return result + '</ul>';
  };

  function parsingDone(url, fieldInfo) {
    if (fieldInfo == null) {
      console.log('Parsing failed');
      return;
    }

    var str = dumpFieldInfoList(fieldInfo);
    var div = document.getElementById('element_tree');
    div.innerHTML = str;

    var file = new msetools.RemoteFile(url);
    hexView = new HexView('hex_view', PAGE_SIZE, readFromFile.bind(this, file));
    hexView.setBaseOffset(0, onSetBaseOffsetDone);
  }

  function onSetBaseOffsetDone(status) {
    console.log('onSetBaseOffsetDone(' + status + ')');

    var prevButton = document.getElementById('prev_button');
    if (hexView.getBaseOffset() > 0) {
      prevButton.style.visibility = 'visible';
    } else {
      prevButton.style.visibility = 'hidden';
    }
  }

  function selectBox(start, end, value) {
    var valueDiv = document.querySelector("#field_value");
    if (value !== undefined) {
      valueDiv.style.visibility = 'visible';
      valueDiv.textContent = value;
    } else {
      valueDiv.style.visibility = 'hidden';
    }

    hexView.select(start, end);

    var startRowOffset = hexView.rowOffset(start);
    var endRowOffset = hexView.nextRowOffset(end);
    if (hexView.isVisible(startRowOffset)) {
      return;
    }

    hexView.setBaseOffset(startRowOffset, onSetBaseOffsetDone);
  }

  function nextPage() {
    var newOffset = hexView.getBaseOffset() + PAGE_SIZE / 2;
    hexView.setBaseOffset(newOffset, onSetBaseOffsetDone);
  }

  function prevPage() {
    var newOffset = Math.max(0, hexView.getBaseOffset() - PAGE_SIZE / 2);
    hexView.setBaseOffset(newOffset, onSetBaseOffsetDone);
  }

  window['FieldInfo'] = FieldInfo;
  window['onPageLoad'] = onPageLoad;
  window['selectBox'] = selectBox;
})(window);
