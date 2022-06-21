import React, { useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogFooter,
  IconButton,
  Label,
  PrimaryButton,
  Text,
} from "@fluentui/react";
import { useNavigate, useParams } from "react-router-dom";
import produce, { createDraft } from "immer";
import { FormattedMessage } from "@oursky/react-messageformat";

import ScreenContent from "../../ScreenContent";
import ShowError from "../../ShowError";
import ShowLoading from "../../ShowLoading";
import ModifyOAuthClientForm, {
  getReducedClientConfig,
} from "./ModifyOAuthClientForm";
import NavBreadcrumb, { BreadcrumbItem } from "../../NavBreadcrumb";
import { OAuthClientConfig, PortalAPIAppConfig } from "../../types";
import { clearEmptyObject } from "../../util/misc";
import { genRandomHexadecimalString } from "../../util/random";
import {
  AppConfigFormModel,
  useAppConfigForm,
} from "../../hook/useAppConfigForm";
import { useCopyFeedback } from "../../hook/useCopyFeedback";
import { makeValidationErrorMatchUnknownKindParseRule } from "../../error/parse";
import FormContainer from "../../FormContainer";

import styles from "./CreateOAuthClientScreen.module.scss";
import deepEqual from "deep-equal";

interface FormState {
  clients: OAuthClientConfig[];
  newClient: OAuthClientConfig;
}

const errorRules = [
  makeValidationErrorMatchUnknownKindParseRule(
    "general",
    /^\/oauth\/clients$/,
    "error.client-quota-exceeded",
    {
      to: "../../../billing",
    }
  ),
];

function constructFormState(config: PortalAPIAppConfig): FormState {
  return {
    clients: config.oauth?.clients ?? [],
    newClient: {
      name: undefined,
      client_id: genRandomHexadecimalString(),
      redirect_uris: [],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code", "none"],
      access_token_lifetime_seconds: undefined,
      refresh_token_lifetime_seconds: undefined,
      post_logout_redirect_uris: undefined,
      issue_jwt_access_token: undefined,
    },
  };
}

function constructConfig(
  config: PortalAPIAppConfig,
  initialState: FormState,
  currentState: FormState
): PortalAPIAppConfig {
  return produce(config, (config) => {
    config.oauth ??= {};
    config.oauth.clients = currentState.clients.slice();
    const isDirty = !deepEqual(
      getReducedClientConfig(initialState.newClient),
      getReducedClientConfig(currentState.newClient),
      { strict: true }
    );
    if (isDirty) {
      config.oauth.clients.push(createDraft(currentState.newClient));
    }
    clearEmptyObject(config);
  });
}

interface CreateClientSuccessDialogProps {
  visible: boolean;
  clientId: string;
}

const CreateClientSuccessDialog: React.FC<CreateClientSuccessDialogProps> =
  function CreateClientSuccessDialog(props: CreateClientSuccessDialogProps) {
    const { visible, clientId } = props;
    const navigate = useNavigate();

    const { copyButtonProps, Feedback } = useCopyFeedback({
      textToCopy: clientId,
    });

    const onConfirmCreateClientSuccess = useCallback(() => {
      navigate(`../${encodeURIComponent(clientId)}/edit`);
    }, [navigate, clientId]);

    return (
      <Dialog
        hidden={!visible}
        title={
          <FormattedMessage id="CreateOAuthClientScreen.success-dialog.title" />
        }
      >
        <Label>
          <FormattedMessage id="CreateOAuthClientScreen.success-dialog.client-id-label" />
        </Label>
        <div className={styles.dialogClientId}>
          <Text>{clientId}</Text>
          <IconButton {...copyButtonProps} className={styles.dialogCopyIcon} />
        </div>
        <Feedback />
        <DialogFooter>
          <PrimaryButton onClick={onConfirmCreateClientSuccess}>
            <FormattedMessage id="edit" />
          </PrimaryButton>
        </DialogFooter>
      </Dialog>
    );
  };

interface CreateOAuthClientContentProps {
  form: AppConfigFormModel<FormState>;
}

const CreateOAuthClientContent: React.FC<CreateOAuthClientContentProps> =
  function CreateOAuthClientContent(props) {
    const { state, setState } = props.form;

    const navBreadcrumbItems: BreadcrumbItem[] = useMemo(() => {
      return [
        {
          to: "..",
          label: (
            <FormattedMessage id="ApplicationsConfigurationScreen.title" />
          ),
        },
        {
          to: ".",
          label: <FormattedMessage id="CreateOAuthClientScreen.title" />,
        },
      ];
    }, []);

    const [clientId] = useState(state.newClient.client_id);
    const client =
      state.clients.find((c) => c.client_id === clientId) ?? state.newClient;

    const onClientConfigChange = useCallback(
      (newClient: OAuthClientConfig) => {
        setState((state) => ({ ...state, newClient }));
      },
      [setState]
    );

    const isSuccessDialogVisible = state.clients.some(
      (c) => c.client_id === clientId
    );

    return (
      <ScreenContent>
        <NavBreadcrumb className={styles.widget} items={navBreadcrumbItems} />
        <ModifyOAuthClientForm
          className={styles.widget}
          isCreation={true}
          clientConfig={client}
          onClientConfigChange={onClientConfigChange}
        />
        <CreateClientSuccessDialog
          visible={isSuccessDialogVisible}
          clientId={clientId}
        />
      </ScreenContent>
    );
  };

const CreateOAuthClientScreen: React.FC = function CreateOAuthClientScreen() {
  const { appID } = useParams() as { appID: string };
  const form = useAppConfigForm(appID, constructFormState, constructConfig);

  if (form.isLoading) {
    return <ShowLoading />;
  }

  if (form.loadError) {
    return <ShowError error={form.loadError} onRetry={form.reload} />;
  }

  return (
    <FormContainer form={form} errorRules={errorRules}>
      <CreateOAuthClientContent form={form} />
    </FormContainer>
  );
};

export default CreateOAuthClientScreen;
