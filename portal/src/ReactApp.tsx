import React, {
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  Exception as SentryException,
  ErrorEvent as SentryErrorEvent,
  EventHint,
  init as sentryInit,
} from "@sentry/react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import {
  LocaleProvider,
  FormattedMessage,
  Context,
} from "@oursky/react-messageformat";
import { ApolloProvider } from "@apollo/client";
import authgear from "@authgear/web";
import { Helmet, HelmetProvider } from "react-helmet-async";
import AppRoot from "./AppRoot";
import MESSAGES from "./locale-data/en.json";
import styles from "./ReactApp.module.css";
import { SystemConfigContext } from "./context/SystemConfigContext";
import {
  SystemConfig,
  PartialSystemConfig,
  defaultSystemConfig,
  instantiateSystemConfig,
  mergeSystemConfig,
} from "./system-config";
import { loadTheme, ILinkProps } from "@fluentui/react";
import ExternalLink from "./ExternalLink";
import Link from "./Link";
import Authenticated from "./graphql/portal/Authenticated";
import InternalRedirect from "./InternalRedirect";
import { LoadingContextProvider } from "./hook/loading";
import { ErrorContextProvider } from "./hook/error";
import ShowLoading from "./ShowLoading";
import GTMProvider from "./GTMProvider";
import { useViewerQuery } from "./graphql/portal/query/viewerQuery";
import { extractRawID } from "./util/graphql";
import { useIdentify } from "./gtm_v2";
import AppContextProvider from "./AppContextProvider";
import FlavoredErrorBoundSuspense from "./FlavoredErrorBoundSuspense";
import {
  PortalClientProvider,
  createCache,
  createClient,
} from "./graphql/portal/apollo";
import { ViewerQueryDocument } from "./graphql/portal/query/viewerQuery.generated";
import { UnauthenticatedDialog } from "./components/auth/UnauthenticatedDialog";
import {
  UnauthenticatedDialogContext,
  UnauthenticatedDialogContextValue,
} from "./components/auth/UnauthenticatedDialogContext";
import { isNetworkError } from "./util/error";

async function loadSystemConfig(): Promise<SystemConfig> {
  const resp = await fetch("/api/system-config.json");
  const config = (await resp.json()) as PartialSystemConfig;
  const mergedConfig = mergeSystemConfig(defaultSystemConfig, config);
  return instantiateSystemConfig(mergedConfig);
}

function isPosthogResetGroupsException(ex: SentryException) {
  return ex.type === "TypeError" && ex.value?.includes("posthog.resetGroups");
}
function isPosthogResetGroupsEvent(event: SentryErrorEvent) {
  return event.exception?.values?.some(isPosthogResetGroupsException) ?? false;
}

// DEV-1767: Unknown cause on posthog error, silence for now
function sentryBeforeSend(event: SentryErrorEvent, hint: EventHint) {
  if (isPosthogResetGroupsEvent(event)) {
    return null;
  }
  if (isNetworkError(hint.originalException)) {
    return null;
  }
  return event;
}

async function initApp(systemConfig: SystemConfig) {
  if (systemConfig.sentryDSN !== "") {
    sentryInit({
      dsn: systemConfig.sentryDSN,
      tracesSampleRate: 0.0,
      beforeSend: sentryBeforeSend,
    });
  }

  loadTheme(systemConfig.themes.main);
  await authgear.configure({
    sessionType: "cookie",
    clientID: systemConfig.authgearClientID,
    endpoint: systemConfig.authgearEndpoint,
  });
}

// ReactAppRoutes defines the routes.
const ReactAppRoutes: React.VFC = function ReactAppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          index={true}
          element={
            <Authenticated>
              <Navigate to="/projects" replace={true} />
            </Authenticated>
          }
        />
        <Route path="/projects">
          <Route
            index={true}
            element={
              <Authenticated>
                <FlavoredErrorBoundSuspense
                  factory={async () => import("./graphql/portal/AppsScreen")}
                >
                  {(AppsScreen) => <AppsScreen />}
                </FlavoredErrorBoundSuspense>
              </Authenticated>
            }
          />
          <Route
            path="create"
            element={
              <Authenticated>
                <FlavoredErrorBoundSuspense
                  factory={async () =>
                    import("./graphql/portal/CreateProjectScreen")
                  }
                >
                  {(CreateProjectScreen) => <CreateProjectScreen />}
                </FlavoredErrorBoundSuspense>
              </Authenticated>
            }
          />
        </Route>
        <Route path="onboarding-survey">
          <Route
            index={true}
            // @ts-expect-error
            path="*"
            element={
              <Authenticated>
                <FlavoredErrorBoundSuspense
                  factory={async () => import("./OnboardingSurveyScreen")}
                >
                  {(OnboardingSurveyScreen) => <OnboardingSurveyScreen />}
                </FlavoredErrorBoundSuspense>
              </Authenticated>
            }
          />
        </Route>
        <Route path="/project">
          <Route path=":appID">
            <Route
              index={true}
              // @ts-expect-error
              path="*"
              element={
                <Authenticated>
                  <AppContextProvider>
                    <AppRoot />
                  </AppContextProvider>
                </Authenticated>
              }
            />
            <Route path="wizard">
              <Route
                index={true}
                // @ts-expect-error
                path="*"
                element={
                  <Authenticated>
                    <AppContextProvider>
                      <FlavoredErrorBoundSuspense
                        factory={async () =>
                          import("./graphql/portal/ProjectWizardScreen")
                        }
                      >
                        {(ProjectWizardScreen) => <ProjectWizardScreen />}
                      </FlavoredErrorBoundSuspense>
                    </AppContextProvider>
                  </Authenticated>
                }
              />
            </Route>
          </Route>
        </Route>

        <Route
          path="/oauth-redirect"
          element={
            <FlavoredErrorBoundSuspense
              factory={async () => import("./OAuthRedirect")}
            >
              {(OAuthRedirect) => <OAuthRedirect />}
            </FlavoredErrorBoundSuspense>
          }
        />

        <Route path="/internal-redirect" element={<InternalRedirect />} />

        <Route
          path="/onboarding-redirect"
          element={
            <FlavoredErrorBoundSuspense
              factory={async () => import("./OnboardingRedirect")}
            >
              {(OnboardingRedirect) => <OnboardingRedirect />}
            </FlavoredErrorBoundSuspense>
          }
        />

        <Route
          path="/collaborators/invitation"
          element={
            <FlavoredErrorBoundSuspense
              factory={async () =>
                import("./graphql/portal/AcceptAdminInvitationScreen")
              }
            >
              {(AcceptAdminInvitationScreen) => <AcceptAdminInvitationScreen />}
            </FlavoredErrorBoundSuspense>
          }
        />

        <Route
          path="/storybook"
          element={
            <FlavoredErrorBoundSuspense
              factory={async () => import("./StoryBookScreen")}
            >
              {(StoryBookScreen) => <StoryBookScreen />}
            </FlavoredErrorBoundSuspense>
          }
        ></Route>
      </Routes>
    </BrowserRouter>
  );
};

const PortalRoot = function PortalRoot() {
  const { renderToString } = useContext(Context);
  return (
    <>
      <Helmet>
        <title>{renderToString("system.title")} </title>
      </Helmet>
      <div className={styles.root}>
        <ReactAppRoutes />
      </div>
    </>
  );
};

const DocLink: React.VFC<ILinkProps> = (props: ILinkProps) => {
  return <ExternalLink {...props} />;
};

const defaultComponents = {
  ExternalLink,
  ReactRouterLink: Link,
  DocLink,
};

export interface LoadCurrentUserProps {
  children?: React.ReactNode;
}

const LoadCurrentUser: React.VFC<LoadCurrentUserProps> =
  function LoadCurrentUser({ children }: LoadCurrentUserProps) {
    const { loading, viewer } = useViewerQuery();

    const identify = useIdentify();
    useEffect(() => {
      if (viewer) {
        const userID = extractRawID(viewer.id);
        const email = viewer.email ?? undefined;

        identify(userID, email);
      }
    }, [viewer, identify]);

    if (loading) {
      return (
        <div className={styles.root}>
          <ShowLoading />
        </div>
      );
    }

    return <>{children}</>;
  };

// ReactApp is responsible for fetching runtime config and initialize authgear SDK.
const ReactApp: React.VFC = function ReactApp() {
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [displayUnauthenticatedDialog, setDisplayUnauthenticatedDialog] =
    useState(false);

  const [apolloClient] = useState(() => {
    const cache = createCache();
    return createClient({
      cache: cache,
      onLogout: () => {
        setDisplayUnauthenticatedDialog(true);
      },
    });
  });

  const onUnauthenticatedDialogConfirm = useCallback(() => {
    apolloClient.cache.writeQuery({
      query: ViewerQueryDocument,
      data: {
        viewer: null,
      },
    });
  }, [apolloClient.cache]);

  const unauthenticatedDialogContextValue =
    useMemo<UnauthenticatedDialogContextValue>(() => {
      return {
        setDisplayUnauthenticatedDialog,
      };
    }, []);

  useEffect(() => {
    if (!systemConfig && error == null) {
      loadSystemConfig()
        .then(async (cfg) => {
          await initApp(cfg);
          setSystemConfig(cfg);
        })
        .catch((err) => {
          setError(err);
        });
    }
  }, [systemConfig, error]);

  if (error != null) {
    return (
      <LocaleProvider
        locale="en"
        messageByID={MESSAGES}
        defaultComponents={defaultComponents}
      >
        <p>
          <FormattedMessage id="error.failed-to-initialize-app" />
        </p>
      </LocaleProvider>
    );
  } else if (!systemConfig) {
    // Avoid rendering components from @fluentui/react, since themes are not loaded yet.
    return null;
  }

  return (
    <GTMProvider containerID={systemConfig.gtmContainerID}>
      <ErrorContextProvider>
        <LoadingContextProvider>
          <LocaleProvider
            locale="en"
            messageByID={systemConfig.translations.en}
            defaultComponents={defaultComponents}
          >
            <HelmetProvider>
              <PortalClientProvider value={apolloClient}>
                <ApolloProvider client={apolloClient}>
                  <SystemConfigContext.Provider value={systemConfig}>
                    <LoadCurrentUser>
                      <UnauthenticatedDialogContext.Provider
                        value={unauthenticatedDialogContextValue}
                      >
                        <PortalRoot />
                      </UnauthenticatedDialogContext.Provider>
                      <UnauthenticatedDialog
                        isHidden={!displayUnauthenticatedDialog}
                        onConfirm={onUnauthenticatedDialogConfirm}
                      />
                    </LoadCurrentUser>
                  </SystemConfigContext.Provider>
                </ApolloProvider>
              </PortalClientProvider>
            </HelmetProvider>
          </LocaleProvider>
        </LoadingContextProvider>
      </ErrorContextProvider>
    </GTMProvider>
  );
};

export default ReactApp;
