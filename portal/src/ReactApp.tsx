import React, { useContext, useEffect, useState } from "react";
import { BrowserRouter, Routes, Navigate } from "react-router-dom";
import {
  LocaleProvider,
  FormattedMessage,
  Context,
} from "@oursky/react-messageformat";
import { ApolloProvider } from "@apollo/client";
import authgear from "@authgear/web";
import { Helmet, HelmetProvider } from "react-helmet-async";
import AppsScreen from "./graphql/portal/AppsScreen";
import CreateProjectScreen from "./graphql/portal/CreateProjectScreen";
import ProjectWizardScreen from "./graphql/portal/ProjectWizardScreen";
import AppRoot from "./AppRoot";
import MESSAGES from "./locale-data/en.json";
import { client } from "./graphql/portal/apollo";
import { registerLocale } from "i18n-iso-countries";
import i18nISOCountriesEnLocale from "i18n-iso-countries/langs/en.json";
import styles from "./ReactApp.module.scss";
import OAuthRedirect from "./OAuthRedirect";
import AcceptAdminInvitationScreen from "./graphql/portal/AcceptAdminInvitationScreen";
import { SystemConfigContext } from "./context/SystemConfigContext";
import {
  SystemConfig,
  PartialSystemConfig,
  defaultSystemConfig,
  instantiateSystemConfig,
  mergeSystemConfig,
} from "./system-config";
import { loadTheme, Link as FluentLink, ILinkProps } from "@fluentui/react";
import OnboardingCompletionScreen from "./graphql/portal/OnboardingCompletionScreen";
import OnboardingRedirect from "./OnboardingRedirect";
import { ReactRouterLink, ReactRouterLinkProps } from "./ReactRouterLink";
import { AppRoute } from "./AppRoute";

async function loadSystemConfig(): Promise<SystemConfig> {
  const resp = await fetch("/api/system-config.json");
  const config = (await resp.json()) as PartialSystemConfig;
  const mergedConfig = mergeSystemConfig(defaultSystemConfig, config);
  return instantiateSystemConfig(mergedConfig);
}

async function initApp(systemConfig: SystemConfig) {
  loadTheme(systemConfig.themes.main);
  await authgear.configure({
    sessionType: "cookie",
    clientID: systemConfig.authgearClientID,
    endpoint: systemConfig.authgearEndpoint,
  });
}

// ReactAppRoutes defines the routes.
const ReactAppRoutes: React.FC = function ReactAppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <AppRoute
          requireAuth={true}
          path="/"
          element={<Navigate to="projects/" replace={true} />}
        />
        <AppRoute
          requireAuth={true}
          path="/projects/"
          element={<AppsScreen />}
        />
        <AppRoute
          requireAuth={true}
          path="/projects/create"
          element={<CreateProjectScreen />}
        />
        <AppRoute
          requireAuth={true}
          path="/project/:appID/*"
          element={<AppRoot />}
        />
        <AppRoute
          requireAuth={true}
          path="/project/:appID/wizard/*"
          element={<ProjectWizardScreen />}
        />
        <AppRoute
          requireAuth={true}
          path="/project/:appID/wizard/done"
          element={<OnboardingCompletionScreen />}
        />
        <AppRoute path="/oauth-redirect" element={<OAuthRedirect />} />
        <AppRoute
          path="/onboarding-redirect"
          element={<OnboardingRedirect />}
        />
        <AppRoute
          requireAuth={true}
          path="/"
          element={<Navigate to="projects/" replace={true} />}
        />
        <AppRoute
          path="/collaborators/invitation"
          element={<AcceptAdminInvitationScreen />}
        />
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

const PortalLink = React.forwardRef<HTMLAnchorElement, ReactRouterLinkProps>(
  function LinkWithRef({ ...rest }, ref) {
    return <ReactRouterLink {...rest} ref={ref} component={FluentLink} />;
  }
);

function ExternalLink(props: ILinkProps) {
  return <FluentLink target="_blank" rel="noreferrer" {...props} />;
}

const defaultComponents = {
  ExternalLink,
  ReactRouterLink: PortalLink,
};

// ReactApp is responsible for fetching runtime config and initialize authgear SDK.
const ReactApp: React.FC = function ReactApp() {
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [error, setError] = useState<null | unknown>(null);

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

  // register locale for country code translation
  registerLocale(i18nISOCountriesEnLocale);

  return (
    <LocaleProvider
      locale="en"
      messageByID={systemConfig.translations.en}
      defaultComponents={defaultComponents}
    >
      <HelmetProvider>
        <ApolloProvider client={client}>
          <SystemConfigContext.Provider value={systemConfig}>
            <PortalRoot />
          </SystemConfigContext.Provider>
        </ApolloProvider>
      </HelmetProvider>
    </LocaleProvider>
  );
};

export default ReactApp;
