# Copyright 2012 Google Inc. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http:#www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

SOURCES=\
	src/mse-decl.js \
	src/msetools.js \
	src/file.js \
	src/element_list_parser.js \
	src/bytestream_validator.js \
	src/webm_validator.js \
	src/isobmff_validator.js \
	src/validator.js \

all: dist/msetools-min.js

clean:
	rm -rf dist

dist:
	mkdir dist

dist/flags.txt: dist $(SOURCES)
	rm -f $@

	$(foreach var,$(SOURCES), echo "--js $(var)" >> $@;)

dist/msetools-min.js: dist/flags.txt
	java -jar $(CLOSURE_COMPILER_JAR) \
	--compilation_level ADVANCED_OPTIMIZATIONS \
	--warning_level=VERBOSE \
	--output_wrapper "(function(window, undefined) {%output%})(window);" \
	--js_output_file $@ \
	--flagfile dist/flags.txt