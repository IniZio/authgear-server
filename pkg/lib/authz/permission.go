package authz

// Permission is a Scope of a Resource granted to a user.
type Permission struct {
	ResourceID string
	Scope      string
}
