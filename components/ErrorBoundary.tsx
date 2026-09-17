'use client';

import React, { Component, ReactNode, ErrorInfo } from 'react';
import { sanitizeErrorForEnvironment, type ErrorContext } from '../lib/errors';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId?: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, errorId: string, retry: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo, errorId: string) => void;
  level?: 'page' | 'component' | 'section';
  context?: Partial<ErrorContext>;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private retryTimeoutId: number | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const errorId = crypto.randomUUID();
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorId = this.state.errorId || crypto.randomUUID();

    const context: ErrorContext = {
      ...this.props.context,
      requestId: errorId,
      path:
        typeof window !== 'undefined' ? window.location.pathname : undefined,
    };

    const sanitizedError = sanitizeErrorForEnvironment(error, context);

    this.logClientError(error, errorInfo, errorId, sanitizedError);

    this.setState({
      errorInfo,
      errorId,
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo, errorId);
    }
  }

  private logClientError(
    error: Error,
    errorInfo: ErrorInfo,
    errorId: string,
    sanitizedError: any,
  ) {
    const logData = {
      errorId,
      error: {
        name: error.name,
        message: sanitizedError.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      errorInfo: {
        componentStack:
          process.env.NODE_ENV === 'development'
            ? errorInfo.componentStack
            : undefined,
      },
      context: this.props.context,
      level: this.props.level || 'component',
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };

    if (typeof window !== 'undefined') {
      console.error('React Error Boundary caught an error:', logData);
    }

    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'exception', {
        description: sanitizedError.message,
        fatal: this.props.level === 'page',
      });
    }
  }

  private handleRetry = () => {
    if (this.retryTimeoutId) {
      window.clearTimeout(this.retryTimeoutId);
    }

    this.retryTimeoutId = window.setTimeout(() => {
      this.setState({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        errorId: undefined,
      });
    }, 100);
  };

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      window.clearTimeout(this.retryTimeoutId);
    }
  }

  render() {
    if (this.state.hasError && this.state.error && this.state.errorId) {
      if (this.props.fallback) {
        return this.props.fallback(
          this.state.error,
          this.state.errorId,
          this.handleRetry,
        );
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          errorId={this.state.errorId}
          onRetry={this.handleRetry}
          level={this.props.level}
        />
      );
    }

    return this.props.children;
  }
}

interface DefaultErrorFallbackProps {
  error: Error;
  errorId: string;
  onRetry: () => void;
  level?: 'page' | 'component' | 'section';
}

function DefaultErrorFallback({
  error,
  errorId,
  onRetry,
  level = 'component',
}: DefaultErrorFallbackProps) {
  const isPageLevel = level === 'page';

  return (
    <div
      className={`error-boundary ${isPageLevel ? 'error-boundary--page' : 'error-boundary--component'}`}
    >
      <div className="error-boundary__content">
        <div className="error-boundary__icon">{isPageLevel ? '⚠️' : '⚡'}</div>

        <h2 className="error-boundary__title">
          {isPageLevel ? 'Something went wrong' : 'Component Error'}
        </h2>

        <p className="error-boundary__message">
          {isPageLevel
            ? 'We encountered an unexpected error. Please try refreshing the page.'
            : 'This component encountered an error and has been disabled.'}
        </p>

        {process.env.NODE_ENV === 'development' && (
          <details className="error-boundary__details">
            <summary>Error Details (Development Only)</summary>
            <pre className="error-boundary__error-text">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        <div className="error-boundary__actions">
          <button onClick={onRetry} className="error-boundary__retry-button">
            Try Again
          </button>

          {isPageLevel && (
            <button
              onClick={() => window.location.reload()}
              className="error-boundary__reload-button"
            >
              Reload Page
            </button>
          )}
        </div>

        <p className="error-boundary__error-id">Error ID: {errorId}</p>
      </div>
    </div>
  );
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>,
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}

export function PageErrorBoundary({
  children,
  ...props
}: Omit<ErrorBoundaryProps, 'level'>) {
  return (
    <ErrorBoundary level="page" {...props}>
      {children}
    </ErrorBoundary>
  );
}

export function ComponentErrorBoundary({
  children,
  ...props
}: Omit<ErrorBoundaryProps, 'level'>) {
  return (
    <ErrorBoundary level="component" {...props}>
      {children}
    </ErrorBoundary>
  );
}
