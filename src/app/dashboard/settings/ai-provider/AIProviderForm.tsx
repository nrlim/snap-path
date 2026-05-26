"use client";

import React from 'react';
import { updateSystemConfig } from '../actions';
import { useUI } from '@/components/providers/UIProvider';

export default function AIProviderForm({ config }: { config: any }) {
  const { showLoading, hideLoading, showNotification, showConfirm } = useUI();
  
  const getInitialGatewayUrl = () => {
    if (config.aiGatewayUrl) return config.aiGatewayUrl;
    if (config.aiProvider === "sumopod") return "https://ai.sumopod.com/v1";
    if (config.aiProvider === "vercel-ai-gateway" || !config.aiProvider) return "https://ai-gateway.vercel.sh/v1";
    return "";
  };

  const [provider, setProvider] = React.useState(config.aiProvider || "vercel-ai-gateway");
  const [gatewayUrl, setGatewayUrl] = React.useState(getInitialGatewayUrl());

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value;
    setProvider(newProvider);
    if (newProvider === "vercel-ai-gateway") {
      setGatewayUrl("https://ai-gateway.vercel.sh/v1");
    } else if (newProvider === "sumopod") {
      setGatewayUrl("https://ai.sumopod.com/v1");
    } else if (newProvider === "custom" && provider !== "custom") {
      setGatewayUrl(config.aiGatewayUrl || "");
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    showConfirm({
      title: "Save Configuration",
      message: "Are you sure you want to update the AI Provider configuration?",
      confirmText: "Yes, Save",
      cancelText: "Cancel",
      onConfirm: async () => {
        showLoading("Saving configuration...");
        try {
          const res = await updateSystemConfig(formData);
          if (res.success) {
            showNotification({ type: 'success', title: 'Success', message: 'Configuration updated successfully.' });
          } else {
            showNotification({ type: 'error', title: 'Error', message: res.error || 'Failed to update configuration.' });
          }
        } catch (error) {
          showNotification({ type: 'error', title: 'Error', message: 'An unexpected error occurred.' });
        } finally {
          hideLoading();
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">AI Provider Configuration</h1>
          <p className="text-sm text-text-subtle mt-1">
            Configure your AI models, API routing, and generation parameters.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="w-full animate-in fade-in duration-300">
        <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden">
          <div className="px-6 py-6 sm:p-8">
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div>
              <label htmlFor="primaryProvider" className="block text-sm font-medium text-text">Primary Provider</label>
              <div className="mt-2 relative">
                <select
                  id="primaryProvider" name="primaryProvider" 
                  value={provider}
                  onChange={handleProviderChange}
                  className="block w-full appearance-none rounded-md border border-border bg-surface px-3 py-2.5 text-base sm:text-sm text-text transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="vercel-ai-gateway">Vercel AI Gateway</option>
                  <option value="sumopod">SumoPod AI Gateway</option>
                  <option value="custom">Custom Gateway</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-subtle">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="gatewayUrl" className="block text-sm font-medium text-text">Base URL (Gateway URL)</label>
              <div className="mt-2 relative">
                <input 
                  id="gatewayUrl" 
                  name="gatewayUrl" 
                  type="url" 
                  value={gatewayUrl} 
                  onChange={(e) => setGatewayUrl(e.target.value)}
                  readOnly={provider !== "custom"}
                  required 
                  className={`block w-full rounded-md border border-border px-3 py-2.5 text-base sm:text-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${provider !== 'custom' ? 'bg-surface-elevated/50 text-text-subtle cursor-not-allowed' : 'bg-surface text-text'}`}
                />
              </div>
              <p className="mt-2 text-xs text-text-faint">
                {provider === "custom" ? "Enter your custom gateway URL." : "Auto-filled based on selected provider. API key remains in server environment."}
              </p>
            </div>

            <div>
              <label htmlFor="aiModel" className="block text-sm font-medium text-text">AI Model</label>
              <div className="mt-2 relative">
                <input id="aiModel" name="aiModel" type="text" defaultValue={config.aiModel} className="block w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base sm:text-sm text-text transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <p className="mt-2 text-xs leading-5 text-text-faint">E.g., gpt-4o-mini, gpt-4o, claude-3-haiku, kimi-k2.6</p>
            </div>

            <div>
              <label htmlFor="maxTokens" className="block text-sm font-medium text-text">Max Tokens (Budget)</label>
              <div className="mt-2 relative">
                <input id="maxTokens" name="maxTokens" type="number" min="1" defaultValue={config.aiMaxTokens} className="block w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base sm:text-sm text-text transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>

            <div>
              <label htmlFor="temperature" className="block text-sm font-medium text-text">Temperature</label>
              <div className="mt-2 relative">
                <input id="temperature" name="temperature" type="number" min="0" max="2" step="0.1" defaultValue={config.aiTemperature} className="block w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base sm:text-sm text-text transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <p className="mt-2 text-xs leading-5 text-text-faint">Lower for deterministic output.</p>
            </div>
          </div>
        </div>
      </div>
        {/* Hidden inputs to preserve other fields */}
        <input type="hidden" name="thresholdObatPct" value={config.thresholdObatPct || 10} />
        <input type="hidden" name="thresholdTindakanPct" value={config.thresholdTindakanPct || 10} />
        <input type="hidden" name="thresholdLosDays" value={config.thresholdLosDays || 1} />

        <div className="flex items-center justify-end gap-4 pt-6">
          <button type="submit" className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm shadow-primary/30 transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2">
            Save AI Provider
          </button>
        </div>
      </form>
    </div>
  );
}
