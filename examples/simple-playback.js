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
(function(window, undefined) {
  var isFirstOpen = true;

  var appendMoreData = null;

  function createAppendFunction(mediaSource, sourceBuffer, file, isPlaying) {
    var readPending = false;

    var readDone = function(status, buf) {
      readPending = false;

      if (mediaSource.readyState == "closed")
        return;

      if (status == 'error') {
        mediaSource.endOfStream('network');
        return;
      } else if (status == 'eof') {
        mediaSource.endOfStream();
        return;
      }

      var appendDone = function() {
        sourceBuffer.removeEventListener("updateend", appendDone);
        if (isPlaying())
          return;

        appendMoreData();
      };
      sourceBuffer.addEventListener("updateend", appendDone);
	try {
      sourceBuffer.appendBuffer(buf);
	} catch(e) {
	    console.log(e);
	}
    };

    return function() {
      if (readPending || mediaSource.readyState == "closed" || sourceBuffer.updating)
        return;

      if (file.isEndOfFile()) {
        if (mediaSource.readyState != 'ended') {
          mediaSource.endOfStream();
        }

        console.log('No more data to append');
        return;
      }

      if (mediaSource.readyState == 'ended') {
        console.log('mediaSource already ended.');
        return;
      }

      readPending = true;
      file.read(1 * 1024 * 1024, readDone);
    }
  }

  function onAppendError(e) {
    console.log("Append error!");
  }

  function onSourceOpen(videoTag, e) {
    var mediaSource = e.target;

    if (!isFirstOpen) {
      appendMoreData();
      return;
    }

    isFirstOpen = false;

    var url = document.getElementById('u').value;
    var codecs = document.getElementById('c').value;

    var type = '';
    if (codecs.indexOf('avc1.') != -1 || codecs.indexOf('mp4a.') != -1) {
      type = 'video/mp4; codecs="' + codecs + '"';
    } else if (codecs.indexOf('vp8') != -1 ||
               codecs.indexOf('vp9') != -1 ||
               codecs.indexOf('vorbis') != -1) {
      type = 'video/webm; codecs="' + codecs + '"';
    }

    if (type.length == 0) {
      console.log('Couldn\'t determine type from codec string "' +
                  codecs + '"');
      return;
    }

    var info = { url: url, type: type};
    var sourceBuffer = mediaSource.addSourceBuffer(info.type);

    sourceBuffer.addEventListener("error", onAppendError);

    var file = new msetools.RemoteFile(info.url);
    var isPlaying = function() {
      return videoTag.readyState > videoTag.HAVE_FUTURE_DATA;
    };
    appendMoreData = createAppendFunction(mediaSource, sourceBuffer, file,
                                          isPlaying);
    videoTag.addEventListener('progress',
                              onProgress.bind(videoTag,mediaSource));

    appendMoreData();
  }

  function onProgress(mediaSource, e) {
    appendMoreData();
  }

  function onPageLoad() {
    document.getElementById('b').addEventListener('click', loadUrl);

    var loadURL = false;

    // Extract the 'url' parameter from the document URL.
    var urlRegex = new RegExp('[\\?&]url=([^&#]*)');
    var codecsRegex = new RegExp('[\\?&]codecs=([^&#]*)');
    var results = urlRegex.exec(window.location.href);
    if (results != null) {
      var url = results[1];

      // Assign to the input field.
      var u = document.getElementById('u');
      u.value = url;
    }

    results = codecsRegex.exec(window.location.href);
    if (results != null) {
      var codecs = results[1];

      // Assign to the input field.
      var c = document.getElementById('c');
      c.value = codecs;
      loadURL = true;
    }

    if (loadURL) {
      loadUrl();
    }
  }

  function loadUrl() {
    var video = document.getElementById('v');
    var mediaSource = new MediaSource();

    mediaSource.addEventListener('sourceopen',
                                 onSourceOpen.bind(this, video));
    video.src = window.URL.createObjectURL(mediaSource);
  }

  window['onPageLoad'] = onPageLoad;
})(window);
