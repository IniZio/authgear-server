package queue

import (
	"github.com/skygeario/skygear-server/pkg/core/async"
)

type MockQueue struct {
	TasksName  []string
	TasksParam []interface{}
}

func NewMockQueue() *MockQueue {
	return &MockQueue{
		TasksName:  []string{},
		TasksParam: []interface{}{},
	}
}

func (m *MockQueue) Enqueue(spec async.TaskSpec) {
	m.TasksName = append(m.TasksName, spec.Name)
	m.TasksParam = append(m.TasksParam, spec.Param)
}
