"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, CheckCircle2, AlertCircle } from "lucide-react";

interface JsonViewerProps {
  data: unknown;
  initiallyExpanded?: boolean;
  fieldMatches?: Record<string, boolean>;
}

export function JsonViewer({ data, initiallyExpanded = true, fieldMatches }: JsonViewerProps) {
  return (
    <div className="font-mono text-[11px] leading-relaxed text-slate-300">
      <JsonNode value={data} initiallyExpanded={initiallyExpanded} fieldMatches={fieldMatches} />
    </div>
  );
}

function JsonNode({ 
  value, 
  initiallyExpanded, 
  nodeKey, 
  isLast = true,
  fieldMatches 
}: { 
  value: unknown; 
  initiallyExpanded: boolean; 
  nodeKey?: string; 
  isLast?: boolean;
  fieldMatches?: Record<string, boolean>;
}) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);

  const getType = (val: unknown) => {
    if (val === null) return "null";
    if (Array.isArray(val)) return "array";
    return typeof val;
  };

  const type = getType(value);

  const renderFlag = () => {
    if (!fieldMatches || nodeKey === undefined) return null;
    const match = fieldMatches[nodeKey];
    if (match === undefined) return null;
    
    if (match) {
      return <CheckCircle2 className="inline-block h-3.5 w-3.5 text-green-500 mr-1.5 align-text-bottom" />;
    } else {
      return <AlertCircle className="inline-block h-3.5 w-3.5 text-amber-500 mr-1.5 align-text-bottom" />;
    }
  };

  const renderKey = () => {
    if (nodeKey === undefined) return null;
    return (
      <span className="text-sky-300 mr-1">
        {renderFlag()}
        "{nodeKey}":
      </span>
    );
  };

  const renderValue = () => {
    if (type === "string") return <span className="text-emerald-400">"{value as string}"</span>;
    if (type === "number") return <span className="text-orange-400">{String(value)}</span>;
    if (type === "boolean") return <span className="text-purple-400">{String(value)}</span>;
    if (type === "null") return <span className="text-slate-500">null</span>;
    return <span>{String(value)}</span>;
  };

  if (type === "object" || type === "array") {
    const isArray = type === "array";
    const openBrace = isArray ? "[" : "{";
    const closeBrace = isArray ? "]" : "}";
    
    // Type assertion to let TypeScript know it's an object or array we can iterate over
    const entries = Object.entries(value as Record<string, unknown>);
    const isEmpty = entries.length === 0;

    if (isEmpty) {
      return (
        <div className="flex">
          {renderKey()}
          <span className="text-slate-400">{openBrace}{closeBrace}{!isLast && ","}</span>
        </div>
      );
    }

    return (
      <div className="relative">
        <div 
          className="flex cursor-pointer select-none items-center hover:bg-slate-800/50 -ml-4 px-4 py-0.5"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className="mr-1 inline-flex h-3 w-3 items-center justify-center text-slate-500">
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
          {renderKey()}
          <span className="text-slate-400">{openBrace}</span>
          {!isExpanded && (
            <span className="ml-1 text-slate-500">
              {isArray ? `... ${entries.length} items ` : "... "}
              {closeBrace}{!isLast && ","}
            </span>
          )}
        </div>
        
        {isExpanded && (
          <div className="pl-4 border-l border-slate-700/50 ml-1.5 my-0.5">
            {entries.map(([k, v], index) => (
              <JsonNode 
                key={k} 
                nodeKey={isArray ? undefined : k} 
                value={v} 
                initiallyExpanded={initiallyExpanded}
                isLast={index === entries.length - 1}
                fieldMatches={fieldMatches}
              />
            ))}
          </div>
        )}
        
        {isExpanded && (
          <div className="ml-1.5">
            <span className="text-slate-400">{closeBrace}{!isLast && ","}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex py-0.5 pl-4 ml-1.5">
      {renderKey()}
      {renderValue()}
      {!isLast && <span className="text-slate-400">,</span>}
    </div>
  );
}
