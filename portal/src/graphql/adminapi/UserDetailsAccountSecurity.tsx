import React, { useMemo, useCallback, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import cn from "classnames";
import {
  DefaultButton,
  Dialog,
  DialogFooter,
  Icon,
  List,
  PrimaryButton,
  Text,
} from "@fluentui/react";
import { FormattedMessage, Context } from "@oursky/react-messageformat";

import { useDeleteAuthenticatorMutation } from "./mutations/deleteAuthenticatorMutation";
import { useDeleteIdentityMutation } from "./mutations/deleteIdentityMutation";
import ListCellLayout from "../../ListCellLayout";
import ButtonWithLoading from "../../ButtonWithLoading";
import ErrorDialog from "../../error/ErrorDialog";
import { formatDatetime } from "../../util/formatDatetime";
import {
  Identity,
  Authenticator,
  AuthenticatorType,
  AuthenticatorKind,
  IdentityType,
} from "./globalTypes.generated";

import styles from "./UserDetailsAccountSecurity.module.css";
import { useSystemConfig } from "../../context/SystemConfigContext";

type OOBOTPVerificationMethod = "email" | "phone" | "unknown";

interface UserDetailsAccountSecurityProps {
  identities: Identity[];
  authenticators: Authenticator[];
}

interface PasskeyIdentityData {
  id: string;
  displayName: string;
  addedOn: string;
}

interface PasswordAuthenticatorData {
  id: string;
  kind: AuthenticatorKind;
  lastUpdated: string;
}

interface TOTPAuthenticatorData {
  id: string;
  kind: AuthenticatorKind;
  label: string;
  addedOn: string;
}

interface OOBOTPAuthenticatorData {
  id: string;
  iconName?: string;
  kind: AuthenticatorKind;
  label: string;
  addedOn: string;
  isDefault: boolean;
}

interface PasskeyIdentityCellProps extends PasskeyIdentityData {
  showConfirmationDialog: (options: RemoveConfirmationDialogData) => void;
}

interface PasswordAuthenticatorCellProps extends PasswordAuthenticatorData {
  showConfirmationDialog: (options: RemoveConfirmationDialogData) => void;
}

interface TOTPAuthenticatorCellProps extends TOTPAuthenticatorData {
  showConfirmationDialog: (options: RemoveConfirmationDialogData) => void;
}

interface OOBOTPAuthenticatorCellProps extends OOBOTPAuthenticatorData {
  showConfirmationDialog: (options: RemoveConfirmationDialogData) => void;
}

interface RemoveConfirmationDialogData {
  id: string;
  displayName: string;
  type: "identity" | "authenticator";
}

interface RemoveConfirmationDialogProps
  extends Partial<RemoveConfirmationDialogData> {
  visible: boolean;
  onDismiss: () => void;
  remove?: (id: string) => void;
  loading?: boolean;
}

const LABEL_PLACEHOLDER = "---";

const primaryAuthenticatorTypeLocaleKeyMap: {
  [key in AuthenticatorType]?: string;
} = {
  PASSWORD: "AuthenticatorType.primary.password",
  OOB_OTP_EMAIL: "AuthenticatorType.primary.oob-otp-email",
  OOB_OTP_SMS: "AuthenticatorType.primary.oob-otp-phone",
};

const secondaryAuthenticatorTypeLocaleKeyMap: {
  [key in AuthenticatorType]?: string;
} = {
  PASSWORD: "AuthenticatorType.secondary.password",
  TOTP: "AuthenticatorType.secondary.totp",
  OOB_OTP_EMAIL: "AuthenticatorType.secondary.oob-otp-email",
  OOB_OTP_SMS: "AuthenticatorType.secondary.oob-otp-phone",
};

function getLocaleKeyWithAuthenticatorType(
  type: AuthenticatorType,
  kind: AuthenticatorKind
): string | undefined {
  switch (kind) {
    case "PRIMARY":
      return primaryAuthenticatorTypeLocaleKeyMap[type];
    case "SECONDARY":
      return secondaryAuthenticatorTypeLocaleKeyMap[type];
    default:
      return undefined;
  }
}

function constructPasskeyIdentityData(
  identity: Identity,
  locale: string
): PasskeyIdentityData {
  const addedOn = formatDatetime(locale, identity.createdAt) ?? "";

  return {
    id: identity.id,
    displayName: (identity.claims[
      "https://authgear.com/claims/passkey/display_name"
    ] ?? "") as string,
    addedOn,
  };
}

function constructPasswordAuthenticatorData(
  authenticator: Authenticator,
  locale: string
): PasswordAuthenticatorData {
  const lastUpdated = formatDatetime(locale, authenticator.updatedAt) ?? "";

  return {
    id: authenticator.id,
    kind: authenticator.kind,
    lastUpdated,
  };
}

function getTotpDisplayName(
  totpAuthenticatorClaims: Authenticator["claims"]
): string {
  return (totpAuthenticatorClaims[
    "https://authgear.com/claims/totp/display_name"
  ] ?? LABEL_PLACEHOLDER) as string;
}

function constructTotpAuthenticatorData(
  authenticator: Authenticator,
  locale: string
): TOTPAuthenticatorData {
  const addedOn = formatDatetime(locale, authenticator.createdAt) ?? "";
  const label = getTotpDisplayName(authenticator.claims);

  return {
    id: authenticator.id,
    kind: authenticator.kind,
    addedOn,
    label,
  };
}

function getOobOtpVerificationMethod(
  authenticator: Authenticator
): OOBOTPVerificationMethod {
  switch (authenticator.type) {
    case "OOB_OTP_EMAIL":
      return "email";
    case "OOB_OTP_SMS":
      return "phone";
    default:
      return "unknown";
  }
}

const oobOtpVerificationMethodIconName: Partial<
  Record<OOBOTPVerificationMethod, string>
> = {
  email: "Mail",
  phone: "CellPhone",
};

function getOobOtpAuthenticatorLabel(
  authenticator: Authenticator,
  verificationMethod: OOBOTPVerificationMethod
): string {
  switch (verificationMethod) {
    case "email":
      return (authenticator.claims[
        "https://authgear.com/claims/oob_otp/email"
      ] ?? "") as string;
    case "phone":
      return (authenticator.claims[
        "https://authgear.com/claims/oob_otp/phone"
      ] ?? "") as string;
    default:
      return "";
  }
}

function constructOobOtpAuthenticatorData(
  authenticator: Authenticator,
  locale: string
): OOBOTPAuthenticatorData {
  const addedOn = formatDatetime(locale, authenticator.createdAt) ?? "";
  const verificationMethod = getOobOtpVerificationMethod(authenticator);
  const iconName = oobOtpVerificationMethodIconName[verificationMethod];
  const label = getOobOtpAuthenticatorLabel(authenticator, verificationMethod);

  return {
    id: authenticator.id,
    kind: authenticator.kind,
    isDefault: authenticator.isDefault,
    iconName,
    label,
    addedOn,
  };
}

function constructSecondaryAuthenticatorList(
  authenticators: Authenticator[],
  locale: string
) {
  const passwordAuthenticatorList: PasswordAuthenticatorData[] = [];
  const oobOtpEmailAuthenticatorList: OOBOTPAuthenticatorData[] = [];
  const oobOtpSMSAuthenticatorList: OOBOTPAuthenticatorData[] = [];
  const totpAuthenticatorList: TOTPAuthenticatorData[] = [];

  const filteredAuthenticators = authenticators.filter(
    (a) => a.kind === AuthenticatorKind.Secondary
  );

  for (const authenticator of filteredAuthenticators) {
    switch (authenticator.type) {
      case "PASSWORD":
        passwordAuthenticatorList.push(
          constructPasswordAuthenticatorData(authenticator, locale)
        );
        break;
      case "OOB_OTP_EMAIL":
        oobOtpEmailAuthenticatorList.push(
          constructOobOtpAuthenticatorData(authenticator, locale)
        );
        break;
      case "OOB_OTP_SMS":
        oobOtpSMSAuthenticatorList.push(
          constructOobOtpAuthenticatorData(authenticator, locale)
        );
        break;
      case "TOTP":
        totpAuthenticatorList.push(
          constructTotpAuthenticatorData(authenticator, locale)
        );
        break;
      default:
        break;
    }
  }

  return {
    password: passwordAuthenticatorList,
    oobOtpEmail: oobOtpEmailAuthenticatorList,
    oobOtpSMS: oobOtpSMSAuthenticatorList,
    totp: totpAuthenticatorList,
    hasVisibleList: [
      passwordAuthenticatorList,
      oobOtpEmailAuthenticatorList,
      oobOtpSMSAuthenticatorList,
      totpAuthenticatorList,
    ].some((list) => list.length > 0),
  };
}

function constructPrimaryAuthenticatorLists(
  identities: Identity[],
  authenticators: Authenticator[],
  locale: string
) {
  const passkeyIdentityList: PasskeyIdentityData[] = [];
  const passwordAuthenticatorList: PasswordAuthenticatorData[] = [];
  const oobOtpEmailAuthenticatorList: OOBOTPAuthenticatorData[] = [];
  const oobOtpSMSAuthenticatorList: OOBOTPAuthenticatorData[] = [];

  const filteredAuthenticators = authenticators.filter(
    (a) => a.kind === AuthenticatorKind.Primary
  );

  for (const identity of identities) {
    switch (identity.type) {
      case IdentityType.Passkey:
        passkeyIdentityList.push(
          constructPasskeyIdentityData(identity, locale)
        );
        break;
      default:
        break;
    }
  }

  for (const authenticator of filteredAuthenticators) {
    switch (authenticator.type) {
      case "PASSWORD":
        passwordAuthenticatorList.push(
          constructPasswordAuthenticatorData(authenticator, locale)
        );
        break;
      case "OOB_OTP_EMAIL":
        oobOtpEmailAuthenticatorList.push(
          constructOobOtpAuthenticatorData(authenticator, locale)
        );
        break;
      case "OOB_OTP_SMS":
        oobOtpSMSAuthenticatorList.push(
          constructOobOtpAuthenticatorData(authenticator, locale)
        );
        break;
      case "TOTP":
        break;
      default:
        break;
    }
  }

  return {
    passkey: passkeyIdentityList,
    password: passwordAuthenticatorList,
    oobOtpEmail: oobOtpEmailAuthenticatorList,
    oobOtpSMS: oobOtpSMSAuthenticatorList,
    hasVisibleList: [
      passkeyIdentityList,
      passwordAuthenticatorList,
      oobOtpEmailAuthenticatorList,
      oobOtpSMSAuthenticatorList,
    ].some((list) => list.length > 0),
  };
}

const RemoveConfirmationDialog: React.FC<RemoveConfirmationDialogProps> =
  function RemoveConfirmationDialog(props: RemoveConfirmationDialogProps) {
    const {
      visible,
      remove,
      loading,
      id,
      displayName,
      onDismiss: onDismissProps,
    } = props;

    const { renderToString } = useContext(Context);

    const onConfirmClicked = useCallback(() => {
      remove?.(id!);
    }, [remove, id]);

    const onDismiss = useCallback(() => {
      if (!loading) {
        onDismissProps();
      }
    }, [onDismissProps, loading]);

    const dialogMessage = useMemo(() => {
      return renderToString(
        "UserDetails.account-security.remove-confirm-dialog.message",
        { displayName: displayName ?? "" }
      );
    }, [renderToString, displayName]);

    const removeConfirmDialogContentProps = useMemo(() => {
      return {
        title: (
          <FormattedMessage id="UserDetails.account-security.remove-confirm-dialog.title" />
        ),
        subText: dialogMessage,
      };
    }, [dialogMessage]);

    return (
      <Dialog
        hidden={!visible}
        dialogContentProps={removeConfirmDialogContentProps}
        modalProps={{ isBlocking: loading }}
        onDismiss={onDismiss}
      >
        <DialogFooter>
          <ButtonWithLoading
            onClick={onConfirmClicked}
            labelId="confirm"
            loading={loading ?? false}
            disabled={!visible}
          />
          <DefaultButton
            disabled={(loading ?? false) || !visible}
            onClick={onDismiss}
          >
            <FormattedMessage id="cancel" />
          </DefaultButton>
        </DialogFooter>
      </Dialog>
    );
  };

const PasskeyIdentityCell: React.FC<PasskeyIdentityCellProps> =
  function PasskeyIdentityCell(props: PasskeyIdentityCellProps) {
    const { id, displayName, addedOn, showConfirmationDialog } = props;
    const { themes } = useSystemConfig();
    const onRemoveClicked = useCallback(() => {
      showConfirmationDialog({
        id,
        displayName,
        type: "identity",
      });
    }, [id, displayName, showConfirmationDialog]);
    return (
      <ListCellLayout className={cn(styles.cell, styles.passkeyCell)}>
        <Text className={cn(styles.cellLabel, styles.passkeyCellLabel)}>
          {displayName}
        </Text>
        <Text className={cn(styles.cellDesc, styles.passkeyCellDesc)}>
          <FormattedMessage
            id="UserDetails.account-security.added-on"
            values={{ datetime: addedOn }}
          />
        </Text>
        <DefaultButton
          className={cn(
            styles.button,
            styles.removeButton,
            styles.passkeyCellRemoveButton
          )}
          onClick={onRemoveClicked}
          theme={themes.destructive}
        >
          <FormattedMessage id="remove" />
        </DefaultButton>
      </ListCellLayout>
    );
  };

const PasswordAuthenticatorCell: React.FC<PasswordAuthenticatorCellProps> =
  function PasswordAuthenticatorCell(props: PasswordAuthenticatorCellProps) {
    const { id, kind, lastUpdated, showConfirmationDialog } = props;
    const navigate = useNavigate();
    const { renderToString } = useContext(Context);
    const { themes } = useSystemConfig();

    const labelId = getLocaleKeyWithAuthenticatorType(
      AuthenticatorType.Password,
      kind
    );

    const onResetPasswordClicked = useCallback(() => {
      navigate("./reset-password");
    }, [navigate]);

    const onRemoveClicked = useCallback(() => {
      showConfirmationDialog({
        id,
        displayName: renderToString(labelId!),
        type: "authenticator",
      });
    }, [labelId, id, renderToString, showConfirmationDialog]);

    return (
      <ListCellLayout className={cn(styles.cell, styles.passwordCell)}>
        <Text className={cn(styles.cellLabel, styles.passwordCellLabel)}>
          <FormattedMessage id={labelId!} />
        </Text>
        <Text className={cn(styles.cellDesc, styles.passwordCellDesc)}>
          <FormattedMessage
            id="UserDetails.account-security.last-updated"
            values={{ datetime: lastUpdated }}
          />
        </Text>
        {kind === "PRIMARY" && (
          <PrimaryButton
            className={cn(styles.button, styles.resetPasswordButton)}
            onClick={onResetPasswordClicked}
          >
            <FormattedMessage id="UserDetails.account-security.reset-password" />
          </PrimaryButton>
        )}
        {kind === "SECONDARY" && (
          <DefaultButton
            className={cn(
              styles.button,
              styles.removeButton,
              styles.removePasswordButton
            )}
            onClick={onRemoveClicked}
            theme={themes.destructive}
          >
            <FormattedMessage id="remove" />
          </DefaultButton>
        )}
      </ListCellLayout>
    );
  };

const TOTPAuthenticatorCell: React.FC<TOTPAuthenticatorCellProps> =
  function TOTPAuthenticatorCell(props: TOTPAuthenticatorCellProps) {
    const { id, kind, label, addedOn, showConfirmationDialog } = props;
    const { themes } = useSystemConfig();

    const onRemoveClicked = useCallback(() => {
      showConfirmationDialog({
        id,
        displayName: label,
        type: "authenticator",
      });
    }, [id, label, showConfirmationDialog]);

    return (
      <ListCellLayout className={cn(styles.cell, styles.totpCell)}>
        <Text className={cn(styles.cellLabel, styles.totpCellLabel)}>
          {label}
        </Text>
        <Text className={cn(styles.cellDesc, styles.totpCellDesc)}>
          <FormattedMessage
            id="UserDetails.account-security.added-on"
            values={{ datetime: addedOn }}
          />
        </Text>
        {kind === "SECONDARY" && (
          <DefaultButton
            className={cn(
              styles.button,
              styles.removeButton,
              styles.totpRemoveButton
            )}
            onClick={onRemoveClicked}
            theme={themes.destructive}
          >
            <FormattedMessage id="remove" />
          </DefaultButton>
        )}
      </ListCellLayout>
    );
  };

const OOBOTPAuthenticatorCell: React.FC<OOBOTPAuthenticatorCellProps> =
  function (props: OOBOTPAuthenticatorCellProps) {
    const { id, label, iconName, kind, addedOn, showConfirmationDialog } =
      props;
    const { themes } = useSystemConfig();

    const onRemoveClicked = useCallback(() => {
      showConfirmationDialog({
        id,
        displayName: label,
        type: "authenticator",
      });
    }, [id, label, showConfirmationDialog]);

    return (
      <ListCellLayout className={cn(styles.cell, styles.oobOtpCell)}>
        <Icon className={styles.oobOtpCellIcon} iconName={iconName} />
        <Text className={cn(styles.cellLabel, styles.oobOtpCellLabel)}>
          {label}
        </Text>
        <Text className={cn(styles.cellDesc, styles.oobOtpCellAddedOn)}>
          <FormattedMessage
            id="UserDetails.account-security.added-on"
            values={{ datetime: addedOn }}
          />
        </Text>

        {kind === "SECONDARY" && (
          <DefaultButton
            className={cn(
              styles.button,
              styles.removeButton,
              styles.oobOtpRemoveButton
            )}
            onClick={onRemoveClicked}
            theme={themes.destructive}
          >
            <FormattedMessage id="remove" />
          </DefaultButton>
        )}
      </ListCellLayout>
    );
  };

const UserDetailsAccountSecurity: React.FC<UserDetailsAccountSecurityProps> =
  // eslint-disable-next-line complexity
  function UserDetailsAccountSecurity(props: UserDetailsAccountSecurityProps) {
    const { identities, authenticators } = props;
    const { locale } = useContext(Context);

    const {
      deleteAuthenticator,
      loading: deletingAuthenticator,
      error: deleteAuthenticatorError,
    } = useDeleteAuthenticatorMutation();

    const {
      deleteIdentity,
      loading: deletingIdentity,
      error: deleteIdentityError,
    } = useDeleteIdentityMutation();

    const [isConfirmationDialogVisible, setIsConfirmationDialogVisible] =
      useState(false);
    const [confirmationDialogData, setConfirmationDialogData] =
      useState<RemoveConfirmationDialogData | null>(null);

    const primaryAuthenticatorLists = useMemo(() => {
      return constructPrimaryAuthenticatorLists(
        identities,
        authenticators,
        locale
      );
    }, [locale, identities, authenticators]);

    const secondaryAuthenticatorLists = useMemo(() => {
      return constructSecondaryAuthenticatorList(authenticators, locale);
    }, [locale, authenticators]);

    const showConfirmationDialog = useCallback(
      (options: RemoveConfirmationDialogData) => {
        setConfirmationDialogData(options);
        setIsConfirmationDialogVisible(true);
      },
      []
    );

    const dismissConfirmationDialog = useCallback(() => {
      setIsConfirmationDialogVisible(false);
    }, []);

    const onRenderPasskeyIdentityDetailCell = useCallback(
      (item?: PasskeyIdentityData, _index?: number): React.ReactNode => {
        if (item == null) {
          return null;
        }
        return (
          <PasskeyIdentityCell
            {...item}
            showConfirmationDialog={showConfirmationDialog}
          />
        );
      },
      [showConfirmationDialog]
    );

    const onRenderPasswordAuthenticatorDetailCell = useCallback(
      (item?: PasswordAuthenticatorData, _index?: number): React.ReactNode => {
        if (item == null) {
          return null;
        }
        return (
          <PasswordAuthenticatorCell
            {...item}
            showConfirmationDialog={showConfirmationDialog}
          />
        );
      },
      [showConfirmationDialog]
    );

    const onRenderOobOtpAuthenticatorDetailCell = useCallback(
      (item?: OOBOTPAuthenticatorData, _index?: number): React.ReactNode => {
        if (item == null) {
          return null;
        }
        return (
          <OOBOTPAuthenticatorCell
            {...item}
            showConfirmationDialog={showConfirmationDialog}
          />
        );
      },
      [showConfirmationDialog]
    );

    const onRenderTotpAuthenticatorDetailCell = useCallback(
      (item?: TOTPAuthenticatorData, _index?: number): React.ReactNode => {
        if (item == null) {
          return null;
        }
        return (
          <TOTPAuthenticatorCell
            {...item}
            showConfirmationDialog={showConfirmationDialog}
          />
        );
      },
      [showConfirmationDialog]
    );

    const onConfirmDeleteAuthenticator = useCallback(
      (authenticatorID) => {
        deleteAuthenticator(authenticatorID)
          .catch(() => {})
          .finally(() => {
            dismissConfirmationDialog();
          });
      },
      [deleteAuthenticator, dismissConfirmationDialog]
    );

    const onConfirmDeleteIdentity = useCallback(
      (identityID) => {
        deleteIdentity(identityID)
          .catch(() => {})
          .finally(() => {
            dismissConfirmationDialog();
          });
      },
      [deleteIdentity, dismissConfirmationDialog]
    );

    return (
      <div className={styles.root}>
        <RemoveConfirmationDialog
          visible={isConfirmationDialogVisible}
          id={confirmationDialogData?.id}
          displayName={confirmationDialogData?.displayName}
          remove={
            confirmationDialogData?.type === "authenticator"
              ? onConfirmDeleteAuthenticator
              : confirmationDialogData?.type === "identity"
              ? onConfirmDeleteIdentity
              : undefined
          }
          loading={
            confirmationDialogData?.type === "authenticator"
              ? deletingAuthenticator
              : confirmationDialogData?.type === "identity"
              ? deletingIdentity
              : undefined
          }
          onDismiss={dismissConfirmationDialog}
        />
        <ErrorDialog
          rules={[]}
          error={deleteAuthenticatorError || deleteIdentityError}
          fallbackErrorMessageID="UserDetails.account-security.remove-authenticator.generic-error"
        />
        {primaryAuthenticatorLists.hasVisibleList && (
          <div className={styles.authenticatorContainer}>
            <Text
              as="h2"
              className={cn(styles.header, styles.authenticatorKindHeader)}
            >
              <FormattedMessage id="UserDetails.account-security.primary" />
            </Text>
            {primaryAuthenticatorLists.password.length > 0 && (
              <List
                className={styles.list}
                items={primaryAuthenticatorLists.password}
                onRenderCell={onRenderPasswordAuthenticatorDetailCell}
              />
            )}
            {primaryAuthenticatorLists.passkey.length > 0 && (
              <>
                <Text
                  as="h3"
                  className={cn(styles.header, styles.authenticatorTypeHeader)}
                >
                  <FormattedMessage id="AuthenticatorType.primary.passkey" />
                </Text>
                <List
                  className={styles.list}
                  items={primaryAuthenticatorLists.passkey}
                  onRenderCell={onRenderPasskeyIdentityDetailCell}
                />
              </>
            )}
            {primaryAuthenticatorLists.oobOtpEmail.length > 0 && (
              <>
                <Text
                  as="h3"
                  className={cn(styles.header, styles.authenticatorTypeHeader)}
                >
                  <FormattedMessage id="AuthenticatorType.primary.oob-otp-email" />
                </Text>
                <List
                  className={cn(styles.list, styles.oobOtpList)}
                  items={primaryAuthenticatorLists.oobOtpEmail}
                  onRenderCell={onRenderOobOtpAuthenticatorDetailCell}
                />
              </>
            )}
            {primaryAuthenticatorLists.oobOtpSMS.length > 0 && (
              <>
                <Text
                  as="h3"
                  className={cn(styles.header, styles.authenticatorTypeHeader)}
                >
                  <FormattedMessage id="AuthenticatorType.primary.oob-otp-phone" />
                </Text>
                <List
                  className={cn(styles.list, styles.oobOtpList)}
                  items={primaryAuthenticatorLists.oobOtpSMS}
                  onRenderCell={onRenderOobOtpAuthenticatorDetailCell}
                />
              </>
            )}
          </div>
        )}
        {secondaryAuthenticatorLists.hasVisibleList && (
          <div className={styles.authenticatorContainer}>
            <Text
              as="h2"
              className={cn(styles.header, styles.authenticatorKindHeader)}
            >
              <FormattedMessage id="UserDetails.account-security.secondary" />
            </Text>
            {secondaryAuthenticatorLists.totp.length > 0 && (
              <>
                <Text
                  as="h3"
                  className={cn(styles.header, styles.authenticatorTypeHeader)}
                >
                  <FormattedMessage id="AuthenticatorType.secondary.totp" />
                </Text>
                <List
                  className={cn(styles.list, styles.totpList)}
                  items={secondaryAuthenticatorLists.totp}
                  onRenderCell={onRenderTotpAuthenticatorDetailCell}
                />
              </>
            )}
            {secondaryAuthenticatorLists.oobOtpEmail.length > 0 && (
              <>
                <Text
                  as="h3"
                  className={cn(styles.header, styles.authenticatorTypeHeader)}
                >
                  <FormattedMessage id="AuthenticatorType.secondary.oob-otp-email" />
                </Text>
                <List
                  className={cn(styles.list, styles.oobOtpList)}
                  items={secondaryAuthenticatorLists.oobOtpEmail}
                  onRenderCell={onRenderOobOtpAuthenticatorDetailCell}
                />
              </>
            )}
            {secondaryAuthenticatorLists.oobOtpSMS.length > 0 && (
              <>
                <Text
                  as="h3"
                  className={cn(styles.header, styles.authenticatorTypeHeader)}
                >
                  <FormattedMessage id="AuthenticatorType.secondary.oob-otp-phone" />
                </Text>
                <List
                  className={cn(styles.list, styles.oobOtpList)}
                  items={secondaryAuthenticatorLists.oobOtpSMS}
                  onRenderCell={onRenderOobOtpAuthenticatorDetailCell}
                />
              </>
            )}
            {secondaryAuthenticatorLists.password.length > 0 && (
              <List
                className={cn(styles.list, styles.passwordList)}
                items={secondaryAuthenticatorLists.password}
                onRenderCell={onRenderPasswordAuthenticatorDetailCell}
              />
            )}
          </div>
        )}
      </div>
    );
  };

export default UserDetailsAccountSecurity;
