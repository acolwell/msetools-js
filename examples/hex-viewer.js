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
  function FieldInfo(id, start, end) {
    this.id = id;
    this.start = start;
    this.end = end;
    this.children = [];
  }

  FieldInfo.prototype.addChild = function(fieldInfo) {
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
        if (byte <= 0x20) {
          charStr += '.';
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

  function ISOClient(url, doneCallback) {
    this.doneCallback_ = doneCallback;
    this.parser_ = new msetools.ISOBMFFParser(this);
    this.file_ = new msetools.RemoteFile(url);
    this.readSize_ = 4096;
    this.file_.read(this.readSize_, this.onReadDone_.bind(this));
    this.list_stack_ = [];
    this.field_info_ = [];
    this.flag_info_ = {
      'trun': [
        ['data-offset-present', 0x1],
        ['first-sample-flags-present', 0x4],
        ['sample-duration-present', 0x100],
        ['sample-size-present', 0x200],
        ['sample-flags-present', 0x400],
        ['sample-composition-time-offsets-present', 0x800]
      ]
    };
  };

  ISOClient.prototype.dumpFieldInfoList_ = function(fieldInfoList) {
    if (fieldInfoList.length == 0)
      return "";

    var result = '<ul class="box_list">';
    for (var i = 0; i < fieldInfoList.length; ++i) {
      var fieldInfo = fieldInfoList[i];
      result += "<li><a href='#' onclick='selectBox(" + fieldInfo.start + ',' +
          fieldInfo.end + ")' style='white-space:nowrap;'>";
      result += fieldInfo.id;
      result += '</a>';
      result += this.dumpFieldInfoList_(fieldInfo.children);
      result += '</li>';
    }
    return result + '</ul>';
  };

  ISOClient.prototype.onReadDone_ = function(status, buf) {
    if (status == 'eof') {
      var str = this.dumpFieldInfoList_(this.field_info_);
      var div = document.getElementById('element_tree');
      div.innerHTML = str;
      $( "#element_tree ul").menu();
      this.doneCallback_(true);
      return;
    }

    if (status != 'ok') {
      console.log('onReadDone_(' + status + ')');
      this.doneCallback_(false);
      return;
    }

    if (this.parser_.parse(buf).length > 0) {
      console.log('onReadDone_(' + status + ') : parser error');
      return;
    }
    this.file_.read(this.readSize_, this.onReadDone_.bind(this));
  };

  ISOClient.prototype.onListStart = function(id, elementPosition,
                                             bodyPosition) {
    this.list_stack_.push({ id: id, start: elementPosition,
                            child_info: this.field_info_ });
    this.field_info_ = [];
    return msetools.ParserStatus.OK;
  };


  ISOClient.prototype.onListEnd = function(id, size) {
    var info = this.list_stack_.pop();
    if (info.id != id) {
      console.log("Unexpected list end for id '" + id + "'");
      return false;
    }

    var fieldInfo = new FieldInfo(info.id, info.start, info.start + size);
    for (var i = 0; i < this.field_info_.length; ++i) {
      fieldInfo.addChild(this.field_info_[i]);
    }

    // Restore old field_info_ state.
    this.field_info_ = info.child_info;
    this.field_info_.push(fieldInfo);
    return true;
  };


  ISOClient.prototype.onBox = function(id, value, elementPosition,
                                       bodyPosition) {
    this.field_info_.push(
      new FieldInfo(id, elementPosition, bodyPosition + value.length));

    return true;
  };

  ISOClient.prototype.onFullBox = function(id, version, flags, value,
                                           elementPosition, bodyPosition) {

    var info = new FieldInfo(id, elementPosition, bodyPosition + value.length);

    info.addChild(
      new FieldInfo(id + '.version', bodyPosition - 4, bodyPosition - 3));
    info.addChild(new FieldInfo(id + '.flags', bodyPosition - 3, bodyPosition));

    flag_info = this.flag_info_[id];
    if (flag_info) {
      for (var i = 0; i < flag_info.length; ++i) {
        var name = flag_info[i][0];
        var mask = flag_info[i][1];
        var position = bodyPosition - 3;
        if (mask < 0x010000)
          ++position;
        if (mask < 0x000100)
          ++position;

        if ((flags & mask) != 0) {
          info.addChild(new FieldInfo(id + '.' + name, position, position + 1));
        }
      }
    }

    this.field_info_.push(info);

    return true;
  };

  function getURL() {
    return document.getElementById('u').value;
  }

  function loadUrl() {
    var url = getURL();
    var client = new ISOClient(url, parsingDone.bind(this, url));
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

  function parsingDone(url, status) {
    if (!status) {
      console.log('Parsing failed');
      return;
    }
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

  function selectBox(start, end) {
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

  window['onPageLoad'] = onPageLoad;
  window['selectBox'] = selectBox;
})(window);
