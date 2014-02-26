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
  function bs_if(condition, then_layout, else_layout) {
    return function(bfp) {
      var state = {};
      for (var i in bfp.parent_.children) {
        var fi = bfp.parent_.children[i];
        state[fi.id] = fi.value;
      }

      var body = "";
      for (var i in state) {
        body += "var " + i + " = " + state[i] + ";";
      }
      body += "return (" + condition + ")";
      var result =  (new Function(body))();
      var layout = (new Function(body))() ? then_layout : else_layout;
      bs_parse(layout, bfp)
    };
  }

  function bs_error(str) {
    return function() { console.log(str); throw str; }
  }

  function bs_is_basic_type_(fieldType) {
    return /^u[0-9]+$/.test(fieldType) ||
      /^char\[[0-9]+\]$/.test(fieldType);
  }

  function bs_type_size_(fieldType) {
    if (/^u[0-9]+$/.test(fieldType)) {
      return parseInt(fieldType.substr(1));
    }

    if (/^char\[[0-9]+\]$/.test(fieldType)) {
      return 8 * parseInt(fieldType.substr(4, fieldType.length - 6));
    }
    throw "Failed to read field type '" + fieldType + "'";
  }

  function bs_read_type_(fieldName, fieldType, bfp) {
    if (/^u[0-9]+$/.test(fieldType)) {
      bfp.addUInt(fieldName, parseInt(fieldType.substr(1)));
      return;
    }

    if (/^char\[[0-9]+\]$/.test(fieldType)) {
      var count = parseInt(fieldType.substr(4, fieldType.length - 6));
      bfp.addString(fieldName, count);
      return;
    }
    throw "Failed to read field type '" + fieldType + "'";
  }

  function bs_parse(layout, bfp) {
    for (var i = 0; i < layout.length; ++i) {
      var entry = layout[i];
      console.log("Entry:", entry);

      if (entry instanceof Function) {
        //throw "Function entries not supported yet";
        entry(bfp);
        continue
      }

      var fieldName = entry[0];
      var fieldType = entry[1];
      if (bs_is_basic_type_(fieldType)) {
        bs_read_type_(fieldName, fieldType, bfp);
        continue;
      }
      
      if (/[a-z0-9]+\[[0-9]*\]/.test(fieldType)) {
        var a = fieldType.indexOf("[");
        var b = fieldType.indexOf("]");
        if (b < a)
          throw "Invalid field type '" + fieldType + "'";

        var arrayElementType = fieldType.substr(0, a);
	var arrayElementSize = bs_type_size_(arrayElementType);
        if (a + 1 == b) {
          // Array that goes to the end. (e.g. u32[])
          for (var j = 0; bfp.hasMoreData(); ++j) {
            bs_read_type_(fieldName + "[" + j + "]", arrayElementType, bfp);
          }
          continue;
        }  else if (b > a + 1) {
	  var arraySize = parseInt(fieldType.substr(a + 1, b - a));
          // Fixed size array. (e.g. u32[8])
	  bfp.addField(fieldName, arrayElementSize, arraySize);
          continue;
        }
      }
      
      throw "Unsupported field type '" + fieldType + "'";
    }

    return true;
  }

  function BoxDef(bodyLayout) {
    var layout = [
      ["size", "u32"],
      ["type", "char[4]"],
      bs_if("size == 1", ["largesize", "u64"]),
      bs_if("size == 0", bs_error("unbounded box not allowed")),
      bs_if("type == 'uuid'", ["usertype", "u8[16]"])
    ];
    for (var i = 0; i < bodyLayout.length; ++i) {
      layout.push(bodyLayout[i]);
    }

    return layout;
  }

  function FullBoxDef(bodyLayout) {
    var layout = [
      ["flags", "u8"],
      ["version", "u24"]
    ];
    for (var i = 0; i < bodyLayout.length; ++i) {
      layout.push(bodyLayout[i]);
    }

    //return BoxDef(layout);
    return layout;
  }

  var ftyp = [
      ["major_brand", "u32"],
      ["minor_version", "u32"],
      ["compatible_brands", "u32[]"]
  ];

  var mvhd = FullBoxDef([
    bs_if("version == 1", [
      ["creation_time", "u64"],
      ["modification_time", "u64"],
      ["timescale", "u64"],
      ["duration", "u64"],
    ], [
      ["creation_time", "u32"],
      ["modification_time", "u32"],
      ["timescale", "u32"],
      ["duration", "u32"],
    ]),
    ["rate", "u32"],
    ["volume", "u16"],
    ["reserved", "u16"],
    ["reserved2", "u32[2]"],
    ["matrix", "u32[9]"],
    ["pre_defined", "u32[6]"],
    ["next_track_ID", "u32"],
  ]);

  function parseSampleFlags(bfp) {
    bfp.skip(4); // reserved = 0
    bfp.addUInt('is_leading', 2);
    bfp.addUInt('sample_depends_on', 2);
    bfp.addUInt('sample_is_depended_on', 2);
    bfp.addUInt('sample_has_redundancy', 2);
    bfp.addUInt('sample_padding_Value', 3);
    bfp.addUInt('sample_is_non_sync_sample', 1);
    bfp.addUInt('sample_degradation_priority', 16);
  }

  function parseTrex(version, flags, bfp) {
    try {
      bfp.addUInt('track_ID', 32);
      bfp.addUInt('default_sample_description_index', 32);
      bfp.addUInt('default_sample_duration', 32);
      bfp.addUInt('default_sample_size', 32);
      parseSampleFlags(bfp.createChildParser('default_sample_flags'));
    } catch (e) {
      console.log(e.message);
      return false;
    }
    return true;
  }

  function parseTkhd(version, flags, bfp) {
    var varSize = (version == 1) ? 64 : 32;
    try {
      bfp.addField('creation_time', varSize);
      bfp.addField('modificaton_time', varSize);
      bfp.addUInt('track_ID', 32);
      bfp.skip(32); // reserved = 0
      bfp.addUInt('duration', varSize);
      bfp.skip(32, 2); // int(32)[2] reserved = 0
      bfp.addUInt('layer', 16);
      bfp.addUInt('alternate_group', 16);
      bfp.addField('volume', 16);
      bfp.skip(16); // reserved = 0
      bfp.addField('matrix', 32, 9);
      bfp.addUInt('width', 32);
      bfp.addUInt('height', 32);
    } catch (e) {
      console.log(e.message);
      return false;
    }
    return true;
  }

  function parseMdhd(version, flags, bfp) {
    var varSize = (version == 1) ? 64 : 32;
    try {
      bfp.addField('creation_time', varSize);
      bfp.addField('modificaton_time', varSize);
      bfp.addUInt('timescale', 32);
      bfp.addUInt('duration', varSize);
      bfp.skip(1);
      bfp.addField('language', 5,3);
      bfp.addField('pre_defined', 16)
    } catch (e) {
      console.log(e.message);
      return false;
    }
    return true;
  }

  function parseTfhd(version, flags, bfp) {
    try {
      bfp.addUInt('track_ID', 32);
      if (flags['base-data-offset']) {
        bfp.addUInt('base_data_offset', 64);
      }

      if (flags['sample-description-index-present']) {
        bfp.addUInt('sample_description_index', 32);
      }

      if (flags['default-sample-duration-present']) {
        bfp.addUInt('default_sample_duration', 32);
      }

      if (flags['default-sample-size-present']) {
        bfp.addUInt('default_sample_size', 32);
      }

      if (flags['default-sample-flags-present']) {
        bfp.addUInt('default_sample_flags', 32);
      }
    } catch (e) {
      console.log(e.message);
      return false;
    }
    return true;
  }

  function parseTrun(version, flags, bfp) {
    try {
      var sample_count = bfp.addUInt('sample_count', 32);
      if (flags['data-offset-present']) {
        bfp.addUInt('data_offset', 32);
      }

      if (flags['first-sample-flags-present']) {
        bfp.addUInt('first_sample_flags', 32);
      }

      for (var i = 0; i < sample_count; ++i) {
        if (flags['sample-duration-present']) {
          bfp.addUInt('sample_duration[' + i + ']', 32);
        }

        if (flags['sample-size-present']) {
          bfp.addUInt('sample_size[' + i + ']', 32);
        }

        if (flags['sample-flags-present']) {
          bfp.addUInt('sample_flags[' + i + ']', 32);
        }

        if (flags['sample-composition-time-offsets-present']) {
          if (version == 0) {
            bfp.addUInt('sample_composition_time_offsets[' + i + ']', 32);
          } else {
            bfp.addInt('sample_composition_time_offsets[' + i + ']', 32);
          }
        }
      }
    } catch (e) {
      console.log(e.message);
      return false;
    }
    return true;
  }

  function ISOClient(url, doneCallback) {
    this.doneCallback_ = doneCallback;
    this.parser_ = new msetools.ISOBMFFParser(this);
    this.file_ = new msetools.RemoteFile(url);
    this.readSize_ = 256 * 1024;
    this.file_.read(this.readSize_, this.onReadDone_.bind(this));
    this.list_stack_ = [];
    this.fieldInfo_ = [];
    this.flag_info_ = {
      'tkhd': [
        ['Track_enabled', 0x1],
        ['Track_in_movie', 0x2],
        ['Track_in_preview', 0x4]
      ],
      'tfhd': [
        ['base-data-offset', 0x1],
        ['sample-description-index-present', 0x2],
        ['default-sample-duration-present', 0x8],
        ['default-sample-size-present', 0x10],
        ['default-sample-flags-present', 0x20],
        ['duration-is-empty', 0x10000],
        ['default-base-is-moof', 0x20000],
      ],
      'trun': [
        ['data-offset-present', 0x1],
        ['first-sample-flags-present', 0x4],
        ['sample-duration-present', 0x100],
        ['sample-size-present', 0x200],
        ['sample-flags-present', 0x400],
        ['sample-composition-time-offsets-present', 0x800]
      ]
    };
    this.box_info_ = {
      'ftyp': bs_parse.bind(this, ftyp),
      'mvhd': bs_parse.bind(this, mvhd),
    };

    this.full_box_info_ = {
      'trex': parseTrex,
      'tkhd': parseTkhd,
      'tfhd': parseTfhd,
      'trun': parseTrun,
      'mdhd': parseMdhd
    };
  };

  ISOClient.prototype.onReadDone_ = function(status, buf) {
    console.log("onReadDone_(" + status + ")");

    if (status == 'eof') {
      //$( "#element_tree ul").accordion();
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

  ISOClient.prototype.onListStart = function(id, elementPosition,
                                             bodyPosition) {
    this.list_stack_.push({ id: id, start: elementPosition,
                            child_info: this.fieldInfo_ });
    this.fieldInfo_ = [];
    return msetools.ParserStatus.OK;
  };


  ISOClient.prototype.onListEnd = function(id, size) {
    var info = this.list_stack_.pop();
    if (info.id != id) {
      console.log("Unexpected list end for id '" + id + "'");
      return false;
    }

    var fieldInfo = new FieldInfo(info.id, info.start, info.start + size);
    for (var i = 0; i < this.fieldInfo_.length; ++i) {
      fieldInfo.addChildFieldInfo(this.fieldInfo_[i]);
    }

    // Restore old fieldInfo_ state.
    this.fieldInfo_ = info.child_info;
    this.fieldInfo_.push(fieldInfo);
    return true;
  };


  ISOClient.prototype.onBox = function(id, value, elementPosition,
                                       bodyPosition) {
    var info =
      new FieldInfo(id, elementPosition, bodyPosition + value.length);

    var parser = this.box_info_[id];
    if (parser) {
      var bfp = new BoxFieldParser(bodyPosition, value, info);
      if (!parser(bfp)) {
        console.log("Failed to parse '" + id + "'");
        return false;
      }
    }
    this.fieldInfo_.push(info);

    return true;
  };

  ISOClient.prototype.onFullBox = function(id, version, flags, value,
                                           elementPosition, bodyPosition) {
    var info = new FieldInfo(id, elementPosition, bodyPosition + value.length);

    info.addChild('version', bodyPosition - 4, bodyPosition - 3);
    var flagsFieldInfo = new FieldInfo('flags', bodyPosition - 3, bodyPosition);

    var flagMap = {};
    var flag_info = this.flag_info_[id];
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
          flagsFieldInfo.addChild(name, position, position + 1);
          flagMap[name] = 1;
        }
      }
    }
    info.addChildFieldInfo(flagsFieldInfo);

    var parser = this.full_box_info_[id];
    if (parser) {
      var bfp = new BoxFieldParser(bodyPosition, value, info);
      if (!parser(version, flagMap, bfp)) {
        console.log("Failed to parse '" + id + "'");
        return false;
      }
    }

    this.fieldInfo_.push(info);

    return true;
  };
  
  window["ISOClient"] = ISOClient;
})(window);
