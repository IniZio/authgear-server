package authz

// Permission is a Scope of a Resource granted to a user.
type Permission struct {
	// ResourceID holds the Resource URI, not the internal id.
	ResourceID string
	Scope      string
}
