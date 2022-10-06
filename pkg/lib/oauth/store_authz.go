package oauth

type AuthorizationStore interface {
	Get(userID, clientID string) (*Authorization, error)
	GetByID(id string) (*Authorization, error)
	ListByUserID(userID string) ([]*Authorization, error)
	Create(*Authorization) error
	Delete(*Authorization) error
	ResetAll(userID string) error
	UpdateScopes(*Authorization) error
}
