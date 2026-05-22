"use client";

import React from 'react';
import dynamic from 'next/dynamic';
import "swagger-ui-react/swagger-ui.css";

// We dynamically import SwaggerUI to prevent SSR issues since it relies on the window object
const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function ApiDocsPage() {
  return (
    <div className="w-full min-h-screen bg-white m-0 p-0">
      <SwaggerUI url="/swagger.json" />
    </div>
  );
}
