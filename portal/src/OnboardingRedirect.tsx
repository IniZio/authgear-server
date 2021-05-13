import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ShowLoading from "./ShowLoading";
import ShowError from "./ShowError";
import { useAppListQuery } from "./graphql/portal/query/appListQuery";

const OnboardingRedirect: React.FC = function OnboardingRedirect() {
  const { loading, error, apps, refetch } = useAppListQuery();

  const navigate = useNavigate();

  useEffect(() => {
    if (loading) {
      return;
    }
    if (error != null) {
      return;
    }
    // redirect to create apps if user doesn't have any apps
    if (apps && apps.length > 0) {
      navigate("/");
    } else {
      navigate("/projects/create");
    }
  }, [navigate, error, apps, loading]);

  if (loading) {
    return <ShowLoading />;
  }

  if (error != null) {
    return <ShowError error={error} onRetry={refetch} />;
  }

  return null;
};

export default OnboardingRedirect;
