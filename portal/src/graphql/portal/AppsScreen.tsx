import React, { useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FormattedMessage } from "@oursky/react-messageformat";
import { DefaultEffects, Text } from "@fluentui/react";
import PrimaryButton from "../../PrimaryButton";
import ShowError from "../../ShowError";
import ShowLoading from "../../ShowLoading";
import ScreenHeader from "../../ScreenHeader";
import { App, useAppListQuery } from "./query/appListQuery";
import styles from "./AppsScreen.module.css";

interface AppListProps {
  apps: App[] | null;
}

interface AppCardData {
  appName: string;
  appID: string;
  url: string;
}
const AppCard: React.VFC<AppCardData> = function AppCard(props: AppCardData) {
  const { appName, appID, url } = props;

  return (
    <Link
      to={url}
      style={{ boxShadow: DefaultEffects.elevation4 }}
      className={styles.card}
    >
      <Text className={styles.cardAppID}>{appID}</Text>
      <Text className={styles.cardAppName}>{appName}</Text>
    </Link>
  );
};

const AppList: React.VFC<AppListProps> = function AppList(props: AppListProps) {
  const { apps } = props;
  const navigate = useNavigate();

  const onCreateClick = useCallback(
    (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      navigate("/projects/create");
    },
    [navigate]
  );

  const appCardsData: AppCardData[] = useMemo(() => {
    return (apps ?? []).map((app) => {
      const appID = app.effectiveAppConfig.id;
      const appOrigin = app.effectiveAppConfig.http?.public_origin;
      const relPath = "/project/" + encodeURIComponent(String(app.id));
      return {
        appID,
        appName: appOrigin ?? appID,
        url: relPath,
      };
    });
  }, [apps]);

  return (
    <main className={styles.root}>
      <ScreenHeader showHamburger={false} />
      <section className={styles.body}>
        <Text as="h1" variant="xLarge" block={true}>
          <FormattedMessage id="AppsScreen.title" />
        </Text>
        <section className={styles.cardsContainer}>
          {appCardsData.map((appCardData) => {
            return <AppCard key={appCardData.appID} {...appCardData} />;
          })}
        </section>
        <PrimaryButton
          className={styles.createButton}
          onClick={onCreateClick}
          text={<FormattedMessage id="AppsScreen.create-app" />}
        />
      </section>
    </main>
  );
};

const AppsScreen: React.VFC = function AppsScreen() {
  const { loading, error, apps, refetch } = useAppListQuery();

  if (loading) {
    return <ShowLoading />;
  }

  if (error != null) {
    return <ShowError error={error} onRetry={refetch} />;
  }

  return <AppList apps={apps ?? null} />;
};

export default AppsScreen;
