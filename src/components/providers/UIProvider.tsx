"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { GlobalOverlay } from '../ui/GlobalOverlay';

type NotificationType = 'success' | 'error' | 'info';

interface NotificationState {
  isOpen: boolean;
  type: NotificationType;
  title: string;
  message: string;
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
}

interface UIContextType {
  // Loading
  isLoading: boolean;
  loadingText: string;
  showLoading: (text?: string) => void;
  hideLoading: () => void;
  
  // Notification
  showNotification: (params: { type: NotificationType; title: string; message: string }) => void;
  
  // Confirmation
  showConfirm: (params: Omit<ConfirmState, 'isOpen'>) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Loading...");
  
  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });

  const [confirm, setConfirm] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const showLoading = useCallback((text = "Loading...") => {
    setLoadingText(text);
    setIsLoading(true);
  }, []);

  const hideLoading = useCallback(() => {
    setIsLoading(false);
  }, []);

  const showNotification = useCallback((params: { type: NotificationType; title: string; message: string }) => {
    setNotification({
      isOpen: true,
      ...params
    });
    
    // Auto close notification after 3 seconds
    setTimeout(() => {
      setNotification(prev => ({ ...prev, isOpen: false }));
    }, 3000);
  }, []);

  const showConfirm = useCallback((params: Omit<ConfirmState, 'isOpen'>) => {
    setConfirm({
      isOpen: true,
      ...params
    });
  }, []);

  const handleConfirmClose = useCallback(() => {
    setConfirm(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleConfirmAccept = useCallback(() => {
    confirm.onConfirm();
    setConfirm(prev => ({ ...prev, isOpen: false }));
  }, [confirm]);

  return (
    <UIContext.Provider value={{
      isLoading, loadingText, showLoading, hideLoading,
      showNotification, showConfirm
    }}>
      {children}
      
      <GlobalOverlay 
        isLoading={isLoading} 
        loadingText={loadingText}
        
        notification={notification}
        
        confirm={confirm}
        onConfirmAccept={handleConfirmAccept}
        onConfirmClose={handleConfirmClose}
      />
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}
