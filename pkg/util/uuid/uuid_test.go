// Copyright 2015-present Oursky Ltd.
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

package uuid

import (
	"regexp"
	"testing"

	. "github.com/smartystreets/goconvey/convey"
)

func TestNew(t *testing.T) {
	Convey("uuid", t, func() {
		uuid := New()

		Convey("is in format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx", func() {
			const uuid4Pattern = `[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}`
			matched, err := regexp.MatchString(uuid4Pattern, uuid)

			So(err, ShouldBeNil)
			So(matched, ShouldBeTrue)
		})
	})
}
