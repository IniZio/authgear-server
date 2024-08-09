package e2e

import (
	"bytes"
	"fmt"
	"os/exec"
)

func CreatePortalConfigSource(dbURL string, dbSchema string, resourceDir string) error {
	cmd := fmt.Sprintf(
		"../dist/authgear-portal internal configsource create %s --database-url=\"%s\" --database-schema=\"%s\"",
		resourceDir,
		dbURL,
		dbSchema,
	)
	return ExecCmd(cmd)
}

func CreatePortalDefaultDomain(dbURL string, dbSchema string, defaultDomainSuffix string) error {
	cmd := fmt.Sprintf(
		"../dist/authgear-portal internal domain create-default --database-url=\"%s\" --database-schema=\"%s\" --default-domain-suffix=\"%s\"",
		dbURL,
		dbSchema,
		defaultDomainSuffix,
	)
	return ExecCmd(cmd)
}

func ExecCmd(cmd string) error {
	var errb bytes.Buffer
	execCmd := exec.Command("sh", "-c", cmd)
	execCmd.Stderr = &errb
	execCmd.Dir = "."
	output, err := execCmd.Output()
	if err != nil {
		return fmt.Errorf("failed to execute command: %s, %w, output: %s", cmd, err, output)
	}
	return nil
}

// func ExecCmd(cmd string) error {
// 	execCmd := exec.Command("sh", "-c", cmd)
// 	execCmd.Dir = "."
// 	execCmd.Stdout = os.Stdout
// 	return execCmd.Run()
// }
