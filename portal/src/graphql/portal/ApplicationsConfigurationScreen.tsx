import React, { useCallback, useContext, useMemo, useState } from "react";
import {
  ActionButton,
  DetailsList,
  IButtonStyles,
  IColumn,
  ICommandBarItemProps,
  IconButton,
  MessageBar,
  SelectionMode,
  Text,
  VerticalDivider,
} from "@fluentui/react";
import { Context, FormattedMessage } from "@oursky/react-messageformat";
import { useNavigate, useParams } from "react-router-dom";
import produce from "immer";

import ShowError from "../../ShowError";
import ShowLoading from "../../ShowLoading";
import { OAuthClientConfig, PortalAPIAppConfig } from "../../types";
import { clearEmptyObject } from "../../util/misc";
import { useSystemConfig } from "../../context/SystemConfigContext";
import {
  AppConfigFormModel,
  useAppConfigForm,
} from "../../hook/useAppConfigForm";
import { useCopyFeedback } from "../../hook/useCopyFeedback";
import FormContainer from "../../FormContainer";

import styles from "./ApplicationsConfigurationScreen.module.css";
import ScreenContent from "../../ScreenContent";
import ScreenTitle from "../../ScreenTitle";
import WidgetTitle from "../../WidgetTitle";
import Widget from "../../Widget";
import { useAppFeatureConfigQuery } from "./query/appFeatureConfigQuery";

const COPY_ICON_STLYES: IButtonStyles = {
  root: { margin: 4 },
  rootHovered: { backgroundColor: "#d8d6d3" },
  rootPressed: { backgroundColor: "#c2c0be" },
};

interface FormState {
  publicOrigin: string;
  clients: OAuthClientConfig[];
}

function constructFormState(config: PortalAPIAppConfig): FormState {
  return {
    publicOrigin: config.http?.public_origin ?? "",
    clients: config.oauth?.clients ?? [],
  };
}

function constructConfig(
  config: PortalAPIAppConfig,
  _: FormState,
  currentState: FormState
): PortalAPIAppConfig {
  return produce(config, (config) => {
    config.oauth ??= {};
    config.oauth.clients = currentState.clients;
    clearEmptyObject(config);
  });
}

function makeOAuthClientListColumns(
  renderToString: (messageId: string) => string
): IColumn[] {
  return [
    {
      key: "name",
      fieldName: "name",
      name: renderToString("ApplicationsConfigurationScreen.client-list.name"),
      minWidth: 100,
      className: styles.columnHeader,
    },

    {
      key: "clientId",
      fieldName: "clientId",
      name: renderToString(
        "ApplicationsConfigurationScreen.client-list.client-id"
      ),
      minWidth: 250,
      className: styles.columnHeader,
    },
    {
      key: "action",
      name: renderToString("action"),
      className: styles.columnHeader,
      minWidth: 120,
    },
  ];
}

interface OAuthClientIdCellProps {
  clientId: string;
}

const OAuthClientIdCell: React.FC<OAuthClientIdCellProps> =
  function OAuthClientIdCell(props) {
    const { clientId } = props;
    const { copyButtonProps, Feedback } = useCopyFeedback({
      textToCopy: clientId,
    });

    return (
      <>
        <span className={styles.cellContent}>{clientId}</span>
        <IconButton {...copyButtonProps} styles={COPY_ICON_STLYES} />
        <Feedback />
      </>
    );
  };

interface OAuthClientListActionCellProps {
  clientId: string;
  onRemoveClientClick: (clientId: string) => void;
}

const OAuthClientListActionCell: React.FC<OAuthClientListActionCellProps> =
  function OAuthClientListActionCell(props: OAuthClientListActionCellProps) {
    const { clientId, onRemoveClientClick } = props;
    const navigate = useNavigate();
    const { themes } = useSystemConfig();

    const onEditClick = useCallback(() => {
      navigate(`./${clientId}/edit`);
    }, [navigate, clientId]);

    const onRemoveClick = useCallback(() => {
      onRemoveClientClick(clientId);
    }, [clientId, onRemoveClientClick]);

    return (
      <div className={styles.cellContent}>
        <ActionButton
          className={styles.cellAction}
          theme={themes.actionButton}
          onClick={onEditClick}
        >
          <FormattedMessage id="edit" />
        </ActionButton>
        <VerticalDivider className={styles.cellActionDivider} />
        <ActionButton
          className={styles.cellAction}
          theme={themes.actionButton}
          onClick={onRemoveClick}
        >
          <FormattedMessage id="remove" />
        </ActionButton>
      </div>
    );
  };

interface OAuthClientConfigurationContentProps {
  form: AppConfigFormModel<FormState>;
  oauthClientsMaximum: number;
  showNotification: (msg: string) => void;
}

const OAuthClientConfigurationContent: React.FC<OAuthClientConfigurationContentProps> =
  function OAuthClientConfigurationContent(props) {
    const {
      form: { state, setState },
      oauthClientsMaximum,
    } = props;
    const { renderToString } = useContext(Context);

    const oauthClientListColumns = useMemo(() => {
      return makeOAuthClientListColumns(renderToString);
    }, [renderToString]);

    const onRemoveClientClick = useCallback(
      (clientId: string) => {
        setState((state) => ({
          ...state,
          clients: state.clients.filter((c) => c.client_id !== clientId),
        }));
      },
      [setState]
    );

    const onRenderOAuthClientColumns = useCallback(
      (item?: OAuthClientConfig, _index?: number, column?: IColumn) => {
        if (item == null || column == null) {
          return null;
        }
        switch (column.key) {
          case "action":
            return (
              <OAuthClientListActionCell
                clientId={item.client_id}
                onRemoveClientClick={onRemoveClientClick}
              />
            );
          case "name":
            return (
              <span className={styles.cellContent}>{item.name ?? ""}</span>
            );
          case "clientId":
            return <OAuthClientIdCell clientId={item.client_id} />;
          default:
            return null;
        }
      },
      [onRemoveClientClick]
    );

    return (
      <ScreenContent>
        <ScreenTitle className={styles.widget}>
          <FormattedMessage id="ApplicationsConfigurationScreen.title" />
        </ScreenTitle>
        <Widget className={styles.widget}>
          <WidgetTitle>
            <FormattedMessage id="ApplicationsConfigurationScreen.title" />
          </WidgetTitle>
          <Text className={styles.description}>
            <FormattedMessage
              id="ApplicationsConfigurationScreen.client-endpoint.desc"
              values={{
                clientEndpoint: state.publicOrigin,
                dnsUrl: "./../../custom-domains",
              }}
            />
          </Text>
          {oauthClientsMaximum < 99 && (
            <MessageBar>
              <FormattedMessage
                id="FeatureConfig.oauth-clients.maximum"
                values={{
                  planPagePath: "./../../billing",
                  maximum: oauthClientsMaximum,
                }}
              />
            </MessageBar>
          )}
          <DetailsList
            className={styles.clientList}
            columns={oauthClientListColumns}
            items={state.clients}
            selectionMode={SelectionMode.none}
            onRenderItemColumn={onRenderOAuthClientColumns}
          />
        </Widget>
      </ScreenContent>
    );
  };

const ApplicationsConfigurationScreen: React.FC =
  function ApplicationsConfigurationScreen() {
    const { appID } = useParams() as { appID: string };
    const { renderToString } = useContext(Context);
    const navigate = useNavigate();

    const form = useAppConfigForm(appID, constructFormState, constructConfig);
    const featureConfig = useAppFeatureConfigQuery(appID);

    const [messageBar, setMessageBar] = useState<React.ReactNode>(null);
    const showNotification = useCallback((msg: string) => {
      setMessageBar(
        <MessageBar onDismiss={() => setMessageBar(null)}>
          <p>{msg}</p>
        </MessageBar>
      );
    }, []);

    const oauthClientsMaximum = useMemo(() => {
      return featureConfig.effectiveFeatureConfig?.oauth?.client?.maximum ?? 99;
    }, [featureConfig.effectiveFeatureConfig?.oauth?.client?.maximum]);

    const limitReached = useMemo(() => {
      return form.state.clients.length >= oauthClientsMaximum;
    }, [oauthClientsMaximum, form.state.clients.length]);

    const primaryItems: ICommandBarItemProps[] = useMemo(
      () => [
        {
          key: "add",
          text: renderToString(
            "ApplicationsConfigurationScreen.add-client-button"
          ),
          iconProps: { iconName: "CirclePlus" },
          onClick: () => navigate("./add"),
          className: limitReached ? styles.readOnly : undefined,
        },
      ],
      [navigate, renderToString, limitReached]
    );

    if (form.isLoading || featureConfig.loading) {
      return <ShowLoading />;
    }

    if (form.loadError) {
      return <ShowError error={form.loadError} onRetry={form.reload} />;
    }

    if (featureConfig.error) {
      return (
        <ShowError
          error={form.loadError}
          onRetry={() => {
            featureConfig.refetch().finally(() => {});
          }}
        />
      );
    }

    return (
      <FormContainer
        form={form}
        messageBar={messageBar}
        primaryItems={primaryItems}
      >
        <OAuthClientConfigurationContent
          form={form}
          oauthClientsMaximum={oauthClientsMaximum}
          showNotification={showNotification}
        />
      </FormContainer>
    );
  };

export default ApplicationsConfigurationScreen;
