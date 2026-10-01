import React, { useCallback, useMemo } from "react";
import { Checkbox, Text } from "@radix-ui/themes";
import { useParams } from "react-router-dom";
import { FormattedMessage } from "../../../intl";
import { useFormContainerBaseContext } from "../../../FormContainerBase";
import { SimpleFormModel } from "../../../hook/useSimpleForm";
import { useFormWithExternalInitialState } from "../../../hook/useFormWithExternalInitialState";
import { RoleAndGroupsFormContainer } from "../form/RoleAndGroupsFormContainer";
import { PrimaryButton } from "../../v2/Button/PrimaryButton/PrimaryButton";
import { SecondaryButton } from "../../v2/Button/SecondaryButton/SecondaryButton";
import { Callout } from "../../v2/Callout/Callout";
import Link from "../../../Link";
import styles from "./RoleResourcePermissionsForm.module.css";

export interface RoleResourcePermissionsFormScope {
  scope: string;
  description?: string | null;
}

export interface RoleResourcePermissionsChanges {
  added: string[];
  removed: string[];
}

export interface RoleResourcePermissionsFormProps {
  resourceID: string;
  // Every Scope of the Resource, in display order.
  scopes: RoleResourcePermissionsFormScope[];
  // The Scopes of this Resource the Role currently holds.
  grantedScopes: string[];
  // True when the Resource has more Scopes than were loaded.
  isTruncated?: boolean;
  onSave: (changes: RoleResourcePermissionsChanges) => Promise<void>;
}

interface FormState {
  // Sorted, so that toggling a scope off and on again is not dirty.
  grantedScopes: string[];
}

function toFormState(grantedScopes: string[]): FormState {
  return { grantedScopes: [...grantedScopes].sort() };
}

function RoleResourcePermissionsFormContent({
  resourceID,
  scopes,
  isTruncated,
}: Pick<
  RoleResourcePermissionsFormProps,
  "resourceID" | "scopes" | "isTruncated"
>) {
  const { appID } = useParams() as { appID: string };
  const {
    form: { state, setState },
    canSave,
    canReset,
    isUpdating,
    onReset,
  } = useFormContainerBaseContext<SimpleFormModel<FormState>>();

  const granted = useMemo(
    () => new Set(state.grantedScopes),
    [state.grantedScopes]
  );

  const setScopes = useCallback(
    (targets: string[], isGranted: boolean) => {
      setState((prev) => {
        const next = new Set(prev.grantedScopes);
        for (const scope of targets) {
          if (isGranted) {
            next.add(scope);
          } else {
            next.delete(scope);
          }
        }
        return { grantedScopes: Array.from(next).sort() };
      });
    },
    [setState]
  );

  const onSelectAll = useCallback(() => {
    setScopes(
      scopes.map((s) => s.scope),
      true
    );
  }, [scopes, setScopes]);

  const onSelectNone = useCallback(() => {
    setScopes(
      scopes.map((s) => s.scope),
      false
    );
  }, [scopes, setScopes]);

  const scopesPath = `/project/${appID}/api-resources/${encodeURIComponent(
    resourceID
  )}#scopes`;

  if (scopes.length === 0) {
    return (
      <div className={styles.empty}>
        <Text as="p" size="2" color="gray">
          <FormattedMessage
            id="RoleResourcePermissionsForm.empty"
            values={{
              // eslint-disable-next-line react/no-unstable-nested-components
              scopesLink: (chunks: React.ReactNode) => (
                <Link to={scopesPath}>{chunks}</Link>
              ),
            }}
          />
        </Text>
      </div>
    );
  }

  const grantedCount = scopes.filter((s) => granted.has(s.scope)).length;

  return (
    <div className={styles.root}>
      {isTruncated ? (
        <Callout
          type="warning"
          size="1"
          showCloseButton={false}
          text={
            <FormattedMessage
              id="RoleResourcePermissionsForm.truncated"
              values={{ count: scopes.length }}
            />
          }
        />
      ) : null}
      <div className={styles.toolbar}>
        <Text size="2" color="gray">
          <FormattedMessage
            id="RoleResourcePermissionsForm.summary"
            values={{ granted: grantedCount, total: scopes.length }}
          />
        </Text>
        <div className={styles.selectActions}>
          <button
            type="button"
            className={styles.textAction}
            disabled={isUpdating}
            onClick={onSelectAll}
          >
            <FormattedMessage id="RoleResourcePermissionsForm.select-all" />
          </button>
          <span className={styles.selectDivider} />
          <button
            type="button"
            className={styles.textAction}
            disabled={isUpdating}
            onClick={onSelectNone}
          >
            <FormattedMessage id="RoleResourcePermissionsForm.select-none" />
          </button>
        </div>
      </div>
      <ul className={styles.list}>
        {scopes.map((item) => {
          const isGranted = granted.has(item.scope);
          return (
            <li key={item.scope}>
              <label className={styles.row}>
                <Checkbox
                  className={styles.checkbox}
                  checked={isGranted}
                  disabled={isUpdating}
                  onCheckedChange={(checked) => {
                    if (checked === "indeterminate") {
                      return;
                    }
                    setScopes([item.scope], checked);
                  }}
                />
                <span className={styles.rowText}>
                  <code className={styles.scope}>{item.scope}</code>
                  {item.description ? (
                    <Text size="2" color="gray" className={styles.description}>
                      {item.description}
                    </Text>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className={styles.footer}>
        <PrimaryButton
          size="2"
          type="submit"
          disabled={!canSave}
          loading={isUpdating}
          text={<FormattedMessage id="save" />}
        />
        <SecondaryButton
          size="2"
          type="button"
          disabled={!canReset}
          onClick={onReset}
          text={<FormattedMessage id="RoleResourcePermissionsForm.discard" />}
        />
      </div>
    </div>
  );
}

export const RoleResourcePermissionsForm: React.VFC<RoleResourcePermissionsFormProps> =
  function RoleResourcePermissionsForm({
    resourceID,
    scopes,
    grantedScopes,
    isTruncated,
    onSave,
  }) {
    const defaultState = useMemo(
      () => toFormState(grantedScopes),
      [grantedScopes]
    );

    const submit = useCallback(
      async (state: FormState) => {
        const before = new Set(defaultState.grantedScopes);
        const after = new Set(state.grantedScopes);
        await onSave({
          added: state.grantedScopes.filter((s) => !before.has(s)),
          removed: defaultState.grantedScopes.filter((s) => !after.has(s)),
        });
        return { result: undefined, nextInitialState: state };
      },
      [defaultState, onSave]
    );

    const form = useFormWithExternalInitialState({ defaultState, submit });

    return (
      <RoleAndGroupsFormContainer form={form}>
        <RoleResourcePermissionsFormContent
          resourceID={resourceID}
          scopes={scopes}
          isTruncated={isTruncated}
        />
      </RoleAndGroupsFormContainer>
    );
  };
