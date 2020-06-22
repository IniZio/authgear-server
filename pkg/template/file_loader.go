package template

import (
	"io/ioutil"
	"os"
	"unicode/utf8"

	"github.com/skygeario/skygear-server/pkg/core/errors"
)

type FileLoader struct{}

func (l *FileLoader) Load(absolutePath string) (templateContent string, err error) {
	f, err := os.Open(absolutePath)
	if err != nil {
		err = &errNotFound{name: absolutePath}
		return
	}
	defer f.Close()

	content, err := ioutil.ReadAll(f)
	if err != nil {
		err = errors.HandledWithMessage(err, "failed to read template")
		return
	}

	if !utf8.Valid(content) {
		err = errors.New("expected content to be UTF-8 encoded")
		return
	}

	templateContent = string(content)
	return
}
