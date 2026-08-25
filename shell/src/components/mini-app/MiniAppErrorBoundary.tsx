"use client";

import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

export interface MiniAppErrorBoundaryProps {
  miniAppId: string;
  moduleName: string;
  retryAttempts?: number;
  onRetry?: () => void;
  onUnload?: () => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

const MAX_RETRIES = 3;

/**
 * Error Boundary — isolates mini app failures from the Shell.
 * Mini app crashes must NEVER impact the Shell.
 */
export class MiniAppErrorBoundary extends Component<MiniAppErrorBoundaryProps, State> {
  state: State = { hasError: false, error: null, retryCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[MiniAppErrorBoundary] Module ${this.props.miniAppId} crashed:`,
      error.message,
      info.componentStack,
    );
  }

  handleRetry = (): void => {
    if (this.state.retryCount >= (this.props.retryAttempts ?? MAX_RETRIES)) return;
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
    }));
    this.props.onRetry?.();
  };

  handleUnload = (): void => {
    this.props.onUnload?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-slate-50 p-8">
          <div className="text-center max-w-md">
            <span className="text-4xl mb-3 block">🔒</span>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {this.props.moduleName} encountered an error
            </h2>
            <p className="text-sm text-gray-500 mb-1">
              The service has been isolated to protect the portal.
            </p>
            <p className="text-xs text-gray-400 font-mono mb-4">{this.state.error?.message}</p>
            <div className="flex gap-3 justify-center">
              {this.state.retryCount < MAX_RETRIES && (
                <button
                  className="px-4 py-2 text-sm bg-gov-500 text-gov-950 rounded-lg hover:bg-gov-600 transition"
                  onClick={this.handleRetry}
                  type="button"
                >
                  Retry ({MAX_RETRIES - this.state.retryCount} left)
                </button>
              )}
              <button
                className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                onClick={this.handleUnload}
                type="button"
              >
                Return to Portal
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
