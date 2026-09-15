import { onDark } from '@/constants/design';
import React, { Component, ReactNode } from 'react';
import ScreenError from '@/components/ScreenError';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The last line: a crash no route boundary caught (`RouteErrorBoundary`) —
 * the providers, the player host, the root stack itself. Fixed dark colours,
 * because the theme may be what failed.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <ScreenError
        error={this.state.error}
        retry={this.retry}
        palette={{
          background: onDark.background,
          text: onDark.text,
          subtext: onDark.subtext,
          surface: onDark.surfaceElevated,
          border: onDark.border,
        }}
      />
    );
  }
}
