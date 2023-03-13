package httputil

import (
	"errors"
	"io/fs"
	"net/http"
	"path"
	"regexp"
	"strings"
)

var hashRegexp = regexp.MustCompile(`^[0-9a-fA-F]{8,}$`)

func IsNameHashed(p string) bool {
	// In general, a name-hashed filename looks like
	// name.hash.ext0[.ext1][.ext2]...
	// where
	//   name is non-empty. That is, it is not a hidden file.
	//   ext0, ext1, ext2 are less than 8 characters
	//   hash is 8 or more hex characters.
	base := path.Base(p)
	parts := strings.Split(base, ".")
	// So len(parts) must be at least 3.
	if len(parts) < 3 {
		return false
	}
	// name must be non-empty.
	if parts[0] == "" {
		return false
	}
	// Start from the end of the slice to find hash
	// i >= 1 because name and hash must present at the same time.
	for i := len(parts) - 1; i >= 1; i-- {
		part := parts[i]
		if hashRegexp.MatchString(part) {
			return true
		}
	}

	return false
}

// FileServer is a specialized version of http.FileServer
// that assumes files rooted at FileSystem are name-hashed.
// cache-control are written specifically for index.html and name-hashed files.
type FileServer struct {
	FileSystem          http.FileSystem
	FallbackToIndexHTML bool
}

func (s *FileServer) writeError(w http.ResponseWriter, err error) {
	// http.Error is NOT used intentionally to avoid returning a text/plain response.
	// The desired response is WITHOUT content-type, and with content-length: 0
	w.Header().Del("Content-Type")
	w.Header().Set("Content-Length", "0")
	if errors.Is(err, fs.ErrNotExist) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if errors.Is(err, fs.ErrPermission) {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	w.WriteHeader(http.StatusInternalServerError)
	return
}

func (s *FileServer) open(name string) (http.File, fs.FileInfo, error) {
	file, err := s.FileSystem.Open(name)
	if err != nil {
		return nil, nil, err
	}
	stat, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, nil, err
	}
	// Unlike http.FileServer, we do not serve directory.
	if stat.IsDir() {
		file.Close()
		return nil, nil, fs.ErrNotExist
	}
	return file, stat, nil
}

func (s *FileServer) serveNameHashed(w http.ResponseWriter, r *http.Request) {
	file, stat, err := s.open(r.URL.Path)
	if err != nil {
		s.writeError(w, err)
		return
	}
	defer file.Close()

	w.Header().Set("Cache-Control", "public, max-age=604800")
	http.ServeContent(w, r, stat.Name(), stat.ModTime(), file)
}

func (s *FileServer) serveOther(w http.ResponseWriter, r *http.Request) {
	indexHTML := "/index.html"

	file, stat, err := s.open(r.URL.Path)
	if s.FallbackToIndexHTML && errors.Is(err, fs.ErrNotExist) {
		r.URL.Path = indexHTML
		file, stat, err = s.open(r.URL.Path)
	}

	if err != nil {
		s.writeError(w, err)
		return
	}
	defer file.Close()

	http.ServeContent(w, r, stat.Name(), stat.ModTime(), file)
}

func (s *FileServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// By default, all response requires validation.
	// So a 404 response also requires validation.
	w.Header().Set("Cache-Control", "no-cache")

	// The treatment of path is different from http.FileServer.
	// We always normalize the path before we pass it to FileSystem.
	r.URL.Path = path.Clean("/" + r.URL.Path)

	// First of all we need to identity whether the path
	// seems like fetching a name-hashed file.
	//
	// If the request fetches a name-hashed file,
	// we return 404 for not found, 200 cache-control: public for found.
	//
	// If the request fetches a non-name-hashed file,
	// we fallback to index.html for not found.
	if IsNameHashed(r.URL.Path) {
		s.serveNameHashed(w, r)
	} else {
		s.serveOther(w, r)
	}
}
