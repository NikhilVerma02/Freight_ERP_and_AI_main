import React from "react";
import { useAuth } from "../lib/auth";
import { Card, CardBody } from "../components/ui";

export default function NoAccess() {
  const { user } = useAuth();

  return (
    <div className="flex h-full items-center justify-center">
      <Card className="max-w-md">
        <CardBody className="text-center">
          <span className="text-3xl text-accent-400">âŒ¬</span>
          <h1 className="mt-3 text-lg font-semibold text-slate-100">No access for your role</h1>
          <p className="mt-2 text-sm text-slate-400">
            KPI metrics and system logs are restricted to admin staff.{" "}
            {user ? <>Your role is <span className="text-accent-300">{user.role}</span>.</> : null}{" "}
            Claims intake, history, and chat remain available from the sidebar.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

