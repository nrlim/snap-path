"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

interface ScalarDocsProps {
  spec: Record<string, unknown>;
}

export function ScalarDocs({ spec }: ScalarDocsProps) {
  return (
    <ApiReferenceReact
      configuration={{
        spec: {
          content: spec,
        },
        theme: "mars",
        showSidebar: true,
        hideModels: false,
        hideDownloadButton: false,
      }}
    />
  );
}
