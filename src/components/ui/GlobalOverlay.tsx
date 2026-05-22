"use client";

import React from 'react';

interface NotificationState {
  isOpen: boolean;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

interface GlobalOverlayProps {
  isLoading: boolean;
  loadingText: string;
  notification: NotificationState;
  confirm: ConfirmState;
  onConfirmAccept: () => void;
  onConfirmClose: () => void;
}

export function GlobalOverlay({
  isLoading,
  loadingText,
  notification,
  confirm,
  onConfirmAccept,
  onConfirmClose
}: GlobalOverlayProps) {
  
  if (!isLoading && !notification.isOpen && !confirm.isOpen) return null;

  return (
    <>
      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-elevated shadow-lg border border-border">
            <svg className="h-8 w-8 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-text-subtle animate-pulse">{loadingText}</p>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirm.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-surface p-6 shadow-xl border border-border animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-semibold text-text">{confirm.title}</h3>
            <p className="mt-2 text-sm text-text-subtle">{confirm.message}</p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={onConfirmClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-subtle hover:bg-surface-muted hover:text-text transition-colors"
              >
                {confirm.cancelText || 'Cancel'}
              </button>
              <button
                onClick={onConfirmAccept}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-hover transition-colors"
              >
                {confirm.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {notification.isOpen && (
        <div className="fixed top-4 right-4 z-[120] w-full max-w-sm animate-in slide-in-from-top-5 fade-in duration-300">
          <div className={`flex items-start gap-4 rounded-xl border p-4 shadow-lg ${
            notification.type === 'success' ? 'bg-green-50/50 border-green-200 dark:bg-green-950/30 dark:border-green-900/50' :
            notification.type === 'error' ? 'bg-red-50/50 border-red-200 dark:bg-red-950/30 dark:border-red-900/50' :
            'bg-surface-elevated border-border'
          } backdrop-blur-md`}>
            
            {/* Icon */}
            <div className="flex-shrink-0 pt-0.5">
              {notification.type === 'success' && (
                <svg className="h-5 w-5 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {notification.type === 'error' && (
                <svg className="h-5 w-5 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {notification.type === 'info' && (
                <svg className="h-5 w-5 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>

            <div className="flex-1">
              <h3 className={`text-sm font-medium ${
                notification.type === 'success' ? 'text-green-900 dark:text-green-100' :
                notification.type === 'error' ? 'text-red-900 dark:text-red-100' :
                'text-text'
              }`}>{notification.title}</h3>
              <p className={`mt-1 text-sm ${
                notification.type === 'success' ? 'text-green-700 dark:text-green-300' :
                notification.type === 'error' ? 'text-red-700 dark:text-red-300' :
                'text-text-subtle'
              }`}>{notification.message}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
