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
        content: spec,
        theme: "elysiajs",
        showSidebar: true,
        hideModels: true,
        hideDownloadButton: false,
      }}
    />
  );
}
