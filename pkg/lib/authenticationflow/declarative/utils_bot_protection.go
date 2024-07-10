package declarative

import (
	"context"
	"errors"

	"github.com/iawaknahc/jsonschema/pkg/jsonpointer"

	authflow "github.com/authgear/authgear-server/pkg/lib/authenticationflow"
	"github.com/authgear/authgear-server/pkg/lib/botprotection"
	"github.com/authgear/authgear-server/pkg/lib/config"
)

func isConfigBotProtectionRequired(authflowCfg *config.AuthenticationFlowBotProtection, appCfg *config.BotProtectionConfig) bool {
	data := GetBotProtectionData(authflowCfg, appCfg)
	return data != nil
}

func IsNodeBotProtectionRequired(ctx context.Context, deps *authflow.Dependencies, flows authflow.Flows, oneOfJSONPointer jsonpointer.T) (bool, error) {
	flowRootObject, err := findFlowRootObjectInFlow(deps, flows)
	if err != nil {
		return false, err
	}
	current, err := authflow.FlowObject(flowRootObject, oneOfJSONPointer)
	if err != nil {
		return false, err
	}

	currentBranch, ok := current.(config.AuthenticationFlowObjectBotProtectionConfigProvider)
	if !ok {
		return false, authflow.ErrInvalidJSONPointer
	}

	return isConfigBotProtectionRequired(currentBranch.GetBotProtectionConfig(), deps.Config.BotProtection), nil
}

func IsBotProtectionRequired(ctx context.Context, flowRootObject config.AuthenticationFlowObject, oneOfJSONPointer jsonpointer.T) (bool, error) {
	required, err := isInputBotProtectionRequired(flowRootObject, oneOfJSONPointer)
	if err != nil {
		return false, err
	}
	shouldExistingBypassRequired := ShouldExistingResultBypassBotProtectionRequirement(ctx)

	return required && !shouldExistingBypassRequired, nil
}

func isInputBotProtectionRequired(flowRootObject config.AuthenticationFlowObject, oneOfJSONPointer jsonpointer.T) (bool, error) {
	current, err := authflow.FlowObject(flowRootObject, oneOfJSONPointer)
	if err != nil {
		return false, err
	}

	currentBranch, ok := current.(config.AuthenticationFlowObjectBotProtectionConfigProvider)
	if !ok {
		return false, authflow.ErrInvalidJSONPointer
	}

	authflowCfg := currentBranch.GetBotProtectionConfig()

	if authflowCfg == nil {
		return false, nil
	}

	return isConfigBotProtectionRequired(currentBranch.GetBotProtectionConfig(), nil), nil
}

func ShouldExistingResultBypassBotProtectionRequirement(ctx context.Context) bool {
	existingResult := authflow.GetBotProtectionVerificationResult(ctx)
	if existingResult == nil {
		return false
	}
	switch existingResult.Outcome {
	case authflow.BotProtectionVerificationOutcomeVerified:
		return true
	case authflow.BotProtectionVerificationOutcomeServiceUnavailable:
		return false
	case authflow.BotProtectionVerificationOutcomeFailed:
		return false
	default:
		return false
	}
}

func HandleBotProtection(ctx context.Context, deps *authflow.Dependencies, token string) (bpSpecialErr error, err error) {
	existingResult := authflow.GetBotProtectionVerificationResult(ctx)
	if existingResult != nil {
		bpSpecialErr, err = handleExistingBotProtectionVerificationResult(ctx, deps, token, existingResult)
	} else {
		bpSpecialErr, err = verifyBotProtection(ctx, deps, token)
	}

	if isBotProtectionSpecialErrorSuccess(bpSpecialErr) {
		return bpSpecialErr, err
	}

	// fail
	return nil, errors.Join(bpSpecialErr, err)
}

func handleExistingBotProtectionVerificationResult(ctx context.Context, deps *authflow.Dependencies, token string, r *authflow.BotProtectionVerificationResult) (bpSpecialErr error, err error) {
	switch r.Outcome {
	case authflow.BotProtectionVerificationOutcomeVerified:
		return authflow.ErrorBotProtectionVerificationSuccess, nil
	case authflow.BotProtectionVerificationOutcomeServiceUnavailable:
		// retry
		return verifyBotProtection(ctx, deps, token)
	case authflow.BotProtectionVerificationOutcomeFailed:
		return authflow.ErrorBotProtectionVerificationFailed, nil
	default:
		panic("unrecognised verification result in context")
	}

}
func verifyBotProtection(ctx context.Context, deps *authflow.Dependencies, token string) (bpSpecialErr error, err error) {
	err = deps.BotProtection.Verify(token)

	switch {
	case errors.Is(err, botprotection.ErrVerificationFailed):
		return authflow.ErrorBotProtectionVerificationFailed, nil
	case errors.Is(err, botprotection.ErrVerificationServiceUnavailable):
		return authflow.ErrorBotProtectionVerificationServiceUnavailable, nil
	case errors.Is(err, nil):
		return authflow.ErrorBotProtectionVerificationSuccess, nil
	default:
		// unexpected error
		return nil, err
	}
}

func isBotProtectionSpecialErrorSuccess(bpSpecialErr error) bool {
	var errBotProtectionVerification *authflow.ErrorBotProtectionVerification
	if errors.As(bpSpecialErr, &errBotProtectionVerification) {
		return errBotProtectionVerification.Status == authflow.ErrorBotProtectionVerificationStatusSuccess
	}
	return false
}
