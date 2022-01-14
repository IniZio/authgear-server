import { useCallback, useMemo, useState } from "react";
import deepEqual from "deep-equal";
import { useAppAndSecretConfigQuery } from "../graphql/portal/query/appAndSecretConfigQuery";
import { useUpdateAppAndSecretConfigMutation } from "../graphql/portal/mutations/updateAppAndSecretMutation";
import { PortalAPIAppConfig } from "../types";
import { APIError } from "../error/error";

export interface AppConfigFormModel<State> {
  isLoading: boolean;
  isUpdating: boolean;
  isDirty: boolean;
  isSubmitted: boolean;
  canSave?: boolean;
  loadError: unknown;
  updateError: unknown;
  state: State;
  setState: (fn: (state: State) => State) => void;
  reload: () => void;
  reset: () => void;
  save: () => Promise<void>;
  setCanSave: (canSave?: boolean) => void;
  effectiveConfig: PortalAPIAppConfig;
}

export type StateConstructor<State> = (config: PortalAPIAppConfig) => State;
export type ConfigConstructor<State> = (
  config: PortalAPIAppConfig,
  initialState: State,
  currentState: State,
  effectiveConfig: PortalAPIAppConfig
) => PortalAPIAppConfig;

export function useAppConfigForm<State>(
  appID: string,
  constructState: StateConstructor<State>,
  constructConfig: ConfigConstructor<State>,
  validate?: (state: State) => APIError | null,
  initialCanSave?: boolean
): AppConfigFormModel<State> {
  const {
    loading: isLoading,
    error: loadError,
    effectiveAppConfig,
    rawAppConfig: rawConfig,
    secretConfig,
    refetch: reload,
  } = useAppAndSecretConfigQuery(appID);
  const { updateAppAndSecretConfig: updateConfig } =
    useUpdateAppAndSecretConfigMutation(appID);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<unknown>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [canSave, setCanSave] = useState<boolean | undefined>(initialCanSave);

  const effectiveConfig = useMemo(
    () => effectiveAppConfig ?? { id: appID },
    [effectiveAppConfig, appID]
  );

  const initialState = useMemo(
    () => constructState(effectiveConfig),
    [effectiveConfig, constructState]
  );
  const [currentState, setCurrentState] = useState<State | null>(null);

  const isDirty = useMemo(() => {
    if (!rawConfig || !currentState) {
      return false;
    }
    return !deepEqual(
      constructConfig(rawConfig, initialState, initialState, effectiveConfig),
      constructConfig(rawConfig, initialState, currentState, effectiveConfig),
      { strict: true }
    );
  }, [constructConfig, rawConfig, initialState, currentState, effectiveConfig]);

  const reset = useCallback(() => {
    if (isUpdating) {
      return;
    }
    setUpdateError(null);
    setCurrentState(null);
    setIsSubmitted(false);
  }, [isUpdating]);

  // eslint-disable-next-line complexity
  const save = useCallback(async () => {
    const allowSave = canSave !== undefined ? canSave : isDirty;
    if (!rawConfig || !initialState || secretConfig == null) {
      return;
    } else if (!allowSave || isUpdating) {
      return;
    }

    const err = validate?.(currentState ?? initialState);
    if (err) {
      setUpdateError(err);
      return;
    }

    const newConfig = constructConfig(
      rawConfig,
      initialState,
      currentState ?? initialState,
      effectiveConfig
    );

    setIsUpdating(true);
    setUpdateError(null);
    try {
      await updateConfig(newConfig, secretConfig);
      setCurrentState(null);
      setIsSubmitted(true);
    } catch (e: unknown) {
      setUpdateError(e);
    } finally {
      setIsUpdating(false);
    }
  }, [
    isDirty,
    isUpdating,
    constructConfig,
    rawConfig,
    effectiveConfig,
    initialState,
    currentState,
    updateConfig,
    secretConfig,
    validate,
    canSave,
  ]);

  const state = currentState ?? initialState;
  const setState = useCallback(
    (fn: (state: State) => State) => {
      setCurrentState(fn(state));
    },
    [state]
  );

  return {
    isLoading,
    isUpdating,
    isDirty,
    isSubmitted,
    loadError,
    updateError,
    canSave,
    setCanSave,
    state,
    setState,
    reload,
    reset,
    save,
    effectiveConfig,
  };
}
