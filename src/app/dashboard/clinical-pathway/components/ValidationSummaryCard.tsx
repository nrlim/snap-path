"use client";

import React from "react";

export default function ValidationSummaryCard({ 
  title, 
  value, 
  status, 
  icon,
  detail
}: { 
  title: string; 
  value: string; 
  status: "success" | "warning" | "error" | "neutral";
  icon: React.ReactNode;
  detail?: string;
}) {
  const statusConfig = {
    success: {
      bg: "bg-green-50",
      border: "border-green-200",
      text: "text-green-700",
      iconBg: "bg-green-100",
      iconColor: "text-green-600"
    },
    warning: {
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      text: "text-yellow-800",
      iconBg: "bg-yellow-100",
      iconColor: "text-yellow-600"
    },
    error: {
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-700",
      iconBg: "bg-red-100",
      iconColor: "text-red-600"
    },
    neutral: {
      bg: "bg-surface-elevated",
      border: "border-border/60",
      text: "text-text",
      iconBg: "bg-surface",
      iconColor: "text-text-subtle"
    }
  };

  const config = statusConfig[status];

  return (
    <div className={`rounded-2xl border ${config.border} ${config.bg} p-5 flex flex-col justify-between`}>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-semibold text-text/80">{title}</h3>
        <div className={`p-2 rounded-xl ${config.iconBg} ${config.iconColor}`}>
          {icon}
        </div>
      </div>
      <div>
        <p className={`text-2xl font-bold ${config.text} tracking-tight`}>{value}</p>
        {detail && <p className="text-xs text-text-subtle mt-2 font-medium">{detail}</p>}
      </div>
    </div>
  );
}
